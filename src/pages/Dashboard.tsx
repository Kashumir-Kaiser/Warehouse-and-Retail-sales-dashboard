import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { useFilterStore } from "@/store/useFilterStore";
import { getKPIs, getSalesByType, getSalesByMonth, getSalesBySupplier, getTop10Products } from "@/api/client";
import type { KPIs, SalesByType, SalesByMonth, SalesBySupplier, Top10Product } from "@/types";
import { TrendingUp, Package, Truck, ArrowRightLeft, type LucideIcon } from "lucide-react";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function KPICard({ title, value, icon: Icon, color }: { title: string; value: string; icon: LucideIcon; color: string }) {
  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 mr-3">
          <p className="text-sm text-gray-500 font-medium truncate">{title}</p>
          <p className="text-xl lg:text-2xl font-bold text-slate-900 mt-1 break-all">{value}</p>
        </div>
        <div className={`p-3 rounded-lg shrink-0 ${color}`}>
          <Icon size={20} className="text-white" />
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
    load();
    return () => { cancelled = true; };
  }, [year, month, itemType, supplierSearch]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-5 h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4 h-80" />
          <div className="bg-white rounded-xl border p-4 h-80" />
        </div>
      </div>
    );
  }

  const sortedSuppliers = [...bySupplier].sort(
    (a, b) => (b.retail_sales + b.warehouse_sales) - (a.retail_sales + a.warehouse_sales)
  );
  const top4 = sortedSuppliers.slice(0, 4);
  const othersTotal = sortedSuppliers.slice(4).reduce(
    (sum, s) => sum + s.retail_sales + s.warehouse_sales, 0
  );
  const pieData = [
    ...top4.map(s => ({ name: s.supplier, value: s.retail_sales + s.warehouse_sales })),
    { name: "Others", value: othersTotal },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Revenue" value={`$${(kpis?.total_revenue ?? 0).toLocaleString()}`} icon={TrendingUp} color="bg-blue-600" />
        <KPICard title="Retail Sales" value={`$${(kpis?.total_retail ?? 0).toLocaleString()}`} icon={Package} color="bg-emerald-500" />
        <KPICard title="Warehouse Sales" value={`$${(kpis?.total_warehouse ?? 0).toLocaleString()}`} icon={Truck} color="bg-amber-500" />
        <KPICard title="Transfers" value={`$${(kpis?.total_transfers ?? 0).toLocaleString()}`} icon={ArrowRightLeft} color="bg-rose-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Sales by Item Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byType} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="item_type" />
              <YAxis
                tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                width={60}
              />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="retail_sales" name="Retail" fill="#3b82f6" />
              <Bar dataKey="warehouse_sales" name="Warehouse" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Monthly Sales Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis
                tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                width={60}
              />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
              <Legend />
              <Line type="monotone" dataKey="retail_sales" name="Retail" stroke="#3b82f6" strokeWidth={2} dot />
              <Line type="monotone" dataKey="warehouse_sales" name="Warehouse" stroke="#10b981" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Revenue Share by Supplier (Top 10)</h3>
          <div tabIndex={-1} className="focus:outline-none">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ value }) => `$${Math.round(value).toLocaleString()}`}
                  stroke="none"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`$${Math.round(value).toLocaleString()}`, undefined]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

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
                    <td className="px-3 py-2 text-gray-800 truncate max-w-[200px]" title={p.item_description}>{p.item_description}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">${p.retail_sales.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-gray-600">${p.warehouse_sales.toLocaleString()}</td>
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