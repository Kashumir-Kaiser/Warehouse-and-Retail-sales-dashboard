import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ZAxis, Cell,
} from "recharts";
import type { ChannelMixItem } from "@/types";

const CLASS_COLORS: Record<string, string> = {
  "Retail-Heavy": "#10b981",
  "Warehouse-Heavy": "#3b82f6",
  Balanced: "#f59e0b",
};

interface ChannelScatterChartData {
  scatterData: (ChannelMixItem & { x: number; y: number; z: number })[];
  onPointClick: (item: ChannelMixItem) => void;
}

export default function ChannelScatterChart({
  data,
}: {
  data: ChannelScatterChartData;
}) {
  const { scatterData, onPointClick } = data;

  return (
    <ResponsiveContainer width="100%" height={500}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="x" name="Retail Sales" unit=" $" />
        <YAxis type="number" dataKey="y" name="Warehouse Sales" unit=" $" />
        <ZAxis type="number" dataKey="z" range={[20, 500]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
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
          }}
        />
        <Scatter
          data={scatterData}
          onClick={(d: { payload: ChannelMixItem }) => onPointClick(d.payload)}
          isAnimationActive={false}
        >
          {scatterData.map((entry, index) => (
            <Cell key={index} fill={CLASS_COLORS[entry.classification] || "#8884d8"} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}