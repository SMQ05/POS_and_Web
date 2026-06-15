import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  motion, useInView, useReducedMotion, useScroll, useTransform,
  useMotionValue, useSpring, AnimatePresence, type Variants,
} from 'motion/react';
import {
  Pill, BarChart3, ShieldCheck, Zap, CheckCircle, ArrowRight, Star,
  Building2, Receipt, Users, Package, Truck, Bell, Globe, UserCheck,
  Sparkles, Activity, Cloud, Cpu, BadgeCheck, LineChart,
  Quote, TrendingUp, Plus, Boxes, Stethoscope, Layers, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Data ────────────────────────────────────────────────────────────────────

const FEATURE_SECTIONS = [
  {
    key: 'pos',
    title: 'Point of Sale',
    tag: 'Sell in seconds',
    icon: Receipt,
    accent: 'from-emerald-400 to-teal-500',
    glow: 'shadow-emerald-500/40',
    chip: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30',
    highlights: [
      { title: 'Scan-fast checkout', desc: 'Barcode / QR with FEFO batch auto-selection on every line.' },
      { title: 'Every Pakistani wallet', desc: 'Cash, Card, JazzCash, EasyPaisa & Bank Transfer with reference capture.' },
      { title: 'Rx & loyalty in-flow', desc: 'Doctor + Rx number on prescription sales. Customer lookup, loyalty points.' },
    ],
    features: [
      'Fast barcode / QR code scanning', 'FEFO-based batch auto-selection',
      'Cash, Card, JazzCash, EasyPaisa & Bank Transfer', 'Transaction / reference ID for digital payments',
      'Customer lookup & loyalty points at checkout', 'Prescription sales with doctor & Rx number',
      'Discounts per item and on total', 'Tax (GST) per item or bill-wide',
      'Sale returns with inventory restock', 'FBR invoice auto-submission on every sale',
      'Thermal receipt printing', 'Partial payment & balance tracking',
    ],
  },
  {
    key: 'inventory',
    title: 'Inventory',
    tag: 'Zero stockouts. Zero waste.',
    icon: Package,
    accent: 'from-sky-400 to-blue-500',
    glow: 'shadow-blue-500/40',
    chip: 'bg-blue-500/10 text-blue-300 ring-blue-400/30',
    highlights: [
      { title: 'Multi-batch + FEFO engine', desc: 'Track every batch, sell oldest expiry first — automatically.' },
      { title: 'Expiry & reorder alerts', desc: 'Configurable lead times. Stop losing money to expired strips.' },
      { title: 'CSV in, CSV out', desc: 'Bulk import medicines, batches, prices. Export anything as a spreadsheet.' },
    ],
    features: [
      'Multi-batch inventory per medicine', 'FEFO (First Expiry First Out) engine',
      'Expiry alerts (configurable days ahead)', 'Reorder level & reorder quantity alerts',
      'Barcode & QR code per batch', 'Multi-unit support (strip, box, tablet, mg…)',
      'Medicine classification (OTC, Prescription, Controlled)', 'Substitute medicine linking',
      'Controlled schedule tracking', 'HS Code & FBR UOM per medicine',
      'CSV import & export for bulk operations', 'Real-time stock levels across branches',
    ],
  },
  {
    key: 'purchase',
    title: 'Purchase & Suppliers',
    tag: 'PO → GRN → Invoice. Tight.',
    icon: Truck,
    accent: 'from-violet-400 to-fuchsia-500',
    glow: 'shadow-violet-500/40',
    chip: 'bg-violet-500/10 text-violet-300 ring-violet-400/30',
    highlights: [
      { title: '3-way match workflow', desc: 'PO, GRN and supplier invoice reconciled — no surprises in your payables.' },
      { title: 'Credit terms & aged payables', desc: 'Auto due dates. See current vs 30/60/90 day buckets at a glance.' },
      { title: 'Supplier ledger', desc: 'Running balance, credit utilisation, payment history per supplier.' },
    ],
    features: [
      'Full PO → GRN → Invoice (3-way match) workflow', 'Supplier credit limits & payment terms',
      'Due dates auto-calculated from payment terms', 'Overdue PO highlighting & tracking',
      'Partial GRN (receive fewer than ordered)', 'Supplier invoice number capture',
      'MRP capture during goods receipt', 'Aged payables (Current, 1–30, 31–60, 61–90, 90+ days)',
      'Supplier ledger with running balance', 'Credit utilization progress bar',
      'Record supplier payments', 'Purchase price & discount per line item',
    ],
  },
  {
    key: 'fbr',
    title: 'FBR Compliance',
    tag: 'Submitted before they walk out.',
    icon: ShieldCheck,
    accent: 'from-amber-400 to-orange-500',
    glow: 'shadow-amber-500/40',
    chip: 'bg-amber-500/10 text-amber-300 ring-amber-400/30',
    highlights: [
      { title: 'PRAL DI API v1.12 compliant', desc: 'Built to the latest July-2025 spec — validate-first, sandbox scenarios, full error-code handling.' },
      { title: 'Sandbox onboarding included', desc: 'Pre-mapped to Retailer · Pharmaceuticals scenarios (SN008, SN025–SN028) so you can clear FBR onboarding fast.' },
      { title: 'AES-256 encrypted tokens', desc: 'PRAL bearer tokens are encrypted at rest. Submission queue retries with exponential backoff.' },
    ],
    features: [
      'PRAL Digital Invoicing API v1.12 integration', 'Validate-before-post flow per spec §4.2',
      'FBR-issued invoice number captured on every sale', 'QR code + FBR Digital Invoicing logo on receipts (§6)',
      'Debit-note flow for returns with invoiceRefNo', 'Reference-data lookups (provinces, HS codes, UoMs, SRO schedules)',
      'STATL & Get_Reg_Type buyer verification', 'Per-medicine HS Code, UoM, sale type & SRO mapping',
      'Sandbox scenarios SN008/SN025/SN026/SN027/SN028 mapped to drug categories', 'Full FBR error-code dictionary mapped to friendly messages',
      'AES-256-GCM bearer token encryption', 'Submission queue with retries, audit log per attempt',
    ],
  },
  {
    key: 'customers',
    title: 'Customers',
    tag: 'Patients, not rows.',
    icon: UserCheck,
    accent: 'from-rose-400 to-pink-500',
    glow: 'shadow-rose-500/40',
    chip: 'bg-rose-500/10 text-rose-300 ring-rose-400/30',
    highlights: [
      { title: 'Clinical profiles', desc: 'Allergies, medical history, CNIC, age — all where the cashier needs it.' },
      { title: 'Loyalty that actually loops', desc: 'Earn points at POS, see lifetime spend, walk-ins still tracked anonymously.' },
      { title: 'FBR-ready buyer data', desc: 'NTN, registration type and DOB captured at the right moment.' },
    ],
    features: [
      'Customer profiles (name, phone, CNIC, email)', 'Allergy & medical history notes',
      'Loyalty points earn & track', 'Total purchases history',
      'Date of birth & age tracking', 'FBR Registration Type (registered/unregistered)',
      'Buyer NTN for FBR compliance', 'Quick customer lookup at POS',
      'Walk-in (anonymous) sale support',
    ],
  },
  {
    key: 'reporting',
    title: 'Sales & Reporting',
    tag: 'Numbers you can act on.',
    icon: LineChart,
    accent: 'from-cyan-400 to-sky-500',
    glow: 'shadow-cyan-500/40',
    chip: 'bg-cyan-500/10 text-cyan-300 ring-cyan-400/30',
    highlights: [
      { title: 'Live dashboard', desc: 'Revenue, orders, gross profit and FBR submission status, refreshing in real time.' },
      { title: 'Salesman performance', desc: 'Who sold what, when, at what margin. Pay commission with confidence.' },
      { title: 'Full ledger export', desc: 'Every receipt, return and expense — exportable as CSV for your accountant.' },
    ],
    features: [
      'Live sales dashboard', 'Daily / weekly / monthly sales summaries',
      'Top medicines by revenue & quantity', 'Gross profit & margin tracking',
      'Sales by payment method breakdown', 'Salesman-wise performance',
      'Sale returns & refund reporting', 'Expense tracking & categorisation',
      'Ledger entries for full accounting trail', 'CSV export for all reports',
      'FBR submission status tracking',
    ],
  },
  {
    key: 'branches',
    title: 'Multi-Branch & Roles',
    tag: 'One brain. Every branch.',
    icon: Building2,
    accent: 'from-indigo-400 to-purple-500',
    glow: 'shadow-indigo-500/40',
    chip: 'bg-indigo-500/10 text-indigo-300 ring-indigo-400/30',
    highlights: [
      { title: '7 role-based identities', desc: 'Owner, Manager, Cashier, Salesman, Pharmacist, Accountant, Super Admin.' },
      { title: 'Granular permissions', desc: 'Per-module, per-action — exactly what each role can do and can\'t.' },
      { title: 'Branch-level data', desc: 'Sales, stock and users scoped to each branch under one account.' },
    ],
    features: [
      '7 user roles: Owner, Manager, Cashier, Salesman, Pharmacist, Accountant, Super Admin',
      'Granular per-module, per-action permissions', 'Branch-level user assignment',
      'Multiple branches under one account', 'Branch name, address, phone & email',
      'Branch-wise sales tracking', 'Secure JWT authentication',
      'Password change from profile', 'Last login tracking',
    ],
  },
  {
    key: 'webstore',
    title: 'Online Web Store',
    tag: 'Your pharmacy, online — overnight.',
    icon: Globe,
    accent: 'from-teal-400 to-emerald-500',
    glow: 'shadow-teal-500/40',
    chip: 'bg-teal-500/10 text-teal-300 ring-teal-400/30',
    highlights: [
      { title: 'Branded storefront', desc: 'Customer-facing pharmacy site. Toggle medicines webLive in one click.' },
      { title: 'COD + digital payments', desc: 'COD, JazzCash, EasyPaisa, Card — all accepted, all reconciled.' },
      { title: 'Order workflow', desc: 'Pending → Confirmed → Out for delivery → Delivered. Track every step.' },
    ],
    features: [
      'Branded online pharmacy storefront', 'Medicines marked webLive appear in store',
      'Customer order placement & tracking', 'Delivery fee configuration',
      'COD, JazzCash, EasyPaisa, Card payments', 'Order status workflow (Pending → Delivered)',
      'Customer name, address, city capture', 'Web order management dashboard',
    ],
  },
  {
    key: 'platform',
    title: 'SaaS Platform',
    tag: 'Built like a real product.',
    icon: Cpu,
    accent: 'from-slate-400 to-zinc-500',
    glow: 'shadow-slate-500/40',
    chip: 'bg-slate-400/10 text-slate-300 ring-slate-400/30',
    highlights: [
      { title: 'Self-service signup', desc: 'Public registration at pos.kynexsolutions.com with a 30-day trial.' },
      { title: 'Email + WhatsApp billing', desc: 'Invoices delivered both ways. Reminders before suspension.' },
      { title: 'Super admin console', desc: 'Manage every tenant, plan, suspension and stat from one screen.' },
    ],
    features: [
      'Self-service public signup at pos.kynexsolutions.com', '30-day free trial for every new pharmacy',
      'Email onboarding via Resend (password setup link)', 'SaaS admin dashboard for all tenants',
      'Tenant status management (Trial / Active / Suspended)', 'Plan & pricing management per tenant',
      'Send invoices via email (Resend)', 'Send invoices via WhatsApp (ycloud API)',
      'Trial expiry warning emails', 'Account suspension email notifications',
      'Platform stats (total / trial / active / suspended)', 'Demo environment at /demo',
    ],
  },
];

const VALUE_PROPS = [
  {
    icon: ShieldCheck,
    title: 'FBR-certified from day one',
    desc: 'Every sale auto-submits. QR & barcode print. Returns reconcile. AES-256 encrypted tokens.',
    accent: 'from-amber-400 to-orange-500',
  },
  {
    icon: Activity,
    title: 'Real-time, not eventually',
    desc: 'Sales, stock and FBR status update across branches the moment they happen.',
    accent: 'from-emerald-400 to-teal-500',
  },
  {
    icon: Boxes,
    title: 'FEFO batch engine',
    desc: 'Oldest expiry sells first — automatically. No spoilage, no manual sorting.',
    accent: 'from-cyan-400 to-blue-500',
  },
  {
    icon: Globe,
    title: 'Web store, included',
    desc: 'A branded online pharmacy with COD + digital payments, ready overnight.',
    accent: 'from-teal-400 to-emerald-500',
  },
  {
    icon: Building2,
    title: 'Multi-branch, single brain',
    desc: 'One login, every outlet. Role-based access per branch, per module, per action.',
    accent: 'from-indigo-400 to-violet-500',
  },
  {
    icon: Stethoscope,
    title: 'Pharmacy-native',
    desc: 'Allergies, prescriptions, controlled schedules, substitutes — built for chemists, not generic retail.',
    accent: 'from-rose-400 to-pink-500',
  },
];

const SALES_WHATSAPP = '923189540997';

const PLANS = [
  {
    name: 'Starter',
    blurb: 'For single-branch pharmacies starting clean.',
    monthly: 1500,
    yearly: 12000,
    features: [
      '1 Branch / Store', 'Unlimited Users', 'POS & Inventory',
      'Sales Reports', 'Customer Management', 'Email Support',
    ],
  },
  {
    name: 'Multi-Branch',
    blurb: 'Most pharmacies pick this. FBR, web store, every module.',
    monthly: 1500,
    yearly: 12000,
    addonMonthly: 1275,
    addonYearly: 10200,
    highlight: true,
    badge: 'Most Popular',
    features: [
      '1 Branch + Add Branches', 'Each Additional Branch: PKR 1,275/mo or 10,200/yr (15% off)',
      'FBR Integration', 'Purchase & Supplier Module',
      'Online Web Store', 'WhatsApp Notifications', 'Priority Support',
    ],
  },
  {
    name: 'Enterprise',
    blurb: 'Chains, hospitals, large operations. We build around you.',
    custom: true,
    features: [
      'Unlimited Branches', 'Custom integrations', 'Dedicated account manager',
      'On-site training', 'SLA + 24/7 support', 'Custom contract & billing',
    ],
  },
];

const STEPS = [
  { step: '01', title: 'Sign up free', desc: 'Register your pharmacy in under 2 minutes. No card needed.', icon: Sparkles },
  { step: '02', title: 'Set your password', desc: 'Secure setup link in your inbox via Resend.', icon: Lock },
  { step: '03', title: 'Onboard your team', desc: 'Add staff, medicines, branches — we guide you through each step.', icon: Users },
  { step: '04', title: 'Start selling', desc: 'Go live instantly. Sell. Restock. Submit to FBR. Grow.', icon: TrendingUp },
];

const TESTIMONIALS = [
  { name: 'Ali Hassan',       pharmacy: 'Al-Shifa Pharmacy, Lahore',      stars: 5, text: 'The expiry alerts alone have saved us thousands every quarter. We finally stopped pulling expired strips off the shelf manually.' },
  { name: 'Dr. Fatima Malik', pharmacy: 'City Medical Store, Karachi',     stars: 5, text: 'FBR integration was the part I was dreading. It just… works. Invoices submit automatically, the QR prints, we move on.' },
  { name: 'Zubair Ahmed',     pharmacy: 'Medicare Plus, Islamabad',        stars: 5, text: 'Managing three branches from one dashboard is the whole reason we switched. The supplier ledger is dead accurate.' },
  { name: 'Sana Iqbal',       pharmacy: 'Family Care Pharmacy, Faisalabad',stars: 5, text: 'The online store sold our first 30 deliveries in the first week. Setup felt like a weekend project, not a project.' },
  { name: 'Imran Tariq',      pharmacy: 'Healthline Chemists, Multan',     stars: 5, text: 'POS is fast even with a long bill. Cashiers learned it in a day. Receipts look proper, customers trust them.' },
];

const totalFeatures = FEATURE_SECTIONS.reduce((s, sec) => s + sec.features.length, 0);

// ─── Motion utilities ────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] } },
};
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : 'hidden'}
      animate={inView ? 'show' : 'hidden'}
      variants={fadeUp}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function CountUp({ to, suffix = '', renderer, duration = 1.6 }: { to: number; suffix?: string; renderer?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [val, setVal] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView) return;
    if (reduce) { setVal(to); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduce]);
  return <span ref={ref}>{renderer ? renderer(val) : `${val.toLocaleString()}${suffix}`}</span>;
}

// 3D tilt hook — mouse-driven rotateX/rotateY with spring
function useTilt(max = 12) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduce = useReducedMotion();
  const rotateX = useSpring(useTransform(y, [-50, 50], [max, -max]), { stiffness: 200, damping: 18 });
  const rotateY = useSpring(useTransform(x, [-50, 50], [-max, max]), { stiffness: 200, damping: 18 });
  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set(((e.clientX - r.left) / r.width  - 0.5) * 100);
    y.set(((e.clientY - r.top)  / r.height - 0.5) * 100);
  };
  const onLeave = () => { x.set(0); y.set(0); };
  return { rotateX, rotateY, onMove, onLeave };
}

// ─── Background: animated mesh gradient + grid ──────────────────────────────

function HeroBackdrop() {
  const reduce = useReducedMotion();
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* radial mesh blobs */}
      <motion.div
        animate={reduce ? undefined : { x: [0, 60, -20, 0], y: [0, -40, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-32 -left-20 w-[42rem] h-[42rem] rounded-full bg-emerald-500/30 blur-[120px]"
      />
      <motion.div
        animate={reduce ? undefined : { x: [0, -50, 30, 0], y: [0, 40, -20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-20 -right-32 w-[42rem] h-[42rem] rounded-full bg-cyan-500/25 blur-[120px]"
      />
      <motion.div
        animate={reduce ? undefined : { x: [0, 30, -40, 0], y: [0, 30, 20, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-0 left-1/3 w-[36rem] h-[36rem] rounded-full bg-teal-400/20 blur-[120px]"
      />
      {/* grid */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse at center, black 35%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 35%, transparent 85%)',
        }}
      />
      {/* noise */}
      <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
           style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%22100%22 height=%22100%22 filter=%22url(%23n)%22 opacity=%220.6%22/></svg>")' }}
      />
    </div>
  );
}

// ─── 3D Hero device ─────────────────────────────────────────────────────────

function HeroDevice() {
  const { rotateX, rotateY, onMove, onLeave } = useTilt(8);
  const reduce = useReducedMotion();
  return (
    <motion.div
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      initial={reduce ? false : { opacity: 0, y: 60, rotateX: 18 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1, delay: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
      className="relative mx-auto mt-20 max-w-5xl"
      style={{ perspective: 1600 }}
    >
      {/* underglow */}
      <div className="absolute -inset-x-12 -bottom-12 h-40 bg-gradient-to-r from-emerald-500/30 via-teal-500/40 to-cyan-500/30 blur-3xl rounded-[100%] pointer-events-none" />

      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="relative rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl shadow-[0_40px_120px_-20px_rgba(16,185,129,0.45)] overflow-hidden"
      >
        {/* chrome bar */}
        <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 text-[11px] text-zinc-400 font-mono">pos.kynexsolutions.com</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-400/30 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> FBR live
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
          {/* sidebar */}
          <div className="hidden md:flex md:col-span-3 flex-col gap-1 border-r border-white/5 p-3 bg-white/[0.02]">
            {[
              { i: BarChart3, l: 'Dashboard', a: true },
              { i: Receipt,   l: 'POS' },
              { i: Package,   l: 'Inventory' },
              { i: Truck,     l: 'Suppliers' },
              { i: UserCheck, l: 'Customers' },
              { i: ShieldCheck, l: 'FBR' },
              { i: Globe,     l: 'Web Store' },
            ].map(({ i: Ic, l, a }) => (
              <div key={l} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${a ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 font-semibold' : 'text-zinc-400'}`}>
                <Ic className="w-3.5 h-3.5" />
                <span>{l}</span>
              </div>
            ))}
          </div>

          {/* main */}
          <div className="md:col-span-9 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Today's overview</p>
                <p className="text-lg font-bold text-white">Live Pharmacy Operations</p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs">
                <span className="text-zinc-500">Branch:</span>
                <span className="px-2 py-1 rounded-md bg-white/5 text-zinc-200 font-semibold">Lahore — Gulberg</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { l: 'Revenue', v: 184230, c: 'text-emerald-300', dot: 'bg-emerald-400' },
                { l: 'Orders',  v: 127,    c: 'text-sky-300',     dot: 'bg-sky-400' },
                { l: 'Profit',  v: 42180,  c: 'text-violet-300',  dot: 'bg-violet-400' },
              ].map(({ l, v, c, dot }) => (
                <div key={l} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{l}
                  </div>
                  <p className={`text-base font-extrabold ${c}`}>
                    <CountUp to={v} />
                  </p>
                </div>
              ))}
            </div>

            {/* chart */}
            <div className="flex items-end justify-between gap-1.5 h-28 mb-3">
              {[28, 44, 36, 60, 48, 72, 90, 66, 80, 96, 78, 110, 88, 102].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 4, opacity: 0 }}
                  animate={{ height: h, opacity: 1 }}
                  transition={{ delay: 0.7 + i * 0.04, duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-500 via-emerald-400 to-cyan-300 shadow-[0_0_18px_rgba(52,211,153,0.4)]"
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-600">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* floating chips */}
      <motion.div
        initial={{ opacity: 0, x: 30, y: 20 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1.1, duration: 0.7 }}
        className="hidden md:flex absolute -right-6 top-20 items-start gap-2 bg-zinc-900/90 backdrop-blur ring-1 ring-emerald-400/30 rounded-xl px-3 py-2.5 max-w-[230px] shadow-2xl"
        style={{ transform: 'translateZ(40px)' }}
      >
        <div className="w-9 h-9 rounded-lg bg-emerald-500/20 ring-1 ring-emerald-400/30 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4 h-4 text-emerald-300" />
        </div>
        <div>
          <p className="text-xs font-bold text-white">FBR Invoice Submitted</p>
          <p className="text-[11px] text-zinc-400">Ref #INV-218903 · 1.2s</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -30, y: 20 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 1.3, duration: 0.7 }}
        className="hidden md:flex absolute -left-6 bottom-16 items-start gap-2 bg-zinc-900/90 backdrop-blur ring-1 ring-amber-400/30 rounded-xl px-3 py-2.5 max-w-[230px] shadow-2xl"
        style={{ transform: 'translateZ(40px)' }}
      >
        <div className="w-9 h-9 rounded-lg bg-amber-500/15 ring-1 ring-amber-400/30 flex items-center justify-center flex-shrink-0">
          <Bell className="w-4 h-4 text-amber-300" />
        </div>
        <div>
          <p className="text-xs font-bold text-white">Low stock alert</p>
          <p className="text-[11px] text-zinc-400">Panadol Extra · 3 strips left</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── 3D Tilt card (value props bento) ──────────────────────────────────────

function TiltCard({ icon: Icon, title, desc, accent }: { icon: any; title: string; desc: string; accent: string }) {
  const { rotateX, rotateY, onMove, onLeave } = useTilt(8);
  return (
    <motion.div
      variants={fadeUp}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ perspective: 900 }}
      className="group relative"
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="relative h-full rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur p-6 overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] hover:border-white/20 transition-colors"
      >
        {/* gradient glow */}
        <div className={`absolute -top-12 -right-12 w-44 h-44 rounded-full opacity-30 group-hover:opacity-50 transition-opacity bg-gradient-to-br ${accent} blur-3xl`} />
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-gradient-to-br ${accent} shadow-lg`} style={{ transform: 'translateZ(20px)' }}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2 tracking-tight" style={{ transform: 'translateZ(15px)' }}>{title}</h3>
        <p className="text-zinc-400 text-sm leading-relaxed" style={{ transform: 'translateZ(10px)' }}>{desc}</p>
      </motion.div>
    </motion.div>
  );
}

// ─── Module Showcase ────────────────────────────────────────────────────────

function ModuleShowcase() {
  const [active, setActive] = useState(FEATURE_SECTIONS[0].key);
  const [expanded, setExpanded] = useState(false);
  const current = FEATURE_SECTIONS.find((s) => s.key === active)!;
  const Icon = current.icon;
  const { rotateX, rotateY, onMove, onLeave } = useTilt(6);
  return (
    <div>
      {/* Tab strip */}
      <div className="relative overflow-x-auto mb-10 -mx-6 px-6 scrollbar-none">
        <div className="flex gap-2 min-w-max">
          {FEATURE_SECTIONS.map((s) => {
            const Ic = s.icon;
            const isActive = active === s.key;
            return (
              <button
                key={s.key}
                onClick={() => { setActive(s.key); setExpanded(false); }}
                className={`relative inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="module-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    className={`absolute inset-0 rounded-full bg-gradient-to-r ${current.accent} shadow-lg ${current.glow}`}
                  />
                )}
                <Ic className="w-4 h-4 relative" />
                <span className="relative">{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Showcase grid */}
      <div className="grid lg:grid-cols-5 gap-10 items-start">
        {/* Preview */}
        <div className="lg:col-span-3" style={{ perspective: 1400 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={current.key}
              onMouseMove={onMove}
              onMouseLeave={onLeave}
              initial={{ opacity: 0, y: 20, rotateX: 8 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
              style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
              className="relative rounded-3xl border border-white/10 bg-zinc-900/70 backdrop-blur p-8 overflow-hidden shadow-2xl"
            >
              {/* big glow */}
              <div className={`absolute -top-24 -left-16 w-80 h-80 rounded-full opacity-40 bg-gradient-to-br ${current.accent} blur-3xl`} />
              <div className={`absolute -bottom-24 -right-16 w-80 h-80 rounded-full opacity-20 bg-gradient-to-br ${current.accent} blur-3xl`} />

              <div className="relative" style={{ transform: 'translateZ(40px)' }}>
                <div className={`inline-flex items-center gap-2 ring-1 ${current.chip} rounded-full px-2.5 py-1 text-[11px] font-semibold mb-6`}>
                  <Layers className="w-3 h-3" /> Module {FEATURE_SECTIONS.findIndex(s => s.key === current.key) + 1} / {FEATURE_SECTIONS.length}
                </div>
                <div className="flex items-start gap-5">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${current.accent} flex items-center justify-center shadow-xl ${current.glow}`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-extrabold text-white tracking-tight">{current.title}</h3>
                    <p className="text-zinc-400 mt-1">{current.tag}</p>
                  </div>
                </div>

                {/* Mini "screen" preview */}
                <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-2.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400/70" />
                    <span className="w-2 h-2 rounded-full bg-amber-400/70" />
                    <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
                    <span className="ml-3 text-[10px] text-zinc-500 font-mono">/{current.key}</span>
                  </div>
                  <div className="p-5 grid grid-cols-3 gap-3">
                    {[0,1,2].map((i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.08 }}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                      >
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${current.accent} mb-2 flex items-center justify-center`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="h-1.5 w-3/4 rounded bg-white/15 mb-1.5" />
                        <div className="h-1.5 w-1/2 rounded bg-white/10" />
                      </motion.div>
                    ))}
                    <div className="col-span-3 flex items-end gap-1.5 h-20 mt-1">
                      {[38, 56, 44, 70, 58, 82, 64, 96, 76, 110, 88].map((h, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: 4 }}
                          animate={{ height: h }}
                          transition={{ delay: 0.3 + i * 0.04, duration: 0.5 }}
                          className={`flex-1 rounded-t bg-gradient-to-t ${current.accent} opacity-90`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Highlights + all features */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4 }}
            >
              <p className="text-zinc-500 text-sm font-semibold uppercase tracking-widest mb-3">What you get</p>
              <ul className="space-y-5 mb-6">
                {current.highlights.map((h, i) => (
                  <motion.li
                    key={h.title}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className="flex items-start gap-3"
                  >
                    <div className={`mt-0.5 w-7 h-7 rounded-lg bg-gradient-to-br ${current.accent} flex items-center justify-center flex-shrink-0`}>
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-bold">{h.title}</p>
                      <p className="text-zinc-400 text-sm leading-relaxed mt-0.5">{h.desc}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>

              <button
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-emerald-300 transition-colors"
              >
                <motion.span animate={{ rotate: expanded ? 45 : 0 }} transition={{ duration: 0.2 }}>
                  <Plus className="w-4 h-4" />
                </motion.span>
                {expanded ? 'Hide full list' : `See all ${current.features.length} features`}
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35 }}
                    className="mt-5 grid grid-cols-1 gap-2 overflow-hidden"
                  >
                    {current.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Marquee testimonials ───────────────────────────────────────────────────

function TestimonialMarquee() {
  const reduce = useReducedMotion();
  const row = [...TESTIMONIALS, ...TESTIMONIALS];
  return (
    <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
      <motion.div
        animate={reduce ? undefined : { x: ['0%', '-50%'] }}
        transition={{ duration: 50, repeat: Infinity, ease: 'linear' }}
        className="flex gap-6 w-max"
      >
        {row.map((t, i) => (
          <div
            key={i}
            className="w-[360px] rounded-2xl border border-white/10 bg-zinc-900/70 backdrop-blur p-6 flex-shrink-0"
          >
            <Quote className="w-5 h-5 text-emerald-400 mb-3" />
            <div className="flex gap-0.5 mb-3">
              {Array.from({ length: t.stars }).map((_, j) => (
                <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <p className="text-zinc-200 leading-relaxed mb-5 text-[15px]">{t.text}</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold ring-2 ring-white/10">
                {t.name.split(' ').slice(0, 2).map(n => n[0]).join('')}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{t.name}</p>
                <p className="text-zinc-500 text-xs">{t.pharmacy}</p>
              </div>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Pricing ────────────────────────────────────────────────────────────────

function PricingGrid() {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  return (
    <>
      <div className="flex justify-center mb-12">
        <div className="inline-flex bg-zinc-900/70 backdrop-blur rounded-xl p-1 ring-1 ring-white/10">
          {(['monthly', 'yearly'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setCycle(opt)}
              className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${cycle === opt ? 'text-zinc-900' : 'text-zinc-300'}`}
            >
              {cycle === opt && (
                <motion.span
                  layoutId="cycle-pill"
                  className="absolute inset-0 bg-white shadow rounded-lg"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative">
                {opt === 'monthly' ? 'Monthly' : <>Yearly <span className="text-xs ml-1 text-emerald-600">save 23%</span></>}
              </span>
            </button>
          ))}
        </div>
      </div>
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="grid md:grid-cols-3 gap-6 items-stretch"
      >
        {PLANS.map((p) => {
          const isEnterprise = p.custom;
          const price = cycle === 'monthly' ? p.monthly : p.yearly;
          return (
            <motion.div
              key={p.name}
              variants={fadeUp}
              whileHover={{ y: -8 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className={`relative rounded-3xl p-8 border ${
                p.highlight
                  ? 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 border-emerald-500/50 shadow-2xl shadow-emerald-500/30 text-white md:scale-[1.03]'
                  : 'bg-zinc-900/60 backdrop-blur border-white/10 hover:border-white/20'
              }`}
            >
              {p.highlight && (
                <>
                  <div className="absolute -inset-px rounded-3xl ring-1 ring-white/20 pointer-events-none" />
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-white text-emerald-700 border-0 shadow-lg">
                      <Sparkles className="w-3 h-3 mr-1" /> {p.badge}
                    </Badge>
                  </div>
                </>
              )}
              <p className={`text-xl font-bold mb-1 ${p.highlight ? 'text-white' : 'text-white'}`}>{p.name}</p>
              <p className={`text-sm mb-6 ${p.highlight ? 'text-emerald-100' : 'text-zinc-400'}`}>{p.blurb}</p>
              <div className="mb-7">
                {isEnterprise ? (
                  <span className="text-4xl font-extrabold text-white">Let's talk</span>
                ) : (
                  <>
                    <span className="text-5xl font-extrabold text-white">PKR {price?.toLocaleString()}</span>
                    <span className={`text-sm ml-1 ${p.highlight ? 'text-emerald-100' : 'text-zinc-400'}`}>
                      /{cycle === 'monthly' ? 'mo' : 'yr'}
                    </span>
                  </>
                )}
              </div>
              <ul className="space-y-3 mb-8">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${p.highlight ? 'text-emerald-100' : 'text-emerald-400'}`} />
                    <span className={`text-sm ${p.highlight ? 'text-emerald-50' : 'text-zinc-300'}`}>{f}</span>
                  </li>
                ))}
              </ul>
              {isEnterprise ? (
                <a href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent('Hi, I am interested in the Enterprise plan for Kynex Pharmacloud.')}`} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full bg-white text-zinc-900 hover:bg-zinc-100">Contact Sales</Button>
                </a>
              ) : (
                <Link to="/signup">
                  <Button className={`w-full ${p.highlight ? 'bg-white text-emerald-700 hover:bg-emerald-50' : 'bg-emerald-500 hover:bg-emerald-400 text-white'}`}>
                    Start Free Trial
                  </Button>
                </Link>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
}

// ─── Floating 3D orb decoration (for hero & CTA) ───────────────────────────

function Orb({ className = '', size = 320, accent = 'from-emerald-400 to-teal-500' }: { className?: string; size?: number; accent?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`pointer-events-none absolute rounded-full ${className}`}
      style={{ width: size, height: size }}
      animate={reduce ? undefined : { y: [0, -16, 0], rotate: [0, 6, 0] }}
      transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${accent} blur-2xl opacity-40`} />
      <div className={`absolute inset-2 rounded-full bg-gradient-to-br ${accent} opacity-80 shadow-2xl`} />
      <div className="absolute inset-6 rounded-full bg-gradient-to-br from-white/40 to-transparent mix-blend-overlay" />
      <div className="absolute left-[18%] top-[14%] w-[28%] h-[28%] rounded-full bg-white/40 blur-md" />
    </motion.div>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────────────────

export default function Landing() {
  const { scrollYProgress } = useScroll();
  const progressScaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased overflow-x-hidden">
      {/* scroll progress */}
      <motion.div
        style={{ scaleX: progressScaleX }}
        className="fixed top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 origin-left z-[60]"
      />

      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-zinc-950/70 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="relative w-9 h-9">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500" />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 blur-md opacity-50" />
              <div className="relative w-9 h-9 rounded-xl flex items-center justify-center">
                <Pill className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="leading-tight">
              <p className="font-bold text-white tracking-tight">Kynex Pharmacloud</p>
              <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest">POS · FBR · WEB</p>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <a href="#why" className="hover:text-white transition-colors">Why</a>
            <a href="#modules" className="hover:text-white transition-colors">Modules</a>
            <a href="#fbr" className="hover:text-white transition-colors">FBR</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#reviews" className="hover:text-white transition-colors">Reviews</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/demo" className="hidden sm:block">
              <Button variant="ghost" size="sm" className="text-zinc-300 hover:text-white hover:bg-white/5">Live Demo</Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-zinc-300 hover:text-white hover:bg-white/5">Log In</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold shadow-lg shadow-emerald-500/30">
                Start Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative pt-24 pb-20">
        <HeroBackdrop />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 bg-white/5 ring-1 ring-white/10 backdrop-blur mb-7"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-xs font-semibold tracking-wide text-zinc-300">
                🇵🇰 Built for Pakistan · FBR-certified integration
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.05 }}
              className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.02] text-white mb-6"
            >
              The operating system for{' '}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                  modern pharmacies
                </span>
                <motion.svg
                  viewBox="0 0 320 14" className="absolute -bottom-2 left-0 w-full h-3 text-emerald-400"
                  fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  transition={{ delay: 1, duration: 1, ease: 'easeOut' }}
                >
                  <motion.path d="M3 10 C 90 2, 180 2, 318 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </motion.svg>
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.18 }}
              className="text-xl text-zinc-400 leading-relaxed mb-2 max-w-2xl mx-auto"
            >
              From FEFO inventory to FBR digital invoicing — Kynex Pharmacloud unifies <span className="text-zinc-200 font-medium">POS, purchase, suppliers, customers, branches</span> and a customer-facing <span className="text-zinc-200 font-medium">web store</span>. One platform. Every pharmacy decision.
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.32 }}
              className="text-sm text-emerald-400 font-mono font-semibold mb-10"
            >
              {totalFeatures}+ features · {FEATURE_SECTIONS.length} modules · 30-day free trial
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-3 justify-center"
            >
              <Link to="/signup">
                <Button size="lg" className="group bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-base font-semibold px-8 py-6 rounded-xl shadow-lg shadow-emerald-500/40">
                  Start 30-day free trial
                  <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link to="/demo">
                <Button size="lg" variant="outline" className="text-base px-8 py-6 rounded-xl border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10 hover:text-white">
                  Try Live Demo
                </Button>
              </Link>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.55 }}
              className="mt-5 text-xs text-zinc-500"
            >
              No credit card · Setup in 2 minutes · Cancel anytime
            </motion.p>
          </div>

          <HeroDevice />

          {/* Stats strip */}
          <Reveal>
            <div className="mt-20 max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Modules',        v: FEATURE_SECTIONS.length, sfx: '' },
                { label: 'Total features', v: totalFeatures,           sfx: '+' },
                { label: 'User roles',     v: 7,                       sfx: '' },
                { label: 'Free trial',     v: 30,                      sfx: ' days' },
              ].map(({ label, v, sfx }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-5 text-center">
                  <p className="text-4xl font-extrabold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">
                    <CountUp to={v} suffix={sfx} />
                  </p>
                  <p className="text-[11px] mt-1 font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* TRUST */}
      <section className="py-12 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-6 text-center">
            Trusted by pharmacies across Pakistan
          </p>
          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4"
          >
            {[
              { n: 'Al-Shifa Medical',   i: BadgeCheck },
              { n: 'City Pharmacy',      i: Cross },
              { n: 'Medicare Plus',      i: Plus },
              { n: 'Health Hub',         i: Stethoscope },
              { n: 'PharmaCare',         i: Pill },
              { n: 'CarePoint Chemists', i: BadgeCheck },
            ].map(({ n, i: Ic }) => (
              <div key={n} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <Ic className="w-4 h-4" />
                <span className="text-sm font-semibold tracking-tight">{n}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* VALUE PROPS BENTO */}
      <section id="why" className="relative py-28">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Orb className="-top-32 -left-32" size={500} accent="from-emerald-500/30 to-teal-500/30" />
          <Orb className="bottom-0 -right-32" size={500} accent="from-cyan-500/30 to-blue-500/30" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-16">
            <p className="text-emerald-400 text-sm font-mono font-semibold uppercase tracking-widest mb-4">Why Pharmacloud</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-5 max-w-3xl mx-auto leading-[1.05]">
              Built specifically for the way Pakistani pharmacies actually run.
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Not a generic retail POS retrofitted for chemists. Every feature was shaped by what counter staff, owners and accountants told us they need.
            </p>
          </Reveal>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {VALUE_PROPS.map((v) => (
              <TiltCard key={v.title} {...v} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* MODULE SHOWCASE */}
      <section id="modules" className="relative py-28 border-t border-white/5">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 opacity-40"
               style={{
                 backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(16,185,129,0.18) 0px, transparent 40%), radial-gradient(circle at 80% 80%, rgba(34,211,238,0.14) 0px, transparent 40%)',
               }}
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-14">
            <p className="text-emerald-400 text-sm font-mono font-semibold uppercase tracking-widest mb-4">Modules</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-5 max-w-3xl mx-auto leading-[1.05]">
              Nine modules. One pharmacy.
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Pick a module to see what it does. {totalFeatures}+ features under the hood — but you only see what you need, when you need it.
            </p>
          </Reveal>

          <ModuleShowcase />
        </div>
      </section>

      {/* FBR SECTION */}
      <section id="fbr" className="relative py-28 overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/60 via-zinc-950 to-amber-950/40" />
        <div className="absolute inset-0 pointer-events-none">
          <Orb className="top-10 -right-32" size={520} accent="from-amber-400/50 to-orange-500/40" />
          <Orb className="-bottom-20 -left-20" size={420} accent="from-emerald-400/40 to-teal-500/30" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-amber-500/10 ring-1 ring-amber-400/30 mb-6">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-xs font-semibold text-amber-200 uppercase tracking-widest">FBR Compliance</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-6 leading-[1.05]">
                Built to PRAL DI API v1.12.<br />
                <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">Sandbox-tested. Production-ready.</span>
              </h2>
              <p className="text-lg text-zinc-300 leading-relaxed mb-8">
                Kynex Pharmacloud is engineered to the latest FBR Digital Invoicing specification
                (Technical Spec v1.12, 24-Jul-2025). Once your PRAL bearer token is configured
                and your medicines are mapped to FBR sale-types, each sale validates against
                FBR and posts in real time. Returns flow as debit notes with the original invoice
                reference.
              </p>
              <ul className="space-y-3">
                {[
                  'PRAL Digital Invoicing API v1.12 (validate + post)',
                  'FBR-issued invoice number + QR code on every receipt (§6)',
                  'Reference-data lookups: provinces, HS codes, UoMs, SRO schedules',
                  'Buyer verification via STATL & Get_Reg_Type',
                  'Debit-note flow for returns with invoiceRefNo (§4 / err 0026)',
                  'AES-256-GCM bearer token encryption',
                  'Retry queue with exponential backoff for failed submissions',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-zinc-200">
                    <div className="w-5 h-5 rounded-md bg-amber-500/20 ring-1 ring-amber-400/30 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-3 h-3 text-amber-300" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.1}>
              <FBRLiveCard />
            </Reveal>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative py-28 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-16">
            <p className="text-emerald-400 text-sm font-mono font-semibold uppercase tracking-widest mb-4">Onboarding</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-5 max-w-3xl mx-auto leading-[1.05]">
              Live in minutes. Not weeks.
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              No installers. No IT visits. No technical knowledge required.
            </p>
          </Reveal>

          <div className="relative">
            {/* connecting line */}
            <div className="absolute top-7 left-[12%] right-[12%] h-px hidden md:block">
              <div className="w-full h-full bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
            </div>
            <motion.div
              variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
              className="grid grid-cols-1 md:grid-cols-4 gap-8 relative"
            >
              {STEPS.map(({ step, title, desc, icon: Ic }) => (
                <motion.div key={step} variants={fadeUp} className="relative text-center">
                  <div className="relative inline-block mb-5">
                    <div className="absolute -inset-4 rounded-full bg-emerald-500/20 blur-2xl" />
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-500/30">
                      <Ic className="w-6 h-6 text-zinc-950" />
                    </div>
                    <span className="absolute -top-2 -right-2 text-[10px] font-mono font-bold text-emerald-300 bg-zinc-950 ring-1 ring-emerald-400/40 rounded-full px-1.5 py-0.5">
                      {step}
                    </span>
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2 tracking-tight">{title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="reviews" className="relative py-28 border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-14">
            <p className="text-emerald-400 text-sm font-mono font-semibold uppercase tracking-widest mb-4">Testimonials</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-5 max-w-3xl mx-auto leading-[1.05]">
              Loved by pharmacists who've seen everything.
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              From Lahore to Karachi — pharmacies running Kynex Pharmacloud at the counter every day.
            </p>
          </Reveal>
        </div>
        <TestimonialMarquee />
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative py-28 border-t border-white/5">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Orb className="-top-32 left-1/2 -translate-x-1/2" size={620} accent="from-emerald-500/20 to-teal-500/15" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <Reveal className="text-center mb-12">
            <p className="text-emerald-400 text-sm font-mono font-semibold uppercase tracking-widest mb-4">Pricing</p>
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-5 max-w-3xl mx-auto leading-[1.05]">
              Simple, honest pricing.
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Every plan includes a 30-day free trial. No setup fees. No hidden charges.
            </p>
          </Reveal>

          <PricingGrid />

          {/* Contact strip */}
          <Reveal className="mt-16 rounded-3xl border border-white/10 bg-zinc-900/60 backdrop-blur p-8 md:p-10 flex flex-col md:flex-row items-center gap-6 justify-between">
            <div className="text-center md:text-left">
              <h3 className="text-2xl font-bold text-white mb-1">Need something custom?</h3>
              <p className="text-zinc-400">Chain pharmacies, hospitals, custom integrations — we'll build around your operation.</p>
            </div>
            <a href={`https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent('Hi Kynex Solutions, I want to discuss Kynex Pharmacloud for my pharmacy.')}`} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="group bg-white text-zinc-900 hover:bg-zinc-100 text-base font-semibold px-7 py-6 rounded-xl">
                Talk to sales on WhatsApp
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            </a>
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative py-32 overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-emerald-950/40 to-zinc-950" />
        <div className="absolute inset-0 pointer-events-none">
          <Orb className="top-10 -left-32" size={520} accent="from-emerald-500/50 to-teal-500/40" />
          <Orb className="bottom-10 -right-20" size={460} accent="from-cyan-500/30 to-blue-500/30" />
        </div>
        <Reveal className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex relative mb-7">
            <div className="absolute inset-0 rounded-3xl bg-emerald-500/40 blur-3xl" />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-2xl shadow-emerald-500/40">
              <Zap className="w-10 h-10 text-zinc-950" />
            </div>
          </div>
          <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.02]">
            Run a pharmacy that<br />
            <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">actually flows.</span>
          </h2>
          <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">
            Stop fighting your POS. Stop chasing FBR. Stop losing strips to expiry.<br />
            Start a 30-day free trial and see what your pharmacy looks like on Pharmacloud.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup">
              <Button size="lg" className="group bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-base font-semibold px-10 py-7 rounded-xl shadow-lg shadow-emerald-500/40">
                Start free trial
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/demo">
              <Button size="lg" variant="outline" className="text-base px-10 py-7 rounded-xl border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10 hover:text-white">
                Try Live Demo
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-xs text-zinc-500">Setup in 2 minutes · FBR-ready out of the box · Runs in your browser</p>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-14 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-5 gap-10 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                  <Pill className="w-4 h-4 text-zinc-950" />
                </div>
                <p className="font-bold text-white tracking-tight">Kynex Pharmacloud</p>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
                Pakistan's most advanced pharmacy management platform. FBR-compliant, cloud-based, and engineered for chemists.
              </p>
              <div className="flex items-center gap-3 mt-5 text-xs text-zinc-500">
                <Cloud className="w-3.5 h-3.5" />
                <span>Hosted in the cloud · No installer required</span>
              </div>
            </div>
            <div>
              <p className="text-white font-semibold mb-4 text-sm">Product</p>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li><a href="#modules" className="hover:text-white transition-colors">All Modules</a></li>
                <li><a href="#fbr" className="hover:text-white transition-colors">FBR Integration</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><Link to="/demo" className="hover:text-white transition-colors">Live Demo</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-white font-semibold mb-4 text-sm">Company</p>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li><a href="https://kynexsolutions.com" className="hover:text-white transition-colors">Kynex Solutions</a></li>
                <li><a href="mailto:support@kynexsolutions.com" className="hover:text-white transition-colors">support@kynexsolutions.com</a></li>
                <li><a href={`https://wa.me/${SALES_WHATSAPP}`} className="hover:text-white transition-colors">WhatsApp Sales</a></li>
              </ul>
            </div>
            <div>
              <p className="text-white font-semibold mb-4 text-sm">Account</p>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li><Link to="/login" className="hover:text-white transition-colors">Log In</Link></li>
                <li><Link to="/signup" className="hover:text-white transition-colors">Sign Up Free</Link></li>
                <li><Link to="/demo" className="hover:text-white transition-colors">Try Demo</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-zinc-500">
            <p>© {new Date().getFullYear()} Kynex Solutions. All rights reserved.</p>
            <p className="font-mono">
              <a href="https://kynexsolutions.com" className="hover:text-zinc-300 transition-colors">kynexsolutions.com</a>
              {' · '}
              <a href="mailto:support@kynexsolutions.com" className="hover:text-zinc-300 transition-colors">contact</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── FBR Live Card with animated metrics ────────────────────────────────────

function FBRLiveCard() {
  const { rotateX, rotateY, onMove, onLeave } = useTilt(6);
  return (
    <div onMouseMove={onMove} onMouseLeave={onLeave} style={{ perspective: 1400 }}>
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="relative rounded-3xl border border-amber-400/20 bg-zinc-900/70 backdrop-blur-xl p-7 shadow-2xl"
      >
        <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-amber-500/20 to-emerald-500/10 -z-10 blur-md" />

        <div className="flex items-center gap-3 mb-7" style={{ transform: 'translateZ(30px)' }}>
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-amber-400 blur-xl opacity-40" />
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-zinc-950" />
            </div>
          </div>
          <div>
            <p className="text-white font-bold text-lg">FBR Integration</p>
            <p className="text-emerald-300 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              All systems operational
            </p>
          </div>
          <div className="ml-auto px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
            live
          </div>
        </div>

        <div className="space-y-3" style={{ transform: 'translateZ(20px)' }}>
          {[
            { label: 'Invoices submitted today', value: 127, suffix: '' },
            { label: 'Success rate',             value: 998, renderer: (n: number) => `${(n / 10).toFixed(1)}%` },
            { label: 'Avg. response time',       value: 12,  renderer: (n: number) => `${(n / 10).toFixed(1)}s` },
            { label: 'Retry queue',              value: 0,   suffix: '' },
          ].map((m) => (
            <div key={m.label} className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/5 px-4 py-3">
              <span className="text-zinc-400 text-sm">{m.label}</span>
              <span className="font-mono font-bold text-white text-lg">
                <CountUp to={m.value} renderer={m.renderer} suffix={m.suffix as string | undefined} />
              </span>
            </div>
          ))}
        </div>

        {/* Mini bar */}
        <div className="mt-6 flex items-end gap-1 h-14" style={{ transform: 'translateZ(15px)' }}>
          {[34, 48, 42, 64, 56, 72, 84, 60, 90, 76, 102, 88, 110, 96].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 4 }}
              whileInView={{ height: h }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.04, duration: 0.5 }}
              className="flex-1 rounded-t bg-gradient-to-t from-amber-500 to-amber-300"
            />
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-2 font-mono">Submissions, last 14 hours</p>
      </motion.div>
    </div>
  );
}

// Small custom icon used in trust strip (medical cross)
function Cross(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z" />
    </svg>
  );
}
