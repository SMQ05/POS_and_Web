import type {
  Batch,
  Customer,
  Expense,
  LedgerEntry,
  Medicine,
  Purchase,
  Sale,
  SaleReturn,
  Supplier,
  User,
  Branch,
} from '../src/types/index.js';

export function publicUser(user: any): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions ?? [],
    branchId: user.branchId ?? undefined,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin ?? undefined,
    salesUsername: user.salesUsername ?? undefined,
    salesPinSet: Boolean(user.salesPinHash),
    branchAccess: Array.isArray(user.branchAccess) ? user.branchAccess : undefined,
  };
}

export function shiftSession(row: any) {
  return {
    id: row.id,
    branchId: row.branchId,
    userId: row.userId,
    userName: row.userName ?? undefined,
    openedAt: row.openedAt,
    openingCash: row.openingCash,
    closedAt: row.closedAt ?? undefined,
    closingCash: row.closingCash ?? undefined,
    salesTotal: row.salesTotal,
    returnsTotal: row.returnsTotal,
    summary: row.summary ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
  };
}

export function dayClose(row: any) {
  return {
    id: row.id,
    branchId: row.branchId,
    closedBy: row.closedBy,
    closedByName: row.closedByName ?? undefined,
    closedAt: row.closedAt,
    businessDate: row.businessDate,
    openingCash: row.openingCash ?? undefined,
    closingCash: row.closingCash ?? undefined,
    salesTotal: row.salesTotal,
    returnsTotal: row.returnsTotal,
    expensesTotal: row.expensesTotal,
    summary: row.summary ?? {},
    notes: row.notes ?? undefined,
  };
}

export function branch(row: any): Branch {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    billingPaidBy: (row.billingPaidBy ?? 'main') as 'main' | 'self',
    subscriptionDiscount: row.subscriptionDiscount ?? 0,
    createdAt: row.createdAt,
  };
}

export function medicine(row: any): Medicine {
  return {
    id: row.id,
    name: row.name,
    genericName: row.genericName,
    brandName: row.brandName ?? undefined,
    category: row.category,
    subCategory: row.subCategory ?? undefined,
    description: row.description ?? undefined,
    dosageForm: row.dosageForm,
    strength: row.strength,
    unit: row.unit,
    units: row.units ?? undefined,
    barcode: row.barcode ?? undefined,
    qrCode: row.qrCode ?? undefined,
    masterProductId: row.masterProductId ?? undefined,
    drapRegNo: row.drapRegNo ?? undefined,
    isPrescriptionRequired: row.isPrescriptionRequired,
    classification: row.classification,
    substituteIds: row.substituteIds ?? undefined,
    controlledSchedule: row.controlledSchedule ?? undefined,
    isActive: row.isActive,
    webLive: row.webLive,
    reorderLevel: row.reorderLevel,
    reorderQuantity: row.reorderQuantity,
    hsCode: row.hsCode ?? undefined,
    fbrUom: row.fbrUom ?? undefined,
    fbrSaleType: row.fbrSaleType ?? undefined,
    fbrScenarioId: row.fbrScenarioId ?? undefined,
    drapRegistration: row.drapRegistration ?? undefined,
    manufacturer: row.manufacturer ?? undefined,
    countryOfOrigin: row.countryOfOrigin ?? undefined,
    packSize: row.packSize ?? undefined,
    storageInstructions: row.storageInstructions ?? undefined,
    taxRatePercent: row.taxRatePercent ?? undefined,
    shelfLocation: row.shelfLocation ?? undefined,
    rackNumber: row.rackNumber ?? undefined,
    mrp: row.mrp ?? undefined,
    purchaseRate: row.purchaseRate ?? undefined,
    tradePrice: row.tradePrice ?? undefined,
    maxStock: row.maxStock ?? undefined,
    allowLooseSale: row.allowLooseSale ?? true,
    schedule: row.schedule ?? undefined,
    composition: row.composition ?? undefined,
    reorderActive: row.reorderActive ?? true,
    barcodeImageUrl: row.barcodeImageUrl ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function batch(row: any): Batch {
  return {
    id: row.id,
    medicineId: row.medicineId,
    branchId: row.branchId ?? undefined,
    batchNumber: row.batchNumber,
    expiryDate: row.expiryDate,
    manufacturingDate: row.manufacturingDate ?? undefined,
    quantity: row.quantity,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    tradePrice: row.tradePrice ?? undefined,
    mrp: row.mrp,
    supplierId: row.supplierId ?? '',
    purchaseId: row.purchaseId ?? '',
    location: row.location ?? undefined,
    isActive: row.isActive,
    disposition: row.disposition ?? undefined,
    dispositionReason: row.dispositionReason ?? undefined,
    dispositionValue: row.dispositionValue ?? undefined,
    dispositionNote: row.dispositionNote ?? undefined,
    dispositionAt: row.dispositionAt ?? undefined,
    createdAt: row.createdAt,
  };
}

export function supplier(row: any): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    phone: row.phone,
    email: row.email ?? undefined,
    address: row.address,
    city: row.city,
    ntn: row.ntn ?? undefined,
    gstNumber: row.gstNumber ?? undefined,
    creditLimit: row.creditLimit,
    currentBalance: row.currentBalance,
    paymentTerms: row.paymentTerms,
    isActive: row.isActive,
    createdAt: row.createdAt,
    visitDays: row.visitDays ?? undefined,
  };
}

export function medicineSupplier(row: any) {
  return {
    id: row.id,
    medicineId: row.medicineId,
    supplierId: row.supplierId,
    lastTradePrice: row.lastTradePrice ?? undefined,
    lastReceivedAt: row.lastReceivedAt ?? undefined,
    isPrimary: Boolean(row.isPrimary),
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function purchaseInvoice(row: any) {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    supplierInvoiceNumber: row.supplierInvoiceNumber,
    imageUrl: row.imageUrl ?? undefined,
    totalAmount: row.totalAmount,
    receivedAt: row.receivedAt,
    notes: row.notes ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function partner(row: any) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    baseUrl: row.baseUrl ?? undefined,
    apiKeySet: Boolean(row.apiKeyEncrypted),
    inboundSecretSet: Boolean(row.inboundSecret),
    isActive: Boolean(row.isActive),
    notes: row.notes ?? undefined,
    lastSyncAt: row.lastSyncAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function outboxEvent(row: any) {
  return {
    id: row.id,
    partnerId: row.partnerId ?? undefined,
    event: row.event,
    status: row.status,
    retries: row.retries,
    lastError: row.lastError ?? undefined,
    nextAttemptAt: row.nextAttemptAt ?? undefined,
    sentAt: row.sentAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function inboxThread(row: any) {
  return {
    id: row.id,
    partnerId: row.partnerId ?? undefined,
    subject: row.subject,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function inboxMessage(row: any) {
  return {
    id: row.id,
    threadId: row.threadId,
    senderType: row.senderType,
    senderName: row.senderName ?? undefined,
    body: row.body,
    attachmentUrl: row.attachmentUrl ?? undefined,
    readAt: row.readAt ?? undefined,
    createdAt: row.createdAt,
  };
}

export function notification(row: any) {
  return {
    id: row.id,
    scope: row.scope,
    userId: row.userId ?? undefined,
    role: row.role ?? undefined,
    title: row.title,
    body: row.body ?? undefined,
    severity: row.severity,
    kind: row.kind,
    link: row.link ?? undefined,
    dismissedAt: row.dismissedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

export function auditLog(row: any) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    action: row.action,
    module: row.module,
    details: row.details,
    entitySnapshot: row.entitySnapshot ?? undefined,
    ipAddress: row.ipAddress ?? undefined,
    createdAt: row.createdAt,
  };
}

export function reconcileRun(row: any) {
  return {
    id: row.id,
    scope: row.scope,
    scopeValue: row.scopeValue ?? undefined,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    notes: row.notes ?? undefined,
    createdBy: row.createdBy,
    postedBy: row.postedBy ?? undefined,
  };
}

export function reconcileEntry(row: any) {
  return {
    id: row.id,
    runId: row.runId,
    medicineId: row.medicineId,
    batchId: row.batchId ?? undefined,
    systemQty: row.systemQty,
    countedQty: row.countedQty,
    variance: row.variance,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function purchaseReturn(row: any) {
  return {
    id: row.id,
    returnNumber: row.returnNumber,
    supplierId: row.supplierId,
    purchaseId: row.purchaseId ?? undefined,
    returnDate: row.returnDate,
    items: row.items ?? [],
    totalAmount: row.totalAmount,
    reason: row.reason,
    stockAdjusted: Boolean(row.stockAdjusted),
    status: row.status,
    notes: row.notes ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function customer(row: any): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    cnic: row.cnic ?? undefined,
    address: row.address ?? undefined,
    dateOfBirth: row.dateOfBirth ?? undefined,
    allergies: row.allergies ?? undefined,
    medicalHistory: row.medicalHistory ?? undefined,
    isActive: row.isActive,
    createdAt: row.createdAt,
    totalPurchases: row.totalPurchases,
    loyaltyPoints: row.loyaltyPoints,
  };
}

export function sale(row: any): Sale {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    branchId: row.branchId,
    customerId: row.customerId ?? undefined,
    customerName: row.customerName ?? undefined,
    customerPhone: row.customerPhone ?? undefined,
    customerCnic: row.customerCnic ?? undefined,
    loyaltyPointsEarned: row.loyaltyPointsEarned ?? 0,
    loyaltyPointsRedeemed: row.loyaltyPointsRedeemed ?? 0,
    loyaltyDiscount: row.loyaltyDiscount ?? 0,
    doctorName: row.doctorName ?? undefined,
    prescriptionNumber: row.prescriptionNumber ?? undefined,
    prescriptionImageUrl: row.prescriptionImageUrl ?? undefined,
    saleDate: row.saleDate,
    items: row.items ?? [],
    subtotal: row.subtotal,
    discountAmount: row.discountAmount,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    balanceAmount: row.balanceAmount,
    paymentMethods: row.paymentMethods ?? [],
    status: row.status,
    isPrescription: row.isPrescription,
    notes: row.notes ?? undefined,
    fbrStatus: row.fbrStatus ?? undefined,
    fbrInvoiceNumber: row.fbrInvoiceNumber ?? undefined,
    fbrBarcode: row.fbrBarcode ?? undefined,
    fbrQrPayload: row.fbrQrPayload ?? undefined,
    fbrResponse: row.fbrResponse ?? undefined,
    createdBy: row.createdBy,
    salesPersonId: row.salesPersonId ?? undefined,
    salesPersonName: row.salesPersonName ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function saleReturn(row: any): SaleReturn {
  return {
    id: row.id,
    saleId: row.saleId,
    returnNumber: row.returnNumber,
    returnDate: row.returnDate,
    items: row.items ?? [],
    totalAmount: row.totalAmount,
    refundMethod: row.refundMethod ?? { method: 'cash', amount: row.totalAmount },
    reason: row.reason,
    restockInventory: row.restockInventory,
    fbrStatus: row.fbrStatus ?? undefined,
    fbrReference: row.fbrReference ?? undefined,
    fbrResponse: row.fbrResponse ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export const purchase = (row: any): Purchase => ({
  id: row.id,
  purchaseNumber: row.purchaseNumber,
  supplierId: row.supplierId,
  branchId: row.branchId,
  purchaseDate: row.purchaseDate,
  dueDate: row.dueDate ?? undefined,
  paymentTermsDays: row.paymentTermsDays ?? undefined,
  items: row.items ?? [],
  subtotal: row.subtotal,
  discountAmount: row.discountAmount,
  taxAmount: row.taxAmount,
  totalAmount: row.totalAmount,
  paidAmount: row.paidAmount,
  balanceAmount: row.balanceAmount,
  supplierInvoiceNumber: row.supplierInvoiceNumber ?? undefined,
  supplierInvoiceImageUrl: row.supplierInvoiceImageUrl ?? undefined,
  payments: row.payments ?? undefined,
  isLoose: row.isLoose ?? false,
  looseSource: row.looseSource ?? undefined,
  status: row.status,
  closedPartial: row.closedPartial ?? false,
  notes: row.notes ?? undefined,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const expense = (row: any): Expense => ({
  id: row.id,
  category: row.category,
  description: row.description,
  amount: row.amount,
  date: row.date,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

export const ledgerEntry = (row: any): LedgerEntry => ({
  id: row.id,
  type: row.type,
  referenceId: row.referenceId,
  referenceType: row.referenceType,
  amount: row.amount,
  description: row.description,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

// ─── B2B Network (perspective-aware: pass `me` = current tenantId) ────────────
const peerMini = (t: any) => t ? { id: t.id, handle: t.handle ?? undefined, name: t.name, businessType: t.businessType ?? 'pharmacy' } : undefined;

export function connection(row: any, me: string) {
  const peerT = row.aTenantId === me ? row.bTenant : row.aTenant;
  return {
    id: row.id,
    status: row.status,
    direction: row.requestedByTenantId === me ? 'outgoing' : 'incoming',
    requestedByMe: row.requestedByTenantId === me,
    blockedByMe: row.blockedByTenantId === me,
    peer: peerMini(peerT),
    unreadCount: typeof row._unread === 'number' ? row._unread : 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function connectionMessage(row: any, me: string) {
  return {
    id: row.id,
    connectionId: row.connectionId,
    body: row.body,
    mine: row.senderTenantId === me,
    senderName: row.senderName ?? undefined,
    readAt: row.readAt ?? undefined,
    createdAt: row.createdAt,
  };
}

export function networkOrderItem(row: any, isSeller: boolean) {
  return {
    id: row.id,
    productName: row.productName,
    strength: row.strength ?? undefined,
    packSize: row.packSize ?? undefined,
    quantity: row.quantity,
    // The buyer's local medicine ref is private — never expose to the seller.
    buyerMedicineId: isSeller ? undefined : (row.buyerMedicineId ?? undefined),
  };
}

export function networkOrder(row: any, me: string) {
  const isSeller = row.sellerTenantId === me;
  const peerId = isSeller ? row.buyerTenantId : row.sellerTenantId;
  const conn = row.connection;
  const peerT = conn ? (conn.aTenantId === peerId ? conn.aTenant : conn.bTenant) : undefined;
  return {
    id: row.id,
    connectionId: row.connectionId,
    orderNumber: row.orderNumber,
    status: row.status,
    role: isSeller ? 'seller' : 'buyer',
    notes: row.notes ?? undefined,
    totalQty: row.totalQty,
    buyerPurchaseId: isSeller ? undefined : (row.buyerPurchaseId ?? undefined),
    peer: peerMini(peerT),
    items: Array.isArray(row.items) ? row.items.map((it: any) => networkOrderItem(it, isSeller)) : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
