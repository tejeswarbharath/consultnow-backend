const nodemailer = require('nodemailer');

// Configure the SMTP transport using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // This must be your Gmail App Password
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,   // 10 seconds
  socketTimeout: 10000      // 10 seconds
});

/**
 * Sends a booking confirmation email to the guest audience
 */
const sendBookingConfirmation = async (guestEmail, guestName, expertName, meetLink, startTime) => {
  const formattedTime = startTime ? new Date(startTime).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'short'
  }) : 'Not Specified';

  const mailOptions = {
    from: `"ConsultNow Secure Booking" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to: guestEmail,
    subject: `Booking Confirmed: Consultation with ${expertName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #2563eb; padding: 20px; text-align: center; color: white;">
          <h2>Booking Confirmed!</h2>
        </div>
        <div style="padding: 20px; color: #333;">
          <p>Hello <strong>${guestName}</strong>,</p>
          <p>Your payment was successfully verified. Your 1-hour consultation session with <strong>${expertName}</strong> has been booked.</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #f3f4f6; border-left: 4px solid #2563eb;">
            <p style="margin: 0 0 5px 0;"><strong>Scheduled Time:</strong></p>
            <p style="margin: 0 0 15px 0; font-size: 14px; font-weight: bold; color: #374151;">${formattedTime} (IST)</p>

            <p style="margin: 0 0 5px 0;"><strong>Secure Google Meet Link:</strong></p>
            <a href="${meetLink}" style="color: #2563eb; font-weight: bold; word-break: break-all;">${meetLink}</a>
          </div>
          
          <p>Please keep this link safe and join the meeting 5 minutes early.</p>
          <p>Thank you for using ConsultNow.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[ConsultNow Email] Confirmation sent to:', guestEmail, 'Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error('[ConsultNow Email] Error sending confirmation:', error);
    throw new Error('Failed to send confirmation email.');
  }
};

const verifySmtpConnection = async () => {
  try {
    await transporter.verify();
    console.log('[ConsultNow Email] SMTP Connection has been verified');
    return true;
  } catch (error) {
    console.error('[ConsultNow Email] SMTP Connection verification failed:', error);
    return false;
  }
};

const sendEmail = async (to, subject, html) => {
  const mailOptions = {
    from: `"ConsultNow" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[ConsultNow Email] Email sent to:', to, 'Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error('[ConsultNow Email] Error sending email:', error);
    throw new Error('Failed to send email.');
  }
};

module.exports = {
  sendEmail,
  sendBookingConfirmation,
  verifySmtpConnection
};