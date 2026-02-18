import { useState } from 'react';
import { useSettingsStore, useDashboardStore, useInventoryStore } from '@/store';
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
  Trash2,
  TrendingDown,
  Clock,
  AlertCircle,
  Bell,
  ShoppingCart,
} from 'lucide-react';

export function Alerts() {
  const { settings } = useSettingsStore();
  const { expiryAlerts, lowStockAlerts, resolveExpiryAlert, resolveLowStockAlert } = useDashboardStore();
  const { medicines, getMedicineStock } = useInventoryStore();
  
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [alertType, setAlertType] = useState<'expiry' | 'stock'>('expiry');

  // Get pending alerts
  const pendingExpiryAlerts = expiryAlerts.filter(a => !a.isResolved);
  const pendingLowStockAlerts = lowStockAlerts.filter(a => !a.isResolved);

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
            Alerts & Notifications
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            Manage expiry and stock alerts
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Alerts</p>
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
                <p className="text-sm text-gray-500">Expiry Alerts</p>
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
                <p className="text-sm text-gray-500">Low Stock</p>
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
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Critical</p>
                <p className="text-2xl font-bold text-red-600">
                  {pendingExpiryAlerts.filter(a => a.alertLevel === 'critical').length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Tabs */}
      <Tabs defaultValue="expiry" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="expiry" className="gap-2">
            <Calendar className="w-4 h-4" />
            Expiry Alerts ({pendingExpiryAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-2">
            <Package className="w-4 h-4" />
            Low Stock ({pendingLowStockAlerts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expiry">
          <Card className={cn(
            settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
          )}>
            <CardHeader>
              <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
                Expiry Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Days Left</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                            {alert.daysUntilExpiry} days
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
                              Resolve
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingExpiryAlerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                          No pending expiry alerts
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
                Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Current Stock</TableHead>
                      <TableHead>Reorder Level</TableHead>
                      <TableHead>Reorder Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                          <Badge variant="destructive">Low Stock</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-500"
                              onClick={() => openResolveDialog(alert, 'stock')}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Resolve
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pendingLowStockAlerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                          No pending low stock alerts
                        </TableCell>
                      </TableRow>
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
            <DialogTitle>Resolve Alert</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this alert as resolved?
            </DialogDescription>
          </DialogHeader>
          
          {selectedAlert && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="font-medium">{selectedAlert.medicineName}</p>
              {alertType === 'expiry' ? (
                <p className="text-sm text-gray-500">
                  Batch: {selectedAlert.batchNumber} | 
                  Expires in {selectedAlert.daysUntilExpiry} days
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  Current Stock: {selectedAlert.currentStock} | 
                  Reorder Level: {selectedAlert.reorderLevel}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleResolve}
            >
              <Check className="w-4 h-4 mr-2" />
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
