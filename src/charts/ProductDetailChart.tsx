import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const monthLabel = (month: number) => {
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[month] ?? String(month);
};

export default function ProductDetailChart({
  data,
}: {
  data: { month: number; retail_sales: number; warehouse_sales: number; retail_transfers: number }[];
}) {
  return (
    <div className="bg-white rounded-xl border p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-900 mb-3">Monthly Breakdown</h4>
      <div className="overflow-x-auto">
        <div style={{ width: Math.max(420, data.length * 70), height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                interval={0}
                minTickGap={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="retail_sales" name="Retail" fill="#3b82f6" isAnimationActive={false} />
              <Bar dataKey="warehouse_sales" name="Warehouse" fill="#10b981" isAnimationActive={false} />
              <Bar dataKey="retail_transfers" name="Transfers" fill="#f59e0b" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}