import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store';
import { apiRequest } from '@/lib/backend';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Calendar, Building2, MessageCircle, CheckCircle, Loader2, Upload, Clock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const SALES_WHATSAPP = '923189540997';
const SALES_DISPLAY = '+92 318 954 0997';

interface BillingState {
  status: string;
  isActive: boolean;
  trialEndsAt: string | null;
  branchCount: number;
  cycle: 'monthly' | 'yearly';
  nextBillingAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentAmount: number | null;
  pricing: { baseMonthly: number; baseYearly: number; branchMonthly: number; branchYearly: number };
  monthlyAmount: number;
  yearlyAmount: number;
}

export function Billing() {
  const { currentUser } = useAuthStore();
  const role = currentUser?.role;
  const isOwner = role === 'owner';
  const [data, setData] = useState<BillingState | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<{ qrImageUrl: string; amount: number; cycle: string } | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [refNum, setRefNum] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Array<{ id: string; status: string; cycle: string; amount: number; referenceNumber: string; submittedAt: string; rejectionReason?: string }>>([]);

  useEffect(() => {
    apiRequest<typeof submissions>('/billing/submissions').then(setSubmissions).catch(() => {});
  }, []);

  const onReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setReceipt(null); return; }
    if (file.size > 1.8 * 1024 * 1024) {
      setError('Receipt must be smaller than 1.8 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReceipt(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submitPayment = async () => {
    if (!qr) return;
    if (!refNum.trim() && !receipt) { setError('Please provide either a reference number or upload a receipt'); return; }
    setSubmitting(true);
    setError('');
    try {
      await apiRequest('/billing/submit-payment', {
        method: 'POST',
        body: JSON.stringify({
          cycle: qr.cycle,
          amount: qr.amount,
          referenceNumber: refNum.trim(),
          receiptBase64: receipt ?? undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const refreshed = await apiRequest<BillingState>('/billing');
      const subs = await apiRequest<typeof submissions>('/billing/submissions');
      setData(refreshed);
      setSubmissions(subs);
      setQr(null);
      setShowSubmitForm(false);
      setRefNum('');
      setNotes('');
      setReceipt(null);
      alert('Payment submitted! An admin will verify it within 30 minutes.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    apiRequest<BillingState>('/billing').then((d) => {
      setData(d);
      setCycle(d.cycle);
    }).catch((e) => setError(e.message));
  }, []);

  if (!data) {
    return <div className="p-8 text-center text-gray-500">{error || 'Loading billing…'}</div>;
  }

  const amount = cycle === 'monthly' ? data.monthlyAmount : data.yearlyAmount;
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  const generateQr = async () => {
    setError('');
    setLoading(true);
    setQr(null);
    try {
      const r = await apiRequest<{ qrImageUrl: string; amount: number; cycle: string }>('/billing/generate-qr', {
        method: 'POST',
        body: JSON.stringify({ cycle }),
      });
      setQr(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
        <p className="text-gray-500 mt-1">Manage your Kynex Pharmacloud subscription</p>
      </div>

      {/* Current Status */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Status</CardDescription></CardHeader>
          <CardContent>
            <Badge className={data.status === 'active' ? 'bg-emerald-100 text-emerald-700' : data.status === 'trial' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}>
              {data.status.toUpperCase()}
            </Badge>
            {data.status === 'trial' && data.trialEndsAt && (
              <p className="text-xs text-gray-500 mt-2">Trial ends {fmtDate(data.trialEndsAt)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Active Branches</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-400" />
              <span className="text-2xl font-bold">{data.branchCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{data.cycle === 'yearly' ? 'Next Billing Year' : 'Next Billing Date'}</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <span className="text-lg font-semibold">{fmtDate(data.nextBillingAt)}</span>
            </div>
            {data.lastPaymentAt && (
              <p className="text-xs text-gray-500 mt-1">Last paid PKR {data.lastPaymentAmount?.toLocaleString()} on {fmtDate(data.lastPaymentAt)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Choose Billing Cycle</CardTitle>
          <CardDescription>1st store: PKR 1,500/mo or 12,000/yr · Each additional branch: PKR 1,275/mo or 10,200/yr (15% sub-branch discount applied)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => setCycle('monthly')}
              className={`p-5 rounded-xl border-2 text-left transition-all ${cycle === 'monthly' ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <p className="font-semibold mb-1">Monthly</p>
              <p className="text-3xl font-extrabold">PKR {data.monthlyAmount.toLocaleString()}<span className="text-sm font-normal text-gray-500"> /month</span></p>
              <p className="text-xs text-gray-500 mt-2">{data.branchCount} branch{data.branchCount === 1 ? '' : 'es'} × actual rate</p>
              {cycle === 'monthly' && <CheckCircle className="w-5 h-5 text-emerald-600 mt-3" />}
            </button>
            <button
              onClick={() => setCycle('yearly')}
              className={`p-5 rounded-xl border-2 text-left transition-all ${cycle === 'yearly' ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <p className="font-semibold mb-1">Yearly <Badge className="ml-2 bg-emerald-100 text-emerald-700">save up to 25%</Badge></p>
              <p className="text-3xl font-extrabold">PKR {data.yearlyAmount.toLocaleString()}<span className="text-sm font-normal text-gray-500"> /year</span></p>
              <p className="text-xs text-gray-500 mt-2">{data.branchCount} branch{data.branchCount === 1 ? '' : 'es'} × actual rate</p>
              {cycle === 'yearly' && <CheckCircle className="w-5 h-5 text-emerald-600 mt-3" />}
            </button>
          </div>

          {!qr && (
            <Button onClick={generateQr} disabled={loading || !isOwner} size="lg" className="w-full bg-emerald-600 hover:bg-emerald-700">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating QR…</> : <><CreditCard className="w-4 h-4 mr-2" />Pay PKR {amount.toLocaleString()} via QR</>}
            </Button>
          )}
          {!isOwner && <p className="text-xs text-gray-500 text-center">Only the pharmacy owner can make payments.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {qr && (
            <div className="rounded-xl bg-gray-50 p-6">
              <div className="text-center">
                <p className="font-semibold mb-3">Scan with any Pakistani banking app</p>
                <img src={qr.qrImageUrl} alt="Payup QR" className="w-64 h-64 mx-auto bg-white p-3 rounded-xl border" />
                <p className="mt-4 text-lg font-bold">PKR {qr.amount.toLocaleString()} · {qr.cycle}</p>
                <p className="text-xs text-gray-500 mt-1">Powered by Payup.pk · Verification is manual</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mt-5 text-sm text-amber-900">
                <strong>After paying:</strong> upload your receipt screenshot (and reference number) below. An admin will verify your payment within <strong>30 minutes</strong>.
              </div>

              {!showSubmitForm ? (
                <div className="flex gap-3 justify-center mt-5">
                  <Button variant="outline" onClick={() => setQr(null)}>Cancel</Button>
                  <Button onClick={() => setShowSubmitForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    I've Paid – Submit Receipt
                  </Button>
                </div>
              ) : (
                <div className="mt-5 space-y-4 bg-white rounded-lg p-5 border">
                  <p className="text-sm text-gray-600">Provide <strong>either</strong> a reference number <strong>or</strong> a receipt screenshot — you don't need both.</p>
                  <div>
                    <Label htmlFor="ref">Transaction Reference Number</Label>
                    <Input id="ref" value={refNum} onChange={(e) => setRefNum(e.target.value)} placeholder="e.g. TXN1234567 or your bank's transaction ID" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="receipt">Upload Receipt (max 1.8 MB)</Label>
                    <Input id="receipt" type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" onChange={onReceiptChange} className="mt-1.5" />
                    {receipt && receipt.startsWith('data:image') && (
                      <img src={receipt} alt="Receipt preview" className="mt-3 max-h-48 rounded border" />
                    )}
                    {receipt && !receipt.startsWith('data:image') && (
                      <p className="mt-2 text-xs text-gray-500">PDF receipt attached.</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional info for the admin" className="mt-1.5" rows={2} />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex gap-3 justify-end">
                    <Button variant="outline" onClick={() => { setShowSubmitForm(false); setError(''); }}>Back</Button>
                    <Button onClick={submitPayment} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                      {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : <><Upload className="w-4 h-4 mr-2" />Submit Payment</>}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submission history */}
          {submissions.length > 0 && (
            <div className="border-t pt-6">
              <h4 className="font-semibold text-gray-900 mb-3">Payment Submissions</h4>
              <div className="space-y-2">
                {submissions.slice().reverse().map((s) => {
                  const badge = s.status === 'pending' ? { c: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Pending verification' } :
                                s.status === 'approved' ? { c: 'bg-emerald-100 text-emerald-700', icon: CheckCircle, label: 'Approved' } :
                                { c: 'bg-red-100 text-red-700', icon: X, label: 'Rejected' };
                  const Icon = badge.icon;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">PKR {s.amount.toLocaleString()}</span>
                          <span className="text-sm text-gray-500">· {s.cycle}</span>
                          <span className="text-sm text-gray-500">· Ref: {s.referenceNumber}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">Submitted {fmtDate(s.submittedAt)}</p>
                        {s.rejectionReason && <p className="text-xs text-red-600 mt-0.5">Reason: {s.rejectionReason}</p>}
                      </div>
                      <Badge className={badge.c}><Icon className="w-3 h-3 mr-1" />{badge.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enterprise / Contact */}
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="font-semibold text-gray-900">Need an Enterprise plan or custom integration?</p>
            <p className="text-sm text-gray-600">Talk to Kynex Solutions on WhatsApp at {SALES_DISPLAY}</p>
          </div>
          <a href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent('Hi Kynex Solutions, I want to discuss my Kynex Pharmacloud subscription.')}`} target="_blank" rel="noopener noreferrer">
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <MessageCircle className="w-4 h-4 mr-2" />Contact on WhatsApp
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
