import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, usePOSStore, useInventoryStore, useCustomerStore, useSalesStore, useAuditLogStore, useAuthStore, usePrescriptionStore } from '@/store';
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
} from 'lucide-react';
import { toast } from 'sonner';
import type { CartItem } from '@/store';
import type { Medicine, Batch, Customer, Prescription } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

export function POS() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { searchMedicines, getFEFOBatchesByMedicine, getFEFOSuggestedBatch } = useInventoryStore();
  const { searchCustomers, addCustomer } = useCustomerStore();
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart, subtotal, taxAmount, total, discountAmount, grossProfit } = usePOSStore();
  const { currentUser } = useAuthStore();
  const canSeeProfit = settings.showProfitOnPOS && (currentUser?.role === 'owner' || (currentUser?.role === 'manager' && settings.managerCanSeeProfit));
  const { addSale } = useSalesStore();
  const { addLog } = useAuditLogStore();
  const { prescriptions, addPrescription, linkSale, getByCustomer } = usePrescriptionStore();
  const { t, isRTL } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [availableBatches, setAvailableBatches] = useState<Batch[]>([]);
  const [fefoSuggestedBatchId, setFefoSuggestedBatchId] = useState<string | null>(null);
  const [pendingOverrideBatch, setPendingOverrideBatch] = useState<Batch | null>(null);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showFefoOverrideDialog, setShowFefoOverrideDialog] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false);
  const [customerPrescriptions, setCustomerPrescriptions] = useState<Prescription[]>([]);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'jazzcash' | 'easypaisa'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', cnic: '' });
  const [isPrescription, setIsPrescription] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [paidBy, setPaidBy] = useState<'cashier' | 'seller'>('cashier');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const lastSaleRef = useRef<{ invoiceNumber: string; total: number } | null>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Handle medicine search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      const results = searchMedicines(query);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  // Handle medicine selection — FEFO sorted
  const handleMedicineSelect = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    const fefo = getFEFOBatchesByMedicine(medicine.id);
    setAvailableBatches(fefo);
    const suggested = getFEFOSuggestedBatch(medicine.id);
    setFefoSuggestedBatchId(suggested?.id ?? null);
    // 3-click rule: if only one batch available, skip dialog and add directly
    if (fefo.length === 1 && suggested) {
      handleAddFromBatch(suggested, 1, false, medicine);
    } else if (fefo.length > 1) {
      setShowBatchDialog(true);
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
  const handleAddFromBatch = (batch: Batch, quantity: number, isOverride = false, medicineOverride?: Medicine) => {
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

    const profit = (batch.salePrice - batch.purchasePrice) * quantity;
    const cartItem: CartItem = {
      medicineId: medicine.id,
      medicineName: medicine.name,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity,
      unitPrice: batch.salePrice,
      purchasePrice: batch.purchasePrice,
      lineProfit: profit,
      mrp: batch.mrp,
      discountPercent: 0,
      taxPercent: settings.defaultTaxRate,
      total: quantity * batch.salePrice,
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
    setAvailableBatches([]);
    setFefoSuggestedBatchId(null);
    searchInputRef.current?.focus();
  };

  // Handle barcode scan
  const handleBarcodeScan = () => {
    setBarcodeInput('');
    setShowBarcodeDialog(true);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  // Process barcode lookup
  const handleBarcodeLookup = (barcode: string) => {
    if (!barcode.trim()) return;
    const results = searchMedicines(barcode.trim());
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
    }
  };

  // Save & Print Later — saves as pending sale
  const handleSaveAndPrintLater = () => {
    if (cart.length === 0) return;

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const sale = {
      id: Date.now().toString(),
      invoiceNumber,
      branchId: '1',
      customerName: currentCustomer?.name,
      customerPhone: currentCustomer?.phone,
      customerCnic: currentCustomer?.cnic,
      doctorName: isPrescription ? doctorName : undefined,
      prescriptionNumber: isPrescription ? prescriptionNumber : undefined,
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
    searchInputRef.current?.focus();
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
    const inv = lastSaleRef.current;
    printWindow.document.write(`
      <html>
      <head>
        <title>${t('pos.receipt')} - ${inv?.invoiceNumber ?? ''}</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 16px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; }
          h2 { margin: 4px 0; }
        </style>
      </head>
      <body>
        <div class="center">
          <h2>${settings.companyName || 'PharmaPOS'}</h2>
          <p>${settings.companyAddress || ''}</p>
          <p>${settings.companyPhone || ''}${settings.companyEmail ? ' | ' + settings.companyEmail : ''}</p>
          ${settings.companyNtn ? '<p>' + t('pos.ntn') + ': ' + settings.companyNtn + '</p>' : ''}
        </div>
        <div class="line"></div>
        <div class="row"><span>${t('pos.invoice')}:</span><span class="bold">${inv?.invoiceNumber ?? ''}</span></div>
        <div class="row"><span>${t('pos.dateLabel')}:</span><span>${new Date().toLocaleDateString()}</span></div>
        ${currentCustomer ? '<div class="row"><span>' + t('pos.customer') + ':</span><span>' + currentCustomer.name + '</span></div>' : ''}
        <div class="line"></div>
        ${cart.map(item => '<div class="row"><span>' + item.medicineName + ' x' + item.quantity + '</span><span>Rs. ' + item.total.toFixed(2) + '</span></div>').join('')}
        <div class="line"></div>
        <div class="row"><span>${t('common.subtotal')}:</span><span>Rs. ${subtotal.toFixed(2)}</span></div>
        <div class="row"><span>${t('common.discount')}:</span><span>-Rs. ${discountAmount.toFixed(2)}</span></div>
        <div class="row"><span>${t('pos.taxLine')}:</span><span>Rs. ${taxAmount.toFixed(2)}</span></div>
        <div class="line"></div>
        <div class="row bold"><span>${t('pos.grandTotal')}:</span><span>Rs. ${total.toFixed(2)}</span></div>
        <div class="line"></div>
        <p class="center">${settings.receiptFooterText || t('pos.thankYou')}</p>
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
    const body = encodeURIComponent(
      `${t('pos.receipt')} — ${settings.companyName || 'PharmaPOS'}\n\n` +
      `${t('pos.invoice')}: ${inv?.invoiceNumber ?? ''}\n` +
      `${t('pos.dateLabel')}: ${new Date().toLocaleDateString()}\n` +
      `${currentCustomer ? t('pos.customer') + ': ' + currentCustomer.name + '\n' : ''}` +
      `\n${t('common.items')}:\n` +
      cart.map(item => `  ${item.medicineName} x${item.quantity} — Rs. ${item.total.toFixed(2)}`).join('\n') +
      `\n\n${t('common.subtotal')}: Rs. ${subtotal.toFixed(2)}\n` +
      `${t('common.discount')}: -Rs. ${discountAmount.toFixed(2)}\n` +
      `${t('pos.taxLine')}: Rs. ${taxAmount.toFixed(2)}\n` +
      `${t('pos.grandTotal')}: Rs. ${total.toFixed(2)}\n\n` +
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
          addToCart({
            medicineId: med.id,
            medicineName: med.name,
            batchId: suggestedBatch.id,
            batchNumber: suggestedBatch.batchNumber,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            purchasePrice: suggestedBatch.purchasePrice,
            discountPercent: 0,
            taxPercent: Number(med.taxRate) || 0,
            total: item.unitPrice * item.quantity,
            lineProfit: (item.unitPrice - suggestedBatch.purchasePrice) * item.quantity,
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

  // Process payment
  const handleProcessPayment = () => {
    if (cart.length === 0) return;

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const sale = {
      id: Date.now().toString(),
      invoiceNumber,
      branchId: '1',
      customerName: currentCustomer?.name,
      customerPhone: currentCustomer?.phone,
      customerCnic: currentCustomer?.cnic,
      doctorName: isPrescription ? doctorName : undefined,
      prescriptionNumber: isPrescription ? prescriptionNumber : undefined,
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
      paidAmount: paidBy === 'cashier' ? 0 : (paymentMethod === 'cash' ? parseFloat(cashReceived) || total : total),
      balanceAmount: paidBy === 'cashier' ? total : (paymentMethod === 'cash' ? (parseFloat(cashReceived) || total) - total : 0),
      paymentMethods: paidBy === 'cashier' ? [] : [{
        method: paymentMethod,
        amount: total,
        reference: paymentMethod !== 'cash' ? 'REF' + Date.now().toString().slice(-6) : undefined,
      }],
      status: paidBy === 'cashier' ? 'pending' as const : 'completed' as const,
      isPrescription,
      notes: paidBy === 'cashier' ? 'Collect by Cashier — Pending Payment' : 'Collected by Seller — Paid',
      createdBy: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addSale(sale);
    lastSaleRef.current = { invoiceNumber, total };

    // Save prescription record if prescription sale with customer
    if (isPrescription && currentCustomer) {
      const prescriptionRecord: Prescription = {
        id: 'rx-' + Date.now().toString(),
        customerId: currentCustomer.id,
        customerName: currentCustomer.name,
        doctorName: doctorName || 'Unknown',
        prescriptionNumber: prescriptionNumber || undefined,
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

    // Auto-print if enabled
    if (settings.autoPrintReceipt) {
      setTimeout(() => handlePrintReceipt(), 500);
    }
  };

  // Complete sale
  const handleCompleteSale = () => {
    clearCart();
    setCurrentCustomer(null);
    setCashReceived('');
    setPaidBy('cashier');
    setIsPrescription(false);
    setDoctorName('');
    setPrescriptionNumber('');
    setShowReceiptDialog(false);
    searchInputRef.current?.focus();
  };

  // Calculate change
  const change = paymentMethod === 'cash' ? (parseFloat(cashReceived) || 0) - total : 0;

  return (
    <div className="h-[calc(100vh-4rem)] -m-6 flex">
      {/* Left Panel - Product Search & Cart */}
      <div className="flex-1 flex flex-col p-6">
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
            <CardContent className="p-4 flex gap-4">
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
            </CardContent>
          </Card>
        )}

        {/* Search Bar */}
        <div className="relative mb-4 z-20">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
          <Input
            ref={searchInputRef}
            placeholder={t('pos.searchMedicine')}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className={cn(
              'pl-10 pr-12 h-12 text-lg relative z-0',
              settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
            )}
          />
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
                <ScrollArea className="max-h-64">
                  {searchResults.map((medicine) => (
                    <button
                      key={medicine.id}
                      onClick={() => handleMedicineSelect(medicine)}
                      className={cn(
                        'w-full flex items-center justify-between p-3 rounded-lg text-left',
                        settings.theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                      )}
                    >
                      <div>
                        <p className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>{medicine.name}</p>
                        <p className={cn(
                          'text-sm',
                          settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                        )}>{medicine.genericName}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>Rs. {medicine.reorderQuantity}</p>
                        <Badge variant={medicine.isPrescriptionRequired ? 'destructive' : 'secondary'}>
                          {medicine.isPrescriptionRequired ? 'Rx' : 'OTC'}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
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
                          {t('pos.batchLabel')}: {item.batchNumber}
                          {item.fefoOverride && (
                            <span className="text-amber-600 text-xs font-medium">⚠ {t('pos.override')}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {t('pos.expLabel')}: {new Date(item.expiryDate).toLocaleDateString()}{canSeeProfit && ` | ${t('pos.profitLabel')}: Rs. ${item.lineProfit.toFixed(2)}`}
                        </p>
                        <p className="text-sm text-gray-500">
                          Rs. {item.unitPrice.toFixed(2)} × {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(index, Math.max(1, item.quantity - 1))}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className={cn(
                          'w-8 text-center font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(index, item.quantity + 1)}
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

      {/* Right Panel - Checkout */}
      <div className={cn(
        'w-96 border-l p-6 flex flex-col',
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
              {t('common.discount')}
            </span>
            <span className="text-emerald-500">
              -Rs. {discountAmount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              {t('pos.taxLine', settings.defaultTaxRate)}
            </span>
            <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              Rs. {taxAmount.toFixed(2)}
            </span>
          </div>
          <Separator />
          <div className="flex justify-between text-xl font-bold">
            <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              {t('pos.grandTotal')}
            </span>
            <span className="text-emerald-500">
              Rs. {total.toFixed(2)}
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
          <Button
            className="w-full h-14 text-lg bg-emerald-500 hover:bg-emerald-600"
            disabled={cart.length === 0}
            onClick={() => setShowPaymentDialog(true)}
          >
            <Banknote className="w-5 h-5 mr-2" />
            {t('pos.proceedToPayment')}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={cart.length === 0}
            onClick={handleSaveAndPrintLater}
          >
            <Save className="w-4 h-4 mr-2" />
            {t('pos.savePrintLater')}
          </Button>
        </div>
      </div>

      {/* Batch Selection Dialog — FEFO enforced */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              {t('pos.selectBatch')} — {selectedMedicine?.name}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1">
              <span className="text-emerald-600 font-medium">FEFO</span> — {t('pos.fefoDesc')}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-72">
            <div className="space-y-2">
              {availableBatches.map((batch, idx) => {
                const isSuggested = batch.id === fefoSuggestedBatchId;
                const eb = expiryBadge(batch.expiryDate);
                const profitPU = batch.salePrice - batch.purchasePrice;
                return (
                  <div
                    key={batch.id}
                    className={cn(
                      'p-4 border-2 rounded-lg cursor-pointer transition-all',
                      isSuggested
                        ? 'border-emerald-400 bg-emerald-50 hover:bg-emerald-100'
                        : 'border-gray-200 hover:bg-gray-50'
                    )}
                    onClick={() => handleAddFromBatch(batch, 1)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{batch.batchNumber}</p>
                          {isSuggested && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">
                              {t('pos.fefoSuggested')}
                            </Badge>
                          )}
                          {idx === 0 && !isSuggested && (
                            <Badge variant="secondary" className="text-xs">{t('pos.pickFirst')}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {t('pos.stock')}: <span className="font-medium">{batch.quantity}</span>
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="font-bold text-lg">Rs. {batch.salePrice.toFixed(2)}</p>
                        <span className={cn('text-xs px-2 py-0.5 rounded border', eb.cls)}>
                          {eb.label} {t('pos.left')}
                        </span>
                        <p className="text-xs text-emerald-600">+Rs. {profitPU.toFixed(2)} {t('pos.profitPerUnit')}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('pos.payment')}</DialogTitle>
            <DialogDescription>
              {t('pos.totalAmount')}: Rs. {total.toFixed(2)}
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
            </RadioGroup>

            {paymentMethod === 'cash' && paidBy === 'customer' && (
              <div>
                <Label>{t('pos.cashReceived')}</Label>
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

            {/* Collect By — Cashier or Seller */}
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

            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600"
              onClick={handleProcessPayment}
              disabled={paidBy === 'seller' && paymentMethod === 'cash' && (parseFloat(cashReceived) || 0) < total}
            >
              <Check className="w-4 h-4 mr-2" />
              {paidBy === 'cashier' ? t('pos.saveCollect') : t('pos.completePayment')}
            </Button>
          </div>
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
            <Button className="w-full gap-2" onClick={handlePrintReceipt}>
              <Printer className="w-4 h-4" />
              {t('pos.printReceipt')}
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
                  if (e.key === 'Enter') handleBarcodeLookup(barcodeInput);
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {t('pos.prescriptionsTitle', currentCustomer?.name)}
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
    </div>
  );
}
