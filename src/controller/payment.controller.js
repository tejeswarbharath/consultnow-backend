const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const createOrder = async (req, res) => {
  try {
    const { expertId, currency = 'INR', userId } = req.body;

    if (!expertId) {
      return res.status(400).json({ error: 'Expert ID is required' });
    }

    const expert = await prisma.expert.findUnique({
      where: { id: expertId }
    });

    if (!expert) {
      return res.status(404).json({ error: 'Expert not found' });
    }

    // Convert Decimal to Number, then to subunit
    const pricePerHour = Number(expert.pricePerHour);
    const amount = Math.round(pricePerHour * 100);

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount,
      currency,
      receipt: `receipt_order_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);

    if (!order) {
      return res.status(500).json({ error: 'Failed to create Razorpay order' });
    }

    // Create a transaction record in DB
    await prisma.transaction.create({
      data: {
        orderId: order.id,
        amount: amount,
        currency: currency,
        status: 'CREATED',
        expertId: expertId,
        userId: userId || null,
      }
    });

    res.status(200).json(order);
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;

    // Generate expected signature
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expectedSignature = shasum.digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Payment is successful
      await prisma.transaction.update({
        where: { orderId: razorpay_order_id },
        data: {
          status: 'PAID',
          paymentId: razorpay_payment_id,
          signature: razorpay_signature
        }
      });
      return res.status(200).json({ success: true, message: 'Payment verified successfully' });
    } else {
      // Payment verification failed
      await prisma.transaction.update({
        where: { orderId: razorpay_order_id },
        data: {
          status: 'FAILED'
        }
      });
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createOrder,
  verifyPayment
};
