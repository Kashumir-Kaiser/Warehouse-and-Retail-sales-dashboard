import { useEffect, useState, lazy } from "react";
import { useFilterStore } from "@/store/useFilterStore";
import { getKPIs, getSalesByType, getSalesByMonth, getSalesBySupplier, getTop10Products } from "@/api/client";
import type { KPIs, SalesByType, SalesByMonth, SalesBySupplier, Top10Product } from "@/types";
import { TrendingUp, Package, Truck, ArrowRightLeft, type LucideIcon } from "lucide-react";
import LazyChart from "@/components/ui/lazychart";

// Lazy‑load chart components
const SalesByTypeChart = lazy(() => import("@/charts/SalesByTypeChart"));
const MonthlyTrendChart = lazy(() => import("@/charts/MonthlyTrendChart"));
const SupplierPieChart = lazy(() => import("@/charts/SupplierPieChart"));

function KPICard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 mr-3">
          <p className="text-sm text-gray-500 font-medium truncate">{title}</p>
          <p className="text-xl lg:text-2xl font-bold text-slate-900 mt-1 break-all">
            {value}
          </p>
        </div>
        <div className={`p-3 rounded-lg shrink-0 ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  );
}

function KPICardSkeleton() {
  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 mr-3">
          <div className="h-4 bg-gray-200 rounded w-20 mb-2 animate-pulse" />
          <div className="h-8 bg-gray-200 rounded w-32 animate-pulse" />
        </div>
        <div className="p-3 rounded-lg bg-gray-200 animate-pulse">
          <div className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { year, month, itemType, supplierSearch } = useFilterStore();
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [byType, setByType] = useState<SalesByType[]>([]);
  const [byMonth, setByMonth] = useState<SalesByMonth[]>([]);
  const [bySupplier, setBySupplier] = useState<SalesBySupplier[]>([]);
  const [top10, setTop10] = useState<Top10Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [k, t, m, s, top] = await Promise.all([
          getKPIs(month, itemType, supplierSearch || undefined, year),
          getSalesByType(month, supplierSearch || undefined, year),
          getSalesByMonth(itemType, supplierSearch || undefined, year),
          getSalesBySupplier(month, itemType, year),
          getTop10Products(month, itemType, supplierSearch || undefined, year),
        ]);
        if (!cancelled) {
          setKpis(k);
          setByType(t);
          setByMonth(m);
          setBySupplier(s);
          setTop10(top);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    // Delay the fetch slightly to let the static shell paint first
    const timer = setTimeout(load, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [year, month, itemType, supplierSearch]);

  // Pie‑chart data computation
  const sortedSuppliers = [...bySupplier].sort(
    (a, b) => b.retail_sales + b.warehouse_sales - (a.retail_sales + a.warehouse_sales)
  );
  const top4 = sortedSuppliers.slice(0, 4);
  const othersTotal = sortedSuppliers.slice(4).reduce((sum, s) => sum + s.retail_sales + s.warehouse_sales, 0);
  const pieData = [
    ...top4.map((s) => ({ name: s.supplier, value: s.retail_sales + s.warehouse_sales })),
    { name: "Others", value: othersTotal },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Dashboard</h2>

      {/* KPI cards – always visible, replace with skeletons while loading */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <KPICardSkeleton />
            <KPICardSkeleton />
            <KPICardSkeleton />
            <KPICardSkeleton />
          </>
        ) : (
          <>
            <KPICard
              title="Total Revenue"
              value={`$${Math.round(kpis?.total_revenue ?? 0).toLocaleString()}`}
              icon={TrendingUp}
              color="bg-blue-600"
            />
            <KPICard
              title="Retail Sales"
              value={`$${Math.round(kpis?.total_retail ?? 0).toLocaleString()}`}
              icon={Package}
              color="bg-emerald-500"
            />
            <KPICard
              title="Warehouse Sales"
              value={`$${Math.round(kpis?.total_warehouse ?? 0).toLocaleString()}`}
              icon={Truck}
              color="bg-amber-500"
            />
            <KPICard
              title="Transfers"
              value={`$${Math.round(kpis?.total_transfers ?? 0).toLocaleString()}`}
              icon={ArrowRightLeft}
              color="bg-rose-500"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LazyChart title="Sales by Item Type" component={SalesByTypeChart} data={byType} />
        <LazyChart title="Monthly Sales Trend" component={MonthlyTrendChart} data={byMonth} />
        <LazyChart title="Revenue Share by Supplier (Top 10)" component={SupplierPieChart} data={pieData} />

        {/* Top 10 products table */}
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Top 10 Products by Retail Sales</h3>
          <div className="overflow-auto max-h-[320px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Product</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Retail</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-gray-800 truncate max-w-[200px]" title={p.item_description}>
                      {p.item_description}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      ${p.retail_sales.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      ${p.warehouse_sales.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}