const Razorpay = require('razorpay');
const crypto = require('crypto');
const prisma = require('../prisma');

// Import our new Module 6 services!
const { sendBookingConfirmation } = require('../service/email.service');
const { createMeeting } = require('../service/calendar.service');

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
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      guestData, 
      expertId,
      startTime,
      endTime 
    } = req.body;

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

    // --- SECURITY ENHANCEMENT: Verify amount against your database record ---
    const transactionFromDb = await prisma.transaction.findUnique({
      where: { orderId: razorpay_order_id }
    });

    const razorpayOrderDetails = await razorpay.orders.fetch(razorpay_order_id);

    if (razorpayOrderDetails.amount !== transactionFromDb.amount) {
      // Handle amount mismatch - this is a critical security event.
      console.error(`[SECURITY ALERT] Payment amount mismatch for order ${razorpay_order_id}. Expected ${transactionFromDb.amount}, got ${razorpayOrderDetails.amount}.`);
      return res.status(400).json({ error: 'Payment amount mismatch. Verification failed.' });
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
    // POST-PAYMENT AUTOMATION: Create Booking, Google Calendar & Email Dispatch
    // ---------------------------------------------------------
    try {
      // 1. Fetch Expert details from the database
      const expert = await prisma.expert.findUnique({
        where: { id: expertId },
        select: { email: true, name: true }
      });

      if (expert) {
        // 2. Create the Booking record for the paid session
        await prisma.booking.create({
          data: {
            expertId: expertId,
            status: 'PAID',
            type: 'PAID_1_HOUR',
            details: guestData.problem,
            startTime: startTime,
            endTime: endTime,
            guestName: guestData.name,
            guestEmail: guestData.email
          }
        });
        
        const summary = `ConsultNow Session: ${guestData.name} & ${expert.name}`;
        const desc = `Problem Description provided by guest: ${guestData.problem || 'No description provided.'}`;

        // 3. Automatically generate the Google Meet Link with the correct time
        const meetLink = await createMeeting(expert.email, guestData.email, summary, desc, startTime, endTime);

        // 4. Dispatch the HTML confirmation email to the guest containing the link
        await sendBookingConfirmation(guestData.email, guestData.name, expert.name, meetLink, startTime);
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

const cancelPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { orderId },
      data: { status: 'FAILED' }
    });

    res.status(200).json({
      message: 'Transaction marked as failed.',
      transaction: updatedTransaction
    });
  } catch (error) {
    console.error('Error cancelling payment:', error);
    res.status(500).json({ error: 'Internal server error during cancellation.' });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  cancelPayment
};