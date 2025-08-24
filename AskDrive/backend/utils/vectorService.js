const natural = require('natural');

/**
 * Split text into chunks for better processing
 */
function chunkText(text, chunkSize = 1000, overlap = 200) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (currentChunk.length + trimmedSentence.length > chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Add overlap from the end of the previous chunk
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 10));
        currentChunk = overlapWords.join(' ') + ' ' + trimmedSentence;
      } else {
        currentChunk = trimmedSentence;
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Extract keywords from text using TF-IDF
 */
function extractKeywords(text, maxKeywords = 10) {
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());
  
  // Remove common stop words and short tokens
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
  
  const filteredTokens = tokens.filter(token => 
    token.length > 2 && !stopWords.has(token) && /^[a-zA-Z]+$/.test(token)
  );

  // Calculate term frequency
  const termFreq = {};
  filteredTokens.forEach(token => {
    termFreq[token] = (termFreq[token] || 0) + 1;
  });

  // Sort by frequency and return top keywords
  const sortedTerms = Object.entries(termFreq)
    .sort(([,a], [,b]) => b - a)
    .slice(0, maxKeywords)
    .map(([term]) => term);

  return sortedTerms;
}

/**
 * Create TF-IDF vectors for text chunks
 */
function createTFIDFVectors(chunks) {
  const tokenizer = new natural.WordTokenizer();
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
  
  // Get all unique terms across all chunks
  const allTerms = new Set();
  const chunkTokens = chunks.map(chunk => {
    const tokens = tokenizer.tokenize(chunk.toLowerCase())
      .filter(token => token.length > 2 && !stopWords.has(token) && /^[a-zA-Z]+$/.test(token));
    tokens.forEach(token => allTerms.add(token));
    return tokens;
  });

  const termArray = Array.from(allTerms);
  const vectors = [];

  // Calculate TF-IDF for each chunk
  for (let i = 0; i < chunks.length; i++) {
    const vector = new Array(termArray.length).fill(0);
    const chunkTokenFreq = {};
    
    // Count term frequency in this chunk
    chunkTokens[i].forEach(token => {
      chunkTokenFreq[token] = (chunkTokenFreq[token] || 0) + 1;
    });

    // Calculate TF-IDF for each term
    termArray.forEach((term, termIndex) => {
      const tf = chunkTokenFreq[term] || 0;
      const docCount = chunkTokens.filter(tokens => tokens.includes(term)).length;
      const idf = Math.log(chunks.length / (docCount + 1));
      vector[termIndex] = tf * idf;
    });

    vectors.push(vector);
  }

  return { vectors, terms: termArray };
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

/**
 * Find most relevant chunks based on query
 */
function findRelevantChunks(query, chunks, tfidfData, topK = 3) {
  const tokenizer = new natural.WordTokenizer();
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
  
  // Tokenize query
  const queryTokens = tokenizer.tokenize(query.toLowerCase())
    .filter(token => token.length > 2 && !stopWords.has(token) && /^[a-zA-Z]+$/.test(token));

  // Create query vector
  const queryVector = new Array(tfidfData.terms.length).fill(0);
  queryTokens.forEach(token => {
    const termIndex = tfidfData.terms.indexOf(token);
    if (termIndex !== -1) {
      queryVector[termIndex] = 1; // Simple binary representation for query
    }
  });

  // Calculate similarities
  const similarities = chunks.map((chunk, index) => ({
    chunk,
    similarity: cosineSimilarity(queryVector, tfidfData.vectors[index]),
    index
  }));

  // Sort by similarity and return top K
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, topK);
}

/**
 * Process document content for similarity search
 */
function processDocumentForSimilaritySearch(content) {
  const chunks = chunkText(content);
  const tfidfData = createTFIDFVectors(chunks);
  const keywords = extractKeywords(content);

  return {
    chunks,
    tfidfData,
    keywords,
    chunkCount: chunks.length
  };
}

module.exports = {
  chunkText,
  extractKeywords,
  createTFIDFVectors,
  cosineSimilarity,
  findRelevantChunks,
  processDocumentForSimilaritySearch
};
