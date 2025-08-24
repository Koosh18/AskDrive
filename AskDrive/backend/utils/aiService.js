const config = require('../config/config');
const GEMINI_API_KEY = config.gemini.apiKey;
const GEMINI_API_URL = config.gemini.apiUrl;
const { findRelevantChunks } = require('./vectorService');

/**
 * Ask Gemini AI a question about file content using vector search
 */
async function askGemini(question, fileContent) {
  try {
    // If we have similarity data, use it for relevant content extraction
    let prompt = '';
    if (fileContent.chunks && fileContent.tfidfData) {
      const relevantChunks = findRelevantChunks(
        question, 
        fileContent.chunks, 
        fileContent.tfidfData, 
        3
      );
      
      // Use only the most relevant content
      const relevantContent = relevantChunks
        .map(item => item.chunk)
        .join('\n\n');
      
       prompt = createPrompt(question, {
        ...fileContent,
        content: relevantContent,
        relevantChunks: relevantChunks.length
      });
      
      console.log(`Using ${relevantChunks.length} relevant chunks out of ${fileContent.chunkCount} total chunks`);
    } else {
      // Fallback to full content if no similarity data
       prompt = createPrompt(question, fileContent);
    }
    
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!answer) {
      throw new Error('No response from Gemini API');
    }

    return answer;

  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Create a prompt for Gemini AI
 */
function createPrompt(question, fileContent) {
  const { fileName, fileType, content, relevantChunks, keywords } = fileContent;
  
  let prompt = `You are an AI assistant helping users understand documents. Please answer the following question about the document content.

Document Information:
- File Name: ${fileName}
- File Type: ${fileType}`;

  if (relevantChunks) {
    prompt += `\n- Relevant Content Chunks Used: ${relevantChunks}`;
  }
  
  if (keywords && keywords.length > 0) {
    prompt += `\n- Key Topics: ${keywords.join(', ')}`;
  }

  prompt += `\n\nRelevant Document Content:
${content}

User Question: ${question}

Please provide a clear, helpful, and accurate answer based on the relevant document content. If the question cannot be answered from the provided content, please say so. Keep your response concise but informative.`;

  return prompt;
}

module.exports = {
  askGemini
};
