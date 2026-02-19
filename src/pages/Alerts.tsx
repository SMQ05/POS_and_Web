import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useDashboardStore, useInventoryStore, useSupplierStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export function Alerts() {
  const { settings } = useSettingsStore();
  const { dismissedExpiryAlertIds, dismissedLowStockAlertIds, resolveExpiryAlert, resolveLowStockAlert } = useDashboardStore();
  const { getExpiryRiskReport, getLiveExpiryAlerts, getLiveLowStockAlerts } = useInventoryStore();
  const { purchases } = useSupplierStore();
  const navigate = useNavigate();
  
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [alertType, setAlertType] = useState<'expiry' | 'stock'>('expiry');

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
                    {pendingExpiryAlerts.map((alert) => (
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
                          <Badge variant={
                            alert.alertLevel === 'critical' ? 'destructive' :
                            alert.alertLevel === 'warning' ? 'warning' :
                            'secondary'
                          }>
                            {alert.alertLevel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-500"
                              onClick={() => openResolveDialog(alert, 'expiry')}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              {t('alerts.resolve')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
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
                                className="text-emerald-500 border-emerald-300 hover:bg-emerald-50"
                                onClick={() =>
                                  navigate(`/purchase-orders?medicine=${alert.medicineId}&qty=${alert.reorderQuantity}`)
                                }
                              >
                                <ShoppingCart className="w-4 h-4 mr-1" />
                                {t('purchaseOrders.lowStockOrder')}
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
