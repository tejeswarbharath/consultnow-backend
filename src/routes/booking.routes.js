const express = require('express');
const router = express.Router();
const { 
  requestFreeService, 
  acceptBooking, 
  rejectBooking, 
  getExpertAvailability,
  generateBookingSynopsis,
  getBookingSynopsis,
  triggerFeedbackEmail
} = require('../service/booking.controller');

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
// Retrieves expert availability
router.get('/availability/:expertId', getExpertAvailability);

// POST /api/bookings/:id/synopsis - Generates synopsis & emails expert (BCC no-reply@consultnow.in)
router.post('/:id/synopsis', generateBookingSynopsis);

// GET /api/bookings/:id/synopsis - Retrieves synopsis
router.get('/:id/synopsis', getBookingSynopsis);

// POST /api/bookings/:id/send-feedback - Dispatches post-consultation feedback request email to user
router.post('/:id/send-feedback', triggerFeedbackEmail);

module.exports = router;