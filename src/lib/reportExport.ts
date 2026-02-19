/**
 * Professional Report Export Utilities — PDF & CSV
 * Generates comprehensive, publication-quality business reports
 * for Owner and Manager accounts.
 */

import type { Sale, Medicine, Batch, Supplier, Expense, PharmacyKPIs, AppSettings } from '@/types';

// ─── Shared Types ───────────────────────────────────────────────────────────

export interface ReportData {
  settings: AppSettings;
  sales: Sale[];
  medicines: Medicine[];
  batches: Batch[];
  suppliers: Supplier[];
  expenses: Expense[];
  kpis: PharmacyKPIs;
  canSeeProfit: boolean;
  generatedBy: string;
  dateRange: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 });
const fmtDec = (n: number, d = 2) => n.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number) => `${n.toFixed(1)}%`;
const dateStr = (d: Date | string) => new Date(d).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
const nowStr = () => new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const timeStr = () => new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

function computeAggregates(data: ReportData) {
  const { sales, medicines, batches, suppliers, expenses, kpis } = data;
  const completedSales = sales.filter(s => s.status === 'completed');
  const pendingSales = sales.filter(s => s.status === 'pending');
  const returnedSales = sales.filter(s => s.status === 'returned');

  const totalRevenue = completedSales.reduce((s, sale) => s + sale.totalAmount, 0);
  const totalTransactions = completedSales.length;
  const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  const totalItemsSold = completedSales.reduce((s, sale) => s + sale.items.reduce((is, i) => is + i.quantity, 0), 0);
  const totalProfit = completedSales.flatMap(s => s.items).reduce((s, i) => s + (i.profit ?? 0), 0);
  const grossMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalProfit - totalExpenses;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const totalDiscount = completedSales.reduce((s, sale) => s + sale.discountAmount, 0);
  const totalTax = completedSales.reduce((s, sale) => s + sale.taxAmount, 0);
  const totalReceivables = pendingSales.reduce((s, sale) => s + sale.balanceAmount, 0);
  const totalPayables = suppliers.reduce((s, sup) => s + sup.currentBalance, 0);

  // Payment method breakdown
  const paymentBreakdown: Record<string, number> = {};
  completedSales.forEach(s => s.paymentMethods.forEach(p => {
    paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + p.amount;
  }));

  // Top products
  const productMap: Record<string, { name: string; category: string; qty: number; revenue: number; profit: number; cost: number }> = {};
  completedSales.forEach(s => s.items.forEach(item => {
    const med = medicines.find(m => m.id === item.medicineId);
    const name = med?.name ?? item.medicineId;
    const cat = med?.category ?? 'Other';
    if (!productMap[item.medicineId]) productMap[item.medicineId] = { name, category: cat, qty: 0, revenue: 0, profit: 0, cost: 0 };
    productMap[item.medicineId].qty += item.quantity;
    productMap[item.medicineId].revenue += item.total;
    productMap[item.medicineId].profit += item.profit ?? 0;
    productMap[item.medicineId].cost += item.purchasePrice * item.quantity;
  }));
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

  // Category breakdown
  const categoryMap: Record<string, { revenue: number; profit: number; qty: number; count: number }> = {};
  completedSales.forEach(s => s.items.forEach(item => {
    const med = medicines.find(m => m.id === item.medicineId);
    const cat = med?.category ?? 'Other';
    if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, profit: 0, qty: 0, count: 0 };
    categoryMap[cat].revenue += item.total;
    categoryMap[cat].profit += item.profit ?? 0;
    categoryMap[cat].qty += item.quantity;
    categoryMap[cat].count += 1;
  }));
  const categories = Object.entries(categoryMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);

  // Batch analysis
  const activeBatches = batches.filter(b => b.isActive && b.quantity > 0);
  const totalStockValue = activeBatches.reduce((s, b) => s + b.quantity * b.purchasePrice, 0);
  const totalRetailValue = activeBatches.reduce((s, b) => s + b.quantity * b.salePrice, 0);
  const potentialProfit = totalRetailValue - totalStockValue;
  const batchAnalysis = activeBatches.map(b => {
    const med = medicines.find(m => m.id === b.medicineId);
    const profitPerUnit = b.salePrice - b.purchasePrice;
    const margin = b.salePrice > 0 ? (profitPerUnit / b.salePrice) * 100 : 0;
    const daysToExpiry = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / 86400000);
    return {
      medicine: med?.name ?? b.medicineId,
      batch: b.batchNumber,
      qty: b.quantity,
      cost: b.purchasePrice,
      sale: b.salePrice,
      profitPerUnit,
      margin,
      stockValue: b.quantity * b.purchasePrice,
      potentialProfit: profitPerUnit * b.quantity,
      expiryDate: b.expiryDate,
      daysToExpiry,
    };
  }).sort((a, b) => b.potentialProfit - a.potentialProfit);

  // Expiry risk
  const expiryRisk = batchAnalysis.filter(b => b.daysToExpiry <= 180).sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  const criticalExpiry = expiryRisk.filter(b => b.daysToExpiry <= 30);
  const warningExpiry = expiryRisk.filter(b => b.daysToExpiry > 30 && b.daysToExpiry <= 90);

  // Daily sales trend
  const dailySales: Record<string, { date: string; revenue: number; profit: number; transactions: number; items: number }> = {};
  completedSales.forEach(s => {
    const d = new Date(s.saleDate).toISOString().slice(0, 10);
    if (!dailySales[d]) dailySales[d] = { date: d, revenue: 0, profit: 0, transactions: 0, items: 0 };
    dailySales[d].revenue += s.totalAmount;
    dailySales[d].profit += s.items.reduce((sum, i) => sum + (i.profit ?? 0), 0);
    dailySales[d].transactions += 1;
    dailySales[d].items += s.items.reduce((sum, i) => sum + i.quantity, 0);
  });
  const salesTrend = Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date));

  // Expense breakdown
  const expenseCats: Record<string, number> = {};
  expenses.forEach(e => { expenseCats[e.category] = (expenseCats[e.category] ?? 0) + e.amount; });

  // Supplier analysis
  const supplierAnalysis = suppliers.map(sup => {
    const supSales = completedSales.flatMap(s => s.items.filter(i => {
      const batch = batches.find(b => b.id === i.batchId);
      return batch?.supplierId === sup.id;
    }));
    const revenue = supSales.reduce((s, i) => s + i.total, 0);
    const profit = supSales.reduce((s, i) => s + (i.profit ?? 0), 0);
    const cost = supSales.reduce((s, i) => s + i.purchasePrice * i.quantity, 0);
    return { name: sup.name, contact: sup.contactPerson, phone: sup.phone, balance: sup.currentBalance, revenue, profit, cost, creditLimit: sup.creditLimit };
  }).sort((a, b) => b.revenue - a.revenue);

  // Customer analysis
  const customerMap: Record<string, { name: string; transactions: number; revenue: number; profit: number }> = {};
  completedSales.forEach(s => {
    const name = s.customerName || 'Walk-in Customer';
    if (!customerMap[name]) customerMap[name] = { name, transactions: 0, revenue: 0, profit: 0 };
    customerMap[name].transactions += 1;
    customerMap[name].revenue += s.totalAmount;
    customerMap[name].profit += s.items.reduce((sum, i) => sum + (i.profit ?? 0), 0);
  });
  const topCustomers = Object.values(customerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 20);

  // Invoice details (for CSV)
  const invoiceDetails = completedSales.map(s => ({
    invoice: s.invoiceNumber,
    date: dateStr(s.saleDate),
    customer: s.customerName || 'Walk-in',
    doctor: s.doctorName || '-',
    items: s.items.length,
    subtotal: s.subtotal,
    discount: s.discountAmount,
    tax: s.taxAmount,
    total: s.totalAmount,
    paid: s.paidAmount,
    balance: s.balanceAmount,
    profit: s.items.reduce((sum, i) => sum + (i.profit ?? 0), 0),
    margin: s.totalAmount > 0 ? (s.items.reduce((sum, i) => sum + (i.profit ?? 0), 0) / s.totalAmount * 100) : 0,
    payment: s.paymentMethods.map(p => `${p.method}(Rs.${fmt(p.amount)})`).join(', '),
    status: s.status,
    createdBy: s.createdBy,
  }));

  // Line-item details (for CSV)
  const lineItems = completedSales.flatMap(s => s.items.map(item => {
    const med = medicines.find(m => m.id === item.medicineId);
    return {
      invoice: s.invoiceNumber,
      date: dateStr(s.saleDate),
      customer: s.customerName || 'Walk-in',
      medicine: med?.name ?? item.medicineId,
      genericName: med?.genericName ?? '-',
      category: med?.category ?? '-',
      batch: item.batchNumber,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: item.purchasePrice,
      discount: item.discountPercent,
      tax: item.taxPercent,
      lineTotal: item.total,
      profit: item.profit ?? 0,
      margin: item.total > 0 ? ((item.profit ?? 0) / item.total * 100) : 0,
      expiryDate: dateStr(item.expiryDate),
    };
  }));

  return {
    totalRevenue, totalTransactions, avgTicket, totalItemsSold,
    totalProfit, grossMargin, totalExpenses, netProfit, netMargin,
    totalDiscount, totalTax, totalReceivables, totalPayables,
    paymentBreakdown, topProducts, categories,
    totalStockValue, totalRetailValue, potentialProfit,
    batchAnalysis, expiryRisk, criticalExpiry, warningExpiry,
    salesTrend, expenseCats, supplierAnalysis, topCustomers,
    invoiceDetails, lineItems, completedSales, pendingSales, returnedSales,
    activeBatches,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── COMPREHENSIVE CSV EXPORT ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export function exportComprehensiveCSV(data: ReportData) {
  const agg = computeAggregates(data);
  const { canSeeProfit, settings, kpis } = data;

  // Build multi-section CSV with clearly marked sheets
  const sections: string[] = [];

  // ── SECTION 1: Executive Summary ──
  sections.push(csvSection('EXECUTIVE SUMMARY', [
    ['Metric', 'Value'],
    ['Report Generated', `${nowStr()} at ${timeStr()}`],
    ['Generated By', data.generatedBy],
    ['Period', data.dateRange],
    ['Company', settings.companyName],
    ['Address', settings.companyAddress],
    ['Phone', settings.companyPhone],
    ['NTN', settings.companyNtn],
    [''],
    ['Total Revenue', `Rs. ${fmt(agg.totalRevenue)}`],
    ['Total Transactions', agg.totalTransactions.toString()],
    ['Average Ticket Size', `Rs. ${fmt(agg.avgTicket)}`],
    ['Total Items Sold', agg.totalItemsSold.toString()],
    ['Total Discounts Given', `Rs. ${fmt(agg.totalDiscount)}`],
    ['Total Tax Collected', `Rs. ${fmt(agg.totalTax)}`],
    ...(canSeeProfit ? [
      ['Gross Profit', `Rs. ${fmt(agg.totalProfit)}`],
      ['Gross Profit Margin', pct(agg.grossMargin)],
      ['Total Expenses', `Rs. ${fmt(agg.totalExpenses)}`],
      ['Net Profit', `Rs. ${fmt(agg.netProfit)}`],
      ['Net Profit Margin', pct(agg.netMargin)],
    ] : []),
    ['Pending Receivables', `Rs. ${fmt(agg.totalReceivables)}`],
    ['Supplier Payables', `Rs. ${fmt(agg.totalPayables)}`],
    ['Completed Sales', agg.completedSales.length.toString()],
    ['Pending Sales', agg.pendingSales.length.toString()],
    ['Returned Sales', agg.returnedSales.length.toString()],
  ]));

  // ── SECTION 2: KPI Dashboard ──
  sections.push(csvSection('KPI DASHBOARD', [
    ['KPI', 'Value', 'Description'],
    ...(canSeeProfit ? [['Gross Profit Margin', pct(kpis.grossProfitMarginPercent), 'Revenue retained after COGS']] : []),
    ['Inventory Turnover', `${kpis.inventoryTurnoverRate.toFixed(2)}x`, 'Stock rotation rate (60d)'],
    ['Avg Transaction Value', `Rs. ${fmt(kpis.avgTransactionValue)}`, 'Revenue per completed sale'],
    ['Expiry Loss Reduction', pct(kpis.expiryLossReductionPercent), 'Period-over-period improvement'],
    ['Stock Accuracy', pct(kpis.stockAccuracyPercent), 'Physical vs. system match'],
    ['Cash:Credit Ratio', `${kpis.cashCreditRatio.toFixed(2)}:1`, 'Cash vs credit sales'],
    ['Dead Stock Ratio', pct(kpis.deadStockRatio * 100), 'Unsold inventory proportion'],
  ]));

  // ── SECTION 3: Payment Method Breakdown ──
  sections.push(csvSection('PAYMENT METHOD BREAKDOWN', [
    ['Payment Method', 'Amount (Rs.)', '% of Total'],
    ...Object.entries(agg.paymentBreakdown).map(([method, amount]) => [
      method.charAt(0).toUpperCase() + method.slice(1),
      fmt(amount),
      agg.totalRevenue > 0 ? pct((amount / agg.totalRevenue) * 100) : '0%',
    ]),
  ]));

  // ── SECTION 4: Daily Sales Trend ──
  sections.push(csvSection('DAILY SALES TREND', [
    ['Date', 'Revenue (Rs.)', 'Transactions', 'Items Sold', ...(canSeeProfit ? ['Profit (Rs.)', 'Margin %'] : [])],
    ...agg.salesTrend.map(d => [
      d.date, fmt(d.revenue), d.transactions.toString(), d.items.toString(),
      ...(canSeeProfit ? [fmt(d.profit), d.revenue > 0 ? pct((d.profit / d.revenue) * 100) : '0%'] : []),
    ]),
  ]));

  // ── SECTION 5: Category Performance ──
  sections.push(csvSection('CATEGORY PERFORMANCE', [
    ['Category', 'Revenue (Rs.)', 'Units Sold', 'Line Items', ...(canSeeProfit ? ['Profit (Rs.)', 'Margin %'] : []), '% of Revenue'],
    ...agg.categories.map(c => [
      c.name, fmt(c.revenue), c.qty.toString(), c.count.toString(),
      ...(canSeeProfit ? [fmt(c.profit), c.revenue > 0 ? pct((c.profit / c.revenue) * 100) : '0%'] : []),
      agg.totalRevenue > 0 ? pct((c.revenue / agg.totalRevenue) * 100) : '0%',
    ]),
  ]));

  // ── SECTION 6: Top Products ──
  sections.push(csvSection('PRODUCT PERFORMANCE (ALL PRODUCTS)', [
    ['#', 'Product', 'Category', 'Units Sold', 'Revenue (Rs.)', ...(canSeeProfit ? ['Cost (Rs.)', 'Profit (Rs.)', 'Margin %'] : []), '% of Revenue'],
    ...agg.topProducts.map((p, i) => [
      (i + 1).toString(), p.name, p.category, p.qty.toString(), fmt(p.revenue),
      ...(canSeeProfit ? [fmt(p.cost), fmt(p.profit), p.revenue > 0 ? pct((p.profit / p.revenue) * 100) : '0%'] : []),
      agg.totalRevenue > 0 ? pct((p.revenue / agg.totalRevenue) * 100) : '0%',
    ]),
  ]));

  // ── SECTION 7: Invoice Summary ──
  sections.push(csvSection('INVOICE SUMMARY', [
    ['Invoice #', 'Date', 'Customer', 'Doctor', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Balance', ...(canSeeProfit ? ['Profit', 'Margin %'] : []), 'Payment Method', 'Status', 'Created By'],
    ...agg.invoiceDetails.map(inv => [
      inv.invoice, inv.date, inv.customer, inv.doctor, inv.items.toString(),
      fmt(inv.subtotal), fmt(inv.discount), fmt(inv.tax), fmt(inv.total),
      fmt(inv.paid), fmt(inv.balance),
      ...(canSeeProfit ? [fmt(inv.profit), pct(inv.margin)] : []),
      inv.payment, inv.status, inv.createdBy,
    ]),
  ]));

  // ── SECTION 8: Line Item Details ──
  sections.push(csvSection('SALES LINE ITEM DETAILS', [
    ['Invoice', 'Date', 'Customer', 'Medicine', 'Generic Name', 'Category', 'Batch #', 'Qty', 'Unit Price', ...(canSeeProfit ? ['Cost Price', 'Profit', 'Margin %'] : []), 'Discount %', 'Tax %', 'Line Total', 'Expiry Date'],
    ...agg.lineItems.map(li => [
      li.invoice, li.date, li.customer, li.medicine, li.genericName, li.category,
      li.batch, li.qty.toString(), fmt(li.unitPrice),
      ...(canSeeProfit ? [fmt(li.costPrice), fmt(li.profit), pct(li.margin)] : []),
      pct(li.discount), pct(li.tax), fmt(li.lineTotal), li.expiryDate,
    ]),
  ]));

  // ── SECTION 9: Inventory Batch Analysis ──
  if (canSeeProfit) {
    sections.push(csvSection('BATCH PROFIT ANALYSIS', [
      ['Medicine', 'Batch #', 'Qty', 'Cost Price', 'Sale Price', 'Profit/Unit', 'Margin %', 'Stock Value', 'Potential Profit', 'Expiry Date', 'Days to Expiry'],
      ...agg.batchAnalysis.map(b => [
        b.medicine, b.batch, b.qty.toString(), fmtDec(b.cost), fmtDec(b.sale),
        fmtDec(b.profitPerUnit), pct(b.margin), fmt(b.stockValue), fmt(b.potentialProfit),
        dateStr(b.expiryDate), b.daysToExpiry.toString(),
      ]),
    ]));
  }

  // ── SECTION 10: Inventory Stock Summary ──
  sections.push(csvSection('INVENTORY STOCK SUMMARY', [
    ['Metric', 'Value'],
    ['Total Active Batches', agg.activeBatches.length.toString()],
    ['Total Medicines in Stock', data.medicines.filter(m => m.isActive).length.toString()],
    ['Total Stock Value (at cost)', `Rs. ${fmt(agg.totalStockValue)}`],
    ['Total Retail Value', `Rs. ${fmt(agg.totalRetailValue)}`],
    ...(canSeeProfit ? [['Potential Unrealized Profit', `Rs. ${fmt(agg.potentialProfit)}`]] : []),
    ['Critical Expiry (≤30 days)', agg.criticalExpiry.length.toString()],
    ['Warning Expiry (31-90 days)', agg.warningExpiry.length.toString()],
    ['Approaching Expiry (91-180 days)', (agg.expiryRisk.length - agg.criticalExpiry.length - agg.warningExpiry.length).toString()],
  ]));

  // ── SECTION 11: Expiry Risk Report ──
  sections.push(csvSection('EXPIRY RISK REPORT', [
    ['Medicine', 'Batch #', 'Qty', 'Expiry Date', 'Days Left', 'Risk Level', 'Stock Value', ...(canSeeProfit ? ['Potential Loss'] : [])],
    ...agg.expiryRisk.map(b => [
      b.medicine, b.batch, b.qty.toString(), dateStr(b.expiryDate), b.daysToExpiry.toString(),
      b.daysToExpiry <= 30 ? 'CRITICAL' : b.daysToExpiry <= 90 ? 'WARNING' : 'NOTICE',
      fmt(b.stockValue),
      ...(canSeeProfit ? [fmt(b.stockValue)] : []),
    ]),
  ]));

  // ── SECTION 12: Supplier Analysis ──
  sections.push(csvSection('SUPPLIER ANALYSIS', [
    ['Supplier', 'Contact Person', 'Phone', 'Balance Due (Rs.)', 'Credit Limit (Rs.)', ...(canSeeProfit ? ['Revenue Generated', 'Cost of Goods', 'Profit', 'Margin %'] : [])],
    ...agg.supplierAnalysis.map(s => [
      s.name, s.contact, s.phone, fmt(s.balance), fmt(s.creditLimit),
      ...(canSeeProfit ? [fmt(s.revenue), fmt(s.cost), fmt(s.profit), s.revenue > 0 ? pct((s.profit / s.revenue) * 100) : '0%'] : []),
    ]),
  ]));

  // ── SECTION 13: Customer Analysis ──
  sections.push(csvSection('TOP CUSTOMER ANALYSIS', [
    ['Customer', 'Transactions', 'Revenue (Rs.)', ...(canSeeProfit ? ['Profit (Rs.)', 'Margin %'] : []), '% of Revenue'],
    ...agg.topCustomers.map(c => [
      c.name, c.transactions.toString(), fmt(c.revenue),
      ...(canSeeProfit ? [fmt(c.profit), c.revenue > 0 ? pct((c.profit / c.revenue) * 100) : '0%'] : []),
      agg.totalRevenue > 0 ? pct((c.revenue / agg.totalRevenue) * 100) : '0%',
    ]),
  ]));

  // ── SECTION 14: Expense Breakdown ──
  sections.push(csvSection('EXPENSE BREAKDOWN', [
    ['Category', 'Amount (Rs.)', '% of Total Expenses'],
    ...Object.entries(agg.expenseCats).map(([cat, amt]) => [
      cat.charAt(0).toUpperCase() + cat.slice(1), fmt(amt),
      agg.totalExpenses > 0 ? pct((amt / agg.totalExpenses) * 100) : '0%',
    ]),
    ['', '', ''],
    ['Total Expenses', `Rs. ${fmt(agg.totalExpenses)}`, '100%'],
  ]));

  // Combine all sections
  const csv = sections.join('\n\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${settings.companyName.replace(/\s+/g, '_')}_Comprehensive_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvSection(title: string, rows: string[][]): string {
  const separator = '═'.repeat(60);
  const header = `"${separator}"\n"${title}"\n"${separator}"`;
  const csvRows = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  return `${header}\n${csvRows}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── PROFESSIONAL PDF EXPORT (HTML → Print) ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export function exportProfessionalPDF(data: ReportData) {
  const agg = computeAggregates(data);
  const { canSeeProfit, settings, kpis } = data;

  const w = window.open('', '_blank', 'width=1100,height=900');
  if (!w) return;

  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${settings.companyName} — Business Performance Report</title>
<style>
  @page { size: A4; margin: 12mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; font-size: 11px; line-height: 1.5; background: #fff; }
  .page { page-break-after: always; padding: 0; }
  .page:last-child { page-break-after: auto; }

  /* Header */
  .report-header { background: linear-gradient(135deg, #065f46 0%, #047857 50%, #10b981 100%); color: #fff; padding: 28px 32px; border-radius: 0 0 12px 12px; margin-bottom: 20px; }
  .report-header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .report-header .subtitle { font-size: 13px; opacity: 0.9; margin-top: 2px; }
  .report-header .meta { margin-top: 12px; display: flex; gap: 24px; font-size: 10px; opacity: 0.85; flex-wrap: wrap; }
  .report-header .meta span { display: flex; align-items: center; gap: 4px; }
  .company-info { display: flex; justify-content: space-between; align-items: flex-start; }
  .company-info .right { text-align: right; font-size: 10px; opacity: 0.85; }

  /* Sections */
  .section { margin-bottom: 18px; }
  .section-title { font-size: 14px; font-weight: 700; color: #065f46; border-bottom: 2px solid #10b981; padding-bottom: 4px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .section-title .icon { width: 18px; height: 18px; background: #d1fae5; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; }
  .subsection { margin: 10px 0 6px 0; font-size: 12px; font-weight: 600; color: #374151; }

  /* KPI Grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; background: #f9fafb; }
  .kpi-card .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; }
  .kpi-card .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .kpi-card .sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
  .kpi-card.green .value { color: #059669; }
  .kpi-card.blue .value { color: #2563eb; }
  .kpi-card.amber .value { color: #d97706; }
  .kpi-card.red .value { color: #dc2626; }
  .kpi-card.purple .value { color: #7c3aed; }

  /* 3-col grid */
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
  .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
  .stat-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; }
  .stat-box .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; }
  .stat-box .value { font-size: 15px; font-weight: 700; margin-top: 1px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
  thead th { background: #f1f5f9; color: #374151; font-weight: 600; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  tbody tr:hover { background: #f8fafc; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-bold { font-weight: 700; }
  .text-green { color: #059669; }
  .text-red { color: #dc2626; }
  .text-amber { color: #d97706; }
  .text-blue { color: #2563eb; }
  .total-row td { background: #f1f5f9; font-weight: 700; border-top: 2px solid #e2e8f0; }

  /* Progress bars */
  .progress-bar { background: #e5e7eb; border-radius: 4px; height: 6px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 4px; }
  .progress-green { background: #10b981; }
  .progress-blue { background: #3b82f6; }
  .progress-amber { background: #f59e0b; }
  .progress-red { background: #ef4444; }

  /* Badge */
  .badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  .badge-critical { background: #fef2f2; color: #dc2626; }
  .badge-warning { background: #fffbeb; color: #d97706; }
  .badge-notice { background: #eff6ff; color: #2563eb; }
  .badge-success { background: #ecfdf5; color: #059669; }

  /* Disclaimer / footer */
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #9ca3af; text-align: center; }
  .watermark { position: fixed; bottom: 10px; right: 16px; font-size: 7px; color: #d1d5db; }

  /* Print */
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .report-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  .print-btn { position: fixed; top: 16px; right: 16px; z-index: 999; padding: 10px 24px; background: #059669; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .print-btn:hover { background: #047857; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>

<!-- ═══════════════════════ PAGE 1: Executive Overview ═══════════════════════ -->
<div class="page">
  <div class="report-header">
    <div class="company-info">
      <div>
        <h1>${settings.companyName}</h1>
        <div class="subtitle">Comprehensive Business Performance Report</div>
      </div>
      <div class="right">
        <div>${settings.companyAddress}</div>
        <div>${settings.companyPhone}</div>
        <div>NTN: ${settings.companyNtn} &nbsp;|&nbsp; GST: ${settings.companyGst || 'N/A'}</div>
      </div>
    </div>
    <div class="meta">
      <span>📅 Report Period: <strong>${data.dateRange}</strong></span>
      <span>👤 Generated By: <strong>${data.generatedBy}</strong></span>
      <span>🕐 Generated: <strong>${nowStr()} at ${timeStr()}</strong></span>
      <span>📊 Data: <strong>${agg.completedSales.length} transactions, ${data.medicines.length} medicines</strong></span>
    </div>
  </div>

  <!-- Executive Summary KPI Cards -->
  <div class="section">
    <div class="section-title"><div class="icon">📊</div> Executive Summary</div>
    <div class="kpi-grid">
      <div class="kpi-card green">
        <div class="label">Total Revenue</div>
        <div class="value">Rs. ${fmt(agg.totalRevenue)}</div>
        <div class="sub">${agg.totalTransactions} transactions</div>
      </div>
      ${canSeeProfit ? `
      <div class="kpi-card blue">
        <div class="label">Gross Profit</div>
        <div class="value">Rs. ${fmt(agg.totalProfit)}</div>
        <div class="sub">${pct(agg.grossMargin)} margin</div>
      </div>
      <div class="kpi-card ${agg.netProfit >= 0 ? 'green' : 'red'}">
        <div class="label">Net Profit</div>
        <div class="value">Rs. ${fmt(agg.netProfit)}</div>
        <div class="sub">After Rs. ${fmt(agg.totalExpenses)} expenses</div>
      </div>
      ` : ''}
      <div class="kpi-card purple">
        <div class="label">Avg Ticket Size</div>
        <div class="value">Rs. ${fmt(agg.avgTicket)}</div>
        <div class="sub">${agg.totalItemsSold} units sold</div>
      </div>
      <div class="kpi-card amber">
        <div class="label">Receivables</div>
        <div class="value">Rs. ${fmt(agg.totalReceivables)}</div>
        <div class="sub">${agg.pendingSales.length} pending invoices</div>
      </div>
      <div class="kpi-card red">
        <div class="label">Supplier Payables</div>
        <div class="value">Rs. ${fmt(agg.totalPayables)}</div>
        <div class="sub">${data.suppliers.length} suppliers</div>
      </div>
      <div class="kpi-card blue">
        <div class="label">Discounts Given</div>
        <div class="value">Rs. ${fmt(agg.totalDiscount)}</div>
        <div class="sub">${agg.totalRevenue > 0 ? pct((agg.totalDiscount / (agg.totalRevenue + agg.totalDiscount)) * 100) : '0%'} of gross</div>
      </div>
      <div class="kpi-card green">
        <div class="label">Tax Collected</div>
        <div class="value">Rs. ${fmt(agg.totalTax)}</div>
        <div class="sub">GST/Sales Tax</div>
      </div>
    </div>
  </div>

  <!-- KPI Performance -->
  <div class="section">
    <div class="section-title"><div class="icon">🎯</div> Key Performance Indicators</div>
    <div class="grid-3">
      ${canSeeProfit ? `
      <div class="stat-box">
        <div class="label">Gross Profit Margin</div>
        <div class="value ${kpis.grossProfitMarginPercent >= 20 ? 'text-green' : kpis.grossProfitMarginPercent >= 10 ? 'text-amber' : 'text-red'}">${pct(kpis.grossProfitMarginPercent)}</div>
        <div class="progress-bar" style="margin-top:4px"><div class="progress-fill ${kpis.grossProfitMarginPercent >= 20 ? 'progress-green' : 'progress-amber'}" style="width:${Math.min(100, kpis.grossProfitMarginPercent * 4)}%"></div></div>
      </div>` : ''}
      <div class="stat-box">
        <div class="label">Inventory Turnover</div>
        <div class="value text-blue">${kpis.inventoryTurnoverRate.toFixed(2)}x</div>
        <div class="progress-bar" style="margin-top:4px"><div class="progress-fill progress-blue" style="width:${Math.min(100, kpis.inventoryTurnoverRate * 50)}%"></div></div>
      </div>
      <div class="stat-box">
        <div class="label">Avg Transaction Value</div>
        <div class="value">Rs. ${fmt(kpis.avgTransactionValue)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Cash:Credit Ratio</div>
        <div class="value">${kpis.cashCreditRatio.toFixed(2)} : 1</div>
      </div>
      <div class="stat-box">
        <div class="label">Stock Accuracy</div>
        <div class="value text-green">${pct(kpis.stockAccuracyPercent)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Expiry Loss Reduction</div>
        <div class="value ${kpis.expiryLossReductionPercent < 5 ? 'text-green' : 'text-red'}">${pct(kpis.expiryLossReductionPercent)}</div>
      </div>
    </div>
  </div>

  <!-- Payment Breakdown -->
  <div class="section">
    <div class="section-title"><div class="icon">💳</div> Payment Method Analysis</div>
    <table>
      <thead><tr><th>Method</th><th class="text-right">Amount (Rs.)</th><th class="text-right">% Share</th><th>Distribution</th></tr></thead>
      <tbody>
      ${Object.entries(agg.paymentBreakdown).map(([method, amount]) => {
        const share = agg.totalRevenue > 0 ? (amount / agg.totalRevenue) * 100 : 0;
        return `<tr>
          <td class="font-bold" style="text-transform:capitalize">${method}</td>
          <td class="text-right">Rs. ${fmt(amount)}</td>
          <td class="text-right">${pct(share)}</td>
          <td><div class="progress-bar" style="width:200px"><div class="progress-fill progress-green" style="width:${share}%"></div></div></td>
        </tr>`;
      }).join('')}
      <tr class="total-row">
        <td>Total</td>
        <td class="text-right">Rs. ${fmt(agg.totalRevenue)}</td>
        <td class="text-right">100%</td>
        <td></td>
      </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- ═══════════════════════ PAGE 2: Sales Analysis ═══════════════════════ -->
<div class="page">
  <div class="section">
    <div class="section-title"><div class="icon">📈</div> Daily Sales Trend</div>
    <table>
      <thead>
        <tr><th>Date</th><th class="text-right">Revenue</th><th class="text-center">Orders</th><th class="text-center">Items</th><th class="text-right">Avg/Order</th>${canSeeProfit ? '<th class="text-right">Profit</th><th class="text-right">Margin</th>' : ''}</tr>
      </thead>
      <tbody>
      ${agg.salesTrend.map(d => {
        const avgOrder = d.transactions > 0 ? d.revenue / d.transactions : 0;
        return `<tr>
          <td>${d.date}</td>
          <td class="text-right font-bold">Rs. ${fmt(d.revenue)}</td>
          <td class="text-center">${d.transactions}</td>
          <td class="text-center">${d.items}</td>
          <td class="text-right">Rs. ${fmt(avgOrder)}</td>
          ${canSeeProfit ? `<td class="text-right text-green">Rs. ${fmt(d.profit)}</td><td class="text-right">${d.revenue > 0 ? pct((d.profit / d.revenue) * 100) : '-'}</td>` : ''}
        </tr>`;
      }).join('')}
      <tr class="total-row">
        <td>Grand Total</td>
        <td class="text-right">Rs. ${fmt(agg.totalRevenue)}</td>
        <td class="text-center">${agg.totalTransactions}</td>
        <td class="text-center">${agg.totalItemsSold}</td>
        <td class="text-right">Rs. ${fmt(agg.avgTicket)}</td>
        ${canSeeProfit ? `<td class="text-right">Rs. ${fmt(agg.totalProfit)}</td><td class="text-right">${pct(agg.grossMargin)}</td>` : ''}
      </tr>
      </tbody>
    </table>
  </div>

  <!-- Category Performance -->
  <div class="section">
    <div class="section-title"><div class="icon">📦</div> Sales by Category</div>
    <table>
      <thead>
        <tr><th>Category</th><th class="text-right">Revenue</th><th class="text-center">Units</th><th class="text-center">Items</th>${canSeeProfit ? '<th class="text-right">Profit</th><th class="text-right">Margin</th>' : ''}<th class="text-right">% Revenue</th><th>Share</th></tr>
      </thead>
      <tbody>
      ${agg.categories.map(c => {
        const share = agg.totalRevenue > 0 ? (c.revenue / agg.totalRevenue) * 100 : 0;
        return `<tr>
          <td class="font-bold" style="text-transform:capitalize">${c.name}</td>
          <td class="text-right">Rs. ${fmt(c.revenue)}</td>
          <td class="text-center">${c.qty}</td>
          <td class="text-center">${c.count}</td>
          ${canSeeProfit ? `<td class="text-right text-green">Rs. ${fmt(c.profit)}</td><td class="text-right">${c.revenue > 0 ? pct((c.profit / c.revenue) * 100) : '-'}</td>` : ''}
          <td class="text-right">${pct(share)}</td>
          <td><div class="progress-bar" style="width:120px"><div class="progress-fill progress-blue" style="width:${share}%"></div></div></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>

  <!-- Top 15 Products -->
  <div class="section">
    <div class="section-title"><div class="icon">🏆</div> Top Products by Revenue</div>
    <table>
      <thead>
        <tr><th>#</th><th>Product</th><th>Category</th><th class="text-center">Units</th><th class="text-right">Revenue</th>${canSeeProfit ? '<th class="text-right">Cost</th><th class="text-right">Profit</th><th class="text-right">Margin</th>' : ''}<th class="text-right">% Revenue</th></tr>
      </thead>
      <tbody>
      ${agg.topProducts.slice(0, 15).map((p, i) => {
        const share = agg.totalRevenue > 0 ? (p.revenue / agg.totalRevenue) * 100 : 0;
        return `<tr>
          <td class="text-center font-bold">${i + 1}</td>
          <td class="font-bold">${p.name}</td>
          <td style="text-transform:capitalize">${p.category}</td>
          <td class="text-center">${p.qty}</td>
          <td class="text-right">Rs. ${fmt(p.revenue)}</td>
          ${canSeeProfit ? `<td class="text-right">Rs. ${fmt(p.cost)}</td><td class="text-right text-green">Rs. ${fmt(p.profit)}</td><td class="text-right">${p.revenue > 0 ? pct((p.profit / p.revenue) * 100) : '-'}</td>` : ''}
          <td class="text-right">${pct(share)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>
</div>

<!-- ═══════════════════════ PAGE 3: Inventory & Expiry ═══════════════════════ -->
<div class="page">
  <!-- Inventory Overview -->
  <div class="section">
    <div class="section-title"><div class="icon">📋</div> Inventory Overview</div>
    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="label">Total Medicines</div>
        <div class="value">${data.medicines.filter(m => m.isActive).length}</div>
        <div class="sub">${agg.activeBatches.length} active batches</div>
      </div>
      <div class="kpi-card green">
        <div class="label">Stock Value (Cost)</div>
        <div class="value">Rs. ${fmt(agg.totalStockValue)}</div>
        <div class="sub">At purchase price</div>
      </div>
      <div class="kpi-card blue">
        <div class="label">Retail Value</div>
        <div class="value">Rs. ${fmt(agg.totalRetailValue)}</div>
        <div class="sub">At sale price</div>
      </div>
      ${canSeeProfit ? `
      <div class="kpi-card green">
        <div class="label">Unrealized Profit</div>
        <div class="value">Rs. ${fmt(agg.potentialProfit)}</div>
        <div class="sub">If all stock sold at MRP</div>
      </div>` : ''}
    </div>
  </div>

  <!-- Expiry Risk -->
  <div class="section">
    <div class="section-title"><div class="icon">⚠️</div> Expiry Risk Analysis <span class="badge badge-critical" style="margin-left:8px">${agg.criticalExpiry.length} Critical</span> <span class="badge badge-warning">${agg.warningExpiry.length} Warning</span></div>
    ${agg.expiryRisk.length > 0 ? `
    <table>
      <thead>
        <tr><th>Medicine</th><th>Batch</th><th class="text-center">Qty</th><th>Expiry</th><th class="text-center">Days Left</th><th>Risk</th><th class="text-right">Value at Risk</th></tr>
      </thead>
      <tbody>
      ${agg.expiryRisk.slice(0, 20).map(b => `<tr>
        <td class="font-bold">${b.medicine}</td>
        <td>${b.batch}</td>
        <td class="text-center">${b.qty}</td>
        <td>${dateStr(b.expiryDate)}</td>
        <td class="text-center font-bold ${b.daysToExpiry <= 30 ? 'text-red' : b.daysToExpiry <= 90 ? 'text-amber' : 'text-blue'}">${b.daysToExpiry}d</td>
        <td><span class="badge ${b.daysToExpiry <= 30 ? 'badge-critical' : b.daysToExpiry <= 90 ? 'badge-warning' : 'badge-notice'}">${b.daysToExpiry <= 30 ? 'CRITICAL' : b.daysToExpiry <= 90 ? 'WARNING' : 'NOTICE'}</span></td>
        <td class="text-right text-red font-bold">Rs. ${fmt(b.stockValue)}</td>
      </tr>`).join('')}
      </tbody>
    </table>` : '<p style="text-align:center;color:#6b7280;padding:20px;">No expiry risk items within 180 days — Great inventory management!</p>'}
  </div>

  ${canSeeProfit ? `
  <!-- Batch Profit Analysis (Top 20) -->
  <div class="section">
    <div class="section-title"><div class="icon">⚡</div> Batch Profit Analysis (Top 20)</div>
    <table>
      <thead>
        <tr><th>Medicine</th><th>Batch</th><th class="text-center">Qty</th><th class="text-right">Cost</th><th class="text-right">Sale</th><th class="text-right">Profit/Unit</th><th class="text-right">Margin</th><th class="text-right">Potential Profit</th></tr>
      </thead>
      <tbody>
      ${agg.batchAnalysis.slice(0, 20).map(b => `<tr>
        <td class="font-bold">${b.medicine}</td>
        <td>${b.batch}</td>
        <td class="text-center">${b.qty}</td>
        <td class="text-right">Rs. ${fmtDec(b.cost)}</td>
        <td class="text-right">Rs. ${fmtDec(b.sale)}</td>
        <td class="text-right ${b.profitPerUnit >= 0 ? 'text-green' : 'text-red'} font-bold">Rs. ${fmtDec(b.profitPerUnit)}</td>
        <td class="text-right">${pct(b.margin)}</td>
        <td class="text-right text-green font-bold">Rs. ${fmt(b.potentialProfit)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}
</div>

<!-- ═══════════════════════ PAGE 4: Financial & Suppliers ═══════════════════════ -->
<div class="page">
  ${canSeeProfit ? `
  <!-- Profit & Loss Summary -->
  <div class="section">
    <div class="section-title"><div class="icon">💰</div> Profit & Loss Summary</div>
    <table>
      <tbody>
        <tr><td class="font-bold" style="width:60%">Gross Revenue (Sales)</td><td class="text-right font-bold text-green" style="font-size:13px">Rs. ${fmt(agg.totalRevenue)}</td></tr>
        <tr><td style="padding-left:20px">Less: Discounts</td><td class="text-right text-red">(Rs. ${fmt(agg.totalDiscount)})</td></tr>
        <tr><td style="padding-left:20px">Less: Cost of Goods Sold</td><td class="text-right text-red">(Rs. ${fmt(agg.totalRevenue - agg.totalProfit)})</td></tr>
        <tr class="total-row"><td class="font-bold">Gross Profit</td><td class="text-right font-bold text-green" style="font-size:13px">Rs. ${fmt(agg.totalProfit)}</td></tr>
        <tr><td colspan="2" style="height:6px"></td></tr>
        ${Object.entries(agg.expenseCats).map(([cat, amt]) =>
          `<tr><td style="padding-left:20px;text-transform:capitalize">Less: ${cat}</td><td class="text-right text-red">(Rs. ${fmt(amt)})</td></tr>`
        ).join('')}
        <tr><td style="padding-left:20px;font-weight:600">Total Operating Expenses</td><td class="text-right text-red font-bold">(Rs. ${fmt(agg.totalExpenses)})</td></tr>
        <tr class="total-row"><td class="font-bold" style="font-size:13px">Net Profit / (Loss)</td><td class="text-right font-bold ${agg.netProfit >= 0 ? 'text-green' : 'text-red'}" style="font-size:15px">Rs. ${fmt(agg.netProfit)}</td></tr>
        <tr><td>Net Profit Margin</td><td class="text-right font-bold">${pct(agg.netMargin)}</td></tr>
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- Expense Breakdown -->
  <div class="section">
    <div class="section-title"><div class="icon">📑</div> Expense Breakdown</div>
    <table>
      <thead><tr><th>Category</th><th class="text-right">Amount</th><th class="text-right">% Share</th><th>Distribution</th></tr></thead>
      <tbody>
      ${Object.entries(agg.expenseCats).map(([cat, amt]) => {
        const share = agg.totalExpenses > 0 ? (amt / agg.totalExpenses) * 100 : 0;
        return `<tr>
          <td class="font-bold" style="text-transform:capitalize">${cat}</td>
          <td class="text-right text-red">Rs. ${fmt(amt)}</td>
          <td class="text-right">${pct(share)}</td>
          <td><div class="progress-bar" style="width:160px"><div class="progress-fill progress-red" style="width:${share}%"></div></div></td>
        </tr>`;
      }).join('')}
      <tr class="total-row">
        <td>Total Expenses</td>
        <td class="text-right">Rs. ${fmt(agg.totalExpenses)}</td>
        <td class="text-right">100%</td>
        <td></td>
      </tr>
      </tbody>
    </table>
  </div>

  <!-- Supplier Payables -->
  <div class="section">
    <div class="section-title"><div class="icon">🚚</div> Supplier Analysis & Payables</div>
    <table>
      <thead>
        <tr><th>Supplier</th><th>Contact</th><th>Phone</th><th class="text-right">Balance Due</th><th class="text-right">Credit Limit</th><th class="text-right">Utilization</th>${canSeeProfit ? '<th class="text-right">Revenue</th><th class="text-right">Profit</th>' : ''}</tr>
      </thead>
      <tbody>
      ${agg.supplierAnalysis.map(s => {
        const utilization = s.creditLimit > 0 ? (s.balance / s.creditLimit) * 100 : 0;
        return `<tr>
          <td class="font-bold">${s.name}</td>
          <td>${s.contact}</td>
          <td>${s.phone}</td>
          <td class="text-right text-red font-bold">Rs. ${fmt(s.balance)}</td>
          <td class="text-right">Rs. ${fmt(s.creditLimit)}</td>
          <td class="text-right"><span class="${utilization > 80 ? 'text-red' : utilization > 50 ? 'text-amber' : 'text-green'}">${pct(utilization)}</span></td>
          ${canSeeProfit ? `<td class="text-right">Rs. ${fmt(s.revenue)}</td><td class="text-right text-green">Rs. ${fmt(s.profit)}</td>` : ''}
        </tr>`;
      }).join('')}
      <tr class="total-row">
        <td colspan="3">Total</td>
        <td class="text-right">Rs. ${fmt(agg.totalPayables)}</td>
        <td class="text-right">Rs. ${fmt(data.suppliers.reduce((s, sup) => s + sup.creditLimit, 0))}</td>
        <td></td>
        ${canSeeProfit ? `<td class="text-right">Rs. ${fmt(agg.supplierAnalysis.reduce((s, s2) => s + s2.revenue, 0))}</td><td class="text-right">Rs. ${fmt(agg.supplierAnalysis.reduce((s, s2) => s + s2.profit, 0))}</td>` : ''}
      </tr>
      </tbody>
    </table>
  </div>

  <!-- Top Customers -->
  <div class="section">
    <div class="section-title"><div class="icon">👥</div> Top Customers</div>
    <table>
      <thead>
        <tr><th>#</th><th>Customer</th><th class="text-center">Orders</th><th class="text-right">Revenue</th>${canSeeProfit ? '<th class="text-right">Profit</th><th class="text-right">Margin</th>' : ''}<th class="text-right">% Revenue</th></tr>
      </thead>
      <tbody>
      ${agg.topCustomers.slice(0, 15).map((c, i) => {
        const share = agg.totalRevenue > 0 ? (c.revenue / agg.totalRevenue) * 100 : 0;
        return `<tr>
          <td class="text-center">${i + 1}</td>
          <td class="font-bold">${c.name}</td>
          <td class="text-center">${c.transactions}</td>
          <td class="text-right">Rs. ${fmt(c.revenue)}</td>
          ${canSeeProfit ? `<td class="text-right text-green">Rs. ${fmt(c.profit)}</td><td class="text-right">${c.revenue > 0 ? pct((c.profit / c.revenue) * 100) : '-'}</td>` : ''}
          <td class="text-right">${pct(share)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>This report is computer-generated by ${settings.companyName} — PharmaPOS Management System. All figures are based on recorded transactions and may be subject to audit verification.</p>
    <p style="margin-top:4px">Confidential — For authorized personnel only. Report ID: RPT-${Date.now().toString(36).toUpperCase()} &nbsp;|&nbsp; Page 4 of 4</p>
  </div>
</div>

<div class="watermark">PharmaPOS v2.0 — ${settings.companyName}</div>
</body></html>`);

  w.document.close();
  w.focus();
}
