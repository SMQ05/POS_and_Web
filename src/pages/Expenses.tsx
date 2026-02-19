import { useState } from 'react';
import { useSettingsStore, useExpenseStore, useAuthStore, useAuditLogStore } from '@/store';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Save,
  Download,
  DollarSign,
  Home,
  Users,
  Zap,
  Megaphone,
  MoreHorizontal,
  TrendingUp,
  Calendar,
  Filter,
} from 'lucide-react';
import type { Expense } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const expenseCategories: { value: Expense['category']; label: string; icon: typeof Home; color: string }[] = [
  { value: 'rent', label: 'Rent', icon: Home, color: 'bg-blue-100 text-blue-700' },
  { value: 'salary', label: 'Salary', icon: Users, color: 'bg-purple-100 text-purple-700' },
  { value: 'utilities', label: 'Utilities', icon: Zap, color: 'bg-amber-100 text-amber-700' },
  { value: 'marketing', label: 'Marketing', icon: Megaphone, color: 'bg-pink-100 text-pink-700' },
  { value: 'other', label: 'Other', icon: MoreHorizontal, color: 'bg-gray-100 text-gray-700' },
];

const defaultForm = {
  category: 'other' as Expense['category'],
  description: '',
  amount: 0,
  date: new Date().toISOString().split('T')[0],
};

export function Expenses() {
  const { settings } = useSettingsStore();
  const { expenses, addExpense, updateExpense, deleteExpense, getTotalByCategory } = useExpenseStore();
  const { currentUser } = useAuthStore();
  const { addLog } = useAuditLogStore();
  const { t, isRTL } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState(defaultForm);

  const resetForm = () => setFormData(defaultForm);

  // ─── Filtering ──────────────────────────────────────────────────
  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch =
      !searchQuery ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchesMonth =
      monthFilter === 'all' ||
      `${new Date(e.date).getFullYear()}-${String(new Date(e.date).getMonth() + 1).padStart(2, '0')}` === monthFilter;
    return matchesSearch && matchesCategory && matchesMonth;
  });

  // Available months for the filter
  const availableMonths = Array.from(
    new Set(
      expenses.map((e) => {
        const d = new Date(e.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })
    )
  ).sort().reverse();

  // ─── Stats ──────────────────────────────────────────────────────
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const thisMonth = new Date();
  const thisMonthExpenses = expenses
    .filter(
      (e) =>
        new Date(e.date).getMonth() === thisMonth.getMonth() &&
        new Date(e.date).getFullYear() === thisMonth.getFullYear()
    )
    .reduce((s, e) => s + e.amount, 0);

  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthExpenses = expenses
    .filter(
      (e) =>
        new Date(e.date).getMonth() === lastMonth.getMonth() &&
        new Date(e.date).getFullYear() === lastMonth.getFullYear()
    )
    .reduce((s, e) => s + e.amount, 0);

  const monthChange = lastMonthExpenses
    ? (((thisMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100).toFixed(1)
    : '0';

  // Category breakdown for current filter
  const categoryBreakdown = expenseCategories.map((cat) => ({
    ...cat,
    total: filteredExpenses.filter((e) => e.category === cat.value).reduce((s, e) => s + e.amount, 0),
    count: filteredExpenses.filter((e) => e.category === cat.value).length,
  }));

  // ─── CRUD ───────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!formData.description || formData.amount <= 0) {
      toast.error(t('expenses.enterValid'));
      return;
    }
    const newExpense: Expense = {
      id: Date.now().toString(),
      category: formData.category,
      description: formData.description,
      amount: formData.amount,
      date: new Date(formData.date),
      createdBy: currentUser?.id ?? '1',
      createdAt: new Date(),
    };
    addExpense(newExpense);
    addLog({
      id: Date.now().toString(),
      userId: currentUser?.id ?? '1',
      userName: currentUser?.name ?? 'Unknown',
      action: 'CREATE',
      module: 'expenses',
      details: `Added expense: ${formData.description} — Rs. ${formData.amount.toLocaleString()}`,
      createdAt: new Date(),
    });
    toast.success(t('expenses.added'));
    setShowAddDialog(false);
    resetForm();
  };

  const handleEdit = () => {
    if (!selectedExpense || !formData.description || formData.amount <= 0) {
      toast.error(t('expenses.enterValid'));
      return;
    }
    updateExpense(selectedExpense.id, {
      category: formData.category,
      description: formData.description,
      amount: formData.amount,
      date: new Date(formData.date),
    });
    addLog({
      id: Date.now().toString(),
      userId: currentUser?.id ?? '1',
      userName: currentUser?.name ?? 'Unknown',
      action: 'UPDATE',
      module: 'expenses',
      details: `Updated expense: ${formData.description} — Rs. ${formData.amount.toLocaleString()}`,
      createdAt: new Date(),
    });
    toast.success(t('expenses.updated'));
    setShowEditDialog(false);
    setSelectedExpense(null);
    resetForm();
  };

  const handleDelete = () => {
    if (!selectedExpense) return;
    deleteExpense(selectedExpense.id);
    addLog({
      id: Date.now().toString(),
      userId: currentUser?.id ?? '1',
      userName: currentUser?.name ?? 'Unknown',
      action: 'DELETE',
      module: 'expenses',
      details: `Deleted expense: ${selectedExpense.description} — Rs. ${selectedExpense.amount.toLocaleString()}`,
      createdAt: new Date(),
    });
    toast.success(t('expenses.deleted'));
    setShowDeleteDialog(false);
    setSelectedExpense(null);
  };

  const openEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    setFormData({
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      date: new Date(expense.date).toISOString().split('T')[0],
    });
    setShowEditDialog(true);
  };

  const openDelete = (expense: Expense) => {
    setSelectedExpense(expense);
    setShowDeleteDialog(true);
  };

  const handleExport = () => {
    if (filteredExpenses.length === 0) {
      toast.error(t('expenses.noExpenses'));
      return;
    }
    const rows = filteredExpenses.map((e) => ({
      date: new Date(e.date).toLocaleDateString(),
      category: e.category,
      description: e.description,
      amount: e.amount,
    }));
    const columns = [
      { key: 'date' as const, label: 'Date' },
      { key: 'category' as const, label: 'Category' },
      { key: 'description' as const, label: 'Description' },
      { key: 'amount' as const, label: 'Amount (Rs.)' },
    ];
    exportToCSV(rows, columns, `expenses_${new Date().toISOString().slice(0, 10)}`);
    toast.success(t('expenses.exportSuccess'));
  };

  const getCategoryBadge = (category: Expense['category']) => {
    const cat = expenseCategories.find((c) => c.value === category);
    return cat ? cat : expenseCategories[4];
  };

  // ─── Form JSX (plain variable, not a component — avoids focus loss) ──────
  const expenseFormContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('expenses.categoryLabel')} *</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData({ ...formData, category: value as Expense['category'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {expenseCategories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {t(`expenses.categories.${cat.value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('expenses.dateLabel')} *</Label>
          <Input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('expenses.amountLabel')} (Rs.) *</Label>
        <Input
          type="number"
          placeholder={t('expenses.amountPlaceholder')}
          value={formData.amount || ''}
          onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('expenses.descriptionLabel')} *</Label>
        <Textarea
          placeholder={t('expenses.descPlaceholder')}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className={cn(
              'text-2xl font-bold',
              settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
            )}
          >
            {t('expenses.title')}
          </h1>
          <p
            className={cn(
              'text-sm',
              settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            )}
          >
            {t('expenses.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" />
            {t('common.export')}
          </Button>
          <Button
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => {
              resetForm();
              setShowAddDialog(true);
            }}
          >
            <Plus className="w-4 h-4" />
            {t('expenses.addExpense')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('expenses.totalFiltered')}</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(totalExpenses, settings.currency)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('common.thisMonth')}</p>
                <p className="text-2xl font-bold">Rs. {thisMonthExpenses.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('expenses.lastMonth')}</p>
                <p className="text-2xl font-bold">Rs. {lastMonthExpenses.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('expenses.monthOverMonth')}</p>
                <p
                  className={cn(
                    'text-2xl font-bold',
                    Number(monthChange) > 0 ? 'text-red-500' : 'text-emerald-500'
                  )}
                >
                  {Number(monthChange) > 0 ? '+' : ''}
                  {monthChange}%
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {categoryBreakdown.map((cat) => {
          const Icon = cat.icon;
          return (
            <Card
              key={cat.value}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md',
                categoryFilter === cat.value && 'ring-2 ring-emerald-500'
              )}
              onClick={() =>
                setCategoryFilter(categoryFilter === cat.value ? 'all' : cat.value)
              }
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={cn(
                      'w-7 h-7 rounded flex items-center justify-center',
                      cat.color
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium">{t(`expenses.categories.${cat.value}`)}</span>
                </div>
                <p className="text-lg font-bold">{formatCurrency(cat.total, settings.currency)}</p>
                <p className="text-xs text-gray-500">
                  {cat.count} {t('expenses.transactions')}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            className="pl-10"
            placeholder={t('expenses.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder={t('expenses.categoryLabel')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('expenses.allCategories')}</SelectItem>
            {expenseCategories.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {t(`expenses.categories.${cat.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[180px]">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue placeholder={t('expenses.month')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('expenses.allMonths')}</SelectItem>
            {availableMonths.map((m) => {
              const [y, mo] = m.split('-');
              const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              });
              return (
                <SelectItem key={m} value={m}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('expenses.dateLabel')}</TableHead>
                <TableHead>{t('expenses.categoryLabel')}</TableHead>
                <TableHead>{t('expenses.descriptionLabel')}</TableHead>
                <TableHead className="text-right">{t('expenses.amountLabel')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                    {t('expenses.noExpenses')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((expense) => {
                    const catInfo = getCategoryBadge(expense.category);
                    return (
                      <TableRow key={expense.id}>
                        <TableCell>
                          {new Date(expense.date).toLocaleDateString('en-PK', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('font-medium', catInfo.color)}>
                            {t(`expenses.categories.${expense.category}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">
                          {expense.description}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          {formatCurrency(expense.amount, settings.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(expense)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                              onClick={() => openDelete(expense)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('expenses.addNew')}</DialogTitle>
            <DialogDescription>{t('expenses.addNewDesc')}</DialogDescription>
          </DialogHeader>

          {expenseFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.description || formData.amount <= 0}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('expenses.saveExpense')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Expense Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('expenses.editTitle')}</DialogTitle>
            <DialogDescription>{t('expenses.editDesc')}</DialogDescription>
          </DialogHeader>

          {expenseFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
              disabled={!formData.description || formData.amount <= 0}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('expenses.updateExpense')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('expenses.deleteTitle')}?</AlertDialogTitle>
            <AlertDialogDescription>
              {t('expenses.deleteConfirm', selectedExpense?.description ?? '', selectedExpense?.amount.toLocaleString() ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={handleDelete}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
