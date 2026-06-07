const { logDeliveryLink } = require('./notifications');

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    console.warn('RESEND_API_KEY is not configured. Falling back to console logging.');
    logDeliveryLink(`[EMAIL FALLBACK] ${subject}`, to, html);
    return { success: false, message: 'API key not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Failed to send email via Resend:', data);
      throw new Error(data?.message || `Resend error (${response.status})`);
    }

    console.log(`Email sent successfully to ${to} via Resend. ID: ${data.id}`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('Error sending email via Resend:', err.message);
    // fallback to console logging
    logDeliveryLink(`[EMAIL FALLBACK] ${subject}`, to, html);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail };
