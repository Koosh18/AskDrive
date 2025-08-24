const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// POST /auth/google - Handle Google OAuth login
router.post('/google', async (req, res) => {
  try {
    const { access_token, user_info } = req.body;
    
    if (!access_token || !user_info) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { id: google_id, email } = user_info;

    // Check if user exists
    let user = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [google_id]
    );

    if (user.rows.length > 0) {
      // Update existing user's access token
      user = await pool.query(
        'UPDATE users SET access_token = $1, updated_at = CURRENT_TIMESTAMP WHERE google_id = $2 RETURNING *',
        [access_token, google_id]
      );
    } else {
      // Create new user
      user = await pool.query(
        'INSERT INTO users (google_id, email, access_token) VALUES ($1, $2, $3) RETURNING *',
        [google_id, email, access_token]
      );
    }

    // Return user info (without sensitive data)
    const userData = {
      id: user.rows[0].id,
      google_id: user.rows[0].google_id,
      email: user.rows[0].email,
      created_at: user.rows[0].created_at
    };

    res.json({ 
      success: true, 
      user: userData,
      message: 'Authentication successful' 
    });

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// GET /auth/verify - Verify user's access token
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No access token provided' });
    }

    const accessToken = authHeader.split(' ')[1];
    
    const user = await pool.query(
      'SELECT id, google_id, email FROM users WHERE access_token = $1',
      [accessToken]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid access token' });
    }

    res.json({ 
      success: true, 
      user: user.rows[0] 
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
});

module.exports = router;
