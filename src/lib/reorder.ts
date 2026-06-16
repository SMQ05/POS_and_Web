// Shared reorder-PO builder. Used by the urgent single-medicine reorder
// (feature 3) and the distributor-visit batch PO (feature 2) so both produce an
// identical Purchase shape (status 'ordered', zero pricing — filled in on GRN).
import type { Purchase, Medicine, Supplier } from '@/types';

export function nextPoNumber(existingCount: number): string {
  return `PO-${String(existingCount + 1).padStart(5, '0')}`;
}

/** Resolve a medicine's preferred supplier (primary mapping, else first). */
export function primarySupplierId(
  medicineId: string,
  medicineSuppliers: Array<{ medicineId: string; supplierId: string; isPrimary?: boolean }>,
): string | null {
  const map = medicineSuppliers.find((m) => m.medicineId === medicineId && m.isPrimary)
    ?? medicineSuppliers.find((m) => m.medicineId === medicineId);
  return map?.supplierId ?? null;
}

export function buildReorderPurchase(opts: {
  items: Array<{ medicineId: string; quantity: number }>;
  supplierId: string;
  branchId: string;
  poNumber: string;
  createdBy: string;
  note?: string;
  urgent?: boolean;
}): Purchase {
  const now = new Date();
  const stamp = Date.now();
  return {
    id: `po-${stamp}`,
    purchaseNumber: opts.poNumber,
    supplierId: opts.supplierId,
    branchId: opts.branchId,
    purchaseDate: now,
    items: opts.items.map((it, i) => ({
      id: `pi-${stamp}-${i}`,
      medicineId: it.medicineId,
      batchNumber: '',
      expiryDate: now,
      quantity: it.quantity,
      purchasePrice: 0,
      salePrice: 0,
      mrp: 0,
      discountPercent: 0,
      taxPercent: 0,
      total: 0,
    })),
    subtotal: 0,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 0,
    paidAmount: 0,
    balanceAmount: 0,
    payments: [],
    status: 'ordered',
    notes: opts.note ?? (opts.urgent ? 'Urgent reorder' : 'Auto-created reorder'),
    createdBy: opts.createdBy,
    createdAt: now,
    updatedAt: now,
  } as Purchase;
}

/** WhatsApp order text for a distributor PO (used for wa.me links). */
export function whatsappOrderText(
  supplier: Supplier | undefined,
  poNumber: string,
  lines: Array<{ medicine: Medicine | undefined; quantity: number }>,
  pharmacyName: string,
): string {
  const header = `*Purchase Order ${poNumber}*\nTo: ${supplier?.name ?? 'Distributor'}\nFrom: ${pharmacyName}\n\nPlease supply:`;
  const body = lines
    .map((l, i) => `${i + 1}. ${l.medicine?.name ?? 'Item'}${l.medicine?.strength ? ' ' + l.medicine.strength : ''} — Qty ${l.quantity}`)
    .join('\n');
  return `${header}\n${body}\n\nThank you.`;
}
