const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sendEmail } = require('./email.service');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Initializes background scheduled jobs
 */
const startCronJobs = () => {
  // Run this task every minute ('* * * * *')
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Note: This assumes your Prisma Booking model has fields for `scheduledAt`, 
      // `meetLink`, and boolean flags `reminder1DaySent`, `reminder1HourSent`.
      // Adjust the queries depending on your exact Prisma schema.
      const upcomingBookings = await prisma.booking.findMany({
        where: {
          status: { in: ['ACCEPTED', 'PAID'] },
          scheduledAt: { not: null },
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

      for (const booking of upcomingBookings) {
        const timeDiffMs = booking.scheduledAt.getTime() - now.getTime();
        const hoursLeft = timeDiffMs / (1000 * 60 * 60);

        // 1-Day Reminder (Triggers when there are 24 hours or less remaining, up to 23.5 hours)
        if (hoursLeft <= 24 && hoursLeft > 23.5 && !booking.reminder1DaySent) {
          await sendEmail(
            booking.user.email,
            'Reminder: Your Consultation is in 1 Day',
            `<p>Hi ${booking.user.name || 'there'},</p><p>Your consultation with the Professional Expert is scheduled for tomorrow.</p><p><strong>Google Meet Link:</strong> <a href="${booking.meetLink}">${booking.meetLink}</a></p>`
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
            booking.user.email,
            'Reminder: Your Consultation is starting in 1 Hour!',
            `<p>Hi ${booking.user.name || 'there'},</p><p>Get ready! Your consultation is starting in just 1 hour.</p><p><strong>Google Meet Link:</strong> <a href="${booking.meetLink}">${booking.meetLink}</a></p>`
          );
          
          await prisma.booking.update({
            where: { id: booking.id },
            data: { reminder1HourSent: true }
          });
          console.log(`[CRON] Sent 1-hour reminder for booking ID: ${booking.id}`);
        }
      }
    } catch (error) {
      console.error('Error running booking reminder cron job:', error);
    }
  });
};

module.exports = {
  startCronJobs
};