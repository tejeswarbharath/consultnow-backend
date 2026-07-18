// src/index.js
require('dotenv').config(); // Ensure env vars are loaded
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const http = require('http');
const authRoutes = require('./routes/auth');
const expertRoutes = require('./routes/experts');
const bookingRoutes = require('./routes/booking.routes');
const paymentRoutes = require('./routes/payment.routes');
const aiRoutes = require('./routes/ai');
const seoRoutes = require('./routes/seo.routes');
const { initSocket } = require('./socket');

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
app.use('/api/bookings', bookingRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/', seoRoutes); // Serve sitemap.xml at root level

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ConsultNow Backend is running!' });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});