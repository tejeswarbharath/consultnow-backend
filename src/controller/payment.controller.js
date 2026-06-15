const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const createCheckoutSession = async (req, res) => {
  try {
    // Extract necessary details from the request
    const { serviceId, expertId } = req.body;
    
    // TODO: In a real-world scenario, fetch the exact expert rate from your PostgreSQL database using Prisma
    // For now, we are calculating a base amount (e.g., $50.00 represented in cents)
    const amount = 5000; 
    const currency = 'usd'; // Can also dynamically support 'inr' based on user location/preference

    // Generate the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Paid Professional Expert Service',
              description: `Consultation Booking for Expert ID: ${expertId}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/payment/failure`,
      metadata: {
        expertId,
        serviceId,
        userId: req.user?.id || 'guest', // Using auth context if available
      }
    });

    // Return the session URL to the frontend
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

module.exports = {
  createCheckoutSession
};