/* ============================================================================
 * FBR Pakistan — Digital Invoicing API integration
 * Implements: PRAL Technical Specification for DI API v1.12 (24-July-2025)
 *
 * Spec PDF: download1.fbr.gov.pk/Docs/20257301172130815TechnicalDocumentationforDIAPIV1.12.pdf
 *
 * Notes from spec:
 *   §3.1  Bearer token is issued by PRAL, 5-year validity, passed in Authorization header.
 *         FBR routes sandbox vs production based on which token was issued — but separate
 *         sandbox URLs (with _sb suffix) exist and we use them explicitly.
 *   §4.1  postinvoicedata returns { invoiceNumber, dated, validationResponse }.
 *   §4.2  validateinvoicedata is a dry-run that returns the same validationResponse
 *         shape but no invoiceNumber is allocated. Use it before post when onboarding
 *         or for sandbox scenario testing.
 *   §6    Receipts MUST carry the FBR Digital Invoicing logo + a QR code carrying the
 *         FBR-issued invoice number (1.0 × 1.0 inch, Version 2.0 / 25×25).
 *   §9    Sandbox onboarding requires the taxpayer to pass scenarios SN001..SN028
 *         relevant to their business activity (§10). Pharmacy = Retailer · Pharmaceuticals
 *         → SN008, SN025, SN026, SN027, SN028.
 * ============================================================================ */

import crypto from 'crypto';
import { prisma } from './prisma.js';

// ─── Token encryption (AES-256-GCM) ─────────────────────────────────────────

const FBR_TOKEN_KEY = process.env.FBR_TOKEN_KEY ?? '';

function getEncryptionKey(): Buffer {
  if (!FBR_TOKEN_KEY || Buffer.from(FBR_TOKEN_KEY, 'hex').length !== 32) {
    throw new Error('FBR_TOKEN_KEY must be a 32-byte hex string (64 hex chars)');
  }
  return Buffer.from(FBR_TOKEN_KEY, 'hex');
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ─── Spec constants ──────────────────────────────────────────────────────────

/** v1.12 §4 — production base; sandbox URLs add `_sb` to the path segment. */
export const DI_API_BASE = 'https://gw.fbr.gov.pk/di_data/v1/di';
export const PDI_API_BASE = 'https://gw.fbr.gov.pk/pdi/v1';
export const PDI_V2_BASE = 'https://gw.fbr.gov.pk/pdi/v2';
export const DIST_API_BASE = 'https://gw.fbr.gov.pk/dist/v1';

/** v1.12 §10 — applicable scenarios for "Retailer · Pharmaceuticals". */
export const PHARMACY_RETAIL_SCENARIOS = ['SN008', 'SN025', 'SN026', 'SN027', 'SN028'] as const;

/** v1.12 §9 — full catalogue. Keep as readonly so callers can validate input. */
export const ALL_SCENARIOS: Record<string, { description: string; saleType: string }> = {
  SN001: { description: 'Goods at standard rate to registered buyers', saleType: 'Goods at Standard Rate (default)' },
  SN002: { description: 'Goods at standard rate to unregistered buyers', saleType: 'Goods at Standard Rate (default)' },
  SN003: { description: 'Sale of Steel (Melted and Re-Rolled)', saleType: 'Steel Melting and re-rolling' },
  SN004: { description: 'Sale by Ship Breakers', saleType: 'Ship breaking' },
  SN005: { description: 'Reduced rate sale', saleType: 'Goods at Reduced Rate' },
  SN006: { description: 'Exempt goods sale', saleType: 'Exempt Goods' },
  SN007: { description: 'Zero rated sale', saleType: 'Goods at zero-rate' },
  SN008: { description: 'Sale of 3rd schedule goods', saleType: '3rd Schedule Goods' },
  SN009: { description: 'Cotton Spinners purchase from Cotton Ginners (Textile Sector)', saleType: 'Cotton Ginners' },
  SN010: { description: 'Telecom services rendered or provided', saleType: 'Telecommunication services' },
  SN011: { description: 'Toll Manufacturing sale by Steel sector', saleType: 'Toll Manufacturing' },
  SN012: { description: 'Sale of Petroleum products', saleType: 'Petroleum Products' },
  SN013: { description: 'Electricity Supply to Retailers', saleType: 'Electricity Supply to Retailers' },
  SN014: { description: 'Sale of Gas to CNG stations', saleType: 'Gas to CNG stations' },
  SN015: { description: 'Sale of mobile phones', saleType: 'Mobile Phones' },
  SN016: { description: 'Processing / Conversion of Goods', saleType: 'Processing/ Conversion of Goods' },
  SN017: { description: 'Sale of Goods where FED is charged in ST mode', saleType: 'Goods (FED in ST Mode)' },
  SN018: { description: 'Services rendered or provided where FED is charged in ST mode', saleType: 'Services (FED in ST Mode)' },
  SN019: { description: 'Services rendered or provided', saleType: 'Services' },
  SN020: { description: 'Sale of Electric Vehicles', saleType: 'Electric Vehicle' },
  SN021: { description: 'Sale of Cement / Concrete Block', saleType: 'Cement /Concrete Block' },
  SN022: { description: 'Sale of Potassium Chlorate', saleType: 'Potassium Chlorate' },
  SN023: { description: 'Sale of CNG', saleType: 'CNG Sales' },
  SN024: { description: 'Goods sold that are listed in SRO 297(1)/2023', saleType: 'Goods as per SRO.297(|)/2023' },
  SN025: { description: 'Drugs sold at fixed ST rate under serial 81 of Eighth Schedule Table 1', saleType: 'Non-Adjustable Supplies' },
  SN026: { description: 'Sale to End Consumer by retailers (standard rate)', saleType: 'Goods at Standard Rate (default)' },
  SN027: { description: 'Sale to End Consumer by retailers (3rd schedule)', saleType: '3rd Schedule Goods' },
  SN028: { description: 'Sale to End Consumer by retailers (reduced rate)', saleType: 'Goods at Reduced Rate' },
};

/** v1.12 §7 + §8 — message code lookup for richer error reporting. */
export const FBR_ERROR_CODES: Record<string, string> = {
  '0001': 'Seller not registered for sales tax. Provide valid seller registration/NTN.',
  '0002': 'Invalid Buyer Registration No or NTN. Must be 13 digits (CNIC) or 7/9 digits (NTN).',
  '0003': 'Provide proper invoice type.',
  '0005': 'Invoice date format invalid. Use YYYY-MM-DD.',
  '0006': 'Sale invoice does not exist against STWH.',
  '0007': 'Wrong sale type for selected invoice type.',
  '0008': 'ST withheld at source must be zero or equal to sales tax/FED.',
  '0009': 'Buyer registration number cannot be empty.',
  '0010': 'Buyer name cannot be empty.',
  '0011': 'Invoice type cannot be empty.',
  '0012': 'Buyer registration type cannot be empty.',
  '0013': 'Sale type cannot be empty.',
  '0018': 'Sales Tax/FED in ST mode cannot be empty.',
  '0019': 'HS Code cannot be empty.',
  '0020': 'Rate field cannot be empty.',
  '0021': 'Value of Sales Excl. ST / Quantity cannot be empty.',
  '0022': 'ST withheld at Source or STS Withheld cannot be empty.',
  '0023': 'Sales Tax cannot be empty.',
  '0024': 'Sales Tax withheld cannot be empty.',
  '0026': 'Invoice Reference No. is required for debit/credit note.',
  '0027': 'Reason is required for debit/credit note.',
  '0029': 'Debit/Credit note date must be ≥ original invoice date.',
  '0041': 'Invoice number cannot be empty.',
  '0042': 'Invoice date cannot be empty.',
  '0043': 'Invoice date is not valid.',
  '0044': 'HS Code cannot be empty.',
  '0046': 'Rate cannot be empty.',
  '0050': 'Invalid Sales Tax withheld for sale type "Cotton ginners".',
  '0052': 'HS Code does not match the provided sale type.',
  '0053': 'Buyer Registration Type is invalid.',
  '0057': 'Reference invoice for debit/credit note does not exist.',
  '0058': 'Self-invoicing (buyer=seller) not allowed.',
  '0064': 'Reference invoice already has a credit note.',
  '0070': 'STWH allowed only for registered users.',
  '0083': 'Seller Reg No. mismatch.',
  '0099': 'UOM is not valid for the given HS Code.',
  '0102': 'Calculated tax does not match 3rd schedule.',
  '0104': 'Calculated percentage sales tax does not match.',
  '0105': 'Calculated sales tax for the quantity is incorrect.',
  '0106': 'Buyer is not registered for sales tax.',
  '0107': 'Buyer Registration No. mismatch.',
  '0108': 'Invalid Seller Registration No / NTN.',
  '0113': 'Unable to parse date. Use YYYY-MM-DD.',
  '0300': 'Provided decimal value is not valid for one of the item fields.',
  '0401': 'Provided seller NTN/CNIC does not have a valid or authorized access token.',
  '0402': 'Provided buyer NTN/CNIC does not have a valid or authorized access token.',
};

// ─── Profile + payload shapes ────────────────────────────────────────────────

/** v1.12 §4 — full FBR profile stored under tenant.settings.fbrProfile. */
export interface FbrProfile {
  enabled: boolean;
  mode: 'sandbox' | 'production';
  /** Override the spec URLs (rarely needed; defaults to {@link DI_API_BASE}). */
  apiBaseUrl?: string;
  /** Seller registration. Per §4 these are REQUIRED on every payload. */
  sellerNTNCNIC: string;
  sellerBusinessName: string;
  sellerProvince: string;
  sellerAddress: string;
  /** §10 — used for scenario selection and sandbox onboarding. */
  businessActivity?: string;
  sector?: string;
  /** §9 — used only in sandbox (omitted in production payloads). */
  defaultScenarioId?: string;
  /** If true, hit validateinvoicedata first; only call postinvoicedata on Valid. */
  validateBeforePost?: boolean;
  /** Whether to include the FBR POS service fee on receipts (per provincial rules). */
  includeServiceCharge?: boolean;
}

/** v1.12 §4.1 — exact JSON shape (camelCase, top-level). */
export interface FbrInvoiceItem {
  hsCode: string;
  productDescription: string;
  rate: string;                            // e.g. "18%", "0%", "Exempt"
  uoM: string;                             // FBR UoM description (reference API 5.6)
  quantity: number;                        // decimal
  totalValues: number;                     // total sales value INCLUDING tax
  valueSalesExcludingST: number;           // taxable value
  fixedNotifiedValueOrRetailPrice: number; // 0 unless 3rd-schedule/notified
  salesTaxApplicable: number;              // ST or FED-in-ST amount
  salesTaxWithheldAtSource: number;        // 0 for retail
  extraTax?: number | '';
  furtherTax?: number;
  sroScheduleNo?: string;
  fedPayable?: number;
  discount?: number;
  saleType: string;                        // per §9 scenario sale-type label
  sroItemSerialNo?: string;
}

export interface FbrInvoicePayload {
  invoiceType: 'Sale Invoice' | 'Debit Note';
  invoiceDate: string;                     // YYYY-MM-DD
  sellerNTNCNIC: string;
  sellerBusinessName: string;
  sellerProvince: string;
  sellerAddress: string;
  buyerNTNCNIC: string;                    // required, optional for Unregistered
  buyerBusinessName: string;
  buyerProvince: string;
  buyerAddress: string;
  buyerRegistrationType: 'Registered' | 'Unregistered';
  invoiceRefNo: string;                    // empty for sale; FBR invoice no. for debit note
  scenarioId?: string;                     // sandbox only
  items: FbrInvoiceItem[];
}

/** v1.12 §4.1.3 — successful response. */
export interface FbrValidationResponse {
  statusCode: string;            // "00" valid / "01" invalid (header-level)
  status: string;                // "Valid" / "Invalid" / "invalid"
  error: string;
  errorCode?: string | null;
  invoiceStatuses: Array<{
    itemSNo: string;
    statusCode: string;
    status: string;
    invoiceNo?: string | null;
    errorCode?: string | null;
    error?: string;
  }> | null;
}

export interface FbrPostResponse {
  invoiceNumber?: string;
  dated?: string;
  validationResponse?: FbrValidationResponse;
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

function diBase(profile: FbrProfile): string {
  return (profile.apiBaseUrl ?? DI_API_BASE).replace(/\/$/, '');
}

export function getValidateUrl(profile: FbrProfile): string {
  return `${diBase(profile)}/validateinvoicedata${profile.mode === 'sandbox' ? '_sb' : ''}`;
}

export function getPostUrl(profile: FbrProfile): string {
  return `${diBase(profile)}/postinvoicedata${profile.mode === 'sandbox' ? '_sb' : ''}`;
}

// ─── Input shape from caller (sale data → FBR payload) ──────────────────────

/** Caller passes everything we need to build a payload — including resolved per-medicine
 *  FBR fields. Resolution (medicine.fbrSaleType, medicine.fbrUom, etc.) happens
 *  upstream in index.ts so this module stays pure. */
export interface SaleItemForFbr {
  medicineId: string;
  medicineName: string;
  hsCode: string | null;
  fbrUom: string | null;            // ref API 5.6 description
  fbrSaleType: string | null;       // §9 saleType string
  fbrSroScheduleNo?: string | null;
  fbrSroItemSerialNo?: string | null;
  fbrFixedNotifiedValueOrRetailPrice?: number | null;
  quantity: number;
  unitPrice: number;                // pre-discount, pre-tax
  discountAmount: number;           // per-line absolute amount in PKR
  taxPercent: number;               // applied to (qty*unitPrice - discountAmount)
  furtherTax?: number;              // optional, default 0
  fedPayable?: number;              // optional, default 0
}

export interface SaleForFbr {
  /** Local invoice/return number for logging only. FBR ignores it. */
  localInvoiceNumber: string;
  /** True invoice date (sale date). */
  saleDate: Date;
  buyerNTNCNIC: string | null;
  buyerBusinessName: string | null;
  buyerProvince: string | null;
  buyerAddress: string | null;
  buyerRegistrationType: 'Registered' | 'Unregistered';
  items: SaleItemForFbr[];
  /** For Debit/Credit Note flows — original FBR invoice number to refer to. */
  originalFbrInvoiceNumber?: string | null;
}

// ─── Payload builders ────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  // YYYY-MM-DD in Asia/Karachi local time
  const pkt = new Date(d.getTime() + 5 * 60 * 60 * 1000); // PKT = UTC+5, no DST
  return pkt.toISOString().slice(0, 10);
}

function rateString(item: SaleItemForFbr): string {
  // FBR §5.8 expects ratE_DESC like "18%", "0%", "Exempt".
  if (!Number.isFinite(item.taxPercent)) return '0%';
  if (item.taxPercent === 0) return '0%';
  return `${item.taxPercent}%`;
}

function buildItem(item: SaleItemForFbr): FbrInvoiceItem {
  const qty = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);
  const lineValue = round2(qty * unitPrice);
  const valueSalesExclST = round2(lineValue - Number(item.discountAmount ?? 0));
  const salesTaxApplicable = round2((valueSalesExclST * Number(item.taxPercent ?? 0)) / 100);
  const furtherTax = Number(item.furtherTax ?? 0);
  const fedPayable = Number(item.fedPayable ?? 0);
  const totalValues = round2(valueSalesExclST + salesTaxApplicable + furtherTax + fedPayable);

  if (!item.hsCode) {
    throw new Error(`Medicine "${item.medicineName}" has no HS Code — set medicine.hsCode before submitting to FBR (spec §4 error 0019/0044).`);
  }
  if (!item.fbrUom) {
    throw new Error(`Medicine "${item.medicineName}" has no FBR UoM — set medicine.fbrUom per reference API 5.6 (error 0099).`);
  }
  if (!item.fbrSaleType) {
    throw new Error(`Medicine "${item.medicineName}" has no FBR Sale Type — set medicine.fbrSaleType per §9 scenario (error 0013).`);
  }

  return {
    hsCode: item.hsCode,
    productDescription: item.medicineName,
    rate: rateString(item),
    uoM: item.fbrUom,
    quantity: round4(qty),
    totalValues,
    valueSalesExcludingST: valueSalesExclST,
    fixedNotifiedValueOrRetailPrice: round2(item.fbrFixedNotifiedValueOrRetailPrice ?? 0),
    salesTaxApplicable,
    salesTaxWithheldAtSource: 0,            // retail pharmacy never withholds
    extraTax: '',                           // §7 error 0091 — must be empty unless applicable
    furtherTax: round2(furtherTax),
    sroScheduleNo: item.fbrSroScheduleNo ?? '',
    fedPayable: round2(fedPayable),
    discount: round2(item.discountAmount ?? 0),
    saleType: item.fbrSaleType,
    sroItemSerialNo: item.fbrSroItemSerialNo ?? '',
  };
}

export function buildSaleInvoicePayload(sale: SaleForFbr, profile: FbrProfile): FbrInvoicePayload {
  if (!profile.sellerNTNCNIC) {
    throw new Error('FBR profile missing sellerNTNCNIC (error 0108).');
  }
  if (!profile.sellerBusinessName || !profile.sellerProvince || !profile.sellerAddress) {
    throw new Error('FBR profile missing seller business name / province / address.');
  }

  const payload: FbrInvoicePayload = {
    invoiceType: 'Sale Invoice',
    invoiceDate: isoDate(sale.saleDate),
    sellerNTNCNIC: profile.sellerNTNCNIC.trim(),
    sellerBusinessName: profile.sellerBusinessName.trim(),
    sellerProvince: profile.sellerProvince.trim(),
    sellerAddress: profile.sellerAddress.trim(),
    buyerNTNCNIC: (sale.buyerNTNCNIC ?? '').trim(),
    buyerBusinessName: (sale.buyerBusinessName ?? 'Walk-in Customer').trim(),
    buyerProvince: (sale.buyerProvince ?? profile.sellerProvince).trim(),
    buyerAddress: (sale.buyerAddress ?? '').trim(),
    buyerRegistrationType: sale.buyerRegistrationType,
    invoiceRefNo: '',
    items: sale.items.map(buildItem),
  };

  // Per §9 — scenarioId is REQUIRED in sandbox, MUST be absent in production.
  if (profile.mode === 'sandbox') {
    payload.scenarioId = profile.defaultScenarioId || 'SN026';
  }

  return payload;
}

export function buildDebitNotePayload(saleReturn: SaleForFbr, profile: FbrProfile): FbrInvoicePayload {
  if (!saleReturn.originalFbrInvoiceNumber) {
    throw new Error('Cannot build debit note: originalFbrInvoiceNumber is required (error 0026).');
  }
  const base = buildSaleInvoicePayload(saleReturn, profile);
  return {
    ...base,
    invoiceType: 'Debit Note',
    invoiceRefNo: saleReturn.originalFbrInvoiceNumber,
  };
}

// ─── HTTP wrappers ───────────────────────────────────────────────────────────

class FbrHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, context: string) {
    super(`FBR ${context} ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

async function callFbr<T>(
  url: string,
  bearerToken: string,
  body: object | null,
  method: 'GET' | 'POST',
  context: string,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${bearerToken}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new FbrHttpError(response.status, text, context);
  }
  return (await response.json()) as T;
}

/** Run a dry-run validation against the FBR validate endpoint. */
export async function validateInvoiceData(
  payload: FbrInvoicePayload,
  bearerToken: string,
  profile: FbrProfile,
): Promise<FbrPostResponse> {
  return callFbr<FbrPostResponse>(getValidateUrl(profile), bearerToken, payload, 'POST', 'validate');
}

/** Post an invoice for real. FBR will return an `invoiceNumber` you must keep
 *  and print as a QR code on the receipt (§6). */
export async function postInvoiceData(
  payload: FbrInvoicePayload,
  bearerToken: string,
  profile: FbrProfile,
): Promise<FbrPostResponse> {
  return callFbr<FbrPostResponse>(getPostUrl(profile), bearerToken, payload, 'POST', 'post');
}

/** Extract a human-readable summary from a v1.12 validationResponse. */
export function summarizeValidation(resp: FbrValidationResponse | undefined): string {
  if (!resp) return 'No validationResponse from FBR';
  const parts: string[] = [];
  if (resp.errorCode && resp.error) {
    const known = FBR_ERROR_CODES[resp.errorCode];
    parts.push(`${resp.errorCode}: ${known ?? resp.error}`);
  } else if (resp.error) {
    parts.push(resp.error);
  }
  for (const s of resp.invoiceStatuses ?? []) {
    if (s.statusCode === '00') continue;
    const known = s.errorCode ? FBR_ERROR_CODES[s.errorCode] : undefined;
    parts.push(`item ${s.itemSNo}: ${s.errorCode ?? ''} ${known ?? s.error ?? ''}`.trim());
  }
  return parts.length ? parts.join(' | ') : `Status: ${resp.status} (${resp.statusCode})`;
}

export function isValid(resp: FbrPostResponse | undefined): boolean {
  const v = resp?.validationResponse;
  if (!v) return false;
  if (v.statusCode !== '00') return false;
  if (String(v.status).toLowerCase() !== 'valid') return false;
  for (const s of v.invoiceStatuses ?? []) {
    if (s.statusCode !== '00') return false;
  }
  return true;
}

// ─── Reference data (§5) — cached lookups for HS codes, UoMs, etc. ──────────

/** Generic GET against a PRAL reference endpoint, returns raw JSON. */
function refGet<T>(url: string, bearerToken: string): Promise<T> {
  return callFbr<T>(url, bearerToken, null, 'GET', 'reference');
}

export const fbrReference = {
  /** §5.1 — provinces */
  provinces: (token: string) =>
    refGet<Array<{ stateProvinceCode: number; stateProvinceDesc: string }>>(`${PDI_API_BASE}/provinces`, token),

  /** §5.2 — document types ({docTypeId: 4 → "Sale Invoice", 9 → "Debit Note"}) */
  docTypes: (token: string) =>
    refGet<Array<{ docTypeId: number; docDescription: string }>>(`${PDI_API_BASE}/doctypecode`, token),

  /** §5.3 — HS codes (large; cache aggressively) */
  itemCodes: (token: string) =>
    refGet<Array<{ hS_CODE: string; description: string }>>(`${PDI_API_BASE}/itemdesccode`, token),

  /** §5.5 — transaction types */
  transactionTypes: (token: string) =>
    refGet<Array<{ transactioN_TYPE_ID: number; transactioN_DESC: string }>>(`${PDI_API_BASE}/transtypecode`, token),

  /** §5.6 — UoMs */
  uoms: (token: string) =>
    refGet<Array<{ uoM_ID: number; description: string }>>(`${PDI_API_BASE}/uom`, token),

  /** §5.8 — rate descriptions for a given transaction type / date */
  saleTypeToRate: (token: string, opts: { date: string; transTypeId: number; originationSupplier: number }) =>
    refGet<Array<{ ratE_ID: number; ratE_DESC: string; ratE_VALUE: number }>>(
      `${PDI_V2_BASE}/SaleTypeToRate?date=${encodeURIComponent(opts.date)}&transTypeId=${opts.transTypeId}&originationSupplier=${opts.originationSupplier}`,
      token,
    ),

  /** §5.9 — UoM allowed for an HS code under a sales annexure */
  hsCodeToUom: (token: string, opts: { hsCode: string; annexureId: number }) =>
    refGet<Array<{ uoM_ID: number; description: string }>>(
      `${PDI_V2_BASE}/HS_UOM?hs_code=${encodeURIComponent(opts.hsCode)}&annexure_id=${opts.annexureId}`,
      token,
    ),

  /** §5.7 — SRO schedules valid for a rate / date */
  sroSchedules: (token: string, opts: { rateId: number; date: string; originationSupplierCsv: number | string }) =>
    refGet<Array<{ srO_ID: number; srO_DESC: string }>>(
      `${PDI_API_BASE}/SroSchedule?rate_id=${opts.rateId}&date=${encodeURIComponent(opts.date)}&origination_supplier_csv=${opts.originationSupplierCsv}`,
      token,
    ),

  /** §5.10 — SRO items under a schedule */
  sroItems: (token: string, opts: { date: string; sroId: number }) =>
    refGet<Array<{ srO_ITEM_ID: number; srO_ITEM_DESC: string }>>(
      `${PDI_V2_BASE}/SROItem?date=${encodeURIComponent(opts.date)}&sro_id=${opts.sroId}`,
      token,
    ),

  /** §5.11 — STATL active-taxpayer-list check for a registration on a date */
  statl: (token: string, opts: { regno: string; date: string }) =>
    callFbr<{ ['status code']?: string; status?: string; statuscode?: string }>(
      `${DIST_API_BASE}/statl`, token, { regno: opts.regno, date: opts.date }, 'POST', 'STATL',
    ),

  /** §5.12 — registration type lookup (Registered / Unregistered) */
  registrationType: (token: string, registrationNo: string) =>
    callFbr<{ statuscode: string; REGISTRATION_NO: string; REGISTRATION_TYPE: string }>(
      `${DIST_API_BASE}/Get_Reg_Type`, token, { Registration_No: registrationNo }, 'POST', 'Reg-Type',
    ),
};

// ─── Queue worker (submission record → FBR call → DB update) ─────────────────

/** v1.12 — what gets stored in FbrSubmission.payload. The shape is the exact JSON
 *  we send to FBR, so spec changes don't require a DB migration. */

const MAX_RETRIES = 5;
const RETRY_BACKOFF_MIN = 5 * 60 * 1000;       // 5 minutes
const RETRY_BACKOFF_MAX = 60 * 60 * 1000;      // 1 hour

function nextAttempt(retries: number): Date | null {
  if (retries >= MAX_RETRIES) return null;
  return new Date(Date.now() + Math.min(retries * RETRY_BACKOFF_MIN, RETRY_BACKOFF_MAX));
}

export async function submitFbrRecord(submissionId: string): Promise<void> {
  const sub = await prisma.fbrSubmission.findUnique({ where: { id: submissionId } });
  if (!sub || sub.status === 'submitted') return;

  const tenant = await prisma.tenant.findUnique({ where: { id: sub.tenantId } });
  if (!tenant?.fbrTokenEncrypted) {
    await prisma.fbrSubmission.update({
      where: { id: submissionId },
      data: { status: 'failed', lastError: 'No FBR bearer token configured', updatedAt: new Date() },
    });
    return;
  }

  const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
  const profile = settings.fbrProfile as FbrProfile | undefined;
  if (!profile?.enabled) {
    await prisma.fbrSubmission.update({
      where: { id: submissionId },
      data: { status: 'skipped', lastError: 'FBR integration disabled', updatedAt: new Date() },
    });
    return;
  }

  let bearerToken: string;
  try {
    bearerToken = decryptToken(tenant.fbrTokenEncrypted);
  } catch {
    await prisma.fbrSubmission.update({
      where: { id: submissionId },
      data: { status: 'failed', lastError: 'Failed to decrypt FBR token', updatedAt: new Date() },
    });
    return;
  }

  const payload = sub.payload as unknown as FbrInvoicePayload;

  try {
    // §4.2 — optional validate-first. Recommended in sandbox / when onboarding.
    if (profile.validateBeforePost) {
      const validated = await validateInvoiceData(payload, bearerToken, profile);
      if (!isValid(validated)) {
        const msg = `Validate rejected: ${summarizeValidation(validated.validationResponse)}`;
        const retries = sub.retries + 1;
        const next = nextAttempt(retries);
        await prisma.fbrSubmission.update({
          where: { id: submissionId },
          data: {
            status: next ? 'pending' : 'failed',
            retries,
            lastError: msg,
            nextAttemptAt: next,
            updatedAt: new Date(),
          },
        });
        return;
      }
    }

    const result = await postInvoiceData(payload, bearerToken, profile);

    if (!isValid(result)) {
      const msg = summarizeValidation(result.validationResponse);
      const retries = sub.retries + 1;
      const next = nextAttempt(retries);
      await prisma.fbrSubmission.update({
        where: { id: submissionId },
        data: {
          status: next ? 'pending' : 'failed',
          retries,
          lastError: msg,
          nextAttemptAt: next,
          updatedAt: new Date(),
        },
      });
      return;
    }

    const fbrInvoiceNumber = result.invoiceNumber ?? null;
    // §6 — the QR payload on the printed receipt IS the FBR invoice number.
    const qrPayload = fbrInvoiceNumber;

    await prisma.fbrSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'submitted',
        fbrInvoiceNumber,
        fbrBarcode: fbrInvoiceNumber,        // FBR returns no separate barcode field in v1.12
        fbrQrPayload: qrPayload,
        retries: sub.retries + 1,
        lastError: null,
        updatedAt: new Date(),
      },
    });

    if (sub.referenceType === 'sale' && fbrInvoiceNumber) {
      await prisma.sale.update({
        where: { id: sub.referenceId, tenantId: sub.tenantId },
        data: {
          fbrStatus: 'submitted',
          fbrInvoiceNumber,
          fbrBarcode: fbrInvoiceNumber,
          fbrQrPayload: qrPayload,
          fbrResponse: result as unknown as never,
        },
      });
    }

    if (sub.referenceType === 'sale_return' && fbrInvoiceNumber) {
      await prisma.saleReturn.update({
        where: { id: sub.referenceId, tenantId: sub.tenantId },
        data: {
          fbrStatus: 'submitted',
          fbrReference: fbrInvoiceNumber,
          fbrResponse: result as unknown as never,
        },
      });
    }
  } catch (error) {
    const retries = sub.retries + 1;
    const next = nextAttempt(retries);
    await prisma.fbrSubmission.update({
      where: { id: submissionId },
      data: {
        status: next ? 'pending' : 'failed',
        retries,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        nextAttemptAt: next,
        updatedAt: new Date(),
      },
    });
  }
}

export async function enqueueFbrSubmission(
  tenantId: string,
  type: 'invoice' | 'debit_note',
  referenceId: string,
  referenceType: 'sale' | 'sale_return',
  payload: FbrInvoicePayload,
): Promise<string> {
  const sub = await prisma.fbrSubmission.create({
    data: {
      tenantId,
      type,
      referenceId,
      referenceType,
      payload: payload as unknown as never,
      status: 'pending',
      nextAttemptAt: new Date(),
    },
  });
  return sub.id;
}

export function startFbrRetryWorker(intervalMs = 60_000): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const due = await prisma.fbrSubmission.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
        take: 20,
        orderBy: { nextAttemptAt: 'asc' },
      });
      for (const sub of due) {
        await submitFbrRecord(sub.id).catch((err) => {
          console.error(`FBR retry failed for ${sub.id}:`, err);
        });
      }
    } catch (err) {
      console.error('FBR retry worker error:', err);
    }
  }, intervalMs);
}

// ─── Numeric helpers ────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}
