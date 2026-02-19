import { useState } from 'react';
import { useSettingsStore, useCustomerStore, usePrescriptionStore } from '@/store';
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
  Users,
  Phone,
  Mail,
  MapPin,
  Gift,
  Edit,
  Trash2,
  History,
  Save,
  AlertCircle,
  TrendingUp,
  Star,
  Download,
  Upload,
  FileText,
  Pill,
  Clock,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Customer } from '@/types';

export function Customers() {
  const { settings } = useSettingsStore();
  const { getByCustomer } = usePrescriptionStore();
  const { customers, addCustomer, updateCustomer, deleteCustomer, searchCustomers } = useCustomerStore();
  const { t, isRTL } = useTranslation();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // ── CSV column definition ──
  const csvColumns = [
    { key: 'name' as const, label: 'Name' },
    { key: 'phone' as const, label: 'Phone' },
    { key: 'email' as const, label: 'Email' },
    { key: 'cnic' as const, label: 'CNIC' },
    { key: 'address' as const, label: 'Address' },
  ];

  const handleExportCustomers = () => {
    const data = customers.filter(c => c.isActive);
    if (data.length === 0) { toast.error('No customers to export'); return; }
    exportToCSV(data, [
      ...csvColumns,
      { key: 'totalPurchases' as const, label: 'Total Purchases' },
      { key: 'loyaltyPoints' as const, label: 'Loyalty Points' },
    ], 'customers');
    toast.success(`Exported ${data.length} customers`);
  };

  const handleImportCustomers = () => {
    importFromCSV<Record<string, string>>(
      (rows) => {
        let imported = 0;
        rows.forEach((row) => {
          if (!row['Name'] || !row['Phone']) return;
          const cust: Customer = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
            name: row['Name'] || '',
            phone: row['Phone'] || '',
            email: row['Email'] || undefined,
            cnic: row['CNIC'] || undefined,
            address: row['Address'] || undefined,
            isActive: true,
            createdAt: new Date(),
            totalPurchases: 0,
            loyaltyPoints: 0,
          };
          addCustomer(cust);
          imported++;
        });
        toast.success(`Imported ${imported} customers`);
      },
      (err) => toast.error(err),
    );
  };
  
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    cnic: '',
    address: '',
    dateOfBirth: undefined,
    allergies: [],
    medicalHistory: '',
  });

  // Filter customers
  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch = searchQuery === '' || 
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      customer.cnic?.includes(searchQuery);
    
    return matchesSearch && customer.isActive;
  });

  // Handle add customer
  const handleAdd = () => {
    const newCustomer: Customer = {
      id: Date.now().toString(),
      name: formData.name || '',
      phone: formData.phone || '',
      email: formData.email,
      cnic: formData.cnic,
      address: formData.address,
      dateOfBirth: formData.dateOfBirth,
      allergies: formData.allergies,
      medicalHistory: formData.medicalHistory,
      isActive: true,
      createdAt: new Date(),
      totalPurchases: 0,
      loyaltyPoints: 0,
    };
    
    addCustomer(newCustomer);
    setShowAddDialog(false);
    resetForm();
  };

  // Handle edit customer
  const handleEdit = () => {
    if (selectedCustomer) {
      updateCustomer(selectedCustomer.id, formData);
      setShowEditDialog(false);
      resetForm();
    }
  };

  // Handle delete customer
  const handleDelete = () => {
    if (selectedCustomer) {
      deleteCustomer(selectedCustomer.id);
      setShowDeleteDialog(false);
      setSelectedCustomer(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      cnic: '',
      address: '',
      dateOfBirth: undefined,
      allergies: [],
      medicalHistory: '',
    });
  };

  // Open edit dialog
  const openEditDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData(customer);
    setShowEditDialog(true);
  };

  // Open delete dialog
  const openDeleteDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDeleteDialog(true);
  };

  // Open details dialog
  const openDetailsDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDetailsDialog(true);
  };

  // Customer Form Content (plain JSX, not a component — avoids remount/focus-loss)
  const customerFormContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('customers.fullName')}</Label>
          <Input
            placeholder={t('customers.namePlaceholder')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('customers.phoneNumber')}</Label>
          <Input
            placeholder={t('customers.phonePlaceholder')}
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('common.email')}</Label>
          <Input
            type="email"
            placeholder={t('customers.emailPlaceholder')}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('customers.cnic')}</Label>
          <Input
            placeholder={t('customers.cnicPlaceholder')}
            value={formData.cnic}
            onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('common.address')}</Label>
        <Input
          placeholder={t('customers.addressPlaceholder')}
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('customers.dateOfBirth')}</Label>
        <Input
          type="date"
          value={formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString().split('T')[0] : ''}
          onChange={(e) => setFormData({ ...formData, dateOfBirth: new Date(e.target.value) })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('customers.allergies')}</Label>
        <Input
          placeholder={t('customers.allergiesPlaceholder')}
          value={formData.allergies?.join(', ')}
          onChange={(e) => setFormData({ ...formData, allergies: e.target.value.split(',').map(s => s.trim()) })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('customers.medicalHistory')}</Label>
        <Input
          placeholder={t('customers.historyPlaceholder')}
          value={formData.medicalHistory}
          onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
        />
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
            {t('customers.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('customers.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center">
            <Button variant="outline" className="gap-2" onClick={handleImportCustomers}>
              <Upload className="w-4 h-4" />
              {t('common.import')}
            </Button>
            <ImportHelpPopover columns={csvColumns} templateFilename="customers" entityName="Customers" />
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportCustomers}>
            <Download className="w-4 h-4" />
            {t('common.export')}
          </Button>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            {t('customers.addCustomer')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('customers.totalCustomers')}</p>
                <p className="text-2xl font-bold">{customers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('customers.newThisMonth')}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {customers.filter(c => 
                    new Date(c.createdAt).getMonth() === new Date().getMonth()
                  ).length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('customers.loyaltyPoints')}</p>
                <p className="text-2xl font-bold text-amber-500">
                  {customers.reduce((sum, c) => sum + c.loyaltyPoints, 0).toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('customers.totalPurchases')}</p>
                <p className="text-2xl font-bold text-purple-500">
                  {customers.reduce((sum, c) => sum + c.totalPurchases, 0).toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Gift className="w-5 h-5 text-purple-600" />
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
              placeholder={t('customers.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            {t('customers.customerList')} ({filteredCustomers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.phone')}</TableHead>
                  <TableHead>{t('customers.cnic')}</TableHead>
                  <TableHead>{t('customers.totalPurchases')}</TableHead>
                  <TableHead>{t('customers.loyaltyPoints')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-emerald-600">
                            {customer.name.charAt(0)}
                          </span>
                        </div>
                        <span className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {customer.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>{customer.cnic || '-'}</TableCell>
                    <TableCell>{customer.totalPurchases}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1">
                        <Star className="w-3 h-3" />
                        {customer.loyaltyPoints}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailsDialog(customer)}
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(customer)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500"
                          onClick={() => openDeleteDialog(customer)}
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

      {/* Add Customer Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('customers.addNew')}</DialogTitle>
            <DialogDescription>
              {t('customers.addNewDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {customerFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.name || !formData.phone}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('customers.saveCustomer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('customers.editTitle')}</DialogTitle>
            <DialogDescription>
              {t('customers.editDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {customerFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('customers.updateCustomer')}
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
              {t('customers.deleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('customers.deleteConfirm', selectedCustomer?.name || '')}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('customers.deleteTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedCustomer?.name}</DialogTitle>
            <DialogDescription>
              {t('customers.detailsDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">{t('customers.customerDetails')}</TabsTrigger>
              <TabsTrigger value="prescriptions" className="gap-1">
                <FileText className="w-3.5 h-3.5" />
                {t('customers.prescriptions')}
                {selectedCustomer && getByCustomer(selectedCustomer.id).length > 0 && (
                  <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0">
                    {getByCustomer(selectedCustomer.id).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex-1 overflow-auto">
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-500">{t('common.phone')}</Label>
                    <p className="font-medium">{selectedCustomer?.phone}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('common.email')}</Label>
                    <p className="font-medium">{selectedCustomer?.email || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('customers.cnic')}</Label>
                    <p className="font-medium">{selectedCustomer?.cnic || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('customers.dateOfBirth')}</Label>
                    <p className="font-medium">
                      {selectedCustomer?.dateOfBirth 
                        ? new Date(selectedCustomer.dateOfBirth).toLocaleDateString() 
                        : '-'}
                    </p>
                  </div>
                </div>
                <div>
                  <Label className="text-gray-500">{t('common.address')}</Label>
                  <p className="font-medium">{selectedCustomer?.address || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('customers.allergies')}</Label>
                  <p className="font-medium">
                    {selectedCustomer?.allergies?.length 
                      ? selectedCustomer.allergies.join(', ') 
                      : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-500">{t('customers.medicalHistory')}</Label>
                  <p className="font-medium">{selectedCustomer?.medicalHistory || '-'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <Label className="text-gray-500">{t('customers.totalPurchases')}</Label>
                    <p className="font-medium text-lg">{selectedCustomer?.totalPurchases}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">{t('customers.loyaltyPoints')}</Label>
                    <p className="font-medium text-lg text-amber-500">
                      {selectedCustomer?.loyaltyPoints}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="prescriptions" className="flex-1 overflow-hidden">
              <ScrollArea className="max-h-[50vh] pr-2">
                {selectedCustomer && getByCustomer(selectedCustomer.id).length > 0 ? (
                  <div className="space-y-3 pt-2">
                    {getByCustomer(selectedCustomer.id).map((rx) => (
                      <Card key={rx.id} className="border-l-4 border-l-blue-500">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">{rx.doctorName}</span>
                                {rx.prescriptionNumber && (
                                  <Badge variant="outline" className="text-xs">
                                    Rx# {rx.prescriptionNumber}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                <Clock className="w-3 h-3" />
                                {new Date(rx.createdAt).toLocaleDateString()}
                                <span className="text-gray-400">·</span>
                                {t('customers.reorderedTimes', rx.saleIds.length)}
                              </div>
                            </div>
                            <Badge className={rx.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                              {rx.isActive ? t('common.active') : t('common.inactive')}
                            </Badge>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <div className="space-y-1">
                              {rx.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                  <span className="flex items-center gap-1">
                                    <Pill className="w-3 h-3 text-emerald-500" />
                                    {item.medicineName}
                                  </span>
                                  <span className="text-gray-500">x{item.quantity} — Rs. {(item.unitPrice * item.quantity).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="border-t mt-2 pt-1.5 flex justify-between text-xs font-medium">
                              <span>{t('common.total')}</span>
                              <span>Rs. {rx.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0).toFixed(2)}</span>
                            </div>
                          </div>
                          {rx.notes && (
                            <p className="text-xs text-gray-500 mt-1.5 italic">{rx.notes}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">{t('customers.noPrescriptions')}</p>
                    <p className="text-sm">{t('customers.prescriptionsHint')}</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
