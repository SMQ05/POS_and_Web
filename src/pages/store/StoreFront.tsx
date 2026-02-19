import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInventoryStore, useWebStore } from '@/store';
import { cn } from '@/lib/utils';
import {
  Pill,
  ShoppingCart,
  Check,
  Search,
  ArrowRight,
  Sparkles,
  Heart,
  SlidersHorizontal,
  ChevronDown,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';

const categoryLabels: Record<string, string> = {
  tablets: 'Tablets',
  capsules: 'Capsules',
  syrups: 'Syrups',
  injections: 'Injections',
  drops: 'Drops',
  creams: 'Creams',
  ointments: 'Ointments',
  inhalers: 'Inhalers',
  powders: 'Powders',
  suspensions: 'Suspensions',
  solutions: 'Solutions',
  medical_devices: 'Devices',
  supplements: 'Supplements',
  personal_care: 'Personal Care',
  baby_care: 'Baby Care',
  otc: 'OTC',
};

const categoryColors: Record<string, string> = {
  tablets: 'from-blue-400 to-blue-600',
  capsules: 'from-indigo-400 to-indigo-600',
  syrups: 'from-amber-400 to-amber-600',
  injections: 'from-red-400 to-red-600',
  drops: 'from-cyan-400 to-cyan-600',
  creams: 'from-pink-400 to-pink-600',
  ointments: 'from-purple-400 to-purple-600',
  supplements: 'from-green-400 to-green-600',
  personal_care: 'from-rose-400 to-rose-600',
  baby_care: 'from-yellow-400 to-yellow-600',
  inhalers: 'from-teal-400 to-teal-600',
  otc: 'from-emerald-400 to-emerald-600',
};

type SortOption = 'name' | 'price-asc' | 'price-desc';

export function StoreFront() {
  const [searchParams] = useSearchParams();
  const searchFromURL = searchParams.get('search') ?? '';
  const catFromURL = searchParams.get('cat') ?? '';

  const { medicines, batches } = useInventoryStore();
  const addToCart = useWebStore((s) => s.addToCart);

  const [searchQuery, setSearchQuery] = useState(searchFromURL);
  const [selectedCategory, setSelectedCategory] = useState(catFromURL);
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Compute available products (non-controlled, active, in stock)
  const products = useMemo(() => {
    return medicines
      .filter((m) => m.isActive && m.classification !== 'controlled')
      .map((m) => {
        const activeBatches = batches.filter(
          (b) => b.medicineId === m.id && b.isActive && b.quantity > 0
        );
        const totalStock = activeBatches.reduce((s, b) => s + b.quantity, 0);
        const minPrice = activeBatches.length
          ? Math.min(...activeBatches.map((b) => b.sellingPrice))
          : 0;
        return { medicine: m, totalStock, price: minPrice };
      })
      .filter((p) => p.totalStock > 0 && p.price > 0);
  }, [medicines, batches]);

  // Available categories
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.medicine.category));
    return Array.from(cats).sort();
  }, [products]);

  // Filter and sort
  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.medicine.name.toLowerCase().includes(q) ||
          p.medicine.genericName.toLowerCase().includes(q) ||
          (p.medicine.brandName?.toLowerCase().includes(q) ?? false)
      );
    }
    if (selectedCategory) {
      result = result.filter((p) => p.medicine.category === selectedCategory);
    }
    if (sortBy === 'price-asc') result = [...result].sort((a, b) => a.price - b.price);
    else if (sortBy === 'price-desc') result = [...result].sort((a, b) => b.price - a.price);
    else result = [...result].sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
    return result;
  }, [products, searchQuery, selectedCategory, sortBy]);

  const handleAddToCart = (p: typeof products[0]) => {
    addToCart({
      medicineId: p.medicine.id,
      name: p.medicine.name,
      category: p.medicine.category,
      strength: p.medicine.strength,
      price: p.price,
      quantity: 1,
      maxQuantity: p.totalStock,
    });
    setAddedIds((prev) => new Set(prev).add(p.medicine.id));
    toast.success(`${p.medicine.name} added to cart`);
    setTimeout(() => setAddedIds((prev) => {
      const next = new Set(prev);
      next.delete(p.medicine.id);
      return next;
    }), 1500);
  };

  return (
    <div>
      {/* Hero Banner */}
      <section className="relative bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-teal-300/20 blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm text-white/90 mb-6">
              <Sparkles className="w-4 h-4" />
              Pakistan's Trusted Online Pharmacy
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Your Health,{' '}
              <span className="text-emerald-200">Delivered</span> to Your Door
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-lg">
              Browse genuine medicines, supplements & health products. Order now and get fast delivery across Pakistan.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#products" className="inline-flex items-center gap-2 bg-white text-emerald-700 font-semibold px-6 py-3 rounded-full hover:bg-emerald-50 transition-colors shadow-lg">
                Shop Now
                <ArrowRight className="w-4 h-4" />
              </a>
              <Link to="/store/track" className="inline-flex items-center gap-2 border-2 border-white/30 text-white font-semibold px-6 py-3 rounded-full hover:bg-white/10 transition-colors">
                Track Your Order
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 -mt-8 relative z-10">
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory('')}
            className={cn(
              'shrink-0 px-5 py-2.5 rounded-full text-sm font-medium shadow-md transition-all',
              !selectedCategory
                ? 'bg-emerald-600 text-white shadow-emerald-200'
                : 'bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
            )}
          >
            All Products
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={cn(
                'shrink-0 px-5 py-2.5 rounded-full text-sm font-medium shadow-md transition-all',
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white shadow-emerald-200'
                  : 'bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
              )}
            >
              {categoryLabels[cat] ?? cat}
            </button>
          ))}
        </div>
      </section>

      {/* Products */}
      <section id="products" className="max-w-7xl mx-auto px-4 py-10">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {selectedCategory ? categoryLabels[selectedCategory] ?? selectedCategory : 'All Products'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{filteredProducts.length} products available</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 outline-none w-48"
              />
            </div>
            <div className="relative">
              <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-400 outline-none appearance-none bg-white cursor-pointer"
              >
                <option value="name">Name A-Z</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-600">No products found</h3>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredProducts.map((p) => {
              const isAdded = addedIds.has(p.medicine.id);
              return (
                <div
                  key={p.medicine.id}
                  className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all duration-300"
                >
                  {/* Image Placeholder */}
                  <Link to={`/store/product/${p.medicine.id}`}>
                    <div className={cn(
                      'h-44 bg-gradient-to-br flex items-center justify-center relative overflow-hidden',
                      categoryColors[p.medicine.category] ?? 'from-gray-400 to-gray-600'
                    )}>
                      <Pill className="w-16 h-16 text-white/40 group-hover:scale-110 transition-transform duration-300" />
                      {p.medicine.isPrescriptionRequired && (
                        <span className="absolute top-3 left-3 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Rx Required
                        </span>
                      )}
                      <span className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {categoryLabels[p.medicine.category] ?? p.medicine.category}
                      </span>
                    </div>
                  </Link>

                  {/* Content */}
                  <div className="p-4">
                    <Link to={`/store/product/${p.medicine.id}`}>
                      <h3 className="font-semibold text-gray-900 group-hover:text-emerald-600 transition-colors line-clamp-1">
                        {p.medicine.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.medicine.genericName} • {p.medicine.strength}
                      </p>
                    </Link>

                    <div className="flex items-end justify-between mt-4">
                      <div>
                        <p className="text-xl font-bold text-emerald-600">
                          Rs. {p.price.toLocaleString()}
                        </p>
                        <p className="text-[11px] text-gray-400">{p.totalStock} in stock</p>
                      </div>
                      <button
                        onClick={() => handleAddToCart(p)}
                        disabled={isAdded}
                        className={cn(
                          'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                          isAdded
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow-sm'
                        )}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-4 h-4" />
                            Added
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-4 h-4" />
                            Add
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
