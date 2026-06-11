// Renders a single invoice to a professional, print-ready PDF (US Letter) with
// pdf-lib. Pure layout: callers fetch the invoice + order + items + customer +
// business identity and pass them in. Server-only (pdf-lib runs on the Node
// runtime in the route handler). Returns the PDF as bytes.

import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";
import { formatPrice, formatDateOnly } from "@/lib/format";
import { INVOICE_LOGO_PNG_BASE64 } from "@/lib/invoice-logo";
import type { FulfillmentType, Invoice, OrderItem } from "@/lib/types";

export type InvoicePdfInput = {
  invoice: Invoice;
  order: {
    total_amount: number;
    delivery_fee: number;
    fulfillment_type: FulfillmentType;
    delivery_date: string | null;
    delivery_time: string | null;
  };
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

type Assets = { font: PDFFont; bold: PDFFont; logo: PDFImage };

// Fonts + logo are embedded once per document and reused across pages.
async function embedAssets(doc: PDFDocument): Promise<Assets> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Buffer.from(INVOICE_LOGO_PNG_BASE64, "base64"));
  return { font, bold, logo };
}

// One invoice → one page. Build a doc, embed shared assets, draw, save.
export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const assets = await embedAssets(doc);
  drawInvoice(doc, assets, input);
  return doc.save();
}

// Many invoices → one merged doc, one invoice per page (delivery-prep batch).
export async function buildInvoicesPdf(
  inputs: InvoicePdfInput[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const assets = await embedAssets(doc);
  if (inputs.length === 0) {
    doc
      .addPage([PAGE_W, PAGE_H])
      .drawText("No invoices for this date.", {
        x: MARGIN,
        y: PAGE_H - MARGIN - 20,
        size: 14,
        font: assets.bold,
        color: INK,
      });
    return doc.save();
  }
  for (const input of inputs) {
    drawInvoice(doc, assets, input);
  }
  return doc.save();
}

// Draw a single invoice across one or more pages of `doc`. Paginates long item
// lists onto continuation pages; the totals + footer stay together on the last.
function drawInvoice(doc: PDFDocument, assets: Assets, input: InvoicePdfInput) {
  const { font, bold, logo } = assets;
  const { invoice, order, items, customer, business } = input;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const topY = PAGE_H - MARGIN;
  // Keep content clear of the footer, which sits at the very bottom.
  const CONTENT_BOTTOM = MARGIN + 50;

  // Drawing helpers operate on the CURRENT page (reassigned on a page break).
  const text = (
    s: string,
    x: number,
    yy: number,
    size: number,
    f: PDFFont = font,
    color = INK,
  ) => page.drawText(s, { x, y: yy, size, font: f, color });

  const textRight = (
    s: string,
    rightX: number,
    yy: number,
    size: number,
    f: PDFFont = font,
    color = INK,
  ) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: rightX - w, y: yy, size, font: f, color });
  };

  const rule = (yy: number) =>
    page.drawLine({
      start: { x: MARGIN, y: yy },
      end: { x: RIGHT, y: yy },
      thickness: 1,
      color: RULE,
    });

  const drawTableHeader = () => {
    text("ITEM", MARGIN, y, 9, bold, MUTED);
    textRight("QTY", COL_QTY_R, y, 9, bold, MUTED);
    textRight("UNIT PRICE", COL_UNIT_R, y, 9, bold, MUTED);
    textRight("LINE TOTAL", COL_TOTAL_R, y, 9, bold, MUTED);
    y -= 8;
    rule(y);
    y -= 18;
  };

  // Start a continuation page with a compact header; optionally repeat the
  // line-item table header.
  const continuePage = (withTableHeader: boolean) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = topY;
    text(business.name, MARGIN, y - 10, 11, bold, MUTED);
    textRight(`${invoice.invoice_number} (cont.)`, RIGHT, y - 10, 9, font, MUTED);
    y -= 28;
    rule(y);
    y -= 18;
    if (withTableHeader) drawTableHeader();
  };

  // --- Masthead: logo (left) + "INVOICE" (right). -----------------------------
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
  y = topY - logoH - 16;
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
  const fulfillmentLabel =
    order.fulfillment_type === "pickup" ? "Pickup" : "Delivery";
  metaLabel("Fulfillment", fulfillmentLabel);
  if (order.delivery_date) {
    metaLabel(`${fulfillmentLabel} date`, formatDateOnly(order.delivery_date));
  }
  if (order.delivery_time) {
    metaLabel("Time window", order.delivery_time);
  }

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

  // --- Line-item table (paginates onto continuation pages). -------------------
  drawTableHeader();
  for (const item of items) {
    if (y < CONTENT_BOTTOM) continuePage(true);
    text(truncate(item.product_name, font, 10, ITEM_MAX_W), MARGIN, y, 10);
    textRight(String(item.quantity), COL_QTY_R, y, 10, font, INK);
    textRight(formatPrice(item.unit_price), COL_UNIT_R, y, 10, font, INK);
    textRight(formatPrice(item.line_total), COL_TOTAL_R, y, 10, font, INK);
    y -= 20;
  }

  // Keep the totals block together on the final page.
  if (y - (order.delivery_fee > 0 ? 90 : 73) < CONTENT_BOTTOM) {
    continuePage(false);
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
