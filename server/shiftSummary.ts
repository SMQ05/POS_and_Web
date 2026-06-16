// Per-operator cash reconciliation for a shift close (Marg-style "Mode of
// Payment" tally). Pure + side-effect free so it can be unit-tested in
// isolation and reused by the shift-close route.
//
//   expectedCash = openingCash + (cash-mode sales − cash refunds)
//   difference   = countedClosingCash − expectedCash   (+ over, − short)

export interface PaymentLine {
  method: string;
  amount: number;
}

export interface ShiftSummary {
  byMethod: Record<string, number>;
  cashCollected: number;
  expectedCash: number;
  difference: number;
  salesCount: number;
  returnsCount: number;
}

export function computeShiftSummary(opts: {
  openingCash: number;
  closingCash: number;
  sales: Array<{ paymentMethods: unknown }>;
  returns: Array<{ refundMethod: unknown }>;
}): ShiftSummary {
  const { openingCash, closingCash, sales, returns } = opts;

  // Gross sales split by payment method; cash-mode total tracked separately.
  const byMethod: Record<string, number> = {};
  let cashSales = 0;
  for (const s of sales) {
    const methods = (s.paymentMethods as PaymentLine[] | null) ?? [];
    for (const m of methods) {
      const amt = m.amount ?? 0;
      byMethod[m.method] = (byMethod[m.method] ?? 0) + amt;
      if (m.method === 'cash') cashSales += amt;
    }
  }

  // Refunds reduce the drawer only when paid back in cash.
  let cashRefunds = 0;
  for (const r of returns) {
    const rm = r.refundMethod as { method?: string; amount?: number } | null;
    if (rm?.method === 'cash') cashRefunds += rm.amount ?? 0;
  }

  const cashCollected = cashSales - cashRefunds;
  const expectedCash = openingCash + cashCollected;
  const difference = closingCash - expectedCash;
  return {
    byMethod,
    cashCollected,
    expectedCash,
    difference,
    salesCount: sales.length,
    returnsCount: returns.length,
  };
}
