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
 * Step 1: Create a secure Razorpay Order (Supports INR & USD for PayPal)
 */
const createOrder = async (req, res) => {
  if (!razorpay) {
    return res.status(503).json({ error: 'Payment gateway is not configured.' });
  }
  try {
    const { expertId, hoursCount, currency, guestData, referralCode } = req.body;

    if (!expertId || !guestData) {
      return res.status(400).json({ error: 'Missing required checkout information.' });
    }

    // Server-side price calculation to prevent client-side parameter tampering
    const dbExpert = await prisma.expert.findUnique({ where: { id: expertId } });
    if (!dbExpert) {
      return res.status(404).json({ error: 'Expert not found.' });
    }

    const durationHours = Math.max(1, parseInt(hoursCount || 1, 10));
    let basePriceInINR = dbExpert.pricePerHour * durationHours;

    const targetCurrency = (currency || dbExpert.currency || 'INR').toUpperCase();
    const INR_TO_USD_RATE = 0.012; // 1 INR ≈ 0.012 USD (~$12 for ₹1000)

    let calculatedBaseAmount = basePriceInINR;
    if (targetCurrency === 'USD' && (dbExpert.currency || 'INR') === 'INR') {
      calculatedBaseAmount = Math.max(1, Math.round(basePriceInINR * INR_TO_USD_RATE));
    }

    let appliedDiscountPercent = 0;
    let cleanCode = referralCode ? referralCode.trim().toUpperCase() : null;

    if (cleanCode) {
      const refExpert = await prisma.expert.findUnique({ where: { referralCode: cleanCode } });
      const refUser = await prisma.user.findUnique({ where: { referralCode: cleanCode } });
      if (refExpert || refUser) {
        appliedDiscountPercent = 10;
      } else {
        cleanCode = null;
      }
    }

    const discountAmount = Math.round((calculatedBaseAmount * (appliedDiscountPercent / 100)) * 100) / 100;
    const finalCalculatedAmount = Math.max(0, calculatedBaseAmount - discountAmount);
    // Subunits: Cents for USD, Paise for INR
    const subunitAmount = Math.round(finalCalculatedAmount * 100);

    const options = {
      amount: subunitAmount,
      currency: targetCurrency,
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
        referralCode: cleanCode,
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
    // POST-PAYMENT AUTOMATION: Create Booking, Google Calendar, Affiliate Reward & Email
    // ---------------------------------------------------------
    try {
      const expert = await prisma.expert.findUnique({
        where: { id: expertId },
        select: { email: true, name: true }
      });

      if (expert) {
        const booking = await prisma.booking.create({
          data: {
            expertId: expertId,
            status: 'PAID',
            type: 'PAID_1_HOUR',
            details: guestData.problem,
            startTime: startTime,
            endTime: endTime,
            guestName: guestData.name,
            guestEmail: guestData.email,
            referralCode: transactionFromDb.referralCode
          }
        });

        // AFFILIATE REWARD AUTOMATION
        if (transactionFromDb.referralCode) {
          const code = transactionFromDb.referralCode;
          const refExpert = await prisma.expert.findUnique({ where: { referralCode: code } });
          const refUser = await prisma.user.findUnique({ where: { referralCode: code } });

          const referrer = refExpert || refUser;
          const referrerType = refExpert ? 'EXPERT' : (refUser ? 'USER' : null);

          if (referrer && referrerType) {
            // Self-referral prevention check
            const isSelfReferral = (referrer.id === expertId) || 
                                   (referrer.email && guestData.email && referrer.email.toLowerCase() === guestData.email.toLowerCase());

            if (!isSelfReferral) {
              const actualAmountPaid = transactionFromDb.amount / 100;
              const commissionEarned = Math.round((actualAmountPaid * 0.10) * 100) / 100; // 10% commission

              // Log referral
              await prisma.referralLog.create({
                data: {
                  referrerId: referrer.id,
                  referrerType: referrerType,
                  referredUserEmail: guestData.email,
                  bookingId: booking.id,
                  orderId: razorpay_order_id,
                  transactionAmount: actualAmountPaid,
                  commissionEarned: commissionEarned,
                  referralCodeUsed: code,
                  status: 'CREDITED'
                }
              });

              // Update balance & total count
              if (referrerType === 'EXPERT') {
                await prisma.expert.update({
                  where: { id: referrer.id },
                  data: {
                    affiliateBalance: { increment: commissionEarned },
                    totalReferrals: { increment: 1 }
                  }
                });
              } else {
                await prisma.user.update({
                  where: { id: referrer.id },
                  data: {
                    affiliateBalance: { increment: commissionEarned },
                    totalReferrals: { increment: 1 }
                  }
                });
              }
            } else {
              console.warn(`[AFFILIATE] Self-referral commission blocked for code ${code}`);
            }
          }
        }
        
        const summary = `ConsultNow Session: ${guestData.name} & ${expert.name}`;
        const desc = `Problem Description provided by guest: ${guestData.problem || 'No description provided.'}`;

        const meetLink = await createMeeting(expert.email, guestData.email, summary, desc, startTime, endTime);

        await prisma.booking.update({
          where: { id: booking.id },
          data: { meetLink: meetLink }
        });

        await sendBookingConfirmation(guestData.email, guestData.name, expert.name, meetLink, startTime);
      }
    } catch (automationError) {
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