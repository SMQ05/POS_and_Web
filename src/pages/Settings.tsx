import { useState, useRef, useEffect } from 'react';
import { useSettingsStore, useAuthStore } from '@/store';
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
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { fbrApi, FBR_APPLICABLE_SCENARIOS, FBR_SCENARIOS, apiRequest, updateNetworkProfile, type FbrProvince } from '@/lib/backend';
import type { Branch, UserRole } from '@/types';
import {
  Store,
  Receipt,
  Bell,
  Printer,
  Globe,
  Moon,
  Sun,
  Save,
  RotateCcw,
  Smartphone,
  CreditCard,
  Building2,
  Upload,
  X,
} from 'lucide-react';
import { processUploadedFile } from '@/lib/image';

function BarcodeTestInput() {
  const [value, setValue] = useState('');
  const [lastScan, setLastScan] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2 items-center">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            setLastScan(value.trim());
            setValue('');
          }
        }}
        placeholder="Click here then scan a barcode…"
        className="flex-1 h-9 rounded-lg border border-emerald-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        autoComplete="off"
      />
      {lastScan && (
        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg font-mono">
          ✓ {lastScan}
        </span>
      )}
    </div>
  );
}

// ─── FBR Profile Card (v1.12 spec aware) ────────────────────────────────────

const BUSINESS_ACTIVITIES = [
  'Manufacturer', 'Importer', 'Distributor', 'Wholesaler',
  'Retailer', 'Exporter', 'Service Provider', 'Other',
] as const;

const SECTORS = [
  'Pharmaceuticals', 'FMCG', 'All Other Sectors', 'Steel', 'Textile',
  'Telecom', 'Petroleum', 'Electricity Distribution', 'Gas Distribution',
  'Services', 'Automobile', 'CNG Stations', 'Wholesale / Retails',
] as const;

interface FbrProfileCardProps {
  settings: import('@/types').AppSettings;
  updateSettings: (patch: Partial<import('@/types').AppSettings>) => void;
}

function FbrProfileCard({ settings, updateSettings }: FbrProfileCardProps) {
  const profile = settings.fbrProfile;
  const [provinces, setProvinces] = useState<FbrProvince[]>([]);
  const [provincesLoading, setProvincesLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  // Auto-load provinces from FBR when the integration is enabled and the seller
  // province field is visible. Falls back to free-text if API errors (e.g. no token).
  useEffect(() => {
    if (!profile.enabled) return;
    setProvincesLoading(true);
    fbrApi.provinces()
      .then((list) => setProvinces(list ?? []))
      .catch(() => { /* swallow — UI will fall back to text input */ })
      .finally(() => setProvincesLoading(false));
  }, [profile.enabled]);

  const patch = (delta: Partial<import('@/types').FbrProfile>) =>
    updateSettings({ fbrProfile: { ...profile, ...delta } });

  // §10 — applicable scenarios for this (activity, sector) combo.
  const allowedScenarios =
    profile.businessActivity && profile.sector
      ? (FBR_APPLICABLE_SCENARIOS[profile.businessActivity]?.[profile.sector] ?? [])
      : [];

  // Recommended default per business activity (pharmacy retailer → SN026).
  const recommendedDefault =
    profile.businessActivity === 'Retailer' && profile.sector === 'Pharmaceuticals' ? 'SN026'
    : profile.businessActivity === 'Manufacturer' && profile.sector === 'Pharmaceuticals' ? 'SN001'
    : allowedScenarios[0];

  // Auto-set the default scenario when (activity, sector) is first chosen.
  useEffect(() => {
    if (!profile.defaultScenarioId && recommendedDefault) {
      patch({ defaultScenarioId: recommendedDefault });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.businessActivity, profile.sector]);

  // Auto-enable validate-before-post when mode is sandbox.
  useEffect(() => {
    if (profile.enabled && profile.mode === 'sandbox' && profile.validateBeforePost == null) {
      patch({ validateBeforePost: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.enabled, profile.mode]);

  async function testConnection() {
    if (!profile.sellerNTNCNIC) {
      toast.error('Set the seller NTN/CNIC first.');
      return;
    }
    setTesting(true);
    try {
      const regType = await fbrApi.registrationType(profile.sellerNTNCNIC.trim());
      const statl = await fbrApi.statl(profile.sellerNTNCNIC.trim());
      const regOK = regType?.REGISTRATION_TYPE?.toLowerCase() === 'registered';
      const status = statl?.statuscode ?? (statl as Record<string, unknown>)['status code'] ?? '';
      toast.success(
        `FBR connection OK. Registration: ${regType?.REGISTRATION_TYPE ?? '—'}${regOK ? ' ✓' : ''}, STATL: ${status || '—'}`,
        { duration: 6000 },
      );
      patch({ lastVerifiedAt: new Date().toISOString() });
    } catch (err) {
      toast.error(`FBR test failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          FBR Digital Invoicing
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            DI API v1.12
          </span>
        </CardTitle>
        <CardDescription>
          PRAL Digital Invoicing — built to{' '}
          <a href="https://download1.fbr.gov.pk/Docs/20257301172130815TechnicalDocumentationforDIAPIV1.12.pdf"
             target="_blank" rel="noopener noreferrer"
             className="text-emerald-700 underline underline-offset-2">
            Technical Spec v1.12 (24-Jul-2025)
          </a>. Real submission requires an active PRAL bearer token.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Enable + mode + verify */}
        <div className="md:col-span-2 flex flex-col gap-3 rounded-xl bg-emerald-50 border border-emerald-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-semibold">Enable FBR submission</Label>
              <p className="text-xs text-gray-600 mt-1">When ON, every completed sale is submitted to FBR Digital Invoicing.</p>
            </div>
            <Switch
              checked={profile.enabled}
              onCheckedChange={(checked) => updateSettings({
                fbrIntegration: checked,
                fbrProfile: { ...profile, enabled: checked },
              })}
            />
          </div>
          {profile.enabled && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-emerald-200">
              <div className="flex-1 min-w-[160px] space-y-1">
                <Label className="text-xs uppercase tracking-wider text-gray-500">Mode</Label>
                <Select value={profile.mode} onValueChange={(v) => patch({ mode: v as 'sandbox' | 'production' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                    <SelectItem value="production">Production (live)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[160px] space-y-1">
                <Label className="text-xs uppercase tracking-wider text-gray-500">Validate before posting</Label>
                <Switch
                  checked={profile.validateBeforePost ?? profile.mode === 'sandbox'}
                  onCheckedChange={(c) => patch({ validateBeforePost: c })}
                />
                <p className="text-[11px] text-gray-500">Spec §4.2 — dry-run before posting. Recommended in sandbox.</p>
              </div>
              <Button onClick={testConnection} disabled={testing} variant="outline" size="sm">
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
            </div>
          )}
          {profile.lastVerifiedAt && (
            <p className="text-[11px] text-emerald-700 font-mono">
              Last verified: {new Date(profile.lastVerifiedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Business profile — drives scenario selection per §10 */}
        <div className="space-y-2">
          <Label>Business Activity</Label>
          <Select
            value={profile.businessActivity ?? ''}
            onValueChange={(v) => patch({ businessActivity: v as import('@/types').FbrBusinessActivity })}
          >
            <SelectTrigger><SelectValue placeholder="e.g. Retailer" /></SelectTrigger>
            <SelectContent>
              {BUSINESS_ACTIVITIES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">Most pharmacies are "Retailer".</p>
        </div>

        <div className="space-y-2">
          <Label>Sector</Label>
          <Select
            value={profile.sector ?? ''}
            onValueChange={(v) => patch({ sector: v as import('@/types').FbrSector })}
          >
            <SelectTrigger><SelectValue placeholder="e.g. Pharmaceuticals" /></SelectTrigger>
            <SelectContent>
              {SECTORS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">FBR uses this with Activity to whitelist scenarios (§10).</p>
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label>Default Scenario (for sandbox)</Label>
          <Select
            value={profile.defaultScenarioId ?? recommendedDefault ?? ''}
            onValueChange={(v) => patch({ defaultScenarioId: v })}
            disabled={allowedScenarios.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={allowedScenarios.length ? 'Pick a scenario' : 'Choose Activity + Sector first'} />
            </SelectTrigger>
            <SelectContent>
              {allowedScenarios.map((id) => (
                <SelectItem key={id} value={id}>
                  <span className="font-mono mr-2">{id}</span>
                  {FBR_SCENARIOS[id]?.description ?? id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            Sent only in <span className="font-semibold">sandbox</span> mode (production payloads omit it).
            Pharmacy retailers default to <span className="font-mono">SN026 — Sale to End Consumer (standard rate)</span>.
          </p>
        </div>

        {/* Seller info — sourced from General → Company Information so the
            pharmacy maintains its identity in one place. Shown read-only here
            with a link back to the source. */}
        <div className="md:col-span-2">
          <Separator className="my-2" />
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-sm font-semibold text-gray-700">Seller Information</p>
            <span className="text-[11px] text-gray-500">
              Source: <span className="font-semibold">General → Company Information</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">Auto-synced from your company profile and sent on every FBR invoice.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-500">Seller NTN / CNIC</Label>
          <Input value={profile.sellerNTNCNIC ?? ''} readOnly disabled className="bg-gray-50" />
        </div>
        <div className="space-y-2">
          <Label className="text-gray-500">Seller Business Name</Label>
          <Input value={profile.sellerBusinessName ?? ''} readOnly disabled className="bg-gray-50" />
        </div>
        <div className="space-y-2">
          <Label className="text-gray-500">Seller Province</Label>
          <Input value={profile.sellerProvince ?? ''} readOnly disabled className="bg-gray-50" />
        </div>
        <div className="space-y-2">
          <Label className="text-gray-500">Seller Address</Label>
          <Input value={profile.sellerAddress ?? ''} readOnly disabled className="bg-gray-50" />
        </div>

        {/* Bearer token */}
        <div className="md:col-span-2 space-y-2 mt-2">
          <Label>PRAL Bearer Token</Label>
          <Input
            type="password"
            placeholder={profile.bearerToken ? '••••••• stored (enter a new value to replace)' : 'Paste your PRAL-issued bearer token here'}
            onChange={(e) => patch({ bearerToken: e.target.value })}
          />
          <p className="text-[11px] text-gray-500">
            Encrypted at rest with AES-256-GCM before storage. 5-year validity per spec §3.1.
            Never displayed back to the UI.
          </p>
        </div>

        {/* Advanced — API base override (rarely needed) */}
        <details className="md:col-span-2 mt-2">
          <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer">
            Advanced (override URLs)
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="space-y-1">
              <Label className="text-xs">API Base URL</Label>
              <Input
                placeholder="https://gw.fbr.gov.pk/di_data/v1/di"
                value={profile.apiBaseUrl ?? ''}
                onChange={(e) => patch({ apiBaseUrl: e.target.value.trim() })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">POS ID (optional)</Label>
              <Input
                placeholder="FBR-issued POS identifier"
                value={profile.posId ?? ''}
                onChange={(e) => patch({ posId: e.target.value })}
              />
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
export function Settings() {
  const { settings, updateSettings, toggleTheme } = useSettingsStore();
  const { branches, setBranches } = useAuthStore();
  const { t, isRTL } = useTranslation();
  const [activeTab, setActiveTab] = useState('general');
  // Backup/restore was deliberately removed — any JSON export of the pharmacy's
  // data, even for the owner's eyes, can be leaked to competitors. When proper
  // server-side AES-256-GCM encrypted snapshots land, they'll appear in a new
  // tab gated by a per-tenant passphrase that the server never sees.

  // Debounce branch syncs — every keystroke would otherwise hammer the API.
  // Cancels any pending PATCH when the user keeps typing.
  const branchSyncTimer = useRef<number | null>(null);
  const pendingBranchPatch = useRef<{ address?: string; city?: string; phone?: string; email?: string }>({});

  /** Mirror Settings → Company Info edits onto the Main Branch (first branch). */
  const syncMainBranch = (patch: { address?: string; city?: string; phone?: string; email?: string }) => {
    const main = branches[0];
    if (!main) return; // no branches yet — onboarding will create one
    // Accumulate patches so back-to-back keystrokes coalesce into one request
    pendingBranchPatch.current = { ...pendingBranchPatch.current, ...patch };
    if (branchSyncTimer.current != null) window.clearTimeout(branchSyncTimer.current);
    branchSyncTimer.current = window.setTimeout(async () => {
      const body = pendingBranchPatch.current;
      pendingBranchPatch.current = {};
      branchSyncTimer.current = null;
      try {
        await apiRequest<Branch>(`/branches/${main.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        const fresh = await apiRequest<Branch[]>('/branches');
        setBranches(fresh);
      } catch {
        // Silent — the company info still saves to localStorage and the server
        // settings JSON; the branch will pick up the diff on the next manual
        // edit or a full page reload.
      }
    }, 600);
  };

  const handleSave = () => {
    toast.success(t('settings.saved'));
  };

  const handleReset = () => {
    // Reset to defaults by clearing persisted settings storage
    localStorage.removeItem('settings-storage');
    window.location.reload();
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
          <TabsTrigger value="tax-fbr" className="gap-2">
            <Receipt className="w-4 h-4" />
            Tax/FBR
          </TabsTrigger>
          <TabsTrigger value="printing" className="gap-2">
            <Printer className="w-4 h-4" />
            {t('settings.printingTab')}
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
              {/* Logo upload first — visual anchor for the section. Lives in
                  General because it's part of the pharmacy's identity, not a
                  printing detail. Compressed to 600px@0.85 for receipt print. */}
              <div className="flex items-start gap-4 pb-2">
                <div className="shrink-0">
                  <Label className="mb-1.5 block">Logo</Label>
                  <input
                    id="logo-file"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const r = await processUploadedFile(file, { maxDim: 600, quality: 0.85 });
                        updateSettings({ companyLogoUrl: r.dataUrl });
                        toast.success('Logo uploaded');
                      } catch (err) {
                        toast.error((err as Error).message || 'Failed to upload logo');
                      }
                      (e.target as HTMLInputElement).value = '';
                    }}
                  />
                  {settings.companyLogoUrl ? (
                    <div className="relative w-24 h-24 rounded-lg border bg-white flex items-center justify-center group">
                      <img
                        src={settings.companyLogoUrl}
                        alt="Logo"
                        className="max-w-full max-h-full object-contain"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full bg-white border shadow text-red-500 hover:bg-red-50"
                        onClick={() => updateSettings({ companyLogoUrl: undefined })}
                        title="Remove logo"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 flex flex-col items-center justify-center text-gray-500 transition"
                      onClick={() => document.getElementById('logo-file')?.click()}
                    >
                      <Upload className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-medium">Upload</span>
                    </button>
                  )}
                </div>
                <div className="flex-1 pt-6">
                  <p className="text-xs text-gray-500">
                    Printed on receipts when "Print company logo" is enabled (Printing tab).
                    Square or wide formats both work; recommended ≥ 200px on the longest side.
                  </p>
                </div>
              </div>

              {/* Sync to the Main Branch (first branch) — fired by a small
                  helper so all three editable fields stay in lockstep. */}
              {(() => null)()}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.companyName')}</Label>
                  <Input
                    value={settings.companyName}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateSettings({
                        companyName: v,
                        fbrProfile: { ...settings.fbrProfile, sellerBusinessName: v },
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.emailLabel')}</Label>
                  <Input
                    type="email"
                    value={settings.companyEmail}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateSettings({ companyEmail: v });
                      syncMainBranch({ email: v });
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.addressLabel')}</Label>
                <Input
                  value={settings.companyAddress}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateSettings({
                      companyAddress: v,
                      fbrProfile: { ...settings.fbrProfile, sellerAddress: v },
                    });
                    // Sync to main branch — split on last comma into address + city
                    const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
                    if (parts.length >= 2) {
                      const city = parts[parts.length - 1];
                      const address = parts.slice(0, -1).join(', ');
                      syncMainBranch({ address, city });
                    } else if (v.trim()) {
                      syncMainBranch({ address: v.trim() });
                    }
                  }}
                />
                <p className="text-[11px] text-gray-500">
                  Format <span className="font-mono">street, city</span> — the part after the last comma is treated as City and synced to your Main Branch.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.phoneLabel')}</Label>
                  <Input
                    value={settings.companyPhone}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateSettings({ companyPhone: v });
                      syncMainBranch({ phone: v });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Province</Label>
                  <Select
                    value={settings.fbrProfile.sellerProvince || 'Punjab'}
                    onValueChange={(v) => updateSettings({
                      fbrProfile: { ...settings.fbrProfile, sellerProvince: v },
                    })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Punjab">Punjab</SelectItem>
                      <SelectItem value="Sindh">Sindh</SelectItem>
                      <SelectItem value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</SelectItem>
                      <SelectItem value="Balochistan">Balochistan</SelectItem>
                      <SelectItem value="Islamabad Capital Territory">Islamabad Capital Territory</SelectItem>
                      <SelectItem value="Gilgit-Baltistan">Gilgit-Baltistan</SelectItem>
                      <SelectItem value="Azad Jammu & Kashmir">Azad Jammu &amp; Kashmir</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>NTN / CNIC</Label>
                  <Input
                    placeholder="e.g. 1234567-8"
                    value={settings.companyNtn}
                    onChange={(e) => {
                      const v = e.target.value;
                      // Single source — also mirrored to fbrProfile so FBR
                      // submissions and printed receipt header line up.
                      updateSettings({
                        companyNtn: v,
                        fbrProfile: { ...settings.fbrProfile, sellerNTNCNIC: v },
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>GST Number</Label>
                  <Input
                    placeholder="e.g. 12-34-5678-901-23"
                    value={settings.companyGst}
                    onChange={(e) => updateSettings({ companyGst: e.target.value })}
                  />
                  <p className="text-[11px] text-gray-500">
                    Pakistan generally uses NTN for sales tax; GST/STRN is optional.
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                These details print on every receipt and are used as the seller info for FBR submissions.
              </p>
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
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.receiptFooter')}</Label>
                  <Input
                    value={settings.receiptFooterText}
                    onChange={(e) => updateSettings({ receiptFooterText: e.target.value })}
                    placeholder={t('settings.receiptFooterPlaceholder')}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  💡 Tax rates are configured under the <strong>Tax/FBR</strong> tab. The POS uses whichever rule is marked as &quot;Default&quot;.
                </p>
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

          {/* M2 — POS price visibility (owner-only).
              Three independent toggles + role allow-lists let an owner configure
              exactly who sees Purchase / TP / Sale on the POS. Owner always sees
              everything regardless of these flags. */}
          {useAuthStore.getState().currentUser?.role === 'owner' && (
            <Card>
              <CardHeader>
                <CardTitle>POS price visibility</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Decide which prices each staff role can see on the POS. Owners always see everything.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {([
                  { key: 'purchase', label: 'Purchase price (cost)', enabledKey: 'showPurchasePriceOnPOS', rolesKey: 'showPurchasePriceRoles', help: 'What the pharmacy paid the distributor.' },
                  { key: 'trade', label: 'Trade price (TP)', enabledKey: 'showTradePriceOnPOS', rolesKey: 'showTradePriceRoles', help: 'Floor that salesmen can discount down to.' },
                  { key: 'sale', label: 'Sale price', enabledKey: 'showSalePriceOnPOS', rolesKey: 'showSalePriceRoles', help: 'Customer-facing price (typically MRP).' },
                ] as const).map((row) => {
                  const enabled = settings[row.enabledKey] ?? false;
                  const roles = (settings[row.rolesKey] ?? []) as UserRole[];
                  const allRoles: UserRole[] = ['owner', 'manager', 'cashier', 'salesman', 'pharmacist', 'accountant'];
                  return (
                    <div key={row.key} className="space-y-2 border rounded-md p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{row.label}</p>
                          <p className="text-xs text-gray-500">{row.help}</p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => updateSettings({ [row.enabledKey]: checked } as Partial<typeof settings>)}
                        />
                      </div>
                      {enabled && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {allRoles.map((r) => {
                            const on = roles.includes(r);
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => {
                                  const next = on ? roles.filter((x) => x !== r) : [...roles, r];
                                  updateSettings({ [row.rolesKey]: next } as Partial<typeof settings>);
                                }}
                                className={cn(
                                  'text-xs px-2 py-1 rounded-md border capitalize',
                                  on ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50',
                                )}
                              >
                                {r}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* M2 — Per-payment-method default fee / discount.
              Auto-applied when the cashier selects that method at checkout.
              Cashier can override per sale. */}
          {/* M7 — Auto-PO controls. Owner-only since auto-generated drafts
              can affect supplier balances + inventory ordering. */}
          {useAuthStore.getState().currentUser?.role === 'owner' && (
            <Card>
              <CardHeader>
                <CardTitle>Auto purchase orders</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Scan low-stock medicines and draft POs grouped by primary supplier. Owner reviews before sending.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable auto-PO scanner</p>
                    <p className="text-xs text-gray-500">Allow the &quot;Run auto-PO&quot; button on the Purchase Orders page.</p>
                  </div>
                  <Switch
                    checked={settings.autoPoEnabled ?? false}
                    onCheckedChange={(checked) => updateSettings({ autoPoEnabled: checked })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Trigger multiplier</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0.5}
                      max={5}
                      value={settings.autoPoTriggerPercent ?? 1.0}
                      onChange={(e) => updateSettings({ autoPoTriggerPercent: parseFloat(e.target.value) || 1.0 })}
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      1.0 = fire at reorder level. 1.5 = fire when 50% above level (orders earlier).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* M6 — Shift & day-end close toggles. Owner-only since they change
              the POS flow for everyone. */}
          {useAuthStore.getState().currentUser?.role === 'owner' && (
            <Card>
              <CardHeader>
                <CardTitle>Shift &amp; day-end close</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  One unified flow: cashiers open a drawer with a cash float and close it with a counted
                  amount; the Day Close page reconciles each cashier&apos;s drawer and posts the end-of-day Z-report.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable shift &amp; day-end close</p>
                    <p className="text-xs text-gray-500">
                      POS requires an open shift before taking payment, and the Day Close page becomes available
                      for per-cashier cash reconciliation and the daily Z-report.
                    </p>
                  </div>
                  <Switch
                    checked={(settings.dayCloseEnabled ?? false) || (settings.shiftCloseEnabled ?? false)}
                    onCheckedChange={(checked) =>
                      updateSettings({ shiftCloseEnabled: checked, dayCloseEnabled: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Cashier collection (pay later at counter)</p>
                    <p className="text-xs text-gray-500">
                      When on, a sale can be sent to a cashier — the receipt prints a QR the cashier scans to
                      collect payment. When off, every sale is marked paid as soon as the receipt prints.
                    </p>
                  </div>
                  <Switch
                    checked={settings.cashierCollectionEnabled !== false}
                    onCheckedChange={(checked) => updateSettings({ cashierCollectionEnabled: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* M3 — Toggle visit-day schedule for distributors. */}
          {(useAuthStore.getState().currentUser?.role === 'owner' || useAuthStore.getState().currentUser?.role === 'manager') && (
            <Card>
              <CardHeader>
                <CardTitle>Distributor visit schedule</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Track which days each supplier visits. Surfaces a &quot;Today&apos;s expected suppliers&quot; widget on Dashboard.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Enable visit days</p>
                    <p className="text-xs text-gray-500">When off, the field is hidden from supplier forms.</p>
                  </div>
                  <Switch
                    checked={settings.supplierVisitDaysEnabled ?? false}
                    onCheckedChange={(checked) => updateSettings({ supplierVisitDaysEnabled: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {(useAuthStore.getState().currentUser?.role === 'owner' || useAuthStore.getState().currentUser?.role === 'manager') && (
            <Card>
              <CardHeader>
                <CardTitle>Payment method defaults</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Auto-apply a fee or discount when the cashier picks this payment method. Leave empty to skip.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(['cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer'] as const).map((method) => {
                    const cfg = settings.paymentMethodDefaults?.[method] ?? {};
                    const setMethodDefault = (patch: { feePercent?: number | null; discountPercent?: number | null }) => {
                      const current = settings.paymentMethodDefaults ?? {};
                      const next: NonNullable<typeof settings.paymentMethodDefaults> = { ...current };
                      // Drop empties so we don't persist `{ feePercent: null }` noise.
                      const merged: { feePercent?: number; discountPercent?: number } = { ...current[method] };
                      if (patch.feePercent != null) merged.feePercent = patch.feePercent;
                      else if (patch.feePercent === null) delete merged.feePercent;
                      if (patch.discountPercent != null) merged.discountPercent = patch.discountPercent;
                      else if (patch.discountPercent === null) delete merged.discountPercent;
                      if (Object.keys(merged).length === 0) {
                        delete next[method];
                      } else {
                        next[method] = merged;
                      }
                      updateSettings({ paymentMethodDefaults: next });
                    };
                    return (
                      <div key={method} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center border-b last:border-b-0 pb-3">
                        <div className="text-sm font-medium capitalize">{method.replace('_', ' ')}</div>
                        <div>
                          <Label className="text-xs">Fee %</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            value={cfg.feePercent ?? ''}
                            onChange={(e) => setMethodDefault({ feePercent: e.target.value === '' ? null : parseFloat(e.target.value) })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Discount %</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            value={cfg.discountPercent ?? ''}
                            onChange={(e) => setMethodDefault({ discountPercent: e.target.value === '' ? null : parseFloat(e.target.value) })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

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
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Earn — 1 point per Rs spent</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.loyaltyRupeesPerPoint ?? 100}
                        onChange={(e) => updateSettings({ loyaltyRupeesPerPoint: Math.max(1, parseInt(e.target.value) || 0) })}
                      />
                      <p className="text-xs text-gray-500">Rs spent for the customer to earn 1 point.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Redeem — Rs per point</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        value={settings.loyaltyPointValue ?? 2}
                        onChange={(e) => updateSettings({ loyaltyPointValue: Math.max(0, parseFloat(e.target.value) || 0) })}
                      />
                      <p className="text-xs text-gray-500">Discount value of 1 point at the till.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Minimum points to redeem</Label>
                      <Input
                        type="number"
                        min={0}
                        value={settings.loyaltyMinRedeemPoints ?? 50}
                        onChange={(e) => updateSettings({ loyaltyMinRedeemPoints: Math.max(0, parseInt(e.target.value) || 0) })}
                      />
                      <p className="text-xs text-gray-500">Customer needs at least this many points to redeem.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max redemption (% of bill)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={settings.loyaltyMaxRedeemPercent ?? 50}
                        onChange={(e) => updateSettings({ loyaltyMaxRedeemPercent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                      />
                      <p className="text-xs text-gray-500">Points can cover at most this share of a bill.</p>
                    </div>
                  </div>
                  <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                    Example: earn 1 pt per Rs {settings.loyaltyRupeesPerPoint ?? 100} · {settings.loyaltyMinRedeemPoints ?? 50} pts = Rs {((settings.loyaltyMinRedeemPoints ?? 50) * (settings.loyaltyPointValue ?? 2)).toLocaleString('en-PK')} off · up to {settings.loyaltyMaxRedeemPercent ?? 50}% of a bill.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <NetworkProfileCard />
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

        </TabsContent>

        <TabsContent value="tax-fbr" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tax Rules</CardTitle>
              <CardDescription>Rules here are saved in the tenant database and used by POS line items.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {settings.taxRules.map((rule, index) => (
                <div key={rule.id} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-4"
                    value={rule.name}
                    onChange={(e) => {
                      const taxRules = [...settings.taxRules];
                      taxRules[index] = { ...rule, name: e.target.value };
                      updateSettings({ taxRules });
                    }}
                  />
                  <Select
                    value={rule.type}
                    onValueChange={(value) => {
                      const taxRules = [...settings.taxRules];
                      taxRules[index] = { ...rule, type: value as typeof rule.type };
                      updateSettings({ taxRules });
                    }}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales_tax">Sales Tax</SelectItem>
                      <SelectItem value="further_tax">Further Tax</SelectItem>
                      <SelectItem value="extra_tax">Extra Tax</SelectItem>
                      <SelectItem value="fed">FED</SelectItem>
                      <SelectItem value="withholding">Withholding</SelectItem>
                      <SelectItem value="service_tax">Service Tax</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="col-span-2"
                    type="number"
                    value={rule.ratePercent}
                    onChange={(e) => {
                      const taxRules = [...settings.taxRules];
                      taxRules[index] = { ...rule, ratePercent: Number(e.target.value || 0) };
                      updateSettings({ taxRules });
                    }}
                  />
                  <div className="col-span-2 flex items-center gap-2">
                    <Switch
                      checked={rule.isDefault}
                      onCheckedChange={(checked) => {
                        const taxRules = settings.taxRules.map((taxRule) => ({
                          ...taxRule,
                          isDefault: checked ? taxRule.id === rule.id : taxRule.isDefault,
                        }));
                        updateSettings({ taxRules });
                      }}
                    />
                    <span className="text-sm">Default</span>
                  </div>
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(checked) => {
                      const taxRules = [...settings.taxRules];
                      taxRules[index] = { ...rule, isActive: checked };
                      updateSettings({ taxRules });
                    }}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => updateSettings({
                  taxRules: [
                    ...settings.taxRules,
                    {
                      id: `tax-${Date.now()}`,
                      name: 'New Tax Rule',
                      type: 'custom',
                      ratePercent: 0,
                      appliesTo: 'goods',
                      isDefault: false,
                      isActive: true,
                    },
                  ],
                })}
              >
                Add Tax Rule
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service Charges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {settings.serviceCharges.map((charge, index) => (
                <div key={charge.id} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-5"
                    value={charge.name}
                    onChange={(e) => {
                      const serviceCharges = [...settings.serviceCharges];
                      serviceCharges[index] = { ...charge, name: e.target.value };
                      updateSettings({ serviceCharges });
                    }}
                  />
                  <Select
                    value={charge.type}
                    onValueChange={(value) => {
                      const serviceCharges = [...settings.serviceCharges];
                      serviceCharges[index] = { ...charge, type: value as typeof charge.type };
                      updateSettings({ serviceCharges });
                    }}
                  >
                    <SelectTrigger className="col-span-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="percent">Percent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="col-span-2"
                    type="number"
                    value={charge.amount}
                    onChange={(e) => {
                      const serviceCharges = [...settings.serviceCharges];
                      serviceCharges[index] = { ...charge, amount: Number(e.target.value || 0) };
                      updateSettings({ serviceCharges });
                    }}
                  />
                  <div className="col-span-2 flex items-center gap-2">
                    <Switch
                      checked={charge.taxable}
                      onCheckedChange={(checked) => {
                        const serviceCharges = [...settings.serviceCharges];
                        serviceCharges[index] = { ...charge, taxable: checked };
                        updateSettings({ serviceCharges });
                      }}
                    />
                    <span className="text-sm">Taxable</span>
                  </div>
                  <Switch
                    checked={charge.isActive}
                    onCheckedChange={(checked) => {
                      const serviceCharges = [...settings.serviceCharges];
                      serviceCharges[index] = { ...charge, isActive: checked };
                      updateSettings({ serviceCharges });
                    }}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => updateSettings({
                  serviceCharges: [
                    ...settings.serviceCharges,
                    { id: `svc-${Date.now()}`, name: 'New Service Charge', type: 'fixed', amount: 0, taxable: false, isActive: true },
                  ],
                })}
              >
                Add Service Charge
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Discount Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {settings.discountRules.map((rule, index) => (
                <div key={rule.id} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-5"
                    value={rule.name}
                    onChange={(e) => {
                      const discountRules = [...settings.discountRules];
                      discountRules[index] = { ...rule, name: e.target.value };
                      updateSettings({ discountRules });
                    }}
                  />
                  <Select
                    value={rule.type}
                    onValueChange={(value) => {
                      const discountRules = [...settings.discountRules];
                      discountRules[index] = { ...rule, type: value as typeof rule.type };
                      updateSettings({ discountRules });
                    }}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="line_percent">Line %</SelectItem>
                      <SelectItem value="line_fixed">Line Fixed</SelectItem>
                      <SelectItem value="invoice_percent">Invoice %</SelectItem>
                      <SelectItem value="invoice_fixed">Invoice Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="col-span-2"
                    type="number"
                    value={rule.value}
                    onChange={(e) => {
                      const discountRules = [...settings.discountRules];
                      discountRules[index] = { ...rule, value: Number(e.target.value || 0) };
                      updateSettings({ discountRules });
                    }}
                  />
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(checked) => {
                      const discountRules = [...settings.discountRules];
                      discountRules[index] = { ...rule, isActive: checked };
                      updateSettings({ discountRules });
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <FbrProfileCard settings={settings} updateSettings={updateSettings} />
        </TabsContent>

        {/* Printing Settings */}
        <TabsContent value="printing" className="space-y-4">

          {/* Barcode Scanner info card */}
          <Card className="border-emerald-200 bg-emerald-50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-emerald-800 text-base">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v14"/></svg>
                Barcode Scanner / Reader
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-emerald-100">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 text-sm">Auto-detected — No Setup Required</p>
                  <p className="text-sm text-emerald-700 mt-0.5">
                    All USB barcode scanners work automatically — including Chinese brands (Netum, Xonrich, Aibecy, Symcode, NADAMOO) and branded ones (Honeywell, Zebra, Datalogic). The scanner acts as a keyboard so it works with any computer, no driver needed.
                  </p>
                </div>
              </div>
              <div className="text-xs text-emerald-700 space-y-1 pl-1">
                <p>✓ USB wired scanners — plug and scan instantly</p>
                <p>✓ USB wireless (2.4 GHz dongle) scanners — plug dongle, scan instantly</p>
                <p>✓ Bluetooth scanners — pair to computer, scan instantly</p>
                <p>✓ 1D barcodes (Code 128, EAN-13, EAN-8, Code 39) — standard medicine barcodes</p>
                <p>✓ 2D QR codes — FBR QR and medicine QR codes</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-emerald-800">Test your scanner here — scan any barcode:</p>
                <BarcodeTestInput />
              </div>
            </CardContent>
          </Card>

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
                <p className="text-xs text-gray-500">Label printer used to print barcode stickers on medicine boxes/bottles.</p>
                <Select
                  value={settings.barcodePrinter || 'none'}
                  onValueChange={(value) => updateSettings({ barcodePrinter: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (not using label printer)</SelectItem>
                    <SelectItem value="zebra">Zebra (ZPL)</SelectItem>
                    <SelectItem value="tsc">TSC</SelectItem>
                    <SelectItem value="xprinter">Xprinter (XP series)</SelectItem>
                    <SelectItem value="argox">Argox</SelectItem>
                    <SelectItem value="godex">Godex</SelectItem>
                    <SelectItem value="bixolon">Bixolon</SelectItem>
                    <SelectItem value="citizen">Citizen</SelectItem>
                    <SelectItem value="honeywell">Honeywell</SelectItem>
                    <SelectItem value="generic">Generic / Other USB Label Printer</SelectItem>
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
              <p className="text-xs text-gray-500 -mt-2">
                Upload the logo image in <span className="font-semibold">General → Company Information</span>.
              </p>

              <div>
                <Label className="mb-1.5 block">Default Profit Margin %</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={settings.defaultMarginPercent ?? 15}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    updateSettings({ defaultMarginPercent: Number.isFinite(v) ? v : 15 });
                  }}
                  className="max-w-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  At GRN time, MRP defaults to purchase price × (1 + this %). Editable per line.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced (backup / restore / clear-data) tab was removed entirely.
            Any in-app JSON export leaks the tenant's data — even with an owner
            role, the file can be forwarded to competitors. Server-side encrypted
            snapshots will land as a separate, gated feature. */}
      </Tabs>
    </div>
  );
}

// Network identity — editable handle (username) + business type. Lives on the
// tenant (not app settings); updates the auth store so the header/Network page
// reflect it immediately.
function NetworkProfileCard() {
  const { tenant } = useAuthStore();
  const [handle, setHandle] = useState(tenant?.handle ?? '');
  const [businessType, setBusinessType] = useState(tenant?.businessType ?? 'pharmacy');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateNetworkProfile({ handle: handle.trim().toLowerCase(), businessType });
      useAuthStore.setState((s) => ({ tenant: s.tenant ? { ...s.tenant, handle: updated.handle, businessType: updated.businessType as 'pharmacy' | 'distributor' | 'wholesaler' } : s.tenant }));
      toast.success('Network profile updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kynex Network</CardTitle>
        <p className="text-sm text-gray-500">Your public username and business type — other businesses connect to you using this username.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Network username</Label>
            <div className="flex items-center gap-1">
              <span className="text-gray-400">@</span>
              <Input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} placeholder="your-business" />
            </div>
            <p className="text-xs text-gray-500">3–40 chars: lowercase letters, numbers, hyphens. Must be unique.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Business type</Label>
            <Select value={businessType} onValueChange={(v) => setBusinessType(v as typeof businessType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pharmacy">Pharmacy</SelectItem>
                <SelectItem value="distributor">Distributor</SelectItem>
                <SelectItem value="wholesaler">Wholesaler</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Pharmacies order from distributors/wholesalers.</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving…' : 'Save network profile'}</Button>
      </CardContent>
    </Card>
  );
}
