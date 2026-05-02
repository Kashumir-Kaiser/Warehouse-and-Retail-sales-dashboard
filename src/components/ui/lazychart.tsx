import { useEffect, useRef, useState, Suspense, type ComponentType } from "react";

interface LazyChartProps<D = unknown> {
  title: string;
  height?: number;
  component: React.LazyExoticComponent<ComponentType<{ data: D }>>;
  data: D;
}

export default function LazyChart<D = unknown>({
  title,
  height = 300,
  component: Comp,
  data,
}: LazyChartProps<D>) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="bg-white rounded-xl border p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900 mb-4">{title}</h3>
      {visible ? (
        <Suspense fallback={<div style={{ height }} className="bg-gray-100 animate-pulse rounded" />}>
          <Comp data={data} />
        </Suspense>
      ) : (
        <div style={{ height }} className="bg-gray-100 animate-pulse rounded" />
      )}
    </div>
  );
}