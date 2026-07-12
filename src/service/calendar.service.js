const { google } = require('googleapis');
const prisma = require('../prisma');

// --- Pre-boot validation for Google Calendar Integration ---
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
  console.warn(`[ConsultNow] Google Calendar API credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) are not fully configured in the environment. The 'createMeeting' service will be disabled.`);
  
  // To prevent the app from crashing, we'll export a mock function
  // that just logs the attempt and does nothing.
  module.exports = {
    createMeeting: async () => {
      console.error("[ConsultNow Calendar] SKIPPED: 'createMeeting' was called, but the service is disabled due to missing credentials.");
      // Return a dummy link or null to ensure consuming services don't crash
      return "https://meet.google.com/mock-link-credentials-missing"; 
    },
    getAvailability: async () => {
      console.error("[ConsultNow Calendar] SKIPPED: 'getAvailability' was called, but the service is disabled due to missing credentials.");
      return [];
    }
  };

} else {
  // --- Standard Google API Initialization ---

  // Initialize OAuth2 Client using your environment variables
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Set the refresh token so the API never logs you out
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  // Initialize the Calendar API
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  /**
   * Creates a calendar event with an auto-generated Google Meet link
   */
  const createMeeting = async (expertEmail, guestEmail, summary, description, startTime, endTime) => {
    try {
      // If startTime or endTime are not provided, default to 24 hours from now.
      if (!startTime || !endTime) {
        startTime = new Date();
        startTime.setHours(startTime.getHours() + 24); 
        endTime = new Date(startTime);
        endTime.setHours(startTime.getHours() + 1); // 1 Hour duration
      }

      // Generate a unique ID for the Google Meet creation request
      const requestId = "consultnow_" + Math.random().toString(36).substring(2, 15);

      const event = {
        summary: summary,
        description: description,
        start: {
          dateTime: new Date(startTime).toISOString(),
          timeZone: 'Asia/Kolkata', 
        },
        end: {
          dateTime: new Date(endTime).toISOString(),
          timeZone: 'Asia/Kolkata',
        },
        attendees: [
          { email: expertEmail },
          { email: guestEmail }
        ],
        conferenceData: {
          createRequest: {
            requestId: requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      };

      // Push the event to Google Calendar
      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1, // MUST be 1 to generate the Meet link
        sendUpdates: 'all',
      });

      console.log('[ConsultNow Calendar] Event created successfully! Meet Link:', response.data.hangoutLink);
      return response.data.hangoutLink;

    } catch (error) {
      console.error('[ConsultNow Calendar] Error creating Google Calendar meeting:', error);
      throw new Error('Failed to generate Google Meet link.');
    }
  };

  const getAvailability = async (expertId) => {
    const expert = await prisma.expert.findUnique({ where: { id: expertId } });
    if (!expert) {
      throw new Error('Expert not found');
    }

    const workingHours = {
      start: 9, // 9 AM
      end: 17, // 5 PM
    };

    const now = new Date();
    const endDate = new Date();
    endDate.setDate(now.getDate() + 7);

    const bookings = await prisma.booking.findMany({
      where: {
        expertId: expertId,
        startTime: {
          gte: now,
          lt: endDate,
        },
      },
    });

    const availableSlots = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date();
      day.setDate(now.getDate() + i);
      for (let hour = workingHours.start; hour < workingHours.end; hour++) {
        const slot = new Date(day);
        slot.setHours(hour, 0, 0, 0);

        const isBooked = bookings.some(booking => {
          const bookingStart = new Date(booking.startTime);
          return bookingStart.getTime() === slot.getTime();
        });

        if (!isBooked && slot > now) {
          availableSlots.push(slot);
        }
      }
    }

    return availableSlots;
  };

  module.exports = { 
    createMeeting,
    getAvailability
  };
}