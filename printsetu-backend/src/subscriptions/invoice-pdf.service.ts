import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { Invoice, Refund, Shop } from '@prisma/client';
import { cycleAdjective } from './subscription.constants';

type InvoiceWithRelations = Invoice & { shop: Shop; refunds: Refund[] };

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.9, 0.92, 0.95);
const ACCENT = rgb(0.31, 0.27, 0.9);

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'UNPAID',
  FAILED: 'PAYMENT FAILED',
  PAID: 'PAID',
  VOID: 'VOID',
  PARTIALLY_REFUNDED: 'PARTIALLY REFUNDED',
  REFUNDED: 'REFUNDED',
};

/**
 * Renders a one-page invoice PDF for a shop's own records.
 * Uses the built-in Helvetica font, which has no rupee sign, so amounts are
 * written as "Rs. 1,234.00" (or the currency code for other currencies).
 */
@Injectable()
export class InvoicePdfService {
  async render(invoice: InvoiceWithRelations): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Invoice ${invoice.number}`);
    pdf.setProducer('PrintSetu');
    const page = pdf.addPage([595.28, 841.89]); // A4
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const money = (n: number | string) => {
      const prefix = invoice.currency === 'INR' ? 'Rs. ' : `${invoice.currency} `;
      return prefix + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const date = (d: Date | null) =>
      d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';

    const L = 48;
    const R = 595.28 - 48;
    let y = 790;
    const text = (t: string, x: number, yy: number, size = 10, font: PDFFont = regular, color = INK) =>
      page.drawText(sanitize(t), { x, y: yy, size, font, color });
    const right = (t: string, xr: number, yy: number, size = 10, font: PDFFont = regular, color = INK) =>
      page.drawText(sanitize(t), { x: xr - font.widthOfTextAtSize(sanitize(t), size), y: yy, size, font, color });
    const rule = (yy: number) => page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness: 0.8, color: LINE });

    // ---- header
    text('PrintSetu', L, y, 22, bold, ACCENT);
    right('INVOICE', R, y + 2, 20, bold);
    y -= 22;
    text('Subscription billing', L, y, 9, regular, MUTED);
    right(invoice.number, R, y, 10, bold);
    y -= 14;
    right(`Issued ${date(invoice.createdAt)}`, R, y, 9, regular, MUTED);
    y -= 30;
    rule(y);
    y -= 26;

    // ---- billed to / status
    text('BILLED TO', L, y, 8, bold, MUTED);
    text('STATUS', 340, y, 8, bold, MUTED);
    y -= 16;
    text(invoice.shop.name, L, y, 12, bold);
    text(STATUS_LABEL[invoice.status] ?? invoice.status, 340, y, 12, bold, invoice.status === 'PAID' ? rgb(0.09, 0.5, 0.24) : INK);
    y -= 15;
    text(invoice.shop.ownerName, L, y, 10, regular, MUTED);
    text(`Due ${date(invoice.dueDate)}`, 340, y, 10, regular, MUTED);
    y -= 14;
    text(`${invoice.shop.address}, ${invoice.shop.city}`, L, y, 10, regular, MUTED);
    if (invoice.paidAt) text(`Paid ${date(invoice.paidAt)}`, 340, y, 10, regular, MUTED);
    y -= 14;
    text(`${invoice.shop.email}  |  ${invoice.shop.mobile}`, L, y, 10, regular, MUTED);
    if (invoice.paymentMethod) {
      text(`Method ${invoice.paymentMethod.replace('_', ' ').toLowerCase()}`, 340, y, 10, regular, MUTED);
    }
    y -= 14;
    text(`Shop code ${invoice.shop.shopCode}`, L, y, 10, regular, MUTED);
    if (invoice.paymentReference) text(`Ref ${invoice.paymentReference}`, 340, y, 10, regular, MUTED);
    y -= 34;

    // ---- line item
    page.drawRectangle({ x: L, y: y - 8, width: R - L, height: 26, color: rgb(0.96, 0.97, 0.99) });
    text('DESCRIPTION', L + 10, y, 8, bold, MUTED);
    text('PERIOD', 330, y, 8, bold, MUTED);
    right('AMOUNT', R - 10, y, 8, bold, MUTED);
    y -= 28;
    text(`${invoice.planName} plan (${cycleAdjective(invoice.cycle)})`, L + 10, y, 11, bold);
    text(`${date(invoice.periodStart)} - ${date(invoice.periodEnd)}`, 330, y, 10);
    right(money(invoice.amount.toString()), R - 10, y, 11, bold);
    y -= 15;
    text(invoice.description, L + 10, y, 9, regular, MUTED);
    y -= 22;
    rule(y);
    y -= 24;

    // ---- totals
    const total = (label: string, value: string, strong = false) => {
      text(label, 360, y, strong ? 11 : 10, strong ? bold : regular, strong ? INK : MUTED);
      right(value, R - 10, y, strong ? 12 : 10, strong ? bold : regular);
      y -= strong ? 20 : 16;
    };
    total('Invoice total', money(invoice.amount.toString()), true);
    for (const r of invoice.refunds) {
      total(`Refund ${date(r.createdAt)}`, `- ${money(r.amount.toString())}`);
    }
    if (invoice.refunds.length) {
      total('Net paid', money(Number(invoice.amount) - Number(invoice.refundedAmount)), true);
    }

    if (invoice.refunds.length) {
      y -= 10;
      text('REFUND NOTES', L, y, 8, bold, MUTED);
      y -= 14;
      for (const r of invoice.refunds) {
        text(`${date(r.createdAt)}: ${r.reason}`, L, y, 9, regular, MUTED);
        y -= 13;
      }
    }

    // ---- footer
    text('This is a computer-generated invoice and does not need a signature.', L, 60, 8, regular, MUTED);
    text('Thank you for choosing PrintSetu.', L, 47, 8, regular, MUTED);
    this.watermark(page, invoice, bold);
    return Buffer.from(await pdf.save());
  }

  private watermark(page: PDFPage, invoice: Invoice, font: PDFFont) {
    if (invoice.status !== 'VOID' && invoice.status !== 'REFUNDED') return;
    page.drawText(invoice.status, {
      x: 150,
      y: 400,
      size: 90,
      font,
      color: rgb(0.85, 0.87, 0.9),
      rotate: degrees(30),
      opacity: 0.6,
    });
  }
}

/** Standard PDF fonts only cover Latin-1; replace anything outside it so drawing never throws. */
function sanitize(input: string): string {
  return input.replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E -ÿ]/g, '?');
}
