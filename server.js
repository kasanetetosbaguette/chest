const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const express = require("express");
const multer = require("multer");
const nunjucks = require("nunjucks");
const toml = require("toml");

const config = toml.parse(fs.readFileSync("config.toml"));

const app = express();
const database = new DatabaseSync("chest.db");

database.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT,
    original_filename TEXT,
    ip TEXT,
    create_time INTEGER,
    is_public INTEGER
  )
`);

app.use(express.urlencoded({ extended: true }));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "njk");

const env = nunjucks.configure("views", {
  autoescape: true,
  express: app
});

env.addFilter("time_format", function(obj) {
  const formatter = new Intl.DateTimeFormat('en-US', {year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"});
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
  res.render("pages/index");
});

app.get("/rules", (req, res) => {
  res.render("pages/rules");
});

app.get("/faq", (req, res) => {
  res.render("pages/faq");
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


app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
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
  const query = database.prepare("INSERT INTO uploads (filename, original_filename, ip, create_time, is_public) VALUES (?, ?, ?, ?, ?)");
  query.run(req.file.filename, req.file.originalname, ip, secsSinceEpoch, checkPublic ? 1 : 0);

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
    return res.status(413).json({ error: "File exceeds 5 GB limit." });
  }
  next(err);
});

const PORT = process.env.PORT || config.server.port;
app.listen(PORT, () => console.log(`running on http://localhost:${PORT}`));
