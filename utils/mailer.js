const { Resend } = require('resend');
const logger     = require('./logger');

// Resend sends over HTTPS — works on Railway (and any host) unlike SMTP.
// From address uses onboarding@resend.dev until globrixa.com is verified in
// the Resend dashboard; after that change to: 'Globrixa <noreply@globrixa.com>'
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = 'Globrixa <onboarding@resend.dev>';

async function sendPasswordResetPin(to, pin) {
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
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

  if (error) {
    logger.error('Resend email failed', { to, error: error.message, code: error.name });
    const err = new Error('Email delivery failed');
    err.code  = error.name;
    throw err;
  }

  logger.info('Password reset PIN email sent', { to });
}

async function sendEmailVerificationOtp(to, otp) {
  const { error } = await resend.emails.send({
    from:    FROM,
    to:      [to],
    subject: `${otp} is your Globrixa verification code`,
    text:    `Your Globrixa email verification code is ${otp}. It expires in 10 minutes. If you didn't create an account, ignore this email.`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1C1815;">
        <h2 style="font-family: Georgia, serif; color: #1C1815;">Verify your Globrixa account</h2>
        <p>Use the code below to complete your registration. It expires in <strong>10 minutes</strong>.</p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 10px; background: #FDF8F2; border: 1.5px solid #E8E2D8; border-radius: 10px; padding: 16px 24px; text-align: center; margin: 20px 0; color: #C4773A;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #7A7068;">If you didn't create a Globrixa account, you can safely ignore this email — no account will be created.</p>
      </div>
    `,
  });

  if (error) {
    logger.error('Resend verification OTP failed', { to, error: error.message, code: error.name });
    const err = new Error('Email delivery failed');
    err.code  = error.name;
    throw err;
  }

  logger.info('Email verification OTP sent', { to });
}

module.exports = { sendPasswordResetPin, sendEmailVerificationOtp };
