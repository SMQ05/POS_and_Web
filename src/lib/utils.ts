import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a monetary value using the configured currency */
export function formatCurrency(amount: number, currency: string = 'PKR'): string {
  const symbols: Record<string, string> = { PKR: 'Rs.', USD: '$', EUR: '€', GBP: '£' };
  const sym = symbols[currency] ?? currency;
  return `${sym} ${amount.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

/** Format a date according to the configured dateFormat string */
export function formatDate(date: Date | string, dateFormat: string = 'DD/MM/YYYY'): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  switch (dateFormat) {
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'DD/MM/YYYY':
    default: return `${day}/${month}/${year}`;
  }
}
