export interface KPIs {
  total_retail: number;
  total_warehouse: number;
  total_transfers: number;
  total_revenue: number;
}

export interface SalesByMonth {
  month: number;
  retail_sales: number;
  warehouse_sales: number;
}

export interface SalesByType {
  item_type: string;
  retail_sales: number;
  warehouse_sales: number;
}

export interface SalesBySupplier {
  supplier: string;
  retail_sales: number;
  warehouse_sales: number;
}

export interface Top10Product {
  item_description: string;
  retail_sales: number;
  warehouse_sales: number;
  retail_transfers: number;
}

export interface Supplier {
  supplier: string;
  retail_sales: number;
  warehouse_sales: number;
  retail_transfers: number;
  total_revenue: number;
  best_product: string | null;
  best_product_sales: number;
  declining_flag: boolean;
}

export interface SupplierResponse {
  data: Supplier[];
  total: number;
  page: number;
  per_page: number;
}

export interface Category {
  item_type: string;
  retail_sales: number;
  warehouse_sales: number;
  retail_transfers: number;
  avg_price_proxy: number;
  most_expensive: string;
  most_expensive_value: number;
  most_popular: string;
  most_popular_count: number;
}

export interface ChannelMixItem {
  item_description: string;
  retail_sales: number;
  warehouse_sales: number;
  retail_transfers: number;
  retail_share: number;
  classification: string;
  high_transfer: boolean;
}

export interface ForecastPoint {
  month: number;
  total_sales: number;
  type: string;
  yhat_lower?: number;
  yhat_upper?: number;
  yhat_lower_95?: number;
  yhat_upper_95?: number;
}

export interface ForecastResponse {
  historical: ForecastPoint[];
  interpolated: ForecastPoint[];
  mae: number | null;
}

export interface Product {
  item_code: string;
  item_description: string;
  item_type: string;
  supplier: string;
  retail_sales: number;
  warehouse_sales: number;
  retail_transfers: number;
}

export interface ProductResponse {
  data: Product[];
  total: number;
  page: number;
  per_page: number;
}

export interface ProductDetail {
  item_code: string;
  item_description: string;
  item_type: string;
  supplier: string;
  months_breakdown: {
    month: number;
    retail_sales: number;
    warehouse_sales: number;
    retail_transfers: number;
  }[];
}
