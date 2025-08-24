const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { extractFileContent } = require('../utils/fileExtractor');
const { askGemini } = require('../utils/aiService');

// In-memory cache for processed documents (in production, use Redis)
const documentCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Middleware to verify access token
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No access token provided' });
    }

    const accessToken = authHeader.split(' ')[1];
    
    const user = await pool.query(
      'SELECT id FROM users WHERE access_token = $1',
      [accessToken]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid access token' });
    }

    req.userId = user.rows[0].id;
    req.accessToken = accessToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
}

// POST /query - Handle AI query about a file with vector search
router.post('/', verifyToken, async (req, res) => {
  try {
    const { fileId, question } = req.body;
    const { userId, accessToken } = req;

    if (!fileId || !question) {
      return res.status(400).json({ error: 'Missing fileId or question' });
    }

    // Check cache first
    const cacheKey = `${fileId}_${userId}`;
    let fileContent = documentCache.get(cacheKey);
    
    if (!fileContent || (Date.now() - fileContent.timestamp) > CACHE_TTL) {
      console.log(`Processing file ${fileId} (not in cache or expired)`);
      
      // Extract file content with similarity processing
      fileContent = await extractFileContent(fileId, accessToken);
      
      if (!fileContent) {
        return res.status(400).json({ error: 'Failed to extract file content' });
      }

      // Cache the processed document
      documentCache.set(cacheKey, {
        ...fileContent,
        timestamp: Date.now()
      });
      
      console.log(`Cached document with ${fileContent.chunkCount} chunks`);
    } else {
      console.log(`Using cached document for ${fileId}`);
    }

    // Ask Gemini AI with relevant content
    const answer = await askGemini(question, fileContent);

    if (!answer) {
      return res.status(500).json({ error: 'Failed to get AI response' });
    }

    // Store conversation in database
    await pool.query(
      'INSERT INTO conversations (user_id, file_id, question, answer) VALUES ($1, $2, $3, $4)',
      [userId, fileId, question, answer]
    );

    res.json({
      success: true,
      answer: answer,
      message: 'Query processed successfully',
      metadata: {
        totalChunks: fileContent.chunkCount,
        keywords: fileContent.keywords,
        fileType: fileContent.fileType
      }
    });

  } catch (error) {
    console.error('Query processing error:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// GET /query/analyze/:fileId - Analyze document structure and content
router.get('/analyze/:fileId', verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId, accessToken } = req;

    // Check cache first
    const cacheKey = `${fileId}_${userId}`;
    let fileContent = documentCache.get(cacheKey);
    
    if (!fileContent || (Date.now() - fileContent.timestamp) > CACHE_TTL) {
      fileContent = await extractFileContent(fileId, accessToken);
      
      if (!fileContent) {
        return res.status(400).json({ error: 'Failed to extract file content' });
      }

      documentCache.set(cacheKey, {
        ...fileContent,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      analysis: {
        fileName: fileContent.fileName,
        fileType: fileContent.fileType,
        totalChunks: fileContent.chunkCount,
        keywords: fileContent.keywords,
        contentLength: fileContent.content.length,
        estimatedPages: Math.ceil(fileContent.content.length / 2000), // Rough estimate
        processingTime: Date.now() - fileContent.timestamp
      }
    });

  } catch (error) {
    console.error('Document analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze document' });
  }
});

// POST /query/batch - Handle multiple questions about a file
router.post('/batch', verifyToken, async (req, res) => {
  try {
    const { fileId, questions } = req.body;
    const { userId, accessToken } = req;

    if (!fileId || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Missing fileId or questions array' });
    }

    // Get or process file content
    const cacheKey = `${fileId}_${userId}`;
    let fileContent = documentCache.get(cacheKey);
    
    if (!fileContent || (Date.now() - fileContent.timestamp) > CACHE_TTL) {
      fileContent = await extractFileContent(fileId, accessToken);
      
      if (!fileContent) {
        return res.status(400).json({ error: 'Failed to extract file content' });
      }

      documentCache.set(cacheKey, {
        ...fileContent,
        timestamp: Date.now()
      });
    }

    // Process all questions
    const results = [];
    for (const question of questions) {
      try {
        const answer = await askGemini(question, fileContent);
        results.push({
          question,
          answer,
          success: true
        });

        // Store in database
        await pool.query(
          'INSERT INTO conversations (user_id, file_id, question, answer) VALUES ($1, $2, $3, $4)',
          [userId, fileId, question, answer]
        );
      } catch (error) {
        results.push({
          question,
          answer: null,
          error: error.message,
          success: false
        });
      }
    }

    res.json({
      success: true,
      results,
      metadata: {
        totalQuestions: questions.length,
        successfulAnswers: results.filter(r => r.success).length,
        totalChunks: fileContent.chunkCount
      }
    });

  } catch (error) {
    console.error('Batch query processing error:', error);
    res.status(500).json({ error: 'Failed to process batch queries' });
  }
});

module.exports = router;
