// Renders a single invoice to a professional, print-ready PDF (US Letter) with
// pdf-lib. Pure layout: callers fetch the invoice + order + items + customer +
// business identity and pass them in. Server-only (pdf-lib runs on the Node
// runtime in the route handler). Returns the PDF as bytes.

import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatPrice, formatDateOnly } from "@/lib/format";
import { INVOICE_LOGO_PNG_BASE64 } from "@/lib/invoice-logo";
import type { Invoice, OrderItem } from "@/lib/types";

export type InvoicePdfInput = {
  invoice: Invoice;
  order: { total_amount: number; delivery_fee: number };
  items: OrderItem[];
  customer: {
    business_name: string;
    contact_name: string | null;
    address: string | null;
  };
  business: { name: string; address: string };
};

// Letter @ 72dpi, generous margins.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN; // right content edge

// Muted palette — dark ink, gray labels, hairline rules.
const INK = rgb(0.13, 0.12, 0.1);
const MUTED = rgb(0.45, 0.42, 0.4);
const RULE = rgb(0.85, 0.83, 0.81);
const STATUS_COLORS = {
  paid: rgb(0.09, 0.5, 0.29),
  overdue: rgb(0.79, 0.16, 0.16),
  unpaid: rgb(0.72, 0.52, 0.04),
  canceled: rgb(0.5, 0.47, 0.44),
} as const;

// Column right-edges for the line-item table (item name is left-aligned).
const COL_QTY_R = 360;
const COL_UNIT_R = 460;
const COL_TOTAL_R = RIGHT;
const ITEM_MAX_W = COL_QTY_R - MARGIN - 60; // keep item clear of the qty column

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { invoice, order, items, customer, business } = input;

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const text = (
    s: string,
    x: number,
    y: number,
    size: number,
    f: PDFFont = font,
    color = INK,
  ) => page.drawText(s, { x, y, size, font: f, color });

  const textRight = (
    s: string,
    rightX: number,
    y: number,
    size: number,
    f: PDFFont = font,
    color = INK,
  ) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: rightX - w, y, size, font: f, color });
  };

  const rule = (y: number, p: PDFPage = page) =>
    p.drawLine({
      start: { x: MARGIN, y },
      end: { x: RIGHT, y },
      thickness: 1,
      color: RULE,
    });

  const topY = PAGE_H - MARGIN;

  // --- Masthead: logo (left) + "INVOICE" (right). -----------------------------
  const logo = await doc.embedPng(
    Buffer.from(INVOICE_LOGO_PNG_BASE64, "base64"),
  );
  const logoW = 135;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, {
    x: MARGIN,
    y: topY - logoH,
    width: logoW,
    height: logoH,
  });
  textRight("INVOICE", RIGHT, topY - 14, 24, bold, MUTED);

  // Business address sits under the logo.
  let y = topY - logoH - 16;
  for (const line of splitLines(business.address)) {
    text(line, MARGIN, y, 9.5, font, MUTED);
    y -= 13;
  }

  // --- Meta block (right column): number, issue, due, status. -----------------
  let metaY = topY - 44;
  const metaLabel = (label: string, value: string, valueColor = INK) => {
    textRight(label, RIGHT - 120, metaY, 9, font, MUTED);
    textRight(value, RIGHT, metaY, 9.5, bold, valueColor);
    metaY -= 15;
  };
  metaLabel("Invoice #", invoice.invoice_number);
  metaLabel("Issue date", formatDateOnly(invoice.issue_date));
  metaLabel("Due date", formatDateOnly(invoice.due_date));
  metaLabel(
    "Status",
    invoice.status.toUpperCase(),
    STATUS_COLORS[invoice.status],
  );

  // Drop below whichever column is lower, then a rule.
  y = Math.min(y, metaY) - 8;
  rule(y);
  y -= 26;

  // --- Bill to. ---------------------------------------------------------------
  text("BILL TO", MARGIN, y, 9, bold, MUTED);
  y -= 16;
  text(customer.business_name, MARGIN, y, 12, bold);
  y -= 15;
  if (customer.contact_name) {
    text(customer.contact_name, MARGIN, y, 10, font, MUTED);
    y -= 13;
  }
  for (const line of splitLines(customer.address)) {
    text(line, MARGIN, y, 10, font, MUTED);
    y -= 13;
  }
  y -= 18;

  // --- Line-item table header. ------------------------------------------------
  text("ITEM", MARGIN, y, 9, bold, MUTED);
  textRight("QTY", COL_QTY_R, y, 9, bold, MUTED);
  textRight("UNIT PRICE", COL_UNIT_R, y, 9, bold, MUTED);
  textRight("LINE TOTAL", COL_TOTAL_R, y, 9, bold, MUTED);
  y -= 8;
  rule(y);
  y -= 18;

  // --- Line items. ------------------------------------------------------------
  for (const item of items) {
    text(truncate(item.product_name, font, 10, ITEM_MAX_W), MARGIN, y, 10);
    textRight(String(item.quantity), COL_QTY_R, y, 10, font, INK);
    textRight(formatPrice(item.unit_price), COL_UNIT_R, y, 10, font, INK);
    textRight(formatPrice(item.line_total), COL_TOTAL_R, y, 10, font, INK);
    y -= 20;
  }

  y -= 2;
  rule(y);
  y -= 22;

  // --- Totals (right-aligned block). ------------------------------------------
  const subtotal = round2(order.total_amount - order.delivery_fee);
  const totalsLabelR = COL_UNIT_R;
  const totalRow = (
    label: string,
    value: string,
    f: PDFFont = font,
    size = 10,
    color = INK,
  ) => {
    textRight(label, totalsLabelR, y, size, f, color);
    textRight(value, COL_TOTAL_R, y, size, f, color);
  };
  totalRow("Subtotal", formatPrice(subtotal), font, 10, MUTED);
  y -= 17;
  if (order.delivery_fee > 0) {
    totalRow("Delivery fee", formatPrice(order.delivery_fee), font, 10, MUTED);
    y -= 17;
  }
  y -= 4;
  rule(y);
  y -= 22;
  totalRow("Total due", formatPrice(order.total_amount), bold, 13);

  // --- Footer note (pinned near the bottom). ----------------------------------
  const footY = MARGIN + 24;
  rule(footY + 18);
  page.drawText(
    `Payment due by ${formatDateOnly(invoice.due_date)}. Thank you for your business.`,
    { x: MARGIN, y: footY, size: 9, font, color: MUTED },
  );

  return doc.save();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Split a stored multi-line address into trimmed, non-empty lines.
function splitLines(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// Truncate with an ellipsis so a long product name never collides with the
// quantity column.
function truncate(
  s: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}
