import { create } from "zustand";

interface FilterState {
  year: number;
  month: number | null;
  itemType: string | null;
  supplierSearch: string;
  setYear: (year: number) => void;
  setMonth: (month: number | null) => void;
  setItemType: (itemType: string | null) => void;
  setSupplierSearch: (search: string) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  year: 2020,
  month: null,
  itemType: null,
  supplierSearch: "",
  setYear: (year) => set({ year }),
  setMonth: (month) => set({ month }),
  setItemType: (itemType) => set({ itemType }),
  setSupplierSearch: (supplierSearch) => set({ supplierSearch }),
  reset: () => set({ year: 2020, month: null, itemType: null, supplierSearch: "" }),
}));