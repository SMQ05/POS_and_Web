import { useState } from 'react';
import { useSettingsStore, useAuthStore, useInventoryStore, useSalesStore, useExpenseStore, useCustomerStore, useSupplierStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Store,
  Receipt,
  Bell,
  Shield,
  Database,
  Printer,
  Globe,
  Moon,
  Sun,
  Save,
  RotateCcw,
  Smartphone,
  CreditCard,
  Building2,
} from 'lucide-react';

export function Settings() {
  const { settings, updateSettings, toggleTheme } = useSettingsStore();
  const { t, isRTL } = useTranslation();
  const [activeTab, setActiveTab] = useState('general');
  const [showClearDialog, setShowClearDialog] = useState(false);

  const handleSave = () => {
    toast.success(t('settings.saved'));
  };

  const handleReset = () => {
    // Reset to defaults by clearing persisted settings storage
    localStorage.removeItem('settings-storage');
    window.location.reload();
  };

  const handleBackupNow = () => {
    const data = {
      settings: localStorage.getItem('settings-storage'),
      auth: localStorage.getItem('auth-storage'),
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmapos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('settings.backupDownloaded'));
  };

  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.settings) localStorage.setItem('settings-storage', data.settings);
          if (data.auth) localStorage.setItem('auth-storage', data.auth);
          toast.success(t('settings.backupRestored'));
          setTimeout(() => window.location.reload(), 1000);
        } catch {
          toast.error(t('settings.invalidBackup'));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearData = () => {
    localStorage.clear();
    toast.success(t('settings.dataCleared'));
    setTimeout(() => window.location.reload(), 1000);
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
            {t('settings.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('settings.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
            {t('common.reset')}
          </Button>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={handleSave}
          >
            <Save className="w-4 h-4" />
            {t('settings.saveChanges')}
          </Button>
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general" className="gap-2">
            <Store className="w-4 h-4" />
            {t('settings.general')}
          </TabsTrigger>
          <TabsTrigger value="pos" className="gap-2">
            <Receipt className="w-4 h-4" />
            {t('settings.posTab')}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            {t('settings.alertsTab')}
          </TabsTrigger>
          <TabsTrigger value="payment" className="gap-2">
            <CreditCard className="w-4 h-4" />
            {t('settings.paymentTab')}
          </TabsTrigger>
          <TabsTrigger value="printing" className="gap-2">
            <Printer className="w-4 h-4" />
            {t('settings.printingTab')}
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2">
            <Database className="w-4 h-4" />
            {t('settings.advancedTab')}
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-500" />
                {t('settings.companyInfo')}
              </CardTitle>
              <CardDescription>
                {t('settings.companyInfoDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.companyName')}</Label>
                  <Input
                    value={settings.companyName}
                    onChange={(e) => updateSettings({ companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.emailLabel')}</Label>
                  <Input
                    type="email"
                    value={settings.companyEmail}
                    onChange={(e) => updateSettings({ companyEmail: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.addressLabel')}</Label>
                <Input
                  value={settings.companyAddress}
                  onChange={(e) => updateSettings({ companyAddress: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.phoneLabel')}</Label>
                  <Input
                    value={settings.companyPhone}
                    onChange={(e) => updateSettings({ companyPhone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.ntnLabel')}</Label>
                  <Input
                    value={settings.companyNtn}
                    onChange={(e) => updateSettings({ companyNtn: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.gstLabel')}</Label>
                  <Input
                    value={settings.companyGst}
                    onChange={(e) => updateSettings({ companyGst: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-500" />
                {t('settings.regional')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.language')}</Label>
                  <Select
                    value={settings.language}
                    onValueChange={(value: 'en' | 'ar' | 'ur') => updateSettings({ language: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t('settings.english')}</SelectItem>
                      <SelectItem value="ar">{t('settings.arabic')} — {t('settings.allRoles')}</SelectItem>
                      <SelectItem value="ur">{t('settings.urdu')} — {t('settings.ownerOnly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.currency')}</Label>
                  <Select
                    value={settings.currency}
                    onValueChange={(value) => updateSettings({ currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PKR">{t('settings.pkr')}</SelectItem>
                      <SelectItem value="USD">{t('settings.usd')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.dateFormat')}</Label>
                  <Select
                    value={settings.dateFormat}
                    onValueChange={(value) => updateSettings({ dateFormat: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {settings.theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-500" />}
                {t('settings.appearance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.darkMode')}</p>
                  <p className="text-sm text-gray-500">{t('settings.darkModeDesc')}</p>
                </div>
                <Switch
                  checked={settings.theme === 'dark'}
                  onCheckedChange={toggleTheme}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* POS Settings */}
        <TabsContent value="pos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.posConfig')}</CardTitle>
              <CardDescription>
                {t('settings.posConfigDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.defaultTaxRate')}</Label>
                  <Input
                    type="number"
                    value={settings.defaultTaxRate}
                    onChange={(e) => updateSettings({ defaultTaxRate: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.receiptFooter')}</Label>
                  <Input
                    value={settings.receiptFooterText}
                    onChange={(e) => updateSettings({ receiptFooterText: e.target.value })}
                    placeholder={t('settings.receiptFooterPlaceholder')}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-print"
                  checked={settings.autoPrintReceipt}
                  onCheckedChange={(checked) => updateSettings({ autoPrintReceipt: checked as boolean })}
                />
                <Label htmlFor="auto-print">{t('settings.autoPrint')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-profit"
                  checked={settings.showProfitOnPOS}
                  onCheckedChange={(checked) => updateSettings({ showProfitOnPOS: checked as boolean })}
                />
                <Label htmlFor="show-profit">{t('settings.showProfit')}</Label>
              </div>
              {useAuthStore.getState().currentUser?.role === 'owner' && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('settings.managerProfit')}</p>
                    <p className="text-sm text-gray-500">{t('settings.managerProfitDesc')}</p>
                  </div>
                  <Switch
                    checked={settings.managerCanSeeProfit}
                    onCheckedChange={(checked) => updateSettings({ managerCanSeeProfit: checked })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.loyaltyProgram')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.enableLoyalty')}</p>
                  <p className="text-sm text-gray-500">{t('settings.enableLoyaltyDesc')}</p>
                </div>
                <Switch
                  checked={settings.enableLoyalty}
                  onCheckedChange={(checked) => updateSettings({ enableLoyalty: checked })}
                />
              </div>
              {settings.enableLoyalty && (
                <div className="space-y-2">
                  <Label>{t('settings.pointsPerRs')}</Label>
                  <Input
                    type="number"
                    value={settings.loyaltyPointsPerRupee}
                    onChange={(e) => updateSettings({ loyaltyPointsPerRupee: parseInt(e.target.value) })}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.alertSettings')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('settings.expiryAlertsLabel')}</p>
                    <p className="text-sm text-gray-500">{t('settings.expiryAlertsDesc')}</p>
                  </div>
                  <Switch
                    checked={settings.enableExpiryAlerts}
                    onCheckedChange={(checked) => updateSettings({ enableExpiryAlerts: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.criticalAlert')}</Label>
                  <Select
                    value={String(settings.expiryAlertDays.critical)}
                    onValueChange={(value) => updateSettings({ expiryAlertDays: { ...settings.expiryAlertDays, critical: parseInt(value) } })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">{t('settings.days15')}</SelectItem>
                      <SelectItem value="30">{t('settings.days30')}</SelectItem>
                      <SelectItem value="45">{t('settings.days45')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.warningAlert')}</Label>
                  <Select
                    value={String(settings.expiryAlertDays.warning)}
                    onValueChange={(value) => updateSettings({ expiryAlertDays: { ...settings.expiryAlertDays, warning: parseInt(value) } })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">{t('settings.days30')}</SelectItem>
                      <SelectItem value="60">{t('settings.days60')}</SelectItem>
                      <SelectItem value="90">{t('settings.days90')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.noticeAlert')}</Label>
                  <Select
                    value={String(settings.expiryAlertDays.notice)}
                    onValueChange={(value) => updateSettings({ expiryAlertDays: { ...settings.expiryAlertDays, notice: parseInt(value) } })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">{t('settings.days60')}</SelectItem>
                      <SelectItem value="90">{t('settings.days90')}</SelectItem>
                      <SelectItem value="120">{t('settings.days120')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('settings.lowStockAlertsLabel')}</p>
                    <p className="text-sm text-gray-500">{t('settings.lowStockAlertsDesc')}</p>
                  </div>
                  <Switch
                    checked={settings.enableLowStockAlerts}
                    onCheckedChange={(checked) => updateSettings({ enableLowStockAlerts: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                {t('settings.smsNotifications')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.enableSms')}</p>
                  <p className="text-sm text-gray-500">{t('settings.enableSmsDesc')}</p>
                </div>
                <Switch
                  checked={settings.enableSms}
                  onCheckedChange={(checked) => updateSettings({ enableSms: checked })}
                />
              </div>
              {settings.enableSms && (
                <div className="space-y-2">
                  <Label>{t('settings.smsApiKey')}</Label>
                  <Input
                    type="password"
                    placeholder={t('settings.smsKeyPlaceholder')}
                    value={settings.smsApiKey}
                    onChange={(e) => updateSettings({ smsApiKey: e.target.value })}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Settings */}
        <TabsContent value="payment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.paymentMethods')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">JC</span>
                  </div>
                  <div>
                    <p className="font-medium">{t('settings.jazzCash')}</p>
                    <p className="text-sm text-gray-500">{t('settings.mobileWallet')}</p>
                  </div>
                </div>
                <Switch
                  checked={settings.enableJazzCash}
                  onCheckedChange={(checked) => updateSettings({ enableJazzCash: checked })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-green-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">EP</span>
                  </div>
                  <div>
                    <p className="font-medium">{t('settings.easyPaisa')}</p>
                    <p className="text-sm text-gray-500">{t('settings.mobileWallet')}</p>
                  </div>
                </div>
                <Switch
                  checked={settings.enableEasyPaisa}
                  onCheckedChange={(checked) => updateSettings({ enableEasyPaisa: checked })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-medium">{t('settings.cardPayments')}</p>
                    <p className="text-sm text-gray-500">{t('settings.creditDebit')}</p>
                  </div>
                </div>
                <Switch
                  checked={settings.enableCardPayments}
                  onCheckedChange={(checked) => updateSettings({ enableCardPayments: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {t('settings.fbrIntegration')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.enableFbr')}</p>
                  <p className="text-sm text-gray-500">{t('settings.enableFbrDesc')}</p>
                </div>
                <Switch
                  checked={settings.fbrIntegration}
                  onCheckedChange={(checked) => updateSettings({ fbrIntegration: checked })}
                />
              </div>
              {settings.fbrIntegration && (
                <div className="space-y-2">
                  <Label>{t('settings.fbrApiKey')}</Label>
                  <Input
                    type="password"
                    placeholder={t('settings.fbrKeyPlaceholder')}
                    value={settings.fbrApiKey}
                    onChange={(e) => updateSettings({ fbrApiKey: e.target.value })}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Printing Settings */}
        <TabsContent value="printing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="w-5 h-5" />
                {t('settings.printerConfig')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('settings.receiptPrinter')}</Label>
                <Select
                  value={settings.receiptPrinter || 'default'}
                  onValueChange={(value) => updateSettings({ receiptPrinter: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t('settings.defaultPrinter')}</SelectItem>
                    <SelectItem value="thermal">{t('settings.thermalPrinter')}</SelectItem>
                    <SelectItem value="laser">{t('settings.laserPrinter')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.barcodePrinter')}</Label>
                <Select
                  value={settings.barcodePrinter || 'none'}
                  onValueChange={(value) => updateSettings({ barcodePrinter: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('settings.none')}</SelectItem>
                    <SelectItem value="zebra">Zebra</SelectItem>
                    <SelectItem value="tsc">TSC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="print-logo"
                  checked={settings.printCompanyLogo}
                  onCheckedChange={(checked) => updateSettings({ printCompanyLogo: checked as boolean })}
                />
                <Label htmlFor="print-logo">{t('settings.printLogo')}</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                {t('settings.backupRestore')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.autoBackup')}</p>
                  <p className="text-sm text-gray-500">{t('settings.autoBackupDesc')}</p>
                </div>
                <Switch
                  checked={settings.autoBackup}
                  onCheckedChange={(checked) => updateSettings({ autoBackup: checked })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.backupTime')}</Label>
                <Select
                  value={settings.backupTime}
                  onValueChange={(value) => updateSettings({ backupTime: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="00:00">12:00 AM</SelectItem>
                    <SelectItem value="02:00">2:00 AM</SelectItem>
                    <SelectItem value="04:00">4:00 AM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleBackupNow}>
                  {t('settings.backupNow')}
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleRestore}>
                  {t('settings.restore')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <Shield className="w-5 h-5" />
                {t('settings.dangerZone')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t('settings.clearAllData')}</p>
                  <p className="text-sm text-gray-500">{t('settings.clearAllDataDesc')}</p>
                </div>
                <Button variant="destructive" onClick={() => setShowClearDialog(true)}>{t('settings.clearData')}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Clear Data Confirmation */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.clearAllTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.clearAllConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={handleClearData}>
              {t('settings.yesClear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
