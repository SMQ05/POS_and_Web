// Damage / waste disposition for a single batch — the manual counterpart to the
// expiry-driven flow on the Alerts page. Lets staff either return a batch to the
// supplier (posts a PurchaseReturn → stock down + ledger credit) or write it off
// (posts an Expense → loss), tagging the reason as damage or waste. Whole-batch,
// matching the expiry disposition behaviour. Reused anywhere a batch is shown.
import { useState, useEffect } from 'react';
import { useSupplierStore, useExpenseStore, useInventoryStore, useAuthStore } from '@/store';
import type { Batch } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

type Reason = 'damage' | 'waste';
type Action = 'return' | 'writeoff';

export function BatchDispositionDialog({
  batch, medicineName, open, onOpenChange,
}: {
  batch: Batch | null;
  medicineName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { medicineSuppliers, suppliers, addPurchaseReturn } = useSupplierStore();
  const { addExpense } = useExpenseStore();
  const { updateBatch } = useInventoryStore();
  const { currentUser } = useAuthStore();

  const [reason, setReason] = useState<Reason>('damage');
  const [action, setAction] = useState<Action>('return');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  // Default the value to the batch's purchase cost whenever a new batch opens.
  useEffect(() => {
    if (batch) {
      setValue(String(Math.max(0, (batch.quantity || 0) * (batch.purchasePrice || 0))));
      setNote('');
      setReason('damage');
      setAction('return');
    }
  }, [batch]);

  if (!batch) return null;

  const supplierFor = (b: Batch): string => {
    if (b.supplierId) return b.supplierId;
    const map = medicineSuppliers.find((m) => m.medicineId === b.medicineId && m.isPrimary)
      ?? medicineSuppliers.find((m) => m.medicineId === b.medicineId);
    return map?.supplierId ?? '';
  };
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? 'supplier';

  const confirm = () => {
    const v = Math.max(0, parseFloat(value) || 0);
    const trimmed = note.trim();
    const label = reason === 'damage' ? 'Damaged' : 'Wasted';

    if (action === 'return') {
      const supplierId = supplierFor(batch);
      if (!supplierId) { toast.error('No supplier mapped for this medicine — write it off instead.'); return; }
      addPurchaseReturn({
        id: `pr-${Date.now()}`,
        returnNumber: `RET-${String(Date.now()).slice(-6)}`,
        supplierId,
        purchaseId: batch.purchaseId || undefined,
        returnDate: new Date(),
        items: [{
          medicineId: batch.medicineId,
          medicineName,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: batch.quantity,
          unitPrice: batch.purchasePrice || 0,
          total: v,
          reason: `${label} stock`,
        }],
        totalAmount: v,
        reason: trimmed || `${label} stock returned to supplier`,
        stockAdjusted: true,
        status: 'posted',
        notes: trimmed || undefined,
        createdBy: currentUser?.id ?? 'system',
        createdAt: new Date(),
      });
      updateBatch(batch.id, { quantity: 0, disposition: 'returned', dispositionReason: reason, dispositionValue: v, dispositionNote: trimmed, dispositionAt: new Date() });
      toast.success(`Returned to ${supplierName(supplierId)} — Rs. ${v.toLocaleString('en-PK')} credited.`);
    } else {
      addExpense({
        id: `exp-${Date.now()}`,
        category: 'other',
        description: `Stock write-off: ${medicineName} batch ${batch.batchNumber} (${reason}) — ${batch.quantity} units${trimmed ? ` — ${trimmed}` : ''}`,
        amount: v,
        date: new Date(),
        createdBy: currentUser?.id ?? 'system',
        createdAt: new Date(),
      });
      updateBatch(batch.id, { quantity: 0, disposition: 'disposed', dispositionReason: reason, dispositionValue: v, dispositionNote: trimmed, dispositionAt: new Date() });
      toast.success(`Written off — Rs. ${v.toLocaleString('en-PK')} recorded as loss.`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return / Write-off batch</DialogTitle>
          <DialogDescription>
            {medicineName} · batch {batch.batchNumber} · {batch.quantity} units in stock. The whole batch is removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Damaged</SelectItem>
                  <SelectItem value="waste">Wasted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={(v) => setAction(v as Action)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="return">Return to supplier (credit)</SelectItem>
                  <SelectItem value="writeoff">Write off (loss)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">{action === 'return' ? 'Credit value (Rs.)' : 'Loss value (Rs.)'}</Label>
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — what happened" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} className={action === 'return' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}>
            {action === 'return' ? 'Return to supplier' : 'Write off'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
