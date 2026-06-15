const { google } = require('googleapis');

// Configure the Google OAuth2 client
// In production, these should securely come from your Google Cloud Console
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Provide a system-level refresh token or dynamically fetch it based on your setup
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

/**
 * Schedules a Google Meet session 24 hours from now for a 1-hour slot.
 * @param {string} userEmail - User's email
 * @param {string} expertEmail - Expert's email
 * @param {string} serviceDetails - Title/Description of the service
 */
const scheduleGoogleMeet = async (userEmail, expertEmail, serviceDetails) => {
  try {
    // Calculate start time: 24 hours from now
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 1);

    // Calculate end time: 1 hour after start
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

    const event = {
      summary: `ConsultNow: ${serviceDetails}`,
      description: 'Automatically scheduled consultation following successful payment checkout.',
      start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
      end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
      attendees: [{ email: userEmail }, { email: expertEmail }],
      conferenceData: {
        createRequest: {
          requestId: `consultnow-meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    // Insert the event into the primary calendar & notify attendees
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all', // Send email invitations to attendees via Google
    });

    console.log(`Google Meet scheduled: ${response.data.hangoutLink}`);
    return response.data;
  } catch (error) {
    console.error('Error creating Google Calendar event:', error);
    throw new Error('Failed to schedule calendar event');
  }
};

module.exports = {
  scheduleGoogleMeet
};