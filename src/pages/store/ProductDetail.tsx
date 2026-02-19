import { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useInventoryStore, useWebStore } from '@/store';
import { cn } from '@/lib/utils';
import {
  Pill,
  ShoppingCart,
  Check,
  ChevronLeft,
  Package,
  Shield,
  Truck,
  Minus,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

const categoryLabels: Record<string, string> = {
  tablets: 'Tablets', capsules: 'Capsules', syrups: 'Syrups', injections: 'Injections',
  drops: 'Drops', creams: 'Creams', ointments: 'Ointments', inhalers: 'Inhalers',
  supplements: 'Supplements', personal_care: 'Personal Care', baby_care: 'Baby Care', otc: 'OTC',
};

const categoryColors: Record<string, string> = {
  tablets: 'from-blue-400 to-blue-600', capsules: 'from-indigo-400 to-indigo-600',
  syrups: 'from-amber-400 to-amber-600', injections: 'from-red-400 to-red-600',
  drops: 'from-cyan-400 to-cyan-600', creams: 'from-pink-400 to-pink-600',
  supplements: 'from-green-400 to-green-600', personal_care: 'from-rose-400 to-rose-600',
  inhalers: 'from-teal-400 to-teal-600', otc: 'from-emerald-400 to-emerald-600',
};

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { medicines, batches } = useInventoryStore();
  const addToCart = useWebStore((s) => s.addToCart);

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const medicine = medicines.find((m) => m.id === id);
  const activeBatches = useMemo(
    () => batches.filter((b) => b.medicineId === id && b.isActive && b.quantity > 0),
    [batches, id]
  );
  const totalStock = activeBatches.reduce((s, b) => s + b.quantity, 0);
  const price = activeBatches.length ? Math.min(...activeBatches.map((b) => b.sellingPrice)) : 0;

  // Related products (same category)
  const related = useMemo(() => {
    if (!medicine) return [];
    return medicines
      .filter((m) => m.id !== medicine.id && m.category === medicine.category && m.isActive && m.classification !== 'controlled')
      .slice(0, 4)
      .map((m) => {
        const ab = batches.filter((b) => b.medicineId === m.id && b.isActive && b.quantity > 0);
        const stock = ab.reduce((s, b) => s + b.quantity, 0);
        const p = ab.length ? Math.min(...ab.map((b) => b.sellingPrice)) : 0;
        return { medicine: m, totalStock: stock, price: p };
      })
      .filter((p) => p.totalStock > 0 && p.price > 0);
  }, [medicines, batches, medicine]);

  if (!medicine || totalStock === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Package className="w-20 h-20 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-700">Product not found</h2>
        <p className="text-gray-500 mt-2">This product may be out of stock or unavailable.</p>
        <Link to="/store" className="inline-flex items-center gap-2 mt-6 text-emerald-600 font-medium hover:text-emerald-700">
          <ChevronLeft className="w-4 h-4" /> Back to Shop
        </Link>
      </div>
    );
  }

  const handleAdd = () => {
    addToCart({
      medicineId: medicine.id,
      name: medicine.name,
      category: medicine.category,
      strength: medicine.strength,
      price,
      quantity,
      maxQuantity: totalStock,
    });
    setAdded(true);
    toast.success(`${medicine.name} added to cart`);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8">
        <Link to="/store" className="hover:text-emerald-600 transition-colors">Shop</Link>
        <span>/</span>
        <Link to={`/store?cat=${medicine.category}`} className="hover:text-emerald-600 transition-colors">
          {categoryLabels[medicine.category] ?? medicine.category}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{medicine.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Image */}
        <div className={cn(
          'rounded-3xl bg-gradient-to-br flex items-center justify-center h-80 lg:h-[480px]',
          categoryColors[medicine.category] ?? 'from-gray-400 to-gray-600'
        )}>
          <Pill className="w-32 h-32 text-white/30" />
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <div className="flex items-start gap-2 flex-wrap mb-2">
            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
              {categoryLabels[medicine.category] ?? medicine.category}
            </span>
            {medicine.isPrescriptionRequired && (
              <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Prescription Required
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-1">{medicine.name}</h1>
          <p className="text-gray-500 mb-6">{medicine.genericName} • {medicine.strength}</p>

          <div className="flex items-baseline gap-2 mb-8">
            <span className="text-4xl font-bold text-emerald-600">Rs. {price.toLocaleString()}</span>
            <span className="text-sm text-gray-400">per {medicine.unit || 'unit'}</span>
          </div>

          {/* Quantity & Add */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="p-3 hover:bg-gray-50 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-14 text-center font-semibold text-lg">{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(totalStock, quantity + 1))}
                className="p-3 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleAdd}
              disabled={added}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-semibold transition-all duration-200',
                added
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] shadow-lg shadow-emerald-200'
              )}
            >
              {added ? (
                <><Check className="w-5 h-5" /> Added to Cart</>
              ) : (
                <><ShoppingCart className="w-5 h-5" /> Add to Cart</>
              )}
            </button>
          </div>

          <p className="text-sm text-gray-400 mb-6">{totalStock} units available in stock</p>

          {/* Info Cards */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gray-50">
              <Truck className="w-5 h-5 text-emerald-600" />
              <span className="text-xs text-gray-600 text-center">Fast Delivery</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gray-50">
              <Shield className="w-5 h-5 text-emerald-600" />
              <span className="text-xs text-gray-600 text-center">100% Genuine</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gray-50">
              <Package className="w-5 h-5 text-emerald-600" />
              <span className="text-xs text-gray-600 text-center">Secure Packaging</span>
            </div>
          </div>

          {/* Details */}
          <div className="border-t pt-6 space-y-3">
            <h3 className="font-semibold text-gray-900">Product Details</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">Category</span>
              <span className="text-gray-900">{categoryLabels[medicine.category] ?? medicine.category}</span>
              <span className="text-gray-500">Generic Name</span>
              <span className="text-gray-900">{medicine.genericName}</span>
              {medicine.brandName && (
                <>
                  <span className="text-gray-500">Brand</span>
                  <span className="text-gray-900">{medicine.brandName}</span>
                </>
              )}
              <span className="text-gray-500">Dosage Form</span>
              <span className="text-gray-900 capitalize">{medicine.dosageForm}</span>
              <span className="text-gray-500">Strength</span>
              <span className="text-gray-900">{medicine.strength}</span>
              <span className="text-gray-500">Classification</span>
              <span className="text-gray-900 capitalize">{medicine.classification}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">You might also like</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map((r) => (
              <Link
                key={r.medicine.id}
                to={`/store/product/${r.medicine.id}`}
                className="group bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all"
              >
                <div className={cn(
                  'h-32 bg-gradient-to-br flex items-center justify-center',
                  categoryColors[r.medicine.category] ?? 'from-gray-400 to-gray-600'
                )}>
                  <Pill className="w-10 h-10 text-white/40 group-hover:scale-110 transition-transform" />
                </div>
                <div className="p-3">
                  <h4 className="font-medium text-gray-900 text-sm line-clamp-1 group-hover:text-emerald-600 transition-colors">
                    {r.medicine.name}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">{r.medicine.strength}</p>
                  <p className="text-base font-bold text-emerald-600 mt-1.5">Rs. {r.price.toLocaleString()}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
