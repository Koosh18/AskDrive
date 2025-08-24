# AskDrive - AI Assistant for Google Drive

AskDrive is a Chrome extension that allows you to ask questions about your Google Drive files using AI. It supports Google Docs, Google Sheets, and .docx files, providing intelligent answers based on your document content.

## 🚀 Features

- **Google OAuth2 Integration**: Secure authentication with your Google account
- **Multi-format Support**: Works with Google Docs, Google Sheets, and .docx files
- **AI-powered Q&A**: Uses Google's Gemini AI to answer questions about your documents
- **Conversation History**: Persistent chat history stored in PostgreSQL
- **Modern UI**: Clean, responsive interface with real-time chat experience

## 🏗️ Architecture

### Frontend (Chrome Extension)
- **manifest.json**: Extension configuration and permissions
- **popup.html**: Main extension interface
- **popup.js**: Extension logic and API integration
- **style.css**: Modern, responsive styling
- **background.js**: OAuth handling and background tasks

### Backend (Node.js + Express)
- **server.js**: Main Express server
- **routes/**: API endpoints for auth, files, queries, and history
- **utils/**: File extraction and AI service utilities
- **config/**: Database configuration and initialization scripts

### Database (PostgreSQL)
- **users**: User authentication and OAuth tokens
- **conversations**: Chat history and Q&A pairs

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 16+ and npm
- PostgreSQL database
- Google Cloud Project with Drive API enabled
- Gemini API key

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
export DB_USER=postgres
export DB_PASSWORD=your_password
export DB_HOST=localhost
export DB_NAME=askdrive
export GEMINI_API_KEY=your_gemini_api_key

# Initialize database
npm run init-db

# Start the server
npm start
```

### 2. Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the extension folder
4. The extension should now appear in your toolbar

### 3. Google Cloud Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Drive API and Google Docs API
4. Create OAuth 2.0 credentials for Chrome extension
5. Add your extension ID to the OAuth consent screen
6. Update `manifest.json` with your client ID

## 📁 File Structure

```
AskDrive/
├── manifest.json          # Extension configuration
├── popup.html            # Extension UI
├── popup.js              # Extension logic
├── style.css             # Styling
├── background.js         # Background tasks
├── AskDrive.png          # Extension icon
├── backend/              # Node.js backend
│   ├── server.js         # Main server
│   ├── package.json      # Dependencies
│   ├── config/           # Database config
│   ├── routes/           # API endpoints
│   └── utils/            # Utilities
└── README.md             # This file
```

## 🔧 API Endpoints

### Authentication
- `POST /auth/google` - Google OAuth login
- `GET /auth/verify` - Verify access token

### Files
- `GET /files` - Get user's Drive files

### Queries
- `POST /query` - Ask AI about a file

### History
- `GET /history/:fileId` - Get conversation history for a file
- `GET /history` - Get all user conversations

## 🔐 Security Features

- CORS restrictions for Chrome extensions only
- Access token validation on all protected endpoints
- No refresh token handling (keeps it simple)
- Secure database queries with parameterized statements

## 🚀 Usage

1. **Install Extension**: Load the unpacked extension in Chrome
2. **Sign In**: Click "Sign in with Google" to authenticate
3. **Select File**: Choose a Drive file from the dropdown
4. **Ask Questions**: Type your question and get AI-powered answers
5. **View History**: See your conversation history for each file

## 🐛 Troubleshooting

### Common Issues

1. **Extension not loading**: Check manifest.json syntax and permissions
2. **OAuth errors**: Verify Google Cloud credentials and OAuth consent screen
3. **Database connection**: Ensure PostgreSQL is running and credentials are correct
4. **API errors**: Check Gemini API key and quota limits

### Debug Mode

Enable Chrome DevTools for the extension:
1. Right-click extension icon → "Inspect popup"
2. Check Console for errors
3. Monitor Network tab for API calls

## 📝 Environment Variables

```bash
# Database
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_NAME=askdrive
DB_PORT=5432

# AI Service
GEMINI_API_KEY=your_gemini_api_key

# Server
PORT=3000
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Google Drive API for file access
- Google Gemini AI for intelligent responses
- Chrome Extensions API for browser integration
- PostgreSQL for reliable data storage

---

**Note**: This is a development version. For production use, ensure proper security measures, environment variable management, and error handling.
