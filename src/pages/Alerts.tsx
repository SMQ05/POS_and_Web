import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useSettingsStore, useDashboardStore, useInventoryStore, useSupplierStore, useExpenseStore, useAuthStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import type { Batch } from '@/types';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Calendar,
  Package,
  Check,
  TrendingDown,
  AlertCircle,
  Bell,
  Flame,
  ShieldAlert,
  ShoppingCart,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  Undo2,
  Clock,
  MessageCircle,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export function Alerts() {
  const { settings } = useSettingsStore();
  const { dismissedExpiryAlertIds, dismissedLowStockAlertIds, resolveExpiryAlert, resolveLowStockAlert } = useDashboardStore();
  const { getExpiryRiskReport, getLiveExpiryAlerts, getLiveLowStockAlerts, batches, medicines, updateBatch } = useInventoryStore();
  const { purchases, suppliers, medicineSuppliers, addPurchase, addPurchaseReturn } = useSupplierStore();
  const { addExpense } = useExpenseStore();
  const { currentUser, activeBranchId } = useAuthStore();
  const navigate = useNavigate();

  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [alertType, setAlertType] = useState<'expiry' | 'stock'>('expiry');

  // Expiry disposition workflow (Return / Dispose / Custom).
  const [dispoMode, setDispoMode] = useState<'complete_return' | 'dispose' | 'custom' | null>(null);
  const [dispoBatch, setDispoBatch] = useState<Batch | null>(null);
  const [dispoName, setDispoName] = useState('');
  const [dispoValue, setDispoValue] = useState('');
  const [dispoNote, setDispoNote] = useState('');

  // The supplier to credit a return to: the batch's own supplier, else the
  // medicine's primary (or first) mapped distributor.
  const supplierForBatch = (b: Batch): string => {
    if (b.supplierId) return b.supplierId;
    const map = medicineSuppliers.find((m) => m.medicineId === b.medicineId && m.isPrimary)
      ?? medicineSuppliers.find((m) => m.medicineId === b.medicineId);
    return map?.supplierId ?? '';
  };
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? 'supplier';

  // Suggested value = remaining stock × purchase cost (editable in the dialog).
  const suggestedValue = (b: Batch) => Math.round(b.quantity * (b.purchasePrice || 0));

  const openDispo = (mode: 'complete_return' | 'dispose' | 'custom', batch: Batch, name: string) => {
    setDispoMode(mode);
    setDispoBatch(batch);
    setDispoName(name);
    setDispoValue(mode === 'custom' ? '' : String(suggestedValue(batch)));
    setDispoNote(batch.dispositionNote ?? '');
  };

  // Step 1 of a return: flag the batch as pending (no stock/ledger change yet).
  const initiateReturn = (batch: Batch) => {
    updateBatch(batch.id, { disposition: 'pending_return' });
    toast.success('Return initiated — pending. Complete it once the distributor confirms.');
  };
  const cancelReturn = (batch: Batch) => {
    updateBatch(batch.id, { disposition: 'active' });
    toast.message('Return cancelled.');
  };

  // Confirm the open disposition dialog.
  const confirmDispo = () => {
    if (!dispoBatch) return;
    const b = dispoBatch;
    const value = Math.max(0, parseFloat(dispoValue) || 0);
    const note = dispoNote.trim();

    if (dispoMode === 'complete_return') {
      const supplierId = supplierForBatch(b);
      // Supplier return: server decrements stock + posts a ledger credit.
      addPurchaseReturn({
        id: `pr-${Date.now()}`,
        returnNumber: `RET-${String(Date.now()).slice(-6)}`,
        supplierId,
        purchaseId: b.purchaseId || undefined,
        returnDate: new Date(),
        items: [{
          medicineId: b.medicineId,
          medicineName: dispoName,
          batchId: b.id,
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          unitPrice: b.purchasePrice || 0,
          total: value,
          reason: 'Expiring stock',
        }],
        totalAmount: value,
        reason: note || 'Expiring stock returned to supplier',
        stockAdjusted: true,
        status: 'posted',
        notes: note || undefined,
        createdBy: currentUser?.id ?? 'system',
        createdAt: new Date(),
      });
      updateBatch(b.id, { quantity: 0, disposition: 'returned', dispositionValue: value, dispositionNote: note, dispositionAt: new Date() });
      toast.success(`Returned to ${supplierName(supplierId)} — Rs. ${value.toLocaleString('en-PK')} credited.`);
    } else if (dispoMode === 'dispose') {
      // Write-off: record an Expense (auto-ledger) and zero the batch.
      addExpense({
        id: `exp-${Date.now()}`,
        category: 'other',
        description: `Stock write-off: ${dispoName} batch ${b.batchNumber} (expired) — ${b.quantity} units${note ? ` — ${note}` : ''}`,
        amount: value,
        date: new Date(),
        createdBy: currentUser?.id ?? 'system',
        createdAt: new Date(),
      });
      updateBatch(b.id, { quantity: 0, disposition: 'disposed', dispositionValue: value, dispositionNote: note, dispositionAt: new Date() });
      toast.success(`Disposed — Rs. ${value.toLocaleString('en-PK')} written off as loss.`);
    } else if (dispoMode === 'custom') {
      updateBatch(b.id, { quantity: 0, disposition: 'disposed', dispositionValue: value || undefined, dispositionNote: note, dispositionAt: new Date() });
      toast.success('Batch resolved.');
    }
    setDispoMode(null);
    setDispoBatch(null);
  };

  // International wa.me phone format (PK-aware): strip non-digits, 0xxx → 92xxx.
  const normalizePhoneForWa = (raw: string): string => {
    let digits = (raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) digits = '92' + digits.slice(1);
    else if (digits.length === 10 && digits.startsWith('3')) digits = '92' + digits;
    return digits;
  };

  // Low stock → auto-create a Purchase Order to the mapped supplier AND open
  // WhatsApp with the order message pre-filled (places the order + messages the
  // distributor in one click). If none is mapped, open the PO form prefilled.
  const orderLowStock = (alert: any) => {
    const qty = alert.reorderQuantity > 0 ? alert.reorderQuantity : Math.max(1, alert.reorderLevel - alert.currentStock);
    const map = medicineSuppliers.find((m) => m.medicineId === alert.medicineId && m.isPrimary)
      ?? medicineSuppliers.find((m) => m.medicineId === alert.medicineId);
    if (!map) {
      toast.info('No supplier mapped — pick one to finish the order.');
      navigate(`/purchase-orders?medicine=${alert.medicineId}&qty=${qty}`);
      return;
    }
    const supplier = suppliers.find((s) => s.id === map.supplierId);
    const seq = String(purchases.length + 1).padStart(5, '0');
    const poNumber = `PO-${seq}`;
    addPurchase({
      id: `po-${Date.now()}`,
      purchaseNumber: poNumber,
      supplierId: map.supplierId,
      branchId: activeBranchId ?? '1',
      purchaseDate: new Date(),
      items: [{
        id: `pi-${Date.now()}`,
        medicineId: alert.medicineId,
        batchNumber: '',
        expiryDate: new Date(),
        quantity: qty,
        purchasePrice: 0,
        salePrice: 0,
        mrp: 0,
        discountPercent: 0,
        taxPercent: 0,
        total: 0,
      }],
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
      paidAmount: 0,
      balanceAmount: 0,
      payments: [],
      status: 'ordered',
      notes: 'Auto-created from low-stock alert',
      createdBy: currentUser?.id ?? '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Build + open the WhatsApp order message to the distributor.
    const med = medicines.find((m) => m.id === alert.medicineId);
    const itemName = med ? `${med.name}${med.strength ? ' ' + med.strength : ''}` : alert.medicineName;
    const msg = [
      `*Purchase Order ${poNumber}*`,
      `From: ${settings.companyName || 'Pharmacy'}`,
      supplier ? `To: ${supplier.name}` : '',
      `Date: ${new Date().toLocaleDateString()}`,
      '',
      '*Items requested:*',
      `1. ${itemName} — Qty ${qty}`,
      '',
      '_Prices will be confirmed on receipt against your invoice._',
    ].filter(Boolean).join('\n');
    const phone = normalizePhoneForWa(supplier?.phone || '');
    const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    toast.success(
      phone
        ? `Order placed (${poNumber}) — opening WhatsApp to ${supplierName(map.supplierId)}.`
        : `Order placed (${poNumber}). ${supplierName(map.supplierId)} has no phone — WhatsApp opened without a recipient.`,
    );
  };

  const expiryRiskReport = getExpiryRiskReport();
  const { t, isRTL } = useTranslation();

  // Live computed alerts from actual inventory data
  const liveExpiryAlerts = getLiveExpiryAlerts();
  const liveLowStockAlerts = getLiveLowStockAlerts();

  /** Check if a medicine already has a pending PO */
  const getMedicinePendingQty = (medicineId: string) =>
    purchases
      .filter(p => p.status === 'ordered' || p.status === 'draft')
      .flatMap(p => p.items)
      .filter(i => i.medicineId === medicineId)
      .reduce((s, i) => s + i.quantity, 0);

  // Filter based on settings
  const expiryAlertsEnabled = settings.enableExpiryAlerts ?? true;
  const lowStockAlertsEnabled = settings.enableLowStockAlerts ?? true;

  // Get pending alerts (live data, filter out dismissed ones)
  const pendingExpiryAlerts = expiryAlertsEnabled
    ? liveExpiryAlerts.filter(a => !dismissedExpiryAlertIds.includes(a.id))
    : [];
  const pendingLowStockAlerts = lowStockAlertsEnabled
    ? liveLowStockAlerts.filter(a => !dismissedLowStockAlertIds.includes(a.id))
    : [];

  // Handle resolve
  const handleResolve = () => {
    if (alertType === 'expiry') {
      resolveExpiryAlert(selectedAlert.id);
    } else {
      resolveLowStockAlert(selectedAlert.id);
    }
    setShowResolveDialog(false);
    setSelectedAlert(null);
  };

  // Open resolve dialog
  const openResolveDialog = (alert: any, type: 'expiry' | 'stock') => {
    setSelectedAlert(alert);
    setAlertType(type);
    setShowResolveDialog(true);
  };

  // Get alert level color
  const getAlertLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-500';
      case 'warning': return 'bg-amber-500';
      case 'notice': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('alerts.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('alerts.subtitle')}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('alerts.totalAlerts')}</p>
                <p className="text-2xl font-bold">
                  {pendingExpiryAlerts.length + pendingLowStockAlerts.length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Bell className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('alerts.expiryAlerts')}</p>
                <p className="text-2xl font-bold text-amber-500">
                  {pendingExpiryAlerts.length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('alerts.criticalRiskBatches')}</p>
                <p className="text-2xl font-bold text-red-600">
                  {expiryRiskReport.filter(r => r.riskPercent >= 80).length}
                </p>
                <p className="text-xs text-gray-400">
                  Rs. {expiryRiskReport.reduce((s, r) => s + r.potentialLoss, 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })} {t('alerts.potentialLoss')}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Flame className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('alerts.lowStock')}</p>
                <p className="text-2xl font-bold text-red-500">
                  {pendingLowStockAlerts.length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Tabs */}
      <Tabs defaultValue="expiry" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="expiry" className="gap-2">
            <Calendar className="w-4 h-4" />
            {t('alerts.expiryAlerts')} ({pendingExpiryAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-2">
            <Package className="w-4 h-4" />
            {t('alerts.lowStock')} ({pendingLowStockAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="risk" className="gap-2">
            <Flame className="w-4 h-4" />
            {t('alerts.expiryRiskReport')} ({expiryRiskReport.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expiry">
          <Card className={cn(
            settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
          )}>
            <CardHeader>
              <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
                {t('alerts.expiryAlerts')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('alerts.medicine')}</TableHead>
                      <TableHead>{t('alerts.batch')}</TableHead>
                      <TableHead>{t('alerts.expiryDate')}</TableHead>
                      <TableHead>{t('alerts.daysLeft')}</TableHead>
                      <TableHead>{t('common.quantity')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingExpiryAlerts.map((alert) => {
                      const batch = batches.find((b) => b.id === alert.batchId);
                      const isPending = batch?.disposition === 'pending_return';
                      return (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              'w-2 h-2 rounded-full',
                              getAlertLevelColor(alert.alertLevel)
                            )} />
                            <span className={cn(
                              'font-medium',
                              settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                            )}>
                              {alert.medicineName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{alert.batchNumber}</TableCell>
                        <TableCell>
                          {new Date(alert.expiryDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            'font-medium',
                            alert.daysUntilExpiry <= 30 ? 'text-red-500' : 'text-amber-500'
                          )}>
                            {t('alerts.days', alert.daysUntilExpiry)}
                          </span>
                        </TableCell>
                        <TableCell>{alert.quantity}</TableCell>
                        <TableCell>
                          {isPending ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
                              <Clock className="w-3 h-3" /> Pending return
                            </Badge>
                          ) : (
                            <Badge variant={
                              alert.alertLevel === 'critical' ? 'destructive' :
                              alert.alertLevel === 'warning' ? 'warning' :
                              'secondary'
                            }>
                              {alert.alertLevel}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {batch && isPending ? (
                              <>
                                <Button variant="outline" size="sm" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 gap-1"
                                  onClick={() => openDispo('complete_return', batch, alert.medicineName)}>
                                  <Check className="w-4 h-4" /> Complete return
                                </Button>
                                <Button variant="ghost" size="sm" className="text-gray-500 gap-1" title="Cancel the pending return"
                                  onClick={() => cancelReturn(batch)}>
                                  <Undo2 className="w-4 h-4" />
                                </Button>
                              </>
                            ) : batch ? (
                              <>
                                <Button variant="ghost" size="sm" className="text-blue-600 gap-1" title="Return to supplier for credit"
                                  onClick={() => initiateReturn(batch)}>
                                  <RotateCcw className="w-4 h-4" /> Return
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-500 gap-1" title="Dispose (write off as loss)"
                                  onClick={() => openDispo('dispose', batch, alert.medicineName)}>
                                  <Trash2 className="w-4 h-4" /> Dispose
                                </Button>
                                <Button variant="ghost" size="icon" className="text-gray-500" title="Other / custom resolution"
                                  onClick={() => openDispo('custom', batch, alert.medicineName)}>
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="sm" className="text-emerald-500"
                                onClick={() => openResolveDialog(alert, 'expiry')}>
                                <Check className="w-4 h-4 mr-1" /> {t('alerts.resolve')}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                    {pendingExpiryAlerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                          {t('alerts.noExpiryAlerts')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card className={cn(
            settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
          )}>
            <CardHeader>
              <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
                {t('alerts.lowStock')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('alerts.medicine')}</TableHead>
                      <TableHead>{t('alerts.currentStock')}</TableHead>
                      <TableHead>{t('alerts.reorderLevel')}</TableHead>
                      <TableHead>{t('alerts.reorderQty')}</TableHead>
                      <TableHead>{t('purchaseOrders.ordered')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingLowStockAlerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-red-500" />
                            <span className={cn(
                              'font-medium',
                              settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                            )}>
                              {alert.medicineName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-red-500 font-medium">
                            {alert.currentStock}
                          </span>
                        </TableCell>
                        <TableCell>{alert.reorderLevel}</TableCell>
                        <TableCell>{alert.reorderQuantity}</TableCell>
                        <TableCell>
                          {(() => {
                            const pending = getMedicinePendingQty(alert.medicineId);
                            return pending > 0 ? (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                                {t('purchaseOrders.pendingQty', pending)}
                              </Badge>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {getMedicinePendingQty(alert.medicineId) > 0 ? (
                            <div className="flex gap-1">
                              <Badge variant="destructive">{t('alerts.lowStock')}</Badge>
                              <Badge variant="outline" className="text-emerald-600 border-emerald-300">{t('purchaseOrders.ordered')}</Badge>
                            </div>
                          ) : (
                            <Badge variant="destructive">{t('alerts.lowStock')}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {getMedicinePendingQty(alert.medicineId) === 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 gap-1"
                                title="Place the order and open WhatsApp to the distributor with the order message"
                                onClick={() => orderLowStock(alert)}
                              >
                                <ShoppingCart className="w-4 h-4" />
                                Order
                                <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-500"
                              onClick={() => openResolveDialog(alert, 'stock')}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              {t('alerts.resolve')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingLowStockAlerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                          {t('alerts.noLowStockAlerts')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expiry Risk Report */}
        <TabsContent value="risk">
          <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
            <CardHeader>
              <CardTitle className={cn('flex items-center gap-2', settings.theme === 'dark' ? 'text-white' : '')}>
                <Flame className="w-5 h-5 text-red-500" />
                {t('alerts.expiryRiskReport')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('alerts.medicine')}</TableHead>
                      <TableHead>{t('alerts.batch')}</TableHead>
                      <TableHead>{t('alerts.daysLeft')}</TableHead>
                      <TableHead>{t('alerts.riskPct')}</TableHead>
                      <TableHead>{t('common.quantity')}</TableHead>
                      <TableHead>{t('alerts.potentialLoss')}</TableHead>
                      <TableHead>{t('alerts.recommendation')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiryRiskReport.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                          {t('alerts.noRiskBatches')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      expiryRiskReport.map((r) => (
                        <TableRow key={r.batchId}>
                          <TableCell>
                            <p className={cn('font-medium', settings.theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                              {r.medicineName}
                            </p>
                          </TableCell>
                          <TableCell>{r.batchNumber}</TableCell>
                          <TableCell>
                            <span className={cn(
                              'font-medium',
                              r.daysUntilExpiry <= 30 ? 'text-red-500' : r.daysUntilExpiry <= 60 ? 'text-amber-500' : 'text-blue-500'
                            )}>
                              {r.daysUntilExpiry}d
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={r.riskPercent} className="h-2 w-20" />
                              <span className={cn(
                                'text-xs font-medium',
                                r.riskPercent >= 80 ? 'text-red-600' : r.riskPercent >= 50 ? 'text-amber-600' : 'text-blue-600'
                              )}>
                                {r.riskPercent}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{r.quantity}</TableCell>
                          <TableCell>
                            <span className="text-red-600 font-medium">
                              Rs. {r.potentialLoss.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              r.recommendation === 'write_off' ? 'destructive' :
                              r.recommendation === 'sell_urgently' ? 'destructive' :
                              r.recommendation === 'return_to_supplier' ? 'outline' :
                              'secondary'
                            } className="capitalize text-xs">
                              {r.recommendation?.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Expiry disposition dialog — Complete return / Dispose / Custom */}
      <Dialog open={dispoMode !== null} onOpenChange={(o) => { if (!o) { setDispoMode(null); setDispoBatch(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dispoMode === 'complete_return' && <><RotateCcw className="w-4 h-4 text-emerald-600" /> Complete return to supplier</>}
              {dispoMode === 'dispose' && <><Trash2 className="w-4 h-4 text-red-500" /> Dispose expired stock</>}
              {dispoMode === 'custom' && <><MoreHorizontal className="w-4 h-4 text-gray-500" /> Custom resolution</>}
            </DialogTitle>
            <DialogDescription>
              {dispoMode === 'complete_return' && 'Confirms the supplier credit, removes the stock and records the credit on the supplier ledger.'}
              {dispoMode === 'dispose' && 'Writes off the stock as an expense (loss) and removes it from inventory.'}
              {dispoMode === 'custom' && 'Mark this batch as resolved with a note (e.g. donated, transferred, destroyed on site).'}
            </DialogDescription>
          </DialogHeader>

          {dispoBatch && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                <p className="font-medium">{dispoName}</p>
                <p className="text-gray-500">
                  Batch {dispoBatch.batchNumber} · {dispoBatch.quantity} units · cost Rs. {(dispoBatch.purchasePrice || 0).toLocaleString('en-PK')}/unit
                </p>
                {dispoMode === 'complete_return' && (
                  <p className="text-gray-500 mt-1">Supplier: <span className="font-medium">{supplierName(supplierForBatch(dispoBatch))}</span></p>
                )}
              </div>

              <div>
                <Label className="text-sm">
                  {dispoMode === 'complete_return' ? 'Return credit (Rs.)' : dispoMode === 'dispose' ? 'Write-off loss (Rs.)' : 'Value (Rs., optional)'}
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={dispoValue}
                  onChange={(e) => setDispoValue(e.target.value)}
                  className="mt-1.5"
                  placeholder="0"
                />
                {dispoMode !== 'custom' && (
                  <p className="text-xs text-gray-400 mt-1">Suggested {dispoBatch.quantity} × Rs. {(dispoBatch.purchasePrice || 0).toLocaleString('en-PK')} = Rs. {suggestedValue(dispoBatch).toLocaleString('en-PK')} — editable.</p>
                )}
              </div>

              <div>
                <Label className="text-sm">Comment{dispoMode === 'custom' ? '' : ' (optional)'}</Label>
                <Textarea
                  value={dispoNote}
                  onChange={(e) => setDispoNote(e.target.value)}
                  rows={2}
                  className="mt-1.5"
                  placeholder={dispoMode === 'complete_return' ? 'Credit note #, reason…' : dispoMode === 'dispose' ? 'How it was destroyed, who authorised…' : 'What happened to this stock…'}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDispoMode(null); setDispoBatch(null); }}>Cancel</Button>
            <Button
              className={dispoMode === 'dispose' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}
              disabled={dispoMode === 'custom' && !dispoNote.trim()}
              onClick={confirmDispo}
            >
              {dispoMode === 'complete_return' ? 'Confirm return' : dispoMode === 'dispose' ? 'Dispose & write off' : 'Mark resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('alerts.resolveTitle')}</DialogTitle>
            <DialogDescription>
              {t('alerts.resolveConfirm')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedAlert && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="font-medium">{selectedAlert.medicineName}</p>
              {alertType === 'expiry' ? (
                <p className="text-sm text-gray-500">
                  {t('alerts.batch')}: {selectedAlert.batchNumber} | 
                  {t('alerts.expiresInDays', selectedAlert.daysUntilExpiry)}
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  {t('alerts.currentStock')}: {selectedAlert.currentStock} | 
                  {t('alerts.reorderLevel')}: {selectedAlert.reorderLevel}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleResolve}
            >
              <Check className="w-4 h-4 mr-2" />
              {t('alerts.markResolved')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
