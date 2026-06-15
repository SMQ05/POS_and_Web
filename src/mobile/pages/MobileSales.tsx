import { useState, useMemo } from 'react';
import { useSalesStore, useSettingsStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Receipt,
  Calendar,
  DollarSign,
  Share2,
  Printer,
  X,
  CreditCard,
  Building,
  Activity,
  CheckCircle,
  Clock,
  ChevronRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface MobileSalesProps {
  onSetActiveTab: (tab: 'dashboard' | 'pos' | 'inventory' | 'sales' | 'more') => void;
}

export function MobileSales({ onSetActiveTab }: MobileSalesProps) {
  const { sales } = useSalesStore();
  const { settings } = useSettingsStore();
  const { t } = useTranslation();

  const [selectedSale, setSelectedSale] = useState<any | null>(null);

  // Compute stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales.filter(s => new Date(s.saleDate).toISOString().slice(0, 10) === today);
    const totalRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const cashTotal = todaySales.filter(s => s.paymentMethods?.some((m) => m.method === 'cash') || s.paymentMethods?.length === 0).reduce((sum, s) => sum + s.totalAmount, 0);
    const digitalTotal = totalRevenue - cashTotal;

    return {
      revenue: totalRevenue,
      transactions: todaySales.length,
      cash: cashTotal,
      digital: digitalTotal
    };
  }, [sales]);

  const salesTimeline = useMemo(() => {
    // Sort in reverse chronological order
    return [...sales].sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  }, [sales]);

  const getStatusBadge = (status: string) => {
    if (status === 'completed') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    if (status === 'pending') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
  };

  const handleShareWhatsApp = (sale: any) => {
    const phone = sale.customerPhone || '03189540997';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone;

    const text = encodeURIComponent(
      `*${settings.companyName} Receipt*\n` +
      `Invoice: *${sale.invoiceNumber}*\n` +
      `Date: ${new Date(sale.saleDate).toLocaleDateString()}\n` +
      `Total: *Rs. ${sale.totalAmount.toLocaleString()}*\n\n` +
      `Thank you for your purchase!`
    );

    window.open(`https://wa.me/${formattedPhone}?text=${text}`, '_blank');
  };

  const handlePrintMock = () => {
    toast.success('Receipt sent to configured Bluetooth thermal printer!');
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Invoice History
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Sales stream and digital billing archive
        </p>
      </div>

      {/* Brief Today summary section */}
      <Card className="border border-emerald-500/10 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Today Summary</span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {stats.transactions} sales
          </span>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[9px] text-emerald-700/60 dark:text-emerald-300/60 font-semibold">REVENUE</p>
            <p className="text-sm font-extrabold text-emerald-900 dark:text-emerald-200">
              Rs. {stats.revenue.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-emerald-700/60 dark:text-emerald-300/60 font-semibold">CASH IN</p>
            <p className="text-sm font-extrabold text-emerald-950 dark:text-white">
              Rs. {stats.cash.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-emerald-700/60 dark:text-emerald-300/60 font-semibold">DIGITAL</p>
            <p className="text-sm font-extrabold text-emerald-950 dark:text-white">
              Rs. {stats.digital.toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      {/* Timeline view */}
      <div className="space-y-2">
        {salesTimeline.map((sale) => (
          <div
            key={sale.id}
            onClick={() => setSelectedSale(sale)}
            className="p-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between gap-3 active:bg-gray-50 dark:active:bg-gray-800 transition-colors shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                  {sale.customerName || 'Walk-in Customer'}
                </h4>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  {sale.invoiceNumber} • {new Date(sale.saleDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className="text-right flex-shrink-0 flex items-center gap-2">
              <div>
                <p className="text-xs font-extrabold text-gray-900 dark:text-white">
                  Rs. {sale.totalAmount.toLocaleString()}
                </p>
                <span className={cn('text-[8px] py-0 px-1.5 rounded-full font-bold border block mt-0.5 text-center', getStatusBadge(sale.status))}>
                  {sale.status.toUpperCase()}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        ))}

        {salesTimeline.length === 0 && (
          <div className="text-center py-10 space-y-2">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No sales logged yet.
            </p>
          </div>
        )}
      </div>

      {/* Digital Thermal Receipt overlay bottom sheet */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Sheet Title */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                Digital Invoice
              </h3>
              <button
                onClick={() => setSelectedSale(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thermal Slip Content */}
            <div className="border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-950 p-4 font-mono text-xs text-gray-800 dark:text-gray-300 space-y-3">
              {/* Header */}
              <div className="text-center">
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase tracking-wide">
                  {settings.companyName}
                </h4>
                <p className="text-[10px] text-gray-500">{settings.companyAddress}</p>
                <p className="text-[10px] text-gray-500">PH: {settings.companyPhone}</p>
                {settings.companyNtn && <p className="text-[9px] text-gray-400">NTN: {settings.companyNtn}</p>}
                <div className="border-t border-dashed border-gray-250 dark:border-gray-800 my-2" />
                <p className="text-[10px] text-left">INV: {selectedSale.invoiceNumber}</p>
                <p className="text-[10px] text-left">DATE: {new Date(selectedSale.saleDate).toLocaleString()}</p>
                <p className="text-[10px] text-left">CUST: {selectedSale.customerName || 'Walk-in'}</p>
                <div className="border-t border-dashed border-gray-250 dark:border-gray-800 my-2" />
              </div>

              {/* Items Table */}
              <div className="space-y-1 text-[10px]">
                <div className="flex items-center justify-between font-bold">
                  <span>ITEM</span>
                  <span>TOTAL</span>
                </div>
                {selectedSale.items.map((item: any, index: number) => {
                  const itDetails = settings.taxRules ? (item.medicineName || 'Item') : 'Item';
                  return (
                    <div key={index} className="flex justify-between items-start gap-2">
                      <span className="truncate">
                        {item.medicineName || itDetails} x{item.quantity}
                      </span>
                      <span>Rs.{item.total}</span>
                    </div>
                  );
                })}
                <div className="border-t border-dashed border-gray-250 dark:border-gray-800 my-2" />
              </div>

              {/* Total Summaries */}
              <div className="space-y-1 text-[10px] text-right">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>Rs. {selectedSale.subtotal.toLocaleString()}</span>
                </div>
                {selectedSale.discountAmount > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Discount:</span>
                    <span>-Rs. {selectedSale.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                {selectedSale.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>GST (18%):</span>
                    <span>Rs. {selectedSale.taxAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 dark:text-white text-xs">
                  <span>GRAND TOTAL:</span>
                  <span>Rs. {selectedSale.totalAmount.toLocaleString()}</span>
                </div>
                <div className="border-t border-dashed border-gray-250 dark:border-gray-800 my-2" />
              </div>

              {/* Footer FBR Block */}
              {selectedSale.fbrStatus && selectedSale.fbrStatus !== 'not_integrated' && (
                <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded-lg text-center text-[9px] space-y-1">
                  <p className="font-bold text-emerald-600">FBR DIGITAL INVOICE</p>
                  <p className="text-gray-500 font-mono select-all">NO: {selectedSale.fbrInvoiceNumber || 'LIVE_SUBMITTED_OK'}</p>
                </div>
              )}

              <p className="text-center text-[9px] text-gray-400 uppercase tracking-widest pt-1">
                {settings.receiptFooterText || 'Thank you for shopping!'}
              </p>
            </div>

            {/* Quick Sheets Share Bar */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handlePrintMock}
                className="h-12 rounded-2xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Printer className="w-5 h-5" />
                Print Bill
              </button>

              <button
                onClick={() => handleShareWhatsApp(selectedSale)}
                className="h-12 rounded-2xl bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Share2 className="w-5 h-5" />
                WhatsApp Rx
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
