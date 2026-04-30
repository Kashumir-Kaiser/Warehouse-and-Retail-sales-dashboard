import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
} from "recharts";
import { getForecast, downloadForecast } from "@/api/client";
import type { ForecastPoint } from "@/types";
import { Download, TrendingUp } from "lucide-react";

export default function ForecastPage() {
  const [itemType, setItemType] = useState<string | null>(null);
  const [year, setYear] = useState(2020);
  const [historical, setHistorical] = useState<ForecastPoint[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [showBands, setShowBands] = useState(true);
  const [loading, setLoading] = useState(true);
  const [mae, setMae] = useState<number | null>(null);

  const years = [2017, 2018, 2019, 2020];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getForecast(itemType, year);
        const hist = res.historical.filter((d) => d.type === "historical");
        const fcst = res.historical.filter((d) => d.type === "forecast");
        if (!cancelled) {
          setHistorical(hist);
          setForecast(fcst);
          setMae(res.mae);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [itemType, year]);

  const chartData = [...historical, ...forecast].sort((a, b) => a.month - b.month);

  const monthLabel = (m: number): string =>
    ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m] || String(m);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Time Series Forecasting</h2>
        <div className="flex items-center gap-3">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white">
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={itemType || "ALL"} onChange={(e) => setItemType(e.target.value === "ALL" ? null : e.target.value)} className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white">
            <option value="ALL">All Categories</option>
            <option value="WINE">Wine</option>
            <option value="BEER">Beer</option>
            <option value="LIQUOR">Liquor</option>
            <option value="NON-ALCOHOL">Non-Alcohol</option>
            <option value="STR_SUPPLIES">Supplies</option>
            <option value="KEGS">Kegs</option>
          </select>
          <button onClick={() => downloadForecast(itemType, year)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
            <Download size={16} />
            Download CSV
          </button>
        </div>
      </div>

      {mae !== null && (
        <div className="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-lg bg-emerald-100">
            <TrendingUp size={20} className="text-emerald-700" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Model Accuracy (MAE)</p>
            <p className="text-xl font-bold text-slate-900">${mae.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={showBands} onChange={(e) => setShowBands(e.target.checked)} className="rounded border-gray-300" />
          Show Confidence Bands
        </label>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border p-4 h-[500px] animate-pulse" />
      ) : (
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tickFormatter={monthLabel} />
              <YAxis />
              <Tooltip formatter={(value: number, name: string) => {
                if (name === "Historical" || name === "Forecast") return [`$${value.toLocaleString()}`, name];
                return [value, name];
              }} />
              <Legend />
              {showBands && (
                <>
                  <Area type="monotone" dataKey="yhat_upper" data={forecast} stroke="transparent" fill="#ef4444" fillOpacity={0.15} name="Upper 80%" connectNulls />
                  <Area type="monotone" dataKey="yhat_lower" data={forecast} stroke="transparent" fill="#ffffff" fillOpacity={0} name="Lower 80%" connectNulls />
                </>
              )}
              <Line type="monotone" dataKey="total_sales" data={historical} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: "#3b82f6" }} name="Historical" connectNulls={false} />
              <Line type="monotone" dataKey="total_sales" data={forecast} stroke="#ef4444" strokeWidth={2} dot={{ r: 4, fill: "#ef4444" }} name="Forecast" connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-600"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Historical</div>
            <div className="flex items-center gap-2 text-sm text-gray-600"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Forecast</div>
          </div>
        </div>
      )}
    </div>
  );
}