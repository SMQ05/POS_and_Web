import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { z } from 'zod';
import { prisma, dbUrlInfo } from './prisma.js';
import { lookupByGtin, searchCatalog, contributeFromMedicine, upsertProduct } from './catalog.js';
import { isKxv2, decryptKxv2 } from './secureExport.js';
import { getDrapProduct, searchDrapCandidates } from './drap.js';
import { computeShiftSummary } from './shiftSummary.js';
import type { Prisma } from '@prisma/client';
import { startImport, pauseImport, resumeImport, importStatus, resumeImportOnBoot } from './drapImport.js';
import { requireAuth, requireRole, signToken } from './auth.js';
import * as serialize from './serializers.js';
import {
  encryptToken,
  buildSaleInvoicePayload,
  buildDebitNotePayload,
  enqueueFbrSubmission,
  startFbrRetryWorker,
  validateInvoiceData,
  fbrReference,
  decryptToken,
  type FbrProfile,
  type SaleForFbr,
  type SaleItemForFbr,
} from './fbr.js';
import {
  sendWelcomeSetupEmail,
  sendInvoiceEmail,
  sendTrialExpiryEmail,
  sendAccountSuspendedEmail,
  sendPasswordResetEmail,
  sendEmail,
} from './email.js';
// M5.1 — Web Push (RFC 8030 over VAPID). Optional: when VAPID env vars are
// missing, push fan-out is a no-op (the import is dynamic so missing keys
// don't crash startup).
import webPushDefault from 'web-push';
const webPush: typeof webPushDefault | null = (() => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:noreply@kynexsolutions.com';
  if (!pub || !priv) {
    console.warn('[push] VAPID keys not set — push notifications disabled');
    return null;
  }
  webPushDefault.setVapidDetails(subj, pub, priv);
  return webPushDefault;
})();

// ─── Startup validation ──────────────────────────────────────────────────────

const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
if (process.env.NODE_ENV === 'production' && !process.env.FBR_TOKEN_KEY) {
  console.warn('WARNING: FBR_TOKEN_KEY not set — FBR token encryption disabled');
}

const app = express();
const port = Number(process.env.PORT || 4000);
const IS_PROD = process.env.NODE_ENV === 'production';
const host = process.env.HOST || (IS_PROD ? '0.0.0.0' : '127.0.0.1');
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173';

// Trust the reverse proxy (Passenger/nginx) so req.ip reflects the real client
// IP from X-Forwarded-For — needed for rate limiting to key on the actual caller.
app.set('trust proxy', 1);

// SECURITY: baseline HTTP hardening. HSTS (force HTTPS), nosniff, frameguard
// (clickjacking), referrer policy, hide X-Powered-By. CSP is left disabled here
// because the SPA/print windows inject inline styles/scripts; tighten later with
// a nonce-based policy if desired.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

// In production we serve the frontend ourselves; CORS only needed for dev.
// In dev, accept ANY localhost / 127.0.0.1 origin (any port) so it can't fail on
// a localhost-vs-127.0.0.1 mismatch.
app.use(cors({
  origin: IS_PROD
    ? false
    : (origin, cb) => {
        if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === frontendOrigin) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
  credentials: true,
}));
// 6 MB headroom so uploaded images (prescriptions, invoices, payment proofs)
// can pass through — they're compressed client-side to ~200–800 KB but base64
// inflates ~33 %, plus other JSON fields can add a bit.
// `verify` callback stashes the raw body bytes on the request so webhook
// handlers can HMAC-sign the exact payload (key order + whitespace) the partner
// signed, rather than a re-serialized version. Cost: one extra Buffer reference
// per request; negligible.
app.use(express.json({
  limit: '6mb',
  verify: (req, _res, buf) => {
    (req as unknown as { rawBody?: Buffer }).rawBody = buf;
  },
}));

// SECURITY: brute-force / abuse protection. `authLimiter` guards credential and
// token endpoints (login, signup, password reset) against online guessing and
// email/SMS-cost abuse. `apiLimiter` is a generous catch-all that stops a single
// client from hammering the whole API. Disabled in dev so it never gets in the
// way of local testing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: IS_PROD ? 20 : 100000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
const apiLimiter = rateLimit({
  // Generous: several POS terminals in one shop share a public IP and poll for
  // notifications, so this is only an anti-hammering backstop. Brute-force
  // protection comes from authLimiter, not this.
  windowMs: 60 * 1000,
  limit: IS_PROD ? 1000 : 1000000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use('/api', apiLimiter);

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const tenantSlugSchema = z.string().trim().min(2).max(64).regex(/^[a-z0-9-]+$/);

const loginSchema = z.object({
  tenantSlug: tenantSlugSchema.optional(),
  email: z.string().email(),
  password: z.string().min(1),
});

const createTenantSchema = z.object({
  slug: tenantSlugSchema,
  name: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(10),
  subscriptionPlan: z.enum(['basic', 'pro', 'enterprise']).default('basic'),
});

const anyObjectSchema = z.record(z.string(), z.unknown());

// Roles allowed to authenticate as a salesperson at receipt time.
const SALES_ROLES = new Set(['owner', 'manager', 'cashier', 'salesman', 'pharmacist']);

const salesPinPattern = /^\d{4}$/;

const setOwnSalesPinSchema = z.object({
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Username must be alphanumeric'),
  pin: z.string().regex(salesPinPattern, 'PIN must be exactly 4 digits'),
  // Current account password OR current PIN — at least one is required
  currentPassword: z.string().min(1).optional(),
  currentPin: z.string().regex(salesPinPattern).optional(),
});

const adminResetPinSchema = z.object({
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Username must be alphanumeric'),
  pin: z.string().regex(salesPinPattern, 'PIN must be exactly 4 digits'),
});

const verifyPinSchema = z.object({
  // Username is optional — code-only mode (item 7) identifies the salesperson by
  // PIN alone (PINs are enforced unique per tenant at set time).
  username: z.string().trim().min(1).max(40).optional(),
  pin: z.string().regex(salesPinPattern),
});

// Lightweight per-tenant rate limiter for the PIN verify endpoint to slow
// brute-force attempts. In-memory; resets on server restart. Good enough for a
// single-process dev setup; behind PM2 cluster this would need to move to Redis.
const pinAttemptTracker = new Map<string, { count: number; resetAt: number }>();
function recordPinAttempt(key: string): { blocked: boolean } {
  const now = Date.now();
  const entry = pinAttemptTracker.get(key);
  if (!entry || entry.resetAt < now) {
    pinAttemptTracker.set(key, { count: 1, resetAt: now + 60_000 });
    return { blocked: false };
  }
  entry.count += 1;
  if (entry.count > 10) return { blocked: true };
  return { blocked: false };
}

const userMutationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['superadmin', 'owner', 'manager', 'cashier', 'salesman', 'pharmacist', 'accountant']).optional(),
  permissions: z.array(z.object({
    module: z.string(),
    actions: z.array(z.enum(['create', 'read', 'update', 'delete'])),
  })).optional(),
  branchId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  // M6 — per-branch RBAC list. Owner-only field on update; managers can't
  // edit branchAccess. When unset, the helper falls back to legacy rules.
  branchAccess: z.array(z.object({
    branchId: z.string().min(1),
    access: z.enum(['read', 'full']),
  })).optional(),
  // Optional POS credentials set at creation for a salesman. salesPin is hashed
  // server-side; only applied when the role can operate the POS.
  salesUsername: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Username must be alphanumeric').optional(),
  salesPin: z.string().regex(salesPinPattern, 'PIN must be exactly 4 digits').optional(),
});

// M6 — Shift session schemas
const shiftOpenSchema = z.object({
  branchId: z.string().min(1),
  openingCash: z.number().nonnegative().default(0),
  notes: z.string().trim().max(500).optional(),
});
const shiftCloseSchema = z.object({
  closingCash: z.number().nonnegative(),
  notes: z.string().trim().max(500).optional(),
});

// M6 — Day-close schema
const dayCloseCreateSchema = z.object({
  branchId: z.string().min(1),
  businessDate: z.coerce.date(),
  openingCash: z.number().nonnegative().optional(),
  closingCash: z.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
});

const medicineUnitSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(50),
  abbreviation: z.string().trim().max(20),
  multiplier: z.number().positive(),
  salePrice: z.number().nonnegative().optional(),
  barcode: z.string().trim().max(100).optional(),
  isBaseUnit: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const medicineCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  genericName: z.string().trim().min(1).max(200),
  brandName: z.string().trim().max(200).optional(),
  category: z.string().trim().min(1).max(50),
  subCategory: z.string().trim().max(50).optional(),
  description: z.string().trim().max(1000).optional(),
  dosageForm: z.string().trim().min(1).max(50).default('tablet'),
  strength: z.string().trim().min(1).max(100),
  unit: z.string().trim().min(1).max(50).default('piece'),
  units: z.array(medicineUnitSchema).optional(),
  barcode: z.string().trim().max(100).optional().nullable(),
  qrCode: z.string().trim().max(200).optional(),
  masterProductId: z.string().trim().max(60).optional().nullable(),
  drapRegNo: z.string().trim().max(60).optional().nullable(),
  isPrescriptionRequired: z.boolean().default(false),
  classification: z.enum(['otc', 'prescription', 'controlled']).default('otc'),
  substituteIds: z.array(z.string()).optional(),
  controlledSchedule: z.string().trim().max(50).optional(),
  isActive: z.boolean().default(true),
  webLive: z.boolean().default(false),
  taxRate: z.number().nonnegative().optional(),
  reorderLevel: z.number().int().nonnegative().default(0),
  reorderQuantity: z.number().int().nonnegative().default(0),
  hsCode: z.string().trim().max(20).optional(),
  fbrUom: z.string().trim().max(20).optional(),
  fbrSaleType: z.string().trim().max(10).optional(),
  fbrScenarioId: z.string().trim().max(20).optional(),
  drapRegistration: z.string().trim().max(80).optional(),
  manufacturer: z.string().trim().max(180).optional(),
  countryOfOrigin: z.string().trim().max(80).optional(),
  packSize: z.string().trim().max(120).optional(),
  storageInstructions: z.string().trim().max(300).optional(),
  taxRatePercent: z.number().min(0).max(100).optional(),
  shelfLocation: z.string().trim().max(80).optional(),
  rackNumber: z.string().trim().max(40).optional(),
  mrp: z.number().nonnegative().optional(),
  purchaseRate: z.number().nonnegative().optional(),
  tradePrice: z.number().nonnegative().optional(),
  maxStock: z.number().int().nonnegative().optional(),
  allowLooseSale: z.boolean().optional(),
  schedule: z.string().trim().max(20).optional(),
  composition: z.string().trim().max(500).optional(),
  reorderActive: z.boolean().optional(),
  // Data URL of a scanned/photographed barcode. ~3 MB cap to match prescription image storage.
  barcodeImageUrl: z.string().max(4 * 1024 * 1024).optional(),
});

// Cross-field guards applied at both create and patch.
//  - Inverted purchase/MRP is the biggest cause of "wrong entry" reports today:
//    someone typing 1200 in MRP and 100 in purchase silently survives until the
//    POS shows the cashier negative profit.
//  - Reorder fields should never exceed maxStock when both are set.
type MedicineLike = Partial<z.infer<typeof medicineCreateSchema>>;
function checkMedicineCrossFields(d: MedicineLike, ctx: z.RefinementCtx) {
  if (d.mrp != null && d.purchaseRate != null && d.purchaseRate > d.mrp) {
    ctx.addIssue({ code: 'custom', message: 'Purchase rate cannot exceed MRP', path: ['purchaseRate'] });
  }
  if (d.mrp != null && d.tradePrice != null && d.tradePrice > d.mrp) {
    ctx.addIssue({ code: 'custom', message: 'Trade price cannot exceed MRP', path: ['tradePrice'] });
  }
  if (d.maxStock != null && d.reorderQuantity != null && d.reorderQuantity > d.maxStock) {
    ctx.addIssue({ code: 'custom', message: 'Reorder quantity cannot exceed max stock', path: ['reorderQuantity'] });
  }
  if (d.maxStock != null && d.reorderLevel != null && d.reorderLevel > d.maxStock) {
    ctx.addIssue({ code: 'custom', message: 'Reorder level cannot exceed max stock', path: ['reorderLevel'] });
  }
}

const medicineCreateRefined = medicineCreateSchema.superRefine(checkMedicineCrossFields);
const medicinePatchSchema = medicineCreateSchema.partial().superRefine(checkMedicineCrossFields);

const batchCreateSchema = z.object({
  medicineId: z.string().min(1),
  branchId: z.string().optional(),
  batchNumber: z.string().trim().min(1).max(100),
  expiryDate: z.coerce.date(),
  manufacturingDate: z.coerce.date().optional(),
  quantity: z.number().int().min(0),
  purchasePrice: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  tradePrice: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative(),
  supplierId: z.string().optional(),
  purchaseId: z.string().optional(),
  location: z.string().trim().max(100).optional(),
  isActive: z.boolean().default(true),
  disposition: z.enum(['active', 'pending_return', 'returned', 'disposed']).optional(),
  dispositionReason: z.enum(['expiry', 'damage', 'waste']).optional(),
  dispositionValue: z.number().optional(),
  dispositionNote: z.string().trim().max(1000).optional(),
  dispositionAt: z.coerce.date().optional(),
});

const batchPatchSchema = batchCreateSchema.partial();

const weekDayEnum = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

const supplierCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(7).max(20),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(100),
  ntn: z.string().trim().max(20).optional(),
  gstNumber: z.string().trim().max(30).optional(),
  creditLimit: z.number().nonnegative().default(0),
  currentBalance: z.number().default(0),
  paymentTerms: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  // M3 — optional weekly visit days.
  visitDays: z.array(weekDayEnum).optional(),
});

const supplierPatchSchema = supplierCreateSchema.partial();

// M3 — Medicine ↔ Supplier mapping
const medicineSupplierFields = {
  medicineId: z.string().min(1),
  supplierId: z.string().min(1),
  lastTradePrice: z.number().nonnegative().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
};
// Honor a client-supplied id so the optimistic local row and the DB row share
// an id — that keeps same-session unmap (DELETE by id) working before a reload.
const medicineSupplierCreateSchema = z.object({ id: z.string().min(1).max(64).optional(), ...medicineSupplierFields });
const medicineSupplierPatchSchema = z.object(medicineSupplierFields).partial();

// M3 — Per-PO supplier invoice
const purchaseInvoiceCreateSchema = z.object({
  purchaseId: z.string().min(1),
  supplierInvoiceNumber: z.string().trim().min(1).max(100),
  imageUrl: z.string().max(4 * 1024 * 1024).optional(),
  totalAmount: z.number().nonnegative(),
  receivedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
});

// M3 — Purchase return to distributor
const purchaseReturnItemSchema = z.object({
  medicineId: z.string().min(1),
  medicineName: z.string().optional(),
  batchId: z.string().min(1),
  batchNumber: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
  reason: z.string().trim().max(200).optional(),
});
const purchaseReturnCreateSchema = z.object({
  returnNumber: z.string().trim().min(1).max(50),
  supplierId: z.string().min(1),
  purchaseId: z.string().optional(),
  returnDate: z.coerce.date().optional(),
  items: z.array(purchaseReturnItemSchema).min(1),
  totalAmount: z.number().nonnegative(),
  reason: z.string().trim().min(1).max(500),
  stockAdjusted: z.boolean().default(true),
  status: z.enum(['posted', 'pending', 'rejected']).default('posted'),
  notes: z.string().trim().max(500).optional(),
});

// M4 — Reconcile (physical stock-take)
const reconcileScopeEnum = z.enum(['all', 'category', 'shelf', 'medicine', 'supplier']);
const reconcileRunCreateSchema = z.object({
  scope: reconcileScopeEnum,
  scopeValue: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});
const reconcileEntryUpsertSchema = z.object({
  medicineId: z.string().min(1),
  batchId: z.string().optional(),
  systemQty: z.number().int(),
  countedQty: z.number().int().nonnegative(),
  notes: z.string().trim().max(500).optional(),
});

// M4 — Bulk batch import (one row per batch)
const batchBulkRowSchema = z.object({
  // The csv template requires medicineBarcode rather than id so the user can
  // type/scan codes that match the printed pack. Server resolves the medicine.
  medicineBarcode: z.string().trim().min(1).max(100).optional(),
  medicineId: z.string().min(1).optional(),
  batchNumber: z.string().trim().min(1).max(100),
  expiryDate: z.coerce.date().or(z.string()),
  manufacturingDate: z.coerce.date().or(z.string()).optional(),
  quantity: z.number().int().nonnegative(),
  purchasePrice: z.number().nonnegative(),
  tradePrice: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative(),
  mrp: z.number().nonnegative(),
  supplierName: z.string().trim().max(200).optional(),
  supplierId: z.string().optional(),
  location: z.string().trim().max(100).optional(),
});
const batchBulkSchema = z.object({
  // Branch the imported stock lands in (defaults applied client-side to the
  // active branch). Per-row branchId could be added later if needed.
  branchId: z.string().optional(),
  rows: z.array(batchBulkRowSchema).min(1).max(2000),
});

// M-coverage — Bulk supplier import (one row per supplier). Mirrors
// supplierCreateSchema but relaxes required fields: only `name` is mandatory.
const supplierBulkRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  ntn: z.string().trim().max(20).optional(),
  gstNumber: z.string().trim().max(30).optional(),
  creditLimit: z.number().nonnegative().optional(),
  currentBalance: z.number().optional(),
  paymentTerms: z.number().int().nonnegative().optional(),
});
const supplierBulkSchema = z.object({
  rows: z.array(supplierBulkRowSchema).min(1).max(2000),
});

const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(7).max(20),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  cnic: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  dateOfBirth: z.coerce.date().optional(),
  allergies: z.array(z.string()).optional(),
  medicalHistory: z.string().trim().max(2000).optional(),
  isActive: z.boolean().default(true),
  // SECURITY: loyaltyPoints and totalPurchases are intentionally NOT accepted from
  // the client — they're server-managed (see applyLoyaltyForSale). Accepting them
  // here let any user PATCH a customer to an arbitrary point balance and then
  // redeem it as a discount (mint money). They default to 0 at the DB level.
  registrationType: z.enum(['registered', 'unregistered']).optional(),
  buyerNtn: z.string().trim().max(15).optional(),
});

const customerPatchSchema = customerCreateSchema.partial();

const paymentMethodSchema = z.object({
  method: z.enum(['cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer']),
  amount: z.number().nonnegative(),
  reference: z.string().max(100).optional(),
});

const saleItemSchema = z.object({
  id: z.string().optional(),
  medicineId: z.string().min(1),
  batchId: z.string().min(1),
  batchNumber: z.string().min(1),
  quantity: z.number().int().positive(),
  unitName: z.string().optional(),
  unitMultiplier: z.number().positive().default(1),
  unitPrice: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative(),
  profit: z.number(),
  discountPercent: z.number().nonnegative().max(100).default(0),
  taxRuleId: z.string().optional(),
  taxPercent: z.number().nonnegative().max(100).default(0),
  total: z.number().nonnegative(),
  expiryDate: z.coerce.date().or(z.string()),
  fefoOverride: z.boolean().default(false),
});

const saleCreateSchema = z.object({
  id: z.string().optional(),
  invoiceNumber: z.string().trim().min(1).max(50),
  branchId: z.string().min(1),
  customerId: z.string().min(1).optional(),
  customerName: z.string().trim().max(200).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  customerCnic: z.string().trim().max(20).optional(),
  loyaltyPointsEarned: z.number().int().nonnegative().optional(),
  loyaltyPointsRedeemed: z.number().int().nonnegative().optional(),
  loyaltyDiscount: z.number().nonnegative().optional(),
  doctorName: z.string().trim().max(200).optional(),
  prescriptionNumber: z.string().trim().max(50).optional(),
  // Compressed image data URL (<= ~3 MB). MediumText holds 16 MB so this is
  // plenty even with base64 overhead.
  prescriptionImageUrl: z.string().max(4 * 1024 * 1024).optional(),
  saleDate: z.coerce.date().or(z.string()),
  items: z.array(saleItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().nonnegative(),
  paidAmount: z.number().nonnegative().default(0),
  balanceAmount: z.number().default(0),
  paymentMethods: z.array(paymentMethodSchema).default([]),
  status: z.enum(['pending', 'completed', 'partial_returned', 'returned', 'cancelled']).default('pending'),
  isPrescription: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
  fbrStatus: z.enum(['not_integrated', 'pending', 'submitted', 'failed']).optional(),
  createdBy: z.string().min(1),
  salesPersonId: z.string().min(1).optional(),
  salesPersonName: z.string().trim().max(200).optional(),
});

const salePatchSchema = saleCreateSchema.partial();

// SECURITY (financial integrity): the client sends the money fields, and they're
// stored + fed to the ledger and FBR. Without a check, a cashier could sell real
// goods (stock IS drawn down server-side) while recording totalAmount: 0 — a
// classic under-ringing / skim. We don't silently overwrite (the printed receipt
// must match the stored row), but we REJECT totals that don't reconcile with the
// line items. The client total = Σ(qty·unitPrice) − lineDiscounts + tax + service
// charges − loyaltyDiscount; service charges and tax only ADD, so a consistent
// total can never fall below (subtotal − discount − loyalty). A 1-rupee epsilon
// absorbs rounding. Returns an error string, or null when consistent.
function checkSaleTotals(data: {
  items: { quantity: number; unitPrice: number; total: number; discountPercent?: number }[];
  subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number;
  loyaltyDiscount?: number;
}): string | null {
  const EPS = 1.0;
  let lineSum = 0;
  for (const it of data.items) {
    const expected = it.quantity * it.unitPrice;
    if (Math.abs(it.total - expected) > EPS) return 'Line total does not match quantity × unit price';
    lineSum += it.total;
  }
  if (Math.abs(data.subtotal - lineSum) > EPS) return 'Subtotal does not match line items';
  if (data.discountAmount < -EPS || data.discountAmount > data.subtotal + EPS) return 'Invalid discount amount';
  if (data.taxAmount < -EPS) return 'Invalid tax amount';
  const loyalty = data.loyaltyDiscount ?? 0;
  if (loyalty < -EPS || loyalty > data.subtotal + EPS) return 'Invalid loyalty discount';
  const minTotal = data.subtotal - data.discountAmount - loyalty - EPS;
  if (data.totalAmount < minTotal) return 'Total amount is inconsistent with items, discount and tax';
  return null;
}

const purchaseItemCreateSchema = z.object({
  id: z.string().optional(),
  medicineId: z.string().min(1),
  batchNumber: z.string().max(100).default(''),
  expiryDate: z.coerce.date().or(z.string()).optional(),
  quantity: z.number().int().positive(),
  purchasePrice: z.number().nonnegative().default(0),
  salePrice: z.number().nonnegative().default(0),
  mrp: z.number().nonnegative().default(0),
  discountPercent: z.number().nonnegative().max(100).default(0),
  taxPercent: z.number().nonnegative().max(100).default(0),
  total: z.number().nonnegative().default(0),
});

const purchasePaymentSchema = z.object({
  id: z.string().min(1),
  amount: z.number().nonnegative(),
  method: z.enum(['cash', 'card', 'bank_transfer', 'cheque', 'jazzcash', 'easypaisa', 'other']),
  reference: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  proofImageUrl: z.string().max(4 * 1024 * 1024).optional(),
  paidAt: z.coerce.date().or(z.string()),
  recordedBy: z.string().min(1),
});

const purchaseCreateSchema = z.object({
  id: z.string().optional(),
  purchaseNumber: z.string().trim().min(1).max(50),
  supplierId: z.string().min(1),
  branchId: z.string().min(1),
  purchaseDate: z.coerce.date().or(z.string()),
  dueDate: z.coerce.date().or(z.string()).optional(),
  paymentTermsDays: z.number().int().nonnegative().optional(),
  items: z.array(purchaseItemCreateSchema).min(1),
  subtotal: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().nonnegative(),
  paidAmount: z.number().nonnegative().default(0),
  balanceAmount: z.number().default(0),
  supplierInvoiceNumber: z.string().trim().max(80).optional(),
  supplierInvoiceImageUrl: z.string().max(4 * 1024 * 1024).optional(),
  payments: z.array(purchasePaymentSchema).optional(),
  isLoose: z.boolean().optional(),
  looseSource: z.string().trim().max(200).optional(),
  status: z.enum(['draft', 'ordered', 'partial', 'received', 'cancelled']).default('draft'),
  closedPartial: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
  createdBy: z.string().min(1),
});

const purchasePatchSchema = purchaseCreateSchema.partial();

// SECURITY (financial integrity): totalAmount drives the supplier payable balance
// and the payables ledger. Guard against it being set independently of the line
// items (inflating/deflating what's owed a supplier). Lenient lower-bound check —
// tax/service only adds, so a consistent total can't fall below subtotal−discount.
function checkPurchaseTotals(data: {
  items: { quantity: number; purchasePrice: number; total: number }[];
  subtotal: number; discountAmount: number; totalAmount: number;
}): string | null {
  const EPS = 1.0;
  const lineSum = data.items.reduce((s, it) => s + it.total, 0);
  if (data.subtotal > 0 && Math.abs(data.subtotal - lineSum) > Math.max(EPS, lineSum * 0.02)) {
    return 'Subtotal does not match line items';
  }
  if (data.totalAmount + EPS < data.subtotal - data.discountAmount) {
    return 'Total amount is inconsistent with items and discount';
  }
  return null;
}

const expenseCreateSchema = z.object({
  category: z.enum(['rent', 'salary', 'utilities', 'marketing', 'other']),
  description: z.string().trim().min(1).max(500),
  amount: z.number().positive(),
  date: z.coerce.date().or(z.string()),
  createdBy: z.string().min(1),
});

const expensePatchSchema = expenseCreateSchema.partial();

const saleReturnSchema = z.object({
  saleId: z.string().min(1),
  items: z.array(z.object({
    saleItemId: z.string().min(1),
    medicineId: z.string().min(1),
    batchId: z.string().min(1),
    batchNumber: z.string().optional(),
    medicineName: z.string().optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    discountPercent: z.number().nonnegative().optional(),
    taxPercent: z.number().nonnegative().optional(),
  })).min(1),
  refundMethod: z.object({
    method: z.enum(['cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer']),
    amount: z.number().nonnegative(),
    reference: z.string().optional(),
  }),
  reason: z.string().trim().min(2).max(500),
  restockInventory: z.boolean().default(true),
});

const supplierPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer']),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tenantId(req: express.Request): string {
  if (!req.auth?.tenantId) throw new Error('Missing tenant context');
  return req.auth.tenantId;
}

function sendParseError(res: express.Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
  }
  console.error('[sendParseError]', error);
  const msg = error instanceof Error ? error.message : String(error);
  return res.status(400).json({ error: 'Invalid request', detail: msg });
}

// ─── M6 — Branch access helper + middleware ────────────────────────────────
// Resolves a user's effective access ('none' | 'read' | 'full') on a given
// branch. Honors three sources in order:
//   1. explicit `branchAccess` JSON on the user (owner-managed list)
//   2. legacy single `branchId` for non-owners (full on assigned, none elsewhere)
//   3. role-based fallback: owners + superadmins get 'full' everywhere
type BranchAccessLevel = 'none' | 'read' | 'full';
async function getBranchAccess(tenantIdVal: string, userId: string, branchId: string): Promise<BranchAccessLevel> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: tenantIdVal },
    select: { role: true, branchId: true, branchAccess: true },
  });
  if (!user) return 'none';
  if (user.role === 'superadmin') return 'full';
  // 1. Explicit per-branch grants.
  if (Array.isArray(user.branchAccess) && user.branchAccess.length > 0) {
    const entry = (user.branchAccess as Array<{ branchId: string; access: BranchAccessLevel }>)
      .find((e) => e.branchId === branchId);
    if (entry) return entry.access;
    // Owner without an entry for this branch still defaults to 'full' — they
    // own the whole tenant. Other roles default to 'none'.
    return user.role === 'owner' ? 'full' : 'none';
  }
  // 2. Owners with no explicit list see everything.
  if (user.role === 'owner') return 'full';
  // 3. Legacy single-branch: full on the assigned branch, otherwise none.
  if (user.branchId && user.branchId === branchId) return 'full';
  // Users with no branchId at all — common in seed data — get 'full' on any
  // branch as a back-compat default so existing dashboards keep working.
  if (!user.branchId) return 'full';
  return 'none';
}

// Middleware-style guard used by write endpoints. Reads branchId from the
// request body, query, or params (callers pick the source via getId).
function requireBranchWrite(getId: (req: express.Request) => string | undefined) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const branchId = getId(req);
      if (!branchId) return next(); // No branch context → leave to caller's other auth
      const level = await getBranchAccess(tenantId(req), req.auth!.userId, branchId);
      if (level === 'full') return next();
      if (level === 'read') return res.status(403).json({ error: 'Read-only access on this branch' });
      return res.status(403).json({ error: 'No access to this branch' });
    } catch (err) {
      return next(err);
    }
  };
}

// Inline version of the above. Used in endpoints where branchId comes from a
// parent record (sale.branchId, purchase.branchId) and isn't available until
// after a DB lookup, so middleware can't reach it. Returns true on success;
// on failure sends the 403 and returns false — caller should `return` immediately.
async function assertBranchWrite(req: express.Request, res: express.Response, branchId: string | null | undefined): Promise<boolean> {
  if (!branchId) return true; // No branch context → don't block
  const level = await getBranchAccess(tenantId(req), req.auth!.userId, branchId);
  if (level === 'full') return true;
  res.status(403).json({ error: level === 'read' ? 'Read-only access on this branch' : 'No access to this branch' });
  return false;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'kynex-pharmacloud-api' });
});

// SECURITY: superadmin-only. Previously public, this leaked infra details
// (DB host/user, engine paths) plus live tenant/user counts and demo-user emails
// to anonymous callers — a recon goldmine. Now gated and trimmed of sensitive
// fields; raw DB error strings are never echoed to the client.
app.get('/api/_debug', requireAuth, requireRole('superadmin'), async (_req, res) => {
  const result: Record<string, unknown> = {
    nodeEnv: process.env.NODE_ENV,
    dbUrlSource: dbUrlInfo.source,
  };
  try {
    result.dbConnection = 'OK';
    result.tenantCount = await prisma.tenant.count();
    result.userCount = await prisma.user.count();
  } catch (e) {
    result.dbConnection = 'FAILED';
    console.error('[_debug] db check failed:', e);
  }
  res.json(result);
});

// SECURITY: superadmin-only. Self-serve signup is the email-verified, rate-limited
// `/api/auth/signup` path. This older endpoint minted owner-role accounts (and a
// valid token) for anonymous callers — unbounded tenant/account creation + DoS.
app.post('/api/tenants', requireAuth, requireRole('superadmin'), async (req, res) => {
  try {
    const data = createTenantSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.ownerPassword, 12);

    const tenant = await prisma.tenant.create({
      data: {
        slug: data.slug,
        name: data.name,
        subscriptionPlan: data.subscriptionPlan,
        settings: {
          companyName: data.name,
          currency: 'PKR',
          posEnabled: true,
          managementEnabled: true,
          taxRules: [
            { id: 'tax-standard-sales', name: 'Standard Sales Tax', type: 'sales_tax', ratePercent: 18, appliesTo: 'goods', fbrRateLabel: '18%', isDefault: true, isActive: true },
            { id: 'tax-exempt', name: 'Exempt / Sixth Schedule', type: 'sales_tax', ratePercent: 0, appliesTo: 'goods', fbrRateLabel: 'Exempt', isDefault: false, isActive: true },
          ],
          // Service charges left empty by default — the legacy "FBR POS Service Charge"
          // was a feature of the old POS Real-Time Invoice (RTI) API and is NOT part of
          // the DI API v1.12 payload. Tenants who want non-FBR fees (delivery, packaging)
          // can add them manually in Settings → Tax/FBR → Add Service Charge.
          serviceCharges: [],
          discountRules: [
            { id: 'disc-line-percent', name: 'Line Discount %', type: 'line_percent', value: 0, requiresApproval: false, isActive: true },
          ],
          fbrProfile: {
            enabled: false,
            mode: 'sandbox',
            integrationType: 'digital_invoicing',
            apiBaseUrl: 'https://gw.fbr.gov.pk/di_data/v1/di',
            sellerNTNCNIC: '',
            sellerBusinessName: data.name,
            sellerProvince: 'Punjab',
            sellerAddress: 'Update address',
            includeServiceCharge: true,
          },
        },
        branches: {
          create: {
            name: 'Main Branch',
            address: 'Update address',
            city: 'Update city',
            phone: 'Update phone',
            email: data.ownerEmail,
          },
        },
        users: {
          create: {
            name: data.ownerName,
            email: data.ownerEmail.toLowerCase(),
            passwordHash,
            role: 'owner',
            permissions: [{ module: '*', actions: ['create', 'read', 'update', 'delete'] }],
          },
        },
      },
      include: { users: true },
    });

    const owner = tenant.users[0];
    const token = signToken({ userId: owner.id, tenantId: tenant.id, role: owner.role });
    return res.status(201).json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        handle: tenant.handle ?? tenant.slug,
        businessType: tenant.businessType ?? 'pharmacy',
        name: tenant.name,
        subscriptionPlan: tenant.subscriptionPlan,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
      },
      user: serialize.publicUser(owner),
      token,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Tenant slug or owner email already exists' });
    }
    return sendParseError(res, error);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  // Fire-and-forget audit writer. Only writes when we have a known tenant —
  // unknown-email attempts can't write because tenantId is required + FK.
  const writeLoginAudit = async (
    tenantIdForAudit: string,
    userIdForAudit: string,
    userNameForAudit: string,
    action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED',
    details: string,
  ) => {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: tenantIdForAudit,
          userId: userIdForAudit,
          userName: userNameForAudit,
          action,
          module: 'auth',
          details,
          ipAddress: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
            || req.socket?.remoteAddress
            || null,
        },
      });
    } catch (err) {
      console.warn('[audit] login audit write failed:', err);
    }
  };

  try {
    const data = loginSchema.parse(req.body);

    let tenant: Awaited<ReturnType<typeof prisma.tenant.findUnique>> | null = null;
    let user: Awaited<ReturnType<typeof prisma.user.findFirst>> | null = null;

    if (data.tenantSlug) {
      // Single-tenant install: slug known upfront
      tenant = await prisma.tenant.findUnique({ where: { slug: data.tenantSlug } });
      if (!tenant?.isActive) return res.status(401).json({ error: 'Invalid credentials' });
      user = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email: data.email.toLowerCase() } },
      });
    } else {
      // SaaS mode: look up user by email globally, pick active tenant
      user = await prisma.user.findFirst({
        where: { email: data.email.toLowerCase(), isActive: true },
        include: { tenant: true },
      });
      if (user) tenant = (user as typeof user & { tenant: typeof tenant }).tenant ?? null;
    }

    if (!user?.isActive || !tenant?.isActive) {
      if (tenant && user) {
        // Tenant-known case: log the failed attempt to that tenant's audit trail.
        await writeLoginAudit(tenant.id, user.id, user.name ?? data.email, 'LOGIN_FAILED', `Inactive user or tenant — ${data.email}`);
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.passwordHash) {
      await writeLoginAudit(tenant.id, user.id, user.name, 'LOGIN_FAILED', `Password not set — ${data.email}`);
      return res.status(401).json({ error: 'Password not set. Please check your email for the setup link.' });
    }

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) {
      await writeLoginAudit(tenant.id, user.id, user.name, 'LOGIN_FAILED', `Wrong password — ${data.email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const token = signToken({ userId: user.id, tenantId: tenant.id, role: user.role });
    await writeLoginAudit(tenant.id, user.id, user.name, 'LOGIN_SUCCESS', `Login from ${data.email}`);

    return res.json({
      token,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        handle: tenant.handle ?? tenant.slug,
        businessType: tenant.businessType ?? 'pharmacy',
        name: tenant.name,
        subscriptionPlan: tenant.subscriptionPlan,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
      },
      user: serialize.publicUser({ ...user, lastLogin: new Date() }),
    });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.get('/api/bootstrap', requireAuth, async (req, res) => {
  const id = tenantId(req);
  const [
    tenant,
    branches,
    medicines,
    batches,
    suppliers,
    customers,
    sales,
    saleReturns,
    purchases,
    expenses,
    ledgerEntries,
    medicineSuppliers,
    purchaseInvoices,
    purchaseReturns,
    promiseOrders,
  ] = await Promise.all([
    prisma.tenant.findUnique({ where: { id } }),
    prisma.branch.findMany({ where: { tenantId: id, isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.medicine.findMany({ where: { tenantId: id, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.batch.findMany({ where: { tenantId: id, isActive: true }, orderBy: { expiryDate: 'asc' } }),
    prisma.supplier.findMany({ where: { tenantId: id, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.customer.findMany({ where: { tenantId: id, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.sale.findMany({ where: { tenantId: id }, orderBy: { saleDate: 'desc' }, take: 500 }),
    prisma.saleReturn.findMany({ where: { tenantId: id }, orderBy: { returnDate: 'desc' }, take: 500 }),
    prisma.purchase.findMany({ where: { tenantId: id }, orderBy: { purchaseDate: 'desc' }, take: 500 }),
    prisma.expense.findMany({ where: { tenantId: id }, orderBy: { date: 'desc' }, take: 500 }),
    prisma.ledgerEntry.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.medicineSupplier.findMany({ where: { tenantId: id } }),
    prisma.purchaseInvoice.findMany({ where: { tenantId: id }, orderBy: { receivedAt: 'asc' }, take: 1000 }),
    prisma.purchaseReturn.findMany({ where: { tenantId: id }, orderBy: { returnDate: 'desc' }, take: 500 }),
    prisma.promiseOrder.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 500 }),
  ]);

  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  return res.json({
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      handle: tenant.handle ?? tenant.slug,
      businessType: tenant.businessType ?? 'pharmacy',
      name: tenant.name,
      subscriptionPlan: tenant.subscriptionPlan,
      isActive: tenant.isActive,
      createdAt: tenant.createdAt,
      settings: tenant.settings,
    },
    branches: branches.map(serialize.branch),
    medicines: medicines.map(serialize.medicine),
    batches: batches.map(serialize.batch),
    suppliers: suppliers.map(serialize.supplier),
    customers: customers.map(serialize.customer),
    sales: sales.map(serialize.sale),
    saleReturns: saleReturns.map(serialize.saleReturn),
    purchases: purchases.map(serialize.purchase),
    expenses: expenses.map(serialize.expense),
    ledgerEntries: ledgerEntries.map(serialize.ledgerEntry),
    medicineSuppliers: medicineSuppliers.map(serialize.medicineSupplier),
    purchaseInvoices: purchaseInvoices.map(serialize.purchaseInvoice),
    purchaseReturns: purchaseReturns.map(serialize.purchaseReturn),
    promiseOrders: promiseOrders.map(serialize.promiseOrder),
  });
});

// ─── Billing ───────────────────────────────────────────────────────────────

const PRICING = {
  baseMonthly: 1500,
  baseYearly: 12000,
  branchMonthly: 1500,
  branchYearly: 12000,
  // Flat, non-negotiable discount applied to every sub-branch's add-on fee
  // (monthly + yearly). Product decision: simplify pricing, no per-branch
  // manual overrides. Lives here as a single source of truth.
  subBranchDiscount: 0.15,
  salesWhatsapp: '923189540997',
};

function computePrice(branchCount: number, cycle: 'monthly' | 'yearly') {
  const base = cycle === 'monthly' ? PRICING.baseMonthly : PRICING.baseYearly;
  const addon = cycle === 'monthly' ? PRICING.branchMonthly : PRICING.branchYearly;
  const additional = Math.max(0, branchCount - 1);
  const discountedAddon = Math.round(addon * (1 - PRICING.subBranchDiscount));
  return base + additional * discountedAddon;
}

app.get('/api/billing', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const id = tenantId(req);
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const branchCount = await prisma.branch.count({ where: { tenantId: id, isActive: true } });
  const settings = (tenant.settings as Record<string, unknown>) ?? {};
  const billing = (settings.billing as Record<string, unknown>) ?? {};
  res.json({
    status: tenant.status,
    isActive: tenant.isActive,
    trialEndsAt: tenant.trialEndsAt,
    branchCount,
    cycle: (billing.cycle as string) ?? 'monthly',
    nextBillingAt: billing.nextBillingAt ?? null,
    lastPaymentAt: billing.lastPaymentAt ?? null,
    lastPaymentAmount: billing.lastPaymentAmount ?? null,
    pricing: PRICING,
    monthlyAmount: computePrice(branchCount, 'monthly'),
    yearlyAmount: computePrice(branchCount, 'yearly'),
  });
});

const billingQrSchema = z.object({ cycle: z.enum(['monthly', 'yearly']) });

app.post('/api/billing/generate-qr', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { cycle } = billingQrSchema.parse(req.body);
    const id = tenantId(req);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const branchCount = await prisma.branch.count({ where: { tenantId: id, isActive: true } });
    const amount = computePrice(branchCount, cycle);

    const apiKey = process.env.PAYUP_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Payment gateway not configured' });
    const baseUrl = process.env.PAYUP_API_URL ?? 'https://dashboard.payup.pk/api';
    const r = await fetch(`${baseUrl}/generate-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ amount: String(amount), orderId: id }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Failed to generate QR', detail: (await r.text()).substring(0, 300) });
    const data = await r.json() as { success?: boolean; qrContent?: string };
    if (!data.success || !data.qrContent) return res.status(502).json({ error: 'Invalid QR response' });

    res.json({
      qrContent: data.qrContent,
      qrImageUrl: `${baseUrl}/render-qr?text=${encodeURIComponent(data.qrContent)}`,
      amount,
      cycle,
      branchCount,
    });
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Payup webhook stub — Payup does NOT currently push payment notifications;
// payments are verified manually by an admin. This endpoint is kept as a no-op
// for future-proofing in case Payup adds webhook support.
app.post('/api/webhooks/payup', async (req, res) => {
  try {
    // Accept either Bearer token in Authorization header OR an x-payup-key header
    const auth = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const headerKey = (req.headers['x-payup-key'] as string | undefined) ?? '';
    const apiKey = process.env.PAYUP_API_KEY ?? '';
    if (apiKey && auth !== apiKey && headerKey !== apiKey) {
      console.warn('[payup-webhook] auth rejected');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    console.log('[payup-webhook] received:', JSON.stringify(body).slice(0, 500));

    // Try to extract amount + status from common field names Payup might use
    const rawAmount = body.amount ?? body.total ?? body.value ?? body.payment_amount;
    const amount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : (rawAmount as number);
    const status = String(body.status ?? body.payment_status ?? 'success').toLowerCase();
    const reference = String(body.reference ?? body.transactionId ?? body.transaction_id ?? body.orderId ?? body.qrContent ?? '');

    const isSuccess = ['success', 'paid', 'completed', 'approved', 'confirmed'].includes(status);
    if (!isSuccess) {
      // Payup may send pending/expired updates too — accept and log, but don't approve
      return res.json({ ok: true, ignored: true, reason: `status=${status}` });
    }
    if (!isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount in webhook' });
    }

    // Find the tenant whose recent awaiting-payment transaction matches this amount
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const tenants = await prisma.tenant.findMany({});
    let matchedTenantId: string | null = null;
    let matchedTx: Record<string, unknown> | null = null;
    for (const t of tenants) {
      const settings = ((t.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const txns = Array.isArray(billing.transactions) ? (billing.transactions as Record<string, unknown>[]) : [];
      const candidate = txns
        .filter((x) => x.status === 'awaiting-payment' && x.amount === amount && new Date(x.createdAt as string) >= cutoff)
        .filter((x) => !reference || (x.qrContent as string).includes(reference) || reference.includes(x.qrContent as string) || true)
        .sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())[0];
      if (candidate) {
        matchedTenantId = t.id;
        matchedTx = candidate;
        break;
      }
    }

    if (!matchedTenantId || !matchedTx) {
      console.warn('[payup-webhook] no matching pending transaction for amount', amount);
      return res.json({ ok: true, matched: false, message: 'No pending transaction to match' });
    }

    // Auto-approve: update tenant billing
    const tenant = await prisma.tenant.findUnique({ where: { id: matchedTenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const settings = ((tenant.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const txns = (billing.transactions as Record<string, unknown>[]).map((x) =>
      x.id === matchedTx!.id ? { ...x, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: 'webhook', webhookReference: reference || null } : x
    );
    const now = new Date();
    const next = new Date(now);
    if (matchedTx.cycle === 'monthly') next.setMonth(next.getMonth() + 1);
    else next.setFullYear(next.getFullYear() + 1);
    billing.transactions = txns;
    billing.cycle = matchedTx.cycle;
    billing.lastPaymentAt = now.toISOString();
    billing.lastPaymentAmount = amount;
    billing.nextBillingAt = next.toISOString();
    // Clear per-cycle send state so the worker starts fresh next cycle.
    billing.invoiceSentAt = null;
    billing.reminderSentAt = null;
    settings.billing = billing;
    await prisma.tenant.update({
      where: { id: matchedTenantId },
      data: { settings: settings as never, status: 'active', isActive: true, lastInvoiceAt: now },
    });
    console.log('[payup-webhook] auto-approved tenant', matchedTenantId, 'tx', matchedTx.id, 'next billing', next.toISOString());
    res.json({ ok: true, matched: true, tenantId: matchedTenantId, transactionId: matchedTx.id });
  } catch (e) {
    console.error('[payup-webhook] error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

const submitPaymentSchema = z.object({
  cycle: z.enum(['monthly', 'yearly']),
  amount: z.number().positive(),
  referenceNumber: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)),
  receiptBase64: z.string().max(2_500_000).optional(), // up to ~1.8MB after base64 overhead
  notes: z.string().trim().max(500).optional(),
}).refine(
  (d) => (d.referenceNumber && d.referenceNumber.length > 0) || (d.receiptBase64 && d.receiptBase64.length > 0),
  { message: 'Either reference number or receipt is required', path: ['referenceNumber'] }
);

app.post('/api/billing/submit-payment', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const data = submitPaymentSchema.parse(req.body);
    const id = tenantId(req);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const settings = ((tenant.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const submissions = Array.isArray(billing.submissions) ? billing.submissions as Record<string, unknown>[] : [];
    const submission = {
      id: `sub-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      cycle: data.cycle,
      amount: data.amount,
      referenceNumber: data.referenceNumber,
      receiptBase64: data.receiptBase64 ?? null,
      notes: data.notes ?? null,
      submittedAt: new Date().toISOString(),
      submittedByUserId: (req as Request & { auth?: { userId: string } }).auth?.userId ?? null,
      status: 'pending',
    };
    submissions.push(submission);
    billing.submissions = submissions;
    settings.billing = billing;
    await prisma.tenant.update({ where: { id }, data: { settings: settings as never } });
    res.json({ ok: true, submissionId: submission.id, message: 'Payment submitted. An admin will verify within 30 minutes.' });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.get('/api/billing/submissions', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  const id = tenantId(req);
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const settings = (tenant.settings as Record<string, unknown>) ?? {};
  const billing = (settings.billing as Record<string, unknown>) ?? {};
  const submissions = Array.isArray(billing.submissions) ? (billing.submissions as Record<string, unknown>[]) : [];
  // Strip the receipt blob from list view (return separately if needed)
  res.json(submissions.map((s) => ({ ...s, receiptBase64: s.receiptBase64 ? '[stored]' : null })));
});

app.get('/api/saas-admin/pending-payments', requireAuth, requireRole('superadmin'), async (_req, res) => {
  const tenants = await prisma.tenant.findMany({ where: {} });
  const out: Record<string, unknown>[] = [];
  for (const t of tenants) {
    const settings = (t.settings as Record<string, unknown>) ?? {};
    const billing = (settings.billing as Record<string, unknown>) ?? {};
    const subs = Array.isArray(billing.submissions) ? (billing.submissions as Record<string, unknown>[]) : [];
    for (const s of subs) {
      if (s.status === 'pending') {
        out.push({
          ...s,
          tenantId: t.id,
          tenantName: t.name,
          tenantSlug: t.slug,
        });
      }
    }
  }
  res.json(out);
});

app.get('/api/saas-admin/payment/:tenantId/:submissionId/receipt', requireAuth, requireRole('superadmin'), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const settings = (tenant.settings as Record<string, unknown>) ?? {};
  const billing = (settings.billing as Record<string, unknown>) ?? {};
  const subs = Array.isArray(billing.submissions) ? (billing.submissions as Record<string, unknown>[]) : [];
  const sub = subs.find((s) => s.id === req.params.submissionId);
  if (!sub || !sub.receiptBase64) return res.status(404).json({ error: 'Receipt not found' });
  res.json({ receiptBase64: sub.receiptBase64 });
});

app.post('/api/saas-admin/payment/:tenantId/:submissionId/approve', requireAuth, requireRole('superadmin'), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const settings = ((tenant.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const subs = Array.isArray(billing.submissions) ? (billing.submissions as Record<string, unknown>[]) : [];
  const sub = subs.find((s) => s.id === req.params.submissionId);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });
  if (sub.status !== 'pending') return res.status(400).json({ error: 'Already processed' });
  const now = new Date();
  const next = new Date(now);
  if (sub.cycle === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  sub.status = 'approved';
  sub.approvedAt = now.toISOString();
  billing.cycle = sub.cycle;
  billing.lastPaymentAt = now.toISOString();
  billing.lastPaymentAmount = sub.amount;
  billing.nextBillingAt = next.toISOString();
  billing.submissions = subs;
  // Clear per-cycle send state — worker resumes fresh next cycle.
  billing.invoiceSentAt = null;
  billing.reminderSentAt = null;
  settings.billing = billing;
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { settings: settings as never, status: 'active', isActive: true, lastInvoiceAt: now },
  });

  // Sync the verified payment with Payup's portal for centralized analytics.
  // Per Payup docs, /record-payment is called after admin verifies proof.
  const apiKey = process.env.PAYUP_API_KEY;
  if (apiKey) {
    const baseUrl = process.env.PAYUP_API_URL ?? 'https://dashboard.payup.pk/api';
    fetch(`${baseUrl}/record-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ amount: sub.amount, orderId: `${tenant.id}:${sub.id}` }),
    }).then(async (r) => {
      if (!r.ok) console.warn('[payup-record]', r.status, (await r.text()).slice(0, 300));
    }).catch((e) => console.error('[payup-record] error:', e));
  }

  res.json({ ok: true, nextBillingAt: next.toISOString() });
});

app.post('/api/saas-admin/payment/:tenantId/:submissionId/reject', requireAuth, requireRole('superadmin'), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const settings = ((tenant.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const subs = Array.isArray(billing.submissions) ? (billing.submissions as Record<string, unknown>[]) : [];
  const sub = subs.find((s) => s.id === req.params.submissionId);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });
  sub.status = 'rejected';
  sub.rejectedAt = new Date().toISOString();
  sub.rejectionReason = (req.body as { reason?: string })?.reason ?? null;
  billing.submissions = subs;
  settings.billing = billing;
  await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: settings as never } });
  res.json({ ok: true });
});

// ─── Branches ──────────────────────────────────────────────────────────────

const branchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1).max(40),
  // Email is now REQUIRED — used to send the branch admin an invitation link
  // so they can set their own password and log in to manage just that branch.
  email: z.string().trim().email(),
  billingPaidBy: z.enum(['main', 'self']).optional(),
  subscriptionDiscount: z.number().min(0).max(100).optional(),
  /** Display name for the branch admin shown in the welcome email. */
  branchAdminName: z.string().trim().min(1).max(120).optional(),
});

app.get('/api/branches', requireAuth, async (req, res) => {
  const branches = await prisma.branch.findMany({
    where: { tenantId: tenantId(req), isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(branches.map(serialize.branch));
});

// Live per-branch snapshot for the Branches page: today's sales, staff count,
// and whether a shift is currently open. Keyed by branchId.
app.get('/api/branches/stats', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
  const [branches, sales, openShifts, staff] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId: tId, isActive: true }, select: { id: true } }),
    prisma.sale.findMany({
      where: { tenantId: tId, saleDate: { gte: dayStart, lte: dayEnd }, status: { in: ['completed', 'partial_returned', 'returned'] } },
      select: { branchId: true, totalAmount: true },
    }),
    prisma.shiftSession.findMany({ where: { tenantId: tId, status: 'open' }, select: { branchId: true } }),
    prisma.user.findMany({ where: { tenantId: tId, isActive: true }, select: { branchId: true } }),
  ]);
  const stats: Record<string, { salesToday: number; salesCount: number; openShifts: number; staff: number }> = {};
  for (const b of branches) stats[b.id] = { salesToday: 0, salesCount: 0, openShifts: 0, staff: 0 };
  for (const s of sales) {
    const k = stats[s.branchId]; if (!k) continue;
    k.salesToday += s.totalAmount ?? 0; k.salesCount += 1;
  }
  for (const sh of openShifts) { if (stats[sh.branchId]) stats[sh.branchId].openShifts += 1; }
  for (const u of staff) { if (u.branchId && stats[u.branchId]) stats[u.branchId].staff += 1; }
  res.json(stats);
});

app.post('/api/branches', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = branchSchema.parse(req.body);
    const tid = tenantId(req);

    // 1. Create the branch row
    const branch = await prisma.branch.create({
      data: {
        name: data.name,
        address: data.address,
        city: data.city,
        phone: data.phone,
        email: data.email,
        billingPaidBy: data.billingPaidBy ?? 'main',
        subscriptionDiscount: data.subscriptionDiscount ?? 0,
        tenantId: tid,
        isActive: true,
      } as never,
    });

    // 2. If the email isn't already a user on this tenant, create a manager
    //    account tied to the branch and send them a password-setup link.
    let invitationSent = false;
    let invitationError: string | null = null;
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tid, email: data.email.toLowerCase() } },
    });
    if (!existing) {
      // 48-hour token, stored on the User row, used by /setup-password/:token
      const setupToken = `bri_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const adminName = data.branchAdminName?.trim() || `${branch.name} Manager`;
      try {
        await prisma.user.create({
          data: {
            tenantId: tid,
            name: adminName,
            email: data.email.toLowerCase(),
            passwordHash: null,
            role: 'manager',
            permissions: [],
            branchId: branch.id,
            isActive: true,
            emailConfirmed: false,
            passwordSetupToken: setupToken,
            passwordSetupExpiry: setupExpiry,
          },
        });
        // 3. Send the welcome / password-setup email. Failure here is logged
        //    but does NOT roll back the branch — the owner can resend later.
        const tenant = await prisma.tenant.findUnique({ where: { id: tid } });
        try {
          const { sendWelcomeSetupEmail } = await import('./email.js');
          await sendWelcomeSetupEmail({
            to: data.email,
            name: adminName,
            pharmacyName: tenant?.name ?? 'Your Pharmacy',
            pharmacySlug: tenant?.slug ?? '',
            setupToken,
            trialDays: 0,
          });
          invitationSent = true;
        } catch (e) {
          invitationError = (e as Error).message;
          console.warn('Branch invitation email failed:', invitationError);
        }
      } catch (e) {
        invitationError = (e as Error).message;
        console.warn('Branch user creation failed:', invitationError);
      }
    } else {
      // User already exists for this email — just associate them with the new branch.
      await prisma.user.update({
        where: { id: existing.id },
        data: { branchId: branch.id },
      });
    }

    res.status(201).json({
      ...serialize.branch(branch),
      invitationSent,
      invitationError,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A branch with this name or email already exists' });
    }
    return sendParseError(res, error);
  }
});

app.patch('/api/branches/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = branchSchema.partial().parse(req.body);
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id, tenantId: tenantId(req) },
    });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    const updated = await prisma.branch.update({ where: { id: req.params.id }, data });
    res.json(serialize.branch(updated));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/branches/:id', requireAuth, requireRole('superadmin', 'owner'), async (req, res) => {
  const branch = await prisma.branch.findFirst({
    where: { id: req.params.id, tenantId: tenantId(req) },
  });
  if (!branch) return res.status(404).json({ error: 'Branch not found' });
  // Don't allow deleting the only branch
  const count = await prisma.branch.count({ where: { tenantId: tenantId(req), isActive: true } });
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete the only active branch' });
  await prisma.branch.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ ok: true });
});

app.get('/api/users', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { tenantId: tenantId(req), isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users.map(serialize.publicUser));
});

app.post('/api/users', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = userMutationSchema.required({
      name: true,
      email: true,
      password: true,
      role: true,
      permissions: true,
    }).parse(req.body);
    if (req.auth?.role === 'manager' && data.role && !['cashier', 'salesman'].includes(data.role)) {
      return res.status(403).json({ error: 'Managers can only create cashier or salesman accounts' });
    }
    const passwordHash = await bcrypt.hash(data.password, 12);
    // Optional POS login: only honored when the role can operate the register,
    // and only when both username + PIN are supplied. PIN is stored hashed.
    const canPos = SALES_ROLES.has(data.role);
    const salesUsername = canPos && data.salesUsername ? data.salesUsername : undefined;
    if (canPos && data.salesPin && await pinTaken(tenantId(req), data.salesPin)) {
      return res.status(409).json({ error: 'That sales PIN is already used by another staff member — pick a different one.' });
    }
    const salesPinHash = canPos && data.salesPin ? await bcrypt.hash(data.salesPin, 10) : undefined;
    const user = await prisma.user.create({
      data: {
        tenantId: tenantId(req),
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
        permissions: data.permissions,
        branchId: data.branchId ?? null,
        isActive: data.isActive ?? true,
        ...(salesUsername ? { salesUsername } : {}),
        ...(salesPinHash ? { salesPinHash } : {}),
      },
    });
    res.status(201).json(serialize.publicUser(user));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      // Either the email or the POS username collided within this tenant.
      return res.status(409).json({ error: 'A user with this email or POS username already exists for this tenant' });
    }
    return sendParseError(res, error);
  }
});

app.patch('/api/users/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = userMutationSchema.parse(req.body);
    if (req.auth?.role === 'manager' && data.role && !['cashier', 'salesman'].includes(data.role)) {
      return res.status(403).json({ error: 'Managers can only manage cashier or salesman accounts' });
    }
    // M6 — only owners (and superadmin) can change per-branch access lists.
    // Managers attempting to touch this field get a clean rejection.
    if (data.branchAccess !== undefined && !['owner', 'superadmin'].includes(req.auth?.role ?? '')) {
      return res.status(403).json({ error: 'Only owners can manage branch access' });
    }
    const updateData: Record<string, unknown> = { ...data };
    if (data.email) updateData.email = data.email.toLowerCase();
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 12);
    delete updateData.password;
    // PIN changes go through the dedicated /sales-pin endpoints (hashed there);
    // never let a raw salesPin reach the User update — it isn't a column.
    delete updateData.salesPin;
    const user = await prisma.user.update({
      where: { id: req.params.id, tenantId: tenantId(req) },
      data: updateData,
    });
    res.json(serialize.publicUser(user));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/users/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.id, tenantId: tenantId(req) },
    data: { isActive: false },
  });
  res.json({ ok: true });
});

// ─── Salesman self-performance ─────────────────────────────────────────────
// Returns the signed-in user's own sales performance, attributed via the POS
// PIN (Sale.salesPersonId), with returns subtracted. Bucketed into today /
// this month / all-time so a salesman can see their numbers from My Profile.
app.get('/api/me/performance', requireAuth, async (req, res) => {
  try {
    const id = tenantId(req);
    const me = req.auth!.userId;
    const sales = await prisma.sale.findMany({
      where: {
        tenantId: id,
        salesPersonId: me,
        status: { in: ['completed', 'partial_returned', 'returned'] },
      },
      select: { id: true, totalAmount: true, items: true, saleDate: true },
    });
    const saleIds = sales.map((s) => s.id);
    const returns = saleIds.length
      ? await prisma.saleReturn.findMany({
          where: { tenantId: id, saleId: { in: saleIds } },
          select: { totalAmount: true, saleId: true, createdAt: true },
        })
      : [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const bucket = (since: Date | null) => {
      const inRange = (d: Date) => since === null || d >= since;
      const s = sales.filter((x) => inRange(new Date(x.saleDate)));
      const r = returns.filter((x) => inRange(new Date(x.createdAt)));
      const salesTotal = s.reduce((a, x) => a + x.totalAmount, 0);
      const returnsTotal = r.reduce((a, x) => a + x.totalAmount, 0);
      const itemsSold = s.reduce(
        (a, x) => a + ((x.items as Array<{ quantity?: number }>) ?? []).reduce((q, i) => q + (Number(i.quantity) || 0), 0),
        0,
      );
      return {
        salesCount: s.length,
        salesTotal: Number(salesTotal.toFixed(2)),
        returnsTotal: Number(returnsTotal.toFixed(2)),
        netTotal: Number((salesTotal - returnsTotal).toFixed(2)),
        itemsSold,
      };
    };

    res.json({
      today: bucket(startOfToday),
      month: bucket(startOfMonth),
      allTime: bucket(null),
    });
  } catch (error) {
    return sendParseError(res, error);
  }
});

// ─── Sales PIN (POS receipt-time authentication) ──────────────────────────────
// Current user sets/changes their own POS username + 4-digit PIN. Must prove
// possession with either their account password (always works) or their current
// PIN (only if one is already set).
app.patch('/api/users/me/sales-pin', requireAuth, async (req, res) => {
  try {
    const data = setOwnSalesPinSchema.parse(req.body);
    const userId = req.auth!.userId;
    const tId = tenantId(req);
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: tId, isActive: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!SALES_ROLES.has(user.role)) {
      return res.status(403).json({ error: 'Your role cannot operate the POS' });
    }

    // Verify proof: account password (always) or existing PIN (if set).
    let proven = false;
    if (data.currentPassword && user.passwordHash) {
      proven = await bcrypt.compare(data.currentPassword, user.passwordHash);
    }
    if (!proven && data.currentPin && user.salesPinHash) {
      proven = await bcrypt.compare(data.currentPin, user.salesPinHash);
    }
    if (!proven) {
      return res.status(401).json({ error: 'Current password or PIN is required and must match' });
    }
    if (await pinTaken(tenantId(req), data.pin, user.id)) {
      return res.status(409).json({ error: 'That sales PIN is already used by another staff member — pick a different one.' });
    }

    const pinHash = await bcrypt.hash(data.pin, 10);
    try {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { salesUsername: data.username, salesPinHash: pinHash },
      });
      return res.json(serialize.publicUser(updated));
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        return res.status(409).json({ error: 'That username is already taken in your pharmacy' });
      }
      throw e;
    }
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Owner/manager resets a staff member's PIN (e.g. forgotten). Also used to
// initially provision a username + PIN on behalf of new staff.
app.patch('/api/users/:id/sales-pin/reset', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = adminResetPinSchema.parse(req.body);
    const tId = tenantId(req);
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: tId },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!SALES_ROLES.has(user.role)) {
      return res.status(400).json({ error: "This user's role cannot operate the POS" });
    }
    if (req.auth?.role === 'manager' && !['cashier', 'salesman'].includes(user.role)) {
      return res.status(403).json({ error: 'Managers can only reset PINs for cashiers and salesmen' });
    }
    if (await pinTaken(tId, data.pin, user.id)) {
      return res.status(409).json({ error: 'That sales PIN is already used by another staff member — pick a different one.' });
    }
    const pinHash = await bcrypt.hash(data.pin, 10);
    try {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { salesUsername: data.username, salesPinHash: pinHash },
      });
      return res.json(serialize.publicUser(updated));
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        return res.status(409).json({ error: 'That username is already taken in your pharmacy' });
      }
      throw e;
    }
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Owner/manager clears a user's PIN (e.g. staff member leaving). They can no
// longer process sales until they (or an admin) set a new one.
app.delete('/api/users/:id/sales-pin', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.id, tenantId: tenantId(req) },
    data: { salesUsername: null, salesPinHash: null },
  });
  res.json({ ok: true });
});

// POS calls this at receipt time. Returns the salesperson's id + name (no token
// — the POS terminal stays authenticated under whatever account logged in).
app.post('/api/sales/verify-pin', requireAuth, async (req, res) => {
  try {
    const data = verifyPinSchema.parse(req.body);
    const tId = tenantId(req);
    const rateKey = `${tId}:${req.ip ?? 'unknown'}`;
    if (recordPinAttempt(rateKey).blocked) {
      return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
    }
    if (data.username) {
      // Legacy path: username + PIN.
      const user = await prisma.user.findFirst({
        where: { tenantId: tId, salesUsername: data.username, isActive: true },
        select: { id: true, name: true, role: true, salesPinHash: true },
      });
      if (!user || !user.salesPinHash || !SALES_ROLES.has(user.role)) {
        return res.status(401).json({ error: 'Unknown username or PIN' });
      }
      const ok = await bcrypt.compare(data.pin, user.salesPinHash);
      if (!ok) return res.status(401).json({ error: 'Unknown username or PIN' });
      return res.json({ userId: user.id, name: user.name, role: user.role });
    }
    // Code-only path (item 7): find the salesperson by PIN alone. PINs are unique
    // per tenant, so at most one matches; compare against each active sales user.
    const candidates = await prisma.user.findMany({
      where: { tenantId: tId, isActive: true, salesPinHash: { not: null } },
      select: { id: true, name: true, role: true, salesPinHash: true },
    });
    for (const u of candidates) {
      if (!SALES_ROLES.has(u.role) || !u.salesPinHash) continue;
      if (await bcrypt.compare(data.pin, u.salesPinHash)) {
        return res.json({ userId: u.id, name: u.name, role: u.role });
      }
    }
    return res.status(401).json({ error: 'Invalid code' });
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Item 7 — code-only receipts identify a salesperson by PIN alone, so PINs must
// be unique per tenant. True if another active user already uses this PIN.
async function pinTaken(tId: string, pin: string, excludeUserId?: string): Promise<boolean> {
  const users = await prisma.user.findMany({
    where: {
      tenantId: tId,
      isActive: true,
      salesPinHash: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { salesPinHash: true },
  });
  for (const u of users) {
    if (u.salesPinHash && await bcrypt.compare(pin, u.salesPinHash)) return true;
  }
  return false;
}

app.patch('/api/settings', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const patch = anyObjectSchema.parse(req.body);
    const id = tenantId(req);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const existing = (tenant.settings as Record<string, unknown> | null) ?? {};

    // Extract bearer token before merging (store encrypted separately)
    let fbrTokenEncrypted: string | undefined;
    const patchFbrProfile = patch.fbrProfile as Record<string, unknown> | undefined;
    if (patchFbrProfile?.bearerToken && typeof patchFbrProfile.bearerToken === 'string' && patchFbrProfile.bearerToken.trim()) {
      if (process.env.FBR_TOKEN_KEY) {
        try {
          fbrTokenEncrypted = encryptToken(patchFbrProfile.bearerToken.trim());
        } catch {
          return res.status(400).json({ error: 'Failed to encrypt FBR token — check FBR_TOKEN_KEY env var' });
        }
      }
      // Remove plaintext token from settings JSON
      delete patchFbrProfile.bearerToken;
    }

    const settings = { ...existing, ...patch };
    const updateData: Record<string, unknown> = { settings };
    if (fbrTokenEncrypted !== undefined) updateData.fbrTokenEncrypted = fbrTokenEncrypted;

    const updated = await prisma.tenant.update({ where: { id }, data: updateData });
    res.json(updated.settings);
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.get('/api/medicines', requireAuth, async (req, res) => {
  const rows = await prisma.medicine.findMany({
    where: { tenantId: tenantId(req), isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json(rows.map(serialize.medicine));
});

app.post('/api/medicines', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const data = medicineCreateRefined.parse(req.body);
    const row = await prisma.medicine.create({ data: { ...data, tenantId: tenantId(req) } });
    // Grow the shared catalog from manual additions (fire-and-forget).
    contributeFromMedicine(
      { name: row.name, genericName: row.genericName, strength: row.strength, dosageForm: row.dosageForm, manufacturer: row.manufacturer, barcode: row.barcode, drapRegNo: row.drapRegNo },
      tenantId(req),
    ).catch(() => { /* logged inside */ });
    res.status(201).json(serialize.medicine(row));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A medicine with this barcode already exists' });
    }
    return sendParseError(res, error);
  }
});

app.patch('/api/medicines/:id', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const data = medicinePatchSchema.parse(req.body);
    const row = await prisma.medicine.update({
      where: { id: req.params.id, tenantId: tenantId(req) },
      data,
    });
    res.json(serialize.medicine(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/medicines/:id', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  await prisma.medicine.update({
    where: { id: req.params.id, tenantId: tenantId(req) },
    data: { isActive: false },
  });
  res.json({ ok: true });
});

app.post('/api/batches', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const data = batchCreateSchema.parse(req.body);
    const row = await prisma.batch.create({ data: { ...data, tenantId: tenantId(req) } });
    res.status(201).json(serialize.batch(row));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Batch number already exists for this medicine' });
    }
    return sendParseError(res, error);
  }
});

app.patch('/api/batches/:id', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const data = batchPatchSchema.parse(req.body);
    const row = await prisma.batch.update({
      where: { id: req.params.id, tenantId: tenantId(req) },
      data,
    });
    res.json(serialize.batch(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/batches/:id', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  await prisma.batch.update({
    where: { id: req.params.id, tenantId: tenantId(req) },
    data: { isActive: false },
  });
  res.json({ ok: true });
});

// ─── Central shared product catalog ─────────────────────────────────────────
// Cross-pharmacy master data. Read-only to tenants; writes happen via the DRAP
// route and contribute-on-medicine-create.
function serializeMaster(p: { id: string; brand: string; genericName: string | null; strength: string | null; unit: string | null; dosageForm: string | null; manufacturer: string | null; atcCode: string | null; routeOfAdmin: string | null; drapRegNo: string | null; packSizes: unknown; composition: unknown; extra?: unknown; source: string; verified: boolean; gtins?: Array<{ gtin: string }> }) {
  return {
    id: p.id, brand: p.brand, genericName: p.genericName ?? undefined, strength: p.strength ?? undefined,
    unit: p.unit ?? undefined, dosageForm: p.dosageForm ?? undefined, manufacturer: p.manufacturer ?? undefined,
    atcCode: p.atcCode ?? undefined, routeOfAdmin: p.routeOfAdmin ?? undefined, drapRegNo: p.drapRegNo ?? undefined,
    packSizes: p.packSizes ?? undefined, composition: p.composition ?? undefined, extra: p.extra ?? undefined,
    source: p.source, verified: p.verified, gtins: (p.gtins ?? []).map((g) => g.gtin),
  };
}

app.get('/api/catalog/by-gtin', requireAuth, async (req, res) => {
  const gtin = typeof req.query.gtin === 'string' ? req.query.gtin : '';
  if (!gtin) return res.status(400).json({ error: 'gtin is required' });
  const product = await lookupByGtin(gtin);
  res.json(product ? serializeMaster(product as Parameters<typeof serializeMaster>[0]) : null);
});

// ─── Secure export decryption (KXV2) ─────────────────────────────────────────
// Importing a .kxv (KXV2 envelope) file: the client uploads the ciphertext and
// the server unwraps it with the RSA private key (never shipped to clients) and
// returns the plaintext. Auth-only — a competitor without a login can't use it.
app.post('/api/secure/decrypt', requireAuth, async (req, res) => {
  const payload = typeof req.body?.payload === 'string' ? req.body.payload : '';
  if (!isKxv2(payload)) return res.status(400).json({ error: 'Not a recognized export file.' });
  try {
    const plaintext = decryptKxv2(payload);
    res.json({ plaintext });
  } catch {
    res.status(422).json({ error: 'This file could not be read (wrong version, tampered, or not a Kynex export).' });
  }
});

app.get('/api/catalog/search', requireAuth, async (req, res) => {
  const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
  const generic = typeof req.query.generic === 'string' ? req.query.generic : undefined;
  const regNo = typeof req.query.regNo === 'string' ? req.query.regNo : undefined;
  const rows = await searchCatalog({ brand, generic, regNo });
  res.json(rows.map((r) => serializeMaster(r as Parameters<typeof serializeMaster>[0])));
});

// ─── DRAP fallback (feeds the central catalog) ──────────────────────────────
// When a product isn't in the shared catalog, pull it from DRAP and upsert it so
// every pharmacy gets it next time. Reg-No is the reliable lookup.
app.get('/api/drap/product', requireAuth, async (req, res) => {
  const regNo = typeof req.query.regNo === 'string' ? req.query.regNo : '';
  if (!regNo) return res.status(400).json({ error: 'regNo is required' });
  try {
    const dto = await getDrapProduct(regNo);
    if (!dto) return res.json(null);
    const saved = await upsertProduct(dto); // cache into the central catalog
    res.json(saved ? serializeMaster(saved as Parameters<typeof serializeMaster>[0]) : null);
  } catch {
    res.json(null); // DRAP is best-effort; never block the UI
  }
});

// ─── DRAP bulk importer (SUPERADMIN ONLY → central master catalog) ───────────
// Pre-loads the whole DRAP catalog into MasterProduct over time. Never exposed
// to pharmacy roles.
app.get('/api/admin/drap/import/status', requireAuth, requireRole('superadmin'), async (_req, res) => {
  res.json(await importStatus());
});
app.post('/api/admin/drap/import/start', requireAuth, requireRole('superadmin'), async (req, res) => {
  res.json(await startImport(req.body?.reset === true));
});
app.post('/api/admin/drap/import/pause', requireAuth, requireRole('superadmin'), async (_req, res) => {
  res.json(await pauseImport());
});
app.post('/api/admin/drap/import/resume', requireAuth, requireRole('superadmin'), async (_req, res) => {
  res.json(await resumeImport());
});

// Browse the central master catalog (superadmin) — see what's been imported.
app.get('/api/admin/catalog', requireAuth, requireRole('superadmin'), async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const where = q
    ? { OR: [{ brand: { contains: q } }, { genericName: { contains: q } }, { drapRegNo: { contains: q } }] }
    : {};
  const [total, rows] = await Promise.all([
    prisma.masterProduct.count({ where }),
    prisma.masterProduct.findMany({ where, include: { gtins: true }, orderBy: { updatedAt: 'desc' }, take: limit, skip: offset }),
  ]);
  res.json({ total, items: rows.map((r) => serializeMaster(r as Parameters<typeof serializeMaster>[0])) });
});

// Lightweight brand/reg-no candidates (fast — one request, no detail/upsert).
// The client fetches full detail via /api/drap/product?regNo= when the user picks.
app.get('/api/drap/search', requireAuth, async (req, res) => {
  const regNo = typeof req.query.regNo === 'string' ? req.query.regNo : undefined;
  const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
  try {
    res.json(await searchDrapCandidates({ regNo, brand }));
  } catch {
    res.json([]);
  }
});

// Cross-branch stock lookup: given a medicine, how much is in each branch.
// Powers the "out of stock here — which branch has it?" search.
app.get('/api/stock/by-branch', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const medicineId = typeof req.query.medicineId === 'string' ? req.query.medicineId : '';
  if (!medicineId) return res.status(400).json({ error: 'medicineId is required' });
  const [branches, batches] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId: tId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, city: true } }),
    prisma.batch.findMany({
      where: { tenantId: tId, medicineId, isActive: true, quantity: { gt: 0 } },
      select: { branchId: true, quantity: true },
    }),
  ]);
  const byBranch = new Map<string, { quantity: number; batches: number }>();
  let unassigned = 0;
  for (const b of batches) {
    if (!b.branchId) { unassigned += b.quantity; continue; }
    const cur = byBranch.get(b.branchId) ?? { quantity: 0, batches: 0 };
    cur.quantity += b.quantity; cur.batches += 1; byBranch.set(b.branchId, cur);
  }
  res.json({
    medicineId,
    branches: branches.map((br) => ({
      branchId: br.id,
      branchName: br.name,
      city: br.city,
      quantity: byBranch.get(br.id)?.quantity ?? 0,
      batches: byBranch.get(br.id)?.batches ?? 0,
    })),
    unassigned,
  });
});

app.post('/api/suppliers', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = supplierCreateSchema.parse(req.body);
    const row = await prisma.supplier.create({ data: { ...data, tenantId: tenantId(req) } });
    res.status(201).json(serialize.supplier(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Bulk supplier import. Mirrors POST /api/batches/bulk shape so the frontend
// import dialog can be cloned. Returns per-row results; failures don't roll
// back the rest (each row is its own create).
app.post('/api/suppliers/bulk', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const { rows } = supplierBulkSchema.parse(req.body);
    const tId = tenantId(req);

    // Pre-load existing supplier names so we can skip duplicates rather than
    // error per-row (cheaper + clearer error). Case-insensitive match.
    const existing = await prisma.supplier.findMany({
      where: { tenantId: tId },
      select: { id: true, name: true },
    });
    const existingByName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s.id]));

    const results: { row: number; ok: boolean; id?: string; error?: string }[] = [];
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      try {
        const dupId = existingByName.get(r.name.trim().toLowerCase());
        if (dupId) {
          results.push({ row: idx + 1, ok: false, error: `Supplier "${r.name}" already exists` });
          continue;
        }
        const created = await prisma.supplier.create({
          data: {
            tenantId: tId,
            name: r.name,
            contactPerson: r.contactPerson ?? '',
            phone: r.phone ?? '',
            email: r.email ?? null,
            address: r.address ?? '',
            city: r.city ?? '',
            ntn: r.ntn ?? null,
            gstNumber: r.gstNumber ?? null,
            creditLimit: r.creditLimit ?? 0,
            currentBalance: r.currentBalance ?? 0,
            paymentTerms: r.paymentTerms ?? 0,
            isActive: true,
          },
        });
        existingByName.set(r.name.trim().toLowerCase(), created.id);
        results.push({ row: idx + 1, ok: true, id: created.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        results.push({ row: idx + 1, ok: false, error: msg.length > 200 ? msg.slice(0, 200) + '…' : msg });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    res.json({ totalRows: rows.length, created: okCount, failed: rows.length - okCount, results });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.patch('/api/suppliers/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = supplierPatchSchema.parse(req.body);
    const row = await prisma.supplier.update({
      where: { id: req.params.id, tenantId: tenantId(req) },
      data,
    });
    res.json(serialize.supplier(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/suppliers/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  await prisma.supplier.update({
    where: { id: req.params.id, tenantId: tenantId(req) },
    data: { isActive: false },
  });
  res.json({ ok: true });
});

// Record a payment against a supplier (reduces currentBalance)
app.post('/api/suppliers/:id/payment', requireAuth, requireRole('superadmin', 'owner', 'manager', 'accountant'), async (req, res) => {
  try {
    const data = supplierPaymentSchema.parse(req.body);
    const id = tenantId(req);

    const result = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id: req.params.id, tenantId: id } });
      if (!supplier) throw new Error('SUPPLIER_NOT_FOUND');

      const newBalance = Math.max(0, supplier.currentBalance - data.amount);
      const updated = await tx.supplier.update({
        where: { id: supplier.id, tenantId: id },
        data: { currentBalance: newBalance },
      });

      await tx.ledgerEntry.create({
        data: {
          tenantId: id,
          type: 'expense',
          referenceId: supplier.id,
          referenceType: 'payment',
          amount: data.amount,
          description: `Payment to ${supplier.name} via ${data.method}${data.reference ? ` (Ref: ${data.reference})` : ''}${data.notes ? ' — ' + data.notes : ''}`,
          createdBy: req.auth?.userId ?? 'system',
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: id,
          userId: req.auth?.userId ?? 'system',
          userName: 'System',
          action: 'SUPPLIER_PAYMENT',
          module: 'suppliers',
          details: `Paid Rs. ${data.amount.toFixed(2)} to ${supplier.name} via ${data.method}`,
        },
      });

      // M5 — notify owners that a payment was issued.
      await emitNotification(tx, {
        tenantId: id,
        scope: 'role',
        role: 'owner',
        title: `Payment Rs. ${data.amount.toLocaleString('en-PK')} to ${supplier.name}`,
        body: `${data.method.replace('_', ' ')}${data.reference ? ` · Ref ${data.reference}` : ''}`,
        severity: 'info',
        kind: 'payment',
        link: '/suppliers',
      });

      return updated;
    });

    res.json(serialize.supplier(result));
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'SUPPLIER_NOT_FOUND') return res.status(404).json({ error: 'Supplier not found' });
    return sendParseError(res, error);
  }
});

// ─── M3 — Medicine ↔ Supplier (distributor) mapping ─────────────────────────

app.get('/api/medicine-suppliers', requireAuth, async (req, res) => {
  const rows = await prisma.medicineSupplier.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { createdAt: 'asc' },
  });
  res.json(rows.map(serialize.medicineSupplier));
});

app.post('/api/medicine-suppliers', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const data = medicineSupplierCreateSchema.parse(req.body);
    const row = await prisma.medicineSupplier.create({
      data: { ...data, tenantId: tenantId(req) },
    });
    res.status(201).json(serialize.medicineSupplier(row));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'This medicine is already mapped to that supplier' });
    }
    return sendParseError(res, error);
  }
});

app.patch('/api/medicine-suppliers/:id', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const data = medicineSupplierPatchSchema.parse(req.body);
    const row = await prisma.medicineSupplier.update({
      where: { id: req.params.id, tenantId: tenantId(req) },
      data,
    });
    res.json(serialize.medicineSupplier(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/medicine-suppliers/:id', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  await prisma.medicineSupplier.delete({
    where: { id: req.params.id, tenantId: tenantId(req) },
  });
  res.json({ ok: true });
});

// ─── M3 — PurchaseInvoice (multi-invoice partial GRN) ───────────────────────

app.get('/api/purchase-invoices', requireAuth, async (req, res) => {
  const where: { tenantId: string; purchaseId?: string } = { tenantId: tenantId(req) };
  if (typeof req.query.purchaseId === 'string') where.purchaseId = req.query.purchaseId;
  const rows = await prisma.purchaseInvoice.findMany({
    where,
    orderBy: { receivedAt: 'asc' },
  });
  res.json(rows.map(serialize.purchaseInvoice));
});

app.post('/api/purchase-invoices', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = purchaseInvoiceCreateSchema.parse(req.body);
    // Confirm the PO belongs to this tenant before recording.
    const po = await prisma.purchase.findFirst({
      where: { id: data.purchaseId, tenantId: tenantId(req) },
      select: { id: true, branchId: true },
    });
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    if (!(await assertBranchWrite(req, res, po.branchId))) return;
    const row = await prisma.purchaseInvoice.create({
      data: {
        ...data,
        receivedAt: data.receivedAt ?? new Date(),
        tenantId: tenantId(req),
        createdBy: req.auth?.userId ?? 'system',
      },
    });
    res.status(201).json(serialize.purchaseInvoice(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/purchase-invoices/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  await prisma.purchaseInvoice.delete({
    where: { id: req.params.id, tenantId: tenantId(req) },
  });
  res.json({ ok: true });
});

// ─── M3 — PurchaseReturn (return stock to distributor) ──────────────────────

app.get('/api/purchase-returns', requireAuth, async (req, res) => {
  const rows = await prisma.purchaseReturn.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { returnDate: 'desc' },
    take: 500,
  });
  res.json(rows.map(serialize.purchaseReturn));
});

app.post('/api/purchase-returns', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = purchaseReturnCreateSchema.parse(req.body);
    const id = tenantId(req);

    // Verify supplier exists in this tenant.
    const sup = await prisma.supplier.findFirst({ where: { id: data.supplierId, tenantId: id } });
    if (!sup) return res.status(404).json({ error: 'Supplier not found' });

    // Branch-RBAC: if this return ties back to a specific PO, the user needs
    // write access on that branch. Unscoped returns (supplier-level) skip.
    if (data.purchaseId) {
      const po = await prisma.purchase.findFirst({
        where: { id: data.purchaseId, tenantId: id },
        select: { branchId: true },
      });
      if (po && !(await assertBranchWrite(req, res, po.branchId))) return;
    }

    // Wrap in a tx so stock decrements + return creation succeed/fail together.
    // When stockAdjusted=true, decrement each batch.quantity by the returned
    // qty (clamped at 0). Write an audit + ledger entry for accounting trail.
    const result = await prisma.$transaction(async (tx) => {
      if (data.stockAdjusted) {
        for (const item of data.items) {
          const batch = await tx.batch.findFirst({ where: { id: item.batchId, tenantId: id } });
          if (!batch) continue;
          await tx.batch.update({
            where: { id: batch.id },
            data: { quantity: Math.max(0, batch.quantity - item.quantity) },
          });
        }
      }
      const created = await tx.purchaseReturn.create({
        data: {
          tenantId: id,
          returnNumber: data.returnNumber,
          supplierId: data.supplierId,
          purchaseId: data.purchaseId ?? null,
          returnDate: data.returnDate ?? new Date(),
          items: data.items as never,
          totalAmount: data.totalAmount,
          reason: data.reason,
          stockAdjusted: data.stockAdjusted,
          status: data.status,
          notes: data.notes ?? null,
          createdBy: req.auth?.userId ?? 'system',
        },
      });
      // Returns reduce what we owe the supplier — credit their balance.
      await tx.ledgerEntry.create({
        data: {
          tenantId: id,
          type: 'expense',
          referenceId: created.id,
          referenceType: 'purchase',
          amount: -data.totalAmount,
          description: `Return to ${sup.name} (${data.returnNumber}) — ${data.reason}`,
          createdBy: req.auth?.userId ?? 'system',
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: id,
          userId: req.auth?.userId ?? 'system',
          userName: 'System',
          action: 'PURCHASE_RETURN',
          module: 'purchases',
          details: `Return ${data.returnNumber} to ${sup.name} — Rs. ${data.totalAmount.toFixed(2)}`,
        },
      });
      // M5 — notify owners that a return was posted to a distributor.
      await emitNotification(tx, {
        tenantId: id,
        scope: 'role',
        role: 'owner',
        title: `Return to ${sup.name} — Rs. ${data.totalAmount.toLocaleString('en-PK')}`,
        body: `${data.returnNumber} · ${data.reason}${data.stockAdjusted ? '' : ' (stock not adjusted)'}`,
        severity: 'warning',
        kind: 'purchase_return',
        link: '/purchase-orders',
      });
      // M7 — outbox event so wholesale partner can act on the return.
      await emitOutbox(tx, {
        tenantId: id,
        event: 'purchase_return.created',
        payload: {
          returnId: created.id,
          returnNumber: data.returnNumber,
          supplierId: data.supplierId,
          totalAmount: data.totalAmount,
          reason: data.reason,
          itemsCount: data.items.length,
        },
      });
      return created;
    });

    res.status(201).json(serialize.purchaseReturn(result));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Return number already used' });
    }
    return sendParseError(res, error);
  }
});

// ─── M4 — Audit log viewer ─────────────────────────────────────────────────
// Read-only paginated query with simple filters. Manager+ only — staff can't
// browse the audit trail (they CAN trigger entries via their actions).
app.get('/api/audit-logs', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const tId = tenantId(req);
  const { from, to, userId, module, action, q, limit } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = { tenantId: tId };
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    where.createdAt = range;
  }
  if (userId) where.userId = userId;
  if (module) where.module = module;
  if (action) where.action = action;
  if (q) where.details = { contains: q };

  const take = Math.min(2000, Math.max(1, parseInt(limit ?? '500', 10) || 500));
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json(rows.map(serialize.auditLog));
});

// ─── M5 — Notifications ────────────────────────────────────────────────────
// Returns the active inbox for the current user: tenant-wide rows, role rows
// matching their role, and user rows targeting their id. Polled every ~30s by
// the frontend (light query, indexed). Capped at 100 rows so even a noisy
// tenant doesn't blow up the dropdown.
app.get('/api/notifications', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const userId = req.auth!.userId;
  const role = req.auth!.role;
  const includeDismissed = req.query.includeDismissed === '1';
  const rows = await prisma.notification.findMany({
    where: {
      tenantId: tId,
      OR: [
        { scope: 'tenant' },
        { scope: 'user', userId },
        { scope: 'role', role },
      ],
      ...(includeDismissed ? {} : { dismissedAt: null }),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(rows.map(serialize.notification));
});

app.post('/api/notifications/:id/dismiss', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const userId = req.auth!.userId;
  const role = req.auth!.role;
  // Only allow dismissing notifications the user can actually see.
  const row = await prisma.notification.findFirst({
    where: {
      id: req.params.id,
      tenantId: tId,
      OR: [
        { scope: 'tenant' },
        { scope: 'user', userId },
        { scope: 'role', role },
      ],
    },
  });
  if (!row) return res.status(404).json({ error: 'Notification not found' });
  const updated = await prisma.notification.update({
    where: { id: row.id },
    data: { dismissedAt: new Date() },
  });
  res.json(serialize.notification(updated));
});

app.post('/api/notifications/dismiss-all', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const userId = req.auth!.userId;
  const role = req.auth!.role;
  const result = await prisma.notification.updateMany({
    where: {
      tenantId: tId,
      dismissedAt: null,
      OR: [
        { scope: 'tenant' },
        { scope: 'user', userId },
        { scope: 'role', role },
      ],
    },
    data: { dismissedAt: new Date() },
  });
  res.json({ ok: true, dismissed: result.count });
});

// ─── M5.1 — Web Push subscriptions ─────────────────────────────────────────
// One row per (tenant, endpoint). Re-subscribing the same endpoint for a
// different user (e.g. user A logs out, user B logs in on same device) updates
// the row in place so we don't end up sending pushes to the wrong human.

const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(500),
  p256dh: z.string().min(8).max(200),
  authKey: z.string().min(8).max(100),
  userAgent: z.string().trim().max(300).optional(),
});

// Convenience GET so the frontend can fetch the public key without going
// through the import.meta.env-baked-in route (useful when the public key needs
// to rotate without rebuilding the bundle).
app.get('/api/push/vapid-key', requireAuth, (_req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(404).json({ error: 'Push disabled' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  try {
    const data = pushSubscribeSchema.parse(req.body);
    const tId = tenantId(req);
    const row = await prisma.pushSubscription.upsert({
      where: { tenantId_endpoint: { tenantId: tId, endpoint: data.endpoint } },
      update: {
        userId: req.auth!.userId,
        p256dh: data.p256dh,
        authKey: data.authKey,
        userAgent: data.userAgent ?? null,
      },
      create: {
        tenantId: tId,
        userId: req.auth!.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        authKey: data.authKey,
        userAgent: data.userAgent ?? null,
      },
    });
    res.status(201).json({ ok: true, id: row.id });
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Endpoint is unique enough that we don't need a row id to remove the
// subscription. Pass it in the body.
app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  await prisma.pushSubscription.deleteMany({
    where: { tenantId: tenantId(req), endpoint, userId: req.auth!.userId },
  });
  res.json({ ok: true });
});

// Sends a sample push to all of the current user's subscriptions. Useful for
// the user to verify their browser was actually granted permission.
app.post('/api/push/test', requireAuth, async (req, res) => {
  if (!webPush) return res.status(503).json({ error: 'Push disabled on server' });
  const subs = await prisma.pushSubscription.findMany({
    where: { tenantId: tenantId(req), userId: req.auth!.userId },
  });
  if (subs.length === 0) return res.status(400).json({ error: 'No subscriptions for this user' });
  const payload = JSON.stringify({
    title: 'Push test',
    body: 'If you see this, web-push is working end-to-end.',
    link: '/',
    kind: 'system',
    severity: 'info',
  });
  let sent = 0; let failed = 0;
  for (const s of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } },
        payload,
        { TTL: 60 },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      }
      failed++;
    }
  }
  res.json({ ok: true, sent, failed, total: subs.length });
});

// ─── M6 — Shift sessions ───────────────────────────────────────────────────
// Each cashier/salesperson opens a shift with an opening cash count, runs
// sales, then closes with a closing cash count. Optional — only enforced when
// AppSettings.shiftCloseEnabled is true.

app.get('/api/shift-sessions', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const filterStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
  const branchFilter = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const rows = await prisma.shiftSession.findMany({
    where: {
      tenantId: tId,
      ...(filterStatus ? { status: filterStatus } : {}),
      ...(branchFilter ? { branchId: branchFilter } : {}),
    },
    orderBy: { openedAt: 'desc' },
    take: 100,
  });
  res.json(rows.map(serialize.shiftSession));
});

// Local YYYY-MM-DD for a date (server local time — matches how businessDate is
// stored as local midnight).
function localDayStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A shift belongs to a *business* day, which is usually its calendar open date —
// but if that day was already closed (Z-report posted) before the shift opened,
// the shift rolls into the NEXT business day and stays there until it too is
// closed. This lets staff start the next shift right after a day close.
async function shiftsForBusinessDay(tId: string, branchId: string, dateStr: string) {
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);
  // A shift can roll in from the previous calendar day, so widen the fetch.
  const prevStart = new Date(dayStart); prevStart.setDate(prevStart.getDate() - 1);
  const [shifts, closes] = await Promise.all([
    prisma.shiftSession.findMany({
      where: { tenantId: tId, branchId, openedAt: { gte: prevStart, lte: dayEnd } },
      orderBy: { openedAt: 'asc' },
    }),
    prisma.dayClose.findMany({ where: { tenantId: tId, branchId }, select: { businessDate: true, closedAt: true } }),
  ]);
  // Latest close time per calendar day.
  const closeByDay = new Map<string, number>();
  for (const c of closes) {
    const k = localDayStr(new Date(c.businessDate));
    const t = new Date(c.closedAt).getTime();
    if (!closeByDay.has(k) || t > closeByDay.get(k)!) closeByDay.set(k, t);
  }
  const effectiveDate = (openedAt: Date): string => {
    const base = new Date(openedAt);
    const k = localDayStr(base);
    const closedAt = closeByDay.get(k);
    if (closedAt != null && closedAt < new Date(openedAt).getTime()) {
      const next = new Date(base); next.setHours(0, 0, 0, 0); next.setDate(next.getDate() + 1);
      return localDayStr(next);
    }
    return k;
  };
  return shifts.filter((s) => effectiveDate(new Date(s.openedAt)) === dateStr);
}

// Derive a business day's cash position from the shifts attributed to it: opening
// cash is the first shift opened, closing cash is the last shift closed (one
// drawer handed across shifts). Auto-fills the day-end close.
async function deriveDayCashFromShifts(tId: string, branchId: string, dateStr: string) {
  const shifts = await shiftsForBusinessDay(tId, branchId, dateStr);
  const openingCash = shifts.length ? shifts[0].openingCash : null;
  const closed = shifts
    .filter((s) => s.closedAt != null)
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());
  const closingCash = closed.length ? (closed[closed.length - 1].closingCash ?? null) : null;
  return {
    openingCash,
    closingCash,
    shiftCount: shifts.length,
    openShiftCount: shifts.filter((s) => s.status === 'open').length,
  };
}

app.get('/api/shift-sessions/day-cash', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : '';
  const dateStr = typeof req.query.date === 'string' ? req.query.date : '';
  if (!branchId || !dateStr) return res.status(400).json({ error: 'branchId and date are required' });
  res.json(await deriveDayCashFromShifts(tId, branchId, dateStr));
});

// Shifts attributed to a business day (with the post-close rollover applied).
app.get('/api/shift-sessions/by-business-day', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : '';
  const dateStr = typeof req.query.date === 'string' ? req.query.date : '';
  if (!branchId || !dateStr) return res.status(400).json({ error: 'branchId and date are required' });
  const rows = await shiftsForBusinessDay(tId, branchId, dateStr);
  res.json(rows.map(serialize.shiftSession));
});

// Returns the caller's currently open shift (if any) so the POS can decide
// whether to show "Open shift" or "Take payment" buttons.
app.get('/api/shift-sessions/current', requireAuth, async (req, res) => {
  const row = await prisma.shiftSession.findFirst({
    where: { tenantId: tenantId(req), userId: req.auth!.userId, status: 'open' },
    orderBy: { openedAt: 'desc' },
  });
  res.json(row ? serialize.shiftSession(row) : null);
});

app.post('/api/shift-sessions/open', requireAuth, async (req, res) => {
  try {
    const data = shiftOpenSchema.parse(req.body);
    const tId = tenantId(req);
    const userId = req.auth!.userId;
    // Branch must be writable by this user (read-only viewers can't open shifts).
    const access = await getBranchAccess(tId, userId, data.branchId);
    if (access !== 'full') return res.status(403).json({ error: 'No write access on this branch' });
    // One open shift per user at a time — close the previous before re-opening.
    const existing = await prisma.shiftSession.findFirst({
      where: { tenantId: tId, userId, status: 'open' },
    });
    if (existing) return res.status(409).json({ error: 'A shift is already open. Close it first.' });
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId: tId } });
    const row = await prisma.shiftSession.create({
      data: {
        tenantId: tId,
        branchId: data.branchId,
        userId,
        userName: user?.name ?? null,
        openingCash: data.openingCash,
        status: 'open',
        notes: data.notes ?? null,
      },
    });
    res.status(201).json(serialize.shiftSession(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.post('/api/shift-sessions/:id/close', requireAuth, async (req, res) => {
  try {
    const data = shiftCloseSchema.parse(req.body);
    const tId = tenantId(req);
    const session = await prisma.shiftSession.findFirst({
      where: { id: req.params.id, tenantId: tId },
    });
    if (!session) return res.status(404).json({ error: 'Shift not found' });
    if (session.userId !== req.auth!.userId && !['owner', 'manager', 'superadmin'].includes(req.auth?.role ?? '')) {
      return res.status(403).json({ error: 'Only the shift owner or a manager can close this shift' });
    }
    if (session.status !== 'open') return res.status(400).json({ error: 'Shift is already closed' });
    // Compute totals from sales/returns inside the shift window. Branch +
    // salesperson + time window keeps it tight to what the cashier actually did.
    const since = session.openedAt;
    const until = new Date();
    const [sales, returns] = await Promise.all([
      prisma.sale.findMany({
        where: {
          tenantId: tId,
          branchId: session.branchId,
          salesPersonId: session.userId,
          saleDate: { gte: since, lte: until },
          status: { in: ['completed', 'partial_returned'] },
        },
        select: { totalAmount: true, paymentMethods: true },
      }),
      prisma.saleReturn.findMany({
        where: {
          tenantId: tId,
          returnDate: { gte: since, lte: until },
          createdBy: session.userId,
        },
        select: { totalAmount: true, refundMethod: true },
      }),
    ]);
    const salesTotal = sales.reduce((s, x) => s + (x.totalAmount ?? 0), 0);
    const returnsTotal = returns.reduce((s, x) => s + (x.totalAmount ?? 0), 0);

    // Per-operator cash reconciliation (Marg "Mode of Payment" tally).
    const summary = computeShiftSummary({
      openingCash: session.openingCash,
      closingCash: data.closingCash,
      sales,
      returns,
    });
    const { difference } = summary;

    const updated = await prisma.shiftSession.update({
      where: { id: session.id },
      data: {
        closedAt: until,
        closingCash: data.closingCash,
        salesTotal,
        returnsTotal,
        summary: summary as unknown as Prisma.InputJsonValue,
        status: 'closed',
        notes: data.notes ?? session.notes,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: tId,
        userId: req.auth?.userId ?? 'system',
        userName: session.userName ?? 'System',
        action: 'SHIFT_CLOSE',
        module: 'pos',
        details: `Shift closed: sales Rs. ${salesTotal.toFixed(2)}, closing cash Rs. ${data.closingCash.toFixed(2)}, drawer ${difference >= 0 ? 'over' : 'short'} Rs. ${Math.abs(difference).toFixed(2)}`,
      },
    });
    res.json(serialize.shiftSession(updated));
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Adjust a shift's cash counts / notes after the fact — used to correct a
// miscounted drawer before the day is finalized. Owner/manager (or the shift's
// own user) only. Locked once a day-close has been posted for that branch+day.
const shiftPatchSchema = z.object({
  openingCash: z.number().nonnegative().optional(),
  closingCash: z.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
});
app.patch('/api/shift-sessions/:id', requireAuth, async (req, res) => {
  try {
    const tId = tenantId(req);
    const data = shiftPatchSchema.parse(req.body);
    const session = await prisma.shiftSession.findFirst({ where: { id: req.params.id, tenantId: tId } });
    if (!session) return res.status(404).json({ error: 'Shift not found' });
    const isManager = ['owner', 'manager', 'superadmin'].includes(req.auth?.role ?? '');
    if (session.userId !== req.auth!.userId && !isManager) {
      return res.status(403).json({ error: 'Only the shift owner or a manager can edit this shift' });
    }
    // Frozen only if a day-close actually captured this shift — i.e. a close on
    // the shift's open-date that was posted at/after it opened. A shift opened
    // AFTER a close rolled into the next (still-open) business day, so it stays
    // editable.
    const dayStart = new Date(session.openedAt); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(session.openedAt); dayEnd.setHours(23, 59, 59, 999);
    const capturing = await prisma.dayClose.findFirst({
      where: {
        tenantId: tId,
        branchId: session.branchId,
        businessDate: { gte: dayStart, lte: dayEnd },
        closedAt: { gte: session.openedAt },
      },
    });
    if (capturing) return res.status(409).json({ error: 'This day has been closed — shift figures are locked.' });
    const updated = await prisma.shiftSession.update({
      where: { id: session.id },
      data: {
        ...(data.openingCash !== undefined ? { openingCash: data.openingCash } : {}),
        ...(data.closingCash !== undefined ? { closingCash: data.closingCash } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
    res.json(serialize.shiftSession(updated));
  } catch (error) {
    return sendParseError(res, error);
  }
});

// ─── M6 — Day-end close ────────────────────────────────────────────────────
// Manager+ runs at end of business. Aggregates the day's sales + returns +
// expenses into a single closeable summary; future sales/returns can still be
// posted but won't affect the historical row.

app.get('/api/day-closes', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const tId = tenantId(req);
  const branchFilter = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const rows = await prisma.dayClose.findMany({
    where: { tenantId: tId, ...(branchFilter ? { branchId: branchFilter } : {}) },
    orderBy: { businessDate: 'desc' },
    take: 200,
  });
  res.json(rows.map(serialize.dayClose));
});

app.post('/api/day-closes', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = dayCloseCreateSchema.parse(req.body);
    const tId = tenantId(req);
    // Branch must be writable by this user.
    const access = await getBranchAccess(tId, req.auth!.userId, data.branchId);
    if (access !== 'full') return res.status(403).json({ error: 'Read-only access on this branch' });

    // Day boundaries: 00:00 to 23:59:59.999 of the chosen business date.
    const dayStart = new Date(data.businessDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(data.businessDate);
    dayEnd.setHours(23, 59, 59, 999);

    const [sales, returns, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: {
          tenantId: tId,
          branchId: data.branchId,
          saleDate: { gte: dayStart, lte: dayEnd },
          status: { in: ['completed', 'partial_returned', 'returned'] },
        },
        select: {
          totalAmount: true,
          taxAmount: true,
          discountAmount: true,
          paymentMethods: true,
          fbrStatus: true,
        },
      }),
      prisma.saleReturn.findMany({
        where: { tenantId: tId, returnDate: { gte: dayStart, lte: dayEnd } },
        select: { totalAmount: true },
      }),
      prisma.expense.findMany({
        where: { tenantId: tId, date: { gte: dayStart, lte: dayEnd } },
        select: { amount: true },
      }),
    ]);

    const byMethod: Record<string, number> = {};
    let taxTotal = 0;
    let discountTotal = 0;
    let salesTotal = 0;
    let fbrSubmitted = 0;
    let fbrFailed = 0;
    for (const s of sales) {
      salesTotal += s.totalAmount ?? 0;
      taxTotal += s.taxAmount ?? 0;
      discountTotal += s.discountAmount ?? 0;
      const methods = (s.paymentMethods as Array<{ method: string; amount: number }>) ?? [];
      for (const m of methods) {
        byMethod[m.method] = (byMethod[m.method] ?? 0) + (m.amount ?? 0);
      }
      if (s.fbrStatus === 'submitted') fbrSubmitted++;
      if (s.fbrStatus === 'failed') fbrFailed++;
    }
    const returnsTotal = returns.reduce((s, x) => s + (x.totalAmount ?? 0), 0);
    const expensesTotal = expenses.reduce((s, x) => s + (x.amount ?? 0), 0);

    // Opening/closing cash: use what the form sent, else fall back to the day's
    // shift sessions (first opened / last closed) so the close reflects the
    // drawer counts the cashiers actually entered.
    const dayCash = await deriveDayCashFromShifts(tId, data.branchId, localDayStr(dayStart));
    const openingCash = data.openingCash ?? dayCash.openingCash;
    const closingCash = data.closingCash ?? dayCash.closingCash;

    const user = await prisma.user.findFirst({ where: { id: req.auth!.userId, tenantId: tId } });
    const row = await prisma.dayClose.create({
      data: {
        tenantId: tId,
        branchId: data.branchId,
        businessDate: dayStart,
        closedBy: req.auth!.userId,
        closedByName: user?.name ?? null,
        openingCash: openingCash ?? null,
        closingCash: closingCash ?? null,
        salesTotal,
        returnsTotal,
        expensesTotal,
        summary: {
          byMethod,
          taxTotal,
          discountTotal,
          salesCount: sales.length,
          fbrSubmitted,
          fbrFailed,
          shiftCount: dayCash.shiftCount,
          openShiftCount: dayCash.openShiftCount,
        },
        notes: data.notes ?? null,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: tId,
        userId: req.auth!.userId,
        userName: user?.name ?? 'System',
        action: 'DAY_CLOSE',
        module: 'reports',
        details: `Day close for ${dayStart.toLocaleDateString()} — sales Rs. ${salesTotal.toFixed(2)}, ${sales.length} invoices`,
      },
    });
    res.status(201).json(serialize.dayClose(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

// ─── M7 — Wholesale / hospital / clinic partners ───────────────────────────
// Real HTTP delivery is stubbed (worker logs and marks failed). Schema +
// emitter wiring exist so the integration point is ready when the wholesale
// app comes online.

const partnerCreateSchema = z.object({
  type: z.enum(['wholesale', 'hospital', 'clinic']),
  name: z.string().trim().min(1).max(200),
  baseUrl: z.string().url().max(500).optional().or(z.literal('').transform(() => undefined)),
  apiKey: z.string().trim().min(8).max(500).optional(),
  inboundSecret: z.string().trim().min(8).max(200).optional(),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});
const partnerPatchSchema = partnerCreateSchema.partial();

app.get('/api/partners', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const rows = await prisma.partner.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { createdAt: 'asc' },
  });
  res.json(rows.map(serialize.partner));
});

app.post('/api/partners', requireAuth, requireRole('superadmin', 'owner'), async (req, res) => {
  try {
    const data = partnerCreateSchema.parse(req.body);
    const apiKeyEncrypted = data.apiKey && process.env.FBR_TOKEN_KEY ? encryptToken(data.apiKey) : null;
    const row = await prisma.partner.create({
      data: {
        tenantId: tenantId(req),
        type: data.type,
        name: data.name,
        baseUrl: data.baseUrl ?? null,
        apiKeyEncrypted,
        inboundSecret: data.inboundSecret ?? null,
        isActive: data.isActive,
        notes: data.notes ?? null,
      },
    });
    res.status(201).json(serialize.partner(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.patch('/api/partners/:id', requireAuth, requireRole('superadmin', 'owner'), async (req, res) => {
  try {
    const data = partnerPatchSchema.parse(req.body);
    const updateData: Record<string, unknown> = { ...data };
    if (data.apiKey !== undefined) {
      delete updateData.apiKey;
      // Empty string clears the key; non-empty re-encrypts. FBR_TOKEN_KEY env var
      // is required to encrypt — otherwise we save null and the partner stays
      // un-configured.
      if (data.apiKey && process.env.FBR_TOKEN_KEY) {
        updateData.apiKeyEncrypted = encryptToken(data.apiKey);
      } else if (!data.apiKey) {
        updateData.apiKeyEncrypted = null;
      }
    }
    if (data.baseUrl === undefined) delete updateData.baseUrl;
    const row = await prisma.partner.update({
      where: { id: req.params.id, tenantId: tenantId(req) },
      data: updateData,
    });
    res.json(serialize.partner(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/partners/:id', requireAuth, requireRole('superadmin', 'owner'), async (req, res) => {
  await prisma.partner.delete({ where: { id: req.params.id, tenantId: tenantId(req) } });
  res.json({ ok: true });
});

// ═══ B2B Network (in-platform tenant↔tenant: connect by handle, chat, orders) ══
// Every row links two tenants; access is membership-gated, never tenant-scoped.
// No webhooks/outbox — delivery is in-DB + the peer's notification + 30s poll.
const TENANT_MINI = { id: true, handle: true, name: true, businessType: true, isActive: true } as const;
const BUSINESS_TYPES = ['pharmacy', 'distributor', 'wholesaler'] as const;

// Load the Connection for (me ↔ other) by membership. Returns it only when both
// are members; throws-style 403 handled by callers via the null/ status checks.
async function getConnectionBetween(me: string, other: string) {
  const [a, b] = me < other ? [me, other] : [other, me];
  return prisma.connection.findUnique({ where: { aTenantId_bTenantId: { aTenantId: a, bTenantId: b } } });
}
function isMember(conn: { aTenantId: string; bTenantId: string } | null, me: string) {
  return !!conn && (conn.aTenantId === me || conn.bTenantId === me);
}

// Update this tenant's network identity (handle + business type).
app.patch('/api/network/profile', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const id = tenantId(req);
  const handleRaw = typeof req.body?.handle === 'string' ? req.body.handle.trim().toLowerCase() : undefined;
  const businessType = typeof req.body?.businessType === 'string' ? req.body.businessType : undefined;
  const data: Record<string, unknown> = {};
  if (handleRaw !== undefined) {
    if (!/^[a-z0-9-]{3,40}$/.test(handleRaw)) return res.status(400).json({ error: 'Username must be 3–40 chars: lowercase letters, numbers, hyphens.' });
    const clash = await prisma.tenant.findFirst({ where: { handle: handleRaw, id: { not: id } }, select: { id: true } });
    if (clash) return res.status(409).json({ error: 'That username is already taken.' });
    data.handle = handleRaw;
  }
  if (businessType !== undefined) {
    if (!BUSINESS_TYPES.includes(businessType as typeof BUSINESS_TYPES[number])) return res.status(400).json({ error: 'Invalid business type.' });
    data.businessType = businessType;
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  const t = await prisma.tenant.update({ where: { id }, data, select: TENANT_MINI });
  res.json(t);
});

// Look up another business by exact handle — whitelisted public fields only.
app.get('/api/network/lookup', requireAuth, async (req, res) => {
  const handle = typeof req.query.handle === 'string' ? req.query.handle.trim().toLowerCase() : '';
  if (!handle) return res.status(400).json({ error: 'handle is required' });
  const me = tenantId(req);
  const t = await prisma.tenant.findUnique({ where: { handle }, select: TENANT_MINI });
  if (!t || !t.isActive) return res.status(404).json({ error: 'No active business with that username.' });
  if (t.id === me) return res.status(400).json({ error: "That's your own username." });
  const existing = await getConnectionBetween(me, t.id);
  res.json({ id: t.id, handle: t.handle, name: t.name, businessType: t.businessType, connectionStatus: existing?.status ?? null });
});

// Item 3 — discoverable directory of every other active business on the
// platform (hospitals / distributors / wholesalers), each tagged with its
// connection status to the current tenant so the Inbox can offer "add request".
app.get('/api/network/directory', requireAuth, async (req, res) => {
  const me = tenantId(req);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive: true,
      id: { not: me },
      ...(q ? { OR: [{ handle: { contains: q } }, { name: { contains: q } }] } : {}),
    },
    select: TENANT_MINI,
    orderBy: { name: 'asc' },
    take: 200,
  });
  // One query for all of my connections, then map status per business.
  const conns = await prisma.connection.findMany({ where: { OR: [{ aTenantId: me }, { bTenantId: me }] } });
  const statusFor = (id: string) => {
    const c = conns.find((x) => (x.aTenantId === me && x.bTenantId === id) || (x.bTenantId === me && x.aTenantId === id));
    return c?.status ?? null;
  };
  res.json(tenants.map((t) => ({ id: t.id, handle: t.handle, name: t.name, businessType: t.businessType, connectionStatus: statusFor(t.id) })));
});

// My connections (membership), with peer info + unread counts.
app.get('/api/network/connections', requireAuth, async (req, res) => {
  const me = tenantId(req);
  const rows = await prisma.connection.findMany({
    where: { OR: [{ aTenantId: me }, { bTenantId: me }], status: { not: 'disconnected' } },
    include: { aTenant: { select: TENANT_MINI }, bTenant: { select: TENANT_MINI } },
    orderBy: { updatedAt: 'desc' },
  });
  const unread = await prisma.connectionMessage.groupBy({
    by: ['connectionId'],
    where: { connectionId: { in: rows.map((r) => r.id) }, senderTenantId: { not: me }, readAt: null },
    _count: { _all: true },
  });
  const unreadByConn = new Map(unread.map((u) => [u.connectionId, u._count._all]));
  res.json(rows.map((r) => serialize.connection({ ...r, _unread: unreadByConn.get(r.id) ?? 0 }, me)));
});

// Send a connection request by handle.
app.post('/api/network/connections', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const me = tenantId(req);
  const handle = typeof req.body?.handle === 'string' ? req.body.handle.trim().toLowerCase() : '';
  if (!handle) return res.status(400).json({ error: 'handle is required' });
  const peer = await prisma.tenant.findUnique({ where: { handle }, select: { id: true, isActive: true, name: true } });
  if (!peer || !peer.isActive) return res.status(404).json({ error: 'No active business with that username.' });
  if (peer.id === me) return res.status(400).json({ error: "You can't connect to yourself." });
  const [a, b] = me < peer.id ? [me, peer.id] : [peer.id, me];
  const existing = await prisma.connection.findUnique({ where: { aTenantId_bTenantId: { aTenantId: a, bTenantId: b } } });
  if (existing && (existing.status === 'accepted' || existing.status === 'pending')) {
    return res.status(409).json({ error: existing.status === 'accepted' ? 'Already connected.' : 'A request is already pending.' });
  }
  const conn = existing
    ? await prisma.connection.update({ where: { id: existing.id }, data: { status: 'pending', requestedByTenantId: me, blockedByTenantId: null } })
    : await prisma.connection.create({ data: { aTenantId: a, bTenantId: b, status: 'pending', requestedByTenantId: me } });
  const myName = (await prisma.tenant.findUnique({ where: { id: me }, select: { name: true, handle: true } }));
  await emitNotification(prisma, { tenantId: peer.id, scope: 'role', role: 'owner', kind: 'network', severity: 'info',
    title: 'New connection request', body: `${myName?.name ?? 'A business'} (@${myName?.handle ?? ''}) wants to connect.`, link: '/network' });
  const full = await prisma.connection.findUnique({ where: { id: conn.id }, include: { aTenant: { select: TENANT_MINI }, bTenant: { select: TENANT_MINI } } });
  res.status(201).json(serialize.connection(full, me));
});

// Connection lifecycle transitions.
async function connTransition(req: express.Request, res: express.Response, action: 'accept' | 'decline' | 'disconnect' | 'block') {
  const me = tenantId(req);
  const conn = await prisma.connection.findFirst({ where: { id: req.params.id, OR: [{ aTenantId: me }, { bTenantId: me }] } });
  if (!conn) return res.status(404).json({ error: 'Connection not found.' });
  if (action === 'accept' || action === 'decline') {
    if (conn.status !== 'pending') return res.status(409).json({ error: 'Request is not pending.' });
    if (conn.requestedByTenantId === me) return res.status(403).json({ error: 'Only the recipient can respond to a request.' });
  }
  const data: Record<string, unknown> =
    action === 'accept' ? { status: 'accepted' }
    : action === 'decline' ? { status: 'declined' }
    : action === 'block' ? { status: 'blocked', blockedByTenantId: me }
    : { status: 'disconnected' };
  const updated = await prisma.connection.update({ where: { id: conn.id }, data, include: { aTenant: { select: TENANT_MINI }, bTenant: { select: TENANT_MINI } } });
  if (action === 'accept') {
    const peerId = conn.aTenantId === me ? conn.bTenantId : conn.aTenantId;
    const myName = await prisma.tenant.findUnique({ where: { id: me }, select: { name: true } });
    await emitNotification(prisma, { tenantId: peerId, scope: 'role', role: 'owner', kind: 'network', severity: 'success',
      title: 'Connection accepted', body: `${myName?.name ?? 'A business'} accepted your request.`, link: '/network' });
  }
  res.json(serialize.connection(updated, me));
}
app.post('/api/network/connections/:id/accept', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => connTransition(req, res, 'accept'));
app.post('/api/network/connections/:id/decline', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => connTransition(req, res, 'decline'));
app.post('/api/network/connections/:id/disconnect', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => connTransition(req, res, 'disconnect'));
app.post('/api/network/connections/:id/block', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => connTransition(req, res, 'block'));

// ── Chat ──
app.get('/api/network/connections/:id/messages', requireAuth, async (req, res) => {
  const me = tenantId(req);
  const conn = await prisma.connection.findFirst({ where: { id: req.params.id, OR: [{ aTenantId: me }, { bTenantId: me }] } });
  if (!conn) return res.status(404).json({ error: 'Connection not found.' });
  const msgs = await prisma.connectionMessage.findMany({ where: { connectionId: conn.id }, orderBy: { createdAt: 'asc' }, take: 500 });
  // Mark the peer's messages as read.
  await prisma.connectionMessage.updateMany({ where: { connectionId: conn.id, senderTenantId: { not: me }, readAt: null }, data: { readAt: new Date() } });
  res.json(msgs.map((m) => serialize.connectionMessage(m, me)));
});

app.post('/api/network/connections/:id/messages', requireAuth, async (req, res) => {
  const me = tenantId(req);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ error: 'Message body is required.' });
  const conn = await prisma.connection.findFirst({ where: { id: req.params.id, OR: [{ aTenantId: me }, { bTenantId: me }] } });
  if (!conn) return res.status(404).json({ error: 'Connection not found.' });
  if (conn.status !== 'accepted') return res.status(403).json({ error: 'You can only message connected businesses.' });
  const myInfo = await prisma.tenant.findUnique({ where: { id: me }, select: { name: true } });
  const msg = await prisma.connectionMessage.create({ data: {
    connectionId: conn.id, senderTenantId: me, senderUserId: req.auth?.userId ?? null, senderName: myInfo?.name ?? null, body: body.slice(0, 4000),
  } });
  await prisma.connection.update({ where: { id: conn.id }, data: { updatedAt: new Date() } });
  const peerId = conn.aTenantId === me ? conn.bTenantId : conn.aTenantId;
  await emitNotification(prisma, { tenantId: peerId, scope: 'role', role: 'owner', kind: 'network', severity: 'info',
    title: `New message from ${myInfo?.name ?? 'a connection'}`, body: body.slice(0, 120), link: '/network' });
  res.status(201).json(serialize.connectionMessage(msg, me));
});

// ── Orders ──
const ORDER_INCLUDE = { items: true, connection: { include: { aTenant: { select: TENANT_MINI }, bTenant: { select: TENANT_MINI } } } } as const;

app.post('/api/network/orders', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const me = tenantId(req);
  const connectionId = typeof req.body?.connectionId === 'string' ? req.body.connectionId : '';
  const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 1000) : undefined;
  if (!connectionId || itemsIn.length === 0) return res.status(400).json({ error: 'connectionId and at least one item are required.' });
  const conn = await prisma.connection.findFirst({ where: { id: connectionId, OR: [{ aTenantId: me }, { bTenantId: me }] } });
  if (!conn || conn.status !== 'accepted') return res.status(403).json({ error: 'You can only order from a connected business.' });
  const sellerTenantId = conn.aTenantId === me ? conn.bTenantId : conn.aTenantId;
  const items = itemsIn.map((it: Record<string, unknown>) => ({
    productName: String(it.productName ?? '').slice(0, 300) || 'Item',
    strength: it.strength ? String(it.strength).slice(0, 100) : null,
    packSize: it.packSize ? String(it.packSize).slice(0, 100) : null,
    quantity: Math.max(1, parseInt(String(it.quantity ?? '1'), 10) || 1),
    buyerMedicineId: it.buyerMedicineId ? String(it.buyerMedicineId) : null,
  }));
  const totalQty = items.reduce((s: number, it: { quantity: number }) => s + it.quantity, 0);
  const orderNumber = `NO-${String(Date.now()).slice(-8)}`;
  const order = await prisma.networkOrder.create({
    data: { connectionId, buyerTenantId: me, sellerTenantId, orderNumber, status: 'placed', notes, totalQty,
      sourcePurchaseId: typeof req.body?.sourcePurchaseId === 'string' ? req.body.sourcePurchaseId : null,
      items: { create: items } },
    include: ORDER_INCLUDE,
  });
  const myInfo = await prisma.tenant.findUnique({ where: { id: me }, select: { name: true } });
  await emitNotification(prisma, { tenantId: sellerTenantId, scope: 'role', role: 'owner', kind: 'network', severity: 'info',
    title: `New order from ${myInfo?.name ?? 'a pharmacy'}`, body: `${order.orderNumber}: ${totalQty} unit(s) across ${items.length} item(s).`, link: '/network' });
  res.status(201).json(serialize.networkOrder(order, me));
});

app.get('/api/network/orders', requireAuth, async (req, res) => {
  const me = tenantId(req);
  const role = req.query.role === 'seller' ? 'seller' : req.query.role === 'buyer' ? 'buyer' : 'any';
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const where: Record<string, unknown> = {};
  if (role === 'seller') where.sellerTenantId = me;
  else if (role === 'buyer') where.buyerTenantId = me;
  else where.OR = [{ buyerTenantId: me }, { sellerTenantId: me }];
  if (status) where.status = status;
  const rows = await prisma.networkOrder.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json(rows.map((r) => serialize.networkOrder(r, me)));
});

app.get('/api/network/orders/:id', requireAuth, async (req, res) => {
  const me = tenantId(req);
  const order = await prisma.networkOrder.findFirst({ where: { id: req.params.id, OR: [{ buyerTenantId: me }, { sellerTenantId: me }] }, include: ORDER_INCLUDE });
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json(serialize.networkOrder(order, me));
});

const ORDER_ACTIONS: Record<string, { next: string; actor: 'buyer' | 'seller'; from: string[] }> = {
  accept: { next: 'accepted', actor: 'seller', from: ['placed'] },
  decline: { next: 'declined', actor: 'seller', from: ['placed'] },
  ship: { next: 'shipped', actor: 'seller', from: ['accepted'] },
  cancel: { next: 'cancelled', actor: 'buyer', from: ['placed', 'accepted'] },
  receive: { next: 'received', actor: 'buyer', from: ['accepted', 'shipped'] },
};
async function orderTransition(req: express.Request, res: express.Response, action: keyof typeof ORDER_ACTIONS) {
  const me = tenantId(req);
  const spec = ORDER_ACTIONS[action];
  const order = await prisma.networkOrder.findFirst({ where: { id: req.params.id, OR: [{ buyerTenantId: me }, { sellerTenantId: me }] }, include: { items: true } });
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const isSeller = order.sellerTenantId === me;
  if ((spec.actor === 'seller') !== isSeller) return res.status(403).json({ error: `Only the ${spec.actor} can ${action} this order.` });
  if (!spec.from.includes(order.status)) return res.status(409).json({ error: `Can't ${action} an order that is ${order.status}.` });

  let buyerPurchaseId: string | null = order.buyerPurchaseId;
  if (action === 'receive') {
    // Best-effort: create a DRAFT buyer-side Purchase from the order (no outbox).
    try {
      const branch = await prisma.branch.findFirst({ where: { tenantId: me, isActive: true }, select: { id: true } });
      const seller = await prisma.tenant.findUnique({ where: { id: order.sellerTenantId }, select: { name: true, handle: true } });
      const purchase = await prisma.purchase.create({ data: {
        tenantId: me,
        purchaseNumber: `NET-${String(Date.now()).slice(-8)}`,
        supplierId: 'network',
        branchId: branch?.id ?? '1',
        purchaseDate: new Date(),
        items: order.items.map((it) => ({
          id: `pi-${it.id}`, medicineId: it.buyerMedicineId ?? '', medicineName: it.productName,
          batchNumber: '', expiryDate: new Date(), quantity: it.quantity,
          purchasePrice: 0, salePrice: 0, mrp: 0, discountPercent: 0, taxPercent: 0, total: 0,
        })) as never,
        subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0, paidAmount: 0, balanceAmount: 0,
        status: 'draft',
        notes: `From Kynex network order ${order.orderNumber} — ${seller?.name ?? ''} (@${seller?.handle ?? ''})`,
        createdBy: req.auth?.userId ?? 'system',
      } });
      buyerPurchaseId = purchase.id;
    } catch (e) {
      console.warn('[network] receive→purchase draft failed:', (e as Error)?.message);
    }
  }
  const updated = await prisma.networkOrder.update({ where: { id: order.id }, data: { status: spec.next, buyerPurchaseId }, include: ORDER_INCLUDE });
  const peerId = isSeller ? order.buyerTenantId : order.sellerTenantId;
  await emitNotification(prisma, { tenantId: peerId, scope: 'role', role: 'owner', kind: 'network', severity: action === 'decline' || action === 'cancel' ? 'warning' : 'info',
    title: `Order ${order.orderNumber} ${spec.next}`, body: `An order was marked ${spec.next}.`, link: '/network' });
  res.json(serialize.networkOrder(updated, me));
}
app.post('/api/network/orders/:id/accept', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => orderTransition(req, res, 'accept'));
app.post('/api/network/orders/:id/decline', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => orderTransition(req, res, 'decline'));
app.post('/api/network/orders/:id/ship', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => orderTransition(req, res, 'ship'));
app.post('/api/network/orders/:id/cancel', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => orderTransition(req, res, 'cancel'));
app.post('/api/network/orders/:id/receive', requireAuth, requireRole('superadmin', 'owner', 'manager'), (req, res) => orderTransition(req, res, 'receive'));

// ─── M7 — Outbox helper + worker stub ──────────────────────────────────────
// Emits an outbox row for every configured active partner. Real HTTP delivery
// is intentionally stubbed: the worker function logs the attempt and marks
// the row 'failed' so the integration point exists without us pretending to
// talk to a non-existent backend. When the wholesale app comes online, swap
// `deliverOutboxEvent` for a real fetch + signature + retry.
async function emitOutbox(
  client: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  opts: { tenantId: string; event: string; payload: Record<string, unknown> },
): Promise<void> {
  try {
    const partners = await (client as typeof prisma).partner.findMany({
      where: { tenantId: opts.tenantId, isActive: true },
    });
    if (partners.length === 0) return;
    for (const p of partners) {
      await (client as typeof prisma).outboxEvent.create({
        data: {
          tenantId: opts.tenantId,
          partnerId: p.id,
          event: opts.event,
          payload: opts.payload as never,
          status: 'pending',
        },
      });
    }
  } catch (err) {
    console.warn('[outbox] emit failed:', err);
  }
}

app.get('/api/outbox', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const filter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const rows = await prisma.outboxEvent.findMany({
    where: { tenantId: tenantId(req), ...(filter ? { status: filter } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(rows.map(serialize.outboxEvent));
});

// Manual outbox worker trigger. Stubbed: each pending row is "delivered" by
// logging it server-side and being marked 'failed' with a placeholder error.
// Owner can retry once the real backend is reachable; the swap to real HTTP
// is a single function body change.
// Real HTTP delivery for one outbox row. Returns the outcome ready for the
// caller to persist. Independent of the request lifecycle so a future
// background scheduler can call it on a cron tick.
//
// Wire format:
//   POST {baseUrl}/webhooks/{event_with_dots_replaced_by_slash}
//   Headers:
//     content-type: application/json
//     x-pharmapos-event: {event}
//     x-pharmapos-signature: HMAC-SHA256(secret, body).hex
//   Body: { tenantId, event, payload, sentAt }
//
// `secret` is partner.inboundSecret (shared symmetric secret — same one we
// already verify on inbound). 10s timeout. Considered successful on HTTP 2xx.
async function deliverOutboxEvent(row: {
  id: string;
  tenantId: string;
  partnerId: string | null;
  event: string;
  payload: unknown;
  retries: number;
}): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  if (!row.partnerId) return { ok: false, error: 'No partner attached' };
  const partner = await prisma.partner.findFirst({
    where: { id: row.partnerId, tenantId: row.tenantId },
  });
  if (!partner) return { ok: false, error: 'Partner not found' };
  if (!partner.isActive) return { ok: false, error: 'Partner is paused' };
  if (!partner.baseUrl) return { ok: false, error: 'Partner has no baseUrl' };

  const url = partner.baseUrl.replace(/\/$/, '') + '/webhooks/' + row.event.replace(/\./g, '/');
  const body = JSON.stringify({
    tenantId: row.tenantId,
    event: row.event,
    payload: row.payload,
    sentAt: new Date().toISOString(),
  });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-pharmapos-event': row.event,
  };
  if (partner.inboundSecret) {
    headers['x-pharmapos-signature'] = crypto
      .createHmac('sha256', partner.inboundSecret)
      .update(body)
      .digest('hex');
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const resp = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    if (!resp.ok) {
      const text = (await resp.text().catch(() => '')).slice(0, 500);
      return { ok: false, statusCode: resp.status, error: `HTTP ${resp.status}: ${text}` };
    }
    return { ok: true, statusCode: resp.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

// Drain up to N pending rows, applying real HTTP delivery + exponential backoff.
async function processOutboxBatch(tenantIdVal: string, limit: number): Promise<{ processed: number; sent: number; failed: number }> {
  const rows = await prisma.outboxEvent.findMany({
    where: {
      tenantId: tenantIdVal,
      status: 'pending',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const outcome = await deliverOutboxEvent({
      id: r.id,
      tenantId: r.tenantId,
      partnerId: r.partnerId,
      event: r.event,
      payload: r.payload,
      retries: r.retries,
    });
    if (outcome.ok) {
      await prisma.outboxEvent.update({
        where: { id: r.id },
        data: { status: 'sent', sentAt: new Date(), lastError: null, retries: r.retries + 1 },
      });
      sent++;
    } else {
      // Exponential backoff: 1m, 5m, 30m, 2h, 12h cap. After 5 retries, leave
      // pending with the longest backoff so a human can investigate.
      const backoffMin = [1, 5, 30, 120, 720][Math.min(r.retries, 4)];
      await prisma.outboxEvent.update({
        where: { id: r.id },
        data: {
          status: r.retries + 1 >= 5 ? 'failed' : 'pending',
          retries: r.retries + 1,
          lastError: outcome.error?.slice(0, 1000) ?? `HTTP ${outcome.statusCode ?? 'error'}`,
          nextAttemptAt: new Date(Date.now() + backoffMin * 60_000),
        },
      });
      failed++;
    }
  }
  return { processed: rows.length, sent, failed };
}

app.post('/api/outbox/process', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const tId = tenantId(req);
  const result = await processOutboxBatch(tId, 50);
  res.json({ ok: true, ...result });
});

// Manual retry for a single row: clears the backoff timer + re-queues.
app.post('/api/outbox/:id/retry', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const tId = tenantId(req);
  const row = await prisma.outboxEvent.findFirst({ where: { id: req.params.id, tenantId: tId } });
  if (!row) return res.status(404).json({ error: 'Outbox row not found' });
  if (row.status === 'sent') return res.status(400).json({ error: 'Row already sent' });
  await prisma.outboxEvent.update({
    where: { id: row.id },
    data: { status: 'pending', nextAttemptAt: null, lastError: null },
  });
  res.json({ ok: true });
});

// ─── M7 — Inbox (Threads + Messages) ──────────────────────────────────────

const threadCreateSchema = z.object({
  partnerId: z.string().optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  attachmentUrl: z.string().max(4 * 1024 * 1024).optional(),
});
const messageCreateSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  attachmentUrl: z.string().max(4 * 1024 * 1024).optional(),
});

app.get('/api/threads', requireAuth, async (req, res) => {
  const rows = await prisma.thread.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
  });
  res.json(rows.map(serialize.inboxThread));
});

app.post('/api/threads', requireAuth, async (req, res) => {
  try {
    const data = threadCreateSchema.parse(req.body);
    const tId = tenantId(req);
    const user = await prisma.user.findFirst({ where: { id: req.auth!.userId, tenantId: tId } });
    const result = await prisma.$transaction(async (tx) => {
      const thread = await tx.thread.create({
        data: { tenantId: tId, partnerId: data.partnerId ?? null, subject: data.subject },
      });
      const msg = await tx.message.create({
        data: {
          tenantId: tId,
          threadId: thread.id,
          senderType: 'tenant',
          senderName: user?.name ?? null,
          body: data.body,
          attachmentUrl: data.attachmentUrl ?? null,
        },
      });
      await tx.thread.update({
        where: { id: thread.id },
        data: { lastMessageAt: msg.createdAt },
      });
      // M7 — outbox event so the wholesale partner is notified.
      await emitOutbox(tx, {
        tenantId: tId,
        event: 'inbox_message.sent',
        payload: { threadId: thread.id, partnerId: data.partnerId ?? null, subject: data.subject, body: data.body },
      });
      return { thread, msg };
    });
    res.status(201).json({ thread: serialize.inboxThread(result.thread), message: serialize.inboxMessage(result.msg) });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.get('/api/threads/:id/messages', requireAuth, async (req, res) => {
  const tId = tenantId(req);
  const thread = await prisma.thread.findFirst({ where: { id: req.params.id, tenantId: tId } });
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  const rows = await prisma.message.findMany({
    where: { tenantId: tId, threadId: thread.id },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  // Mark unread inbound messages as read for the caller. unreadCount is the
  // count of messages with no readAt and from non-tenant senders.
  await prisma.$transaction([
    prisma.message.updateMany({
      where: { tenantId: tId, threadId: thread.id, readAt: null, NOT: { senderType: 'tenant' } },
      data: { readAt: new Date() },
    }),
    prisma.thread.update({ where: { id: thread.id }, data: { unreadCount: 0 } }),
  ]);
  res.json(rows.map(serialize.inboxMessage));
});

app.post('/api/threads/:id/messages', requireAuth, async (req, res) => {
  try {
    const data = messageCreateSchema.parse(req.body);
    const tId = tenantId(req);
    const thread = await prisma.thread.findFirst({ where: { id: req.params.id, tenantId: tId } });
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    const user = await prisma.user.findFirst({ where: { id: req.auth!.userId, tenantId: tId } });
    const result = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          tenantId: tId,
          threadId: thread.id,
          senderType: 'tenant',
          senderName: user?.name ?? null,
          body: data.body,
          attachmentUrl: data.attachmentUrl ?? null,
        },
      });
      await tx.thread.update({
        where: { id: thread.id },
        data: { lastMessageAt: msg.createdAt },
      });
      await emitOutbox(tx, {
        tenantId: tId,
        event: 'inbox_message.sent',
        payload: { threadId: thread.id, partnerId: thread.partnerId, body: data.body },
      });
      return msg;
    });
    res.status(201).json(serialize.inboxMessage(result));
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Inbound webhook stub. In production this would verify a partner signature
// (Partner.inboundSecret + HMAC) before accepting. For now any caller with a
// matching tenant slug + inboundSecret in the query string can post; the
// receiver tolerates being called with no signature when no partner is wired
// (useful for local testing).
app.post('/api/webhooks/wholesale/inbound', async (req, res) => {
  const { tenantSlug, partnerId, threadId, subject, body, senderName } = (req.body ?? {}) as {
    tenantSlug?: string;
    partnerId?: string;
    threadId?: string;
    subject?: string;
    body?: string;
    senderName?: string;
  };
  if (!tenantSlug || !body) return res.status(400).json({ error: 'tenantSlug and body are required' });
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  // SECURITY: fail CLOSED. This endpoint is unauthenticated (it's a partner
  // webhook), so it must require a known partner that has a shared secret AND a
  // matching signature — otherwise anyone who guesses a tenant slug could inject
  // inbox messages and fire owner notifications (spam / phishing vector).
  if (!partnerId) return res.status(401).json({ error: 'partnerId required' });
  const partner = await prisma.partner.findFirst({ where: { id: partnerId, tenantId: tenant.id } });
  if (!partner || !partner.inboundSecret) {
    return res.status(401).json({ error: 'Unknown partner or no inbound secret configured' });
  }
  const provided = String(req.query.signature ?? req.headers['x-pharmapos-signature'] ?? '');
  const expected = partner.inboundSecret;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let thread = threadId
    ? await prisma.thread.findFirst({ where: { id: threadId, tenantId: tenant.id } })
    : null;
  if (!thread) {
    thread = await prisma.thread.create({
      data: {
        tenantId: tenant.id,
        partnerId: partner?.id ?? null,
        subject: subject || 'Incoming message',
      },
    });
  }
  const senderType = partner?.type ?? 'wholesale';
  const result = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        tenantId: tenant.id,
        threadId: thread!.id,
        senderType,
        senderName: senderName ?? partner?.name ?? null,
        body,
      },
    });
    await tx.thread.update({
      where: { id: thread!.id },
      data: { lastMessageAt: msg.createdAt, unreadCount: { increment: 1 } },
    });
    // M5 — notify users so the bell pulses on inbound.
    await emitNotification(tx, {
      tenantId: tenant.id,
      scope: 'role',
      role: 'owner',
      title: `New message from ${partner?.name ?? senderType}`,
      body: body.length > 100 ? body.slice(0, 100) + '…' : body,
      severity: 'info',
      kind: 'wholesale',
      link: '/inbox',
    });
    return msg;
  });
  res.status(201).json({ ok: true, threadId: thread.id, messageId: result.id });
});

// ─── Wholesale inbound PO consumer ─────────────────────────────────────────
// Counterpart endpoint to outbox event `purchase_order.created` — the
// wholesale ERP can POST proposed POs back to this tenant. Verifies an
// HMAC-SHA256 signature using `partner.inboundSecret`, resolves medicines by
// barcode, and creates a draft `Purchase` so the owner can review.
//
// Authentication is partner-scoped, not user-scoped. The shared secret is the
// only credential. Always validates body, schema, signature, and tenant.
const wholesaleInboundPoSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(64),
  partnerId: z.string().min(1),
  purchaseNumber: z.string().trim().min(1).max(50).optional(),
  supplierName: z.string().trim().max(200).optional(),
  supplierId: z.string().optional(),
  branchId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    medicineBarcode: z.string().trim().min(1).max(100).optional(),
    medicineId: z.string().min(1).optional(),
    medicineName: z.string().trim().max(200).optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    total: z.number().nonnegative().optional(),
  })).min(1).max(500),
});

app.post('/api/webhooks/wholesale/po', async (req, res) => {
  try {
    const data = wholesaleInboundPoSchema.parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { slug: data.tenantSlug } });
    if (!tenant?.isActive) return res.status(404).json({ error: 'Tenant not found or inactive' });
    const partner = await prisma.partner.findFirst({
      where: { id: data.partnerId, tenantId: tenant.id, isActive: true },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found or paused' });
    if (!partner.inboundSecret) {
      return res.status(401).json({ error: 'Partner has no inbound secret configured' });
    }

    // HMAC verification against the raw request body, NOT a re-serialized one
    // (key order + whitespace would diverge). `verify` callback above stashes
    // the raw bytes on the request.
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!rawBody) return res.status(400).json({ error: 'Missing request body' });
    const provided = String(req.headers['x-pharmapos-signature'] ?? '').trim();
    if (!provided) return res.status(401).json({ error: 'Missing x-pharmapos-signature header' });
    const expected = crypto
      .createHmac('sha256', partner.inboundSecret)
      .update(rawBody)
      .digest('hex');
    // timingSafeEqual requires equal-length buffers. Length mismatch === invalid.
    const expBuf = Buffer.from(expected, 'hex');
    const provBuf = Buffer.from(provided, 'hex');
    if (expBuf.length !== provBuf.length || !crypto.timingSafeEqual(expBuf, provBuf)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Resolve branch: explicit > tenant's first active branch.
    let branchId = data.branchId ?? null;
    if (!branchId) {
      const firstBranch = await prisma.branch.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      branchId = firstBranch?.id ?? null;
    }
    if (!branchId) return res.status(400).json({ error: 'No active branch available for this tenant' });

    // Resolve supplier: explicit ID > name match > create stub for this partner.
    let supplierId = data.supplierId ?? null;
    if (!supplierId && data.supplierName) {
      const sup = await prisma.supplier.findFirst({
        where: { tenantId: tenant.id, name: { equals: data.supplierName } },
        select: { id: true },
      });
      supplierId = sup?.id ?? null;
    }
    if (!supplierId) {
      // Last resort — create a placeholder supplier tied to the partner so the
      // owner can edit later. Owner reviews the draft PO regardless.
      const created = await prisma.supplier.create({
        data: {
          tenantId: tenant.id,
          name: data.supplierName ?? partner.name,
          contactPerson: partner.name,
          phone: '',
          address: '',
          city: '',
          isActive: true,
        },
      });
      supplierId = created.id;
    }

    // Resolve medicines by barcode / id. Unknowns get a synthetic line with
    // medicineName but no medicineId so the owner sees what wholesale tried to
    // ship and can map it manually.
    const meds = await prisma.medicine.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: { id: true, name: true, barcode: true },
    });
    const medById = new Map(meds.map((m) => [m.id, m]));
    const medByBarcode = new Map(meds.filter((m) => m.barcode).map((m) => [m.barcode!.trim(), m]));

    let subtotal = 0;
    const resolvedItems = data.items.map((item) => {
      const med = item.medicineId
        ? medById.get(item.medicineId)
        : item.medicineBarcode
          ? medByBarcode.get(item.medicineBarcode.trim())
          : null;
      const lineTotal = Number((item.quantity * item.unitPrice).toFixed(2));
      subtotal += lineTotal;
      return {
        medicineId: med?.id ?? null,
        medicineName: med?.name ?? item.medicineName ?? 'UNKNOWN — needs mapping',
        medicineBarcode: item.medicineBarcode ?? med?.barcode ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total ?? lineTotal,
        unresolved: !med,
      };
    });
    const unresolvedCount = resolvedItems.filter((i) => i.unresolved).length;

    const purchaseNumber = data.purchaseNumber
      ?? `WHL-${Date.now().toString().slice(-8)}`;

    // Create as draft (status='draft') so the owner must confirm. Audit + notify.
    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          tenantId: tenant.id,
          purchaseNumber,
          supplierId: supplierId!,
          branchId: branchId!,
          purchaseDate: new Date(),
          items: resolvedItems as never,
          subtotal,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: subtotal,
          paidAmount: 0,
          balanceAmount: subtotal,
          status: 'draft',
          notes: data.notes ?? `Pushed by ${partner.name}${unresolvedCount > 0 ? ` (${unresolvedCount} unresolved items)` : ''}`,
          createdBy: 'wholesale-webhook',
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: 'wholesale-webhook',
          userName: partner.name,
          action: 'WHOLESALE_PO_INBOUND',
          module: 'purchases',
          details: `Inbound PO ${purchaseNumber} from ${partner.name} — Rs. ${subtotal.toFixed(2)}, ${data.items.length} items${unresolvedCount > 0 ? `, ${unresolvedCount} unresolved` : ''}`,
        },
      });
      await emitNotification(tx, {
        tenantId: tenant.id,
        scope: 'role',
        role: 'owner',
        title: `Wholesale PO from ${partner.name}`,
        body: `${purchaseNumber} · ${data.items.length} items · Rs. ${subtotal.toLocaleString('en-PK')}${unresolvedCount > 0 ? ` · ${unresolvedCount} need mapping` : ''}`,
        severity: unresolvedCount > 0 ? 'warning' : 'info',
        kind: 'wholesale',
        link: '/purchase-orders',
      });
      return created;
    });

    return res.status(201).json({
      ok: true,
      purchaseId: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      itemsCount: resolvedItems.length,
      unresolvedCount,
      status: 'draft',
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'purchaseNumber already exists for this tenant' });
    }
    return sendParseError(res, error);
  }
});

// ─── M7 — Auto-PO ──────────────────────────────────────────────────────────
// Scans low-stock medicines, groups by primary supplier (or first mapped),
// drafts one PO per supplier with the deficit qty. Settings-gated.

app.post('/api/auto-po/run', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const tId = tenantId(req);
  const tenant = await prisma.tenant.findUnique({ where: { id: tId } });
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
  const enabled = settings.autoPoEnabled === true;
  if (!enabled && req.query.force !== '1') {
    return res.status(400).json({ error: 'Auto-PO is disabled in settings. Pass ?force=1 to override.' });
  }
  const triggerPct = Number(settings.autoPoTriggerPercent ?? 1.0) || 1.0;

  // Pull state in parallel — medicines + their current stock + supplier mapping.
  const [medicines, batches, mappings] = await Promise.all([
    prisma.medicine.findMany({
      where: { tenantId: tId, isActive: true },
      select: { id: true, name: true, reorderLevel: true, reorderQuantity: true, reorderActive: true, purchaseRate: true },
    }),
    prisma.batch.findMany({
      where: { tenantId: tId, isActive: true },
      select: { medicineId: true, quantity: true },
    }),
    prisma.medicineSupplier.findMany({
      where: { tenantId: tId },
      select: { medicineId: true, supplierId: true, isPrimary: true },
    }),
  ]);
  const stockByMed = new Map<string, number>();
  for (const b of batches) stockByMed.set(b.medicineId, (stockByMed.get(b.medicineId) ?? 0) + b.quantity);

  // Group eligible medicines by primary supplier (or first mapped).
  const bySupplier = new Map<string, { medicineId: string; name: string; qty: number; rate: number }[]>();
  let skippedNoSupplier = 0;
  for (const m of medicines) {
    if (!m.reorderLevel || m.reorderLevel <= 0) continue;
    if (m.reorderActive === false) continue;
    const current = stockByMed.get(m.id) ?? 0;
    if (current >= m.reorderLevel * triggerPct) continue;
    const primary = mappings.find((x) => x.medicineId === m.id && x.isPrimary)
      ?? mappings.find((x) => x.medicineId === m.id);
    if (!primary) { skippedNoSupplier++; continue; }
    const qty = Math.max(1, m.reorderQuantity || (m.reorderLevel - current));
    const list = bySupplier.get(primary.supplierId) ?? [];
    list.push({ medicineId: m.id, name: m.name, qty, rate: m.purchaseRate ?? 0 });
    bySupplier.set(primary.supplierId, list);
  }

  // Draft one PO per supplier.
  const created: { purchaseId: string; supplierId: string; itemsCount: number }[] = [];
  for (const [supplierId, items] of bySupplier) {
    const branchId = '1'; // Default branch — could be parameterized when needed
    const purchaseNumber = `AUTOPO-${Date.now().toString().slice(-6)}-${supplierId.slice(-4)}`;
    const subtotal = items.reduce((s, x) => s + x.qty * x.rate, 0);
    const po = await prisma.purchase.create({
      data: {
        tenantId: tId,
        purchaseNumber,
        supplierId,
        branchId,
        purchaseDate: new Date(),
        items: items.map((x) => ({
          id: `it-${Date.now()}-${x.medicineId.slice(-4)}`,
          medicineId: x.medicineId,
          batchNumber: '',
          quantity: x.qty,
          purchasePrice: x.rate,
          salePrice: 0,
          mrp: 0,
          discountPercent: 0,
          taxPercent: 0,
          total: x.qty * x.rate,
        })) as never,
        subtotal,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: subtotal,
        paidAmount: 0,
        balanceAmount: subtotal,
        status: 'draft',
        notes: `Auto-PO generated from reorder scan (trigger ${triggerPct}x).`,
        createdBy: req.auth?.userId ?? 'system',
      },
    });
    created.push({ purchaseId: po.id, supplierId, itemsCount: items.length });
    await emitOutbox(prisma, {
      tenantId: tId,
      event: 'purchase_order.created',
      payload: { purchaseId: po.id, supplierId, purchaseNumber, itemsCount: items.length, totalAmount: subtotal },
    });
  }

  res.json({
    ok: true,
    draftsCreated: created.length,
    medicinesEvaluated: medicines.length,
    skippedNoSupplier,
    drafts: created,
  });
});

// ─── M4 — Reconcile (stock-take) ──────────────────────────────────────────
// One run = one physical-count session. Entries are upserted as the user types
// counts; "post" applies all variances to the batches in a single transaction.

app.get('/api/reconcile-runs', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  const rows = await prisma.reconcileRun.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { startedAt: 'desc' },
    take: 200,
  });
  res.json(rows.map(serialize.reconcileRun));
});

app.post('/api/reconcile-runs', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const data = reconcileRunCreateSchema.parse(req.body);
    const row = await prisma.reconcileRun.create({
      data: {
        tenantId: tenantId(req),
        scope: data.scope,
        scopeValue: data.scopeValue ?? null,
        notes: data.notes ?? null,
        status: 'open',
        createdBy: req.auth?.userId ?? 'system',
      },
    });
    res.status(201).json(serialize.reconcileRun(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.get('/api/reconcile-runs/:id/entries', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  const rows = await prisma.reconcileEntry.findMany({
    where: { tenantId: tenantId(req), runId: req.params.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(rows.map(serialize.reconcileEntry));
});

// Upsert a single line. Identified by (runId, medicineId, batchId|null) tuple.
// We don't have a DB unique index for that so we do find+update or create.
app.post('/api/reconcile-runs/:id/entries', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const data = reconcileEntryUpsertSchema.parse(req.body);
    const tId = tenantId(req);
    const run = await prisma.reconcileRun.findFirst({ where: { id: req.params.id, tenantId: tId } });
    if (!run) return res.status(404).json({ error: 'Reconcile run not found' });
    if (run.status !== 'open') return res.status(400).json({ error: 'Run is closed; start a new one' });

    const existing = await prisma.reconcileEntry.findFirst({
      where: { tenantId: tId, runId: run.id, medicineId: data.medicineId, batchId: data.batchId ?? null },
    });
    // Trust the live batch quantity as systemQty (the client snapshot can be
    // stale), so the recorded variance matches reality at count time.
    let systemQty = data.systemQty;
    if (data.batchId) {
      const liveBatch = await prisma.batch.findFirst({ where: { id: data.batchId, tenantId: tId }, select: { quantity: true } });
      if (liveBatch) systemQty = liveBatch.quantity;
    }
    const variance = data.countedQty - systemQty;
    const row = existing
      ? await prisma.reconcileEntry.update({
          where: { id: existing.id },
          data: {
            systemQty,
            countedQty: data.countedQty,
            variance,
            notes: data.notes ?? null,
          },
        })
      : await prisma.reconcileEntry.create({
          data: {
            tenantId: tId,
            runId: run.id,
            medicineId: data.medicineId,
            batchId: data.batchId ?? null,
            systemQty,
            countedQty: data.countedQty,
            variance,
            notes: data.notes ?? null,
          },
        });
    res.status(existing ? 200 : 201).json(serialize.reconcileEntry(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Post (apply variances). Transactional: each entry's batch.quantity becomes
// the countedQty; a LedgerEntry records the value impact; an AuditLog row is
// written; run is marked 'posted'. Idempotent only insofar as the run can be
// posted once — re-calling returns 400.
app.post('/api/reconcile-runs/:id/post', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const tId = tenantId(req);
    const run = await prisma.reconcileRun.findFirst({ where: { id: req.params.id, tenantId: tId } });
    if (!run) return res.status(404).json({ error: 'Reconcile run not found' });
    if (run.status !== 'open') return res.status(400).json({ error: 'Run is already posted/cancelled' });

    const entries = await prisma.reconcileEntry.findMany({ where: { tenantId: tId, runId: run.id } });
    if (entries.length === 0) return res.status(400).json({ error: 'No entries to post' });

    const result = await prisma.$transaction(async (tx) => {
      let valueAdjustment = 0;
      let skippedNoBatch = 0;
      for (const e of entries) {
        if (e.variance === 0) continue;
        if (!e.batchId) { skippedNoBatch++; continue; } // medicine-only entries can't be applied to a specific batch
        const batch = await tx.batch.findFirst({ where: { id: e.batchId, tenantId: tId } });
        if (!batch) continue;
        // The physical count is the source of truth — set the batch to the
        // counted quantity (don't add the stale variance, which would be wrong if
        // stock moved between counting and posting). Value impact = the REAL delta
        // applied now, so the ledger matches what actually changed.
        const newQty = Math.max(0, e.countedQty);
        valueAdjustment += (newQty - batch.quantity) * (batch.purchasePrice ?? 0);
        await tx.batch.update({ where: { id: batch.id }, data: { quantity: newQty } });
      }
      const updatedRun = await tx.reconcileRun.update({
        where: { id: run.id },
        data: { status: 'posted', completedAt: new Date(), postedBy: req.auth?.userId ?? 'system' },
      });
      // Single ledger entry summarizing the net impact. Positive variance =
      // income-style asset gain; negative = expense-style asset loss. Stored as
      // type='income' or 'expense' depending on sign.
      if (Math.abs(valueAdjustment) > 0.01) {
        await tx.ledgerEntry.create({
          data: {
            tenantId: tId,
            type: valueAdjustment >= 0 ? 'income' : 'expense',
            referenceId: run.id,
            referenceType: 'expense',
            amount: Math.abs(valueAdjustment),
            description: `Stock-take adjustment (${run.scope}${run.scopeValue ? ': ' + run.scopeValue : ''}) — ${valueAdjustment >= 0 ? 'overage' : 'shortage'}`,
            createdBy: req.auth?.userId ?? 'system',
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: tId,
          userId: req.auth?.userId ?? 'system',
          userName: 'System',
          action: 'RECONCILE_POST',
          module: 'reconcile',
          details: `Posted reconcile run ${run.id} (${entries.length} entries, net Rs. ${valueAdjustment.toFixed(2)}${skippedNoBatch ? `, ${skippedNoBatch} medicine-level entr${skippedNoBatch === 1 ? 'y' : 'ies'} skipped — no batch`: ''})`,
        },
      });
      // M5 — notify owners so the stock-take outcome shows up in their bell.
      await emitNotification(tx, {
        tenantId: tId,
        scope: 'role',
        role: 'owner',
        title: `Stock-take posted (${run.scope}) · net Rs. ${valueAdjustment.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`,
        body: `${entries.length} entries · ${valueAdjustment >= 0 ? 'overage' : 'shortage'}`,
        severity: Math.abs(valueAdjustment) > 1000 ? 'warning' : 'info',
        kind: 'reconcile',
        link: '/reconcile',
      });
      return updatedRun;
    });
    res.json(serialize.reconcileRun(result));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/reconcile-runs/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const tId = tenantId(req);
  const run = await prisma.reconcileRun.findFirst({ where: { id: req.params.id, tenantId: tId } });
  if (!run) return res.status(404).json({ error: 'Reconcile run not found' });
  if (run.status === 'posted') return res.status(400).json({ error: 'Cannot delete a posted run' });
  await prisma.reconcileRun.update({ where: { id: run.id }, data: { status: 'cancelled' } });
  res.json({ ok: true });
});

// ─── M4 — Bulk batch import ────────────────────────────────────────────────
// Resolves medicineBarcode → Medicine + supplierName → Supplier, then creates
// the batch. Returns per-row success/failure so the user sees which rows
// landed.
app.post('/api/batches/bulk', requireAuth, requireRole('superadmin', 'owner', 'manager', 'pharmacist'), async (req, res) => {
  try {
    const { rows, branchId } = batchBulkSchema.parse(req.body);
    const tId = tenantId(req);

    // Pre-load resolution maps once instead of per-row.
    const meds = await prisma.medicine.findMany({
      where: { tenantId: tId, isActive: true },
      select: { id: true, barcode: true, name: true },
    });
    const medByBarcode = new Map(meds.filter((m) => m.barcode).map((m) => [m.barcode!.trim(), m]));
    const medById = new Map(meds.map((m) => [m.id, m]));
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: tId, isActive: true },
      select: { id: true, name: true },
    });
    const supByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s]));

    const results: { row: number; ok: boolean; id?: string; error?: string }[] = [];
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      try {
        const med = r.medicineId
          ? medById.get(r.medicineId)
          : r.medicineBarcode
            ? medByBarcode.get(r.medicineBarcode.trim())
            : null;
        if (!med) {
          results.push({ row: idx + 1, ok: false, error: 'Medicine not found' });
          continue;
        }
        const sup = r.supplierId
          ? suppliers.find((s) => s.id === r.supplierId)
          : r.supplierName
            ? supByName.get(r.supplierName.trim().toLowerCase())
            : null;
        const created = await prisma.batch.create({
          data: {
            tenantId: tId,
            medicineId: med.id,
            branchId: branchId ?? null,
            batchNumber: r.batchNumber,
            expiryDate: new Date(r.expiryDate as string),
            manufacturingDate: r.manufacturingDate ? new Date(r.manufacturingDate as string) : null,
            quantity: r.quantity,
            purchasePrice: r.purchasePrice,
            tradePrice: r.tradePrice ?? null,
            salePrice: r.salePrice,
            mrp: r.mrp,
            supplierId: sup?.id ?? null,
            location: r.location ?? null,
          },
        });
        results.push({ row: idx + 1, ok: true, id: created.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        results.push({ row: idx + 1, ok: false, error: msg.length > 200 ? msg.slice(0, 200) + '…' : msg });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    res.json({ totalRows: rows.length, created: okCount, failed: rows.length - okCount, results });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.post('/api/customers', requireAuth, async (req, res) => {
  try {
    const data = customerCreateSchema.parse(req.body);
    const row = await prisma.customer.create({ data: { ...data, tenantId: tenantId(req) } });
    res.status(201).json(serialize.customer(row));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A customer with this phone number already exists' });
    }
    return sendParseError(res, error);
  }
});

app.patch('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const data = customerPatchSchema.parse(req.body);
    const row = await prisma.customer.update({
      where: { id: req.params.id, tenantId: tenantId(req) },
      data,
    });
    res.json(serialize.customer(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/customers/:id', requireAuth, async (req, res) => {
  await prisma.customer.update({
    where: { id: req.params.id, tenantId: tenantId(req) },
    data: { isActive: false },
  });
  res.json({ ok: true });
});

// Thrown by decrementStockForSale when a batch lacks the requested quantity.
// Caught by the sale handlers and surfaced as a 409 so the POS can tell the
// cashier exactly which line oversold instead of silently corrupting stock.
class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientStockError';
  }
}

// Thrown when a sale tries to redeem more loyalty points than the customer holds.
// Surfaced as a 400 so the client can't mint points and spend them as discount.
class LoyaltyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoyaltyError';
  }
}

type SaleTxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
interface StockLine { batchId: string; batchNumber?: string; quantity: number }

// SECURITY (financial integrity): the loyalty balance is now managed SERVER-SIDE.
// Direct client writes to customer.loyaltyPoints/totalPurchases are stripped from
// the customer schema, so the only way points move is here, atomically inside the
// sale transaction: we verify the customer can't redeem more than they hold, and
// we cap "earned" against the tenant's configured rate so the client can't inject
// an inflated earn. Runs once, when a sale becomes completed.
async function applyLoyaltyForSale(
  tx: SaleTxClient,
  tenantIdValue: string,
  sale: { customerId?: string | null; totalAmount: number; loyaltyPointsEarned?: number | null; loyaltyPointsRedeemed?: number | null },
): Promise<void> {
  if (!sale.customerId) return;
  const redeemed = Math.max(0, Math.floor(sale.loyaltyPointsRedeemed ?? 0));
  const earnedClaim = Math.max(0, Math.floor(sale.loyaltyPointsEarned ?? 0));
  if (redeemed === 0 && earnedClaim === 0) return;

  const customer = await tx.customer.findFirst({
    where: { id: sale.customerId, tenantId: tenantIdValue },
    select: { loyaltyPoints: true },
  });
  if (!customer) return;
  if (redeemed > customer.loyaltyPoints) {
    throw new LoyaltyError('Insufficient loyalty points to redeem');
  }

  // Cap earned by the tenant's configured earn rate (default 1 pt/rupee) so a
  // tampered client can't claim more points than the purchase warrants.
  const tenant = await tx.tenant.findUnique({ where: { id: tenantIdValue }, select: { settings: true } });
  const s = (tenant?.settings as Record<string, unknown>) ?? {};
  const loyaltyEnabled = s.enableLoyalty !== false;
  const pointsPerRupee = Math.max(0, Number(s.loyaltyPointsPerRupee ?? 1) || 0);
  const earnedCap = Math.ceil(Math.max(0, sale.totalAmount) * pointsPerRupee) + 1; // +1 absorbs rounding
  const earned = loyaltyEnabled ? Math.min(earnedClaim, earnedCap) : 0;

  await tx.customer.update({
    where: { id: sale.customerId },
    data: { loyaltyPoints: { increment: earned - redeemed }, totalPurchases: { increment: 1 } },
  });
}

// Atomically validate + decrement batch stock for a completed sale. Treats
// batch.quantity in the SAME unit as the sale line `quantity`, matching the
// FEFO check, the stock display and the sale-return restock path. The
// conditional updateMany (quantity >= need) is the atomic guard against
// overselling and races between terminals — if it matches zero rows, stock is
// insufficient and we throw to roll back the whole sale.
async function decrementStockForSale(
  tx: SaleTxClient,
  id: string,
  items: StockLine[],
): Promise<void> {
  // Same batch can appear on multiple lines — sum demand per batch first.
  const needByBatch = new Map<string, { need: number; batchNumber?: string }>();
  for (const it of items) {
    const prev = needByBatch.get(it.batchId);
    needByBatch.set(it.batchId, {
      need: (prev?.need ?? 0) + it.quantity,
      batchNumber: it.batchNumber ?? prev?.batchNumber,
    });
  }
  for (const [batchId, { need, batchNumber }] of needByBatch) {
    const result = await tx.batch.updateMany({
      where: { id: batchId, tenantId: id, quantity: { gte: need } },
      data: { quantity: { decrement: need } },
    });
    if (result.count === 0) {
      const batch = await tx.batch.findFirst({
        where: { id: batchId, tenantId: id },
        select: { quantity: true, batchNumber: true, medicine: { select: { name: true } } },
      });
      const name = batch?.medicine?.name ?? 'item';
      const available = batch?.quantity ?? 0;
      throw new InsufficientStockError(
        `Insufficient stock for ${name} (batch ${batch?.batchNumber ?? batchNumber ?? batchId}): ${available} in stock, ${need} requested`,
      );
    }
  }
}

app.post('/api/sales', requireAuth, requireBranchWrite((req) => req.body?.branchId), async (req, res) => {
  try {
    const data = saleCreateSchema.parse(req.body);
    const id = tenantId(req);

    // Salesperson PIN gate: completed sales must identify the person who
    // authorized the receipt. Pending/cart-saves don't require it.
    let salesPersonId = data.salesPersonId ?? null;
    let salesPersonName = data.salesPersonName ?? null;
    if (data.status === 'completed') {
      const totalsError = checkSaleTotals(data);
      if (totalsError) {
        return res.status(400).json({ error: totalsError });
      }
      if (!salesPersonId) {
        return res.status(400).json({ error: 'Salesperson PIN required to complete sale' });
      }
      const sp = await prisma.user.findFirst({
        where: { id: salesPersonId, tenantId: id, isActive: true },
        select: { id: true, name: true, role: true, salesPinHash: true },
      });
      if (!sp || !sp.salesPinHash || !SALES_ROLES.has(sp.role)) {
        return res.status(403).json({ error: 'Invalid salesperson' });
      }
      // Snapshot the name server-side so the client can't spoof it.
      salesPersonName = sp.name;
    }

    // Wrap stock decrement + sale + ledger in one transaction so a completed
    // sale can never write a row without actually drawing down inventory (and
    // an oversell rolls the whole thing back). Pending/cart-saved sales don't
    // touch stock — it's drawn down when the cashier later collects (PATCH
    // pending → completed).
    const row = await prisma.$transaction(async (tx) => {
      if (data.status === 'completed') {
        await decrementStockForSale(tx, id, data.items);
      }
      const created = await tx.sale.create({
        data: { ...data, tenantId: id, salesPersonId, salesPersonName } as never,
      });
      // M5.2 / ledger writers — record completed sales as income.
      if (data.status === 'completed' && data.totalAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            tenantId: id,
            type: 'income',
            referenceId: created.id,
            referenceType: 'sale',
            amount: data.totalAmount,
            description: `Sale ${data.invoiceNumber}${salesPersonName ? ` by ${salesPersonName}` : ''}`,
            createdBy: req.auth?.userId ?? 'system',
          },
        });
      }
      if (data.status === 'completed') {
        await applyLoyaltyForSale(tx, id, data);
      }
      return created;
    });

    // Enqueue FBR submission if enabled and sale is completed
    if (data.status === 'completed') {
      enqueueFbrSubmissionForSale(row.id, id, data).catch((err) => {
        console.error('FBR enqueue failed:', err);
      });
    }

    res.status(201).json(serialize.sale(row));
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof LoyaltyError) {
      return res.status(400).json({ error: error.message });
    }
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Invoice number already exists' });
    }
    return sendParseError(res, error);
  }
});

app.patch('/api/sales/:id', requireAuth, async (req, res) => {
  try {
    const data = salePatchSchema.parse(req.body);
    const tId = tenantId(req);
    // Read prior status so we know if this patch is the "pending → completed"
    // transition that should emit the income ledger entry AND draw down stock.
    // Pull branchId too for per-branch RBAC, and items so we can decrement the
    // right batches on the transition (a status-only patch carries no items).
    const prior = await prisma.sale.findFirst({
      where: { id: req.params.id, tenantId: tId },
      select: { status: true, branchId: true, items: true },
    });
    if (prior && !(await assertBranchWrite(req, res, prior.branchId))) return;

    const becomingCompleted = data.status === 'completed' && prior?.status !== 'completed';
    // The batches to draw down: prefer items sent on the patch, else the stored
    // sale's items (the usual cashier "collect pending bill" path).
    const stockLines = (data.items ?? (prior?.items as unknown as StockLine[] | undefined) ?? []) as StockLine[];

    const row = await prisma.$transaction(async (tx) => {
      if (becomingCompleted && stockLines.length > 0) {
        await decrementStockForSale(tx, tId, stockLines);
      }
      const updated = await tx.sale.update({
        where: { id: req.params.id, tenantId: tId },
        data,
      });
      // Ledger: emit on the pending → completed transition only (idempotent
      // against repeated saves).
      if (becomingCompleted && updated.totalAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            tenantId: tId,
            type: 'income',
            referenceId: updated.id,
            referenceType: 'sale',
            amount: updated.totalAmount,
            description: `Sale ${updated.invoiceNumber}${updated.salesPersonName ? ` by ${updated.salesPersonName}` : ''}`,
            createdBy: req.auth?.userId ?? 'system',
          },
        });
      }
      if (becomingCompleted) {
        await applyLoyaltyForSale(tx, tId, {
          customerId: updated.customerId,
          totalAmount: updated.totalAmount,
          loyaltyPointsEarned: updated.loyaltyPointsEarned,
          loyaltyPointsRedeemed: updated.loyaltyPointsRedeemed,
        });
      }
      return updated;
    });

    // If sale is being marked completed and wasn't before, enqueue FBR
    if (data.status === 'completed') {
      enqueueFbrSubmissionForSale(row.id, tenantId(req), row as Parameters<typeof enqueueFbrSubmissionForSale>[2]).catch((err) => {
        console.error('FBR enqueue on patch failed:', err);
      });
    }

    res.json(serialize.sale(row));
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof LoyaltyError) {
      return res.status(400).json({ error: error.message });
    }
    return sendParseError(res, error);
  }
});

/** Distribute a bill-level discount proportionally across item lines so v1.12
 *  totals (valueSalesExcludingST = qty*unitPrice − discount; salesTaxApplicable =
 *  valueSalesExcludingST × rate) reconcile with what FBR expects. Idempotent: if
 *  the per-item discounts already sum to >= totalDiscount, this is a no-op. */
function redistributeBillLevelDiscount(items: SaleItemForFbr[], totalDiscount: number): void {
  if (!Number.isFinite(totalDiscount) || totalDiscount <= 0 || items.length === 0) return;
  const alreadyDistributed = items.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0);
  const remaining = totalDiscount - alreadyDistributed;
  if (remaining <= 0.01) return;
  const totalLineValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  if (totalLineValue <= 0) return;
  let allocated = 0;
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const lineValue = Number(it.quantity) * Number(it.unitPrice);
    // Last item picks up the rounding remainder so the sum is exact.
    const share = idx === items.length - 1
      ? remaining - allocated
      : Number(((lineValue / totalLineValue) * remaining).toFixed(2));
    it.discountAmount = Number((Number(it.discountAmount) + share).toFixed(2));
    allocated += share;
  }
}

// ─── M5 — Notification emitter ─────────────────────────────────────────────
// Single helper called from privileged actions. Accepts the prisma client OR
// a transaction client so callers inside $transaction get the notification
// created/rolled back atomically. Fire-and-forget; if the create fails (e.g.
// connection dropped) we log and move on instead of failing the whole action.
interface NotificationInput {
  tenantId: string;
  scope: 'tenant' | 'user' | 'role';
  userId?: string | null;
  role?: string | null;
  title: string;
  body?: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  kind: 'sale_return' | 'payment' | 'reconcile' | 'purchase_return' | 'wholesale' | 'network' | 'system';
  link?: string;
}
async function emitNotification(
  client: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: NotificationInput,
): Promise<void> {
  try {
    await (client as typeof prisma).notification.create({
      data: {
        tenantId: input.tenantId,
        scope: input.scope,
        userId: input.userId ?? null,
        role: input.role ?? null,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 1000) ?? null,
        severity: input.severity ?? 'info',
        kind: input.kind,
        link: input.link?.slice(0, 300) ?? null,
      },
    });
  } catch (err) {
    console.warn('[notification] emit failed:', err);
  }
  // M5.1 — fan out web-push to all matching subscriptions. Runs after the row
  // is created so the user sees the same payload either way (in-app + OS).
  // Scheduled non-blocking so push failures don't slow down the calling action.
  setImmediate(() => { sendPushForNotification(input).catch((e) => console.warn('[push] fan-out failed:', e)); });
}

// M5.1 — Push fan-out. Looks up subscriptions whose user matches the
// notification scope and sends each one a payload via web-push. Failures with
// status 404/410 mean the subscription is dead — we delete those rows so the
// table doesn't grow forever.
async function sendPushForNotification(input: NotificationInput): Promise<void> {
  if (!webPush) return;
  // Resolve which userIds should receive this push.
  let userIds: string[] = [];
  if (input.scope === 'user' && input.userId) {
    userIds = [input.userId];
  } else if (input.scope === 'role' && input.role) {
    const users = await prisma.user.findMany({
      where: { tenantId: input.tenantId, role: input.role, isActive: true },
      select: { id: true },
    });
    userIds = users.map((u) => u.id);
  } else if (input.scope === 'tenant') {
    const users = await prisma.user.findMany({
      where: { tenantId: input.tenantId, isActive: true },
      select: { id: true },
    });
    userIds = users.map((u) => u.id);
  }
  if (userIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { tenantId: input.tenantId, userId: { in: userIds } },
  });
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: input.title,
    body: input.body ?? '',
    link: input.link ?? '/',
    kind: input.kind,
    severity: input.severity ?? 'info',
  });
  for (const s of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } },
        payload,
        { TTL: 60 * 60 * 24 }, // 24h — if device is offline longer, drop the push
      );
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsed: new Date() } }).catch(() => {});
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Endpoint is gone — clean up the dead subscription.
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      } else {
        console.warn('[push] send failed:', (err as Error).message);
      }
    }
  }
}

async function enqueueFbrSubmissionForSale(
  saleId: string,
  tenantIdVal: string,
  saleData: Record<string, unknown>,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantIdVal } });
  if (!tenant) return;

  const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
  const profile = settings.fbrProfile as FbrProfile | undefined;
  if (!profile?.enabled || !tenant.fbrTokenEncrypted) return;

  // Resolve per-medicine FBR fields (hsCode, fbrUom, fbrSaleType) for every line item.
  const items = (saleData.items as Array<Record<string, unknown>> | undefined) ?? [];
  const medicineIds = [...new Set(items.map((i) => String(i.medicineId)))];
  const medicines = await prisma.medicine.findMany({
    where: { id: { in: medicineIds }, tenantId: tenantIdVal },
    select: { id: true, name: true, hsCode: true, fbrUom: true, fbrSaleType: true },
  });
  const medMap = new Map(medicines.map((m) => [m.id, m]));

  // Customer registration data (buyer NTN/CNIC and registration type) for the buyer fields.
  let buyerNTNCNIC: string | null = null;
  let buyerRegistrationType: 'Registered' | 'Unregistered' = 'Unregistered';
  let buyerProvince: string | null = null;
  let buyerAddress: string | null = null;
  if (saleData.customerPhone) {
    const customer = await prisma.customer.findFirst({
      where: { tenantId: tenantIdVal, phone: String(saleData.customerPhone) },
      select: { buyerNtn: true, registrationType: true, cnic: true, address: true },
    });
    buyerNTNCNIC = customer?.buyerNtn || customer?.cnic || null;
    buyerRegistrationType = customer?.registrationType === 'Registered' ? 'Registered' : 'Unregistered';
    buyerAddress = customer?.address ?? null;
    // Province is not yet captured on customer — fall back to seller province in payload.
  }

  const fbrItems: SaleItemForFbr[] = items.map((item) => {
    const med = medMap.get(String(item.medicineId));
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineValue = qty * unitPrice;
    const discountPercent = Number(item.discountPercent ?? 0);
    return {
      medicineId: String(item.medicineId),
      medicineName: med?.name ?? String(item.medicineName ?? item.medicineId),
      hsCode: med?.hsCode ?? null,
      fbrUom: med?.fbrUom ?? null,
      fbrSaleType: med?.fbrSaleType ?? null,
      quantity: qty,
      unitPrice,
      discountAmount: Number(((lineValue * discountPercent) / 100).toFixed(2)),
      taxPercent: Number(item.taxPercent ?? 0),
    };
  });

  // Invoice-level discount redistribution.
  // FBR v1.12 has no header `discount` — only per-item. If the cashier applied a
  // bill-level discount at POS (sale.discountAmount > sum of item discounts),
  // proportionally redistribute the leftover across items by line value so the
  // totals reconcile and FBR doesn't reject with error 0036/0102/0104.
  redistributeBillLevelDiscount(fbrItems, Number(saleData.discountAmount ?? 0));

  const sale: SaleForFbr = {
    localInvoiceNumber: String(saleData.invoiceNumber),
    saleDate: new Date(String(saleData.saleDate)),
    buyerNTNCNIC,
    buyerBusinessName: saleData.customerName ? String(saleData.customerName) : null,
    buyerProvince,
    buyerAddress,
    buyerRegistrationType,
    items: fbrItems,
  };

  let payload;
  try {
    payload = buildSaleInvoicePayload(sale, profile);
  } catch (err) {
    // Mark sale as needing FBR configuration; do not block the sale.
    await prisma.sale.update({
      where: { id: saleId, tenantId: tenantIdVal },
      data: {
        fbrStatus: 'failed',
        fbrResponse: { error: err instanceof Error ? err.message : String(err) } as never,
      },
    }).catch(() => {});
    console.error('FBR payload build failed:', err);
    return;
  }

  const subId = await enqueueFbrSubmission(tenantIdVal, 'invoice', saleId, 'sale', payload);
  const { submitFbrRecord } = await import('./fbr.js');
  submitFbrRecord(subId).catch((err) => console.error('Immediate FBR submit failed:', err));
}

app.get('/api/sale-returns', requireAuth, async (req, res) => {
  const rows = await prisma.saleReturn.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { returnDate: 'desc' },
    take: 500,
  });
  res.json(rows.map(serialize.saleReturn));
});

app.post('/api/sale-returns', requireAuth, async (req, res) => {
  try {
    const data = saleReturnSchema.parse(req.body);
    const id = tenantId(req);

    // Branch-RBAC: resolve the sale's branch up-front and check write access.
    // Cheaper than racing into the tx only to throw — and the error shape stays
    // a plain 403 rather than a tx rollback.
    const preSale = await prisma.sale.findFirst({
      where: { id: data.saleId, tenantId: id },
      select: { branchId: true },
    });
    if (preSale && !(await assertBranchWrite(req, res, preSale.branchId))) return;

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: data.saleId, tenantId: id } });
      if (!sale) throw new Error('SALE_NOT_FOUND');
      if (!['completed', 'partial_returned'].includes(sale.status)) throw new Error('SALE_NOT_RETURNABLE');

      const previousReturns = await tx.saleReturn.findMany({ where: { tenantId: id, saleId: sale.id } });
      const previousByItem = new Map<string, number>();
      previousReturns.forEach((row) => {
        (row.items as any[]).forEach((item) => {
          previousByItem.set(item.saleItemId, (previousByItem.get(item.saleItemId) ?? 0) + Number(item.quantity ?? 0));
        });
      });

      const saleItems = sale.items as any[];
      const returnItems = data.items.map((item) => {
        const soldItem = saleItems.find((saleItem) => saleItem.id === item.saleItemId);
        if (!soldItem) throw new Error('RETURN_ITEM_NOT_SOLD');
        const alreadyReturned = previousByItem.get(item.saleItemId) ?? 0;
        if (item.quantity > Number(soldItem.quantity) - alreadyReturned) throw new Error('RETURN_QTY_EXCEEDS_SOLD');
        const lineUnitValue = Number(soldItem.total) / Number(soldItem.quantity || 1);
        return {
          ...item,
          batchNumber: item.batchNumber ?? soldItem.batchNumber,
          medicineName: item.medicineName,
          discountPercent: item.discountPercent ?? soldItem.discountPercent ?? 0,
          taxPercent: item.taxPercent ?? soldItem.taxPercent ?? 0,
          total: Number((lineUnitValue * item.quantity).toFixed(2)),
        };
      });

      const totalAmount = Number(returnItems.reduce((sum, item) => sum + item.total, 0).toFixed(2));
      const returnNumber = `RET-${Date.now().toString().slice(-8)}`;
      const originalFbrSubmitted = sale.fbrStatus === 'submitted';
      const saleReturn = await tx.saleReturn.create({
        data: {
          tenantId: id,
          saleId: sale.id,
          returnNumber,
          items: returnItems,
          totalAmount,
          refundMethod: { ...data.refundMethod, amount: data.refundMethod.amount || totalAmount },
          reason: data.reason,
          restockInventory: data.restockInventory,
          fbrStatus: originalFbrSubmitted ? 'pending' : 'not_required',
          fbrResponse: originalFbrSubmitted
            ? { message: 'FBR credit note submission queued.' }
            : undefined,
          createdBy: req.auth?.userId ?? 'system',
        },
      });

      if (data.restockInventory) {
        for (const item of returnItems) {
          await tx.batch.update({
            where: { id: item.batchId, tenantId: id },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      const returnedAfter = new Map(previousByItem);
      returnItems.forEach((item) => {
        returnedAfter.set(item.saleItemId, (returnedAfter.get(item.saleItemId) ?? 0) + item.quantity);
      });
      const fullyReturned = saleItems.every((item) => (returnedAfter.get(item.id) ?? 0) >= Number(item.quantity));
      const updatedSale = await tx.sale.update({
        where: { id: sale.id, tenantId: id },
        data: {
          status: fullyReturned ? 'returned' : 'partial_returned',
          balanceAmount: Number((sale.balanceAmount - totalAmount).toFixed(2)),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: id,
          userId: req.auth?.userId ?? 'system',
          userName: 'System User',
          action: 'CREATE_SALE_RETURN',
          module: 'sales',
          details: `Return ${returnNumber} created for invoice ${sale.invoiceNumber} - Rs. ${totalAmount.toFixed(2)}`,
          entitySnapshot: { saleId: sale.id, returnId: saleReturn.id, items: returnItems },
        },
      });

      // Ledger: a customer return reduces income — store as expense referencing
      // the original sale so the General Ledger viewer can pair them.
      if (totalAmount > 0) {
        await tx.ledgerEntry.create({
          data: {
            tenantId: id,
            type: 'expense',
            referenceId: sale.id,
            referenceType: 'sale',
            amount: totalAmount,
            description: `Sale return ${returnNumber} (inv ${sale.invoiceNumber}) — ${data.reason}`,
            createdBy: req.auth?.userId ?? 'system',
          },
        });
      }

      // M5 — notify the original salesperson that their sale was returned.
      // Owners + managers also get a tenant-wide alert so they can review.
      if (sale.salesPersonId) {
        await emitNotification(tx, {
          tenantId: id,
          scope: 'user',
          userId: sale.salesPersonId,
          title: `Your sale ${sale.invoiceNumber} was returned`,
          body: `Rs. ${totalAmount.toLocaleString('en-PK')} · ${data.reason}`,
          severity: 'warning',
          kind: 'sale_return',
          link: '/sales',
        });
      }
      await emitNotification(tx, {
        tenantId: id,
        scope: 'role',
        role: 'owner',
        title: `Sale return ${returnNumber} · Rs. ${totalAmount.toLocaleString('en-PK')}`,
        body: `Invoice ${sale.invoiceNumber} · ${data.reason}${sale.salesPersonName ? ` · by ${sale.salesPersonName}` : ''}`,
        severity: 'info',
        kind: 'sale_return',
        link: '/sales',
      });

      return {
        saleReturn,
        sale: updatedSale,
        originalFbrSubmitted,
        originalFbrInvoiceNumber: sale.fbrInvoiceNumber ?? null,
      };
    });

    // Enqueue FBR debit note if original sale was FBR-submitted and has a real FBR invoice number.
    if (result.originalFbrSubmitted && result.originalFbrInvoiceNumber) {
      enqueueFbrCreditNote(
        result.saleReturn.id,
        id,
        result.originalFbrInvoiceNumber,
        result.saleReturn,
      ).catch((err) => console.error('FBR debit note enqueue failed:', err));
    }

    res.status(201).json({
      saleReturn: serialize.saleReturn(result.saleReturn),
      sale: serialize.sale(result.sale),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'SALE_NOT_FOUND') return res.status(404).json({ error: 'Sale not found' });
    if (message === 'SALE_NOT_RETURNABLE') return res.status(409).json({ error: 'Only completed or partially returned sales can be returned' });
    if (message === 'RETURN_ITEM_NOT_SOLD') return res.status(400).json({ error: 'Return item does not exist on the original sale' });
    if (message === 'RETURN_QTY_EXCEEDS_SOLD') return res.status(400).json({ error: 'Return quantity exceeds remaining sold quantity' });
    return sendParseError(res, error);
  }
});

async function enqueueFbrCreditNote(
  returnId: string,
  tenantIdVal: string,
  originalFbrInvoiceNumber: string,
  saleReturn: Record<string, unknown>,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantIdVal } });
  if (!tenant?.fbrTokenEncrypted) return;

  const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
  const profile = settings.fbrProfile as FbrProfile | undefined;
  if (!profile?.enabled) return;

  // Re-fetch original sale to copy buyer info into the debit note (FBR requires matching buyer fields).
  const originalSale = await prisma.sale.findFirst({
    where: { id: String(saleReturn.saleId), tenantId: tenantIdVal },
    select: { customerName: true, customerPhone: true, customerCnic: true },
  });

  let buyerNTNCNIC: string | null = null;
  let buyerRegistrationType: 'Registered' | 'Unregistered' = 'Unregistered';
  let buyerAddress: string | null = null;
  if (originalSale?.customerPhone) {
    const customer = await prisma.customer.findFirst({
      where: { tenantId: tenantIdVal, phone: originalSale.customerPhone },
      select: { buyerNtn: true, registrationType: true, cnic: true, address: true },
    });
    buyerNTNCNIC = customer?.buyerNtn || customer?.cnic || originalSale.customerCnic || null;
    buyerRegistrationType = customer?.registrationType === 'Registered' ? 'Registered' : 'Unregistered';
    buyerAddress = customer?.address ?? null;
  }

  const items = (saleReturn.items as Array<Record<string, unknown>> | undefined) ?? [];
  const medicineIds = [...new Set(items.map((i) => String(i.medicineId)))];
  const medicines = await prisma.medicine.findMany({
    where: { id: { in: medicineIds }, tenantId: tenantIdVal },
    select: { id: true, name: true, hsCode: true, fbrUom: true, fbrSaleType: true },
  });
  const medMap = new Map(medicines.map((m) => [m.id, m]));

  const fbrItems: SaleItemForFbr[] = items.map((item) => {
    const med = medMap.get(String(item.medicineId));
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineValue = qty * unitPrice;
    const discountPercent = Number(item.discountPercent ?? 0);
    return {
      medicineId: String(item.medicineId),
      medicineName: med?.name ?? String(item.medicineName ?? item.medicineId),
      hsCode: med?.hsCode ?? null,
      fbrUom: med?.fbrUom ?? null,
      fbrSaleType: med?.fbrSaleType ?? null,
      quantity: qty,
      unitPrice,
      discountAmount: Number(((lineValue * discountPercent) / 100).toFixed(2)),
      taxPercent: Number(item.taxPercent ?? 0),
    };
  });

  // Same bill-level discount redistribution for sale returns (debit notes).
  redistributeBillLevelDiscount(fbrItems, Number(saleReturn.totalDiscount ?? saleReturn.discountAmount ?? 0));

  const ret: SaleForFbr = {
    localInvoiceNumber: String(saleReturn.returnNumber ?? returnId),
    saleDate: new Date(String(saleReturn.returnDate ?? saleReturn.createdAt)),
    buyerNTNCNIC,
    buyerBusinessName: originalSale?.customerName ?? null,
    buyerProvince: null,
    buyerAddress,
    buyerRegistrationType,
    originalFbrInvoiceNumber,
    items: fbrItems,
  };

  let payload;
  try {
    payload = buildDebitNotePayload(ret, profile);
  } catch (err) {
    console.error('FBR debit-note payload build failed:', err);
    await prisma.saleReturn.update({
      where: { id: returnId, tenantId: tenantIdVal },
      data: {
        fbrStatus: 'failed',
        fbrResponse: { error: err instanceof Error ? err.message : String(err) } as never,
      },
    }).catch(() => {});
    return;
  }

  const subId = await enqueueFbrSubmission(tenantIdVal, 'debit_note', returnId, 'sale_return', payload);
  const { submitFbrRecord } = await import('./fbr.js');
  submitFbrRecord(subId).catch((err) => console.error('FBR debit note submit failed:', err));
}

// ─── FBR reference data + diagnostics endpoints ──────────────────────────────
// Per v1.12 §5 — provinces, doc types, HS codes, UoMs, rates, SROs, STATL.
// Used by the admin UI to populate dropdowns and verify tenant config.

async function getFbrToken(tenantIdVal: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantIdVal } });
  if (!tenant?.fbrTokenEncrypted) return null;
  try {
    return decryptToken(tenant.fbrTokenEncrypted);
  } catch {
    return null;
  }
}

function fbrRequireToken(token: string | null, res: express.Response): token is string {
  if (!token) {
    res.status(400).json({ error: 'FBR token not configured for this tenant' });
    return false;
  }
  return true;
}

// All reference lookups proxy through our server (so the bearer token never leaves the backend).

app.get('/api/fbr/reference/provinces', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    res.json(await fbrReference.provinces(token));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'FBR reference fetch failed' });
  }
});

app.get('/api/fbr/reference/doc-types', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    res.json(await fbrReference.docTypes(token));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'FBR reference fetch failed' });
  }
});

app.get('/api/fbr/reference/item-codes', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    res.json(await fbrReference.itemCodes(token));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'FBR reference fetch failed' });
  }
});

app.get('/api/fbr/reference/transaction-types', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    res.json(await fbrReference.transactionTypes(token));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'FBR reference fetch failed' });
  }
});

app.get('/api/fbr/reference/uoms', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    res.json(await fbrReference.uoms(token));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'FBR reference fetch failed' });
  }
});

app.get('/api/fbr/reference/sale-type-rates', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const transTypeId = Number(req.query.transTypeId || 18);
    const originationSupplier = Number(req.query.originationSupplier || 1);
    res.json(await fbrReference.saleTypeToRate(token, { date, transTypeId, originationSupplier }));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'FBR reference fetch failed' });
  }
});

app.get('/api/fbr/reference/hs-uom', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    const hsCode = String(req.query.hsCode || '');
    const annexureId = Number(req.query.annexureId || 3);
    if (!hsCode) return res.status(400).json({ error: 'hsCode query param required' });
    res.json(await fbrReference.hsCodeToUom(token, { hsCode, annexureId }));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'FBR reference fetch failed' });
  }
});

app.post('/api/fbr/statl', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    const regno = String(req.body?.regno || '').trim();
    const date = String(req.body?.date || new Date().toISOString().slice(0, 10));
    if (!regno) return res.status(400).json({ error: 'regno required' });
    res.json(await fbrReference.statl(token, { regno, date }));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'STATL lookup failed' });
  }
});

app.post('/api/fbr/registration-type', requireAuth, async (req, res) => {
  try {
    const token = await getFbrToken(tenantId(req));
    if (!fbrRequireToken(token, res)) return;
    const regNo = String(req.body?.registrationNo || '').trim();
    if (!regNo) return res.status(400).json({ error: 'registrationNo required' });
    res.json(await fbrReference.registrationType(token, regNo));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Registration-type lookup failed' });
  }
});

/** Validate a sale's payload against FBR without posting. Useful to verify
 *  tenant config + medicine metadata before going live. */
app.post('/api/fbr/validate-sale/:saleId', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const tid = tenantId(req);
    const tenant = await prisma.tenant.findUnique({ where: { id: tid } });
    if (!tenant?.fbrTokenEncrypted) return res.status(400).json({ error: 'FBR token not configured' });
    const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
    const profile = settings.fbrProfile as FbrProfile | undefined;
    if (!profile?.enabled) return res.status(400).json({ error: 'FBR profile not enabled' });

    const sale = await prisma.sale.findFirst({ where: { id: req.params.saleId, tenantId: tid } });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const items = sale.items as Array<Record<string, unknown>>;
    const medicineIds = [...new Set(items.map((i) => String(i.medicineId)))];
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds }, tenantId: tid },
      select: { id: true, name: true, hsCode: true, fbrUom: true, fbrSaleType: true },
    });
    const medMap = new Map(medicines.map((m) => [m.id, m]));

    let buyerNTNCNIC: string | null = null;
    let buyerRegistrationType: 'Registered' | 'Unregistered' = 'Unregistered';
    let buyerAddress: string | null = null;
    if (sale.customerPhone) {
      const customer = await prisma.customer.findFirst({
        where: { tenantId: tid, phone: sale.customerPhone },
        select: { buyerNtn: true, registrationType: true, cnic: true, address: true },
      });
      buyerNTNCNIC = customer?.buyerNtn || customer?.cnic || sale.customerCnic || null;
      buyerRegistrationType = customer?.registrationType === 'Registered' ? 'Registered' : 'Unregistered';
      buyerAddress = customer?.address ?? null;
    }

    const fbrItems: SaleItemForFbr[] = items.map((item) => {
      const med = medMap.get(String(item.medicineId));
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const discountPercent = Number(item.discountPercent ?? 0);
      return {
        medicineId: String(item.medicineId),
        medicineName: med?.name ?? String(item.medicineName ?? item.medicineId),
        hsCode: med?.hsCode ?? null,
        fbrUom: med?.fbrUom ?? null,
        fbrSaleType: med?.fbrSaleType ?? null,
        quantity: qty,
        unitPrice,
        discountAmount: Number(((qty * unitPrice * discountPercent) / 100).toFixed(2)),
        taxPercent: Number(item.taxPercent ?? 0),
      };
    });

    const payload = buildSaleInvoicePayload(
      {
        localInvoiceNumber: sale.invoiceNumber,
        saleDate: sale.saleDate,
        buyerNTNCNIC,
        buyerBusinessName: sale.customerName,
        buyerProvince: null,
        buyerAddress,
        buyerRegistrationType,
        items: fbrItems,
      },
      profile,
    );

    const token = decryptToken(tenant.fbrTokenEncrypted);
    const result = await validateInvoiceData(payload, token, profile);
    res.json({ payload, result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Validation failed' });
  }
});


// FBR submission status endpoint
app.get('/api/fbr-submissions', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const rows = await prisma.fbrSubmission.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      type: true,
      referenceId: true,
      referenceType: true,
      status: true,
      retries: true,
      lastError: true,
      nextAttemptAt: true,
      fbrInvoiceNumber: true,
      fbrBarcode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(rows);
});

// ─── Feature 4 — Customer promise / advance orders ──────────────────────────
const promiseOrderCreateSchema = z.object({
  id: z.string().optional(),
  branchId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().max(20).optional().nullable(),
  itemName: z.string().trim().min(1).max(200),
  medicineId: z.string().optional().nullable(),
  quantity: z.number().int().positive().default(1),
  advanceAmount: z.number().nonnegative().default(0),
  purchaseCost: z.number().nonnegative().optional().nullable(),
  finalPrice: z.number().nonnegative().optional().nullable(),
  status: z.enum(['pending', 'purchased', 'settled', 'cancelled']).default('pending'),
  notes: z.string().trim().max(500).optional().nullable(),
  createdBy: z.string().min(1),
});
const promiseOrderPatchSchema = promiseOrderCreateSchema.partial().extend({
  purchasedAt: z.coerce.date().optional().nullable(),
  settledAt: z.coerce.date().optional().nullable(),
});

app.post('/api/promise-orders', requireAuth, requireBranchWrite((req) => req.body?.branchId), async (req, res) => {
  try {
    const data = promiseOrderCreateSchema.parse(req.body);
    const row = await prisma.promiseOrder.create({ data: { ...data, tenantId: tenantId(req) } as never });
    res.status(201).json(serialize.promiseOrder(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.patch('/api/promise-orders/:id', requireAuth, async (req, res) => {
  try {
    const tId = tenantId(req);
    const data = promiseOrderPatchSchema.parse(req.body);
    const existing = await prisma.promiseOrder.findFirst({ where: { id: req.params.id, tenantId: tId } });
    if (!existing) return res.status(404).json({ error: 'Promise order not found' });
    if (!(await assertBranchWrite(req, res, existing.branchId))) return;
    // Stamp the lifecycle timestamps when the status advances.
    const stamps: Record<string, unknown> = {};
    if (data.status === 'purchased' && !existing.purchasedAt) stamps.purchasedAt = new Date();
    if (data.status === 'settled' && !existing.settledAt) stamps.settledAt = new Date();
    const row = await prisma.promiseOrder.update({ where: { id: existing.id }, data: { ...data, ...stamps } as never });
    res.json(serialize.promiseOrder(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Feature 2 — email a purchase order to a distributor, optionally with a PDF
// attachment (base64). The client also opens a wa.me text-summary link.
const poEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().trim().max(200).optional(),
  html: z.string().max(200_000).optional(),
  pdfBase64: z.string().max(15_000_000).optional(),
  filename: z.string().trim().max(120).optional(),
});
app.post('/api/purchase-orders/send-email', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = poEmailSchema.parse(req.body);
    await sendEmail({
      to: data.to,
      subject: data.subject ?? 'Purchase Order',
      html: data.html ?? '<p>Please find the attached purchase order.</p>',
      attachments: data.pdfBase64 ? [{ filename: data.filename ?? 'purchase-order.pdf', content: data.pdfBase64 }] : undefined,
    });
    res.json({ ok: true });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.post('/api/purchases', requireAuth, requireRole('superadmin', 'owner', 'manager'), requireBranchWrite((req) => req.body?.branchId), async (req, res) => {
  try {
    const data = purchaseCreateSchema.parse(req.body);
    const id = tenantId(req);

    const totalsError = checkPurchaseTotals(data);
    if (totalsError) return res.status(400).json({ error: totalsError });

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.purchase.create({ data: { ...data, tenantId: id } as never });

      // Increment supplier balance when a PO is placed (ordered/received)
      if (data.status === 'ordered' || data.status === 'received') {
        await tx.supplier.update({
          where: { id: data.supplierId, tenantId: id },
          data: { currentBalance: { increment: data.totalAmount } },
        });
        // Ledger: record the accrued payable. Stored as type='payable' so the
        // General Ledger viewer can distinguish it from cash-out events (which
        // come from supplier payments and use type='expense').
        if (data.totalAmount > 0) {
          await tx.ledgerEntry.create({
            data: {
              tenantId: id,
              type: 'payable',
              referenceId: row.id,
              referenceType: 'purchase',
              amount: data.totalAmount,
              description: `Purchase ${data.purchaseNumber} (${data.status})`,
              createdBy: req.auth?.userId ?? 'system',
            },
          });
        }
      }
      // M7 — outbox event so wholesale partner is notified of the PO.
      await emitOutbox(tx, {
        tenantId: id,
        event: 'purchase_order.created',
        payload: {
          purchaseId: row.id,
          purchaseNumber: data.purchaseNumber,
          supplierId: data.supplierId,
          totalAmount: data.totalAmount,
          itemsCount: data.items.length,
        },
      });

      return row;
    });

    res.status(201).json(serialize.purchase(result));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'Purchase number already exists' });
    }
    return sendParseError(res, error);
  }
});

app.patch('/api/purchases/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  try {
    const data = purchasePatchSchema.parse(req.body);
    const id = tenantId(req);

    // Branch-RBAC pre-check: resolve the PO's branch before opening the tx so
    // the 403 is a clean response rather than a tx rollback.
    const preExisting = await prisma.purchase.findFirst({
      where: { id: req.params.id, tenantId: id },
      select: { branchId: true },
    });
    if (preExisting && !(await assertBranchWrite(req, res, preExisting.branchId))) return;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchase.findFirst({ where: { id: req.params.id, tenantId: id } });
      if (!existing) throw new Error('NOT_FOUND');

      const row = await tx.purchase.update({
        where: { id: req.params.id, tenantId: id },
        data,
      });

      // When status transitions to ordered/received, update supplier balance
      const wasUnordered = ['draft', 'cancelled'].includes(existing.status);
      const isNowOrdered = data.status === 'ordered' || data.status === 'received';
      if (wasUnordered && isNowOrdered) {
        await tx.supplier.update({
          where: { id: existing.supplierId, tenantId: id },
          data: { currentBalance: { increment: existing.totalAmount } },
        });
      }

      // When cancelled, reverse the balance
      const wasOrdered = ['ordered', 'received'].includes(existing.status);
      if (wasOrdered && data.status === 'cancelled') {
        await tx.supplier.update({
          where: { id: existing.supplierId, tenantId: id },
          data: { currentBalance: { decrement: existing.balanceAmount } },
        });
      }

      return row;
    });

    res.json(serialize.purchase(result));
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'NOT_FOUND') return res.status(404).json({ error: 'Purchase not found' });
    return sendParseError(res, error);
  }
});

app.delete('/api/purchases/:id', requireAuth, requireRole('superadmin', 'owner', 'manager'), async (req, res) => {
  const id = tenantId(req);
  await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({ where: { id: req.params.id, tenantId: id } });
    if (purchase && ['ordered', 'received'].includes(purchase.status)) {
      await tx.supplier.update({
        where: { id: purchase.supplierId, tenantId: id },
        data: { currentBalance: { decrement: purchase.balanceAmount } },
      });
    }
    await tx.purchase.delete({ where: { id: req.params.id, tenantId: id } });
  });
  res.json({ ok: true });
});

app.post('/api/expenses', requireAuth, requireRole('superadmin', 'owner', 'manager', 'accountant'), async (req, res) => {
  try {
    const data = expenseCreateSchema.parse(req.body);
    const tId = tenantId(req);
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.expense.create({ data: { ...data, tenantId: tId } as never });
      // Ledger: every expense lands in the general ledger so the viewer reflects
      // real cash-out activity. category is captured in description for filtering.
      if (data.amount > 0) {
        await tx.ledgerEntry.create({
          data: {
            tenantId: tId,
            type: 'expense',
            referenceId: row.id,
            referenceType: 'expense',
            amount: data.amount,
            description: `${data.category}: ${data.description}`,
            createdBy: req.auth?.userId ?? 'system',
          },
        });
      }
      return row;
    });
    res.status(201).json(serialize.expense(result));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.patch('/api/expenses/:id', requireAuth, requireRole('superadmin', 'owner', 'manager', 'accountant'), async (req, res) => {
  try {
    const data = expensePatchSchema.parse(req.body);
    const row = await prisma.expense.update({
      where: { id: req.params.id, tenantId: tenantId(req) },
      data,
    });
    res.json(serialize.expense(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.delete('/api/expenses/:id', requireAuth, requireRole('superadmin', 'owner', 'manager', 'accountant'), async (req, res) => {
  await prisma.expense.delete({ where: { id: req.params.id, tenantId: tenantId(req) } });
  res.json({ ok: true });
});

// SECURITY: previously spread `...req.body` straight into the create with no
// validation — any authenticated user could forge journal rows (fake income to
// inflate reports) and set `createdBy` to impersonate someone. Now we allow-list
// the fields, and force `tenantId` + `createdBy` from the authenticated session.
const ledgerEntrySchema = z.object({
  type: z.enum(['income', 'expense', 'payable', 'receivable']),
  amount: z.number().finite(),
  referenceId: z.string().max(100).optional().nullable(),
  referenceType: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});
app.post('/api/ledger-entries', requireAuth, async (req, res) => {
  try {
    const data = ledgerEntrySchema.parse(req.body);
    const row = await prisma.ledgerEntry.create({
      data: { ...data, tenantId: tenantId(req), createdBy: req.auth!.userId } as never,
    });
    res.status(201).json(serialize.ledgerEntry(row));
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.get('/api/web/orders', requireAuth, async (req, res) => {
  const rows = await prisma.webOrder.findMany({
    where: { tenantId: tenantId(req) },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json(rows);
});

// ─── Public SaaS Signup ───────────────────────────────────────────────────────

const signupSchema = z.object({
  pharmacyName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(20),
});

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const data = signupSchema.parse(req.body);
    const slug = data.pharmacyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    const setupToken = crypto.randomUUID();
    const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        handle: slug,
        name: data.pharmacyName,
        status: 'trial',
        trialEndsAt,
        billingEmail: data.email,
        whatsappNumber: data.phone,
        settings: {
          currency: 'PKR',
          timezone: 'Asia/Karachi',
          fbr: {
            enabled: false,
            apiBaseUrl: '',
            sellerNTNCNIC: '',
            sellerBusinessName: data.pharmacyName,
            sellerProvince: 'Punjab',
            sellerAddress: '',
            includeServiceCharge: false,
          },
        },
        branches: {
          create: {
            name: 'Main Branch',
            address: 'Update address',
            city: 'Update city',
            phone: data.phone,
            email: data.email,
          },
        },
        users: {
          create: {
            name: data.ownerName,
            email: data.email.toLowerCase(),
            passwordHash: '',
            role: 'owner',
            permissions: [{ module: '*', actions: ['create', 'read', 'update', 'delete'] }],
            emailConfirmed: false,
            passwordSetupToken: setupToken,
            passwordSetupExpiry: setupExpiry,
          },
        },
      },
    });

    await sendWelcomeSetupEmail({
      to: data.email,
      name: data.ownerName,
      pharmacyName: data.pharmacyName,
      pharmacySlug: slug,
      setupToken,
      trialDays: 30,
    }).catch((e) => console.error('[signup] email failed:', e));

    return res.status(201).json({ ok: true });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A pharmacy with this name already exists. Please choose a different name.' });
    }
    return sendParseError(res, error);
  }
});

const setupPasswordSchema = z.object({
  token: z.string().trim().min(10).max(256),
  password: z.string().min(8).max(128),
});

const forgotPasswordSchema = z.object({ email: z.string().trim().email() });

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
    });
    // Always return ok to avoid leaking whether an email exists
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordSetupToken: resetToken, passwordSetupExpiry: expiry },
      });
      sendPasswordResetEmail({ to: user.email, name: user.name, resetToken })
        .catch((e) => console.error('[forgot-password] email failed:', e));
    }
    res.json({ ok: true });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.post('/api/auth/setup-password', authLimiter, async (req, res) => {
  try {
    const data = setupPasswordSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { passwordSetupToken: data.token },
      include: { tenant: true },
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired setup link.' });
    if (user.passwordSetupExpiry && user.passwordSetupExpiry < new Date()) {
      return res.status(400).json({ error: 'This setup link has expired. Please contact support.' });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailConfirmed: true,
        passwordSetupToken: null,
        passwordSetupExpiry: null,
        lastLogin: new Date(),
      },
    });

    const token = signToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
    return res.json({
      token,
      tenant: {
        id: user.tenant.id,
        slug: user.tenant.slug,
        name: user.tenant.name,
        subscriptionPlan: user.tenant.subscriptionPlan,
        isActive: user.tenant.isActive,
        createdAt: user.tenant.createdAt,
      },
      user: serialize.publicUser(user),
    });
  } catch (error) {
    return sendParseError(res, error);
  }
});

// ─── SaaS Admin routes ────────────────────────────────────────────────────────

const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY ?? '';
const YCLOUD_FROM = process.env.YCLOUD_WHATSAPP_FROM ?? '';

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!YCLOUD_API_KEY) {
    console.warn('[whatsapp] YCLOUD_API_KEY not set — skipping message to', to);
    return;
  }
  const res = await fetch('https://api.ycloud.com/v2/whatsapp/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': YCLOUD_API_KEY,
    },
    body: JSON.stringify({
      from: YCLOUD_FROM,
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`ycloud ${res.status}: ${body}`);
  }
}

app.get('/api/saas-admin/stats', requireAuth, requireRole('superadmin'), async (_req, res) => {
  const [total, trial, active, suspended] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'trial' } }),
    prisma.tenant.count({ where: { status: 'active' } }),
    prisma.tenant.count({ where: { status: 'suspended' } }),
  ]);
  res.json({ total, trial, active, suspended });
});

app.get('/api/saas-admin/tenants', requireAuth, requireRole('superadmin'), async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      subscriptionPlan: true,
      isActive: true,
      status: true,
      trialEndsAt: true,
      billingEmail: true,
      whatsappNumber: true,
      planPrice: true,
      lastInvoiceAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(tenants);
});

const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  subscriptionPlan: z.enum(['basic', 'pro', 'enterprise']).optional(),
  isActive: z.boolean().optional(),
  status: z.enum(['trial', 'active', 'suspended', 'expired']).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  whatsappNumber: z.string().nullable().optional(),
  planPrice: z.number().nonnegative().nullable().optional(),
});

app.patch('/api/saas-admin/tenants/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
  try {
    const data = updateTenantSchema.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        ...data,
        trialEndsAt: data.trialEndsAt === null ? null : data.trialEndsAt ? new Date(data.trialEndsAt) : undefined,
      },
    });
    if (data.status === 'suspended' && tenant.billingEmail) {
      sendAccountSuspendedEmail({
        to: tenant.billingEmail,
        pharmacyName: tenant.name,
        reason: 'Account suspended by administrator.',
      }).catch((e) => console.error('[suspend-email]', e));
    }
    res.json(tenant);
  } catch (error) {
    return sendParseError(res, error);
  }
});

const sendInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1),
  amount: z.number().positive(),
  dueDate: z.string().trim().min(1),
  plan: z.string().trim().min(1),
  period: z.string().trim().min(1),
  notes: z.string().optional(),
  sendEmail: z.boolean().default(true),
  sendWhatsApp: z.boolean().default(false),
});

app.post('/api/saas-admin/tenants/:id/send-invoice', requireAuth, requireRole('superadmin'), async (req, res) => {
  try {
    const data = sendInvoiceSchema.parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const errors: string[] = [];

    if (data.sendEmail) {
      if (!tenant.billingEmail) {
        errors.push('No billing email set for this tenant.');
      } else {
        // Compute yearly equivalent based on this tenant's branch count so the email
        // can show the savings if they switch to yearly billing.
        const branchCount = await prisma.branch.count({ where: { tenantId: tenant.id, isActive: true } });
        const yearlyAmount = computePrice(branchCount, 'yearly');
        await sendInvoiceEmail({
          to: tenant.billingEmail,
          pharmacyName: tenant.name,
          invoiceNumber: data.invoiceNumber,
          amount: data.amount,
          yearlyAmount,
          dueDate: data.dueDate,
          plan: data.plan,
          period: data.period,
          notes: data.notes,
        }).catch((e) => {
          errors.push(`Email failed: ${e.message}`);
        });
      }
    }

    if (data.sendWhatsApp) {
      if (!tenant.whatsappNumber) {
        errors.push('No WhatsApp number set for this tenant.');
      } else {
        const msg =
          `*Invoice ${data.invoiceNumber}*\n` +
          `Pharmacy: ${tenant.name}\n` +
          `Plan: ${data.plan} | Period: ${data.period}\n` +
          `Amount: PKR ${data.amount.toLocaleString()}\n` +
          `Due: ${data.dueDate}\n` +
          (data.notes ? `Note: ${data.notes}\n` : '') +
          `\nThank you for using Kynex Pharmacloud!`;
        await sendWhatsAppMessage(tenant.whatsappNumber, msg).catch((e) => {
          errors.push(`WhatsApp failed: ${e.message}`);
        });
      }
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { lastInvoiceAt: new Date() },
    });

    res.json({ ok: true, errors: errors.length ? errors : undefined });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.post('/api/saas-admin/tenants/:id/send-trial-expiry', requireAuth, requireRole('superadmin'), async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.billingEmail) return res.status(400).json({ error: 'No billing email set' });
    const daysLeft = tenant.trialEndsAt
      ? Math.max(0, Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : 0;
    await sendTrialExpiryEmail({ to: tenant.billingEmail, pharmacyName: tenant.name, daysLeft });
    res.json({ ok: true });
  } catch (error) {
    return sendParseError(res, error);
  }
});

// Resend / Amazon SES click-tracking redirect.
// Format: /CL0/<url-encoded-target>/<index>/<message-id>/<signature>
// The tracking URL routes through our domain, so we have to unwrap it ourselves.
app.get(/^\/CL0\//, (req, res) => {
  try {
    const segments = req.path.split('/').filter(Boolean); // ['CL0', '<encoded-url>', '<index>', ...]
    if (segments.length < 2) return res.redirect(302, '/login');
    const encoded = segments[1];
    const target = decodeURIComponent(encoded);
    if (!/^https?:\/\//i.test(target)) return res.redirect(302, '/login');
    return res.redirect(302, target);
  } catch {
    return res.redirect(302, '/login');
  }
});

app.get('/api/saas-admin/unpaid-tenants', requireAuth, requireRole('superadmin'), async (_req, res) => {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  const now = Date.now();
  const out = [] as Record<string, unknown>[];
  for (const t of tenants) {
    if (t.slug === 'kynex-platform') continue;
    const settings = ((t.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const next = billing.nextBillingAt ? new Date(billing.nextBillingAt as string).getTime() : null;
    const trialEnd = t.trialEndsAt ? new Date(t.trialEndsAt).getTime() : null;
    const branchCount = await prisma.branch.count({ where: { tenantId: t.id, isActive: true } });

    let category: string | null = null;
    let daysOverdue = 0;
    if (next && next < now) {
      category = 'overdue';
      daysOverdue = Math.floor((now - next) / (24 * 60 * 60 * 1000));
    } else if (next && next - now < 3 * 24 * 60 * 60 * 1000) {
      category = 'due-soon';
      daysOverdue = -Math.ceil((next - now) / (24 * 60 * 60 * 1000));
    } else if (!next && t.status === 'trial' && trialEnd && trialEnd < now) {
      category = 'trial-expired';
      daysOverdue = Math.floor((now - trialEnd) / (24 * 60 * 60 * 1000));
    } else if (!next && t.status === 'trial' && trialEnd && trialEnd - now < 7 * 24 * 60 * 60 * 1000) {
      category = 'trial-ending';
      daysOverdue = -Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000));
    }
    if (!category) continue;

    out.push({
      id: t.id, name: t.name, slug: t.slug, status: t.status, isActive: t.isActive,
      billingEmail: t.billingEmail, whatsappNumber: t.whatsappNumber,
      branchCount,
      monthlyAmount: computePrice(branchCount, 'monthly'),
      yearlyAmount: computePrice(branchCount, 'yearly'),
      cycle: billing.cycle ?? 'monthly',
      nextBillingAt: billing.nextBillingAt ?? null,
      trialEndsAt: t.trialEndsAt,
      lastPaymentAt: billing.lastPaymentAt ?? null,
      lastPaymentAmount: billing.lastPaymentAmount ?? null,
      lastReminderAt: billing.lastReminderAt ?? null,
      category, daysOverdue,
    });
  }
  res.json(out);
});

// SaaS admin marks a tenant as paid manually (cash, bank transfer, freebie
// extension, etc. — bypassing the gateway). Extends nextBillingAt by N months
// + N years and clears the per-cycle invoice/reminder flags so the worker
// stays quiet during the paid period.
const markPaidSchema = z.object({
  months: z.number().int().min(0).max(120).default(0),
  years: z.number().int().min(0).max(10).default(0),
  amount: z.number().nonnegative().optional(),
  cycle: z.enum(['monthly', 'yearly', 'custom']).optional(),
  paidAt: z.string().optional(), // ISO date — defaults to now
  reference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
}).refine((d) => d.months > 0 || d.years > 0, {
  message: 'Pick at least one month or year',
  path: ['months'],
});

app.post('/api/saas-admin/tenants/:id/mark-paid', requireAuth, requireRole('superadmin'), async (req, res) => {
  try {
    const data = markPaidSchema.parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const settings = ((tenant.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;

    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    // Extend from the LATER of (today, current nextBillingAt) — so a paid-up
    // tenant getting another month gets it on top, not eaten by the current cycle.
    const baseTimestamp = Math.max(
      Date.now(),
      billing.nextBillingAt ? new Date(billing.nextBillingAt as string).getTime() : 0,
    );
    const next = new Date(baseTimestamp);
    next.setMonth(next.getMonth() + (data.months || 0));
    next.setFullYear(next.getFullYear() + (data.years || 0));

    // Record the manual transaction in the audit log
    const txns = Array.isArray(billing.transactions) ? (billing.transactions as Record<string, unknown>[]) : [];
    txns.push({
      id: `manual-${Date.now()}`,
      kind: 'manual',
      amount: data.amount ?? 0,
      months: data.months,
      years: data.years,
      cycle: data.cycle ?? (data.years > 0 ? 'yearly' : 'monthly'),
      paidAt: paidAt.toISOString(),
      reference: data.reference,
      note: data.note,
      approvedBy: req.auth?.userId,
      approvedAt: new Date().toISOString(),
    });

    billing.transactions = txns;
    billing.cycle = data.cycle === 'custom' ? (billing.cycle ?? 'monthly') : (data.cycle ?? (data.years > 0 ? 'yearly' : 'monthly'));
    billing.lastPaymentAt = paidAt.toISOString();
    if (data.amount != null) billing.lastPaymentAmount = data.amount;
    billing.nextBillingAt = next.toISOString();
    billing.invoiceSentAt = null;
    billing.reminderSentAt = null;
    settings.billing = billing;

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        settings: settings as never,
        status: 'active',
        isActive: true,
        lastInvoiceAt: paidAt,
      },
    });

    res.json({
      ok: true,
      nextBillingAt: next.toISOString(),
      paidAt: paidAt.toISOString(),
      monthsAdded: data.months,
      yearsAdded: data.years,
    });
  } catch (error) {
    return sendParseError(res, error);
  }
});

app.post('/api/saas-admin/tenants/:id/send-reminder', requireAuth, requireRole('superadmin'), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant || !tenant.billingEmail) return res.status(400).json({ error: 'Tenant has no billing email' });
  const settings = ((tenant.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const branchCount = await prisma.branch.count({ where: { tenantId: tenant.id, isActive: true } });
  const cycle = ((billing.cycle as string) ?? 'monthly') as 'monthly' | 'yearly';
  const monthly = computePrice(branchCount, 'monthly');
  const yearly = computePrice(branchCount, 'yearly');
  const amount = cycle === 'yearly' ? yearly : monthly;
  const due = billing.nextBillingAt ? new Date(billing.nextBillingAt as string) : new Date();
  try {
    await sendInvoiceEmail({
      to: tenant.billingEmail, pharmacyName: tenant.name,
      invoiceNumber: `INV-MANUAL-${Date.now().toString().slice(-6)}`,
      amount, yearlyAmount: yearly,
      dueDate: due.toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' }),
      plan: tenant.subscriptionPlan ?? 'Standard',
      period: cycle === 'yearly' ? 'next year' : 'next month',
      notes: 'Manual reminder from Kynex Solutions admin.',
    });
    billing.lastReminderAt = new Date().toISOString();
    settings.billing = billing;
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: settings as never } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Email failed', detail: (e as Error).message });
  }
});

// ─── Phone Upload Sessions ───────────────────────────────────────────────────
// Lets POS show a QR code; cashier's phone scans it, opens a tiny mobile page,
// takes a photo, uploads. POS polls the session and pulls the image back.
//
// Sessions live in process memory for 10 minutes — never large enough to bother
// with a DB. If the API process restarts, in-flight sessions are dropped, which
// is fine because they're ephemeral.
interface UploadSession {
  token: string;
  tenantId: string;
  createdAt: number;
  expiresAt: number;
  // Cashier sees these state transitions: created → uploading → ready.
  status: 'created' | 'uploading' | 'ready';
  // base64 data URL once the phone finishes the upload
  dataUrl?: string;
  // Optional purpose hint so the same plumbing can host other phone uploads
  // (payment proofs, supplier invoices) without a new code path.
  purpose?: string;
}
const uploadSessions = new Map<string, UploadSession>();
const UPLOAD_SESSION_TTL_MS = 10 * 60 * 1000;
// Sweeper — drop expired sessions every minute. Cheap on a Map of dozens.
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of uploadSessions) {
    if (s.expiresAt < now) uploadSessions.delete(token);
  }
}, 60_000).unref();

function randomToken(): string {
  // 24 url-safe bytes ≈ 192 bits. crypto.randomUUID() also fine but we keep
  // hyphenless for tidier URLs printed in QR codes.
  return cryptoRandomBytesUrlSafe(24);
}
function cryptoRandomBytesUrlSafe(byteLen: number): string {
  // Inline tiny base64url to avoid pulling another dep
  const buf = Buffer.alloc(byteLen);
  for (let i = 0; i < byteLen; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Create an upload session — POS calls this to start a phone-upload handshake.
app.post('/api/upload-sessions', requireAuth, (req, res) => {
  const token = randomToken();
  const session: UploadSession = {
    token,
    tenantId: tenantId(req),
    createdAt: Date.now(),
    expiresAt: Date.now() + UPLOAD_SESSION_TTL_MS,
    status: 'created',
    purpose: typeof req.body?.purpose === 'string' ? String(req.body.purpose).slice(0, 40) : undefined,
  };
  uploadSessions.set(token, session);
  res.json({ token, expiresAt: session.expiresAt });
});

// Poll the session — POS hits this every couple of seconds.
app.get('/api/upload-sessions/:token', requireAuth, (req, res) => {
  const s = uploadSessions.get(req.params.token);
  if (!s) return res.status(404).json({ error: 'Session not found or expired' });
  if (s.tenantId !== tenantId(req)) return res.status(403).json({ error: 'Wrong tenant' });
  res.json({
    status: s.status,
    dataUrl: s.status === 'ready' ? s.dataUrl : undefined,
    expiresAt: s.expiresAt,
  });
});

// Public: phone POSTs the captured image here. No auth — knowledge of the
// random token is the bearer secret. Sessions are single-use & short-lived.
app.post('/api/upload-sessions/:token/image', (req, res) => {
  const s = uploadSessions.get(req.params.token);
  if (!s) return res.status(404).json({ error: 'Session not found or expired' });
  if (s.expiresAt < Date.now()) {
    uploadSessions.delete(req.params.token);
    return res.status(410).json({ error: 'Session expired' });
  }
  const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
  if (!dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Expected an image data URL' });
  }
  // ~2 MB cap on stored image (express.json limit is also 2mb)
  if (dataUrl.length > 2.5 * 1024 * 1024) {
    return res.status(413).json({ error: 'Image too large — please retake' });
  }
  s.status = 'ready';
  s.dataUrl = dataUrl;
  res.json({ ok: true });
});

// Public mobile upload page — served by the API host so the same origin
// handles the POST. Includes inline canvas compression so big phone photos
// shrink to ~200-400 KB before upload.
app.get('/u/:token', (req, res) => {
  const token = req.params.token;
  const s = uploadSessions.get(token);
  if (!s) {
    res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Expired</title><body style="font-family:system-ui;text-align:center;padding:40px"><h2>Link expired</h2><p>Ask the cashier to generate a new QR code.</p></body>');
    return;
  }
  res.type('html').send(`<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Upload Prescription</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui;margin:0;padding:20px;background:#f5f7fb;color:#0f172a}
  .card{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 4px 20px rgba(0,0,0,.06)}
  h1{margin:0 0 6px;font-size:20px}
  p.sub{margin:0 0 18px;color:#64748b;font-size:14px}
  .btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border-radius:12px;border:0;font-size:16px;font-weight:600;cursor:pointer}
  .btn-primary{background:#10b981;color:#fff}
  .btn-primary:disabled{opacity:.6}
  .btn-secondary{background:#fff;color:#0f172a;border:1px solid #cbd5e1;margin-top:10px}
  input[type=file]{display:none}
  .preview{margin-top:16px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;min-height:120px;display:flex;align-items:center;justify-content:center}
  .preview img{max-width:100%;display:block}
  .status{margin-top:14px;padding:10px;border-radius:8px;font-size:14px;text-align:center}
  .status.info{background:#eff6ff;color:#1e40af}
  .status.ok{background:#ecfdf5;color:#065f46}
  .status.err{background:#fef2f2;color:#991b1b}
  .meta{font-size:12px;color:#94a3b8;margin-top:14px;text-align:center}
</style>
</head><body>
  <div class="card">
    <h1>Upload Prescription</h1>
    <p class="sub">Take a photo of the prescription. It will appear on the cashier's screen.</p>
    <label class="btn btn-primary" for="file" id="pickBtn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      Take Photo
    </label>
    <input id="file" type="file" accept="image/*" capture="environment">
    <button class="btn btn-secondary" id="chooseBtn" type="button">Choose from gallery</button>
    <div class="preview" id="preview"><span style="color:#94a3b8">Photo preview will appear here</span></div>
    <div id="status"></div>
    <button class="btn btn-primary" id="uploadBtn" style="margin-top:14px;display:none">Upload</button>
    <p class="meta">Session token: ${token.slice(0, 8)}… · expires in ${Math.round((s.expiresAt - Date.now()) / 60000)} min</p>
  </div>
<script>
  const fileInput = document.getElementById('file');
  const chooseBtn = document.getElementById('chooseBtn');
  const preview = document.getElementById('preview');
  const uploadBtn = document.getElementById('uploadBtn');
  const statusEl = document.getElementById('status');
  let dataUrl = '';

  chooseBtn.addEventListener('click', () => {
    fileInput.removeAttribute('capture');
    fileInput.click();
    setTimeout(() => fileInput.setAttribute('capture','environment'), 0);
  });

  function setStatus(text, cls) {
    statusEl.className = 'status ' + (cls || 'info');
    statusEl.textContent = text;
  }

  function compress(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 1600;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#fff';
          ctx.fillRect(0,0,w,h);
          ctx.drawImage(img,0,0,w,h);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', 0.75));
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    setStatus('Preparing image…', 'info');
    try {
      dataUrl = await compress(f);
      preview.innerHTML = '<img src="' + dataUrl + '" alt="preview">';
      uploadBtn.style.display = 'flex';
      setStatus('Ready to upload', 'info');
    } catch (e) {
      setStatus('Could not read the photo. Try again.', 'err');
    }
  });

  uploadBtn.addEventListener('click', async () => {
    if (!dataUrl) return;
    uploadBtn.disabled = true;
    setStatus('Uploading…', 'info');
    try {
      const res = await fetch('/api/upload-sessions/${token}/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl })
      });
      if (!res.ok) throw new Error('Upload failed (' + res.status + ')');
      setStatus('Uploaded! You can close this page.', 'ok');
      uploadBtn.style.display = 'none';
    } catch (e) {
      uploadBtn.disabled = false;
      setStatus('Upload failed. Please try again.', 'err');
    }
  });
</script>
</body></html>`);
});

// ─── Serve frontend in production ────────────────────────────────────────────

const distPath = join(process.cwd(), 'dist');
if (IS_PROD && existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/.*/, (_req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(port, host, async () => {
  console.log(`Kynex Pharmacloud API listening on http://${host}:${port}`);
  try {
    await prisma.$connect();
    console.log('[prisma] connected');
    if (IS_PROD) {
      await seedDemoTenantIfMissing().catch(e => console.error('[seed]', e));
    }
    startFbrRetryWorker();
    startBillingReminderWorker();
    await resumeImportOnBoot().catch((e) => console.warn('[drap-import] resume failed', e));
  } catch (e) {
    console.error('[startup] prisma connect failed:', e);
  }
});

// ─── Auto Billing — one invoice + one follow-up per cycle ──────────────────
// Per-tenant state on settings.billing:
//   cycle              'monthly' | 'yearly'
//   nextBillingAt      ISO timestamp the current cycle ends
//   lastPaymentAt      ISO timestamp of the most recent successful payment
//   invoiceSentAt      ISO timestamp the initial invoice was sent for THIS cycle
//   reminderSentAt     ISO timestamp the 2-day follow-up was sent
//
// Rules:
//   1. When today >= nextBillingAt AND invoiceSentAt < nextBillingAt → send
//      the invoice email exactly once. Stamp invoiceSentAt = now.
//   2. When invoiceSentAt is set AND (now - invoiceSentAt) >= 2 days AND
//      reminderSentAt is empty/older than invoiceSentAt AND not paid since
//      → send ONE follow-up reminder. Stamp reminderSentAt = now.
//   3. After the reminder, send nothing else until either a payment arrives or
//      the cycle rolls over.
//   4. When a payment posts (gateway webhook, /submit-payment, or admin
//      mark-paid), advance nextBillingAt and CLEAR invoiceSentAt + reminderSentAt.
function startBillingReminderWorker() {
  const ONE_HOUR = 60 * 60 * 1000;
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

  const TICK = async () => {
    try {
      const now = Date.now();
      const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
      for (const t of tenants) {
        if (t.slug === 'kynex-platform') continue;
        if (!t.billingEmail) continue;

        const settings = ((t.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
        const billing = ((settings.billing as Record<string, unknown>) ?? {}) as Record<string, unknown>;

        const next = billing.nextBillingAt ? new Date(billing.nextBillingAt as string).getTime() : null;
        if (!next) continue; // tenant has no billing schedule yet — skip

        const lastPayment = billing.lastPaymentAt ? new Date(billing.lastPaymentAt as string).getTime() : 0;
        const invoiceSent = billing.invoiceSentAt ? new Date(billing.invoiceSentAt as string).getTime() : 0;
        const reminderSent = billing.reminderSentAt ? new Date(billing.reminderSentAt as string).getTime() : 0;

        // If they paid AT OR AFTER the most recent invoice was sent, treat the
        // cycle as settled — silence until next due date.
        const paidThisCycle = lastPayment > 0 && lastPayment >= invoiceSent;

        const branchCount = await prisma.branch.count({ where: { tenantId: t.id, isActive: true } });
        const monthly = computePrice(branchCount, 'monthly');
        const yearly = computePrice(branchCount, 'yearly');
        const cycle = ((billing.cycle as string) ?? 'monthly') as 'monthly' | 'yearly';
        const amount = cycle === 'yearly' ? yearly : monthly;
        const dueDateStr = new Date(next).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
        const invoiceNumber = `INV-${new Date(next).getFullYear()}${String(new Date(next).getMonth() + 1).padStart(2, '0')}-${t.slug.slice(0, 8).toUpperCase()}`;

        // CASE 1 — initial invoice. Send on or after the due date if we
        // haven't sent one for THIS cycle yet.
        const needInitial = now >= next && invoiceSent < next && !paidThisCycle;
        if (needInitial) {
          try {
            await sendInvoiceEmail({
              to: t.billingEmail,
              pharmacyName: t.name,
              invoiceNumber,
              amount,
              yearlyAmount: yearly,
              dueDate: dueDateStr,
              plan: t.subscriptionPlan ?? 'Standard',
              period: cycle === 'yearly' ? 'next year' : 'next month',
              notes: 'Your subscription payment is due. Please pay to keep your account active.',
            });
            billing.invoiceSentAt = new Date().toISOString();
            billing.lastReminderAt = billing.invoiceSentAt; // legacy field kept in sync
            settings.billing = billing;
            await prisma.tenant.update({ where: { id: t.id }, data: { settings: settings as never } });
            console.log(`[billing] initial invoice → ${t.name} (${t.billingEmail}) amount=${amount}`);
          } catch (e) {
            console.error(`[billing] initial invoice failed for ${t.name}:`, e);
          }
          continue; // skip reminder check this tick — we just sent something
        }

        // CASE 2 — single follow-up reminder 2 days after the initial invoice,
        // only if still unpaid and we haven't already sent the reminder.
        const needReminder =
          invoiceSent > 0 &&
          !paidThisCycle &&
          (now - invoiceSent) >= TWO_DAYS &&
          reminderSent < invoiceSent;
        if (needReminder) {
          const overdueDays = Math.floor((now - next) / (24 * 60 * 60 * 1000));
          try {
            await sendInvoiceEmail({
              to: t.billingEmail,
              pharmacyName: t.name,
              invoiceNumber: `${invoiceNumber}-R`,
              amount,
              yearlyAmount: yearly,
              dueDate: dueDateStr,
              plan: t.subscriptionPlan ?? 'Standard',
              period: cycle === 'yearly' ? 'next year' : 'next month',
              notes: `Reminder: payment is ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue. To avoid suspension, please settle the invoice as soon as possible.`,
            });
            billing.reminderSentAt = new Date().toISOString();
            settings.billing = billing;
            await prisma.tenant.update({ where: { id: t.id }, data: { settings: settings as never } });
            console.log(`[billing] reminder → ${t.name} overdue=${overdueDays}d`);
          } catch (e) {
            console.error(`[billing] reminder failed for ${t.name}:`, e);
          }
        }
        // No more emails after the reminder until the next cycle / payment.
      }
    } catch (e) {
      console.error('[billing] worker error:', e);
    }
  };

  setInterval(TICK, ONE_HOUR);
  setTimeout(TICK, 30_000);
}

async function seedDemoTenantIfMissing() {
  const tid = 'demo-pharmacy-tenant-001';
  const exists = await prisma.tenant.findUnique({ where: { slug: 'demo-pharmacy' } });
  if (!exists) {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    await prisma.tenant.create({
      data: {
        id: tid, slug: 'demo-pharmacy', name: 'Demo Pharmacy',
        subscriptionPlan: 'pro', isActive: true, status: 'active', trialEndsAt,
      },
    });
    console.log('[seed] demo-pharmacy tenant created');
  }
  await ensureDemoBranch(tid);
  await ensureDemoUsers(tid);
  await seedDemoCatalogIfEmpty(tid);
}

async function ensureDemoBranch(tid: string) {
  await prisma.branch.upsert({
    where: { id: 'demo-branch-001' },
    update: {},
    create: {
      id: 'demo-branch-001', tenantId: tid, name: 'Main Branch - Lahore',
      address: '123 Main Market, Gulberg', city: 'Lahore', phone: '+92-42-1234567',
      email: 'main@demo-pharmacy.pk', isActive: true,
    },
  });
}

async function seedDemoCatalogIfEmpty(tid: string) {
  const medicineCount = await prisma.medicine.count({ where: { tenantId: tid } });
  if (medicineCount > 0) return;

  const mock = await import('../src/data/mockData.js');

  const medId = (id: string) => `demo-med-${id}`;
  const batchId = (id: string) => `demo-batch-${id}`;
  const supId = (id: string) => `demo-sup-${id}`;
  const custId = (id: string) => `demo-cust-${id}`;
  const saleId = (id: string) => `demo-sale-${id}`;
  const purId = (id: string) => `demo-pur-${id}`;
  const expId = (id: string) => `demo-exp-${id}`;
  const ledId = (id: string) => `demo-led-${id}`;
  const bid = 'demo-branch-001';

  for (const s of mock.mockSuppliers) {
    await prisma.supplier.upsert({
      where: { id: supId(s.id) },
      update: {},
      create: {
        id: supId(s.id), tenantId: tid, name: s.name, contactPerson: s.contactPerson,
        phone: s.phone, email: s.email ?? null, address: s.address, city: s.city,
        ntn: s.ntn ?? null, gstNumber: s.gstNumber ?? null,
        creditLimit: s.creditLimit, currentBalance: s.currentBalance,
        paymentTerms: s.paymentTerms, isActive: s.isActive,
      },
    });
  }

  for (const c of mock.mockCustomers) {
    await prisma.customer.upsert({
      where: { id: custId(c.id) },
      update: {},
      create: {
        id: custId(c.id), tenantId: tid, name: c.name, phone: c.phone,
        email: c.email ?? null, cnic: c.cnic ?? null, address: c.address ?? null,
        dateOfBirth: c.dateOfBirth ?? null, allergies: c.allergies ?? undefined,
        medicalHistory: c.medicalHistory ?? null, isActive: c.isActive,
        totalPurchases: c.totalPurchases, loyaltyPoints: c.loyaltyPoints,
      },
    });
  }

  for (const m of mock.mockMedicines) {
    await prisma.medicine.upsert({
      where: { id: medId(m.id) },
      update: {},
      create: {
        id: medId(m.id), tenantId: tid, name: m.name, genericName: m.genericName,
        brandName: m.brandName ?? null, category: m.category, subCategory: m.subCategory ?? null,
        description: m.description ?? null, dosageForm: m.dosageForm, strength: m.strength,
        unit: m.unit, units: (m.units ?? undefined) as never, barcode: m.barcode ?? null,
        qrCode: m.qrCode ?? null, isPrescriptionRequired: m.isPrescriptionRequired,
        classification: m.classification, substituteIds: m.substituteIds ?? undefined,
        controlledSchedule: m.controlledSchedule ?? null, isActive: m.isActive,
        webLive: m.webLive ?? false, reorderLevel: m.reorderLevel ?? 0,
        reorderQuantity: m.reorderQuantity ?? 0,
      },
    });
  }

  for (const b of mock.mockBatches) {
    await prisma.batch.upsert({
      where: { id: batchId(b.id) },
      update: {},
      create: {
        id: batchId(b.id), tenantId: tid, medicineId: medId(b.medicineId),
        batchNumber: b.batchNumber, expiryDate: b.expiryDate,
        manufacturingDate: b.manufacturingDate ?? null, quantity: b.quantity,
        purchasePrice: b.purchasePrice, salePrice: b.salePrice, mrp: b.mrp,
        supplierId: b.supplierId ? supId(b.supplierId) : null,
        purchaseId: b.purchaseId ? purId(b.purchaseId) : null,
        location: b.location ?? null, isActive: b.isActive,
      },
    });
  }

  const remapItems = (items: unknown): unknown => {
    if (!Array.isArray(items)) return items;
    return items.map((it: Record<string, unknown>) => ({
      ...it,
      medicineId: it.medicineId ? medId(String(it.medicineId)) : it.medicineId,
      batchId: it.batchId ? batchId(String(it.batchId)) : it.batchId,
    }));
  };

  for (const s of mock.mockSales) {
    await prisma.sale.upsert({
      where: { id: saleId(s.id) },
      update: {},
      create: {
        id: saleId(s.id), tenantId: tid, invoiceNumber: s.invoiceNumber, branchId: bid,
        customerName: s.customerName ?? null, customerPhone: s.customerPhone ?? null,
        customerCnic: s.customerCnic ?? null, doctorName: s.doctorName ?? null,
        prescriptionNumber: s.prescriptionNumber ?? null, saleDate: s.saleDate,
        items: remapItems(s.items) as never, subtotal: s.subtotal,
        discountAmount: s.discountAmount, taxAmount: s.taxAmount, totalAmount: s.totalAmount,
        paidAmount: s.paidAmount, balanceAmount: s.balanceAmount,
        paymentMethods: s.paymentMethods as never, status: s.status,
        isPrescription: s.isPrescription, notes: s.notes ?? null,
        createdBy: 'demo-owner-001',
      },
    });
  }

  for (const p of mock.mockPurchases) {
    await prisma.purchase.upsert({
      where: { id: purId(p.id) },
      update: {},
      create: {
        id: purId(p.id), tenantId: tid, purchaseNumber: p.purchaseNumber,
        supplierId: supId(p.supplierId), branchId: bid, purchaseDate: p.purchaseDate,
        dueDate: p.dueDate ?? null, items: remapItems(p.items) as never,
        subtotal: p.subtotal, discountAmount: p.discountAmount, taxAmount: p.taxAmount,
        totalAmount: p.totalAmount, paidAmount: p.paidAmount, balanceAmount: p.balanceAmount,
        status: p.status, notes: p.notes ?? null, createdBy: 'demo-owner-001',
      },
    });
  }

  for (const e of mock.mockExpenses) {
    await prisma.expense.upsert({
      where: { id: expId(e.id) },
      update: {},
      create: {
        id: expId(e.id), tenantId: tid, category: e.category, description: e.description,
        amount: e.amount, date: e.date, createdBy: 'demo-owner-001',
      },
    });
  }

  for (const l of mock.mockLedgerEntries) {
    await prisma.ledgerEntry.upsert({
      where: { id: ledId(l.id) },
      update: {},
      create: {
        id: ledId(l.id), tenantId: tid, type: l.type, referenceId: l.referenceId,
        referenceType: l.referenceType, amount: l.amount, description: l.description,
        createdBy: 'demo-owner-001',
      },
    });
  }

  console.log(`[seed] catalog seeded: ${mock.mockMedicines.length} medicines, ${mock.mockBatches.length} batches, ${mock.mockSales.length} sales`);
}

async function ensureDemoUsers(tid: string) {
  const hash = await bcrypt.hash('Demo1234!', 10);
  const bid = 'demo-branch-001';
  const users = [
    { id: 'demo-owner-001', name: 'Admin Owner', email: 'owner@demo-pharmacy.pk', role: 'owner' },
    { id: 'demo-manager-001', name: 'Store Manager', email: 'manager@demo-pharmacy.pk', role: 'manager' },
    { id: 'demo-cashier-001', name: 'Cashier Staff', email: 'cashier@demo-pharmacy.pk', role: 'cashier' },
    { id: 'demo-pharmacist-001', name: 'Head Pharmacist', email: 'pharmacist@demo-pharmacy.pk', role: 'pharmacist' },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tid, email: u.email } },
      update: { passwordHash: hash, isActive: true, emailConfirmed: true },
      create: {
        ...u, tenantId: tid, branchId: bid, passwordHash: hash,
        permissions: ['all'], isActive: true, emailConfirmed: true,
      },
    });
  }
}
