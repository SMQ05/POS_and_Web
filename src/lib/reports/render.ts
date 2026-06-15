// Universal renderer that turns a ReportResult into either a print-window PDF
// (the user gets "Save as PDF") or a CSV download.

import type { AppSettings } from '@/types';
import type { ReportColumn, ReportResult } from './engine';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = (col: ReportColumn, raw: unknown): string => {
  if (raw == null || raw === '') return '—';
  if (col.type === 'currency') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    const abs = Math.abs(n);
    const s = `Rs. ${abs.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
    return n < 0 ? `(${s})` : s;
  }
  if (col.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    // Show with up to 1 dp for percent-like values; ints stay clean
    return Number.isInteger(n) ? n.toLocaleString('en-PK') : n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
  }
  if (col.type === 'date') {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString('en-PK');
  }
  return String(raw);
};

const badgeClassFor = (col: ReportColumn, value: unknown): string => {
  if (col.badgeClass) return col.badgeClass(value);
  const v = String(value).toLowerCase();
  if (v === 'a' || v === 'completed' || v === 'received' || v === 'ok') return 'bg-emerald';
  if (v === 'b' || v === 'ordered' || v === 'partial' || v === 'pending') return 'bg-amber';
  if (v === 'c' || v === 'cancelled' || v === 'returned' || v === 'expired' || v === 'out of stock' || v === '0-30 d') return 'bg-red';
  if (v === 'below reorder' || v === '31-60 d') return 'bg-amber';
  return 'bg-slate';
};

export function renderReportToPDF(result: ReportResult, settings: AppSettings, generatedBy?: string): void {
  const w = window.open('', '_blank', 'width=1200,height=900');
  if (!w) return;

  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}`;
  const generatedAt = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });

  const logoBlock = (settings.printCompanyLogo && settings.companyLogoUrl)
    ? `<img src="${esc(settings.companyLogoUrl)}" class="letterhead-logo" alt="logo">`
    : `<div class="letterhead-logo-placeholder">${esc((settings.companyName || 'K').slice(0, 2).toUpperCase())}</div>`;

  w.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(settings.companyName || 'Pharmacy')} — ${esc(result.title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; font-size: 10px; line-height: 1.45; background: #fff; }

  .letterhead { display: flex; align-items: center; gap: 14px; padding-bottom: 10px; border-bottom: 3px double #065f46; margin-bottom: 12px; }
  .letterhead-logo { width: 64px; height: 64px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 3px; }
  .letterhead-logo-placeholder { width: 64px; height: 64px; border-radius: 8px; background: linear-gradient(135deg, #065f46, #10b981); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; letter-spacing: 1px; }
  .letterhead-text h1 { font-size: 18px; color: #065f46; }
  .letterhead-text .addr { font-size: 10px; color: #475569; margin-top: 2px; }
  .letterhead-text .ids { font-size: 9px; color: #64748b; margin-top: 3px; display: flex; gap: 12px; flex-wrap: wrap; }
  .letterhead-text .ids b { color: #334155; }

  .banner { background: linear-gradient(135deg, #065f46, #047857); color: #fff; padding: 9px 12px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
  .banner h2 { font-size: 14px; font-weight: 700; }
  .banner h2 .sub { font-size: 10px; font-weight: 400; opacity: 0.9; margin-left: 6px; }
  .banner .meta { font-size: 9px; opacity: 0.9; text-align: right; }

  .summary { display: grid; grid-template-columns: repeat(${Math.min(result.summary.length, 5)}, 1fr); gap: 6px; margin-bottom: 12px; }
  .stat { border: 1px solid #e2e8f0; border-radius: 5px; padding: 6px 9px; background: #f8fafc; }
  .stat .label { font-size: 7px; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; font-weight: 600; }
  .stat .value { font-size: 13px; font-weight: 700; margin-top: 1px; font-variant-numeric: tabular-nums; }
  .stat.emerald .value { color: #047857; }
  .stat.red .value { color: #dc2626; }
  .stat.amber .value { color: #b45309; }
  .stat.blue .value { color: #2563eb; }

  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  thead th { background: #f1f5f9; color: #334155; font-weight: 600; text-align: left; padding: 5px 6px; border-bottom: 2px solid #cbd5e1; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.r { text-align: right; }
  tbody td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-variant-numeric: tabular-nums; }
  tbody td.r { text-align: right; }
  tbody tr:nth-child(even) { background: #fafbfc; }

  .badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 8px; font-weight: 600; color: #fff; }
  .badge.bg-emerald { background: #047857; }
  .badge.bg-amber { background: #d97706; }
  .badge.bg-red { background: #dc2626; }
  .badge.bg-slate { background: #64748b; color: #fff; }
  .badge.bg-blue { background: #2563eb; }

  .notes { margin-top: 10px; padding: 8px 10px; border-left: 3px solid #94a3b8; background: #f8fafc; font-size: 9px; color: #475569; border-radius: 0 4px 4px 0; }
  .notes ul { padding-left: 14px; }
  .notes li { margin: 1px 0; }

  .footer { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 7px; color: #94a3b8; text-align: center; }

  .print-btn { position: fixed; top: 14px; right: 14px; z-index: 999; padding: 8px 16px; background: #065f46; color: #fff; border: none; border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 3px 10px rgba(0,0,0,0.18); }
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
  <h2>${esc(result.title)}${result.subtitle ? `<span class="sub">· ${esc(result.subtitle)}</span>` : ''}</h2>
  <div class="meta">
    <div>Generated: ${generatedAt}</div>
    ${generatedBy ? `<div>By: ${esc(generatedBy)}</div>` : ''}
    <div>${reportId}</div>
  </div>
</div>

${result.summary.length > 0 ? `
<div class="summary">
  ${result.summary.map((t) => `
    <div class="stat ${t.tone || ''}">
      <div class="label">${esc(t.label)}</div>
      <div class="value">${esc(t.value)}</div>
    </div>
  `).join('')}
</div>` : ''}

${result.rows.length === 0 ? `
  <p style="color:#94a3b8;font-style:italic;padding:30px;text-align:center;border:1px dashed #e2e8f0;border-radius:8px">No data for this period / filter.</p>
` : `
<table>
  <thead>
    <tr>
      ${result.columns.map((c) => {
        const numeric = c.type === 'number' || c.type === 'currency';
        return `<th class="${numeric ? 'r' : ''}" ${c.width ? `style="width:${c.width}"` : ''}>${esc(c.label)}</th>`;
      }).join('')}
    </tr>
  </thead>
  <tbody>
    ${result.rows.map((row) => `
      <tr>
        ${result.columns.map((c) => {
          const numeric = c.type === 'number' || c.type === 'currency';
          const raw = row[c.key];
          if (c.type === 'badge') {
            return `<td><span class="badge ${badgeClassFor(c, raw)}">${esc(String(raw ?? ''))}</span></td>`;
          }
          return `<td class="${numeric ? 'r' : ''}">${esc(fmt(c, raw))}</td>`;
        }).join('')}
      </tr>
    `).join('')}
  </tbody>
</table>`}

${result.notes && result.notes.length > 0 ? `
<div class="notes">
  <strong>Notes</strong>
  <ul>
    ${result.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
  </ul>
</div>` : ''}

<div class="footer">
  ${esc(settings.companyName || 'Pharmacy')} · Kynex Pharmacloud · Confidential — for authorized personnel only.
</div>
</body></html>`);
  w.document.close();
  w.focus();
}

export function renderReportToCSV(result: ReportResult): void {
  const cell = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = result.columns.map((c) => cell(c.label)).join(',');
  const body = result.rows.map((row) =>
    result.columns.map((c) => {
      const raw = row[c.key];
      // For currency/number/date, store the raw value rather than the formatted string
      if (c.type === 'currency' || c.type === 'number') return cell(raw ?? '');
      if (c.type === 'date') {
        const d = raw ? new Date(String(raw)) : null;
        return cell(d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : raw ?? '');
      }
      return cell(raw ?? '');
    }).join(',')
  ).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${result.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
