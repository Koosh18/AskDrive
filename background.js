const API_KEY = "AIzaSyCBhnlT1kmCwbo5R37A_Z8hcQI-ufsIpmQ";

// 🧠 Store conversation context in memory
let conversationHistory = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "askGeminiSimple") {
    handleSimplePrompt(message.prompt || "What is AI?", message.silent, sendResponse);
    return true; // keep message channel open
  }
  return false;
});

function handleSimplePrompt(prompt, silent, sendResponse) {
  console.log("📩 Gemini Prompt:", prompt);

  // Add prompt to conversation history (even if silent)
  conversationHistory.push({ role: "user", text: prompt });

  const contents = conversationHistory.map(entry => ({
    role: entry.role,
    parts: [{ text: entry.text }]
  }));

  fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    }
  )
    .then(res => res.json())
    .then(data => {
      console.log(data)
      const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
      if (!silent) {
        conversationHistory.push({ role: "model", text: result });
      }
      sendResponse({ result });
    })
    .catch(err => {
      console.error("❌ Gemini API error:", err);
      sendResponse({ result: "Error calling Gemini API" });
    });
}
