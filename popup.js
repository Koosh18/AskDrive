document.addEventListener("DOMContentLoaded", init);

async function init() {
  const chatbox = document.getElementById("chatbox");

  // Show "Sending context..." placeholder
  const placeholder = document.createElement("div");
  placeholder.classList.add("message", "bot");
  placeholder.innerHTML = `<div class="bot-text">📤 Sending context to Gemini, please wait...</div>`;
  chatbox.appendChild(placeholder);
  chatbox.scrollTop = chatbox.scrollHeight;

  try {
    const token = await getAuthToken();
    const url = await getActiveTabUrl();
    const currentFolderId = extractFolderIdFromUrl(url);

    if (!currentFolderId) throw new Error("❌ No folder ID found in the active tab's URL.");

    const files = await listDriveFilesInFolder(token, currentFolderId);

    for (const file of files) {
      await sendFileToGeminiForContext(file, token);
    }

    console.log(`✅ Context for ${files.length} files sent to Gemini.`);

    // Replace placeholder with "Ask any question..." after context is ready
    placeholder.innerHTML = `<div class="bot-text">✅ Context ready! You can now ask me anything about this folder.</div>`;
  } catch (error) {
    console.error("❌ Initialization failed:", error);
    placeholder.innerHTML = `<div class="bot-text">⚠ Failed to send context: ${error.message}</div>`;
  }

}

/* ------------------ Drive + Auth Helpers ------------------ */
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) return reject(chrome.runtime.lastError);
      resolve(token);
    });
  });
}

function getActiveTabUrl() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (chrome.runtime.lastError || !tabs.length) return reject(chrome.runtime.lastError);
      resolve(tabs[0].url);
    });
  });
}

function extractFolderIdFromUrl(url) {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function listDriveFilesInFolder(token, folderId) {
  const query = `'${folderId}' in parents and trashed = false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=1000&fields=files(id,name,mimeType)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await response.json();
  return data.files || [];
}

/* ------------------ Sending Context to Gemini ------------------ */
async function sendFileToGeminiForContext(file, token) {
  try {
    const { id, name, mimeType } = file;

    if (mimeType === "application/pdf") {
      const base64 = await fetchPdfBlob(id, token);
      await askGemini(`Context PDF file: ${name}\n(Base64 PDF omitted for brevity)`, true);
    }

    if (mimeType === "application/vnd.google-apps.document") {
      const text = await fetchGoogleDocContent(id, token);
      await askGemini(`Context document: ${name}\n\n${text}`, true);
    }

    if (mimeType === "application/vnd.google-apps.spreadsheet") {
      const text = await fetchAllSheetsContent(id, token);
      await askGemini(`Context spreadsheet: ${name}\n\n${text}`, true);
    }
  } catch (err) {
    console.error(`Error sending ${file.name} to Gemini:`, err);
  }
}

/* ------------------ Chat + Messaging ------------------ */
function askGemini(prompt, silent = false) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { type: "askGeminiSimple", prompt, silent },
      response => resolve(response?.result || "⚠ No response from Gemini")
    );
  });
}

function addMessage(content, sender = "user") {
  const chatbox = document.getElementById("chatbox");
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", sender);
  msgDiv.innerHTML = `<p>${content.replace(/\n/g, "<br>")}</p>`;
    // Beautify & format Gemini's text
    if (sender === "bot") {
        // Convert double newlines to paragraph breaks
        let formattedText = content
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold
            .replace(/\*(.*?)\*/g, "<em>$1</em>") // Italics
            .replace(/- (.*)/g, "• $1") // Bullet points
            .replace(/\n\n/g, "<br><br>") // Paragraphs
            .replace(/\n/g, "<br>"); // Line breaks

        msgDiv.innerHTML = `<div class="bot-text">${formattedText}</div>`;
    } else {
        msgDiv.innerHTML = `<div class="user-text">${content}</div>`;
    }

  chatbox.appendChild(msgDiv);
  chatbox.scrollTop = chatbox.scrollHeight;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input");
  const chatbox = document.getElementById("chatbox");

  input.addEventListener("focus", () => {
    const placeholder = chatbox.querySelector(".placeholder");
    if (placeholder) placeholder.remove();
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    console.log(input)
    const question = input.value.trim();
    if (!question) return;

    addMessage(question, "user");
    input.value = "";

    const typingIndicator = document.createElement("div");
    typingIndicator.classList.add("message", "bot", "typing");
    typingIndicator.innerHTML = `<p>...</p>`;
    chatbox.appendChild(typingIndicator);
    chatbox.scrollTop = chatbox.scrollHeight;

    const answer = await askGemini(question);
    typingIndicator.remove();
    addMessage(answer, "bot");
  });
});

/* ------------------ File Fetch Helpers ------------------ */
async function fetchPdfBlob(fileId, token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const blob = await res.blob();
  return blobToBase64(blob);
}

async function fetchGoogleDocContent(fileId, token) {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${fileId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const doc = await res.json();
  return extractTextFromGoogleDoc(doc);
}

async function fetchAllSheetsContent(fileId, token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${fileId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  let text = "";
  for (const sheet of data.sheets) {
    const title = sheet.properties.title;
    const rangeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${encodeURIComponent(title)}?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const rangeData = await rangeRes.json();
    const rows = rangeData.values || [];
    text += `Sheet: ${title}\n` + rows.map(r => r.join("\t")).join("\n") + "\n\n";
  }
  return text;
}

function extractTextFromGoogleDoc(doc) {
  const paragraphs = doc.body?.content || [];
  return paragraphs.map(para =>
    (para.paragraph?.elements || [])
      .map(elem => elem.textRun?.content || "")
      .join("")
  ).join("\n");
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
