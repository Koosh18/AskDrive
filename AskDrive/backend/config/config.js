require('dotenv').config();

module.exports = {
  database: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'askdrive',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || 'AIzaSyCBhnlT1kmCwbo5R37A_Z8hcQI-ufsIpmQ',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
  },

  server: {
    port: process.env.PORT || 3000
  }
};
