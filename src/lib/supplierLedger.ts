// Supplier Ledger printer — produces a print-ready HTML statement that the
// pharmacy can hand to the supplier as a reconciliation document.
//
// The page mirrors the letterhead style used by the rest of the reporting
// pipeline so a stack of printed documents (sales report, customer report,
// supplier statement) all look like one product.

import type { AppSettings, Purchase, PurchasePayment, Supplier } from '@/types';

export interface LedgerRow {
  date: Date;
  ref: string;
  type: string;
  method?: string;
  notes?: string;
  debit: number;
  credit: number;
  proofImageUrl?: string;
}

interface PrintArgs {
  supplier: Supplier;
  settings: AppSettings;
  /** All non-cancelled purchases for this supplier, regardless of date. The
   *  function will compute opening balance for entries before `start`. */
  purchases: Purchase[];
  /** Inclusive start of the statement period (null = from beginning). */
  start: Date | null;
  /** Inclusive end of the statement period. */
  end: Date;
  generatedBy?: string;
  /** When true, append a "Payment Proofs" section that embeds every uploaded
   *  receipt/cheque image. Useful when handing the statement to a supplier or
   *  an auditor; off by default for an internal one-page summary. */
  includeProofs?: boolean;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n: number): string =>
  `Rs. ${Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 2 })}${n < 0 ? '' : ''}`;

const dt = (d: Date): string => d.toLocaleDateString('en-PK');

/** Build ledger rows from the supplier's purchases — both PO debits + recorded payments. */
function buildLedger(purchases: Purchase[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const po of purchases) {
    if (po.status === 'cancelled') continue;
    if (po.totalAmount > 0) {
      rows.push({
        date: new Date(po.purchaseDate),
        ref: po.purchaseNumber,
        type: po.isLoose ? 'Loose Purchase' : 'Purchase / GRN',
        debit: po.totalAmount,
        credit: 0,
      });
    }
    const pays = [...(po.payments ?? [])].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
    for (const p of pays) {
      rows.push({
        date: new Date(p.paidAt),
        ref: `${po.purchaseNumber} / ${p.reference || p.id.slice(-6)}`,
        type: 'Payment',
        method: p.method,
        notes: p.notes,
        debit: 0,
        credit: p.amount,
        proofImageUrl: p.proofImageUrl,
      });
    }
    // Legacy fallback for POs that have paidAmount > 0 but no per-payment records
    const recordedPaid = pays.reduce((s, p) => s + p.amount, 0);
    const legacyPaid = (po.paidAmount || 0) - recordedPaid;
    if (legacyPaid > 0.01) {
      rows.push({
        date: new Date(po.updatedAt),
        ref: `${po.purchaseNumber} / legacy`,
        type: 'Payment (legacy)',
        debit: 0,
        credit: legacyPaid,
      });
    }
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return rows;
}

export function printSupplierLedger(args: PrintArgs): void {
  const { supplier, settings, purchases, start, end, generatedBy, includeProofs = false } = args;

  const all = buildLedger(purchases);

  // Opening balance = sum of (debit − credit) for all rows strictly before start.
  let opening = 0;
  const inRange: LedgerRow[] = [];
  for (const r of all) {
    if (start && r.date < start) {
      opening += r.debit - r.credit;
    } else if (r.date <= end) {
      inRange.push(r);
    }
  }

  // Running balance through the period
  let running = opening;
  const lines = inRange.map((r) => {
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });

  // Payments WITH a proof image — for the optional gallery section
  const paymentsWithProof = inRange.filter((r) => r.credit > 0 && r.proofImageUrl);

  const totalDebit = inRange.reduce((s, r) => s + r.debit, 0);
  const totalCredit = inRange.reduce((s, r) => s + r.credit, 0);
  const closing = opening + totalDebit - totalCredit;

  const w = window.open('', '_blank', 'width=1100,height=900');
  if (!w) return;

  const reportId = `LDG-${supplier.name.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const generatedAt = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });

  const logoBlock = (settings.printCompanyLogo && settings.companyLogoUrl)
    ? `<img src="${esc(settings.companyLogoUrl)}" class="letterhead-logo" alt="logo">`
    : `<div class="letterhead-logo-placeholder">${esc((settings.companyName || 'K').slice(0, 2).toUpperCase())}</div>`;

  const periodLabel = start
    ? `${dt(start)} – ${dt(end)}`
    : `From beginning – ${dt(end)}`;

  w.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(settings.companyName || 'Pharmacy')} — Ledger Statement — ${esc(supplier.name)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.45; background: #fff; }

  .letterhead { display: flex; align-items: center; gap: 14px; padding-bottom: 10px; border-bottom: 3px double #065f46; margin-bottom: 12px; }
  .letterhead-logo { width: 64px; height: 64px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 3px; }
  .letterhead-logo-placeholder { width: 64px; height: 64px; border-radius: 8px; background: linear-gradient(135deg, #065f46, #10b981); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; letter-spacing: 1px; }
  .letterhead-text h1 { font-size: 18px; color: #065f46; }
  .letterhead-text .addr { font-size: 10px; color: #475569; margin-top: 2px; }
  .letterhead-text .ids { font-size: 9px; color: #64748b; margin-top: 3px; display: flex; gap: 12px; flex-wrap: wrap; }
  .letterhead-text .ids b { color: #334155; }

  .banner { background: linear-gradient(135deg, #065f46, #047857); color: #fff; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
  .banner h2 { font-size: 15px; font-weight: 700; }
  .banner .meta { font-size: 10px; opacity: 0.9; text-align: right; }

  .party { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .party-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
  .party-box .label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700; }
  .party-box .name { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .party-box .meta { font-size: 10px; color: #475569; margin-top: 2px; line-height: 1.4; }

  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .stat { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
  .stat .label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; font-weight: 600; }
  .stat .value { font-size: 13px; font-weight: 700; margin-top: 1px; font-variant-numeric: tabular-nums; }
  .stat.emerald .value { color: #047857; }
  .stat.red .value { color: #dc2626; }
  .stat.blue .value { color: #2563eb; }

  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th { background: #f1f5f9; color: #334155; font-weight: 600; text-align: left; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.r { text-align: right; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-variant-numeric: tabular-nums; }
  tbody td.r { text-align: right; }
  tbody tr.opening td { background: #fef9c3; font-weight: 600; }
  tbody tr.payment-row { background: #f0fdf4; }
  tfoot td { padding: 7px 8px; font-weight: 700; background: #f1f5f9; border-top: 2px solid #cbd5e1; font-variant-numeric: tabular-nums; }
  tfoot td.r { text-align: right; }
  .text-debit { color: #dc2626; }
  .text-credit { color: #047857; }
  .text-balance { color: #0f172a; font-weight: 700; }
  .badge-proof { display: inline-block; padding: 1px 5px; background: #dbeafe; color: #1e40af; border-radius: 6px; font-size: 8px; font-weight: 600; }
  .ref-mono { font-family: 'Courier New', monospace; font-size: 10px; }

  .signatures { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sig-box { text-align: center; }
  .sig-line { border-top: 1px solid #475569; margin-top: 50px; padding-top: 4px; font-size: 9px; color: #475569; }

  /* Payment-proof gallery (only when includeProofs=true) */
  .proofs-section { margin-top: 20px; }
  .proofs-h { font-size: 13px; color: #065f46; border-bottom: 2px solid #10b981; padding-bottom: 3px; margin: 18px 0 10px; page-break-before: always; }
  .proof-card { display: flex; gap: 14px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px; page-break-inside: avoid; background: #fff; }
  .proof-meta { flex: 1; font-size: 10px; min-width: 0; }
  .proof-meta .row { margin-bottom: 3px; }
  .proof-meta b { color: #334155; }
  .proof-image-wrap { width: 220px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-radius: 6px; padding: 6px; border: 1px solid #e2e8f0; }
  .proof-image { max-width: 100%; max-height: 220px; object-fit: contain; border-radius: 4px; }
  .proof-pdf-link { color: #2563eb; text-decoration: underline; font-size: 9px; }
  .proof-amount { font-weight: 700; color: #047857; font-variant-numeric: tabular-nums; }

  .footer { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 8px; color: #94a3b8; text-align: center; }
  .notes { margin-top: 12px; padding: 8px 12px; border-left: 3px solid #94a3b8; background: #f8fafc; font-size: 9px; color: #475569; border-radius: 0 4px 4px 0; }

  .print-btn { position: fixed; top: 14px; right: 14px; z-index: 999; padding: 9px 18px; background: #065f46; color: #fff; border: none; border-radius: 5px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 3px 10px rgba(0,0,0,0.18); }
  .print-btn:hover { background: #047857; }

  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head><body>
<button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>

<div class="letterhead">
  ${logoBlock}
  <div class="letterhead-text">
    <h1>${esc(settings.companyName || 'Kynex Pharmacloud')}</h1>
    ${settings.companyAddress ? `<div class="addr">${esc(settings.companyAddress)}</div>` : ''}
    <div class="ids">
      ${settings.companyPhone ? `<span><b>Phone:</b> ${esc(settings.companyPhone)}</span>` : ''}
      ${settings.companyEmail ? `<span><b>Email:</b> ${esc(settings.companyEmail)}</span>` : ''}
      ${settings.companyNtn ? `<span><b>NTN:</b> ${esc(settings.companyNtn)}</span>` : ''}
      ${settings.companyGst ? `<span><b>GST:</b> ${esc(settings.companyGst)}</span>` : ''}
    </div>
  </div>
</div>

<div class="banner">
  <h2>Supplier Ledger Statement</h2>
  <div class="meta">
    <div>Period: <b>${esc(periodLabel)}</b></div>
    <div>Generated: ${esc(generatedAt)}</div>
    ${generatedBy ? `<div>By: ${esc(generatedBy)}</div>` : ''}
    <div>${esc(reportId)}</div>
  </div>
</div>

<div class="party">
  <div class="party-box">
    <div class="label">From (Pharmacy)</div>
    <div class="name">${esc(settings.companyName || '—')}</div>
    <div class="meta">
      ${settings.companyAddress ? esc(settings.companyAddress) + '<br>' : ''}
      ${settings.companyPhone ? 'Phone: ' + esc(settings.companyPhone) : ''}
      ${settings.companyNtn ? '<br>NTN: ' + esc(settings.companyNtn) : ''}
    </div>
  </div>
  <div class="party-box">
    <div class="label">Supplier</div>
    <div class="name">${esc(supplier.name)}</div>
    <div class="meta">
      ${supplier.contactPerson ? esc(supplier.contactPerson) + '<br>' : ''}
      ${supplier.phone ? 'Phone: ' + esc(supplier.phone) + '<br>' : ''}
      ${supplier.city ? 'City: ' + esc(supplier.city) : ''}
      ${supplier.ntn ? '<br>NTN: ' + esc(supplier.ntn) : ''}
    </div>
  </div>
</div>

<div class="summary">
  <div class="stat blue"><div class="label">Opening Balance</div><div class="value">${esc(money(opening))}</div></div>
  <div class="stat red"><div class="label">Total Debit (Purchases)</div><div class="value">${esc(money(totalDebit))}</div></div>
  <div class="stat emerald"><div class="label">Total Credit (Payments)</div><div class="value">${esc(money(totalCredit))}</div></div>
  <div class="stat ${closing > 0 ? 'red' : 'emerald'}"><div class="label">Closing Balance</div><div class="value">${esc(money(closing))}</div></div>
</div>

<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Reference</th>
      <th>Type</th>
      <th>Method / Notes</th>
      <th class="r">Debit</th>
      <th class="r">Credit</th>
      <th>Proof</th>
      <th class="r">Balance</th>
    </tr>
  </thead>
  <tbody>
    <tr class="opening">
      <td>${start ? esc(dt(start)) : '—'}</td>
      <td colspan="3"><b>Opening Balance</b></td>
      <td class="r">—</td>
      <td class="r">—</td>
      <td>—</td>
      <td class="r text-balance">${esc(money(opening))}</td>
    </tr>
    ${lines.length === 0 ? `
      <tr><td colspan="8" style="padding:18px;text-align:center;color:#94a3b8;font-style:italic">
        No transactions in this period.
      </td></tr>
    ` : lines.map((r) => `
      <tr class="${r.credit > 0 ? 'payment-row' : ''}">
        <td>${esc(dt(r.date))}</td>
        <td class="ref-mono">${esc(r.ref)}</td>
        <td>${esc(r.type)}</td>
        <td>
          ${r.method ? `<div style="font-size:9px;color:#475569">via ${esc(r.method.replace('_', ' '))}</div>` : ''}
          ${r.notes ? `<div style="font-size:8px;color:#94a3b8;font-style:italic">${esc(r.notes)}</div>` : ''}
          ${!r.method && !r.notes ? '—' : ''}
        </td>
        <td class="r text-debit">${r.debit > 0 ? esc(money(r.debit)) : '—'}</td>
        <td class="r text-credit">${r.credit > 0 ? esc(money(r.credit)) : '—'}</td>
        <td>${r.proofImageUrl ? '<span class="badge-proof">✓ Attached</span>' : '—'}</td>
        <td class="r text-balance">${esc(money(r.balance))}</td>
      </tr>
    `).join('')}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="4" class="r">Period totals</td>
      <td class="r text-debit">${esc(money(totalDebit))}</td>
      <td class="r text-credit">${esc(money(totalCredit))}</td>
      <td></td>
      <td class="r text-balance">${esc(money(closing))}</td>
    </tr>
  </tfoot>
</table>

<div class="notes">
  <strong>Reconciliation note.</strong> Please verify this ledger against your records and report any discrepancy within 7 days of statement date.
  Positive closing balance = amount payable by ${esc(settings.companyName || 'us')} to ${esc(supplier.name)}.
</div>

${includeProofs && paymentsWithProof.length > 0 ? `
<div class="proofs-section">
  <h3 class="proofs-h">Payment Proofs (${paymentsWithProof.length})</h3>
  <p style="font-size:9px;color:#64748b;margin-bottom:10px">
    Uploaded cheque pictures, bank-transfer receipts and other proof attached against payments in this period.
  </p>
  ${paymentsWithProof.map((r) => `
    <div class="proof-card">
      <div class="proof-meta">
        <div class="row"><b>Date:</b> ${esc(dt(r.date))}</div>
        <div class="row"><b>Reference:</b> ${esc(r.ref)}</div>
        <div class="row"><b>Method:</b> ${esc((r.method || 'cash').replace('_', ' '))}</div>
        <div class="row"><b>Amount:</b> <span class="proof-amount">${esc(money(r.credit))}</span></div>
        ${r.notes ? `<div class="row" style="color:#475569;font-style:italic">${esc(r.notes)}</div>` : ''}
      </div>
      <div class="proof-image-wrap">
        ${r.proofImageUrl!.startsWith('data:image')
          ? `<img class="proof-image" src="${esc(r.proofImageUrl!)}" alt="proof">`
          : `<a class="proof-pdf-link" href="${esc(r.proofImageUrl!)}" target="_blank">📄 PDF attached</a>`}
      </div>
    </div>
  `).join('')}
</div>
` : ''}

${includeProofs && paymentsWithProof.length === 0 ? `
<div class="proofs-section">
  <h3 class="proofs-h">Payment Proofs</h3>
  <p style="font-size:10px;color:#94a3b8;font-style:italic;padding:14px;text-align:center;border:1px dashed #e2e8f0;border-radius:8px">
    No payments with attached proof in this period.
  </p>
</div>
` : ''}

<div class="signatures">
  <div class="sig-box">
    <div class="sig-line">Authorized Signatory — ${esc(settings.companyName || 'Pharmacy')}</div>
  </div>
  <div class="sig-box">
    <div class="sig-line">Acknowledged — ${esc(supplier.name)}</div>
  </div>
</div>

<div class="footer">
  Computer-generated statement · ${esc(settings.companyName || 'Pharmacy')} · Kynex Pharmacloud · ${esc(reportId)}
</div>
</body></html>`);
  w.document.close();
  w.focus();
}
