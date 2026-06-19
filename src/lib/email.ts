// Transactional email via Resend's HTTP API (no SDK dependency). Safely a no-op
// when RESEND_API_KEY isn't set, so payment flows never break on missing email
// config. Server-only.

export async function sendPaymentReceipt(opts: {
  to: string;
  invoiceNumber: string;
  amountDisplay: string; // e.g. "$420.00"
  dateDisplay: string; // e.g. "Jun 12, 2026"
  businessName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !opts.to) return; // email not configured → skip silently

  // Production needs a verified sending domain; Resend's onboarding@resend.dev
  // works for early testing (only delivers to the Resend account owner).
  const from = process.env.RESEND_FROM || `${opts.businessName} <onboarding@resend.dev>`;

  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
      <h2 style="margin:0 0 8px">Payment received</h2>
      <p style="margin:0 0 16px;color:#57534e">Thank you — we've received your payment. This is your confirmation.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#78716c">Invoice</td><td style="padding:6px 0;text-align:right;font-weight:600">${opts.invoiceNumber}</td></tr>
        <tr><td style="padding:6px 0;color:#78716c">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:600">${opts.amountDisplay}</td></tr>
        <tr><td style="padding:6px 0;color:#78716c">Date</td><td style="padding:6px 0;text-align:right;font-weight:600">${opts.dateDisplay}</td></tr>
      </table>
      <p style="margin:20px 0 0;color:#78716c;font-size:13px">${opts.businessName}</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: `Payment received — Invoice ${opts.invoiceNumber}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend receipt failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("Resend receipt error:", e);
  }
}

// Alert the admin that an ACH payment failed/returned so they can follow up.
// Sends to the first ADMIN_EMAILS address. No-op until RESEND_API_KEY is set.
export async function sendAdminPaymentFailedAlert(opts: {
  invoiceLabel: string;
  customerName: string;
  amountDisplay: string;
  businessName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)[0];
  if (!apiKey || !to) return; // email not configured → skip silently

  const from =
    process.env.RESEND_FROM || `${opts.businessName} <onboarding@resend.dev>`;

  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
      <h2 style="margin:0 0 8px">⚠ ACH payment failed</h2>
      <p style="margin:0 0 16px;color:#57534e">An ACH payment was returned/failed after authorization. The order was <strong>not</strong> auto-canceled — review and follow up.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#78716c">Customer</td><td style="padding:6px 0;text-align:right;font-weight:600">${opts.customerName}</td></tr>
        <tr><td style="padding:6px 0;color:#78716c">Invoice(s)</td><td style="padding:6px 0;text-align:right;font-weight:600">${opts.invoiceLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#78716c">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${opts.amountDisplay}</td></tr>
      </table>
      <p style="margin:20px 0 0;color:#78716c;font-size:13px">${opts.businessName}</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `⚠ ACH payment failed — ${opts.invoiceLabel}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend alert failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("Resend alert error:", e);
  }
}
