import type { BootstrapResponse } from './backend';

// Mock seed for offline-only smoke. Schemas have drifted across milestones —
// the rows below are intentionally loose and cast to `BootstrapResponse` so
// type drift doesn't block the rest of the bundle. Replace this with a real
// API call as soon as your local DB is up.
export const getMockBootstrapData = (): BootstrapResponse => {
  const today = new Date();

  // Create date helper offsets
  const d = (daysOffset: number) => {
    const copy = new Date(today);
    copy.setDate(today.getDate() + daysOffset);
    return copy;
  };

  const medicines = [
    {
      id: 'med-panadol',
      name: 'Panadol 500mg Tablets',
      genericName: 'Paracetamol',
      brandName: 'GSK',
      category: 'OTC',
      unit: 'Box',
      shelfLocation: 'Shelf A-3',
      reorderLevel: 50,
      reorderQuantity: 200,
      isActive: true,
      barcode: '11111111',
      units: [
        { name: 'Box (200s)', abbreviation: 'Box', multiplier: 1, salePrice: 480, purchasePrice: 400, isBaseUnit: true, isActive: true },
        { name: 'Strip (10s)', abbreviation: 'Strip', multiplier: 0.05, salePrice: 25, purchasePrice: 20, isBaseUnit: false, isActive: true }
      ],
      createdAt: today,
      updatedAt: today
    },
    {
      id: 'med-amoxil',
      name: 'Amoxil 250mg Capsules',
      genericName: 'Amoxicillin Trihydrate',
      brandName: 'GSK',
      category: 'Rx',
      unit: 'Box',
      shelfLocation: 'Shelf B-1',
      reorderLevel: 20,
      reorderQuantity: 100,
      isActive: true,
      barcode: '22222222',
      units: [
        { name: 'Box (100s)', abbreviation: 'Box', multiplier: 1, salePrice: 1200, purchasePrice: 1000, isBaseUnit: true, isActive: true },
        { name: 'Strip (10s)', abbreviation: 'Strip', multiplier: 0.1, salePrice: 130, purchasePrice: 110, isBaseUnit: false, isActive: true }
      ],
      createdAt: today,
      updatedAt: today
    },
    {
      id: 'med-arinac',
      name: 'Arinac Forte Tablets',
      genericName: 'Ibuprofen + Pseudoephedrine',
      brandName: 'Abbott',
      category: 'OTC',
      unit: 'Pack',
      shelfLocation: 'Shelf A-4',
      reorderLevel: 30,
      reorderQuantity: 80,
      isActive: true,
      barcode: '33333333',
      units: [
        { name: 'Pack (100s)', abbreviation: 'Pack', multiplier: 1, salePrice: 650, purchasePrice: 550, isBaseUnit: true, isActive: true }
      ],
      createdAt: today,
      updatedAt: today
    },
    {
      id: 'med-lipitor',
      name: 'Lipitor 10mg Tablets',
      genericName: 'Atorvastatin Calcium',
      brandName: 'Pfizer',
      category: 'Rx',
      unit: 'Pack',
      shelfLocation: 'Shelf C-2',
      reorderLevel: 15,
      reorderQuantity: 50,
      isActive: true,
      barcode: '44444444',
      units: [
        { name: 'Pack (30s)', abbreviation: 'Pack', multiplier: 1, salePrice: 2100, purchasePrice: 1800, isBaseUnit: true, isActive: true }
      ],
      createdAt: today,
      updatedAt: today
    },
    {
      id: 'med-ritalin',
      name: 'Ritalin 10mg Tablets',
      genericName: 'Methylphenidate Hydrochloride',
      brandName: 'Novartis',
      category: 'Controlled',
      unit: 'Pack',
      shelfLocation: 'Safe Storage',
      reorderLevel: 5,
      reorderQuantity: 20,
      isActive: true,
      barcode: '55555555',
      units: [
        { name: 'Pack (30s)', abbreviation: 'Pack', multiplier: 1, salePrice: 1850, purchasePrice: 1600, isBaseUnit: true, isActive: true }
      ],
      createdAt: today,
      updatedAt: today
    }
  ];

  const batches = [
    // Panadol - 2 active batches (one expiring critical, one standard)
    {
      id: 'batch-panadol-critical',
      medicineId: 'med-panadol',
      batchNumber: 'PND-90A',
      expiryDate: d(15), // Expires in 15 days
      manufacturingDate: d(-300),
      quantity: 12, // Low stock count
      purchasePrice: 400,
      salePrice: 480,
      mrp: 480,
      supplierId: 'sup-gsk',
      isActive: true,
      createdAt: today,
      updatedAt: today
    },
    {
      id: 'batch-panadol-std',
      medicineId: 'med-panadol',
      batchNumber: 'PND-91B',
      expiryDate: d(540), // Expires in 1.5 years
      manufacturingDate: d(-10),
      quantity: 180, // healthy stock
      purchasePrice: 400,
      salePrice: 480,
      mrp: 480,
      supplierId: 'sup-gsk',
      isActive: true,
      createdAt: today,
      updatedAt: today
    },
    // Amoxil - 1 batch, low stock
    {
      id: 'batch-amoxil-low',
      medicineId: 'med-amoxil',
      batchNumber: 'AMX-44',
      expiryDate: d(240),
      manufacturingDate: d(-120),
      quantity: 8, // Low Stock count!
      purchasePrice: 1000,
      salePrice: 1200,
      mrp: 1200,
      supplierId: 'sup-gsk',
      isActive: true,
      createdAt: today,
      updatedAt: today
    },
    // Arinac - 1 batch, expiring warning
    {
      id: 'batch-arinac-warning',
      medicineId: 'med-arinac',
      batchNumber: 'ARN-88C',
      expiryDate: d(45), // 45 days warning
      manufacturingDate: d(-250),
      quantity: 55,
      purchasePrice: 550,
      salePrice: 650,
      mrp: 650,
      supplierId: 'sup-abbott',
      isActive: true,
      createdAt: today,
      updatedAt: today
    },
    // Lipitor - 1 batch, healthy
    {
      id: 'batch-lipitor-ok',
      medicineId: 'med-lipitor',
      batchNumber: 'LPT-22',
      expiryDate: d(720),
      manufacturingDate: d(-10),
      quantity: 45,
      purchasePrice: 1800,
      salePrice: 2100,
      mrp: 2100,
      supplierId: 'sup-abbott',
      isActive: true,
      createdAt: today,
      updatedAt: today
    }
  ];

  const branches = [
    { id: '1', name: 'Main Pharmacy Store', address: 'Main Market, Lahore', phone: '+92-300-1234567', isActive: true, createdAt: today, updatedAt: today },
    { id: '2', name: 'DHA Phase 5 Outlet', address: 'DHA Phase 5, Lahore', phone: '+92-300-7654321', isActive: true, createdAt: today, updatedAt: today }
  ];

  const suppliers = [
    { id: 'sup-gsk', name: 'GSK Pakistan Distribution', contactPerson: 'Bilal Ahmed', email: 'gsk@dist.pk', phone: '0300-1234567', currentBalance: 45000, isActive: true, createdAt: today, updatedAt: today },
    { id: 'sup-abbott', name: 'Abbott Labs Pakistan', contactPerson: 'Hamza Khan', email: 'abbott@dist.pk', phone: '0321-9876543', currentBalance: 0, isActive: true, createdAt: today, updatedAt: today }
  ];

  const customers = [
    { id: 'cust-1', name: 'Muhammad Bilal', phone: '0300-5556667', email: 'bilal@kynex.pk', cnic: '35201-1234567-9', address: 'Model Town, Lahore', isActive: true, createdAt: today, updatedAt: today },
    { id: 'cust-2', name: 'Dr. Ayesha Khan', phone: '0318-9540997', email: 'ayesha@rx.pk', cnic: '35202-9876543-2', address: 'DHA, Lahore', isActive: true, createdAt: today, updatedAt: today }
  ];

  // Sales trend - generate a few historic sales in last 5 days. Loose shape;
  // cast at the outer return.
  const sales: unknown[] = Array.from({ length: 12 }).map((_, idx) => {
    const saleDaysAgo = Math.floor(idx / 3.5);
    const saleDate = d(-saleDaysAgo);
    const num = `INV-100${24 + idx}`;
    const amount = 850 + (idx * 310);
    return {
      id: `sale-${idx}`,
      invoiceNumber: num,
      branchId: '1',
      customerName: idx % 2 === 0 ? 'Muhammad Bilal' : 'Walk-in Customer',
      customerPhone: idx % 2 === 0 ? '0300-5556667' : undefined,
      saleDate,
      items: [
        { medicineId: 'med-panadol', medicineName: 'Panadol 500mg Tablets', batchId: 'batch-panadol-std', batchNumber: 'PND-91B', quantity: 2, unitPrice: 480, purchasePrice: 400, total: 960, discountPercent: 0, taxPercent: 18 }
      ],
      subtotal: amount * 0.85,
      discountAmount: 0,
      taxAmount: amount * 0.15,
      totalAmount: amount,
      paidAmount: amount,
      balanceAmount: 0,
      paymentMethods: [idx % 3 === 0 ? 'card' : 'cash'],
      status: 'completed' as const,
      notes: 'Sandbox transaction',
      createdBy: '1',
      createdAt: saleDate,
      updatedAt: saleDate
    };
  });

  return {
    tenant: { id: 'demo-tenant-id', name: 'Kynex Pharmacloud Demo', slug: 'demo-pharmacy', subscriptionPlan: 'basic', isActive: true, createdAt: today },
    branches,
    medicines,
    batches,
    suppliers,
    customers,
    sales: sales as never,
    saleReturns: [],
    purchases: [],
    expenses: [],
    ledgerEntries: [],
  } as unknown as BootstrapResponse;
};
