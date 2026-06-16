const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment } = require('../controller/payment.controller');

// POST /api/payment/create-order
router.post('/create-order', createOrder);

// POST /api/payment/verify
router.post('/verify', verifyPayment);

module.exports = router;