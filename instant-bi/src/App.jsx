import React, { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from "recharts";

import {
  Send, Database, LayoutDashboard,
  Upload, Loader2, AlertCircle, TrendingUp, Info, Download
} from "lucide-react";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

/* ---------------- MODELS ---------------- */

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];

export default function App() {

  const [csvData,setCsvData] = useState(null);
  const [headers,setHeaders] = useState([]);
  const [query,setQuery] = useState("");
  const [isProcessing,setIsProcessing] = useState(false);
  const [dashboard,setDashboard] = useState(null);
  const [messages,setMessages] = useState([]);
  const [error,setError] = useState(null);
  const [activeModel,setActiveModel] = useState(MODELS[0]);

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(()=>{
    chatEndRef.current?.scrollIntoView({behavior:"smooth"});
  },[messages]);

/* ---------------- CSV PARSER ---------------- */

const handleFileUpload = (e)=>{

  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();

  reader.onload = (event)=>{

    try{

      const text = event.target.result;

      const rows = text.split("\n").filter(r=>r.trim() !== "");

      if(rows.length < 2) throw new Error("CSV empty");

      const headers = rows[0].split(",").map(h=>h.trim());

      const data = rows.slice(1).map(row=>{

        const values = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

        const obj = {};

        headers.forEach((h,i)=>{
          const val = values[i]?.trim();
          obj[h] = isNaN(val) || val==="" ? val : parseFloat(val);
        });

        return obj;

      });

      setCsvData(data);
      setHeaders(headers);

      setMessages([
        {
          role:"system",
          content:`Dataset loaded: ${data.length} rows • ${headers.length} columns`
        }
      ]);

      setDashboard(null);
      setError(null);

    }
    catch(err){
      setError("CSV parsing failed.");
    }

  };

  reader.readAsText(file);
};


/* ---------------- GEMINI CALL ---------------- */

const callGemini = async(prompt,modelIndex=0,retry=0)=>{

  const model = MODELS[modelIndex];
  setActiveModel(model);

  const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try{

    const response = await fetch(API_URL,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },

      body:JSON.stringify({

        contents:[
          {
            parts:[{text:prompt}]
          }
        ],

        generationConfig:{

          responseMimeType:"application/json",

          responseSchema:{
            type:"object",

            properties:{

              title:{type:"string"},

              summary:{type:"string"},

              insights:{
                type:"array",
                items:{type:"string"}
              },

              charts:{
                type:"array",
                items:{
                  type:"object",

                  properties:{
                    type:{
                      type:"string",
                      enum:["bar","line","pie","area"]
                    },

                    title:{type:"string"},

                    xAxisKey:{type:"string"},

                    yAxisKey:{type:"string"},

                    description:{type:"string"}
                  },

                  required:["type","title","xAxisKey","yAxisKey"]
                }
              }

            },

            required:["title","summary","charts"]
          }

        }

      })

    });

    const result = await response.json();

    if(!response.ok){

      if(modelIndex < MODELS.length-1){
        return callGemini(prompt,modelIndex+1,0);
      }

      if(retry < 3){
        await new Promise(r=>setTimeout(r,1000*(retry+1)));
        return callGemini(prompt,modelIndex,retry+1);
      }

      throw new Error(result.error?.message || "Gemini API error");

    }

    const text =
      result.candidates?.[0]?.content?.parts?.[0]?.text;

    if(!text) throw new Error("Empty response");

    return JSON.parse(text);

  }
  catch(err){

    if(modelIndex < MODELS.length-1){
      return callGemini(prompt,modelIndex+1,0);
    }

    throw err;

  }

};


/* ---------------- USER QUERY ---------------- */

const handleQuery = async(e)=>{

  e.preventDefault();

  if(!query.trim() || !csvData) return;

  const userQuery = query;

  setQuery("");

  setMessages(prev=>[
    ...prev,
    {role:"user",content:userQuery}
  ]);

  setIsProcessing(true);

  const sampleData =
    JSON.stringify(csvData.slice(0,5));

  const prompt = `

You are an expert data analyst.

Dataset columns:
${headers.join(", ")}

Sample data:
${sampleData}

User question:
${userQuery}

Create a BI dashboard.

Rules:
- Choose 1-4 charts
- Chart types: bar, line, pie, area
- Use dataset columns exactly
- Give 2-4 insights

`;

  try{

    const dash = await callGemini(prompt);

    setDashboard(dash);

    setMessages(prev=>[
      ...prev,
      {role:"assistant",content:dash.summary}
    ]);

  }
  catch(err){
    setError(err.message);
  }

  setIsProcessing(false);

};


/* ---------------- CHART RENDER ---------------- */

const renderChart = (chart,index)=>{

  const ChartComponent={
    bar:BarChart,
    line:LineChart,
    pie:PieChart,
    area:AreaChart
  }[chart.type] || BarChart;

  const isPie = chart.type==="pie";

  return(

    <div key={index}
    className="bg-white p-6 rounded-2xl border shadow-sm h-[420px]">

      <h3 className="font-bold mb-4">{chart.title}</h3>

      <ResponsiveContainer width="100%" height="100%">

        <ChartComponent data={csvData}>

          <CartesianGrid strokeDasharray="3 3"/>

          {!isPie && (
            <>
            <XAxis dataKey={chart.xAxisKey}/>
            <YAxis/>
            </>
          )}

          <Tooltip/>
          <Legend/>

          {chart.type==="bar" &&
            <Bar dataKey={chart.yAxisKey} fill="#3b82f6"/>
          }

          {chart.type==="line" &&
            <Line dataKey={chart.yAxisKey} stroke="#3b82f6"/>
          }

          {chart.type==="area" &&
            <Area dataKey={chart.yAxisKey} stroke="#3b82f6" fill="#3b82f6"/>
          }

          {chart.type==="pie" &&
            <Pie
              data={csvData}
              dataKey={chart.yAxisKey}
              nameKey={chart.xAxisKey}
              outerRadius={100}
            >
            {csvData.map((_,i)=>(
              <Cell key={i} fill={COLORS[i % COLORS.length]}/>
            ))}
            </Pie>
          }

        </ChartComponent>

      </ResponsiveContainer>

    </div>

  );

};


/* ---------------- UI ---------------- */

return(

<div className="flex h-screen">

{/* SIDEBAR */}

<aside className="w-96 border-r flex flex-col bg-white">

<div className="p-6">

<h1 className="text-xl font-bold mb-6">
Instant BI
</h1>

<button
onClick={()=>fileInputRef.current.click()}
className="border-dashed border p-6 w-full rounded-xl"
>
Upload CSV
</button>

<input
type="file"
ref={fileInputRef}
onChange={handleFileUpload}
accept=".csv"
className="hidden"
/>

</div>


<div className="flex-1 overflow-auto p-4 space-y-4">

{messages.map((m,i)=>(
<div key={i}
className={m.role==="user"?"text-right":""}
>
<div className="inline-block bg-gray-100 p-3 rounded-lg text-sm">
{m.content}
</div>
</div>
))}

{isProcessing && (
<div className="flex gap-2 items-center text-sm">
<Loader2 className="animate-spin"/>
Analyzing with {activeModel}
</div>
)}

<div ref={chatEndRef}/>

</div>


<form
onSubmit={handleQuery}
className="p-4 border-t flex gap-2"
>

<input
value={query}
onChange={e=>setQuery(e.target.value)}
placeholder="Ask about your data"
className="flex-1 border rounded-lg p-2"
/>

<button className="bg-blue-600 text-white px-4 rounded-lg">
<Send size={16}/>
</button>

</form>

</aside>


{/* MAIN DASHBOARD */}

<main className="flex-1 overflow-auto p-10">

{error && (
<div className="bg-red-100 text-red-700 p-4 rounded mb-6">
{error}
</div>
)}

{!dashboard ? (

<div className="text-center mt-40 text-gray-500">
Upload a dataset and ask questions
</div>

) : (

<div className="space-y-10">

<h2 className="text-3xl font-bold">
{dashboard.title}
</h2>

<p className="text-gray-600">
{dashboard.summary}
</p>

<div className="grid md:grid-cols-2 gap-8">

{dashboard.charts.map(renderChart)}

</div>

<div className="grid md:grid-cols-3 gap-6">

{dashboard.insights?.map((i,idx)=>(
<div key={idx}
className="bg-white border p-6 rounded-xl shadow-sm">
<TrendingUp className="mb-2 text-blue-500"/>
{i}
</div>
))}

</div>

</div>

)}

</main>

</div>

);

}