import { useEffect, useState } from 'react';
import { useAuthStore, useSettingsStore } from '@/store';
import { apiRequest } from '@/lib/backend';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { Branch } from '@/types';

export function Branches() {
  const { currentUser } = useAuthStore();
  const role = currentUser?.role;
  const canEdit = role === 'owner' || role === 'manager' || role === 'superadmin';
  const canDelete = role === 'owner' || role === 'superadmin';

  const { activeBranchId, setActiveBranch } = useAuthStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<Record<string, { salesToday: number; salesCount: number; openShifts: number; staff: number }>>({});
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{
    name: string; address: string; city: string; phone: string; email: string;
    branchAdminName: string;
    billingPaidBy: 'main' | 'self';
    subscriptionDiscount: number;
  }>({
    name: '', address: '', city: '', phone: '', email: '',
    branchAdminName: '',
    billingPaidBy: 'main',
    subscriptionDiscount: 0,
  });
  const [lastInvitationStatus, setLastInvitationStatus] = useState<{ email: string; sent: boolean; error?: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<Branch[]>('/branches');
      setBranches(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    apiRequest<typeof stats>('/branches/stats').then(setStats).catch(() => { /* stats are best-effort */ });
  }, []);

  const startCreate = () => {
    setEditing(null);
    setForm({
      name: '', address: '', city: '', phone: '', email: '',
      branchAdminName: '',
      billingPaidBy: 'main',
      subscriptionDiscount: 0,
    });
    setShowForm(true);
    setError('');
  };

  const startEdit = (b: Branch) => {
    setEditing(b);
    const billing = b.billingPaidBy ?? 'main';
    setForm({
      name: b.name, address: b.address, city: b.city, phone: b.phone, email: b.email ?? '',
      branchAdminName: '',
      billingPaidBy: billing,
      // Self-billed branches get a flat 15% discount; main-billed get none.
      subscriptionDiscount: billing === 'self' ? 15 : 0,
    });
    setShowForm(true);
    setError('');
  };

  const save = async () => {
    setError('');
    setLastInvitationStatus(null);
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.phone.trim()) {
      setError('Name, address, city, and phone are required');
      return;
    }
    if (!form.email.trim()) {
      setError('Branch email is required — the branch admin needs it to set their password');
      return;
    }
    // Minimal email format check; server does proper zod email validation.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Enter a valid email address for the branch admin');
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        await apiRequest<Branch>(`/branches/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        const created = await apiRequest<Branch & { invitationSent?: boolean; invitationError?: string }>('/branches', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        setLastInvitationStatus({
          email: form.email.trim(),
          sent: !!created.invitationSent,
          error: created.invitationError ?? undefined,
        });
      }
      setShowForm(false);
      setEditing(null);
      await load();
      // Update header (current branch name) by re-fetching branches into auth store
      const fresh = await apiRequest<Branch[]>('/branches');
      useAuthStore.getState().setBranches(fresh);

      // Mirror main-branch contact details back into Settings → Company
      // Information so the receipt header / FBR seller info stays in sync.
      // The "main branch" is the first/oldest one.
      const main = fresh[0];
      if (main && editing && editing.id === main.id) {
        const currentSettings = useSettingsStore.getState().settings;
        useSettingsStore.getState().updateSettings({
          companyAddress: `${form.address.trim()}, ${form.city.trim()}`,
          companyPhone: form.phone.trim(),
          companyEmail: form.email.trim() || currentSettings.companyEmail,
          fbrProfile: {
            ...currentSettings.fbrProfile,
            sellerAddress: `${form.address.trim()}, ${form.city.trim()}`,
          },
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };

  const remove = async (b: Branch) => {
    if (!confirm(`Delete branch "${b.name}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await apiRequest(`/branches/${b.id}`, { method: 'DELETE' });
      await load();
      useAuthStore.getState().setBranches(await apiRequest<Branch[]>('/branches'));
    } catch (e) {
      alert((e as Error).message);
    } finally { setLoading(false); }
  };

  const additionalBranches = Math.max(0, branches.length - 1);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Branches</h1>
          <p className="text-gray-500 mt-1">Manage your pharmacy locations. The first branch is included; each additional branch is PKR 1,275/mo (15% sub-branch discount applied automatically).</p>
        </div>
        {canEdit && (
          <Button onClick={startCreate} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />Add Branch
          </Button>
        )}
      </div>

      {/* Invitation status banner — shown right after a new branch is added */}
      {lastInvitationStatus && (
        <Card className={lastInvitationStatus.sent ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center ${lastInvitationStatus.sent ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
              {lastInvitationStatus.sent ? '✓' : '!'}
            </div>
            <div className="flex-1 min-w-0">
              {lastInvitationStatus.sent ? (
                <>
                  <p className="font-semibold text-emerald-900">Invitation email sent to <span className="font-mono">{lastInvitationStatus.email}</span></p>
                  <p className="text-sm text-emerald-700 mt-0.5">
                    The branch admin will receive a link to set their password and log in (link expires in 48 hours).
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-amber-900">Branch created, but the invitation email could not be sent</p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    {lastInvitationStatus.error || 'Email service unavailable.'} The user account exists — you can resend the setup link from User Management.
                  </p>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLastInvitationStatus(null)} className="shrink-0">✕</Button>
          </CardContent>
        </Card>
      )}

      {/* Billing impact summary — only counts branches billed to the main pharmacy */}
      {(() => {
        const billableToMain = branches.slice(1).filter((b) => (b.billingPaidBy ?? 'main') === 'main').length;
        const selfBilled = branches.slice(1).filter((b) => b.billingPaidBy === 'self').length;
        return (
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-semibold text-emerald-900">{branches.length} active branch{branches.length === 1 ? '' : 'es'}</p>
                  <p className="text-sm text-emerald-700 mt-0.5">
                    {additionalBranches === 0
                      ? 'Base subscription only — no extra branch fees.'
                      : (
                        <>
                          {billableToMain > 0 && (
                            <>{billableToMain} branch{billableToMain === 1 ? '' : 'es'} × PKR 1,275/mo on this account (15% sub-branch discount).</>
                          )}
                          {selfBilled > 0 && (
                            <> {selfBilled} branch{selfBilled === 1 ? '' : 'es'} invoiced separately at PKR 1,275/mo.</>
                          )}
                        </>
                      )}
                  </p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  <Building2 className="w-3.5 h-3.5 mr-1" />
                  {branches.length} {branches.length === 1 ? 'branch' : 'branches'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* List */}
      {branches.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-500">{loading ? 'Loading…' : 'No branches yet. Click "Add Branch" to create one.'}</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {branches.map((b, idx) => (
            <Card key={b.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{b.name}</CardTitle>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {idx === 0 && <Badge className="bg-blue-100 text-blue-700">Main</Badge>}
                    {idx > 0 && (
                      (b.billingPaidBy ?? 'main') === 'self'
                        ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                              Self-billed · 15% off
                            </Badge>
                          )
                        : <Badge className="bg-gray-100 text-gray-700 border-gray-200">Main pays</Badge>
                    )}
                  </div>
                </div>
                <CardDescription>{b.address}, {b.city}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p><span className="text-gray-500">Phone:</span> {b.phone}</p>
                {b.email && <p><span className="text-gray-500">Email:</span> {b.email}</p>}

                {/* Live snapshot */}
                {stats[b.id] && (
                  <div className="grid grid-cols-3 gap-2 pt-3">
                    <div className="rounded-lg border p-2 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Sales today</p>
                      <p className="font-semibold tabular-nums">Rs. {stats[b.id].salesToday.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400">{stats[b.id].salesCount} inv</p>
                    </div>
                    <div className="rounded-lg border p-2 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Shift</p>
                      <p className={cn('font-semibold', stats[b.id].openShifts > 0 ? 'text-emerald-600' : 'text-gray-400')}>
                        {stats[b.id].openShifts > 0 ? 'Open' : 'Closed'}
                      </p>
                    </div>
                    <div className="rounded-lg border p-2 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Staff</p>
                      <p className="font-semibold tabular-nums">{stats[b.id].staff}</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-3">
                  {b.id === activeBranchId ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 self-center">Currently active</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setActiveBranch(b.id)}>
                      <Building2 className="w-3.5 h-3.5 mr-1" />Switch to this branch
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(b)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                    </Button>
                  )}
                  {canEdit && canDelete && idx !== 0 && (
                    <Button size="sm" variant="outline" onClick={() => remove(b)} className="text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update this branch’s contact details.'
                : 'Each additional branch is PKR 1,275/mo (or PKR 10,200/yr) — includes the standard 15% sub-branch discount.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Branch Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main Branch — Lahore" />
            </div>
            <div className="space-y-1.5">
              <Label>Address <span className="text-red-500">*</span></Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. Plot 123, Main Boulevard, Gulberg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City <span className="text-red-500">*</span></Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Lahore" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone <span className="text-red-500">*</span></Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+92 300 1234567" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Branch Admin Email <span className="text-red-500">*</span></Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="branch.manager@yourpharmacy.com"
                disabled={!!editing}
              />
              <p className="text-[11px] text-gray-500">
                {editing
                  ? 'Email cannot be changed after the branch is created (it is the admin\'s login).'
                  : 'When you save, an invitation will be emailed so the branch admin can set their own password and log in.'}
              </p>
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label>Branch Admin Name <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input
                  value={form.branchAdminName}
                  onChange={(e) => setForm({ ...form, branchAdminName: e.target.value })}
                  placeholder="e.g. Mr. Khan"
                />
                <p className="text-[11px] text-gray-500">Used in the welcome email. Defaults to "{form.name || 'Branch'} Manager".</p>
              </div>
            )}

            {/* Billing payer — sub-branches always get a flat 15% discount, no
                manual override (set policy from product, not per-branch). */}
            <div className="rounded-lg border bg-emerald-50/40 p-3 space-y-2">
              <Label className="text-sm font-medium">Subscription billing</Label>
              <RadioGroup
                value={form.billingPaidBy}
                onValueChange={(v) => {
                  const next = v as 'main' | 'self';
                  setForm({ ...form, billingPaidBy: next, subscriptionDiscount: next === 'self' ? 15 : 0 });
                }}
                className="space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="main" id="bill-main" className="mt-0.5" />
                  <Label htmlFor="bill-main" className="font-normal flex-1 cursor-pointer">
                    <span className="font-medium">Main pharmacy pays</span>
                    <span className="block text-[11px] text-gray-500">Branch fee added to the main pharmacy's invoice. No separate invoice.</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="self" id="bill-self" className="mt-0.5" />
                  <Label htmlFor="bill-self" className="font-normal flex-1 cursor-pointer">
                    <span className="font-medium">Branch pays separately</span>
                    <span className="block text-[11px] text-gray-500">Branch is invoiced directly.</span>
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-[11px] text-gray-600 pt-1">
                Sub-branch fee: <strong>PKR 1,275/mo</strong> (or <strong>PKR 10,200/yr</strong>) — standard 15% discount off PKR 1,500/mo (PKR 12,000/yr) is applied automatically.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={save} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
