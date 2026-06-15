import { useState, useEffect, useCallback, Fragment } from 'react';
import { apiRequest, drapImport, fetchAdminCatalog, type DrapImportStatus, type CatalogProduct } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Building2, Users, TrendingUp, AlertCircle, Send, MessageSquare,
  RefreshCw, Search, Edit2, CheckCircle, XCircle, Clock, Mail,
  Phone, Calendar, ChevronDown, ChevronUp,
} from 'lucide-react';


interface Tenant {
  id: string;
  slug: string;
  name: string;
  subscriptionPlan: string;
  isActive: boolean;
  status: string;
  trialEndsAt: string | null;
  billingEmail: string | null;
  whatsappNumber: string | null;
  planPrice: number | null;
  lastInvoiceAt: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  trial: number;
  active: number;
  suspended: number;
}

const STATUS_COLORS: Record<string, string> = {
  trial: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-600',
};

const PLAN_COLORS: Record<string, string> = {
  basic: 'bg-gray-100 text-gray-600',
  pro: 'bg-violet-100 text-violet-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

function daysLeft(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  return diff;
}

function fmt(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

// DRAP → master-catalog bulk importer (superadmin only). Long-running, resumable.
function DrapImportCard() {
  const [s, setS] = useState<DrapImportStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { drapImport.status().then(setS).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000); // live progress while running
    return () => clearInterval(t);
  }, [refresh]);
  const act = async (fn: () => Promise<DrapImportStatus>) => {
    setBusy(true);
    try { setS(await fn()); } finally { setBusy(false); }
  };
  const pct = s && s.prefixTotal > 0 ? Math.round((s.cursor / s.prefixTotal) * 100) : 0;
  const running = s?.status === 'running';
  return (
    <div className="rounded-xl border p-5 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-semibold">DRAP master-catalog importer</p>
          <p className="text-xs text-gray-500">Pre-loads the shared product catalog from DRAP. Long-running &amp; resumable. Data is provisional.</p>
        </div>
        <Badge variant="outline" className="capitalize">{s?.status ?? '…'}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm my-3">
        <div><p className="text-[11px] text-gray-400 uppercase">Progress</p><p className="font-semibold">{pct}% <span className="text-gray-400 text-xs">({s?.cursor ?? 0}/{s?.prefixTotal ?? 0})</span></p></div>
        <div><p className="text-[11px] text-gray-400 uppercase">Imported</p><p className="font-semibold text-emerald-600">{s?.processed ?? 0}</p></div>
        <div><p className="text-[11px] text-gray-400 uppercase">Discovered</p><p className="font-semibold">{s?.queued ?? 0} <span className="text-gray-400 text-xs">({s?.pending ?? 0} pending)</span></p></div>
        <div><p className="text-[11px] text-gray-400 uppercase">Failed</p><p className="font-semibold text-red-500">{s?.failed ?? 0}</p></div>
      </div>
      {s?.lastPrefix && <p className="text-[11px] text-gray-400 mb-2">Last prefix: <span className="font-mono">{s.lastPrefix}</span>{s.lastError ? ` · last error: ${s.lastError}` : ''}</p>}
      <div className="flex gap-2 flex-wrap">
        {!running && s?.status !== 'done' && (
          <Button size="sm" disabled={busy} onClick={() => act(() => drapImport.resume())}>Resume</Button>
        )}
        {running && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => drapImport.pause())}>Pause</Button>
        )}
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => { if (confirm('Start a fresh import from the beginning?')) act(() => drapImport.start(true)); }}>
          Start fresh
        </Button>
      </div>
    </div>
  );
}

// Browse the central master catalog (superadmin) — see imported products live.
function MasterCatalogCard() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ total: number; items: CatalogProduct[] }>({ total: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback((query: string) => {
    setLoading(true);
    fetchAdminCatalog({ q: query, limit: 50 }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(''); }, [load]);
  // Auto-refresh the count/list periodically so imports show up live.
  useEffect(() => {
    const t = setInterval(() => load(q), 5000);
    return () => clearInterval(t);
  }, [load, q]);

  return (
    <div className="rounded-xl border bg-white">
      <div className="p-5 pb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Master catalog</p>
          <p className="text-xs text-gray-500">Shared products available to all pharmacies. <strong>{data.total.toLocaleString()}</strong> total.</p>
        </div>
        <div className="relative w-64 max-w-[50%]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search brand / generic / reg no…"
            value={q}
            onChange={(e) => { setQ(e.target.value); load(e.target.value); }}
            className="pl-9 h-9"
          />
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto border-t">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="w-6 px-2 py-2"></th>
              <th className="text-left font-medium px-4 py-2">Brand</th>
              <th className="text-left font-medium px-4 py-2">Generic</th>
              <th className="text-left font-medium px-4 py-2">Form</th>
              <th className="text-left font-medium px-4 py-2">Manufacturer</th>
              <th className="text-left font-medium px-4 py-2">Reg No</th>
              <th className="text-left font-medium px-4 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-400 py-8">{loading ? 'Loading…' : 'No products yet.'}</td></tr>
            ) : data.items.map((p) => {
              const open = openId === p.id;
              const extra = (p.extra ?? {}) as Record<string, string>;
              return (
                <Fragment key={p.id}>
                  <tr className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setOpenId(open ? null : p.id)}>
                    <td className="px-2 py-2 text-gray-400">{open ? '▾' : '▸'}</td>
                    <td className="px-4 py-2 font-medium">{p.brand}</td>
                    <td className="px-4 py-2 text-gray-600">{p.genericName ?? '—'}{p.strength ? ` ${p.strength}${p.unit ?? ''}` : ''}</td>
                    <td className="px-4 py-2 text-gray-600">{p.dosageForm ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{p.manufacturer ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{p.drapRegNo ?? '—'}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px] capitalize">{p.source}</Badge></td>
                  </tr>
                  {open && (
                    <tr className="bg-gray-50/70">
                      <td></td>
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                          <div><span className="text-gray-400">Route:</span> {p.routeOfAdmin ?? '—'}</div>
                          <div><span className="text-gray-400">ATC code:</span> {p.atcCode ?? '—'}</div>
                          <div><span className="text-gray-400">Reg date:</span> {extra.registrationDate ?? '—'}</div>
                          <div><span className="text-gray-400">Mfg type:</span> {extra.manufacturingType ?? '—'}</div>
                          <div className="sm:col-span-2"><span className="text-gray-400">Company address:</span> {extra.companyAddress ?? '—'}</div>
                          <div className="sm:col-span-2"><span className="text-gray-400">Label claim:</span> {extra.labelClaim ?? '—'}</div>
                          <div className="sm:col-span-2">
                            <span className="text-gray-400">Composition:</span>{' '}
                            {(p.composition && p.composition.length)
                              ? p.composition.map((c) => `${c.generic ?? ''} ${c.strength ?? ''}${c.unit ?? ''}${c.atcCode ? ` (${c.atcCode})` : ''}`.trim()).join(' + ')
                              : '—'}
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-gray-400">Pack sizes:</span>{' '}
                            {(p.packSizes && p.packSizes.length)
                              ? p.packSizes.map((ps) => `${ps.pack ?? ''}${ps.gtin ? ` [GTIN ${ps.gtin}]` : ''}`.trim()).join(' · ')
                              : '—'}
                          </div>
                          <div className="sm:col-span-2 font-mono text-[11px] text-gray-500">
                            <span className="text-gray-400 font-sans">GTIN(s):</span> {p.gtins.join(', ') || '—'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.total > data.items.length && (
        <p className="text-[11px] text-gray-400 px-4 py-2 border-t">Showing first {data.items.length} of {data.total.toLocaleString()} — refine the search to narrow.</p>
      )}
    </div>
  );
}

export function SuperAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit tenant dialog
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState({ status: '', subscriptionPlan: '', planPrice: '', billingEmail: '', whatsappNumber: '', trialEndsAt: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Invoice dialog
  const [invoiceTenant, setInvoiceTenant] = useState<Tenant | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '', amount: '', dueDate: '', plan: '', period: '', notes: '',
    sendEmail: true, sendWhatsApp: false,
  });
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        apiRequest<Stats>('/saas-admin/stats'),
        apiRequest<Tenant[]>('/saas-admin/tenants'),
      ]);
      setStats(s);
      setTenants(Array.isArray(t) ? t : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const filtered = tenants.filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.billingEmail ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setEditForm({
      status: t.status,
      subscriptionPlan: t.subscriptionPlan,
      planPrice: t.planPrice?.toString() ?? '',
      billingEmail: t.billingEmail ?? '',
      whatsappNumber: t.whatsappNumber ?? '',
      trialEndsAt: t.trialEndsAt ? t.trialEndsAt.slice(0, 10) : '',
    });
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editTenant) return;
    setEditLoading(true);
    setEditError('');
    try {
      const body: Record<string, unknown> = {
        status: editForm.status,
        subscriptionPlan: editForm.subscriptionPlan,
        planPrice: editForm.planPrice ? Number(editForm.planPrice) : null,
        billingEmail: editForm.billingEmail || null,
        whatsappNumber: editForm.whatsappNumber || null,
        trialEndsAt: editForm.trialEndsAt ? new Date(editForm.trialEndsAt).toISOString() : null,
      };
      await apiRequest(`/saas-admin/tenants/${editTenant.id}`, {
        method: 'PATCH', body: JSON.stringify(body),
      });
      setEditTenant(null);
      load();
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setEditLoading(false);
    }
  };

  const openInvoice = (t: Tenant) => {
    const now = new Date();
    const month = now.toLocaleString('en-PK', { month: 'long', year: 'numeric' });
    const due = new Date(now.getFullYear(), now.getMonth() + 1, 5);
    setInvoiceTenant(t);
    setInvoiceForm({
      invoiceNumber: `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${t.slug.slice(0, 6).toUpperCase()}`,
      amount: t.planPrice?.toString() ?? '',
      dueDate: due.toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' }),
      plan: t.subscriptionPlan.charAt(0).toUpperCase() + t.subscriptionPlan.slice(1),
      period: month,
      notes: '',
      sendEmail: !!t.billingEmail,
      sendWhatsApp: !!t.whatsappNumber,
    });
    setInvoiceResult('');
  };

  const sendInvoice = async () => {
    if (!invoiceTenant) return;
    setInvoiceLoading(true);
    setInvoiceResult('');
    try {
      const data = await apiRequest<{ ok: boolean; errors?: string[] }>(`/saas-admin/tenants/${invoiceTenant.id}/send-invoice`, {
        method: 'POST',
        body: JSON.stringify({ ...invoiceForm, amount: Number(invoiceForm.amount) }),
      });
      setInvoiceResult(data.errors?.length ? `Sent with warnings: ${data.errors.join('; ')}` : 'Invoice sent successfully!');
      load();
    } catch (e) {
      setInvoiceResult(`Error: ${(e as Error).message}`);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const sendTrialExpiry = async (t: Tenant) => {
    await apiRequest(`/saas-admin/tenants/${t.id}/send-trial-expiry`, { method: 'POST' }).catch(() => {});
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SaaS Admin</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all pharmacy tenants and subscriptions</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <PendingPaymentsSection />
      <UnpaidTenantsSection />




      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Tenants', value: stats.total, icon: Building2, color: 'text-gray-600', bg: 'bg-gray-50' },
            { label: 'Trial', value: stats.trial, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Active', value: stats.active, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Suspended', value: stats.suspended, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-5 border border-transparent`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500 font-medium">{label}</p>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <DrapImportCard />

      <MasterCatalogCard />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tenant List */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 text-center text-gray-400">Loading tenants…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-400">No tenants found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Pharmacy</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Plan</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Trial Ends</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Last Invoice</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Joined</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((t) => {
                const dl = daysLeft(t.trialEndsAt);
                const isExpanded = expandedId === t.id;
                return (
                  <>
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : t.id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          <div>
                            <p className="font-medium text-gray-900">{t.name}</p>
                            <p className="text-xs text-gray-400">{t.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge className={`${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'} border-0 text-xs`}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge className={`${PLAN_COLORS[t.subscriptionPlan] ?? 'bg-gray-100 text-gray-600'} border-0 text-xs`}>
                          {t.subscriptionPlan}
                        </Badge>
                        {t.planPrice && <span className="ml-1.5 text-gray-400 text-xs">PKR {t.planPrice.toLocaleString()}</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {t.status === 'trial' && dl !== null ? (
                          <span className={dl <= 3 ? 'text-red-600 font-medium' : dl <= 7 ? 'text-amber-600' : 'text-gray-700'}>
                            {dl > 0 ? `${dl}d left` : 'Expired'}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-500">{fmt(t.lastInvoiceAt)}</td>
                      <td className="px-4 py-3.5 text-gray-500">{fmt(t.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(t)} title="Edit">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openInvoice(t)} title="Send Invoice">
                            <Send className="w-4 h-4" />
                          </Button>
                          {t.status === 'trial' && t.billingEmail && (
                            <Button size="sm" variant="ghost" onClick={() => sendTrialExpiry(t)} title="Send Trial Expiry Email">
                              <AlertCircle className="w-4 h-4 text-amber-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${t.id}-expanded`} className="bg-gray-50">
                        <td colSpan={7} className="px-8 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Mail className="w-4 h-4 text-gray-400" />
                              <span>{t.billingEmail ?? <span className="text-gray-400">No email</span>}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <Phone className="w-4 h-4 text-gray-400" />
                              <span>{t.whatsappNumber ?? <span className="text-gray-400">No WhatsApp</span>}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span>Trial ends: {fmt(t.trialEndsAt)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <TrendingUp className="w-4 h-4 text-gray-400" />
                              <span>Active: {t.isActive ? 'Yes' : 'No'}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Tenant Dialog */}
      <Dialog open={!!editTenant} onOpenChange={(o) => !o && setEditTenant(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Tenant — {editTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1 block">Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Plan</Label>
                <Select value={editForm.subscriptionPlan} onValueChange={(v) => setEditForm((f) => ({ ...f, subscriptionPlan: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1 block">Plan Price (PKR/mo)</Label>
                <Input type="number" value={editForm.planPrice} onChange={(e) => setEditForm((f) => ({ ...f, planPrice: e.target.value }))} placeholder="5000" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Trial Ends At</Label>
                <Input type="date" value={editForm.trialEndsAt} onChange={(e) => setEditForm((f) => ({ ...f, trialEndsAt: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Billing Email</Label>
              <Input type="email" value={editForm.billingEmail} onChange={(e) => setEditForm((f) => ({ ...f, billingEmail: e.target.value }))} placeholder="billing@pharmacy.com" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">WhatsApp Number</Label>
              <Input type="tel" value={editForm.whatsappNumber} onChange={(e) => setEditForm((f) => ({ ...f, whatsappNumber: e.target.value }))} placeholder="+92 300 1234567" />
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTenant(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {editLoading ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Invoice Dialog */}
      <Dialog open={!!invoiceTenant} onOpenChange={(o) => !o && setInvoiceTenant(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Invoice — {invoiceTenant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1 block">Invoice Number</Label>
                <Input value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm((f) => ({ ...f, invoiceNumber: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Amount (PKR)</Label>
                <Input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))} placeholder="5000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1 block">Plan</Label>
                <Input value={invoiceForm.plan} onChange={(e) => setInvoiceForm((f) => ({ ...f, plan: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Period</Label>
                <Input value={invoiceForm.period} onChange={(e) => setInvoiceForm((f) => ({ ...f, period: e.target.value }))} placeholder="May 2026" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Due Date</Label>
              <Input value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm((f) => ({ ...f, dueDate: e.target.value }))} placeholder="5 June 2026" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Notes (optional)</Label>
              <Input value={invoiceForm.notes} onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any special note…" />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={invoiceForm.sendEmail} onChange={(e) => setInvoiceForm((f) => ({ ...f, sendEmail: e.target.checked }))} className="rounded" />
                <Mail className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700">
                  Send Email
                  {invoiceTenant?.billingEmail ? ` (${invoiceTenant.billingEmail})` : ' (no email set)'}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={invoiceForm.sendWhatsApp} onChange={(e) => setInvoiceForm((f) => ({ ...f, sendWhatsApp: e.target.checked }))} className="rounded" />
                <MessageSquare className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-700">
                  WhatsApp
                  {invoiceTenant?.whatsappNumber ? ` (${invoiceTenant.whatsappNumber})` : ' (no number set)'}
                </span>
              </label>
            </div>
            {invoiceResult && (
              <div className={`text-sm px-4 py-3 rounded-lg ${invoiceResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {invoiceResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceTenant(null)}>Close</Button>
            <Button
              onClick={sendInvoice}
              disabled={invoiceLoading || (!invoiceForm.sendEmail && !invoiceForm.sendWhatsApp) || !invoiceForm.amount}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {invoiceLoading ? 'Sending…' : 'Send Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface UnpaidTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  billingEmail: string | null;
  whatsappNumber: string | null;
  branchCount: number;
  monthlyAmount: number;
  yearlyAmount: number;
  cycle: string;
  nextBillingAt: string | null;
  trialEndsAt: string | null;
  lastPaymentAt: string | null;
  lastReminderAt: string | null;
  category: 'overdue' | 'due-soon' | 'trial-expired' | 'trial-ending';
  daysOverdue: number;
}

function UnpaidTenantsSection() {
  const [items, setItems] = useState<UnpaidTenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [markPaidFor, setMarkPaidFor] = useState<UnpaidTenant | null>(null);
  const [markForm, setMarkForm] = useState({ months: 1, years: 0, amount: '', reference: '', note: '' });
  const [markBusy, setMarkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<UnpaidTenant[]>('/saas-admin/unpaid-tenants');
      setItems(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendReminder = async (t: UnpaidTenant) => {
    if (!t.billingEmail) { alert('No billing email set for this tenant.'); return; }
    setSendingId(t.id);
    try {
      await apiRequest(`/saas-admin/tenants/${t.id}/send-reminder`, { method: 'POST' });
      alert(`Reminder sent to ${t.billingEmail}`);
      await load();
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`);
    } finally { setSendingId(null); }
  };

  const openMarkPaid = (t: UnpaidTenant) => {
    const defaultAmt = (t.cycle === 'yearly' ? t.yearlyAmount : t.monthlyAmount) || 0;
    setMarkForm({ months: t.cycle === 'yearly' ? 0 : 1, years: t.cycle === 'yearly' ? 1 : 0, amount: String(defaultAmt), reference: '', note: '' });
    setMarkPaidFor(t);
  };

  const submitMarkPaid = async () => {
    if (!markPaidFor) return;
    const months = Math.max(0, Math.floor(Number(markForm.months) || 0));
    const years = Math.max(0, Math.floor(Number(markForm.years) || 0));
    if (months === 0 && years === 0) { alert('Pick at least one month or year.'); return; }
    const amount = markForm.amount.trim() ? parseFloat(markForm.amount) : undefined;
    setMarkBusy(true);
    try {
      const r = await apiRequest<{ nextBillingAt: string }>(`/saas-admin/tenants/${markPaidFor.id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({
          months, years,
          amount: Number.isFinite(amount as number) ? amount : undefined,
          reference: markForm.reference.trim() || undefined,
          note: markForm.note.trim() || undefined,
        }),
      });
      alert(`${markPaidFor.name} marked paid. Next billing: ${new Date(r.nextBillingAt).toLocaleDateString('en-PK')}.`);
      setMarkPaidFor(null);
      await load();
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`);
    } finally { setMarkBusy(false); }
  };

  const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const badgeFor = (c: UnpaidTenant['category'], d: number) => {
    const labels: Record<UnpaidTenant['category'], string> = {
      'overdue': `Overdue ${d}d`,
      'due-soon': `Due in ${Math.abs(d)}d`,
      'trial-expired': `Trial expired ${d}d ago`,
      'trial-ending': `Trial ending in ${Math.abs(d)}d`,
    };
    const colors: Record<UnpaidTenant['category'], string> = {
      'overdue': 'bg-red-100 text-red-700',
      'due-soon': 'bg-amber-100 text-amber-700',
      'trial-expired': 'bg-red-100 text-red-700',
      'trial-ending': 'bg-blue-100 text-blue-700',
    };
    return <Badge className={colors[c]}>{labels[c]}</Badge>;
  };

  const counts = {
    overdue: items.filter(i => i.category === 'overdue').length,
    dueSoon: items.filter(i => i.category === 'due-soon').length,
    trialEnding: items.filter(i => i.category === 'trial-ending' || i.category === 'trial-expired').length,
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Unpaid &amp; Overdue Tenants</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {counts.overdue} overdue · {counts.dueSoon} due soon · {counts.trialEnding} trial ending/expired
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>Refresh</Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">All tenants are up to date with their payments. 🎉</p>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 p-4 rounded-xl border bg-gray-50 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  {badgeFor(t.category, t.daysOverdue)}
                  <Badge variant="outline" className="text-xs">{t.status}</Badge>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {t.billingEmail ?? <span className="text-red-600">no billing email</span>}
                  {t.whatsappNumber && <span className="ml-2 text-gray-500">· {t.whatsappNumber}</span>}
                </div>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{t.branchCount} branch{t.branchCount === 1 ? '' : 'es'}</span>
                  <span>Cycle: {t.cycle}</span>
                  <span>Amount: PKR {(t.cycle === 'yearly' ? t.yearlyAmount : t.monthlyAmount).toLocaleString()}</span>
                  <span>Next billing: {fmt(t.nextBillingAt)}</span>
                  {t.lastPaymentAt && <span>Last paid: {fmt(t.lastPaymentAt)}</span>}
                  {t.lastReminderAt && <span>Last reminder: {fmt(t.lastReminderAt)}</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendReminder(t)}
                  disabled={sendingId === t.id || !t.billingEmail}
                >
                  {sendingId === t.id ? 'Sending…' : 'Send Reminder'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => openMarkPaid(t)}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Mark Paid
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual mark-paid dialog */}
      <Dialog open={!!markPaidFor} onOpenChange={(o) => !o && setMarkPaidFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as paid — {markPaidFor?.name}</DialogTitle>
          </DialogHeader>
          {markPaidFor && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 bg-gray-50 border rounded p-2 leading-relaxed">
                Extends <strong>nextBillingAt</strong> by the months / years chosen, stamps a
                manual transaction in the billing log, and silences invoice + reminder emails
                for the paid duration.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Months</Label>
                  <Input
                    type="number" min={0} max={24}
                    value={markForm.months}
                    onChange={(e) => setMarkForm({ ...markForm, months: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Years</Label>
                  <Input
                    type="number" min={0} max={5}
                    value={markForm.years}
                    onChange={(e) => setMarkForm({ ...markForm, years: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: '1 month', m: 1, y: 0 },
                  { label: '3 months', m: 3, y: 0 },
                  { label: '6 months', m: 6, y: 0 },
                  { label: '1 year', m: 0, y: 1 },
                  { label: '2 years', m: 0, y: 2 },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setMarkForm({ ...markForm, months: preset.m, years: preset.y })}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div>
                <Label className="text-xs">Amount received (PKR) — optional</Label>
                <Input
                  type="number" min={0} step={1}
                  value={markForm.amount}
                  onChange={(e) => setMarkForm({ ...markForm, amount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">Reference (txn ID, cheque #, etc.) — optional</Label>
                <Input
                  value={markForm.reference}
                  onChange={(e) => setMarkForm({ ...markForm, reference: e.target.value })}
                  placeholder="e.g. BANK-TRANSFER-2026-001"
                />
              </div>
              <div>
                <Label className="text-xs">Note — optional</Label>
                <Input
                  value={markForm.note}
                  onChange={(e) => setMarkForm({ ...markForm, note: e.target.value })}
                  placeholder="e.g. Direct bank deposit, complimentary extension, etc."
                />
              </div>
              {(() => {
                const base = Math.max(Date.now(), markPaidFor.nextBillingAt ? new Date(markPaidFor.nextBillingAt).getTime() : 0);
                const next = new Date(base);
                next.setMonth(next.getMonth() + (Number(markForm.months) || 0));
                next.setFullYear(next.getFullYear() + (Number(markForm.years) || 0));
                return (
                  <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                    <strong>Next billing will be</strong> {next.toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {markPaidFor.nextBillingAt && ` (extended from ${new Date(markPaidFor.nextBillingAt).toLocaleDateString('en-PK')})`}.
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidFor(null)} disabled={markBusy}>Cancel</Button>
            <Button onClick={submitMarkPaid} disabled={markBusy} className="bg-emerald-600 hover:bg-emerald-700">
              {markBusy ? 'Saving…' : 'Confirm Mark Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PendingSubmission {
  id: string;
  tenantId: string;
  tenantName: string;
  cycle: 'monthly' | 'yearly';
  amount: number;
  referenceNumber: string;
  notes?: string | null;
  receiptBase64?: string | null;
  submittedAt: string;
}

function PendingPaymentsSection() {
  const [items, setItems] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [receiptOf, setReceiptOf] = useState<{ image: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<PendingSubmission[]>('/saas-admin/pending-payments');
      setItems(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (s: PendingSubmission) => {
    if (!confirm(`Approve PKR ${s.amount.toLocaleString()} (${s.cycle}) for ${s.tenantName}?`)) return;
    await apiRequest(`/saas-admin/payment/${s.tenantId}/${s.id}/approve`, { method: 'POST' });
    await load();
  };
  const reject = async (s: PendingSubmission) => {
    const reason = prompt(`Reject payment for ${s.tenantName}? Optional reason:`);
    if (reason === null) return;
    await apiRequest(`/saas-admin/payment/${s.tenantId}/${s.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    await load();
  };
  const viewReceipt = async (s: PendingSubmission) => {
    try {
      const r = await apiRequest<{ receiptBase64: string }>(`/saas-admin/payment/${s.tenantId}/${s.id}/receipt`);
      setReceiptOf({ image: r.receiptBase64, name: s.tenantName });
    } catch { alert('No receipt attached.'); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Pending Payment Submissions</h2>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} awaiting manual verification (auto-detected payments don't appear here)</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>Refresh</Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No pending submissions. All payments are either auto-confirmed or already processed.</p>
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-4 rounded-xl border bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{s.tenantName}</p>
                <div className="text-sm text-gray-600 mt-0.5">
                  PKR {s.amount.toLocaleString()} · {s.cycle} · Ref: <strong>{s.referenceNumber}</strong>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Submitted {new Date(s.submittedAt).toLocaleString('en-PK')}</p>
                {s.notes && <p className="text-xs text-gray-500 mt-1 italic">"{s.notes}"</p>}
              </div>
              <div className="flex gap-2">
                {s.receiptBase64 && <Button size="sm" variant="outline" onClick={() => viewReceipt(s)}>View Receipt</Button>}
                <Button size="sm" variant="outline" onClick={() => reject(s)} className="text-red-600 hover:bg-red-50">Reject</Button>
                <Button size="sm" onClick={() => approve(s)} className="bg-emerald-600 hover:bg-emerald-700">Approve</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {receiptOf && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setReceiptOf(null)}>
          <div className="bg-white rounded-2xl p-4 max-w-3xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Receipt — {receiptOf.name}</h3>
              <Button size="sm" variant="outline" onClick={() => setReceiptOf(null)}>Close</Button>
            </div>
            {receiptOf.image.startsWith('data:image') ? (
              <img src={receiptOf.image} alt="Receipt" className="max-w-full" />
            ) : (
              <a href={receiptOf.image} download="receipt" className="text-emerald-600 hover:underline">Download receipt file</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
