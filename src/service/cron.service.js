const cron = require('node-cron');
const prisma = require('../prisma');
const { sendEmail } = require('./email.service');
const { processPostMeetingSynopsis } = require('./booking.controller');

/**
 * Initializes background scheduled jobs
 */
const startCronJobs = () => {
  // Run this task every minute ('* * * * *')
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // 1. Send 1-Day & 1-Hour Reminder Emails
      const upcomingBookings = await prisma.booking.findMany({
        where: {
          status: { in: ['ACCEPTED', 'PAID'] },
          startTime: { not: null },
          OR: [
            { reminder1DaySent: false },
            { reminder1HourSent: false }
          ]
        },
        include: {
          user: true,
          expert: true,
        }
      });

      const noticeHtml = `<p style="margin-top: 12px; font-size: 12px; color: #4b5563; font-style: italic;">* Please note: The meeting synopsis will be used by ConsultNow for further evaluation metrics.</p>`;

      for (const booking of upcomingBookings) {
        const timeDiffMs = new Date(booking.startTime).getTime() - now.getTime();
        const hoursLeft = timeDiffMs / (1000 * 60 * 60);
        const userEmail = booking.user?.email || booking.guestEmail;

        if (userEmail) {
          // 1-Day Reminder (Triggers when there are 24 hours or less remaining, up to 23.5 hours)
          if (hoursLeft <= 24 && hoursLeft > 23.5 && !booking.reminder1DaySent) {
            await sendEmail(
              userEmail,
              'Reminder: Your Consultation is in 1 Day',
              `<p>Hi ${booking.user?.name || booking.guestName || 'there'},</p><p>Your consultation with <strong>${booking.expert?.name || 'the Expert'}</strong> is scheduled for tomorrow.</p><p><strong>Google Meet Link:</strong> <a href="${booking.meetLink}">${booking.meetLink}</a></p>${noticeHtml}`
            );
            
            await prisma.booking.update({
              where: { id: booking.id },
              data: { reminder1DaySent: true }
            });
            console.log(`[CRON] Sent 1-day reminder for booking ID: ${booking.id}`);
          }

          // 1-Hour Reminder (Triggers when there is 1 hour or less remaining, up to 0.5 hours)
          if (hoursLeft <= 1 && hoursLeft > 0.5 && !booking.reminder1HourSent) {
            await sendEmail(
              userEmail,
              'Reminder: Your Consultation is starting in 1 Hour!',
              `<p>Hi ${booking.user?.name || booking.guestName || 'there'},</p><p>Get ready! Your consultation with <strong>${booking.expert?.name || 'the Expert'}</strong> is starting in just 1 hour.</p><p><strong>Google Meet Link:</strong> <a href="${booking.meetLink}">${booking.meetLink}</a></p>${noticeHtml}`
            );
            
            await prisma.booking.update({
              where: { id: booking.id },
              data: { reminder1HourSent: true }
            });
            console.log(`[CRON] Sent 1-hour reminder for booking ID: ${booking.id}`);
          }
        }
      }

      // 2. Post-Meeting Automation: Auto-generate Synopsis & Email Expert (BCC: no-reply@consultnow.in)
      const endedBookings = await prisma.booking.findMany({
        where: {
          status: { in: ['ACCEPTED', 'PAID'] },
          endTime: { lt: now },
          synopsisSent: false
        }
      });

      for (const endedBooking of endedBookings) {
        try {
          console.log(`[CRON] Generating post-meeting synopsis for concluded booking: ${endedBooking.id}`);
          await processPostMeetingSynopsis(endedBooking.id);
        } catch (synopsisErr) {
          console.error(`[CRON] Failed to generate post-meeting synopsis for booking ${endedBooking.id}:`, synopsisErr);
        }
      }

    } catch (error) {
      console.error('Error running booking reminder & synopsis cron job:', error);
    }
  });
};

module.exports = {
  startCronJobs
};