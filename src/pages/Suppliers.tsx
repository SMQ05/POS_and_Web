import { useState } from 'react';
import { useSettingsStore, useSupplierStore, useInventoryStore } from '@/store';
import { apiRequest, bulkImportSuppliers, getBootstrapData, type BulkSupplierRow } from '@/lib/backend';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { exportToCSV, importFromCSV } from '@/lib/csv';
import { ImportHelpPopover } from '@/components/ImportHelpPopover';
import { DistributorOrderDialog } from '@/components/DistributorOrderDialog';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Plus,
  Truck,
  Edit,
  Trash2,
  ShoppingCart,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  History,
  Package,
  Check,
  Save,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  Upload,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Supplier, Purchase, PurchasePayment } from '@/types';
import { processUploadedFile } from '@/lib/image';
import { openDataUrlInNewTab } from '@/lib/openImage';
import { printSupplierLedger } from '@/lib/supplierLedger';
import { Printer, Paperclip, FileSpreadsheet } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Suppliers() {
  const { settings } = useSettingsStore();
  const { suppliers, purchases, addSupplier, updateSupplier, deleteSupplier, updatePurchase, getSupplierBalance, medicineSuppliers, addMedicineSupplier, removeMedicineSupplier } = useSupplierStore();
  const { medicines } = useInventoryStore();
  // Map-medicines dialog: which supplier we're mapping, and the product filter.
  const [mapSupplier, setMapSupplier] = useState<Supplier | null>(null);
  const [medFilter, setMedFilter] = useState('');
  const { t, isRTL } = useTranslation();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [orderSupplierId, setOrderSupplierId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  // Ledger statement date range (defaults to "this month" but the user can
  // pick any range or clear the start to get an opening-balance summary).
  const [ledgerStart, setLedgerStart] = useState<string>(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [ledgerEnd, setLedgerEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PurchasePayment['method']>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentProofImage, setPaymentProofImage] = useState<string>('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    ntn: '',
    gstNumber: '',
    creditLimit: 100000,
    paymentTerms: 30,
  });

  const [purchaseItems, setPurchaseItems] = useState<any[]>([]);

  // ── CSV column definition ──
  const csvColumns = [
    { key: 'name' as const, label: 'Company Name' },
    { key: 'contactPerson' as const, label: 'Contact Person' },
    { key: 'phone' as const, label: 'Phone' },
    { key: 'email' as const, label: 'Email' },
    { key: 'address' as const, label: 'Address' },
    { key: 'city' as const, label: 'City' },
    { key: 'ntn' as const, label: 'NTN' },
    { key: 'gstNumber' as const, label: 'GST Number' },
  ];

  const handleExportSuppliers = () => {
    const data = suppliers.filter(s => s.isActive);
    if (data.length === 0) { toast.error('No suppliers to export'); return; }
    exportToCSV(data, [
      ...csvColumns,
      { key: 'creditLimit' as const, label: 'Credit Limit' },
      { key: 'currentBalance' as const, label: 'Current Balance' },
    ], 'suppliers');
    toast.success(`Exported ${data.length} suppliers`);
  };

  const handleImportSuppliers = () => {
    importFromCSV<Record<string, string>>(
      async (rows) => {
        const payload: BulkSupplierRow[] = rows
          .map((row) => ({
            name: (row['Company Name'] || row['name'] || '').trim(),
            contactPerson: (row['Contact Person'] || row['contactPerson'] || '').trim(),
            phone: (row['Phone'] || row['phone'] || '').trim(),
            email: (row['Email'] || row['email'] || '').trim() || undefined,
            address: (row['Address'] || row['address'] || '').trim(),
            city: (row['City'] || row['city'] || '').trim(),
            ntn: (row['NTN'] || row['ntn'] || '').trim() || undefined,
            gstNumber: (row['GST Number'] || row['gstNumber'] || '').trim() || undefined,
            creditLimit: parseFloat(row['Credit Limit'] || row['creditLimit'] || '0') || 0,
            paymentTerms: parseInt(row['Payment Terms'] || row['paymentTerms'] || '0', 10) || 0,
          }))
          .filter((row) => row.name.length > 0);

        if (payload.length === 0) {
          toast.error('No valid rows. The "Company Name" column is required.');
          return;
        }
        try {
          const result = await bulkImportSuppliers(payload);
          // Refetch bootstrap so the table shows what the server actually saved,
          // including server-generated IDs.
          try {
            const bootstrap = await getBootstrapData();
            useSupplierStore.setState({ suppliers: bootstrap.suppliers });
          } catch {
            // If refetch fails the import still succeeded — surface counts only.
          }
          if (result.failed === 0) {
            toast.success(`Imported ${result.created} supplier${result.created === 1 ? '' : 's'}`);
          } else {
            const firstError = result.results.find((r) => !r.ok)?.error ?? 'See console';
            toast.warning(`Imported ${result.created}, ${result.failed} failed — ${firstError}`);
            console.warn('[suppliers/bulk]', result.results.filter((r) => !r.ok));
          }
        } catch (err) {
          // Fallback to legacy per-row store path when bulk endpoint isn't
          // reachable (e.g. running fully offline against mock data).
          let imported = 0;
          payload.forEach((row) => {
            const sup: Supplier = {
              id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
              name: row.name,
              contactPerson: row.contactPerson ?? '',
              phone: row.phone ?? '',
              email: row.email,
              address: row.address ?? '',
              city: row.city ?? '',
              ntn: row.ntn,
              gstNumber: row.gstNumber,
              creditLimit: row.creditLimit ?? 0,
              currentBalance: 0,
              paymentTerms: row.paymentTerms ?? 0,
              isActive: true,
              createdAt: new Date(),
            };
            addSupplier(sup);
            imported++;
          });
          toast.success(`Imported ${imported} suppliers (offline)`);
          console.warn('[suppliers/bulk fallback]', err);
        }
      },
      (err) => toast.error(err),
    );
  };

  // Filter suppliers
  const filteredSuppliers = suppliers.filter((supplier) => {
    const matchesSearch = searchQuery === '' || 
      supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.phone.includes(searchQuery);
    
    return matchesSearch && supplier.isActive;
  });

  // Handle add supplier
  const handleAdd = () => {
    const newSupplier: Supplier = {
      id: Date.now().toString(),
      name: formData.name || '',
      contactPerson: formData.contactPerson || '',
      phone: formData.phone || '',
      email: formData.email,
      address: formData.address || '',
      city: formData.city || '',
      ntn: formData.ntn,
      gstNumber: formData.gstNumber,
      creditLimit: formData.creditLimit || 100000,
      currentBalance: 0,
      paymentTerms: formData.paymentTerms || 30,
      isActive: true,
      createdAt: new Date(),
      visitDays: formData.visitDays,
    };

    addSupplier(newSupplier);
    setShowAddDialog(false);
    resetForm();
  };

  // Handle edit supplier
  const handleEdit = () => {
    if (selectedSupplier) {
      updateSupplier(selectedSupplier.id, formData);
      setShowEditDialog(false);
      resetForm();
    }
  };

  // Handle delete supplier
  const handleDelete = () => {
    if (selectedSupplier) {
      deleteSupplier(selectedSupplier.id);
      setShowDeleteDialog(false);
      setSelectedSupplier(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      ntn: '',
      gstNumber: '',
      creditLimit: 100000,
      paymentTerms: 30,
    });
  };

  // Open edit dialog
  const openEditDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData(supplier);
    setShowEditDialog(true);
  };

  // Open delete dialog
  const openDeleteDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setShowDeleteDialog(true);
  };

  // Open details dialog
  const openDetailsDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setShowDetailsDialog(true);
  };

  const openPaymentDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setPaymentAmount(supplier.currentBalance ? supplier.currentBalance.toFixed(2) : '');
    setPaymentMethod('cash');
    setPaymentReference('');
    setPaymentNote('');
    setPaymentProofImage('');
    setShowPaymentDialog(true);
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const r = await processUploadedFile(file);
      setPaymentProofImage(r.dataUrl);
      if (r.compressed && r.beforeBytes > r.afterBytes) {
        const ratio = Math.round((1 - r.afterBytes / r.beforeBytes) * 100);
        if (ratio > 0) toast.success(`Proof compressed (${ratio}% smaller)`);
      } else {
        toast.success('Proof attached');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to process file');
    }
    (e.target as HTMLInputElement).value = '';
  };

  const handleRecordPayment = async () => {
    if (!selectedSupplier) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }

    setPaymentLoading(true);
    try {
      // Apply this payment to the supplier's open POs, oldest-first FIFO, so
      // each PO's balance + payment history stays accurate. The Suppliers page
      // payment view is just an aggregated convenience — the real ledger lives
      // on the Purchase records.
      let remaining = amount;
      const supplierPOs = purchases
        .filter((p) => p.supplierId === selectedSupplier.id && p.balanceAmount > 0 && p.status !== 'cancelled')
        .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

      for (const po of supplierPOs) {
        if (remaining <= 0) break;
        const apply = Math.min(po.balanceAmount, remaining);
        const payment: PurchasePayment = {
          id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          amount: apply,
          method: paymentMethod,
          reference: paymentReference.trim() || undefined,
          notes: paymentNote.trim() || undefined,
          proofImageUrl: paymentProofImage || undefined,
          paidAt: new Date(),
          recordedBy: '1',
        };
        const newPaid = (po.paidAmount || 0) + apply;
        const newBalance = Math.max(0, po.totalAmount - newPaid);
        updatePurchase(po.id, {
          payments: [...(po.payments || []), payment],
          paidAmount: newPaid,
          balanceAmount: newBalance,
        });
        remaining -= apply;
      }

      // Keep the legacy supplier-summary call for back-end ledger compatibility,
      // but don't fail the whole flow if it errors.
      try {
        await apiRequest(`/suppliers/${selectedSupplier.id}/payment`, {
          method: 'POST',
          body: JSON.stringify({ amount, note: paymentNote.trim() || undefined }),
        });
      } catch { /* non-fatal */ }

      updateSupplier(selectedSupplier.id, {
        currentBalance: Math.max(0, selectedSupplier.currentBalance - amount),
      });

      const note = remaining > 0
        ? `Rs. ${(amount - remaining).toLocaleString()} applied; Rs. ${remaining.toLocaleString()} advance (no open PO to apply against)`
        : `Payment of Rs. ${amount.toLocaleString()} applied across ${supplierPOs.length} order(s)`;
      toast.success(note);

      setShowPaymentDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  // Get supplier purchases (sorted newest first)
  const supplierPurchases = selectedSupplier
    ? purchases
        .filter(p => p.supplierId === selectedSupplier.id)
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
    : [];

  // Aged payables for selected supplier
  const agedPayables = (() => {
    if (!selectedSupplier) return { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    const now = Date.now();
    let current = 0, d30 = 0, d60 = 0, d90 = 0, over90 = 0;
    for (const po of supplierPurchases) {
      if (po.status === 'cancelled' || po.balanceAmount <= 0) continue;
      const dueDate = po.dueDate ? new Date(po.dueDate) : new Date(po.purchaseDate);
      const daysPast = Math.floor((now - dueDate.getTime()) / 86_400_000);
      if (daysPast <= 0) current += po.balanceAmount;
      else if (daysPast <= 30) d30 += po.balanceAmount;
      else if (daysPast <= 60) d60 += po.balanceAmount;
      else if (daysPast <= 90) d90 += po.balanceAmount;
      else over90 += po.balanceAmount;
    }
    return { current, d30, d60, d90, over90 };
  })();

  // Supplier Form Content (plain JSX, not a component — avoids remount/focus-loss)
  const supplierFormContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('suppliers.companyName')}</Label>
          <Input
            placeholder={t('suppliers.companyPlaceholder')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('suppliers.contactPerson')}</Label>
          <Input
            placeholder={t('suppliers.contactPlaceholder')}
            value={formData.contactPerson}
            onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('common.phone')} *</Label>
          <Input
            placeholder={t('suppliers.phonePlaceholder')}
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('common.email')}</Label>
          <Input
            type="email"
            placeholder={t('suppliers.emailPlaceholder')}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('common.address')} *</Label>
        <Input
          placeholder={t('suppliers.addressPlaceholder')}
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('suppliers.city')} *</Label>
        <Input
          placeholder={t('suppliers.cityPlaceholder')}
          value={formData.city}
          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('suppliers.ntn')}</Label>
          <Input
            placeholder={t('suppliers.ntnPlaceholder')}
            value={formData.ntn}
            onChange={(e) => setFormData({ ...formData, ntn: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('suppliers.gst')}</Label>
          <Input
            placeholder={t('suppliers.gstPlaceholder')}
            value={formData.gstNumber}
            onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('suppliers.creditLimit')}</Label>
          <Input
            type="number"
            value={formData.creditLimit}
            onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('suppliers.paymentTerms')}</Label>
          <Input
            type="number"
            value={formData.paymentTerms}
            onChange={(e) => setFormData({ ...formData, paymentTerms: parseInt(e.target.value) })}
          />
        </div>
      </div>

      {/* M3 — distributor visit-day schedule (optional, settings-gated). */}
      {settings.supplierVisitDaysEnabled && (
        <div className="space-y-2">
          <Label>Visit days <span className="text-xs text-gray-400">(optional)</span></Label>
          <div className="flex flex-wrap gap-2">
            {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((d) => {
              const on = (formData.visitDays ?? []).includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    const current = formData.visitDays ?? [];
                    const next = on ? current.filter((x) => x !== d) : [...current, d];
                    setFormData({ ...formData, visitDays: next });
                  }}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-md border uppercase',
                    on ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500">Shows up in the &quot;Today's expected suppliers&quot; dashboard widget.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('suppliers.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('suppliers.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center">
            <Button variant="outline" className="gap-2" onClick={handleImportSuppliers}>
              <Upload className="w-4 h-4" />
              {t('common.import')}
            </Button>
            <ImportHelpPopover columns={csvColumns} templateFilename="suppliers" entityName="Suppliers" />
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportSuppliers}>
            <Download className="w-4 h-4" />
            {t('common.export')}
          </Button>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            {t('suppliers.addSupplier')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('suppliers.totalSuppliers')}</p>
                <p className="text-2xl font-bold">{suppliers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('suppliers.totalPayables')}</p>
                <p className="text-2xl font-bold text-red-500">
                  Rs. {suppliers.reduce((sum, s) => sum + s.currentBalance, 0).toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('suppliers.activeOrders')}</p>
                <p className="text-2xl font-bold text-amber-500">
                  {purchases.filter(p => p.status === 'ordered' || p.status === 'partial').length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('suppliers.thisMonthLabel')}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  Rs. {purchases
                    .filter(p => new Date(p.purchaseDate).getMonth() === new Date().getMonth())
                    .reduce((sum, p) => sum + p.totalAmount, 0)
                    .toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t('suppliers.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            {t('suppliers.supplierList')} ({filteredSuppliers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('suppliers.companyName')}</TableHead>
                  <TableHead>{t('suppliers.contactPerson')}</TableHead>
                  <TableHead>{t('common.phone')}</TableHead>
                  <TableHead>{t('suppliers.city')}</TableHead>
                  <TableHead>{t('suppliers.balance')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Truck className="w-4 h-4 text-emerald-500" />
                        <span className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {supplier.name}
                        </span>
                        {/* M3 — visit-day chips (when feature on). */}
                        {settings.supplierVisitDaysEnabled && supplier.visitDays && supplier.visitDays.length > 0 && (
                          <div className="flex gap-1">
                            {supplier.visitDays.map((d) => (
                              <span key={d} className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{supplier.contactPerson}</TableCell>
                    <TableCell>{supplier.phone}</TableCell>
                    <TableCell>{supplier.city}</TableCell>
                    <TableCell>
                      <span className={supplier.currentBalance > 0 ? 'text-red-500 font-medium' : 'text-emerald-500'}>
                        Rs. {supplier.currentBalance.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {supplier.currentBalance > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => openPaymentDialog(supplier)}
                          >
                            <DollarSign className="w-3 h-3" />
                            Pay
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-blue-700"
                          title="Map medicines this supplier provides"
                          onClick={() => { setMapSupplier(supplier); setMedFilter(''); }}
                        >
                          <Package className="w-4 h-4" />
                          {(() => {
                            const n = medicineSuppliers.filter((m) => m.supplierId === supplier.id).length;
                            return n > 0 ? <span className="text-xs">{n}</span> : null;
                          })()}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailsDialog(supplier)}
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Prepare order"
                          onClick={() => setOrderSupplierId(supplier.id)}
                        >
                          <ShoppingCart className="w-4 h-4 text-emerald-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(supplier)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500"
                          onClick={() => openDeleteDialog(supplier)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('suppliers.addNew')}</DialogTitle>
            <DialogDescription>
              {t('suppliers.addNewDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {supplierFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.name || !formData.contactPerson || !formData.phone}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('suppliers.saveSupplier')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Map Medicines Dialog — link as many products as you like to a supplier.
          Each toggle persists immediately to the medicine↔supplier table, the
          same data Purchase Orders use to pre-link distributors. */}
      <Dialog open={!!mapSupplier} onOpenChange={(o) => { if (!o) setMapSupplier(null); }}>
        <DialogContent className="sm:max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" /> Map medicines — {mapSupplier?.name}
            </DialogTitle>
            <DialogDescription>
              Tick every medicine this supplier provides. Mapped products are pre-linked when you create a Purchase Order for them.
            </DialogDescription>
          </DialogHeader>

          {mapSupplier && (() => {
            const mapped = medicineSuppliers.filter((m) => m.supplierId === mapSupplier.id);
            const mappedIds = new Set(mapped.map((m) => m.medicineId));
            const toggle = (medicineId: string) => {
              const existing = mapped.find((m) => m.medicineId === medicineId);
              if (existing) {
                removeMedicineSupplier(existing.id);
              } else {
                addMedicineSupplier({
                  id: `ms-${Date.now()}-${medicineId.slice(-5)}`,
                  medicineId, supplierId: mapSupplier.id, isPrimary: false,
                  createdAt: new Date(), updatedAt: new Date(),
                });
              }
            };
            const list = medicines
              .filter((m) => m.isActive && (m.name.toLowerCase().includes(medFilter.toLowerCase()) || (m.genericName ?? '').toLowerCase().includes(medFilter.toLowerCase())));
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{mappedIds.size} medicine{mappedIds.size === 1 ? '' : 's'} mapped</span>
                  {mappedIds.size > 0 && (
                    <button
                      className="text-xs text-red-500 hover:underline"
                      onClick={() => mapped.forEach((m) => removeMedicineSupplier(m.id))}
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search medicines to map…"
                    value={medFilter}
                    onChange={(e) => setMedFilter(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border divide-y dark:divide-gray-700">
                  {list.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No medicines match.</p>
                  ) : (
                    list.map((m) => {
                      const on = mappedIds.has(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => toggle(m.id)}
                          className={cn(
                            'w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800',
                            on && 'bg-emerald-50/60 dark:bg-emerald-900/10',
                          )}
                        >
                          <span><span className="font-medium">{m.name}</span>{m.genericName && <span className="text-gray-400"> · {m.genericName}</span>}</span>
                          {on ? <Check className="w-4 h-4 text-emerald-600" /> : <Plus className="w-4 h-4 text-gray-300" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button onClick={() => setMapSupplier(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('suppliers.editTitle')}</DialogTitle>
            <DialogDescription>
              {t('suppliers.editDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {supplierFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('suppliers.updateSupplier')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {t('suppliers.deleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('suppliers.deleteConfirm', selectedSupplier?.name ?? '')}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('suppliers.deleteTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        {/* Wide layout — sm:max-w-[1500px] specifically overrides shadcn's
            baked-in `sm:max-w-lg`; without the `sm:` prefix our rule loses
            specificity at sm+ and the dialog ends up at the 512px default. */}
        <DialogContent className="sm:max-w-[1500px] w-[95vw] max-h-[90vh] overflow-y-auto p-0 gap-0">
          {/* Custom hero header — avatar, name, contact, balance pill, Pay CTA */}
          {selectedSupplier && (
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b bg-gradient-to-br from-emerald-50/60 to-white">
              <DialogHeader className="space-y-0">
                {/* DialogTitle still rendered for a11y but visually replaced */}
                <DialogTitle className="sr-only">{selectedSupplier.name}</DialogTitle>
                <DialogDescription className="sr-only">{t('suppliers.detailsDesc')}</DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-lg font-bold shrink-0 shadow-sm">
                  {selectedSupplier.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{selectedSupplier.name}</h2>
                  <div className="mt-0.5 text-sm text-gray-600 flex flex-wrap gap-x-3 gap-y-0.5">
                    {selectedSupplier.contactPerson && <span>{selectedSupplier.contactPerson}</span>}
                    {selectedSupplier.phone && <span className="text-gray-400">·</span>}
                    {selectedSupplier.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {selectedSupplier.phone}
                      </span>
                    )}
                    {selectedSupplier.city && <span className="text-gray-400">·</span>}
                    {selectedSupplier.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {selectedSupplier.city}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={cn(
                    'px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold tabular-nums',
                    selectedSupplier.currentBalance > 0
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  )}>
                    Outstanding: Rs. {selectedSupplier.currentBalance.toLocaleString()}
                  </div>
                  {selectedSupplier.currentBalance > 0 && (
                    <Button
                      size="sm"
                      className="bg-emerald-500 hover:bg-emerald-600 gap-1.5"
                      onClick={() => { setShowDetailsDialog(false); openPaymentDialog(selectedSupplier); }}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      Pay
                    </Button>
                  )}
                </div>
              </div>

              {/* Quick KPI strip — responsive 2 cols on mobile, 4 on desktop */}
              {(() => {
                const supplierPOCount = supplierPurchases.filter((p) => p.status !== 'cancelled').length;
                const overdueCount = supplierPurchases.filter((p) =>
                  p.status !== 'received' && p.status !== 'cancelled' && p.dueDate && new Date(p.dueDate) < new Date()
                ).length;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Credit Limit</p>
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        Rs. {selectedSupplier.creditLimit.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Total Orders</p>
                      <p className="text-sm font-bold text-gray-900 tabular-nums">{supplierPOCount}</p>
                    </div>
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Overdue</p>
                      <p className={cn('text-sm font-bold tabular-nums', overdueCount > 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {overdueCount}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Payment Terms</p>
                      <p className="text-sm font-bold text-gray-900">
                        {selectedSupplier.paymentTerms ?? 0} days
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <Tabs defaultValue="info" className="w-full">
            <div className="px-5 sm:px-6 pt-3 border-b">
              <TabsList className="bg-transparent p-0 h-auto gap-2 sm:gap-4 justify-start rounded-none">
                {[
                  { value: 'info', label: t('suppliers.information') },
                  { value: 'aging', label: 'Aged Payables' },
                  { value: 'purchases', label: t('suppliers.purchasesTab') },
                  { value: 'ledger', label: 'Ledger' },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 sm:px-3 pb-2 pt-1 text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="px-5 sm:px-6 py-4">

            {/* ── Info Tab ── grouped Contact / Identity / Commercial */}
            <TabsContent value="info" className="space-y-4 mt-0">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 bg-white">
                  <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    Contact
                  </h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-gray-500">Person</dt><dd className="font-medium text-gray-900 text-right">{selectedSupplier?.contactPerson || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-500">Phone</dt><dd className="font-medium text-gray-900 text-right">{selectedSupplier?.phone || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-500">Email</dt><dd className="font-medium text-gray-900 text-right truncate max-w-[60%]" title={selectedSupplier?.email}>{selectedSupplier?.email || '—'}</dd></div>
                  </dl>
                </div>

                <div className="rounded-lg border p-4 bg-white">
                  <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Identity & Tax
                  </h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-gray-500">NTN</dt><dd className="font-medium text-gray-900 text-right">{selectedSupplier?.ntn || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-500">GST</dt><dd className="font-medium text-gray-900 text-right">{selectedSupplier?.gstNumber || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-500">City</dt><dd className="font-medium text-gray-900 text-right">{selectedSupplier?.city || '—'}</dd></div>
                  </dl>
                </div>

                <div className="rounded-lg border p-4 bg-white sm:col-span-2">
                  <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    Address
                  </h4>
                  <p className="text-sm text-gray-900">{selectedSupplier?.address || '—'}</p>
                </div>

                <div className="rounded-lg border p-4 bg-white sm:col-span-2">
                  <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    Commercial
                  </h4>
                  {selectedSupplier && selectedSupplier.creditLimit > 0 ? (() => {
                    const pct = Math.min(100, Math.round((selectedSupplier.currentBalance / selectedSupplier.creditLimit) * 100));
                    return (
                      <>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-500">Credit Utilization</span>
                          <span className="font-semibold tabular-nums">
                            Rs. {selectedSupplier.currentBalance.toLocaleString()} / Rs. {selectedSupplier.creditLimit.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500',
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5">{pct}% of credit limit used · {selectedSupplier.paymentTerms} day terms</p>
                      </>
                    );
                  })() : (
                    <p className="text-sm text-gray-500 italic">No credit limit set for this supplier.</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── Aged Payables Tab ── stacked bar + breakdown */}
            <TabsContent value="aging" className="mt-0">
              {(() => {
                const totalOutstanding = agedPayables.current + agedPayables.d30 + agedPayables.d60 + agedPayables.d90 + agedPayables.over90;
                const bucket = (v: number) => totalOutstanding > 0 ? (v / totalOutstanding) * 100 : 0;
                const rows = [
                  { label: 'Current (not yet due)', value: agedPayables.current, color: 'bg-emerald-500', text: 'text-emerald-700' },
                  { label: '1–30 days overdue', value: agedPayables.d30, color: 'bg-amber-400', text: 'text-amber-700' },
                  { label: '31–60 days overdue', value: agedPayables.d60, color: 'bg-orange-500', text: 'text-orange-700' },
                  { label: '61–90 days overdue', value: agedPayables.d90, color: 'bg-red-500', text: 'text-red-700' },
                  { label: '90+ days overdue', value: agedPayables.over90, color: 'bg-red-700', text: 'text-red-800' },
                ];
                return (
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-baseline justify-between mb-2">
                        <p className="text-sm text-gray-500">Outstanding broken down by overdue age (based on PO due dates)</p>
                        <p className="text-2xl font-bold text-red-600 tabular-nums">Rs. {totalOutstanding.toLocaleString()}</p>
                      </div>
                      {totalOutstanding > 0 ? (
                        <div className="flex h-3 rounded-full overflow-hidden border bg-gray-50">
                          {rows.map((r) => r.value > 0 && (
                            <div key={r.label} className={r.color} style={{ width: `${bucket(r.value)}%` }} title={`${r.label}: Rs. ${r.value.toLocaleString()}`} />
                          ))}
                        </div>
                      ) : (
                        <div className="h-3 rounded-full bg-emerald-50 border border-emerald-200" />
                      )}
                    </div>

                    <div className="rounded-lg border overflow-hidden">
                      {rows.map((r, i) => (
                        <div key={r.label} className={cn('flex items-center justify-between px-4 py-2.5', i < rows.length - 1 && 'border-b')}>
                          <div className="flex items-center gap-2.5">
                            <span className={cn('w-2.5 h-2.5 rounded-full', r.color)} />
                            <span className="text-sm text-gray-700">{r.label}</span>
                          </div>
                          <div className="flex items-baseline gap-3">
                            <span className="text-xs text-gray-400 tabular-nums">{bucket(r.value).toFixed(0)}%</span>
                            <span className={cn('text-sm font-semibold tabular-nums', r.text)}>Rs. {r.value.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </TabsContent>

            {/* ── Purchases Tab ── */}
            <TabsContent value="purchases" className="mt-0">
              <div className="rounded-lg border overflow-hidden">
                <ScrollArea className="h-72">
                  <div className="min-w-[680px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 hover:bg-gray-50">
                          <TableHead className="whitespace-nowrap w-[110px] text-xs uppercase tracking-wide">PO #</TableHead>
                          <TableHead className="whitespace-nowrap w-[100px] text-xs uppercase tracking-wide">Date</TableHead>
                          <TableHead className="whitespace-nowrap w-[110px] text-xs uppercase tracking-wide">Due</TableHead>
                          <TableHead className="whitespace-nowrap text-right text-xs uppercase tracking-wide">Amount</TableHead>
                          <TableHead className="whitespace-nowrap text-right text-xs uppercase tracking-wide">Balance</TableHead>
                          <TableHead className="whitespace-nowrap w-[100px] text-xs uppercase tracking-wide">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierPurchases.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-gray-400 py-10">No purchase orders yet</TableCell>
                          </TableRow>
                        ) : supplierPurchases.map((po) => {
                          const overdue = po.status !== 'received' && po.status !== 'cancelled' && po.dueDate && new Date(po.dueDate) < new Date();
                          return (
                            <TableRow key={po.id} className={overdue ? 'bg-red-50/60' : ''}>
                              <TableCell className="font-mono text-xs font-medium">{po.purchaseNumber}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{new Date(po.purchaseDate).toLocaleDateString()}</TableCell>
                              <TableCell className={cn('text-xs whitespace-nowrap', overdue && 'text-red-600 font-medium')}>
                                {po.dueDate ? new Date(po.dueDate).toLocaleDateString() : '—'}
                                {overdue ? ' ⚠' : ''}
                              </TableCell>
                              <TableCell className="text-xs text-right tabular-nums">Rs. {po.totalAmount.toLocaleString()}</TableCell>
                              <TableCell className={cn('text-xs text-right tabular-nums font-medium', po.balanceAmount > 0 ? 'text-red-600' : 'text-emerald-600')}>
                                Rs. {po.balanceAmount.toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  po.status === 'received' ? 'success' :
                                  po.status === 'cancelled' ? 'destructive' : 'warning'
                                } className="capitalize">
                                  {po.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            {/* ── Ledger Tab ── one row per PO and one row per recorded
                 payment, with click-through to the uploaded proof. */}
            <TabsContent value="ledger" className="mt-0 space-y-3">
              {/* Date-range filter + Print Statement button */}
              <div className="flex flex-wrap items-end justify-between gap-3 p-3 rounded-lg border bg-gray-50">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">From</Label>
                    <Input
                      type="date"
                      value={ledgerStart}
                      onChange={(e) => setLedgerStart(e.target.value)}
                      className="h-8 w-40"
                      max={ledgerEnd}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">To</Label>
                    <Input
                      type="date"
                      value={ledgerEnd}
                      onChange={(e) => setLedgerEnd(e.target.value)}
                      className="h-8 w-40"
                      min={ledgerStart}
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        const d = new Date(); d.setDate(1);
                        setLedgerStart(d.toISOString().slice(0, 10));
                        setLedgerEnd(new Date().toISOString().slice(0, 10));
                      }}
                    >
                      This month
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        const now = new Date();
                        const q = Math.floor(now.getMonth() / 3) * 3;
                        setLedgerStart(new Date(now.getFullYear(), q, 1).toISOString().slice(0, 10));
                        setLedgerEnd(now.toISOString().slice(0, 10));
                      }}
                    >
                      This quarter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setLedgerStart('');
                        setLedgerEnd(new Date().toISOString().slice(0, 10));
                      }}
                    >
                      All time
                    </Button>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 gap-2 h-8"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Statement
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>Print options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => {
                        if (!selectedSupplier) return;
                        const end = ledgerEnd ? new Date(ledgerEnd + 'T23:59:59') : new Date();
                        const start = ledgerStart ? new Date(ledgerStart + 'T00:00:00') : null;
                        printSupplierLedger({
                          supplier: selectedSupplier,
                          settings,
                          purchases: supplierPurchases,
                          start,
                          end,
                          includeProofs: false,
                        });
                      }}
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <div className="flex flex-col">
                        <span className="font-medium">Without proofs</span>
                        <span className="text-xs text-gray-500">Clean one/two-page summary statement</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => {
                        if (!selectedSupplier) return;
                        const end = ledgerEnd ? new Date(ledgerEnd + 'T23:59:59') : new Date();
                        const start = ledgerStart ? new Date(ledgerStart + 'T00:00:00') : null;
                        printSupplierLedger({
                          supplier: selectedSupplier,
                          settings,
                          purchases: supplierPurchases,
                          start,
                          end,
                          includeProofs: true,
                        });
                      }}
                    >
                      <Paperclip className="w-4 h-4 text-blue-600" />
                      <div className="flex flex-col">
                        <span className="font-medium">With payment proofs</span>
                        <span className="text-xs text-gray-500">Embeds every uploaded cheque / bank-slip image</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <ScrollArea className="h-72">
                  <div className="min-w-[760px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 hover:bg-gray-50">
                          <TableHead className="whitespace-nowrap w-[90px] text-xs uppercase tracking-wide">Date</TableHead>
                          <TableHead className="whitespace-nowrap w-[180px] text-xs uppercase tracking-wide">Reference</TableHead>
                          <TableHead className="whitespace-nowrap text-xs uppercase tracking-wide">Type / Method</TableHead>
                          <TableHead className="whitespace-nowrap text-right w-[110px] text-xs uppercase tracking-wide">Debit</TableHead>
                          <TableHead className="whitespace-nowrap text-right w-[110px] text-xs uppercase tracking-wide">Credit</TableHead>
                          <TableHead className="whitespace-nowrap w-[60px] text-xs uppercase tracking-wide">Proof</TableHead>
                          <TableHead className="whitespace-nowrap text-right w-[110px] text-xs uppercase tracking-wide">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                    <TableBody>
                      {(() => {
                        interface LedgerRow {
                          date: Date;
                          ref: string;
                          type: string;
                          method?: string;
                          notes?: string;
                          debit: number;
                          credit: number;
                          proofImageUrl?: string;
                        }
                        const rows: LedgerRow[] = [];
                        for (const po of [...supplierPurchases].sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime())) {
                          if (po.status === 'cancelled') continue;
                          // PO line (debit) — only after GRN do we have a real total
                          if (po.totalAmount > 0) {
                            rows.push({
                              date: new Date(po.purchaseDate),
                              ref: po.purchaseNumber,
                              type: po.isLoose ? 'Loose Purchase' : 'Purchase / GRN',
                              debit: po.totalAmount,
                              credit: 0,
                            });
                          }
                          // One row per recorded payment, sorted by paidAt asc
                          const pays = [...(po.payments ?? [])].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
                          for (const p of pays) {
                            rows.push({
                              date: new Date(p.paidAt),
                              ref: `${po.purchaseNumber} / ${p.reference || p.id.slice(-6)}`,
                              type: 'Payment',
                              method: p.method.replace('_', ' '),
                              notes: p.notes,
                              debit: 0,
                              credit: p.amount,
                              proofImageUrl: p.proofImageUrl,
                            });
                          }
                          // Legacy fallback — POs persisted before per-payment tracking
                          // existed will have paidAmount > 0 but empty payments. Show a
                          // synthetic line so the ledger still reconciles.
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

                        if (rows.length === 0) return (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-gray-400 py-8">No transactions yet</TableCell>
                          </TableRow>
                        );
                        let runningBalance = 0;
                        return rows.map((row, idx) => {
                          runningBalance += row.debit - row.credit;
                          const isPayment = row.credit > 0;
                          return (
                            <TableRow key={idx} className={isPayment ? 'bg-emerald-50/40' : ''}>
                              <TableCell className="text-xs whitespace-nowrap tabular-nums">{row.date.toLocaleDateString()}</TableCell>
                              <TableCell className="text-xs font-mono whitespace-nowrap text-gray-700">{row.ref}</TableCell>
                              <TableCell className="text-xs">
                                <div className="font-medium text-gray-800">{row.type}</div>
                                {row.method && <div className="text-[10px] text-gray-500 capitalize">via {row.method}</div>}
                                {row.notes && <div className="text-[10px] text-gray-400 italic truncate max-w-[200px]" title={row.notes}>{row.notes}</div>}
                              </TableCell>
                              <TableCell className="text-right text-xs whitespace-nowrap tabular-nums text-red-600">
                                {row.debit > 0 ? `Rs. ${row.debit.toLocaleString()}` : <span className="text-gray-300">—</span>}
                              </TableCell>
                              <TableCell className="text-right text-xs whitespace-nowrap tabular-nums text-emerald-700 font-medium">
                                {row.credit > 0 ? `Rs. ${row.credit.toLocaleString()}` : <span className="text-gray-300 font-normal">—</span>}
                              </TableCell>
                              <TableCell>
                                {row.proofImageUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => openDataUrlInNewTab(row.proofImageUrl!, 'payment-proof')}
                                    title="View payment proof"
                                    className="inline-block cursor-pointer"
                                  >
                                    {row.proofImageUrl.startsWith('data:image') ? (
                                      <img
                                        src={row.proofImageUrl}
                                        alt="proof"
                                        className="w-8 h-8 object-cover rounded border hover:opacity-80"
                                      />
                                    ) : (
                                      <FileText className="w-5 h-5 text-blue-600" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-gray-300 text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell className={cn('text-right text-xs whitespace-nowrap tabular-nums font-semibold', runningBalance > 0 ? 'text-red-600' : 'text-emerald-700')}>
                                Rs. {runningBalance.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                  </div>
                </ScrollArea>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Each payment row shows the method (cash / bank / cheque) and the uploaded proof. Click a thumbnail to view full size.
              </p>
            </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog — mirrors the rich Purchase Orders one so
          payment proof + method + reference get captured here too. */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {selectedSupplier?.name} — Outstanding:{' '}
              <strong>Rs. {selectedSupplier?.currentBalance.toLocaleString()}</strong>
            </DialogDescription>
          </DialogHeader>

          {selectedSupplier && (
            <div className="space-y-4">
              <div>
                <Label>Payment Amount *</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentAmount(selectedSupplier.currentBalance.toFixed(2))}
                  >
                    Full (Rs. {selectedSupplier.currentBalance.toLocaleString()})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentAmount((selectedSupplier.currentBalance / 2).toFixed(2))}
                  >
                    Half
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Applied to this supplier's open purchase orders oldest-first.
                </p>
              </div>

              <div>
                <Label>Payment Method *</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PurchasePayment['method'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="jazzcash">JazzCash</SelectItem>
                    <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Reference / Txn ID</Label>
                <Input
                  placeholder="Cheque #, txn ID, etc."
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  placeholder="Optional note"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                />
              </div>

              <div>
                <Label>Payment Proof (image / PDF)</Label>
                <input
                  id="supplier-proof-file"
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleProofUpload}
                />
                {paymentProofImage ? (
                  <div className="mt-1 flex items-center gap-2 p-2 border rounded-md bg-emerald-50 border-emerald-200">
                    {paymentProofImage.startsWith('data:image') ? (
                      <button type="button" onClick={() => openDataUrlInNewTab(paymentProofImage, 'payment-proof')} className="cursor-pointer">
                        <img src={paymentProofImage} alt="Proof" className="w-12 h-12 object-cover rounded border" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => openDataUrlInNewTab(paymentProofImage, 'payment-proof')} className="w-12 h-12 rounded border bg-white flex items-center justify-center cursor-pointer">
                        <FileText className="w-6 h-6 text-gray-500" />
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800">Proof attached</p>
                      <p className="text-xs text-emerald-700">Cheque pic, bank slip, etc.</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => setPaymentProofImage('')}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 gap-2 w-full"
                    onClick={() => document.getElementById('supplier-proof-file')?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Attach payment proof
                  </Button>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Optional but recommended for non-cash payments (cheque, bank transfer).
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 gap-2"
              onClick={handleRecordPayment}
              disabled={paymentLoading || !paymentAmount || parseFloat(paymentAmount) <= 0}
            >
              <Wallet className="w-4 h-4" />
              {paymentLoading ? 'Saving…' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature 2 — distributor-visit order preview + send */}
      <DistributorOrderDialog
        supplierId={orderSupplierId}
        open={!!orderSupplierId}
        onOpenChange={(o) => { if (!o) setOrderSupplierId(null); }}
      />
    </div>
  );
}
