const express = require('express');
const router = express.Router();
const { handleStripeWebhook } = require('../../../../controllers/webhook.controller');

// POST /api/webhooks/payment
// CRITICAL: Stripe requires the raw body to verify webhooks. 
// We use express.raw() here to parse the body as a Buffer before our global JSON parser intercepts it.
router.post('/payment', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;