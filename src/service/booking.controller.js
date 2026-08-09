const { sendEmail, sendMeetingSynopsisEmail } = require('../service/email.service');
const { createMeeting, getAvailability } = require('../service/calendar.service');
const { generateMeetingSynopsis } = require('../service/ai.service');
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

    try {
      await sendEmail(expert.email, subject, html);
    } catch (emailError) {
      console.error('[ConsultNow Email] Failed to send free consultation request email to expert:', emailError);
    }

    // 5. Send acknowledgement email to the User/Guest with synopsis evaluation notice
    if (guestData?.email) {
      const userSubject = `Consultation Requested: ${expert.name}`;
      const userHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 20px; text-align: center; color: white;">
            <h2>Consultation Request Submitted</h2>
          </div>
          <div style="padding: 20px; color: #333;">
            <p>Hello <strong>${guestData.name || 'there'}</strong>,</p>
            <p>Your request for a Free 1-Hour Consultation session with <strong>${expert.name}</strong> has been submitted.</p>
            <p><strong>Proposed Date & Time:</strong> ${formattedTime} (IST)</p>
            <p>The expert will review your request and confirm your Google Meet session soon.</p>
            
            <div style="margin-top: 15px; padding: 12px; background-color: #eff6ff; border-radius: 6px; border-left: 4px solid #2563eb;">
              <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.5;"><strong>Notice:</strong> Please be informed that the meeting synopsis will be used by ConsultNow for further evaluation metrics.</p>
            </div>
          </div>
        </div>
      `;
      try {
        await sendEmail(guestData.email, userSubject, userHtml);
      } catch (userEmailError) {
        console.error('[ConsultNow Email] Failed to send request confirmation email to guest:', userEmailError);
      }
    }

    res.status(200).json({ message: 'Free service requested successfully. Notification sent to expert.' });
  } catch (error) {
    console.error('Error requesting free service:', error);
    res.status(500).json({ error: 'Failed to request free service' });
  }
};

const cleanupExpiredPendingBookings = async () => {
  try {
    const now = new Date();
    await prisma.booking.updateMany({
      where: {
        status: 'PENDING',
        startTime: { lt: now }
      },
      data: {
        status: 'EXPIRED'
      }
    });
  } catch (err) {
    console.error('Error cleaning up expired pending bookings:', err);
  }
};

const acceptBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const frontendUrl = process.env.FRONTEND_URL || 'https://consultnow.in';

    // 1. Fetch existing booking details first for idempotency & status verification
    const existingBooking = await prisma.booking.findUnique({
      where: { id },
      include: { user: true, expert: true }
    });

    if (!existingBooking) {
      return res.status(404).send('Booking not found.');
    }

    // Idempotency check: If already processed, redirect without re-executing actions
    if (existingBooking.status === 'ACCEPTED') {
      return res.redirect(`${frontendUrl}/dashboard?status=already_accepted&bookingId=${id}`);
    }
    if (existingBooking.status === 'REJECTED') {
      return res.redirect(`${frontendUrl}/dashboard?status=already_rejected&bookingId=${id}`);
    }
    if (existingBooking.status === 'EXPIRED') {
      return res.redirect(`${frontendUrl}/dashboard?status=expired&bookingId=${id}`);
    }

    const now = new Date();
    const isLate = existingBooking.startTime && now > new Date(existingBooking.startTime);

    // Create a Google Meet link
    const meetingLink = await createMeeting(
      existingBooking.expert.email,
      existingBooking.user?.email || existingBooking.guestEmail,
      'Consultation Session',
      existingBooking.details,
      existingBooking.startTime,
      existingBooking.endTime
    );

    // Update booking status to 'ACCEPTED' and save meetLink
    const booking = await prisma.booking.update({
      where: { id },
      data: { 
        status: 'ACCEPTED',
        meetLink: meetingLink
      },
      include: { user: true, expert: true }
    });

    // Determine the user's email (registered or guest)
    const userEmail = booking.user?.email || booking.guestEmail;
    const formattedTime = formatDateTime(booking.startTime);

    const synopsisNoticeHtml = `
      <div style="margin-top: 15px; padding: 12px; background-color: #eff6ff; border-radius: 6px; border-left: 4px solid #2563eb;">
        <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.5;"><strong>Notice:</strong> Please be informed that the meeting synopsis will be used by ConsultNow for further evaluation metrics.</p>
      </div>
    `;

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
          ${synopsisNoticeHtml}
        `;
      } else {
        userSubject = 'Your Consultation is Confirmed!';
        userHtml = `
          <h2>Booking Confirmed</h2>
          <p>Your 1-hour consultation with <strong>${booking.expert.name}</strong> has been confirmed.</p>
          <p><strong>Scheduled Time:</strong> ${formattedTime} (IST)</p>
          <p>Join the meeting here: <a href="${meetingLink}">${meetingLink}</a></p>
          ${synopsisNoticeHtml}
        `;
      }
      try {
        await sendEmail(userEmail, userSubject, userHtml);
      } catch (emailError) {
        console.error('[ConsultNow Email] Failed to send confirmation email to user:', emailError);
      }
    }

    // Send notification email to the expert
    const expertSubject = isLate ? 'Consultation Accepted (After Proposed Slot)' : 'You Have Accepted a Consultation';
    const expertHtml = `
      <h2>Consultation Accepted</h2>
      <p>You have confirmed the 1-hour consultation with <strong>${booking.user?.name || booking.guestName || 'a guest user'}</strong>.</p>
      ${isLate ? `<p><strong>⚠️ Note:</strong> You accepted this request after the proposed slot time (<strong>${formattedTime}</strong>) had already passed.</p>` : `<p><strong>Scheduled Time:</strong> ${formattedTime} (IST)</p>`}
      <p>Join the meeting here: <a href="${meetingLink}">${meetingLink}</a></p>
    `;
    try {
      await sendEmail(booking.expert.email, expertSubject, expertHtml);
    } catch (emailError) {
      console.error('[ConsultNow Email] Failed to send confirmation email to expert:', emailError);
    }

    // Redirect the expert to a frontend success/dashboard page
    res.redirect(`${frontendUrl}/dashboard?status=accepted&bookingId=${id}`);
  } catch (error) {
    console.error('Error accepting booking:', error);
    res.status(500).send('Failed to accept booking. The link may have expired or is invalid.');
  }
};

const rejectBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const frontendUrl = process.env.FRONTEND_URL || 'https://consultnow.in';

    // 1. Fetch existing booking details first for idempotency
    const existingBooking = await prisma.booking.findUnique({
      where: { id },
      include: { user: true, expert: true }
    });

    if (!existingBooking) {
      return res.status(404).send('Booking not found.');
    }

    // Idempotency check: If already processed, redirect without re-executing actions
    if (existingBooking.status === 'ACCEPTED') {
      return res.redirect(`${frontendUrl}/dashboard?status=already_accepted&bookingId=${id}`);
    }
    if (existingBooking.status === 'REJECTED') {
      return res.redirect(`${frontendUrl}/dashboard?status=already_rejected&bookingId=${id}`);
    }
    if (existingBooking.status === 'EXPIRED') {
      return res.redirect(`${frontendUrl}/dashboard?status=expired&bookingId=${id}`);
    }

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
      try {
        await sendEmail(userEmail, subject, html);
      } catch (emailError) {
        console.error('[ConsultNow Email] Failed to send rejection email to user:', emailError);
      }
    }

    // Redirect the expert to a frontend confirmation page
    res.redirect(`${frontendUrl}/dashboard?status=rejected&bookingId=${id}`);
  } catch (error) {
    console.error('Error rejecting booking:', error);
    res.status(500).send('Failed to reject booking.');
  }
};

const getExpertAvailability = async (req, res) => {
  try {
    const { expertId } = req.params;
    await cleanupExpiredPendingBookings();
    const availableSlots = await getAvailability(expertId);
    res.json(availableSlots);
  } catch (error) {
    console.error('Error getting expert availability:', error);
    res.status(500).json({ error: 'Failed to get expert availability' });
  }
};

/**
 * Core processor for generating meeting synopsis and sending post-call email with BCC to no-reply@consultnow.in
 */
const processPostMeetingSynopsis = async (bookingId, transcriptOrNotes = '') => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { expert: true, user: true }
  });

  if (!booking) {
    throw new Error(`Booking ${bookingId} not found`);
  }

  if (booking.synopsisSent) {
    console.log(`[Synopsis] Post-meeting synopsis email already sent for booking: ${bookingId}`);
    return booking;
  }

  const guestName = booking.user?.name || booking.guestName || 'Client Guest';
  const expertName = booking.expert.name;
  const bookingType = booking.type === 'FREE_1_HOUR' ? 'Free 1-Hour Consultation' : 'Paid 1-Hour Consultation';

  // 1. Generate AI Meeting Synopsis & Evaluation Metrics
  const synopsisContent = await generateMeetingSynopsis({
    guestName,
    expertName,
    bookingType,
    details: booking.details,
    startTime: booking.startTime
  }, transcriptOrNotes);

  // 2. Save synopsis & mark synopsisSent in Database
  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      synopsis: synopsisContent,
      synopsisSent: true,
      status: 'COMPLETED'
    }
  });

  // 3. Dispatch automated post-meeting email to expert with BCC to no-reply@consultnow.in
  try {
    await sendMeetingSynopsisEmail(
      booking.expert.email,
      expertName,
      guestName,
      bookingType,
      synopsisContent,
      booking.meetLink
    );
  } catch (emailErr) {
    console.error(`[Synopsis] Failed to dispatch email for booking ${bookingId}:`, emailErr.message);
  }

  return updatedBooking;
};

/**
 * Controller endpoint to manually or programmatically generate synopsis post-call
 */
const generateBookingSynopsis = async (req, res) => {
  try {
    const { id } = req.params;
    const { transcript } = req.body || {};

    const result = await processPostMeetingSynopsis(id, transcript || '');
    res.status(200).json({
      message: 'Meeting synopsis generated and post-call email sent to expert (BCC no-reply@consultnow.in).',
      synopsis: result.synopsis
    });
  } catch (error) {
    console.error('Error generating booking synopsis:', error);
    res.status(500).json({ error: error.message || 'Failed to generate meeting synopsis' });
  }
};

/**
 * Controller endpoint to retrieve meeting synopsis for a booking
 */
const getBookingSynopsis = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        type: true,
        meetLink: true,
        synopsis: true,
        synopsisSent: true,
        updatedAt: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error getting booking synopsis:', error);
    res.status(500).json({ error: 'Failed to retrieve booking synopsis' });
  }
};

module.exports = {
  requestFreeService,
  acceptBooking,
  rejectBooking,
  getExpertAvailability,
  processPostMeetingSynopsis,
  generateBookingSynopsis,
  getBookingSynopsis
};