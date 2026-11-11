import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { config } from '../config';
import { notFound } from '../common/errors';
import { allocate, financialYear, includedTax } from '../common/money';
import { SettingsService } from '../common/settings.service';
import { PrismaService, Tx } from '../prisma/prisma.service';

interface InvoiceLine {
  name: string;
  sku: string;
  hsn: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  taxable: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface InvoiceTotals {
  lines: InvoiceLine[];
  delivery: { total: number; taxable: number; cgst: number; sgst: number; igst: number } | null;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  intraState: boolean;
  placeOfSupply: string;
  seller: { name: string; legalName: string; gstin: string; address: string; state: string };
  buyer: { name: string; address: string; gstin: string | null };
}

/** GST tax invoices: sequential numbering per Indian financial year, CGST/SGST within the state, IGST outside it. */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async issue(tx: Tx, orderId: string) {
    const existing = await tx.invoice.findUnique({ where: { orderId } });
    if (existing) return existing;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const store = await this.settings.get('store');
    const fy = financialYear(order.confirmedAt ?? new Date());
    const counter = await tx.invoiceCounter.upsert({ where: { fy }, update: { last: { increment: 1 } }, create: { fy, last: 1 } });
    const address = order.shippingAddress as Record<string, string>;
    const intraState = (address.state ?? '').trim().toLowerCase() === store.state.trim().toLowerCase();

    const split = (tax: number) =>
      intraState ? { cgst: Math.floor(tax / 2), sgst: tax - Math.floor(tax / 2), igst: 0 } : { cgst: 0, sgst: 0, igst: tax };

    const discounts = allocate(order.discountTotal, order.items.map((i) => i.lineTotal));
    const lines: InvoiceLine[] = order.items.map((i, idx) => {
      const total = i.lineTotal - (i.discount || discounts[idx]);
      const tax = includedTax(total, i.gstRate);
      return {
        name: `${i.productName} (${i.variantTitle})`,
        sku: i.sku,
        hsn: i.hsnCode,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount || discounts[idx],
        total,
        taxable: total - tax,
        rate: i.gstRate,
        ...split(tax),
      };
    });
    const deliveryTax = includedTax(order.shippingTotal, 18);
    const delivery = order.shippingTotal > 0 ? { total: order.shippingTotal, taxable: order.shippingTotal - deliveryTax, ...split(deliveryTax) } : null;
    const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst') => lines.reduce((s, l) => s + l[k], 0) + (delivery?.[k] ?? 0);

    const totals: InvoiceTotals = {
      lines,
      delivery,
      taxable: sum('taxable'),
      cgst: sum('cgst'),
      sgst: sum('sgst'),
      igst: sum('igst'),
      grandTotal: order.grandTotal,
      intraState,
      placeOfSupply: address.state ?? '',
      seller: { name: store.name, legalName: store.legalName, gstin: store.gstin, address: store.address, state: store.state },
      buyer: {
        name: address.name ?? order.name,
        address: [address.line1, address.line2, address.landmark, `${address.city}, ${address.state} ${address.pincode}`].filter(Boolean).join(', '),
        gstin: order.gstin,
      },
    };
    return tx.invoice.create({
      data: {
        orderId,
        fy,
        seq: counter.last,
        number: `SSS/${fy}/${String(counter.last).padStart(5, '0')}`,
        totals: totals as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Returns the PDF, generating and caching it on first request. */
  async pdf(orderId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { orderId }, include: { order: true } });
    if (!invoice) throw notFound('Invoice');
    const dir = join(config.mediaRoot, 'private', 'invoices');
    const file = join(dir, `${invoice.number.replace(/\//g, '-')}.pdf`);
    if (existsSync(file)) return { buffer: await readFile(file), filename: `${invoice.number.replace(/\//g, '-')}.pdf` };
    await mkdir(dir, { recursive: true });
    const buffer = await this.render(invoice.number, invoice.issuedAt, invoice.order.orderNumber, invoice.totals as unknown as InvoiceTotals);
    await writeFile(file, buffer);
    await this.prisma.invoice.update({ where: { id: invoice.id }, data: { fileKey: `private/invoices/${invoice.number.replace(/\//g, '-')}.pdf` } });
    return { buffer, filename: `${invoice.number.replace(/\//g, '-')}.pdf` };
  }

  private render(number: string, issuedAt: Date, orderNumber: string, t: InvoiceTotals): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Tax invoice ${number}` } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Built-in PDF fonts have no rupee glyph, so amounts use "Rs."
      const rs = (p: number) => `Rs. ${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const ink = '#171614';
      const muted = '#6B665E';

      doc.fillColor(ink).font('Helvetica-Bold').fontSize(18).text(t.seller.name.toUpperCase(), { characterSpacing: 2 });
      doc.font('Helvetica').fontSize(9).fillColor(muted).text(t.seller.legalName).text(t.seller.address).text(`GSTIN ${t.seller.gstin}`);
      doc.moveUp(4).font('Helvetica-Bold').fontSize(14).fillColor(ink).text('TAX INVOICE', { align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(muted)
        .text(`Invoice ${number}`, { align: 'right' })
        .text(`Date ${issuedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, { align: 'right' })
        .text(`Order ${orderNumber}`, { align: 'right' });

      doc.moveDown(2).fillColor(ink).font('Helvetica-Bold').fontSize(10).text('Bill to / Ship to');
      doc.font('Helvetica').fontSize(9).fillColor(ink).text(t.buyer.name).fillColor(muted).text(t.buyer.address);
      if (t.buyer.gstin) doc.text(`GSTIN ${t.buyer.gstin}`);
      doc.text(`Place of supply: ${t.placeOfSupply}`);

      // Table
      const cols = [48, 230, 275, 305, 375, 420, 547];
      const head = ['Item', 'HSN', 'Qty', 'Taxable', 'GST', 'Amount'];
      let y = doc.y + 18;
      doc.moveTo(48, y - 6).lineTo(547, y - 6).strokeColor('#D9D4CB').stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(muted);
      head.forEach((h, i) => doc.text(h, cols[i], y, { width: cols[i + 1] - cols[i] - 6, align: i === 0 ? 'left' : 'right' }));
      y += 16;
      doc.font('Helvetica').fontSize(8.5).fillColor(ink);
      const row = (cells: string[]) => {
        const h = Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: cols[i + 1] - cols[i] - 6 })));
        cells.forEach((c, i) => doc.text(c, cols[i], y, { width: cols[i + 1] - cols[i] - 6, align: i === 0 ? 'left' : 'right' }));
        y += h + 8;
      };
      for (const l of t.lines) {
        const gst = l.igst ? `IGST ${l.rate}%\n${rs(l.igst)}` : `CGST ${l.rate / 2}% ${rs(l.cgst)}\nSGST ${l.rate / 2}% ${rs(l.sgst)}`;
        row([`${l.name}\nSKU ${l.sku}${l.discount ? ` · discount ${rs(l.discount)}` : ''}`, l.hsn, String(l.quantity), rs(l.taxable), gst, rs(l.total)]);
      }
      if (t.delivery) {
        const d = t.delivery;
        row(['Delivery charge', '996511', '1', rs(d.taxable), d.igst ? `IGST 18%\n${rs(d.igst)}` : `CGST 9% ${rs(d.cgst)}\nSGST 9% ${rs(d.sgst)}`, rs(d.total)]);
      }
      doc.moveTo(48, y).lineTo(547, y).strokeColor('#D9D4CB').stroke();
      y += 10;
      const total = (label: string, value: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10.5 : 9).fillColor(bold ? ink : muted);
        doc.text(label, 330, y, { width: 120, align: 'right' }).text(value, 450, y, { width: 97, align: 'right' });
        y += bold ? 18 : 14;
      };
      total('Taxable value', rs(t.taxable));
      if (t.intraState) {
        total('CGST', rs(t.cgst));
        total('SGST', rs(t.sgst));
      } else total('IGST', rs(t.igst));
      total('Invoice total', rs(t.grandTotal), true);

      doc.font('Helvetica').fontSize(8).fillColor(muted).text(
        'Prices are inclusive of GST. This is a computer-generated invoice and does not need a signature.',
        48, 770, { width: 499, align: 'center' },
      );
      doc.end();
    });
  }
}
