import { useEffect, useState, useCallback, lazy } from "react";
import { Search, X, Copy, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { searchProducts, getProductSuggest, getProductDetail } from "@/api/client";
import { useFilterStore } from "@/store/useFilterStore";
import type { Product, ProductDetail } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ProductDetailChart = lazy(() => import("@/charts/ProductDetailChart"));

export default function ProductsPage() {
  const { year } = useFilterStore();
  const [q, setQ] = useState("");
  const [itemType, setItemType] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [pageInput, setPageInput] = useState("");
  
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await searchProducts(q || undefined, itemType, supplier || undefined, page, perPage, "retail_sales", order, year);
      setProducts(res.data);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [q, itemType, supplier, page, perPage, order, year]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!q || q.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await getProductSuggest(q);
        setSuggestions(res);
        setShowSuggestions(true);
      } catch (e) { console.error(e); }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const openDetail = async (itemCode: string) => {
    setDetailLoading(true);
    try {
      const res = await getProductDetail(itemCode, year);
      setSelected(res);
    } catch (e) { console.error(e); } finally { setDetailLoading(false); }
  };

  const totalPages = Math.ceil(total / perPage);
  const toggleSortOrder = () => { setOrder(prev => (prev === "desc" ? "asc" : "desc")); setPage(1); };
  const handlePageJump = () => {
    const p = parseInt(pageInput, 10);
    if(!isNaN(p) && p >= 1 && p <= totalPages) { setPage(p); setPageInput(""); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Interactive Product Explorer</h2>

      <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
        <div className="relative">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-gray-400" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." className="flex-1 px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white" onFocus={() => q.length >= 2 && setShowSuggestions(true)} />
            {q && <button onClick={() => { setQ(""); setShowSuggestions(false); }}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
              {suggestions.map((s, i) => (
                <button key={i} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50" onClick={() => { setQ(s.name); setShowSuggestions(false); setPage(1); }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={itemType || "ALL"} onChange={(e) => { setItemType(e.target.value === "ALL" ? null : e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white">
            <option value="ALL">All Types</option>
            <option value="WINE">Wine</option>
            <option value="BEER">Beer</option>
            <option value="LIQUOR">Liquor</option>
            <option value="NON-ALCOHOL">Non-Alcohol</option>
            <option value="STR_SUPPLIES">Supplies</option>
            <option value="KEGS">Kegs</option>
          </select>
          <input type="text" value={supplier} onChange={(e) => { setSupplier(e.target.value); setPage(1); }} placeholder="Filter by supplier..." className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white w-64" />
          {/* Sort order toggle button */}
          <button
            onClick={toggleSortOrder}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <ArrowUpDown size={16} />
            {order === "desc" ? "Highest" : "Lowest"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-gray-600">{total} results</span>
        <div className="flex items-center gap-4">
          {/* Prev/Next */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg text-sm font-medium bg-white border border-gray-300 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="px-3 py-1 rounded-lg text-sm font-medium bg-white border border-gray-300 disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Go to page */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Go to</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handlePageJump(); }}
              placeholder="#"
              className="w-16 px-2 py-1 rounded border text-sm text-center"
            />
            <button
              onClick={handlePageJump}
              className="px-2 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200"
            >
              Go
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7,8].map((i) => <div key={i} className="bg-white rounded-xl border p-4 h-36 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => (
            <div
              key={p.item_code}
              role="button"
              tabIndex={0}
              onClick={() => openDetail(p.item_code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openDetail(p.item_code);
                }
              }}
              className="bg-white rounded-xl border p-4 shadow-sm text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{p.item_type}</span>
                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(p.item_code); }} className="text-gray-400 hover:text-gray-600" title="Copy item code"><Copy size={14} /></button>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900 line-clamp-2">{p.item_description}</p>
              <p className="text-xs text-gray-500 mt-1">{p.supplier}</p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-600">Retail: <span className="font-medium text-slate-900">${p.retail_sales.toLocaleString()}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[420px] sm:max-w-lg h-[100dvh] max-h-none flex flex-col overflow-hidden">
          <SheetHeader className="shrink-0">
            <SheetTitle>Product Detail</SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="animate-pulse h-40 bg-gray-200 rounded" />
          ) : selected && (
            <div className="flex-1 min-h-0 overflow-y-auto mt-0 space-y-6 pr-1 pb-4">
              {/* Badge + SKU */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    {selected.item_type}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selected.item_code)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <Copy size={12} /> {selected.item_code}
                  </button>
                </div>
                <p className="mt-0 px-2 text-lg font-bold text-slate-900">
                  {selected.item_description}
                </p>
                <p className="px-2 py-1 text-sm text-gray-500">{selected.supplier}</p>
              </div>

              {/* Lazy load the chart only when the sheet opens */}
              <ProductDetailChart data={selected.months_breakdown} />

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Month</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Retail</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Warehouse</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Transfers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.months_breakdown.map((m, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-slate-900">{monthLabel(m.month)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${m.retail_sales.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${m.warehouse_sales.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${m.retail_transfers.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Helper function for month label
const monthLabel = (month: number) => {
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[month] ?? String(month);
};