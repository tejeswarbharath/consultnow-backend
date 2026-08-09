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
          
          <div style="margin-top: 15px; padding: 12px; background-color: #eff6ff; border-radius: 6px; border-left: 4px solid #2563eb;">
            <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.5;"><strong>Notice:</strong> Please be informed that the meeting synopsis will be used by ConsultNow for further evaluation metrics.</p>
          </div>
          
          <p style="margin-top: 20px;">Please keep this link safe and join the meeting 5 minutes early.</p>
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

const sendEmail = async (to, subject, html, options = {}) => {
  const mailOptions = {
    from: `"ConsultNow" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  };

  if (options.bcc) {
    mailOptions.bcc = options.bcc;
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[ConsultNow Email] Email sent to:', to, 'Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error('[ConsultNow Email] Error sending email:', error);
    throw new Error('Failed to send email.');
  }
};

/**
 * Sends meeting synopsis email to expert consultant with BCC to no-reply@consultnow.in after call
 */
const sendMeetingSynopsisEmail = async (expertEmail, expertName, guestName, bookingType, synopsisContent, meetLink) => {
  const mailOptions = {
    from: `"ConsultNow Insights" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to: expertEmail,
    bcc: 'no-reply@consultnow.in',
    subject: `Meeting Synopsis & Evaluation Metrics: Consultation with ${guestName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #1e3a8a; padding: 20px; text-align: center; color: white;">
          <h2 style="margin:0; font-size: 22px;">ConsultNow Post-Meeting Synopsis</h2>
          <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Expert Consultant Briefing & Evaluation Metrics</p>
        </div>
        <div style="padding: 24px; color: #374151;">
          <p>Hello <strong>${expertName}</strong>,</p>
          <p>Thank you for completing your <strong>${bookingType || 'Consultation'}</strong> session with <strong>${guestName}</strong>.</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b;"><strong>Meeting Reference:</strong></p>
            <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #0f172a;">Participant: ${guestName} | Type: ${bookingType || 'Consultation'}</p>
            ${meetLink ? `<p style="margin: 0; font-size: 13px;"><strong style="color: #64748b;">Google Meet Link:</strong> <a href="${meetLink}" style="color: #2563eb;">${meetLink}</a></p>` : ''}
          </div>

          <div style="margin: 24px 0;">
            <h3 style="color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; margin-bottom: 12px;">Meeting Synopsis & Summary</h3>
            <div style="line-height: 1.6; color: #334155; font-size: 14px;">
              ${synopsisContent}
            </div>
          </div>

          <div style="margin-top: 24px; padding: 14px; background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
              <strong>ConsultNow Quality Notice:</strong> This meeting synopsis has been automatically captured and processed. ConsultNow utilizes this synopsis for expert performance evaluation metrics, platform quality assurance, and continuous service enhancement.
            </p>
          </div>

          <p style="margin-top: 24px; font-size: 13px; color: #94a3b8; text-align: center;">
            © ConsultNow Platform Services • Automating Professional Expertise
          </p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[ConsultNow Email] Synopsis email sent to expert:', expertEmail, '(BCC: no-reply@consultnow.in). Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error('[ConsultNow Email] Error sending meeting synopsis email:', error);
    throw new Error('Failed to send meeting synopsis email.');
  }
};

module.exports = {
  sendEmail,
  sendBookingConfirmation,
  sendMeetingSynopsisEmail,
  verifySmtpConnection
};