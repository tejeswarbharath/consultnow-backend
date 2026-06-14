// src/index.js
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const expertRoutes = require('./routes/experts');

const app = express();

// Middleware
app.use(cors()); // Allows your Angular app to communicate with this API
app.use(express.json()); // Allows Express to read JSON data from requests

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/experts', expertRoutes);

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ConsultNow Backend is running!' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});