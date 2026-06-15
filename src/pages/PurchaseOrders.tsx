import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore, useSupplierStore, useInventoryStore, useAuthStore, useNetworkStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ClipboardList,
  Plus,
  Search,
  Eye,
  Trash2,
  PackageCheck,
  ShoppingBag,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Pencil,
  AlertCircle,
  Wallet,
  MessageCircle,
  Share2,
  Upload,
  FileText,
  Zap,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import type { Purchase, PurchaseItem, PurchasePayment, PurchaseStatus } from '@/types';
import { processUploadedFile } from '@/lib/image';
import { openDataUrlInNewTab } from '@/lib/openImage';
import { parseScannedCode, toDateInputValue } from '@/lib/gs1';
import { runAutoPo, createNetworkOrder } from '@/lib/backend';

// At PO-create time the cashier only commits to medicine + quantity + payment
// terms. Pricing, discount and tax are all entered at GRN (when the supplier's
// printed bill arrives), so this struct deliberately drops them.
interface FormItem {
  medicineId: string;
  quantity: number;          // entered in the chosen unit (e.g. 5 boxes)
  unitKey: 'master' | 'sub' | 'base'; // which pack level the user is buying in
}

interface ReceiveItem {
  medicineId: string;
  orderedQty: number;
  receivedQty: number;
  batchNumber: string;
  expiryDate: string;
  /** Manufacture date (YYYY-MM-DD), e.g. auto-filled from a scanned pack. */
  manufactureDate?: string;
  /** Price the user typed, in the pack unit they picked (priceUnitKey).
   *  Converted to per-base when posting GRN. */
  purchasePrice: number;
  /** Which pack unit the typed price applies to (box / strip / piece). */
  priceUnitKey: 'master' | 'sub' | 'base';
  salePrice: number;
  mrp: number;
  /** Per-line override of the company's defaultMarginPercent. */
  marginPercent: number;
  discountPercent: number;
  taxPercent: number;
}

// Smart tax mode selector — dropdown with No Tax / Sales-Tax (from Settings) / Custom.
// Stores final value as a number on the parent. Custom input stacked below for visibility.
function TaxModeSelector({ value, defaultRate, onChange }: {
  value: number;
  defaultRate: number;
  onChange: (v: number) => void;
}) {
  // Show Sales tax option always; if settings doesn't have one, suggest 18%
  const salesTaxRate = defaultRate > 0 ? defaultRate : 18;
  // Derive current mode from value
  const mode = value === 0
    ? 'none'
    : value === salesTaxRate
      ? 'default'
      : 'custom';
  return (
    <div className="space-y-1.5 mt-1">
      <Select
        value={mode}
        onValueChange={(m) => {
          if (m === 'none') onChange(0);
          else if (m === 'default') onChange(salesTaxRate);
          else if (m === 'custom') onChange(value && value !== salesTaxRate ? value : 1);
        }}
      >
        <SelectTrigger className="h-9 text-xs w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No tax (0%)</SelectItem>
          <SelectItem value="default">
            Sales tax ({salesTaxRate}%){defaultRate === 0 ? ' — default' : ' — from Settings'}
          </SelectItem>
          <SelectItem value="custom">Custom %…</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="number" min={0} max={100} step="0.01"
            value={value}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="h-9 flex-1"
            placeholder="Tax %"
          />
          <span className="text-xs text-gray-500">%</span>
        </div>
      )}
    </div>
  );
}

export function PurchaseOrders() {
  const { settings } = useSettingsStore();
  const {
    suppliers,
    purchases,
    addPurchase,
    updatePurchase,
    deletePurchase,
    medicineSuppliers,
    addMedicineSupplier,
    medicinesForSupplier,
    purchaseInvoices,
    addPurchaseInvoice,
    invoicesForPurchase,
    addPurchaseReturn,
  } = useSupplierStore();
  const { medicines, addBatch, getMedicineStock } = useInventoryStore();
  const { currentUser, activeBranchId } = useAuthStore();
  const { connections: netConnections, refresh: refreshNetwork } = useNetworkStore();
  const [kynexPO, setKynexPO] = useState<Purchase | null>(null);

  // Distributors/wholesalers this tenant is connected to on the Kynex network.
  const netDistributors = netConnections.filter(
    (c) => c.status === 'accepted' && (c.peer?.businessType === 'distributor' || c.peer?.businessType === 'wholesaler'),
  );
  const openKynex = (po: Purchase) => {
    if (netDistributors.length === 0) {
      toast.info('No distributors connected. Connect one on the Network page first.');
      return;
    }
    setKynexPO(po);
  };
  const sendKynexOrder = async (connectionId: string) => {
    if (!kynexPO) return;
    const items = kynexPO.items.map((it) => {
      const med = medicines.find((m) => m.id === it.medicineId);
      return {
        productName: med ? `${med.name}${med.strength ? ' ' + med.strength : ''}` : (getMedicineName(it.medicineId) || 'Item'),
        quantity: it.quantity,
        buyerMedicineId: it.medicineId || undefined,
      };
    });
    try {
      await createNetworkOrder({ connectionId, items, notes: `From PO ${kynexPO.purchaseNumber}`, sourcePurchaseId: kynexPO.id });
      toast.success('Order sent via Kynex network');
      setKynexPO(null);
      refreshNetwork();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send');
    }
  };
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // UI state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState<Purchase | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Create/Edit form
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  // Payment terms in days (e.g. 30). The actual calendar due date is computed
  // at GRN time (receiveDate + paymentTermsDays). Stored as string for the input.
  const [formPaymentTermsDays, setFormPaymentTermsDays] = useState('');
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [medicineSearch, setMedicineSearch] = useState('');

  // Receive form
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([]);
  const [supplierInvoiceRef, setSupplierInvoiceRef] = useState('');
  const [supplierInvoiceImage, setSupplierInvoiceImage] = useState<string>('');

  // M3 — Purchase return dialog. selectedReturnItems is the qty-per-batch the
  // user wants to send back to the distributor (damaged / expired / wrong).
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnAdjustStock, setReturnAdjustStock] = useState(true);
  // Map medicineId → returned quantity in BASE units. Default 0; user sets.
  const [returnQtyByMed, setReturnQtyByMed] = useState<Record<string, number>>({});

  // ── Loose Purchase form (one-step, off-supplier, cash-only) ──
  // Used for urgent stockouts — e.g. patient needs Augmentin now, we bought 1
  // strip from "Khan Pharmacy" next door. No PO/GRN cycle, no supplier credit.
  const [showLooseDialog, setShowLooseDialog] = useState(false);
  const [looseMedicineId, setLooseMedicineId] = useState('');
  const [looseMedicineSearch, setLooseMedicineSearch] = useState('');
  const [looseQty, setLooseQty] = useState('1');
  const [looseUnitKey, setLooseUnitKey] = useState<'master' | 'sub' | 'base'>('base');
  const [loosePrice, setLoosePrice] = useState('');
  const [looseMrp, setLooseMrp] = useState('');
  const [looseBatchNumber, setLooseBatchNumber] = useState('');
  const [looseExpiry, setLooseExpiry] = useState('');
  const [looseSource, setLooseSource] = useState('');
  const [looseNotes, setLooseNotes] = useState('');

  // Payment form
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PurchasePayment['method']>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentProofImage, setPaymentProofImage] = useState<string>('');

  // Last known purchase price per medicine — used to auto-fill new PO lines and
  // show a "Last paid Rs. X" hint so the pharmacist doesn't have to remember.
  const lastPurchasePriceFor = (medicineId: string): { price: number; date?: Date } | null => {
    const batches = useInventoryStore.getState().batches
      .filter((b) => b.medicineId === medicineId && b.purchasePrice > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (batches[0]) return { price: batches[0].purchasePrice, date: batches[0].createdAt };
    return null;
  };

  // Generic upload helper for the small image-upload affordances below.
  const uploadIntoSetter = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (s: string) => void,
    label: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const r = await processUploadedFile(file);
      setter(r.dataUrl);
      if (r.compressed && r.beforeBytes > r.afterBytes) {
        const ratio = Math.round((1 - r.afterBytes / r.beforeBytes) * 100);
        if (ratio > 0) {
          toast.success(`${label} compressed (${(r.beforeBytes / 1024).toFixed(0)} KB → ${(r.afterBytes / 1024).toFixed(0)} KB, ${ratio}% smaller)`);
        }
      } else {
        toast.success(`${label} uploaded`);
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to process file');
    }
    (e.target as HTMLInputElement).value = '';
  };

  // Auto-open from Alerts page URL (?medicine=id&qty=N)
  useEffect(() => {
    const medicineId = searchParams.get('medicine');
    const qty = searchParams.get('qty');
    if (medicineId) {
      const med = medicines.find(m => m.id === medicineId);
      if (med) {
        const units = med.units ?? [];
        const masterUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
        const subUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
        const defaultUnit: FormItem['unitKey'] = masterUnit ? 'master' : subUnit ? 'sub' : 'base';
        setFormItems([{
          medicineId: med.id,
          // Default qty to the medicine's configured reorder quantity — that
          // is exactly the value the user set as "how much to buy when low".
          quantity: parseInt(qty || String(med.reorderQuantity)) || 1,
          unitKey: defaultUnit,
        }]);
        setShowCreateDialog(true);
        setSearchParams({});
      }
    }
  }, []);

  // ─── Helpers ─────────────────────────────────────────
  const getSupplierName = (id: string) =>
    suppliers.find(s => s.id === id)?.name || '—';

  const getSupplier = (id: string) =>
    suppliers.find(s => s.id === id);

  const getMedicineName = (id: string) =>
    medicines.find(m => m.id === id)?.name || '—';

  const generatePONumber = () =>
    `PO-${String(purchases.length + 1).padStart(5, '0')}`;

  const getMedicinePendingQty = (medicineId: string) =>
    purchases
      .filter(p => p.status === 'ordered' || p.status === 'draft')
      .flatMap(p => p.items)
      .filter(i => i.medicineId === medicineId)
      .reduce((s, i) => s + i.quantity, 0);

  const isOverdue = (po: Purchase) => {
    if (po.status === 'received' || po.status === 'cancelled') return false;
    if (!po.dueDate) return false;
    return new Date(po.dueDate) < new Date();
  };

  // Auto-fill payment terms (days) from the supplier profile when one is chosen.
  // The calendar due date is computed at GRN time, not now — we don't know yet
  // when the goods will actually arrive.
  const handleSupplierChange = (supplierId: string) => {
    setFormSupplierId(supplierId);
    const supplier = getSupplier(supplierId);
    if (supplier && supplier.paymentTerms > 0 && !formPaymentTermsDays) {
      setFormPaymentTermsDays(String(supplier.paymentTerms));
    }
  };

  // ─── Filter & Stats ──────────────────────────────────
  // Each branch sees only its own purchase orders (owner switches in header).
  const branchPurchases = purchases.filter(p => !activeBranchId || p.branchId === activeBranchId);
  const filtered = branchPurchases
    .filter(p => {
      const matchSearch =
        !search ||
        p.purchaseNumber.toLowerCase().includes(search.toLowerCase()) ||
        getSupplierName(p.supplierId).toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const now = new Date();
  const overdueCount = branchPurchases.filter(p => isOverdue(p)).length;
  const stats = {
    total: branchPurchases.length,
    pending: branchPurchases.filter(p => p.status === 'draft' || p.status === 'ordered').length,
    overdue: overdueCount,
    receivedMonth: branchPurchases.filter(
      p =>
        p.status === 'received' &&
        new Date(p.updatedAt).getMonth() === now.getMonth() &&
        new Date(p.updatedAt).getFullYear() === now.getFullYear()
    ).length,
    totalValue: branchPurchases
      .filter(p => p.status !== 'cancelled')
      .reduce((s, p) => s + p.totalAmount, 0),
  };

  // ─── Medicine search results ─────────────────────────
  // M3 — when a supplier is selected and has a mapping list, prefer their
  // mapped medicines. We don't HIDE unmapped meds — they appear in a second
  // group ("Add new from this distributor") so the user can extend the map on
  // the fly. Selection auto-creates the missing mapping.
  const mappedIdsForSelected = formSupplierId ? new Set(medicinesForSupplier(formSupplierId)) : null;
  const baseSearchHits = medicineSearch.length > 1
    ? medicines.filter(
        m =>
          m.isActive &&
          !formItems.find(i => i.medicineId === m.id) &&
          (m.name.toLowerCase().includes(medicineSearch.toLowerCase()) ||
            m.genericName.toLowerCase().includes(medicineSearch.toLowerCase()) ||
            m.barcode?.includes(medicineSearch))
      )
    : [];
  const searchResults = baseSearchHits.slice(0, 8);
  const searchResultsMapped = mappedIdsForSelected
    ? baseSearchHits.filter((m) => mappedIdsForSelected.has(m.id)).slice(0, 8)
    : [];
  const searchResultsUnmapped = mappedIdsForSelected
    ? baseSearchHits.filter((m) => !mappedIdsForSelected.has(m.id)).slice(0, 8)
    : [];

  // ─── Form actions ────────────────────────────────────
  // Default sales tax % from global settings — used for the "Sales tax" preset on PO forms.
  // Note: tax on a Purchase Order is INPUT tax (what supplier charged us), which is
  // separate from output sales tax. Defaults to 0 unless the user explicitly applies sales tax.
  const defaultSalesTax = settings.taxRules.find(r => r.isDefault && r.isActive)?.ratePercent ?? 0;

  const handleAddItem = (medicineId: string) => {
    if (formItems.find(i => i.medicineId === medicineId)) return;
    // M3 — first time this distributor is being assigned this medicine on a PO?
    // Create the mapping so next time they show up in the "mapped" group.
    if (formSupplierId) {
      const alreadyMapped = medicineSuppliers.some(
        (m) => m.supplierId === formSupplierId && m.medicineId === medicineId,
      );
      if (!alreadyMapped) {
        addMedicineSupplier({
          id: `ms-${Date.now()}-${medicineId.slice(-4)}`,
          medicineId,
          supplierId: formSupplierId,
          isPrimary: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
    const med = medicines.find(m => m.id === medicineId);
    // Default to the largest pack the medicine has (master / sub / base) — that's how you buy stock
    const units = med?.units ?? [];
    const masterUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
    const subUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
    const defaultUnit: FormItem['unitKey'] = masterUnit ? 'master' : subUnit ? 'sub' : 'base';
    setFormItems([
      ...formItems,
      {
        medicineId,
        // Auto-fill from the medicine's reorderQuantity setting — that's the
        // "how much to buy when low" the user already configured.
        quantity: med?.reorderQuantity && med.reorderQuantity > 0 ? med.reorderQuantity : 1,
        unitKey: defaultUnit,
      },
    ]);
    setMedicineSearch('');
  };

  // Helpers for unit conversion
  const getMultiplier = (medicineId: string, unitKey: FormItem['unitKey']): number => {
    if (unitKey === 'base') return 1;
    const med = medicines.find((m) => m.id === medicineId);
    const units = med?.units ?? [];
    if (unitKey === 'master') {
      const mu = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
      return mu?.multiplier ?? 1;
    }
    const su = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
    return su?.multiplier ?? 1;
  };

  const getUnitLabel = (medicineId: string, unitKey: FormItem['unitKey']): string => {
    const med = medicines.find((m) => m.id === medicineId);
    const units = med?.units ?? [];
    if (unitKey === 'base') return units[0]?.name ?? med?.unit ?? 'unit';
    if (unitKey === 'master') {
      const mu = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
      return mu?.name ?? 'box';
    }
    const su = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
    return su?.name ?? 'strip';
  };

  const handleRemoveItem = (idx: number) =>
    setFormItems(formItems.filter((_, i) => i !== idx));

  const handleUpdateFormItem = (idx: number, field: keyof FormItem, value: number | string) => {
    const items = [...formItems];
    (items[idx] as unknown as Record<string, number | string>)[field as string] = value;
    setFormItems(items);
  };

  const resetForm = () => {
    setShowCreateDialog(false);
    setFormSupplierId('');
    setFormNotes('');
    setFormPaymentTermsDays('');
    setFormItems([]);
    setMedicineSearch('');
    setSelectedPO(null);
    setEditMode(false);
  };

  // Build a WhatsApp deep-link to send the PO to the supplier.
  // Uses wa.me (universal) — opens the WhatsApp app on mobile, web on desktop.
  // Phone must be in international format without '+' or leading zeros.
  const normalizePhoneForWa = (raw: string): string => {
    let digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    // Local Pakistani number starting with 0 → strip and prepend 92
    if (digits.startsWith('0')) digits = '92' + digits.slice(1);
    // Bare 10-digit (no country, no leading 0, e.g. 3001234567) → assume PK
    else if (digits.length === 10 && digits.startsWith('3')) digits = '92' + digits;
    return digits;
  };

  const buildPOMessage = (po: Purchase): string => {
    const supplier = getSupplier(po.supplierId);
    const lines: string[] = [];
    lines.push(`*Purchase Order ${po.purchaseNumber}*`);
    lines.push(`From: ${settings.companyName || 'Pharmacy'}`);
    if (supplier) lines.push(`To: ${supplier.name}`);
    lines.push(`Date: ${new Date(po.purchaseDate).toLocaleDateString()}`);
    if (po.paymentTermsDays != null) lines.push(`Payment terms: ${po.paymentTermsDays} day(s) from delivery`);
    else if (po.dueDate) lines.push(`Payment due: ${new Date(po.dueDate).toLocaleDateString()}`);
    lines.push('');
    lines.push('*Items requested:*');
    po.items.forEach((it, idx) => {
      const med = medicines.find((m) => m.id === it.medicineId);
      const name = med ? `${med.name}${med.strength ? ' ' + med.strength : ''}` : getMedicineName(it.medicineId);
      lines.push(`${idx + 1}. ${name} — Qty ${it.quantity}`);
    });
    lines.push('');
    lines.push('_Prices will be confirmed on receipt against your invoice._');
    if (po.notes) {
      lines.push('');
      lines.push(`Notes: ${po.notes}`);
    }
    return lines.join('\n');
  };

  const handleSendWhatsApp = (po: Purchase) => {
    const supplier = getSupplier(po.supplierId);
    if (!supplier) {
      toast.error('Supplier not found');
      return;
    }
    const phone = normalizePhoneForWa(supplier.phone || '');
    const text = encodeURIComponent(buildPOMessage(po));
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    if (!phone) {
      toast.warning('Supplier has no phone — opening WhatsApp without recipient');
    }
  };

  // Record a payment (partial or full) against a PO and update its paid/balance/status.
  const openPaymentDialog = (po: Purchase) => {
    setSelectedPO(po);
    setPaymentAmount(po.balanceAmount.toFixed(2));
    setPaymentMethod('cash');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentProofImage('');
    setShowPaymentDialog(true);
  };

  const resetLooseForm = () => {
    setShowLooseDialog(false);
    setLooseMedicineId('');
    setLooseMedicineSearch('');
    setLooseQty('1');
    setLooseUnitKey('base');
    setLoosePrice('');
    setLooseMrp('');
    setLooseBatchNumber('');
    setLooseExpiry('');
    setLooseSource('');
    setLooseNotes('');
  };

  // Generate a synthetic batch number for loose purchases. Pakistani pharmacies
  // commonly use an "LP-YYYY-NNN" prefix so the audit trail is obvious.
  const nextLoosePurchaseNumber = (): string => {
    const year = new Date().getFullYear();
    const count = purchases.filter((p) => p.isLoose && p.purchaseNumber.startsWith(`LP-${year}-`)).length + 1;
    return `LP-${year}-${String(count).padStart(4, '0')}`;
  };

  const handleRecordLoose = () => {
    const med = medicines.find((m) => m.id === looseMedicineId);
    const qty = parseInt(looseQty, 10);
    const price = parseFloat(loosePrice);
    const mrp = parseFloat(looseMrp);
    if (!med) { toast.error('Pick a medicine'); return; }
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (!Number.isFinite(price) || price <= 0) { toast.error('Enter the purchase price'); return; }
    if (!Number.isFinite(mrp) || mrp <= 0) { toast.error('Enter the MRP / sale price'); return; }
    if (!looseSource.trim()) { toast.error('Source (which pharmacy / source?) is required'); return; }

    const mult = getMultiplier(looseMedicineId, looseUnitKey);
    const baseQty = qty * mult;
    const perBasePrice = mult > 0 ? price / mult : price;
    const totalAmount = +(perBasePrice * baseQty).toFixed(2);

    // Synthesise a batch number when the loose strip doesn't show one — common
    // in Pakistan when you buy 1-2 tablets off a strip cut by another pharmacy.
    const batchNo = looseBatchNumber.trim() || `LP-${Date.now().toString().slice(-6)}`;
    // Default expiry — 1 year out if user doesn't know (better than no expiry,
    // industry-standard fallback in PK ERPs).
    const expiry = looseExpiry
      ? new Date(looseExpiry)
      : (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d; })();

    const purchaseNumber = nextLoosePurchaseNumber();
    const purchaseId = `lp-${Date.now()}`;

    // 1) Record the Purchase voucher (status=received immediately; cash paid)
    const po: Purchase = {
      id: purchaseId,
      purchaseNumber,
      // No supplier FK — loose purchases use a free-text source instead. We
      // still need *something* in supplierId so it doesn't crash; use a sentinel.
      supplierId: 'loose',
      branchId: activeBranchId ?? '1',
      purchaseDate: new Date(),
      items: [{
        id: `pi-${Date.now()}`,
        medicineId: looseMedicineId,
        batchNumber: batchNo,
        expiryDate: expiry,
        quantity: baseQty,
        purchasePrice: perBasePrice,
        salePrice: mrp,
        mrp,
        discountPercent: 0,
        taxPercent: 0,
        total: totalAmount,
      }],
      subtotal: totalAmount,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount,
      paidAmount: totalAmount,            // cash, paid on the spot
      balanceAmount: 0,
      payments: [{
        id: `pay-${Date.now()}`,
        amount: totalAmount,
        method: 'cash',
        notes: `Loose purchase from ${looseSource}`,
        paidAt: new Date(),
        recordedBy: currentUser?.id || '1',
      }],
      isLoose: true,
      looseSource: looseSource.trim(),
      status: 'received',
      notes: looseNotes.trim() || undefined,
      createdBy: currentUser?.id || '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    addPurchase(po);

    // 2) Add the batch so the stock is immediately sellable on POS
    addBatch({
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      medicineId: looseMedicineId,
      batchNumber: batchNo,
      expiryDate: expiry,
      quantity: baseQty,
      purchasePrice: perBasePrice,
      salePrice: mrp,
      mrp,
      supplierId: 'loose',
      purchaseId,
      isActive: true,
      createdAt: new Date(),
    });

    toast.success(`Loose purchase ${purchaseNumber} recorded — ${baseQty} ${med.unit || 'unit'}(s) added to stock`);
    resetLooseForm();
  };

  const handleRecordPayment = () => {
    if (!selectedPO) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (amount > selectedPO.balanceAmount + 0.001) {
      toast.error(`Amount exceeds outstanding balance (Rs. ${selectedPO.balanceAmount.toFixed(2)})`);
      return;
    }
    const payment: PurchasePayment = {
      id: `pay-${Date.now()}`,
      amount,
      method: paymentMethod,
      reference: paymentReference.trim() || undefined,
      notes: paymentNotes.trim() || undefined,
      proofImageUrl: paymentProofImage || undefined,
      paidAt: new Date(),
      recordedBy: currentUser?.id || '1',
    };
    const newPaid = selectedPO.paidAmount + amount;
    const newBalance = Math.max(0, selectedPO.totalAmount - newPaid);
    updatePurchase(selectedPO.id, {
      payments: [...(selectedPO.payments || []), payment],
      paidAmount: newPaid,
      balanceAmount: newBalance,
    });
    toast.success(
      newBalance === 0
        ? `Payment recorded — PO ${selectedPO.purchaseNumber} fully settled`
        : `Partial payment recorded — Rs. ${newBalance.toFixed(2)} remaining`
    );
    setShowPaymentDialog(false);
    setSelectedPO(null);
  };

  // PO-stage totals are always zero — pricing is entered at GRN. Keeping the
  // helper so the call sites below stay readable.
  const computeFormTotals = () => ({ subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 });

  // ─── Save PO ─────────────────────────────────────────
  // Returns the saved (or updated) Purchase so callers can immediately act on it
  // (e.g. open WhatsApp). Returns null when validation fails.
  const handleSavePO = (status: PurchaseStatus, opts: { silent?: boolean } = {}): Purchase | null => {
    if (!formSupplierId || formItems.length === 0) {
      toast.error(t('purchaseOrders.validationError'));
      return null;
    }

    const { subtotal, discountAmount, taxAmount, totalAmount } = computeFormTotals();

    const items: PurchaseItem[] = formItems.map((item, idx) => {
      // User entered qty in pack-units (e.g. 5 boxes). Stock tracks base units.
      // Pricing fields stay 0 here — they get filled at GRN when the supplier's
      // printed bill arrives.
      const mult = getMultiplier(item.medicineId, item.unitKey);
      const baseQty = item.quantity * mult;
      return {
        id: `pi-${Date.now()}-${idx}`,
        medicineId: item.medicineId,
        batchNumber: '',
        expiryDate: new Date(),
        quantity: baseQty,
        purchasePrice: 0,
        salePrice: 0,
        mrp: 0,
        discountPercent: 0,
        taxPercent: 0,
        total: 0,
      };
    });

    // The actual calendar due date is set at GRN. At PO-create we only know
    // the agreed payment-terms-in-days.
    const paymentTermsDays = formPaymentTermsDays
      ? Math.max(0, parseInt(formPaymentTermsDays, 10) || 0)
      : undefined;

    let saved: Purchase;
    if (editMode && selectedPO) {
      // Preserve already-recorded payments; only the order body is editable.
      const previouslyPaid = selectedPO.paidAmount || 0;
      const patch = {
        supplierId: formSupplierId,
        items,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        balanceAmount: Math.max(0, totalAmount - previouslyPaid),
        paymentTermsDays,
        status,
        notes: formNotes,
      };
      updatePurchase(selectedPO.id, patch);
      saved = { ...selectedPO, ...patch, updatedAt: new Date() };
      if (!opts.silent) toast.success(t('purchaseOrders.orderUpdated'));
    } else {
      saved = {
        id: `po-${Date.now()}`,
        purchaseNumber: generatePONumber(),
        supplierId: formSupplierId,
        branchId: activeBranchId ?? '1',
        purchaseDate: new Date(),
        paymentTermsDays,
        items,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        payments: [],
        status,
        notes: formNotes,
        createdBy: currentUser?.id || '1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      addPurchase(saved);
      if (!opts.silent) toast.success(t('purchaseOrders.orderCreated'));
    }
    resetForm();
    return saved;
  };

  // Combined: place the order AND open WhatsApp with the message pre-filled.
  const handleSaveAndShare = (status: PurchaseStatus) => {
    const saved = handleSavePO(status, { silent: true });
    if (!saved) return;
    toast.success(`${saved.purchaseNumber} placed — opening WhatsApp`);
    // Defer slightly so the toast renders before the new window grabs focus
    setTimeout(() => handleSendWhatsApp(saved), 50);
  };

  // ─── Receive PO (GRN) ────────────────────────────────
  const handleReceivePO = () => {
    if (!selectedPO) return;

    const incomplete = receiveItems.some(i => !i.batchNumber || !i.expiryDate || i.purchasePrice <= 0 || i.mrp <= 0);
    if (incomplete) {
      toast.error('Fill batch no., expiry, purchase price and MRP for all items');
      return;
    }

    // Convert each line's user-typed price (in the chosen pack unit) into a
    // per-base-unit number that we store on the Batch + PurchaseItem.
    const recvBaseRows = receiveItems.map((item) => {
      const mult = getMultiplier(item.medicineId, item.priceUnitKey);
      const pricePerBase = mult > 0 ? item.purchasePrice / mult : item.purchasePrice;
      return { item, pricePerBase };
    });

    let anyReceived = false;
    recvBaseRows.forEach(({ item, pricePerBase }) => {
      if (item.receivedQty <= 0) return;
      anyReceived = true;
      addBatch({
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        medicineId: item.medicineId,
        batchNumber: item.batchNumber,
        expiryDate: new Date(item.expiryDate),
        manufacturingDate: item.manufactureDate ? new Date(item.manufactureDate) : undefined,
        quantity: item.receivedQty,
        purchasePrice: pricePerBase,
        salePrice: item.salePrice || item.mrp,
        mrp: item.mrp,
        supplierId: selectedPO.supplierId,
        purchaseId: selectedPO.id,
        isActive: true,
        createdAt: new Date(),
      });
    });

    if (!anyReceived) {
      toast.error('No items to receive');
      return;
    }

    const updatedItems: PurchaseItem[] = selectedPO.items.map((orig, idx) => {
      const { item: recv, pricePerBase } = recvBaseRows[idx];
      const lineNet = pricePerBase * recv.receivedQty * (1 - recv.discountPercent / 100);
      const lineTax = lineNet * (recv.taxPercent / 100);
      return {
        ...orig,
        batchNumber: recv.batchNumber,
        expiryDate: new Date(recv.expiryDate),
        purchasePrice: pricePerBase,
        salePrice: recv.salePrice || recv.mrp,
        mrp: recv.mrp,
        discountPercent: recv.discountPercent,
        taxPercent: recv.taxPercent,
        total: lineNet + lineTax,
      };
    });
    const newSubtotal = updatedItems.reduce((s, i) => s + i.total, 0);

    const allFullyReceived = receiveItems.every(i => i.receivedQty >= i.orderedQty);
    const newStatus: PurchaseStatus = allFullyReceived ? 'received' : 'partial';

    // Calendar due date is computed NOW from the payment terms agreed at PO
    // time, anchored on today (the actual goods-received date). This is the
    // industry convention — terms run from delivery, not order.
    const computedDueDate = selectedPO.paymentTermsDays != null
      ? (() => { const d = new Date(); d.setDate(d.getDate() + selectedPO.paymentTermsDays!); return d; })()
      : selectedPO.dueDate;

    const previouslyPaid = selectedPO.paidAmount || 0;
    updatePurchase(selectedPO.id, {
      status: newStatus,
      items: updatedItems,
      subtotal: newSubtotal,
      totalAmount: newSubtotal,
      balanceAmount: Math.max(0, newSubtotal - previouslyPaid),
      supplierInvoiceNumber: supplierInvoiceRef.trim() || selectedPO.supplierInvoiceNumber,
      supplierInvoiceImageUrl: supplierInvoiceImage || selectedPO.supplierInvoiceImageUrl,
      dueDate: computedDueDate,
      notes: selectedPO.notes,
    });

    // M3 — per-delivery invoice record. The legacy single-invoice fields stay
    // set above for back-compat; PurchaseInvoice is the new multi-row source of
    // truth for partial deliveries that each carry their own bill.
    if (supplierInvoiceRef.trim()) {
      const receivedSubtotalThisDelivery = receiveItems.reduce((s, r) => {
        const mult = r.priceUnitKey === 'master'
          ? (medicines.find((m) => m.id === r.medicineId)?.units?.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')))?.multiplier ?? 1)
          : r.priceUnitKey === 'sub'
            ? (medicines.find((m) => m.id === r.medicineId)?.units?.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')))?.multiplier ?? 1)
            : 1;
        const recv = Math.max(0, r.receivedQty);
        return s + recv * (r.purchasePrice / mult);
      }, 0);
      addPurchaseInvoice({
        id: `pi-${Date.now()}`,
        purchaseId: selectedPO.id,
        supplierInvoiceNumber: supplierInvoiceRef.trim(),
        imageUrl: supplierInvoiceImage || undefined,
        totalAmount: Number(receivedSubtotalThisDelivery.toFixed(2)),
        receivedAt: new Date(),
        createdBy: currentUser?.id ?? 'system',
        createdAt: new Date(),
      });
    }

    toast.success(
      newStatus === 'received'
        ? t('purchaseOrders.orderReceived')
        : 'Partial GRN recorded — items still pending'
    );
    setShowReceiveDialog(false);
    setSelectedPO(null);
    setSupplierInvoiceRef('');
    setSupplierInvoiceImage('');
  };

  // ─── Dialog openers ──────────────────────────────────
  const openEditDialog = (po: Purchase) => {
    setSelectedPO(po);
    setEditMode(true);
    setFormSupplierId(po.supplierId);
    setFormNotes(po.notes || '');
    setFormPaymentTermsDays(po.paymentTermsDays != null ? String(po.paymentTermsDays) : '');
    setFormItems(
      po.items.map(i => ({
        medicineId: i.medicineId,
        quantity: i.quantity,
        unitKey: 'base' as FormItem['unitKey'], // stored items are already in base units
      }))
    );
    setShowCreateDialog(true);
  };

  const openReceiveDialog = (po: Purchase) => {
    setSelectedPO(po);
    setSupplierInvoiceRef(po.supplierInvoiceNumber || '');
    setSupplierInvoiceImage(po.supplierInvoiceImageUrl || '');
    const defaultMargin = settings.defaultMarginPercent ?? 15;
    setReceiveItems(
      po.items.map(i => {
        const batches = useInventoryStore.getState().batches
          .filter(b => b.medicineId === i.medicineId && b.isActive)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const recent = batches[0];
        const med = medicines.find((m) => m.id === i.medicineId);
        const units = med?.units ?? [];
        const masterUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
        const subUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
        // Default to the biggest pack — that's how suppliers usually bill.
        const priceUnitKey: ReceiveItem['priceUnitKey'] = masterUnit ? 'master' : subUnit ? 'sub' : 'base';
        const mult = priceUnitKey === 'master' ? (masterUnit?.multiplier ?? 1)
          : priceUnitKey === 'sub' ? (subUnit?.multiplier ?? 1) : 1;
        const priorPerBase = i.purchasePrice || recent?.purchasePrice || 0;
        return {
          medicineId: i.medicineId,
          orderedQty: i.quantity,
          receivedQty: i.quantity,
          batchNumber: '',
          expiryDate: '',
          // Scale stored per-base price up to the pack unit shown
          purchasePrice: +(priorPerBase * mult).toFixed(2),
          priceUnitKey,
          salePrice: recent?.salePrice || 0,
          mrp: recent?.mrp || 0,
          marginPercent: defaultMargin,
          discountPercent: i.discountPercent || 0,
          taxPercent: i.taxPercent ?? 0,
        };
      })
    );
    setShowReceiveDialog(true);
  };

  // ─── Status badge ────────────────────────────────────
  const statusBadge = (status: PurchaseStatus, overdue = false, closedPartial = false) => {
    if (overdue && status !== 'received' && status !== 'cancelled') {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    // A partial PO that was closed shows as Partial + Received together.
    if (status === 'received' && closedPartial) {
      return (
        <div className="flex gap-1">
          <Badge variant="warning">Partial</Badge>
          <Badge variant="success">{t('purchaseOrders.received')}</Badge>
        </div>
      );
    }
    const map: Record<PurchaseStatus, { variant: string; label: string }> = {
      draft: { variant: 'secondary', label: t('purchaseOrders.draft') },
      ordered: { variant: 'default', label: t('purchaseOrders.ordered') },
      partial: { variant: 'warning', label: 'Partial GRN' },
      received: { variant: 'success', label: t('purchaseOrders.received') },
      cancelled: { variant: 'destructive', label: t('purchaseOrders.cancelled') },
    };
    const c = map[status] ?? map.draft;
    return <Badge variant={c.variant as any}>{c.label}</Badge>;
  };

  // ─── Receive totals ───────────────────────────────────
  const receiveTotals = receiveItems.reduce(
    (acc, item) => {
      // Convert the typed price (per pack) to per-base before totaling.
      const mult = getMultiplier(item.medicineId, item.priceUnitKey);
      const perBase = mult > 0 ? item.purchasePrice / mult : item.purchasePrice;
      const gross = perBase * item.receivedQty;
      const disc = (gross * item.discountPercent) / 100;
      const net = gross - disc;
      const tax = (net * item.taxPercent) / 100;
      acc.gross += gross;
      acc.discount += disc;
      acc.tax += tax;
      acc.net += net + tax;
      return acc;
    },
    { gross: 0, discount: 0, tax: 0, net: 0 }
  );


  // ─── Render ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className={cn(
              'text-2xl font-bold',
              settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
            )}
          >
            {t('purchaseOrders.title')}
          </h1>
          <p
            className={cn(
              'text-sm',
              settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            )}
          >
            {t('purchaseOrders.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* M7 — Auto-PO scanner. Owner-only; opens behind a settings flag. */}
          {settings.autoPoEnabled && (currentUser?.role === 'owner' || currentUser?.role === 'manager') && (
            <Button
              variant="outline"
              className="gap-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              onClick={async () => {
                try {
                  const r = await runAutoPo();
                  if (r.draftsCreated === 0) {
                    toast.info(`No drafts created. Evaluated ${r.medicinesEvaluated} medicines${r.skippedNoSupplier > 0 ? ` (${r.skippedNoSupplier} skipped — no primary supplier)` : ''}.`);
                  } else {
                    toast.success(`${r.draftsCreated} draft PO${r.draftsCreated > 1 ? 's' : ''} created. Review and place.`);
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Auto-PO failed');
                }
              }}
              title="Scan low-stock medicines and draft POs grouped by primary supplier"
            >
              <Sparkles className="w-4 h-4" />
              Auto-PO
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={() => { resetLooseForm(); setShowLooseDialog(true); }}
            title="Quick-record a one-off purchase from another pharmacy (no PO needed)"
          >
            <Zap className="w-4 h-4" />
            Loose Purchase
          </Button>
          <Button
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => {
              resetForm();
              setShowCreateDialog(true);
            }}
          >
            <Plus className="w-4 h-4" />
            {t('purchaseOrders.createPO')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('purchaseOrders.totalOrders')}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('purchaseOrders.pendingOrders')}</p>
                <p className="text-2xl font-bold text-amber-500">{stats.pending}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Overdue Payments</p>
                <p className={cn('text-2xl font-bold', stats.overdue > 0 ? 'text-red-500' : 'text-emerald-500')}>
                  {stats.overdue}
                </p>
              </div>
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', stats.overdue > 0 ? 'bg-red-100' : 'bg-emerald-100')}>
                <AlertCircle className={cn('w-5 h-5', stats.overdue > 0 ? 'text-red-600' : 'text-emerald-600')} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('purchaseOrders.totalValue')}</p>
                <p className="text-2xl font-bold">Rs. {stats.totalValue.toLocaleString('en-PK')}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('purchaseOrders.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('purchaseOrders.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('purchaseOrders.allStatuses')}</SelectItem>
            <SelectItem value="draft">{t('purchaseOrders.draft')}</SelectItem>
            <SelectItem value="ordered">{t('purchaseOrders.ordered')}</SelectItem>
            <SelectItem value="partial">Partial GRN</SelectItem>
            <SelectItem value="received">{t('purchaseOrders.received')}</SelectItem>
            <SelectItem value="cancelled">{t('purchaseOrders.cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('purchaseOrders.poNumber')}</TableHead>
                  <TableHead>{t('purchaseOrders.supplier')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>{t('common.items')}</TableHead>
                  <TableHead>{t('purchaseOrders.totalAmount')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                      <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      {t('purchaseOrders.noOrders')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(po => {
                    const overdue = isOverdue(po);
                    return (
                      <TableRow key={po.id} className={overdue ? 'bg-red-50' : ''}>
                        <TableCell>
                          <span className={cn('font-medium', settings.theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                            {po.purchaseNumber}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{po.isLoose ? (po.looseSource || 'Loose source') : getSupplierName(po.supplierId)}</span>
                            {po.isLoose && (
                              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 w-fit mt-0.5">
                                Loose
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{new Date(po.purchaseDate).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {po.dueDate ? (
                            <span className={cn('text-sm', overdue ? 'text-red-600 font-medium' : 'text-gray-600')}>
                              {new Date(po.dueDate).toLocaleDateString()}
                              {overdue && ' ⚠'}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const names = po.items.map((i) => getMedicineName(i.medicineId));
                            const label = names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1} more`;
                            return (
                              <>
                                <p className="font-medium text-gray-900 truncate max-w-[220px]" title={names.join(', ')}>{label || '—'}</p>
                                <span className="text-gray-400 text-xs">
                                  {po.items.length} item{po.items.length === 1 ? '' : 's'} · {po.items.reduce((s, i) => s + i.quantity, 0)} {t('common.quantity').toLowerCase()}
                                </span>
                              </>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="font-medium">
                          Rs. {po.totalAmount.toLocaleString('en-PK')}
                        </TableCell>
                        <TableCell>{statusBadge(po.status, overdue, po.closedPartial)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedPO(po); setShowViewDialog(true); }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600"
                              title="Send via WhatsApp"
                              onClick={() => handleSendWhatsApp(po)}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-600"
                              title="Send via Kynex network (to a connected distributor)"
                              onClick={() => openKynex(po)}
                            >
                              <Share2 className="w-4 h-4" />
                            </Button>
                            {po.status === 'draft' && (
                              <Button variant="ghost" size="sm" onClick={() => openEditDialog(po)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {(po.status === 'ordered' || po.status === 'partial') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-500"
                                title="Receive stock (GRN)"
                                onClick={() => openReceiveDialog(po)}
                              >
                                <PackageCheck className="w-4 h-4" />
                              </Button>
                            )}
                            {po.status === 'partial' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-amber-600"
                                title="Close this order — accept the partial delivery and stop chasing the rest"
                                onClick={() => {
                                  updatePurchase(po.id, { status: 'received', closedPartial: true });
                                  toast.success(`${po.purchaseNumber} closed as partially received`);
                                }}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {po.status !== 'cancelled' && po.balanceAmount > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600"
                                title="Record payment"
                                onClick={() => openPaymentDialog(po)}
                              >
                                <Wallet className="w-4 h-4" />
                              </Button>
                            )}
                            {(po.status === 'draft' || po.status === 'ordered') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500"
                                onClick={() => {
                                  updatePurchase(po.id, { status: 'cancelled' });
                                  toast.success(t('purchaseOrders.orderCancelled'));
                                }}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {(po.status === 'draft' || po.status === 'cancelled') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500"
                                onClick={() => { setSelectedPO(po); setShowDeleteDialog(true); }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ════════ Create / Edit Dialog ════════ */}
      <Dialog open={showCreateDialog} onOpenChange={open => { if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editMode ? t('purchaseOrders.editTitle') : t('purchaseOrders.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {editMode ? t('purchaseOrders.editDesc') : t('purchaseOrders.createDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Supplier + Due date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">{t('purchaseOrders.selectSupplier')} *</Label>
                <Select value={formSupplierId} onValueChange={handleSupplierChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('purchaseOrders.selectSupplier')} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.filter(s => s.isActive).map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.paymentTerms > 0 && (
                          <span className="text-xs text-gray-400 ml-2">({s.paymentTerms}d terms)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formSupplierId && (() => {
                  const sup = getSupplier(formSupplierId);
                  if (!sup) return null;
                  const utilPct = sup.creditLimit > 0 ? Math.round((sup.currentBalance / sup.creditLimit) * 100) : 0;
                  return (
                    <p className={cn('text-xs mt-1', utilPct >= 90 ? 'text-red-500' : 'text-gray-500')}>
                      Outstanding: Rs. {sup.currentBalance.toLocaleString()} / Rs. {sup.creditLimit.toLocaleString()} ({utilPct}%)
                    </p>
                  );
                })()}
              </div>
              <div>
                <Label className="text-sm font-medium">Payment Terms (days)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="e.g. 30"
                  value={formPaymentTermsDays}
                  onChange={e => setFormPaymentTermsDays(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Auto-filled from supplier. Calendar due date is computed when goods arrive.
                </p>
              </div>
            </div>

            {/* Supplier invoice number lives on the GRN (when goods arrive with the
                printed bill), not at PO creation. Removed from this dialog to avoid
                confusing the user — see images attached to the task. */}

            {/* Add item search */}
            <div>
              <Label className="text-sm font-medium">{t('purchaseOrders.addItem')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder={t('purchaseOrders.searchMedicine')}
                  value={medicineSearch}
                  onChange={e => setMedicineSearch(e.target.value)}
                  className="pl-10"
                />
                {searchResults.length > 0 && (
                  <div className={cn(
                    'absolute z-10 w-full mt-1 border rounded-md shadow-lg max-h-60 overflow-y-auto',
                    settings.theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'
                  )}>
                    {/* M3 — when a supplier is picked, group the hits into
                        "Mapped to this distributor" vs "Add new". Selecting
                        from the "Add new" group auto-creates the mapping. */}
                    {formSupplierId ? (
                      <>
                        {searchResultsMapped.length > 0 && (
                          <div className="text-[10px] uppercase tracking-wider text-emerald-700 px-3 pt-2 pb-1">
                            Mapped to {getSupplierName(formSupplierId)}
                          </div>
                        )}
                        {searchResultsMapped.map(med => {
                          const stock = getMedicineStock(med.id);
                          const pending = getMedicinePendingQty(med.id);
                          return (
                            <button
                              key={med.id}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm flex justify-between items-center',
                                settings.theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                              )}
                              onClick={() => handleAddItem(med.id)}
                            >
                              <span>{med.name} <span className="text-xs text-gray-400">({med.genericName})</span></span>
                              <span className="flex gap-2">
                                <span className={cn('text-xs', stock <= med.reorderLevel ? 'text-red-500' : 'text-gray-400')}>
                                  {t('purchaseOrders.currentStock')}: {stock}
                                </span>
                                {pending > 0 && (
                                  <Badge variant="outline" className="text-xs">{t('purchaseOrders.pendingQty', pending)}</Badge>
                                )}
                              </span>
                            </button>
                          );
                        })}
                        {searchResultsUnmapped.length > 0 && (
                          <div className="text-[10px] uppercase tracking-wider text-amber-700 px-3 pt-2 pb-1 border-t mt-1">
                            Add new from {getSupplierName(formSupplierId)}
                          </div>
                        )}
                        {searchResultsUnmapped.map(med => {
                          const stock = getMedicineStock(med.id);
                          return (
                            <button
                              key={med.id}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm flex justify-between items-center',
                                settings.theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                              )}
                              onClick={() => handleAddItem(med.id)}
                            >
                              <span>{med.name} <span className="text-xs text-gray-400">({med.genericName})</span></span>
                              <span className="text-[10px] text-amber-600">+ map</span>
                            </button>
                          );
                        })}
                      </>
                    ) : (
                      searchResults.map(med => {
                        const stock = getMedicineStock(med.id);
                        const pending = getMedicinePendingQty(med.id);
                        return (
                          <button
                            key={med.id}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm flex justify-between items-center',
                              settings.theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                            )}
                            onClick={() => handleAddItem(med.id)}
                          >
                            <span>{med.name} <span className="text-xs text-gray-400">({med.genericName})</span></span>
                            <span className="flex gap-2">
                              <span className={cn('text-xs', stock <= med.reorderLevel ? 'text-red-500' : 'text-gray-400')}>
                                {t('purchaseOrders.currentStock')}: {stock}
                              </span>
                              {pending > 0 && (
                                <Badge variant="outline" className="text-xs">{t('purchaseOrders.pendingQty', pending)}</Badge>
                              )}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Items — qty-only at PO stage. Pricing/tax/discount enter at GRN. */}
            {formItems.length > 0 && (
              <div className="space-y-3">
                {formItems.map((item, idx) => {
                  const med = medicines.find((m) => m.id === item.medicineId);
                  const units = med?.units ?? [];
                  const masterUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
                  const subUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
                  const baseUnit = units[0]?.name ?? med?.unit ?? 'unit';
                  const mult = getMultiplier(item.medicineId, item.unitKey);
                  const baseTotal = item.quantity * mult;
                  const lastPrice = lastPurchasePriceFor(item.medicineId);

                  return (
                    <div key={idx} className="border rounded-lg p-4 bg-white">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{getMedicineName(item.medicineId)}</p>
                          {med && <p className="text-xs text-gray-500">{med.genericName} · {med.strength}</p>}
                        </div>
                        <Button
                          variant="ghost" size="sm"
                          className="text-red-500 h-8 w-8 p-0 shrink-0"
                          onClick={() => handleRemoveItem(idx)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Quantity + unit on its own row so the number stays wide enough */}
                      <div>
                        <Label className="text-xs">Quantity to order</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            type="number" min={1} value={item.quantity}
                            onChange={e => handleUpdateFormItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                            className="h-9 flex-1 min-w-0"
                            placeholder="0"
                          />
                          <Select
                            value={item.unitKey}
                            onValueChange={(v) => handleUpdateFormItem(idx, 'unitKey', v as 'master' | 'sub' | 'base')}
                          >
                            <SelectTrigger className="h-9 w-36 shrink-0"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {masterUnit && <SelectItem value="master">{masterUnit.name}{masterUnit.name?.endsWith('s') ? '' : 'es'}</SelectItem>}
                              {subUnit && <SelectItem value="sub">{subUnit.name}{subUnit.name?.endsWith('s') ? '' : 's'}</SelectItem>}
                              <SelectItem value="base">{baseUnit}{baseUnit.endsWith('s') ? '' : 's'}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs">
                          {mult > 1 && item.quantity > 0 && (
                            <span className="text-blue-700">= {baseTotal.toLocaleString()} {baseUnit}{baseTotal === 1 ? '' : 's'}</span>
                          )}
                          {med && med.reorderQuantity > 0 && item.quantity !== med.reorderQuantity && (
                            <button
                              type="button"
                              className="text-emerald-600 hover:underline"
                              onClick={() => handleUpdateFormItem(idx, 'quantity', med.reorderQuantity)}
                            >
                              Use reorder qty ({med.reorderQuantity})
                            </button>
                          )}
                          {lastPrice && (
                            <span className="text-gray-500">
                              Last paid: Rs. {(lastPrice.price * mult).toFixed(2)} / {getUnitLabel(item.medicineId, item.unitKey)}
                              {lastPrice.date ? ` · ${new Date(lastPrice.date).toLocaleDateString()}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* PO totals — pricing happens at GRN, so no rupee total at this stage */}
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
                  <strong>Total items:</strong> {formItems.length} ·{' '}
                  <strong>Total quantity:</strong>{' '}
                  {formItems.reduce((s, i) => s + i.quantity * getMultiplier(i.medicineId, i.unitKey), 0)} base units.
                  Final amount will be set when goods arrive (GRN).
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <Label className="text-sm font-medium">{t('purchaseOrders.orderNotes')}</Label>
              <Textarea
                placeholder={t('purchaseOrders.notesPlaceholder')}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={resetForm}>{t('common.cancel')}</Button>
            <Button variant="outline" onClick={() => handleSavePO('draft')}>{t('purchaseOrders.saveDraft')}</Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 gap-2"
              onClick={() => handleSavePO('ordered')}
            >
              <Truck className="w-4 h-4" />
              {t('purchaseOrders.placeOrder')}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 gap-2"
              onClick={() => handleSaveAndShare('ordered')}
              title="Place this order and open WhatsApp with the message pre-filled"
            >
              <MessageCircle className="w-4 h-4" />
              Place Order + WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ View Dialog ════════ */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span>{t('purchaseOrders.viewTitle')}</span>
              {selectedPO && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-green-300 text-green-700 hover:bg-green-50 gap-2"
                  onClick={() => handleSendWhatsApp(selectedPO)}
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('purchaseOrders.poNumber')}</p>
                  <p className="font-medium">{selectedPO.purchaseNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('purchaseOrders.supplier')}</p>
                  <p className="font-medium">{getSupplierName(selectedPO.supplierId)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('common.status')}</p>
                  {statusBadge(selectedPO.status, isOverdue(selectedPO), selectedPO.closedPartial)}
                </div>
                <div>
                  <p className="text-sm text-gray-500">Order Date</p>
                  <p className="font-medium">{new Date(selectedPO.purchaseDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className={cn('font-medium', isOverdue(selectedPO) ? 'text-red-600' : '')}>
                    {selectedPO.dueDate ? new Date(selectedPO.dueDate).toLocaleDateString() : '—'}
                  </p>
                </div>
                {(selectedPO.supplierInvoiceNumber || selectedPO.supplierInvoiceImageUrl) && (
                  <div>
                    <p className="text-sm text-gray-500">Supplier Invoice</p>
                    <p className="font-medium">{selectedPO.supplierInvoiceNumber || '—'}</p>
                    {selectedPO.supplierInvoiceImageUrl && (
                      <button
                        type="button"
                        onClick={() => openDataUrlInNewTab(selectedPO.supplierInvoiceImageUrl!, `invoice-${selectedPO.purchaseNumber}`)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1 cursor-pointer"
                      >
                        <FileText className="w-3 h-3" />
                        View scanned invoice
                      </button>
                    )}
                  </div>
                )}
                {selectedPO.notes && (
                  <div>
                    <p className="text-sm text-gray-500">Notes</p>
                    <p className="font-medium text-sm">{selectedPO.notes}</p>
                  </div>
                )}
              </div>

              {/* M3 — multi-invoice list. Each partial delivery records its
                  own supplier invoice number + amount + scan. The legacy
                  single-invoice fields above stay populated for back-compat. */}
              {(() => {
                const list = invoicesForPurchase(selectedPO.id);
                if (list.length === 0) return null;
                const total = list.reduce((s, i) => s + i.totalAmount, 0);
                return (
                  <div className="border rounded-lg p-3 space-y-2 bg-blue-50/30">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Supplier invoices ({list.length})</p>
                      <p className="text-xs text-gray-500">Total billed: Rs. {total.toFixed(2)}</p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Invoice #</TableHead>
                          <TableHead className="text-xs">Received</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs">Scan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-xs font-medium">{inv.supplierInvoiceNumber}</TableCell>
                            <TableCell className="text-xs">{new Date(inv.receivedAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums">Rs. {inv.totalAmount.toFixed(2)}</TableCell>
                            <TableCell>
                              {inv.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() => openDataUrlInNewTab(inv.imageUrl!, `invoice-${inv.supplierInvoiceNumber}`)}
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline cursor-pointer"
                                >
                                  <FileText className="w-3 h-3" /> View
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Purchase Price</TableHead>
                      <TableHead>Disc %</TableHead>
                      <TableHead>Tax %</TableHead>
                      <TableHead>MRP</TableHead>
                      <TableHead>Sale Price</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{getMedicineName(item.medicineId)}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>Rs. {item.purchasePrice.toLocaleString('en-PK')}</TableCell>
                        <TableCell>{item.discountPercent ?? 0}%</TableCell>
                        <TableCell>{item.taxPercent ?? 0}%</TableCell>
                        <TableCell>Rs. {item.mrp.toLocaleString('en-PK')}</TableCell>
                        <TableCell>Rs. {item.salePrice.toLocaleString('en-PK')}</TableCell>
                        <TableCell className="font-medium">Rs. {item.total.toLocaleString('en-PK')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 pt-2 border-t text-sm">
                <span>Subtotal: Rs. {selectedPO.subtotal.toLocaleString('en-PK')}</span>
                <span className="text-emerald-600">Discount: −Rs. {selectedPO.discountAmount.toLocaleString('en-PK')}</span>
                <span>Tax: +Rs. {selectedPO.taxAmount.toLocaleString('en-PK')}</span>
                <span className="text-lg font-bold">Total: Rs. {selectedPO.totalAmount.toLocaleString('en-PK')}</span>
              </div>

              {/* Payments section */}
              <div className="border rounded-lg p-4 bg-slate-50">
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <div>
                    <h4 className="font-semibold text-sm">Payments</h4>
                    <p className="text-xs text-gray-500">Partial or full payments recorded against this PO</p>
                  </div>
                  <div className="flex gap-2">
                    {selectedPO.status !== 'cancelled' && (selectedPO.status === 'received' || selectedPO.status === 'partial') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50 gap-2"
                        onClick={() => {
                          setReturnReason('');
                          setReturnNotes('');
                          setReturnAdjustStock(true);
                          setReturnQtyByMed({});
                          setShowReturnDialog(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Return to Supplier
                      </Button>
                    )}
                    {selectedPO.status !== 'cancelled' && selectedPO.balanceAmount > 0 && (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 gap-2"
                        onClick={() => {
                          setShowViewDialog(false);
                          openPaymentDialog(selectedPO);
                        }}
                      >
                        <Wallet className="w-4 h-4" />
                        Record Payment
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="font-semibold">Rs. {selectedPO.totalAmount.toLocaleString('en-PK')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Paid</p>
                    <p className="font-semibold text-emerald-700">Rs. {(selectedPO.paidAmount || 0).toLocaleString('en-PK')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Balance</p>
                    <p className={cn('font-semibold', selectedPO.balanceAmount > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                      Rs. {selectedPO.balanceAmount.toLocaleString('en-PK')}
                    </p>
                  </div>
                </div>

                {selectedPO.payments && selectedPO.payments.length > 0 ? (
                  <div className="border rounded bg-white overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Proof</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPO.payments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{new Date(p.paidAt).toLocaleDateString()}</TableCell>
                            <TableCell className="capitalize">{p.method.replace('_', ' ')}</TableCell>
                            <TableCell className="text-xs">{p.reference || p.notes || '—'}</TableCell>
                            <TableCell>
                              {p.proofImageUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openDataUrlInNewTab(p.proofImageUrl!, `payment-${p.id}`)}
                                  className="inline-block cursor-pointer"
                                >
                                  {p.proofImageUrl.startsWith('data:image') ? (
                                    <img src={p.proofImageUrl} alt="proof" className="w-8 h-8 object-cover rounded border hover:opacity-80" />
                                  ) : (
                                    <FileText className="w-5 h-5 text-blue-600" />
                                  )}
                                </button>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              Rs. {p.amount.toLocaleString('en-PK')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">No payments recorded yet.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════ Record Payment Dialog ════════ */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {selectedPO && (
                <>
                  {selectedPO.purchaseNumber} — {getSupplierName(selectedPO.supplierId)} ·
                  Balance: <strong>Rs. {selectedPO.balanceAmount.toLocaleString('en-PK')}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedPO && (
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
                    onClick={() => setPaymentAmount(selectedPO.balanceAmount.toFixed(2))}
                  >
                    Full (Rs. {selectedPO.balanceAmount.toLocaleString('en-PK')})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentAmount((selectedPO.balanceAmount / 2).toFixed(2))}
                  >
                    Half
                  </Button>
                </div>
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
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>

              <div>
                <Label>Payment Proof (image / PDF)</Label>
                <input
                  id="payment-proof-file"
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => uploadIntoSetter(e, setPaymentProofImage, 'Proof')}
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
                    onClick={() => document.getElementById('payment-proof-file')?.click()}
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
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 gap-2" onClick={handleRecordPayment}>
              <Wallet className="w-4 h-4" />
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ GRN / Receive Dialog ════════ */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Goods Receipt Note (GRN)</DialogTitle>
            <DialogDescription>
              {selectedPO?.purchaseNumber} — {selectedPO && getSupplierName(selectedPO.supplierId)}
            </DialogDescription>
          </DialogHeader>

          {selectedPO && (
            <div className="space-y-4">
              {/* Supplier invoice reference + scanned invoice upload */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label>Supplier Invoice / DC Number</Label>
                  <Input
                    placeholder="e.g. INV-2024-001 or DC-123"
                    value={supplierInvoiceRef}
                    onChange={e => setSupplierInvoiceRef(e.target.value)}
                  />
                </div>
                <div className="text-sm text-gray-500 pt-5">
                  Ordered: <span className="font-medium">{selectedPO.items.reduce((s, i) => s + i.quantity, 0)} units</span>
                </div>
              </div>

              <div>
                <Label>Upload Supplier Invoice (image / PDF)</Label>
                <input
                  id="grn-invoice-file"
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => uploadIntoSetter(e, setSupplierInvoiceImage, 'Invoice')}
                />
                {supplierInvoiceImage ? (
                  <div className="mt-1 flex items-center gap-2 p-2 border rounded-md bg-emerald-50 border-emerald-200">
                    {supplierInvoiceImage.startsWith('data:image') ? (
                      <button type="button" onClick={() => openDataUrlInNewTab(supplierInvoiceImage, 'supplier-invoice')} className="cursor-pointer">
                        <img src={supplierInvoiceImage} alt="Invoice" className="w-12 h-12 object-cover rounded border" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => openDataUrlInNewTab(supplierInvoiceImage, 'supplier-invoice')} className="w-12 h-12 rounded border bg-white flex items-center justify-center cursor-pointer">
                        <FileText className="w-6 h-6 text-gray-500" />
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800">Invoice attached</p>
                      <p className="text-xs text-emerald-700">Stored with this PO</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => setSupplierInvoiceImage('')}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 gap-2"
                    onClick={() => document.getElementById('grn-invoice-file')?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Attach supplier invoice
                  </Button>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Scan or photograph the supplier's printed bill — kept with the PO for reconciliation.
                </p>
              </div>

              {/* Card per item — no horizontal overflow */}
              <div className="space-y-3">
                {receiveItems.map((item, idx) => {
                  const med = medicines.find((m) => m.id === item.medicineId);
                  const units = med?.units ?? [];
                  const masterUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
                  const subUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
                  const baseUnit = units[0]?.name ?? med?.unit ?? 'unit';
                  const priceMult = getMultiplier(item.medicineId, item.priceUnitKey);
                  const pricePerBase = priceMult > 0 ? item.purchasePrice / priceMult : item.purchasePrice;
                  // Line totals computed at base level: per-base × received qty
                  const gross = pricePerBase * item.receivedQty;
                  const disc = (gross * item.discountPercent) / 100;
                  const net = gross - disc;
                  const tax = (net * item.taxPercent) / 100;
                  const isShort = item.receivedQty < item.orderedQty;
                  const update = (field: keyof ReceiveItem, value: number | string) => {
                    const items = [...receiveItems];
                    (items[idx] as unknown as Record<string, unknown>)[field as string] = value;
                    setReceiveItems(items);
                  };
                  // Recompute MRP whenever purchase price OR margin changes.
                  const applyMargin = (priceInUnit: number, margin: number) => {
                    const perBase = priceMult > 0 ? priceInUnit / priceMult : priceInUnit;
                    return +(perBase * (1 + margin / 100)).toFixed(2);
                  };
                  return (
                    <div key={idx} className={cn('border rounded-lg p-4', isShort ? 'bg-amber-50 border-amber-200' : 'bg-white')}>
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{getMedicineName(item.medicineId)}</p>
                          {med && <p className="text-xs text-gray-500">{med.genericName} · {med.strength}</p>}
                          <p className="text-xs text-gray-500 mt-0.5">Ordered: <strong>{item.orderedQty}</strong></p>
                        </div>
                        {isShort && <Badge className="bg-amber-100 text-amber-800 border-amber-200 shrink-0">Short</Badge>}
                      </div>

                      <div className="mb-3">
                        <Label className="text-xs">Scan pack — auto-fills batch / expiry / MRP</Label>
                        <Input
                          placeholder="Scan GS1 / QR code…"
                          className="h-9 mt-1 font-mono"
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const raw = (e.currentTarget as HTMLInputElement).value;
                            if (!raw.trim()) return;
                            const parsed = parseScannedCode(raw);
                            // Apply all parsed fields in one update (sequential
                            // update() calls would clobber each other).
                            const items = [...receiveItems];
                            const row = { ...items[idx] };
                            if (parsed.batchNumber) row.batchNumber = parsed.batchNumber;
                            if (parsed.expiryDate) row.expiryDate = toDateInputValue(parsed.expiryDate);
                            if (parsed.manufactureDate) row.manufactureDate = toDateInputValue(parsed.manufactureDate);
                            if (parsed.mrp != null) row.mrp = parsed.mrp;
                            items[idx] = row;
                            setReceiveItems(items);
                            (e.currentTarget as HTMLInputElement).value = '';
                            toast.success(parsed.batchNumber ? `Batch ${parsed.batchNumber} filled` : 'Scan parsed');
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Received Qty</Label>
                          <Input
                            type="number" min={0} max={item.orderedQty}
                            value={item.receivedQty}
                            onChange={e => update('receivedQty', parseInt(e.target.value) || 0)}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Batch No. *</Label>
                          <Input
                            placeholder="BT-001"
                            value={item.batchNumber}
                            onChange={e => update('batchNumber', e.target.value)}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Expiry Date *</Label>
                          <Input
                            type="date"
                            value={item.expiryDate}
                            onChange={e => update('expiryDate', e.target.value)}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-3">
                          <Label className="text-xs">Purchase Price * (per chosen unit)</Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              type="number" min={0} step={0.01}
                              value={item.purchasePrice}
                              onChange={e => {
                                const newPrice = parseFloat(e.target.value) || 0;
                                update('purchasePrice', newPrice);
                                // Auto-recompute MRP at the active margin %
                                const newMrp = applyMargin(newPrice, item.marginPercent);
                                update('mrp', newMrp);
                                update('salePrice', newMrp);
                              }}
                              className="h-9 flex-1"
                              placeholder="0.00"
                            />
                            <Select
                              value={item.priceUnitKey}
                              onValueChange={(v) => {
                                const newKey = v as ReceiveItem['priceUnitKey'];
                                // When the unit changes, keep the per-base price stable
                                // by rescaling the typed price.
                                const oldMult = getMultiplier(item.medicineId, item.priceUnitKey);
                                const newMult =
                                  newKey === 'master' ? (masterUnit?.multiplier ?? 1)
                                  : newKey === 'sub' ? (subUnit?.multiplier ?? 1) : 1;
                                const perBase = oldMult > 0 ? item.purchasePrice / oldMult : item.purchasePrice;
                                update('priceUnitKey', newKey);
                                const rescaled = +(perBase * newMult).toFixed(2);
                                update('purchasePrice', rescaled);
                                update('mrp', applyMargin(rescaled, item.marginPercent));
                                update('salePrice', applyMargin(rescaled, item.marginPercent));
                              }}
                            >
                              <SelectTrigger className="h-9 w-32 shrink-0"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {masterUnit && <SelectItem value="master">per {masterUnit.name}</SelectItem>}
                                {subUnit && <SelectItem value="sub">per {subUnit.name}</SelectItem>}
                                <SelectItem value="base">per {baseUnit}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {priceMult > 1 && item.purchasePrice > 0 && (
                            <p className="text-xs text-blue-700 mt-1">
                              = Rs. {pricePerBase.toFixed(2)} per {baseUnit}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Margin %</Label>
                          <Input
                            type="number" min={0} step={0.1}
                            value={item.marginPercent}
                            onChange={e => {
                              const m = parseFloat(e.target.value) || 0;
                              update('marginPercent', m);
                              const newMrp = applyMargin(item.purchasePrice, m);
                              update('mrp', newMrp);
                              update('salePrice', newMrp);
                            }}
                            className="h-9 mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-0.5">Default {settings.defaultMarginPercent ?? 15}%</p>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">MRP / Sale Price * (per {baseUnit})</Label>
                          <Input
                            type="number" min={0} step={0.01}
                            value={item.mrp}
                            onChange={e => {
                              // Manual override breaks the margin link
                              update('mrp', parseFloat(e.target.value) || 0);
                              update('salePrice', parseFloat(e.target.value) || 0);
                            }}
                            className="h-9 mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-0.5">
                            Auto = Rs. {applyMargin(item.purchasePrice, item.marginPercent).toFixed(2)}.
                            Manual edit overrides.
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs">Discount %</Label>
                          <Input
                            type="number" min={0} max={100}
                            value={item.discountPercent}
                            onChange={e => update('discountPercent', parseFloat(e.target.value) || 0)}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Input Tax</Label>
                          <TaxModeSelector
                            value={item.taxPercent}
                            defaultRate={defaultSalesTax}
                            onChange={(v) => update('taxPercent', v)}
                          />
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div className="text-gray-500">
                          Gross Rs. {gross.toFixed(2)} · Disc −Rs. {disc.toFixed(2)} · Tax +Rs. {tax.toFixed(2)}
                        </div>
                        <div className="font-bold text-base text-emerald-700">Rs. {(net + tax).toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}

                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm text-emerald-900">
                    Gross Rs. {receiveTotals.gross.toFixed(2)} · Disc −Rs. {receiveTotals.discount.toFixed(2)} · Tax +Rs. {receiveTotals.tax.toFixed(2)}
                  </div>
                  <div className="text-lg font-bold text-emerald-900">Rs. {receiveTotals.net.toFixed(2)}</div>
                </div>
              </div>

              {receiveItems.some(i => i.receivedQty < i.orderedQty) && (
                <p className="text-sm text-amber-600 bg-amber-50 rounded px-3 py-2">
                  Partial GRN: Some items received less than ordered. PO status will be set to <strong>Partial GRN</strong>.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceiveDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={handleReceivePO}>
              <PackageCheck className="w-4 h-4 mr-2" />
              Post GRN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ Delete Confirmation ════════ */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.delete')}</DialogTitle>
            <DialogDescription>{t('purchaseOrders.deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedPO) {
                  deletePurchase(selectedPO.id);
                  toast.success(t('purchaseOrders.orderDeleted'));
                  setShowDeleteDialog(false);
                  setSelectedPO(null);
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ Loose Purchase ════════ */}
      <Dialog open={showLooseDialog} onOpenChange={(open) => { if (!open) resetLooseForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              Loose Purchase
            </DialogTitle>
            <DialogDescription>
              One-step record for an urgent off-supplier buy (cash, no PO). Stock is added immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Medicine search */}
            <div>
              <Label className="text-sm font-medium">Medicine *</Label>
              {looseMedicineId ? (
                <div className="mt-1 flex items-center gap-2 p-2 border rounded-md bg-emerald-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{getMedicineName(looseMedicineId)}</p>
                    <p className="text-xs text-gray-500">
                      {medicines.find((m) => m.id === looseMedicineId)?.genericName} · {medicines.find((m) => m.id === looseMedicineId)?.strength}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setLooseMedicineId(''); setLooseMedicineSearch(''); }}>
                    <XCircle className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search medicine by name…"
                    value={looseMedicineSearch}
                    onChange={(e) => setLooseMedicineSearch(e.target.value)}
                    className="pl-10"
                  />
                  {looseMedicineSearch.length > 1 && (
                    <div className={cn(
                      'absolute z-10 w-full mt-1 border rounded-md shadow-lg max-h-48 overflow-y-auto',
                      settings.theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'
                    )}>
                      {medicines
                        .filter((m) => m.isActive && (m.name.toLowerCase().includes(looseMedicineSearch.toLowerCase()) || m.genericName.toLowerCase().includes(looseMedicineSearch.toLowerCase())))
                        .slice(0, 8)
                        .map((m) => (
                          <button
                            key={m.id}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm',
                              settings.theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                            )}
                            onClick={() => {
                              setLooseMedicineId(m.id);
                              setLooseMedicineSearch('');
                              const units = m.units ?? [];
                              const hasSub = units.find((u) => !u.isBaseUnit);
                              setLooseUnitKey(hasSub ? 'sub' : 'base');
                            }}
                          >
                            <span className="font-medium">{m.name}</span>
                            <span className="text-xs text-gray-400 ml-2">{m.genericName} · {m.strength}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Qty + unit */}
            <div>
              <Label className="text-sm font-medium">Quantity *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  min={1}
                  value={looseQty}
                  onChange={(e) => setLooseQty(e.target.value)}
                  className="flex-1"
                />
                {looseMedicineId && (() => {
                  const med = medicines.find((m) => m.id === looseMedicineId);
                  const units = med?.units ?? [];
                  const masterUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
                  const subUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
                  const baseUnit = units[0]?.name ?? med?.unit ?? 'unit';
                  return (
                    <Select value={looseUnitKey} onValueChange={(v) => setLooseUnitKey(v as 'master' | 'sub' | 'base')}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {masterUnit && <SelectItem value="master">{masterUnit.name}</SelectItem>}
                        {subUnit && <SelectItem value="sub">{subUnit.name}</SelectItem>}
                        <SelectItem value="base">{baseUnit}</SelectItem>
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>
            </div>

            {/* Price + MRP */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Price paid (per unit chosen) *</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={loosePrice}
                  onChange={(e) => {
                    setLoosePrice(e.target.value);
                    // Auto-default MRP at the configured margin, per base unit
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v) && looseMedicineId) {
                      const mult = getMultiplier(looseMedicineId, looseUnitKey);
                      const perBase = mult > 0 ? v / mult : v;
                      const margin = settings.defaultMarginPercent ?? 15;
                      setLooseMrp((perBase * (1 + margin / 100)).toFixed(2));
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">MRP / Sale Price (per base) *</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={looseMrp}
                  onChange={(e) => setLooseMrp(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-0.5">Auto = price + {settings.defaultMarginPercent ?? 15}% margin</p>
              </div>
            </div>

            {/* Source */}
            <div>
              <Label className="text-sm font-medium">Bought From (source) *</Label>
              <Input
                placeholder="e.g. Khan Pharmacy, Adjacent Medical Store"
                value={looseSource}
                onChange={(e) => setLooseSource(e.target.value)}
              />
            </div>

            {/* Batch + expiry (optional) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Batch No.</Label>
                <Input
                  placeholder="Optional — auto-generated if blank"
                  value={looseBatchNumber}
                  onChange={(e) => setLooseBatchNumber(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Expiry</Label>
                <Input
                  type="date"
                  value={looseExpiry}
                  onChange={(e) => setLooseExpiry(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-0.5">Defaults to 1 year out if blank</p>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                rows={2}
                placeholder="Optional"
                value={looseNotes}
                onChange={(e) => setLooseNotes(e.target.value)}
              />
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <strong>About loose purchases:</strong> tagged separately from regular POs. No supplier
              credit balance impact; treated as cash. Visible in reports filtered by "Loose Purchase".
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetLooseForm}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 gap-2" onClick={handleRecordLoose}>
              <Zap className="w-4 h-4" />
              Record Loose Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ M3 — Purchase Return Dialog ════════ */}
      {/* Send stock back to distributor with per-medicine qty + reason. Optional
          flag to also reduce on-shelf batch quantity (otherwise it's a "record
          only" return where the supplier rejected and stock stays put). */}
      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" />
              Return items to {selectedPO ? getSupplierName(selectedPO.supplierId) : ''}
            </DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4">
              <p className="text-xs text-gray-600">
                Enter how many units of each item to return. Quantities are in base units (tablet, ml, etc.).
              </p>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Return qty</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.items.map((it) => {
                      const med = medicines.find((m) => m.id === it.medicineId);
                      const qty = returnQtyByMed[it.medicineId] ?? 0;
                      const subtotal = qty * (it.purchasePrice ?? 0);
                      return (
                        <TableRow key={it.medicineId}>
                          <TableCell className="text-sm">
                            <div className="font-medium">{med?.name || it.medicineId}</div>
                            {med?.strength && <div className="text-xs text-gray-500">{med.strength}</div>}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{it.quantity}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={it.quantity}
                              value={qty || ''}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(it.quantity, parseInt(e.target.value || '0', 10) || 0));
                                setReturnQtyByMed((prev) => ({ ...prev, [it.medicineId]: v }));
                              }}
                              className="h-8 w-24 text-right text-sm tabular-nums ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            Rs. {subtotal.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
                  <Select value={returnReason} onValueChange={setReturnReason}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Pick a reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="damaged">Damaged on arrival</SelectItem>
                      <SelectItem value="expired">Expired / near-expiry</SelectItem>
                      <SelectItem value="wrong_item">Wrong item shipped</SelectItem>
                      <SelectItem value="excess">Excess / over-shipped</SelectItem>
                      <SelectItem value="quality">Quality issue</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input
                    placeholder="Optional context for accounting"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="adjust-stock"
                  checked={returnAdjustStock}
                  onCheckedChange={(v: boolean | 'indeterminate') => setReturnAdjustStock(v === true)}
                />
                <Label htmlFor="adjust-stock" className="text-sm">
                  Also reduce shelf stock now
                  <span className="text-xs text-gray-500 ml-2">(uncheck if the supplier hasn't accepted the return yet)</span>
                </Label>
              </div>

              <div className="rounded-md border bg-gray-50 p-3 text-sm flex items-center justify-between">
                <span className="text-gray-600">Total return value</span>
                <span className="font-bold tabular-nums">
                  Rs. {(() => {
                    return selectedPO.items
                      .reduce((s, it) => s + (returnQtyByMed[it.medicineId] ?? 0) * (it.purchasePrice ?? 0), 0)
                      .toFixed(2);
                  })()}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnDialog(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!selectedPO) return;
                if (!returnReason) { toast.error('Pick a reason for the return'); return; }
                const items = selectedPO.items
                  .filter((it) => (returnQtyByMed[it.medicineId] ?? 0) > 0)
                  .map((it) => {
                    const qty = returnQtyByMed[it.medicineId];
                    const total = qty * (it.purchasePrice ?? 0);
                    // Pick the most recent active batch of this medicine from
                    // this PO as the receiving batch. Falls back to any active
                    // batch if no PO-tagged batch is found.
                    const batches = useInventoryStore.getState().batches.filter(
                      (b) => b.medicineId === it.medicineId && b.isActive,
                    );
                    const fromPo = batches.find((b) => b.purchaseId === selectedPO.id) ?? batches[0];
                    return {
                      medicineId: it.medicineId,
                      medicineName: medicines.find((m) => m.id === it.medicineId)?.name,
                      batchId: fromPo?.id ?? '',
                      batchNumber: fromPo?.batchNumber,
                      quantity: qty,
                      unitPrice: it.purchasePrice ?? 0,
                      total,
                      reason: returnReason,
                    };
                  });
                if (items.length === 0) { toast.error('Set a return quantity for at least one item'); return; }
                const totalAmount = items.reduce((s, x) => s + x.total, 0);
                addPurchaseReturn({
                  id: `pr-${Date.now()}`,
                  returnNumber: `RET-${String(Date.now()).slice(-6)}`,
                  supplierId: selectedPO.supplierId,
                  purchaseId: selectedPO.id,
                  returnDate: new Date(),
                  items,
                  totalAmount,
                  reason: returnReason,
                  stockAdjusted: returnAdjustStock,
                  status: 'posted',
                  notes: returnNotes || undefined,
                  createdBy: currentUser?.id ?? 'system',
                  createdAt: new Date(),
                });
                toast.success(`Return posted (Rs. ${totalAmount.toFixed(2)})`);
                setShowReturnDialog(false);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Post Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send-via-Kynex distributor picker */}
      {kynexPO && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setKynexPO(null)}>
          <div className="bg-white rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold flex items-center gap-2"><Share2 className="w-4 h-4 text-emerald-600" /> Send {kynexPO.purchaseNumber} via Kynex</h3>
            <p className="text-sm text-gray-500">Pick a connected distributor. They receive this order in their Kynex network — no WhatsApp needed.</p>
            <div className="space-y-2">
              {netDistributors.map((c) => (
                <button key={c.id} onClick={() => sendKynexOrder(c.id)}
                  className="w-full flex items-center justify-between border rounded-lg p-3 text-left hover:bg-emerald-50">
                  <div>
                    <p className="font-medium">{c.peer?.name}</p>
                    <p className="text-xs text-gray-400">@{c.peer?.handle} · {c.peer?.businessType}</p>
                  </div>
                  <Truck className="w-4 h-4 text-emerald-600" />
                </button>
              ))}
            </div>
            <div className="flex justify-end"><Button variant="outline" onClick={() => setKynexPO(null)}>Cancel</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
