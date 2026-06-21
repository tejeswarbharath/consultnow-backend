const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment } = require('../controller/payment.controller');

// Step 1: Frontend calls this to get a Razorpay Order ID before opening the modal
router.post('/create-order', createOrder);

// Step 2: Frontend calls this after Razorpay succeeds to verify the digital signature
router.post('/verify-payment', verifyPayment);

module.exports = router;