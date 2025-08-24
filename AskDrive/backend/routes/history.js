const express = require('express');
const router = express.Router();
const pool = require('../config/database');

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
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
}

// GET /history/:fileId - Get conversation history for a specific file
router.get('/:fileId', verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId } = req;

    // Get conversations for this file and user
    const result = await pool.query(
      'SELECT question, answer, created_at FROM conversations WHERE user_id = $1 AND file_id = $2 ORDER BY created_at ASC',
      [userId, fileId]
    );

    const conversations = result.rows.map(row => ({
      question: row.question,
      answer: row.answer,
      timestamp: row.created_at
    }));

    res.json(conversations);

  } catch (error) {
    console.error('Error fetching conversation history:', error);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

// GET /history - Get all conversations for the user
router.get('/', verifyToken, async (req, res) => {
  try {
    const { userId } = req;

    // Get all conversations for this user
    const result = await pool.query(
      'SELECT file_id, question, answer, created_at FROM conversations WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    const conversations = result.rows.map(row => ({
      fileId: row.file_id,
      question: row.question,
      answer: row.answer,
      timestamp: row.created_at
    }));

    res.json(conversations);

  } catch (error) {
    console.error('Error fetching all conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

module.exports = router;
