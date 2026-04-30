import pandas as pd
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Optional, Literal
import io
import warnings
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tools.sm_exceptions import ConvergenceWarning

import os
CSV_PATH = os.path.join(os.path.dirname(__file__), "Warehouse_and_Retail_Sales.csv")

def load_data():
    df = pd.read_csv(CSV_PATH, low_memory=False)
    df.columns = [c.strip().replace(" ", "_") for c in df.columns]
    df = df[~df["ITEM_TYPE"].isin(["DUNNAGE", "REF"])].copy()
    for col in ["RETAIL_SALES", "WAREHOUSE_SALES", "RETAIL_TRANSFERS"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
        df[col] = df[col].clip(lower=0)
    df["YEAR"] = pd.to_numeric(df["YEAR"], errors="coerce").fillna(0).astype(int)
    df["MONTH"] = pd.to_numeric(df["MONTH"], errors="coerce").fillna(0).astype(int)
    df = df.drop_duplicates().reset_index(drop=True)
    return df

_df = load_data()

# Pre-aggregated data for fast queries (used when no year filter)
def build_aggregates(df):
    month_agg = df.groupby("MONTH").agg({
        "RETAIL_SALES": "sum",
        "WAREHOUSE_SALES": "sum",
        "RETAIL_TRANSFERS": "sum"
    }).reset_index()

    type_agg = df.groupby("ITEM_TYPE").agg({
        "RETAIL_SALES": "sum",
        "WAREHOUSE_SALES": "sum",
        "RETAIL_TRANSFERS": "sum"
    }).reset_index()

    supplier_agg = df.groupby("SUPPLIER").agg({
        "RETAIL_SALES": "sum",
        "WAREHOUSE_SALES": "sum",
        "RETAIL_TRANSFERS": "sum"
    }).reset_index()

    top10 = df.groupby("ITEM_DESCRIPTION")["RETAIL_SALES"].sum().reset_index().sort_values("RETAIL_SALES", ascending=False).head(10)

    jan = df[df["MONTH"] == 1].groupby("SUPPLIER").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum"}).reset_index()
    jan["total_jan"] = jan["RETAIL_SALES"] + jan["WAREHOUSE_SALES"]
    jul = df[df["MONTH"] == 7].groupby("SUPPLIER").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum"}).reset_index()
    jul["total_jul"] = jul["RETAIL_SALES"] + jul["WAREHOUSE_SALES"]
    supplier_decline = pd.merge(supplier_agg, jan[["SUPPLIER", "total_jan"]], on="SUPPLIER", how="left")
    supplier_decline = pd.merge(supplier_decline, jul[["SUPPLIER", "total_jul"]], on="SUPPLIER", how="left")
    supplier_decline["declining_flag"] = (
        (supplier_decline["total_jul"] < supplier_decline["total_jan"] * 0.9) &
        supplier_decline["total_jan"].notna() & supplier_decline["total_jul"].notna()
    )

    best_per_supplier = df.groupby(["SUPPLIER", "ITEM_DESCRIPTION"])["RETAIL_SALES"].sum().reset_index()
    best_per_supplier = best_per_supplier.loc[best_per_supplier.groupby("SUPPLIER")["RETAIL_SALES"].idxmax()][["SUPPLIER", "ITEM_DESCRIPTION", "RETAIL_SALES"]]
    supplier_decline = pd.merge(supplier_decline, best_per_supplier.rename(columns={"ITEM_DESCRIPTION": "best_product", "RETAIL_SALES": "best_product_sales"}), on="SUPPLIER", how="left")

    supplier_decline["total_revenue"] = supplier_decline["RETAIL_SALES"] + supplier_decline["WAREHOUSE_SALES"]
    supplier_decline = supplier_decline.rename(columns={
        "RETAIL_SALES": "retail_sales",
        "WAREHOUSE_SALES": "warehouse_sales",
        "RETAIL_TRANSFERS": "retail_transfers"
    })

    cat_agg = df.groupby("ITEM_TYPE").agg({
        "RETAIL_SALES": ["sum", "count", "max"],
        "WAREHOUSE_SALES": "sum",
        "RETAIL_TRANSFERS": "sum"
    }).reset_index()
    cat_agg.columns = ["ITEM_TYPE", "retail_sales_sum", "transaction_count", "retail_sales_max", "warehouse_sales_sum", "retail_transfers_sum"]
    cat_agg["avg_price_proxy"] = cat_agg["retail_sales_sum"] / cat_agg["transaction_count"]

    pop = df.groupby(["ITEM_TYPE", "ITEM_DESCRIPTION"]).size().reset_index(name="count")
    pop = pop.loc[pop.groupby("ITEM_TYPE")["count"].idxmax()][["ITEM_TYPE", "ITEM_DESCRIPTION", "count"]]
    cat_agg = pd.merge(cat_agg, pop.rename(columns={"ITEM_DESCRIPTION": "most_popular", "count": "most_popular_count"}), on="ITEM_TYPE", how="left")

    exp = df.loc[df.groupby("ITEM_TYPE")["RETAIL_SALES"].idxmax()][["ITEM_TYPE", "ITEM_DESCRIPTION", "RETAIL_SALES"]]
    cat_agg = pd.merge(cat_agg, exp.rename(columns={"ITEM_DESCRIPTION": "most_expensive", "RETAIL_SALES": "most_expensive_value"}), on="ITEM_TYPE", how="left")

    channel = df.groupby("ITEM_DESCRIPTION").agg({
        "RETAIL_SALES": "sum",
        "WAREHOUSE_SALES": "sum",
        "RETAIL_TRANSFERS": "sum"
    }).reset_index()
    channel["total_sales"] = channel["RETAIL_SALES"] + channel["WAREHOUSE_SALES"]
    channel["retail_share"] = channel["RETAIL_SALES"] / channel["total_sales"].replace(0, np.nan)
    channel["retail_share"] = channel["retail_share"].fillna(0)
    channel["classification"] = channel["retail_share"].apply(
        lambda x: "Retail-Heavy" if x > 0.7 else ("Warehouse-Heavy" if x < 0.3 else "Balanced")
    )
    transfer_75th = channel["RETAIL_TRANSFERS"].quantile(0.75)
    channel["high_transfer"] = channel["RETAIL_TRANSFERS"] > transfer_75th

    return {
        "month_agg": month_agg,
        "type_agg": type_agg,
        "supplier_agg": supplier_agg,
        "top10": top10,
        "supplier_decline": supplier_decline,
        "cat_agg": cat_agg,
        "channel": channel,
        "transfer_75th": transfer_75th
    }

_pre = build_aggregates(_df)

app = FastAPI(title="Sales Performance Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def apply_filters(df, month=None, item_type=None, supplier=None, year=None):
    d = df.copy()
    if year is not None:
        d = d[d["YEAR"] == year]
    if month is not None:
        d = d[d["MONTH"] == month]
    if item_type is not None:
        d = d[d["ITEM_TYPE"] == item_type]
    if supplier is not None:
        d = d[d["SUPPLIER"].str.contains(supplier, case=False, na=False)]
    return d

@app.get("/api/available-months")
def get_available_months(year: int = Query(...)):
    d = _df[_df["YEAR"] == year]
    months = sorted(d["MONTH"].unique().tolist())
    return {"months": [int(m) for m in months]}

@app.get("/api/kpis")
def get_kpis(month: Optional[int] = Query(None), item_type: Optional[str] = Query(None), supplier: Optional[str] = Query(None), year: Optional[int] = Query(None)):
    d = apply_filters(_df, month, item_type, supplier, year)
    return {
        "total_retail": round(d["RETAIL_SALES"].sum(), 2),
        "total_warehouse": round(d["WAREHOUSE_SALES"].sum(), 2),
        "total_transfers": round(d["RETAIL_TRANSFERS"].sum(), 2),
        "total_revenue": round(d["RETAIL_SALES"].sum() + d["WAREHOUSE_SALES"].sum(), 2)
    }

@app.get("/api/sales/by-month")
def get_sales_by_month(item_type: Optional[str] = Query(None), supplier: Optional[str] = Query(None), year: Optional[int] = Query(None)):
    d = apply_filters(_df, None, item_type, supplier, year)
    agg = d.groupby("MONTH").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum"}).reset_index()
    result = []
    for _, row in agg.iterrows():
        result.append({
            "month": int(row["MONTH"]),
            "retail_sales": round(row["RETAIL_SALES"], 2),
            "warehouse_sales": round(row["WAREHOUSE_SALES"], 2)
        })
    return sorted(result, key=lambda x: x["month"])

@app.get("/api/sales/by-type")
def get_sales_by_type(month: Optional[int] = Query(None), supplier: Optional[str] = Query(None), year: Optional[int] = Query(None)):
    d = apply_filters(_df, month, None, supplier, year)
    agg = d.groupby("ITEM_TYPE").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum"}).reset_index()
    result = []
    for _, row in agg.iterrows():
        result.append({
            "item_type": row["ITEM_TYPE"],
            "retail_sales": round(row["RETAIL_SALES"], 2),
            "warehouse_sales": round(row["WAREHOUSE_SALES"], 2)
        })
    return sorted(result, key=lambda x: x["retail_sales"], reverse=True)

@app.get("/api/sales/by-supplier")
def get_sales_by_supplier(month: Optional[int] = Query(None), item_type: Optional[str] = Query(None), year: Optional[int] = Query(None), limit: int = 20):
    d = apply_filters(_df, month, item_type, None, year)
    agg = d.groupby("SUPPLIER").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum"}).reset_index()
    agg = agg.sort_values("RETAIL_SALES", ascending=False).head(limit)
    result = []
    for _, row in agg.iterrows():
        result.append({
            "supplier": row["SUPPLIER"],
            "retail_sales": round(row["RETAIL_SALES"], 2),
            "warehouse_sales": round(row["WAREHOUSE_SALES"], 2)
        })
    return result

@app.get("/api/products/top10")
def get_top10_products(month: Optional[int] = Query(None), item_type: Optional[str] = Query(None), supplier: Optional[str] = Query(None), year: Optional[int] = Query(None)):
    d = apply_filters(_df, month, item_type, supplier, year)
    agg = d.groupby("ITEM_DESCRIPTION").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum", "RETAIL_TRANSFERS": "sum"}).reset_index()
    agg = agg.sort_values("RETAIL_SALES", ascending=False).head(10)
    result = []
    for _, row in agg.iterrows():
        result.append({
            "item_description": row["ITEM_DESCRIPTION"],
            "retail_sales": round(row["RETAIL_SALES"], 2),
            "warehouse_sales": round(row["WAREHOUSE_SALES"], 2),
            "retail_transfers": round(row["RETAIL_TRANSFERS"], 2)
        })
    return result

@app.get("/api/suppliers")
def get_suppliers(page: int = 1, per_page: int = 20, search: Optional[str] = Query(None), sort_by: Optional[str] = Query("retail_sales"), sort_order: Optional[Literal["asc", "desc"]] = "desc", year: Optional[int] = Query(None)):
    # If year is specified, compute on the fly for that year
    if year is not None:
        d = _df[_df["YEAR"] == year].copy()
        supplier_agg = d.groupby("SUPPLIER").agg({
            "RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum", "RETAIL_TRANSFERS": "sum"
        }).reset_index()
        # declining flag
        jan = d[d["MONTH"] == 1].groupby("SUPPLIER").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum"}).reset_index()
        jan["total_jan"] = jan["RETAIL_SALES"] + jan["WAREHOUSE_SALES"]
        jul = d[d["MONTH"] == 7].groupby("SUPPLIER").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum"}).reset_index()
        jul["total_jul"] = jul["RETAIL_SALES"] + jul["WAREHOUSE_SALES"]
        supplier_agg = pd.merge(supplier_agg, jan[["SUPPLIER", "total_jan"]], on="SUPPLIER", how="left")
        supplier_agg = pd.merge(supplier_agg, jul[["SUPPLIER", "total_jul"]], on="SUPPLIER", how="left")
        supplier_agg["declining_flag"] = (
            (supplier_agg["total_jul"] < supplier_agg["total_jan"] * 0.9) &
            supplier_agg["total_jan"].notna() & supplier_agg["total_jul"].notna()
        )
        # best product
        best = d.groupby(["SUPPLIER", "ITEM_DESCRIPTION"])["RETAIL_SALES"].sum().reset_index()
        best = best.loc[best.groupby("SUPPLIER")["RETAIL_SALES"].idxmax()][["SUPPLIER", "ITEM_DESCRIPTION", "RETAIL_SALES"]]
        supplier_agg = pd.merge(supplier_agg, best.rename(columns={"ITEM_DESCRIPTION": "best_product", "RETAIL_SALES": "best_product_sales"}), on="SUPPLIER", how="left")
        supplier_agg["total_revenue"] = supplier_agg["RETAIL_SALES"] + supplier_agg["WAREHOUSE_SALES"]
        supplier_agg = supplier_agg.rename(columns={
            "RETAIL_SALES": "retail_sales",
            "WAREHOUSE_SALES": "warehouse_sales",
            "RETAIL_TRANSFERS": "retail_transfers"
        })
        df_work = supplier_agg
    else:
        df_work = _pre["supplier_decline"].copy()

    if search:
        df_work = df_work[df_work["SUPPLIER"].str.contains(search, case=False, na=False)]
    total = len(df_work)
    df_work = df_work.sort_values(sort_by, ascending=(sort_order == "asc"))
    df_work = df_work.iloc[(page-1)*per_page : page*per_page]
    result = []
    for _, row in df_work.iterrows():
        result.append({
            "supplier": row["SUPPLIER"],
            "retail_sales": round(row["retail_sales"], 2),
            "warehouse_sales": round(row["warehouse_sales"], 2),
            "retail_transfers": round(row["retail_transfers"], 2),
            "total_revenue": round(row["total_revenue"], 2),
            "best_product": row["best_product"] if pd.notna(row["best_product"]) else None,
            "best_product_sales": round(row["best_product_sales"], 2) if pd.notna(row["best_product_sales"]) else 0,
            "declining_flag": bool(row["declining_flag"]) if pd.notna(row["declining_flag"]) else False
        })
    return {"data": result, "total": total, "page": page, "per_page": per_page}

@app.get("/api/suppliers/{supplier_name}/products")
def get_supplier_products(supplier_name: str, year: Optional[int] = Query(None)):
    d = _df[_df["SUPPLIER"] == supplier_name]
    if year is not None:
        d = d[d["YEAR"] == year]
    if d.empty:
        raise HTTPException(status_code=404, detail="Supplier not found")
    agg = d.groupby("ITEM_DESCRIPTION").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum", "RETAIL_TRANSFERS": "sum"}).reset_index()
    agg = agg.sort_values("RETAIL_SALES", ascending=False)
    result = []
    for _, row in agg.iterrows():
        result.append({
            "item_description": row["ITEM_DESCRIPTION"],
            "retail_sales": round(row["RETAIL_SALES"], 2),
            "warehouse_sales": round(row["WAREHOUSE_SALES"], 2),
            "retail_transfers": round(row["RETAIL_TRANSFERS"], 2)
        })
    return result

@app.get("/api/categories")
def get_categories(year: Optional[int] = Query(None)):
    if year is not None:
        d = _df[_df["YEAR"] == year]
        cat_agg = d.groupby("ITEM_TYPE").agg({
            "RETAIL_SALES": ["sum", "count", "max"],
            "WAREHOUSE_SALES": "sum",
            "RETAIL_TRANSFERS": "sum"
        }).reset_index()
        cat_agg.columns = ["ITEM_TYPE", "retail_sales_sum", "transaction_count", "retail_sales_max", "warehouse_sales_sum", "retail_transfers_sum"]
        cat_agg["avg_price_proxy"] = cat_agg["retail_sales_sum"] / cat_agg["transaction_count"]
        pop = d.groupby(["ITEM_TYPE", "ITEM_DESCRIPTION"]).size().reset_index(name="count")
        pop = pop.loc[pop.groupby("ITEM_TYPE")["count"].idxmax()][["ITEM_TYPE", "ITEM_DESCRIPTION", "count"]]
        cat_agg = pd.merge(cat_agg, pop.rename(columns={"ITEM_DESCRIPTION": "most_popular", "count": "most_popular_count"}), on="ITEM_TYPE", how="left")
        exp = d.loc[d.groupby("ITEM_TYPE")["RETAIL_SALES"].idxmax()][["ITEM_TYPE", "ITEM_DESCRIPTION", "RETAIL_SALES"]]
        cat_agg = pd.merge(cat_agg, exp.rename(columns={"ITEM_DESCRIPTION": "most_expensive", "RETAIL_SALES": "most_expensive_value"}), on="ITEM_TYPE", how="left")
        df_out = cat_agg
    else:
        df_out = _pre["cat_agg"].copy()
    result = []
    for _, row in df_out.iterrows():
        result.append({
            "item_type": row["ITEM_TYPE"],
            "retail_sales": round(row["retail_sales_sum"], 2),
            "warehouse_sales": round(row["warehouse_sales_sum"], 2),
            "retail_transfers": round(row["retail_transfers_sum"], 2),
            "avg_price_proxy": round(row["avg_price_proxy"], 2),
            "most_expensive": row["most_expensive"],
            "most_expensive_value": round(row["most_expensive_value"], 2),
            "most_popular": row["most_popular"],
            "most_popular_count": int(row["most_popular_count"])
        })
    return result

@app.get("/api/categories/{type_name}/products")
def get_category_products(type_name: str, page: int = 1, per_page: int = 20, year: Optional[int] = Query(None)):
    d = _df[_df["ITEM_TYPE"] == type_name]
    if year is not None:
        d = d[d["YEAR"] == year]
    if d.empty:
        raise HTTPException(status_code=404, detail="Category not found")
    agg = d.groupby("ITEM_DESCRIPTION").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum", "RETAIL_TRANSFERS": "sum", "ITEM_CODE": "first"}).reset_index()
    agg = agg.sort_values("RETAIL_SALES", ascending=False)
    total = len(agg)
    agg = agg.iloc[(page-1)*per_page : page*per_page]
    result = []
    for _, row in agg.iterrows():
        result.append({
            "item_code": str(row["ITEM_CODE"]) if pd.notna(row["ITEM_CODE"]) else "",
            "item_description": row["ITEM_DESCRIPTION"],
            "retail_sales": round(row["RETAIL_SALES"], 2),
            "warehouse_sales": round(row["WAREHOUSE_SALES"], 2),
            "retail_transfers": round(row["RETAIL_TRANSFERS"], 2)
        })
    return {"data": result, "total": total, "page": page, "per_page": per_page}

@app.get("/api/channel-mix")
def get_channel_mix(month: Optional[int] = Query(None), classification: Optional[str] = Query(None), high_transfer_only: bool = Query(False), limit: int = Query(500), year: Optional[int] = Query(None)):
    d = _df.copy()
    if year is not None:
        d = d[d["YEAR"] == year]
    if month is not None:
        d = d[d["MONTH"] == month]
    agg = d.groupby("ITEM_DESCRIPTION").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum", "RETAIL_TRANSFERS": "sum"}).reset_index()
    agg["total_sales"] = agg["RETAIL_SALES"] + agg["WAREHOUSE_SALES"]
    agg["retail_share"] = agg["RETAIL_SALES"] / agg["total_sales"].replace(0, np.nan)
    agg["retail_share"] = agg["retail_share"].fillna(0)
    agg["classification"] = agg["retail_share"].apply(
        lambda x: "Retail-Heavy" if x > 0.7 else ("Warehouse-Heavy" if x < 0.3 else "Balanced")
    )
    transfer_75th = _pre["transfer_75th"]  # global quantile for consistency
    agg["high_transfer"] = agg["RETAIL_TRANSFERS"] > transfer_75th
    if classification:
        agg = agg[agg["classification"] == classification]
    if high_transfer_only:
        agg = agg[agg["high_transfer"]]
    agg = agg.sort_values("total_sales", ascending=False).head(limit)
    result = []
    for _, row in agg.iterrows():
        result.append({
            "item_description": row["ITEM_DESCRIPTION"],
            "retail_sales": round(row["RETAIL_SALES"], 2),
            "warehouse_sales": round(row["WAREHOUSE_SALES"], 2),
            "retail_transfers": round(row["RETAIL_TRANSFERS"], 2),
            "retail_share": round(row["retail_share"], 4),
            "classification": row["classification"],
            "high_transfer": bool(row["high_transfer"])
        })
    return result

@app.get("/api/forecast")
def get_forecast(item_type: Optional[str] = Query(None), year: Optional[int] = Query(None)):
    # Default to latest year
    if year is None:
        year = int(_df["YEAR"].max())
    warnings.filterwarnings("ignore", category=ConvergenceWarning)
    d = _df[_df["YEAR"] == year].copy()
    if item_type:
        d = d[d["ITEM_TYPE"] == item_type]
    monthly = d.groupby("MONTH").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum"}).reset_index()
    monthly["total_sales"] = monthly["RETAIL_SALES"] + monthly["WAREHOUSE_SALES"]
    # Ensure all months 1-12 exist
    full = pd.DataFrame({"MONTH": range(1, 13)})
    monthly = full.merge(monthly, on="MONTH", how="left")
    monthly["total_sales"] = monthly["total_sales"].fillna(0).round(2)
    monthly = monthly.sort_values("MONTH")
    ts = monthly["total_sales"].values
    if len(ts) < 4:
        return {"historical": [], "interpolated": [], "mae": None}

    try:
        model = ExponentialSmoothing(ts, trend="add", seasonal=None)
        fit = model.fit(maxiter=1000)
        forecast_vals = fit.forecast(3)
        residuals = fit.resid
        std = np.std(residuals)
        yhat_lower = forecast_vals - 1.28 * std
        yhat_upper = forecast_vals + 1.28 * std
        yhat_lower2 = forecast_vals - 1.96 * std
        yhat_upper2 = forecast_vals + 1.96 * std
        mae = np.mean(np.abs(residuals))
    except Exception:
        x = np.arange(len(ts))
        coeffs = np.polyfit(x, ts, 1)
        forecast_vals = np.polyval(coeffs, np.arange(len(ts), len(ts)+3))
        std = np.std(ts - np.polyval(coeffs, x))
        yhat_lower = forecast_vals - 1.28 * std
        yhat_upper = forecast_vals + 1.28 * std
        yhat_lower2 = forecast_vals - 1.96 * std
        yhat_upper2 = forecast_vals + 1.96 * std
        mae = np.mean(np.abs(ts - np.polyval(coeffs, x)))

    historical = []
    for _, row in monthly.iterrows():
        historical.append({
            "month": int(row["MONTH"]),
            "total_sales": round(row["total_sales"], 2),
            "type": "historical"
        })

    forecast_result = []
    for i, m in enumerate([10, 11, 12]):
        forecast_result.append({
            "month": m,
            "total_sales": round(forecast_vals[i], 2),
            "type": "forecast",
            "yhat_lower": round(max(0, yhat_lower[i]), 2),
            "yhat_upper": round(yhat_upper[i], 2),
            "yhat_lower_95": round(max(0, yhat_lower2[i]), 2),
            "yhat_upper_95": round(yhat_upper2[i], 2)
        })

    return {
        "historical": historical + forecast_result,
        "interpolated": [],
        "mae": round(mae, 2)
    }

@app.get("/api/forecast/download")
def download_forecast(item_type: Optional[str] = Query(None), year: Optional[int] = Query(None)):
    data = get_forecast(item_type, year)
    rows = []
    for h in data["historical"]:
        rows.append({
            "month": h["month"],
            "total_sales": h["total_sales"],
            "type": h["type"],
            "yhat_lower": h.get("yhat_lower", ""),
            "yhat_upper": h.get("yhat_upper", "")
        })
    df_out = pd.DataFrame(rows)
    stream = io.StringIO()
    df_out.to_csv(stream, index=False)
    stream.seek(0)
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=forecast.csv"})

@app.get("/api/products/suggest")
def product_suggest(q: str = Query(..., min_length=1)):
    d = _df[_df["ITEM_DESCRIPTION"].str.contains(q, case=False, na=False)]
    suggestions = d["ITEM_DESCRIPTION"].value_counts().head(10).index.tolist()
    return [{"name": s} for s in suggestions]

@app.get("/api/products/{item_code}")
def get_product(item_code: str, year: Optional[int] = Query(None)):
    d = _df[_df["ITEM_CODE"].astype(str) == item_code]
    if year is not None:
        d = d[d["YEAR"] == year]
    if d.empty:
        raise HTTPException(status_code=404, detail="Product not found")
    agg = d.groupby("MONTH").agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum", "RETAIL_TRANSFERS": "sum"}).reset_index().sort_values("MONTH")
    months_breakdown = []
    for _, row in agg.iterrows():
        months_breakdown.append({
            "month": int(row["MONTH"]),
            "retail_sales": round(row["RETAIL_SALES"], 2),
            "warehouse_sales": round(row["WAREHOUSE_SALES"], 2),
            "retail_transfers": round(row["RETAIL_TRANSFERS"], 2)
        })
    product_info = d.iloc[0]
    return {
        "item_code": str(product_info["ITEM_CODE"]),
        "item_description": product_info["ITEM_DESCRIPTION"],
        "item_type": product_info["ITEM_TYPE"],
        "supplier": product_info["SUPPLIER"],
        "months_breakdown": months_breakdown
    }

@app.get("/api/products")
def list_products(q: Optional[str] = Query(None), item_type: Optional[str] = Query(None), supplier: Optional[str] = Query(None), page: int = 1, per_page: int = 20, sort: Optional[str] = Query("retail_sales"), order: Optional[Literal["asc", "desc"]] = "desc", year: Optional[int] = Query(None)):
    d = _df.copy()
    if year is not None:
        d = d[d["YEAR"] == year]
    if q:
        d = d[d["ITEM_DESCRIPTION"].str.contains(q, case=False, na=False)]
    if item_type:
        d = d[d["ITEM_TYPE"] == item_type]
    if supplier:
        d = d[d["SUPPLIER"].str.contains(supplier, case=False, na=False)]
    agg = d.groupby(["ITEM_CODE", "ITEM_DESCRIPTION", "ITEM_TYPE", "SUPPLIER"]).agg({"RETAIL_SALES": "sum", "WAREHOUSE_SALES": "sum", "RETAIL_TRANSFERS": "sum"}).reset_index()
    agg = agg.rename(columns={"RETAIL_SALES": "retail_sales", "WAREHOUSE_SALES": "warehouse_sales", "RETAIL_TRANSFERS": "retail_transfers"})
    agg = agg.sort_values(sort, ascending=(order == "asc"))
    total = len(agg)
    agg = agg.iloc[(page-1)*per_page : page*per_page]
    result = []
    for _, row in agg.iterrows():
        result.append({
            "item_code": str(row["ITEM_CODE"]),
            "item_description": row["ITEM_DESCRIPTION"],
            "item_type": row["ITEM_TYPE"],
            "supplier": row["SUPPLIER"],
            "retail_sales": round(row["retail_sales"], 2),
            "warehouse_sales": round(row["warehouse_sales"], 2),
            "retail_transfers": round(row["retail_transfers"], 2)
        })
    return {"data": result, "total": total, "page": page, "per_page": per_page}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)