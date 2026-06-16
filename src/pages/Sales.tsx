import { useState, useMemo } from 'react';
import { useSettingsStore, useSalesStore, useInventoryStore, useAuthStore } from '@/store';
import { apiRequest } from '@/lib/backend';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { exportToCSV } from '@/lib/csv';
import { exportSalesPDF } from '@/lib/reportExport';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Receipt,
  Calendar,
  User,
  Printer,
  Eye,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Filter,
  Download,
  FileText,
  FileSpreadsheet,
  Stethoscope,
} from 'lucide-react';
import type { PaymentMethod, Sale, SaleReturn } from '@/types';
import { openDataUrlInNewTab } from '@/lib/openImage';
import { useTranslation } from '@/hooks/useTranslation';

// SECURITY: escape any value interpolated into the receipt HTML we build and feed
// to a same-origin print window. Without this, a medicine name / customer name /
// return reason containing markup (e.g. <img onerror=...>) would execute JS with
// the app's origin and could exfiltrate the session token.
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function Sales() {
  const { settings } = useSettingsStore();
  const { t, isRTL } = useTranslation();
  const { sales, saleReturns, getTodaySales, updateSale, addSaleReturn } = useSalesStore();
  const { activeBranchId } = useAuthStore();
  const { medicines, batches, updateBatch } = useInventoryStore();

  const getMedicineName = (id: string) => medicines.find(m => m.id === id)?.name ?? 'Unknown';

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [drugClassFilter, setDrugClassFilter] = useState<'all' | 'controlled' | 'prescription' | 'otc'>('all');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod['method']>('cash');
  const [restockInventory, setRestockInventory] = useState(true);
  // M7 — Per-line restock override. Items not in the map fall back to the
  // global `restockInventory` flag. On submit, restock is only sent as true
  // when EVERY returned line opts in.
  const [restockByItem, setRestockByItem] = useState<Record<string, boolean>>({});

  const todaySales = getTodaySales();

  // Build a quick medicineId → classification lookup so the drug-class filter
  // can run in O(items) instead of doing nested find() per row.
  const medClassById = useMemo(() => {
    const m = new Map<string, 'otc' | 'prescription' | 'controlled'>();
    for (const med of medicines) {
      m.set(med.id, (med.classification || (med.isPrescriptionRequired ? 'prescription' : 'otc')) as 'otc' | 'prescription' | 'controlled');
    }
    return m;
  }, [medicines]);

  // Filter sales
  const filteredSales = sales.filter((sale) => {
    // Each branch sees only its own sales (owner switches branch in the header).
    if (activeBranchId && sale.branchId !== activeBranchId) return false;
    const matchesSearch = searchQuery === '' ||
      sale.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customerPhone?.includes(searchQuery);

    let matchesDate = true;
    const saleDate = new Date(sale.saleDate);
    const today = new Date();

    if (dateFilter === 'today') {
      matchesDate = saleDate.toDateString() === today.toDateString();
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      matchesDate = saleDate >= weekAgo;
    } else if (dateFilter === 'month') {
      matchesDate = saleDate.getMonth() === today.getMonth() &&
                    saleDate.getFullYear() === today.getFullYear();
    }

    // Drug-class filter: "controlled" = sale contains at least one controlled drug;
    // "prescription" = at least one Rx drug (but no controlled); "otc" = all items OTC.
    let matchesClass = true;
    if (drugClassFilter !== 'all') {
      const classes = sale.items.map(it => medClassById.get(it.medicineId) ?? 'otc');
      const hasControlled = classes.includes('controlled');
      const hasRx = classes.includes('prescription');
      if (drugClassFilter === 'controlled') matchesClass = hasControlled;
      else if (drugClassFilter === 'prescription') matchesClass = hasRx && !hasControlled;
      else if (drugClassFilter === 'otc') matchesClass = !hasRx && !hasControlled;
    }

    return matchesSearch && matchesDate && matchesClass;
  });

  // Calculate stats
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalTransactions = filteredSales.length;
  const averageTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  const returns = filteredSales.filter(s => s.status === 'returned').length;

  const getReturnedQuantity = (saleId: string, saleItemId: string) =>
    saleReturns
      .filter((row) => row.saleId === saleId)
      .flatMap((row) => row.items)
      .filter((item) => item.saleItemId === saleItemId)
      .reduce((sum, item) => sum + item.quantity, 0);

  const getRemainingReturnQuantity = (sale: Sale, saleItemId: string) => {
    const item = sale.items.find((saleItem) => saleItem.id === saleItemId);
    if (!item) return 0;
    return Math.max(0, item.quantity - getReturnedQuantity(sale.id, saleItemId));
  };

  // View sale details
  const viewDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowDetailsDialog(true);
  };

  const openReturnDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setReturnQuantities({});
    setReturnReason('');
    setRefundMethod('cash');
    setRestockInventory(true);
    setRestockByItem({});
    setShowReturnDialog(true);
  };

  const printReturnReceipt = (saleReturn: SaleReturn, sale: Sale) => {
    const w = window.open('', '_blank', 'width=350,height=600');
    if (!w) { toast.error(t('sales.popupBlocked')); return; }
    const rows = saleReturn.items.map((item) => `
      <tr>
        <td style="padding:4px 2px;font-size:12px">${esc(item.medicineName || getMedicineName(item.medicineId))}</td>
        <td style="padding:4px 2px;font-size:12px;text-align:center">${item.quantity}</td>
        <td style="padding:4px 2px;font-size:12px;text-align:right">Rs.${item.total.toFixed(2)}</td>
      </tr>`).join('');
    w.document.write(`<html><head><title>Return Receipt</title>
      <style>body{font-family:monospace;width:280px;margin:0 auto;padding:10px}
      h2,h3{margin:4px 0;text-align:center}hr{border:none;border-top:1px dashed #000}
      table{width:100%;border-collapse:collapse}th{font-size:11px;border-bottom:1px solid #000;padding:4px 2px}
      .right{text-align:right}.center{text-align:center}.bold{font-weight:bold}</style></head><body onload="window.print()">
      <h2>${esc(settings.companyName)}</h2>
      <h3>RETURN RECEIPT</h3>
      <p class="center" style="font-size:11px;margin:2px 0">${esc(settings.companyAddress)}<br>${esc(settings.companyPhone)}</p>
      <hr/>
      <p style="font-size:12px"><strong>Return #:</strong> ${esc(saleReturn.returnNumber)}<br/>
      <strong>Original Invoice:</strong> ${esc(sale.invoiceNumber)}<br/>
      <strong>Date:</strong> ${new Date(saleReturn.returnDate).toLocaleString('en-PK')}<br/>
      <strong>Customer:</strong> ${esc(sale.customerName || t('common.walkIn'))}</p>
      <hr/>
      <table><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Refund</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <hr/>
      <table style="font-size:12px">
        <tr class="bold" style="font-size:14px"><td>Refund Total</td><td class="right">Rs.${saleReturn.totalAmount.toFixed(2)}</td></tr>
      </table>
      <hr/>
      <p class="center" style="font-size:11px">Refund: ${esc(saleReturn.refundMethod.method)}<br/>Reason: ${esc(saleReturn.reason)}<br/>Inventory Restocked: ${saleReturn.restockInventory ? 'Yes' : 'No'}</p>
      ${saleReturn.fbrStatus && saleReturn.fbrStatus !== 'not_required' ? `<p class="center" style="font-size:11px">FBR Credit Note: ${saleReturn.fbrStatus}</p>` : ''}
      </body></html>`);
    w.document.close();
  };

  const handleCreateReturn = async () => {
    if (!selectedSale) return;
    const items = selectedSale.items
      .map((item) => {
        const quantity = Number(returnQuantities[item.id] || 0);
        return {
          saleItemId: item.id,
          medicineId: item.medicineId,
          medicineName: getMedicineName(item.medicineId),
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          taxPercent: item.taxPercent,
        };
      })
      .filter((item) => item.quantity > 0);
    if (items.length === 0) {
      toast.error('Select at least one item quantity to return');
      return;
    }
    if (!returnReason.trim()) {
      toast.error('Return reason is required');
      return;
    }

    // M7 — Per-line restock honors the global flag unless a line was toggled
    // off. Only flip server-side `restockInventory` to true when every returned
    // line opted in.
    const effectiveRestock = items.every((it) => {
      const explicit = restockByItem[it.saleItemId];
      return explicit === undefined ? restockInventory : explicit;
    });
    try {
      const response = await apiRequest<{ saleReturn: SaleReturn; sale: Sale }>('/sale-returns', {
        method: 'POST',
        body: JSON.stringify({
          saleId: selectedSale.id,
          items,
          refundMethod: { method: refundMethod, amount: 0 },
          reason: returnReason,
          restockInventory: effectiveRestock,
        }),
      });
      addSaleReturn(response.saleReturn);
      updateSale(response.sale.id, response.sale);
      if (effectiveRestock) {
        response.saleReturn.items.forEach((item) => {
          const batch = batches.find((row) => row.id === item.batchId);
          if (batch) updateBatch(batch.id, { quantity: batch.quantity + item.quantity });
        });
      }
      setShowReturnDialog(false);
      toast.success(`Return ${response.saleReturn.returnNumber} created`);
      printReturnReceipt(response.saleReturn, response.sale);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create return');
    }
  };

  // Print receipt for a sale
  const handlePrintSale = (sale: Sale) => {
    const w = window.open('', '_blank', 'width=350,height=600');
    if (!w) { toast.error(t('sales.popupBlocked')); return; }
    const rows = sale.items.map(item => `
      <tr>
        <td style="padding:4px 2px;font-size:12px">${esc(getMedicineName(item.medicineId))}</td>
        <td style="padding:4px 2px;font-size:12px;text-align:center">${item.quantity}</td>
        <td style="padding:4px 2px;font-size:12px;text-align:right">Rs.${item.total.toFixed(2)}</td>
      </tr>`).join('');
    w.document.write(`<html><head><title>Receipt</title>
      <style>body{font-family:monospace;width:280px;margin:0 auto;padding:10px}
      h2,h3{margin:4px 0;text-align:center}hr{border:none;border-top:1px dashed #000}
      table{width:100%;border-collapse:collapse}th{font-size:11px;border-bottom:1px solid #000;padding:4px 2px}
      .right{text-align:right}.center{text-align:center}.bold{font-weight:bold}
      </style></head><body onload="window.print()">
      <h2>${esc(settings.companyName)}</h2>
      <p class="center" style="font-size:11px;margin:2px 0">${esc(settings.companyAddress)}<br>${esc(settings.companyPhone)}</p>
      <hr/>
      <p style="font-size:12px"><strong>${t('sales.invoiceNo')}:</strong> ${esc(sale.invoiceNumber)}<br/>
      <strong>${t('common.date')}:</strong> ${new Date(sale.saleDate).toLocaleString('en-PK')}<br/>
      <strong>${t('sales.customer')}:</strong> ${esc(sale.customerName || t('common.walkIn'))}</p>
      <hr/>
      <table><thead><tr><th style="text-align:left">${t('common.items')}</th><th>${t('sales.qty')}</th><th style="text-align:right">${t('common.total')}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <hr/>
      <table style="font-size:12px">
        <tr><td>${t('common.subtotal')}</td><td class="right">Rs.${sale.subtotal.toFixed(2)}</td></tr>
        <tr><td>${t('common.discount')}</td><td class="right">-Rs.${sale.discountAmount.toFixed(2)}</td></tr>
        <tr><td>${t('common.tax')}</td><td class="right">Rs.${sale.taxAmount.toFixed(2)}</td></tr>
        <tr class="bold" style="font-size:14px"><td>${t('common.total')}</td><td class="right">Rs.${sale.totalAmount.toFixed(2)}</td></tr>
      </table>
      <hr/>
      <p class="center" style="font-size:11px">${t('sales.paymentMethod')}: ${esc(sale.paymentMethods.map(p => p.method).join(', ')) || t('sales.pending')}<br/>
      ${t('common.status')}: ${esc(sale.status)}</p>
      <p class="center" style="font-size:10px;margin-top:10px">${t('pos.thankYou')}</p>
      </body></html>`);
    w.document.close();
  };

  // Get payment method icon
  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'cash': return 'Cash';
      case 'card': return 'Card';
      case 'jazzcash': return 'JazzCash';
      case 'easypaisa': return 'EasyPaisa';
      default: return method;
    }
  };

  // Human-readable summary of which filters are active — printed at the top
  // of the PDF so the recipient knows what slice of data they're looking at.
  const buildFilterLabel = (): string => {
    const parts: string[] = [];
    if (dateFilter === 'today') parts.push('Today');
    else if (dateFilter === 'week') parts.push('This Week');
    else if (dateFilter === 'month') parts.push('This Month');
    else parts.push('All Time');
    if (drugClassFilter === 'controlled') parts.push('Controlled drugs');
    else if (drugClassFilter === 'prescription') parts.push('Prescription (Rx) drugs');
    else if (drugClassFilter === 'otc') parts.push('OTC only');
    if (searchQuery) parts.push(`Search: "${searchQuery}"`);
    return parts.join(' · ');
  };

  const handleExportPDF = (includePrescriptions: boolean) => {
    if (filteredSales.length === 0) { toast.error(t('sales.noSalesExport')); return; }
    exportSalesPDF({
      sales: filteredSales,
      medicines,
      settings,
      includePrescriptions,
      filterLabel: buildFilterLabel(),
    });
    toast.success(includePrescriptions
      ? `Generated PDF report with prescriptions (${filteredSales.length} sales)`
      : `Generated PDF report (${filteredSales.length} sales)`);
  };

  // ── Export sales ──
  const handleExportSales = () => {
    const rows = filteredSales.map(s => ({
      invoiceNumber: s.invoiceNumber,
      date: new Date(s.saleDate).toLocaleDateString(),
      customerName: s.customerName ?? 'Walk-in',
      customerPhone: s.customerPhone ?? '',
      items: s.items.length,
      subtotal: s.subtotal,
      discount: s.discountAmount,
      tax: s.taxAmount,
      total: s.totalAmount,
      paid: s.paidAmount,
      balance: s.balanceAmount,
      paymentMethod: s.paymentMethods.map(p => p.method).join(', '),
      status: s.status,
    }));
    if (rows.length === 0) { toast.error(t('sales.noSalesExport')); return; }
    exportToCSV(rows as any, [
      { key: 'invoiceNumber', label: 'Invoice #' },
      { key: 'date', label: 'Date' },
      { key: 'customerName', label: 'Customer' },
      { key: 'customerPhone', label: 'Phone' },
      { key: 'items', label: 'Items' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'discount', label: 'Discount' },
      { key: 'tax', label: 'Tax' },
      { key: 'total', label: 'Total' },
      { key: 'paid', label: 'Paid' },
      { key: 'balance', label: 'Balance' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'status', label: 'Status' },
    ], 'sales');
    toast.success(t('sales.exportedSales', rows.length));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('sales.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('sales.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                {t('common.export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Export current filtered sales</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleExportPDF(false)}>
                <FileText className="w-4 h-4 text-emerald-600" />
                <div className="flex flex-col">
                  <span className="font-medium">PDF — Sales Report</span>
                  <span className="text-xs text-gray-500">Letterhead style, no prescription details</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleExportPDF(true)}>
                <Stethoscope className="w-4 h-4 text-blue-600" />
                <div className="flex flex-col">
                  <span className="font-medium">PDF — With Prescriptions</span>
                  <span className="text-xs text-gray-500">Includes Rx images for DRAP / inspections</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleExportSales}>
                <FileSpreadsheet className="w-4 h-4 text-gray-600" />
                <div className="flex flex-col">
                  <span className="font-medium">CSV — Spreadsheet</span>
                  <span className="text-xs text-gray-500">For Excel / Google Sheets</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => window.location.href = '/pos'}
          >
            <Receipt className="w-4 h-4" />
            {t('sales.newSale')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('sales.totalRevenue')}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  Rs. {totalRevenue.toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('sales.transactionsCount')}</p>
                <p className="text-2xl font-bold">{totalTransactions}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('sales.averageTicket')}</p>
                <p className="text-2xl font-bold text-amber-500">
                  Rs. {averageTicket.toFixed(0)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('sales.returns')}</p>
                <p className="text-2xl font-bold text-red-500">{returns}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t('sales.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t('sales.dateRange')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.allTime')}</SelectItem>
                <SelectItem value="today">{t('common.today')}</SelectItem>
                <SelectItem value="week">{t('common.thisWeek')}</SelectItem>
                <SelectItem value="month">{t('common.thisMonth')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={drugClassFilter} onValueChange={(v) => setDrugClassFilter(v as typeof drugClassFilter)}>
              <SelectTrigger className="w-52">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Drug class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sales</SelectItem>
                <SelectItem value="controlled">Controlled drugs</SelectItem>
                <SelectItem value="prescription">Prescription (Rx) drugs</SelectItem>
                <SelectItem value="otc">OTC only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sales Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            {t('sales.salesTransactions')} ({filteredSales.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('sales.invoiceNo')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('sales.customer')}</TableHead>
                  <TableHead>{t('common.items')}</TableHead>
                  <TableHead>{t('common.total')}</TableHead>
                  <TableHead>{t('sales.paymentMethod')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-emerald-500" />
                        <span className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {sale.invoiceNumber}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(sale.saleDate).toLocaleDateString('en-PK', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{sale.customerName || t('common.walkIn')}</span>
                        {sale.customerPhone && (
                          <span className="text-xs text-gray-500">{sale.customerPhone}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{sale.items.length} {t('common.items')}</span>
                        {(() => {
                          // Compute drug-class badges so the cashier sees at a glance
                          // whether a row was a controlled/Rx/OTC sale.
                          const classes = sale.items.map((it) => medClassById.get(it.medicineId) ?? 'otc');
                          const hasControlled = classes.includes('controlled');
                          const hasRx = classes.includes('prescription');
                          if (hasControlled) return <Badge variant="destructive" className="text-[10px]">Controlled</Badge>;
                          if (hasRx || sale.isPrescription) return <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-300">Rx</Badge>;
                          return <Badge variant="secondary" className="text-[10px]">OTC</Badge>;
                        })()}
                      </div>
                      {sale.isPrescription && (sale.doctorName || sale.prescriptionNumber) && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {sale.doctorName ? `Dr. ${sale.doctorName}` : ''}
                          {sale.prescriptionNumber ? ` · Rx# ${sale.prescriptionNumber}` : ''}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      Rs. {sale.totalAmount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getPaymentMethodIcon(sale.paymentMethods[0]?.method)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        sale.status === 'completed' ? 'success' :
                        sale.status === 'returned' ? 'destructive' :
                        sale.status === 'partial_returned' ? 'warning' :
                        'warning'
                      }>
                        {sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewDetails(sale)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePrintSale(sale)}
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                        {['completed', 'partial_returned'].includes(sale.status) && sale.items.some((item) => getRemainingReturnQuantity(sale, item.id) > 0) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-300 hover:bg-red-50 gap-1.5 h-8"
                            onClick={() => openReturnDialog(sale)}
                            title="Return / refund item(s)"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Return
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Sale Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('sales.invoiceNo')} {selectedSale?.invoiceNumber}</DialogTitle>
            <DialogDescription>
              {t('sales.saleDetails')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Invoice Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">{t('common.date')}</p>
                <p className="font-medium">
                  {selectedSale?.saleDate.toLocaleDateString('en-PK', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('sales.customer')}</p>
                <p className="font-medium">{selectedSale?.customerName || t('common.walkIn')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('common.phone')}</p>
                <p className="font-medium">{selectedSale?.customerPhone || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('sales.paymentMethod')}</p>
                <p className="font-medium">
                  {selectedSale?.paymentMethods.map(p => getPaymentMethodIcon(p.method)).join(', ')}
                </p>
              </div>
              {selectedSale?.isPrescription && (
                <div className="col-span-2 border-t pt-3 mt-1">
                  <p className="text-sm text-gray-500 mb-1">Prescription</p>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedSale.doctorName && (
                      <div><span className="text-xs text-gray-500">Doctor: </span><span className="font-medium">{selectedSale.doctorName}</span></div>
                    )}
                    {selectedSale.prescriptionNumber && (
                      <div><span className="text-xs text-gray-500">Rx #: </span><span className="font-medium">{selectedSale.prescriptionNumber}</span></div>
                    )}
                  </div>
                  {selectedSale.prescriptionImageUrl && (
                    <button
                      type="button"
                      onClick={() => openDataUrlInNewTab(selectedSale.prescriptionImageUrl!, `prescription-${selectedSale.invoiceNumber}`)}
                      className="inline-block mt-2 cursor-pointer"
                    >
                      {selectedSale.prescriptionImageUrl.startsWith('data:image') ? (
                        <img src={selectedSale.prescriptionImageUrl} alt="Prescription scan" className="max-h-40 rounded border hover:opacity-90" />
                      ) : (
                        <span className="text-xs text-blue-600 underline">View prescription file</span>
                      )}
                    </button>
                  )}
                </div>
              )}
              {/* spacer so the next row stays aligned in the 2-col grid */}
              <div className="hidden" />
            </div>

            {/* Items Table */}
            <div>
              <h4 className="font-medium mb-3">{t('common.items')}</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('sales.medicine')}</TableHead>
                    <TableHead>{t('sales.batch')}</TableHead>
                    <TableHead>{t('sales.qty')}</TableHead>
                    <TableHead>{t('common.price')}</TableHead>
                    <TableHead>{t('common.total')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedSale?.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{getMedicineName(item.medicineId)}</TableCell>
                      <TableCell>{item.batchNumber}</TableCell>
                      <TableCell>
                        {item.quantity}
                        {selectedSale && getReturnedQuantity(selectedSale.id, item.id) > 0 && (
                          <span className="ml-2 text-xs text-red-500">
                            ({getReturnedQuantity(selectedSale.id, item.id)} returned)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>Rs. {item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell>Rs. {item.total.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="border-t pt-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('common.subtotal')}</span>
                  <span>Rs. {selectedSale?.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('common.discount')}</span>
                  <span className="text-emerald-500">
                    -Rs. {selectedSale?.discountAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('common.tax')}</span>
                  <span>Rs. {selectedSale?.taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold pt-2 border-t">
                  <span>{t('common.total')}</span>
                  <span className="text-emerald-500">
                    Rs. {selectedSale?.totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return Management - {selectedSale?.invoiceNumber}</DialogTitle>
            <DialogDescription>
              Select returned quantities. The system blocks quantities greater than the remaining sold quantity.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Sold</TableHead>
                  <TableHead>Already Returned</TableHead>
                  <TableHead>Return Qty</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                  <TableHead className="text-center">Restock?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedSale?.items.map((item) => {
                  const alreadyReturned = selectedSale ? getReturnedQuantity(selectedSale.id, item.id) : 0;
                  const remaining = selectedSale ? getRemainingReturnQuantity(selectedSale, item.id) : 0;
                  const quantity = Number(returnQuantities[item.id] || 0);
                  const lineRefund = (item.total / Math.max(1, item.quantity)) * quantity;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{getMedicineName(item.medicineId)}</TableCell>
                      <TableCell>{item.batchNumber}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{alreadyReturned}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          value={returnQuantities[item.id] ?? ''}
                          onChange={(event) => {
                            const value = Math.min(remaining, Math.max(0, Number(event.target.value || 0)));
                            setReturnQuantities({ ...returnQuantities, [item.id]: value });
                          }}
                          className="w-28"
                          disabled={remaining <= 0}
                        />
                      </TableCell>
                      <TableCell className="text-right">Rs. {lineRefund.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={restockByItem[item.id] ?? restockInventory}
                          onCheckedChange={(checked) => setRestockByItem({ ...restockByItem, [item.id]: Boolean(checked) })}
                          disabled={remaining <= 0 || quantity <= 0}
                          aria-label="Restock this line back into batch"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {/* M7 — Bulk action: one-click full refund of all remaining quantities. */}
            <div className="flex items-center justify-between -mt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  if (!selectedSale) return;
                  const next: Record<string, number> = {};
                  selectedSale.items.forEach((it) => {
                    const rem = getRemainingReturnQuantity(selectedSale, it.id);
                    if (rem > 0) next[it.id] = rem;
                  });
                  setReturnQuantities(next);
                }}
              >
                Return all remaining
              </Button>
              <p className="text-[11px] text-gray-500">
                Per-line restock overrides the global setting below.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Refund Method</Label>
                <Select value={refundMethod} onValueChange={(value) => setRefundMethod(value as PaymentMethod['method'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="jazzcash">JazzCash</SelectItem>
                    <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Return Reason</Label>
                <Input
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  placeholder="Damaged, wrong item, expired, customer return..."
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="restock-return"
                checked={restockInventory}
                onCheckedChange={(checked) => setRestockInventory(Boolean(checked))}
              />
              <Label htmlFor="restock-return">Return items back into batch stock</Label>
            </div>

            {selectedSale?.fbrStatus && ['pending', 'submitted'].includes(selectedSale.fbrStatus) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
                Original sale has FBR status `{selectedSale.fbrStatus}`. This return will be saved with FBR credit-note status `pending` until live FBR credit/debit note submission is wired.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleCreateReturn}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Create Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
