import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/backend';

export default function Signup() {
  const [form, setForm] = useState({ pharmacyName: '', ownerName: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.pharmacyName.trim() || !form.ownerName.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    try {
      await apiRequest('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 mb-3">Thank you for signing up!</h1>
          <p className="text-gray-600 text-lg leading-relaxed mb-8">
            Please check your email for confirmation and password setup instructions.
            The link expires in 48 hours.
          </p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-8 text-left">
            <p className="text-sm font-semibold text-emerald-800 mb-2">What happens next?</p>
            <ol className="text-sm text-emerald-700 space-y-1.5 list-decimal list-inside">
              <li>Open the email from Kynex Pharmacloud</li>
              <li>Click "Set Up My Password"</li>
              <li>Create a secure password</li>
              <li>Log in and start your 30-day free trial</li>
            </ol>
          </div>
          <Link to="/">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-xl">Kynex Pharmacloud</span>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Create your account</h1>
          <p className="text-gray-500">30-day free trial · No credit card required</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="pharmacyName" className="text-sm font-medium text-gray-700 mb-1.5 block">
                Pharmacy / Business Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="pharmacyName"
                placeholder="Al-Shifa Pharmacy"
                value={form.pharmacyName}
                onChange={set('pharmacyName')}
                className="h-11"
                required
              />
            </div>
            <div>
              <Label htmlFor="ownerName" className="text-sm font-medium text-gray-700 mb-1.5 block">
                Your Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ownerName"
                placeholder="Ali Hassan"
                value={form.ownerName}
                onChange={set('ownerName')}
                className="h-11"
                required
              />
            </div>
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 mb-1.5 block">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set('email')}
                className="h-11"
                required
              />
            </div>
            <div>
              <Label htmlFor="phone" className="text-sm font-medium text-gray-700 mb-1.5 block">
                Phone / WhatsApp <span className="text-red-500">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+92 300 1234567"
                value={form.phone}
                onChange={set('phone')}
                className="h-11"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base rounded-xl"
            >
              {loading ? 'Creating account…' : 'Create Free Account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-emerald-600 hover:underline font-medium">
              Log in
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
