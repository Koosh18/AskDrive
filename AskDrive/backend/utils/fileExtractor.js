const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { processDocumentForSimilaritySearch } = require('./vectorService');

/**
 * Extract text content from Google Drive files
 * Supports Google Docs, Google Sheets, .docx files, and PDFs
 */
async function extractFileContent(fileId, accessToken) {
  try {
    // First, get file metadata to determine type
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!metadataResponse.ok) {
      throw new Error(`Failed to get file metadata: ${metadataResponse.status}`);
    }

    const metadata = await metadataResponse.json();
    const { mimeType, name } = metadata;

    let content = '';

    switch (mimeType) {
      case 'application/vnd.google-apps.document':
        content = await extractGoogleDocContent(fileId, accessToken);
        break;
      
      case 'application/vnd.google-apps.spreadsheet':
        content = await extractGoogleSheetContent(fileId, accessToken);
        break;
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        content = await extractDocxContent(fileId, accessToken);
        break;
      case 'application/pdf':
        content = await extractPdfContent(fileId, accessToken);
        break;
      
      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }

    // Process content for similarity search
    const similarityData = processDocumentForSimilaritySearch(content);

    return {
      fileName: name,
      fileType: mimeType,
      content: content,
      chunks: similarityData.chunks,
      tfidfData: similarityData.tfidfData,
      keywords: similarityData.keywords,
      chunkCount: similarityData.chunkCount
    };

  } catch (error) {
    console.error('File extraction error:', error);
    throw error;
  }
}

/**
 * Extract text from Google Docs
 */
async function extractGoogleDocContent(fileId, accessToken) {
  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${fileId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Google Docs API error: ${response.status}`);
  }

  const doc = await response.json();
  return extractTextFromGoogleDoc(doc);
}

/**
 * Extract text from Google Sheets
 */
async function extractGoogleSheetContent(fileId, accessToken) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${fileId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Google Sheets API error: ${response.status}`);
  }

  const data = await response.json();
  let text = '';

  for (const sheet of data.sheets) {
    const title = sheet.properties.title;
    const rangeResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${encodeURIComponent(title)}?majorDimension=ROWS`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (rangeResponse.ok) {
      const rangeData = await rangeResponse.json();
      const rows = rangeData.values || [];
      text += `Sheet: ${title}\n` + rows.map(row => row.join('\t')).join('\n') + '\n\n';
    }
  }

  return text;
}

/**
 * Extract text from .docx files
 */
async function extractDocxContent(fileId, accessToken) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const result = await mammoth.extractRawText({ buffer });
  
  return result.value;
}

/**
 * Extract text from PDF files
 */
async function extractPdfContent(fileId, accessToken) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  
  try {
    const pdfData = await pdfParse(Buffer.from(buffer));
    return pdfData.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF content');
  }
}

/**
 * Extract text content from Google Doc JSON structure
 */
function extractTextFromGoogleDoc(doc) {
  const paragraphs = doc.body?.content || [];
  return paragraphs.map(para => {
    if (para.paragraph) {
      const elements = para.paragraph.elements || [];
      return elements.map(elem => elem.textRun?.content || '').join('');
    }
    return '';
  }).join('\n');
}


module.exports = {
  extractFileContent
};
