import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Truck,
  PieChart,
  ScatterChart,
  TrendingUp,
  Search,
  Menu,
  X,
} from "lucide-react";
import { useFilterStore } from "@/store/useFilterStore";
import DashboardPage from "@/pages/Dashboard";
import SuppliersPage from "@/pages/Suppliers";
import CategoriesPage from "@/pages/Categories";
import ChannelMixPage from "@/pages/ChannelMix";
import ForecastPage from "@/pages/Forecast";
import ProductsPage from "@/pages/Products";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "categories", label: "Categories", icon: PieChart },
  { id: "channel", label: "Channel Mix", icon: ScatterChart },
  { id: "forecast", label: "Forecast", icon: TrendingUp },
  { id: "products", label: "Products", icon: Search },
];

function FilterBar() {
  const { year, setYear, month, setMonth, itemType, setItemType, supplierSearch, setSupplierSearch, reset } = useFilterStore();
  const years = [2017, 2018, 2019, 2020];
  const [availableMonths, setAvailableMonths] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/available-months?year=${year}`);
        const data = await res.json();
        if (!cancelled) {
          setAvailableMonths(data.months);
          // If current month is not in the new list, reset
          if (month !== null && !data.months.includes(month)) {
            setMonth(null);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [year, month, setMonth]); // fixed missing dependencies

  return (
    <div className="bg-white border-b px-4 py-3 flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Year:</span>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Month:</span>
        <select
          value={month ?? "ALL"}
          onChange={(e) => setMonth(e.target.value === "ALL" ? null : parseInt(e.target.value))}
          className="px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white"
        >
          <option value="ALL">All</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {new Date(2024, m - 1).toLocaleString("default", { month: "short" })}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Type:</span>
        <select
          value={itemType || "ALL"}
          onChange={(e) => setItemType(e.target.value === "ALL" ? null : e.target.value)}
          className="px-3 py-1 rounded-lg text-sm border border-gray-300 bg-white"
        >
          <option value="ALL">All</option>
          <option value="WINE">Wine</option>
          <option value="BEER">Beer</option>
          <option value="LIQUOR">Liquor</option>
          <option value="NON-ALCOHOL">Non-Alcohol</option>
          <option value="STR_SUPPLIES">Supplies</option>
          <option value="KEGS">Kegs</option>
        </select>
      </div>

      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <span className="text-sm font-medium text-gray-600">Supplier:</span>
        <input
          type="text"
          value={supplierSearch}
          onChange={(e) => setSupplierSearch(e.target.value)}
          placeholder="Search supplier..."
          className="px-3 py-1 rounded-lg text-sm border border-gray-300 bg-white w-full max-w-xs"
        />
      </div>

      <button
        onClick={reset}
        className="px-3 py-1 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
      >
        Reset
      </button>
    </div>
  );
}

function Sidebar({ active, onNavigate, mobileOpen, onClose }: {
  active: string;
  onNavigate: (id: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-slate-900 text-white transition-transform lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">Sales Dashboard</h1>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <nav className="px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        active={activePage}
        onNavigate={setActivePage}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="bg-white border-b px-4 py-3 flex items-center gap-3 lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="text-gray-600">
            <Menu size={24} />
          </button>
          <h1 className="font-bold text-slate-900">Sales Dashboard</h1>
        </header>
        <FilterBar />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {activePage === "dashboard" && <DashboardPage />}
          {activePage === "suppliers" && <SuppliersPage />}
          {activePage === "categories" && <CategoriesPage />}
          {activePage === "channel" && <ChannelMixPage />}
          {activePage === "forecast" && <ForecastPage />}
          {activePage === "products" && <ProductsPage />}
        </main>
      </div>
    </div>
  );
}