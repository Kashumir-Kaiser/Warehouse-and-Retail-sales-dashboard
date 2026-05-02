import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function CategoryBarChart({ data }: { data: { name: string; qty: number; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 40, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis yAxisId="left" width={60} />
        <YAxis yAxisId="right" orientation="right" width={70} />
        <Tooltip />
        <Legend />
        <Bar yAxisId="left" dataKey="qty" name="Transaction Count" fill="#8b5cf6" isAnimationActive={false} />
        <Bar yAxisId="right" dataKey="revenue" name="Revenue" fill="#10b981" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}