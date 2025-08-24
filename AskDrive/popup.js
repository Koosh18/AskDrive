document.addEventListener("DOMContentLoaded", init);

// Backend API configuration
const BACKEND_URL = 'http://localhost:3000';

// Global state
let currentUser = null;
let currentFileId = null;
let accessToken = null;

async function init() {
  setupEventListeners();
  checkAuthStatus();
}

function setupEventListeners() {
  // Google login button
  document.getElementById('google-login-btn').addEventListener('click', handleGoogleLogin);
  
  // File selection dropdown
  document.getElementById('file-select').addEventListener('change', handleFileSelection);
  
  // Chat form
  document.getElementById('chat-form').addEventListener('submit', handleChatSubmit);
}

async function checkAuthStatus() {
  try {
    const token = await getAuthToken();
    if (token) {
      accessToken = token;
      await handleSuccessfulAuth(token);
    }
  } catch (error) {
    console.log('User not authenticated');
    showLoginSection();
  }
}

async function handleGoogleLogin() {
  try {
    const token = await getAuthToken();
    accessToken = token;
    await handleSuccessfulAuth(token);
  } catch (error) {
    console.error('Login failed:', error);
    showError('Login failed. Please try again.');
  }
}

async function handleSuccessfulAuth(token) {
  try {
    // Get user info from Google
    const userInfo = await getUserInfo(token);
    
    // Authenticate with backend
    const authResponse = await fetch(`${BACKEND_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        access_token: token,
        user_info: userInfo 
      })
    });
    
    if (!authResponse.ok) {
      throw new Error('Backend authentication failed');
    }
    
    const authData = await authResponse.json();
    currentUser = authData.user;
    
    // Load user's Drive files
    await loadDriveFiles(token);
    
    // Show app section
    showAppSection();
    
  } catch (error) {
    console.error('Authentication setup failed:', error);
    showError('Failed to complete authentication. Please try again.');
  }
}

async function getUserInfo(token) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json();
}

// ... existing code ...

async function loadDriveFiles(token) {
  try {
    // Get the current active tab URL to extract folder information
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tab.url;
    
    console.log('Current URL:', currentUrl);
    
    // Check if we're in a Google Drive folder
    if (!currentUrl.includes('drive.google.com')) {
      showError('Please open a Google Drive folder to use AskDrive');
      return;
    }
    
    // Add recursive search toggle
    const recursiveSearch = true; // You can make this configurable
    
    const response = await fetch(`${BACKEND_URL}/files?folderUrl=${encodeURIComponent(currentUrl)}&recursive=${recursiveSearch}`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch files');
    }
    
    const data = await response.json();
    console.log('Files data:', data);
    
    if (data.success) {
      populateFileDropdown(data.files);
      console.log(`Loaded ${data.totalFiles} files from folder: ${data.folderId} (${data.searchDepth})`);
      
      // Show search info
      if (data.recursive) {
        showInfo(`🔍 Recursive search enabled - Found ${data.totalFiles} files including subfolders`);
      } else {
        showInfo(`📁 Current folder only - Found ${data.totalFiles} files`);
      }
    } else {
      throw new Error(data.error || 'Failed to load files');
    }
    
  } catch (error) {
    console.error('Failed to load files:', error);
    showError(`Failed to load Drive files: ${error.message}`);
  }
}

function populateFileDropdown(files) {
  const select = document.getElementById('file-select');
  select.innerHTML = '<option value="">Choose a file...</option>';
  
  // Group files by type for better organization
  const groupedFiles = groupFilesByType(files);
  
  Object.entries(groupedFiles).forEach(([type, typeFiles]) => {
    // Add type header
    const typeOption = document.createElement('option');
    typeOption.disabled = true;
    typeOption.textContent = `── ${type} ──`;
    select.appendChild(typeOption);
    
    // Add files of this type
    typeFiles.forEach(file => {
      const option = document.createElement('option');
      option.value = file.id;
      
      // Show file size and type icon
      const size = file.size ? formatFileSize(file.size) : '';
      const icon = getFileTypeIcon(file.mimeType);
      option.textContent = `${icon} ${file.name} ${size}`;
      
      // Store file data for later use
      option.dataset.fileData = JSON.stringify(file);
      select.appendChild(option);
    });
  });
}

function groupFilesByType(files) {
  const groups = {
    'Documents': [],
    'Spreadsheets': [],
    'PDFs': [],
    'Other Files': []
  };
  
  files.forEach(file => {
    const mimeType = file.mimeType;
    
    if (mimeType === 'application/vnd.google-apps.document' || 
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      groups['Documents'].push(file);
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      groups['Spreadsheets'].push(file);
    } else if (mimeType === 'application/pdf') {
      groups['PDFs'].push(file);
    } else {
      groups['Other Files'].push(file);
    }
  });
  
  // Remove empty groups
  Object.keys(groups).forEach(key => {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  });
  
  return groups;
}

function getFileTypeIcon(mimeType) {
  const icons = {
    'application/vnd.google-apps.document': '��',
    'application/vnd.google-apps.spreadsheet': '��',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '��',
    'application/pdf': '📕',
    'text/plain': '��',
    'application/rtf': '📄'
  };
  
  return icons[mimeType] || '📁';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `(${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]})`;
}

function showInfo(message) {
  const chatbox = document.getElementById('chatbox');
  const infoDiv = document.createElement('div');
  infoDiv.classList.add('message', 'bot', 'info');
  infoDiv.innerHTML = `<div class="info-text">ℹ️ ${message}</div>`;
  chatbox.appendChild(infoDiv);
  chatbox.scrollTop = chatbox.scrollHeight;
}

// ... rest of existing code ...

async function handleFileSelection(event) {
  const fileId = event.target.value;
  currentFileId = fileId;
  
  if (!fileId) {
    disableChat();
    clearChat();
    return;
  }
  
  // Load conversation history for this file
  await loadConversationHistory(fileId);
  
  // Enable chat
  enableChat();
}

async function loadConversationHistory(fileId) {
  try {
    const response = await fetch(`${BACKEND_URL}/history/${fileId}`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const history = await response.json();
      displayConversationHistory(history);
    }
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

function displayConversationHistory(history) {
  const chatbox = document.getElementById('chatbox');
  chatbox.innerHTML = '<div class="welcome-message">💬 Ask me anything about this file!</div>';
  
  history.forEach(conv => {
    addMessage(conv.question, 'user');
    addMessage(conv.answer, 'bot');
  });
}

async function handleChatSubmit(event) {
  event.preventDefault();
  
  const input = document.getElementById('user-input');
  const question = input.value.trim();
  
  if (!question || !currentFileId) return;
  
  // Add user message
  addMessage(question, 'user');
  input.value = '';
  
  // Show typing indicator
  const typingIndicator = addTypingIndicator();
  
  try {
    // Send question to backend
    const response = await fetch(`${BACKEND_URL}/query`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: currentFileId,
        question: question
      })
    });
    console.log("response" , response);
    
    if (!response.ok) {
      throw new Error('Failed to get answer');
    }
    
    const data = await response.json();
    
    // Remove typing indicator and add answer
    typingIndicator.remove();
    addMessage(data.answer, 'bot');
    
  } catch (error) {
    console.error('Query failed:', error);
    typingIndicator.remove();
    addMessage('Sorry, I encountered an error while processing your question. Please try again.', 'bot');
  }
}

function addMessage(content, sender) {
  const chatbox = document.getElementById('chatbox');
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  
  if (sender === 'bot') {
    // Format bot messages
    let formattedText = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/- (.*)/g, '• $1')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
    
    msgDiv.innerHTML = `<div class="bot-text">${formattedText}</div>`;
  } else {
    msgDiv.innerHTML = `<div class="user-text">${content}</div>`;
  }
  
  chatbox.appendChild(msgDiv);
  chatbox.scrollTop = chatbox.scrollHeight;
}

function addTypingIndicator() {
  const chatbox = document.getElementById('chatbox');
  const indicator = document.createElement('div');
  indicator.classList.add('message', 'bot', 'typing');
  indicator.innerHTML = '<div class="typing-dots">...</div>';
  chatbox.appendChild(indicator);
  chatbox.scrollTop = chatbox.scrollHeight;
  return indicator;
}

function showLoginSection() {
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('app-section').style.display = 'none';
}

function showAppSection() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('app-section').style.display = 'block';
}

function enableChat() {
  document.getElementById('user-input').disabled = false;
  document.querySelector('#chat-form button').disabled = false;
}

function disableChat() {
  document.getElementById('user-input').disabled = true;
  document.querySelector('#chat-form button').disabled = true;
}

function clearChat() {
  document.getElementById('chatbox').innerHTML = '<div class="welcome-message">💬 Select a file and ask me anything about its content!</div>';
}

function showError(message) {
  const chatbox = document.getElementById('chatbox');
  const errorDiv = document.createElement('div');
  errorDiv.classList.add('message', 'bot', 'error');
  errorDiv.innerHTML = `<div class="error-text">⚠ ${message}</div>`;
  chatbox.appendChild(errorDiv);
  chatbox.scrollTop = chatbox.scrollHeight;
}

// Google OAuth helper
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error('No token received'));
      } else {
        resolve(token);
      }
    });
  });
}
