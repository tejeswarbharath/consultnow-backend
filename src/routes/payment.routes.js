const express = require('express');
const router = express.Router();
const { createCheckoutSession } = require('../../../../controllers/payment.controller');

// POST /api/create-checkout-session
// NOTE: You may want to add your JWT authMiddleware here to protect this route
router.post('/create-checkout-session', createCheckoutSession);

module.exports = router;