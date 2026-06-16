import { useEffect, useState } from 'react';
import { useSettingsStore, useAuthStore } from '@/store';
import { apiRequest, adminResetSalesPin, adminClearSalesPin } from '@/lib/backend';
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
  KeyRound,
} from 'lucide-react';

const POS_ROLES = new Set(['owner', 'manager', 'cashier', 'salesman', 'pharmacist']);
import { useTranslation } from '@/hooks/useTranslation';
import type { User, UserRole, Permission } from '@/types';
import { toast } from 'sonner';

const roles: { value: UserRole; label: string; description: string }[] = [
  { value: 'owner', label: 'Owner', description: 'Full system access' },
  { value: 'manager', label: 'Manager', description: 'Manage operations and staff' },
  { value: 'cashier', label: 'Cashier', description: 'POS and sales only' },
  { value: 'salesman', label: 'Salesman', description: 'POS selling only' },
  { value: 'pharmacist', label: 'Pharmacist', description: 'Medicines and prescriptions' },
  { value: 'accountant', label: 'Accountant', description: 'Financial reports only' },
];

// One row per gated module. Labels note the newer features each module also
// controls, since several pages share a module key for access control.
const permissions = [
  { module: 'pos', label: 'POS Billing' },
  { module: 'sales', label: 'Sales & Returns' },
  { module: 'inventory', label: 'Inventory & Reconcile' },
  { module: 'medicines', label: 'Medicines' },
  { module: 'suppliers', label: 'Suppliers, Purchase Orders & Network' },
  { module: 'customers', label: 'Customers & Promise Orders' },
  { module: 'alerts', label: 'Alerts (expiry / low-stock / returns)' },
  { module: 'reports', label: 'Reports, Ledger, Audit, Day Close & Inbox' },
  { module: 'expenses', label: 'Expenses' },
  { module: 'branches', label: 'Branches' },
  { module: 'billing', label: 'Subscription & Billing' },
  { module: 'users', label: 'Users & Permissions' },
  { module: 'settings', label: 'Settings' },
];

const ALL_ACTIONS: Permission['actions'] = ['create', 'read', 'update', 'delete'];
const everyModule = (actions: Permission['actions']): Permission[] =>
  permissions.map((p) => ({ module: p.module, actions: [...actions] }));

// Sensible starting permission set per role — pre-ticked when the owner picks a
// role on the add/edit form, so they only tweak from a working baseline rather
// than building it up from nothing. Owner is full; everyone else can be widened
// or narrowed afterwards.
const roleDefaultPermissions: Record<UserRole, Permission[]> = {
  superadmin: everyModule(ALL_ACTIONS),
  owner: everyModule(ALL_ACTIONS),
  manager: everyModule(ALL_ACTIONS).map((p) =>
    p.module === 'settings' || p.module === 'users'
      ? { module: p.module, actions: ['read', 'update'] }
      : p,
  ),
  cashier: [
    { module: 'pos', actions: ['create', 'read', 'update'] },
    { module: 'sales', actions: ['create', 'read'] },
    { module: 'customers', actions: ['create', 'read'] },
    { module: 'inventory', actions: ['read'] },
    { module: 'medicines', actions: ['read'] },
    { module: 'alerts', actions: ['read'] },
  ],
  salesman: [
    { module: 'pos', actions: ['create', 'read'] },
    { module: 'sales', actions: ['create', 'read'] },
    { module: 'customers', actions: ['create', 'read'] },
    { module: 'medicines', actions: ['read'] },
    { module: 'inventory', actions: ['read'] },
    { module: 'alerts', actions: ['read'] },
  ],
  pharmacist: [
    { module: 'medicines', actions: ['create', 'read', 'update', 'delete'] },
    { module: 'inventory', actions: ['read', 'update'] },
    { module: 'pos', actions: ['create', 'read'] },
    { module: 'sales', actions: ['create', 'read'] },
    { module: 'customers', actions: ['create', 'read'] },
    { module: 'alerts', actions: ['read', 'update'] },
    { module: 'suppliers', actions: ['read'] },
  ],
  accountant: [
    { module: 'reports', actions: ['read'] },
    { module: 'sales', actions: ['read'] },
    { module: 'suppliers', actions: ['read'] },
    { module: 'customers', actions: ['read'] },
    { module: 'expenses', actions: ['create', 'read', 'update'] },
    { module: 'alerts', actions: ['read'] },
  ],
};

const defaultPermsFor = (role: UserRole): Permission[] =>
  (roleDefaultPermissions[role] ?? []).map((p) => ({ module: p.module, actions: [...p.actions] }));

export function Users() {
  const { settings } = useSettingsStore();
  const { currentUser, branches: branchesList } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [password, setPassword] = useState('');
  // Optional POS credentials for a salesman: a short username + 4-digit PIN they
  // type at the register to attribute (and print) the sale under their name.
  const [salesUsername, setSalesUsername] = useState('');
  const [salesPin, setSalesPin] = useState('');
  const { t, isRTL } = useTranslation();

  // Manager can only create/manage cashier and salesman accounts
  const availableRoles = currentUser?.role === 'manager'
    ? roles.filter(r => r.value === 'cashier' || r.value === 'salesman')
    : roles;
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  // Sales PIN reset / clear
  const [showResetPinDialog, setShowResetPinDialog] = useState(false);
  const [resetPinTarget, setResetPinTarget] = useState<User | null>(null);
  const [resetPinUsername, setResetPinUsername] = useState('');
  const [resetPinValue, setResetPinValue] = useState('');
  const [resetPinSubmitting, setResetPinSubmitting] = useState(false);
  
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: 'cashier',
    permissions: defaultPermsFor('cashier'),
    isActive: true,
  });

  useEffect(() => {
    apiRequest<User[]>('/users')
      // Super Admin is a platform-level account, not pharmacy staff — keep it out
      // of the tenant's User Management list and its stat counts.
      .then((list) => setUsers(list.filter((u) => u.role !== 'superadmin')))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to load users'));
  }, []);

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchesSearch = searchQuery === '' || 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  // Handle add user
  const handleAdd = async () => {
    try {
      const trimmedSalesUser = salesUsername.trim();
      const newUser = await apiRequest<User>('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password,
          role: formData.role,
          permissions: formData.permissions || [],
          isActive: formData.isActive ?? true,
          // Optional POS login for the salesman. Only sent when both are filled.
          ...(trimmedSalesUser && salesPin
            ? { salesUsername: trimmedSalesUser, salesPin }
            : {}),
        }),
      });
      setUsers([...users, newUser]);
      setShowAddDialog(false);
      resetForm();
      toast.success('User created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create user');
    }
  };

  // Handle edit user
  const handleEdit = async () => {
    if (selectedUser) {
      try {
        const payload: Record<string, unknown> = { ...formData };
        if (password) payload.password = password;
        const updatedUser = await apiRequest<User>(`/users/${selectedUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
        setShowEditDialog(false);
        resetForm();
        toast.success('User updated');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to update user');
      }
    }
  };

  // Handle delete user
  const handleDelete = async () => {
    if (selectedUser) {
      try {
        await apiRequest(`/users/${selectedUser.id}`, { method: 'DELETE' });
        setUsers(users.filter(u => u.id !== selectedUser.id));
        setShowDeleteDialog(false);
        setSelectedUser(null);
        toast.success('User deactivated');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to deactivate user');
      }
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: 'cashier',
      permissions: defaultPermsFor('cashier'),
      isActive: true,
    });
    setPassword('');
    setSalesUsername('');
    setSalesPin('');
  };

  // Open edit dialog
  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData(user);
    setPassword('');
    setShowEditDialog(true);
  };

  // Open delete dialog
  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  // Open the admin "set/reset PIN" dialog for a staff member.
  const openResetPinDialog = (user: User) => {
    setResetPinTarget(user);
    setResetPinUsername(user.salesUsername ?? '');
    setResetPinValue('');
    setShowResetPinDialog(true);
  };

  const handleResetPin = async () => {
    if (!resetPinTarget) return;
    if (!/^[a-zA-Z0-9._-]{2,40}$/.test(resetPinUsername)) {
      toast.error('Username: 2–40 chars, letters/digits/._- only');
      return;
    }
    if (!/^\d{4}$/.test(resetPinValue)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    setResetPinSubmitting(true);
    try {
      const updated = await adminResetSalesPin(resetPinTarget.id, resetPinUsername, resetPinValue);
      setUsers(users.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`PIN set for ${updated.name}. Share it securely.`);
      setShowResetPinDialog(false);
      setResetPinTarget(null);
      setResetPinValue('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to set PIN');
    } finally {
      setResetPinSubmitting(false);
    }
  };

  const handleClearPin = async (user: User) => {
    if (!confirm(`Clear ${user.name}'s POS PIN? They will not be able to process sales until a new PIN is set.`)) return;
    try {
      await adminClearSalesPin(user.id);
      setUsers(users.map((u) => (u.id === user.id ? { ...u, salesPinSet: false, salesUsername: undefined } : u)));
      toast.success('PIN cleared');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to clear PIN');
    }
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

  // User Form Content (plain JSX, not a component — avoids remount/focus-loss)
  const userFormContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('users.fullName')}</Label>
          <Input
            placeholder={t('users.namePlaceholder')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('users.emailLabel')}</Label>
          <Input
            type="email"
            placeholder={t('users.emailPlaceholder')}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('users.role')} *</Label>
        <Select
          value={formData.role}
          onValueChange={(value) =>
            // Pre-tick the role's default permissions so the owner starts from a
            // working baseline and only adds/removes from there.
            setFormData({ ...formData, role: value as UserRole, permissions: defaultPermsFor(value as UserRole) })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableRoles.map(role => (
              <SelectItem key={role.value} value={role.value}>
                <div>
                  <p>{t(`roles.${role.value}`)}</p>
                  <p className="text-xs text-gray-500">{t(`users.roleDescriptions.${role.value}`)}</p>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* M6 — Per-branch access list. Owner-only. Three states per branch:
          "none" (no entry), "read", "full". Server enforces the same rules. */}
      {/* Per-branch access only matters with more than one branch. */}
      {currentUser?.role === 'owner' && branchesList.length > 1 && (
        <div className="space-y-2">
          <Label>Branch access</Label>
          <p className="text-xs text-gray-500 -mt-1">
            Set per-branch access. Leave a branch with no chip = no access.
          </p>
          <div className="space-y-2">
            {branchesList.map((br) => {
              const current = (formData.branchAccess ?? []).find((e) => e.branchId === br.id)?.access;
              const setAccess = (access: 'none' | 'read' | 'full') => {
                const list = (formData.branchAccess ?? []).filter((e) => e.branchId !== br.id);
                if (access !== 'none') list.push({ branchId: br.id, access });
                setFormData({ ...formData, branchAccess: list });
              };
              return (
                <div key={br.id} className="flex items-center justify-between p-2 rounded border bg-gray-50">
                  <span className="text-sm font-medium">{br.name}</span>
                  <div className="flex gap-1">
                    {(['none', 'read', 'full'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setAccess(opt)}
                        className={cn(
                          'text-[11px] px-2.5 py-1 rounded border uppercase',
                          (current ?? 'none') === opt
                            ? opt === 'full' ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                              : opt === 'read' ? 'bg-amber-100 border-amber-300 text-amber-700'
                                : 'bg-gray-100 border-gray-300 text-gray-600'
                            : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50',
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Password {showEditDialog ? '(leave blank to keep current)' : '*'}</Label>
        <Input
          type="password"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {!showEditDialog && formData.role && POS_ROLES.has(formData.role) && (
        <div className="space-y-2">
          <Label>POS login (optional)</Label>
          <p className="text-xs text-muted-foreground">
            The salesman types this username + 4-digit PIN at the register to print
            sales under their name. They can change the PIN later from My Profile.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="POS username"
              value={salesUsername}
              onChange={(e) => setSalesUsername(e.target.value)}
            />
            <Input
              placeholder="4-digit PIN"
              inputMode="numeric"
              maxLength={4}
              value={salesPin}
              onChange={(e) => setSalesPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>{t('users.permissions')}</Label>
        <div className="border rounded-lg p-4 space-y-3">
          {permissions.map((perm) => (
            <div key={perm.module} className="flex items-center justify-between">
              <span className="font-medium">{t(`users.permissionModules.${perm.module}`)}</span>
              <div className="flex gap-4">
                {['create', 'read', 'update', 'delete'].map((action) => (
                  <div key={action} className="flex items-center gap-1">
                    <Checkbox
                      id={`${perm.module}-${action}`}
                      checked={hasPermission(perm.module, action)}
                      onCheckedChange={() => togglePermission(perm.module, action)}
                    />
                    <Label htmlFor={`${perm.module}-${action}`} className="text-xs capitalize">
                      {t(`users.permissionActions.${action}`)}
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
        <Label htmlFor="active">{t('users.activeUser')}</Label>
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
            {t('users.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('users.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            {t('users.addUser')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('users.totalUsers')}</p>
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
                <p className="text-sm text-gray-500">{t('users.activeUsers')}</p>
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
                <p className="text-sm text-gray-500">{t('users.inactiveUsers')}</p>
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
                <p className="text-sm text-gray-500">{t('users.onlineNow')}</p>
                <p className="text-2xl font-bold text-amber-500">
                  {users.filter(u => Boolean(u.lastLogin)).length}
                </p>
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
              placeholder={t('users.searchPlaceholder')}
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
            {t('users.userList')} ({filteredUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('users.user')}</TableHead>
                  <TableHead>{t('users.role')}</TableHead>
                  <TableHead>POS PIN</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('users.lastLogin')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
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
                        {t(`roles.${user.role}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!POS_ROLES.has(user.role) ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : user.salesPinSet ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                          <Check className="w-3 h-3" />
                          {user.salesUsername || 'set'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">not set</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'success' : 'secondary'}>
                        {user.isActive ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastLogin 
                        ? new Date(user.lastLogin).toLocaleDateString() 
                        : t('users.never')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(currentUser?.role === 'owner' || user.role === 'cashier' || user.role === 'salesman') && (
                        <>
                        {POS_ROLES.has(user.role) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={user.salesPinSet ? 'Reset PIN' : 'Set PIN'}
                            onClick={() => openResetPinDialog(user)}
                          >
                            <KeyRound className="w-4 h-4" />
                          </Button>
                        )}
                        {POS_ROLES.has(user.role) && user.salesPinSet && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Clear PIN"
                            className="text-amber-600"
                            onClick={() => handleClearPin(user)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
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
                        </>
                        )}
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('users.addNew')}</DialogTitle>
            <DialogDescription>
              {t('users.addNewDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {userFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.name || !formData.email || password.length < 8}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('users.createUser')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('users.editTitle')}</DialogTitle>
            <DialogDescription>
              {t('users.editDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {userFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('users.updateUser')}
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
              {t('users.deleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('users.deleteConfirm', selectedUser?.name || '')}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('users.deleteTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / Reset Sales PIN Dialog (admin) */}
      <Dialog
        open={showResetPinDialog}
        onOpenChange={(open) => {
          if (resetPinSubmitting) return;
          setShowResetPinDialog(open);
          if (!open) { setResetPinTarget(null); setResetPinValue(''); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              {resetPinTarget?.salesPinSet ? 'Reset' : 'Set'} POS PIN for {resetPinTarget?.name}
            </DialogTitle>
            <DialogDescription>
              The staff member uses this username + PIN at the POS receipt step.
              Share these credentials with them securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="reset-username">POS Username</Label>
              <Input
                id="reset-username"
                value={resetPinUsername}
                onChange={(e) => setResetPinUsername(e.target.value)}
                autoComplete="off"
                placeholder="e.g. ahmad"
                disabled={resetPinSubmitting}
              />
            </div>
            <div>
              <Label htmlFor="reset-pin">4-digit PIN</Label>
              <Input
                id="reset-pin"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={resetPinValue}
                onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="font-mono tracking-widest text-center text-xl"
                disabled={resetPinSubmitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPinDialog(false)} disabled={resetPinSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleResetPin} disabled={resetPinSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
              {resetPinSubmitting ? 'Saving…' : 'Save PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
