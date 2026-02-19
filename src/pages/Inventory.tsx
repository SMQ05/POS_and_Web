import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useInventoryStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Plus,
  Package,
  AlertTriangle,
  Calendar,
  TrendingDown,
  Download,
  Edit,
  History,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

function classificationBadge(classification?: string) {
  switch (classification) {
    case 'controlled':
      return <Badge className="bg-red-100 text-red-700 border-red-300">Controlled</Badge>;
    case 'prescription':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-300">Rx</Badge>;
    default:
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">OTC</Badge>;
  }
}

function expiryRiskBadge(riskPercent: number, daysLeft: number) {
  if (riskPercent >= 80 || daysLeft <= 30)
    return <span className="text-xs font-semibold text-red-600">Critical ({daysLeft}d)</span>;
  if (riskPercent >= 50 || daysLeft <= 60)
    return <span className="text-xs font-semibold text-amber-600">Warning ({daysLeft}d)</span>;
  if (riskPercent >= 25 || daysLeft <= 90)
    return <span className="text-xs font-semibold text-blue-600">Notice ({daysLeft}d)</span>;
  return <span className="text-xs text-gray-400">{daysLeft}d</span>;
}

export function Inventory() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { t, isRTL } = useTranslation();
  const {
    medicines,
    batches,
    getMedicineStock,
    getFEFOBatchesByMedicine,
    getExpiryRiskReport,
  } = useInventoryStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [selectedMedicine, setSelectedMedicine] = useState<any>(null);
  const [showBatchesDialog, setShowBatchesDialog] = useState(false);
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);

  const expiryRiskReport = getExpiryRiskReport();

  // ── Export inventory ──
  const handleExportInventory = () => {
    const rows = filteredMedicines.map((med) => {
      const stock = getMedicineStock(med.id);
      const fefoBatches = getFEFOBatchesByMedicine(med.id);
      const risk = expiryRiskReport.find(r => r.medicineId === med.id);
      return {
        name: med.name,
        genericName: med.genericName,
        category: med.category,
        classification: (med as any).classification ?? 'otc',
        stock,
        reorderLevel: med.reorderLevel,
        batches: fefoBatches.length,
        nearestExpiry: fefoBatches[0] ? new Date(fefoBatches[0].expiryDate).toLocaleDateString() : 'N/A',
        expiryRisk: risk ? `${risk.riskPercent.toFixed(0)}%` : '0%',
      };
    });
    if (rows.length === 0) { toast.error(t('inventory.noDataExport')); return; }
    exportToCSV(rows as any, [
      { key: 'name', label: 'Medicine' },
      { key: 'genericName', label: 'Generic Name' },
      { key: 'category', label: 'Category' },
      { key: 'classification', label: 'Classification' },
      { key: 'stock', label: 'Current Stock' },
      { key: 'reorderLevel', label: 'Reorder Level' },
      { key: 'batches', label: 'Batches' },
      { key: 'nearestExpiry', label: 'Nearest Expiry' },
      { key: 'expiryRisk', label: 'Expiry Risk' },
    ], 'inventory');
    toast.success(t('inventory.exportedInventory', rows.length));
  };

  // Filter medicines
  const filteredMedicines = medicines.filter((medicine) => {
    const matchesSearch = searchQuery === '' || 
      medicine.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      medicine.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      medicine.barcode?.includes(searchQuery);
    
    const matchesCategory = categoryFilter === 'all' || medicine.category === categoryFilter;
    
    const stock = getMedicineStock(medicine.id);
    const matchesStock = stockFilter === 'all' ||
      (stockFilter === 'low' && stock <= medicine.reorderLevel) ||
      (stockFilter === 'out' && stock === 0) ||
      (stockFilter === 'in' && stock > medicine.reorderLevel);

    const matchesClass = classFilter === 'all' || (medicine as any).classification === classFilter;
    
    return matchesSearch && matchesCategory && matchesStock && matchesClass;
  });

  // Get stock status
  const getStockStatus = (medicineId: string, reorderLevel: number) => {
    const stock = getMedicineStock(medicineId);
    if (stock === 0) return { label: 'Out of Stock', variant: 'destructive' as const };
    if (stock <= reorderLevel) return { label: 'Low Stock', variant: 'warning' as const };
    return { label: 'In Stock', variant: 'success' as const };
  };

  // View batches
  const handleViewBatches = (medicine: any) => {
    setSelectedMedicine(medicine);
    setShowBatchesDialog(true);
  };

  // Get FEFO-sorted batches for selected medicine
  const medicineBatches = selectedMedicine 
    ? getFEFOBatchesByMedicine(selectedMedicine.id)
    : [];

  const categories = [
    { value: 'tablets', label: 'Tablets' },
    { value: 'capsules', label: 'Capsules' },
    { value: 'syrups', label: 'Syrups' },
    { value: 'injections', label: 'Injections' },
    { value: 'drops', label: 'Drops' },
    { value: 'creams', label: 'Creams' },
    { value: 'ointments', label: 'Ointments' },
    { value: 'inhalers', label: 'Inhalers' },
    { value: 'powders', label: 'Powders' },
    { value: 'supplements', label: 'Supplements' },
    { value: 'medical_devices', label: 'Medical Devices' },
    { value: 'personal_care', label: 'Personal Care' },
    { value: 'otc', label: 'OTC' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('inventory.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('inventory.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportInventory}>
            <Download className="w-4 h-4" />
            {t('common.export')}
          </Button>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => navigate('/medicines')}
          >
            <Plus className="w-4 h-4" />
            {t('inventory.addMedicine')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('inventory.totalMedicines')}</p>
                <p className="text-2xl font-bold">{medicines.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('inventory.lowStockItems')}</p>
                <p className="text-2xl font-bold text-amber-500">
                  {medicines.filter(m => getMedicineStock(m.id) <= m.reorderLevel && getMedicineStock(m.id) > 0).length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('inventory.atExpiryRisk')}</p>
                <p className="text-2xl font-bold text-red-500">
                  {expiryRiskReport.length}
                </p>
                <p className="text-xs text-gray-400">{expiryRiskReport.filter(r => r.riskPercent >= 80).length} {t('alerts.critical')}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('inventory.controlledDrugs')}</p>
                <p className="text-2xl font-bold text-purple-500">
                  {medicines.filter(m => (m as any).classification === 'controlled').length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t('inventory.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-44">
                <ShieldAlert className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t('inventory.classification')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inventory.allTypes')}</SelectItem>
                <SelectItem value="otc">{t('categories.otc')}</SelectItem>
                <SelectItem value="prescription">{t('inventory.prescriptionRx')}</SelectItem>
                <SelectItem value="controlled">{t('inventory.controlled')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-40">
                <Package className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t('inventory.stockStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inventory.allStock')}</SelectItem>
                <SelectItem value="in">{t('inventory.inStock')}</SelectItem>
                <SelectItem value="low">{t('inventory.lowStock')}</SelectItem>
                <SelectItem value="out">{t('inventory.outOfStock')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            {t('inventory.stockOverview')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.medicine')}</TableHead>
                  <TableHead>{t('common.type')}</TableHead>
                  <TableHead>{t('inventory.stock')}</TableHead>
                  <TableHead>{t('inventory.reorderLevel')}</TableHead>
                  <TableHead>{t('inventory.nearestExpiry')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('inventory.batches')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMedicines.map((medicine) => {
                  const stock = getMedicineStock(medicine.id);
                  const status = getStockStatus(medicine.id, medicine.reorderLevel);
                  const fefo = getFEFOBatchesByMedicine(medicine.id);
                  const nearestBatch = fefo[0];
                  const daysLeft = nearestBatch
                    ? Math.ceil((new Date(nearestBatch.expiryDate).getTime() - Date.now()) / 86400000)
                    : null;
                  const riskPct = nearestBatch?.expiryRiskPercent ?? 0;
                  
                  return (
                    <TableRow key={medicine.id}>
                      <TableCell>
                        <div>
                          <p className={cn(
                            'font-medium',
                            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                          )}>
                            {medicine.name}
                          </p>
                          <p className="text-sm text-gray-500">{medicine.genericName}</p>
                          {(medicine as any).classification === 'controlled' && (
                            <p className="text-xs text-red-500 mt-0.5">
                              ⚠ {(medicine as any).controlledSchedule ?? 'Controlled'}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {classificationBadge((medicine as any).classification)}
                      </TableCell>
                      <TableCell>
                        <p className={cn(
                          'font-medium',
                          stock === 0 ? 'text-red-500' : 
                          stock <= medicine.reorderLevel ? 'text-amber-500' : 'text-emerald-500'
                        )}>
                          {stock}
                        </p>
                      </TableCell>
                      <TableCell>{medicine.reorderLevel}</TableCell>
                      <TableCell>
                        {daysLeft !== null ? (
                          <div className="space-y-1">
                            {expiryRiskBadge(riskPct, daysLeft)}
                            <Progress
                              value={riskPct}
                              className={cn('h-1', riskPct >= 80 ? 'bg-red-200' : riskPct >= 50 ? 'bg-amber-200' : 'bg-blue-200')}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">{t('inventory.noBatches')}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant === 'success' ? 'default' : status.variant}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleViewBatches(medicine)}
                        >
                          <Zap className="w-3 h-3 text-emerald-500" />
                          {fefo.length} {t('inventory.batches')}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewBatches(medicine)}
                          >
                            <History className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/medicines?id=${medicine.id}`)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Batches Dialog */}
      <Dialog open={showBatchesDialog} onOpenChange={setShowBatchesDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              {t('inventory.fefoView', selectedMedicine?.name)}
            </DialogTitle>
            <DialogDescription>
              {t('inventory.fefoDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.fefo')}</TableHead>
                  <TableHead>{t('inventory.batchNo')}</TableHead>
                  <TableHead>{t('inventory.expiryDate')}</TableHead>
                  <TableHead>{t('inventory.expiryRisk')}</TableHead>
                  <TableHead>{t('common.quantity')}</TableHead>
                  <TableHead>{t('inventory.cost')}</TableHead>
                  <TableHead>{t('inventory.salePrice')}</TableHead>
                  <TableHead>{t('inventory.marginPct')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {medicineBatches.map((batch, idx) => {
                  const daysUntilExpiry = Math.ceil(
                    (new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );
                  const riskPct = batch.expiryRiskPercent ?? 0;
                  const profitPerUnit = batch.salePrice - batch.purchasePrice;
                  const marginPct = batch.salePrice > 0 ? (profitPerUnit / batch.salePrice) * 100 : 0;
                  
                  return (
                    <TableRow key={batch.id} className={idx === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}>
                      <TableCell>
                        {idx === 0 ? (
                          <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                            <Zap className="w-3 h-3" /> {t('inventory.fefo')}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">#{idx + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm">{new Date(batch.expiryDate).toLocaleDateString()}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[100px]">
                          {expiryRiskBadge(riskPct, daysUntilExpiry)}
                          <Progress value={riskPct} className="h-1.5" />
                        </div>
                      </TableCell>
                      <TableCell>{batch.quantity}</TableCell>
                      <TableCell>Rs. {batch.purchasePrice.toFixed(2)}</TableCell>
                      <TableCell>Rs. {batch.salePrice.toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={marginPct > 20 ? 'text-emerald-600 font-medium' : marginPct > 10 ? 'text-amber-600' : 'text-red-600'}>
                          {marginPct.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {batch.quantity === 0 ? (
                          <Badge variant="secondary">{t('inventory.empty')}</Badge>
                        ) : daysUntilExpiry <= 0 ? (
                          <Badge variant="destructive">{t('inventory.expired')}</Badge>
                        ) : daysUntilExpiry <= 30 ? (
                          <Badge variant="destructive">{t('alerts.critical')}</Badge>
                        ) : daysUntilExpiry <= 90 ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">{t('inventory.expiring')}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-300">{t('common.active')}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchesDialog(false)}>
              {t('common.close')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={() => {
                setShowBatchesDialog(false);
                setShowAdjustmentDialog(true);
              }}
            >
              {t('inventory.adjustment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('inventory.adjustment')}</DialogTitle>
            <DialogDescription>
              {t('inventory.adjustDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('inventory.adjustType')}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t('inventory.selectReason')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">{t('inventory.damaged')}</SelectItem>
                  <SelectItem value="expired">{t('inventory.expiredAdj')}</SelectItem>
                  <SelectItem value="theft">{t('inventory.theft')}</SelectItem>
                  <SelectItem value="return">{t('inventory.returnToSupplier')}</SelectItem>
                  <SelectItem value="correction">{t('inventory.stockCorrection')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('inventory.batchNo')}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t('inventory.selectBatch')} />
                </SelectTrigger>
                <SelectContent>
                  {medicineBatches.map(batch => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batchNumber} (Qty: {batch.quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('common.quantity')}</Label>
              <Input type="number" placeholder={t('inventory.enterQty')} />
            </div>
            <div>
              <Label>{t('common.notes')}</Label>
              <Input placeholder={t('inventory.addNotes')} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustmentDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600">
              {t('inventory.saveAdjustment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
