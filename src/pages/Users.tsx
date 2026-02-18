import { useState } from 'react';
import { useSettingsStore } from '@/store';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Plus,
  User as UserIcon,
  UserCog,
  Shield,
  Edit,
  Trash2,
  Save,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import type { User, UserRole } from '@/types';

const roles: { value: UserRole; label: string; description: string }[] = [
  { value: 'owner', label: 'Owner', description: 'Full system access' },
  { value: 'manager', label: 'Manager', description: 'Manage operations and staff' },
  { value: 'cashier', label: 'Cashier', description: 'POS and sales only' },
  { value: 'pharmacist', label: 'Pharmacist', description: 'Medicines and prescriptions' },
  { value: 'accountant', label: 'Accountant', description: 'Financial reports only' },
];

const permissions = [
  { module: 'pos', label: 'POS Billing' },
  { module: 'sales', label: 'Sales' },
  { module: 'inventory', label: 'Inventory' },
  { module: 'medicines', label: 'Medicines' },
  { module: 'suppliers', label: 'Suppliers' },
  { module: 'customers', label: 'Customers' },
  { module: 'reports', label: 'Reports' },
  { module: 'users', label: 'Users' },
  { module: 'settings', label: 'Settings' },
];

// Mock users data
const mockUsers: User[] = [
  {
    id: '1',
    name: 'Ahmad Khan',
    email: 'owner@pharmapos.pk',
    role: 'owner',
    permissions: [{ module: '*', actions: ['create', 'read', 'update', 'delete'] }],
    isActive: true,
    createdAt: new Date('2024-01-01'),
    lastLogin: new Date(),
  },
  {
    id: '2',
    name: 'Fatima Ali',
    email: 'manager@pharmapos.pk',
    role: 'manager',
    permissions: [
      { module: 'pos', actions: ['create', 'read', 'update'] },
      { module: 'inventory', actions: ['create', 'read', 'update'] },
      { module: 'reports', actions: ['read'] },
    ],
    isActive: true,
    createdAt: new Date('2024-01-15'),
    lastLogin: new Date(),
  },
  {
    id: '3',
    name: 'Usman Malik',
    email: 'cashier@pharmapos.pk',
    role: 'cashier',
    permissions: [
      { module: 'pos', actions: ['create', 'read'] },
      { module: 'sales', actions: ['read'] },
    ],
    isActive: true,
    createdAt: new Date('2024-02-01'),
    lastLogin: new Date(),
  },
  {
    id: '4',
    name: 'Dr. Ayesha Rahman',
    email: 'pharmacist@pharmapos.pk',
    role: 'pharmacist',
    permissions: [
      { module: 'inventory', actions: ['read', 'update'] },
      { module: 'medicines', actions: ['read'] },
    ],
    isActive: true,
    createdAt: new Date('2024-02-15'),
    lastLogin: new Date(),
  },
];

export function Users() {
  const { settings } = useSettingsStore();
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'cashier',
    permissions: [],
    isActive: true,
  });

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchesSearch = searchQuery === '' || 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  // Handle add user
  const handleAdd = () => {
    const newUser: User = {
      id: Date.now().toString(),
      name: formData.name || '',
      email: formData.email || '',
      role: (formData.role as UserRole) || 'cashier',
      permissions: formData.permissions || [],
      isActive: true,
      createdAt: new Date(),
    };
    
    setUsers([...users, newUser]);
    setShowAddDialog(false);
    resetForm();
  };

  // Handle edit user
  const handleEdit = () => {
    if (selectedUser) {
      setUsers(users.map(u => u.id === selectedUser.id ? { ...u, ...formData } : u));
      setShowEditDialog(false);
      resetForm();
    }
  };

  // Handle delete user
  const handleDelete = () => {
    if (selectedUser) {
      setUsers(users.filter(u => u.id !== selectedUser.id));
      setShowDeleteDialog(false);
      setSelectedUser(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: 'cashier',
      permissions: [],
      isActive: true,
    });
  };

  // Open edit dialog
  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData(user);
    setShowEditDialog(true);
  };

  // Open delete dialog
  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  // Toggle permission
  const togglePermission = (module: string, action: string) => {
    const currentPerms = formData.permissions || [];
    const existingPerm = currentPerms.find(p => p.module === module);
    
    if (existingPerm) {
      const hasAction = existingPerm.actions.includes(action as any);
      if (hasAction) {
        existingPerm.actions = existingPerm.actions.filter(a => a !== action);
      } else {
        existingPerm.actions.push(action as any);
      }
      setFormData({ ...formData, permissions: [...currentPerms] });
    } else {
      setFormData({
        ...formData,
        permissions: [...currentPerms, { module, actions: [action as any] }],
      });
    }
  };

  // Check if has permission
  const hasPermission = (module: string, action: string) => {
    return formData.permissions?.some(
      p => p.module === module && p.actions.includes(action as any)
    );
  };

  // User Form Component
  const UserForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Full Name *</Label>
          <Input
            placeholder="e.g., John Doe"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input
            type="email"
            placeholder="e.g., user@pharmapos.pk"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Role *</Label>
        <Select
          value={formData.role}
          onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map(role => (
              <SelectItem key={role.value} value={role.value}>
                <div>
                  <p>{role.label}</p>
                  <p className="text-xs text-gray-500">{role.description}</p>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Permissions</Label>
        <div className="border rounded-lg p-4 space-y-3">
          {permissions.map((perm) => (
            <div key={perm.module} className="flex items-center justify-between">
              <span className="font-medium">{perm.label}</span>
              <div className="flex gap-4">
                {['create', 'read', 'update', 'delete'].map((action) => (
                  <div key={action} className="flex items-center gap-1">
                    <Checkbox
                      id={`${perm.module}-${action}`}
                      checked={hasPermission(perm.module, action)}
                      onCheckedChange={() => togglePermission(perm.module, action)}
                    />
                    <Label htmlFor={`${perm.module}-${action}`} className="text-xs capitalize">
                      {action}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="active"
          checked={formData.isActive}
          onCheckedChange={(checked) => 
            setFormData({ ...formData, isActive: checked as boolean })
          }
        />
        <Label htmlFor="active">Active User</Label>
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
            User Management
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            Manage users and their permissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Users</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Users</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {users.filter(u => u.isActive).length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Inactive Users</p>
                <p className="text-2xl font-bold text-red-500">
                  {users.filter(u => !u.isActive).length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <X className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Online Now</p>
                <p className="text-2xl font-bold text-amber-500">3</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <UserCog className="w-5 h-5 text-amber-600" />
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
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            User List ({filteredUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                          <span className="font-medium text-emerald-600">
                            {user.name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className={cn(
                            'font-medium',
                            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                          )}>
                            {user.name}
                          </p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        <Shield className="w-3 h-3 mr-1" />
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'success' : 'secondary'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastLogin 
                        ? new Date(user.lastLogin).toLocaleDateString() 
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500"
                          onClick={() => openDeleteDialog(user)}
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

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account
            </DialogDescription>
          </DialogHeader>
          
          <UserForm />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.name || !formData.email}
            >
              <Save className="w-4 h-4 mr-2" />
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user details and permissions
            </DialogDescription>
          </DialogHeader>
          
          <UserForm />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              Update User
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
              Delete User
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selectedUser?.name}</strong>?
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
    </div>
  );
}
