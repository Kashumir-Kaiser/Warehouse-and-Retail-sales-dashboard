import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function SupplierPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div tabIndex={-1} className="focus:outline-none">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ value }) => `$${Math.round(value).toLocaleString()}`}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`$${Math.round(value).toLocaleString()}`, undefined]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}