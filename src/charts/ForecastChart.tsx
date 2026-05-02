import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const formatDateLabel = (date: string) => {
  const [y, m] = date.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
};

interface UnifiedDataPoint {
  date: string;
  historical: number | null;
  forecast: number | null;
  yhat_lower: number | null;
  yhat_upper: number | null;
}

interface ForecastChartProps {
  data: {
    unifiedData: UnifiedDataPoint[];
    showBands: boolean;
    hasForecast: boolean;
  };
}

export default function ForecastChart({ data: { unifiedData, showBands, hasForecast } }: ForecastChartProps) {
  return (
    <ResponsiveContainer width="100%" height={500}>
      <ComposedChart data={unifiedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={formatDateLabel} />
        <YAxis />
        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === "Historical" || name === "Forecast") return [`$${value.toLocaleString()}`, name];
            return [value, name];
          }}
        />
        <Legend />
        {hasForecast && (
          <>
            <Area
              type="monotone"
              dataKey="yhat_upper"
              stroke="#ef4444"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name="Upper 80%"
              connectNulls
              hide={!showBands}
            />
            <Area
              type="monotone"
              dataKey="yhat_lower"
              stroke="#ef4444"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name="Lower 80%"
              connectNulls
              hide={!showBands}
            />
          </>
        )}
        <Line
          type="monotone"
          dataKey="historical"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: "#3b82f6" }}
          name="Historical"
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ r: 3, fill: "#ef4444" }}
          name="Forecast"
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}