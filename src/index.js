// src/index.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const authRoutes = require('./routes/auth');
const expertRoutes = require('./routes/experts');
const paymentRoutes = require('./routes/payment.routes');
const { initSocket } = require('./socket');
require('dotenv').config(); // Ensure env vars are loaded

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Middleware
app.use(cors()); // Allows your Angular app to communicate with this API
app.use(express.json()); // Allows Express to read JSON data from requests

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/experts', expertRoutes);
app.use('/api/payment', paymentRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ConsultNow Backend is running!' });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});