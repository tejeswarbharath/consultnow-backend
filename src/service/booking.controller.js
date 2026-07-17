const { sendEmail } = require('../service/email.service');
const { createMeeting, getAvailability } = require('../service/calendar.service');
const prisma = require('../prisma');

const formatDateTime = (date) => {
  if (!date) return 'Not Specified';
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'short'
  });
};

const requestFreeService = async (req, res) => {
  try {
    const { expertId, serviceDetails, startTime, endTime, guestData } = req.body;
    
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'A time slot must be selected for the booking.' });
    }

    // Assuming you have auth middleware that attaches the logged-in user to req.user
    const userId = req.user?.id || null; 

    // 1. Fetch Expert to get their email
    const expert = await prisma.expert.findUnique({ where: { id: expertId } });
    if (!expert) return res.status(404).json({ error: 'Expert not found' });

    // 2. Create the Booking record
    const booking = await prisma.booking.create({
      data: {
        expertId,
        userId,
        status: 'PENDING',
        type: 'FREE_1_HOUR',
        details: serviceDetails || 'Requesting 1 hour of free expert service',
        startTime,
        endTime,
        guestName: guestData?.name,
        guestEmail: guestData?.email
      }
    });

    // 3. Construct functional Accept/Reject links
    const backendUrl = process.env.BACKEND_URL || 'https://api.consultnow.in';
    const acceptLink = `${backendUrl}/api/bookings/accept/${booking.id}`;
    const rejectLink = `${backendUrl}/api/bookings/reject/${booking.id}`;

    // 4. Send Email to the Expert
    const subject = 'New Request: Free 1-Hour Consultation';
    const formattedTime = formatDateTime(startTime);
    const html = `
      <h2>New Consultation Request</h2>
      <p>You have received a new request for a Free 1-Hour Service.</p>
      <p><strong>Proposed Date & Time:</strong> ${formattedTime} (IST)</p>
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
      include: { user: true, expert: true }
    });

    // Create a Google Meet link
    const meetingLink = await createMeeting(
      booking.expert.email,
      booking.user?.email || booking.guestEmail,
      'Consultation Session',
      booking.details,
      booking.startTime,
      booking.endTime
    );

    // Determine the user's email (registered or guest)
    const userEmail = booking.user?.email || booking.guestEmail;

    const now = new Date();
    const isLate = booking.startTime && now > new Date(booking.startTime);
    const formattedTime = formatDateTime(booking.startTime);

    // Send confirmation email to the user/guest
    if (userEmail) {
      let userSubject, userHtml;
      if (isLate) {
        userSubject = 'Booking Approved (Reschedule Recommended)';
        userHtml = `
          <h2>Booking Approved (Reschedule Recommended)</h2>
          <p>Your 1-hour consultation request with <strong>${booking.expert.name}</strong> was approved.</p>
          <p><strong>⚠️ Warning:</strong> This approval was received after your proposed slot (<strong>${formattedTime}</strong>) had already passed.</p>
          <p>You can still join the Google Meet link here to see if the expert is available: <a href="${meetingLink}">${meetingLink}</a>, or we recommend booking a new session on the platform.</p>
        `;
      } else {
        userSubject = 'Your Consultation is Confirmed!';
        userHtml = `
          <h2>Booking Confirmed</h2>
          <p>Your 1-hour consultation with <strong>${booking.expert.name}</strong> has been confirmed.</p>
          <p><strong>Scheduled Time:</strong> ${formattedTime} (IST)</p>
          <p>Join the meeting here: <a href="${meetingLink}">${meetingLink}</a></p>
        `;
      }
      await sendEmail(userEmail, userSubject, userHtml);
    }

    // Send notification email to the expert
    const expertSubject = isLate ? 'Consultation Accepted (After Proposed Slot)' : 'You Have Accepted a Consultation';
    const expertHtml = `
      <h2>Consultation Accepted</h2>
      <p>You have confirmed the 1-hour consultation with <strong>${booking.user?.name || booking.guestName || 'a guest user'}</strong>.</p>
      ${isLate ? `<p><strong>⚠️ Note:</strong> You accepted this request after the proposed slot time (<strong>${formattedTime}</strong>) had already passed.</p>` : `<p><strong>Scheduled Time:</strong> ${formattedTime} (IST)</p>`}
      <p>Join the meeting here: <a href="${meetingLink}">${meetingLink}</a></p>
    `;
    await sendEmail(booking.expert.email, expertSubject, expertHtml);

    // Redirect the expert to a frontend success/dashboard page
    const frontendUrl = process.env.FRONTEND_URL || 'https://consultnow.in';
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

    // Determine the user's email (registered or guest)
    const userEmail = booking.user?.email || booking.guestEmail;

    const now = new Date();
    const isLate = booking.startTime && now > new Date(booking.startTime);
    const formattedTime = formatDateTime(booking.startTime);

    // Send rejection email back to the User/Guest
    if (userEmail) {
      const subject = 'Update: Consultation Request';
      let html;
      if (isLate) {
        html = `
          <h2>Update: Consultation Request</h2>
          <p>The expert, <strong>${booking.expert.name}</strong>, has rejected your request for a free 1-hour consultation.</p>
          <p><strong>Note:</strong> This response was received after the proposed slot time (<strong>${formattedTime}</strong>) had already passed.</p>
          <p>Please feel free to book another session with a different expert or select another time slot.</p>
        `;
      } else {
        html = `
          <h2>Update: Consultation Request</h2>
          <p>We're sorry, but the expert, <strong>${booking.expert.name}</strong>, has rejected your request for a free 1-hour consultation.</p>
          <p>Please feel free to book another session with a different expert.</p>
        `;
      }
      await sendEmail(userEmail, subject, html);
    }

    // Redirect the expert to a frontend confirmation page
    const frontendUrl = process.env.FRONTEND_URL || 'https://consultnow.in';
    res.redirect(`${frontendUrl}/dashboard?status=rejected&bookingId=${id}`);
  } catch (error) {
    console.error('Error rejecting booking:', error);
    res.status(500).send('Failed to reject booking.');
  }
};

const getExpertAvailability = async (req, res) => {
  try {
    const { expertId } = req.params;
    const availableSlots = await getAvailability(expertId);
    res.json(availableSlots);
  } catch (error) {
    console.error('Error getting expert availability:', error);
    res.status(500).json({ error: 'Failed to get expert availability' });
  }
};

module.exports = {
  requestFreeService,
  acceptBooking,
  rejectBooking,
  getExpertAvailability
};