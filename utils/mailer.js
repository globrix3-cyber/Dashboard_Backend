// utils/mailer.js
const nodemailer = require('nodemailer');
const logger     = require('./logger');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendPasswordResetPin(to, pin) {
  await transporter.sendMail({
    from:    `"Globrixa" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your Globrixa password reset PIN',
    text:    `Your password reset PIN is ${pin}. It expires in 15 minutes. If you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1815;">
        <h2 style="font-family: Georgia, serif; color: #1C1815;">Reset your Globrixa password</h2>
        <p>Use the PIN below to set a new password. It expires in <strong>15 minutes</strong>.</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; background: #FDF8F2; border: 1.5px solid #E8E2D8; border-radius: 10px; padding: 16px 24px; text-align: center; margin: 20px 0;">
          ${pin}
        </div>
        <p style="font-size: 13px; color: #7A7068;">If you didn't request a password reset, you can safely ignore this email — your password won't be changed.</p>
      </div>
    `,
  });
  logger.info('Password reset PIN email sent', { to });
}

module.exports = { sendPasswordResetPin };
