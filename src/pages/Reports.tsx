// Reports page — a categorised library of every report a Pakistani / Indian
// pharmacy commonly needs. Each card opens a preview dialog with summary
// tiles, the data table, optional notes, and PDF / CSV export.
//
// Design rationale (see src/lib/reports/engine.ts for the full registry):
//   - Single filter bar at the top (date range + a future branch picker).
//   - Categories on a tab strip across the top (not a sidebar — easier on
//     phone widths and matches Settings/Suppliers visual language).
//   - The most useful reports are always one click away.
//   - PDF output goes through the same letterhead pipeline as the rest of the
//     app so everything feels like one product.

import { useMemo, useState } from 'react';
import {
  useSettingsStore,
  useSalesStore,
  useInventoryStore,
  useSupplierStore,
  useCustomerStore,
  useExpenseStore,
  useAuthStore,
} from '@/store';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Calendar,
  Clock,
  Users,
  CreditCard,
  RotateCcw,
  Percent,
  TrendingUp,
  Pill,
  Layers,
  Boxes,
  Truck,
  Wallet,
  List,
  AlertTriangle,
  Snowflake,
  ShoppingCart,
  BarChart3,
  ClipboardList,
  Zap,
  Hourglass,
  Star,
  FileText,
  Calculator,
  Shield,
  Stethoscope,
  UserCheck,
  Banknote,
  Factory,
  FlaskConical,
  BookUser,
  BookOpen,
  Recycle,
  Download,
  Printer,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  REPORT_REGISTRY,
  CATEGORY_META,
  medicineMatchesFilters,
  type ReportCategory,
  type ReportDef,
  type ReportContext,
  type ReportResult,
  type ReportFilters,
} from '@/lib/reports/engine';
import { renderReportToPDF, renderReportToCSV } from '@/lib/reports/render';

// Map icon name strings (kept in the registry) to actual Lucide components.
// Lets us add a report without touching this file.
const ICON_MAP: Record<string, LucideIcon> = {
  Calendar, Clock, Users, CreditCard, RotateCcw, Percent, TrendingUp, Pill,
  Layers, Boxes, Truck, Wallet, List, AlertTriangle, Snowflake, ShoppingCart,
  BarChart3, ClipboardList, Zap, Hourglass, Star, FileText, Calculator, Shield,
  Stethoscope, UserCheck, Banknote, Factory, FlaskConical, BookUser, BookOpen, Recycle,
};

type DateRangeKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';

function resolveRange(key: DateRangeKey): { start: Date | null; end: Date } {
  const now = new Date();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  switch (key) {
    case 'today': {
      const s = new Date(now); s.setHours(0, 0, 0, 0);
      return { start: s, end };
    }
    case 'week': {
      const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0);
      return { start: s, end };
    }
    case 'month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    case 'quarter': {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), qm, 1), end };
    }
    case 'year': return { start: new Date(now.getFullYear(), 0, 1), end };
    case 'all':
    default: return { start: null, end };
  }
}

const RANGE_LABEL: Record<DateRangeKey, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'This month',
  quarter: 'This quarter',
  year: 'This year',
  all: 'All time',
};

const CATEGORIES: ReportCategory[] = [
  'sales', 'profit', 'inventory', 'purchases', 'suppliers',
  'customers', 'tax', 'regulatory', 'financial',
];

export function Reports() {
  const { settings } = useSettingsStore();
  const { sales, saleReturns } = useSalesStore();
  const { medicines, batches } = useInventoryStore();
  const { suppliers, purchases } = useSupplierStore();
  const { customers } = useCustomerStore();
  const { expenses } = useExpenseStore();
  const { currentUser, activeBranchId } = useAuthStore();
  const { t, isRTL } = useTranslation();

  // Reports are scoped to the branch selected in the header. Pre-filter the
  // branch-owned datasets (sales, stock, purchases) so every report reflects
  // only the active branch; tenant-wide data (suppliers/customers/expenses)
  // stays shared. Sale returns inherit their parent sale's branch.
  const branchSales = useMemo(
    () => (activeBranchId ? sales.filter((s) => s.branchId === activeBranchId) : sales),
    [sales, activeBranchId],
  );
  const branchBatches = useMemo(
    () => (activeBranchId ? batches.filter((b) => b.branchId === activeBranchId) : batches),
    [batches, activeBranchId],
  );
  const branchPurchases = useMemo(
    () => (activeBranchId ? purchases.filter((p) => p.branchId === activeBranchId) : purchases),
    [purchases, activeBranchId],
  );
  const branchSaleReturns = useMemo(() => {
    if (!activeBranchId) return saleReturns;
    const ids = new Set(branchSales.map((s) => s.id));
    return saleReturns.filter((r) => ids.has(r.saleId));
  }, [saleReturns, branchSales, activeBranchId]);

  const canSeeProfit = currentUser?.role === 'owner'
    || currentUser?.role === 'superadmin'
    || (currentUser?.role === 'manager' && settings.managerCanSeeProfit)
    || currentUser?.role === 'accountant';

  const [rangeKey, setRangeKey] = useState<DateRangeKey>('month');
  const [category, setCategory] = useState<ReportCategory>('sales');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewing, setPreviewing] = useState<ReportDef | null>(null);
  const [previewResult, setPreviewResult] = useState<ReportResult | null>(null);

  // Universal filters (drug type, salt, manufacturer, distributor, batch, …).
  const [fltCategory, setFltCategory] = useState('');
  const [fltGeneric, setFltGeneric] = useState('');
  const [fltManufacturer, setFltManufacturer] = useState('');
  const [fltSupplierId, setFltSupplierId] = useState('');
  const [fltBatch, setFltBatch] = useState('');
  const [fltCustomerId, setFltCustomerId] = useState('');
  const [fltSalesPersonId, setFltSalesPersonId] = useState('');

  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);

  const filters: ReportFilters = useMemo(() => ({
    category: fltCategory || undefined,
    genericName: fltGeneric.trim() || undefined,
    manufacturer: fltManufacturer || undefined,
    supplierId: fltSupplierId || undefined,
    batchNumber: fltBatch.trim() || undefined,
    customerId: fltCustomerId || undefined,
    salesPersonId: fltSalesPersonId || undefined,
  }), [fltCategory, fltGeneric, fltManufacturer, fltSupplierId, fltBatch, fltCustomerId, fltSalesPersonId]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Dropdown option lists derived from the data.
  const categoryOptions = useMemo(() => [...new Set(medicines.map((m) => m.category).filter(Boolean))].sort() as string[], [medicines]);
  const manufacturerOptions = useMemo(() => [...new Set(medicines.map((m) => m.manufacturer).filter(Boolean))].sort() as string[], [medicines]);
  const salesPersonOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of branchSales) { const id = s.salesPersonId ?? s.createdBy; if (id) m.set(id, s.salesPersonName ?? id); }
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [branchSales]);

  // medicineIdSet: medicines matching the category/salt/manufacturer filters
  // (batch-only filters leave this null and are matched per-line).
  const medicineIdSet = useMemo(() => {
    if (!filters.category && !filters.genericName && !filters.manufacturer) return null;
    return new Set(medicines.filter((m) => medicineMatchesFilters(m, filters)).map((m) => m.id));
  }, [filters, medicines]);

  // Central filtering: record-level dims (customer, salesperson) on sales;
  // supplier + medicine dims on batches; supplier on purchases. Medicine-dim
  // filters keep whole sales that contain ≥1 matching line (totals stay intact;
  // item-level reports trim lines via keepItem).
  const itemMatches = useMemo(() => (it: { medicineId?: string; batchNumber?: string }) => {
    if (filters.batchNumber && (it.batchNumber ?? '') !== filters.batchNumber) return false;
    if (medicineIdSet && (!it.medicineId || !medicineIdSet.has(it.medicineId))) return false;
    return true;
  }, [filters.batchNumber, medicineIdSet]);

  const fSales = useMemo(() => {
    let arr = branchSales;
    if (filters.customerId) arr = arr.filter((s) => s.customerId === filters.customerId);
    if (filters.salesPersonId) arr = arr.filter((s) => (s.salesPersonId ?? s.createdBy) === filters.salesPersonId);
    if (medicineIdSet || filters.batchNumber) arr = arr.filter((s) => s.items.some(itemMatches));
    return arr;
  }, [branchSales, filters.customerId, filters.salesPersonId, filters.batchNumber, medicineIdSet, itemMatches]);

  const fBatches = useMemo(() => branchBatches.filter((b) => {
    if (filters.supplierId && b.supplierId !== filters.supplierId) return false;
    if (filters.batchNumber && b.batchNumber !== filters.batchNumber) return false;
    if (medicineIdSet && !medicineIdSet.has(b.medicineId)) return false;
    return true;
  }), [branchBatches, filters.supplierId, filters.batchNumber, medicineIdSet]);

  const fPurchases = useMemo(
    () => (filters.supplierId ? branchPurchases.filter((p) => p.supplierId === filters.supplierId) : branchPurchases),
    [branchPurchases, filters.supplierId],
  );

  const fReturns = useMemo(() => {
    if (!filters.customerId && !filters.salesPersonId && !medicineIdSet && !filters.batchNumber) return branchSaleReturns;
    const ids = new Set(fSales.map((s) => s.id));
    return branchSaleReturns.filter((r) => ids.has(r.saleId));
  }, [branchSaleReturns, fSales, filters.customerId, filters.salesPersonId, filters.batchNumber, medicineIdSet]);

  const clearFilters = () => {
    setFltCategory(''); setFltGeneric(''); setFltManufacturer(''); setFltSupplierId('');
    setFltBatch(''); setFltCustomerId(''); setFltSalesPersonId('');
  };

  const ctx: ReportContext = useMemo(() => ({
    settings,
    sales: fSales,
    saleReturns: fReturns,
    medicines,
    batches: fBatches,
    suppliers,
    purchases: fPurchases,
    customers,
    expenses,
    range,
    canSeeProfit,
    branchId: activeBranchId,
    filters,
    medicineIdSet,
  }), [settings, fSales, fReturns, medicines, fBatches, suppliers, fPurchases, customers, expenses, range, canSeeProfit, activeBranchId, filters, medicineIdSet]);

  // Filtered registry — by category, search, profit-only gating.
  const visibleReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return REPORT_REGISTRY.filter((r) => {
      if (r.profitOnly && !canSeeProfit) return false;
      if (r.category !== category) return false;
      if (!q) return true;
      return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || (r.tags || []).some((tg) => tg.toLowerCase().includes(q));
    });
  }, [category, searchQuery, canSeeProfit]);

  const runReport = (def: ReportDef): ReportResult => def.run(ctx);

  const handlePreview = (def: ReportDef) => {
    try {
      const result = runReport(def);
      setPreviewResult(result);
      setPreviewing(def);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to generate report');
    }
  };

  const handlePDF = (def: ReportDef) => {
    try {
      const result = previewing?.id === def.id && previewResult ? previewResult : runReport(def);
      if (result.rows.length === 0) { toast.error('No data for this period'); return; }
      renderReportToPDF(result, settings, currentUser?.name);
      toast.success('PDF opened — use the print button to save');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to generate PDF');
    }
  };

  const handleCSV = (def: ReportDef) => {
    try {
      const result = previewing?.id === def.id && previewResult ? previewResult : runReport(def);
      if (result.rows.length === 0) { toast.error('No data for this period'); return; }
      renderReportToCSV(result);
      toast.success('CSV downloaded');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to generate CSV');
    }
  };

  // Count reports per category for the tab badges
  const categoryCounts = useMemo(() => {
    const counts: Record<ReportCategory, number> = { sales: 0, profit: 0, inventory: 0, purchases: 0, suppliers: 0, customers: 0, tax: 0, regulatory: 0, financial: 0, operations: 0 };
    for (const r of REPORT_REGISTRY) {
      if (r.profitOnly && !canSeeProfit) continue;
      counts[r.category] += 1;
    }
    return counts;
  }, [canSeeProfit]);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className={cn('text-2xl font-bold', settings.theme === 'dark' ? 'text-white' : 'text-gray-900')}>
            Reports Library
          </h1>
          <p className={cn('text-sm', settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
            {REPORT_REGISTRY.length} pharmacy-tailored reports — covering sales, profit, inventory, tax, regulatory and finance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as DateRangeKey)}>
            <SelectTrigger className="w-44">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="quarter">This quarter</SelectItem>
              <SelectItem value="year">This year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search reports…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-56"
            />
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <Tabs value={category} onValueChange={(v) => setCategory(v as ReportCategory)}>
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-9 h-auto bg-transparent gap-1 p-0">
          {CATEGORIES.map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white border data-[state=active]:border-emerald-500 rounded-md py-2 text-xs sm:text-sm gap-1.5 flex-col h-auto"
            >
              <span className="font-medium capitalize">{CATEGORY_META[cat].label}</span>
              <Badge variant="secondary" className="data-[state=active]:bg-white/20 text-[10px] px-1.5 py-0">
                {categoryCounts[cat]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Universal filters — drug type, salt, manufacturer, distributor, batch, customer, salesperson */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-gray-50/60 dark:bg-gray-800/40 p-2">
        <span className="text-xs font-medium text-gray-500 px-1">Filters</span>
        <Select value={fltCategory || 'all'} onValueChange={(v) => setFltCategory(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Drug type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All drug types</SelectItem>
            {categoryOptions.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fltManufacturer || 'all'} onValueChange={(v) => setFltManufacturer(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Manufacturer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All manufacturers</SelectItem>
            {manufacturerOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fltSupplierId || 'all'} onValueChange={(v) => setFltSupplierId(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Distributor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All distributors</SelectItem>
            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fltSalesPersonId || 'all'} onValueChange={(v) => setFltSalesPersonId(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Salesperson" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All salespersons</SelectItem>
            {salesPersonOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fltCustomerId || 'all'} onValueChange={(v) => setFltCustomerId(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Customer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input value={fltGeneric} onChange={(e) => setFltGeneric(e.target.value)} placeholder="Salt / generic" className="h-8 w-36 text-xs" />
        <Input value={fltBatch} onChange={(e) => setFltBatch(e.target.value)} placeholder="Batch #" className="h-8 w-28 text-xs" />
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-red-600" onClick={clearFilters}>
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Category description */}
      <p className="text-sm text-gray-500">
        <strong className="capitalize text-gray-700">{CATEGORY_META[category].label}.</strong>{' '}
        {CATEGORY_META[category].description}
        {' · '}<span className="text-emerald-600 font-medium">{RANGE_LABEL[rangeKey]}</span>
      </p>

      {/* Report grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleReports.length === 0 ? (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="p-10 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No reports match your search.</p>
              <p className="text-sm">Try a different category or clear the search box.</p>
            </CardContent>
          </Card>
        ) : visibleReports.map((def) => {
          const Icon = ICON_MAP[def.icon] || FileText;
          return (
            <Card key={def.id} className="group hover:shadow-md hover:border-emerald-300 transition-all">
              <CardContent className="p-4 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 leading-tight">{def.title}</h3>
                    {def.tags && def.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {def.tags.map((tg) => (
                          <Badge key={tg} variant="outline" className="text-[9px] py-0 px-1.5 h-4">
                            {tg}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3 flex-1">{def.description}</p>
                <div className="flex gap-1.5 mt-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 h-8"
                    onClick={() => handlePreview(def)}
                  >
                    <Search className="w-3.5 h-3.5" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 px-2.5"
                    onClick={() => handlePDF(def)}
                    title="Print / Save as PDF"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 px-2.5"
                    onClick={() => handleCSV(def)}
                    title="Download CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Preview dialog */}
      <Dialog open={previewing !== null} onOpenChange={(open) => { if (!open) { setPreviewing(null); setPreviewResult(null); } }}>
        <DialogContent className="sm:max-w-[1500px] w-[95vw] max-h-[90vh] overflow-y-auto">
          {previewing && previewResult && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = ICON_MAP[previewing.icon] || FileText;
                    return <Icon className="w-5 h-5 text-emerald-600" />;
                  })()}
                  {previewResult.title}
                </DialogTitle>
                <DialogDescription>{previewResult.subtitle || previewing.description}</DialogDescription>
              </DialogHeader>

              {/* Summary tiles */}
              {previewResult.summary.length > 0 && (
                <div className={cn('grid gap-2 mb-3', `grid-cols-2 md:grid-cols-${Math.min(previewResult.summary.length, 5)}`)}>
                  {previewResult.summary.map((tile, i) => (
                    <div key={i} className="border rounded-lg px-3 py-2 bg-gray-50">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{tile.label}</p>
                      <p className={cn('text-sm font-bold tabular-nums mt-0.5',
                        tile.tone === 'emerald' && 'text-emerald-700',
                        tile.tone === 'red' && 'text-red-600',
                        tile.tone === 'amber' && 'text-amber-700',
                        tile.tone === 'blue' && 'text-blue-700',
                      )}>
                        {tile.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Data table */}
              <div className="rounded-lg border overflow-hidden">
                <ScrollArea className="max-h-[55vh]">
                  {previewResult.rows.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p>No data for this period or filter.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 hover:bg-gray-50">
                          {previewResult.columns.map((col) => {
                            const numeric = col.type === 'number' || col.type === 'currency';
                            return (
                              <TableHead
                                key={col.key}
                                className={cn('text-xs uppercase tracking-wide whitespace-nowrap', numeric && 'text-right')}
                                style={col.width ? { width: col.width } : undefined}
                              >
                                {col.label}
                              </TableHead>
                            );
                          })}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewResult.rows.slice(0, 500).map((row, idx) => (
                          <TableRow key={idx}>
                            {previewResult.columns.map((col) => {
                              const numeric = col.type === 'number' || col.type === 'currency';
                              const raw = row[col.key];
                              if (col.type === 'badge') {
                                return (
                                  <TableCell key={col.key}>
                                    <Badge className={cn('text-[10px]', badgeColor(String(raw ?? '')))}>
                                      {String(raw ?? '—')}
                                    </Badge>
                                  </TableCell>
                                );
                              }
                              return (
                                <TableCell
                                  key={col.key}
                                  className={cn('text-xs whitespace-nowrap', numeric && 'text-right tabular-nums')}
                                >
                                  {formatCell(col.type, raw)}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
                {previewResult.rows.length > 500 && (
                  <div className="p-2 text-center text-xs text-gray-500 bg-gray-50 border-t">
                    Showing first 500 of {previewResult.rows.length.toLocaleString()} rows. PDF / CSV will contain everything.
                  </div>
                )}
              </div>

              {/* Notes */}
              {previewResult.notes && previewResult.notes.length > 0 && (
                <div className="mt-3 p-3 bg-blue-50 border-l-4 border-blue-300 text-xs text-blue-900 rounded-r-md">
                  <strong>Notes:</strong>
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {previewResult.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setPreviewing(null); setPreviewResult(null); }}>
                  Close
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => handleCSV(previewing)}>
                  <Download className="w-4 h-4" />
                  CSV
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => handlePDF(previewing)}>
                  <Printer className="w-4 h-4" />
                  Print / Save as PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers used inside the preview table ──────────────────────────────────

function formatCell(type: string | undefined, raw: unknown): string {
  if (raw == null || raw === '') return '—';
  if (type === 'currency') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    const abs = Math.abs(n);
    const s = `Rs. ${abs.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
    return n < 0 ? `(${s})` : s;
  }
  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    return Number.isInteger(n) ? n.toLocaleString('en-PK') : n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
  }
  if (type === 'date') {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString('en-PK');
  }
  return String(raw);
}

function badgeColor(value: string): string {
  const v = value.toLowerCase();
  if (v === 'a' || v === 'completed' || v === 'received' || v === 'ok') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (v === 'b' || v === 'ordered' || v === 'partial' || v === 'pending') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (v === 'c' || v === 'cancelled' || v === 'returned' || v === 'expired' || v === 'out of stock' || v === '0-30 d') return 'bg-red-100 text-red-800 border-red-200';
  if (v === 'below reorder' || v === '31-60 d') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}
