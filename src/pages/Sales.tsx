import { useState } from 'react';
import { useSettingsStore, useSalesStore, useInventoryStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Receipt,
  Calendar,
  User,
  Printer,
  Eye,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Filter,
  Download,
} from 'lucide-react';
import type { Sale } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

export function Sales() {
  const { settings } = useSettingsStore();
  const { t, isRTL } = useTranslation();
  const { sales, getTodaySales } = useSalesStore();
  const { medicines } = useInventoryStore();

  const getMedicineName = (id: string) => medicines.find(m => m.id === id)?.name ?? 'Unknown';

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const todaySales = getTodaySales();

  // Filter sales
  const filteredSales = sales.filter((sale) => {
    const matchesSearch = searchQuery === '' || 
      sale.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customerPhone?.includes(searchQuery);
    
    let matchesDate = true;
    const saleDate = new Date(sale.saleDate);
    const today = new Date();
    
    if (dateFilter === 'today') {
      matchesDate = saleDate.toDateString() === today.toDateString();
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      matchesDate = saleDate >= weekAgo;
    } else if (dateFilter === 'month') {
      matchesDate = saleDate.getMonth() === today.getMonth() && 
                    saleDate.getFullYear() === today.getFullYear();
    }
    
    return matchesSearch && matchesDate;
  });

  // Calculate stats
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalTransactions = filteredSales.length;
  const averageTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  const returns = filteredSales.filter(s => s.status === 'returned').length;

  // View sale details
  const viewDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setShowDetailsDialog(true);
  };

  // Print receipt for a sale
  const handlePrintSale = (sale: Sale) => {
    const w = window.open('', '_blank', 'width=350,height=600');
    if (!w) { toast.error(t('sales.popupBlocked')); return; }
    const rows = sale.items.map(item => `
      <tr>
        <td style="padding:4px 2px;font-size:12px">${getMedicineName(item.medicineId)}</td>
        <td style="padding:4px 2px;font-size:12px;text-align:center">${item.quantity}</td>
        <td style="padding:4px 2px;font-size:12px;text-align:right">Rs.${item.total.toFixed(2)}</td>
      </tr>`).join('');
    w.document.write(`<html><head><title>Receipt</title>
      <style>body{font-family:monospace;width:280px;margin:0 auto;padding:10px}
      h2,h3{margin:4px 0;text-align:center}hr{border:none;border-top:1px dashed #000}
      table{width:100%;border-collapse:collapse}th{font-size:11px;border-bottom:1px solid #000;padding:4px 2px}
      .right{text-align:right}.center{text-align:center}.bold{font-weight:bold}
      </style></head><body onload="window.print()">
      <h2>${settings.companyName}</h2>
      <p class="center" style="font-size:11px;margin:2px 0">${settings.companyAddress}<br>${settings.companyPhone}</p>
      <hr/>
      <p style="font-size:12px"><strong>${t('sales.invoiceNo')}:</strong> ${sale.invoiceNumber}<br/>
      <strong>${t('common.date')}:</strong> ${new Date(sale.saleDate).toLocaleString('en-PK')}<br/>
      <strong>${t('sales.customer')}:</strong> ${sale.customerName || t('common.walkIn')}</p>
      <hr/>
      <table><thead><tr><th style="text-align:left">${t('common.items')}</th><th>${t('sales.qty')}</th><th style="text-align:right">${t('common.total')}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <hr/>
      <table style="font-size:12px">
        <tr><td>${t('common.subtotal')}</td><td class="right">Rs.${sale.subtotal.toFixed(2)}</td></tr>
        <tr><td>${t('common.discount')}</td><td class="right">-Rs.${sale.discountAmount.toFixed(2)}</td></tr>
        <tr><td>${t('common.tax')}</td><td class="right">Rs.${sale.taxAmount.toFixed(2)}</td></tr>
        <tr class="bold" style="font-size:14px"><td>${t('common.total')}</td><td class="right">Rs.${sale.totalAmount.toFixed(2)}</td></tr>
      </table>
      <hr/>
      <p class="center" style="font-size:11px">${t('sales.paymentMethod')}: ${sale.paymentMethods.map(p => p.method).join(', ') || t('sales.pending')}<br/>
      ${t('common.status')}: ${sale.status}</p>
      <p class="center" style="font-size:10px;margin-top:10px">${t('pos.thankYou')}</p>
      </body></html>`);
    w.document.close();
  };

  // Get payment method icon
  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'cash': return 'Cash';
      case 'card': return 'Card';
      case 'jazzcash': return 'JazzCash';
      case 'easypaisa': return 'EasyPaisa';
      default: return method;
    }
  };

  // ── Export sales ──
  const handleExportSales = () => {
    const rows = filteredSales.map(s => ({
      invoiceNumber: s.invoiceNumber,
      date: new Date(s.saleDate).toLocaleDateString(),
      customerName: s.customerName ?? 'Walk-in',
      customerPhone: s.customerPhone ?? '',
      items: s.items.length,
      subtotal: s.subtotal,
      discount: s.discountAmount,
      tax: s.taxAmount,
      total: s.totalAmount,
      paid: s.paidAmount,
      balance: s.balanceAmount,
      paymentMethod: s.paymentMethods.map(p => p.method).join(', '),
      status: s.status,
    }));
    if (rows.length === 0) { toast.error(t('sales.noSalesExport')); return; }
    exportToCSV(rows as any, [
      { key: 'invoiceNumber', label: 'Invoice #' },
      { key: 'date', label: 'Date' },
      { key: 'customerName', label: 'Customer' },
      { key: 'customerPhone', label: 'Phone' },
      { key: 'items', label: 'Items' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'discount', label: 'Discount' },
      { key: 'tax', label: 'Tax' },
      { key: 'total', label: 'Total' },
      { key: 'paid', label: 'Paid' },
      { key: 'balance', label: 'Balance' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'status', label: 'Status' },
    ], 'sales');
    toast.success(t('sales.exportedSales', rows.length));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('sales.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('sales.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportSales}>
            <Download className="w-4 h-4" />
            {t('common.export')}
          </Button>
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => window.location.href = '/pos'}
          >
            <Receipt className="w-4 h-4" />
            {t('sales.newSale')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('sales.totalRevenue')}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  Rs. {totalRevenue.toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('sales.transactionsCount')}</p>
                <p className="text-2xl font-bold">{totalTransactions}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('sales.averageTicket')}</p>
                <p className="text-2xl font-bold text-amber-500">
                  Rs. {averageTicket.toFixed(0)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('sales.returns')}</p>
                <p className="text-2xl font-bold text-red-500">{returns}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t('sales.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t('sales.dateRange')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.allTime')}</SelectItem>
                <SelectItem value="today">{t('common.today')}</SelectItem>
                <SelectItem value="week">{t('common.thisWeek')}</SelectItem>
                <SelectItem value="month">{t('common.thisMonth')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sales Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            {t('sales.salesTransactions')} ({filteredSales.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('sales.invoiceNo')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('sales.customer')}</TableHead>
                  <TableHead>{t('common.items')}</TableHead>
                  <TableHead>{t('common.total')}</TableHead>
                  <TableHead>{t('sales.paymentMethod')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-emerald-500" />
                        <span className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {sale.invoiceNumber}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(sale.saleDate).toLocaleDateString('en-PK', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      {sale.customerName || t('common.walkIn')}
                    </TableCell>
                    <TableCell>{sale.items.length} {t('common.items')}</TableCell>
                    <TableCell className="font-medium">
                      Rs. {sale.totalAmount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getPaymentMethodIcon(sale.paymentMethods[0]?.method)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        sale.status === 'completed' ? 'success' :
                        sale.status === 'returned' ? 'destructive' :
                        'warning'
                      }>
                        {sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewDetails(sale)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePrintSale(sale)}
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Sale Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('sales.invoiceNo')} {selectedSale?.invoiceNumber}</DialogTitle>
            <DialogDescription>
              {t('sales.saleDetails')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Invoice Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">{t('common.date')}</p>
                <p className="font-medium">
                  {selectedSale?.saleDate.toLocaleDateString('en-PK', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('sales.customer')}</p>
                <p className="font-medium">{selectedSale?.customerName || t('common.walkIn')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('common.phone')}</p>
                <p className="font-medium">{selectedSale?.customerPhone || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('sales.paymentMethod')}</p>
                <p className="font-medium">
                  {selectedSale?.paymentMethods.map(p => getPaymentMethodIcon(p.method)).join(', ')}
                </p>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <h4 className="font-medium mb-3">{t('common.items')}</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('sales.medicine')}</TableHead>
                    <TableHead>{t('sales.batch')}</TableHead>
                    <TableHead>{t('sales.qty')}</TableHead>
                    <TableHead>{t('common.price')}</TableHead>
                    <TableHead>{t('common.total')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedSale?.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.medicineId}</TableCell>
                      <TableCell>{item.batchNumber}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>Rs. {item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell>Rs. {item.total.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="border-t pt-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('common.subtotal')}</span>
                  <span>Rs. {selectedSale?.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('common.discount')}</span>
                  <span className="text-emerald-500">
                    -Rs. {selectedSale?.discountAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('common.tax')}</span>
                  <span>Rs. {selectedSale?.taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold pt-2 border-t">
                  <span>{t('common.total')}</span>
                  <span className="text-emerald-500">
                    Rs. {selectedSale?.totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
