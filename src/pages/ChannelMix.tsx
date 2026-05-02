import { useEffect, useState, useCallback, useMemo, lazy } from "react";
import { getChannelMix } from "@/api/client";
import { useFilterStore } from "@/store/useFilterStore";
import type { ChannelMixItem } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import LazyChart from "@/components/ui/lazychart";

const ChannelScatterChart = lazy(() => import("@/charts/ChannelScatterChart"));

export default function ChannelMixPage() {
  const { year } = useFilterStore();
  const [data, setData] = useState<ChannelMixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<number | null>(null);
  const [classification, setClassification] = useState<string | null>(null);
  const [selected, setSelected] = useState<ChannelMixItem | null>(null);
  const [availableMonths, setAvailableMonths] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadMonths() {
      try {
        const res = await fetch(`/api/available-months?year=${year}`);
        const data = await res.json();
        if (!cancelled) {
          setAvailableMonths(data.months);
          if (month !== null && !data.months.includes(month)) {
            setMonth(null);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadMonths();
    return () => { cancelled = true; };
  }, [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getChannelMix(month, classification, false, 5000, year);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [month, classification, year]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const topPerCategory = useMemo(() => {
    const groups = new Map<string, ChannelMixItem[]>();
    data.forEach((item) => {
      const cls = item.classification;
      if (!groups.has(cls)) groups.set(cls, []);
      groups.get(cls)!.push(item);
    });
    const result: ChannelMixItem[] = [];
    groups.forEach((items: ChannelMixItem[]) => result.push(...items.slice(0, 10)));
    return result;
  }, [data]);

  const scatterData = topPerCategory.map((d: ChannelMixItem) => ({
    ...d,
    x: d.retail_sales,
    y: d.warehouse_sales,
    z: Math.max(20, Math.min(500, d.retail_transfers * 2)),
  }));

  const scatterChartData = {
    scatterData,
    onPointClick: (item: ChannelMixItem) => setSelected(item),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Warehouse vs Retail Sales Insight</h2>
      </div>

      <div className="bg-white rounded-xl border p-4 shadow-sm flex flex-wrap gap-3 items-center">
        {/* month and classification buttons as before (unchanged) */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Month:</span>
          {availableMonths.map((m) => (
            <button
              key={m}
              onClick={() => setMonth(month === m ? null : m)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                month === m ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]}
            </button>
          ))}
          {month && (
            <button onClick={() => setMonth(null)} className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">All</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Classification:</span>
          {["Retail-Heavy", "Warehouse-Heavy", "Balanced"].map((c) => (
            <button
              key={c}
              onClick={() => setClassification(classification === c ? null : c)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                classification === c ? "bg-slate-800 text-white border-slate-800" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border p-4 h-[500px] animate-pulse" />
      ) : (
        <LazyChart
          title="Warehouse vs Retail Sales Scatter"
          height={500}
          component={ChannelScatterChart}
          data={scatterChartData}
        />
      )}

      {/* Legend colors */}
      <div className="flex items-center justify-center gap-6 mt-4">
        {Object.entries({ "Retail-Heavy": "#10b981", "Warehouse-Heavy": "#3b82f6", Balanced: "#f59e0b" }).map(([name, color]) => (
          <div key={name} className="flex items-center gap-2 text-sm text-gray-600">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: color }} />
            {name}
          </div>
        ))}
      </div>

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[400px] sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Product Details</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="text-base font-semibold text-slate-900">{selected.item_description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Retail Sales</p>
                  <p className="text-lg font-bold text-slate-900">${selected.retail_sales.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Warehouse Sales</p>
                  <p className="text-lg font-bold text-slate-900">${selected.warehouse_sales.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Transfers</p>
                  <p className="text-lg font-bold text-slate-900">${selected.retail_transfers.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Retail Share</p>
                  <p className="text-lg font-bold text-slate-900">{(selected.retail_share * 100).toFixed(1)}%</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Classification</p>
                <p className="text-base font-semibold text-slate-900">{selected.classification}</p>
              </div>
              {selected.high_transfer && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-800">High Transfer Product</p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}