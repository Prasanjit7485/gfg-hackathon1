# InstantBI 📊

> AI-powered conversational BI — ask any question about your data and get instant interactive dashboards.

---

## What is InstantBI?

InstantBI lets you upload a CSV or Excel file, ask business questions in plain English, and instantly get:
- Auto-generated SQL queries
- Interactive charts (bar, line, pie, area)
- Key insights and data summaries
- Raw results table

No SQL knowledge needed. No manual chart setup. Just upload and ask.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Recharts + Lucide |
| Backend | FastAPI + Python |
| AI | Google Gemini (gemini-2.5-flash) |
| Database | SQLite (auto-created from your file) |
| File Support | CSV, XLSX, XLS |

---

## Project Structure

```
instant-bi/
│
├── BACKEND/
│   ├── main.py              # FastAPI app — all API routes
│   ├── csv_to_sqlite.py     # Converts CSV/Excel → SQLite
│   ├── .env                 # Your API keys (never commit this)
│   └── requirements.txt     # Python dependencies
│
├── FRONTEND/
│   ├── src/
│   │   ├── App.jsx          # Main React app
│   │   └── main.jsx         # Vite entry point
│   ├── .env                 # Frontend env vars
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- A Google Gemini API key → [Get one here](https://aistudio.google.com/app/apikey)

---

### 1. Clone the repo

```bash
git clone https://github.com/your-username/instant-bi.git
cd instant-bi
```

---

### 2. Setup the Backend

```bash
cd BACKEND

# Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# Mac/Linux
source .venv/bin/activate

# Install dependencies
pip install fastapi uvicorn python-dotenv google-genai pandas openpyxl
```

Create your `.env` file in the `BACKEND` folder:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
```

Start the backend:

```bash
python -m uvicorn main:app --reload
```

Backend runs at → **http://localhost:8000**
Swagger docs at → **http://localhost:8000/docs**

---

### 3. Setup the Frontend

Open a **new terminal**:

```bash
cd FRONTEND

# Install dependencies
npm install

# Install required libraries
npm install recharts lucide-react
```

Create your `.env` file in the `FRONTEND` folder:

```env
VITE_API_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

Frontend runs at → **http://localhost:5173**

---

## How It Works

```
User uploads CSV/Excel
        ↓
Backend converts it to SQLite database
        ↓
User asks a question in plain English
        ↓
Gemini generates a SQL query
        ↓
SQL runs against the SQLite database
        ↓
Gemini generates dashboard config (charts + insights)
        ↓
Frontend renders interactive charts + results table
```

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/upload` | Upload CSV or Excel file |
| `POST` | `/query` | Ask a question, get SQL + dashboard |

### POST /upload

```json
// Request: multipart/form-data
{ "file": "<your CSV or Excel file>" }

// Response
{
  "file_id": "abc123",
  "filename": "sales.csv",
  "row_count": 1500,
  "columns": ["Region", "Revenue", "Product"],
  "cached": false
}
```

### POST /query

```json
// Request
{
  "file_id": "abc123",
  "question": "Show total revenue by region"
}

// Response
{
  "question": "Show total revenue by region",
  "sql": "SELECT region, SUM(revenue) FROM sales GROUP BY region",
  "columns": ["region", "revenue"],
  "row_count": 5,
  "results": [{ "region": "North", "revenue": 42000 }],
  "dashboard": {
    "title": "Revenue by Region",
    "summary": "North leads with $42K in total revenue.",
    "insights": ["North region contributes 35% of total revenue"],
    "charts": [{ "type": "bar", "xAxisKey": "region", "yAxisKey": "revenue" }]
  }
}
```

---

## Environment Variables

### Backend — `BACKEND/.env`

| Variable | Description |
|---|---|
| `GOOGLE_API_KEY` | Your Gemini API key from Google AI Studio |

### Frontend — `FRONTEND/.env`

| Variable | Description |
|---|---|
| `VITE_API_URL` | URL of your FastAPI backend (default: `http://localhost:8000`) |

---

## Common Errors

| Error | Fix |
|---|---|
| `API key not valid` | Check `BACKEND/.env` has a valid `GOOGLE_API_KEY` |
| `vite is not recognized` | Run `npm install` first |
| `uvicorn is not recognized` | Use `python -m uvicorn main:app --reload` |
| `file_id not found` | Upload the file again — server was restarted (in-memory store resets) |
| `SyntaxError in main.py` | Re-download `main.py` — stray character in file |
| CORS error in browser | Make sure backend is running and `VITE_API_URL` is correct |

---

## Security Notes

- **Never commit `.env` files** — add them to `.gitignore`
- The `GOOGLE_API_KEY` stays server-side only — the frontend never sees it
- In production, replace `allow_origins=["*"]` in `main.py` with your actual frontend domain

---

## .gitignore

Make sure your `.gitignore` includes:

```
# Environment files
BACKEND/.env
FRONTEND/.env

# Virtual environments
.venv/
venv/

# Python cache
__pycache__/
*.pyc

# Database files
*.db

# Node modules
node_modules/

# Vite build
dist/
```

---

## Built for

GFG Hackathon 2026 — by the InstantBI team.

---

## License

MIT
