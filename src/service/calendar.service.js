const { google } = require('googleapis');

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
  const createMeeting = async (expertEmail, guestEmail, summary, description) => {
    try {
      // For this implementation, we will schedule the meeting 24 hours from the current time.
      // In a future update, you could map this to a specific time slot selected by the user on the frontend.
      const startTime = new Date();
      startTime.setHours(startTime.getHours() + 24); 
      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + 1); // 1 Hour duration

      // Generate a unique ID for the Google Meet creation request
      const requestId = "consultnow_" + Math.random().toString(36).substring(2, 15);

      const event = {
        summary: summary,
        description: description,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Kolkata', 
        },
        end: {
          dateTime: endTime.toISOString(),
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
      });

      console.log('[ConsultNow Calendar] Event created successfully! Meet Link:', response.data.hangoutLink);
      return response.data.hangoutLink;

    } catch (error) {
      console.error('[ConsultNow Calendar] Error creating Google Calendar meeting:', error);
      throw new Error('Failed to generate Google Meet link.');
    }
  };

  module.exports = { 
    createMeeting 
  };
}