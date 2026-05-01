import { useEffect, useState, useMemo } from "react";
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

const formatDate = (d : Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

export default function ForecastPage() {
  const [itemType, setItemType] = useState<string | null>(null);
  const [historical, setHistorical] = useState<ForecastPoint[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [showBands, setShowBands] = useState(true);
  const [loading, setLoading] = useState(true);
  const [mae, setMae] = useState<number | null>(null);
  const [model, setModel] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getForecast(itemType);
        if (!cancelled) {
          setHistorical(res.historical);
          setForecast(res.forecast);
          setMae(res.mae);
          setModel(res.model || "");
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [itemType]);

  // Build unified master data array
  const unifiedData = useMemo(() => {
    if (historical.length === 0 && forecast.length === 0) return [];

    // 1. Determine data range
    const allDates = [
      ...historical.map(d => d.date),
      ...forecast.map(d => d.date),
    ];
    // Filter out any nulls/undefined dates
    const validDates = allDates.filter(d => d);
    if (validDates.length === 0) return [];

    const minDate = new Date(
      Math.min(...validDates.map(d => new Date(d + "-01").getTime()))
    );
    const maxDate = new Date(
      Math.max(...validDates.map(d => new Date(d + "-01").getTime()))
    );

    // 2. Generate master month array from min to max
    const masterDates: string[] = [];
    const current = new Date(minDate);
    while (current <= maxDate) {
      masterDates.push(formatDate(current));
      current.setMonth(current.getMonth() + 1);
    }

    // 3. Create lookup maps
    const histMap = new Map<string, number | null>();
    historical.forEach(h => histMap.set(h.date, h.total_sales));

    const fcstMap = new Map<string, {total_sales: number | null; yhat_lower?: number; yhat_upper?: number }>();
    forecast.forEach(f => {
      fcstMap.set(f.date, {
        total_sales: f.total_sales,
        yhat_lower: f.yhat_lower,
        yhat_upper: f.yhat_upper,
      });
    });

    // 4. Assemble unified data objects
    return masterDates.map(date => {
      const histVal = histMap.get(date) ?? null;
      const fcst = fcstMap.get(date);
      return {
        date,
        historical: histVal,
        forecast: fcst?.total_sales ?? null,
        yhat_lower: showBands ? fcst?.yhat_lower ?? null : null,
        yhat_upper: showBands ? fcst?.yhat_upper ?? null : null,
      };
    });
  }, [historical, forecast, showBands]);

  const handleDownload = () => downloadForecast(itemType);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">24‑Month Sales Forecast</h2>
        <div className="flex items-center gap-3">
          <select
            value={itemType || "ALL"}
            onChange={(e) => setItemType(e.target.value === "ALL" ? null : e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white"
          >
            <option value="ALL">All Categories</option>
            <option value="WINE">Wine</option>
            <option value="BEER">Beer</option>
            <option value="LIQUOR">Liquor</option>
            <option value="NON-ALCOHOL">Non-Alcohol</option>
            <option value="STR_SUPPLIES">Supplies</option>
            <option value="KEGS">Kegs</option>
          </select>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
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
            <p className="text-sm text-gray-500">Validation MAE ({model})</p>
            <p className="text-xl font-bold text-slate-900">${mae.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showBands}
            onChange={(e) => setShowBands(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show 80% Confidence Bands
        </label>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border p-4 h-[500px] animate-pulse" />
      ) : unifiedData.length === 0 ? (
        <div className="bg-white rounded-xl border p-5 text-center text-gray-500 h-[500px] flex items-center justify-center">
          No forecast data available.
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart data={unifiedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(date: string) => {
                  const [y, m] = date.split("-");
                  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                  return `${months[parseInt(m)-1]} ${y.slice(2)}`;
                }}
              />
              <YAxis />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === "Historical" || name === "Forecast") return [`$${value.toLocaleString()}`, name];
                  return [value, name];
                }}
              />
              <Legend />
              {/* Confidence bands (only if forecast data exists) */}
              {forecast.length > 0 && (
                <>
                  <Area
                    type="monotone"
                    dataKey="yhat_upper"
                    stroke="ef4444"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    dot={false}
                    name="Upper 80%"
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="yhat_lower"
                    stroke="ef4444"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    dot={false}
                    name="Lower 80%"
                    connectNulls
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="historical"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3, fill: "#3b82f6"}}
                name="Historical"
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3, fill: "#ef4444" }}
                name="Forecast"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}