import { useEffect, useState } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp, Download, AlertTriangle } from "lucide-react";
import { getSuppliers, getSupplierProducts } from "@/api/client";
import { useFilterStore } from "@/store/useFilterStore";
import type { Supplier } from "@/types";

export default function SuppliersPage() {
  const { year } = useFilterStore();
  const [data, setData] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("retail_sales");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [products, setProducts] = useState<{ item_description: string; retail_sales: number; warehouse_sales: number; retail_transfers: number }[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [pageInput, setPageInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getSuppliers(page, perPage, search || undefined, sortBy, sortOrder, year);
        if (!cancelled) {
          setData(res.data);
          setTotal(res.total);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [page, perPage, search, sortBy, sortOrder, year]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
  };

  const handleExpand = async (supplier: string) => {
    if (expanded === supplier) {
      setExpanded(null);
      return;
    }
    setExpanded(supplier);
    setProductsLoading(true);
    try {
      const p = await getSupplierProducts(supplier, year);
      setProducts(p);
    } catch (e) {
      console.error(e);
    } finally {
      setProductsLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ["Supplier", "Retail Sales", "Warehouse Sales", "Total Revenue", "Best Product", "Declining"];
    const rows = data.map((s) => [
      s.supplier,
      s.retail_sales,
      s.warehouse_sales,
      s.total_revenue,
      s.best_product || "",
      s.declining_flag ? "Yes" : "No",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "suppliers.csv";
    a.click();
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Supplier Performance</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search suppliers..."
            className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white w-64"
          />
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-4 h-16" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700"><button className="flex items-center gap-1" onClick={() => toggleSort("supplier")}>Supplier <ArrowUpDown size={14} /></button></th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700"><button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("retail_sales")}>Retail ($) <ArrowUpDown size={14} /></button></th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700"><button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("warehouse_sales")}>Warehouse ($) <ArrowUpDown size={14} /></button></th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700"><button className="flex items-center gap-1 ml-auto" onClick={() => toggleSort("total_revenue")}>Total ($) <ArrowUpDown size={14} /></button></th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Products</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Trend</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <>
                    <tr key={s.supplier} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => handleExpand(s.supplier)}>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.supplier}</td>
                      <td className="px-4 py-3 text-right text-slate-900">${s.retail_sales.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-slate-900">${s.warehouse_sales.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">${s.total_revenue.toLocaleString()}</td>
                      <td className="px-4 py-3">{s.best_product && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.best_product}</span>}</td>
                      <td className="px-4 py-3 text-center">{s.declining_flag && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700"><AlertTriangle size={12} /> Declining</span>}</td>
                      <td className="px-4 py-3 text-center">{expanded === s.supplier ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                    </tr>
                    {expanded === s.supplier && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 bg-gray-50">
                          {productsLoading ? (
                            <div className="animate-pulse h-20 bg-gray-200 rounded" />
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead><tr className="text-gray-500"><th className="text-left px-3 py-2">Product</th><th className="text-right px-3 py-2">Retail</th><th className="text-right px-3 py-2">Warehouse</th><th className="text-right px-3 py-2">Transfers</th></tr></thead>
                                <tbody>
                                  {products.map((p, i) => (
                                    <tr key={i} className="border-t border-gray-200">
                                      <td className="px-3 py-2 text-slate-900">{p.item_description}</td>
                                      <td className="px-3 py-2 text-right">${p.retail_sales.toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right">${p.warehouse_sales.toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right">${p.retail_transfers.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <span className="text-sm text-gray-600">Showing {(page - 1) * perPage + 1} - {Math.min(page * perPage, total)} of {total}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1 rounded-lg text-sm font-medium bg-white border border-gray-300 disabled:opacity-50">Prev</button>
              <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1 rounded-lg text-sm font-medium bg-white border border-gray-300 disabled:opacity-50">Next</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Go to</span>
              <input type="number" min={1} max={totalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const p = parseInt(pageInput); if (!isNaN(p) && p >= 1 && p <= totalPages) setPage(p); } }} className="w-16 px-2 py-1 rounded border text-sm text-center" />
              <button onClick={() => { const p = parseInt(pageInput); if (!isNaN(p) && p >= 1 && p <= totalPages) setPage(p); }} className="px-2 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200">Go</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}