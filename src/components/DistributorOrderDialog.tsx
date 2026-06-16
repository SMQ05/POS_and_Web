// Feature 2 — Distributor-visit auto-PO. For a given distributor, assembles all
// of its mapped medicines that need reordering (stock at/below reorder level,
// minus anything already on order), shows an EDITABLE preview, then on confirm
// creates the PO, opens a wa.me text summary, and emails the PO to the
// distributor. Meant to be opened a day before the distributor's visit.
import { useMemo, useState, useEffect } from 'react';
import { useInventoryStore, useSupplierStore, useAuthStore, useSettingsStore } from '@/store';
import {
  buildReorderPurchase, nextPoNumber, buildPoEmailHtml, whatsappOrderText,
} from '@/lib/reorder';
import { sendPurchaseOrderEmail } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';

interface Line { medicineId: string; name: string; generic: string; stock: number; reorderLevel: number; quantity: number; }

export function DistributorOrderDialog({
  supplierId, open, onOpenChange,
}: {
  supplierId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { medicines, getMedicineStock } = useInventoryStore();
  const { suppliers, medicineSuppliers, purchases, addPurchase } = useSupplierStore();
  const { currentUser, activeBranchId } = useAuthStore();
  const { settings } = useSettingsStore();

  const supplier = suppliers.find((s) => s.id === supplierId);
  const pharmacyName = settings.companyName || 'Our Pharmacy';

  // Quantity already on order per medicine (ordered/partial POs) — avoids
  // double-ordering something a previous PO already covers.
  const pendingByMed = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of purchases) {
      if (p.status !== 'ordered' && p.status !== 'partial') continue;
      for (const it of p.items ?? []) m.set(it.medicineId, (m.get(it.medicineId) ?? 0) + it.quantity);
    }
    return m;
  }, [purchases]);

  // Assemble the proposed lines for this distributor.
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => {
    if (!supplierId || !open) return;
    const mappedIds = new Set(medicineSuppliers.filter((m) => m.supplierId === supplierId).map((m) => m.medicineId));
    const proposed: Line[] = [];
    for (const med of medicines) {
      if (!mappedIds.has(med.id)) continue;
      if (med.reorderActive === false) continue;
      const stock = getMedicineStock(med.id);
      const pending = pendingByMed.get(med.id) ?? 0;
      if (stock + pending > (med.reorderLevel ?? 0)) continue; // already covered
      const qty = med.reorderQuantity > 0 ? med.reorderQuantity : Math.max(1, (med.reorderLevel ?? 0) - stock);
      proposed.push({ medicineId: med.id, name: med.name, generic: med.genericName ?? '', stock, reorderLevel: med.reorderLevel ?? 0, quantity: qty });
    }
    setLines(proposed);
  }, [supplierId, open, medicines, medicineSuppliers, pendingByMed, getMedicineStock]);

  const setQty = (id: string, v: string) => {
    const q = Math.max(0, parseInt(v, 10) || 0);
    setLines((ls) => ls.map((l) => (l.medicineId === id ? { ...l, quantity: q } : l)));
  };
  const removeLine = (id: string) => setLines((ls) => ls.filter((l) => l.medicineId !== id));

  const validLines = lines.filter((l) => l.quantity > 0);

  const placeOrder = async () => {
    if (!supplierId || validLines.length === 0) { toast.error('Nothing to order.'); return; }
    const poNumber = nextPoNumber(purchases.length);
    addPurchase(buildReorderPurchase({
      items: validLines.map((l) => ({ medicineId: l.medicineId, quantity: l.quantity })),
      supplierId,
      branchId: activeBranchId ?? '1',
      poNumber,
      createdBy: currentUser?.id ?? '1',
      note: `Visit-day order for ${supplier?.name ?? 'distributor'}`,
    }));

    const medLines = validLines.map((l) => ({ medicine: medicines.find((m) => m.id === l.medicineId), quantity: l.quantity }));

    // Email the PO to the distributor (if we have an address).
    if (supplier?.email) {
      try {
        await sendPurchaseOrderEmail({
          to: supplier.email,
          subject: `Purchase Order ${poNumber} — ${pharmacyName}`,
          html: buildPoEmailHtml(supplier, poNumber, medLines, pharmacyName),
        });
        toast.success(`PO ${poNumber} created & emailed to ${supplier.name}.`);
      } catch {
        toast.warning(`PO ${poNumber} created, but the email failed to send.`);
      }
    } else {
      toast.success(`PO ${poNumber} created. Add an email to this distributor to send it automatically.`);
    }

    // Open WhatsApp with a text summary (wa.me can't attach files).
    if (supplier?.phone) {
      const text = whatsappOrderText(supplier, poNumber, medLines, pharmacyName);
      const num = supplier.phone.replace(/[^0-9]/g, '');
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank');
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Prepare order — {supplier?.name ?? 'Distributor'}</DialogTitle>
          <DialogDescription>
            Items below this distributor's reorder level (excluding what's already on order). Edit quantities or remove
            lines, then place the order. We'll email the PO{supplier?.phone ? ' and open WhatsApp with a summary' : ''}.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine</TableHead>
                <TableHead>Generic</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Reorder ≤</TableHead>
                <TableHead className="text-right">Order qty</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">Nothing needs reordering from this distributor right now.</TableCell></TableRow>
              ) : lines.map((l) => (
                <TableRow key={l.medicineId}>
                  <TableCell className="font-medium text-sm">{l.name}</TableCell>
                  <TableCell className="text-xs text-gray-500">{l.generic}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{l.stock}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{l.reorderLevel}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" min={0} value={l.quantity} onChange={(e) => setQty(l.medicineId, e.target.value)} className="h-8 w-20 ml-auto text-right" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeLine(l.medicineId)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="text-xs text-gray-500 mr-auto self-center">
            {validLines.length} item(s){supplier?.email ? ` · email ${supplier.email}` : ' · no email on file'}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={placeOrder} disabled={validLines.length === 0} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            {supplier?.phone ? <MessageCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            Place order &amp; notify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
