import { useState } from 'react';
import { useSettingsStore, useSupplierStore, useInventoryStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { exportToCSV, importFromCSV } from '@/lib/csv';
import { ImportHelpPopover } from '@/components/ImportHelpPopover';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Plus,
  Truck,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  History,
  Package,
  Save,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  Upload,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Supplier, Purchase } from '@/types';

export function Suppliers() {
  const { settings } = useSettingsStore();
  const { suppliers, purchases, addSupplier, updateSupplier, deleteSupplier, getSupplierBalance } = useSupplierStore();
  const { medicines } = useInventoryStore();
  const { t, isRTL } = useTranslation();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    ntn: '',
    gstNumber: '',
    creditLimit: 100000,
    paymentTerms: 30,
  });

  const [purchaseItems, setPurchaseItems] = useState<any[]>([]);

  // ── CSV column definition ──
  const csvColumns = [
    { key: 'name' as const, label: 'Company Name' },
    { key: 'contactPerson' as const, label: 'Contact Person' },
    { key: 'phone' as const, label: 'Phone' },
    { key: 'email' as const, label: 'Email' },
    { key: 'address' as const, label: 'Address' },
    { key: 'city' as const, label: 'City' },
    { key: 'ntn' as const, label: 'NTN' },
    { key: 'gstNumber' as const, label: 'GST Number' },
  ];

  const handleExportSuppliers = () => {
    const data = suppliers.filter(s => s.isActive);
    if (data.length === 0) { toast.error('No suppliers to export'); return; }
    exportToCSV(data, [
      ...csvColumns,
      { key: 'creditLimit' as const, label: 'Credit Limit' },
      { key: 'currentBalance' as const, label: 'Current Balance' },
    ], 'suppliers');
    toast.success(`Exported ${data.length} suppliers`);
  };

  const handleImportSuppliers = () => {
    importFromCSV<Record<string, string>>(
      (rows) => {
        let imported = 0;
        rows.forEach((row) => {
          if (!row['Company Name']) return;
          const sup: Supplier = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
            name: row['Company Name'] || '',
            contactPerson: row['Contact Person'] || '',
            phone: row['Phone'] || '',
            email: row['Email'] || '',
            address: row['Address'] || '',
            city: row['City'] || '',
            ntn: row['NTN'] || '',
            gstNumber: row['GST Number'] || '',
            creditLimit: parseFloat(row['Credit Limit'] || '100000'),
            currentBalance: 0,
            paymentTerms: 30,
            isActive: true,
            createdAt: new Date(),
          };
          addSupplier(sup);
          imported++;
        });
        toast.success(`Imported ${imported} suppliers`);
      },
      (err) => toast.error(err),
    );
  };

  // Filter suppliers
  const filteredSuppliers = suppliers.filter((supplier) => {
    const matchesSearch = searchQuery === '' || 
      supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.phone.includes(searchQuery);
    
    return matchesSearch && supplier.isActive;
  });

  // Handle add supplier
  const handleAdd = () => {
    const newSupplier: Supplier = {
      id: Date.now().toString(),
      name: formData.name || '',
      contactPerson: formData.contactPerson || '',
      phone: formData.phone || '',
      email: formData.email,
      address: formData.address || '',
      city: formData.city || '',
      ntn: formData.ntn,
      gstNumber: formData.gstNumber,
      creditLimit: formData.creditLimit || 100000,
      currentBalance: 0,
      paymentTerms: formData.paymentTerms || 30,
      isActive: true,
      createdAt: new Date(),
    };
    
    addSupplier(newSupplier);
    setShowAddDialog(false);
    resetForm();
  };

  // Handle edit supplier
  const handleEdit = () => {
    if (selectedSupplier) {
      updateSupplier(selectedSupplier.id, formData);
      setShowEditDialog(false);
      resetForm();
    }
  };

  // Handle delete supplier
  const handleDelete = () => {
    if (selectedSupplier) {
      deleteSupplier(selectedSupplier.id);
      setShowDeleteDialog(false);
      setSelectedSupplier(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      ntn: '',
      gstNumber: '',
      creditLimit: 100000,
      paymentTerms: 30,
    });
  };

  // Open edit dialog
  const openEditDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData(supplier);
    setShowEditDialog(true);
  };

  // Open delete dialog
  const openDeleteDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setShowDeleteDialog(true);
  };

  // Open details dialog
  const openDetailsDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setShowDetailsDialog(true);
  };

  // Get supplier purchases
  const supplierPurchases = selectedSupplier
    ? purchases.filter(p => p.supplierId === selectedSupplier.id)
    : [];

  // Supplier Form Content (plain JSX, not a component — avoids remount/focus-loss)
  const supplierFormContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('suppliers.companyName')}</Label>
          <Input
            placeholder={t('suppliers.companyPlaceholder')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('suppliers.contactPerson')}</Label>
          <Input
            placeholder={t('suppliers.contactPlaceholder')}
            value={formData.contactPerson}
            onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('common.phone')} *</Label>
          <Input
            placeholder={t('suppliers.phonePlaceholder')}
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('common.email')}</Label>
          <Input
            type="email"
            placeholder={t('suppliers.emailPlaceholder')}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('common.address')} *</Label>
        <Input
          placeholder={t('suppliers.addressPlaceholder')}
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('suppliers.city')} *</Label>
        <Input
          placeholder={t('suppliers.cityPlaceholder')}
          value={formData.city}
          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('suppliers.ntn')}</Label>
          <Input
            placeholder={t('suppliers.ntnPlaceholder')}
            value={formData.ntn}
            onChange={(e) => setFormData({ ...formData, ntn: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('suppliers.gst')}</Label>
          <Input
            placeholder={t('suppliers.gstPlaceholder')}
            value={formData.gstNumber}
            onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('suppliers.creditLimit')}</Label>
          <Input
            type="number"
            value={formData.creditLimit}
            onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('suppliers.paymentTerms')}</Label>
          <Input
            type="number"
            value={formData.paymentTerms}
            onChange={(e) => setFormData({ ...formData, paymentTerms: parseInt(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('suppliers.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('suppliers.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center">
            <Button variant="outline" className="gap-2" onClick={handleImportSuppliers}>
              <Upload className="w-4 h-4" />
              {t('common.import')}
            </Button>
            <ImportHelpPopover columns={csvColumns} templateFilename="suppliers" entityName="Suppliers" />
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportSuppliers}>
            <Download className="w-4 h-4" />
            {t('common.export')}
          </Button>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            {t('suppliers.addSupplier')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('suppliers.totalSuppliers')}</p>
                <p className="text-2xl font-bold">{suppliers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('suppliers.totalPayables')}</p>
                <p className="text-2xl font-bold text-red-500">
                  Rs. {suppliers.reduce((sum, s) => sum + s.currentBalance, 0).toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('suppliers.activeOrders')}</p>
                <p className="text-2xl font-bold text-amber-500">
                  {purchases.filter(p => p.status === 'ordered' || p.status === 'partial').length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('suppliers.thisMonthLabel')}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  Rs. {purchases
                    .filter(p => new Date(p.purchaseDate).getMonth() === new Date().getMonth())
                    .reduce((sum, p) => sum + p.totalAmount, 0)
                    .toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t('suppliers.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            {t('suppliers.supplierList')} ({filteredSuppliers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('suppliers.companyName')}</TableHead>
                  <TableHead>{t('suppliers.contactPerson')}</TableHead>
                  <TableHead>{t('common.phone')}</TableHead>
                  <TableHead>{t('suppliers.city')}</TableHead>
                  <TableHead>{t('suppliers.balance')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-emerald-500" />
                        <span className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {supplier.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{supplier.contactPerson}</TableCell>
                    <TableCell>{supplier.phone}</TableCell>
                    <TableCell>{supplier.city}</TableCell>
                    <TableCell>
                      <span className={supplier.currentBalance > 0 ? 'text-red-500 font-medium' : 'text-emerald-500'}>
                        Rs. {supplier.currentBalance.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailsDialog(supplier)}
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(supplier)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500"
                          onClick={() => openDeleteDialog(supplier)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('suppliers.addNew')}</DialogTitle>
            <DialogDescription>
              {t('suppliers.addNewDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {supplierFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.name || !formData.contactPerson || !formData.phone}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('suppliers.saveSupplier')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('suppliers.editTitle')}</DialogTitle>
            <DialogDescription>
              {t('suppliers.editDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {supplierFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('suppliers.updateSupplier')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {t('suppliers.deleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('suppliers.deleteConfirm', selectedSupplier?.name ?? '')}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('suppliers.deleteTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedSupplier?.name}</DialogTitle>
            <DialogDescription>
              {t('suppliers.detailsDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="info">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info">{t('suppliers.information')}</TabsTrigger>
              <TabsTrigger value="purchases">{t('suppliers.purchasesTab')}</TabsTrigger>
              <TabsTrigger value="ledger">{t('suppliers.ledger')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">{t('suppliers.contactPerson')}</Label>
                  <p className="font-medium">{selectedSupplier?.contactPerson}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('common.phone')}</Label>
                  <p className="font-medium">{selectedSupplier?.phone}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('common.email')}</Label>
                  <p className="font-medium">{selectedSupplier?.email || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('suppliers.city')}</Label>
                  <p className="font-medium">{selectedSupplier?.city}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('suppliers.ntn')}</Label>
                  <p className="font-medium">{selectedSupplier?.ntn || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('suppliers.gst')}</Label>
                  <p className="font-medium">{selectedSupplier?.gstNumber || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('suppliers.creditLimit')}</Label>
                  <p className="font-medium">Rs. {selectedSupplier?.creditLimit.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('suppliers.currentBalance')}</Label>
                  <p className="font-medium text-red-500">
                    Rs. {selectedSupplier?.currentBalance.toLocaleString()}
                  </p>
                </div>
              </div>
              <div>
                  <Label className="text-gray-500">{t('common.address')}</Label>
                <p className="font-medium">{selectedSupplier?.address}</p>
              </div>
            </TabsContent>
            
            <TabsContent value="purchases">
              <ScrollArea className="h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('suppliers.poNumber')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('common.amount')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierPurchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>{purchase.purchaseNumber}</TableCell>
                        <TableCell>{new Date(purchase.purchaseDate).toLocaleDateString()}</TableCell>
                        <TableCell>Rs. {purchase.totalAmount.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={
                            purchase.status === 'received' ? 'success' :
                            purchase.status === 'cancelled' ? 'destructive' :
                            'warning'
                          }>
                            {purchase.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="ledger">
              <div className="text-center py-8 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>{t('suppliers.ledgerHint')}</p>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
