const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { scheduleGoogleMeet } = require('../src/service/calendar.service');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Construct the event using the raw body buffer and the signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the specific events we care about
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const { expertId, serviceId, userId } = session.metadata || {};
      
      console.log(`Payment successful for Session ID: ${session.id}`);
      
      try {
        // Fetch User and Expert emails from the database
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const expert = await prisma.expert.findUnique({ where: { id: expertId } });

        if (user?.email && expert?.email) {
          // Automatically generate Meet link & Calendar Invite for "Tomorrow"
          await scheduleGoogleMeet(user.email, expert.email, 'Paid Professional Expert Service');
          // TODO: Safely update the user's booking status to 'PAID' here
        }
      } catch (dbError) {
        console.error('Error in post-payment automation:', dbError);
      }
      break;
      
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      const failedSession = event.data.object;
      console.log(`Payment failed/expired for Session ID: ${failedSession.id}`);
      // TODO: Safely update the user's booking status to 'FAILED' or 'CANCELLED'
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Acknowledge receipt of the event
  res.status(200).send();
};

module.exports = {
  handleStripeWebhook
};