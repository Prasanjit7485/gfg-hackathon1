import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  Send, Database, LayoutDashboard, MessageSquare, 
  Upload, Loader2, AlertCircle, TrendingUp, Info
} from 'lucide-react';

// --- CONFIGURATION ---
// Replace the empty string below with your Google Gemini API Key from: 
// https://aistudio.google.com/
const apiKey = ""; 

const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function App() {
  const [csvData, setCsvData] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [query, setQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
          content: `Data loaded! Source has ${data.length} records and ${headers.length} columns.`
        }]);
        setError(null);
      } catch (err) {
        setError("Error parsing CSV. Please check formatting.");
      }
    };
    reader.readAsText(file);
  };

  const callGemini = async (prompt, retryCount = 0) => {
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

    if (!response.ok) {
      if (response.status === 429 && retryCount < 5) {
        await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 1000));
        return callGemini(prompt, retryCount + 1);
      }
      throw new Error("Failed to connect to Gemini API.");
    }

    const result = await response.json();
    return JSON.parse(result.candidates[0].content.parts[0].text);
  };

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!query.trim() || !csvData) return;

    const userQuery = query;
    setQuery("");
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setIsProcessing(true);
    setError(null);

    const systemPrompt = `
      Act as a Data Analyst. Schema: [${headers.join(', ')}]. 
      Sample: ${JSON.stringify(csvData.slice(0, 3))}.
      Query: "${userQuery}".
      Generate a BI dashboard. Ensure xAxisKey and yAxisKey match schema EXACTLY.
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
    const ChartComponent = { bar: BarChart, line: LineChart, pie: PieChart, area: AreaChart }[chart.type];

    return (
      <div key={index} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
        <h3 className="font-bold text-slate-800 mb-4">{chart.title}</h3>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent data={csvData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={chart.xAxisKey} fontSize={11} tick={{fill: '#64748b'}} />
              <YAxis fontSize={11} tick={{fill: '#64748b'}} />
              <Tooltip />
              <Legend verticalAlign="top" />
              {chart.type === 'pie' ? (
                <Pie data={csvData} dataKey={chart.yAxisKey} nameKey={chart.xAxisKey} outerRadius={80} label>
                  {csvData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              ) : (
                chart.type === 'bar' ? <Bar dataKey={chart.yAxisKey} fill="#3b82f6" radius={[4, 4, 0, 0]} /> :
                chart.type === 'line' ? <Line type="monotone" dataKey={chart.yAxisKey} stroke="#3b82f6" strokeWidth={2} /> :
                <Area type="monotone" dataKey={chart.yAxisKey} fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.2} />
              )}
            </ChartComponent>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <aside className="w-80 md:w-96 bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2 mb-6">
            <LayoutDashboard className="text-blue-600" />
            <h1 className="font-bold text-xl">Instant BI</h1>
          </div>
          <button onClick={() => fileInputRef.current.click()} className="w-full bg-slate-900 text-white py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors">
            <Upload size={18} /> {csvData ? "Switch Data" : "Upload CSV"}
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] p-3 rounded-xl text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t">
          <form onSubmit={handleQuery} className="relative">
            <input 
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder={csvData ? "Ask about your data..." : "Upload data first"}
              disabled={!csvData || isProcessing}
              className="w-full bg-slate-100 border-none rounded-xl py-2 pl-4 pr-10 focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" disabled={!query.trim() || isProcessing} className="absolute right-2 top-1 text-blue-600 disabled:text-slate-300">
              {isProcessing ? <Loader2 className="animate-spin" /> : <Send />}
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        {error && <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-2"><AlertCircle size={20}/> {error}</div>}
        
        {dashboard ? (
          <div className="animate-fade-in space-y-8">
            <div>
              <h2 className="text-3xl font-black text-slate-900">{dashboard.title}</h2>
              <p className="text-slate-500 mt-2">{dashboard.summary}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dashboard.insights?.map((insight, i) => (
                <div key={i} className="bg-white p-4 rounded-xl border shadow-sm flex gap-3">
                  <TrendingUp className="text-blue-500 shrink-0" size={18} />
                  <p className="text-xs font-medium text-slate-600">{insight}</p>
                </div>
              ))}
            </div>
            <div className={`grid grid-cols-1 ${dashboard.charts.length > 1 ? 'lg:grid-cols-2' : ''} gap-6`}>
              {dashboard.charts.map((c, i) => renderChart(c, i))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <LayoutDashboard size={64} />
            <p className="mt-4">Upload data and ask a question to start.</p>
          </div>
        )}
      </main>
    </div>
  );
}