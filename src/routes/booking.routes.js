const express = require('express');
const router = express.Router();
const { requestFreeService, acceptBooking, rejectBooking, getExpertAvailability } = require('../service/booking.controller');

// POST /api/bookings/free-request
// Should be protected by auth middleware to capture req.user
router.post('/free-request', requestFreeService);

// GET /api/bookings/accept/:id
// Triggered directly via email link clicks from the Expert
router.get('/accept/:id', acceptBooking);

// GET /api/bookings/reject/:id
// Triggered directly via email link clicks from the Expert
router.get('/reject/:id', rejectBooking);

// GET /api/bookings/availability/:expertId
router.get('/availability/:expertId', getExpertAvailability);

module.exports = router;