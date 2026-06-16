// Feature 4 — customer promise / advance orders (layaway). Customer asks for a
// medicine we don't stock; we take an advance, buy it later (recording cost),
// then settle on hand-over (collect the balance or refund the difference).
import { useState } from 'react';
import { usePromiseOrderStore, useAuthStore, useSettingsStore } from '@/store';
import { settlement } from '@/lib/promiseOrder';
import type { PromiseOrder } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { HandCoins, Plus, ShoppingBag, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const money = (n: number | undefined) =>
  n == null ? '—' : `Rs. ${n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_BADGE: Record<PromiseOrder['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-300',
  purchased: 'bg-blue-100 text-blue-700 border-blue-300',
  settled: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-300',
};

export function PromiseOrders() {
  const { settings } = useSettingsStore();
  const dark = settings.theme === 'dark';
  const { promiseOrders, addPromiseOrder, updatePromiseOrder } = usePromiseOrderStore();
  const { currentUser, activeBranchId } = useAuthStore();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ customerName: '', customerPhone: '', itemName: '', quantity: '1', advanceAmount: '' });

  const [purchaseTarget, setPurchaseTarget] = useState<PromiseOrder | null>(null);
  const [purchaseCost, setPurchaseCost] = useState('');
  const [settleTarget, setSettleTarget] = useState<PromiseOrder | null>(null);
  const [finalPrice, setFinalPrice] = useState('');

  const resetForm = () => setForm({ customerName: '', customerPhone: '', itemName: '', quantity: '1', advanceAmount: '' });

  const create = () => {
    if (!form.customerName.trim() || !form.itemName.trim()) { toast.error('Customer and item are required.'); return; }
    const now = new Date();
    addPromiseOrder({
      id: `pmo-${Date.now()}`,
      branchId: activeBranchId ?? '1',
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim() || undefined,
      itemName: form.itemName.trim(),
      quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
      advanceAmount: Math.max(0, parseFloat(form.advanceAmount) || 0),
      status: 'pending',
      createdBy: currentUser?.id ?? 'system',
      createdAt: now,
      updatedAt: now,
    });
    toast.success('Promise order created — advance recorded.');
    resetForm();
    setShowCreate(false);
  };

  const confirmPurchase = () => {
    if (!purchaseTarget) return;
    const cost = Math.max(0, parseFloat(purchaseCost) || 0);
    updatePromiseOrder(purchaseTarget.id, { status: 'purchased', purchaseCost: cost });
    toast.success('Marked as purchased — ready for hand-over.');
    setPurchaseTarget(null); setPurchaseCost('');
  };

  const confirmSettle = () => {
    if (!settleTarget) return;
    const price = Math.max(0, parseFloat(finalPrice) || 0);
    const { toCollect, toRefund } = settlement(settleTarget.advanceAmount, price);
    updatePromiseOrder(settleTarget.id, { status: 'settled', finalPrice: price });
    toast.success(toRefund > 0 ? `Settled — refund ${money(toRefund)} to customer.` : `Settled — collect ${money(toCollect)} from customer.`);
    setSettleTarget(null); setFinalPrice('');
  };

  const livePreview = settleTarget ? settlement(settleTarget.advanceAmount, parseFloat(finalPrice) || 0) : null;

  const active = promiseOrders.filter((o) => o.status !== 'cancelled');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <HandCoins className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold">Promise Orders</h1>
            <p className="text-xs text-gray-500">Take an advance for an item you don't stock, buy it later, settle on hand-over.</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
          <Plus className="w-4 h-4" /> New promise order
        </Button>
      </div>

      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader><CardTitle className="text-base">Open & recent ({active.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Advance</TableHead>
                <TableHead className="text-right">Our cost</TableHead>
                <TableHead className="text-right">Final price</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promiseOrders.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-gray-500 py-10">No promise orders yet.</TableCell></TableRow>
              ) : promiseOrders.map((o) => {
                const bal = o.finalPrice != null ? settlement(o.advanceAmount, o.finalPrice) : null;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="text-sm">
                      {o.customerName}
                      {o.customerPhone && <span className="block text-xs text-gray-400">{o.customerPhone}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{o.itemName}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{o.quantity}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{money(o.advanceAmount)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{money(o.purchaseCost)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{money(o.finalPrice)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {bal == null ? '—' : bal.toRefund > 0
                        ? <span className="text-red-600">refund {money(bal.toRefund)}</span>
                        : <span className="text-emerald-600">collect {money(bal.toCollect)}</span>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={cn('text-[10px] capitalize', STATUS_BADGE[o.status])}>{o.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {o.status === 'pending' && (
                          <Button variant="ghost" size="sm" className="gap-1 text-blue-700" onClick={() => { setPurchaseTarget(o); setPurchaseCost(o.purchaseCost != null ? String(o.purchaseCost) : ''); }}>
                            <ShoppingBag className="w-3 h-3" /> Purchased
                          </Button>
                        )}
                        {o.status === 'purchased' && (
                          <Button variant="ghost" size="sm" className="gap-1 text-emerald-700" onClick={() => { setSettleTarget(o); setFinalPrice(o.purchaseCost != null ? String(o.purchaseCost) : ''); }}>
                            <CheckCircle2 className="w-3 h-3" /> Settle
                          </Button>
                        )}
                        {(o.status === 'pending' || o.status === 'purchased') && (
                          <Button variant="ghost" size="sm" className="gap-1 text-red-500" onClick={() => { updatePromiseOrder(o.id, { status: 'cancelled' }); toast.message('Promise order cancelled.'); }}>
                            <XCircle className="w-3 h-3" /> Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New promise order</DialogTitle>
            <DialogDescription>Record what the customer wants and the advance you're taking.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Customer name *</Label><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
              <div><Label className="text-xs">Phone</Label><Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Item requested *</Label><Input value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="e.g. Calpol 120mg Suspension" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Quantity</Label><Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              <div><Label className="text-xs">Advance taken (Rs.)</Label><Input type="number" step="0.01" value={form.advanceAmount} onChange={(e) => setForm({ ...form, advanceAmount: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={create} className="bg-emerald-600 hover:bg-emerald-700">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark purchased */}
      <Dialog open={!!purchaseTarget} onOpenChange={(o) => { if (!o) setPurchaseTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as purchased</DialogTitle>
            <DialogDescription>{purchaseTarget?.itemName} for {purchaseTarget?.customerName}. Enter what it cost you.</DialogDescription>
          </DialogHeader>
          <div><Label className="text-xs">Purchase cost (Rs.)</Label><Input type="number" step="0.01" autoFocus value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseTarget(null)}>Cancel</Button>
            <Button onClick={confirmPurchase} className="bg-blue-600 hover:bg-blue-700">Mark purchased</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle */}
      <Dialog open={!!settleTarget} onOpenChange={(o) => { if (!o) setSettleTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle & hand over</DialogTitle>
            <DialogDescription>
              {settleTarget?.itemName} · advance {money(settleTarget?.advanceAmount)}{settleTarget?.purchaseCost != null ? ` · cost ${money(settleTarget.purchaseCost)}` : ''}. Enter the final price charged.
            </DialogDescription>
          </DialogHeader>
          <div><Label className="text-xs">Final price (Rs.)</Label><Input type="number" step="0.01" autoFocus value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} /></div>
          {livePreview && (
            <div className={cn('rounded-md p-3 text-sm', livePreview.toRefund > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
              {livePreview.toRefund > 0
                ? <>Refund to customer: <strong>{money(livePreview.toRefund)}</strong></>
                : <>Collect from customer: <strong>{money(livePreview.toCollect)}</strong></>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)}>Cancel</Button>
            <Button onClick={confirmSettle} className="bg-emerald-600 hover:bg-emerald-700">Settle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
