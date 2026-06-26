const Razorpay = require('razorpay');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Import our new Module 6 services!
const { sendBookingConfirmation } = require('../service/email.service');
const { createMeeting } = require('../service/calendar.service');

// Initialize Neon Database Connection
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

let razorpay;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} else {
  console.warn('[ConsultNow] Razorpay keys not found. Payment gateway is disabled.');
}

/**
 * Step 1: Create a secure Razorpay Order
 */
const createOrder = async (req, res) => {
  if (!razorpay) {
    return res.status(503).json({ error: 'Payment gateway is not configured.' });
  }
  try {
    const { expertId, amount, currency, guestData } = req.body;

    if (!expertId || !amount || !guestData) {
      return res.status(400).json({ error: 'Missing required checkout information.' });
    }

    const subunitAmount = Math.round(amount * 100);

    const options = {
      amount: subunitAmount,
      currency: currency || 'INR',
      receipt: `receipt_order_${Math.random().toString(36).substring(2, 15)}`,
    };

    const order = await razorpay.orders.create(options);

    if (!order) {
      return res.status(500).json({ error: 'Failed to generate Razorpay order.' });
    }

    const transaction = await prisma.transaction.create({
      data: {
        orderId: order.id,
        amount: subunitAmount,
        currency: options.currency,
        expertId: expertId,
        status: 'CREATED'
      }
    });

    res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      transactionId: transaction.id
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ error: 'Internal server error during checkout initialization.' });
  }
};

/**
 * Step 2: Verify Payment & Execute Post-Booking Automation
 */
const verifyPayment = async (req, res) => {
  if (!razorpay) {
    return res.status(503).json({ error: 'Payment gateway is not configured.' });
  }
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, guestData, expertId } = req.body;

    // Verify digital signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      await prisma.transaction.update({
        where: { orderId: razorpay_order_id },
        data: { status: 'FAILED' }
      });
      return res.status(400).json({ error: 'Invalid payment signature. Payment rejected.' });
    }

    // Payment is verified! Mark as PAID
    const successfulTransaction = await prisma.transaction.update({
      where: { orderId: razorpay_order_id },
      data: {
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        status: 'PAID'
      }
    });

    // ---------------------------------------------------------
    // POST-PAYMENT AUTOMATION: Google Calendar & Email Dispatch
    // ---------------------------------------------------------
    try {
      // 1. Fetch Expert details from the database
      const expert = await prisma.expert.findUnique({
        where: { id: expertId },
        select: { email: true, name: true }
      });

      if (expert) {
        const summary = `ConsultNow Session: ${guestData.name} & ${expert.name}`;
        const desc = `Problem Description provided by guest: ${guestData.problem || 'No description provided.'}`;

        // 2. Automatically generate the Google Meet Link
        const meetLink = await createMeeting(expert.email, guestData.email, summary, desc);

        // 3. Dispatch the HTML confirmation email to the guest containing the link
        await sendBookingConfirmation(guestData.email, guestData.name, expert.name, meetLink);
      }
    } catch (automationError) {
      // We log this but DO NOT throw it back to the frontend. 
      // The payment succeeded; we don't want the UI to show a payment error 
      // just because an email failed to send.
      console.error('[Automation Failure] Post-payment systems failed:', automationError);
    }
    // ---------------------------------------------------------

    res.status(200).json({ 
      message: 'Payment verified and booking automated successfully',
      transaction: successfulTransaction
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Internal server error during verification.' });
  }
};

module.exports = {
  createOrder,
  verifyPayment
};