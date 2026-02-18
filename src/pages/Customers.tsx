import { useState } from 'react';
import { useSettingsStore, useCustomerStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
} from 'lucide-react';
import type { Customer } from '@/types';

export function Customers() {
  const { settings } = useSettingsStore();
  const { customers, addCustomer, updateCustomer, deleteCustomer, searchCustomers } = useCustomerStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
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

  // Customer Form Component
  const CustomerForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Full Name *</Label>
          <Input
            placeholder="e.g., Muhammad Aslam"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Phone Number *</Label>
          <Input
            placeholder="e.g., +92-300-1234567"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            placeholder="e.g., customer@email.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>CNIC</Label>
          <Input
            placeholder="e.g., 35201-1234567-1"
            value={formData.cnic}
            onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Address</Label>
        <Input
          placeholder="Enter full address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Date of Birth</Label>
        <Input
          type="date"
          value={formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString().split('T')[0] : ''}
          onChange={(e) => setFormData({ ...formData, dateOfBirth: new Date(e.target.value) })}
        />
      </div>

      <div className="space-y-2">
        <Label>Allergies</Label>
        <Input
          placeholder="Enter allergies separated by commas"
          value={formData.allergies?.join(', ')}
          onChange={(e) => setFormData({ ...formData, allergies: e.target.value.split(',').map(s => s.trim()) })}
        />
      </div>

      <div className="space-y-2">
        <Label>Medical History</Label>
        <Input
          placeholder="Enter relevant medical history"
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
            Customers
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            Manage customers and loyalty program
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Customers</p>
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
                <p className="text-sm text-gray-500">New This Month</p>
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
                <p className="text-sm text-gray-500">Total Loyalty Points</p>
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
                <p className="text-sm text-gray-500">Total Purchases</p>
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
              placeholder="Search customers by name, phone, or CNIC..."
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
            Customer List ({filteredCustomers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>CNIC</TableHead>
                  <TableHead>Purchases</TableHead>
                  <TableHead>Loyalty Points</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Enter customer details below
            </DialogDescription>
          </DialogHeader>
          
          <CustomerForm />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.name || !formData.phone}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer details
            </DialogDescription>
          </DialogHeader>
          
          <CustomerForm />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              Update Customer
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
              Delete Customer
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selectedCustomer?.name}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedCustomer?.name}</DialogTitle>
            <DialogDescription>
              Customer details and purchase history
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-500">Phone</Label>
                <p className="font-medium">{selectedCustomer?.phone}</p>
              </div>
              <div>
                <Label className="text-gray-500">Email</Label>
                <p className="font-medium">{selectedCustomer?.email || '-'}</p>
              </div>
              <div>
                <Label className="text-gray-500">CNIC</Label>
                <p className="font-medium">{selectedCustomer?.cnic || '-'}</p>
              </div>
              <div>
                <Label className="text-gray-500">Date of Birth</Label>
                <p className="font-medium">
                  {selectedCustomer?.dateOfBirth 
                    ? new Date(selectedCustomer.dateOfBirth).toLocaleDateString() 
                    : '-'}
                </p>
              </div>
            </div>
            <div>
              <Label className="text-gray-500">Address</Label>
              <p className="font-medium">{selectedCustomer?.address || '-'}</p>
            </div>
            <div>
              <Label className="text-gray-500">Allergies</Label>
              <p className="font-medium">
                {selectedCustomer?.allergies?.length 
                  ? selectedCustomer.allergies.join(', ') 
                  : '-'}
              </p>
            </div>
            <div>
              <Label className="text-gray-500">Medical History</Label>
              <p className="font-medium">{selectedCustomer?.medicalHistory || '-'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label className="text-gray-500">Total Purchases</Label>
                <p className="font-medium text-lg">{selectedCustomer?.totalPurchases}</p>
              </div>
              <div>
                <Label className="text-gray-500">Loyalty Points</Label>
                <p className="font-medium text-lg text-amber-500">
                  {selectedCustomer?.loyaltyPoints}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
