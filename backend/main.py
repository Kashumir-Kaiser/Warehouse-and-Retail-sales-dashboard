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

def _prepare_total_sales_series(item_type: Optional[str] = None) -> pd.Series:
    """
    Build a monthly series of total sales (retail + warehouse + transfers)
    from the first available month to the last available month.
    Returns a Series with a DateTimeIndex and explicit NaN for missing months.
    """
    df = _df.copy()
    if item_type:
        df = df[df["ITEM_TYPE"] == item_type]

    # Create a proper date column
    df["date"] = pd.to_datetime(
        df["YEAR"].astype(str) + "-" + df["MONTH"].astype(str) + "-01", errors="coerce"
    )
    df = df.dropna(subset=["date"])

    # Compute monthly total sales
    monthly = df.groupby("date").agg(
        retail_sales=("RETAIL_SALES", "sum"),
        warehouse_sales=("WAREHOUSE_SALES", "sum"),
        transfers=("RETAIL_TRANSFERS", "sum")
    ).reset_index()
    monthly["total_sales"] = (
        monthly["retail_sales"] + monthly["warehouse_sales"] + monthly["transfers"]
    )
    monthly = monthly.set_index("date").sort_index()

    # Create a continuous monthly range from the first to the last available date
    full_range = pd.date_range(
        start=monthly.index.min(), end=monthly.index.max(), freq="MS"
    )
    monthly = monthly.reindex(full_range)
    monthly.index.freq = 'MS'  # set frequency for time series operations
    return monthly["total_sales"]


def _build_baseline_forecasts(series: pd.Series, forecast_horizon: int = 24):
    """Seasonal naïve and moving average forecasts for validation."""
    results = {}

    # Seasonal naïve (repeat last 12 months)
    if len(series) >= 12:
        last_year = series.iloc[-12:]
        naive_forecast = pd.Series(
            np.tile(last_year.values, int(np.ceil(forecast_horizon / 12)))[:forecast_horizon],
            index=pd.date_range(start=series.index[-1] + pd.DateOffset(months=1), periods=forecast_horizon, freq="MS")
        )
        results["seasonal_naive"] = naive_forecast

    # Moving average (order 3)
    if len(series) >= 3:
        moving_avg = series.rolling(window=3).mean().iloc[-1]
        ma_forecast = pd.Series(
            np.repeat(moving_avg, forecast_horizon),
            index=pd.date_range(start=series.index[-1] + pd.DateOffset(months=1), periods=forecast_horizon, freq="MS")
        )
        results["moving_average"] = ma_forecast

    return results


def _evaluate_model(train_series, test_series, forecast_horizon):
    """Fit Holt-Winters on train and return forecast + error metrics."""
    clean_train = train_series.dropna()
    if len(clean_train) < 2:
        return None, None

    try:
        model = ExponentialSmoothing(
            clean_train,
            trend="add",
            seasonal="add",
            seasonal_periods=12,
            initialization_method="estimated",
            dates=clean_train.index,
        )
        res = model.fit(minimize_kwargs={'options': {'maxiter': 2000, 'disp': False}})
        forecast = res.forecast(forecast_horizon)
    except Exception:
        # Fallback to simple exponential smoothing
        model = ExponentialSmoothing(clean_train, trend="add", seasonal=None, dates=clean_train.index)
        res = model.fit(minimize_kwargs={'options': {'maxiter': 2000, 'disp': False}})
        forecast = res.forecast(forecast_horizon)

    # Build forecast index with explicit frequency
    forecast_index = pd.date_range(
        start=clean_train.index[-1] + pd.DateOffset(months=1),
        periods=forecast_horizon,
        freq="MS"
    )
    forecast = pd.Series(forecast, index=forecast_index)

    common_idx = forecast.index.intersection(test_series.dropna().index)
    if len(common_idx) == 0:
        return forecast, None

    actual = test_series.loc[common_idx]
    predicted = forecast.loc[common_idx]
    mae = np.mean(np.abs(actual - predicted))
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    return forecast, {"mae": mae, "rmse": rmse}


def _time_based_backtest(series, forecast_horizon=24, min_train_months=24):
    """
    Rolling‑origin validation. Train on increasing windows,
    forecast h steps, compare with actuals.
    Returns the best model (Holt‑Winters) and its metrics.
    """
    results = []
    series_clean = series.dropna()
    if len(series_clean) < min_train_months:
        return None, None

    # Define cut points: use the last 24 months as test set in a rolling manner
    cutoffs = range(min_train_months, len(series_clean), 3)  # every 3 months
    best_forecast = None
    best_metric = float("inf")

    for cutoff in cutoffs:
        train = series_clean.iloc[:cutoff]
        # The “test” period is the next forecast_horizon months (or all remaining)
        next_idx = series_clean.index[cutoff:cutoff + forecast_horizon]
        test = series_clean.loc[next_idx] if len(next_idx) > 0 else None
        if test is None or len(test) == 0:
            continue

        forecast, metrics = _evaluate_model(train, test, forecast_horizon)
        if metrics is not None:
            results.append(metrics)
            if metrics["mae"] < best_metric:
                best_metric = metrics["mae"]
                best_forecast = forecast

    # Average metrics across windows
    avg_metrics = {
        "mae": np.mean([r["mae"] for r in results]) if results else None,
        "rmse": np.mean([r["rmse"] for r in results]) if results else None,
    }
    return best_forecast, avg_metrics


def _produce_final_forecast(series, forecast_horizon=24):
    """
    Fits a Holt‑Winters model to the provided (NaN‑free) series.
    Returns:
      - fitted_results: the fitted model result object (for later prediction)
      - metrics: dict with 'std' and 'mae'
    """
    clean = series.dropna()
    if len(clean) < 12:
        # fallback to linear extrapolation
        x = np.arange(len(clean))
        coeffs = np.polyfit(x, clean.values, 1)
        fitted_vals = np.polyval(coeffs, x)
        std = np.std(clean.values - fitted_vals)
        mae = np.mean(np.abs(clean.values - fitted_vals))
        return None, {"std": std, "mae": mae, "coeffs": coeffs, "last_date": clean.index[-1]}

    try:
        model = ExponentialSmoothing(
            clean,
            trend="add",
            seasonal="add",
            seasonal_periods=12,
            initialization_method="estimated",
            dates=clean.index,
        )
        res = model.fit(minimize_kwargs={'options': {'maxiter': 2000, 'disp': False}})
    except Exception:
        model = ExponentialSmoothing(clean, trend="add", seasonal=None, dates=clean.index)
        res = model.fit(minimize_kwargs={'options': {'maxiter': 2000, 'disp': False}})

    residuals = clean - res.fittedvalues
    std = np.std(residuals) if len(residuals) > 1 else 0.0
    mae = np.mean(np.abs(residuals))
    return res, {"std": std, "mae": mae}

@app.get("/api/forecast")
def get_forecast(item_type: Optional[str] = Query(None)):
    # 1. Build raw monthly total sales (no zero‑filling)
    raw_series = _prepare_total_sales_series(item_type)

    # 2. Identify date range for the master axis
    first_date = raw_series.index[0]
    last_data_date = raw_series.dropna().index[-1]
    last_forecast_date = last_data_date + pd.DateOffset(months=24)

    # 3. Build master date array for the forecast line
    master_dates = pd.date_range(start=first_date, end=last_forecast_date, freq="MS")

    # 4. Training set: 2017–2019 only, interpolate to fill gaps
    train_series = raw_series["2017":"2019"].copy()
    if train_series.empty:
        # fallback to all available data
        train_series = raw_series.copy()
    train_series = train_series.interpolate(method="linear", limit_direction="both")
    # Remove any remaining NaN at edges
    train_series = train_series.fillna(method="bfill").fillna(method="ffill")

    # 5. Fit the model
    res, metrics = _produce_final_forecast(train_series)

    # 6. Generate continuous forecast line
    if res is None:
        # Fallback (linear trend) – not enough data for Holt‑Winters
        # We'll just extrapolate linearly over the master dates, using the last known trend.
        # This case is rare; kept for completeness.
        last_date = metrics["last_date"]
        offset = (master_dates - last_date).days / 30.0
        preds = metrics["coeffs"][0] * np.arrange(len(master_dates)) + metrics["coeffs"][1]
        forecast_series = pd.Series(preds, index=master_dates)
    else:
        # Use this model to predict for every month in master_dates
        forecast_series = res.predict(start=master_dates[0], end=master_dates[-1])
        # Ensure freq is set
        forecast_series.index.freq = "MS"

    # 7. Prepare response
    historical = []
    for dt in raw_series.index:
        val = raw_series[dt]
        historical.append({
            "date": dt.strftime("%Y-%m"),
            "month": dt.month,
            "year": dt.year,
            "total_sales": round(val, 2) if not pd.isna(val) else None,
            "type": "historical"
        })

    forecast_list = []
    for dt in master_dates:
        val = forecast_series.get(dt)
        total = round(val, 2) if val is not None and np.isfinite(val) else None
        lower = upper = None, None
        if total is not None and metrics and np.isfinite(metrics.get("std", 0)):
            s = metrics["std"]
            lower = max(0, val - 1.28 * s)
            upper = val + 1.28 * s
        forecast_list.append({
            "date": dt.strftime("%Y-%m"),
            "month": dt.month,
            "year": dt.year,
            "total_sales": total,
            "type": "forecast",
            "yhat_lower": round(lower, 2) if lower is not None else None,
            "yhat_upper": round(upper, 2) if upper is not None else None,
            "yhat_lower_95": None,   # not used for now
            "yhat_upper_95": None,
        })

    mae_value = round(metrics["mae"], 2) if metrics else None

    return {
        "historical": historical,
        "forecast": forecast_list,
        "mae": mae_value,
        "model": "Holt-Winters (additive)" if res is not None else "Linear fallback"
    }

@app.get("/api/forecast/download")
def download_forecast(item_type: Optional[str] = Query(None)):
    data = get_forecast(item_type)
    rows = []
    # export both historical and forecast
    for h in data["historical"]:
        rows.append({
            "date": h["date"],
            "total_sales": h["total_sales"],
            "type": h["type"],
            "yhat_lower": "",
            "yhat_upper": ""
        })
    for f in data["forecast"]:
        rows.append({
            "date": f["date"],
            "total_sales": f["total_sales"],
            "type": f["type"],
            "yhat_lower": f["yhat_lower"] if f["yhat_lower"] is not None else "",
            "yhat_upper": f["yhat_upper"] if f["yhat_upper"] is not None else ""
        })
    df_out = pd.DataFrame(rows)
    stream = io.StringIO()
    df_out.to_csv(stream, index=False)
    stream.seek(0)
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=forecast.csv"})

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