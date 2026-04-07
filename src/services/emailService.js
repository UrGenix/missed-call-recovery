let resend = null;

if (process.env.RESEND_API_KEY) {
  const { Resend } = require('resend');
  resend = new Resend(process.env.RESEND_API_KEY);
}

async function sendBusinessEmail({ to, subject, html }) {
  if (!resend || !process.env.FROM_EMAIL) {
    console.log('Email skipped - missing RESEND_API_KEY or FROM_EMAIL');
    return;
  }

  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to,
    subject,
    html
  });
}

module.exports = { sendBusinessEmail };
