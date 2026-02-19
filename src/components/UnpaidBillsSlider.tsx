import { useState, useRef } from 'react';
import { useSalesStore, useSettingsStore } from '@/store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  ScanBarcode,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Clock,
  FileText,
  ChevronRight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Sale } from '@/types';

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'jazzcash', label: 'JazzCash', icon: Smartphone },
  { value: 'easypaisa', label: 'Easypaisa', icon: Smartphone },
] as const;

export function UnpaidBillsSlider() {
  const { settings } = useSettingsStore();
  const { sales, updateSale } = useSalesStore();
  const dark = settings.theme === 'dark';

  const [searchQuery, setSearchQuery] = useState('');
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [payingBill, setPayingBill] = useState<Sale | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get all unpaid / pending bills
  const unpaidBills = sales.filter(
    (s) => s.status === 'pending' && s.paidAmount < s.totalAmount
  );

  // Filter by search
  const filteredBills = searchQuery.trim()
    ? unpaidBills.filter(
        (b) =>
          b.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.customerPhone?.includes(searchQuery)
      )
    : unpaidBills;

  // Barcode scan handler
  const handleBarcodeScan = () => {
    const code = barcodeInput.trim();
    if (!code) return;
    const match = unpaidBills.find(
      (b) => b.invoiceNumber.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      setSearchQuery(code);
      setShowBarcodeDialog(false);
      setBarcodeInput('');
      toast.success(`Found bill ${match.invoiceNumber}`);
    } else {
      toast.error('No unpaid bill found with that invoice number');
    }
  };

  // Mark as paid
  const handleMarkPaid = () => {
    if (!payingBill) return;
    updateSale(payingBill.id, {
      status: 'completed',
      paidAmount: payingBill.totalAmount,
      balanceAmount: 0,
      paymentMethods: [
        {
          method: paymentMethod as any,
          amount: payingBill.totalAmount,
        },
      ],
    });
    toast.success(
      `Bill ${payingBill.invoiceNumber} marked as paid via ${paymentMethod}`
    );
    setPayingBill(null);
    setPaymentMethod('cash');
  };

  return (
    <>
      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <CardTitle className={cn('text-lg', dark ? 'text-white' : '')}>
                Unpaid Bills
              </CardTitle>
              <Badge
                variant={unpaidBills.length > 0 ? 'destructive' : 'secondary'}
              >
                {unpaidBills.length}
              </Badge>
            </div>
          </div>

          {/* Search bar + barcode scanner */}
          <div className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                ref={searchInputRef}
                placeholder="Search by invoice #, customer name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  'pl-9',
                  dark && 'bg-gray-700 border-gray-600 text-white'
                )}
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              className="gap-2 shrink-0"
              onClick={() => setShowBarcodeDialog(true)}
            >
              <ScanBarcode className="w-4 h-4" />
              Scan
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {filteredBills.length === 0 ? (
            <div
              className={cn(
                'text-center py-8',
                dark ? 'text-gray-400' : 'text-gray-500'
              )}
            >
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p className="font-medium">
                {unpaidBills.length === 0
                  ? 'All bills are paid!'
                  : 'No bills match your search.'}
              </p>
            </div>
          ) : (
            <Carousel
              opts={{ align: 'start', loop: false }}
              className="w-full"
            >
              <CarouselContent className="-ml-2">
                {filteredBills.map((bill) => (
                  <CarouselItem
                    key={bill.id}
                    className="pl-2 basis-full sm:basis-1/2 lg:basis-1/3"
                  >
                    <div
                      className={cn(
                        'rounded-xl border p-4 h-full flex flex-col justify-between transition-all hover:shadow-md cursor-pointer',
                        dark
                          ? 'bg-gray-700 border-gray-600 hover:border-amber-500'
                          : 'bg-white border-gray-200 hover:border-amber-400'
                      )}
                      onClick={() => {
                        setPayingBill(bill);
                        setPaymentMethod('cash');
                      }}
                    >
                      {/* Header */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FileText
                              className={cn(
                                'w-4 h-4',
                                dark ? 'text-gray-400' : 'text-gray-500'
                              )}
                            />
                            <span
                              className={cn(
                                'font-mono text-sm font-semibold',
                                dark ? 'text-white' : 'text-gray-900'
                              )}
                            >
                              {bill.invoiceNumber}
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-300 bg-amber-50"
                          >
                            Unpaid
                          </Badge>
                        </div>

                        {/* Customer info */}
                        <p
                          className={cn(
                            'text-sm mb-1',
                            dark ? 'text-gray-300' : 'text-gray-700'
                          )}
                        >
                          {bill.customerName || 'Walk-in Customer'}
                        </p>
                        {bill.customerPhone && (
                          <p className="text-xs text-gray-500">
                            {bill.customerPhone}
                          </p>
                        )}

                        {/* Items summary */}
                        <p className="text-xs text-gray-500 mt-2">
                          {bill.items.length} item
                          {bill.items.length !== 1 ? 's' : ''}
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500">Due Amount</p>
                          <p
                            className={cn(
                              'text-lg font-bold',
                              dark ? 'text-white' : 'text-gray-900'
                            )}
                          >
                            Rs.{' '}
                            {(bill.totalAmount - bill.paidAmount).toLocaleString(
                              'en-PK',
                              { maximumFractionDigits: 0 }
                            )}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPayingBill(bill);
                            setPaymentMethod('cash');
                          }}
                        >
                          Pay Now
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </div>

                      {/* Time */}
                      <p className="text-[10px] text-gray-400 mt-2 text-right">
                        {new Date(bill.saleDate).toLocaleTimeString('en-PK', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {filteredBills.length > 1 && (
                <>
                  <CarouselPrevious className="-left-3 top-1/2" />
                  <CarouselNext className="-right-3 top-1/2" />
                </>
              )}
            </Carousel>
          )}
        </CardContent>
      </Card>

      {/* ── Barcode Scan Dialog ── */}
      <Dialog open={showBarcodeDialog} onOpenChange={setShowBarcodeDialog}>
        <DialogContent className={cn(dark && 'bg-gray-800 border-gray-700')}>
          <DialogHeader>
            <DialogTitle className={dark ? 'text-white' : ''}>
              Scan Invoice Barcode
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className={cn('text-sm', dark ? 'text-gray-400' : 'text-gray-600')}>
              Scan the barcode on the printed invoice, or type the invoice number
              manually.
            </p>
            <Input
              autoFocus
              placeholder="Scan or type invoice number..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBarcodeScan()}
              className={cn(dark && 'bg-gray-700 border-gray-600 text-white')}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBarcodeDialog(false);
                  setBarcodeInput('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleBarcodeScan} className="bg-emerald-500 hover:bg-emerald-600">
                Search
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payment Dialog ── */}
      <Dialog
        open={!!payingBill}
        onOpenChange={(open) => !open && setPayingBill(null)}
      >
        <DialogContent className={cn('max-w-md', dark && 'bg-gray-800 border-gray-700')}>
          <DialogHeader>
            <DialogTitle className={dark ? 'text-white' : ''}>
              Collect Payment
            </DialogTitle>
          </DialogHeader>

          {payingBill && (
            <div className="space-y-5">
              {/* Bill summary */}
              <div
                className={cn(
                  'rounded-lg p-4',
                  dark ? 'bg-gray-700' : 'bg-gray-50'
                )}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={cn('text-sm font-medium', dark ? 'text-gray-300' : 'text-gray-600')}>
                    Invoice
                  </span>
                  <span className={cn('font-mono font-semibold', dark ? 'text-white' : 'text-gray-900')}>
                    {payingBill.invoiceNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className={cn('text-sm', dark ? 'text-gray-300' : 'text-gray-600')}>
                    Customer
                  </span>
                  <span className={cn('text-sm', dark ? 'text-white' : 'text-gray-900')}>
                    {payingBill.customerName || 'Walk-in'}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className={cn('text-sm', dark ? 'text-gray-300' : 'text-gray-600')}>
                    Items
                  </span>
                  <span className={cn('text-sm', dark ? 'text-white' : 'text-gray-900')}>
                    {payingBill.items.length}
                  </span>
                </div>
                <div className="border-t border-dashed my-2" />
                <div className="flex justify-between items-center">
                  <span className={cn('font-semibold', dark ? 'text-gray-200' : 'text-gray-800')}>
                    Total Due
                  </span>
                  <span className="text-xl font-bold text-emerald-600">
                    Rs.{' '}
                    {(payingBill.totalAmount - payingBill.paidAmount).toLocaleString(
                      'en-PK',
                      { maximumFractionDigits: 0 }
                    )}
                  </span>
                </div>
              </div>

              {/* Payment method chooser */}
              <div>
                <Label className={cn('mb-2 block', dark ? 'text-gray-300' : '')}>
                  Payment Method
                </Label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={setPaymentMethod}
                  className="grid grid-cols-2 gap-2"
                >
                  {PAYMENT_OPTIONS.map((opt) => (
                    <Label
                      key={opt.value}
                      htmlFor={`pay-${opt.value}`}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-all',
                        paymentMethod === opt.value
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                          : dark
                            ? 'border-gray-600 hover:border-gray-500'
                            : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <RadioGroupItem
                        value={opt.value}
                        id={`pay-${opt.value}`}
                        className="sr-only"
                      />
                      <opt.icon
                        className={cn(
                          'w-4 h-4',
                          paymentMethod === opt.value
                            ? 'text-emerald-600'
                            : dark ? 'text-gray-400' : 'text-gray-500'
                        )}
                      />
                      <span
                        className={cn(
                          'text-sm font-medium',
                          paymentMethod === opt.value
                            ? 'text-emerald-700'
                            : dark ? 'text-gray-300' : 'text-gray-700'
                        )}
                      >
                        {opt.label}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPayingBill(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
                  onClick={handleMarkPaid}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark as Paid
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
