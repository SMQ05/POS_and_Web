// Resend email service

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
// Override via env: EMAIL_FROM='Your Name <you@verified-domain.com>'.
// Default uses Resend's onboarding sender which works on any account without DNS verification.
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'Kynex Pharmacloud <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL ?? 'https://pos.kynexsolutions.com';

interface SendOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(opts: SendOptions): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to', opts.to);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}

// ─── Email Templates ─────────────────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Kynex Pharmacloud</title>
<style>
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; }
  .wrap { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 36px 40px; text-align: center; }
  .header img { height: 40px; }
  .header h1 { color: #ffffff; margin: 12px 0 0; font-size: 22px; font-weight: 700; }
  .body { padding: 40px; color: #1f2937; }
  .body h2 { font-size: 20px; margin: 0 0 16px; color: #111827; }
  .body p { font-size: 15px; line-height: 1.7; margin: 0 0 16px; color: #374151; }
  .btn { display: inline-block; background: #059669; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 8px 0 24px; }
  .info-box { background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
  .info-box p { margin: 4px 0; font-size: 14px; }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  .footer { background: #f9fafb; padding: 24px 40px; text-align: center; font-size: 12px; color: #9ca3af; }
  .footer a { color: #6b7280; text-decoration: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>🏥 Kynex Pharmacloud</h1>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} Kynex Solutions · <a href="https://kynexsolutions.com">kynexsolutions.com</a></p>
    <p>pos.kynexsolutions.com — Pakistan's Pharmacy Management Platform</p>
  </div>
</div>
</body>
</html>`;
}

export function sendWelcomeSetupEmail(opts: {
  to: string;
  name: string;
  pharmacyName: string;
  pharmacySlug: string;
  setupToken: string;
  trialDays: number;
}): Promise<void> {
  const setupLink = `${APP_URL}/setup-password/${opts.setupToken}`;
  const loginUrl = `${APP_URL}/login`;
  return sendEmail({
    to: opts.to,
    subject: `Welcome to Kynex Pharmacloud — Set up your password`,
    html: baseTemplate(`
      <h2>Welcome, ${opts.name}!</h2>
      <p>Thank you for signing up for <strong>Kynex Pharmacloud</strong>. Your pharmacy account is ready and your <strong>${opts.trialDays}-day free trial</strong> has begun.</p>
      <p>To complete your registration, please set your password by clicking the button below:</p>
      <div style="text-align:center; margin: 28px 0;">
        <a href="${setupLink}" class="btn">Set Up My Password</a>
      </div>
      <p style="font-size:13px; color:#6b7280; text-align:center;">This link will expire in 48 hours.</p>
      <hr class="divider" />
      <div class="info-box">
        <p><strong>Pharmacy:</strong> ${opts.pharmacyName}</p>
        <p><strong>Your Login URL:</strong> <a href="${loginUrl}" style="color:#059669;">${loginUrl}</a></p>
        <p><strong>Your Email:</strong> ${opts.to}</p>
        <p><strong>Trial Period:</strong> ${opts.trialDays} days</p>
      </div>
      <p style="font-size:13px;">Once your password is set, bookmark your login URL above — just enter your email and password each time. If you did not sign up, you can safely ignore this email.</p>
    `),
  });
}

const SALES_WHATSAPP = process.env.SALES_WHATSAPP ?? '923189540997';

export function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetToken: string;
}): Promise<void> {
  const resetLink = `${APP_URL}/setup-password/${opts.resetToken}`;
  return sendEmail({
    to: opts.to,
    subject: `Reset your Kynex Pharmacloud password`,
    html: baseTemplate(`
      <h2>Hi ${opts.name},</h2>
      <p>We received a request to reset your password. Click the button below to choose a new one.</p>
      <div style="text-align:center; margin: 28px 0;">
        <a href="${resetLink}" class="btn">Reset My Password</a>
      </div>
      <p style="font-size:13px; color:#6b7280; text-align:center;">This link will expire in 1 hour.</p>
      <hr class="divider" />
      <p style="font-size:13px; color:#6b7280;">If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
    `),
  });
}

export async function sendInvoiceEmail(opts: {
  to: string;
  pharmacyName: string;
  invoiceNumber: string;
  amount: number;            // monthly amount due
  yearlyAmount?: number;     // optional: yearly equivalent for savings comparison
  dueDate: string;
  plan: string;
  period: string;
  notes?: string;
}): Promise<void> {
  const billingUrl = `${APP_URL}/billing`;
  const monthly = opts.amount;
  const yearly = opts.yearlyAmount ?? null;
  const monthlyTimes12 = monthly * 12;
  const yearlySavings = yearly ? monthlyTimes12 - yearly : 0;
  const savingsPercent = yearly && monthlyTimes12 > 0 ? Math.round((yearlySavings / monthlyTimes12) * 100) : 0;
  const whatsappLink = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(`Hi, I have a question about invoice ${opts.invoiceNumber} for ${opts.pharmacyName}.`)}`;

  return sendEmail({
    to: opts.to,
    subject: `Invoice ${opts.invoiceNumber} — Kynex Pharmacloud Subscription`,
    html: baseTemplate(`
      <h2>Invoice ${opts.invoiceNumber}</h2>
      <p>Dear <strong>${opts.pharmacyName}</strong>,</p>
      <p>This is your subscription invoice for the upcoming period. Please review the details below and pay before the due date to keep your account active.</p>

      <div class="info-box">
        <p><strong>Invoice #:</strong> ${opts.invoiceNumber}</p>
        <p><strong>Plan:</strong> ${opts.plan}</p>
        <p><strong>Period:</strong> ${opts.period}</p>
        <p><strong>Amount Due:</strong> PKR ${monthly.toLocaleString()}</p>
        <p><strong>Due Date:</strong> ${opts.dueDate}</p>
      </div>

      ${yearly ? `
      <div style="margin: 24px 0; padding: 18px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px;">
        <p style="margin: 0 0 6px; font-weight: 600; color: #047857;">Pay Yearly &amp; Save ${savingsPercent}%</p>
        <p style="margin: 0; font-size: 14px; color: #065f46;">
          Switch to yearly billing for <strong>PKR ${yearly.toLocaleString()}/year</strong> instead of <strong>PKR ${monthlyTimes12.toLocaleString()}</strong> if paid monthly.
          Save <strong>PKR ${yearlySavings.toLocaleString()}</strong> every year — choose the yearly option in your dashboard.
        </p>
      </div>` : ''}

      <p><strong>How to pay:</strong></p>
      <ol style="margin: 0 0 16px 20px; padding: 0; color: #374151;">
        <li>Log in to your Kynex Pharmacloud dashboard</li>
        <li>Open the <strong>Billing</strong> page from the sidebar</li>
        <li>Choose monthly or yearly and pay via the QR code</li>
      </ol>

      <div style="text-align:center; margin: 28px 0;">
        <a href="${billingUrl}" class="btn">Login &amp; Pay from Dashboard</a>
      </div>

      <p style="text-align:center; font-size:14px; color:#6b7280; margin: 12px 0;">— or —</p>

      <div style="text-align:center; margin: 0 0 24px;">
        <a href="${whatsappLink}" style="display:inline-block; padding: 12px 24px; background: #25d366; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600;">
          Contact us on WhatsApp
        </a>
        <p style="font-size:12px; color:#6b7280; margin-top: 6px;">+92 318 954 0997</p>
      </div>

      ${opts.notes ? `<hr class="divider" /><p>${opts.notes}</p>` : ''}
      <hr class="divider" />
      <p style="font-size:13px; color:#6b7280;">Questions? Contact <a href="mailto:support@kynexsolutions.com" style="color:#059669;">support@kynexsolutions.com</a></p>
    `),
  });
}

export function sendTrialExpiryEmail(opts: {
  to: string;
  pharmacyName: string;
  daysLeft: number;
}): Promise<void> {
  return sendEmail({
    to: opts.to,
    subject: `Your Kynex Pharmacloud trial ends in ${opts.daysLeft} day${opts.daysLeft === 1 ? '' : 's'}`,
    html: baseTemplate(`
      <h2>Trial Expiry Notice</h2>
      <p>Dear <strong>${opts.pharmacyName}</strong>,</p>
      <p>Your free trial of <strong>Kynex Pharmacloud</strong> will expire in <strong>${opts.daysLeft} day${opts.daysLeft === 1 ? '' : 's'}</strong>.</p>
      <p>To continue using all features without interruption, please upgrade to a paid subscription.</p>
      <div style="text-align:center; margin: 28px 0;">
        <a href="${APP_URL}/settings" class="btn">Upgrade Now</a>
      </div>
      <p style="font-size:13px; color:#6b7280;">Need help? Contact us at <a href="mailto:support@kynexsolutions.com" style="color:#059669;">support@kynexsolutions.com</a> or WhatsApp us.</p>
    `),
  });
}

export function sendAccountSuspendedEmail(opts: {
  to: string;
  pharmacyName: string;
  reason: string;
}): Promise<void> {
  return sendEmail({
    to: opts.to,
    subject: `Your Kynex Pharmacloud account has been suspended`,
    html: baseTemplate(`
      <h2>Account Suspended</h2>
      <p>Dear <strong>${opts.pharmacyName}</strong>,</p>
      <p>Your Kynex Pharmacloud account has been suspended.</p>
      <p><strong>Reason:</strong> ${opts.reason}</p>
      <p>To reactivate your account, please contact our support team.</p>
      <div style="text-align:center; margin: 28px 0;">
        <a href="mailto:support@kynexsolutions.com" class="btn">Contact Support</a>
      </div>
    `),
  });
}
