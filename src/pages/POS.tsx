import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, usePOSStore, useInventoryStore, useCustomerStore, useSalesStore } from '@/store';
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
} from 'lucide-react';
import type { CartItem } from '@/store';
import type { Medicine, Batch, Customer } from '@/types';

export function POS() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { searchMedicines, getBatchesByMedicine } = useInventoryStore();
  const { searchCustomers, addCustomer } = useCustomerStore();
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart, subtotal, taxAmount, total, discountAmount } = usePOSStore();
  const { addSale } = useSalesStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [availableBatches, setAvailableBatches] = useState<Batch[]>([]);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'jazzcash' | 'easypaisa'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', cnic: '' });
  const [isPrescription, setIsPrescription] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Handle medicine selection
  const handleMedicineSelect = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    const medicineBatches = getBatchesByMedicine(medicine.id)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    setAvailableBatches(medicineBatches);
    setShowBatchDialog(true);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Add to cart from batch
  const handleAddFromBatch = (batch: Batch, quantity: number) => {
    if (!selectedMedicine) return;
    
    const cartItem: CartItem = {
      medicineId: selectedMedicine.id,
      medicineName: selectedMedicine.name,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity,
      unitPrice: batch.salePrice,
      mrp: batch.mrp,
      discountPercent: 0,
      taxPercent: settings.defaultTaxRate,
      total: quantity * batch.salePrice,
    };
    
    addToCart(cartItem);
    setShowBatchDialog(false);
    setSelectedMedicine(null);
    setAvailableBatches([]);
    searchInputRef.current?.focus();
  };

  // Handle barcode scan (simulated)
  const handleBarcodeScan = () => {
    // In real app, this would integrate with barcode scanner
    alert('Barcode scanner integration would open here');
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

  // Process payment
  const handleProcessPayment = () => {
    if (cart.length === 0) return;

    const sale = {
      id: Date.now().toString(),
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      branchId: '1',
      customerName: currentCustomer?.name,
      customerPhone: currentCustomer?.phone,
      customerCnic: currentCustomer?.cnic,
      doctorName: isPrescription ? doctorName : undefined,
      prescriptionNumber: isPrescription ? prescriptionNumber : undefined,
      saleDate: new Date(),
      items: cart.map(item => ({
        id: Date.now().toString() + item.medicineId,
        medicineId: item.medicineId,
        batchId: item.batchId,
        batchNumber: item.batchNumber,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
        total: item.total,
        expiryDate: item.expiryDate,
      })),
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount: total,
      paidAmount: paymentMethod === 'cash' ? parseFloat(cashReceived) || total : total,
      balanceAmount: paymentMethod === 'cash' ? (parseFloat(cashReceived) || total) - total : 0,
      paymentMethods: [{
        method: paymentMethod,
        amount: total,
        reference: paymentMethod !== 'cash' ? 'REF' + Date.now().toString().slice(-6) : undefined,
      }],
      status: 'completed' as const,
      isPrescription,
      createdBy: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addSale(sale);
    setShowPaymentDialog(false);
    setShowReceiptDialog(true);
  };

  // Complete sale
  const handleCompleteSale = () => {
    clearCart();
    setCurrentCustomer(null);
    setCashReceived('');
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
              POS Billing
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCustomerDialog(true)}
              className="gap-2"
            >
              <User className="w-4 h-4" />
              {currentCustomer ? currentCustomer.name : 'Add Customer'}
            </Button>
            <Button
              variant={isPrescription ? 'default' : 'outline'}
              onClick={() => setIsPrescription(!isPrescription)}
              className="gap-2"
            >
              <Receipt className="w-4 h-4" />
              Prescription
            </Button>
          </div>
        </div>

        {/* Prescription Fields */}
        {isPrescription && (
          <Card className="mb-4">
            <CardContent className="p-4 flex gap-4">
              <div className="flex-1">
                <Label>Doctor Name</Label>
                <Input
                  placeholder="Enter doctor name"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label>Prescription #</Label>
                <Input
                  placeholder="Enter prescription number"
                  value={prescriptionNumber}
                  onChange={(e) => setPrescriptionNumber(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            ref={searchInputRef}
            placeholder="Search by medicine name, generic name, or barcode..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className={cn(
              'pl-10 pr-12 h-12 text-lg',
              settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
            )}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={handleBarcodeScan}
          >
            <ScanBarcode className="w-5 h-5" />
          </Button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Card className="mb-4 z-10 absolute top-32 left-6 right-[420px] shadow-lg">
            <CardContent className="p-2">
              <ScrollArea className="max-h-64">
                {searchResults.map((medicine) => (
                  <button
                    key={medicine.id}
                    onClick={() => handleMedicineSelect(medicine)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg text-left"
                  >
                    <div>
                      <p className="font-medium">{medicine.name}</p>
                      <p className="text-sm text-gray-500">{medicine.genericName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">Rs. {medicine.reorderQuantity}</p>
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

        {/* Cart Items */}
        <Card className={cn(
          'flex-1',
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Cart Items ({cart.length})</span>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-24rem)]">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <ShoppingCart className="w-16 h-16 mb-4 opacity-30" />
                  <p>Scan or search to add items</p>
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
                        <p className="text-sm text-gray-500">
                          Batch: {item.batchNumber} | Exp: {item.expiryDate.toLocaleDateString()}
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
          Order Summary
        </h2>

        <div className="flex-1 space-y-4">
          <div className="flex justify-between">
            <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              Subtotal
            </span>
            <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              Rs. {subtotal.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              Discount
            </span>
            <span className="text-emerald-500">
              -Rs. {discountAmount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              Tax ({settings.defaultTaxRate}%)
            </span>
            <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              Rs. {taxAmount.toFixed(2)}
            </span>
          </div>
          <Separator />
          <div className="flex justify-between text-xl font-bold">
            <span className={settings.theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              Total
            </span>
            <span className="text-emerald-500">
              Rs. {total.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <Button
            className="w-full h-14 text-lg bg-emerald-500 hover:bg-emerald-600"
            disabled={cart.length === 0}
            onClick={() => setShowPaymentDialog(true)}
          >
            <Banknote className="w-5 h-5 mr-2" />
            Proceed to Payment
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={cart.length === 0}
          >
            <Printer className="w-4 h-4 mr-2" />
            Save & Print Later
          </Button>
        </div>
      </div>

      {/* Batch Selection Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Batch - {selectedMedicine?.name}</DialogTitle>
            <DialogDescription>
              Choose a batch (FIFO - nearest expiry first)
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {availableBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleAddFromBatch(batch, 1)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Batch: {batch.batchNumber}</p>
                      <p className="text-sm text-gray-500">
                        Expiry: {batch.expiryDate.toLocaleDateString()} | 
                        Stock: {batch.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">Rs. {batch.salePrice.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">MRP: Rs. {batch.mrp.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Customer Dialog */}
      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Customer</DialogTitle>
            <DialogDescription>
              Search existing customer or add new
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name, phone, or CNIC..."
                value={customerSearchQuery}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {customerSearchResults.length > 0 && (
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {customerSearchResults.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => handleSelectCustomer(customer)}
                      className="w-full p-3 border rounded-lg hover:bg-gray-50 text-left"
                    >
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-sm text-gray-500">{customer.phone}</p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

            <Separator />

            <div>
              <h4 className="font-medium mb-3">Add New Customer</h4>
              <div className="space-y-3">
                <Input
                  placeholder="Customer Name"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                />
                <Input
                  placeholder="Phone Number"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
                <Input
                  placeholder="CNIC (Optional)"
                  value={newCustomer.cnic}
                  onChange={(e) => setNewCustomer({ ...newCustomer, cnic: e.target.value })}
                />
                <Button onClick={handleAddCustomer} className="w-full">
                  Add Customer
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
            <DialogTitle>Payment</DialogTitle>
            <DialogDescription>
              Total Amount: Rs. {total.toFixed(2)}
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
                  Cash
                </Label>
              </div>
              <div>
                <RadioGroupItem value="card" id="card" className="peer sr-only" />
                <Label
                  htmlFor="card"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500"
                >
                  <CreditCard className="mb-3 h-6 w-6" />
                  Card
                </Label>
              </div>
              <div>
                <RadioGroupItem value="jazzcash" id="jazzcash" className="peer sr-only" />
                <Label
                  htmlFor="jazzcash"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500"
                >
                  <Smartphone className="mb-3 h-6 w-6" />
                  JazzCash
                </Label>
              </div>
              <div>
                <RadioGroupItem value="easypaisa" id="easypaisa" className="peer sr-only" />
                <Label
                  htmlFor="easypaisa"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500"
                >
                  <Smartphone className="mb-3 h-6 w-6" />
                  EasyPaisa
                </Label>
              </div>
            </RadioGroup>

            {paymentMethod === 'cash' && (
              <div>
                <Label>Cash Received</Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  className="text-lg"
                />
                {change > 0 && (
                  <p className="text-emerald-500 font-medium mt-2">
                    Change: Rs. {change.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600"
              onClick={handleProcessPayment}
              disabled={paymentMethod === 'cash' && (parseFloat(cashReceived) || 0) < total}
            >
              <Check className="w-4 h-4 mr-2" />
              Complete Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Payment Successful!</DialogTitle>
          </DialogHeader>

          <div className="text-center py-6">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold">Rs. {total.toFixed(2)}</p>
            <p className="text-gray-500">Invoice #{Date.now().toString().slice(-6)}</p>
          </div>

          <div className="space-y-3">
            <Button className="w-full gap-2">
              <Printer className="w-4 h-4" />
              Print Receipt
            </Button>
            <Button variant="outline" className="w-full gap-2">
              <Receipt className="w-4 h-4" />
              Email Receipt
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleCompleteSale}
            >
              New Sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
