import { useState, useMemo, useRef } from 'react';
import { useInventoryStore, usePOSStore, useSettingsStore, useCustomerStore, useSalesStore, usePrescriptionStore, useSupplierStore } from '@/store';
import { verifySalesPin, type VerifiedSalesperson } from '@/lib/backend';
import { useTranslation } from '@/hooks/useTranslation';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search,
  ShoppingCart,
  Pill,
  X,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  User,
  Image as ImageIcon,
  QrCode,
  DollarSign,
  Printer,
  Share2,
  CheckCircle,
  Clock,
  Sparkles,
  Zap,
  ShieldCheck,
  Check,
  Languages
} from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';

interface MobilePOSProps {
  onSetActiveTab: (tab: 'dashboard' | 'pos' | 'inventory' | 'sales' | 'more') => void;
}

export function MobilePOS({ onSetActiveTab }: MobilePOSProps) {
  const { medicines, searchMedicines, getFEFOBatchesByMedicine, getFEFOSuggestedBatch, getMedicineStock } = useInventoryStore();
  const { suppliers } = useSupplierStore();
  const supplierNameById = (id?: string) => (id ? suppliers.find((s) => s.id === id)?.name ?? '' : '');
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart, subtotal, taxAmount, total, discountAmount } = usePOSStore();
  const { settings } = useSettingsStore();
  const { searchCustomers, addCustomer } = useCustomerStore();
  const { addSale } = useSalesStore();
  const { t } = useTranslation();

  // Search & Navigation States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedMedicine, setSelectedMedicine] = useState<any | null>(null);
  
  // Cart & Review Sheets States
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [showBatchDrawer, setShowBatchDrawer] = useState(false);
  const [showRxDrawer, setShowRxDrawer] = useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [showReceiptSheet, setShowReceiptSheet] = useState(false);

  // Stepper & Batch Configs
  const [quantity, setQuantity] = useState(1);
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);

  // Customer State
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  // M8 — mobile quick-add customer sheet. Captures the minimum FBR-safe fields
  // (name + phone) and selects the new row immediately for the current sale.
  const [showCustomerAddSheet, setShowCustomerAddSheet] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerCnic, setNewCustomerCnic] = useState('');

  // Prescription Link State
  const [doctorName, setDoctorName] = useState('');
  const [prescriptionNo, setPrescriptionNo] = useState('');
  const [rxImage, setRxImage] = useState<string | null>(null);

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'jazzcash' | 'easypaisa' | 'bank_transfer'>('cash');
  const [cashReceived, setCashReceived] = useState<string>('');
  
  // Completed Sale State
  const [lastCompletedSale, setLastCompletedSale] = useState<any | null>(null);
  // Salesperson PIN gate — required to record/print every sale.
  const [showSalesPinSheet, setShowSalesPinSheet] = useState(false);
  const [mPinUser, setMPinUser] = useState('');
  const [mPinValue, setMPinValue] = useState('');
  const [mPinError, setMPinError] = useState('');
  const [mPinSubmitting, setMPinSubmitting] = useState(false);

  // Medicine Results Memo
  const medicineList = useMemo(() => {
    const list = medicines.filter(m => m.isActive);
    let filtered = list;

    if (searchQuery.trim().length > 0) {
      filtered = searchMedicines(searchQuery).slice(0, 20);
    }

    if (activeFilter === 'otc') {
      filtered = filtered.filter(m => m.category?.toLowerCase() === 'otc');
    } else if (activeFilter === 'prescription') {
      filtered = filtered.filter(m => m.category?.toLowerCase() === 'prescription' || m.category?.toLowerCase() === 'rx');
    }

    return filtered;
  }, [medicines, searchQuery, activeFilter]);

  // FEFO suggested batch for the selected medicine
  const batchesForSelected = useMemo(() => {
    if (!selectedMedicine) return [];
    return getFEFOBatchesByMedicine(selectedMedicine.id);
  }, [selectedMedicine]);

  const customerResults = useMemo(() => {
    if (!customerSearchQuery.trim()) return [];
    return searchCustomers(customerSearchQuery).slice(0, 5);
  }, [customerSearchQuery]);

  // Handle select medicine -> opens batch config drawer
  const handleSelectMedicine = (med: any) => {
    setSelectedMedicine(med);
    const suggestedBatch = getFEFOSuggestedBatch(med.id);
    setSelectedBatch(suggestedBatch || null);
    
    // Choose base unit
    const baseUnit = med.units?.find((u: any) => u.isBaseUnit && u.isActive) || med.units?.find((u: any) => u.isActive) || null;
    setSelectedUnit(baseUnit);
    setQuantity(1);
    setShowBatchDrawer(true);
  };

  // Stepper increment/decrement
  const incrementQty = () => setQuantity(q => q + 1);
  const decrementQty = () => setQuantity(q => Math.max(1, q - 1));

  // Add Item to cart
  const handleAddToCart = () => {
    if (!selectedMedicine || !selectedBatch) return;

    const defaultTaxRule = settings.taxRules.find((rule: any) => rule.isActive && rule.isDefault)
      ?? settings.taxRules.find((rule: any) => rule.isActive);
    const unitPrice = selectedUnit?.salePrice ?? selectedBatch.salePrice;
    const unitMultiplier = selectedUnit?.multiplier ?? 1;
    const purchasePrice = selectedBatch.purchasePrice * unitMultiplier;
    const profit = (unitPrice - purchasePrice) * quantity;

    const cartItem = {
      medicineId: selectedMedicine.id,
      medicineName: selectedMedicine.name,
      batchId: selectedBatch.id,
      batchNumber: selectedBatch.batchNumber,
      expiryDate: selectedBatch.expiryDate,
      quantity,
      unitName: selectedUnit?.abbreviation || selectedUnit?.name || selectedMedicine.unit,
      unitMultiplier,
      unitPrice,
      purchasePrice,
      lineProfit: profit,
      mrp: selectedBatch.mrp,
      discountPercent: 0,
      taxRuleId: defaultTaxRule?.id,
      taxPercent: defaultTaxRule?.ratePercent ?? settings.defaultTaxRate,
      total: quantity * unitPrice,
      fefoOverride: false, // Simple flow
    };

    addToCart(cartItem);
    setShowBatchDrawer(false);
    setSelectedMedicine(null);
    setSearchQuery('');
    toast.success(`${selectedMedicine.name} added to cart`);
  };

  // Complete sale checkout — gated behind the salesperson PIN (every print must
  // identify who recorded it; the server also requires it for completed sales).
  const handleCompleteCheckout = () => {
    if (cart.length === 0) return;
    setMPinUser(''); setMPinValue(''); setMPinError('');
    setShowSalesPinSheet(true);
  };

  const submitMobilePin = async () => {
    if (mPinSubmitting) return;
    const u = mPinUser.trim();
    if (!u) { setMPinError('Enter your username'); return; }
    if (!/^\d{4}$/.test(mPinValue)) { setMPinError('PIN must be 4 digits'); return; }
    setMPinSubmitting(true); setMPinError('');
    try {
      const verified = await verifySalesPin(u, mPinValue);
      setShowSalesPinSheet(false);
      commitSale(verified);
    } catch (e) {
      setMPinError(e instanceof Error ? e.message : 'PIN verification failed');
      setMPinValue('');
    } finally {
      setMPinSubmitting(false);
    }
  };

  const commitSale = (salesperson: VerifiedSalesperson) => {
    if (cart.length === 0) return;

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const sale = {
      id: Date.now().toString(),
      invoiceNumber,
      branchId: '1',
      salesPersonId: salesperson.userId,
      salesPersonName: salesperson.name,
      customerName: selectedCustomer?.name,
      customerPhone: selectedCustomer?.phone,
      customerCnic: selectedCustomer?.cnic,
      doctorName: doctorName || undefined,
      prescriptionNumber: prescriptionNo || undefined,
      prescriptionImageUrl: rxImage || undefined,
      saleDate: new Date(),
      items: cart.map((item, i) => ({
        id: Date.now().toString() + i,
        medicineId: item.medicineId,
        medicineName: item.medicineName,
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
      })),
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount: total,
      paidAmount: total,
      balanceAmount: 0,
      paymentMethods: [{ method: paymentMethod as 'cash' | 'card' | 'jazzcash' | 'easypaisa' | 'bank_transfer', amount: total }],
      status: 'completed' as const,
      isPrescription: !!doctorName,
      notes: 'Sale recorded on Mobile App',
      createdBy: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
      // FBR details mapping
      fbrStatus: settings.fbrIntegration ? 'submitted' as const : 'not_integrated' as const,
      fbrInvoiceNumber: settings.fbrIntegration ? `FBR-${Date.now().toString().slice(-6)}` : undefined,
      fbrQrPayload: settings.fbrIntegration ? `https://gw.fbr.gov.pk/invoice?no=${Date.now()}` : undefined
    };

    addSale(sale);
    setLastCompletedSale(sale);
    
    // Clear state
    clearCart();
    setSelectedCustomer(null);
    setCustomerSearchQuery('');
    setDoctorName('');
    setPrescriptionNo('');
    setRxImage(null);
    setCashReceived('');

    setShowPaymentSheet(false);
    setShowCartDrawer(false);
    setShowReceiptSheet(true);
    toast.success(`Checkout complete! Invoice ${invoiceNumber}`);
  };

  const getDaysLeft = (expiry: Date) => {
    return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  };

  // M8 — Mobile receipt printing. Native share sheet first (phones offer
  // Print + Save-PDF + email + chat targets out of that). Falls back to
  // opening a print-friendly window when the Web Share API isn't available.
  const handleMobilePrint = async (saleArg: any) => {
    // Refresh from the store so any FBR fields written after sale-completion
    // (real PRAL response, queued retry) make it onto the receipt instead of
    // the snapshot taken at sale time.
    const latest = useSalesStore.getState().sales.find((s) => s.id === saleArg.id);
    const sale = latest ?? saleArg;
    const lines = (sale.items as { medicineName: string; quantity: number; total: number; unitName?: string; unitPrice: number }[])
      .map((i) => `${i.medicineName}\n  ${i.quantity} ${i.unitName ?? 'unit'} x Rs. ${i.unitPrice.toFixed(2)}   Rs. ${i.total.toFixed(2)}`)
      .join('\n');
    const text =
      `${settings.companyName ?? 'Pharmacy'}\n` +
      `Invoice: ${sale.invoiceNumber}\n` +
      `Date: ${new Date(sale.saleDate).toLocaleString()}\n` +
      `─────────────────────\n` +
      `${lines}\n` +
      `─────────────────────\n` +
      `Total: Rs. ${Number(sale.totalAmount).toFixed(2)}` +
      (sale.fbrInvoiceNumber ? `\nFBR: ${sale.fbrInvoiceNumber}` : '');

    // Try the native share sheet — gives the user Print, Save as PDF, AirDrop,
    // chat targets, etc. for free.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: `Receipt ${sale.invoiceNumber}`,
          text,
        });
        return;
      } catch (err) {
        // User dismissed or share failed — fall through to print fallback.
        if ((err as { name?: string }).name === 'AbortError') return;
      }
    }

    // Print fallback for browsers without Web Share. Opens a thermal-ticket-
    // shaped window and triggers the system print dialog (which on mobile
    // includes "Save as PDF").
    const w = window.open('', '_blank', 'width=350,height=620');
    if (!w) { toast.error('Allow pop-ups to print'); return; }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const itemsHtml = (sale.items as { medicineName: string; quantity: number; total: number; unitName?: string; unitPrice: number; discountPercent?: number }[])
      .map((i) => {
        const meta = `${i.quantity} ${i.unitName ?? 'unit'} &times; Rs. ${i.unitPrice.toFixed(2)}`
          + (i.discountPercent && i.discountPercent > 0 ? ` &minus;${i.discountPercent}%` : '');
        return `<div class="item">`
          + `<div class="row" style="font-weight:bold"><span>${esc(i.medicineName)}</span><span>Rs. ${i.total.toFixed(2)}</span></div>`
          + `<div class="row" style="font-size:11px;color:#333"><span>${meta}</span><span></span></div>`
          + `</div>`;
      })
      .join('');
    // §6 — FBR Digital Invoicing block with QR. Mirrors the desktop print
    // template so paper receipts carry the verifiable QR, not just the FBR
    // invoice number.
    const qrValue = sale.fbrQrPayload || sale.fbrInvoiceNumber || '';
    const qrSvg = qrValue
      ? renderToStaticMarkup(<QRCodeSVG value={qrValue} size={200} level="M" includeMargin={false} />)
      : '';
    const fbrBlock = sale.fbrInvoiceNumber
      ? `
        <div class="line"></div>
        <div class="fbr-block">
          <div class="fbr-header">
            <div class="fbr-logo">
              <div class="fbr-logo-label">FBR</div>
              <div class="fbr-logo-sub">DIGITAL INVOICING</div>
            </div>
            <div class="fbr-status">SUBMITTED</div>
          </div>
          <div class="fbr-invno">FBR Invoice: <b>${esc(sale.fbrInvoiceNumber)}</b></div>
          ${qrSvg ? `<div class="fbr-qr">${qrSvg}</div>` : ''}
          <p class="fbr-foot">Verify this invoice on FBR portal using the QR code above.</p>
        </div>
      `
      : '';

    w.document.write(`<html><head><title>Receipt ${esc(sale.invoiceNumber)}</title><style>
      body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 16px; color: #000; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; gap: 8px; }
      h2 { margin: 4px 0; font-size: 16px; }
      .meta { margin: 2px 0; font-size: 11px; }
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
      @media print { body { padding: 0; } }
    </style></head><body>
      <div class="center">
        <h2>${esc(settings.companyName ?? 'Pharmacy')}</h2>
        <p class="meta">Invoice: ${esc(sale.invoiceNumber)}</p>
        <p class="meta">${new Date(sale.saleDate).toLocaleString()}</p>
        ${sale.salesPersonName ? `<p class="meta">Printed by: ${esc(sale.salesPersonName)}</p>` : ''}
      </div>
      <div class="line"></div>
      ${itemsHtml}
      <div class="line"></div>
      <div class="row bold"><span>TOTAL</span><span>Rs. ${Number(sale.totalAmount).toFixed(2)}</span></div>
      ${fbrBlock}
      <div class="line"></div>
      <p class="center meta">Thank you for your purchase!</p>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // WhatsApp share link generator
  const handleShareWhatsApp = (sale: any) => {
    const phone = sale.customerPhone || '03189540997';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone;

    const text = encodeURIComponent(
      `*${settings.companyName} Receipt*\n` +
      `Invoice: *${sale.invoiceNumber}*\n` +
      `Total: *Rs. ${sale.totalAmount.toLocaleString()}*\n\n` +
      `Thank you for your purchase!`
    );

    window.open(`https://wa.me/${formattedPhone}?text=${text}`, '_blank');
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Mobile Checkout POS
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          FEFO-optimized rapid drug sales engine
        </p>
      </div>

      {/* Search & Scan */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search medicine brand or generic..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11 bg-white dark:bg-gray-900 border-gray-150 dark:border-gray-800 rounded-2xl shadow-sm text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-3 text-gray-400 active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter tag capsules */}
      <div className="flex gap-2">
        {['all', 'otc', 'prescription'].map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-semibold border transition-all whitespace-nowrap active:scale-95 capitalize',
              activeFilter === filter
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/10'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-105 dark:border-gray-800'
            )}
          >
            {filter === 'otc' ? 'OTC' : filter === 'prescription' ? 'Rx Prescription' : 'All Meds'}
          </button>
        ))}
      </div>

      {/* Medicines search results */}
      <div className="space-y-3">
        {medicineList.map((med) => {
          const stock = getMedicineStock(med.id);
          const b = getFEFOSuggestedBatch(med.id);
          const expiryText = b ? new Date(b.expiryDate).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : '';
          const distributor = supplierNameById(b?.supplierId);
          // Resolve TP for mobile — same precedence as desktop (batch → medicine → salePrice).
          const tp = b?.tradePrice ?? med.tradePrice ?? null;
          return (
            <div
              key={med.id}
              onClick={() => handleSelectMedicine(med)}
              className="p-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between gap-3 active:bg-gray-50 dark:active:bg-gray-850 cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <Pill className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    {med.name}{med.strength ? ` · ${med.strength}` : ''}
                  </h4>
                  <p className="text-[9px] text-gray-500 dark:text-gray-450 truncate">
                    Stock: {stock} {med.unit}
                    {med.packSize && <> · Pack: {med.packSize}</>}
                  </p>
                  <p className="text-[9px] text-gray-500 dark:text-gray-450 truncate">
                    {expiryText && <span className="text-amber-700">Exp {expiryText}</span>}
                    {distributor && <> · <span className="text-purple-700">{distributor}</span></>}
                    {med.drapRegistration && <> · <span className="text-emerald-700">Reg {med.drapRegistration}</span></>}
                    {tp != null && tp > 0 && <> · <span className="text-emerald-700">TP Rs. {tp.toFixed(2)}</span></>}
                  </p>
                  {(med.shelfLocation || med.rackNumber) && (
                    <p className="text-[9px] text-blue-600 truncate">
                      📍 {[med.rackNumber, med.shelfLocation].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
              <Badge className="bg-emerald-500 text-white flex-shrink-0 text-[10px] font-bold py-0.5 px-2 rounded-full">
                Rs. {b?.salePrice?.toFixed(2) ?? med.units?.[0]?.salePrice ?? 'N/A'}
              </Badge>
            </div>
          );
        })}

        {medicineList.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-10">
            No matching pharmacy drugs found.
          </p>
        )}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-16 inset-x-0 px-6 z-40">
          <button
            onClick={() => setShowCartDrawer(true)}
            className="w-full h-12 rounded-full bg-emerald-500 dark:bg-emerald-600 hover:bg-emerald-600 active:scale-95 transition-all text-white font-bold px-5 flex items-center justify-between shadow-lg shadow-emerald-500/20"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              <span className="text-xs font-semibold">{cart.length} packs in Cart</span>
            </div>
            <span className="text-sm font-black">Rs. {total.toLocaleString()} →</span>
          </button>
        </div>
      )}

      {/* Sheet 1: FEFO Batch & Stepper Selector Drawer */}
      {showBatchDrawer && selectedMedicine && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">{selectedMedicine.name}</h3>
                <p className="text-[10px] text-gray-500">Pick batch and set sales multiplier</p>
              </div>
              <button
                onClick={() => setShowBatchDrawer(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-850 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Select Unit/Multiplier */}
            {selectedMedicine.units && selectedMedicine.units.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Choose packaging unit</span>
                <div className="grid grid-cols-2 gap-2">
                  {selectedMedicine.units.filter((u: any) => u.isActive).map((unit: any) => (
                    <button
                      key={unit.name}
                      onClick={() => setSelectedUnit(unit)}
                      className={cn(
                        'p-2.5 rounded-2xl border text-left active:scale-95 transition-all text-xs font-bold',
                        selectedUnit?.name === unit.name
                          ? 'border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <p>{unit.name} ({unit.abbreviation})</p>
                      <p className="text-[10px] text-gray-400 font-medium">Rs. {unit.salePrice} • Mult: {unit.multiplier}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Choose FEFO Batch */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Select Active Batch (FEFO suggested)</span>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {batchesForSelected.map((batch) => {
                  const daysLeft = getDaysLeft(batch.expiryDate);
                  const isSuggested = selectedBatch?.id === batch.id;
                  return (
                    <button
                      key={batch.id}
                      onClick={() => setSelectedBatch(batch)}
                      className={cn(
                        'w-full p-3 rounded-2xl border flex items-center justify-between text-left active:scale-98 transition-all',
                        isSuggested
                          ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10'
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950'
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-900 dark:text-white">Batch {batch.batchNumber}</span>
                          {isSuggested && (
                            <Badge className="bg-emerald-500 text-white text-[8px] h-3.5 font-extrabold py-0 px-1 rounded">
                              FEFO
                            </Badge>
                          )}
                          {/* M3 — distributor chip so the cashier sees which
                              supplier this batch came from. */}
                          {(() => {
                            const sname = supplierNameById(batch.supplierId);
                            if (!sname) return null;
                            return (
                              <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                                {sname}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">Exp: {new Date(batch.expiryDate).toLocaleDateString()} • Qty: {batch.quantity}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">Rs. {batch.salePrice}</span>
                        <p className="text-[9px] text-amber-500 font-bold">{daysLeft}d left</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Touch Quantity Stepper */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Set Sales Quantity</span>
              <div className="flex items-center gap-4">
                <button
                  onClick={decrementQty}
                  className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-white shadow-sm active:scale-90"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-base font-extrabold text-gray-900 dark:text-white w-6 text-center">{quantity}</span>
                <button
                  onClick={incrementQty}
                  className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-white shadow-sm active:scale-90"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Confirm add to cart */}
            <Button
              onClick={handleAddToCart}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-lg active:scale-98 transition-transform"
            >
              Add to Sale Cart
            </Button>
          </div>
        </div>
      )}

      {/* Sheet 2: Cart Review Drawer */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Review Sale Cart</h3>
                <p className="text-[10px] text-gray-500">Checkout parameters and line discount</p>
              </div>
              <button
                onClick={() => setShowCartDrawer(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-850 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {cart.map((item, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between gap-3 shadow-sm"
                >
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">{item.medicineName}</h4>
                    <p className="text-[9px] text-gray-400">Batch: {item.batchNumber} • Rs.{item.unitPrice} per {item.unitName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Stepper for cart */}
                    <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-full px-2 py-1 border border-gray-150 dark:border-gray-800 shadow-sm">
                      <button
                        onClick={() => updateQuantity(index, Math.max(1, item.quantity - 1))}
                        className="w-5.5 h-5.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold text-gray-800 dark:text-white w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                        className="w-5.5 h-5.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(index)}
                      className="w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center active:scale-90"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Customer Search & Assign block */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Assign Customer Profile</span>
              {selectedCustomer ? (
                <div className="p-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-450">{selectedCustomer.name}</span>
                    <span className="text-[9px] text-gray-400">({selectedCustomer.phone})</span>
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search patient name / phone..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="pl-9 h-10 bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-800 rounded-2xl text-xs"
                  />
                  {customerSearchQuery && (
                    <div className="absolute left-0 right-0 top-11 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl z-50 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerSearchQuery('');
                          }}
                          className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold flex items-center justify-between"
                        >
                          <span>{c.name} ({c.phone})</span>
                          <span className="text-[10px] text-emerald-600">Assign</span>
                        </button>
                      ))}
                      {customerResults.length === 0 && (
                        <div className="p-3 text-center space-y-2">
                          <p className="text-[10px] text-gray-400">No matches.</p>
                          <button
                            type="button"
                            onClick={() => {
                              const q = customerSearchQuery.trim();
                              const isPhone = /^[0-9+\s-]+$/.test(q);
                              setNewCustomerName(isPhone ? '' : q);
                              setNewCustomerPhone(isPhone ? q.replace(/[^0-9+]/g, '') : '');
                              setNewCustomerCnic('');
                              setShowCustomerAddSheet(true);
                            }}
                            className="text-[11px] text-emerald-600 font-semibold"
                          >
                            + Add as new customer
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Prescription linker drawer trigger */}
            <div className="flex items-center justify-between p-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
              <div>
                <p className="text-xs font-bold text-gray-800 dark:text-white">Prescription Attachment</p>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  {doctorName ? `Attached: Dr. ${doctorName}` : 'Add doctor & prescription scan'}
                </p>
              </div>
              <button
                onClick={() => setShowRxDrawer(true)}
                className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] active:scale-95"
              >
                {doctorName ? 'Modify' : 'Attach Rx'}
              </button>
            </div>

            {/* Invoice Summary */}
            <div className="bg-gray-50 dark:bg-gray-950 rounded-2xl p-4 space-y-2 border border-gray-100 dark:border-gray-850">
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>Subtotal:</span>
                <span>Rs. {subtotal.toLocaleString()}</span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>GST (18%):</span>
                  <span>Rs. {taxAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-gray-900 dark:text-white border-t border-dashed border-gray-200 dark:border-gray-800 pt-2">
                <span>Total Amount:</span>
                <span>Rs. {total.toLocaleString()}</span>
              </div>
            </div>

            {/* Checkout Action Button */}
            <Button
              onClick={() => setShowPaymentSheet(true)}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-lg active:scale-98 transition-transform"
            >
              Proceed to Payment
            </Button>
          </div>
        </div>
      )}

      {/* Sheet 3: Prescription linkage Drawer */}
      {showRxDrawer && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-t-gray-200 dark:border-t-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Controlled Rx Attachment</h3>
                <p className="text-[10px] text-gray-500">Record doctor and legal prescriptions</p>
              </div>
              <button
                onClick={() => setShowRxDrawer(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-850 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Doctor Name</span>
                <Input
                  type="text"
                  placeholder="Dr. Muhammad Ali"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className="h-10 bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-800 rounded-2xl text-xs mt-1"
                />
              </div>

              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Prescription Number</span>
                <Input
                  type="text"
                  placeholder="RX-908123"
                  value={prescriptionNo}
                  onChange={(e) => setPrescriptionNo(e.target.value)}
                  className="h-10 bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-800 rounded-2xl text-xs mt-1"
                />
              </div>
            </div>

            <Button
              onClick={() => setShowRxDrawer(false)}
              className="w-full h-11 bg-emerald-500 text-white font-bold rounded-2xl active:scale-98"
            >
              Attach and Return
            </Button>
          </div>
        </div>
      )}

      {/* Sheet 4: Payment Selector Sheet */}
      {/* Salesperson PIN gate — required for every sale/print */}
      {showSalesPinSheet && (
        <div className="fixed inset-0 z-[60] flex flex-end bg-black/60 backdrop-blur-sm">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Salesperson sign-in</h3>
                <p className="text-[10px] text-gray-500">Enter your username + 4-digit PIN to record this sale</p>
              </div>
              <button onClick={() => setShowSalesPinSheet(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-850 flex items-center justify-center text-gray-500 active:scale-90">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Input placeholder="Username" value={mPinUser} onChange={(e) => setMPinUser(e.target.value)} autoFocus />
              <Input
                type="password" inputMode="numeric" maxLength={4} placeholder="4-digit PIN"
                value={mPinValue}
                onChange={(e) => setMPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitMobilePin(); }}
              />
              {mPinError && <p className="text-xs text-red-500">{mPinError}</p>}
              <Button className="w-full" disabled={mPinSubmitting} onClick={submitMobilePin}>
                {mPinSubmitting ? 'Verifying…' : 'Confirm & record sale'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPaymentSheet && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-t-gray-200 dark:border-t-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Record Payment</h3>
                <p className="text-[10px] text-gray-500">Pick payment route and compute change</p>
              </div>
              <button
                onClick={() => setShowPaymentSheet(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-850 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Choose payment gateway</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Cash in hand' },
                  { id: 'card', label: 'Visa Card' },
                  { id: 'easypaisa', label: 'EasyPaisa' },
                  { id: 'jazzcash', label: 'JazzCash' },
                  { id: 'bank_transfer', label: 'Bank Pay' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPaymentMethod(item.id as any)}
                    className={cn(
                      'p-2.5 rounded-2xl border text-center font-bold text-[10px] transition-all active:scale-95',
                      paymentMethod === item.id
                        ? 'border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                        : 'border-gray-100 dark:border-gray-850 bg-gray-50 dark:bg-gray-950 text-gray-600 dark:text-gray-300'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Cash change calculator (only for cash payment) */}
            {paymentMethod === 'cash' && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Cash Change Calculator</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[9px] text-gray-400 font-medium">Cash Received (Rs)</span>
                    <Input
                      type="number"
                      placeholder="e.g. 1000"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="h-10 bg-gray-50 dark:bg-gray-950 border-gray-100 dark:border-gray-800 rounded-2xl text-xs mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 font-medium">Return Cash (Rs)</span>
                    <div className="h-10 bg-gray-100 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-2xl text-xs mt-1 flex items-center px-3 font-extrabold text-emerald-600 dark:text-emerald-450">
                      Rs. {cashReceived ? Math.max(0, parseFloat(cashReceived) - total).toLocaleString() : '0'}
                    </div>
                  </div>
                </div>

                {/* Quick cash received triggers */}
                <div className="flex gap-2 pt-1.5">
                  {[500, 1000, 5000].map((quick) => (
                    <button
                      key={quick}
                      onClick={() => setCashReceived(quick.toString())}
                      className="px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-[10px] font-bold active:scale-95"
                    >
                      Rs. {quick}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Proceed/Finalize transaction */}
            <Button
              onClick={handleCompleteCheckout}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-lg active:scale-98 transition-transform"
            >
              Complete Sale & Record Bill
            </Button>
          </div>
        </div>
      )}

      {/* M8 — Quick-add customer sheet (mobile). Minimum fields for FBR safety. */}
      {showCustomerAddSheet && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Add new customer</h3>
              <button
                onClick={() => setShowCustomerAddSheet(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Name</label>
                <Input
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="h-10 rounded-xl"
                  placeholder="Patient name"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Phone</label>
                <Input
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value.replace(/[^0-9+\s-]/g, ''))}
                  className="h-10 rounded-xl"
                  placeholder="e.g. 03001234567"
                  inputMode="tel"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">CNIC (optional)</label>
                <Input
                  value={newCustomerCnic}
                  onChange={(e) => setNewCustomerCnic(e.target.value.replace(/[^0-9-]/g, ''))}
                  className="h-10 rounded-xl"
                  placeholder="XXXXX-XXXXXXX-X"
                  inputMode="numeric"
                />
              </div>
            </div>
            <button
              onClick={() => {
                const name = newCustomerName.trim();
                const phone = newCustomerPhone.trim();
                if (!name) { toast.error('Name required'); return; }
                if (phone.length < 7) { toast.error('Phone too short'); return; }
                const created: any = {
                  id: `c-${Date.now()}`,
                  name,
                  phone,
                  cnic: newCustomerCnic.trim() || undefined,
                  totalPurchases: 0,
                  loyaltyPoints: 0,
                  isActive: true,
                  createdAt: new Date(),
                };
                addCustomer(created);
                setSelectedCustomer(created);
                setCustomerSearchQuery('');
                setShowCustomerAddSheet(false);
                setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerCnic('');
                toast.success(`Customer "${name}" added`);
              }}
              className="w-full h-12 rounded-2xl bg-emerald-500 text-white font-bold active:scale-95"
            >
              Add & assign
            </button>
          </div>
        </div>
      )}

      {/* Sheet 5: Shareable Mobile Receipt */}
      {showReceiptSheet && lastCompletedSale && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-t-gray-200 dark:border-t-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Sale Recorded!</h3>
              </div>
              <button
                onClick={() => setShowReceiptSheet(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-850 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Summary card */}
            <div className="border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-950 p-4 font-mono text-[11px] text-gray-800 dark:text-gray-300 space-y-2">
              <div className="text-center pb-2">
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">{settings.companyName}</h4>
                <p className="text-[9px] text-gray-500">INV: {lastCompletedSale.invoiceNumber}</p>
                <p className="text-[9px] text-gray-500">DATE: {new Date(lastCompletedSale.saleDate).toLocaleTimeString()}</p>
              </div>

              <div className="space-y-1 py-1">
                {lastCompletedSale.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-[10px]">
                    <span className="truncate">{item.medicineName} x{item.quantity}</span>
                    <span>Rs. {item.total}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-gray-250 dark:border-gray-800 my-1 pt-2" />

              <div className="flex justify-between font-bold text-gray-900 dark:text-white text-[11px]">
                <span>GRAND TOTAL:</span>
                <span>Rs. {lastCompletedSale.totalAmount.toLocaleString()}</span>
              </div>

              {/* FBR digital compliance section */}
              {lastCompletedSale.fbrStatus && lastCompletedSale.fbrStatus !== 'not_integrated' && (
                <div className="mt-4 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-center space-y-1.5">
                  <p className="font-bold text-emerald-600 text-[8px] uppercase tracking-widest flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> FBR PRAL Digital Invoice Submitted
                  </p>
                  <p className="text-[8px] text-gray-500 break-all select-all font-mono">Invoice Ref: {lastCompletedSale.fbrInvoiceNumber}</p>
                  <div className="flex justify-center p-1 bg-white inline-block mx-auto rounded shadow-sm">
                    <QRCodeSVG value={lastCompletedSale.fbrQrPayload || lastCompletedSale.fbrInvoiceNumber || ''} size={64} level="M" />
                  </div>
                </div>
              )}
            </div>

            {/* Sharing Bar */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleShareWhatsApp(lastCompletedSale)}
                className="h-12 rounded-2xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Share2 className="w-5 h-5" />
                WhatsApp Rx
              </button>

              <button
                onClick={() => handleMobilePrint(lastCompletedSale)}
                className="h-12 rounded-2xl bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-850 text-gray-700 dark:text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Printer className="w-5 h-5" />
                Print / Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
