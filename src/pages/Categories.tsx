import { useEffect, useState, lazy } from "react";
import { getCategories, getCategoryProducts } from "@/api/client";
import { useFilterStore } from "@/store/useFilterStore";
import type { Category } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LazyChart from "@/components/ui/lazychart";

const CategoryPieChart = lazy(() => import("@/charts/CategoryPieChart"));
const CategoryBarChart = lazy(() => import("@/charts/CategoryBarChart"));

interface CategoryProduct {
  item_code: string;
  item_description: string;
  retail_sales: number;
  warehouse_sales: number;
  retail_transfers: number;
}

export default function CategoriesPage() {
  const { year } = useFilterStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsPage, setProductsPage] = useState(1);
  const [productsLoading, setProductsLoading] = useState(false);
  const [pageInput, setPageInput] = useState("");

  const totalProductsPages = Math.ceil(productsTotal / 20);

  useEffect(() => {
  let cancelled = false;
  async function load() {
    setLoading(true);
    try {
      const res = await getCategories(year);
      if (!cancelled) setCategories(res);
    } catch (e) {
      console.error(e);
    } finally {
      if (!cancelled) setLoading(false);
    }
  }
  const timer = setTimeout(load, 0);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [year]);

  const openModal = async (type: string) => {
    setSelectedCategory(type);
    setProductsPage(1);
    setPageInput("1");
    await loadProducts(type, 1);
  };

  const loadProducts = async (type: string, page: number) => {
    setProductsLoading(true);
    try {
      const res = await getCategoryProducts(type, page, 20, year);
      setProducts(res.data);
      setProductsTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setProductsLoading(false);
    }
  };

  const handlePageJump = () => {
    const p = parseInt(pageInput);
    if (!isNaN(p) && p >= 1 && p <= totalProductsPages) {
      setProductsPage(p);
      loadProducts(selectedCategory!, p);
    }
  };

  const donutData = categories.map((c) => ({ name: c.item_type, value: c.retail_sales + c.warehouse_sales }));
  const barData = categories.map((c) => ({
    name: c.item_type,
    qty: c.most_popular_count,
    revenue: c.retail_sales + c.warehouse_sales,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Product Mix & Category Analysis</h2>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="bg-white rounded-xl border p-4 h-64" />
          <div className="bg-white rounded-xl border p-4 h-64" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LazyChart title="Revenue Share by Category" component={CategoryPieChart} data={donutData} />
            <LazyChart title="Qty Sold vs Revenue by Type" component={CategoryBarChart} data={barData} />
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Category</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Retail $</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Warehouse $</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Avg Price</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Most Expensive</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Most Popular</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => {
                    const revenue = c.retail_sales + c.warehouse_sales;
                    const maxRevenue = Math.max(...categories.map((x) => x.retail_sales + x.warehouse_sales), 0);
                    const isHighest = revenue === maxRevenue;
                    return (
                      <tr
                        key={c.item_type}
                        className={`border-t hover:bg-gray-50 cursor-pointer ${isHighest ? "bg-emerald-50/50" : ""}`}
                        onClick={() => openModal(c.item_type)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">{c.item_type}</td>
                        <td className="px-4 py-3 text-right text-slate-900">${c.retail_sales.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-900">${c.warehouse_sales.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-900">${c.avg_price_proxy.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-700">{c.most_expensive} (${c.most_expensive_value.toLocaleString()})</td>
                        <td className="px-4 py-3 text-slate-700">{c.most_popular} ({c.most_popular_count})</td>
                        <td className="px-4 py-3 text-center"><span className="text-xs font-medium text-blue-600 hover:underline">View Top 20</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!selectedCategory} onOpenChange={() => setSelectedCategory(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Top Products: {selectedCategory}</DialogTitle>
          </DialogHeader>
          {productsLoading ? (
            <div className="animate-pulse h-40 bg-gray-200 rounded" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Code</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Retail</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Warehouse</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Transfers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-gray-600">{p.item_code}</td>
                        <td className="px-3 py-2 text-slate-900">{p.item_description}</td>
                        <td className="px-3 py-2 text-right font-medium">${p.retail_sales.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">${p.warehouse_sales.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">${p.retail_transfers.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-4">
                <span className="text-sm text-gray-600">Total: {productsTotal}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => { const p = Math.max(1, productsPage - 1); setProductsPage(p); setPageInput(String(p)); loadProducts(selectedCategory!, p); }} disabled={productsPage === 1} className="px-3 py-1 rounded-lg text-sm font-medium bg-white border border-gray-300 disabled:opacity-50">Prev</button>
                  <span className="text-sm text-gray-600">Page {productsPage}</span>
                  <button onClick={() => { const p = productsPage + 1; setProductsPage(p); setPageInput(String(p)); loadProducts(selectedCategory!, p); }} disabled={productsPage >= totalProductsPages} className="px-3 py-1 rounded-lg text-sm font-medium bg-white border border-gray-300 disabled:opacity-50">Next</button>
                  <div className="ml-4 flex items-center gap-2">
                    <span className="text-sm text-gray-600">Go to</span>
                    <input type="number" min={1} max={totalProductsPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handlePageJump(); }} className="w-16 px-2 py-1 rounded border text-sm text-center" />
                    <button onClick={handlePageJump} className="px-2 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200">Go</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}