import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
} from "recharts";
import { getChannelMix } from "@/api/client";
import { useFilterStore } from "@/store/useFilterStore";
import type { ChannelMixItem } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const CLASS_COLORS: Record<string, string> = {
  "Retail-Heavy": "#10b981",
  "Warehouse-Heavy": "#3b82f6",
  Balanced: "#f59e0b",
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChannelMixItem }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as ChannelMixItem | undefined;
  if (!p) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-900 mb-1">{p.item_description}</p>
      <p className="text-gray-600">Retail: ${p.retail_sales.toLocaleString()}</p>
      <p className="text-gray-600">Warehouse: ${p.warehouse_sales.toLocaleString()}</p>
      <p className="text-gray-600">Transfers: ${p.retail_transfers.toLocaleString()}</p>
      <p className="text-gray-600">Classification: {p.classification}</p>
    </div>
  );
}

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
          // If current month is not in the new list, reset
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
  }, [year, month, setMonth]);

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
    load();
  }, [load]);

  const topPerCategory = useMemo(() => {
    const groups = new Map<string, ChannelMixItem[]>();
    data.forEach((item) => {
      const cls = item.classification;
      if (!groups.has(cls)) groups.set(cls, []);
      groups.get(cls)!.push(item);
    });
    const result: ChannelMixItem[] = [];
    groups.forEach((items) => result.push(...items.slice(0, 10)));
    return result;
  }, [data]);

  const scatterData = topPerCategory.map((d) => ({
    ...d,
    x: d.retail_sales,
    y: d.warehouse_sales,
    z: Math.max(20, Math.min(500, d.retail_transfers * 2)),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Warehouse vs Retail Sales Insight</h2>
      </div>

      <div className="bg-white rounded-xl border p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Month:</span>
          {availableMonths.map((m) => (
            <button
              key={m}
              onClick={() => setMonth(month === m ? null : m)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                month === m
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]}
            </button>
          ))}
          {month && (
            <button
              onClick={() => setMonth(null)}
              className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              All
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Classification:</span>
          {["Retail-Heavy", "Warehouse-Heavy", "Balanced"].map((c) => (
            <button
              key={c}
              onClick={() => setClassification(classification === c ? null : c)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                classification === c
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
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
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <div tabIndex={-1} className="focus:outline-none">
            <ResponsiveContainer width="100%" height={500}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" name="Retail Sales" unit=" $" />
                <YAxis type="number" dataKey="y" name="Warehouse Sales" unit=" $" />
                <ZAxis type="number" dataKey="z" range={[20, 500]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<CustomTooltip />} />
                <Scatter data={scatterData} onClick={(d: { payload: ChannelMixItem }) => setSelected(d.payload)}>
                  {scatterData.map((entry, index) => (
                    <Cell key={index} fill={CLASS_COLORS[entry.classification] || "#8884d8"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4">
            {Object.entries(CLASS_COLORS).map(([name, color]) => (
              <div key={name} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: color }} />
                {name}
              </div>
            ))}
          </div>
        </div>
      )}

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