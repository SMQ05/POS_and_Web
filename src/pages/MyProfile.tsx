import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, ShieldCheck, ArrowLeft, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { setOwnSalesPin, fetchMyPerformance, type MyPerformance, type PerformanceBucket } from '@/lib/backend';

const POS_ROLES = new Set(['owner', 'manager', 'cashier', 'salesman', 'pharmacist']);

export function MyProfile() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);

  const [username, setUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [perf, setPerf] = useState<MyPerformance | null>(null);

  useEffect(() => {
    setUsername(currentUser?.salesUsername ?? '');
  }, [currentUser?.salesUsername]);

  useEffect(() => {
    fetchMyPerformance().then(setPerf).catch(() => setPerf(null));
  }, []);

  if (!currentUser) {
    return <div className="p-6">Not signed in.</div>;
  }

  const eligibleForPos = POS_ROLES.has(currentUser.role);
  const hasPin = Boolean(currentUser.salesPinSet);
  const money = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-zA-Z0-9._-]{2,40}$/.test(username)) {
      toast.error('Username: 2–40 chars, letters/digits/._- only');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }
    if (!currentPassword && !(hasPin && currentPin)) {
      toast.error(hasPin
        ? 'Enter your account password OR your current PIN'
        : 'Enter your account password to set a new PIN');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await setOwnSalesPin({
        username,
        pin: newPin,
        currentPassword: currentPassword || undefined,
        currentPin: currentPin || undefined,
      });
      // Hydrate the local session so other screens see the new PIN status.
      useAuthStore.setState({ currentUser: updated });
      toast.success('Sales PIN saved');
      setNewPin('');
      setConfirmPin('');
      setCurrentPassword('');
      setCurrentPin('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save PIN');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">My Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your login details for this pharmacy.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Name:</span> <span className="font-medium">{currentUser.name}</span></div>
          <div><span className="text-gray-500">Email:</span> <span className="font-medium">{currentUser.email}</span></div>
          <div><span className="text-gray-500">Role:</span> <Badge variant="outline" className="ml-1 capitalize">{currentUser.role}</Badge></div>
        </CardContent>
      </Card>

      {eligibleForPos && perf && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> My Performance
            </CardTitle>
            <CardDescription>
              Sales recorded under your POS name, with returns subtracted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {([
              { label: 'Today', b: perf.today },
              { label: 'This month', b: perf.month },
              { label: 'All time', b: perf.allTime },
            ] as { label: string; b: PerformanceBucket }[]).map(({ label, b }) => (
              <div key={label} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-lg font-bold text-emerald-600">{money(b.netTotal)}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <div><span className="text-gray-400">Sales:</span> {money(b.salesTotal)}</div>
                  <div><span className="text-gray-400">Returns:</span> -{money(b.returnsTotal)}</div>
                  <div><span className="text-gray-400">Bills:</span> {b.salesCount}</div>
                  <div><span className="text-gray-400">Items:</span> {b.itemsSold}</div>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400">Net = sales − returns. Figures cover sales attributed to your POS PIN.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> POS Sales PIN
          </CardTitle>
          <CardDescription>
            Used to authorize sales on a shared POS terminal. The cashier types
            this username + 4-digit PIN at receipt time; the sale is recorded
            under your name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!eligibleForPos && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              Your role ({currentUser.role}) cannot process POS sales. A PIN is not needed.
            </div>
          )}

          {hasPin && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <ShieldCheck className="w-4 h-4" />
              A PIN is currently set under username <span className="font-mono font-medium">{currentUser.salesUsername}</span>.
            </div>
          )}

          {eligibleForPos && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="pos-username">POS Username</Label>
                <Input
                  id="pos-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  placeholder="short handle, e.g. ahmad"
                />
                <p className="text-xs text-gray-500 mt-1">Must be unique within your pharmacy.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="new-pin">New 4-digit PIN</Label>
                  <Input
                    id="new-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="font-mono tracking-widest"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-pin">Confirm PIN</Label>
                  <Input
                    id="confirm-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="font-mono tracking-widest"
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="text-sm text-gray-600">
                  Confirm with your account password{hasPin ? ' OR your current PIN' : ''}:
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cur-pw">Account password</Label>
                    <Input
                      id="cur-pw"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  {hasPin && (
                    <div>
                      <Label htmlFor="cur-pin">Current PIN</Label>
                      <Input
                        id="cur-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={currentPin}
                        onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="font-mono tracking-widest"
                      />
                    </div>
                  )}
                </div>
              </div>

              <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                {submitting ? 'Saving…' : hasPin ? 'Change PIN' : 'Set PIN'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
