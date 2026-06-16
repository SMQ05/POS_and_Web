// Item 8 — cashier collect page. Reached by scanning the QR on a "payment
// pending" receipt (/collect/:invoiceNumber). Shows the invoice detail and a
// payment-method picker; collecting marks the pending sale paid.
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSalesStore, useSettingsStore, useInventoryStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const money = (n: number) => `Rs. ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Collect() {
  const { invoiceNumber } = useParams<{ invoiceNumber: string }>();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const dark = settings.theme === 'dark';
  const { sales, updateSale } = useSalesStore();
  const { medicines } = useInventoryStore();
  const medName = (id: string) => medicines.find((m) => m.id === id)?.name ?? 'Item';
  const [method, setMethod] = useState<'cash' | 'card' | 'jazzcash' | 'easypaisa' | 'bank_transfer'>('cash');
  const [done, setDone] = useState(false);

  const sale = sales.find((s) => s.invoiceNumber === invoiceNumber);

  const collect = () => {
    if (!sale) return;
    updateSale(sale.id, {
      status: 'completed',
      paidAmount: sale.totalAmount,
      balanceAmount: 0,
      paymentMethods: [{ method, amount: sale.totalAmount }],
    });
    setDone(true);
    toast.success(`Invoice ${sale.invoiceNumber} collected via ${method.replace('_', ' ')}.`);
  };

  return (
    <div className={cnWrap(dark)}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/pos')}><ArrowLeft className="w-4 h-4" /></Button>
            Collect payment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!sale ? (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="w-10 h-10 mx-auto text-amber-500 mb-2" />
              <p className="font-medium">Invoice {invoiceNumber} not found</p>
              <p className="text-sm">It may not have synced yet — reopen from the POS device that created it.</p>
            </div>
          ) : done || sale.status === 'completed' ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-lg">{sale.invoiceNumber} paid</p>
              <p className="text-gray-500">{money(sale.totalAmount)}</p>
              <Button className="mt-4" onClick={() => navigate('/pos')}>Back to POS</Button>
            </div>
          ) : (
            <>
              <div className="rounded-md border divide-y">
                {sale.items.map((it, i) => (
                  <div key={i} className="flex justify-between px-3 py-2 text-sm">
                    <span>{medName(it.medicineId)} <span className="text-gray-400">× {it.quantity}{it.unitName ? ` ${it.unitName}` : ''}</span></span>
                    <span className="tabular-nums">{money(it.total)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span><span className="tabular-nums">{money(sale.totalAmount)}</span>
              </div>
              {sale.customerName && <p className="text-xs text-gray-500">Customer: {sale.customerName}{sale.customerPhone ? ` · ${sale.customerPhone}` : ''}</p>}
              <div>
                <Label className="text-xs">Payment method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="jazzcash">JazzCash</SelectItem>
                    <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" onClick={collect}>
                Collect {money(sale.totalAmount)} &amp; mark paid
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cnWrap(dark: boolean) {
  return `min-h-screen flex items-center justify-center p-4 ${dark ? 'bg-gray-900' : 'bg-gray-50'}`;
}
