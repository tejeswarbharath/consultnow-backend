const { sendEmail } = require('../service/email.service');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const requestFreeService = async (req, res) => {
  try {
    const { expertId, serviceDetails } = req.body;
    // Assuming you have auth middleware that attaches the logged-in user to req.user
    const userId = req.user?.id || 'guest-user-id'; 

    // 1. Fetch Expert to get their email
    const expert = await prisma.expert.findUnique({ where: { id: expertId } });
    if (!expert) return res.status(404).json({ error: 'Expert not found' });

    // 2. Create the Booking record (Assumes a Booking model in Prisma)
    const booking = await prisma.booking.create({
      data: {
        expertId,
        userId,
        status: 'PENDING',
        type: 'FREE_1_HOUR',
        details: serviceDetails || 'Requesting 1 hour of free expert service'
      }
    });

    // 3. Construct functional Accept/Reject links (must be accessible from email client)
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const acceptLink = `${backendUrl}/api/bookings/accept/${booking.id}`;
    const rejectLink = `${backendUrl}/api/bookings/reject/${booking.id}`;

    // 4. Send Email to the Expert
    const subject = 'New Request: Free 1-Hour Consultation';
    const html = `
      <h2>New Consultation Request</h2>
      <p>You have received a new request for a Free 1-Hour Service.</p>
      <p><strong>Details:</strong> ${booking.details}</p>
      <br/>
      <a href="${acceptLink}" style="padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Accept</a>
      &nbsp;&nbsp;&nbsp;
      <a href="${rejectLink}" style="padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Reject</a>
    `;

    await sendEmail(expert.email, subject, html);

    res.status(200).json({ message: 'Free service requested successfully. Notification sent to expert.' });
  } catch (error) {
    console.error('Error requesting free service:', error);
    res.status(500).json({ error: 'Failed to request free service' });
  }
};

const acceptBooking = async (req, res) => {
  try {
    const { id } = req.params;
    // Update booking status to 'ACCEPTED'
    const booking = await prisma.booking.update({
      where: { id },
      data: { status: 'ACCEPTED' },
      include: { expert: true }
    });
    
    // Redirect the expert to a frontend success/dashboard page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    res.redirect(`${frontendUrl}/dashboard?status=accepted&bookingId=${id}`);
  } catch (error) {
    console.error('Error accepting booking:', error);
    res.status(500).send('Failed to accept booking. The link may have expired or is invalid.');
  }
};

const rejectBooking = async (req, res) => {
  try {
    const { id } = req.params;
    // Update booking status to 'REJECTED'
    const booking = await prisma.booking.update({
      where: { id },
      data: { status: 'REJECTED' },
      include: { user: true, expert: true }
    });

    // According to Module 3 workflow: Send rejection email back to the User
    if (booking.user?.email) {
      const subject = 'Update: Consultation Request';
      const html = `<p>The Professional Expert has rejected your Request for a free 1-hour service.</p>`;
      await sendEmail(booking.user.email, subject, html);
    }

    // Redirect the expert to a frontend confirmation page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    res.redirect(`${frontendUrl}/dashboard?status=rejected&bookingId=${id}`);
  } catch (error) {
    console.error('Error rejecting booking:', error);
    res.status(500).send('Failed to reject booking.');
  }
};

module.exports = {
  requestFreeService,
  acceptBooking,
  rejectBooking
};