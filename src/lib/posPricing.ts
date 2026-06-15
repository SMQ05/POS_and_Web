import type { AppSettings, Batch, Medicine, PaymentMethod, UserRole } from '@/types';

/** Effective trade price the cashier should use as a discount floor.
 *  Resolution order: batch override → medicine default → fall back to sale price.
 *  Returns 0 only when all three are missing (no batch supplied AND no medicine TP). */
export function resolveTradePrice(batch?: Pick<Batch, 'tradePrice' | 'salePrice'> | null, medicine?: Pick<Medicine, 'tradePrice'> | null): number {
  if (batch?.tradePrice != null && batch.tradePrice > 0) return batch.tradePrice;
  if (medicine?.tradePrice != null && medicine.tradePrice > 0) return medicine.tradePrice;
  return batch?.salePrice ?? 0;
}

/** Which prices is this role allowed to see on the POS terminal?
 *  Owner always sees everything regardless of flags. Other roles must be both
 *  enabled (`show*OnPOS`) AND included in the role allow-list. */
export function getVisiblePrices(settings: AppSettings, role?: UserRole | null): { purchase: boolean; trade: boolean; sale: boolean } {
  if (role === 'owner' || role === 'superadmin') {
    return { purchase: true, trade: true, sale: true };
  }
  const r = role ?? 'cashier';
  const visible = (on: boolean | undefined, roles: UserRole[] | undefined): boolean =>
    Boolean(on && (roles ?? []).includes(r));
  return {
    purchase: visible(settings.showPurchasePriceOnPOS, settings.showPurchasePriceRoles),
    trade: visible(settings.showTradePriceOnPOS, settings.showTradePriceRoles),
    sale: visible(settings.showSalePriceOnPOS, settings.showSalePriceRoles),
  };
}

/** Look up the configured default discount/fee for a payment method.
 *  Returns zeros when nothing is configured so callers can blindly apply. */
export function paymentMethodDefault(settings: AppSettings, method: PaymentMethod['method']): { feePercent: number; discountPercent: number } {
  const cfg = settings.paymentMethodDefaults?.[method];
  return {
    feePercent: cfg?.feePercent ?? 0,
    discountPercent: cfg?.discountPercent ?? 0,
  };
}
