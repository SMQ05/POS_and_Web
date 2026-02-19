import { useState, useMemo } from 'react';
import { useSettingsStore, useSalesStore, useInventoryStore, useSupplierStore, useExpenseStore, useAuthStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { exportToCSV } from '@/lib/csv';
import { exportComprehensiveCSV, exportProfessionalPDF } from '@/lib/reportExport';
import type { ReportData } from '@/lib/reportExport';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ShoppingCart,
  Calendar,
  Download,
  Printer,
  PieChart,
  LineChart,
  BarChart,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Activity,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  Users,
  Receipt,
  Wallet,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LineChart as ReLineChart,
  Line,
  BarChart as ReBarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from '@/hooks/useTranslation';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// ─── Date-range helper ───────────────────────────────────────────────────────
function getDateCutoff(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case 'today': { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
    case 'week':  { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': { const qm = Math.floor(now.getMonth() / 3) * 3; return new Date(now.getFullYear(), qm, 1); }
    case 'year':  return new Date(now.getFullYear(), 0, 1);
    default: return null; // allTime
  }
}

export function Reports() {
  const { settings } = useSettingsStore();
  const { sales, computeKPIs } = useSalesStore();
  const { medicines, batches } = useInventoryStore();
  const { suppliers, purchases } = useSupplierStore();
  const { expenses } = useExpenseStore();
  const { currentUser } = useAuthStore();

  const canSeeProfit = currentUser?.role === 'owner' || (currentUser?.role === 'manager' && settings.managerCanSeeProfit) || currentUser?.role === 'accountant';
  const { t, isRTL } = useTranslation();

  const [dateRange, setDateRange] = useState('month');

  // ── Filter everything by the selected period ──
  const cutoff = getDateCutoff(dateRange);
  const inRange = (d: Date) => !cutoff || new Date(d) >= cutoff;

  const filteredSales = useMemo(() => sales.filter(s => s.status === 'completed' && inRange(s.saleDate)), [sales, dateRange]);
  const filteredPurchases = useMemo(() => purchases.filter(p => inRange(p.purchaseDate)), [purchases, dateRange]);
  const filteredExpenses = useMemo(() => expenses.filter(e => inRange(e.date)), [expenses, dateRange]);

  // Real aggregated stats (filtered)
  const totalSales = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalTransactions = filteredSales.length;
  const averageTicket = totalTransactions > 0 ? totalSales / totalTransactions : 0;
  const totalItemsSold = filteredSales.reduce((sum, s) => sum + s.items.reduce((is, i) => is + i.quantity, 0), 0);
  const totalProfit = filteredSales.flatMap(s => s.items).reduce((sum, i) => sum + (i.profit ?? 0), 0);
  const grossMarginPct = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
  const kpis = computeKPIs(batches);
  const totalExpensesAmt = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalProfit - totalExpensesAmt;

  // ── Purchases summary ──
  const totalPurchaseAmt = filteredPurchases.reduce((s, p) => s + p.totalAmount, 0);
  const totalPurchasePaid = filteredPurchases.reduce((s, p) => s + p.paidAmount, 0);
  const totalPurchaseBalance = filteredPurchases.reduce((s, p) => s + p.balanceAmount, 0);

  // ── Sales by Salesman ──
  const salesBySalesman = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; profit: number; items: number; transactions: number }> = {};
    filteredSales.forEach(s => {
      const key = s.createdBy || 'Unknown';
      if (!map[key]) map[key] = { name: key, revenue: 0, profit: 0, items: 0, transactions: 0 };
      map[key].transactions += 1;
      map[key].revenue += s.totalAmount;
      map[key].profit += s.items.reduce((sum, i) => sum + (i.profit ?? 0), 0);
      map[key].items += s.items.reduce((sum, i) => sum + i.quantity, 0);
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales]);

  // ── Expense by category (filtered) ──
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      map[e.category] = (map[e.category] ?? 0) + e.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const dateLabel = dateRange === 'today' ? t('common.today') : dateRange === 'week' ? t('common.thisWeek') : dateRange === 'month' ? t('common.thisMonth') : dateRange === 'quarter' ? t('common.thisQuarter') : dateRange === 'year' ? t('common.thisYear') : t('common.allTime');

  // ── Build report data payload ──
  const buildReportData = (): ReportData => ({
    settings,
    sales: filteredSales,
    medicines,
    batches,
    suppliers,
    expenses: filteredExpenses,
    kpis,
    canSeeProfit,
    generatedBy: currentUser?.name ?? 'Unknown',
    dateRange: dateLabel,
  });

  // ── Export handlers ──
  const handleExportCSV = () => {
    if (sales.length === 0) { toast.error(t('common.noData')); return; }
    exportComprehensiveCSV(buildReportData());
    toast.success(t('reports.csvDownloaded'));
  };

  const handleExportPDF = () => {
    if (sales.length === 0) { toast.error(t('common.noData')); return; }
    exportProfessionalPDF(buildReportData());
    toast.success(t('reports.pdfOpened'));
  };

  const handleQuickExportCSV = () => {
    const rows = filteredSales.map(s => ({
      invoice: s.invoiceNumber,
      date: new Date(s.saleDate).toLocaleDateString(),
      customer: s.customerName ?? 'Walk-in',
      soldBy: s.createdBy || 'Unknown',
      items: s.items.length,
      revenue: s.totalAmount,
      profit: s.items.reduce((acc, i) => acc + (i.profit ?? 0), 0),
      paymentMethod: s.paymentMethods.map(p => p.method).join(', '),
      status: s.status,
    }));
    if (rows.length === 0) { toast.error(t('common.noData')); return; }
    exportToCSV(rows as any, [
      { key: 'invoice', label: 'Invoice' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'soldBy', label: 'Sold By' },
      { key: 'items', label: 'Items' },
      { key: 'revenue', label: 'Revenue' },
      ...(canSeeProfit ? [{ key: 'profit' as const, label: 'Profit' }] : []),
      { key: 'paymentMethod', label: 'Payment' },
      { key: 'status', label: 'Status' },
    ], 'report_quick');
    toast.success(t('reports.quickExport', rows.length));
  };

  // Sales trend from filtered sales (daily for short ranges, weekly/monthly for longer)
  const salesTrendData = useMemo(() => {
    if (filteredSales.length === 0) return [];
    const isShort = dateRange === 'today' || dateRange === 'week';
    const buckets: Record<string, { sales: number; profit: number }> = {};
    filteredSales.forEach(s => {
      const d = new Date(s.saleDate);
      const key = isShort
        ? d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })
        : dateRange === 'month'
          ? `W${Math.ceil(d.getDate() / 7)}`
          : d.toLocaleDateString('en-PK', { month: 'short', year: '2-digit' });
      if (!buckets[key]) buckets[key] = { sales: 0, profit: 0 };
      buckets[key].sales += s.totalAmount;
      buckets[key].profit += s.items.reduce((sum, i) => sum + (i.profit ?? 0), 0);
    });
    return Object.entries(buckets).map(([name, v]) => ({ name, ...v }));
  }, [filteredSales, dateRange]);

  // Sales by salesman chart data
  const salesmanChartData = useMemo(() =>
    salesBySalesman.map(s => ({ name: s.name, revenue: s.revenue, profit: s.profit })),
    [salesBySalesman]
  );

  // Top products by revenue from filtered sales
  const topProductsData = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
    filteredSales.forEach(s => s.items.forEach(item => {
      const med = medicines.find(m => m.id === item.medicineId);
      const name = med?.name ?? item.medicineId;
      if (!map[item.medicineId]) map[item.medicineId] = { name, qty: 0, revenue: 0, profit: 0 };
      map[item.medicineId].qty += item.quantity;
      map[item.medicineId].revenue += item.total;
      map[item.medicineId].profit += item.profit ?? 0;
    }));
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [filteredSales, medicines]);

  // Batch profit analysis
  const batchProfitData = useMemo(() => {
    return batches
      .filter(b => b.isActive && b.quantity > 0)
      .map(b => {
        const med = medicines.find(m => m.id === b.medicineId);
        const profitPerUnit = b.salePrice - b.purchasePrice;
        const marginPct = b.salePrice > 0 ? (profitPerUnit / b.salePrice) * 100 : 0;
        const stockValue = b.quantity * b.purchasePrice;
        return {
          id: b.id,
          medicineName: med?.name ?? b.medicineId,
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          purchasePrice: b.purchasePrice,
          salePrice: b.salePrice,
          profitPerUnit,
          marginPct,
          stockValue,
          potentialProfit: profitPerUnit * b.quantity,
        };
      })
      .sort((a, b) => b.potentialProfit - a.potentialProfit);
  }, [batches, medicines]);

  // Category data from filtered sales
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach(s => s.items.forEach(item => {
      const med = medicines.find(m => m.id === item.medicineId);
      const cat = med?.category ?? 'Other';
      map[cat] = (map[cat] ?? 0) + item.total;
    }));
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredSales, medicines]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn('text-2xl font-bold', settings.theme === 'dark' ? 'text-white' : 'text-gray-900')}>
            {t('reports.title')}
          </h1>
          <p className={cn('text-sm', settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
            {t('reports.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t('common.today')}</SelectItem>
              <SelectItem value="week">{t('common.thisWeek')}</SelectItem>
              <SelectItem value="month">{t('common.thisMonth')}</SelectItem>
              <SelectItem value="quarter">{t('common.thisQuarter')}</SelectItem>
              <SelectItem value="year">{t('common.thisYear')}</SelectItem>
              <SelectItem value="allTime">{t('common.allTime')}</SelectItem>
              <SelectItem value="all">{t('common.allTime')}</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                {t('common.export')}
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportPDF} className="gap-2">
                <FileText className="w-4 h-4 text-red-500" />
                <div>
                  <p className="font-medium">{t('reports.professionalPdf')}</p>
                  <p className="text-xs text-gray-500">{t('reports.pdfDesc')}</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="font-medium">{t('reports.comprehensiveCsv')}</p>
                  <p className="text-xs text-gray-500">{t('reports.csvDesc')}</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleQuickExportCSV} className="gap-2">
                <Download className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="font-medium">{t('reports.quickCsv')}</p>
                  <p className="text-xs text-gray-500">{t('reports.quickCsvDesc')}</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="gap-2" onClick={handleExportPDF}>
            <Printer className="w-4 h-4" />
            {t('common.print')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('reports.totalRevenue')}</p>
                <p className="text-2xl font-bold text-emerald-500">Rs. {totalSales.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
                <div className="flex items-center gap-1 text-sm text-emerald-500">
                  <ArrowUpRight className="w-4 h-4" />
                  {totalTransactions} {t('reports.transactions')}
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        {canSeeProfit && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('reports.grossProfit')}</p>
                <p className="text-2xl font-bold text-blue-500">Rs. {totalProfit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
                <div className="flex items-center gap-1 text-sm text-blue-500">
                  <TrendingUp className="w-4 h-4" />
                  {grossMarginPct.toFixed(1)}% {t('reports.margin')}
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        )}
        {canSeeProfit && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('reports.netProfit')}</p>
                <p className={cn('text-2xl font-bold', netProfit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                  Rs. {netProfit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                </p>
                <div className="text-xs text-gray-400">{t('reports.afterExpenses', totalExpensesAmt.toLocaleString('en-PK', { maximumFractionDigits: 0 }))}</div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Activity className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('reports.avgTicket')}</p>
                <p className="text-2xl font-bold text-purple-500">Rs. {averageTicket.toFixed(0)}</p>
                <div className="text-xs text-gray-400">{totalItemsSold} {t('reports.unitsSold')}</div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap w-full">
          <TabsTrigger value="overview">{t('reports.overview')}</TabsTrigger>
          <TabsTrigger value="salesman" className="gap-1"><Users className="w-3.5 h-3.5" />{t('reports.salesBySalesman')}</TabsTrigger>
          <TabsTrigger value="sales-detail" className="gap-1"><Receipt className="w-3.5 h-3.5" />{t('reports.salesDetail')}</TabsTrigger>
          <TabsTrigger value="purchases" className="gap-1"><Package className="w-3.5 h-3.5" />{t('reports.purchasesReport')}</TabsTrigger>
          <TabsTrigger value="expenses-tab" className="gap-1"><Wallet className="w-3.5 h-3.5" />{t('reports.expensesReport')}</TabsTrigger>
          <TabsTrigger value="products">{t('reports.products')}</TabsTrigger>
          {canSeeProfit && <TabsTrigger value="batch-profit">{t('reports.batchProfit')}</TabsTrigger>}
          <TabsTrigger value="kpi">{t('reports.kpiDashboard')}</TabsTrigger>
          <TabsTrigger value="financial">{t('reports.financial')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LineChart className="w-5 h-5 text-emerald-500" />
                  {t('reports.salesProfitTrend')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReLineChart data={salesTrendData.length ? salesTrendData : [{ name: 'No Data', sales: 0, profit: 0 }]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => `Rs. ${v.toLocaleString()}`} />
                      <Legend />
                      <Line type="monotone" dataKey="sales" stroke="#10b981" name={t('reports.totalRevenue')} strokeWidth={2} />
                      {canSeeProfit && <Line type="monotone" dataKey="profit" stroke="#3b82f6" name={t('reports.totalGrossProfit')} strokeWidth={2} />}
                    </ReLineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-blue-500" />
                  {t('reports.revenueByCategory')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie data={categoryData.length ? categoryData : [{ name: 'No Data', value: 1 }]}
                        cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value">
                        {categoryData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `Rs. ${v.toLocaleString()}`} />
                      <Legend />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart className="w-5 h-5 text-amber-500" />
                {t('reports.salesBySalesman')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={salesmanChartData.length ? salesmanChartData : [{ name: t('common.noData'), revenue: 0 }]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => `Rs. ${v.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" name={t('reports.totalRevenue')} />
                    {canSeeProfit && <Bar dataKey="profit" fill="#3b82f6" name={t('reports.grossProfit')} />}
                  </ReBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ Sales By Salesman Tab ══ */}
        <TabsContent value="salesman" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.totalSalespeople')}</p>
                <p className="text-2xl font-bold text-blue-500">{salesBySalesman.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.topSeller')}</p>
                <p className="text-2xl font-bold text-emerald-500">{salesBySalesman[0]?.name ?? '—'}</p>
                <p className="text-xs text-gray-400">Rs. {(salesBySalesman[0]?.revenue ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.periodLabel')}</p>
                <p className="text-2xl font-bold text-purple-500">{dateLabel}</p>
              </CardContent>
            </Card>
          </div>
          <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2', settings.theme === 'dark' ? 'text-white' : '')}>
                <Users className="w-5 h-5 text-blue-500" />
                {t('reports.salesBySalesman')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{t('reports.salesperson')}</TableHead>
                      <TableHead>{t('reports.transactions')}</TableHead>
                      <TableHead>{t('reports.itemsSold')}</TableHead>
                      <TableHead>{t('reports.totalRevenue')}</TableHead>
                      {canSeeProfit && <TableHead>{t('reports.grossProfit')}</TableHead>}
                      {canSeeProfit && <TableHead>{t('reports.margin')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesBySalesman.map((s, idx) => (
                      <TableRow key={s.name}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.transactions}</TableCell>
                        <TableCell>{s.items}</TableCell>
                        <TableCell className="text-emerald-600 font-medium">Rs. {s.revenue.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                        {canSeeProfit && <TableCell className="text-blue-600 font-medium">Rs. {s.profit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>}
                        {canSeeProfit && <TableCell>{s.revenue > 0 ? ((s.profit / s.revenue) * 100).toFixed(1) : 0}%</TableCell>}
                      </TableRow>
                    ))}
                    {salesBySalesman.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-500">{t('common.noData')}</TableCell></TableRow>
                    )}
                    {salesBySalesman.length > 0 && (
                      <TableRow className="font-bold border-t-2">
                        <TableCell />
                        <TableCell>{t('common.total')}</TableCell>
                        <TableCell>{salesBySalesman.reduce((s, r) => s + r.transactions, 0)}</TableCell>
                        <TableCell>{salesBySalesman.reduce((s, r) => s + r.items, 0)}</TableCell>
                        <TableCell className="text-emerald-600">Rs. {totalSales.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                        {canSeeProfit && <TableCell className="text-blue-600">Rs. {totalProfit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>}
                        {canSeeProfit && <TableCell>{grossMarginPct.toFixed(1)}%</TableCell>}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ Sales Detail Tab ══ */}
        <TabsContent value="sales-detail" className="space-y-4">
          <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2', settings.theme === 'dark' ? 'text-white' : '')}>
                <Receipt className="w-5 h-5 text-emerald-500" />
                {t('reports.salesDetail')} ({filteredSales.length})
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
                      <TableHead>{t('reports.soldBy')}</TableHead>
                      <TableHead>{t('common.items')}</TableHead>
                      <TableHead>{t('common.total')}</TableHead>
                      {canSeeProfit && <TableHead>{t('reports.profit')}</TableHead>}
                      <TableHead>{t('sales.paymentMethod')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                        <TableCell>{new Date(s.saleDate).toLocaleDateString()}</TableCell>
                        <TableCell>{s.customerName || 'Walk-in'}</TableCell>
                        <TableCell><Badge variant="outline">{s.createdBy || '—'}</Badge></TableCell>
                        <TableCell>{s.items.length}</TableCell>
                        <TableCell className="font-medium">Rs. {s.totalAmount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                        {canSeeProfit && <TableCell className="text-blue-600">Rs. {s.items.reduce((sum, i) => sum + (i.profit ?? 0), 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>}
                        <TableCell><Badge variant="secondary">{s.paymentMethods.map(p => p.method).join(', ')}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {filteredSales.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">{t('common.noData')}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ Purchases Report Tab ══ */}
        <TabsContent value="purchases" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.totalPurchases')}</p>
                <p className="text-2xl font-bold text-blue-500">{filteredPurchases.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.purchaseAmount')}</p>
                <p className="text-2xl font-bold text-red-500">Rs. {totalPurchaseAmt.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.paidAmount')}</p>
                <p className="text-2xl font-bold text-emerald-500">Rs. {totalPurchasePaid.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.balanceDue')}</p>
                <p className="text-2xl font-bold text-amber-500">Rs. {totalPurchaseBalance.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>
          </div>
          <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2', settings.theme === 'dark' ? 'text-white' : '')}>
                <Package className="w-5 h-5 text-blue-500" />
                {t('reports.purchasesReport')} ({filteredPurchases.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('purchaseOrders.poNumber')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('purchaseOrders.supplier')}</TableHead>
                      <TableHead>{t('reports.createdBy')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead>{t('common.total')}</TableHead>
                      <TableHead>{t('reports.paidAmount')}</TableHead>
                      <TableHead>{t('reports.balanceDue')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.map(p => {
                      const sup = suppliers.find(s => s.id === p.supplierId);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.purchaseNumber}</TableCell>
                          <TableCell>{new Date(p.purchaseDate).toLocaleDateString()}</TableCell>
                          <TableCell>{sup?.name ?? '—'}</TableCell>
                          <TableCell><Badge variant="outline">{p.createdBy || '—'}</Badge></TableCell>
                          <TableCell><Badge variant={p.status === 'received' ? 'default' : p.status === 'cancelled' ? 'destructive' : 'secondary'}>{p.status}</Badge></TableCell>
                          <TableCell className="font-medium">Rs. {p.totalAmount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell className="text-emerald-600">Rs. {p.paidAmount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell className={p.balanceAmount > 0 ? 'text-red-500 font-medium' : ''}>Rs. {p.balanceAmount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredPurchases.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">{t('common.noData')}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ Expenses Report Tab ══ */}
        <TabsContent value="expenses-tab" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.totalExpenses')}</p>
                <p className="text-2xl font-bold text-red-500">Rs. {totalExpensesAmt.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.expenseEntries')}</p>
                <p className="text-2xl font-bold text-amber-500">{filteredExpenses.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.periodLabel')}</p>
                <p className="text-2xl font-bold text-purple-500">{dateLabel}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><PieChart className="w-5 h-5 text-red-500" />{t('reports.expenseBreakdown')}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie data={expenseByCategory.length ? expenseByCategory : [{ name: 'No Data', value: 1 }]}
                        cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value">
                        {expenseByCategory.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `Rs. ${v.toLocaleString()}`} />
                      <Legend />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t('reports.expenseByCategory')}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {expenseByCategory.map(cat => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-sm capitalize">{t(`expenses.categories.${cat.name}`)}</span>
                      </div>
                      <span className="font-medium">Rs. {cat.value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</span>
                    </div>
                  ))}
                  {expenseByCategory.length === 0 && <p className="text-gray-500 text-center py-4">{t('common.noData')}</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2', settings.theme === 'dark' ? 'text-white' : '')}>
                <Wallet className="w-5 h-5 text-red-500" />
                {t('reports.expensesList')} ({filteredExpenses.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('expenses.categoryLabel')}</TableHead>
                      <TableHead>{t('common.description')}</TableHead>
                      <TableHead>{t('reports.createdBy')}</TableHead>
                      <TableHead>{t('common.amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map(e => (
                      <TableRow key={e.id}>
                        <TableCell>{new Date(e.date).toLocaleDateString()}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{t(`expenses.categories.${e.category}`)}</Badge></TableCell>
                        <TableCell>{e.description}</TableCell>
                        <TableCell><Badge variant="outline">{e.createdBy || '—'}</Badge></TableCell>
                        <TableCell className="text-red-600 font-medium">Rs. {e.amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</TableCell>
                      </TableRow>
                    ))}
                    {filteredExpenses.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-500">{t('common.noData')}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('reports.topProducts')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProductsData.map((product, index) => (
                  <div key={product.name} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium text-emerald-600">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.qty} {t('reports.unitsSold')}{canSeeProfit ? ` · ${t('reports.totalGrossProfit')}: Rs. ${product.profit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}` : ''}</p>
                      <Progress value={Math.min(100, (product.revenue / (topProductsData[0]?.revenue || 1)) * 100)} className="h-1.5 mt-1" />
                    </div>
                    <div className="text-right">
                      <p className="font-medium">Rs. {product.revenue.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs text-gray-400">
                        {canSeeProfit && product.revenue > 0 ? `${((product.profit / product.revenue) * 100).toFixed(1)}% ${t('reports.margin')}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {topProductsData.length === 0 && (
                  <p className="text-center text-gray-500 py-8">{t('common.noData')}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Batch Profit Report Tab */}
        {canSeeProfit && (
        <TabsContent value="batch-profit" className="space-y-4">
          <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2', settings.theme === 'dark' ? 'text-white' : '')}>
                <Zap className="w-5 h-5 text-emerald-500" />
                {t('reports.batchProfitAnalysis')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('sales.medicine')}</TableHead>
                      <TableHead>{t('sales.batch')}</TableHead>
                      <TableHead>{t('sales.qty')}</TableHead>
                      <TableHead>{t('reports.costLabel')}</TableHead>
                      <TableHead>{t('reports.salePriceLabel')}</TableHead>
                      <TableHead>{t('reports.profitPerUnit')}</TableHead>
                      <TableHead>{t('reports.margin')}</TableHead>
                      <TableHead>{t('reports.potentialProfit')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchProfitData.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className={cn('font-medium', settings.theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                          {b.medicineName}
                        </TableCell>
                        <TableCell>{b.batchNumber}</TableCell>
                        <TableCell>{b.quantity}</TableCell>
                        <TableCell>Rs. {b.purchasePrice.toFixed(2)}</TableCell>
                        <TableCell>Rs. {b.salePrice.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className={b.profitPerUnit >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600'}>
                            Rs. {b.profitPerUnit.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.max(0, b.marginPct)} className="h-1.5 w-12" />
                            <span className={cn(
                              'text-xs font-medium',
                              b.marginPct >= 20 ? 'text-emerald-600' : b.marginPct >= 10 ? 'text-amber-600' : 'text-red-600'
                            )}>
                              {b.marginPct.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-emerald-600">
                            Rs. {b.potentialProfit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {batchProfitData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">{t('common.noData')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* KPI Dashboard Tab */}
        <TabsContent value="kpi" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ...(canSeeProfit ? [{ label: t('reports.grossProfitMargin'), value: `${kpis.grossProfitMarginPercent.toFixed(1)}%`, target: '25%', pct: Math.min(100, kpis.grossProfitMarginPercent * 4), color: kpis.grossProfitMarginPercent >= 20 ? 'emerald' : kpis.grossProfitMarginPercent >= 10 ? 'amber' : 'red' }] : []),
              { label: t('reports.inventoryTurnover'), value: `${kpis.inventoryTurnoverRate.toFixed(2)}x`, target: '2x', pct: Math.min(100, kpis.inventoryTurnoverRate * 50), color: 'blue' },
              { label: t('reports.avgTicket'), value: `Rs. ${kpis.avgTransactionValue.toFixed(0)}`, target: 'Rs. 1,500', pct: Math.min(100, (kpis.avgTransactionValue / 1500) * 100), color: 'purple' },
              { label: t('reports.expiryLossReduction'), value: `${kpis.expiryLossReductionPercent.toFixed(1)}%`, target: '<5%', pct: Math.max(0, 100 - kpis.expiryLossReductionPercent * 10), color: kpis.expiryLossReductionPercent < 5 ? 'emerald' : 'red' },
              { label: t('reports.totalRevenue'), value: `Rs. ${totalSales.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`, target: 'Growing', pct: 75, color: 'emerald' },
              ...(canSeeProfit ? [{ label: t('reports.grossProfit'), value: `Rs. ${totalProfit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`, target: 'Growing', pct: 65, color: 'blue' }] : []),
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500">{kpi.label}</p>
                    <Badge variant="outline" className="text-xs">{t('reports.target')}: {kpi.target}</Badge>
                  </div>
                  <p className={cn('text-2xl font-bold',
                    kpi.color === 'emerald' ? 'text-emerald-600' :
                    kpi.color === 'blue' ? 'text-blue-600' :
                    kpi.color === 'amber' ? 'text-amber-600' :
                    kpi.color === 'red' ? 'text-red-600' : 'text-purple-600'
                  )}>
                    {kpi.value}
                  </p>
                  <Progress value={kpi.pct} className="h-2" />
                  <p className="text-xs text-gray-400">{kpi.pct.toFixed(0)}% {t('reports.ofTarget')}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>{t('reports.incomeVsExpenses')}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReBarChart data={[{ name: 'Current Period', revenue: totalSales, profit: totalProfit, expenses: totalExpensesAmt, net: netProfit }]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => `Rs. ${v.toLocaleString()}`} />
                      <Legend />
                      <Bar dataKey="revenue" fill="#10b981" name={t('reports.totalRevenue')} />
                      {canSeeProfit && <Bar dataKey="profit" fill="#3b82f6" name={t('reports.grossProfit')} />}
                      <Bar dataKey="expenses" fill="#ef4444" name={t('reports.totalExpenses')} />
                    </ReBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t('reports.expenseBreakdown')}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {expenseByCategory.map(cat => (
                      <div key={cat.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-sm capitalize">{t(`expenses.categories.${cat.name}`)}</span>
                        </div>
                        <span className="font-medium">Rs. {cat.value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</span>
                      </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>{t('reports.totalExpenses')}</span>
                    <span className="text-red-600">Rs. {totalExpensesAmt.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</span>
                  </div>
                  {canSeeProfit && (
                  <div className="flex justify-between font-bold text-lg">
                    <span>{t('reports.netProfit')}</span>
                    <span className={netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      Rs. {netProfit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {canSeeProfit && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.grossProfit')}</p>
                <p className="text-2xl font-bold text-emerald-500">Rs. {totalProfit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
                <p className="text-sm text-emerald-500">{grossMarginPct.toFixed(1)}% {t('reports.margin')}</p>
              </CardContent>
            </Card>
            )}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.taxPayable')}</p>
                <p className="text-2xl font-bold text-amber-500">Rs. {(totalSales * 0.18).toLocaleString('en-PK', { maximumFractionDigits: 0 })}</p>
                <p className="text-sm text-gray-500">{t('reports.gstEstimate')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">{t('reports.supplierPayables')}</p>
                <p className="text-2xl font-bold text-red-500">
                  Rs. {suppliers.reduce((sum, s) => sum + s.currentBalance, 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}