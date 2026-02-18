import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useInventoryStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  ArrowUpDown,
  Filter,
  Download,
  Barcode,
  Edit,
  Trash2,
  History,
} from 'lucide-react';

export function Inventory() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { medicines, batches, searchMedicines, getMedicineStock, getBatchesByMedicine } = useInventoryStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<string>('all');
  const [selectedMedicine, setSelectedMedicine] = useState<any>(null);
  const [showBatchesDialog, setShowBatchesDialog] = useState(false);
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);

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
    
    return matchesSearch && matchesCategory && matchesStock;
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

  // Get batches for selected medicine
  const medicineBatches = selectedMedicine 
    ? getBatchesByMedicine(selectedMedicine.id)
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
            Inventory Management
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            Track stock levels, batches, and expiry dates
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => navigate('/medicines')}
          >
            <Plus className="w-4 h-4" />
            Add Medicine
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Medicines</p>
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
                <p className="text-sm text-gray-500">Low Stock Items</p>
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
                <p className="text-sm text-gray-500">Out of Stock</p>
                <p className="text-2xl font-bold text-red-500">
                  {medicines.filter(m => getMedicineStock(m.id) === 0).length}
                </p>
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
                <p className="text-sm text-gray-500">Expiring Soon</p>
                <p className="text-2xl font-bold text-amber-500">
                  {batches.filter(b => {
                    const days = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return days <= 90 && days > 0 && b.quantity > 0;
                  }).length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-600" />
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
                placeholder="Search medicines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-40">
                <Package className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Stock Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="in">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
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
            Stock Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Reorder Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Batches</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMedicines.map((medicine) => {
                  const stock = getMedicineStock(medicine.id);
                  const status = getStockStatus(medicine.id, medicine.reorderLevel);
                  const medicineBatches = getBatchesByMedicine(medicine.id);
                  
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
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{medicine.category}</Badge>
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
                        <Badge variant={status.variant === 'success' ? 'default' : status.variant}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewBatches(medicine)}
                        >
                          {medicineBatches.length} batches
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Batch Details - {selectedMedicine?.name}</DialogTitle>
            <DialogDescription>
              View all batches and their stock levels
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch #</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Purchase Price</TableHead>
                  <TableHead>Sale Price</TableHead>
                  <TableHead>MRP</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {medicineBatches.map((batch) => {
                  const daysUntilExpiry = Math.ceil(
                    (new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );
                  
                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {batch.expiryDate.toLocaleDateString()}
                          {daysUntilExpiry <= 90 && (
                            <Badge variant="destructive" className="text-xs">
                              {daysUntilExpiry}d
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{batch.quantity}</TableCell>
                      <TableCell>Rs. {batch.purchasePrice.toFixed(2)}</TableCell>
                      <TableCell>Rs. {batch.salePrice.toFixed(2)}</TableCell>
                      <TableCell>Rs. {batch.mrp.toFixed(2)}</TableCell>
                      <TableCell>
                        {batch.quantity === 0 ? (
                          <Badge variant="secondary">Empty</Badge>
                        ) : daysUntilExpiry <= 0 ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : daysUntilExpiry <= 90 ? (
                          <Badge variant="warning">Expiring Soon</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
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
              Close
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={() => {
                setShowBatchesDialog(false);
                setShowAdjustmentDialog(true);
              }}
            >
              Stock Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock Adjustment</DialogTitle>
            <DialogDescription>
              Adjust stock for damage, expiry, or other reasons
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Adjustment Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Damaged</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="theft">Theft</SelectItem>
                  <SelectItem value="return">Return to Supplier</SelectItem>
                  <SelectItem value="correction">Stock Correction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Batch</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
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
              <Label>Quantity</Label>
              <Input type="number" placeholder="Enter quantity" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input placeholder="Add notes..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustmentDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600">
              Save Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
