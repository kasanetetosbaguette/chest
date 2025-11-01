const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const express = require("express");
const multer = require("multer");
const nunjucks = require("nunjucks");
const toml = require("toml");
const cookieParser = require("cookie-parser"); // account numbrs are stored in cookies (im a smart web developer)

const config = toml.parse(fs.readFileSync("config.toml"));

const app = express();
const database = new DatabaseSync("chest.db");

database.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    original_filename TEXT,
    ip TEXT,
    account_number TEXT,
    create_time INTEGER,
    is_public INTEGER
  )
`);

try { // db cleanup if sysadmin was being a IDIOT and deleted files manually
  const allUploads = database.prepare("SELECT id, filename FROM uploads").all();
  if (allUploads && allUploads.length) {
    const deleteStmt = database.prepare("DELETE FROM uploads WHERE id = ?");
    allUploads.forEach(u => {
      try {
        if (!fs.existsSync(path.join(__dirname, "uploads", u.filename))) {
          deleteStmt.run(u.id);
          console.log(`Startup cleanup: removed DB entry for missing file ${u.filename} (id=${u.id})`);
        }
      } catch (e) {
        console.error(`Error checking file ${u.filename}:`, e);
      }
    });
  }
} catch (err) {
  console.error("Error during startup cleanup of uploads table:", err);
}

const generateAccountNumber = () => { // yes bro the account number is time based, i stole this idea from mullvad vpn
  let timestamp = Date.now().toString(36);
  timestamp = timestamp.padStart(8, "0").slice(-8);
  let random = Math.random().toString(36).substring(2, 8);
  if (random.length < 6) random = random.padEnd(6, "0");
  return `CHEST-${timestamp}-${random}`.toUpperCase();
};

const ensureAccountNumber = (req, res, next) => {
  if (!req.cookies.accountNumber) {
    const accountNumber = generateAccountNumber();
    res.cookie("accountNumber", accountNumber, { 
      maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years i think
      httpOnly: true
    });
  }
  next();
};


app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(ensureAccountNumber);

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "njk");

const env = nunjucks.configure("views", {
  autoescape: true,
  express: app
});

env.addFilter("time_format", function(obj) {
  const formatter = new Intl.DateTimeFormat("en-US", {year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"});
  return formatter.format(new Date(secondsToMillis(obj)));
});

env.addFilter("formatBytes", function(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, index);
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
});


const uid = () => {
  const hex = Math.floor(new Date() / 1000).toString(16);
  const map = { "0":"A", "1":"B", "2":"C", "3":"D", "4":"E", "5":"F", "6":"G", "7":"H", "8":"I", "9":"J" };
  return [...hex].map(c => map[c] || c).join("");
};

const generateName = (filename) => {
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext);
  return `${basename}_${uid()}${ext}`;
};

const millisToSeconds = ms => Math.floor(ms / 1000); 
const secondsToMillis = secs => Math.floor(secs * 1000); 
const getUnixTime = () => millisToSeconds(new Date().getTime());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, generateName(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }
});

if (!fs.existsSync("uploads/")) {
  fs.mkdirSync("uploads/");
}

app.get("/", (req, res) => {
  const maxBytes = config.configs && config.configs.maxbytes ? config.configs.maxbytes : 1073741824;
  const requireMaster = !!(config.configs && config.configs.masterpass);
  res.render("pages/index", { maxBytes, requireMaster });
});

app.get("/rules", (req, res) => {
  res.render("pages/rules");
});

app.get("/faq", (req, res) => {
  res.render("pages/faq");
});

app.post("/account", (req, res) => {
  const acct = (req.body.accountNumber || "").trim();
  if (!acct) return res.redirect("back");

  // validation schnit
  if (!/^CHEST-[A-Z0-9]{8}-[A-Z0-9]{6}$/.test(acct)) {
    return res.redirect("/");
  }

  res.cookie("accountNumber", acct, {
    maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
    httpOnly: true
  });
  return res.redirect("/");
});

app.get("/config", (req, res) => { // wait i forget why this is exposed now lol but ill keep it i dont wanna break anything
  const maxBytes = config.configs && config.configs.maxbytes ? config.configs.maxbytes : 1073741824;
  res.json({ maxbytes: maxBytes });
});
app.get("/public", (req, res) => {
  const publicUploadsStmt = database.prepare(`
    SELECT *
    FROM uploads
    WHERE is_public == 1
    ORDER BY create_time ${req.query.reverse === "true" ? "" : "DESC"}
  `);
  const publicUploads = publicUploadsStmt.all();
  publicUploads.forEach(upload => {
    try {
      const stats = fs.statSync(path.join(__dirname, "uploads", upload.filename));
      upload.size = stats.size; 
    } catch (err) {
      console.error(`File not found or error reading size for ${upload.filename}:`, err);
      upload.size = 0;
    }
  });
  res.render("pages/public", { publicUploads });
});

app.get("/uploaded", (req, res) => {
  if (!req.cookies.accountNumber) {
    return res.redirect("/");
  }
  
  const uploadsStmt = database.prepare(`
    SELECT *
    FROM uploads
    WHERE account_number = ?
    ORDER BY create_time ${req.query.reverse === "true" ? "ASC" : "DESC"}
  `);
  const uploads = uploadsStmt.all(req.cookies.accountNumber);
  const deleteStmt = database.prepare("DELETE FROM uploads WHERE id = ?"); // LOL THIS ONE LINE TOOK ME FOREVER
  const filteredUploads = uploads.filter(upload => { // just incase sysadmin deletes files manually
    try {
      const stats = fs.statSync(path.join(__dirname, "uploads", upload.filename));
      upload.size = stats.size;
      return true;
    } catch (err) {
      console.log(`Removing ${upload.filename} from database as file no longer exists`);
      deleteStmt.run(upload.id);
      return false;
    }
  });
  res.render("pages/uploaded", { 
    uploads: filteredUploads,
    accountNumber: req.cookies.accountNumber 
  });
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  try {
    const requiresMaster = !!(config.configs.masterpass);
    if (requiresMaster) {
      const required = (config.configs.master_password) || process.env.MASTER_PASSWORD;
      if (!required) {
        try { fs.unlinkSync(path.join(__dirname, "uploads", req.file.filename)); } catch (e) {}
        return res.status(500).json({ error: "Server misconfigured: master password not set." }); // lol dumb sysadmin
      }
      const provided = (req.body.masterpass || req.body.master_password || req.body.password || "").toString();
      if (!provided || provided !== required) {
        try { fs.unlinkSync(path.join(__dirname, "uploads", req.file.filename)); } catch (e) {}
        return res.status(401).json({ error: "Invalid master password." }); // the text looks like fart but idk how to fix it
      }
    }
  } catch (e) {
    console.error("Error checking masterpass:", e); // this would nevre happen... right?
    try { fs.unlinkSync(path.join(__dirname, "uploads", req.file.filename)); } catch (e) {}
    return res.status(500).json({ error: "Server error validating master password." });
  }

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // bans are stored here
  const bans = config.bans || [];
  const ban = bans.find(ban => ip.replace("::ffff:", "") === ban.ip);
  if (ban) {
    return res.status(403).json({ error: "Banned.", reason: ban.reason || "" });
  }

  const timestamp = new Date();
  const secsSinceEpoch = millisToSeconds(timestamp.getTime());

  const logMessage = `[${timestamp.toISOString()}] ${ip} uploaded "${req.file.filename}"\n`;
  console.log(logMessage);
  fs.appendFile("uploads.log", logMessage, err => {
    if (err) console.error("Error writing to log file:", err);
  });

  const checkPublic = !!JSON.parse(req.body.publicChest);
  const query = database.prepare("INSERT INTO uploads (filename, original_filename, ip, account_number, create_time, is_public) VALUES (?, ?, ?, ?, ?, ?)");
  query.run(req.file.filename, req.file.originalname, ip, req.cookies.accountNumber, secsSinceEpoch, checkPublic ? 1 : 0);

  let fileUrl = `${req.protocol}://${req.get("host")}/uploads/${encodeURIComponent(req.file.filename)}`;
  if (path.extname(req.file.filename).toLowerCase() === ".mp4") {
    fileUrl += "?v";
  }
  
  res.json({ url: fileUrl });
});

app.use("/assets", express.static("static"));
app.use("/uploads", express.static("uploads"));

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File exceeds limit." });
  }
  next(err);
});

app.use((req, res) => {
  res.status(404).render("pages/404");
});

const PORT = process.env.PORT || config.server.port;
app.listen(PORT, () => console.log(`running on http://localhost:${PORT}`));
