import { useState, useRef, useEffect, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSettingsStore, usePOSStore, useInventoryStore, useCustomerStore, useSalesStore, useAuditLogStore, useAuthStore, usePrescriptionStore, useSupplierStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  User,
  Receipt,
  CreditCard,
  Smartphone,
  Banknote,
  Printer,
  X,
  Check,
  ArrowLeft,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  Zap,
  Mail,
  Save,
  UserCheck,
  Building,
  FileText,
  RefreshCw,
  Clock,
  Pill,
  Upload,
  Image as ImageIcon,
  MapPin,
  Lock,
  Store,
} from 'lucide-react';
import { BranchStockDialog } from '@/components/BranchStockDialog';
import { FindAlternativesDialog } from '@/components/FindAlternativesDialog';
import { parseScannedCode, gtinMatches } from '@/lib/gs1';
import { toast } from 'sonner';
import type { CartItem } from '@/store';
import type { Medicine, Batch, Customer, Prescription, MedicineUnit } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { processUploadedFile } from '@/lib/image';
import { createUploadSession, getUploadSession, uploadPageUrl, verifySalesPin, type VerifiedSalesperson, fetchOpenShift, openShift, closeShift, fetchCatalogByGtin, searchDrap } from '@/lib/backend';
import { getVisiblePrices, resolveTradePrice, paymentMethodDefault } from '@/lib/posPricing';
import { sellableUnits, defaultSellableUnit } from '@/lib/posUnits';
import type { ShiftSession } from '@/types';

// ─── FBR pre-flight check — warns when cart items lack FBR fields ──────────

function FbrPreflightWarning({
  cart,
  medicines,
  fbrEnabled,
}: {
  cart: { medicineId: string; medicineName: string }[];
  medicines: { id: string; name: string; hsCode?: string; fbrUom?: string; fbrSaleType?: string }[];
  fbrEnabled: boolean;
}) {
  if (!fbrEnabled || cart.length === 0) return null;
  const medMap = new Map(medicines.map((m) => [m.id, m]));
  const missing = cart
    .map((c) => {
      const m = medMap.get(c.medicineId);
      const missingFields: string[] = [];
      if (!m?.hsCode) missingFields.push('HS code');
      if (!m?.fbrUom) missingFields.push('FBR UoM');
      if (!m?.fbrSaleType) missingFields.push('sale type');
      if (missingFields.length === 0) return null;
      return { name: c.medicineName, missing: missingFields };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-amber-900">
            {missing.length} medicine{missing.length > 1 ? 's' : ''} not FBR-ready
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            This sale will save, but FBR submission will fail until these are configured:
          </p>
          <ul className="mt-2 text-xs text-amber-900 space-y-0.5 max-h-24 overflow-auto pr-1">
            {missing.slice(0, 5).map((m) => (
              <li key={m.name} className="flex items-baseline gap-1">
                <span className="font-mono text-[10px]">•</span>
                <span className="font-semibold">{m.name}</span>
                <span className="text-amber-700">— missing {m.missing.join(', ')}</span>
              </li>
            ))}
            {missing.length > 5 && (
              <li className="italic text-amber-700">…and {missing.length - 5} more</li>
            )}
          </ul>
          <a href="/medicines" className="text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700 mt-2 inline-block">
            Configure medicines →
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── FBR receipt block (§6 — Digital Invoicing logo + QR Version 2.0, 25×25) ──

function FbrReceiptBlock({
  status,
  invoiceNumber,
  qrPayload,
}: {
  status: string;
  invoiceNumber?: string;
  qrPayload?: string;
}) {
  const submitted = status === 'submitted' && invoiceNumber;
  const statusColor =
    status === 'submitted' ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
    : status === 'failed' ? 'bg-rose-100 text-rose-700 border-rose-300'
    : 'bg-amber-100 text-amber-700 border-amber-300';

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3" id="fbr-receipt-block">
      <div className="flex items-center justify-between mb-2">
        <div className="text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">FBR</p>
          <p className="text-[9px] text-gray-500 -mt-0.5">Digital Invoicing System</p>
        </div>
        <Badge className={cn('text-[10px] uppercase font-semibold', statusColor)}>
          {status}
        </Badge>
      </div>
      {submitted ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-left">
            <p className="text-[10px] text-gray-500 uppercase font-semibold">FBR Invoice No.</p>
            <p className="font-mono text-[11px] text-gray-900 break-all">{invoiceNumber}</p>
          </div>
          {/* §6 spec: 1.0 × 1.0 inch, Version 2.0 (25×25). On screen ~96px ≈ 1in. */}
          <div className="rounded bg-white p-1 ring-1 ring-gray-200 flex-shrink-0">
            <QRCodeSVG
              value={qrPayload || invoiceNumber || ''}
              size={96}
              level="M"
              includeMargin={false}
            />
          </div>
        </div>
      ) : status === 'failed' ? (
        <p className="text-[11px] text-rose-700 text-left">
          Submission failed. Background retry queued — view details in Sales → FBR Submissions.
        </p>
      ) : (
        <p className="text-[11px] text-amber-700 text-left">
          Submission pending FBR response (this usually takes 1–3 seconds).
        </p>
      )}
    </div>
  );
}

export function POS() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { medicines, batches, searchMedicines, getFEFOBatchesByMedicine, getFEFOSuggestedBatch, getMedicineStock } = useInventoryStore();
  const { suppliers } = useSupplierStore();
  // Tiny lookup so we can show a distributor name on each search row rather than
  // a raw supplier id. Built once per render — cheap, and avoids cluttering the
  // store with another derived helper.
  const supplierNameById = (id?: string): string => (id ? suppliers.find((s) => s.id === id)?.name ?? '' : '');
  const { searchCustomers, addCustomer } = useCustomerStore();
  const { cart, addToCart, removeFromCart, updateQuantity, updateCartItem, clearCart, subtotal, taxAmount, total, discountAmount, grossProfit } = usePOSStore();
  const { currentUser, branches: authBranches, activeBranchId } = useAuthStore();
  // The branch this terminal is operating in — drives which branch sales/shifts
  // are recorded against. Falls back to the user's home branch, then the first.
  const posBranchId = activeBranchId || authBranches[0]?.id || currentUser?.branchId || '1';
  const posBranchName = authBranches.find((b) => b.id === posBranchId)?.name;
  const canSeeProfit = settings.showProfitOnPOS && (currentUser?.role === 'owner' || (currentUser?.role === 'manager' && settings.managerCanSeeProfit));
  // M6 — Shift session state. Only loaded / required when the owner has turned
  // on shiftCloseEnabled in Settings. Falls back to a no-op gate otherwise.
  const [currentShift, setCurrentShift] = useState<ShiftSession | null>(null);
  const [showOpenShiftDialog, setShowOpenShiftDialog] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('0');
  const [showCloseShiftDialog, setShowCloseShiftDialog] = useState(false);
  const [closingCashInput, setClosingCashInput] = useState('0');
  const [shiftSubmitting, setShiftSubmitting] = useState(false);

  useEffect(() => {
    if (!settings.shiftCloseEnabled) { setCurrentShift(null); return; }
    fetchOpenShift().then(setCurrentShift).catch(() => {/* tolerate offline */});
  }, [settings.shiftCloseEnabled]);

  const handleOpenShift = async () => {
    const branchId = posBranchId;
    setShiftSubmitting(true);
    try {
      const opened = await openShift({ branchId, openingCash: parseFloat(openingCashInput) || 0 });
      setCurrentShift(opened);
      setShowOpenShiftDialog(false);
      toast.success(`Shift opened — opening cash Rs. ${opened.openingCash.toFixed(2)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open shift');
    } finally {
      setShiftSubmitting(false);
    }
  };
  const handleCloseShift = async () => {
    if (!currentShift) return;
    setShiftSubmitting(true);
    try {
      const closed = await closeShift(currentShift.id, { closingCash: parseFloat(closingCashInput) || 0 });
      setCurrentShift(null);
      setShowCloseShiftDialog(false);
      const diff = closed.summary?.difference;
      const drawerNote = diff == null || Math.abs(diff) < 0.005
        ? 'drawer balanced'
        : `drawer ${diff > 0 ? 'over' : 'short'} Rs. ${Math.abs(diff).toFixed(2)}`;
      toast.success(`Shift closed — sales Rs. ${closed.salesTotal.toFixed(2)}, ${drawerNote}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close shift');
    } finally {
      setShiftSubmitting(false);
    }
  };
  // M2 — which prices is this role allowed to see on the POS? Independent of
  // canSeeProfit (which gates the profit chip + grand-total profit). Settings
  // → POS price visibility configures the role allow-lists.
  const visiblePrices = getVisiblePrices(settings, currentUser?.role);
  const { addSale } = useSalesStore();
  const { addLog } = useAuditLogStore();
  const { prescriptions, addPrescription, linkSale, getByCustomer } = usePrescriptionStore();
  const { t, isRTL } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [availableBatches, setAvailableBatches] = useState<Batch[]>([]);
  const [fefoSuggestedBatchId, setFefoSuggestedBatchId] = useState<string | null>(null);
  const [pendingOverrideBatch, setPendingOverrideBatch] = useState<Batch | null>(null);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [batchHighlightIdx, setBatchHighlightIdx] = useState(0);
  // Item 6 — keyboard quick-add (manual selection): pick unit, then quantity.
  const [quickAdd, setQuickAdd] = useState(false);
  const [addStage, setAddStage] = useState<'unit' | 'qty'>('qty');
  const [quickUnitIdx, setQuickUnitIdx] = useState(0);
  const [quickQty, setQuickQty] = useState('1');
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const quickUnits = selectedMedicine ? sellableUnits(selectedMedicine) : [];
  // Focus the quantity field when the quick-add reaches the qty stage.
  useEffect(() => {
    if (showBatchDialog && quickAdd && addStage === 'qty') {
      const id = setTimeout(() => { qtyInputRef.current?.focus(); qtyInputRef.current?.select(); }, 50);
      return () => clearTimeout(id);
    }
  }, [showBatchDialog, quickAdd, addStage]);

  // Item 8 — when cashier collection is disabled, every sale is paid at the
  // terminal: force "seller" so printing marks it paid immediately.
  const cashierCollectionOn = settings.cashierCollectionEnabled !== false;
  useEffect(() => {
    if (!cashierCollectionOn) setPaidBy('seller');
  }, [cashierCollectionOn]);
  const [showFefoOverrideDialog, setShowFefoOverrideDialog] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false);
  const [customerPrescriptions, setCustomerPrescriptions] = useState<Prescription[]>([]);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'jazzcash' | 'easypaisa' | 'bank_transfer'>('cash');
  // M2 — payment-method fee/discount auto-applied. Positive = surcharge on top
  // of the goods total (e.g. card processing fee), negative = discount off the
  // goods total (e.g. cash incentive). The sale's totalAmount stays at the
  // pre-adjustment cart total (so tax/FBR math is unchanged); the adjustment
  // shows up in paidAmount and balanceAmount and is noted on the sale.
  // ── Loyalty redemption (pharmacy-configurable; applied as a bill discount) ──
  const loyPointValue = settings.loyaltyPointValue ?? 2;
  const loyMinRedeem = settings.loyaltyMinRedeemPoints ?? 50;
  const loyMaxPct = settings.loyaltyMaxRedeemPercent ?? 50;
  const loyRupeesPerPoint = settings.loyaltyRupeesPerPoint ?? 100;
  const custPoints = currentCustomer?.loyaltyPoints ?? 0;
  const loyaltyEligible = !!settings.enableLoyalty && !!currentCustomer && loyPointValue > 0 && custPoints >= loyMinRedeem;
  // Cap redemption at maxPct of the bill (and at the customer's balance).
  const maxRedeemPoints = loyaltyEligible ? Math.max(0, Math.min(custPoints, Math.floor((total * loyMaxPct / 100) / loyPointValue))) : 0;
  const redeemPoints = loyaltyEligible ? Math.max(0, Math.min(pointsToRedeem, maxRedeemPoints)) : 0;
  const loyaltyDiscount = Number((redeemPoints * loyPointValue).toFixed(2));
  const totalAfterLoyalty = Math.max(0, Number((total - loyaltyDiscount).toFixed(2)));
  // Points earned on what the customer actually pays (after the loyalty discount).
  const loyaltyPointsEarnedVal = settings.enableLoyalty && currentCustomer && loyRupeesPerPoint > 0
    ? Math.floor(totalAfterLoyalty / loyRupeesPerPoint) : 0;

  // Reset any pending redemption when the attached customer changes/clears.
  useEffect(() => { setPointsToRedeem(0); }, [currentCustomer?.id]);

  const paymentMethodCfg = paymentMethodDefault(settings, paymentMethod);
  const paymentAdjustment = Number(((totalAfterLoyalty * paymentMethodCfg.feePercent) / 100 - (totalAfterLoyalty * paymentMethodCfg.discountPercent) / 100).toFixed(2));
  const payable = Math.max(0, Number((totalAfterLoyalty + paymentAdjustment).toFixed(2)));
  const [cashReceived, setCashReceived] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', cnic: '' });
  const [isPrescription, setIsPrescription] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const [prescriptionImageUrl, setPrescriptionImageUrl] = useState<string>('');
  const [showRxImagePreview, setShowRxImagePreview] = useState(false);
  const rxFileInputRef = useRef<HTMLInputElement>(null);
  // Phone-upload QR state
  const [showPhoneUploadDialog, setShowPhoneUploadDialog] = useState(false);
  const [phoneUploadUrl, setPhoneUploadUrl] = useState<string>('');
  const [phoneUploadStatus, setPhoneUploadStatus] = useState<'idle' | 'waiting' | 'received'>('idle');
  const phoneUploadTokenRef = useRef<string | null>(null);
  const phoneUploadPollRef = useRef<number | null>(null);
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [paidBy, setPaidBy] = useState<'cashier' | 'seller'>('cashier');
  // Search dropdown keyboard navigation
  const [searchHighlightIdx, setSearchHighlightIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showBranchStock, setShowBranchStock] = useState(false);
  const searchResultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef('');
  const scannerLastKeyAtRef = useRef(0);
  const scannedUnitRef = useRef<MedicineUnit | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  // Snapshot of the just-completed sale so the receipt can still print after
  // the cart is auto-cleared for the next customer.
  const lastSaleRef = useRef<{
    invoiceNumber: string;
    total: number;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    items: CartItem[];
    customerName?: string;
    customerPhone?: string;
    customerCnic?: string;
    isPrescription: boolean;
    doctorName?: string;
    prescriptionNumber?: string;
    prescriptionImageUrl?: string;
    fbrStatus?: 'not_integrated' | 'pending' | 'submitted' | 'failed';
    fbrInvoiceNumber?: string;
    fbrBarcode?: string;
    fbrQrPayload?: string;
    salesPersonName?: string;
    pendingCollection?: boolean;
    loyaltyDiscount?: number;
    loyaltyPointsRedeemed?: number;
    loyaltyPointsEarned?: number;
    loyaltyBalance?: number;
  } | null>(null);

  // Salesperson PIN gate — at receipt time the cashier types their username +
  // 4-digit PIN; the sale is recorded under their name even though the POS
  // terminal stays logged in as the pharmacy/owner.
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const pinValueRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Start a phone-upload handshake. POS creates a server-side session, embeds
  // its URL in a QR code, and polls until the phone uploads the image.
  const startPhoneUpload = async () => {
    try {
      const session = await createUploadSession('prescription');
      phoneUploadTokenRef.current = session.token;
      setPhoneUploadUrl(uploadPageUrl(session.token));
      setPhoneUploadStatus('waiting');
      setShowPhoneUploadDialog(true);

      // Poll every 1.5s. Stop on success, error, or when the dialog closes.
      const interval = window.setInterval(async () => {
        const token = phoneUploadTokenRef.current;
        if (!token) return;
        try {
          const state = await getUploadSession(token);
          if (state.status === 'ready' && state.dataUrl) {
            setPrescriptionImageUrl(state.dataUrl);
            setPhoneUploadStatus('received');
            toast.success('Prescription received from phone');
            stopPhoneUpload();
            setTimeout(() => setShowPhoneUploadDialog(false), 1200);
          }
        } catch {
          // Session expired or network glitch — let the user retry manually.
          stopPhoneUpload();
        }
      }, 1500);
      phoneUploadPollRef.current = interval;
    } catch (err) {
      toast.error((err as Error).message || 'Could not start phone upload');
    }
  };

  const stopPhoneUpload = () => {
    if (phoneUploadPollRef.current != null) {
      clearInterval(phoneUploadPollRef.current);
      phoneUploadPollRef.current = null;
    }
  };

  // Stop polling on unmount to avoid leaks.
  useEffect(() => () => stopPhoneUpload(), []);

  // Read uploaded prescription file → compressed data URL.
  // Stored inline on the sale/prescription record so legal authorities (FBR / DRAP /
  // narcotics inspectors) can review the scanned Rx for controlled drugs.
  const handlePrescriptionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const r = await processUploadedFile(file);
      setPrescriptionImageUrl(r.dataUrl);
      if (r.compressed && r.beforeBytes > r.afterBytes) {
        const ratio = Math.round((1 - r.afterBytes / r.beforeBytes) * 100);
        if (ratio > 0) {
          toast.success(`Prescription compressed (${(r.beforeBytes / 1024).toFixed(0)} KB → ${(r.afterBytes / 1024).toFixed(0)} KB, ${ratio}% smaller)`);
        }
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to process prescription file');
    }
  };

  // Handle medicine search — fire on the first character so a typed "p" shows
  // every medicine starting with "p", "pa" narrows further, etc. The store ranks
  // prefix matches above substring matches so the most relevant items lead.
  //
  // setSearchQuery stays a high-priority update (input must feel instant);
  // the heavier dropdown re-render is wrapped in startTransition so rapid
  // typing can interrupt stale renders.
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setSearchHighlightIdx(0);
    const trimmed = query.trim();
    // A scanned GS1/FBR pack code landed in the search box (scanner typed into
    // the focused input). Don't name-search the raw string — it gets resolved by
    // GTIN on Enter (handleSearchKeyDown).
    if (parseScannedCode(query).isStructured) {
      startTransition(() => setSearchResults([]));
      return;
    }
    if (trimmed.length >= 1) {
      const results = searchMedicines(trimmed).slice(0, 50);
      startTransition(() => setSearchResults(results));
    } else {
      startTransition(() => setSearchResults([]));
    }
  };

  // Arrow-key navigation inside the medicine search dropdown.
  // Enter selects the highlighted result; Esc clears the dropdown.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Scanned pack code (GS1/FBR) typed into the search box → resolve by GTIN
    // and auto-select the scanned batch, just like the barcode scanner path.
    if (e.key === 'Enter' || e.key === 'Tab') {
      const val = (e.currentTarget as HTMLInputElement).value;
      const parsed = parseScannedCode(val);
      if (parsed.isStructured && parsed.gtin) {
        e.preventDefault();
        handleBarcodeLookup(val);
        setSearchQuery('');
        setSearchResults([]);
        return;
      }
    }
    // Empty search bar + items in cart → Enter proceeds to payment (item 2).
    if (e.key === 'Enter' && searchResults.length === 0 && (e.currentTarget as HTMLInputElement).value.trim() === '' && cart.length > 0) {
      e.preventDefault();
      handlePayClick();
      return;
    }
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(searchHighlightIdx + 1, searchResults.length - 1);
      setSearchHighlightIdx(next);
      searchResultRefs.current[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(searchHighlightIdx - 1, 0);
      setSearchHighlightIdx(next);
      searchResultRefs.current[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const pick = searchResults[searchHighlightIdx] || searchResults[0];
      if (pick) {
        e.preventDefault();
        handleMedicineSelect(pick);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchResults([]);
      setSearchQuery('');
    }
  };

  // Handle medicine selection — FEFO sorted
  const handleMedicineSelect = (medicine: Medicine, scannedUnit?: MedicineUnit | null, preferBatchNumber?: string) => {
    scannedUnitRef.current = scannedUnit ?? null;
    setSelectedMedicine(medicine);
    const fefo = getFEFOBatchesByMedicine(medicine.id);
    setAvailableBatches(fefo);
    const suggested = getFEFOSuggestedBatch(medicine.id);
    setFefoSuggestedBatchId(suggested?.id ?? null);
    // Default highlight to the FEFO-suggested batch so a quick Enter picks it.
    const suggestedIdx = suggested ? fefo.findIndex((b) => b.id === suggested.id) : 0;

    // Scanned-batch path: the pack carries its own batch number — sell that
    // exact batch (the physical pack the customer is buying), overriding FEFO.
    if (preferBatchNumber) {
      const scanned = fefo.find((b) => b.batchNumber.toLowerCase() === preferBatchNumber.toLowerCase());
      if (scanned) {
        const scannedIdx = fefo.findIndex((b) => b.id === scanned.id);
        setBatchHighlightIdx(scannedIdx >= 0 ? scannedIdx : 0);
        if (daysUntilExpiry(scanned.expiryDate) < 0) {
          toast.warning(`Scanned batch ${scanned.batchNumber} is expired`);
        }
        const fefoMode = settings.fefoMode ?? 'suggest';
        if (fefoMode === 'strict' && suggested && scanned.id !== suggested.id) {
          // Strict FEFO: don't auto-sell a non-FEFO batch — let the cashier decide.
          toast.warning(`Scanned batch ${scanned.batchNumber} differs from FEFO — please review`);
          setShowBatchDialog(true);
        } else {
          handleAddFromBatch(scanned, 1, true, medicine); // override → add this exact batch
        }
        setSearchQuery('');
        setSearchResults([]);
        return;
      }
      toast(`Batch ${preferBatchNumber} not in stock — using FEFO`);
    }

    setBatchHighlightIdx(suggestedIdx >= 0 ? suggestedIdx : 0);
    const manual = !scannedUnit; // search-driven pick (vs barcode scan)
    if (manual && fefo.length >= 1) {
      // Item 6 — keyboard quick-add: choose unit (if >1), then quantity, Enter adds.
      const units = sellableUnits(medicine);
      setQuickAdd(true);
      setQuickUnitIdx(0);
      setQuickQty('1');
      setAddStage(units.length > 1 ? 'unit' : 'qty');
      setShowBatchDialog(true);
    } else {
      // Scanned path keeps the fast flow: single batch adds directly.
      setQuickAdd(false);
      if (fefo.length === 1 && suggested) {
        handleAddFromBatch(suggested, 1, false, medicine);
      } else if (fefo.length > 1) {
        setShowBatchDialog(true);
      }
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  // Compute expiry days helper
  const daysUntilExpiry = (expiry: Date) =>
    Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);

  // Expiry badge color
  const expiryBadge = (expiry: Date) => {
    const d = daysUntilExpiry(expiry);
    if (d <= 30) return { label: `${d}d ⚠`, cls: 'bg-red-100 text-red-700 border-red-300' };
    if (d <= 60) return { label: `${d}d`, cls: 'bg-amber-100 text-amber-700 border-amber-300' };
    if (d <= 90) return { label: `${d}d`, cls: 'bg-blue-100 text-blue-700 border-blue-300' };
    return { label: `${d}d`, cls: 'bg-green-100 text-green-700 border-green-300' };
  };

  // Add to cart from batch — with FEFO override detection
  const handleAddFromBatch = (batch: Batch, quantity: number, isOverride = false, medicineOverride?: Medicine, unitOverride?: MedicineUnit | null) => {
    const medicine = medicineOverride ?? selectedMedicine;
    if (!medicine) return;

    const fefoMode = settings.fefoMode ?? 'suggest';
    const isFefoOverride = fefoSuggestedBatchId !== null && batch.id !== fefoSuggestedBatchId;

    // In strict mode: block override entirely
    if (fefoMode === 'strict' && isFefoOverride) {
      return;
    }

    // In suggest mode: show confirmation dialog before override
    if (fefoMode === 'suggest' && isFefoOverride && !isOverride) {
      setPendingOverrideBatch(batch);
      setShowFefoOverrideDialog(true);
      return;
    }

    // Cap to available stock — addToCart merges into any existing line for this
    // batch, so the cart total can't be allowed to exceed batch.quantity.
    const alreadyInCart = cart.find((c) => c.batchId === batch.id && c.medicineId === medicine.id)?.quantity ?? 0;
    const available = batch.quantity - alreadyInCart;
    if (available <= 0) {
      toast.warning(t('pos.lowStockWarning', medicine.name, batch.quantity.toString(), quantity.toString()));
      return;
    }
    if (quantity > available) {
      toast.warning(t('pos.stockCapped', medicine.name, available.toString()));
      quantity = available;
    }

    const defaultTaxRule = settings.taxRules.find((rule) => rule.isActive && rule.isDefault)
      ?? settings.taxRules.find((rule) => rule.isActive);
    const scannedUnit = scannedUnitRef.current?.isActive ? scannedUnitRef.current : null;
    // Unit precedence: explicit quick-add choice > scanned pack > loose-aware
    // default (pack unit when loose sale is off, else the base unit).
    const baseUnit = unitOverride
      ?? scannedUnit
      ?? (medicine.allowLooseSale === false
        ? defaultSellableUnit(medicine)
        : (medicine.units?.find((unit) => unit.isBaseUnit && unit.isActive)
          ?? medicine.units?.find((unit) => unit.isActive)));
    const unitPrice = baseUnit?.salePrice ?? batch.salePrice;
    const unitMultiplier = baseUnit?.multiplier ?? 1;
    const purchasePrice = batch.purchasePrice * unitMultiplier;
    const profit = (unitPrice - purchasePrice) * quantity;
    const cartItem: CartItem = {
      medicineId: medicine.id,
      medicineName: medicine.name,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity,
      unitName: baseUnit?.abbreviation || baseUnit?.name || medicine.unit,
      unitMultiplier,
      unitPrice,
      purchasePrice,
      lineProfit: profit,
      mrp: batch.mrp,
      discountPercent: 0,
      taxRuleId: defaultTaxRule?.id,
      taxPercent: defaultTaxRule?.ratePercent ?? settings.defaultTaxRate,
      total: quantity * unitPrice,
      fefoOverride: isFefoOverride,
    };

    addToCart(cartItem);

    // Audit FEFO override
    if (isFefoOverride) {
      addLog({
        id: Date.now().toString(),
        userId: '1',
        userName: 'Current User',
        action: 'FEFO_OVERRIDE',
        module: 'pos',
        details: `Batch ${batch.batchNumber} selected instead of FEFO batch for ${medicine.name}`,
        createdAt: new Date(),
      });
    }

    setShowBatchDialog(false);
    setShowFefoOverrideDialog(false);
    setPendingOverrideBatch(null);
    setSelectedMedicine(null);
    scannedUnitRef.current = null;
    setAvailableBatches([]);
    setFefoSuggestedBatchId(null);
    // Defer so the dialog's focus-return (Radix) doesn't steal it back — this
    // puts the cursor back in the search bar to add the next medicine.
    setTimeout(() => searchInputRef.current?.focus(), 80);
  };

  // Handle barcode scan
  const handleBarcodeScan = () => {
    setBarcodeInput('');
    setShowBarcodeDialog(true);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  const normalizeBarcode = (value: string) => value.trim().replace(/\s+/g, '');

  const findExactBarcodeMatch = (barcode: string): { medicine: Medicine; unit?: MedicineUnit } | null => {
    const code = normalizeBarcode(barcode);
    if (!code) return null;

    for (const medicine of medicines) {
      if (medicine.barcode && normalizeBarcode(medicine.barcode) === code) {
        return { medicine };
      }
      const unit = medicine.units?.find((item) => item.barcode && normalizeBarcode(item.barcode) === code);
      if (unit) return { medicine, unit };
    }

    return null;
  };

  // Find a medicine by GTIN (the constant product id in a GS1 code), tolerant of
  // EAN-13 ↔ GTIN-14, on the medicine barcode or any unit barcode.
  const findByGtin = (gtin: string): { medicine: Medicine; unit?: MedicineUnit } | null => {
    for (const medicine of medicines) {
      if (gtinMatches(gtin, medicine.barcode)) return { medicine };
      const unit = medicine.units?.find((u) => gtinMatches(gtin, u.barcode));
      if (unit) return { medicine, unit };
    }
    return null;
  };

  // Process barcode lookup
  const handleBarcodeLookup = (barcode: string) => {
    const code = normalizeBarcode(barcode);
    if (!code) return;

    const closeBarcodeDialog = () => {
      setShowBarcodeDialog(false);
      setBarcodeInput('');
      scannerBufferRef.current = '';
    };

    // 1) Exact match on the stored barcode (plain EAN-13) — unchanged.
    const exactMatch = findExactBarcodeMatch(code);
    if (exactMatch) {
      handleMedicineSelect(exactMatch.medicine, exactMatch.unit);
      closeBarcodeDialog();
      return;
    }

    // 2) Structured GS1 / FBR pack code → identify the medicine by its GTIN and
    //    prefer the exact batch printed on the pack. Pass the RAW scan (keeps the
    //    GS separator) to the parser.
    const parsed = parseScannedCode(barcode);
    if (parsed.isStructured && parsed.gtin) {
      const hit = findByGtin(parsed.gtin);
      if (hit) {
        handleMedicineSelect(hit.medicine, hit.unit, parsed.batchNumber);
        closeBarcodeDialog();
        return;
      }
      // Recognised pack but not in THIS pharmacy's catalog. Check the shared
      // central catalog so the cashier knows it can be added quickly.
      closeBarcodeDialog();
      const gtin = parsed.gtin;
      const productName = parsed.productName;
      void fetchCatalogByGtin(gtin)
        .then(async (found) => {
          if (found) {
            toast(`${found.brand} is in the shared catalog — add it in Medicines to sell`, { duration: 6000 });
            return;
          }
          // Not catalogued — try to identify it on DRAP by the pack's printed name.
          if (productName) {
            const cands = await searchDrap({ brand: productName }).catch(() => []);
            if (cands.length) {
              toast(`Found on DRAP: ${cands[0].brand} — add it in Medicines → Find product`, { duration: 7000 });
              return;
            }
          }
          toast.error(`Scanned pack not found (GTIN ${gtin}). Add it from Medicines → Find product.`);
        })
        .catch(() => toast.error(`Scanned pack not in your catalog (GTIN ${gtin})`));
      return;
    }

    const results = searchMedicines(code);
    if (results.length === 1) {
      handleMedicineSelect(results[0]);
      setShowBarcodeDialog(false);
      setBarcodeInput('');
    } else if (results.length > 1) {
      setSearchQuery(barcode.trim());
      setSearchResults(results);
      setShowBarcodeDialog(false);
      setBarcodeInput('');
    } else {
      toast.error(t('pos.noMedicineFound'));
      setBarcodeInput('');
    }
  };

  useEffect(() => {
    const handleScannerKey = (event: KeyboardEvent) => {
      if (showBarcodeDialog || showPaymentDialog || showCustomerDialog || showBatchDialog || showReceiptDialog) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;

      const now = Date.now();
      if (now - scannerLastKeyAtRef.current > 80) scannerBufferRef.current = '';
      scannerLastKeyAtRef.current = now;

      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = scannerBufferRef.current;
        scannerBufferRef.current = '';
        if (code.length >= 4) {
          event.preventDefault();
          handleBarcodeLookup(code);
        }
        return;
      }

      if (event.key.length === 1) {
        scannerBufferRef.current += event.key;
      }
    };

    window.addEventListener('keydown', handleScannerKey);
    return () => window.removeEventListener('keydown', handleScannerKey);
  }, [showBarcodeDialog, showPaymentDialog, showCustomerDialog, showBatchDialog, showReceiptDialog, medicines]);

  // Global POS hotkeys — Ctrl-based so they don't clash with browser/OS
  // function keys (F1/F5/F11 etc. are reserved on most setups).
  //
  //   Ctrl+M  →  focus medicine search
  //   Ctrl+B  →  new sale (clears cart + resets customer/Rx state)
  //               NOTE: Ctrl+N opens a new browser window in Chrome/Edge and
  //               cannot be intercepted by JS for security reasons, so we use
  //               Ctrl+B (free in all major browsers) instead.
  //   Ctrl+P  →  proceed to payment   (or print receipt if receipt dialog open)
  //   Ctrl+S  →  save & print later (pending sale)
  //   Ctrl+R  →  go to Reports page
  useEffect(() => {
    const handleHotkey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) {
        // Plain Enter inside the receipt dialog still prints the receipt.
        if (showReceiptDialog && e.key === 'Enter') {
          e.preventDefault();
          handlePrintReceipt();
        }
        return;
      }
      const key = e.key.toLowerCase();

      // Ctrl+P — print receipt when receipt dialog open; otherwise proceed
      // to payment if there's something in the cart.
      if (key === 'p') {
        e.preventDefault();
        if (showReceiptDialog) { handlePrintReceipt(); return; }
        if (cart.length > 0 && !showPaymentDialog) setShowPaymentDialog(true);
        return;
      }

      if (key === 'm') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (key === 'b') {
        e.preventDefault();
        if (showReceiptDialog) {
          handleCompleteSale();
          return;
        }
        // Reset everything for the next sale.
        clearCart();
        setCurrentCustomer(null);
        setIsPrescription(false);
        setDoctorName('');
        setPrescriptionNumber('');
        setPrescriptionImageUrl('');
        searchInputRef.current?.focus();
        return;
      }

      if (key === 's') {
        e.preventDefault();
        if (cart.length > 0 && !showPaymentDialog && !showReceiptDialog) {
          handleSaveAndPrintLater();
        }
        return;
      }

      if (key === 'r') {
        e.preventDefault();
        navigate('/reports');
        return;
      }
    };
    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length, showPaymentDialog, showReceiptDialog]);

  // Save & Print Later — saves as pending sale
  const handleSaveAndPrintLater = () => {
    if (cart.length === 0) return;

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const sale = {
      id: Date.now().toString(),
      invoiceNumber,
      branchId: posBranchId,
      customerName: currentCustomer?.name,
      customerPhone: currentCustomer?.phone,
      customerCnic: currentCustomer?.cnic,
      doctorName: isPrescription ? doctorName : undefined,
      prescriptionNumber: isPrescription ? prescriptionNumber : undefined,
      prescriptionImageUrl: isPrescription ? prescriptionImageUrl || undefined : undefined,
      saleDate: new Date(),
      items: cart.map((item, i) => ({
        id: Date.now().toString() + i,
        medicineId: item.medicineId,
        batchId: item.batchId,
        batchNumber: item.batchNumber,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: item.purchasePrice,
        profit: item.lineProfit,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
        total: item.total,
        expiryDate: item.expiryDate,
        fefoOverride: item.fefoOverride,
      })),
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount: total,
      paidAmount: 0,
      balanceAmount: total,
      paymentMethods: [],
      status: 'pending' as const,
      isPrescription,
      notes: 'Saved for later — pending payment & print',
      createdBy: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addSale(sale);

    addLog({
      id: Date.now().toString(),
      userId: '1',
      userName: 'Current User',
      action: 'SAVE_LATER',
      module: 'pos',
      details: `Sale ${invoiceNumber} saved for later — Rs. ${total.toFixed(2)}`,
      createdAt: new Date(),
    });

    toast.success(t('pos.invoiceSaved', invoiceNumber));

    clearCart();
    setCurrentCustomer(null);
    setIsPrescription(false);
    setDoctorName('');
    setPrescriptionNumber('');
    setPrescriptionImageUrl('');
    searchInputRef.current?.focus();
  };

  const getFbrReceiptInfo = () => {
    const profile = settings.fbrProfile;
    const enabled = Boolean(settings.fbrIntegration && profile?.enabled);
    if (!enabled) return { fbrStatus: 'not_integrated' as const };

    return {
      fbrStatus: 'pending' as const,
      fbrInvoiceNumber: undefined,
      fbrBarcode: undefined,
      fbrQrPayload: undefined,
      fbrResponse: {
        message: 'FBR profile is enabled. Sale is ready for live submission once FBR credentials/endpoints are active.',
        mode: profile.mode,
        integrationType: profile.integrationType,
      },
    };
  };

  // Print receipt
  const handlePrintReceipt = () => {
    const printContent = receiptRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      toast.error(t('pos.allowPopups'));
      return;
    }
    // Refresh FBR fields from the sales store — the server-side PRAL submission
    // happens after sale completion, so the snapshot captured at sale time has
    // empty fbrInvoiceNumber/fbrQrPayload. Merge in whatever the store has now
    // so a real FBR QR makes it onto paper.
    if (lastSaleRef.current?.invoiceNumber) {
      const latest = useSalesStore.getState().sales.find(
        (s) => s.invoiceNumber === lastSaleRef.current!.invoiceNumber
      );
      if (latest) {
        lastSaleRef.current = {
          ...lastSaleRef.current,
          fbrStatus: (latest.fbrStatus as typeof lastSaleRef.current.fbrStatus) ?? lastSaleRef.current.fbrStatus,
          fbrInvoiceNumber: latest.fbrInvoiceNumber ?? lastSaleRef.current.fbrInvoiceNumber,
          fbrBarcode: latest.fbrBarcode ?? lastSaleRef.current.fbrBarcode,
          fbrQrPayload: latest.fbrQrPayload ?? lastSaleRef.current.fbrQrPayload,
        };
      }
    }
    const inv = lastSaleRef.current;
    // §6 — Print FBR logo + QR with Version 2.0 (25×25), 1.0 × 1.0 inch.
    // At 96 DPI that's ~96px; at 203 DPI thermal printer ~200px. We render at 200px.
    let fbrBlock = '';
    if (inv?.fbrStatus && inv.fbrStatus !== 'not_integrated') {
      const qrValue = inv.fbrQrPayload || inv.fbrInvoiceNumber || '';
      const qrSvg = qrValue
        ? renderToStaticMarkup(<QRCodeSVG value={qrValue} size={200} level="M" includeMargin={false} />)
        : '';
      fbrBlock = `
        <div class="line"></div>
        <div class="fbr-block">
          <div class="fbr-header">
            <div class="fbr-logo">
              <div class="fbr-logo-label">FBR</div>
              <div class="fbr-logo-sub">DIGITAL INVOICING</div>
            </div>
            <div class="fbr-status">${inv.fbrStatus.toUpperCase()}</div>
          </div>
          ${inv.fbrInvoiceNumber ? `<div class="fbr-invno">FBR Invoice: <b>${inv.fbrInvoiceNumber}</b></div>` : ''}
          ${qrSvg ? `<div class="fbr-qr">${qrSvg}</div>` : ''}
          <p class="fbr-foot">Verify this invoice on FBR portal using the QR code above.</p>
        </div>
      `;
    }
    // Item 8 — pending (collect-at-cashier) sales get a QR linking to the collect
    // page so the cashier scans the receipt → opens the invoice + payment picker.
    let collectBlock = '';
    if (inv?.pendingCollection && inv.invoiceNumber) {
      const collectUrl = `${window.location.origin}/collect/${encodeURIComponent(inv.invoiceNumber)}`;
      const collectQr = renderToStaticMarkup(<QRCodeSVG value={collectUrl} size={160} level="M" includeMargin={false} />);
      collectBlock = `
        <div class="line"></div>
        <div style="text-align:center">
          <p style="font-size:12px;font-weight:bold;margin:2px 0">PAYMENT PENDING — PAY AT CASHIER</p>
          <div style="display:inline-block">${collectQr}</div>
          <p style="font-size:10px;margin:2px 0">Scan to collect · ${inv.invoiceNumber}</p>
        </div>
      `;
    }
    // Read everything from the post-sale snapshot so the receipt prints
    // correctly even after the cart has been cleared for the next customer.
    const snap = lastSaleRef.current;
    const snapItems = snap?.items ?? cart;
    const snapSubtotal = snap?.subtotal ?? subtotal;
    const snapDiscount = snap?.discountAmount ?? discountAmount;
    const snapTax = snap?.taxAmount ?? taxAmount;
    const snapTotal = snap?.total ?? total;
    const snapLoyaltyDiscount = snap?.loyaltyDiscount ?? 0;
    const snapLoyaltyEarned = snap?.loyaltyPointsEarned ?? 0;
    const snapLoyaltyRedeemed = snap?.loyaltyPointsRedeemed ?? 0;
    const snapLoyaltyBalance = snap?.loyaltyBalance;
    const snapCustomerName = snap?.customerName ?? currentCustomer?.name;
    const snapCustomerPhone = snap?.customerPhone ?? currentCustomer?.phone;
    const snapCustomerCnic = snap?.customerCnic ?? currentCustomer?.cnic;
    const snapIsRx = snap?.isPrescription ?? isPrescription;
    const snapDoctor = snap?.doctorName ?? doctorName;
    const snapRxNo = snap?.prescriptionNumber ?? prescriptionNumber;

    // Effective tax rate for display on receipt (weighted across line items).
    const taxableBase = snapSubtotal - snapDiscount;
    const effectiveTaxRate = taxableBase > 0 ? (snapTax / taxableBase) * 100 : 0;
    const taxLabel = snapTax > 0
      ? `${t('common.tax')} (${effectiveTaxRate.toFixed(1)}%)`
      : t('common.tax');

    // Escape user-provided strings so they can't break the print HTML.
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const logoBlock = (settings.printCompanyLogo && settings.companyLogoUrl)
      ? `<div class="logo-wrap"><img src="${esc(settings.companyLogoUrl)}" class="logo" alt="logo" /></div>`
      : '';

    const ntnLine = settings.companyNtn || settings.fbrProfile?.sellerNTNCNIC
      ? `<p class="meta">${t('pos.ntn')}: ${esc(settings.companyNtn || settings.fbrProfile?.sellerNTNCNIC || '')}</p>`
      : '';
    const gstLine = settings.companyGst
      ? `<p class="meta">GST: ${esc(settings.companyGst)}</p>`
      : '';

    const customerBlock = snapCustomerName
      ? `<div class="row"><span>${t('pos.customer')}:</span><span>${esc(snapCustomerName)}</span></div>` +
        (snapCustomerPhone ? `<div class="row"><span>${t('common.phone')}:</span><span>${esc(snapCustomerPhone)}</span></div>` : '') +
        (snapCustomerCnic ? `<div class="row"><span>CNIC:</span><span>${esc(snapCustomerCnic)}</span></div>` : '')
      : '';

    // Single attribution line: the salesman who entered their PIN to make and
    // print this sale (their performance is measured off this). Falls back to
    // the logged-in account only if no salesperson was captured.
    const printedByName = snap?.salesPersonName || currentUser?.name;
    const printedByBlock = printedByName
      ? `<div class="row"><span>${t('pos.printedBy')}:</span><span>${esc(printedByName)}</span></div>`
      : '';

    const rxBlock = snapIsRx
      ? `${snapDoctor ? `<div class="row"><span>${t('pos.doctorName')}:</span><span>${esc(snapDoctor)}</span></div>` : ''}` +
        `${snapRxNo ? `<div class="row"><span>${t('pos.prescriptionNo')}:</span><span>${esc(snapRxNo)}</span></div>` : ''}`
      : '';

    printWindow.document.write(`
      <html>
      <head>
        <title>${t('pos.receipt')} - ${inv?.invoiceNumber ?? ''}</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 16px; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; gap: 8px; }
          .item { margin: 4px 0; }
          .item-meta { font-size: 11px; color: #333; }
          h2 { margin: 4px 0; font-size: 16px; }
          .meta { margin: 2px 0; font-size: 11px; }
          .logo-wrap { display: flex; justify-content: center; margin: 4px 0 6px; }
          .logo { max-height: 60px; max-width: 200px; object-fit: contain; }
          .fbr-block { text-align: center; margin: 8px 0; }
          .fbr-header { display: flex; align-items: center; justify-content: space-between; padding: 0 4px; margin-bottom: 6px; }
          .fbr-logo { text-align: left; }
          .fbr-logo-label { font-weight: 900; font-size: 14px; letter-spacing: 1px; color: #0a6b3a; line-height: 1; }
          .fbr-logo-sub { font-size: 8px; font-weight: bold; letter-spacing: 1px; color: #444; margin-top: 2px; }
          .fbr-status { font-size: 9px; font-weight: bold; letter-spacing: 1px; border: 1px solid #000; padding: 2px 6px; border-radius: 2px; }
          .fbr-invno { font-size: 11px; margin-bottom: 6px; }
          .fbr-qr { display: flex; justify-content: center; padding: 6px 0; }
          .fbr-qr svg { width: 1in; height: 1in; }
          .fbr-foot { font-size: 8px; color: #555; margin: 4px 0 0; }
        </style>
      </head>
      <body>
        <div class="center">
          ${logoBlock}
          <h2>${esc(settings.companyName || 'Kynex Pharmacloud')}</h2>
          ${settings.companyAddress ? `<p class="meta">${esc(settings.companyAddress)}</p>` : ''}
          ${(settings.companyPhone || settings.companyEmail) ? `<p class="meta">${esc(settings.companyPhone || '')}${settings.companyEmail ? ' | ' + esc(settings.companyEmail) : ''}</p>` : ''}
          ${ntnLine}
          ${gstLine}
        </div>
        <div class="line"></div>
        <div class="row"><span>${t('pos.invoice')}:</span><span class="bold">${inv?.invoiceNumber ?? ''}</span></div>
        <div class="row"><span>${t('pos.dateLabel')}:</span><span>${new Date().toLocaleString()}</span></div>
        ${printedByBlock}
        ${customerBlock}
        ${rxBlock}
        <div class="line"></div>
        ${snapItems.map(item => {
          const unit = item.unitName ? esc(item.unitName) : t('common.units');
          // e.g. "2 strip × Rs. 120.00"
          const lineMeta = `${item.quantity} ${unit} &times; Rs. ${item.unitPrice.toFixed(2)}`
            + (item.discountPercent > 0 ? ` &minus;${item.discountPercent}%` : '');
          return '<div class="item">'
            + '<div class="row bold"><span>' + esc(item.medicineName) + '</span><span>Rs. ' + item.total.toFixed(2) + '</span></div>'
            + '<div class="row item-meta"><span>' + lineMeta + '</span><span></span></div>'
            + '</div>';
        }).join('')}
        <div class="line"></div>
        <div class="row"><span>${t('common.subtotal')}:</span><span>Rs. ${snapSubtotal.toFixed(2)}</span></div>
        ${snapDiscount > 0 ? `<div class="row"><span>${t('common.discount')}:</span><span>-Rs. ${snapDiscount.toFixed(2)}</span></div>` : ''}
        ${snapTax > 0 ? `<div class="row"><span>${esc(taxLabel)}:</span><span>Rs. ${snapTax.toFixed(2)}</span></div>` : ''}
        ${snapLoyaltyDiscount > 0 ? `<div class="row"><span>Loyalty (${snapLoyaltyRedeemed} pts):</span><span>-Rs. ${snapLoyaltyDiscount.toFixed(2)}</span></div>` : ''}
        <div class="line"></div>
        <div class="row bold"><span>${t('pos.grandTotal')}:</span><span>Rs. ${snapTotal.toFixed(2)}</span></div>
        ${snapCustomerName && (snapLoyaltyEarned > 0 || snapLoyaltyRedeemed > 0) ? `<div class="row"><span>Points earned:</span><span>+${snapLoyaltyEarned}${snapLoyaltyBalance != null ? ` (bal ${snapLoyaltyBalance})` : ''}</span></div>` : ''}
        ${collectBlock}
        ${fbrBlock}
        <div class="line"></div>
        <p class="center">${esc(settings.receiptFooterText || t('pos.thankYou'))}</p>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Email receipt
  const handleEmailReceipt = () => {
    const inv = lastSaleRef.current;
    const subject = encodeURIComponent(`${t('pos.receipt')} - ${inv?.invoiceNumber ?? t('pos.invoice')}`);
    const fbrText = inv?.fbrStatus && inv.fbrStatus !== 'not_integrated'
      ? `\nFBR Status: ${inv.fbrStatus}` +
        `${inv.fbrInvoiceNumber ? `\nFBR Invoice: ${inv.fbrInvoiceNumber}` : ''}` +
        `${inv.fbrBarcode ? `\nFBR Barcode: ${inv.fbrBarcode}` : ''}` +
        `${inv.fbrQrPayload ? `\nFBR QR: ${inv.fbrQrPayload}` : ''}`
      : '';
    const body = encodeURIComponent(
      `${t('pos.receipt')} — ${settings.companyName || 'Kynex Pharmacloud'}\n\n` +
      `${t('pos.invoice')}: ${inv?.invoiceNumber ?? ''}\n` +
      `${t('pos.dateLabel')}: ${new Date().toLocaleDateString()}\n` +
      `${currentCustomer ? t('pos.customer') + ': ' + currentCustomer.name + '\n' : ''}` +
      `\n${t('common.items')}:\n` +
      cart.map(item => `  ${item.medicineName} x${item.quantity} — Rs. ${item.total.toFixed(2)}`).join('\n') +
      `\n\n${t('common.subtotal')}: Rs. ${subtotal.toFixed(2)}\n` +
      `${t('common.discount')}: -Rs. ${discountAmount.toFixed(2)}\n` +
      `${t('pos.taxLine')}: Rs. ${taxAmount.toFixed(2)}\n` +
      `${t('pos.grandTotal')}: Rs. ${total.toFixed(2)}${fbrText}\n\n` +
      `${t('pos.thankYou')}`
    );
    const email = currentCustomer?.phone ? '' : '';
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
    toast.success(t('pos.emailOpened'));
  };

  // Customer search
  const handleCustomerSearch = (query: string) => {
    setCustomerSearchQuery(query);
    if (query.length >= 2) {
      const results = searchCustomers(query);
      setCustomerSearchResults(results);
    } else {
      setCustomerSearchResults([]);
    }
  };

  // Select customer
  const handleSelectCustomer = (customer: Customer) => {
    setCurrentCustomer(customer);
    setShowCustomerDialog(false);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    // Load customer's past prescriptions
    const rxList = getByCustomer(customer.id);
    setCustomerPrescriptions(rxList);
    if (rxList.length > 0) {
      toast.info(t('pos.hasPrescriptions', customer.name, rxList.length.toString()), {
        action: {
          label: t('pos.view'),
          onClick: () => setShowPrescriptionDialog(true),
        },
      });
    }
  };

  // Add new customer
  const handleAddCustomer = () => {
    if (newCustomer.name && newCustomer.phone) {
      const customer: Customer = {
        id: Date.now().toString(),
        name: newCustomer.name,
        phone: newCustomer.phone,
        cnic: newCustomer.cnic,
        isActive: true,
        createdAt: new Date(),
        totalPurchases: 0,
        loyaltyPoints: 0,
      };
      addCustomer(customer);
      setCurrentCustomer(customer);
      setShowCustomerDialog(false);
      setNewCustomer({ name: '', phone: '', cnic: '' });
    }
  };

  // Reorder from a saved prescription
  const handleReorderPrescription = (rx: Prescription) => {
    let added = 0;
    for (const item of rx.items) {
      const med = searchMedicines(item.medicineName).find(m => m.id === item.medicineId);
      if (med) {
        const fefo = getFEFOBatchesByMedicine(med.id);
        const suggestedBatch = fefo.length > 0 ? fefo[0] : null;
        if (suggestedBatch && suggestedBatch.quantity >= item.quantity) {
          const defaultTaxRule = settings.taxRules.find((rule) => rule.isActive && rule.isDefault)
            ?? settings.taxRules.find((rule) => rule.isActive);
          const baseUnit = med.units?.find((unit) => unit.isBaseUnit && unit.isActive)
            ?? med.units?.find((unit) => unit.isActive);
          addToCart({
            medicineId: med.id,
            medicineName: med.name,
            batchId: suggestedBatch.id,
            batchNumber: suggestedBatch.batchNumber,
            quantity: item.quantity,
            unitName: baseUnit?.abbreviation || baseUnit?.name || med.unit,
            unitMultiplier: baseUnit?.multiplier ?? 1,
            unitPrice: item.unitPrice,
            purchasePrice: suggestedBatch.purchasePrice * (baseUnit?.multiplier ?? 1),
            mrp: suggestedBatch.mrp,
            discountPercent: 0,
            taxRuleId: defaultTaxRule?.id,
            taxPercent: defaultTaxRule?.ratePercent ?? (Number(med.taxRate) || 0),
            total: item.unitPrice * item.quantity,
            lineProfit: (item.unitPrice - (suggestedBatch.purchasePrice * (baseUnit?.multiplier ?? 1))) * item.quantity,
            expiryDate: suggestedBatch.expiryDate,
          });
          added++;
        } else if (suggestedBatch) {
          toast.warning(`${med.name}: ${t('pos.lowStockWarning', suggestedBatch.quantity.toString(), item.quantity.toString())}`);
        } else {
          toast.warning(`${med.name}: ${t('pos.noStockAvailable')}`);
        }
      } else {
        toast.warning(`${item.medicineName}: ${t('pos.medicineNotFound')}`);
      }
    }
    if (added > 0) {
      setIsPrescription(true);
      setDoctorName(rx.doctorName);
      setPrescriptionNumber(rx.prescriptionNumber || '');
      toast.success(t('pos.itemsAdded', added.toString()));
    }
    setShowPrescriptionDialog(false);
  };

  // Clamp a cart line's quantity to the batch's available stock so the cashier
  // can never sell more than physically exists. Mirrors the server-side guard
  // (decrementStockForSale) so UI and API agree before the sale is POSTed.
  const setCartQuantity = (index: number, requested: number) => {
    const item = cart[index];
    if (!item) { updateQuantity(index, requested); return; }
    const batch = batches.find((b) => b.id === item.batchId);
    const available = batch?.quantity ?? Infinity;
    if (Number.isFinite(available) && requested > available) {
      toast.warning(t('pos.stockCapped', item.medicineName, available.toString()));
      updateQuantity(index, available);
      return;
    }
    updateQuantity(index, requested);
  };

  // Process payment.
  //
  // `salesperson` is the user verified by the PIN dialog. Required when the
  // sale will be marked completed (i.e. paidBy === 'seller') because the
  // backend rejects completed sales without a salesPersonId. When paidBy is
  // 'cashier' the sale is stored as pending and the salesperson is recorded if
  // present, but not required.
  const handleProcessPayment = (salesperson?: VerifiedSalesperson) => {
    if (cart.length === 0) return;

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const fbrReceiptInfo = getFbrReceiptInfo();
    const sale = {
      id: Date.now().toString(),
      invoiceNumber,
      branchId: posBranchId,
      customerName: currentCustomer?.name,
      customerPhone: currentCustomer?.phone,
      customerCnic: currentCustomer?.cnic,
      doctorName: isPrescription ? doctorName : undefined,
      prescriptionNumber: isPrescription ? prescriptionNumber : undefined,
      prescriptionImageUrl: isPrescription ? prescriptionImageUrl || undefined : undefined,
      salesPersonId: salesperson?.userId,
      salesPersonName: salesperson?.name,
      saleDate: new Date(),
      items: cart.map((item, i) => ({
        id: Date.now().toString() + i,
        medicineId: item.medicineId,
        batchId: item.batchId,
        batchNumber: item.batchNumber,
        quantity: item.quantity,
        unitName: item.unitName,
        unitMultiplier: item.unitMultiplier,
        unitPrice: item.unitPrice,
        purchasePrice: item.purchasePrice,
        profit: item.lineProfit,
        discountPercent: item.discountPercent,
        taxRuleId: item.taxRuleId,
        taxPercent: item.taxPercent,
        total: item.total,
        expiryDate: item.expiryDate,
        fefoOverride: item.fefoOverride,
      })),
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount: totalAfterLoyalty,
      customerId: currentCustomer?.id,
      loyaltyPointsRedeemed: redeemPoints,
      loyaltyDiscount,
      loyaltyPointsEarned: loyaltyPointsEarnedVal,
      paidAmount: paidBy === 'cashier' ? 0 : (paymentMethod === 'cash' ? parseFloat(cashReceived) || payable : payable),
      balanceAmount: paidBy === 'cashier' ? totalAfterLoyalty : (paymentMethod === 'cash' ? (parseFloat(cashReceived) || payable) - payable : 0),
      paymentMethods: paidBy === 'cashier' ? [] : [{
        method: paymentMethod,
        amount: payable,
        reference: paymentMethod !== 'cash' ? (paymentReference.trim() || undefined) : undefined,
      }],
      status: paidBy === 'cashier' ? 'pending' as const : 'completed' as const,
      isPrescription,
      notes: paidBy === 'cashier'
        ? 'Collect by Cashier — Pending Payment'
        : paymentAdjustment !== 0
          ? `Collected by Seller — Paid (${paymentMethod} ${paymentAdjustment > 0 ? 'surcharge' : 'discount'} ${paymentAdjustment > 0 ? '+' : ''}Rs. ${paymentAdjustment.toFixed(2)})`
          : 'Collected by Seller — Paid',
      ...fbrReceiptInfo,
      createdBy: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addSale(sale);

    // Loyalty: move the customer's points (deduct redeemed + add earned). The
    // bill (with the redemption discount) is finalised here, so points move now.
    if (currentCustomer && settings.enableLoyalty && (redeemPoints > 0 || loyaltyPointsEarnedVal > 0)) {
      useCustomerStore.getState().updateCustomer(currentCustomer.id, {
        loyaltyPoints: Math.max(0, custPoints - redeemPoints + loyaltyPointsEarnedVal),
        totalPurchases: (currentCustomer.totalPurchases ?? 0) + 1,
      });
    }

    // Snapshot everything the receipt needs BEFORE we wipe the cart for the
    // next customer — otherwise the print template would render an empty bill.
    lastSaleRef.current = {
      invoiceNumber,
      total: totalAfterLoyalty,
      subtotal,
      discountAmount,
      taxAmount,
      items: [...cart],
      customerName: currentCustomer?.name,
      customerPhone: currentCustomer?.phone,
      customerCnic: currentCustomer?.cnic,
      isPrescription,
      doctorName: isPrescription ? doctorName : undefined,
      prescriptionNumber: isPrescription ? prescriptionNumber : undefined,
      prescriptionImageUrl: isPrescription ? prescriptionImageUrl : undefined,
      fbrStatus: fbrReceiptInfo.fbrStatus,
      fbrInvoiceNumber: fbrReceiptInfo.fbrInvoiceNumber,
      fbrBarcode: fbrReceiptInfo.fbrBarcode,
      fbrQrPayload: fbrReceiptInfo.fbrQrPayload,
      salesPersonName: salesperson?.name,
      pendingCollection: paidBy === 'cashier',
      loyaltyDiscount,
      loyaltyPointsRedeemed: redeemPoints,
      loyaltyPointsEarned: loyaltyPointsEarnedVal,
      loyaltyBalance: currentCustomer ? Math.max(0, custPoints - redeemPoints + loyaltyPointsEarnedVal) : undefined,
    };
    setPointsToRedeem(0);

    // Save prescription record if prescription sale with customer
    if (isPrescription && currentCustomer) {
      const prescriptionRecord: Prescription = {
        id: 'rx-' + Date.now().toString(),
        customerId: currentCustomer.id,
        customerName: currentCustomer.name,
        doctorName: doctorName || 'Unknown',
        prescriptionNumber: prescriptionNumber || undefined,
        prescriptionImageUrl: prescriptionImageUrl || undefined,
        items: cart.map((item) => ({
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        saleIds: [sale.id],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      addPrescription(prescriptionRecord);
      toast.success(t('pos.prescriptionSaved', currentCustomer.name));
    }

    // Audit log
    addLog({
      id: Date.now().toString(),
      userId: '1',
      userName: 'Current User',
      action: 'CREATE_SALE',
      module: 'pos',
      details: `Sale ${invoiceNumber} — Rs. ${total.toFixed(2)} — ${cart.length} item(s)`,
      createdAt: new Date(),
    });

    setShowPaymentDialog(false);
    setShowReceiptDialog(true);

    // Auto-clear everything so the next customer is a clean slate. The receipt
    // dialog stays open (it reads from lastSaleRef snapshot, not the live cart).
    clearCart();
    setCurrentCustomer(null);
    setCashReceived('');
    setPaymentReference('');
    setPaidBy('cashier');
    setIsPrescription(false);
    setDoctorName('');
    setPrescriptionNumber('');
    setPrescriptionImageUrl('');

    // Auto-print if enabled
    if (settings.autoPrintReceipt) {
      setTimeout(() => handlePrintReceipt(), 500);
    }
  };

  // Close the receipt dialog and focus the search for the next sale.
  // Cart/customer/Rx have already been reset by handleProcessPayment.
  const handleCompleteSale = () => {
    setShowReceiptDialog(false);
    searchInputRef.current?.focus();
  };

  // Receipt-time gate: open the PIN dialog. On success we close it and run the
  // existing payment flow with the verified salesperson attached.
  const handlePayClick = () => {
    if (cart.length === 0) return;
    // M6 — Shift gate. When shiftCloseEnabled and the current user has no
    // open shift, prompt to open one before payment. paidBy === 'cashier'
    // (deferred collection) is exempt — the shift will exist at collection time.
    if (settings.shiftCloseEnabled && paidBy === 'seller' && !currentShift) {
      setOpeningCashInput('0');
      setShowOpenShiftDialog(true);
      return;
    }
    // Salesperson identity is required for EVERY sale/print — both the
    // "send to cashier" (pending) and "seller paid" paths — so every receipt
    // records who printed it. The PIN dialog verifies username + 4-digit PIN.
    setPinError('');
    setPinValue('');
    setShowPinDialog(true);
    setTimeout(() => pinValueRef.current?.focus(), 50);
  };

  const submitPin = async () => {
    if (pinSubmitting) return;
    if (!/^\d{4}$/.test(pinValue)) {
      setPinError(t('pos.pinMustBe4'));
      pinValueRef.current?.focus();
      return;
    }
    setPinSubmitting(true);
    setPinError('');
    try {
      // Item 7 — code-only: identify the salesperson by PIN alone (no username).
      const verified = await verifySalesPin(pinValue);
      setShowPinDialog(false);
      setPinValue('');
      handleProcessPayment(verified);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : t('pos.pinFailed'));
      setPinValue('');
      pinValueRef.current?.focus();
    } finally {
      setPinSubmitting(false);
    }
  };

  // Calculate change
  const change = paymentMethod === 'cash' ? (parseFloat(cashReceived) || 0) - payable : 0;

  return (
    <div className="h-[calc(100vh-4rem)] -m-6 flex flex-col lg:flex-row overflow-hidden">
      {/* Left Panel - Product Search & Cart */}
      <div className="flex-1 min-w-0 flex flex-col p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className={cn(
              'text-2xl font-bold',
              settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
            )}>
              {t('pos.title')}
            </h1>
            {/* M6 — Shift status chip. Hidden when shiftCloseEnabled is off. */}
            {settings.shiftCloseEnabled && (
              currentShift ? (
                <button
                  type="button"
                  onClick={() => { setClosingCashInput('0'); setShowCloseShiftDialog(true); }}
                  className="text-xs px-2.5 py-1 rounded-md border bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                  title="Click to close shift"
                >
                  Shift open · since {new Date(currentShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setOpeningCashInput('0'); setShowOpenShiftDialog(true); }}
                  className="text-xs px-2.5 py-1 rounded-md border bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  No shift · open one
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCustomerDialog(true)}
              className="gap-2"
            >
              <User className="w-4 h-4" />
              {currentCustomer ? currentCustomer.name : t('pos.addCustomer')}
            </Button>
            {currentCustomer && customerPrescriptions.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowPrescriptionDialog(true)}
                className="gap-2 text-blue-600 border-blue-300"
              >
                <FileText className="w-4 h-4" />
                Rx ({customerPrescriptions.length})
              </Button>
            )}
            <Button
              variant={isPrescription ? 'default' : 'outline'}
              onClick={() => setIsPrescription(!isPrescription)}
              className="gap-2"
            >
              <Receipt className="w-4 h-4" />
              {t('pos.prescription')}
            </Button>
          </div>
        </div>

        {/* Prescription Fields */}
        {isPrescription && (
          <Card className="mb-4">
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label>{t('pos.doctorName')}</Label>
                  <Input
                    placeholder={t('pos.enterDoctor')}
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label>{t('pos.prescriptionNo')}</Label>
                  <Input
                    placeholder={t('pos.enterPrescriptionNo')}
                    value={prescriptionNumber}
                    onChange={(e) => setPrescriptionNumber(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Prescription Image (required for controlled drugs)</Label>
                <input
                  ref={rxFileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handlePrescriptionUpload}
                />
                {prescriptionImageUrl ? (
                  <div className="mt-1 flex items-center gap-2 p-2 border rounded-md bg-emerald-50 border-emerald-200">
                    {prescriptionImageUrl.startsWith('data:image') ? (
                      <img
                        src={prescriptionImageUrl}
                        alt="Prescription"
                        className="w-12 h-12 object-cover rounded border cursor-pointer"
                        onClick={() => setShowRxImagePreview(true)}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded border bg-white flex items-center justify-center">
                        <FileText className="w-6 h-6 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800">Prescription uploaded</p>
                      <p className="text-xs text-emerald-700">Will be attached to the sale record</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRxImagePreview(true)}
                    >
                      <ImageIcon className="w-4 h-4 mr-1" />
                      Preview
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => {
                        setPrescriptionImageUrl('');
                        if (rxFileInputRef.current) rxFileInputRef.current.value = '';
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => rxFileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4" />
                      Upload here
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={startPhoneUpload}
                    >
                      <Smartphone className="w-4 h-4" />
                      Upload by phone
                    </Button>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Required for Schedule-G & controlled drugs (DRAP / narcotics inspection).
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Phone-upload QR dialog. Cashier scans → phone takes photo → uploads. */}
        <Dialog
          open={showPhoneUploadDialog}
          onOpenChange={(open) => {
            if (!open) {
              stopPhoneUpload();
              setShowPhoneUploadDialog(false);
              setPhoneUploadStatus('idle');
              phoneUploadTokenRef.current = null;
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Upload from phone</DialogTitle>
              <DialogDescription>
                Scan with your phone camera, then take the photo there.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-2">
              {phoneUploadStatus === 'received' ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Check className="w-8 h-8 text-emerald-600" />
                  </div>
                  <p className="font-medium text-emerald-700">Prescription received!</p>
                </>
              ) : phoneUploadUrl ? (
                <>
                  <div className="p-3 bg-white border rounded-lg">
                    <QRCodeSVG value={phoneUploadUrl} size={200} level="M" includeMargin={false} />
                  </div>
                  <p className="text-xs text-gray-500 text-center break-all">{phoneUploadUrl}</p>
                  <div className="flex items-center gap-2 text-sm text-blue-700">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Waiting for phone…
                  </div>
                  <p className="text-[11px] text-gray-400 text-center">
                    Session expires in 10 minutes. Keep this window open.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">Preparing…</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Prescription image preview */}
        <Dialog open={showRxImagePreview} onOpenChange={setShowRxImagePreview}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Prescription Preview</DialogTitle>
            </DialogHeader>
            {prescriptionImageUrl && (
              prescriptionImageUrl.startsWith('data:image') ? (
                <img
                  src={prescriptionImageUrl}
                  alt="Prescription"
                  className="w-full max-h-[70vh] object-contain rounded border"
                />
              ) : (
                <iframe
                  src={prescriptionImageUrl}
                  title="Prescription PDF"
                  className="w-full h-[70vh] rounded border"
                />
              )
            )}
          </DialogContent>
        </Dialog>

        {/* Search Bar */}
        <div className="relative mb-4 z-20">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
          <Input
            ref={searchInputRef}
            placeholder={t('pos.searchMedicine')}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className={cn(
              'pl-10 pr-12 h-12 text-lg relative z-0',
              settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
            )}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-11 top-1/2 -translate-y-1/2 z-10"
            title="Check stock in other branches"
            onClick={() => setShowBranchStock(true)}
          >
            <Store className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10"
            onClick={handleBarcodeScan}
          >
            <ScanBarcode className="w-5 h-5" />
          </Button>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <Card className={cn(
              'absolute top-full left-0 right-0 mt-1 z-50 shadow-lg border',
              settings.theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            )}>
              <CardContent className="p-2">
                <div className="px-2 pb-1 text-[11px] text-gray-400 flex items-center justify-between">
                  <span>↑ ↓ to navigate · Enter to add · Esc to close</span>
                  <span>{searchResults.length} result{searchResults.length === 1 ? '' : 's'}</span>
                </div>
                <ScrollArea className="max-h-64">
                  {searchResults.map((medicine, idx) => (
                    <button
                      key={medicine.id}
                      ref={(el) => { searchResultRefs.current[idx] = el; }}
                      onClick={() => handleMedicineSelect(medicine)}
                      onMouseEnter={() => setSearchHighlightIdx(idx)}
                      className={cn(
                        'w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors',
                        idx === searchHighlightIdx
                          ? (settings.theme === 'dark' ? 'bg-gray-700 ring-1 ring-emerald-500' : 'bg-emerald-50 ring-1 ring-emerald-400')
                          : (settings.theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50')
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'font-medium truncate',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>{medicine.name}</p>
                        <p className={cn(
                          'text-sm truncate',
                          settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                        )}>{medicine.genericName}{medicine.strength ? ` · ${medicine.strength}` : ''}</p>
                        {/* Compact meta row: packing, expiry of FEFO batch,
                            distributor, DRAP registration. Hidden when empty so
                            simple medicines don't get a row of dashes. */}
                        {(() => {
                          const b = getFEFOSuggestedBatch(medicine.id);
                          const expiryText = b ? new Date(b.expiryDate).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : '';
                          const distributor = supplierNameById(b?.supplierId);
                          const chips: { label: string; value: string; tone: string }[] = [];
                          if (medicine.packSize) chips.push({ label: 'Pack', value: medicine.packSize, tone: 'text-gray-600' });
                          if (expiryText) chips.push({ label: 'Exp', value: expiryText, tone: 'text-amber-700' });
                          if (distributor) chips.push({ label: 'Dist', value: distributor, tone: 'text-purple-700' });
                          if (medicine.drapRegistration) chips.push({ label: 'Reg', value: medicine.drapRegistration, tone: 'text-emerald-700' });
                          if (chips.length === 0) return null;
                          return (
                            <p className="text-[11px] flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                              {chips.map((c, i) => (
                                <span key={i} className={c.tone}>
                                  <span className="text-gray-400">{c.label}:</span> {c.value}
                                </span>
                              ))}
                            </p>
                          );
                        })()}
                        {/* Shelf/rack on its own line so it stays prominent. */}
                        {(medicine.shelfLocation || medicine.rackNumber) && (
                          <p className="text-[11px] text-blue-600 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {[medicine.rackNumber, medicine.shelfLocation].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {(() => {
                            const b = getFEFOSuggestedBatch(medicine.id);
                            return b ? `Rs. ${b.salePrice.toFixed(2)}` : '—';
                          })()}
                        </p>
                        <p className="text-[10px] text-gray-500 tabular-nums">
                          Stock: {getMedicineStock(medicine.id).toLocaleString()}
                        </p>
                        <Badge variant={medicine.isPrescriptionRequired ? 'destructive' : 'secondary'} className="mt-0.5">
                          {medicine.isPrescriptionRequired ? 'Rx' : 'OTC'}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Feature 5 — when we don't stock what was typed, offer alternatives */}
          {searchQuery.trim().length >= 3 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-40">
              <Button
                variant="outline"
                className="w-full gap-2 border-dashed text-emerald-700"
                onClick={() => setShowAlternatives(true)}
              >
                <Search className="w-4 h-4" />
                Not in stock — find alternatives for “{searchQuery.trim()}”
              </Button>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <Card className={cn(
          'flex-1',
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>{t('pos.cartItems')} ({cart.length})</span>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500">
                  <Trash2 className="w-4 h-4 mr-1" />
                  {t('pos.clearCart')}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-24rem)]">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <ShoppingCart className="w-16 h-16 mb-4 opacity-30" />
                  <p>{t('pos.scanOrSearch')}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {cart.map((item, index) => (
                    <div key={index} className="p-4 flex items-center gap-4">
                      <div className="flex-1">
                        <p className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {item.medicineName}
                        </p>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                          {/* The label translations already contain a trailing
                              colon (e.g. "Batch:"), so don't add another. */}
                          {t('pos.batchLabel')} {item.batchNumber}
                          {item.fefoOverride && (
                            <span className="text-amber-600 text-xs font-medium">⚠ {t('pos.override')}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {t('pos.expLabel')} {new Date(item.expiryDate).toLocaleDateString()}
                          {canSeeProfit && (() => {
                            // Profit margin as % of the sale total — gives the
                            // cashier an at-a-glance "discount headroom" number.
                            //   margin% = profit / (unitPrice × qty) × 100
                            const revenue = item.unitPrice * item.quantity;
                            const pct = revenue > 0 ? (item.lineProfit / revenue) * 100 : 0;
                            const tone = pct >= 25 ? 'text-emerald-600'
                              : pct >= 10 ? 'text-amber-600'
                              : 'text-red-600';
                            return (
                              <>
                                {' | '}
                                {t('pos.profitLabel')}{' '}
                                <span className={tone + ' font-medium'}>{pct.toFixed(1)}%</span>
                                <span className="text-gray-300 ml-1">(Rs. {item.lineProfit.toFixed(2)})</span>
                              </>
                            );
                          })()}
                        </p>
                        <p className="text-sm text-gray-500">
                          Rs. {item.unitPrice.toFixed(2)} × {item.quantity} {item.unitName || ''}
                        </p>
                        {(visiblePrices.purchase || visiblePrices.trade) && (() => {
                          // Three-price chip. Salesperson uses TP as a discount
                          // floor; cost is shown to manager/owner only when their
                          // role allow-list includes it. Resolve TP from the
                          // current line's batch + medicine.
                          const batch = batches.find((b) => b.id === item.batchId);
                          const med = medicines.find((m) => m.id === item.medicineId);
                          const mult = item.unitMultiplier || 1;
                          const trade = resolveTradePrice(batch, med) * mult;
                          const headroom = item.unitPrice - trade;
                          return (
                            <p className="text-[11px] flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {visiblePrices.purchase && (
                                <span className="text-gray-500">
                                  <span className="text-gray-400">Cost:</span> Rs. {(item.purchasePrice).toFixed(2)}
                                </span>
                              )}
                              {visiblePrices.trade && trade > 0 && (
                                <span className="text-emerald-700">
                                  <span className="text-gray-400">TP:</span> Rs. {trade.toFixed(2)}
                                  {headroom > 0.005 && (
                                    <span className="text-gray-400"> · max disc Rs. {headroom.toFixed(2)}</span>
                                  )}
                                </span>
                              )}
                            </p>
                          );
                        })()}
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium text-gray-500">Unit</Label>
                            <Select
                              value={item.unitName || ''}
                              onValueChange={(value) => {
                                const med = medicines.find((m) => m.id === item.medicineId);
                                const unit = med?.units?.find((u) => (u.abbreviation || u.name) === value);
                                if (!unit) return;
                                const batch = batches.find((b) => b.id === item.batchId);
                                const baseSalePrice = batch?.salePrice ?? item.unitPrice;
                                const basePurchasePrice = batch?.purchasePrice ?? item.purchasePrice;
                                updateCartItem(index, {
                                  unitName: unit.abbreviation || unit.name,
                                  unitMultiplier: unit.multiplier,
                                  unitPrice: unit.salePrice ?? baseSalePrice * unit.multiplier,
                                  purchasePrice: basePurchasePrice * unit.multiplier,
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const med = medicines.find((m) => m.id === item.medicineId);
                                  return med ? sellableUnits(med) : [
                                    { id: `${item.medicineId}-base`, name: item.unitName || 'unit', abbreviation: item.unitName || 'unit', multiplier: item.unitMultiplier || 1, isBaseUnit: true, isActive: true },
                                  ];
                                })().map((unit) => (
                                  <SelectItem key={unit.id} value={unit.abbreviation || unit.name}>
                                    {unit.name} x{unit.multiplier}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium text-gray-500">Discount (%)</Label>
                            <div className="flex h-9 overflow-hidden rounded-md border bg-white">
                              <Input
                                className="h-9 rounded-none border-0 text-sm shadow-none focus-visible:ring-0"
                                type="number"
                                min={0}
                                max={100}
                                value={item.discountPercent}
                                onChange={(e) => updateCartItem(index, { discountPercent: Number(e.target.value || 0) })}
                                aria-label="Discount percent"
                                placeholder="0"
                              />
                              <span className="flex w-10 items-center justify-center border-l bg-gray-50 text-sm font-medium text-gray-600">%</span>
                            </div>
                            {/* Quick-pick from system-wide discount rules
                                (Settings → Discount Rules). Only line-level
                                rules apply per item. */}
                            {(() => {
                              const lineRules = (settings.discountRules ?? []).filter((r) => r.isActive && r.type === 'line_percent');
                              if (lineRules.length === 0) return null;
                              return (
                                <Select
                                  value=""
                                  onValueChange={(value) => {
                                    const rule = lineRules.find((r) => r.id === value);
                                    if (rule) updateCartItem(index, { discountPercent: rule.value });
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-[11px] mt-1">
                                    <SelectValue placeholder="Apply rule…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {lineRules.map((r) => (
                                      <SelectItem key={r.id} value={r.id} className="text-xs">
                                        {r.name} ({r.value}%)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] font-medium text-gray-500">Tax Rule</Label>
                            <Select
                              value={item.taxRuleId || 'manual'}
                              onValueChange={(value) => {
                                const rule = settings.taxRules.find((taxRule) => taxRule.id === value);
                                updateCartItem(index, {
                                  taxRuleId: rule?.id,
                                  taxPercent: rule?.ratePercent ?? item.taxPercent,
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Tax" />
                              </SelectTrigger>
                              <SelectContent>
                                {settings.taxRules.filter((rule) => rule.isActive).map((rule) => (
                                  <SelectItem key={rule.id} value={rule.id}>
                                    {rule.name} ({rule.ratePercent}%)
                                  </SelectItem>
                                ))}
                                <SelectItem value="manual">Manual {item.taxPercent}%</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => updateQuantity(index, Math.max(1, item.quantity - 1))}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        {/* Typeable quantity — selects on focus so a quick
                            triple-tap or just typing replaces the number. */}
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={item.quantity}
                          onFocus={(e) => (e.target as HTMLInputElement).select()}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            // Allow temporary empty / 0 while typing — clamp on blur.
                            // High side is capped at available stock.
                            setCartQuantity(index, Number.isFinite(v) ? Math.max(0, v) : 0);
                          }}
                          onBlur={(e) => {
                            const v = parseInt((e.target as HTMLInputElement).value, 10);
                            if (!Number.isFinite(v) || v < 1) updateQuantity(index, 1);
                          }}
                          className={cn(
                            'h-8 w-16 text-center font-medium text-sm tabular-nums',
                            settings.theme === 'dark' && 'bg-gray-800 border-gray-700 text-white',
                          )}
                          aria-label="Quantity"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => setCartQuantity(index, item.quantity + 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className={cn(
                          'font-bold',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          Rs. {item.total.toFixed(2)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500"
                        onClick={() => removeFromCart(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Checkout — full width when stacked (narrow), fixed beside cart on lg+ */}
      <div className={cn(
        'w-full lg:w-96 shrink-0 border-t lg:border-t-0 lg:border-l p-6 flex flex-col overflow-y-auto',
        settings.theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50'
      )}>
        <h2 className={cn(
          'text-xl font-bold mb-4',
          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
        )}>
          {t('pos.orderSummary')}
        </h2>

        {/* FEFO hint banner */}
        {cart.some(i => i.fefoOverride) && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-700 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{t('pos.fefoOverrideNote', cart.filter(i => i.fefoOverride).length.toString())}</span>
          </div>
        )}

        {/* Loyalty redemption — only for a registered customer above the threshold */}
        {settings.enableLoyalty && currentCustomer && cart.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-800 p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-amber-900 dark:text-amber-200">⭐ Loyalty points</span>
              <span className="text-amber-800 dark:text-amber-300">{custPoints} pts · Rs {loyPointValue}/pt</span>
            </div>
            {loyaltyEligible ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={maxRedeemPoints}
                    value={pointsToRedeem || ''}
                    placeholder="Points to redeem"
                    onChange={(e) => setPointsToRedeem(Math.max(0, Math.min(maxRedeemPoints, parseInt(e.target.value) || 0)))}
                    className="h-8 flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setPointsToRedeem(maxRedeemPoints)}>Max</Button>
                  {redeemPoints > 0 && <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setPointsToRedeem(0)}>Clear</Button>}
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-300/80">
                  Up to {maxRedeemPoints} pts here (max {loyMaxPct}% of bill){redeemPoints > 0 ? ` · redeeming ${redeemPoints} pts = Rs ${loyaltyDiscount.toFixed(2)} off` : ''}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-amber-700 dark:text-amber-300/80">
                Needs at least {loyMinRedeem} points to redeem (has {custPoints}). Will earn {loyaltyPointsEarnedVal} pts on this sale.
              </p>
            )}
          </div>
        )}

        <div className="flex-1 space-y-4">
          <div className="flex justify-between">
            <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              {t('common.subtotal')}
            </span>
            <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              Rs. {subtotal.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              Discount %
            </span>
            <span className="text-emerald-500">
              -Rs. {discountAmount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              Taxes
            </span>
            <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              Rs. {taxAmount.toFixed(2)}
            </span>
          </div>
          {settings.serviceCharges.filter((charge) => charge.isActive).map((charge) => {
            const amount = charge.type === 'percent' ? ((subtotal - discountAmount) * charge.amount) / 100 : charge.amount;
            return (
              <div key={charge.id} className="flex justify-between">
                <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  {charge.name}
                </span>
                <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                  Rs. {amount.toFixed(2)}
                </span>
              </div>
            );
          })}
          {loyaltyDiscount > 0 && (
            <div className="flex justify-between">
              <span className="text-amber-600">Loyalty ({redeemPoints} pts)</span>
              <span className="text-amber-600">-Rs. {loyaltyDiscount.toFixed(2)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-xl font-bold">
            <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              {t('pos.grandTotal')}
            </span>
            <span className="text-emerald-500">
              Rs. {totalAfterLoyalty.toFixed(2)}
            </span>
          </div>
          {/* Profit Intelligence — owner only (or manager if allowed) */}
          {cart.length > 0 && canSeeProfit && (
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1 text-gray-500">
                <TrendingUp className="w-3 h-3" /> {t('pos.grossProfit')}
              </span>
              <span className="text-emerald-600 font-medium">
                Rs. {grossProfit.toFixed(2)}
                {subtotal > 0 && (
                  <span className="text-xs text-gray-400 ml-1">
                    ({((grossProfit / subtotal) * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <FbrPreflightWarning cart={cart} medicines={medicines} fbrEnabled={Boolean(settings.fbrIntegration && settings.fbrProfile?.enabled)} />
          <Button
            className="w-full h-14 text-lg bg-emerald-500 hover:bg-emerald-600"
            disabled={cart.length === 0}
            onClick={() => { setPaymentMethod('cash'); setPaymentReference(''); setShowPaymentDialog(true); }}
          >
            <Banknote className="w-5 h-5 mr-2" />
            {t('pos.proceedToPayment')}
            <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-emerald-700/40 rounded">Ctrl+P</kbd>
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={cart.length === 0}
            onClick={handleSaveAndPrintLater}
          >
            <Save className="w-4 h-4 mr-2" />
            {t('pos.savePrintLater')}
            <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-gray-200 text-gray-700 rounded">Ctrl+S</kbd>
          </Button>
          <div className="text-[11px] text-gray-400 text-center space-y-0.5">
            <p>
              <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Ctrl+M</kbd> search ·
              <kbd className="px-1 py-0.5 mx-1 bg-gray-100 rounded font-mono">↑↓</kbd> navigate ·
              <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Enter</kbd> add
            </p>
            <p>
              <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Ctrl+B</kbd> new sale ·
              <kbd className="px-1 py-0.5 mx-1 bg-gray-100 rounded font-mono">Ctrl+R</kbd> reports
            </p>
          </div>
        </div>
      </div>

      {/* Batch Selection Dialog — FEFO enforced */}
      <Dialog open={showBatchDialog} onOpenChange={(o) => { setShowBatchDialog(o); if (!o) setQuickAdd(false); }}>
        <DialogContent
          className="max-w-lg"
          onKeyDown={(e) => {
            if (availableBatches.length === 0) return;
            const batchNav = !quickAdd || addStage === 'unit';
            if (e.key === 'ArrowDown' && batchNav) {
              e.preventDefault();
              setBatchHighlightIdx((i) => Math.min(i + 1, availableBatches.length - 1));
            } else if (e.key === 'ArrowUp' && batchNav) {
              e.preventDefault();
              setBatchHighlightIdx((i) => Math.max(i - 1, 0));
            } else if (quickAdd && addStage === 'unit' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
              e.preventDefault();
              const n = quickUnits.length || 1;
              setQuickUnitIdx((i) => (e.key === 'ArrowRight' ? (i + 1) % n : (i - 1 + n) % n));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (quickAdd && addStage === 'unit') {
                // Confirm unit → move to quantity.
                setAddStage('qty');
                setTimeout(() => { qtyInputRef.current?.focus(); qtyInputRef.current?.select(); }, 0);
                return;
              }
              const batch = availableBatches[batchHighlightIdx] ?? availableBatches[0];
              if (!batch) return;
              if (quickAdd) {
                const unit = quickUnits[quickUnitIdx] ?? null;
                const qty = Math.max(1, parseInt(quickQty, 10) || 1);
                handleAddFromBatch(batch, qty, false, selectedMedicine ?? undefined, unit);
              } else {
                handleAddFromBatch(batch, 1);
              }
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              {/* Translation is "Select Batch — {0}" — pass the medicine name
                  as the {0} arg so it interpolates cleanly. */}
              {t('pos.selectBatch', selectedMedicine?.name ?? '')}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1">
              <span className="text-emerald-600 font-medium">FEFO</span> — {t('pos.fefoDesc')}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-72">
            <div className="space-y-2">
              {availableBatches.map((batch, idx) => {
                const isSuggested = batch.id === fefoSuggestedBatchId;
                const isHighlighted = idx === batchHighlightIdx;
                const eb = expiryBadge(batch.expiryDate);
                const profitPU = batch.salePrice - batch.purchasePrice;
                return (
                  <div
                    key={batch.id}
                    className={cn(
                      'p-4 border-2 rounded-lg cursor-pointer transition-all',
                      isHighlighted
                        ? 'border-emerald-500 bg-emerald-100 ring-2 ring-emerald-300'
                        : isSuggested
                          ? 'border-emerald-400 bg-emerald-50 hover:bg-emerald-100'
                          : 'border-gray-200 hover:bg-gray-50'
                    )}
                    onMouseEnter={() => setBatchHighlightIdx(idx)}
                    onClick={() => handleAddFromBatch(batch, 1)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{batch.batchNumber}</p>
                          {isSuggested && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">
                              {t('pos.fefoSuggested')}
                            </Badge>
                          )}
                          {idx === 0 && !isSuggested && (
                            <Badge variant="secondary" className="text-xs">{t('pos.pickFirst')}</Badge>
                          )}
                          {/* M3 — distributor chip. When the same medicine has
                              batches from multiple suppliers, this lets the
                              cashier pick "Pfizer batch vs GSK batch". */}
                          {(() => {
                            const sname = supplierNameById(batch.supplierId);
                            if (!sname) return null;
                            return (
                              <Badge variant="outline" className="text-[10px] text-purple-700 border-purple-200">
                                {sname}
                              </Badge>
                            );
                          })()}
                        </div>
                        <p className="text-sm text-gray-500">
                          {/* 'pos.stock' already ends with ':'. */}
                          {t('pos.stock')} <span className="font-medium">{batch.quantity}</span>
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        {visiblePrices.sale && (
                          <p className="font-bold text-lg">Rs. {batch.salePrice.toFixed(2)}</p>
                        )}
                        <span className={cn('text-xs px-2 py-0.5 rounded border', eb.cls)}>
                          {eb.label} {t('pos.left')}
                        </span>
                        {/* TP for this batch + max-discount headroom — shown
                            to roles allowed by Settings → POS price visibility. */}
                        {visiblePrices.trade && (() => {
                          const med = medicines.find((m) => m.id === batch.medicineId);
                          const tp = resolveTradePrice(batch, med);
                          if (!(tp > 0) || tp === batch.salePrice) return null;
                          return (
                            <p className="text-[11px] text-emerald-700">
                              <span className="text-gray-400">TP:</span> Rs. {tp.toFixed(2)}
                            </p>
                          );
                        })()}
                        {visiblePrices.purchase && (
                          <p className="text-[11px] text-gray-500">
                            <span className="text-gray-400">Cost:</span> Rs. {batch.purchasePrice.toFixed(2)}
                          </p>
                        )}
                        {/* Profit-per-unit chip stays gated by the legacy
                            canSeeProfit flag (owner / manager + override). */}
                        {canSeeProfit && (
                          <p className="text-xs text-emerald-600">{t('pos.profitPerUnit', profitPU.toFixed(2))}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Item 6 — keyboard quick-add: unit then quantity */}
          {quickAdd && (
            <div className="border-t pt-3 space-y-2">
              {quickUnits.length > 1 && (
                <div>
                  <Label className="text-[11px] font-medium text-gray-500">
                    Unit {addStage === 'unit' && <span className="text-emerald-600">— ← → to choose, Enter to confirm</span>}
                  </Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {quickUnits.map((u, i) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setQuickUnitIdx(i); setAddStage('qty'); setTimeout(() => { qtyInputRef.current?.focus(); qtyInputRef.current?.select(); }, 0); }}
                        className={cn(
                          'px-3 py-1.5 rounded-md border text-sm',
                          i === quickUnitIdx
                            ? 'border-emerald-500 bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                            : 'border-gray-200 hover:bg-gray-50',
                        )}
                      >
                        {u.name}{u.multiplier > 1 ? ` ×${u.multiplier}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-[11px] font-medium text-gray-500">
                    Quantity {addStage === 'qty' && <span className="text-emerald-600">— Enter to add</span>}
                  </Label>
                  <Input
                    ref={qtyInputRef}
                    type="number"
                    min={1}
                    value={quickQty}
                    onFocus={() => setAddStage('qty')}
                    onChange={(e) => setQuickQty(e.target.value)}
                    className="h-10 text-lg"
                  />
                </div>
                <Button
                  className="h-10 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    const batch = availableBatches[batchHighlightIdx] ?? availableBatches[0];
                    if (!batch) return;
                    const unit = quickUnits[quickUnitIdx] ?? null;
                    const qty = Math.max(1, parseInt(quickQty, 10) || 1);
                    handleAddFromBatch(batch, qty, false, selectedMedicine ?? undefined, unit);
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-500 text-center pt-1 border-t">
            {quickAdd ? (
              <>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">↑ ↓</kbd> batch ·{' '}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">← →</kbd> unit ·{' '}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Enter</kbd> next / add ·{' '}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Esc</kbd> close
              </>
            ) : (
              <>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">↑ ↓</kbd> navigate ·{' '}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Enter</kbd> pick highlighted batch ·{' '}
                <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Esc</kbd> close
              </>
            )}
          </p>
        </DialogContent>
      </Dialog>

      {/* FEFO Override Confirmation Dialog */}
      <Dialog open={showFefoOverrideDialog} onOpenChange={setShowFefoOverrideDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              {t('pos.overrideWarning')}
            </DialogTitle>
            <DialogDescription>
              {t('pos.overrideDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setShowFefoOverrideDialog(false);
              setPendingOverrideBatch(null);
              setShowBatchDialog(true);
            }}>
              {t('pos.backPickFefo')}
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600"
              onClick={() => pendingOverrideBatch && handleAddFromBatch(pendingOverrideBatch, 1, true)}
            >
              {t('pos.overrideContinue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Dialog */}
      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('pos.selectCustomer')}</DialogTitle>
            <DialogDescription>
              {t('pos.searchCustomerDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t('pos.searchCustomerPlaceholder')}
                value={customerSearchQuery}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {customerSearchResults.length > 0 && (
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {customerSearchResults.map((customer) => {
                    const rxCount = getByCustomer(customer.id).length;
                    return (
                      <button
                        key={customer.id}
                        onClick={() => handleSelectCustomer(customer)}
                        className="w-full p-3 border rounded-lg hover:bg-gray-50 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <p className="text-sm text-gray-500">{customer.phone}</p>
                          </div>
                          {rxCount > 0 && (
                            <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">
                              <FileText className="w-3 h-3 mr-1" />
                              {rxCount} Rx
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            <Separator />

            <div>
              <h4 className="font-medium mb-3">{t('pos.addNewCustomer')}</h4>
              <div className="space-y-3">
                <Input
                  placeholder={t('pos.customerName')}
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                />
                <Input
                  placeholder={t('pos.phoneNumber')}
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
                <Input
                  placeholder={t('pos.cnicOptional')}
                  value={newCustomer.cnic}
                  onChange={(e) => setNewCustomer({ ...newCustomer, cnic: e.target.value })}
                />
                <Button onClick={handleAddCustomer} className="w-full">
                  {t('pos.addCustomer')}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent
          className="max-w-md"
          onKeyDown={(e) => {
            // Enter inside this dialog → trigger the main action button.
            // Skip when focus is in a textarea (so multi-line notes still get
            // newlines) or inside a Select dropdown (Radix handles its own).
            if (e.key !== 'Enter') return;
            const target = e.target as HTMLElement;
            const tag = target.tagName.toLowerCase();
            if (tag === 'textarea' || target.getAttribute('role') === 'combobox' || target.closest('[role="listbox"]')) return;
            e.preventDefault();
            if (cart.length > 0) handlePayClick();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('pos.payment')}</DialogTitle>
            <DialogDescription>
              {/* 'pos.totalAmount' is "Total Amount: Rs. {0}" — pass the value. */}
              {t('pos.totalAmount', total.toFixed(2))}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <RadioGroup
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as any)}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="cash" id="cash" className="peer sr-only" />
                <Label
                  htmlFor="cash"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500"
                >
                  <Banknote className="mb-3 h-6 w-6" />
                  {t('pos.cash')}
                </Label>
              </div>
              {settings.enableCardPayments && (
              <div>
                <RadioGroupItem value="card" id="card" className="peer sr-only" />
                <Label
                  htmlFor="card"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500"
                >
                  <CreditCard className="mb-3 h-6 w-6" />
                  {t('pos.card')}
                </Label>
              </div>
              )}
              {settings.enableJazzCash && (
              <div>
                <RadioGroupItem value="jazzcash" id="jazzcash" className="peer sr-only" />
                <Label
                  htmlFor="jazzcash"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500"
                >
                  <Smartphone className="mb-3 h-6 w-6" />
                  {t('pos.jazzCash')}
                </Label>
              </div>
              )}
              {settings.enableEasyPaisa && (
              <div>
                <RadioGroupItem value="easypaisa" id="easypaisa" className="peer sr-only" />
                <Label
                  htmlFor="easypaisa"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500"
                >
                  <Smartphone className="mb-3 h-6 w-6" />
                  {t('pos.easyPaisa')}
                </Label>
              </div>
              )}
              <div>
                <RadioGroupItem value="bank_transfer" id="bank_transfer" className="peer sr-only" />
                <Label
                  htmlFor="bank_transfer"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500"
                >
                  <Building className="mb-3 h-6 w-6" />
                  Bank Transfer
                </Label>
              </div>
            </RadioGroup>

            {paymentMethod !== 'cash' && (
              <div>
                <Label>Transaction / Reference ID <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input
                  placeholder="Enter transaction or reference number"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
            )}

            {paymentMethod === 'cash' && paidBy === 'seller' && (
              <div>
                <Label>{t('pos.cashReceived')} {paymentAdjustment !== 0 && <span className="text-xs text-gray-500">(payable Rs. {payable.toFixed(2)})</span>}</Label>
                <Input
                  type="number"
                  placeholder={t('pos.enterAmount')}
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  className="text-lg"
                />
                {change > 0 && (
                  <p className="text-emerald-500 font-medium mt-2">
                    {t('pos.changeReturn')}: Rs. {change.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            <Separator />

            {/* Collect By — Cashier or Seller (hidden when cashier collection is off) */}
            {cashierCollectionOn && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t('pos.collectBy')}</Label>
              <RadioGroup
                value={paidBy}
                onValueChange={(value) => setPaidBy(value as any)}
                className="grid grid-cols-2 gap-3"
              >
                <div>
                  <RadioGroupItem value="cashier" id="paidby-cashier" className="peer sr-only" />
                  <Label
                    htmlFor="paidby-cashier"
                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-amber-500 [&:has([data-state=checked])]:border-amber-500 cursor-pointer"
                  >
                    <UserCheck className="mb-1 h-5 w-5" />
                    <span className="text-xs">{t('pos.cashier')}</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="seller" id="paidby-seller" className="peer sr-only" />
                  <Label
                    htmlFor="paidby-seller"
                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500 cursor-pointer"
                  >
                    <Building className="mb-1 h-5 w-5" />
                    <span className="text-xs">{t('pos.seller')}</span>
                  </Label>
                </div>
              </RadioGroup>
              {paidBy === 'cashier' && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-2 py-1">{t('pos.cashierNote')}</p>
              )}
              {paidBy === 'seller' && (
                <p className="text-xs text-emerald-600 bg-emerald-50 rounded-md px-2 py-1">{t('pos.sellerNote')}</p>
              )}
            </div>
            )}

            {/* M2 — payment-method default adjustment summary. Shown only when
                an adjustment applies so the cashier knows the final number to
                collect/give. Cart total stays the same; this is on top. */}
            {paymentAdjustment !== 0 && paidBy === 'seller' && (
              <div className={cn(
                'rounded-md px-3 py-2 text-sm flex items-center justify-between',
                paymentAdjustment > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800',
              )}>
                <span>
                  {paymentAdjustment > 0 ? 'Card/processing surcharge' : 'Payment-method discount'}
                  {' '}
                  <span className="opacity-70">
                    ({paymentMethodCfg.feePercent > 0 && `+${paymentMethodCfg.feePercent}%`}{paymentMethodCfg.discountPercent > 0 && `-${paymentMethodCfg.discountPercent}%`})
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {paymentAdjustment > 0 ? '+' : ''}Rs. {paymentAdjustment.toFixed(2)}
                </span>
              </div>
            )}
            {paymentAdjustment !== 0 && paidBy === 'seller' && (
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-gray-600">Payable</span>
                <span className="font-bold text-emerald-700 tabular-nums">Rs. {payable.toFixed(2)}</span>
              </div>
            )}

            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600"
              onClick={handlePayClick}
              disabled={paidBy === 'seller' && paymentMethod === 'cash' && (parseFloat(cashReceived) || 0) < payable}
            >
              <Check className="w-4 h-4 mr-2" />
              {paidBy === 'cashier' ? t('pos.saveCollect') : t('pos.completePayment')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Salesperson PIN Dialog — required to finalize a sale on a shared POS */}
      <Dialog
        open={showPinDialog}
        onOpenChange={(open) => {
          if (pinSubmitting) return;
          setShowPinDialog(open);
          if (!open) { setPinError(''); setPinValue(''); }
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 justify-center">
              <Lock className="w-4 h-4" /> {t('pos.pinTitle')}
            </DialogTitle>
            <DialogDescription className="text-center text-xs">
              {t('pos.pinDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3 pt-2"
            onSubmit={(e) => { e.preventDefault(); submitPin(); }}
          >
            <div>
              <Label htmlFor="pin-value" className="text-xs mb-1 block">{t('pos.pinValue')}</Label>
              <Input
                id="pin-value"
                ref={pinValueRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={pinSubmitting}
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
            </div>
            {pinError && (
              <p className="text-xs text-red-600 text-center">{pinError}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600"
              disabled={pinSubmitting}
            >
              {pinSubmitting ? t('pos.pinVerifying') : t('pos.pinConfirm')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">
              {paidBy === 'cashier' ? t('pos.sentToCashier') : t('pos.paymentSuccessful')}
            </DialogTitle>
          </DialogHeader>

          <div ref={receiptRef} className="text-center py-6">
            <div className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
              paidBy === 'cashier' ? 'bg-amber-100' : 'bg-emerald-100'
            )}>
              <Check className={cn('w-8 h-8', paidBy === 'cashier' ? 'text-amber-500' : 'text-emerald-500')} />
            </div>
            <p className="text-2xl font-bold">Rs. {lastSaleRef.current?.total.toFixed(2) ?? total.toFixed(2)}</p>
            <p className="text-gray-500">{lastSaleRef.current?.invoiceNumber ?? ''}</p>
            {lastSaleRef.current?.salesPersonName && (
              <p className="text-sm text-gray-700 mt-1">
                {t('pos.soldBy')}: <span className="font-medium">{lastSaleRef.current.salesPersonName}</span>
              </p>
            )}

            {lastSaleRef.current?.fbrStatus && lastSaleRef.current.fbrStatus !== 'not_integrated' && (
              <FbrReceiptBlock
                status={lastSaleRef.current.fbrStatus}
                invoiceNumber={lastSaleRef.current.fbrInvoiceNumber}
                qrPayload={lastSaleRef.current.fbrQrPayload ?? lastSaleRef.current.fbrInvoiceNumber}
              />
            )}

            {paidBy === 'cashier' && (
              <Badge className="mt-2 bg-amber-100 text-amber-700 border-amber-300">{t('pos.pendingCashier')}</Badge>
            )}
            {paidBy === 'seller' && (
              <Badge className="mt-2 bg-emerald-100 text-emerald-700 border-emerald-300">{t('pos.collectedBySeller')}</Badge>
            )}
            {canSeeProfit && (
              <p className="text-sm text-emerald-600 mt-2">
                {t('pos.grossProfit')}: Rs. {grossProfit.toFixed(2)}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Button className="w-full gap-2" onClick={handlePrintReceipt} autoFocus>
              <Printer className="w-4 h-4" />
              {t('pos.printReceipt')}
              <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-emerald-700/40 rounded">Enter</kbd>
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={handleEmailReceipt}>
              <Mail className="w-4 h-4" />
              {t('pos.emailReceipt')}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleCompleteSale}
            >
              {t('pos.newSale')}
            </Button>
            <p className="text-[11px] text-gray-400 text-center">
              <kbd className="px-1 py-0.5 bg-gray-100 rounded font-mono">Enter</kbd> or
              <kbd className="px-1 py-0.5 mx-1 bg-gray-100 rounded font-mono">Ctrl+P</kbd> print
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Barcode Scan Dialog */}
      <Dialog open={showBarcodeDialog} onOpenChange={setShowBarcodeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanBarcode className="w-5 h-5" />
              {t('pos.barcodeScanner')}
            </DialogTitle>
            <DialogDescription>
              {t('pos.barcodeScanDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <ScanBarcode className="w-8 h-8 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">{t('pos.readyToScan')}</p>
                <p className="text-xs text-gray-500">{t('pos.pointBarcode')}</p>
              </div>
            </div>
            <div>
              <Label>{t('pos.manualEntry')}</Label>
              <Input
                ref={barcodeInputRef}
                placeholder={t('pos.typeOrScan')}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    handleBarcodeLookup(barcodeInput);
                  }
                }}
                className="text-lg font-mono"
              />
            </div>
            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600"
              onClick={() => handleBarcodeLookup(barcodeInput)}
              disabled={!barcodeInput.trim()}
            >
              <Search className="w-4 h-4 mr-2" />
              {t('pos.lookupMedicine')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prescription History Dialog */}
      <Dialog open={showPrescriptionDialog} onOpenChange={setShowPrescriptionDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {t('pos.prescriptionsTitle', currentCustomer?.name ?? '')}
            </DialogTitle>
            <DialogDescription>
              {t('pos.prescriptionsDesc')}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[55vh] pr-2">
            {customerPrescriptions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {t('pos.noPrescriptions')}
              </div>
            ) : (
              <div className="space-y-4">
                {customerPrescriptions.map((rx) => (
                  <Card key={rx.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-base">{rx.doctorName}</span>
                            {rx.prescriptionNumber && (
                              <Badge variant="outline" className="text-xs">
                                Rx# {rx.prescriptionNumber}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                            <Clock className="w-3 h-3" />
                            {new Date(rx.createdAt).toLocaleDateString()} 
                            <span className="text-gray-400">·</span>
                            {rx.items.length} {t('pos.medicines')}
                            <span className="text-gray-400">·</span>
                            {t('pos.orderedTimes', rx.saleIds.length)}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleReorderPrescription(rx)}
                          className="gap-1 bg-blue-600 hover:bg-blue-700"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          {t('pos.reorder')}
                        </Button>
                      </div>
                      <div className="bg-gray-50 rounded-md p-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-500 text-xs border-b">
                              <th className="text-left pb-2">{t('sales.medicine')}</th>
                              <th className="text-center pb-2">{t('sales.qty')}</th>
                              <th className="text-right pb-2">{t('common.price')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rx.items.map((item, idx) => (
                              <tr key={idx} className="border-b last:border-b-0">
                                <td className="py-1.5 flex items-center gap-1">
                                  <Pill className="w-3 h-3 text-emerald-500" />
                                  {item.medicineName}
                                </td>
                                <td className="py-1.5 text-center">{item.quantity}</td>
                                <td className="py-1.5 text-right">Rs. {item.unitPrice.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="font-medium text-xs border-t">
                              <td className="pt-2">{t('common.total')}</td>
                              <td className="pt-2 text-center">
                                {rx.items.reduce((s, i) => s + i.quantity, 0)}
                              </td>
                              <td className="pt-2 text-right">
                                Rs. {rx.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {rx.notes && (
                        <p className="text-xs text-gray-500 mt-2 italic">{t('pos.notePrefix')}: {rx.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* M6 — Open shift dialog (settings-gated). */}
      <Dialog open={showOpenShiftDialog} onOpenChange={(open) => { if (!shiftSubmitting) setShowOpenShiftDialog(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-4 h-4" /> Open shift
            </DialogTitle>
            <DialogDescription className="text-xs">
              Count the cash in the drawer at the start of your shift.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3 pt-1"
            onSubmit={(e) => { e.preventDefault(); handleOpenShift(); }}
          >
            <div>
              <Label htmlFor="opening-cash" className="text-xs">Opening cash (Rs.)</Label>
              <Input
                id="opening-cash"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                disabled={shiftSubmitting}
                className="text-lg tabular-nums"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={shiftSubmitting} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {shiftSubmitting ? 'Opening…' : 'Open shift'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* M6 — Close shift + Z-report style summary. */}
      <Dialog open={showCloseShiftDialog} onOpenChange={(open) => { if (!shiftSubmitting) setShowCloseShiftDialog(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-4 h-4" /> Close shift
            </DialogTitle>
            <DialogDescription className="text-xs">
              Count the cash in the drawer at end of shift. Sales totals are computed automatically.
            </DialogDescription>
          </DialogHeader>
          {currentShift && (
            <div className="space-y-3 pt-1">
              <div className="rounded border p-2 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Opened</span><span>{new Date(currentShift.openedAt).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Opening cash</span><span className="tabular-nums">Rs. {currentShift.openingCash.toFixed(2)}</span></div>
              </div>
              <div>
                <Label htmlFor="closing-cash" className="text-xs">Closing cash (Rs.)</Label>
                <Input
                  id="closing-cash"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={closingCashInput}
                  onChange={(e) => setClosingCashInput(e.target.value)}
                  disabled={shiftSubmitting}
                  className="text-lg tabular-nums"
                  autoFocus
                />
              </div>
              <Button onClick={handleCloseShift} disabled={shiftSubmitting} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {shiftSubmitting ? 'Closing…' : 'Close shift'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BranchStockDialog open={showBranchStock} onOpenChange={setShowBranchStock} />

      <FindAlternativesDialog
        open={showAlternatives}
        onOpenChange={setShowAlternatives}
        initialQuery={searchQuery}
        onPick={(id) => { const m = medicines.find((x) => x.id === id); if (m) handleMedicineSelect(m); }}
      />

    </div>
  );
}
