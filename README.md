# Sales Performance Dashboard

An interactive dashboard for analysing warehouse and retail sales data using a Kaggle dataset.

## Tech Stack
- **Backend:** FastAPI, Pandas, Statsmodels
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Recharts

## Getting Started

1. Clone the repo.

2. Place the `Warehouse_and_Retail_Sales.csv` file inside the `backend/` folder (download from [https://www.kaggle.com/datasets/lalit7881/warehouse-and-retail-sales]).

3. Install backend dependencies:
  ```bash
  cd backend
  pip install -r requirements.txt
  ```

4. Start the API server
  ``` bash
  python main.py
  ```

5. Install frontend dependencies and start the dev server:
  ```bash
  npm install
  npm run dev
  ```

6. Open http://localhost:3000

### Features

KPI cards, monthly charts, category analysis

Supplier performance with decline flags

Channel mix scatter plot

Time‑series forecast with confidence intervals

Interactive product search and detail drawer

---