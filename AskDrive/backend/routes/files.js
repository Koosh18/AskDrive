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
    req.accessToken = accessToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
}

// Helper function to extract folder ID from Google Drive URL
function extractFolderIdFromUrl(url) {
  // Handle different Google Drive URL formats
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,  // Standard folder URL
    /id=([a-zA-Z0-9_-]+)/,          // ID parameter format
    /[?&]folderId=([a-zA-Z0-9_-]+)/ // Folder ID parameter
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// Recursive function to get all files from a folder and its subfolders
async function getAllFilesRecursively(folderId, accessToken, visitedFolders = new Set()) {
  if (visitedFolders.has(folderId)) {
    console.log(`⚠️ Circular reference detected for folder: ${folderId}`);
    return [];
  }
  
  visitedFolders.add(folderId);
  const allFiles = [];
  
  try {
    // Get files and subfolders from current folder
    const queryParams = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime,parents,size)',
      orderBy: 'modifiedTime desc',
      pageSize: '1000'
    });

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${queryParams}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch folder ${folderId}:`, response.status);
      return [];
    }

    const data = await response.json();
    const items = data.files || [];

    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        // Recursively get files from subfolder
        console.log(`📁 Exploring subfolder: ${item.name} (${item.id})`);
        const subfolderFiles = await getAllFilesRecursively(item.id, accessToken, visitedFolders);
        allFiles.push(...subfolderFiles);
      } else {
        // Add file to results
        allFiles.push(item);
      }
    }

  } catch (error) {
    console.error(`Error fetching folder ${folderId}:`, error);
  }

  return allFiles;
}

// GET /files - Get files from a specific folder with recursive search
router.get('/', verifyToken, async (req, res) => {
  try {
    const { accessToken } = req;
    const { folderUrl, recursive = 'true' } = req.query;
    
    if (!folderUrl) {
      return res.status(400).json({ error: 'Folder URL is required' });
    }
    
    // Extract folder ID from the URL
    const folderId = extractFolderIdFromUrl(folderUrl);
    
    if (!folderId) {
      return res.status(400).json({ error: 'Invalid folder URL. Could not extract folder ID.' });
    }
    
    console.log(`📁 Fetching files from folder: ${folderId} (recursive: ${recursive})`);
    
    let files = [];
    
    if (recursive === 'true') {
      // Get all files recursively from folder and subfolders
      files = await getAllFilesRecursively(folderId, accessToken);
      console.log(`📄 Found ${files.length} total files (including subfolders)`);
    } else {
      // Get only files from the current folder (non-recursive)
      const queryParams = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id,name,mimeType,modifiedTime,parents,size)',
        orderBy: 'modifiedTime desc',
        pageSize: '1000'
      });

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryParams}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Google Drive API error:', errorData);
        throw new Error(`Google Drive API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      files = data.files || [];
      console.log(`📄 Found ${files.length} files in current folder`);
    }

    // Filter for supported file types (including PDFs)
    const supportedFiles = files.filter(file => {
      const mimeType = file.mimeType;
      return (
        mimeType === 'application/vnd.google-apps.document' ||
        mimeType === 'application/vnd.google-apps.spreadsheet' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/pdf' ||
        mimeType === 'text/plain' ||
        mimeType === 'application/rtf'
      );
    }).map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      size: file.size,
      folderId: folderId,
      isRecursive: recursive === 'true'
    }));

    console.log(`✅ Returning ${supportedFiles.length} supported files`);

    res.json({
      success: true,
      folderId: folderId,
      files: supportedFiles,
      totalFiles: supportedFiles.length,
      recursive: recursive === 'true',
      searchDepth: recursive === 'true' ? 'recursive' : 'current folder only'
    });

  } catch (error) {
    console.error('Error fetching Drive files:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Drive files',
      details: error.message 
    });
  }
});

// GET /files/folder/:folderId - Alternative endpoint using folder ID directly
router.get('/folder/:folderId', verifyToken, async (req, res) => {
  try {
    const { accessToken } = req;
    const { folderId } = req.params;
    const { recursive = 'true' } = req.query;
    
    if (!folderId) {
      return res.status(400).json({ error: 'Folder ID is required' });
    }
    
    console.log(`📁 Fetching files from folder ID: ${folderId} (recursive: ${recursive})`);
    
    let files = [];
    
    if (recursive === 'true') {
      // Get all files recursively from folder and subfolders
      files = await getAllFilesRecursively(folderId, accessToken);
      console.log(`📄 Found ${files.length} total files (including subfolders)`);
    } else {
      // Get only files from the current folder (non-recursive)
      const queryParams = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id,name,mimeType,modifiedTime,parents,size)',
        orderBy: 'modifiedTime desc',
        pageSize: '1000'
      });

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryParams}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Google Drive API error:', errorData);
        throw new Error(`Google Drive API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      files = data.files || [];
      console.log(`📄 Found ${files.length} files in current folder`);
    }

    // Filter for supported file types (including PDFs)
    const supportedFiles = files.filter(file => {
      const mimeType = file.mimeType;
      return (
        mimeType === 'application/vnd.google-apps.document' ||
        mimeType === 'application/vnd.google-apps.spreadsheet' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/pdf' ||
        mimeType === 'text/plain' ||
        mimeType === 'application/rtf'
      );
    }).map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      size: file.size,
      folderId: folderId,
      isRecursive: recursive === 'true'
    }));

    console.log(`✅ Returning ${supportedFiles.length} supported files`);

    res.json({
      success: true,
      folderId: folderId,
      files: supportedFiles,
      totalFiles: supportedFiles.length,
      recursive: recursive === 'true',
      searchDepth: recursive === 'true' ? 'recursive' : 'current folder only'
    });

  } catch (error) {
    console.error('Error fetching Drive files:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Drive files',
      details: error.message 
    });
  }
});

// GET /files/search - Search for files across all accessible folders
router.get('/search', verifyToken, async (req, res) => {
  try {
    const { accessToken } = req;
    const { query, recursive = 'true' } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    console.log(`🔍 Searching for files with query: "${query}" (recursive: ${recursive})`);
    
    // Build search query
    let searchQuery = `trashed = false and (name contains '${query}' or fullText contains '${query}')`;
    
    if (recursive === 'false') {
      // Limit to current folder only
      searchQuery += ` and '${req.query.folderId || 'root'}' in parents`;
    }
    
    const queryParams = new URLSearchParams({
      q: searchQuery,
      fields: 'files(id,name,mimeType,modifiedTime,parents,size)',
      orderBy: 'modifiedTime desc',
      pageSize: '100'
    });

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${queryParams}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google Drive API error:', errorData);
      throw new Error(`Google Drive API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const files = data.files || [];

    // Filter for supported file types
    const supportedFiles = files.filter(file => {
      const mimeType = file.mimeType;
      return (
        mimeType === 'application/vnd.google-apps.document' ||
        mimeType === 'application/vnd.google-apps.spreadsheet' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/pdf' ||
        mimeType === 'text/plain' ||
        mimeType === 'application/rtf'
      );
    }).map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      size: file.size,
      isSearchResult: true
    }));

    console.log(`🔍 Found ${supportedFiles.length} matching files`);

    res.json({
      success: true,
      query: query,
      files: supportedFiles,
      totalFiles: supportedFiles.length,
      recursive: recursive === 'true'
    });

  } catch (error) {
    console.error('Error searching Drive files:', error);
    res.status(500).json({ 
      error: 'Failed to search Drive files',
      details: error.message 
    });
  }
});

module.exports = router;