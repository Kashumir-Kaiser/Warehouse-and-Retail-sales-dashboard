import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { SalesByMonth } from "@/types";

export default function MonthlyTrendChart({ data }: { data: SalesByMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} width={60} />
        <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
        <Legend />
        <Line
          type="monotone"
          dataKey="retail_sales"
          name="Retail"
          stroke="#3b82f6"
          strokeWidth={2}
          dot
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="warehouse_sales"
          name="Warehouse"
          stroke="#10b981"
          strokeWidth={2}
          dot
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}