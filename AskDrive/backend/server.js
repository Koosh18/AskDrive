const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const queryRoutes = require('./routes/query');
const historyRoutes = require('./routes/history');

const app = express();
const config = require('./config/config');
const PORT = config.server.port;

const corsOptions = {
    origin: 'chrome-extension://bfepjebdhomfndenkinglbmabigfahke',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  };
  
  app.use(cors(corsOptions));
  // Explicitly handle OPTIONS requests
  app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/auth', authRoutes);
app.use('/files', fileRoutes);
app.use('/query', queryRoutes);
app.use('/history', historyRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 AskDrive backend server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
});
