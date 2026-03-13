import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  Send, Database, LayoutDashboard, MessageSquare, 
  Upload, Loader2, AlertCircle, TrendingUp, Info
} from 'lucide-react';

// --- Constants & Config ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * UPDATED MODEL STRATEGY:
 * The preview environment is strictly tuned to specific versions.
 * We prioritize the 2.5-flash-preview then fallback to stable 1.5 versions.
 */
const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b"
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function App() {
  // --- State ---
  const [csvData, setCsvData] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [query, setQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [activeModel, setActiveModel] = useState(MODELS[0]);
  
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- CSV Handling ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const rows = text.split('\n').filter(row => row.trim() !== '');
        if (rows.length < 2) throw new Error("CSV is empty or lacks data.");

        const headers = rows[0].split(',').map(h => h.trim());
        const data = rows.slice(1).map(row => {
          const values = row.split(',');
          const obj = {};
          headers.forEach((h, i) => {
            const val = values[i]?.trim();
            obj[h] = isNaN(val) || val === "" ? val : parseFloat(val);
          });
          return obj;
        });

        setCsvData(data);
        setHeaders(headers);
        setMessages([{
          role: 'system',
          content: `Successfully loaded data with ${data.length} records and ${headers.length} columns.`
        }]);
        setError(null);
      } catch (err) {
        setError("Error parsing CSV. Please check formatting.");
      }
    };
    reader.readAsText(file);
  };

  /**
   * API CALL WITH RECURSIVE MODEL FALLBACK
   * This ensures that if gemini-2.5 isn't found, it tries 1.5-flash, etc.
   */
  const callGemini = async (prompt, modelIndex = 0, retryCount = 0) => {
    const currentModel = MODELS[modelIndex];
    setActiveModel(currentModel);
    
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                summary: { type: "STRING" },
                insights: { type: "ARRAY", items: { type: "STRING" } },
                charts: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      type: { type: "STRING", enum: ["bar", "line", "pie", "area"] },
                      title: { type: "STRING" },
                      xAxisKey: { type: "STRING" },
                      yAxisKey: { type: "STRING" },
                      description: { type: "STRING" }
                    },
                    required: ["type", "title", "xAxisKey", "yAxisKey"]
                  }
                }
              },
              required: ["title", "summary", "charts"]
            }
          }
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle "Model Not Found" (404) or "Invalid Request" (400) by switching models
        if ((response.status === 404 || response.status === 400) && modelIndex < MODELS.length - 1) {
          return callGemini(prompt, modelIndex + 1, 0);
        }

        // Handle Quota/Rate Limit (429) or Server Errors with backoff
        if ((response.status === 429 || response.status >= 500) && retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          return callGemini(prompt, modelIndex, retryCount + 1);
        }
        
        throw new Error(result.error?.message || `API Error: ${response.status}`);
      }

      const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("API returned an empty response.");
      
      return JSON.parse(content);
    } catch (err) {
      // Catch specific "not found" errors in the message string
      if (modelIndex < MODELS.length - 1 && (err.message.includes("not found") || err.message.includes("not supported"))) {
        return callGemini(prompt, modelIndex + 1, 0);
      }
      throw err;
    }
  };

  // --- Logic Handler ---
  const handleQuery = async (e) => {
    e.preventDefault();
    if (!query.trim() || !csvData) return;

    const userQuery = query;
    setQuery("");
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setIsProcessing(true);
    setError(null);

    const sampleData = JSON.stringify(csvData.slice(0, 3));
    const systemPrompt = `
      You are an expert Data Analyst. Given a CSV dataset schema and a user query, generate a structured BI dashboard.
      Dataset Schema: [${headers.join(', ')}]
      Sample Data: ${sampleData}

      User Query: "${userQuery}"

      Instructions:
      1. Select 1 to 3 charts (bar, line, pie, area).
      2. Ensure xAxisKey and yAxisKey exactly match the provided schema.
      3. Provide 2-3 key insights.
    `;

    try {
      const dashboardConfig = await callGemini(systemPrompt);
      setDashboard(dashboardConfig);
      setMessages(prev => [...prev, { role: 'assistant', content: dashboardConfig.summary }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderChart = (chart, index) => {
    const ChartComponent = {
      bar: BarChart,
      line: LineChart,
      pie: PieChart,
      area: AreaChart
    }[chart.type] || BarChart;

    return (
      <div key={index} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">{chart.title}</h3>
          <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-500 rounded uppercase tracking-tighter">
            {chart.type}
          </span>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent data={csvData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={chart.xAxisKey} fontSize={12} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Legend verticalAlign="top" align="right" />
              
              {chart.type === 'pie' ? (
                <Pie data={csvData} dataKey={chart.yAxisKey} nameKey={chart.xAxisKey} outerRadius={100} label>
                  {csvData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              ) : (
                chart.type === 'area' ? <Area type="monotone" dataKey={chart.yAxisKey} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} /> :
                chart.type === 'line' ? <Line type="monotone" dataKey={chart.yAxisKey} stroke="#3b82f6" strokeWidth={2} /> :
                <Bar dataKey={chart.yAxisKey} fill="#3b82f6" radius={[4, 4, 0, 0]} />
              )}
            </ChartComponent>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <aside className="w-[360px] border-r border-slate-200 bg-white flex flex-col shadow-lg z-10">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <div className="bg-blue-600 p-2 rounded-lg"><LayoutDashboard className="text-white w-5 h-5" /></div>
            <h1 className="text-lg font-bold">Instant BI</h1>
          </div>

          <button onClick={() => fileInputRef.current.click()} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium mb-4">
            <Upload size={18} /> {csvData ? "Change Dataset" : "Upload CSV Data"}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-slate-100 p-3 rounded-2xl animate-pulse flex items-center gap-2 border border-slate-200">
                <Loader2 className="animate-spin text-blue-500" size={16} />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Thinking...</span>
                  <span className="text-[9px] text-slate-400 font-mono italic">{activeModel}</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 bg-white border-t">
          <form onSubmit={handleQuery} className="relative">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={csvData ? "Ask about your data..." : "Upload CSV first"} disabled={!csvData || isProcessing} className="w-full bg-slate-100 border-none rounded-2xl pl-4 pr-12 py-3 focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50" />
            <button type="submit" disabled={!query.trim() || isProcessing} className="absolute right-2 top-1.5 p-1.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-slate-300 transition-colors">
              <Send size={18} />
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#f8fafc]">
        {error && (
          <div className="m-8 bg-red-50 border border-red-100 text-red-700 p-5 rounded-2xl flex flex-col gap-2 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-2 font-bold"><AlertCircle size={20} /> Connection Error</div>
            <p className="text-sm opacity-80">{error}</p>
            <div className="mt-2 text-[10px] uppercase font-bold text-red-400 tracking-widest border-t border-red-100 pt-2">All fallback models exhausted. Check API quota or networking.</div>
          </div>
        )}
        
        {!dashboard ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6 border border-slate-100"><LayoutDashboard className="text-blue-600" size={32} /></div>
            <h2 className="text-2xl font-bold mb-2">Ready for Insights</h2>
            <p className="text-slate-500">Upload your data and ask questions like "Show me the distribution of sales" or "What are the top 5 regions?"</p>
          </div>
        ) : (
          <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI Generated Insight</span>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{dashboard.title}</h2>
              <p className="text-slate-500 mt-2 max-w-3xl leading-relaxed">{dashboard.summary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {dashboard.insights?.map((insight, idx) => (
                <div key={idx} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex gap-4 hover:shadow-md transition-shadow">
                  <div className="bg-blue-50 h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-blue-600"><TrendingUp size={20} /></div>
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>

            <div className={`grid grid-cols-1 ${dashboard.charts.length > 1 ? 'lg:grid-cols-2' : ''} gap-8 pb-12`}>
              {dashboard.charts.map((chart, index) => renderChart(chart, index))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}