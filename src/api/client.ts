import axios from "axios";
import type {
  KPIs,
  SalesByMonth,
  SalesByType,
  SalesBySupplier,
  Top10Product,
  SupplierResponse,
  Category,
  ChannelMixItem,
  ForecastResponse,
  ProductResponse,
  ProductDetail,
} from "@/types";

const api = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
});

export async function getKPIs(month?: number | null, itemType?: string | null, supplier?: string, year?: number | null) {
  const params = new URLSearchParams();
  if (month) params.append("month", String(month));
  if (itemType) params.append("item_type", itemType);
  if (supplier) params.append("supplier", supplier);
  if (year) params.append("year", String(year));
  const res = await api.get<KPIs>(`/api/kpis?${params.toString()}`);
  return res.data;
}

export async function getSalesByMonth(itemType?: string | null, supplier?: string, year?: number | null) {
  const params = new URLSearchParams();
  if (itemType) params.append("item_type", itemType);
  if (supplier) params.append("supplier", supplier);
  if (year) params.append("year", String(year));
  const res = await api.get<SalesByMonth[]>(`/api/sales/by-month?${params.toString()}`);
  return res.data;
}

export async function getSalesByType(month?: number | null, supplier?: string, year?: number | null) {
  const params = new URLSearchParams();
  if (month) params.append("month", String(month));
  if (supplier) params.append("supplier", supplier);
  if (year) params.append("year", String(year));
  const res = await api.get<SalesByType[]>(`/api/sales/by-type?${params.toString()}`);
  return res.data;
}

export async function getSalesBySupplier(month?: number | null, itemType?: string | null, year?: number | null) {
  const params = new URLSearchParams();
  if (month) params.append("month", String(month));
  if (itemType) params.append("item_type", itemType);
  if (year) params.append("year", String(year));
  const res = await api.get<SalesBySupplier[]>(`/api/sales/by-supplier?${params.toString()}`);
  return res.data;
}

export async function getTop10Products(month?: number | null, itemType?: string | null, supplier?: string, year?: number | null) {
  const params = new URLSearchParams();
  if (month) params.append("month", String(month));
  if (itemType) params.append("item_type", itemType);
  if (supplier) params.append("supplier", supplier);
  if (year) params.append("year", String(year));
  const res = await api.get<Top10Product[]>(`/api/products/top10?${params.toString()}`);
  return res.data;
}

export async function getSuppliers(page = 1, perPage = 20, search?: string, sortBy = "retail_sales", sortOrder: "asc" | "desc" = "desc", year?: number | null) {
  const params = new URLSearchParams();
  params.append("page", String(page));
  params.append("per_page", String(perPage));
  if (search) params.append("search", search);
  params.append("sort_by", sortBy);
  params.append("sort_order", sortOrder);
  if (year) params.append("year", String(year));
  const res = await api.get<SupplierResponse>(`/api/suppliers?${params.toString()}`);
  return res.data;
}

export async function getSupplierProducts(supplierName: string, year?: number | null) {
  const params = new URLSearchParams();
  if (year) params.append("year", String(year));
  const res = await api.get<{ item_description: string; retail_sales: number; warehouse_sales: number; retail_transfers: number }[]>(`/api/suppliers/${encodeURIComponent(supplierName)}/products?${params.toString()}`);
  return res.data;
}

export async function getCategories(year?: number | null) {
  const params = new URLSearchParams();
  if (year) params.append("year", String(year));
  const res = await api.get<Category[]>(`/api/categories?${params.toString()}`);
  return res.data;
}

export async function getCategoryProducts(typeName: string, page = 1, perPage = 20, year?: number | null) {
  const params = new URLSearchParams();
  params.append("page", String(page));
  params.append("per_page", String(perPage));
  if (year) params.append("year", String(year));
  const res = await api.get<ProductResponse>(`/api/categories/${encodeURIComponent(typeName)}/products?${params.toString()}`);
  return res.data;
}

export async function getChannelMix(month?: number | null, classification?: string | null, highTransferOnly = false, limit = 500, year?: number | null) {
  const params = new URLSearchParams();
  if (month) params.append("month", String(month));
  if (classification) params.append("classification", classification);
  if (highTransferOnly) params.append("high_transfer_only", "true");
  params.append("limit", String(limit));
  if (year) params.append("year", String(year));
  const res = await api.get<ChannelMixItem[]>(`/api/channel-mix?${params.toString()}`);
  return res.data;
}

export async function getForecast(itemType?: string | null, year?: number | null) {
  const params = new URLSearchParams();
  if (itemType) params.append("item_type", itemType);
  if (year) params.append("year", String(year));
  const res = await api.get<ForecastResponse>(`/api/forecast?${params.toString()}`);
  return res.data;
}

export async function downloadForecast(itemType?: string | null, year?: number | null) {
  const params = new URLSearchParams();
  if (itemType) params.append("item_type", itemType);
  if (year) params.append("year", String(year));
  window.open(`/api/forecast/download?${params.toString()}`, "_blank");
}

export async function searchProducts(q?: string, itemType?: string | null, supplier?: string, page = 1, perPage = 20, sort = "retail_sales", order: "asc" | "desc" = "desc", year?: number | null) {
  const params = new URLSearchParams();
  if (q) params.append("q", q);
  if (itemType) params.append("item_type", itemType);
  if (supplier) params.append("supplier", supplier);
  params.append("page", String(page));
  params.append("per_page", String(perPage));
  params.append("sort", sort);
  params.append("order", order);
  if (year) params.append("year", String(year));
  const res = await api.get<ProductResponse>(`/api/products?${params.toString()}`);
  return res.data;
}

export async function getProductSuggest(q: string) {
  const res = await api.get<{ name: string }[]>(`/api/products/suggest?q=${encodeURIComponent(q)}`);
  return res.data;
}

export async function getProductDetail(itemCode: string, year?: number | null) {
  const params = new URLSearchParams();
  if (year) params.append("year", String(year));
  const res = await api.get<ProductDetail>(`/api/products/${encodeURIComponent(itemCode)}?${params.toString()}`);
  return res.data;
}