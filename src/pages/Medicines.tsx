import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore, useInventoryStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Plus,
  Pill,
  Barcode,
  Edit,
  Trash2,
  Package,
  Filter,
  Download,
  Upload,
  Save,
  X,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Medicine, MedicineCategory, DosageForm } from '@/types';

const categories: { value: MedicineCategory; label: string }[] = [
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
  { value: 'baby_care', label: 'Baby Care' },
  { value: 'otc', label: 'OTC' },
];

const dosageForms: { value: DosageForm; label: string }[] = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'injection', label: 'Injection' },
  { value: 'drop', label: 'Drop' },
  { value: 'cream', label: 'Cream' },
  { value: 'ointment', label: 'Ointment' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'powder', label: 'Powder' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'solution', label: 'Solution' },
  { value: 'gel', label: 'Gel' },
  { value: 'lotion', label: 'Lotion' },
  { value: 'spray', label: 'Spray' },
  { value: 'patch', label: 'Patch' },
];

export function Medicines() {
  const [searchParams] = useSearchParams();
  const { settings } = useSettingsStore();
  const { t, isRTL } = useTranslation();
  const { medicines, addMedicine, updateMedicine, deleteMedicine, searchMedicines } = useInventoryStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  // ── CSV column definition ──
  const csvColumns = [
    { key: 'name' as const, label: 'Name' },
    { key: 'genericName' as const, label: 'Generic Name' },
    { key: 'brandName' as const, label: 'Brand' },
    { key: 'category' as const, label: 'Category' },
    { key: 'dosageForm' as const, label: 'Dosage Form' },
    { key: 'strength' as const, label: 'Strength' },
    { key: 'unit' as const, label: 'Unit' },
    { key: 'barcode' as const, label: 'Barcode' },
    { key: 'classification' as const, label: 'Classification' },
    { key: 'reorderLevel' as const, label: 'Reorder Level' },
    { key: 'reorderQuantity' as const, label: 'Reorder Quantity' },
  ];

  const handleExportMedicines = () => {
    const data = medicines.filter(m => m.isActive);
    if (data.length === 0) { toast.error(t('medicines.noExport')); return; }
    exportToCSV(data, csvColumns, 'medicines');
    toast.success(t('medicines.exported', data.length));
  };

  const handleImportMedicines = () => {
    importFromCSV<Record<string, string>>(
      (rows) => {
        let imported = 0;
        rows.forEach((row) => {
          if (!row['Name']) return;
          const med: Medicine = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
            name: row['Name'] || '',
            genericName: row['Generic Name'] || '',
            brandName: row['Brand'] || '',
            category: (row['Category'] || 'tablets') as MedicineCategory,
            dosageForm: (row['Dosage Form'] || 'tablet') as DosageForm,
            strength: row['Strength'] || '',
            unit: row['Unit'] || 'tablet',
            barcode: row['Barcode'] || undefined,
            classification: (row['Classification'] || 'otc') as 'otc' | 'prescription' | 'controlled',
            isPrescriptionRequired: (row['Classification'] || '').toLowerCase() === 'prescription',
            isActive: true,
            reorderLevel: parseInt(row['Reorder Level'] || '50', 10),
            reorderQuantity: parseInt(row['Reorder Quantity'] || '100', 10),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          addMedicine(med);
          imported++;
        });
        toast.success(t('medicines.imported', imported));
      },
      (err) => toast.error(err),
    );
  };
  
  const [formData, setFormData] = useState<Partial<Medicine>>({
    name: '',
    genericName: '',
    brandName: '',
    category: 'tablets',
    dosageForm: 'tablet',
    strength: '',
    unit: 'tablet',
    barcode: '',
    isPrescriptionRequired: false,
    reorderLevel: 50,
    reorderQuantity: 100,
    description: '',
  });

  // Check for edit parameter
  useEffect(() => {
    const editId = searchParams.get('id');
    if (editId) {
      const medicine = medicines.find(m => m.id === editId);
      if (medicine) {
        setSelectedMedicine(medicine);
        setFormData(medicine);
        setShowEditDialog(true);
      }
    }
  }, [searchParams, medicines]);

  // Filter medicines
  const filteredMedicines = medicines.filter((medicine) => {
    const matchesSearch = searchQuery === '' || 
      medicine.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      medicine.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      medicine.barcode?.includes(searchQuery);
    
    const matchesCategory = categoryFilter === 'all' || medicine.category === categoryFilter;
    
    return matchesSearch && matchesCategory && medicine.isActive;
  });

  // Handle add medicine
  const handleAdd = () => {
    const newMedicine: Medicine = {
      id: Date.now().toString(),
      name: formData.name || '',
      genericName: formData.genericName || '',
      brandName: formData.brandName,
      category: (formData.category as MedicineCategory) || 'tablets',
      dosageForm: (formData.dosageForm as DosageForm) || 'tablet',
      strength: formData.strength || '',
      unit: formData.unit || 'tablet',
      barcode: formData.barcode,
      isPrescriptionRequired: formData.isPrescriptionRequired || false,
      isActive: true,
      reorderLevel: formData.reorderLevel || 50,
      reorderQuantity: formData.reorderQuantity || 100,
      description: formData.description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    addMedicine(newMedicine);
    setShowAddDialog(false);
    resetForm();
  };

  // Handle edit medicine
  const handleEdit = () => {
    if (selectedMedicine) {
      updateMedicine(selectedMedicine.id, formData);
      setShowEditDialog(false);
      resetForm();
    }
  };

  // Handle delete medicine
  const handleDelete = () => {
    if (selectedMedicine) {
      deleteMedicine(selectedMedicine.id);
      setShowDeleteDialog(false);
      setSelectedMedicine(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      genericName: '',
      brandName: '',
      category: 'tablets',
      dosageForm: 'tablet',
      strength: '',
      unit: 'tablet',
      barcode: '',
      isPrescriptionRequired: false,
      reorderLevel: 50,
      reorderQuantity: 100,
      description: '',
    });
  };

  // Open edit dialog
  const openEditDialog = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setFormData(medicine);
    setShowEditDialog(true);
  };

  // Open delete dialog
  const openDeleteDialog = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setShowDeleteDialog(true);
  };

  // Medicine Form Content (plain JSX, not a component — avoids remount/focus-loss)
  const medicineFormContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('medicines.medicineName')}</Label>
          <Input
            placeholder={t('medicines.namePlaceholder')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('medicines.genericName')}</Label>
          <Input
            placeholder={t('medicines.genericPlaceholder')}
            value={formData.genericName}
            onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('medicines.brandName')}</Label>
          <Input
            placeholder={t('medicines.brandPlaceholder')}
            value={formData.brandName}
            onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('medicines.barcode')}</Label>
          <Input
            placeholder={t('medicines.barcodePlaceholder')}
            value={formData.barcode}
            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('medicines.categoryLabel')}</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData({ ...formData, category: value as MedicineCategory })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('medicines.dosageForm')}</Label>
          <Select
            value={formData.dosageForm}
            onValueChange={(value) => setFormData({ ...formData, dosageForm: value as DosageForm })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dosageForms.map(form => (
                <SelectItem key={form.value} value={form.value}>{form.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('medicines.strength')}</Label>
          <Input
            placeholder={t('medicines.strengthPlaceholder')}
            value={formData.strength}
            onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('medicines.unit')}</Label>
          <Input
            placeholder={t('medicines.unitPlaceholder')}
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('medicines.reorderLevel')}</Label>
          <Input
            type="number"
            value={formData.reorderLevel}
            onChange={(e) => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('medicines.reorderQty')}</Label>
          <Input
            type="number"
            value={formData.reorderQuantity}
            onChange={(e) => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('common.description')}</Label>
        <Textarea
          placeholder={t('medicines.descPlaceholder')}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="prescription"
          checked={formData.isPrescriptionRequired}
          onCheckedChange={(checked) => 
            setFormData({ ...formData, isPrescriptionRequired: checked as boolean })
          }
        />
        <Label htmlFor="prescription">{t('medicines.prescriptionRequired')}</Label>
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
            {t('medicines.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('medicines.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center">
            <Button variant="outline" className="gap-2" onClick={handleImportMedicines}>
              <Upload className="w-4 h-4" />
              {t('common.import')}
            </Button>
            <ImportHelpPopover columns={csvColumns} templateFilename="medicines" entityName="Medicines" />
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportMedicines}>
            <Download className="w-4 h-4" />
            {t('common.export')}
          </Button>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            {t('medicines.addMedicine')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t('medicines.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('medicines.allCategories')}</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Medicines Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            {t('medicines.medicineList')} ({filteredMedicines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('medicines.generic')}</TableHead>
                  <TableHead>{t('common.category')}</TableHead>
                  <TableHead>{t('medicines.strength')}</TableHead>
                  <TableHead>{t('common.type')}</TableHead>
                  <TableHead>{t('medicines.barcode')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMedicines.map((medicine) => (
                  <TableRow key={medicine.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Pill className="w-4 h-4 text-emerald-500" />
                        <span className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {medicine.name}
                        </span>
                        {medicine.isPrescriptionRequired && (
                          <Badge variant="destructive" className="text-xs">Rx</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{medicine.genericName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{medicine.category}</Badge>
                    </TableCell>
                    <TableCell>{medicine.strength}</TableCell>
                    <TableCell>{medicine.dosageForm}</TableCell>
                    <TableCell>
                      {medicine.barcode ? (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Barcode className="w-3 h-3" />
                          {medicine.barcode}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(medicine)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500"
                          onClick={() => openDeleteDialog(medicine)}
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

      {/* Add Medicine Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('medicines.addNew')}</DialogTitle>
            <DialogDescription>
              {t('medicines.addNewDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {medicineFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.name || !formData.genericName}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('medicines.saveMedicine')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Medicine Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('medicines.editTitle')}</DialogTitle>
            <DialogDescription>
              {t('medicines.editDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {medicineFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('medicines.updateMedicine')}
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
              {t('medicines.deleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('medicines.deleteConfirm', selectedMedicine?.name ?? '')}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
