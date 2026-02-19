import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore, useSupplierStore, useInventoryStore, useAuthStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ClipboardList,
  Plus,
  Search,
  Eye,
  Trash2,
  PackageCheck,
  ShoppingBag,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import type { Purchase, PurchaseItem, PurchaseStatus } from '@/types';

interface FormItem {
  medicineId: string;
  quantity: number;
}

interface ReceiveItem {
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  mrp: number;
}

export function PurchaseOrders() {
  const { settings } = useSettingsStore();
  const { suppliers, purchases, addPurchase, updatePurchase, deletePurchase } = useSupplierStore();
  const { medicines, addBatch, getMedicineStock } = useInventoryStore();
  const { currentUser } = useAuthStore();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // UI state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState<Purchase | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Create/Edit form
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [medicineSearch, setMedicineSearch] = useState('');

  // Receive form
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([]);

  // Auto-open from Alerts page URL (?medicine=id&qty=N)
  useEffect(() => {
    const medicineId = searchParams.get('medicine');
    const qty = searchParams.get('qty');
    if (medicineId) {
      const med = medicines.find(m => m.id === medicineId);
      if (med) {
        setFormItems([{
          medicineId: med.id,
          quantity: parseInt(qty || String(med.reorderQuantity)) || 1,
        }]);
        setShowCreateDialog(true);
        setSearchParams({});
      }
    }
  }, []);

  // ─── Helpers ─────────────────────────────────────────
  const getSupplierName = (id: string) =>
    suppliers.find(s => s.id === id)?.name || '—';

  const getMedicineName = (id: string) =>
    medicines.find(m => m.id === id)?.name || '—';

  const generatePONumber = () =>
    `PO-${String(purchases.length + 1).padStart(5, '0')}`;

  /** Total pending order qty for a given medicine across draft/ordered POs */
  const getMedicinePendingQty = (medicineId: string) =>
    purchases
      .filter(p => p.status === 'ordered' || p.status === 'draft')
      .flatMap(p => p.items)
      .filter(i => i.medicineId === medicineId)
      .reduce((s, i) => s + i.quantity, 0);

  // ─── Filter & Stats ──────────────────────────────────
  const filtered = purchases
    .filter(p => {
      const matchSearch =
        !search ||
        p.purchaseNumber.toLowerCase().includes(search.toLowerCase()) ||
        getSupplierName(p.supplierId).toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const now = new Date();
  const stats = {
    total: purchases.length,
    pending: purchases.filter(p => p.status === 'draft' || p.status === 'ordered').length,
    receivedMonth: purchases.filter(
      p =>
        p.status === 'received' &&
        new Date(p.updatedAt).getMonth() === now.getMonth() &&
        new Date(p.updatedAt).getFullYear() === now.getFullYear()
    ).length,
    totalValue: purchases
      .filter(p => p.status !== 'cancelled')
      .reduce((s, p) => s + p.totalAmount, 0),
  };

  // ─── Medicine search results ─────────────────────────
  const searchResults =
    medicineSearch.length > 1
      ? medicines
          .filter(
            m =>
              m.isActive &&
              !formItems.find(i => i.medicineId === m.id) &&
              (m.name.toLowerCase().includes(medicineSearch.toLowerCase()) ||
                m.genericName.toLowerCase().includes(medicineSearch.toLowerCase()) ||
                m.barcode?.includes(medicineSearch))
          )
          .slice(0, 8)
      : [];

  // ─── Form actions ────────────────────────────────────
  const handleAddItem = (medicineId: string) => {
    if (formItems.find(i => i.medicineId === medicineId)) return;
    const med = medicines.find(m => m.id === medicineId);
    setFormItems([
      ...formItems,
      {
        medicineId,
        quantity: med?.reorderQuantity || 1,
      },
    ]);
    setMedicineSearch('');
  };

  const handleRemoveItem = (idx: number) =>
    setFormItems(formItems.filter((_, i) => i !== idx));

  const handleUpdateItem = (idx: number, field: keyof FormItem, value: number) => {
    const items = [...formItems];
    (items[idx] as any)[field] = value;
    setFormItems(items);
  };

  const resetForm = () => {
    setShowCreateDialog(false);
    setFormSupplierId('');
    setFormNotes('');
    setFormItems([]);
    setMedicineSearch('');
    setSelectedPO(null);
    setEditMode(false);
  };

  // ─── Save PO ─────────────────────────────────────────
  const handleSavePO = (status: PurchaseStatus) => {
    if (!formSupplierId || formItems.length === 0) {
      toast.error(t('purchaseOrders.validationError'));
      return;
    }

    const items: PurchaseItem[] = formItems.map((item, idx) => ({
      id: `pi-${Date.now()}-${idx}`,
      medicineId: item.medicineId,
      batchNumber: '',
      expiryDate: new Date(),
      quantity: item.quantity,
      purchasePrice: 0,
      salePrice: 0,
      mrp: 0,
      discountPercent: 0,
      taxPercent: 0,
      total: 0,
    }));

    const subtotal = items.reduce((s, i) => s + i.total, 0);

    if (editMode && selectedPO) {
      updatePurchase(selectedPO.id, {
        supplierId: formSupplierId,
        items,
        subtotal,
        totalAmount: subtotal,
        status,
        notes: formNotes,
      });
      toast.success(t('purchaseOrders.orderUpdated'));
    } else {
      const po: Purchase = {
        id: `po-${Date.now()}`,
        purchaseNumber: generatePONumber(),
        supplierId: formSupplierId,
        branchId: '1',
        purchaseDate: new Date(),
        items,
        subtotal,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: subtotal,
        paidAmount: 0,
        balanceAmount: subtotal,
        status,
        notes: formNotes,
        createdBy: currentUser?.id || '1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      addPurchase(po);
      toast.success(t('purchaseOrders.orderCreated'));
    }
    resetForm();
  };

  // ─── Receive PO (creates batches in inventory) ──────
  const handleReceivePO = () => {
    if (!selectedPO) return;

    // Validate all items have batch number, expiry, and purchase price
    const incomplete = receiveItems.some(i => !i.batchNumber || !i.expiryDate || i.purchasePrice <= 0);
    if (incomplete) {
      toast.error(t('purchaseOrders.receiveValidation'));
      return;
    }

    receiveItems.forEach(item => {
      addBatch({
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        medicineId: item.medicineId,
        batchNumber: item.batchNumber,
        expiryDate: new Date(item.expiryDate),
        quantity: item.quantity,
        purchasePrice: item.purchasePrice,
        salePrice: item.salePrice,
        mrp: item.mrp,
        supplierId: selectedPO.supplierId,
        purchaseId: selectedPO.id,
        isActive: true,
        createdAt: new Date(),
      });
    });

    // Update PO items with final prices and recalculate totals
    const updatedItems: PurchaseItem[] = selectedPO.items.map((orig, idx) => {
      const recv = receiveItems[idx];
      return {
        ...orig,
        batchNumber: recv.batchNumber,
        expiryDate: new Date(recv.expiryDate),
        purchasePrice: recv.purchasePrice,
        salePrice: recv.salePrice,
        mrp: recv.mrp,
        total: recv.quantity * recv.purchasePrice,
      };
    });
    const newSubtotal = updatedItems.reduce((s, i) => s + i.total, 0);

    updatePurchase(selectedPO.id, {
      status: 'received',
      items: updatedItems,
      subtotal: newSubtotal,
      totalAmount: newSubtotal,
      balanceAmount: newSubtotal,
    });
    toast.success(t('purchaseOrders.orderReceived'));
    setShowReceiveDialog(false);
    setSelectedPO(null);
  };

  // ─── Dialog openers ──────────────────────────────────
  const openEditDialog = (po: Purchase) => {
    setSelectedPO(po);
    setEditMode(true);
    setFormSupplierId(po.supplierId);
    setFormNotes(po.notes || '');
    setFormItems(
      po.items.map(i => ({
        medicineId: i.medicineId,
        quantity: i.quantity,
      }))
    );
    setShowCreateDialog(true);
  };

  const openReceiveDialog = (po: Purchase) => {
    setSelectedPO(po);
    setReceiveItems(
      po.items.map(i => {
        // Pre-fill prices from the latest batch if available
        const batches = useInventoryStore.getState().batches
          .filter(b => b.medicineId === i.medicineId && b.isActive)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const recent = batches[0];
        return {
          medicineId: i.medicineId,
          batchNumber: '',
          expiryDate: '',
          quantity: i.quantity,
          purchasePrice: recent?.purchasePrice || 0,
          salePrice: recent?.salePrice || 0,
          mrp: recent?.mrp || 0,
        };
      })
    );
    setShowReceiveDialog(true);
  };

  // ─── Status badge ────────────────────────────────────
  const statusBadge = (status: PurchaseStatus) => {
    const map: Record<PurchaseStatus, { variant: string; label: string }> = {
      draft: { variant: 'secondary', label: t('purchaseOrders.draft') },
      ordered: { variant: 'default', label: t('purchaseOrders.ordered') },
      partial: { variant: 'warning', label: t('purchaseOrders.partial') },
      received: { variant: 'success', label: t('purchaseOrders.received') },
      cancelled: { variant: 'destructive', label: t('purchaseOrders.cancelled') },
    };
    const c = map[status] ?? map.draft;
    return <Badge variant={c.variant as any}>{c.label}</Badge>;
  };

  const formTotal = formItems.reduce((s, i) => s + i.quantity, 0);

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className={cn(
              'text-2xl font-bold',
              settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
            )}
          >
            {t('purchaseOrders.title')}
          </h1>
          <p
            className={cn(
              'text-sm',
              settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            )}
          >
            {t('purchaseOrders.subtitle')}
          </p>
        </div>
        <Button
          className="gap-2 bg-emerald-500 hover:bg-emerald-600"
          onClick={() => {
            resetForm();
            setShowCreateDialog(true);
          }}
        >
          <Plus className="w-4 h-4" />
          {t('purchaseOrders.createPO')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('purchaseOrders.totalOrders')}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('purchaseOrders.pendingOrders')}</p>
                <p className="text-2xl font-bold text-amber-500">{stats.pending}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('purchaseOrders.receivedThisMonth')}</p>
                <p className="text-2xl font-bold text-emerald-500">{stats.receivedMonth}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('purchaseOrders.totalValue')}</p>
                <p className="text-2xl font-bold">Rs. {stats.totalValue.toLocaleString('en-PK')}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('purchaseOrders.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('purchaseOrders.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('purchaseOrders.allStatuses')}</SelectItem>
            <SelectItem value="draft">{t('purchaseOrders.draft')}</SelectItem>
            <SelectItem value="ordered">{t('purchaseOrders.ordered')}</SelectItem>
            <SelectItem value="received">{t('purchaseOrders.received')}</SelectItem>
            <SelectItem value="cancelled">{t('purchaseOrders.cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('purchaseOrders.poNumber')}</TableHead>
                  <TableHead>{t('purchaseOrders.supplier')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('common.items')}</TableHead>
                  <TableHead>{t('purchaseOrders.totalAmount')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                      <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      {t('purchaseOrders.noOrders')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(po => (
                    <TableRow key={po.id}>
                      <TableCell>
                        <span
                          className={cn(
                            'font-medium',
                            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                          )}
                        >
                          {po.purchaseNumber}
                        </span>
                      </TableCell>
                      <TableCell>{getSupplierName(po.supplierId)}</TableCell>
                      <TableCell>{new Date(po.purchaseDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {po.items.length}{' '}
                        <span className="text-gray-400 text-xs">
                          ({po.items.reduce((s, i) => s + i.quantity, 0)} {t('common.quantity').toLowerCase()})
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        Rs. {po.totalAmount.toLocaleString('en-PK')}
                      </TableCell>
                      <TableCell>{statusBadge(po.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {/* View */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedPO(po);
                              setShowViewDialog(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>

                          {/* Edit (draft only) */}
                          {po.status === 'draft' && (
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(po)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}

                          {/* Receive (ordered only) */}
                          {po.status === 'ordered' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-500"
                              onClick={() => openReceiveDialog(po)}
                            >
                              <PackageCheck className="w-4 h-4" />
                            </Button>
                          )}

                          {/* Cancel */}
                          {(po.status === 'draft' || po.status === 'ordered') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500"
                              onClick={() => {
                                updatePurchase(po.id, { status: 'cancelled' });
                                toast.success(t('purchaseOrders.orderCancelled'));
                              }}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}

                          {/* Delete (draft/cancelled) */}
                          {(po.status === 'draft' || po.status === 'cancelled') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500"
                              onClick={() => {
                                setSelectedPO(po);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ════════ Create / Edit Dialog ════════ */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={open => {
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editMode ? t('purchaseOrders.editTitle') : t('purchaseOrders.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {editMode ? t('purchaseOrders.editDesc') : t('purchaseOrders.createDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Supplier */}
            <div>
              <label className="text-sm font-medium">{t('purchaseOrders.selectSupplier')} *</label>
              <Select value={formSupplierId} onValueChange={setFormSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('purchaseOrders.selectSupplier')} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers
                    .filter(s => s.isActive)
                    .map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Add item search */}
            <div>
              <label className="text-sm font-medium">{t('purchaseOrders.addItem')}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder={t('purchaseOrders.searchMedicine')}
                  value={medicineSearch}
                  onChange={e => setMedicineSearch(e.target.value)}
                  className="pl-10"
                />
                {searchResults.length > 0 && (
                  <div
                    className={cn(
                      'absolute z-10 w-full mt-1 border rounded-md shadow-lg max-h-48 overflow-y-auto',
                      settings.theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'
                    )}
                  >
                    {searchResults.map(med => {
                      const stock = getMedicineStock(med.id);
                      const pending = getMedicinePendingQty(med.id);
                      return (
                        <button
                          key={med.id}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex justify-between items-center',
                            settings.theme === 'dark'
                              ? 'hover:bg-gray-700'
                              : 'hover:bg-gray-100'
                          )}
                          onClick={() => handleAddItem(med.id)}
                        >
                          <span>{med.name} <span className="text-xs text-gray-400">({med.genericName})</span></span>
                          <span className="flex gap-2">
                            <span className={cn('text-xs', stock <= med.reorderLevel ? 'text-red-500' : 'text-gray-400')}>
                              {t('purchaseOrders.currentStock')}: {stock}
                            </span>
                            {pending > 0 && (
                              <Badge variant="outline" className="text-xs">{t('purchaseOrders.pendingQty', pending)}</Badge>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Items table */}
            {formItems.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('purchaseOrders.medicine')}</TableHead>
                      <TableHead className="w-32">{t('purchaseOrders.quantity')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {getMedicineName(item.medicineId)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={e =>
                              handleUpdateItem(idx, 'quantity', parseInt(e.target.value) || 0)
                            }
                            className="w-24 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 h-8 w-8 p-0"
                            onClick={() => handleRemoveItem(idx)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-sm font-medium">{t('purchaseOrders.orderNotes')}</label>
              <Textarea
                placeholder={t('purchaseOrders.notesPlaceholder')}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Item count summary */}
            {formItems.length > 0 && (
              <div className="flex justify-end pt-2 border-t">
                <p className="text-sm text-gray-500">
                  {formItems.length} {t('common.items')} — {formTotal} {t('purchaseOrders.quantity').toLowerCase()}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm}>
              {t('common.cancel')}
            </Button>
            <Button variant="outline" onClick={() => handleSavePO('draft')}>
              {t('purchaseOrders.saveDraft')}
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={() => handleSavePO('ordered')}
            >
              <Truck className="w-4 h-4 mr-2" />
              {t('purchaseOrders.placeOrder')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ View Dialog ════════ */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('purchaseOrders.viewTitle')}</DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('purchaseOrders.poNumber')}</p>
                  <p className="font-medium">{selectedPO.purchaseNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('purchaseOrders.supplier')}</p>
                  <p className="font-medium">{getSupplierName(selectedPO.supplierId)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('common.date')}</p>
                  <p className="font-medium">
                    {new Date(selectedPO.purchaseDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('common.status')}</p>
                  {statusBadge(selectedPO.status)}
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('purchaseOrders.medicine')}</TableHead>
                      <TableHead>{t('purchaseOrders.quantity')}</TableHead>
                      <TableHead>{t('purchaseOrders.purchasePrice')}</TableHead>
                      <TableHead>{t('purchaseOrders.salePrice')}</TableHead>
                      <TableHead>{t('purchaseOrders.itemTotal')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {getMedicineName(item.medicineId)}
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>Rs. {item.purchasePrice.toLocaleString('en-PK')}</TableCell>
                        <TableCell>Rs. {item.salePrice.toLocaleString('en-PK')}</TableCell>
                        <TableCell className="font-medium">
                          Rs. {item.total.toLocaleString('en-PK')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center pt-2 border-t">
                <div>
                  {selectedPO.notes && (
                    <p className="text-sm text-gray-500">
                      {t('purchaseOrders.orderNotes')}: {selectedPO.notes}
                    </p>
                  )}
                </div>
                <p className="text-lg font-bold">
                  {t('common.total')}: Rs. {selectedPO.totalAmount.toLocaleString('en-PK')}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════ Receive Dialog ════════ */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('purchaseOrders.receivePO')}</DialogTitle>
            <DialogDescription>{t('purchaseOrders.receiveDesc')}</DialogDescription>
          </DialogHeader>

          {selectedPO && (
            <div className="space-y-4">
              <p className="font-medium">
                {selectedPO.purchaseNumber} — {getSupplierName(selectedPO.supplierId)}
              </p>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('purchaseOrders.medicine')}</TableHead>
                      <TableHead>{t('purchaseOrders.quantity')}</TableHead>
                      <TableHead>{t('purchaseOrders.batchNumber')} *</TableHead>
                      <TableHead>{t('purchaseOrders.expiryDate')} *</TableHead>
                      <TableHead>{t('purchaseOrders.purchasePrice')} *</TableHead>
                      <TableHead>{t('purchaseOrders.salePrice')}</TableHead>
                      <TableHead>{t('purchaseOrders.itemTotal')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiveItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">
                          {getMedicineName(item.medicineId)}
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          <Input
                            placeholder="e.g., BT-001"
                            value={item.batchNumber}
                            onChange={e => {
                              const items = [...receiveItems];
                              items[idx].batchNumber = e.target.value;
                              setReceiveItems(items);
                            }}
                            className="w-28 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.expiryDate}
                            onChange={e => {
                              const items = [...receiveItems];
                              items[idx].expiryDate = e.target.value;
                              setReceiveItems(items);
                            }}
                            className="w-36 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={item.purchasePrice}
                            onChange={e => {
                              const items = [...receiveItems];
                              items[idx].purchasePrice = parseFloat(e.target.value) || 0;
                              setReceiveItems(items);
                            }}
                            className="w-24 h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={item.salePrice}
                            onChange={e => {
                              const items = [...receiveItems];
                              items[idx].salePrice = parseFloat(e.target.value) || 0;
                              setReceiveItems(items);
                            }}
                            className="w-24 h-8"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          Rs. {(item.quantity * item.purchasePrice).toLocaleString('en-PK')}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Receive total */}
                    <TableRow>
                      <TableCell colSpan={6} className="text-right font-bold">
                        {t('common.total')}:
                      </TableCell>
                      <TableCell className="font-bold">
                        Rs. {receiveItems.reduce((s, i) => s + i.quantity * i.purchasePrice, 0).toLocaleString('en-PK')}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceiveDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={handleReceivePO}>
              <PackageCheck className="w-4 h-4 mr-2" />
              {t('purchaseOrders.markReceived')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ Delete Confirmation ════════ */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.delete')}</DialogTitle>
            <DialogDescription>{t('purchaseOrders.deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedPO) {
                  deletePurchase(selectedPO.id);
                  toast.success(t('purchaseOrders.orderDeleted'));
                  setShowDeleteDialog(false);
                  setSelectedPO(null);
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
