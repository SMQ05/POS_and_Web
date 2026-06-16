// Comprehensive pharmacy reporting engine — Pakistan / India tailored.
//
// Design goals:
//   1. ONE TypeScript file holding the report registry so a developer can add
//      a new report by adding a single entry.
//   2. Reports are pure functions over the in-memory store data — no API calls.
//      They run instantly against whatever bootstrap fed the client.
//   3. Each report returns a uniform {summary, columns, rows} shape so a single
//      renderer (renderReportPDF / preview table) handles all of them.
//   4. Currency math uses tabular-nums for visual alignment. Numbers format with
//      the en-PK locale to match the country.
//
// Categories cover what's mandated by DRAP / FBR / typical pharmacy ops:
//   - Sales · Profit · Inventory · Purchases · Suppliers · Customers · Tax/FBR
//     · Regulatory (Rx + Controlled) · Financial · Operations
//
// Style of the printed PDF intentionally mirrors the Sales/Customers letterhead
// pattern already in src/lib/reportExport.ts so the entire product feels
// consistent.

import type {
  AppSettings,
  Batch,
  Customer,
  Expense,
  Medicine,
  Purchase,
  Sale,
  SaleReturn,
  Supplier,
} from '@/types';

// ─── Public types ───────────────────────────────────────────────────────────

export type ReportCategory =
  | 'sales'
  | 'profit'
  | 'inventory'
  | 'purchases'
  | 'suppliers'
  | 'customers'
  | 'tax'
  | 'regulatory'
  | 'financial'
  | 'operations';

export interface ReportColumn {
  key: string;
  label: string;
  /** 'number' / 'currency' get right-aligned and tabular-nums. */
  type?: 'string' | 'number' | 'currency' | 'date' | 'badge';
  /** Optional width hint (CSS string). */
  width?: string;
  /** For badge type — map row.key to a CSS class. */
  badgeClass?: (value: unknown) => string;
}

export interface ReportSummaryTile {
  label: string;
  value: string;
  /** 'emerald' / 'red' / 'amber' / 'blue' — tints the value text. */
  tone?: 'emerald' | 'red' | 'amber' | 'blue' | 'neutral';
}

export interface ReportResult {
  /** Friendly title shown at top of the PDF + preview dialog. */
  title: string;
  /** Subtitle / period / filter label. */
  subtitle?: string;
  /** Small KPI tiles printed above the table. */
  summary: ReportSummaryTile[];
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** Free-text notes / disclaimers printed below the table. */
  notes?: string[];
  /** When true, hide the totals row in the rendered PDF. */
  hideTotals?: boolean;
}

/** Input passed to every report runner. */
export interface ReportContext {
  settings: AppSettings;
  sales: Sale[];
  saleReturns: SaleReturn[];
  medicines: Medicine[];
  batches: Batch[];
  suppliers: Supplier[];
  purchases: Purchase[];
  customers: Customer[];
  expenses: Expense[];
  /** Effective date range — null start means "from beginning of time". */
  range: { start: Date | null; end: Date };
  /** Optional branch filter (null = all branches). */
  branchId?: string | null;
  /** Whether the current viewer can see profit numbers. */
  canSeeProfit: boolean;
  /** Active universal filters (drug type, salt, manufacturer, supplier, …). */
  filters?: ReportFilters;
  /**
   * Pre-computed set of medicineIds matching the medicine-dimension filters
   * (category / genericName / manufacturer / batchNumber). null = no medicine
   * filter active (match everything). Reports use `keepItem` / `matchMedicine`
   * to restrict line items without each re-deriving the set.
   */
  medicineIdSet?: Set<string> | null;
}

/** Universal report filters surfaced in the Reports page filter bar. */
export interface ReportFilters {
  category?: string;        // drug type / category
  genericName?: string;     // salt / generic (substring match)
  manufacturer?: string;
  supplierId?: string;      // distributor
  batchNumber?: string;     // exact batch
  customerId?: string;
  salesPersonId?: string;
}

/** True when a medicine passes the medicine-dimension filters. */
export function medicineMatchesFilters(m: Medicine, f: ReportFilters | undefined): boolean {
  if (!f) return true;
  if (f.category && (m.category ?? '') !== f.category) return false;
  if (f.manufacturer && (m.manufacturer ?? '') !== f.manufacturer) return false;
  if (f.genericName) {
    const g = (m.genericName ?? '').toLowerCase();
    if (!g.includes(f.genericName.toLowerCase())) return false;
  }
  return true;
}

/** Whether any medicine-dimension filter is active (vs record-level only). */
export function hasMedicineFilter(f: ReportFilters | undefined): boolean {
  return !!(f && (f.category || f.genericName || f.manufacturer || f.batchNumber));
}

/** Keep a sale line item under the active medicine filters. */
export function keepItem(
  item: { medicineId?: string; batchNumber?: string },
  ctx: ReportContext,
): boolean {
  const f = ctx.filters;
  if (!f) return true;
  if (f.batchNumber && (item.batchNumber ?? '') !== f.batchNumber) return false;
  if (ctx.medicineIdSet && (!item.medicineId || !ctx.medicineIdSet.has(item.medicineId))) return false;
  return true;
}

export interface ReportDef {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  /** Lucide icon name (resolved on render side). */
  icon: string;
  /** Tags shown as small chips on the card — eg "Daily", "DRAP", "GST". */
  tags?: string[];
  /** Set true to hide unless the viewer can see profit info. */
  profitOnly?: boolean;
  run: (ctx: ReportContext) => ReportResult;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const inRange = (date: Date | string | undefined, range: ReportContext['range']): boolean => {
  if (!date) return false;
  const d = new Date(date);
  if (range.start && d < range.start) return false;
  return d <= range.end;
};

const money = (n: number): string =>
  `Rs. ${n.toLocaleString('en-PK', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;

const dayKey = (d: Date | string): string => {
  const x = new Date(d);
  return x.toISOString().slice(0, 10);
};

const profitOf = (sale: Sale): number =>
  sale.items.reduce((s, i) => s + (i.profit ?? 0), 0);

const itemsOf = (sale: Sale): number =>
  sale.items.reduce((s, i) => s + i.quantity, 0);

// ─── Report runners ─────────────────────────────────────────────────────────

// ───────── Sales ────────────────────────────────────────────────────────────

const dailySalesRegister = (ctx: ReportContext): ReportResult => {
  const inWindow = ctx.sales.filter((s) => inRange(s.saleDate, ctx.range) && s.status !== 'cancelled');
  const buckets = new Map<string, { date: string; transactions: number; items: number; revenue: number; cash: number; card: number; other: number; returns: number }>();
  for (const s of inWindow) {
    const k = dayKey(s.saleDate);
    if (!buckets.has(k)) buckets.set(k, { date: k, transactions: 0, items: 0, revenue: 0, cash: 0, card: 0, other: 0, returns: 0 });
    const b = buckets.get(k)!;
    b.transactions += 1;
    b.items += itemsOf(s);
    b.revenue += s.totalAmount;
    for (const p of s.paymentMethods) {
      if (p.method === 'cash') b.cash += p.amount;
      else if (p.method === 'card') b.card += p.amount;
      else b.other += p.amount;
    }
    if (s.status === 'returned' || s.status === 'partial_returned') b.returns += s.totalAmount;
  }
  const rows = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalTx = rows.reduce((s, r) => s + r.transactions, 0);
  return {
    title: 'Daily Sales Register',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Days', value: rows.length.toLocaleString() },
      { label: 'Transactions', value: totalTx.toLocaleString(), tone: 'blue' },
      { label: 'Revenue', value: money(totalRevenue), tone: 'emerald' },
      { label: 'Avg / day', value: rows.length ? money(totalRevenue / rows.length) : '—' },
    ],
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'transactions', label: 'Txns', type: 'number' },
      { key: 'items', label: 'Items', type: 'number' },
      { key: 'cash', label: 'Cash', type: 'currency' },
      { key: 'card', label: 'Card', type: 'currency' },
      { key: 'other', label: 'Other', type: 'currency' },
      { key: 'returns', label: 'Returns', type: 'currency' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
    ],
    rows,
  };
};

const salesByHour = (ctx: ReportContext): ReportResult => {
  const buckets = new Array(24).fill(0).map((_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, transactions: 0, revenue: 0 }));
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    const h = new Date(s.saleDate).getHours();
    buckets[h].transactions += 1;
    buckets[h].revenue += s.totalAmount;
  }
  const peak = buckets.reduce((p, c) => (c.transactions > p.transactions ? c : p), buckets[0]);
  return {
    title: 'Sales by Hour (Peak Analysis)',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Peak hour', value: peak.hour, tone: 'blue' },
      { label: 'Peak transactions', value: peak.transactions.toLocaleString() },
      { label: 'Peak revenue', value: money(peak.revenue), tone: 'emerald' },
    ],
    columns: [
      { key: 'hour', label: 'Hour', type: 'string' },
      { key: 'transactions', label: 'Transactions', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
    ],
    rows: buckets,
    notes: ['Use this to plan staffing during peak hours and lunch breaks during quiet ones.'],
  };
};

const salesByCashier = (ctx: ReportContext): ReportResult => {
  const map = new Map<string, { user: string; transactions: number; items: number; revenue: number; profit: number; avg: number }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    const k = s.createdBy || 'Unknown';
    if (!map.has(k)) map.set(k, { user: k, transactions: 0, items: 0, revenue: 0, profit: 0, avg: 0 });
    const m = map.get(k)!;
    m.transactions += 1;
    m.items += itemsOf(s);
    m.revenue += s.totalAmount;
    m.profit += profitOf(s);
  }
  const rows = [...map.values()].map((r) => ({ ...r, avg: r.transactions ? r.revenue / r.transactions : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  return {
    title: 'Sales by Cashier / User',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Users', value: rows.length.toLocaleString() },
      { label: 'Total revenue', value: money(rows.reduce((s, r) => s + r.revenue, 0)), tone: 'emerald' },
      { label: 'Top performer', value: rows[0]?.user ?? '—', tone: 'blue' },
    ],
    columns: [
      { key: 'user', label: 'User' },
      { key: 'transactions', label: 'Txns', type: 'number' },
      { key: 'items', label: 'Items', type: 'number' },
      { key: 'avg', label: 'Avg Ticket', type: 'currency' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      ...(ctx.canSeeProfit ? [{ key: 'profit', label: 'Profit', type: 'currency' as const }] : []),
    ],
    rows,
  };
};

const salesByPaymentMethod = (ctx: ReportContext): ReportResult => {
  const map = new Map<string, { method: string; transactions: number; amount: number; share: number }>();
  let total = 0;
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    for (const p of s.paymentMethods) {
      if (!map.has(p.method)) map.set(p.method, { method: p.method, transactions: 0, amount: 0, share: 0 });
      const m = map.get(p.method)!;
      m.transactions += 1;
      m.amount += p.amount;
      total += p.amount;
    }
  }
  const rows = [...map.values()].map((r) => ({ ...r, method: r.method.replace('_', ' '), share: total > 0 ? (r.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
  return {
    title: 'Sales by Payment Method',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Total collected', value: money(total), tone: 'emerald' },
      { label: 'Channels used', value: rows.length.toLocaleString() },
    ],
    columns: [
      { key: 'method', label: 'Method' },
      { key: 'transactions', label: 'Transactions', type: 'number' },
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'share', label: 'Share %', type: 'number' },
    ],
    rows,
  };
};

const returnsRegister = (ctx: ReportContext): ReportResult => {
  const rows = ctx.saleReturns
    .filter((r) => inRange(r.returnDate, ctx.range))
    .map((r) => ({
      returnNumber: r.returnNumber,
      date: dayKey(r.returnDate),
      saleId: r.saleId,
      itemCount: r.items.length,
      qty: r.items.reduce((s, i) => s + i.quantity, 0),
      total: r.totalAmount,
      reason: r.reason || '—',
      method: r.refundMethod?.method ?? 'cash',
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    title: 'Returns Register',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Returns', value: rows.length.toLocaleString(), tone: 'red' },
      { label: 'Items returned', value: rows.reduce((s, r) => s + r.qty, 0).toLocaleString() },
      { label: 'Refunded value', value: money(rows.reduce((s, r) => s + r.total, 0)), tone: 'red' },
    ],
    columns: [
      { key: 'returnNumber', label: 'Return #' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'saleId', label: 'Sale ID' },
      { key: 'itemCount', label: 'Lines', type: 'number' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'method', label: 'Refund' },
      { key: 'reason', label: 'Reason' },
      { key: 'total', label: 'Amount', type: 'currency' },
    ],
    rows,
  };
};

const discountsGiven = (ctx: ReportContext): ReportResult => {
  const rows = ctx.sales
    .filter((s) => inRange(s.saleDate, ctx.range) && s.status !== 'cancelled' && s.discountAmount > 0)
    .map((s) => ({
      invoice: s.invoiceNumber,
      date: dayKey(s.saleDate),
      customer: s.customerName || 'Walk-in',
      discount: s.discountAmount,
      subtotal: s.subtotal,
      pct: s.subtotal > 0 ? (s.discountAmount / s.subtotal) * 100 : 0,
      total: s.totalAmount,
    }))
    .sort((a, b) => b.discount - a.discount);
  const totalDisc = rows.reduce((s, r) => s + r.discount, 0);
  return {
    title: 'Discounts Given',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Invoices', value: rows.length.toLocaleString() },
      { label: 'Total discount', value: money(totalDisc), tone: 'amber' },
      { label: 'Avg per invoice', value: rows.length ? money(totalDisc / rows.length) : '—' },
    ],
    columns: [
      { key: 'invoice', label: 'Invoice' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'customer', label: 'Customer' },
      { key: 'subtotal', label: 'Subtotal', type: 'currency' },
      { key: 'discount', label: 'Discount', type: 'currency' },
      { key: 'pct', label: '%', type: 'number' },
      { key: 'total', label: 'Net Total', type: 'currency' },
    ],
    rows,
  };
};

// ───────── Profit ───────────────────────────────────────────────────────────

const grossProfitByDay = (ctx: ReportContext): ReportResult => {
  const buckets = new Map<string, { date: string; revenue: number; cost: number; profit: number; margin: number }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    const k = dayKey(s.saleDate);
    if (!buckets.has(k)) buckets.set(k, { date: k, revenue: 0, cost: 0, profit: 0, margin: 0 });
    const b = buckets.get(k)!;
    b.revenue += s.totalAmount;
    for (const i of s.items) {
      b.cost += i.purchasePrice * i.quantity;
      b.profit += i.profit ?? 0;
    }
  }
  const rows = [...buckets.values()]
    .map((r) => ({ ...r, margin: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  return {
    title: 'Gross Profit by Day',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Revenue', value: money(totalRev), tone: 'emerald' },
      { label: 'Cost', value: money(rows.reduce((s, r) => s + r.cost, 0)) },
      { label: 'Gross profit', value: money(totalProfit), tone: 'emerald' },
      { label: 'Margin %', value: totalRev > 0 ? `${((totalProfit / totalRev) * 100).toFixed(1)}%` : '—', tone: 'blue' },
    ],
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'cost', label: 'Cost', type: 'currency' },
      { key: 'profit', label: 'Profit', type: 'currency' },
      { key: 'margin', label: 'Margin %', type: 'number' },
    ],
    rows,
  };
};

const profitByProduct = (ctx: ReportContext): ReportResult => {
  const map = new Map<string, { product: string; generic: string; qty: number; revenue: number; cost: number; profit: number; margin: number }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    for (const i of s.items) {
      if (!keepItem(i, ctx)) continue;
      const med = ctx.medicines.find((m) => m.id === i.medicineId);
      const k = i.medicineId;
      if (!map.has(k)) map.set(k, { product: med?.name ?? 'Unknown', generic: med?.genericName ?? '—', qty: 0, revenue: 0, cost: 0, profit: 0, margin: 0 });
      const e = map.get(k)!;
      e.qty += i.quantity;
      e.revenue += i.total;
      e.cost += i.purchasePrice * i.quantity;
      e.profit += i.profit ?? 0;
    }
  }
  const rows = [...map.values()]
    .map((r) => ({ ...r, margin: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0 }))
    .sort((a, b) => b.profit - a.profit);
  return {
    title: 'Profit by Product',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'SKUs sold', value: rows.length.toLocaleString() },
      { label: 'Total profit', value: money(rows.reduce((s, r) => s + r.profit, 0)), tone: 'emerald' },
      { label: 'Top profit', value: rows[0]?.product ?? '—', tone: 'blue' },
    ],
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'generic', label: 'Generic' },
      { key: 'qty', label: 'Qty Sold', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'cost', label: 'Cost', type: 'currency' },
      { key: 'profit', label: 'Profit', type: 'currency' },
      { key: 'margin', label: 'Margin %', type: 'number' },
    ],
    rows,
  };
};

const profitByCategory = (ctx: ReportContext): ReportResult => {
  const map = new Map<string, { category: string; qty: number; revenue: number; profit: number; margin: number }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    for (const i of s.items) {
      if (!keepItem(i, ctx)) continue;
      const med = ctx.medicines.find((m) => m.id === i.medicineId);
      const cat = med?.category ?? 'uncategorized';
      if (!map.has(cat)) map.set(cat, { category: cat, qty: 0, revenue: 0, profit: 0, margin: 0 });
      const e = map.get(cat)!;
      e.qty += i.quantity;
      e.revenue += i.total;
      e.profit += i.profit ?? 0;
    }
  }
  const rows = [...map.values()].map((r) => ({ ...r, margin: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);
  return {
    title: 'Profit by Category',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Categories', value: rows.length.toLocaleString() },
      { label: 'Revenue', value: money(rows.reduce((s, r) => s + r.revenue, 0)), tone: 'emerald' },
      { label: 'Profit', value: money(rows.reduce((s, r) => s + r.profit, 0)), tone: 'emerald' },
    ],
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'qty', label: 'Qty Sold', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'profit', label: 'Profit', type: 'currency' },
      { key: 'margin', label: 'Margin %', type: 'number' },
    ],
    rows,
  };
};

const profitByBatch = (ctx: ReportContext): ReportResult => {
  // Map each sold item back to its batch via batchId, then aggregate.
  const map = new Map<string, { batchNo: string; medicine: string; qty: number; revenue: number; cost: number; profit: number; margin: number; expiry: string }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    for (const i of s.items) {
      if (!keepItem(i, ctx)) continue;
      const batch = ctx.batches.find((b) => b.id === i.batchId);
      if (!batch) continue;
      const med = ctx.medicines.find((m) => m.id === i.medicineId);
      const k = batch.id;
      if (!map.has(k)) map.set(k, {
        batchNo: batch.batchNumber,
        medicine: med?.name ?? 'Unknown',
        qty: 0, revenue: 0, cost: 0, profit: 0, margin: 0,
        expiry: dayKey(batch.expiryDate),
      });
      const e = map.get(k)!;
      e.qty += i.quantity;
      e.revenue += i.total;
      e.cost += i.purchasePrice * i.quantity;
      e.profit += i.profit ?? 0;
    }
  }
  const rows = [...map.values()].map((r) => ({ ...r, margin: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0 })).sort((a, b) => b.profit - a.profit);
  return {
    title: 'Profit by Batch',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Batches sold', value: rows.length.toLocaleString() },
      { label: 'Profit', value: money(rows.reduce((s, r) => s + r.profit, 0)), tone: 'emerald' },
    ],
    columns: [
      { key: 'batchNo', label: 'Batch #' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'expiry', label: 'Expiry', type: 'date' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'cost', label: 'Cost', type: 'currency' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'profit', label: 'Profit', type: 'currency' },
      { key: 'margin', label: 'Margin %', type: 'number' },
    ],
    rows,
    notes: ['Low-margin batches may indicate under-pricing or supplier markup changes. Review with the procurement team.'],
  };
};

const profitBySupplier = (ctx: ReportContext): ReportResult => {
  // Trace each sold item to the batch → supplier.
  const map = new Map<string, { supplier: string; qty: number; revenue: number; cost: number; profit: number; margin: number }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    for (const i of s.items) {
      const batch = ctx.batches.find((b) => b.id === i.batchId);
      const supplierId = batch?.supplierId ?? 'unknown';
      const sup = ctx.suppliers.find((x) => x.id === supplierId);
      const k = supplierId;
      if (!map.has(k)) map.set(k, { supplier: sup?.name ?? (supplierId === 'loose' ? 'Loose Purchase' : 'Unknown'), qty: 0, revenue: 0, cost: 0, profit: 0, margin: 0 });
      const e = map.get(k)!;
      e.qty += i.quantity;
      e.revenue += i.total;
      e.cost += i.purchasePrice * i.quantity;
      e.profit += i.profit ?? 0;
    }
  }
  const rows = [...map.values()].map((r) => ({ ...r, margin: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0 })).sort((a, b) => b.profit - a.profit);
  return {
    title: 'Profit by Supplier',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Suppliers', value: rows.length.toLocaleString() },
      { label: 'Profit', value: money(rows.reduce((s, r) => s + r.profit, 0)), tone: 'emerald' },
      { label: 'Best margin', value: rows.sort((a, b) => b.margin - a.margin)[0]?.supplier ?? '—', tone: 'blue' },
    ],
    columns: [
      { key: 'supplier', label: 'Supplier' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'cost', label: 'Cost', type: 'currency' },
      { key: 'profit', label: 'Profit', type: 'currency' },
      { key: 'margin', label: 'Margin %', type: 'number' },
    ],
    rows: rows.sort((a, b) => b.profit - a.profit),
  };
};

// ───────── Inventory ────────────────────────────────────────────────────────

const stockValuation = (ctx: ReportContext): ReportResult => {
  const rows = ctx.medicines
    .filter((m) => m.isActive)
    .map((m) => {
      const bs = ctx.batches.filter((b) => b.medicineId === m.id && b.isActive && b.quantity > 0);
      const qty = bs.reduce((s, b) => s + b.quantity, 0);
      const costValue = bs.reduce((s, b) => s + b.quantity * b.purchasePrice, 0);
      const mrpValue = bs.reduce((s, b) => s + b.quantity * b.mrp, 0);
      return {
        medicine: m.name,
        category: m.category,
        qty,
        batches: bs.length,
        cost: costValue,
        mrp: mrpValue,
        unrealized: mrpValue - costValue,
      };
    })
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.mrp - a.mrp);
  return {
    title: 'Stock Valuation',
    subtitle: 'As of ' + new Date().toLocaleDateString('en-PK'),
    summary: [
      { label: 'SKUs in stock', value: rows.length.toLocaleString() },
      { label: 'Cost value', value: money(rows.reduce((s, r) => s + r.cost, 0)) },
      { label: 'MRP value', value: money(rows.reduce((s, r) => s + r.mrp, 0)), tone: 'emerald' },
      { label: 'Unrealized profit', value: money(rows.reduce((s, r) => s + r.unrealized, 0)), tone: 'blue' },
    ],
    columns: [
      { key: 'medicine', label: 'Medicine' },
      { key: 'category', label: 'Category' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'batches', label: 'Batches', type: 'number' },
      { key: 'cost', label: 'Cost Value', type: 'currency' },
      { key: 'mrp', label: 'MRP Value', type: 'currency' },
      { key: 'unrealized', label: 'Unrealized Profit', type: 'currency' },
    ],
    rows,
  };
};

const batchRegister = (ctx: ReportContext): ReportResult => {
  const rows = ctx.batches
    .filter((b) => b.isActive)
    .map((b) => {
      const med = ctx.medicines.find((m) => m.id === b.medicineId);
      const sup = ctx.suppliers.find((s) => s.id === b.supplierId);
      const daysToExpiry = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86_400_000);
      return {
        batchNo: b.batchNumber,
        medicine: med?.name ?? 'Unknown',
        supplier: sup?.name ?? (b.supplierId === 'loose' ? 'Loose' : '—'),
        qty: b.quantity,
        expiry: dayKey(b.expiryDate),
        daysToExpiry,
        purchasePrice: b.purchasePrice,
        mrp: b.mrp,
        value: b.quantity * b.purchasePrice,
      };
    })
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  return {
    title: 'Batch Register',
    subtitle: 'All active batches',
    summary: [
      { label: 'Batches', value: rows.length.toLocaleString() },
      { label: 'Total stock value', value: money(rows.reduce((s, r) => s + r.value, 0)) },
      { label: 'Expiring ≤ 30 days', value: rows.filter((r) => r.daysToExpiry <= 30 && r.daysToExpiry > 0).length.toLocaleString(), tone: 'amber' },
      { label: 'Already expired', value: rows.filter((r) => r.daysToExpiry < 0).length.toLocaleString(), tone: 'red' },
    ],
    columns: [
      { key: 'batchNo', label: 'Batch #' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'expiry', label: 'Expiry', type: 'date' },
      { key: 'daysToExpiry', label: 'Days Left', type: 'number' },
      { key: 'purchasePrice', label: 'Cost', type: 'currency' },
      { key: 'mrp', label: 'MRP', type: 'currency' },
      { key: 'value', label: 'Stock Value', type: 'currency' },
    ],
    rows,
  };
};

const expiryReport = (ctx: ReportContext): ReportResult => {
  const rows = ctx.batches
    .filter((b) => b.isActive && b.quantity > 0)
    .map((b) => {
      const med = ctx.medicines.find((m) => m.id === b.medicineId);
      const days = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86_400_000);
      const bucket = days < 0 ? 'Expired' : days <= 30 ? '0-30 d' : days <= 60 ? '31-60 d' : days <= 90 ? '61-90 d' : '> 90 d';
      return {
        batchNo: b.batchNumber,
        medicine: med?.name ?? 'Unknown',
        qty: b.quantity,
        expiry: dayKey(b.expiryDate),
        days,
        bucket,
        potentialLoss: b.quantity * b.purchasePrice,
      };
    })
    .filter((r) => r.days <= 90)
    .sort((a, b) => a.days - b.days);
  return {
    title: 'Expiry Report (≤ 90 days + Expired)',
    subtitle: 'Critical for write-off planning',
    summary: [
      { label: 'Expired', value: rows.filter((r) => r.bucket === 'Expired').length.toLocaleString(), tone: 'red' },
      { label: '0-30 days', value: rows.filter((r) => r.bucket === '0-30 d').length.toLocaleString(), tone: 'amber' },
      { label: '31-60 days', value: rows.filter((r) => r.bucket === '31-60 d').length.toLocaleString() },
      { label: 'Total loss exposure', value: money(rows.reduce((s, r) => s + r.potentialLoss, 0)), tone: 'red' },
    ],
    columns: [
      { key: 'batchNo', label: 'Batch #' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'expiry', label: 'Expiry', type: 'date' },
      { key: 'days', label: 'Days', type: 'number' },
      { key: 'bucket', label: 'Bucket', type: 'badge' },
      { key: 'potentialLoss', label: 'Potential Loss', type: 'currency' },
    ],
    rows,
    notes: ['Expired batches should be physically segregated, marked, and written off per DRAP guidelines. Photograph the destruction for audit.'],
  };
};

const slowMovers = (ctx: ReportContext): ReportResult => {
  // Last sale date per medicine
  const lastSold = new Map<string, Date>();
  for (const s of ctx.sales) {
    if (s.status === 'cancelled') continue;
    for (const i of s.items) {
      const d = new Date(s.saleDate);
      const prev = lastSold.get(i.medicineId);
      if (!prev || d > prev) lastSold.set(i.medicineId, d);
    }
  }
  const now = Date.now();
  const rows = ctx.medicines
    .filter((m) => m.isActive)
    .map((m) => {
      const bs = ctx.batches.filter((b) => b.medicineId === m.id && b.isActive && b.quantity > 0);
      const qty = bs.reduce((s, b) => s + b.quantity, 0);
      const value = bs.reduce((s, b) => s + b.quantity * b.purchasePrice, 0);
      const last = lastSold.get(m.id);
      const days = last ? Math.floor((now - last.getTime()) / 86_400_000) : 9999;
      return {
        medicine: m.name,
        category: m.category,
        qty,
        value,
        lastSold: last ? dayKey(last) : 'Never',
        daysSince: days,
      };
    })
    .filter((r) => r.qty > 0 && r.daysSince >= 30)
    .sort((a, b) => b.daysSince - a.daysSince);
  return {
    title: 'Slow Movers (≥ 30 days)',
    subtitle: 'Stock not sold recently',
    summary: [
      { label: 'Slow SKUs', value: rows.length.toLocaleString(), tone: 'amber' },
      { label: 'Tied-up capital', value: money(rows.reduce((s, r) => s + r.value, 0)), tone: 'amber' },
      { label: 'Never sold', value: rows.filter((r) => r.lastSold === 'Never').length.toLocaleString(), tone: 'red' },
    ],
    columns: [
      { key: 'medicine', label: 'Medicine' },
      { key: 'category', label: 'Category' },
      { key: 'qty', label: 'In Stock', type: 'number' },
      { key: 'value', label: 'Value', type: 'currency' },
      { key: 'lastSold', label: 'Last Sold', type: 'date' },
      { key: 'daysSince', label: 'Days Idle', type: 'number' },
    ],
    rows,
    notes: ['Consider running a discount campaign or returning slow movers to the supplier before they expire.'],
  };
};

const reorderRequired = (ctx: ReportContext): ReportResult => {
  const rows = ctx.medicines
    .filter((m) => m.isActive)
    .map((m) => {
      const bs = ctx.batches.filter((b) => b.medicineId === m.id && b.isActive && b.quantity > 0);
      const qty = bs.reduce((s, b) => s + b.quantity, 0);
      return {
        medicine: m.name,
        category: m.category,
        qty,
        reorderLevel: m.reorderLevel,
        reorderQty: m.reorderQuantity,
        deficit: Math.max(0, m.reorderLevel - qty),
        status: qty === 0 ? 'Out of stock' : qty <= m.reorderLevel ? 'Below reorder' : 'OK',
      };
    })
    .filter((r) => r.status !== 'OK')
    .sort((a, b) => a.qty - b.qty);
  return {
    title: 'Reorder Required',
    subtitle: 'Items below their reorder level',
    summary: [
      { label: 'Out of stock', value: rows.filter((r) => r.status === 'Out of stock').length.toLocaleString(), tone: 'red' },
      { label: 'Below reorder', value: rows.filter((r) => r.status === 'Below reorder').length.toLocaleString(), tone: 'amber' },
      { label: 'Suggested order qty', value: rows.reduce((s, r) => s + r.reorderQty, 0).toLocaleString(), tone: 'blue' },
    ],
    columns: [
      { key: 'medicine', label: 'Medicine' },
      { key: 'category', label: 'Category' },
      { key: 'qty', label: 'In Stock', type: 'number' },
      { key: 'reorderLevel', label: 'Reorder Lvl', type: 'number' },
      { key: 'reorderQty', label: 'Reorder Qty', type: 'number' },
      { key: 'status', label: 'Status', type: 'badge' },
    ],
    rows,
  };
};

const abcAnalysis = (ctx: ReportContext): ReportResult => {
  // Compute revenue contribution per medicine and bucket into A (top 80%), B (next 15%), C (last 5%).
  const map = new Map<string, { medicine: string; revenue: number; share: number; class: string }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    for (const i of s.items) {
      const med = ctx.medicines.find((m) => m.id === i.medicineId);
      const k = i.medicineId;
      if (!map.has(k)) map.set(k, { medicine: med?.name ?? 'Unknown', revenue: 0, share: 0, class: 'C' });
      map.get(k)!.revenue += i.total;
    }
  }
  const list = [...map.values()].sort((a, b) => b.revenue - a.revenue);
  const total = list.reduce((s, r) => s + r.revenue, 0);
  let acc = 0;
  for (const r of list) {
    r.share = total > 0 ? (r.revenue / total) * 100 : 0;
    acc += r.share;
    r.class = acc <= 80 ? 'A' : acc <= 95 ? 'B' : 'C';
  }
  return {
    title: 'ABC Analysis (Pareto)',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Class A (top 80%)', value: list.filter((r) => r.class === 'A').length.toLocaleString(), tone: 'emerald' },
      { label: 'Class B', value: list.filter((r) => r.class === 'B').length.toLocaleString(), tone: 'blue' },
      { label: 'Class C', value: list.filter((r) => r.class === 'C').length.toLocaleString() },
      { label: 'Total revenue', value: money(total) },
    ],
    columns: [
      { key: 'class', label: 'Class', type: 'badge' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'share', label: 'Share %', type: 'number' },
    ],
    rows: list,
    notes: ['Focus inventory management and supplier negotiations on Class A items — they drive 80% of revenue.'],
  };
};

// ───────── Purchases ────────────────────────────────────────────────────────

const purchaseRegister = (ctx: ReportContext): ReportResult => {
  const rows = ctx.purchases
    .filter((p) => inRange(p.purchaseDate, ctx.range) && p.status !== 'cancelled')
    .map((p) => {
      const sup = ctx.suppliers.find((s) => s.id === p.supplierId);
      return {
        poNumber: p.purchaseNumber,
        supplier: p.isLoose ? `Loose: ${p.looseSource || '—'}` : sup?.name ?? '—',
        date: dayKey(p.purchaseDate),
        items: p.items.length,
        total: p.totalAmount,
        paid: p.paidAmount,
        balance: p.balanceAmount,
        status: p.status,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    title: 'Purchase Register',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'POs', value: rows.length.toLocaleString() },
      { label: 'Total value', value: money(rows.reduce((s, r) => s + r.total, 0)) },
      { label: 'Outstanding', value: money(rows.reduce((s, r) => s + r.balance, 0)), tone: 'red' },
    ],
    columns: [
      { key: 'poNumber', label: 'PO #' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'items', label: 'Lines', type: 'number' },
      { key: 'total', label: 'Total', type: 'currency' },
      { key: 'paid', label: 'Paid', type: 'currency' },
      { key: 'balance', label: 'Balance', type: 'currency' },
      { key: 'status', label: 'Status', type: 'badge' },
    ],
    rows,
  };
};

const loosePurchaseRegister = (ctx: ReportContext): ReportResult => {
  const rows = ctx.purchases
    .filter((p) => p.isLoose && inRange(p.purchaseDate, ctx.range))
    .map((p) => {
      const med = p.items[0] ? ctx.medicines.find((m) => m.id === p.items[0].medicineId) : null;
      return {
        ref: p.purchaseNumber,
        date: dayKey(p.purchaseDate),
        source: p.looseSource || '—',
        medicine: med?.name ?? '—',
        qty: p.items.reduce((s, i) => s + i.quantity, 0),
        total: p.totalAmount,
        notes: p.notes || '',
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    title: 'Loose Purchase Register',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Loose purchases', value: rows.length.toLocaleString(), tone: 'amber' },
      { label: 'Total spent', value: money(rows.reduce((s, r) => s + r.total, 0)) },
    ],
    columns: [
      { key: 'ref', label: 'Reference' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'source', label: 'Bought From' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'total', label: 'Total', type: 'currency' },
      { key: 'notes', label: 'Notes' },
    ],
    rows,
    notes: ['Loose purchases bypass the supplier ledger — review monthly to detect over-reliance on emergency buys (poor stock planning).'],
  };
};

// ───────── Suppliers ────────────────────────────────────────────────────────

const supplierOutstanding = (ctx: ReportContext): ReportResult => {
  // Per-supplier outstanding totals plus aging buckets driven by each PO's due date.
  const rows = ctx.suppliers.map((s) => {
    const open = ctx.purchases.filter((p) => p.supplierId === s.id && p.status !== 'cancelled' && p.balanceAmount > 0);
    const now = Date.now();
    const bucket = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    for (const p of open) {
      const due = p.dueDate ? new Date(p.dueDate) : new Date(p.purchaseDate);
      const overdueDays = Math.floor((now - due.getTime()) / 86_400_000);
      if (overdueDays <= 0) bucket.current += p.balanceAmount;
      else if (overdueDays <= 30) bucket.d30 += p.balanceAmount;
      else if (overdueDays <= 60) bucket.d60 += p.balanceAmount;
      else if (overdueDays <= 90) bucket.d90 += p.balanceAmount;
      else bucket.over90 += p.balanceAmount;
    }
    return {
      supplier: s.name,
      openPOs: open.length,
      ...bucket,
      total: bucket.current + bucket.d30 + bucket.d60 + bucket.d90 + bucket.over90,
    };
  }).filter((r) => r.total > 0).sort((a, b) => b.over90 - a.over90 || b.total - a.total);
  return {
    title: 'Supplier Outstanding (Aged)',
    subtitle: 'Payables broken down by overdue age',
    summary: [
      { label: 'Suppliers w/ balance', value: rows.length.toLocaleString() },
      { label: 'Total payable', value: money(rows.reduce((s, r) => s + r.total, 0)), tone: 'red' },
      { label: '90+ days overdue', value: money(rows.reduce((s, r) => s + r.over90, 0)), tone: 'red' },
    ],
    columns: [
      { key: 'supplier', label: 'Supplier' },
      { key: 'openPOs', label: 'Open POs', type: 'number' },
      { key: 'current', label: 'Current', type: 'currency' },
      { key: 'd30', label: '1-30 d', type: 'currency' },
      { key: 'd60', label: '31-60 d', type: 'currency' },
      { key: 'd90', label: '61-90 d', type: 'currency' },
      { key: 'over90', label: '90+ d', type: 'currency' },
      { key: 'total', label: 'Total', type: 'currency' },
    ],
    rows,
  };
};

// ───────── Customers ────────────────────────────────────────────────────────

const topCustomers = (ctx: ReportContext): ReportResult => {
  const map = new Map<string, { name: string; phone: string; transactions: number; items: number; revenue: number; loyalty: number; lastVisit: string }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    const key = s.customerPhone || s.customerName || 'Walk-in';
    if (!map.has(key)) map.set(key, { name: s.customerName || 'Walk-in', phone: s.customerPhone || '—', transactions: 0, items: 0, revenue: 0, loyalty: 0, lastVisit: '' });
    const e = map.get(key)!;
    e.transactions += 1;
    e.items += itemsOf(s);
    e.revenue += s.totalAmount;
    const k = dayKey(s.saleDate);
    if (!e.lastVisit || k > e.lastVisit) e.lastVisit = k;
  }
  // Layer loyalty from customer master
  for (const c of ctx.customers) {
    const e = map.get(c.phone) || map.get(c.name);
    if (e) e.loyalty = c.loyaltyPoints;
  }
  const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue);
  return {
    title: 'Top Customers',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Customers', value: rows.length.toLocaleString() },
      { label: 'Revenue', value: money(rows.reduce((s, r) => s + r.revenue, 0)), tone: 'emerald' },
      { label: 'Avg / customer', value: rows.length ? money(rows.reduce((s, r) => s + r.revenue, 0) / rows.length) : '—' },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'transactions', label: 'Visits', type: 'number' },
      { key: 'items', label: 'Items', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'loyalty', label: 'Loyalty Pts', type: 'number' },
      { key: 'lastVisit', label: 'Last Visit', type: 'date' },
    ],
    rows,
  };
};

// ───────── Tax / FBR ────────────────────────────────────────────────────────

const fbrOutputTax = (ctx: ReportContext): ReportResult => {
  const rows = ctx.sales
    .filter((s) => inRange(s.saleDate, ctx.range) && s.status !== 'cancelled')
    .map((s) => {
      const taxableBase = s.subtotal - s.discountAmount;
      const rate = taxableBase > 0 ? (s.taxAmount / taxableBase) * 100 : 0;
      return {
        invoice: s.invoiceNumber,
        date: dayKey(s.saleDate),
        buyer: s.customerName || 'Walk-in',
        buyerCnic: s.customerCnic || '—',
        taxable: taxableBase,
        rate,
        tax: s.taxAmount,
        total: s.totalAmount,
        fbrStatus: s.fbrStatus || 'not_integrated',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    title: 'FBR Output Sales Tax Register',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Invoices', value: rows.length.toLocaleString() },
      { label: 'Taxable supply', value: money(rows.reduce((s, r) => s + r.taxable, 0)) },
      { label: 'Output tax', value: money(rows.reduce((s, r) => s + r.tax, 0)), tone: 'blue' },
    ],
    columns: [
      { key: 'invoice', label: 'Invoice #' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'buyer', label: 'Buyer' },
      { key: 'buyerCnic', label: 'CNIC/NTN' },
      { key: 'taxable', label: 'Taxable', type: 'currency' },
      { key: 'rate', label: 'Rate %', type: 'number' },
      { key: 'tax', label: 'Tax', type: 'currency' },
      { key: 'total', label: 'Total', type: 'currency' },
      { key: 'fbrStatus', label: 'FBR' },
    ],
    rows,
    notes: ['Filed monthly with FBR. Cross-check this register with your Annex-C output table.'],
  };
};

const fbrInputTax = (ctx: ReportContext): ReportResult => {
  const rows = ctx.purchases
    .filter((p) => inRange(p.purchaseDate, ctx.range) && p.status !== 'cancelled' && !p.isLoose)
    .map((p) => {
      const sup = ctx.suppliers.find((s) => s.id === p.supplierId);
      const subtotal = p.subtotal;
      const tax = p.taxAmount;
      return {
        poNumber: p.purchaseNumber,
        invoiceRef: p.supplierInvoiceNumber || '—',
        date: dayKey(p.purchaseDate),
        supplier: sup?.name ?? '—',
        supplierNtn: sup?.ntn || '—',
        taxable: subtotal - p.discountAmount,
        tax,
        total: p.totalAmount,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    title: 'FBR Input Sales Tax Register',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Purchases', value: rows.length.toLocaleString() },
      { label: 'Taxable supply', value: money(rows.reduce((s, r) => s + r.taxable, 0)) },
      { label: 'Input tax claim', value: money(rows.reduce((s, r) => s + r.tax, 0)), tone: 'emerald' },
    ],
    columns: [
      { key: 'poNumber', label: 'PO #' },
      { key: 'invoiceRef', label: 'Supplier Invoice' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'supplierNtn', label: 'NTN' },
      { key: 'taxable', label: 'Taxable', type: 'currency' },
      { key: 'tax', label: 'Tax', type: 'currency' },
      { key: 'total', label: 'Total', type: 'currency' },
    ],
    rows,
    notes: ['Filed in Annex-A. Loose purchases excluded (no tax invoice from source pharmacy).'],
  };
};

const monthlyTaxSummary = (ctx: ReportContext): ReportResult => {
  // One row per calendar month in range
  const months = new Map<string, { month: string; sales: number; output: number; purchases: number; input: number; net: number }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    const k = new Date(s.saleDate).toISOString().slice(0, 7);
    if (!months.has(k)) months.set(k, { month: k, sales: 0, output: 0, purchases: 0, input: 0, net: 0 });
    const e = months.get(k)!;
    e.sales += s.totalAmount;
    e.output += s.taxAmount;
  }
  for (const p of ctx.purchases) {
    if (!inRange(p.purchaseDate, ctx.range) || p.status === 'cancelled' || p.isLoose) continue;
    const k = new Date(p.purchaseDate).toISOString().slice(0, 7);
    if (!months.has(k)) months.set(k, { month: k, sales: 0, output: 0, purchases: 0, input: 0, net: 0 });
    const e = months.get(k)!;
    e.purchases += p.totalAmount;
    e.input += p.taxAmount;
  }
  const rows = [...months.values()].map((r) => ({ ...r, net: r.output - r.input })).sort((a, b) => a.month.localeCompare(b.month));
  return {
    title: 'Monthly FBR Tax Filing Summary',
    subtitle: 'Output − Input = Net payable',
    summary: [
      { label: 'Output tax', value: money(rows.reduce((s, r) => s + r.output, 0)), tone: 'blue' },
      { label: 'Input tax', value: money(rows.reduce((s, r) => s + r.input, 0)), tone: 'emerald' },
      { label: 'Net payable', value: money(rows.reduce((s, r) => s + r.net, 0)), tone: 'red' },
    ],
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'sales', label: 'Sales', type: 'currency' },
      { key: 'output', label: 'Output Tax', type: 'currency' },
      { key: 'purchases', label: 'Purchases', type: 'currency' },
      { key: 'input', label: 'Input Tax', type: 'currency' },
      { key: 'net', label: 'Net Payable', type: 'currency' },
    ],
    rows,
  };
};

// ───────── Regulatory ───────────────────────────────────────────────────────

const controlledDrugRegister = (ctx: ReportContext): ReportResult => {
  // For each sale that contains a controlled-class medicine, emit one row PER controlled item.
  const rows: Array<Record<string, unknown>> = [];
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    for (const i of s.items) {
      const med = ctx.medicines.find((m) => m.id === i.medicineId);
      if (med?.classification !== 'controlled') continue;
      rows.push({
        date: dayKey(s.saleDate),
        invoice: s.invoiceNumber,
        medicine: med.name,
        strength: med.strength,
        schedule: med.controlledSchedule || '—',
        batchNo: i.batchNumber,
        qty: i.quantity,
        customer: s.customerName || 'Walk-in',
        customerCnic: s.customerCnic || '—',
        doctor: s.doctorName || '—',
        rxNumber: s.prescriptionNumber || '—',
        hasRxImage: s.prescriptionImageUrl ? 'Yes' : 'No',
      });
    }
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    title: 'Controlled Drug Sales Register (Form-K style)',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Dispensations', value: rows.length.toLocaleString(), tone: 'red' },
      { label: 'Quantity', value: rows.reduce((s, r) => s + Number(r.qty), 0).toLocaleString() },
      { label: 'With Rx attached', value: rows.filter((r) => r.hasRxImage === 'Yes').length.toLocaleString(), tone: 'emerald' },
    ],
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'invoice', label: 'Invoice' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'strength', label: 'Strength' },
      { key: 'schedule', label: 'Schedule' },
      { key: 'batchNo', label: 'Batch' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'customer', label: 'Customer' },
      { key: 'customerCnic', label: 'CNIC' },
      { key: 'doctor', label: 'Doctor' },
      { key: 'rxNumber', label: 'Rx #' },
      { key: 'hasRxImage', label: 'Rx Image' },
    ],
    rows,
    notes: [
      'Maintain physically + digitally per Pakistan Drug Act 1976 and Narcotic Substances Act 1997.',
      'Inspectors verify quantities against the controlled-drug stock register quarterly.',
    ],
  };
};

const prescriptionDrugRegister = (ctx: ReportContext): ReportResult => {
  const rows: Array<Record<string, unknown>> = [];
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled' || !s.isPrescription) continue;
    for (const i of s.items) {
      const med = ctx.medicines.find((m) => m.id === i.medicineId);
      if (!med?.isPrescriptionRequired && med?.classification !== 'prescription') continue;
      rows.push({
        date: dayKey(s.saleDate),
        invoice: s.invoiceNumber,
        medicine: med.name,
        qty: i.quantity,
        customer: s.customerName || 'Walk-in',
        doctor: s.doctorName || '—',
        rxNumber: s.prescriptionNumber || '—',
        hasRxImage: s.prescriptionImageUrl ? 'Yes' : 'No',
      });
    }
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    title: 'Prescription Drug Sales Register',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Rx dispensations', value: rows.length.toLocaleString(), tone: 'blue' },
      { label: 'With Rx attached', value: rows.filter((r) => r.hasRxImage === 'Yes').length.toLocaleString(), tone: 'emerald' },
      { label: 'Without Rx', value: rows.filter((r) => r.hasRxImage === 'No').length.toLocaleString(), tone: 'amber' },
    ],
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'invoice', label: 'Invoice' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'customer', label: 'Customer' },
      { key: 'doctor', label: 'Doctor' },
      { key: 'rxNumber', label: 'Rx #' },
      { key: 'hasRxImage', label: 'Rx Image' },
    ],
    rows,
  };
};

const doctorWisePrescriptions = (ctx: ReportContext): ReportResult => {
  const map = new Map<string, { doctor: string; prescriptions: number; items: number; revenue: number; topMedicine: string; topQty: number }>();
  // Track top medicine per doctor
  const docMed = new Map<string, Map<string, number>>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled' || !s.isPrescription) continue;
    const d = s.doctorName || 'Unknown';
    if (!map.has(d)) map.set(d, { doctor: d, prescriptions: 0, items: 0, revenue: 0, topMedicine: '—', topQty: 0 });
    if (!docMed.has(d)) docMed.set(d, new Map());
    const e = map.get(d)!;
    e.prescriptions += 1;
    e.items += itemsOf(s);
    e.revenue += s.totalAmount;
    for (const i of s.items) {
      const med = ctx.medicines.find((m) => m.id === i.medicineId);
      const name = med?.name ?? 'Unknown';
      docMed.get(d)!.set(name, (docMed.get(d)!.get(name) || 0) + i.quantity);
    }
  }
  for (const [d, meds] of docMed) {
    const top = [...meds.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && map.has(d)) {
      const e = map.get(d)!;
      e.topMedicine = top[0];
      e.topQty = top[1];
    }
  }
  const rows = [...map.values()].sort((a, b) => b.prescriptions - a.prescriptions);
  return {
    title: 'Doctor-wise Prescription Analysis',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Doctors', value: rows.length.toLocaleString() },
      { label: 'Total Rx', value: rows.reduce((s, r) => s + r.prescriptions, 0).toLocaleString() },
      { label: 'Top doctor', value: rows[0]?.doctor ?? '—', tone: 'blue' },
    ],
    columns: [
      { key: 'doctor', label: 'Doctor' },
      { key: 'prescriptions', label: 'Rx Count', type: 'number' },
      { key: 'items', label: 'Items', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      { key: 'topMedicine', label: 'Most Prescribed' },
      { key: 'topQty', label: 'Qty', type: 'number' },
    ],
    rows,
  };
};

// ───────── Financial ────────────────────────────────────────────────────────

const profitAndLoss = (ctx: ReportContext): ReportResult => {
  const inSales = ctx.sales.filter((s) => inRange(s.saleDate, ctx.range) && s.status !== 'cancelled');
  const inExp = ctx.expenses.filter((e) => inRange(e.date, ctx.range));
  const revenue = inSales.reduce((s, x) => s + x.totalAmount, 0);
  const cost = inSales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.purchasePrice * i.quantity, 0), 0);
  const grossProfit = revenue - cost;
  const expByCat = new Map<string, number>();
  for (const e of inExp) expByCat.set(e.category, (expByCat.get(e.category) || 0) + e.amount);
  const totalExp = inExp.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - totalExp;
  const rows: Array<Record<string, unknown>> = [
    { line: 'Revenue (sales)', amount: revenue, type: 'income' },
    { line: 'Cost of Goods Sold', amount: -cost, type: 'cost' },
    { line: 'Gross Profit', amount: grossProfit, type: 'total' },
    ...[...expByCat.entries()].map(([cat, amt]) => ({ line: `Expense — ${cat}`, amount: -amt, type: 'expense' })),
    { line: 'Total Operating Expenses', amount: -totalExp, type: 'total' },
    { line: 'Net Profit', amount: netProfit, type: 'total' },
  ];
  return {
    title: 'Profit & Loss Statement',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Revenue', value: money(revenue), tone: 'emerald' },
      { label: 'Gross Profit', value: money(grossProfit), tone: 'emerald' },
      { label: 'Expenses', value: money(totalExp), tone: 'amber' },
      { label: 'Net Profit', value: money(netProfit), tone: netProfit >= 0 ? 'emerald' : 'red' },
    ],
    columns: [
      { key: 'line', label: 'Line Item' },
      { key: 'amount', label: 'Amount', type: 'currency' },
    ],
    rows,
    hideTotals: true,
  };
};

const dailyCashBook = (ctx: ReportContext): ReportResult => {
  const days = new Map<string, { date: string; cashIn: number; cardIn: number; digitalIn: number; cashOut: number; net: number }>();
  for (const s of ctx.sales) {
    if (!inRange(s.saleDate, ctx.range) || s.status === 'cancelled') continue;
    const k = dayKey(s.saleDate);
    if (!days.has(k)) days.set(k, { date: k, cashIn: 0, cardIn: 0, digitalIn: 0, cashOut: 0, net: 0 });
    const d = days.get(k)!;
    for (const p of s.paymentMethods) {
      if (p.method === 'cash') d.cashIn += p.amount;
      else if (p.method === 'card') d.cardIn += p.amount;
      else d.digitalIn += p.amount;
    }
  }
  for (const e of ctx.expenses) {
    if (!inRange(e.date, ctx.range)) continue;
    const k = dayKey(e.date);
    if (!days.has(k)) days.set(k, { date: k, cashIn: 0, cardIn: 0, digitalIn: 0, cashOut: 0, net: 0 });
    days.get(k)!.cashOut += e.amount;
  }
  const rows = [...days.values()].map((d) => ({ ...d, net: d.cashIn + d.cardIn + d.digitalIn - d.cashOut })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    title: 'Daily Cash Book',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Cash in', value: money(rows.reduce((s, r) => s + r.cashIn, 0)), tone: 'emerald' },
      { label: 'Card / Digital', value: money(rows.reduce((s, r) => s + r.cardIn + r.digitalIn, 0)), tone: 'blue' },
      { label: 'Cash out (expenses)', value: money(rows.reduce((s, r) => s + r.cashOut, 0)), tone: 'amber' },
      { label: 'Net', value: money(rows.reduce((s, r) => s + r.net, 0)), tone: 'emerald' },
    ],
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'cashIn', label: 'Cash In', type: 'currency' },
      { key: 'cardIn', label: 'Card', type: 'currency' },
      { key: 'digitalIn', label: 'Digital Wallets', type: 'currency' },
      { key: 'cashOut', label: 'Expenses', type: 'currency' },
      { key: 'net', label: 'Net', type: 'currency' },
    ],
    rows,
  };
};

// ───────── Helpers ───────────────────────────────────────────────────────────

function rangeLabel(range: ReportContext['range']): string {
  const e = range.end.toLocaleDateString('en-PK');
  if (!range.start) return `All time → ${e}`;
  return `${range.start.toLocaleDateString('en-PK')} → ${e}`;
}

// ─── The registry ───────────────────────────────────────────────────────────

// ───────── Marg-style additions (Part B) ────────────────────────────────────

const medMap = (ctx: ReportContext) => new Map(ctx.medicines.map((m) => [m.id, m]));
const activeSale = (s: Sale, ctx: ReportContext) => inRange(s.saleDate, ctx.range) && s.status !== 'cancelled';

// Day Book — every transaction (sale, return, purchase, expense) in the period,
// chronologically. Marg's core "Day Book" view.
const dayBook = (ctx: ReportContext): ReportResult => {
  type Row = { date: string; time: string; type: string; ref: string; party: string; inflow: number; outflow: number };
  const rows: Row[] = [];
  const ts = (d: Date | string) => new Date(d);
  for (const s of ctx.sales) {
    if (!activeSale(s, ctx)) continue;
    rows.push({ date: dayKey(s.saleDate), time: ts(s.saleDate).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }), type: 'Sale', ref: s.invoiceNumber, party: s.customerName ?? 'Walk-in', inflow: s.totalAmount, outflow: 0 });
  }
  for (const r of ctx.saleReturns) {
    if (!inRange(r.returnDate, ctx.range)) continue;
    rows.push({ date: dayKey(r.returnDate), time: ts(r.returnDate).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }), type: 'Sale Return', ref: r.returnNumber ?? '—', party: '—', inflow: 0, outflow: r.totalAmount });
  }
  for (const p of ctx.purchases) {
    if (!inRange(p.purchaseDate, ctx.range)) continue;
    const sup = ctx.suppliers.find((x) => x.id === p.supplierId);
    rows.push({ date: dayKey(p.purchaseDate), time: ts(p.purchaseDate).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }), type: p.isLoose ? 'Loose Purchase' : 'Purchase', ref: p.purchaseNumber, party: sup?.name ?? p.looseSource ?? '—', inflow: 0, outflow: p.totalAmount });
  }
  for (const e of ctx.expenses) {
    if (!inRange(e.date, ctx.range)) continue;
    rows.push({ date: dayKey(e.date), time: ts(e.date).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }), type: 'Expense', ref: e.category ?? 'Expense', party: e.description ?? '—', inflow: 0, outflow: e.amount });
  }
  rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const inflow = rows.reduce((s, r) => s + r.inflow, 0);
  const outflow = rows.reduce((s, r) => s + r.outflow, 0);
  return {
    title: 'Day Book',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Entries', value: rows.length.toLocaleString() },
      { label: 'Inflow', value: money(inflow), tone: 'emerald' },
      { label: 'Outflow', value: money(outflow), tone: 'red' },
      { label: 'Net', value: money(inflow - outflow), tone: inflow - outflow >= 0 ? 'emerald' : 'red' },
    ],
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'time', label: 'Time' },
      { key: 'type', label: 'Type', type: 'badge' },
      { key: 'ref', label: 'Reference' },
      { key: 'party', label: 'Party' },
      { key: 'inflow', label: 'Inflow', type: 'currency' },
      { key: 'outflow', label: 'Outflow', type: 'currency' },
    ],
    rows,
  };
};

// Mode of Payment — day summary of collections split by method, bill count and
// returns. Marg's "Mode of Payment Report".
const modeOfPayment = (ctx: ReportContext): ReportResult => {
  const byMethod = new Map<string, { method: string; bills: number; amount: number }>();
  let bills = 0;
  for (const s of ctx.sales) {
    if (!activeSale(s, ctx)) continue;
    bills += 1;
    for (const p of s.paymentMethods) {
      if (!byMethod.has(p.method)) byMethod.set(p.method, { method: p.method, bills: 0, amount: 0 });
      const m = byMethod.get(p.method)!;
      m.bills += 1;
      m.amount += p.amount;
    }
  }
  const collected = [...byMethod.values()].reduce((s, m) => s + m.amount, 0);
  const refunds = ctx.saleReturns.filter((r) => inRange(r.returnDate, ctx.range)).reduce((s, r) => s + r.totalAmount, 0);
  const rows = [...byMethod.values()]
    .map((m) => ({ ...m, method: m.method.replace(/_/g, ' '), share: collected ? (m.amount / collected) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
  return {
    title: 'Mode of Payment — Day Summary',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Bills', value: bills.toLocaleString(), tone: 'blue' },
      { label: 'Collected', value: money(collected), tone: 'emerald' },
      { label: 'Refunds', value: money(refunds), tone: 'red' },
      { label: 'Net', value: money(collected - refunds) },
    ],
    columns: [
      { key: 'method', label: 'Payment method' },
      { key: 'bills', label: 'Payments', type: 'number' },
      { key: 'amount', label: 'Amount', type: 'currency' },
      { key: 'share', label: 'Share %', type: 'number' },
    ],
    rows,
  };
};

// Sales by Manufacturer/Company — qty, revenue and (gated) profit grouped by
// the medicine's manufacturer. Honors active filters.
const salesByManufacturer = (ctx: ReportContext): ReportResult => {
  const meds = medMap(ctx);
  const map = new Map<string, { manufacturer: string; qty: number; revenue: number; profit: number }>();
  for (const s of ctx.sales) {
    if (!activeSale(s, ctx)) continue;
    for (const it of s.items) {
      if (!keepItem(it, ctx)) continue;
      const man = meds.get(it.medicineId)?.manufacturer || 'Unknown';
      if (!map.has(man)) map.set(man, { manufacturer: man, qty: 0, revenue: 0, profit: 0 });
      const m = map.get(man)!;
      m.qty += it.quantity;
      m.revenue += it.total ?? 0;
      m.profit += it.profit ?? 0;
    }
  }
  const rows = [...map.values()].map((r) => ({ ...r, margin: r.revenue ? (r.profit / r.revenue) * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);
  return {
    title: 'Sales by Manufacturer / Company',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Companies', value: rows.length.toLocaleString() },
      { label: 'Revenue', value: money(rows.reduce((s, r) => s + r.revenue, 0)), tone: 'emerald' },
      { label: 'Top company', value: rows[0]?.manufacturer ?? '—', tone: 'blue' },
    ],
    columns: [
      { key: 'manufacturer', label: 'Manufacturer' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      ...(ctx.canSeeProfit ? [{ key: 'profit', label: 'Profit', type: 'currency' as const }, { key: 'margin', label: 'Margin %', type: 'number' as const }] : []),
    ],
    rows,
  };
};

// Salt / Generic-wise Sales — group sold items by the medicine's generic name.
const genericWiseSales = (ctx: ReportContext): ReportResult => {
  const meds = medMap(ctx);
  const map = new Map<string, { generic: string; qty: number; revenue: number; profit: number }>();
  for (const s of ctx.sales) {
    if (!activeSale(s, ctx)) continue;
    for (const it of s.items) {
      if (!keepItem(it, ctx)) continue;
      const g = meds.get(it.medicineId)?.genericName || 'Unspecified';
      if (!map.has(g)) map.set(g, { generic: g, qty: 0, revenue: 0, profit: 0 });
      const m = map.get(g)!;
      m.qty += it.quantity;
      m.revenue += it.total ?? 0;
      m.profit += it.profit ?? 0;
    }
  }
  const rows = [...map.values()].map((r) => ({ ...r, margin: r.revenue ? (r.profit / r.revenue) * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);
  return {
    title: 'Salt / Generic-wise Sales',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Salts', value: rows.length.toLocaleString() },
      { label: 'Units sold', value: rows.reduce((s, r) => s + r.qty, 0).toLocaleString(), tone: 'blue' },
      { label: 'Revenue', value: money(rows.reduce((s, r) => s + r.revenue, 0)), tone: 'emerald' },
    ],
    columns: [
      { key: 'generic', label: 'Salt / Generic' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'revenue', label: 'Revenue', type: 'currency' },
      ...(ctx.canSeeProfit ? [{ key: 'profit', label: 'Profit', type: 'currency' as const }, { key: 'margin', label: 'Margin %', type: 'number' as const }] : []),
    ],
    rows,
  };
};

// Distributor / Supplier Ledger — per supplier: purchases, paid, returns and
// outstanding balance in the period. Marg's "Party ledger" for suppliers.
const supplierLedger = (ctx: ReportContext): ReportResult => {
  const map = new Map<string, { supplier: string; purchases: number; purchased: number; paid: number; returned: number; balance: number }>();
  for (const sup of ctx.suppliers) {
    if (ctx.filters?.supplierId && sup.id !== ctx.filters.supplierId) continue;
    map.set(sup.id, { supplier: sup.name, purchases: 0, purchased: 0, paid: 0, returned: 0, balance: sup.currentBalance ?? 0 });
  }
  for (const p of ctx.purchases) {
    if (!inRange(p.purchaseDate, ctx.range) || !p.supplierId) continue;
    const m = map.get(p.supplierId);
    if (!m) continue;
    m.purchases += 1;
    m.purchased += p.totalAmount ?? 0;
    m.paid += p.paidAmount ?? 0;
  }
  const rows = [...map.values()].filter((r) => r.purchases > 0 || r.balance !== 0).sort((a, b) => b.purchased - a.purchased);
  return {
    title: 'Distributor / Supplier Ledger',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Suppliers', value: rows.length.toLocaleString() },
      { label: 'Purchased', value: money(rows.reduce((s, r) => s + r.purchased, 0)), tone: 'blue' },
      { label: 'Paid', value: money(rows.reduce((s, r) => s + r.paid, 0)), tone: 'emerald' },
      { label: 'Outstanding', value: money(rows.reduce((s, r) => s + r.balance, 0)), tone: 'red' },
    ],
    columns: [
      { key: 'supplier', label: 'Distributor' },
      { key: 'purchases', label: 'POs', type: 'number' },
      { key: 'purchased', label: 'Purchased', type: 'currency' },
      { key: 'paid', label: 'Paid', type: 'currency' },
      { key: 'balance', label: 'Outstanding', type: 'currency' },
    ],
    rows,
  };
};

// Tax by Rate Band — taxable value and tax collected grouped by GST/sales-tax
// rate (e.g. 0%, 1%, 17%). Built from per-item taxPercent.
const taxByRateBand = (ctx: ReportContext): ReportResult => {
  const map = new Map<number, { band: string; rate: number; taxable: number; tax: number; items: number }>();
  for (const s of ctx.sales) {
    if (!activeSale(s, ctx)) continue;
    for (const it of s.items) {
      if (!keepItem(it, ctx)) continue;
      const rate = it.taxPercent ?? 0;
      if (!map.has(rate)) map.set(rate, { band: `${rate}%`, rate, taxable: 0, tax: 0, items: 0 });
      const m = map.get(rate)!;
      const line = it.total ?? 0;
      const tax = line - line / (1 + rate / 100);
      m.taxable += line - tax;
      m.tax += tax;
      m.items += 1;
    }
  }
  const rows = [...map.values()].sort((a, b) => a.rate - b.rate);
  return {
    title: 'Tax by Rate Band',
    subtitle: rangeLabel(ctx.range),
    summary: [
      { label: 'Rate bands', value: rows.length.toLocaleString() },
      { label: 'Taxable value', value: money(rows.reduce((s, r) => s + r.taxable, 0)), tone: 'blue' },
      { label: 'Tax collected', value: money(rows.reduce((s, r) => s + r.tax, 0)), tone: 'emerald' },
    ],
    columns: [
      { key: 'band', label: 'Rate' },
      { key: 'items', label: 'Lines', type: 'number' },
      { key: 'taxable', label: 'Taxable value', type: 'currency' },
      { key: 'tax', label: 'Tax', type: 'currency' },
    ],
    rows,
    notes: ['Taxable value is back-computed from tax-inclusive line totals at each item\'s tax rate.'],
  };
};

export const REPORT_REGISTRY: ReportDef[] = [
  // Sales
  { id: 'daily-sales',        title: 'Daily Sales Register',         description: 'One row per day — txns, items, payment-method breakdown, returns', category: 'sales',     icon: 'Calendar',       tags: ['Daily'],         run: dailySalesRegister },
  { id: 'sales-by-hour',      title: 'Sales by Hour',                description: 'Peak hours analysis — plan staffing around the rush',                category: 'sales',     icon: 'Clock',          tags: ['Operations'],     run: salesByHour },
  { id: 'sales-by-cashier',   title: 'Sales by Cashier',             description: 'Each user\'s transactions, revenue, average ticket and profit',      category: 'sales',     icon: 'Users',          tags: ['Performance'],    run: salesByCashier },
  { id: 'sales-by-payment',   title: 'Sales by Payment Method',      description: 'Cash vs card vs JazzCash vs EasyPaisa split with share %',          category: 'sales',     icon: 'CreditCard',     tags: ['Payments'],       run: salesByPaymentMethod },
  { id: 'returns-register',   title: 'Returns Register',             description: 'Every return — reason, refund method, value',                       category: 'sales',     icon: 'RotateCcw',      tags: ['Returns'],        run: returnsRegister },
  { id: 'discounts-given',    title: 'Discounts Given',              description: 'Every invoice with a discount and the % off',                       category: 'sales',     icon: 'Percent',        tags: ['Discounts'],      run: discountsGiven },
  { id: 'mode-of-payment',    title: 'Mode of Payment — Day Summary',description: 'Collections split by method with bill counts and refunds',          category: 'sales',     icon: 'CreditCard',     tags: ['Daily', 'Cash'],  run: modeOfPayment },
  { id: 'sales-by-manufacturer', title: 'Sales by Manufacturer',     description: 'Company-wise units, revenue and margin',                            category: 'sales',     icon: 'Factory',        tags: ['Company'],        run: salesByManufacturer },
  { id: 'generic-wise-sales', title: 'Salt / Generic-wise Sales',    description: 'Units and revenue grouped by salt / generic composition',           category: 'sales',     icon: 'FlaskConical',   tags: ['Salt'],           run: genericWiseSales },

  // Profit
  { id: 'gp-by-day',          title: 'Gross Profit by Day',          description: 'Revenue, cost, profit and margin% trended over the period',         category: 'profit',    icon: 'TrendingUp',     profitOnly: true, tags: ['Margin'],     run: grossProfitByDay },
  { id: 'profit-by-product',  title: 'Profit by Product',            description: 'SKU-level profitability — find your stars and dead weight',         category: 'profit',    icon: 'Pill',           profitOnly: true, tags: ['SKU'],         run: profitByProduct },
  { id: 'profit-by-category', title: 'Profit by Category',           description: 'Tablets vs syrups vs injections — where the money sits',            category: 'profit',    icon: 'Layers',         profitOnly: true,                          run: profitByCategory },
  { id: 'profit-by-batch',    title: 'Profit by Batch',              description: 'Per-batch profitability — spot batches priced below cost',          category: 'profit',    icon: 'Boxes',          profitOnly: true, tags: ['Pricing'],     run: profitByBatch },
  { id: 'profit-by-supplier', title: 'Profit by Supplier',           description: 'Which supplier\'s stock earns you the best margins',                 category: 'profit',    icon: 'Truck',          profitOnly: true, tags: ['Procurement'], run: profitBySupplier },

  // Inventory
  { id: 'stock-valuation',    title: 'Stock Valuation',              description: 'Current inventory at cost vs MRP with unrealized profit',           category: 'inventory', icon: 'Wallet',         tags: ['Snapshot'],       run: stockValuation },
  { id: 'batch-register',     title: 'Batch Register',               description: 'Every active batch — qty, expiry, supplier, value',                 category: 'inventory', icon: 'List',                                           run: batchRegister },
  { id: 'expiry-report',      title: 'Expiry Report',                description: 'Expired + expiring batches by 30/60/90 day buckets',                category: 'inventory', icon: 'AlertTriangle',  tags: ['Critical'],       run: expiryReport },
  { id: 'slow-movers',        title: 'Slow Movers',                  description: 'Stock not sold in ≥ 30 days — capital is sitting idle',             category: 'inventory', icon: 'Snowflake',      tags: ['Capital'],        run: slowMovers },
  { id: 'reorder-required',   title: 'Reorder Required',             description: 'Items below their reorder level — generate POs from this list',     category: 'inventory', icon: 'ShoppingCart',   tags: ['Action'],         run: reorderRequired },
  { id: 'abc-analysis',       title: 'ABC Analysis',                 description: 'Pareto / 80-20 classification by revenue contribution',             category: 'inventory', icon: 'BarChart3',      tags: ['Strategy'],       run: abcAnalysis },

  // Purchases
  { id: 'purchase-register',  title: 'Purchase Register',            description: 'Every PO in period — supplier, total, paid, balance, status',       category: 'purchases', icon: 'ClipboardList',                                  run: purchaseRegister },
  { id: 'loose-purchase',     title: 'Loose Purchase Register',      description: 'Off-supplier emergency buys — flag over-reliance',                   category: 'purchases', icon: 'Zap',            tags: ['Audit'],          run: loosePurchaseRegister },

  // Suppliers
  { id: 'supplier-outstanding', title: 'Supplier Outstanding (Aged)', description: 'Payables broken down by overdue age — 0/30/60/90/90+',              category: 'suppliers', icon: 'Hourglass',      tags: ['Cash flow'],      run: supplierOutstanding },
  { id: 'supplier-ledger',    title: 'Distributor / Supplier Ledger',description: 'Per-distributor purchases, payments and outstanding balance',       category: 'suppliers', icon: 'BookUser',       tags: ['Ledger'],         run: supplierLedger },

  // Customers
  { id: 'top-customers',      title: 'Top Customers',                description: 'Ranked by revenue — visit count, items, last visit, loyalty',       category: 'customers', icon: 'Star',           tags: ['CRM'],            run: topCustomers },

  // Tax / FBR
  { id: 'fbr-output-tax',     title: 'FBR Output Tax Register',      description: 'Sales tax collected on each invoice (Annex-C input)',                category: 'tax',       icon: 'FileText',       tags: ['FBR', 'Annex-C'], run: fbrOutputTax },
  { id: 'fbr-input-tax',      title: 'FBR Input Tax Register',       description: 'Tax paid on purchases — claimable as input credit (Annex-A)',        category: 'tax',       icon: 'FileText',       tags: ['FBR', 'Annex-A'], run: fbrInputTax },
  { id: 'fbr-monthly',        title: 'Monthly Tax Filing Summary',   description: 'Per-month Output − Input = Net payable',                            category: 'tax',       icon: 'Calculator',     tags: ['FBR', 'Monthly'], run: monthlyTaxSummary },
  { id: 'tax-by-rate-band',   title: 'Tax by Rate Band',             description: 'Taxable value and tax collected grouped by tax rate',               category: 'tax',       icon: 'Calculator',     tags: ['GST', 'Rate'],    run: taxByRateBand },

  // Regulatory
  { id: 'controlled-register',title: 'Controlled Drug Register',     description: 'Every controlled-drug dispensation with Rx + customer CNIC',         category: 'regulatory',icon: 'Shield',         tags: ['DRAP', 'Form-K'],run: controlledDrugRegister },
  { id: 'rx-register',        title: 'Prescription Drug Register',   description: 'Rx-required medicine sales — flag dispensations without Rx scan',    category: 'regulatory',icon: 'Stethoscope',    tags: ['DRAP'],          run: prescriptionDrugRegister },
  { id: 'doctor-wise',        title: 'Doctor-wise Prescriptions',    description: 'Which doctors drive your Rx business + their go-to medicine',        category: 'regulatory',icon: 'UserCheck',      tags: ['Marketing'],      run: doctorWisePrescriptions },

  // Financial
  { id: 'profit-loss',        title: 'Profit & Loss Statement',      description: 'Revenue → COGS → GP → expenses → net profit',                        category: 'financial', icon: 'TrendingUp',     profitOnly: true, tags: ['P&L'],         run: profitAndLoss },
  { id: 'cash-book',          title: 'Daily Cash Book',              description: 'Daily inflows (cash/card/digital) vs expense outflows',              category: 'financial', icon: 'Banknote',       tags: ['Cash'],            run: dailyCashBook },
  { id: 'day-book',           title: 'Day Book',                     description: 'Every transaction — sales, returns, purchases, expenses — chronologically', category: 'financial', icon: 'BookOpen',  tags: ['Ledger', 'Daily'], run: dayBook },
];

export const CATEGORY_META: Record<ReportCategory, { label: string; description: string; color: string }> = {
  sales:       { label: 'Sales',       description: 'Daily registers, hourly peaks, cashier and payment-method breakdowns',  color: 'emerald' },
  profit:      { label: 'Profit',      description: 'Margin analysis by day, product, category, batch and supplier',          color: 'blue' },
  inventory:   { label: 'Inventory',   description: 'Valuation, batches, expiry, slow movers, ABC, reorder lists',             color: 'amber' },
  purchases:   { label: 'Purchases',   description: 'POs and loose purchases registers',                                       color: 'purple' },
  suppliers:   { label: 'Suppliers',   description: 'Outstanding payables aged by overdue bucket',                             color: 'rose' },
  customers:   { label: 'Customers',   description: 'Top customers by revenue, visits and loyalty',                            color: 'indigo' },
  tax:         { label: 'Tax / FBR',   description: 'Output / input tax registers and monthly filing summary',                 color: 'cyan' },
  regulatory:  { label: 'Regulatory',  description: 'DRAP / narcotics — controlled drugs, Rx drugs, doctor patterns',          color: 'red' },
  financial:   { label: 'Financial',   description: 'P&L statement and the daily cash book',                                   color: 'teal' },
  operations:  { label: 'Operations',  description: 'Operational metrics and audit views',                                     color: 'slate' },
};
