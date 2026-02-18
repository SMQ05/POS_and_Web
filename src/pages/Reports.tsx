import { useState } from 'react';
import { useSettingsStore, useSalesStore, useInventoryStore, useSupplierStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePicker } from '@/components/ui/date-picker';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ShoppingCart,
  Calendar,
  Download,
  Printer,
  PieChart,
  LineChart,
  BarChart,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  LineChart as ReLineChart,
  Line,
  BarChart as ReBarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Mock data for charts
const salesTrendData = [
  { name: 'Week 1', sales: 45000, profit: 12000 },
  { name: 'Week 2', sales: 52000, profit: 15000 },
  { name: 'Week 3', sales: 48000, profit: 13000 },
  { name: 'Week 4', sales: 61000, profit: 18000 },
];

const categoryData = [
  { name: 'Tablets', value: 35, sales: 125000 },
  { name: 'Syrups', value: 25, sales: 89000 },
  { name: 'Injections', value: 15, sales: 54000 },
  { name: 'Creams', value: 10, sales: 36000 },
  { name: 'Others', value: 15, sales: 54000 },
];

const topProductsData = [
  { name: 'Panadol', sales: 450, revenue: 18000 },
  { name: 'Brufen', sales: 380, revenue: 24700 },
  { name: 'Augmentin', sales: 290, revenue: 10150 },
  { name: 'Disprin', sales: 520, revenue: 15600 },
  { name: 'Calpol', sales: 410, revenue: 24600 },
];

const hourlyData = [
  { hour: '9 AM', sales: 12000 },
  { hour: '10 AM', sales: 18000 },
  { hour: '11 AM', sales: 25000 },
  { hour: '12 PM', sales: 32000 },
  { hour: '1 PM', sales: 28000 },
  { hour: '2 PM', sales: 22000 },
  { hour: '3 PM', sales: 19000 },
  { hour: '4 PM', sales: 24000 },
  { hour: '5 PM', sales: 31000 },
  { hour: '6 PM', sales: 35000 },
  { hour: '7 PM', sales: 28000 },
  { hour: '8 PM', sales: 15000 },
];

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export function Reports() {
  const { settings } = useSettingsStore();
  const { sales } = useSalesStore();
  const { medicines } = useInventoryStore();
  const { suppliers } = useSupplierStore();
  
  const [dateRange, setDateRange] = useState('month');
  const [reportType, setReportType] = useState('sales');

  // Calculate summary stats
  const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalTransactions = sales.length;
  const averageTicket = totalTransactions > 0 ? totalSales / totalTransactions : 0;
  const totalItems = sales.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            Reports & Analytics
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            Comprehensive business insights and analytics
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button variant="outline" className="gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Sales</p>
                <p className="text-2xl font-bold text-emerald-500">
                  Rs. {totalSales.toLocaleString()}
                </p>
                <div className="flex items-center gap-1 text-sm text-emerald-500">
                  <ArrowUpRight className="w-4 h-4" />
                  +12.5%
                </div>
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
                <p className="text-sm text-gray-500">Transactions</p>
                <p className="text-2xl font-bold">{totalTransactions}</p>
                <div className="flex items-center gap-1 text-sm text-emerald-500">
                  <ArrowUpRight className="w-4 h-4" />
                  +8.2%
                </div>
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
                <p className="text-sm text-gray-500">Average Ticket</p>
                <p className="text-2xl font-bold text-amber-500">
                  Rs. {averageTicket.toFixed(0)}
                </p>
                <div className="flex items-center gap-1 text-sm text-red-500">
                  <ArrowDownRight className="w-4 h-4" />
                  -2.1%
                </div>
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
                <p className="text-sm text-gray-500">Items Sold</p>
                <p className="text-2xl font-bold text-purple-500">{totalItems}</p>
                <div className="flex items-center gap-1 text-sm text-emerald-500">
                  <ArrowUpRight className="w-4 h-4" />
                  +15.3%
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sales Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LineChart className="w-5 h-5 text-emerald-500" />
                  Sales & Profit Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReLineChart data={salesTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => `Rs. ${value.toLocaleString()}`} />
                      <Legend />
                      <Line type="monotone" dataKey="sales" stroke="#10b981" name="Sales" />
                      <Line type="monotone" dataKey="profit" stroke="#3b82f6" name="Profit" />
                    </ReLineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Category Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-blue-500" />
                  Sales by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hourly Sales */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart className="w-5 h-5 text-amber-500" />
                Hourly Sales Pattern
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `Rs. ${value.toLocaleString()}`} />
                    <Bar dataKey="sales" fill="#10b981" />
                  </ReBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={salesTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sales" fill="#10b981" name="Sales" />
                    <Bar dataKey="profit" fill="#3b82f6" name="Profit" />
                  </ReBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Selling Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topProductsData.map((product, index) => (
                  <div key={product.name} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium text-emerald-600">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.sales} units sold</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">Rs. {product.revenue.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Total SKUs</p>
                <p className="text-2xl font-bold">{medicines.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Stock Value</p>
                <p className="text-2xl font-bold text-emerald-500">Rs. 1,250,000</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Turnover Rate</p>
                <p className="text-2xl font-bold text-blue-500">4.2x</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Gross Profit</p>
                <p className="text-2xl font-bold text-emerald-500">Rs. 245,000</p>
                <p className="text-sm text-emerald-500">19.6% margin</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Tax Payable</p>
                <p className="text-2xl font-bold text-amber-500">Rs. 45,000</p>
                <p className="text-sm text-gray-500">18% GST</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500">Supplier Payables</p>
                <p className="text-2xl font-bold text-red-500">
                  Rs. {suppliers.reduce((sum, s) => sum + s.currentBalance, 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
