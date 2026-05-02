import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { SalesByType } from "@/types";

export default function SalesByTypeChart({ data }: { data: SalesByType[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="item_type" />
        <YAxis tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`} width={60} />
        <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
        <Legend />
        <Bar dataKey="retail_sales" name="Retail" fill="#3b82f6" isAnimationActive={false} />
        <Bar dataKey="warehouse_sales" name="Warehouse" fill="#10b981" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}