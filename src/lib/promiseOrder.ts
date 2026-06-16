// Feature 4 — promise/advance order settlement math. The customer pays an
// advance up front; at hand-over we charge the final price. Positive balance =
// collect more from the customer; negative = refund the difference.
export function settlement(advance: number, finalPrice: number): {
  balance: number;
  toCollect: number;
  toRefund: number;
} {
  const balance = Number((finalPrice - advance).toFixed(2));
  return {
    balance,
    toCollect: Math.max(0, balance),
    toRefund: Math.max(0, -balance),
  };
}
