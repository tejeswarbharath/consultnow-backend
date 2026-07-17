const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment, cancelPayment } = require('../controller/payment.controller');

// Step 1: Frontend calls this to get a Razorpay Order ID before opening the modal
router.post('/create-order', createOrder);

// Step 2: Frontend calls this after Razorpay succeeds to verify the digital signature
router.post('/verify-payment', verifyPayment);

// Step 3: Frontend calls this if the user cancels or closes the checkout modal
router.post('/cancel-payment', cancelPayment);

module.exports = router;