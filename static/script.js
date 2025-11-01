const form = document.getElementById("uploadForm");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const result = document.getElementById("result");

["dragenter", "dragover"].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", e => {
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, index);
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

const escapeHTML = unsafe => {
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!fileInput.files.length) return;

  const btn = form.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  if (fileInput.files[0].size >= 5368709120) {
    btn.textContent = "Too big!"; 
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  try {
    const makePublic = document.getElementById('publicChest').checked;
    formData.append('publicChest', makePublic);
    const res = await fetch("/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const copyBtn = document.createElement("button");
    copyBtn.style.width = "200px";
    copyBtn.style.height = "50px";
    copyBtn.className = "serverButton";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy link";

    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(data.url);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Copied to clipboard";
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      } catch (err) {
        copyBtn.textContent = "Failed to copy";
        window.open(data.url);
      }
    });

    result.innerHTML = "";
    result.appendChild(copyBtn);
  } catch (err) {
    result.textContent = "Error: " + err.message;
  }
  finally {
    btn.disabled = false;
    btn.textContent = "Uploaded!";
    fileInput.value = "";
  }
});

function updateDropText(file) {
  const dropText = document.getElementById("dropText");
  const size = formatBytes(file.size);
  dropText.innerHTML = `<strong>${escapeHTML(file.name)}</strong><br>${escapeHTML(size)}`;
}

dropzone.addEventListener("drop", e => {
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    updateDropText(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    updateDropText(fileInput.files[0]);
  }
});