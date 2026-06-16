// Purchase-order PDF (feature 2). Renders a clean A4 PO with jsPDF and returns
// base64 (no data-URI prefix) suitable for the Resend email attachment that the
// /api/purchase-orders/send-email endpoint already accepts.
import { jsPDF } from 'jspdf';
import type { Supplier, Medicine } from '@/types';

export interface PoPdfLine { medicine: Medicine | undefined; quantity: number }

export function buildPoPdfBase64(opts: {
  supplier: Supplier | undefined;
  poNumber: string;
  pharmacyName: string;
  lines: PoPdfLine[];
  date?: Date;
}): string {
  const { supplier, poNumber, pharmacyName, lines } = opts;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 40;
  let y = 54;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('PURCHASE ORDER', left, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${poNumber}`, pageW - left, y, { align: 'right' });
  y += 16;
  const dateStr = (opts.date ?? new Date()).toLocaleDateString();
  doc.text(`Date: ${dateStr}`, pageW - left, y, { align: 'right' });

  y += 24;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold'); doc.text('From:', left, y);
  doc.setFont('helvetica', 'normal'); doc.text(pharmacyName, left + 40, y);
  y += 16;
  doc.setFont('helvetica', 'bold'); doc.text('To:', left, y);
  doc.setFont('helvetica', 'normal'); doc.text(supplier?.name ?? 'Distributor', left + 40, y);
  if (supplier?.phone) { y += 14; doc.text(`Phone: ${supplier.phone}`, left + 40, y); }
  if (supplier?.email) { y += 14; doc.text(`Email: ${supplier.email}`, left + 40, y); }

  // Table header
  y += 28;
  const cols = { idx: left, item: left + 30, generic: left + 250, qty: pageW - left - 50 };
  doc.setFillColor(243, 244, 246);
  doc.rect(left, y - 12, pageW - left * 2, 20, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('#', cols.idx + 4, y);
  doc.text('Item', cols.item, y);
  doc.text('Generic', cols.generic, y);
  doc.text('Qty', cols.qty, y, { align: 'right' });
  y += 18;

  doc.setFont('helvetica', 'normal');
  lines.forEach((l, i) => {
    if (y > 780) { doc.addPage(); y = 54; }
    const name = `${l.medicine?.name ?? 'Item'}${l.medicine?.strength ? ' ' + l.medicine.strength : ''}`;
    doc.text(String(i + 1), cols.idx + 4, y);
    doc.text(doc.splitTextToSize(name, 210)[0] ?? name, cols.item, y);
    doc.text(doc.splitTextToSize(l.medicine?.genericName ?? '', 180)[0] ?? '', cols.generic, y);
    doc.text(String(l.quantity), cols.qty, y, { align: 'right' });
    y += 16;
    doc.setDrawColor(235); doc.line(left, y - 11, pageW - left, y - 11);
  });

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total items: ${lines.length}`, left, y);
  doc.text(`Total qty: ${lines.reduce((s, l) => s + l.quantity, 0)}`, pageW - left, y, { align: 'right' });

  y += 30;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
  doc.text('Please supply the above items. Thank you.', left, y);

  // 'data:application/pdf;base64,XXXX' → take the base64 payload only.
  const dataUri = doc.output('datauristring');
  return dataUri.substring(dataUri.indexOf(',') + 1);
}
