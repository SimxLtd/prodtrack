import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────
const SUPABASE_URL = "https://mdbziytahdeuegxlqggd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnppeXRhaGRldWVneGxxZ2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTI1MTIsImV4cCI6MjA5NTU2ODUxMn0.iPE2dckL4uVw-YewKxjd2IAq0Hii2-0QxDVQo52wH74";

// ─── SUPABASE ──────────────────────────────────────────────────
const sbH = () => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, "Content-Type":"application/json", Prefer:"return=representation" });
const sb = async (path, opts={}) => {
  const {headers:extraHeaders, ...restOpts} = opts;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...restOpts, headers:{...sbH(),...(extraHeaders||{})} });
  if (!res.ok) {
    const errText = await res.text();
    let errMsg = errText;
    try{ const j=JSON.parse(errText); errMsg=j.message||j.hint||j.details||errText; }catch{}
    throw new Error(errMsg);
  }
  if (res.status === 204) return [];
  const t = await res.text(); return t ? JSON.parse(t) : [];
};
const sbAll = async (table, query="") => {
  const PAGE=1000; let all=[], from=0;
  while(true){ const p=await sb(`${table}?${query?query+"&":""}limit=${PAGE}&offset=${from}`); all=all.concat(p); if(p.length<PAGE) break; from+=PAGE; }
  return all;
};
const db = {
  getUsers:       ()      => sbAll("pt_users","order=full_name.asc"),
  addUser:        (u)     => sb("pt_users",{method:"POST",body:JSON.stringify(u)}),
  updateUser:     (id,u)  => sb(`pt_users?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(u)}),
  loginUser:      (u,p)   => sb(`pt_users?username=eq.${encodeURIComponent(u)}&password=eq.${encodeURIComponent(p)}&active=eq.true`),
  getItems:       ()      => sbAll("pt_items","active=eq.true&order=id.asc"),
  addItem:        (i)     => sb("pt_items",{method:"POST",body:JSON.stringify(i)}),
  updateItem:     (id,i)  => sb(`pt_items?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(i)}),
  deleteItem:     (id)    => sb(`pt_items?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getEmployees:   ()      => sbAll("pt_employees","active=eq.true&order=name.asc"),
  addEmployee:    (e)     => sb("pt_employees",{method:"POST",body:JSON.stringify(e)}),
  deleteEmployee: (id)    => sb(`pt_employees?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getLines:       ()      => sbAll("pt_lines","active=eq.true&order=id.asc"),
  addLine:        (l)     => sb("pt_lines",{method:"POST",body:JSON.stringify(l)}),
  deleteLine:     (id)    => sb(`pt_lines?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getOrders:      ()      => sbAll("pt_orders","order=created_at.desc"),
  getMyOrders:    (emp)   => sbAll("pt_orders",`employee=ilike.*${encodeURIComponent(emp)}*&order=created_at.desc`),
  // ── Tiered loading for performance ──
  getActiveOrders: ()     => sbAll("pt_orders","status=eq.In Progress&order=created_at.desc"),
  getMonthOrders:  (fromISO,toISO) => sbAll("pt_orders",`start_datetime=gte.${fromISO}&start_datetime=lte.${toISO}&order=created_at.desc`),
  getYearSummary:  (fromISO,toISO) => sbAll("pt_orders",`start_datetime=gte.${fromISO}&start_datetime=lte.${toISO}&select=start_datetime,status,efficiency`),
  addOrder:       (o)     => sb("pt_orders",{method:"POST",body:JSON.stringify(o)}),
  updateOrder:    (id,o)  => sb(`pt_orders?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(o)}),
  addOrderEdit:   (rec)   => sb("pt_order_edits",{method:"POST",body:JSON.stringify(rec)}),
  getOrderEdits:  (orderId) => sb(`pt_order_edits?order_id=eq.${orderId}&order=edited_at.desc`),
  searchOrder:    (n)     => sb(`pt_orders?order_number=eq.${encodeURIComponent(n)}`),
  getPlanned:     ()      => sbAll("pt_planned_orders","status=eq.pending&order=scheduled_datetime.asc"),
  getAllPlanned:   ()      => sbAll("pt_planned_orders","order=scheduled_datetime.asc"),
  addPlanned:     (o)     => sb("pt_planned_orders",{method:"POST",body:JSON.stringify(o)}),
  updatePlanned:  (id,o)  => sb(`pt_planned_orders?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(o)}),
  deletePlanned:  (id)    => sb(`pt_planned_orders?id=eq.${id}`,{method:"DELETE",headers:{Prefer:"return=minimal"}}),
  findPlanned:    (n)     => sb(`pt_planned_orders?order_number=eq.${encodeURIComponent(n)}`),
};

// ─── HELPERS ───────────────────────────────────────────────────
const NZ_TZ  = "Pacific/Auckland";
const fmt    = dt => !dt?"—":new Date(dt).toLocaleString("en-NZ",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:NZ_TZ});
const fmtT   = dt => !dt?"—":new Date(dt).toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit",timeZone:NZ_TZ});
const nowISO = () => new Date().toISOString();
const today  = () => new Date().toLocaleDateString("en-CA",{timeZone:"Pacific/Auckland"});
const minsTo = (s,e) => (new Date(e)-new Date(s))/60000;
const getDur  = (s,e) => { const ms=new Date(e)-new Date(s); return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m ${Math.floor((ms%60000)/1000)}s`; };
const getElap = s => { const ms=Date.now()-new Date(s); return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`; };
const fmtMins = m => { if(!m&&m!==0) return "—"; return `${Math.floor(m/60)}h ${Math.round(m%60)}m`; };
const calcEff = (std,qty,workMins,numEmp=1) => std&&qty&&workMins&&workMins>0 ? Math.round((std*qty/(workMins*(numEmp||1)))*100) : null;
const effColor= e => !e?"#8B90A8":e>=100?"#00D4AA":e>=80?"#FFC107":e>=60?"#FF9500":"#FF4B6E";
// ── Smart line matcher — handles 01→LINE-01, LINE-01→LINE-01, name match etc ──
function findLine(lines, csvLineId){
  if(!csvLineId) return null;
  const v=csvLineId.trim();
  return(
    lines.find(l=>l.id===v) ||
    lines.find(l=>l.id.endsWith("-"+v)) ||
    lines.find(l=>v.endsWith("-"+l.id)) ||
    lines.find(l=>l.id.includes(v)||v.includes(l.id)) ||
    lines.find(l=>l.name.toLowerCase().includes(v.toLowerCase()))
  );
}

const STATUS_COLORS = { "In Progress":{dot:"#FFC107",bg:"#FFF3CD33"}, "On Break":{dot:"#FF9500",bg:"rgba(255,149,0,.08)"}, Completed:{dot:"#198754",bg:"#D1E7DD33"} };

// ─── CSV HELPERS ───────────────────────────────────────────────
function parsePlannedCSV(text){
  // Strip BOM, normalise line endings
  const raw=text.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  const allLines=raw.split("\n");
  // Always skip first row (header), process all remaining rows
  const dataLines=allLines.slice(1);
  const rows=[]; let skipped=0; const errors=[];
  dataLines.forEach((line)=>{
    // Skip blank lines
    if(!line.trim()||!line.replace(/,/g,"").trim()){skipped++;return;}
    // Parse respecting quoted fields
    const cols=[]; let cur=""; let inQ=false;
    for(const ch of line){
      if(ch==='"'){inQ=!inQ;}
      else if(ch===","&&!inQ){cols.push(cur.trim());cur="";}
      else cur+=ch;
    }
    cols.push(cur.trim());
    const order_number      =cols[0]?.replace(/^"|"$/g,"").trim();
    const item_id           =cols[1]?.replace(/^"|"$/g,"").trim()||null;
    const line_id           =cols[2]?.replace(/^"|"$/g,"").trim()||null;
    const production_qty_raw=cols[3]?.replace(/^"|"$/g,"").trim();
    const sched_raw         =cols[4]?.replace(/^"|"$/g,"").trim();
    if(!order_number){skipped++;return;}
    let scheduled_datetime=null;
    if(sched_raw){
      try{
        let iso=sched_raw;
        // Detect D/MM/YYYY or DD/MM/YYYY (NZ/AU format) — e.g. "9/06/2026 8:00" or "25/06/2026 8:00:00 AM"
        const nzMatch=sched_raw.match(/^(\d{1,2})\/(\d{2})\/(\d{4})(.*)$/);
        if(nzMatch){
          const [,day,mon,yr,rest]=nzMatch;
          // rest may be " 8:00", " 8:00:00", " 8:00:00 AM" etc
          const timePart=rest.trim();
          iso=`${yr}-${mon}-${day.padStart(2,"0")}${timePart?" "+timePart:""}`;
        }
        const d=new Date(iso);
        if(!isNaN(d.getTime()))scheduled_datetime=d.toISOString();
      }catch{}
    }
    rows.push({order_number,item_id,line_id,production_qty:production_qty_raw?Number(production_qty_raw):null,scheduled_datetime});
  });
  return{rows,skipped,errors};
}

const PLANNED_TEMPLATE=`order_number,item_id,line_id,production_qty,scheduled_datetime\nORD-2025-201,ITM-001,LINE-01,100,2026-06-02 08:00\nORD-2025-202,ITM-002,LINE-04,200,2026-06-02 09:30`;
function dlPlannedTemplate(){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([PLANNED_TEMPLATE],{type:"text/csv"})); a.download="planned_orders_template.csv"; a.click(); }

function parseItemsCSV(text){
  const lines=text.trim().split(/\r?\n/).slice(1); const items=[]; const errors=[];
  lines.forEach((line,i)=>{ const c=line.split(",").map(s=>s.trim().replace(/^"|"$/g,"")); const[id,name,std]=c; if(!id||!name){errors.push(`Row ${i+2}: missing id or name`);return;} items.push({id:id.toUpperCase(),name,std_minutes:std?Number(std):null}); });
  return {items,errors};
}
const ITEM_TEMPLATE=`id,name,std_minutes\nITM-011,My New Part,5\nITM-012,Another Part,3`;
function dlItemTemplate(){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([ITEM_TEMPLATE],{type:"text/csv"})); a.download="items_template.csv"; a.click(); }

// ══════════════════════════════════════════════════════════════
//  GLOBAL STYLES
// ══════════════════════════════════════════════════════════════
const GStyles=()=>(
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0F1117;}
    ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:#1A1D27} ::-webkit-scrollbar-thumb{background:#3A3F55;border-radius:3px}
    .bp{background:#00D4AA;color:#0F1117;border:none;padding:10px 20px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bp:hover{background:#00FFCC;transform:translateY(-1px)} .bp:disabled{opacity:.4;cursor:not-allowed;transform:none}
    .bd{background:#FF4B6E;color:#fff;border:none;padding:8px 16px;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bd:hover{background:#FF2D55} .bd:disabled{opacity:.35;cursor:not-allowed}
    .bg{background:transparent;color:#8B90A8;border:1px solid #2A2F45;padding:8px 16px;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bg:hover{border-color:#00D4AA;color:#00D4AA}
    .bw{background:#FF9500;color:#0F1117;border:none;padding:8px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bw:hover{background:#FFAC30}
    .bpause{background:#FF9500;color:#0F1117;border:none;padding:6px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:11px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bresume{background:#00D4AA;color:#0F1117;border:none;padding:6px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:11px;cursor:pointer;border-radius:4px;transition:all .15s}
    input,select,textarea{background:#1A1D27;border:1px solid #2A2F45;color:#E8EAF0;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:10px 14px;border-radius:4px;width:100%;outline:none;transition:border .15s}
    input:focus,select:focus,textarea:focus{border-color:#00D4AA}
    input[readonly]{cursor:default;} input::placeholder{color:#4A4F65} select option{background:#1A1D27}
    label{display:block;font-size:11px;color:#8B90A8;margin-bottom:6px;letter-spacing:1px;text-transform:uppercase}
    .fg{margin-bottom:16px}
    .card{background:#1A1D27;border:1px solid #2A2F45;border-radius:8px;padding:20px}
    .nb{background:none;border:none;font-family:'IBM Plex Mono',monospace;font-size:12px;padding:10px 14px;cursor:pointer;transition:all .15s;letter-spacing:.5px;white-space:nowrap}
    .tag{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
    .mo{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}
    .md{background:#1A1D27;border:1px solid #2A2F45;border-radius:10px;padding:26px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto}
    .pdel{background:none;border:1px solid #3A2030;color:#FF4B6E;font-size:11px;padding:2px 8px;border-radius:12px;cursor:pointer;font-family:'IBM Plex Mono',monospace;transition:all .15s}
    .pdel:hover{background:#FF4B6E;color:#fff}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .au{animation:fadeUp .18s ease forwards}
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .ti{animation:toastIn .2s ease}
    th.sortable{cursor:pointer;user-select:none} th.sortable:hover{color:#C8CADC!important}
    tr:hover td{background:#1A1F30!important}
    .eff-bar{height:5px;border-radius:3px;background:#2A2F45;overflow:hidden;margin-top:3px}
    .eff-fill{height:100%;border-radius:3px;transition:width .3s}
    .pill{background:rgba(0,212,170,.1);border:1px solid rgba(0,212,170,.25);color:#00D4AA;font-size:10px;padding:3px 9px;border-radius:12px;display:inline-flex;align-items:center;gap:4px;margin:2px;}
    .readonly-note{font-size:9px;color:#5A5F78;margin-top:3px;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .pause-banner{background:rgba(255,149,0,.07);border:1px solid rgba(255,149,0,.2);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:10px;margin-bottom:8px;}
    .autofill-banner{background:rgba(0,212,170,.07);border:1px solid rgba(0,212,170,.2);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:8px;font-size:11px;color:#00D4AA;margin-bottom:14px;}
  `}</style>
);

// ══════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════
function LoginScreen({onLogin}){
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false); const [show,setShow]=useState(false);
  const go=async()=>{
    if(!u||!p){setErr("Please enter username and password.");return;}
    setLoading(true);setErr("");
    try{ const r=await db.loginUser(u.trim(),p.trim()); r.length?onLogin(r[0]):setErr("Invalid username or password."); }
    catch(e){setErr("Connection error. Please try again.");}
    setLoading(false);
  };
  return(
    <div style={{minHeight:"100vh",background:"#0F1117",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <GStyles/>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:60,height:60,background:"#00D4AA",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 16px"}}>⚙</div>
          <div style={{fontSize:22,fontWeight:700,color:"#E8EAF0",letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace"}}>PRODTRACK</div>
          <div style={{fontSize:11,color:"#5A5F78",letterSpacing:3,marginTop:4,fontFamily:"'IBM Plex Mono',monospace"}}>PRODUCTION SCHEDULER</div>
        </div>
        <div className="card">
          <div className="fg"><label>Username</label><input placeholder="Enter username" value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} autoFocus/></div>
          <div className="fg">
            <label>Password</label>
            <div style={{position:"relative"}}>
              <input type={show?"text":"password"} placeholder="Enter password" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} style={{paddingRight:44}}/>
              <button onClick={()=>setShow(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#5A5F78",cursor:"pointer",fontSize:16}}>{show?"🙈":"👁"}</button>
            </div>
          </div>
          {err&&<div style={{background:"#2A1520",border:"1px solid #FF4B6E44",borderRadius:6,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#FF4B6E"}}>⚠ {err}</div>}
          <button className="bp" onClick={go} disabled={loading} style={{width:"100%",padding:13,fontSize:14}}>{loading?"Signing in…":"Sign In →"}</button>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:10,color:"#3A3F55",fontFamily:"'IBM Plex Mono',monospace"}}>Contact your administrator for access</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ROOT
// ══════════════════════════════════════════════════════════════
export default function App(){
  const [user,setUser]=useState(null);
  if(!user) return <LoginScreen onLogin={setUser}/>;
  return <ProductionScheduler user={user} onLogout={()=>setUser(null)}/>;
}

// ══════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════
function ProductionScheduler({user,onLogout}){
  const isAdmin=user.role==="admin";
  const [view,setView]=useState("dashboard");
  const [orders,setOrders]=useState([]);
  const [items,setItems]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [lines,setLines]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState(null);
  const [activeSearch,setActiveSearch]=useState("");
  // new order
  const [nf,setNf]=useState({selectedEmployees:[],orderNumber:"",itemId:"",lineId:"",productionQty:"",startDateTime:"",autoFilled:false});
  const [orderSearchQ,setOrderSearchQ]=useState("");
  const [dupWarning,setDupWarning]=useState(null); // null | {status, order}
  const [orderSearching,setOrderSearching]=useState(false);
  // search
  const [sq,setSq]=useState(""); const [sr,setSr]=useState(null); const [snf,setSnf]=useState(false);
  // close modal
  const [cm,setCm]=useState(null); const [cf,setCf]=useState({endQty:"",remarks:""});
  const [editOrder,setEditOrder]=useState(null);
  const [swapOrder,setSwapOrder]=useState(null);
  const openSwap=(o)=>setSwapOrder(o);
  const handleSwapSaved=(updatedOrder)=>{
    setOrders(p=>p.map(o=>o.id===updatedOrder.id?updatedOrder:o));
    if(sr?.id===updatedOrder.id) setSr(updatedOrder);
    setSwapOrder(null);
  };
  // records
  const [fEmp,setFEmp]=useState("All"); const [fLine,setFLine]=useState("All"); const [fStatus,setFStatus]=useState("All"); const [fItem,setFItem]=useState("All"); const [fOrder,setFOrder]=useState(""); const [fItemSearch,setFItemSearch]=useState("");
  const [pageSize,setPageSize]=useState(50); const [curPage,setCurPage]=useState(1);
  const [fFrom,setFFrom]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"Pacific/Auckland"})); const [fTo,setFTo]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"Pacific/Auckland"}));
  const [allOrders,setAllOrders]=useState(null); // null = not yet fetched, array = fetched all
  const [recordsLoading,setRecordsLoading]=useState(false);
  const [sortF,setSortF]=useState("created_at"); const [sortD,setSortD]=useState("desc");

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  const [yearStats,setYearStats]=useState({orders:[],loading:true});

  const loadAll=useCallback(async()=>{
    setLoading(true);
    try{
      // Current month range (NZ timezone)
      const now=new Date();
      const y=now.toLocaleDateString("en-CA",{timeZone:NZ_TZ}).slice(0,4);
      const m=now.toLocaleDateString("en-CA",{timeZone:NZ_TZ}).slice(5,7);
      const monthFrom=`${y}-${m}-01T00:00:00`;
      const lastDay=new Date(Number(y),Number(m),0).getDate();
      const monthTo=`${y}-${m}-${String(lastDay).padStart(2,"0")}T23:59:59`;

      // Tier 1a: current month's full order records (for stats/records/search/employee eff)
      // Tier 1b: ALL active orders regardless of start date (so nothing running gets hidden)
      const [monthOrders,activeOrders,i,e,l]=await Promise.all([
        db.getMonthOrders(monthFrom,monthTo),
        db.getActiveOrders(),
        db.getItems(),db.getEmployees(),db.getLines()
      ]);

      // Merge: month orders + any active orders not already in that list (e.g. started in a prior month)
      const monthIds=new Set(monthOrders.map(o=>o.id));
      const merged=[...monthOrders, ...activeOrders.filter(o=>!monthIds.has(o.id))];

      setOrders(merged); setItems(i); setEmployees(e.map(x=>x.name)); setLines(l);

      // Tier 2: lightweight year summary (only 3 fields) — runs after, doesn't block dashboard
      const yearFrom=`${y}-01-01T00:00:00`;
      const yearTo=`${y}-12-31T23:59:59`;
      db.getYearSummary(yearFrom,yearTo).then(ys=>{
        setYearStats({orders:ys,loading:false});
      }).catch(()=>setYearStats({orders:[],loading:false}));

    }catch(e){showToast("Failed to load: "+e.message,"error");}
    setLoading(false);
  },[isAdmin]);

  useEffect(()=>{loadAll();},[loadAll]);

  // ── Order search auto-fill ──
  const handleOrderSearch=async()=>{
    if(!orderSearchQ.trim()){showToast("Enter an order number.","error");return;}
    setOrderSearching(true);
    setDupWarning(null);
    try{
      // Check if order already exists in loaded orders
      const q=orderSearchQ.trim().toUpperCase();
      const existing=orders.find(o=>o.order_number?.toUpperCase()===q);
      if(existing){
        setDupWarning({status:existing.status,order:existing});
      }
      const r=await db.findPlanned(orderSearchQ.trim().toUpperCase());
      if(r.length){
        const p=r[0];
        // Fix: correct NZ timezone for datetime picker (no double-offset)
        const sdt=p.scheduled_datetime
          ?new Date(p.scheduled_datetime).toLocaleString("sv",{timeZone:NZ_TZ}).slice(0,16).replace(" ","T")
          :"";
        // Fix: smart line matching — handles 01→LINE-01, LINE-01→LINE-01, name match etc
        const matchedLine=findLine(lines, p.line_id);
        const resolvedLineId=matchedLine?matchedLine.id:(p.line_id||"");
        setNf(f=>({...f,orderNumber:p.order_number,itemId:p.item_id||"",lineId:resolvedLineId,productionQty:p.production_qty?String(p.production_qty):"",startDateTime:sdt,autoFilled:true}));
        if(!existing) showToast("Order found — fields auto-filled!");
      } else {
        setNf(f=>({...f,orderNumber:orderSearchQ.trim().toUpperCase(),autoFilled:false}));
        if(!existing) showToast("Order not in planned list — fill fields manually.","warn");
      }
    }catch(e){showToast("Search failed.","error");}
    setOrderSearching(false);
  };

  // ── Start order ──
  const handleStart=async()=>{
    const{selectedEmployees,orderNumber,itemId,lineId,productionQty}=nf;
    if(!selectedEmployees.length||!orderNumber||!itemId||!lineId||!productionQty){showToast("Please fill all required fields.","error");return;}
    if(orders.find(o=>o.order_number===orderNumber&&o.status!=="Completed")){showToast("Active order with this number exists.","error");return;}
    setSaving(true);
    try{
      const item=items.find(i=>i.id===itemId);
      const numEmp=selectedEmployees.length;
      const o={
        order_number:orderNumber,employee:selectedEmployees.join(", "),employees:selectedEmployees,num_employees:numEmp,
        item_id:itemId,item_name:item?.name||"",
        line_id:lineId,line_name:lines.find(l=>l.id===lineId)?.name||"",
        production_qty:Number(productionQty),
        start_datetime:nf.startDateTime?new Date(nf.startDateTime).toISOString():nowISO(),
        status:"In Progress",created_by:user.username,
        breaks:[],break_minutes:0,is_paused:false,
      };
      const res=await db.addOrder(o);
      // mark planned order as started
      try{ const pl=await db.findPlanned(orderNumber); if(pl.length) await db.updatePlanned(pl[0].id,{status:"started"}); }catch{}
      setOrders(p=>[res[0],...p]);
      setNf({selectedEmployees:[],orderNumber:"",itemId:"",lineId:"",productionQty:"",startDateTime:"",autoFilled:false});
      setDupWarning(null);
      setOrderSearchQ("");
      showToast(`Order ${orderNumber} started with ${numEmp} employee${numEmp>1?"s":""}!`);
      setView("dashboard");
    }catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };

  // ── Pause order ──
  const handlePause=async(o)=>{
    if(o.is_paused) return;
    try{
      const patch={is_paused:true,paused_at:nowISO(),status:"In Progress"};
      await db.updateOrder(o.id,patch);
      setOrders(p=>p.map(x=>x.id===o.id?{...x,...patch}:x));
      showToast(`Order ${o.order_number} paused.`,"warn");
    }catch(e){showToast("Failed: "+e.message,"error");}
  };

  // ── Resume order ──
  const handleResume=async(o)=>{
    if(!o.is_paused||!o.paused_at) return;
    try{
      const breakMins=minsTo(o.paused_at,nowISO());
      const newBreak={start:o.paused_at,end:nowISO(),minutes:Math.round(breakMins*10)/10};
      const breaks=[...(o.breaks||[]),newBreak];
      const totalBreakMins=(o.break_minutes||0)+breakMins;
      const patch={is_paused:false,paused_at:null,breaks,break_minutes:totalBreakMins};
      await db.updateOrder(o.id,patch);
      setOrders(p=>p.map(x=>x.id===o.id?{...x,...patch}:x));
      showToast(`Order ${o.order_number} resumed.`);
    }catch(e){showToast("Failed: "+e.message,"error");}
  };

  // ── Close order ──
  const openClose=(o)=>{if(o.is_paused){showToast("Resume the order before closing.","error");return;} setCm(o);setCf({endQty:"",remarks:""});};
  const openEditTimes=(o)=>setEditOrder(o);
  const handleEditSaved=(updatedOrder)=>{
    setOrders(p=>p.map(o=>o.id===updatedOrder.id?updatedOrder:o));
    if(sr?.id===updatedOrder.id) setSr(updatedOrder);
    setEditOrder(null);
  };
  const handleClose=async()=>{
    const endQty=Number(cf.endQty);
    const planQty=cm?.production_qty||0;
    if(!cf.endQty||endQty<=0){showToast("Please enter the ending quantity.","error");return;}
    if(endQty>planQty){showToast("End quantity cannot exceed plan quantity — please enter the correct quantity.","error");return;}
    if(endQty<planQty&&!cf.remarks.trim()){showToast("End qty is below plan — please enter a reason in Remarks.","error");return;}
    setSaving(true);
    try{
      const item=items.find(i=>i.id===cm.item_id);
      const stdMin=item?.std_minutes||null;
      const totalMins=minsTo(cm.start_datetime,nowISO());
      const breakMins=cm.break_minutes||0;
      const workMins=Math.max(totalMins-breakMins,0.1);

      let eff=null;
      let finalSegments=null;

      if(cm.employee_segments&&cm.employee_segments.length>0){
        // ── Segmented efficiency (employee swap occurred) ──
        // prototype logic: sum(std×qty) ÷ sum(work_min×num_emp) × 100 per segment
        const segs=[...cm.employee_segments];
        const lastSeg={...segs[segs.length-1]};

        // All completed segments (all except last)
        const completedSegs=segs.slice(0,-1);
        const completedWorkMins=completedSegs.reduce((a,s)=>a+(s.working_minutes||0),0);
        const completedQty=completedSegs.reduce((a,s)=>a+(s.partial_qty||0),0);

        // Fill last segment with remaining qty and remaining working time
        lastSeg.partial_qty=Math.max(0,endQty-completedQty);
        lastSeg.working_minutes=Math.round(Math.max(0,workMins-completedWorkMins)*10)/10;

        const finalSegs=[...completedSegs,lastSeg];

        // Collapse consecutive segments with same num_employees
        // (handles multiple test swaps or re-swaps with same count)
        const collapsed=[];
        for(const seg of finalSegs){
          const prev=collapsed[collapsed.length-1];
          if(prev&&prev.num_employees===seg.num_employees){
            prev.working_minutes=(prev.working_minutes||0)+(seg.working_minutes||0);
            prev.partial_qty=(prev.partial_qty||0)+(seg.partial_qty||0);
          } else {
            collapsed.push({...seg});
          }
        }

        // sum(std_min × qty) ÷ sum(working_min × num_emp) × 100
        if(stdMin){
          const totalStdWork=collapsed.reduce((a,s)=>a+(stdMin*(s.partial_qty||0)),0);
          const totalActualWork=collapsed.reduce((a,s)=>a+((s.working_minutes||0)*(s.num_employees||1)),0);
          eff=totalActualWork>0?Math.round((totalStdWork/totalActualWork)*100):null;
        }
        finalSegments=[...collapsed];
      } else {
        // ── Simple efficiency (no swap) ──
        const numEmp=cm.num_employees||1;
        eff=calcEff(stdMin,endQty,workMins,numEmp);
      }

      const patch={
        end_datetime:nowISO(),end_qty:endQty,remarks:cf.remarks,
        status:"Completed",actual_minutes:Math.round(totalMins*10)/10,
        working_minutes:Math.round(workMins*10)/10,efficiency:eff,
        ...(finalSegments?{employee_segments:finalSegments}:{}),
      };
      await db.updateOrder(cm.id,patch);
      try{ const pl=await db.findPlanned(cm.order_number); if(pl.length) await db.updatePlanned(pl[0].id,{status:"completed"}); }catch{}
      setOrders(p=>p.map(o=>o.id===cm.id?{...o,...patch}:o));
      showToast(`Order ${cm.order_number} closed!${eff!=null?" Efficiency: "+eff+"%":""}`);
      setCm(null); if(sr?.id===cm.id)setSr(null); setView(isAdmin?"records":"dashboard");
    }catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };

  // ── Records ──
  const toNZDate=dt=>{if(!dt)return"";return new Date(dt).toLocaleDateString("en-CA",{timeZone:NZ_TZ});};
  const recordsSource=allOrders??orders;
  const filteredOrders=recordsSource
    .filter(o=>{
      const em=fEmp==="All"||o.employee===fEmp||(o.employees&&o.employees.includes(fEmp));
      const lm=fLine==="All"||o.line_id===fLine;
      const sm=fStatus==="All"||o.status===fStatus;
      const im=fItem==="All"||o.item_id===fItem;
      const om=!fOrder.trim()||o.order_number?.toUpperCase().includes(fOrder.trim().toUpperCase());
      const orderDate=toNZDate(o.start_datetime);
      const df=!fFrom||orderDate>=fFrom;
      const dt=!fTo||orderDate<=fTo;
      return em&&lm&&sm&&im&&om&&df&&dt;
    })
    .sort((a,b)=>{
      let av=a[sortF]??"",bv=b[sortF]??"";
      if(["production_qty","end_qty","efficiency","working_minutes"].includes(sortF)){av=Number(av)||0;bv=Number(bv)||0;}
      return sortD==="asc"?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0);
    });
  const handleSort=f=>{if(sortF===f)setSortD(d=>d==="asc"?"desc":"asc");else{setSortF(f);setSortD("asc");}};

  // Pagination
  const totalPages=Math.max(1,Math.ceil(filteredOrders.length/pageSize));
  const safePage=Math.min(curPage,totalPages);
  const pagedOrders=filteredOrders.slice((safePage-1)*pageSize,safePage*pageSize);
  useEffect(()=>{setCurPage(1);},[fEmp,fLine,fStatus,fItem,fOrder,fFrom,fTo,pageSize]);

  const exportCSV=()=>{
    const H=["Order #","Employees","Num Emp","Line ID","Line","Item ID","Item","Std Min","Plan Qty","End Qty","Total Min","Break Min","Working Min","Actual Min/Pc","Man Hrs","Efficiency %","Start","End","Duration","Status","Remarks"];
    const R=filteredOrders.map(o=>[
      o.order_number,o.employees?.join("; ")||o.employee,o.num_employees||1,
      o.line_id,o.line_name,o.item_id,o.item_name,
      items.find(i=>i.id===o.item_id)?.std_minutes??"",
      o.production_qty,o.end_qty??"",
      o.actual_minutes??"",o.break_minutes??"",o.working_minutes??"",
      (o.working_minutes!=null&&o.end_qty>0)?(((o.working_minutes*(o.num_employees||1))/o.end_qty).toFixed(2)):"",
      o.working_minutes?(((o.working_minutes*(o.num_employees||1))/60).toFixed(2)):"",
      o.efficiency??"",
      o.start_datetime?new Date(o.start_datetime).toLocaleString("en-NZ",{timeZone:NZ_TZ}):"",
      o.end_datetime?new Date(o.end_datetime).toLocaleString("en-NZ",{timeZone:NZ_TZ}):"",
      o.end_datetime?getDur(o.start_datetime,o.end_datetime):"",
      o.status,o.remarks||""
    ].map(v=>`"${String(v??"").replace(/"/g,'""')}"`));
    const csv=[H.join(","),...R.map(r=>r.join(","))].join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`prodtrack_${today()}.csv`; a.click();
    showToast(`Exported ${filteredOrders.length} records.`);
  };

  // ── Today stats ──
  const td=today();
  // Convert UTC timestamp to local date string for comparison
  const toLocalDate=dt=>{if(!dt)return"";return new Date(dt).toLocaleDateString("en-CA",{timeZone:NZ_TZ});};
  // Helper: is this order assigned to the current user?
  const isMine=o=>(o.employees||[o.employee]).includes(user.full_name);
  // Active orders — status is "In Progress" for both running and paused orders
  const activeOrders=orders.filter(o=>o.status==="In Progress");
  // Worker sees all active orders same as admin
  const myActiveOrders=activeOrders;
  // Today's orders by local start date
  const todayOrders=orders.filter(o=>toLocalDate(o.start_datetime)===td);

  // ── Auto-refresh active orders every 30s ──
  useEffect(()=>{
    const interval=setInterval(async()=>{
      if(document.hidden)return;
      try{
        const fresh=await db.getActiveOrders();
        setOrders(prev=>{
          const nonActive=prev.filter(o=>o.status!=="In Progress");
          return [...nonActive,...fresh];
        });
      }catch(e){console.warn("Auto-refresh failed:",e.message);}
    },30000);
    return()=>clearInterval(interval);
  },[]);


  const todayDone=todayOrders.filter(o=>o.status==="Completed");
  const todayEffAvg=(()=>{const e=todayDone.filter(o=>o.efficiency!=null).map(o=>o.efficiency);return e.length?Math.round(e.reduce((a,b)=>a+b)/e.length):null;})();

  const TABS=isAdmin
    ?[{id:"dashboard",label:"Dashboard"},{id:"new",label:"+ New Order"},{id:"search",label:"Search"},{id:"records",label:"Records"},{id:"admin",label:"⚙ Admin"}]
    :[{id:"dashboard",label:"My Orders"},{id:"new",label:"+ New Order"},{id:"search",label:"Search"}];

  return(
    <div style={{fontFamily:"'IBM Plex Mono','Courier New',monospace",background:"#0F1117",minHeight:"100vh",color:"#E8EAF0"}}>
      <GStyles/>
      {/* HEADER */}
      <div style={{background:"#13161F",borderBottom:"1px solid #2A2F45",padding:"0 20px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1400,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,background:"#00D4AA",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>⚙</div>
            <div><div style={{fontSize:13,fontWeight:700,color:"#E8EAF0",letterSpacing:1}}>PRODTRACK</div><div style={{fontSize:9,color:"#5A5F78",letterSpacing:2}}>PRODUCTION SCHEDULER</div></div>
          </div>
          <nav style={{display:"flex",gap:0}}>
            {TABS.map(t=>(
              <button key={t.id} className="nb" onClick={()=>{setView(t.id);setSr(null);setSnf(false);}}
                style={{color:view===t.id?(t.id==="admin"?"#FF9500":"#00D4AA"):"#8B90A8",background:view===t.id?(t.id==="admin"?"rgba(255,149,0,.08)":"rgba(0,212,170,.08)"):"none",borderBottom:view===t.id?`2px solid ${t.id==="admin"?"#FF9500":"#00D4AA"}`:"2px solid transparent",borderRadius:"4px 4px 0 0"}}>
                {t.label}
              </button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}><div style={{fontSize:12,color:"#C8CADC",fontWeight:600}}>{user.full_name}</div><div style={{fontSize:9,color:isAdmin?"#FF9500":"#7B8CFF",letterSpacing:1,textTransform:"uppercase"}}>{user.role}</div></div>
            <button className="bg" style={{fontSize:11,padding:"5px 10px"}} onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1400,margin:"0 auto",padding:"22px 20px"}}>
        {loading?(
          <div style={{textAlign:"center",padding:80,color:"#4A4F65"}}>
            <div style={{fontSize:32,marginBottom:12,display:"inline-block",animation:"spin 1s linear infinite"}}>⏳</div>
            <div>Loading data…</div>
          </div>
        ):(
          <>
          {/* ═══ DASHBOARD ═══ */}
          {view==="dashboard"&&<Dashboard orders={orders} todayOrders={todayOrders} todayDone={todayDone} todayEffAvg={todayEffAvg} activeOrders={myActiveOrders} items={items} isAdmin={isAdmin} onNewOrder={()=>setView("new")} onClose={openClose} onPause={handlePause} onResume={handleResume} onEditTimes={openEditTimes} onSwap={openSwap} reload={loadAll} activeSearch={activeSearch} setActiveSearch={setActiveSearch} yearStats={yearStats}/>}

          {/* ═══ NEW ORDER ═══ */}
          {view==="new"&&(
            <div className="au" style={{maxWidth:660}}>
              <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase",marginBottom:20}}>Start New Production Order</h2>
              <div className="card">
                {/* Order search + barcode scan */}
                <div className="fg">
                  <label>Order Number * <span style={{color:"#7B8CFF",fontSize:10,letterSpacing:0}}>— search to auto-fill</span></label>
                  <div style={{display:"flex",gap:8}}>
                    <input
                      placeholder="Type or scan order number"
                      value={orderSearchQ}
                      onChange={e=>{setOrderSearchQ(e.target.value.toUpperCase());setDupWarning(null);}}
                      onKeyDown={e=>e.key==="Enter"&&handleOrderSearch()}
                      style={{flex:1}}
                      disabled={orderSearching}
                      autoComplete="off"
                    />
                    <button className="bp" onClick={handleOrderSearch} disabled={orderSearching} style={{whiteSpace:"nowrap",padding:"10px 14px",fontSize:12}}>{orderSearching?"…":"🔍 Find"}</button>
                  </div>
                  <div style={{fontSize:10,color:"#5A5F78",marginTop:4}}>
                    Type manually · or use USB/Bluetooth barcode scanner (click field then scan — auto-searches on detect)
                  </div>
                </div>
                {dupWarning&&(
                  <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",borderRadius:6,fontSize:11,marginBottom:10,
                    ...(dupWarning.status==="Completed"
                      ?{background:"rgba(255,75,110,.07)",border:"1px solid rgba(255,75,110,.25)",color:"#FF4B6E"}
                      :{background:"rgba(255,193,7,.07)",border:"1px solid rgba(255,193,7,.25)",color:"#FFC107"}
                    )}}>
                    <span style={{fontSize:15,flexShrink:0}}>⚠</span>
                    <div>
                      <div style={{fontWeight:700,marginBottom:3}}>
                        Order {dupWarning.order.order_number} is {dupWarning.status==="Completed"?"already Completed":"currently In Progress"}
                      </div>
                      <div style={{fontSize:10,opacity:.85}}>
                        {dupWarning.status==="Completed"
                          ?`Completed ${new Date(dupWarning.order.end_datetime).toLocaleString("en-NZ",{timeZone:NZ_TZ,day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:true})}`
                          ??"—"
                          :`Started ${new Date(dupWarning.order.start_datetime).toLocaleString("en-NZ",{timeZone:NZ_TZ,day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:true})}`
                        }
                        {" · "}{(dupWarning.order.employees||[dupWarning.order.employee]).filter(Boolean).join(", ")}
                        {dupWarning.order.line_name?" · "+dupWarning.order.line_name:""}
                      </div>
                      <div style={{fontSize:10,marginTop:4,opacity:.7}}>Starting again will create a duplicate record. Proceed only if intentional.</div>
                    </div>
                  </div>
                )}
                {nf.autoFilled&&<div className="autofill-banner">✔ Order found — fields auto-filled. Select employee(s) and confirm.</div>}

                {/* Employees */}
                <div className="fg">
                  <label>Employee(s) * <span style={{color:"#7B8CFF",fontSize:10,letterSpacing:0}}>— select one or more</span></label>
                  <EmployeePicker employees={employees} selected={nf.selectedEmployees} onChange={sel=>setNf(f=>({...f,selectedEmployees:sel}))}/>
                  {nf.selectedEmployees.length>0&&<div style={{fontSize:11,color:"#7B8CFF",marginTop:6}}>👥 {nf.selectedEmployees.length} employee{nf.selectedEmployees.length>1?"s":""} selected</div>}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div className="fg">
                    <label>Order Number *</label>
                    <input placeholder="ORD-2025-001" value={nf.orderNumber} onChange={e=>setNf(f=>({...f,orderNumber:e.target.value.toUpperCase(),autoFilled:false}))} style={nf.autoFilled?{borderColor:"#00D4AA",color:"#00D4AA"}:{}}/>
                    {nf.autoFilled&&<div className="readonly-note">✔ Auto-filled</div>}
                  </div>
                  <div className="fg">
                    <label>Production Qty *</label>
                    <input type="number" min="1" placeholder="0" value={nf.productionQty} onChange={e=>setNf(f=>({...f,productionQty:e.target.value}))} style={nf.autoFilled?{borderColor:"#00D4AA",color:"#00D4AA"}:{}}/>
                    {nf.autoFilled&&<div className="readonly-note">✔ Auto-filled</div>}
                  </div>
                </div>

                <div className="fg">
                  <label>Production Line *</label>
                  <select value={nf.lineId} onChange={e=>setNf(f=>({...f,lineId:e.target.value}))} style={nf.autoFilled&&nf.lineId?{borderColor:"#00D4AA",color:"#00D4AA"}:{}}>
                    <option value="">— Select Line —</option>
                    {lines.map(l=><option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}
                  </select>
                  {nf.autoFilled&&nf.lineId&&<div className="readonly-note">✔ Auto-filled</div>}
                </div>

                <div className="fg">
                  <label>Item Number *</label>
                  <ItemSearch items={items} value={nf.itemId} onChange={v=>setNf(f=>({...f,itemId:v}))} filled={nf.autoFilled&&!!nf.itemId}/>
                  {nf.autoFilled&&nf.itemId&&<div className="readonly-note">✔ Auto-filled</div>}
                  {nf.itemId&&(()=>{
                    const it=items.find(i=>i.id===nf.itemId);
                    if(!it?.std_minutes) return null;
                    const numEmp=nf.selectedEmployees.length||1;
                    return(
                      <div style={{background:"#13161F",border:"1px solid #2A3545",borderRadius:6,padding:"10px 14px",marginTop:8,fontSize:11,color:"#8B90A8"}}>
                        ⏱ Std: <span style={{color:"#7B8CFF"}}>{it.std_minutes} min/piece</span> &nbsp;·&nbsp; 👥 <span style={{color:"#FF9500"}}>{numEmp} employee{numEmp>1?"s":""}</span><br/>
                        <span style={{color:"#5A5F78"}}>Efficiency = (std × end_qty) ÷ (working_mins × {numEmp}) × 100</span>
                      </div>
                    );
                  })()}
                </div>

                <div className="fg">
                  <label>Start Date & Time</label>
                  <div style={{display:"flex",gap:10}}>
                    <input type="datetime-local" step="1" value={nf.startDateTime} onChange={e=>setNf(f=>({...f,startDateTime:e.target.value}))} style={{flex:1,...(nf.autoFilled&&nf.startDateTime?{borderColor:"#00D4AA",color:"#00D4AA"}:{})}}/>
                    <button className="bg" style={{whiteSpace:"nowrap",padding:"10px 14px"}} onClick={()=>{const l=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,19);setNf(f=>({...f,startDateTime:l}));}}>📍 Now</button>
                  </div>
                  {nf.autoFilled&&nf.startDateTime&&<div className="readonly-note">✔ Auto-filled — click 📍 Now to use current time</div>}
                </div>

                <div style={{display:"flex",gap:10,marginTop:8}}>
                  <button className="bp" onClick={handleStart} disabled={saving} style={{flex:1,padding:12}}>{saving?"Saving…":"▶ START ORDER"}</button>
                  <button className="bg" onClick={()=>{setView("dashboard");setNf({selectedEmployees:[],orderNumber:"",itemId:"",lineId:"",productionQty:"",startDateTime:"",autoFilled:false});setOrderSearchQ("");}}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SEARCH ═══ */}
          {view==="search"&&(
            <div className="au" style={{maxWidth:900}}>
              {/* ── Order Search ── */}
              <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Search Order</h2>
              <div className="card" style={{marginBottom:8}}>
                <div style={{display:"flex",gap:10}}>
                  <input placeholder="Enter Order Number…" value={sq} onChange={e=>setSq(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&(async()=>{if(!sq.trim())return;const r=await db.searchOrder(sq.trim());r.length?(setSr(r[0]),setSnf(false)):(setSr(null),setSnf(true));})()}/>
                  <button className="bp" onClick={async()=>{if(!sq.trim())return;const r=await db.searchOrder(sq.trim());r.length?(setSr(r[0]),setSnf(false)):(setSr(null),setSnf(true));}} style={{whiteSpace:"nowrap"}}>🔍 Search</button>
                </div>
              </div>
              <div style={{fontSize:10,color:"#5A5F78",marginBottom:16,paddingLeft:2}}>Type an order number and press Search to view full order details, time tracking and break log.</div>
              {snf&&<div className="card" style={{textAlign:"center",color:"#FF4B6E",padding:32,marginBottom:16}}><div style={{fontSize:32,marginBottom:8}}>🚫</div><div>No order found for <strong>"{sq}"</strong></div></div>}
              {sr&&<div className="au" style={{marginBottom:16}}><OrderCard order={sr} item={items.find(i=>i.id===sr.item_id)} onClose={sr.status==="In Progress"&&!sr.is_paused?()=>openClose(sr):null} onPause={sr.status==="In Progress"&&!sr.is_paused?()=>handlePause(sr):null} onResume={sr.is_paused?()=>handleResume(sr):null} onEditTimes={()=>openEditTimes(sr)} isAdmin={isAdmin}/></div>}

              {/* ── Divider ── */}
              <div style={{height:1,background:"#2A2F45",margin:"8px 0 22px"}}/>

              {/* ── Monthly Efficiency Tracker ── */}
              <MonthlyTracker orders={orders} items={items}/>

              {/* ── Divider ── */}
              <div style={{height:1,background:"#2A2F45",margin:"22px 0"}}/>

              {/* ── Efficiency Distribution Pie ── */}
              <EfficiencyPie orders={orders}/>

              {/* ── Divider ── */}
              <div style={{height:1,background:"#2A2F45",margin:"22px 0"}}/>

              {/* ── Employee Efficiency ── */}
              <EmployeeEfficiency orders={orders} employees={employees}/>
            </div>
          )}

          {/* ═══ RECORDS (admin only) ═══ */}
          {view==="records"&&isAdmin&&(
            <div className="au">
              <div style={{background:"#13161F",border:"1px solid #2A2F45",borderRadius:8,padding:"14px 16px",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>Records <span style={{color:"#4A4F65"}}>({filteredOrders.length})</span>{recordsLoading&&<span style={{marginLeft:8,fontSize:10,color:"#7B8CFF",fontWeight:700,background:"rgba(123,140,255,.1)",border:"1px solid rgba(123,140,255,.2)",padding:"2px 8px",borderRadius:8}}>⟳ Loading…</span>}</h2>
                  <div style={{display:"flex",gap:8}}><button className="bg" style={{fontSize:11}} onClick={loadAll}>↻</button><button className="bp" style={{fontSize:12,padding:"8px 16px"}} onClick={exportCSV}>⬇ Export CSV</button></div>
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:10,flexWrap:"wrap"}}>
                  <div style={{flex:"0 0 150px"}}>
                    <label>Employee</label>
                    <select value={fEmp} onChange={e=>setFEmp(e.target.value)}><option value="All">All</option>{employees.map(e=><option key={e} value={e}>{e}</option>)}</select>
                  </div>
                  <div style={{flex:"0 0 140px"}}>
                    <label>Line</label>
                    <select value={fLine} onChange={e=>setFLine(e.target.value)}><option value="All">All</option>{lines.map(l=><option key={l.id} value={l.id}>{l.id}</option>)}</select>
                  </div>
                  <div style={{flex:"0 0 140px"}}>
                    <label>Status</label>
                    <select value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="All">All</option><option>In Progress</option><option>Completed</option></select>
                  </div>
                  <div style={{flex:"1 1 200px",minWidth:180,position:"relative"}}>
                    <label>Item {fItem!=="All"&&<span style={{color:"#00D4AA",fontSize:9}}>— filtered</span>}</label>
                    {(()=>{
                      // Only show items used within the current date range — same pattern as order number filter
                      // Uses recordsSource (which includes all orders if Clear All was pressed)
                      const dfOrders=recordsSource.filter(o=>{
                        const od=toNZDate(o.start_datetime);
                        return(!fFrom||od>=fFrom)&&(!fTo||od<=fTo);
                      });
                      const allIds=[...new Set(dfOrders.map(o=>o.item_id).filter(Boolean))].sort();
                      const filteredIds=fItemSearch.trim()
                        ?allIds.filter(id=>{
                            const nm=items.find(i=>i.id===id)?.name||"";
                            const q=fItemSearch.trim().toUpperCase();
                            return id.toUpperCase().includes(q)||nm.toUpperCase().includes(q);
                          })
                        :allIds;
                      return(
                        <div style={{position:"relative"}}>
                          <div style={{display:"flex",gap:4,alignItems:"center"}}>
                            <input
                              placeholder={fItem==="All"?"Search items…":fItem}
                              value={fItemSearch}
                              onChange={e=>{setFItemSearch(e.target.value);if(!e.target.value)setFItem("All");}}
                              onKeyDown={e=>e.key==="Escape"&&(setFItemSearch(""),setFItem("All"))}
                              style={{flex:1,fontSize:11,...(fItem!=="All"?{borderColor:"#00D4AA",color:"#00D4AA"}:{})}}
                            />
                            {(fItem!=="All"||fItemSearch)&&(
                              <button onClick={()=>{setFItem("All");setFItemSearch("");}}
                                style={{background:"none",border:"none",color:"#5A5F78",cursor:"pointer",fontSize:14,padding:"0 4px",flexShrink:0,lineHeight:1}}
                                onMouseEnter={e=>e.currentTarget.style.color="#FF4B6E"}
                                onMouseLeave={e=>e.currentTarget.style.color="#5A5F78"}>✕</button>
                            )}
                          </div>
                          {fItemSearch.trim()&&(
                            <div style={{position:"absolute",zIndex:100,top:"100%",left:0,right:0,marginTop:3,background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:5,boxShadow:"0 6px 24px rgba(0,0,0,.5)",maxHeight:200,overflowY:"auto"}}>
                              {filteredIds.length===0
                                ?<div style={{padding:"10px 12px",color:"#4A4F65",fontSize:11}}>No items found in selected date range</div>
                                :filteredIds.map(id=>{
                                  const nm=items.find(i=>i.id===id)?.name||"";
                                  return(
                                    <div key={id} onClick={()=>{setFItem(id);setFItemSearch("");}}
                                      style={{padding:"8px 12px",cursor:"pointer",fontSize:11,borderBottom:"1px solid #1E2135",display:"flex",justifyContent:"space-between",alignItems:"center",background:fItem===id?"rgba(0,212,170,.08)":"transparent"}}
                                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.04)"}
                                      onMouseLeave={e=>e.currentTarget.style.background=fItem===id?"rgba(0,212,170,.08)":"transparent"}>
                                      <span style={{color:"#5A5F78",marginRight:8,fontSize:10}}>{id}</span>
                                      <span style={{color:"#C8CADC",flex:1}}>{nm}</span>
                                    </div>
                                  );
                                })
                              }
                              <div style={{padding:"6px 12px",fontSize:9,color:"#4A4F65",borderTop:"1px solid #1E2135"}}>{filteredIds.length} item{filteredIds.length!==1?"s":""} in selected date range</div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{flex:"1 1 150px",minWidth:130}}>
                    <label>Order Number</label>
                    <input placeholder="Type to search…" value={fOrder} onChange={e=>setFOrder(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Escape"&&setFOrder("")}/>
                  </div>
                  <div style={{flex:"1 1 320px",minWidth:280}}>
                    <label>Date Range</label>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <input type="date" value={fFrom} onChange={e=>setFFrom(e.target.value)} style={{flex:1,minWidth:0}}/>
                      <span style={{color:"#5A5F78",fontSize:10,flexShrink:0}}>→</span>
                      <input type="date" value={fTo} onChange={e=>setFTo(e.target.value)} style={{flex:1,minWidth:0}}/>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0,paddingBottom:1}}>
                    {(()=>{const t=new Date().toLocaleDateString("en-CA",{timeZone:"Pacific/Auckland"});const isToday=fFrom===t&&fTo===t;return(
                      <button className="bg" style={{whiteSpace:"nowrap",fontSize:11,padding:"9px 14px",...(isToday?{borderColor:"#00D4AA",color:"#00D4AA",background:"rgba(0,212,170,.07)"}:{})}}
                        onClick={()=>{setFFrom(t);setFTo(t);}}>Today</button>
                    );})()}
                    <button className="bg" style={{whiteSpace:"nowrap",fontSize:11,padding:"9px 14px"}}
                      onClick={async()=>{
                        setFEmp("All");setFLine("All");setFStatus("All");setFItem("All");setFOrder("");setFItemSearch("");setFFrom("");setFTo("");setSortF("created_at");setSortD("desc");
                        if(!allOrders){
                          setRecordsLoading(true);
                          try{const all=await db.getOrders();setAllOrders(all);}catch(e){showToast("Failed to load all records: "+e.message,"error");}
                          setRecordsLoading(false);
                        }
                      }}>✕ Clear All</button>
                  </div>
                </div>
              </div>
              {filteredOrders.length===0
                ?<div className="card" style={{textAlign:"center",padding:48,color:"#4A4F65"}}><div style={{fontSize:40,marginBottom:12}}>📂</div><div>No records found.</div></div>
                :(
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{borderBottom:"1px solid #2A2F45"}}>
                          {[["Order #","order_number"],["Employees","employee"],["Line","line_id"],["Item","item_id"],["Plan Qty","production_qty"],["End Qty","end_qty"],["Std Min",null],["Total Min","actual_minutes"],["Break Min","break_minutes"],["Work Min","working_minutes"],["Actual Min/Pc",null],["Man Hrs",null],["Efficiency","efficiency"],["Start","start_datetime"],["End","end_datetime"],["Duration",null],["Status","status"],["Remarks",null],["Action",null]].map(([h,f])=>(
                            <th key={h} className={f?"sortable":""} onClick={f?()=>handleSort(f):undefined}
                              style={{padding:"9px 10px",textAlign:"left",color:sortF===f?"#00D4AA":"#5A5F78",letterSpacing:1,fontWeight:600,fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>
                              {h}{f&&<span style={{marginLeft:3,opacity:.6}}>{sortF===f?(sortD==="asc"?"↑":"↓"):"↕"}</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedOrders.map(o=>{
                          const sc=STATUS_COLORS[o.status]||{dot:"#6C757D",bg:""};
                          const dur=o.end_datetime?getDur(o.start_datetime,o.end_datetime):"—";
                          const eff=o.efficiency; const ec=effColor(eff);
                          const stdMin=items.find(i=>i.id===o.item_id)?.std_minutes;
                          const numEmpO=o.num_employees||1; const manHrs=o.working_minutes?((o.working_minutes*numEmpO)/60).toFixed(2):o.actual_minutes?((o.actual_minutes*numEmpO)/60).toFixed(2):null;
                          return(
                            <tr key={o.id} style={{borderBottom:"1px solid #1E2135"}}>
                              <td style={{padding:"8px 10px",color:"#00D4AA",fontWeight:600,whiteSpace:"nowrap"}}>{o.order_number}{o.was_edited&&<span style={{marginLeft:6,fontSize:8,fontWeight:700,color:"#FF9500",background:"rgba(255,149,0,.1)",border:"1px solid rgba(255,149,0,.2)",padding:"1px 6px",borderRadius:8}}>✎</span>}</td>
                              <td style={{padding:"8px 10px",color:"#C8CADC",maxWidth:150}}>
                                <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.employees?.join(", ")||o.employee}</div>
                                {(o.num_employees||1)>1&&<div style={{fontSize:10,color:"#FF9500"}}>👥 {o.num_employees}</div>}
                              </td>
                              <td style={{padding:"8px 10px",color:"#7B8CFF"}}>
                                <div style={{fontSize:10,color:"#5A5F78"}}>{o.line_id}</div>
                                <div style={{whiteSpace:"nowrap"}}>{o.line_name}</div>
                              </td>
                              <td style={{padding:"8px 10px",color:"#8B90A8"}}>
                                <div style={{fontSize:10,color:"#5A5F78"}}>{o.item_id}</div>
                                <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{o.item_name}</div>
                              </td>
                              <td style={{padding:"8px 10px",textAlign:"center"}}>{o.production_qty}</td>
                              <td style={{padding:"8px 10px",textAlign:"center",color:o.end_qty!=null?"#00D4AA":"#4A4F65"}}>{o.end_qty??"—"}</td>
                              <td style={{padding:"8px 10px",textAlign:"center",color:"#7B8CFF"}}>{stdMin??<span style={{color:"#4A4F65"}}>—</span>}</td>
                              <td style={{padding:"8px 10px",textAlign:"center",color:"#C8CADC"}}>{o.actual_minutes!=null?Math.round(o.actual_minutes):<span style={{color:"#4A4F65"}}>—</span>}</td>
                              <td style={{padding:"8px 10px",textAlign:"center",color:"#FF9500"}}>{o.break_minutes?Math.round(o.break_minutes):<span style={{color:"#4A4F65"}}>0</span>}</td>
                              <td style={{padding:"8px 10px",textAlign:"center",color:"#00D4AA"}}>{o.working_minutes!=null?(Math.round(o.working_minutes*10)/10).toFixed(1):<span style={{color:"#4A4F65"}}>—</span>}</td>
                              <td style={{padding:"8px 10px",textAlign:"center"}}>
                                {(()=>{
                                  if(o.working_minutes==null||!o.end_qty||o.end_qty<=0) return <span style={{color:"#4A4F65"}}>—</span>;
                                  const actualMinPc=(o.working_minutes*(o.num_employees||1))/o.end_qty;
                                  let color="#C8CADC";
                                  if(stdMin){
                                    const ratio=actualMinPc/stdMin;
                                    color=ratio<=1?"#00D4AA":ratio<=1.3?"#FFC107":"#FF4B6E";
                                  }
                                  return <span style={{color,fontWeight:700}}>{actualMinPc.toFixed(2)}</span>;
                                })()}
                              </td>
                              <td style={{padding:"8px 10px",textAlign:"center",color:"#FF9500"}}>{manHrs?manHrs+"h":<span style={{color:"#4A4F65"}}>—</span>}</td>
                              <td style={{padding:"8px 10px",textAlign:"center"}}>
                                {eff!=null?(
                                  <div>
                                    <span style={{color:ec,fontWeight:700}}>{eff}%</span>
                                    <div className="eff-bar" style={{width:60}}><div className="eff-fill" style={{width:`${Math.min(eff,150)}%`,background:ec}}/></div>
                                  </div>
                                ):<span style={{color:"#4A4F65"}}>—</span>}
                              </td>
                              <td style={{padding:"8px 10px",color:"#8B90A8",whiteSpace:"nowrap",fontSize:11}}>{fmt(o.start_datetime)}</td>
                              <td style={{padding:"8px 10px",color:"#8B90A8",whiteSpace:"nowrap",fontSize:11}}>{fmt(o.end_datetime)}</td>
                              <td style={{padding:"8px 10px",color:"#7B8CFF",whiteSpace:"nowrap"}}>{dur}</td>
                              <td style={{padding:"8px 10px"}}>
                                <span className="tag" style={{background:sc.bg,color:sc.dot,border:`1px solid ${sc.dot}44`}}>
                                  <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>
                                  {o.status}
                                </span>
                              </td>
                              <td style={{padding:"8px 10px",color:"#8B90A8",fontSize:11}}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{o.remarks||"—"}</div></td>
                              <td style={{padding:"8px 10px"}}>
                                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                                  {isAdmin&&<button onClick={()=>openEditTimes(o)} style={{background:"rgba(255,149,0,.1)",color:"#FF9500",border:"1px solid rgba(255,149,0,.3)",padding:"4px 9px",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:10,cursor:"pointer",borderRadius:4,whiteSpace:"nowrap"}}>🕐 Edit</button>}
                                  {o.status==="In Progress"&&!o.is_paused&&<button className="bd" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>openClose(o)}>⏹ End</button>}
                                  {o.is_paused&&<span style={{fontSize:10,color:"#FF9500"}}>On Break</span>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              }
              {/* Pagination controls */}
              {filteredOrders.length>0&&(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14,flexWrap:"wrap",gap:10}}>
                  <div style={{fontSize:11,color:"#5A5F78"}}>
                    Showing {(safePage-1)*pageSize+1}–{Math.min(safePage*pageSize,filteredOrders.length)} of {filteredOrders.length} records
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))} style={{fontSize:11,padding:"5px 10px",width:"auto"}}>
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                      <option value={200}>200 / page</option>
                    </select>
                    <button className="bg" disabled={safePage<=1} onClick={()=>setCurPage(p=>Math.max(1,p-1))} style={{fontSize:11,padding:"6px 12px",opacity:safePage<=1?0.35:1}}>‹ Prev</button>
                    <span style={{fontSize:11,color:"#00D4AA",fontWeight:700,padding:"6px 12px",background:"rgba(0,212,170,.08)",border:"1px solid rgba(0,212,170,.2)",borderRadius:4}}>{safePage} / {totalPages}</span>
                    <button className="bg" disabled={safePage>=totalPages} onClick={()=>setCurPage(p=>Math.min(totalPages,p+1))} style={{fontSize:11,padding:"6px 12px",opacity:safePage>=totalPages?0.35:1}}>Next ›</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ ADMIN ═══ */}
          {view==="admin"&&isAdmin&&<AdminPanel items={items} setItems={setItems} employees={employees} setEmployees={setEmployees} lines={lines} setLines={setLines} showToast={showToast} reload={loadAll} user={user}/>}
          </>
        )}
      </div>

      {/* CLOSE MODAL */}
      {cm&&(()=>{
        const endQty=Number(cf.endQty);
        const planQty=cm.production_qty||0;
        const hasQty=cf.endQty!=""&&endQty>0;
        const isShort=hasQty&&endQty<planQty;
        const isOver=hasQty&&endQty>planQty;
        const needsReason=isShort&&!cf.remarks.trim();
        const canClose=hasQty&&!needsReason&&!isOver;
        const item=items.find(i=>i.id===cm.item_id);
        const stdMin=item?.std_minutes||null;
        // Live efficiency preview — segmented if swap occurred
        const previewEff=(()=>{
          if(!hasQty||!stdMin) return null;
          if(cm.employee_segments&&cm.employee_segments.length>0){
            const segs=[...cm.employee_segments];
            const completedSegs=segs.slice(0,-1);
            const completedWorkMins=completedSegs.reduce((a,s)=>a+(s.working_minutes||0),0);
            const completedQty=completedSegs.reduce((a,s)=>a+(s.partial_qty||0),0);
            const totalMins=minsTo(cm.start_datetime,nowISO());
            const workMins=Math.max(totalMins-(cm.break_minutes||0),0.1);
            const lastWorkMins=Math.max(0,workMins-completedWorkMins);
            const lastNumEmp=segs[segs.length-1].num_employees||1;
            const lastQty=Math.max(0,endQty-completedQty);
            const allSegs=[...completedSegs,{num_employees:lastNumEmp,partial_qty:lastQty,working_minutes:lastWorkMins}];
            const collapsed=[];
            for(const seg of allSegs){
              const prev=collapsed[collapsed.length-1];
              if(prev&&prev.num_employees===seg.num_employees){
                prev.working_minutes=(prev.working_minutes||0)+(seg.working_minutes||0);
                prev.partial_qty=(prev.partial_qty||0)+(seg.partial_qty||0);
              } else { collapsed.push({...seg}); }
            }
            const totalStdWork=collapsed.reduce((a,s)=>a+(stdMin*(s.partial_qty||0)),0);
            const totalActualWork=collapsed.reduce((a,s)=>a+((s.working_minutes||0)*(s.num_employees||1)),0);
            return totalActualWork>0?Math.round((totalStdWork/totalActualWork)*100):null;
          }
          const totalMins=minsTo(cm.start_datetime,nowISO());
          const workMins=Math.max(totalMins-(cm.break_minutes||0),0.1);
          return calcEff(stdMin,endQty,workMins,cm.num_employees||1);
        })();

        return(
        <div className="mo" onClick={e=>e.target===e.currentTarget&&setCm(null)}>
          <div className="md au">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
              <h3 style={{fontSize:14,color:"#E8EAF0",letterSpacing:1}}>⏹ CLOSE ORDER</h3>
              <button className="bg" style={{padding:"4px 10px"}} onClick={()=>setCm(null)}>✕</button>
            </div>
            <div style={{background:"#13161F",borderRadius:6,padding:"12px 16px",marginBottom:18}}>
              <div style={{fontSize:17,color:"#00D4AA",fontWeight:700}}>{cm.order_number}</div>
              <div style={{fontSize:12,color:"#8B90A8",marginTop:4}}>{cm.item_id} — {cm.item_name}</div>
              <div style={{fontSize:11,color:"#5A5F78",marginTop:2}}>Line: <span style={{color:"#7B8CFF"}}>{cm.line_id} — {cm.line_name}</span></div>
              <div style={{fontSize:11,color:"#5A5F78"}}>Employees: <span style={{color:"#C8CADC"}}>{cm.employees?.join(", ")||cm.employee}</span> <span style={{color:"#FF9500"}}>({cm.num_employees||1} 👥)</span></div>
              <div style={{fontSize:11,color:"#5A5F78"}}>Plan Qty: <span style={{color:"#C8CADC",fontWeight:700}}>{planQty}</span> | Breaks: <span style={{color:"#FF9500"}}>{(cm.breaks||[]).length} ({Math.round(cm.break_minutes||0)} min)</span></div>
              {(()=>{
                const it=items.find(i=>i.id===cm.item_id);
                const hasSwap=cm.employee_segments&&cm.employee_segments.length>0;
                return it?.std_minutes?(
                  <div style={{fontSize:11,color:"#7B8CFF",marginTop:4}}>
                    {hasSwap
                      ?<span>{"⏱ Segmented: "}{cm.employee_segments.length}{" segments — sum(std\u00d7qty) \u00f7 sum(work\u00d7emp) \u00d7 100"}</span>
                      :`⏱ Std ${it.std_minutes} min/piece \u00d7 end_qty \u00f7 (working_mins \u00d7 ${cm.num_employees||1} emp) \u00d7 100`}
                  </div>
                ):null;
              })()}
              {previewEff!=null&&hasQty&&<div style={{background:"#13161F",borderRadius:5,padding:"8px 12px",marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,color:"#8B90A8"}}>Projected efficiency:</span>
                <span style={{fontSize:15,fontWeight:700,color:effColor(previewEff)}}>{previewEff}%</span>
              </div>}
            </div>
            <div className="fg"><label>End Date & Time (Auto)</label><input value={fmt(nowISO())} readOnly style={{color:"#00D4AA",opacity:.8}}/></div>

            {/* End Quantity field with validation */}
            <div className="fg">
              <label>Ending Quantity <span style={{color:"#FF4B6E"}}>*</span></label>
              <input type="number" min="0" placeholder="Actual produced quantity"
                value={cf.endQty}
                onChange={e=>setCf(f=>({...f,endQty:e.target.value}))}
                autoFocus
                style={!hasQty&&cf.endQty!==""?{borderColor:"#FF4B6E"}:isShort?{borderColor:"#FF9500"}:isOver?{borderColor:"#FF4B6E"}:hasQty?{borderColor:"#00D4AA"}:{}}
              />
              {!hasQty&&cf.endQty!==""&&<div style={{fontSize:10,color:"#FF4B6E",marginTop:4,display:"flex",alignItems:"center",gap:5}}>⚠ End quantity must be greater than 0</div>}
              {isShort&&<div style={{fontSize:10,color:"#FF9500",marginTop:4,display:"flex",alignItems:"center",gap:5}}>⚠ End qty ({endQty}) is less than plan qty ({planQty}) — reason required below</div>}
              {isOver&&<div style={{fontSize:10,color:"#FF4B6E",marginTop:4,display:"flex",alignItems:"center",gap:5}}>⚠ End qty ({endQty}) exceeds plan qty ({planQty}) — please enter the correct quantity</div>}
              {hasQty&&!isShort&&!isOver&&<div style={{fontSize:10,color:"#00D4AA",marginTop:4,display:"flex",alignItems:"center",gap:5}}>✔ Matches plan quantity</div>}
            </div>

            {/* Remarks field — required if short */}
            <div className="fg">
              <label>
                Remarks
                {isShort&&<span style={{color:"#FF4B6E",fontSize:10,fontWeight:700,letterSpacing:0,marginLeft:6}}>* required — qty below plan</span>}
              </label>
              <textarea rows={3}
                placeholder={isShort?"Explain why end qty is below plan (e.g. material shortage, machine issue)…":"Notes, issues, observations…"}
                value={cf.remarks}
                onChange={e=>setCf(f=>({...f,remarks:e.target.value}))}
                style={needsReason?{borderColor:"#FF4B6E"}:isShort&&cf.remarks.trim()?{borderColor:"#00D4AA"}:{}}
              />
              {needsReason&&<div style={{fontSize:10,color:"#FF4B6E",marginTop:4,display:"flex",alignItems:"center",gap:5}}>⚠ Please explain why end qty is below plan</div>}
              {isShort&&cf.remarks.trim()&&<div style={{fontSize:10,color:"#00D4AA",marginTop:4,display:"flex",alignItems:"center",gap:5}}>✔ Reason provided</div>}
            </div>

            <div style={{display:"flex",gap:10,marginTop:8}}>
              <button
                onClick={handleClose}
                disabled={saving||!canClose}
                style={{flex:1,padding:12,fontSize:13,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,border:"none",cursor:canClose?"pointer":"not-allowed",borderRadius:4,
                  background:!canClose?"#2A2F45":isShort?"#FF9500":"#FF4B6E",
                  color:!canClose?"#5A5F78":isShort?"#0F1117":"#FFFFFF",
                  opacity:saving?0.6:1,
                }}>
                {saving?"Saving…":!hasQty?"⏹ CLOSE ORDER — Enter quantity first":isOver?"⏹ CLOSE ORDER — Correct qty first":needsReason?"⏹ CLOSE ORDER — Enter reason first":isShort?`⏹ CLOSE ORDER (${endQty} of ${planQty})`:"⏹ CLOSE ORDER"}
              </button>
              <button className="bg" onClick={()=>setCm(null)}>Cancel</button>
            </div>
            {!canClose&&hasQty&&needsReason&&<div style={{fontSize:9,color:"#FF9500",textAlign:"center",marginTop:6}}>Enter a reason for short quantity to enable closing</div>}
            {!canClose&&isOver&&<div style={{fontSize:9,color:"#FF4B6E",textAlign:"center",marginTop:6}}>End quantity cannot exceed plan quantity</div>}
            {!hasQty&&<div style={{fontSize:9,color:"#5A5F78",textAlign:"center",marginTop:6}}>Enter end quantity to enable closing</div>}
          </div>
        </div>
        );
      })()}

      {/* SWAP EMPLOYEE MODAL (Admin only) */}
      {swapOrder&&(
        <SwapEmployeeModal
          order={swapOrder}
          employees={employees}
          user={user}
          onSaved={handleSwapSaved}
          onClose={()=>setSwapOrder(null)}
          showToast={showToast}
        />
      )}

      {/* EDIT TIMES MODAL (Admin only) */}
      {editOrder&&(
        <EditTimesModal
          order={editOrder}
          item={items.find(i=>i.id===editOrder.item_id)}
          user={user}
          onSaved={handleEditSaved}
          onClose={()=>setEditOrder(null)}
          showToast={showToast}
        />
      )}

      {/* TOAST */}
      {toast&&(
        <div className="ti" style={{position:"fixed",bottom:24,right:24,background:toast.type==="error"?"#FF4B6E":toast.type==="warn"?"#FF9500":"#00D4AA",color:toast.type==="error"?"#fff":"#0F1117",padding:"12px 20px",borderRadius:6,fontSize:13,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.4)",zIndex:300,maxWidth:420}}>
          {toast.type==="error"?"⚠ ":toast.type==="warn"?"⚠ ":"✔ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════
function Dashboard({orders,todayOrders,todayDone,todayEffAvg,activeOrders,items,isAdmin,onNewOrder,onClose,onPause,onResume,onEditTimes,onSwap,reload,activeSearch,setActiveSearch,yearStats}){
  const td=new Date().toLocaleDateString("en-CA",{timeZone:NZ_TZ});
  const toLocalDate=dt=>{if(!dt)return"";return new Date(dt).toLocaleDateString("en-CA",{timeZone:NZ_TZ});};
  const curMonth=td.slice(0,7); // YYYY-MM

  // Month stats — from currently loaded orders (already scoped to current month + active)
  const monthCompleted=orders.filter(o=>o.status==="Completed"&&toLocalDate(o.start_datetime).slice(0,7)===curMonth);
  const monthOrdersCount=orders.filter(o=>toLocalDate(o.start_datetime).slice(0,7)===curMonth).length;
  const monthEffVals=monthCompleted.filter(o=>o.efficiency!=null).map(o=>o.efficiency);
  const monthEffAvg=monthEffVals.length?Math.round(monthEffVals.reduce((a,b)=>a+b,0)/monthEffVals.length):null;

  // Year stats — from lightweight Tier 2 summary (loads slightly after dashboard)
  const yearOrdersCount=yearStats?.orders?.length||0;
  const yearEffVals=(yearStats?.orders||[]).filter(o=>o.status==="Completed"&&o.efficiency!=null).map(o=>o.efficiency);
  const yearEffAvg=yearEffVals.length?Math.round(yearEffVals.reduce((a,b)=>a+b,0)/yearEffVals.length):null;
  const yearLoading=yearStats?.loading;

  let todayManMins=0;
  activeOrders.forEach(o=>{const numE=o.num_employees||1;if(!o.is_paused)todayManMins+=((Date.now()-new Date(o.start_datetime)-((o.break_minutes||0)*60000))/60000)*numE;else todayManMins+=(minsTo(o.start_datetime,o.paused_at||nowISO())-(o.break_minutes||0))*numE;});
  orders.filter(o=>o.status==="Completed"&&toLocalDate(o.start_datetime)===td).forEach(o=>{todayManMins+=(o.working_minutes||o.actual_minutes||0)*(o.num_employees||1);});
  const todayManHrs=(todayManMins/60).toFixed(1);

  // Man hours by line (today)
  const mhByLine={};
  const addToLine=(o,mins)=>{
    if(!mhByLine[o.line_id])mhByLine[o.line_id]={id:o.line_id,name:o.line_name,mins:0,emps:[]};
    mhByLine[o.line_id].mins+=mins;
    (o.employees||[o.employee]).forEach(e=>{if(!mhByLine[o.line_id].emps.includes(e))mhByLine[o.line_id].emps.push(e);});
  };
  activeOrders.forEach(o=>{const m=o.is_paused?minsTo(o.start_datetime,o.paused_at||nowISO())-(o.break_minutes||0):((Date.now()-new Date(o.start_datetime))/60000)-(o.break_minutes||0); addToLine(o,Math.max(m,0)*(o.num_employees||1));});
  orders.filter(o=>o.status==="Completed"&&toLocalDate(o.start_datetime)===td).forEach(o=>addToLine(o,(o.working_minutes||o.actual_minutes||0)*(o.num_employees||1)));
  const mhArr=Object.values(mhByLine).sort((a,b)=>b.mins-a.mins);
  const maxMins=Math.max(...mhArr.map(l=>l.mins),1);

  return(
    <div className="au">
      {/* KPI */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,marginBottom:20}}>
        {[
          {label:"TODAY STARTED",   val:todayOrders.length,                        color:"#7B8CFF",icon:"📋"},
          {label:"TODAY COMPLETED", val:todayDone.length,                          color:"#00D4AA",icon:"✅"},
          {label:"TODAY EFF AVG",   val:todayEffAvg!=null?todayEffAvg+"%":"—",     color:effColor(todayEffAvg),icon:"⚡"},
          {label:"ACTIVE ORDERS",   val:activeOrders.length,                       color:"#FFC107",icon:"🔄"},
          {label:"MONTH ORDERS",    val:monthOrdersCount,                          color:"#7B8CFF",icon:"📅"},
          {label:"YEAR ORDERS",     val:yearLoading?"…":yearOrdersCount.toLocaleString(), color:"#7B8CFF",icon:"📆"},
          {label:"MONTH EFF AVG",   val:monthEffAvg!=null?monthEffAvg+"%":"—",     color:effColor(monthEffAvg),icon:"📈"},
          {label:"YEAR EFF AVG",    val:yearLoading?"…":(yearEffAvg!=null?yearEffAvg+"%":"—"), color:effColor(yearEffAvg),icon:"🎯"},
          {label:"TODAY MAN HRS",   val:todayManHrs+"h",                           color:"#FF9500",icon:"👥"},
        ].map(s=>(
          <div key={s.label} className="card" style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,padding:"10px 11px",minWidth:0}}>
            <div style={{fontSize:15}}>{s.icon}</div>
            <div style={{fontSize:16,fontWeight:700,color:s.color,lineHeight:1,whiteSpace:"nowrap"}}>{s.val}</div>
            <div style={{fontSize:7,color:"#5A5F78",letterSpacing:0.8,textTransform:"uppercase",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",width:"100%"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Man Hours by Line */}
      {mhArr.length>0&&(
        <div className="card" style={{marginBottom:18}}>
          <div style={{fontSize:11,color:"#FF9500",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>👥 Man Hours by Line (Today — Working Time Only)</div>
          <div style={{display:"grid",gap:8}}>
            {mhArr.map(l=>{
              const hrs=(l.mins/60).toFixed(2);
              const pct=Math.round((l.mins/maxMins)*100);
              return(
                <div key={l.id} style={{background:"#13161F",borderRadius:6,padding:"9px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,flexWrap:"wrap",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{color:"#7B8CFF",fontWeight:700,fontSize:12}}>{l.id}</span>
                      <span style={{color:"#C8CADC",fontSize:12}}>{l.name}</span>
                      <span style={{background:"rgba(255,149,0,.12)",color:"#FF9500",fontSize:9,padding:"2px 8px",borderRadius:12,fontWeight:700}}>{l.emps.length} emp</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:11,color:"#8B90A8"}}>{l.emps.join(", ")}</span>
                      <span style={{fontSize:15,fontWeight:700,color:"#FF9500"}}>{hrs}h</span>
                    </div>
                  </div>
                  <div style={{height:4,background:"#2A2F45",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:"#FF9500",borderRadius:2}}/></div>
                  <div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>{Math.round(l.mins)} working mins across {l.emps.length} employee{l.emps.length!==1?"s":""}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Orders + Search */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>Active Orders ({activeOrders.length})</h2>
        <div style={{display:"flex",gap:8}}>
          <button className="bg" style={{fontSize:11}} onClick={reload}>↻ Refresh</button>
          <button className="bp" onClick={onNewOrder}>+ New Order</button>
        </div>
      </div>
      {/* Search bar */}
      <div style={{display:"flex",alignItems:"center",gap:10,background:"#13161F",border:"1px solid #2A2F45",borderRadius:7,padding:"8px 14px",marginBottom:12,transition:"border .15s",...(activeSearch?{borderColor:"rgba(0,212,170,.35)"}:{})}}>
        <span style={{color:"#5A5F78",fontSize:14,flexShrink:0}}>🔍</span>
        <input
          placeholder="Search active orders by order number or employee…"
          value={activeSearch}
          onChange={e=>setActiveSearch(e.target.value.toUpperCase())}
          onKeyDown={e=>e.key==="Escape"&&setActiveSearch("")}
          style={{background:"transparent",border:"none",color:activeSearch?"#00D4AA":"#E8EAF0",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,flex:1,outline:"none"}}
        />
        {activeSearch&&(
          <button onClick={()=>setActiveSearch("")} style={{background:"none",border:"none",color:"#5A5F78",cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1}}
            onMouseEnter={e=>e.currentTarget.style.color="#FF4B6E"}
            onMouseLeave={e=>e.currentTarget.style.color="#5A5F78"}>✕</button>
        )}
        {!activeSearch&&<span style={{fontSize:9,color:"#4A4F65",whiteSpace:"nowrap"}}>USB/BT scanner — click here then scan</span>}
      </div>
      {activeOrders.length===0
        ?<div className="card" style={{textAlign:"center",padding:40,color:"#4A4F65"}}><div style={{fontSize:36,marginBottom:10}}>📭</div><div>No active orders.</div></div>
        :<div style={{display:"grid",gap:10}}>{(()=>{
          const q=activeSearch.trim().toUpperCase();
          const withMatch=activeOrders.map(o=>({
            o,
            isMatch:!!q&&(
              o.order_number?.toUpperCase().includes(q)||
              (o.employees||[o.employee]).some(e=>e?.toUpperCase().includes(q))
            ),
          }));
          const sorted=q
            ?[...withMatch.filter(x=>x.isMatch),...withMatch.filter(x=>!x.isMatch)]
            :withMatch;
          const hasMatches=q&&withMatch.some(x=>x.isMatch);
          return sorted.map(({o,isMatch})=>(
            <div key={o.id} id={"order-"+o.id}
              style={{borderRadius:8,transition:"box-shadow .2s,opacity .2s",
                ...(isMatch?{boxShadow:"0 0 0 2px #00D4AA"}:{}),
                ...(hasMatches&&!isMatch?{opacity:.35}:{})}}>
              <OrderCard order={o} item={items.find(i=>i.id===o.item_id)}
                onClose={!o.is_paused?()=>onClose(o):null}
                onPause={!o.is_paused?()=>onPause(o):null}
                onResume={o.is_paused?()=>onResume(o):null}
                onEditTimes={()=>onEditTimes(o)}
                onSwap={()=>onSwap(o)}
                isAdmin={isAdmin}
                highlight={!!isMatch}
              />
            </div>
          ));
        })()}</div>
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ORDER CARD
// ══════════════════════════════════════════════════════════════
function OrderCard({order:o,item,onClose,onPause,onResume,onEditTimes,onSwap,isAdmin}){
  const isPaused=o.is_paused;
  const statusLabel=isPaused?"On Break":o.status;
  const sc=STATUS_COLORS[statusLabel]||{dot:"#6C757D",bg:""};
  const breaks=o.breaks||[];
  const currentBreakMins=isPaused&&o.paused_at?minsTo(o.paused_at,nowISO()):0;
  const totalBreakMins=(o.break_minutes||0)+currentBreakMins;
  const elapsedMins=minsTo(o.start_datetime,nowISO());
  const workMins=Math.max(elapsedMins-totalBreakMins,0);
  return(
    <div style={{background:"#1A1D27",border:`1px solid ${isPaused?"rgba(255,149,0,.3)":"#2A2F45"}`,borderRadius:8,padding:"14px 16px",borderLeft:`3px solid ${sc.dot}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:15,fontWeight:700,color:"#00D4AA"}}>{o.order_number}</span>
          <span className="tag" style={{background:sc.bg,color:sc.dot,border:`1px solid ${sc.dot}44`}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>
            {statusLabel}
          </span>
          {o.efficiency!=null&&<span style={{fontSize:11,fontWeight:700,color:effColor(o.efficiency)}}>⚡ {o.efficiency}%</span>}
          {o.was_edited&&<span style={{fontSize:9,fontWeight:700,color:"#FF9500",background:"rgba(255,149,0,.1)",border:"1px solid rgba(255,149,0,.2)",padding:"2px 8px",borderRadius:10}}>✎ Edited</span>}
        </div>
        <div style={{display:"flex",gap:6}}>
          {isAdmin&&onEditTimes&&<button onClick={onEditTimes} style={{background:"rgba(255,149,0,.1)",color:"#FF9500",border:"1px solid rgba(255,149,0,.3)",padding:"6px 12px",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:11,cursor:"pointer",borderRadius:4}}>🕐 Edit Times</button>}
          {isAdmin&&onSwap&&o.status==="In Progress"&&(
            o.is_paused
              ?<button onClick={onSwap} style={{background:"rgba(123,140,255,.15)",color:"#7B8CFF",border:"1px solid rgba(123,140,255,.4)",padding:"6px 12px",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:11,cursor:"pointer",borderRadius:4}}>👤 Swap</button>
              :<span style={{fontSize:9,color:"#5A5F78",fontStyle:"italic",alignSelf:"center"}}>⏸ Pause to swap</span>
          )}
          {onResume&&<button className="bresume" onClick={onResume}>▶ Resume</button>}
          {onPause&&<button className="bpause" onClick={onPause}>⏸ Break</button>}
          {onClose&&<button className="bd" onClick={onClose} style={{fontSize:11,padding:"6px 12px"}}>⏹ End</button>}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:"5px 16px",marginBottom:10}}>
        {[
          ["Employees",null],
          ["Line",`${o.line_id} — ${o.line_name}`],
          ["Item",`${o.item_id} — ${o.item_name}`],
          ["Plan Qty",o.production_qty],
          ["Started",fmt(o.start_datetime)],
          ...(o.status==="Completed"?[["Ended",fmt(o.end_datetime)],["End Qty",o.end_qty],["Work Min",(Math.round((o.working_minutes||0)*10)/10).toFixed(1)],["Break Min",Math.round(o.break_minutes||0)]]:
            [["Elapsed",getElap(o.start_datetime)],["Working",fmtMins(workMins)],["Break",fmtMins(totalBreakMins)]])
        ].map(([k,v])=>(
          <div key={k}>
            <div style={{fontSize:8,color:"#5A5F72",letterSpacing:1,textTransform:"uppercase"}}>{k}</div>
            {k==="Employees"?(
              <div style={{fontSize:11,marginTop:2}}>
                {(o.employees||[o.employee]).filter(Boolean).map((e,i)=>(
                  <span key={e} style={{color:o.employee_segments?(i===0?"#00D4AA":"#FF9500"):"#C8CADC",marginRight:4}}>
                    {e}
                    {o.employee_segments&&(i===0?(o.employees||[]).length>1?<span style={{color:"#5A5F78",fontSize:9}}> (current)</span>:null:i>0?<span style={{color:"#5A5F78",fontSize:9}}> (prev)</span>:null)}
                    {i<(o.employees||[o.employee]).filter(Boolean).length-1?", ":""}
                  </span>
                ))}
                {(o.num_employees||1)>1&&<span style={{color:"#FF9500",fontSize:10}}> ({o.num_employees}👥)</span>}
              </div>
            ):(
              <div style={{fontSize:11,color:"#C8CADC",marginTop:2}}>{v}</div>
            )}
          </div>
        ))}
      </div>

      {/* Pause banner */}
      {isPaused&&(
        <div className="pause-banner">
          <span style={{fontSize:16}}>⏸</span>
          <div>
            <div style={{fontSize:11,color:"#FF9500",fontWeight:700}}>On break — working timer paused</div>
            <div style={{fontSize:10,color:"#8B90A8",marginTop:1}}>Break started {fmtT(o.paused_at)} · Break time excluded from efficiency calculation</div>
          </div>
        </div>
      )}

      {/* Break log */}
      {breaks.length>0&&(
        <div style={{background:"#13161F",borderRadius:6,padding:"8px 12px",marginTop:6}}>
          <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Break Log</div>
          {breaks.map((b,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:10,color:"#8B90A8",padding:"2px 0",borderBottom:i<breaks.length-1?"1px solid #1E2135":"none"}}>
              <span style={{color:"#FF9500",fontWeight:700,flexShrink:0,width:50}}>Break {i+1}</span>
              <span>{fmtT(b.start)} → {fmtT(b.end)}</span>
              <span style={{marginLeft:"auto",color:"#C8CADC"}}>{Math.round(b.minutes)} min</span>
            </div>
          ))}
          {isPaused&&<div style={{display:"flex",alignItems:"center",gap:8,fontSize:10,color:"#8B90A8",padding:"2px 0"}}>
            <span style={{color:"#FF9500",fontWeight:700,flexShrink:0,width:50}}>Break {breaks.length+1}</span>
            <span>{fmtT(o.paused_at)} → ongoing…</span>
            <span style={{marginLeft:"auto",color:"#FF9500"}}>{Math.round(currentBreakMins)} min</span>
          </div>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  EMPLOYEE PICKER
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
//  SWAP EMPLOYEE MODAL (Admin only, In Progress orders only)
// ══════════════════════════════════════════════════════════════
function SwapEmployeeModal({order:o,employees,user,onSaved,onClose,showToast}){
  const currentEmps=o.employees||[o.employee].filter(Boolean);
  const [selected,setSelected]=useState([...currentEmps]);
  const [empSearch,setEmpSearch]=useState("");
  const [partialQty,setPartialQty]=useState("");
  const [reason,setReason]=useState("");
  const [saving,setSaving]=useState(false);

  const filtered=empSearch.trim()
    ?employees.filter(e=>e.toUpperCase().includes(empSearch.trim().toUpperCase()))
    :employees;

  const toggle=(name)=>setSelected(p=>p.includes(name)?p.filter(x=>x!==name):[...p,name]);

  const handleSave=async()=>{
    if(!reason.trim()){showToast("Please provide a reason for the employee swap.","error");return;}
    if(selected.length===0){showToast("Please select at least one employee.","error");return;}
    setSaving(true);
    try{
      // Keep both old and new in employees array — new first, old after
      const newFirst=selected;
      const prevNotSelected=currentEmps.filter(e=>!selected.includes(e));
      const merged=[...newFirst,...prevNotSelected];

      // ── Build employee_segments with two rules ──
      const existingSegs=o.employee_segments||[];
      const lastSeg=existingSegs[existingSegs.length-1];
      const isReplacing=existingSegs.length>0&&lastSeg&&lastSeg.working_minutes===null&&o.is_paused;

      // Rule 1: working minutes capped at paused_at — NOT at swap-click time
      // Break time is never counted as working time
      const pausedAtMs=new Date(o.paused_at).getTime();
      const startMs=new Date(o.start_datetime).getTime();
      const prevCompletedWorkMins=existingSegs
        .filter(s=>s.working_minutes!==null)
        .reduce((a,s)=>a+(s.working_minutes||0),0);
      const thisSegWorkMins=Math.max(0,
        (pausedAtMs-startMs)/60000 - (o.break_minutes||0) - prevCompletedWorkMins
      );

      let newSegments;
      if(isReplacing){
        // Rule 2: another swap during same pause — replace last placeholder, keep seg working_minutes locked
        newSegments=[
          ...existingSegs.slice(0,-1),
          {num_employees:selected.length, partial_qty:partialQty?Number(partialQty):null, working_minutes:null},
        ];
      } else {
        // First swap during this pause — lock current segment and add new placeholder
        newSegments=[
          ...existingSegs,
          {num_employees:o.num_employees||1, partial_qty:partialQty?Number(partialQty):null, working_minutes:Math.round(thisSegWorkMins*10)/10},
          {num_employees:selected.length, partial_qty:null, working_minutes:null},
        ];
      }

      const patch={employees:merged,employee:merged[0],num_employees:selected.length,employee_segments:newSegments,was_edited:true};
      await db.updateOrder(o.id,patch);
      await db.addOrderEdit({
        order_id:o.id,order_number:o.order_number,
        edited_by:user.username,
        reason:`Employee swap: ${currentEmps.join(", ")} → ${selected.join(", ")}${partialQty?` · Partial qty at swap: ${partialQty}`:""} · ${reason.trim()}`,
        before_data:{employees:currentEmps,num_employees:o.num_employees||1},
        after_data:{employees:merged,num_employees:patch.num_employees},
      });
      showToast(`Employee updated on order ${o.order_number}.`);
      onSaved({...o,...patch});
    }catch(e){showToast("Failed to save: "+e.message,"error");}
    setSaving(false);
  };

  const S={
    inp:{background:"#13161F",border:"1px solid #2A2F45",color:"#E8EAF0",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"7px 9px",borderRadius:4,width:"100%"},
    lbl:{display:"block",fontSize:9,color:"#8B90A8",letterSpacing:1,textTransform:"uppercase",marginBottom:4},
  };

  return(
    <div className="mo" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="md au" style={{maxWidth:520,padding:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <h3 style={{fontSize:12,color:"#7B8CFF",letterSpacing:1,fontWeight:700}}>👤 SWAP EMPLOYEE — {o.order_number}</h3>
          <button className="bg" style={{padding:"3px 8px",fontSize:11}} onClick={onClose}>✕</button>
        </div>

        <div style={{background:"rgba(123,140,255,.07)",border:"1px solid rgba(123,140,255,.2)",borderRadius:5,padding:"8px 12px",marginBottom:12,fontSize:10,color:"#7B8CFF",lineHeight:1.5}}>
          ℹ Order keeps running. Previous employee(s) stay in the record so both appear in efficiency reports.
        </div>

        {/* Current employees */}
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>Current Employee(s)</label>
          <div style={{background:"#13161F",border:"1px solid #2A2F45",borderRadius:4,padding:"8px 10px",display:"flex",flexWrap:"wrap",gap:5}}>
            {currentEmps.map(e=>(
              <span key={e} style={{background:"rgba(255,75,110,.08)",color:"#FF4B6E",border:"1px solid rgba(255,75,110,.2)",padding:"2px 9px",borderRadius:10,fontSize:10,fontWeight:700}}>{e}</span>
            ))}
          </div>
        </div>

        {/* New employee picker */}
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>New Employee(s) <span style={{color:"#FF4B6E"}}>*</span></label>
          <div style={{background:"#13161F",border:"1px solid #00D4AA",borderRadius:4,overflow:"hidden"}}>
            <input
              style={{...S.inp,borderRadius:0,borderBottom:"1px solid #2A2F45",padding:"7px 10px"}}
              placeholder="Search employees…"
              value={empSearch}
              onChange={e=>setEmpSearch(e.target.value)}
            />
            <div style={{maxHeight:130,overflowY:"auto"}}>
              {filtered.map(e=>{
                const chk=selected.includes(e);
                return(
                  <div key={e} onClick={()=>toggle(e)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",cursor:"pointer",fontSize:11,borderBottom:"1px solid #1E2135",background:chk?"rgba(0,212,170,.07)":"transparent"}}
                    onMouseEnter={ev=>ev.currentTarget.style.background=chk?"rgba(0,212,170,.1)":"rgba(255,255,255,.03)"}
                    onMouseLeave={ev=>ev.currentTarget.style.background=chk?"rgba(0,212,170,.07)":"transparent"}>
                    <div style={{width:13,height:13,borderRadius:3,border:`1px solid ${chk?"#00D4AA":"#3A3F55"}`,background:chk?"#00D4AA":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {chk&&<span style={{color:"#0F1117",fontSize:9,fontWeight:700}}>✓</span>}
                    </div>
                    <span style={{color:chk?"#00D4AA":"#C8CADC",fontWeight:chk?700:400}}>{e}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {selected.length>0&&(
            <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
              {selected.map(e=>(
                <span key={e} style={{background:"rgba(0,212,170,.1)",color:"#00D4AA",border:"1px solid rgba(0,212,170,.25)",padding:"2px 9px",borderRadius:10,fontSize:10,fontWeight:700}}>✓ {e}</span>
              ))}
            </div>
          )}
        </div>

        {/* Partial qty + reason */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <label style={S.lbl}>Partial Qty So Far <span style={{color:"#5A5F78",fontSize:8}}>(optional)</span></label>
            <input type="number" min="0" style={S.inp} placeholder="e.g. 75" value={partialQty} onChange={e=>setPartialQty(e.target.value)}/>
            <div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>Pieces done before handover — logged in audit</div>
          </div>
          <div>
            <label style={S.lbl}>Reason <span style={{color:"#FF4B6E"}}>*</span></label>
            <input style={S.inp} placeholder="e.g. Shift change, unwell…" value={reason} onChange={e=>setReason(e.target.value)}/>
          </div>
        </div>

        {/* Preview */}
        {selected.length>0&&(
          <div style={{background:"#13161F",borderRadius:5,padding:"8px 12px",marginBottom:10,fontSize:10}}>
            <div style={{color:"#5A5F78",marginBottom:5}}>After swap:</div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {currentEmps.map(e=>(
                <span key={e} style={{color:"#FF4B6E",textDecoration:"line-through",opacity:.7,fontSize:10}}>{e}</span>
              ))}
              <span style={{color:"#5A5F78"}}>→</span>
              {selected.map(e=>(
                <span key={e} style={{background:"rgba(0,212,170,.1)",color:"#00D4AA",border:"1px solid rgba(0,212,170,.25)",padding:"2px 9px",borderRadius:10,fontSize:10,fontWeight:700}}>{e}</span>
              ))}
              {currentEmps.filter(e=>!selected.includes(e)).length>0&&(
                <span style={{fontSize:9,color:"#5A5F78"}}>+ {currentEmps.filter(e=>!selected.includes(e)).join(", ")} kept in record</span>
              )}
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:8}}>
          <button className="bp" onClick={handleSave} disabled={saving} style={{flex:1,padding:10,fontSize:11,background:"#7B8CFF",border:"none"}}>{saving?"Saving…":"👤 Confirm Swap"}</button>
          <button className="bg" onClick={onClose}>Cancel</button>
        </div>

        <div style={{background:"#13161F",border:"1px solid rgba(123,140,255,.2)",borderRadius:5,padding:"8px 12px",fontSize:9,color:"#8B90A8",lineHeight:1.6,marginTop:10}}>
          📋 <strong style={{color:"#7B8CFF"}}>Audit trail:</strong> Old → new employees, partial qty, reason and timestamp logged to pt_order_edits. Both employees appear in efficiency reports.
        </div>
      </div>
    </div>
  );
}


function toLocalInput(dt){ if(!dt) return ""; return new Date(dt).toLocaleString("sv",{timeZone:NZ_TZ}).slice(0,19).replace(" ","T"); }

function EditTimesModal({order:o,item,user,onSaved,onClose,showToast}){
  const [orderNum,setOrderNum]=useState(o.order_number||"");
  const [endQtyEdit,setEndQtyEdit]=useState(o.end_qty!=null?String(o.end_qty):"");
  const [startDT,setStartDT]=useState(toLocalInput(o.start_datetime));
  const [endDT,setEndDT]=useState(o.end_datetime?toLocalInput(o.end_datetime):"");
  const [breaks,setBreaks]=useState((o.breaks||[]).map(b=>({...b,startInput:toLocalInput(b.start),endInput:toLocalInput(b.end)})));
  const [reason,setReason]=useState("");
  const [saving,setSaving]=useState(false);

  const addBreak=()=>setBreaks(p=>[...p,{startInput:startDT,endInput:startDT,minutes:0}]);
  const removeBreak=i=>setBreaks(p=>p.filter((_,idx)=>idx!==i));
  const updateBreak=(i,field,val)=>setBreaks(p=>p.map((b,idx)=>{
    if(idx!==i) return b;
    const nb={...b,[field]:val};
    if(nb.startInput&&nb.endInput) nb.minutes=Math.max(0,Math.round((new Date(nb.endInput)-new Date(nb.startInput))/6000)/10);
    return nb;
  }));

  const totalBreakMins=breaks.reduce((a,b)=>a+(b.minutes||0),0);
  const totalElapsed=endDT?Math.max(0,(new Date(endDT)-new Date(startDT))/60000):null;
  const newWorkMins=totalElapsed!=null?Math.max(0,totalElapsed-totalBreakMins):null;
  const resolvedEndQty=endQtyEdit!==""?Number(endQtyEdit):o.end_qty;
  const newEff=newWorkMins!=null?calcEff(item?.std_minutes,resolvedEndQty,newWorkMins,o.num_employees||1):null;

  const handleSave=async()=>{
    if(!reason.trim()){showToast("Please provide a reason for this edit.","error");return;}
    if(!orderNum.trim()){showToast("Order number cannot be empty.","error");return;}
    setSaving(true);
    try{
      const beforeData={order_number:o.order_number,end_qty:o.end_qty,start_datetime:o.start_datetime,end_datetime:o.end_datetime,breaks:o.breaks,break_minutes:o.break_minutes,working_minutes:o.working_minutes,actual_minutes:o.actual_minutes,efficiency:o.efficiency};
      const newBreaksArr=breaks.map(b=>({start:new Date(b.startInput).toISOString(),end:new Date(b.endInput).toISOString(),minutes:b.minutes}));
      const patch={
        order_number:orderNum.trim().toUpperCase(),
        start_datetime:new Date(startDT).toISOString(),
        breaks:newBreaksArr,
        break_minutes:totalBreakMins,
        was_edited:true,
      };
      if(o.status==="Completed"&&endDT){
        patch.end_datetime=new Date(endDT).toISOString();
        patch.actual_minutes=Math.round(totalElapsed*10)/10;
        patch.working_minutes=Math.round(newWorkMins*10)/10;
        patch.efficiency=newEff;
      }
      if(endQtyEdit!==""&&Number(endQtyEdit)!==o.end_qty){
        patch.end_qty=Number(endQtyEdit);
        if(newWorkMins!=null) patch.efficiency=newEff;
      }
      await db.updateOrder(o.id,patch);
      await db.addOrderEdit({order_id:o.id,order_number:patch.order_number,edited_by:user.username,reason:reason.trim(),before_data:beforeData,after_data:patch});
      showToast(`Order ${patch.order_number} updated.`);
      onSaved({...o,...patch});
    }catch(e){showToast("Failed to save: "+e.message,"error");}
    setSaving(false);
  };

  const S={inp:{background:"#13161F",border:"1px solid #2A2F45",color:"#E8EAF0",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"7px 9px",borderRadius:4,width:"100%"},
    lbl:{display:"block",fontSize:9,color:"#8B90A8",letterSpacing:1,textTransform:"uppercase",marginBottom:4},
    secLbl:{display:"block",fontSize:8,color:"#5A5F78",letterSpacing:2,textTransform:"uppercase",marginBottom:7},
    row2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8},
    hint:{fontSize:9,color:"#5A5F78",marginTop:3},
    preview:{background:"#13161F",borderRadius:5,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  };

  return(
    <div className="mo" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="md au" style={{maxWidth:600,padding:16}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <h3 style={{fontSize:12,color:"#FF9500",letterSpacing:1,fontWeight:700}}>🕐 EDIT ORDER — {o.order_number}</h3>
          <button className="bg" style={{padding:"3px 8px",fontSize:11}} onClick={onClose}>✕</button>
        </div>

        {/* Warning */}
        <div style={{background:"rgba(255,149,0,.07)",border:"1px solid rgba(255,149,0,.2)",borderRadius:5,padding:"8px 12px",marginBottom:12,fontSize:10,color:"#FF9500",display:"flex",alignItems:"flex-start",gap:7,lineHeight:1.5}}>
          <span>⚠</span><span>Editing affects records and efficiency. All changes are logged with reason.</span>
        </div>

        {/* Section 1: Order Details (NEW) */}
        <span style={S.secLbl}>Order Details <span style={{background:"rgba(255,149,0,.1)",color:"#FF9500",border:"1px solid rgba(255,149,0,.2)",fontSize:7,padding:"1px 5px",borderRadius:6,fontWeight:700,marginLeft:5,verticalAlign:"middle"}}>NEW</span></span>
        <div style={S.row2}>
          <div>
            <label style={S.lbl}>Order Number</label>
            <input value={orderNum} onChange={e=>setOrderNum(e.target.value.toUpperCase())}
              style={{...S.inp,borderColor:"#FF9500",background:"rgba(255,149,0,.04)"}}/>
            <div style={S.hint}>⚠ Updates order number permanently</div>
          </div>
          <div>
            <label style={S.lbl}>End Qty {o.status!=="Completed"&&<span style={{color:"#5A5F78",fontSize:8}}>(completed only)</span>}</label>
            <input type="number" min="0"
              value={endQtyEdit}
              onChange={e=>setEndQtyEdit(e.target.value)}
              disabled={o.status!=="Completed"}
              style={{...S.inp,borderColor:"#FF9500",background:"rgba(255,149,0,.04)",...(o.status!=="Completed"?{opacity:.4}:{})}}/>
            <div style={S.hint}>Plan qty: {o.production_qty||"—"} · recalculates efficiency</div>
          </div>
        </div>

        <div style={{height:1,background:"#2A2F45",margin:"10px 0"}}/>

        {/* Section 2: Times */}
        <span style={S.secLbl}>Times</span>
        <div style={S.row2}>
          <div>
            <label style={S.lbl}>Start Date & Time</label>
            <input type="datetime-local" step="1" value={startDT} onChange={e=>setStartDT(e.target.value)} style={S.inp}/>
          </div>
          <div>
            <label style={S.lbl}>End Date & Time {o.status!=="Completed"&&<span style={{color:"#5A5F78",fontSize:8}}>(completed only)</span>}</label>
            <input type="datetime-local" step="1" value={endDT} onChange={e=>setEndDT(e.target.value)}
              disabled={o.status!=="Completed"}
              style={{...S.inp,...(o.status!=="Completed"?{opacity:.4}:{})}}/>
          </div>
        </div>

        <div style={{height:1,background:"#2A2F45",margin:"10px 0"}}/>

        {/* Section 3: Break log */}
        <span style={S.secLbl}>Break Log <span style={{color:"#7B8CFF",fontSize:8,textTransform:"none",letterSpacing:0}}>— edit, add or remove missed breaks</span></span>
        {breaks.map((b,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
            <span style={{color:"#FF9500",fontWeight:700,fontSize:10,width:48,flexShrink:0}}>Break {i+1}</span>
            <input type="datetime-local" step="1" value={b.startInput} onChange={e=>updateBreak(i,"startInput",e.target.value)}
              style={{...S.inp,flex:1,minWidth:0,fontSize:10,padding:"6px 7px",borderColor:"#FF9500"}}/>
            <span style={{color:"#5A5F78",fontSize:11}}>→</span>
            <input type="datetime-local" step="1" value={b.endInput} onChange={e=>updateBreak(i,"endInput",e.target.value)}
              style={{...S.inp,flex:1,minWidth:0,fontSize:10,padding:"6px 7px",borderColor:"#FF9500"}}/>
            <span style={{color:"#FF9500",fontSize:10,width:42,textAlign:"right",flexShrink:0}}>{Math.round(b.minutes||0)} min</span>
            <button onClick={()=>removeBreak(i)} style={{background:"none",border:"none",color:"#FF4B6E",cursor:"pointer",fontSize:13,padding:"0 2px",flexShrink:0}}>✕</button>
          </div>
        ))}
        <button className="bg" onClick={addBreak} style={{fontSize:10,padding:"4px 10px",marginBottom:10}}>+ Add Missed Break</button>

        <div style={{height:1,background:"#2A2F45",margin:"10px 0"}}/>

        {/* Section 4: Preview */}
        <span style={S.secLbl}>Recalculated Preview</span>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div style={S.preview}>
            <span style={{fontSize:10,color:"#8B90A8"}}>Working time:</span>
            <span style={{fontSize:13,fontWeight:700,color:"#00D4AA"}}>{newWorkMins!=null?fmtMins(newWorkMins):"— active —"}</span>
          </div>
          <div style={S.preview}>
            <span style={{fontSize:10,color:"#8B90A8"}}>Efficiency:</span>
            <span style={{fontSize:13,fontWeight:700,color:newEff!=null?effColor(newEff):"#5A5F78"}}>{newEff!=null?newEff+"%":"—"}</span>
          </div>
        </div>

        {/* Reason */}
        <div style={{marginBottom:10}}>
          <label style={S.lbl}>Reason for edit <span style={{color:"#FF4B6E"}}>*required</span></label>
          <input style={S.inp} placeholder="e.g. Wrong end qty entered at close, corrected to 95" value={reason} onChange={e=>setReason(e.target.value)}/>
        </div>

        {/* Buttons */}
        <div style={{display:"flex",gap:8}}>
          <button className="bp" onClick={handleSave} disabled={saving} style={{flex:1,padding:10,fontSize:11}}>{saving?"Saving…":"✔ Save Changes"}</button>
          <button className="bg" onClick={onClose}>Cancel</button>
        </div>

        <div style={{background:"#13161F",border:"1px solid rgba(255,149,0,.2)",borderRadius:5,padding:"8px 12px",fontSize:9,color:"#8B90A8",lineHeight:1.6,marginTop:10}}>
          📋 <strong style={{color:"#FF9500"}}>Audit trail:</strong> All changes (order number, end qty, times, breaks, reason) logged to pt_order_edits with before/after values.
        </div>
      </div>
    </div>
  );
}

function EmployeePicker({employees,selected,onChange}){
  const [q,setQ]=useState("");
  const filtered=q.trim()?employees.filter(e=>e.toLowerCase().includes(q.toLowerCase())):employees;
  const toggle=name=>selected.includes(name)?onChange(selected.filter(e=>e!==name)):onChange([...selected,name]);
  return(
    <div>
      <div style={{background:"#1A1D27",border:"1px solid #00D4AA",borderRadius:4,overflow:"hidden"}}>
        <input placeholder="Search employees…" value={q} onChange={e=>setQ(e.target.value)}
          style={{background:"#13161F",border:"none",borderBottom:"1px solid #2A2F45",color:"#E8EAF0",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,padding:"8px 12px",width:"100%",outline:"none"}}/>
        <div style={{maxHeight:150,overflowY:"auto"}}>
          {filtered.length===0&&<div style={{padding:"10px 14px",color:"#4A4F65",fontSize:12}}>No employees found.</div>}
          {filtered.map(e=>{
            const on=selected.includes(e);
            return(
              <div key={e} onClick={()=>toggle(e)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid #1E2135",background:on?"rgba(0,212,170,.07)":"transparent"}}
                onMouseEnter={ev=>ev.currentTarget.style.background=on?"rgba(0,212,170,.1)":"rgba(255,255,255,.02)"}
                onMouseLeave={ev=>ev.currentTarget.style.background=on?"rgba(0,212,170,.07)":"transparent"}>
                <div style={{width:14,height:14,borderRadius:3,border:`1px solid ${on?"#00D4AA":"#3A3F55"}`,background:on?"#00D4AA":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {on&&<span style={{color:"#0F1117",fontSize:10,fontWeight:700,lineHeight:1}}>✓</span>}
                </div>
                <span style={{fontSize:12,color:on?"#00D4AA":"#C8CADC",fontWeight:on?700:400}}>{e}</span>
              </div>
            );
          })}
        </div>
      </div>
      {selected.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
          {selected.map(e=>(
            <div key={e} className="pill">{e}<span onClick={()=>toggle(e)} style={{cursor:"pointer",opacity:.7,fontSize:12}} onMouseEnter={ev=>ev.target.style.opacity=1} onMouseLeave={ev=>ev.target.style.opacity=.7}>✕</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ITEM SEARCH
// ══════════════════════════════════════════════════════════════
function ItemSearch({items,value,onChange,filled}){
  const [q,setQ]=useState(""); const [open,setOpen]=useState(false); const ref=useRef();
  const selected=items.find(i=>i.id===value);
  const filtered=q.trim()?items.filter(i=>i.id.toLowerCase().includes(q.toLowerCase())||i.name.toLowerCase().includes(q.toLowerCase())).slice(0,100):items.slice(0,100);
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{background:"#1A1D27",border:`1px solid ${open?"#00D4AA":filled?"#00D4AA":"#2A2F45"}`,borderRadius:4,padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,color:selected?(filled?"#00D4AA":"#E8EAF0"):"#4A4F65"}}>
        <span>{selected?`${selected.id} — ${selected.name}`:"— Select Item —"}</span>
        <span style={{color:"#5A5F78",fontSize:10}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{position:"absolute",zIndex:999,top:"100%",left:0,right:0,marginTop:4,background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:6,boxShadow:"0 8px 32px rgba(0,0,0,.6)",overflow:"hidden"}}>
          <div style={{padding:8}}><input autoFocus placeholder={`Search ${items.length} items…`} value={q} onChange={e=>setQ(e.target.value)} onClick={e=>e.stopPropagation()} style={{fontSize:12,padding:"7px 12px"}}/></div>
          <div style={{maxHeight:240,overflowY:"auto"}}>
            {filtered.length===0?<div style={{padding:"12px 14px",color:"#4A4F65",fontSize:12}}>No items found.</div>
              :filtered.map(i=>(
                <div key={i.id} onClick={()=>{onChange(i.id);setOpen(false);setQ("");}}
                  style={{padding:"8px 14px",cursor:"pointer",fontSize:12,background:value===i.id?"rgba(0,212,170,.1)":"transparent",color:value===i.id?"#00D4AA":"#C8CADC",borderBottom:"1px solid #1E2135",display:"flex",justifyContent:"space-between"}}
                  onMouseEnter={e=>e.currentTarget.style.background=value===i.id?"rgba(0,212,170,.12)":"rgba(255,255,255,.03)"}
                  onMouseLeave={e=>e.currentTarget.style.background=value===i.id?"rgba(0,212,170,.1)":"transparent"}>
                  <span><span style={{color:"#5A5F78",marginRight:8,fontSize:11}}>{i.id}</span>{i.name}</span>
                  {i.std_minutes&&<span style={{color:"#7B8CFF",fontSize:10}}>{i.std_minutes}min</span>}
                </div>
              ))
            }
            {filtered.length===100&&<div style={{padding:"7px 14px",color:"#4A4F65",fontSize:11,borderTop:"1px solid #1E2135"}}>Showing 100 of {items.length}. Type to narrow.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════════════════════════
function AdminPanel({items,setItems,employees,setEmployees,lines,setLines,showToast,reload,user}){
  const [tab,setTab]=useState("planned");
  const [users,setUsers]=useState([]); const [loadingU,setLoadingU]=useState(true);
  const [newUser,setNewUser]=useState({username:"",password:"",full_name:"",role:"worker"});
  const [newItem,setNewItem]=useState({id:"",name:"",std_minutes:""});
  const [editItem,setEditItem]=useState(null);
  const [itemSearch,setItemSearch]=useState("");
  const [newEmp,setNewEmp]=useState("");
  const [newLine,setNewLine]=useState({id:"",name:""});
  const [saving,setSaving]=useState(false);
  const itemFileRef=useRef(); const plannedFileRef=useRef();
  // planned orders
  const [planned,setPlanned]=useState([]); const [loadingP,setLoadingP]=useState(true);
  const [planPreview,setPlanPreview]=useState(null); const [planSkipped,setPlanSkipped]=useState(0); const [planErrors,setPlanErrors]=useState([]); const [planView,setPlanView]=useState("today");

  useEffect(()=>{
    db.getUsers().then(u=>{setUsers(u);setLoadingU(false);}).catch(()=>setLoadingU(false));
    db.getAllPlanned().then(p=>{setPlanned(p);setLoadingP(false);}).catch(()=>setLoadingP(false));
  },[]);

  // Users
  const addUser=async()=>{
    const{username,password,full_name,role}=newUser;
    if(!username||!password||!full_name){showToast("All fields required.","error");return;}
    setSaving(true);
    try{ const r=await db.addUser({username:username.trim().toLowerCase(),password:password.trim(),full_name:full_name.trim(),role}); setUsers(p=>[...p,r[0]]); setNewUser({username:"",password:"",full_name:"",role:"worker"}); showToast("User added."); }
    catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };
  const toggleUser=async u=>{ try{ await db.updateUser(u.id,{active:!u.active}); setUsers(p=>p.map(x=>x.id===u.id?{...x,active:!x.active}:x)); showToast(u.active?"Deactivated.":"Activated."); }catch{showToast("Failed.","error");} };
  const resetPw=async(u,pw)=>{ if(!pw)return; try{ await db.updateUser(u.id,{password:pw}); showToast(`Password updated for ${u.username}.`); }catch{showToast("Failed.","error");} };

  // Items
  const addItem=async()=>{
    if(!newItem.id||!newItem.name){showToast("ID and Name required.","error");return;}
    if(items.find(i=>i.id===newItem.id.trim().toUpperCase())){showToast("Item ID exists.","error");return;}
    setSaving(true);
    try{ const it={id:newItem.id.trim().toUpperCase(),name:newItem.name.trim(),std_minutes:newItem.std_minutes?Number(newItem.std_minutes):null}; await db.addItem(it); setItems(p=>[...p,it]); setNewItem({id:"",name:"",std_minutes:""}); showToast("Item added."); }
    catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };
  const saveEditItem=async()=>{
    if(!editItem.name){showToast("Name required.","error");return;}
    try{ await db.updateItem(editItem.id,{name:editItem.name,std_minutes:editItem.std_minutes?Number(editItem.std_minutes):null}); setItems(p=>p.map(i=>i.id===editItem.id?{...i,name:editItem.name,std_minutes:editItem.std_minutes?Number(editItem.std_minutes):null}:i)); setEditItem(null); showToast("Updated."); }
    catch(e){showToast("Failed.","error");}
  };
  const delItem=async id=>{ try{ await db.deleteItem(id); setItems(p=>p.filter(i=>i.id!==id)); showToast("Removed."); }catch{showToast("Failed.","error");} };
  const exportItemsCSV=()=>{ const csv=["id,name,std_minutes",...items.map(i=>`"${i.id}","${i.name}","${i.std_minutes??""}"`)].join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="prodtrack_items.csv"; a.click(); showToast(`Exported ${items.length} items.`); };
  const handleItemFile=e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{ const res=parseItemsCSV(ev.target.result); if(res.errors.length)showToast(res.errors[0],"warn"); if(res.items.length){ res.items.forEach(async i=>{ try{ if(!items.find(x=>x.id===i.id))await db.addItem(i); }catch{} }); setTimeout(()=>{reload();showToast(`Imported ${res.items.length} items.`);},1000); } }; r.readAsText(f); e.target.value=""; };

  // Employees
  const addEmp=async()=>{ if(!newEmp.trim()){showToast("Name required.","error");return;} try{ await db.addEmployee({name:newEmp.trim()}); setEmployees(p=>[...p,newEmp.trim()]); setNewEmp(""); showToast("Added."); }catch(e){showToast("Failed.","error");} };
  const delEmp=async name=>{ try{ const all=await db.getEmployees(); const rec=all.find(e=>e.name===name); if(rec)await db.deleteEmployee(rec.id); setEmployees(p=>p.filter(e=>e!==name)); showToast("Removed."); }catch{showToast("Failed.","error");} };

  // Lines
  const addLine=async()=>{ if(!newLine.id||!newLine.name){showToast("ID and Name required.","error");return;} try{ const l={id:newLine.id.trim().toUpperCase(),name:newLine.name.trim()}; await db.addLine(l); setLines(p=>[...p,l]); setNewLine({id:"",name:""}); showToast("Added."); }catch(e){showToast("Failed.","error");} };
  const delLine=async id=>{ try{ await db.deleteLine(id); setLines(p=>p.filter(l=>l.id!==id)); showToast("Removed."); }catch{showToast("Failed.","error");} };

  // Planned orders
  const handlePlannedFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{const res=parsePlannedCSV(ev.target.result);setPlanPreview(res.rows);setPlanSkipped(res.skipped||0);setPlanErrors(res.errors||[]);};r.readAsText(f);e.target.value="";};
  const applyPlanned=async()=>{
    if(!planPreview) return; setSaving(true);
    let added=0, updated=0, protected_=0, failed=0;
    const failedRows=[];
    for(const row of planPreview){
      try{
        const item=items.find(i=>i.id===row.item_id);
        const line=lines.find(l=>l.id===row.line_id);
        // Build payload — only include non-null scheduled_datetime
        // Smart line matching — resolve CSV line_id to actual line in pt_lines
        const matchedLine=findLine(lines,row.line_id);
        const resolvedLineId=matchedLine?matchedLine.id:(row.line_id||null);
        const resolvedLineName=matchedLine?matchedLine.name:(line?.name||"");
        const payload={
          order_number:row.order_number,
          item_id:row.item_id||null,
          item_name:item?.name||"",
          line_id:resolvedLineId,
          line_name:resolvedLineName,
          production_qty:row.production_qty||null,
          status:"pending",
        };
        // Only add scheduled_datetime if it parsed correctly
        if(row.scheduled_datetime) payload.scheduled_datetime=row.scheduled_datetime;

        // Check if already exists
        const existing=await db.findPlanned(row.order_number);
        if(existing.length>0){
          const ex=existing[0];
          if(ex.status==="started"||ex.status==="completed"){ protected_++; continue; }
          const updatePayload={
            item_id:payload.item_id, item_name:payload.item_name,
            line_id:resolvedLineId, line_name:resolvedLineName,
            production_qty:payload.production_qty,
          };
          if(row.scheduled_datetime) updatePayload.scheduled_datetime=row.scheduled_datetime;
          await db.updatePlanned(ex.id, updatePayload);
          updated++;
        } else {
          await db.addPlanned(payload);
          added++;
        }
      }catch(e){
        failed++;
        failedRows.push(`${row.order_number}: ${e.message}`);
        console.error("Import row error:",row.order_number, e.message);
      }
    }
    const fresh=await db.getAllPlanned(); setPlanned(fresh); setPlanPreview(null);
    const parts=[];
    if(added)      parts.push(`${added} imported`);
    if(updated)    parts.push(`${updated} updated`);
    if(protected_) parts.push(`${protected_} skipped (in progress/completed)`);
    if(failed)     parts.push(`${failed} failed`);
    const msg=parts.length?parts.join(" · "):"Nothing to import.";
    showToast(msg, failed>0?"warn":"success");
    // Show first error detail if any failed
    if(failedRows.length>0) setTimeout(()=>showToast("Error: "+failedRows[0],"error"),3600);
    setSaving(false);
  };
  const delPlanned=async id=>{ try{ await db.deletePlanned(id); setPlanned(p=>p.filter(x=>x.id!==id)); showToast("Removed."); }catch(e){showToast("Failed: "+e.message,"error"); console.error("deletePlanned error:",e);} };

  const filtItems=itemSearch.trim()?items.filter(i=>i.id.toLowerCase().includes(itemSearch.toLowerCase())||i.name.toLowerCase().includes(itemSearch.toLowerCase())):items;
  const statusColor={pending:"#7B8CFF",started:"#FFC107",completed:"#00D4AA"};

  const ATABS=[
    {id:"planned",label:`📅 Planned Orders (${planned.filter(p=>p.status==="pending").length} pending)`},
    {id:"users",label:`👥 Users (${users.length})`},
    {id:"items",label:`📦 Items (${items.length})`},
    {id:"employees",label:`👤 Employees (${employees.length})`},
    {id:"lines",label:`🏭 Lines (${lines.length})`},
  ];

  return(
    <div className="au">
      <h2 style={{fontSize:13,color:"#FF9500",letterSpacing:2,textTransform:"uppercase",marginBottom:18}}>⚙ Admin</h2>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #2A2F45",marginBottom:22,flexWrap:"wrap"}}>
        {ATABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"8px 12px",cursor:"pointer",borderRadius:"4px 4px 0 0",color:tab===t.id?"#FF9500":"#8B90A8",borderBottom:tab===t.id?"2px solid #FF9500":"2px solid transparent",fontWeight:tab===t.id?700:400,whiteSpace:"nowrap"}}>{t.label}</button>)}
      </div>

      {/* ── PLANNED ORDERS ── */}
      {tab==="planned"&&(
        <div style={{maxWidth:900}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Upload Pre-planned Orders</div>
            <div style={{fontSize:12,color:"#8B90A8",lineHeight:1.8,marginBottom:10}}>
              CSV columns: <span style={{color:"#00D4AA"}}>order_number, item_id, line_id, production_qty, scheduled_datetime</span>
            </div>
            <div style={{background:"#0F1117",borderRadius:5,padding:"9px 14px",marginBottom:12,fontSize:11,color:"#5A8A7A",lineHeight:1.7}}>
              order_number,item_id,line_id,production_qty,scheduled_datetime<br/>
              ORD-2025-201,ITM-001,LINE-01,100,2026-06-02 08:00<br/>
              ORD-2025-202,ITM-002,LINE-04,200,2026-06-02 09:30
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <input ref={plannedFileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handlePlannedFile}/>
              <button className="bw" onClick={()=>plannedFileRef.current.click()}>⬆ Upload CSV</button>
              <button className="bg" onClick={dlPlannedTemplate}>⬇ Download Template</button>
            </div>
          </div>

          {planPreview&&(
            <div className="card au" style={{marginBottom:14,borderColor:"#00D4AA44"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
                <div style={{fontSize:12,color:"#00D4AA",fontWeight:700}}>✔ Preview: {planPreview.length} orders ready</div>
                {planSkipped>0&&<div style={{fontSize:11,color:"#FF9500"}}>⚠ {planSkipped} blank/empty rows skipped</div>}
              </div>
              {planPreview.slice(0,4).map((r,i)=>(
                <div key={i} style={{fontSize:11,color:"#8B90A8",marginBottom:3}}>
                  • <span style={{color:"#00D4AA"}}>{r.order_number}</span> | {r.item_id||"—"} | {r.line_id||"—"} | Qty:{r.production_qty||"—"} | {r.scheduled_datetime?new Date(r.scheduled_datetime).toLocaleString("en-NZ",{timeZone:NZ_TZ}):"—"}
                </div>
              ))}
              {planPreview.length>4&&<div style={{fontSize:11,color:"#4A4F65",marginBottom:8}}>…and {planPreview.length-4} more</div>}
              <div style={{display:"flex",gap:10,marginTop:12}}>
                <button className="bp" onClick={applyPlanned} disabled={saving} style={{flex:1}}>{saving?"Importing…":"➕ Import All"}</button>
                <button className="bg" onClick={()=>{setPlanPreview(null);setPlanSkipped(0);}}>Cancel</button>
              </div>
            </div>
          )}

          <div className="card" style={{padding:"12px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,textTransform:"uppercase"}}>
                {planView==="today"
                  ?`Today's Orders (${planned.filter(p=>{const d=new Date(p.scheduled_datetime||p.created_at);return d.toLocaleDateString("en-CA",{timeZone:NZ_TZ})===new Date().toLocaleDateString("en-CA",{timeZone:NZ_TZ});}).length} of ${planned.length})`
                  :`All Planned Orders (${planned.length})`}
              </div>
              <div style={{display:"flex",background:"#13161F",border:"1px solid #2A2F45",borderRadius:6,overflow:"hidden"}}>
                {[["today","📅 Today"],["all","All"]].map(([v,lbl])=>(
                  <button key={v} onClick={()=>setPlanView(v)} style={{
                    background:planView===v?"rgba(0,212,170,.1)":"none",
                    border:"none",borderRight:v==="today"?"1px solid #2A2F45":"none",
                    fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"5px 14px",cursor:"pointer",
                    color:planView===v?"#00D4AA":"#8B90A8",fontWeight:planView===v?700:400,
                    whiteSpace:"nowrap",
                  }}>{lbl}</button>
                ))}
              </div>
            </div>
            {loadingP?<div style={{padding:"12px 16px",color:"#4A4F65"}}>Loading…</div>:(()=>{
              const todayNZ=new Date().toLocaleDateString("en-CA",{timeZone:NZ_TZ});
              const displayed=planView==="today"
                ?planned.filter(p=>p.scheduled_datetime&&new Date(p.scheduled_datetime).toLocaleDateString("en-CA",{timeZone:NZ_TZ})===todayNZ)
                :planned;
              return(
                <div style={{maxHeight:440,overflowY:"auto"}}>
                  {displayed.length===0
                    ?<div style={{padding:"24px 16px",textAlign:"center",color:"#4A4F65",fontSize:12}}>
                        {planView==="today"?"No planned orders for today.":"No planned orders uploaded yet."}
                      </div>
                    :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{borderBottom:"1px solid #2A2F45"}}>{["Order #","Item","Line","Qty","Scheduled","Status",""].map(h=><th key={h} style={{padding:"8px 14px",textAlign:"left",color:"#5A5F78",fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                      <tbody>
                        {displayed.map(p=>(
                          <tr key={p.id} style={{borderBottom:"1px solid #1E2135"}} onMouseEnter={e=>e.currentTarget.style.background="#1E2135"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <td style={{padding:"8px 14px",color:"#00D4AA",fontWeight:700}}>{p.order_number}</td>
                            <td style={{padding:"8px 14px",color:"#8B90A8"}}><div style={{fontSize:10,color:"#5A5F78"}}>{p.item_id}</div><div>{p.item_name}</div></td>
                            <td style={{padding:"8px 14px",color:"#7B8CFF"}}>{p.line_id}</td>
                            <td style={{padding:"8px 14px",textAlign:"center"}}>{p.production_qty??"—"}</td>
                            <td style={{padding:"8px 14px",color:"#8B90A8",fontSize:11}}>{p.scheduled_datetime?fmt(p.scheduled_datetime):"—"}</td>
                            <td style={{padding:"8px 14px"}}><span style={{fontSize:10,fontWeight:700,color:statusColor[p.status]||"#8B90A8",background:(statusColor[p.status]||"#8B90A8")+"22",padding:"2px 9px",borderRadius:12,border:`1px solid ${(statusColor[p.status]||"#8B90A8")}44`}}>{p.status}</span></td>
                            <td style={{padding:"8px 14px"}}>{p.status==="pending"&&<button className="pdel" onClick={()=>delPlanned(p.id)}>✕</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── USERS ── */}
      {tab==="users"&&(
        <div style={{maxWidth:700}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add New User</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div><label>Username *</label><input placeholder="jsmith" value={newUser.username} onChange={e=>setNewUser(f=>({...f,username:e.target.value}))}/></div>
              <div><label>Password *</label><input type="password" placeholder="Set password" value={newUser.password} onChange={e=>setNewUser(f=>({...f,password:e.target.value}))}/></div>
              <div><label>Full Name *</label><input placeholder="John Smith" value={newUser.full_name} onChange={e=>setNewUser(f=>({...f,full_name:e.target.value}))}/></div>
              <div><label>Role *</label><select value={newUser.role} onChange={e=>setNewUser(f=>({...f,role:e.target.value}))}><option value="worker">Worker</option><option value="admin">Admin</option></select></div>
            </div>
            <button className="bw" onClick={addUser} disabled={saving}>+ Add User</button>
          </div>
          <div className="card">
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>All Users</div>
            {loadingU?<div style={{color:"#4A4F65"}}>Loading…</div>:<div style={{display:"flex",flexDirection:"column",gap:10}}>{users.map(u=><UserRow key={u.id} u={u} onToggle={()=>toggleUser(u)} onResetPw={pw=>resetPw(u,pw)}/>)}</div>}
          </div>
        </div>
      )}

      {/* ── ITEMS ── */}
      {tab==="items"&&(
        <div style={{maxWidth:780}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add Item</div>
            <div style={{display:"grid",gridTemplateColumns:"130px 1fr 110px auto",gap:10,alignItems:"end"}}>
              <div><label>Item ID *</label><input placeholder="ITM-011" value={newItem.id} onChange={e=>setNewItem(f=>({...f,id:e.target.value}))}/></div>
              <div><label>Item Name *</label><input placeholder="Part description" value={newItem.name} onChange={e=>setNewItem(f=>({...f,name:e.target.value}))}/></div>
              <div><label>Std Min/Piece</label><input type="number" placeholder="e.g. 5" value={newItem.std_minutes} onChange={e=>setNewItem(f=>({...f,std_minutes:e.target.value}))}/></div>
              <button className="bp" onClick={addItem} disabled={saving} style={{padding:"10px 16px"}}>+ Add</button>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <input placeholder={`Search ${items.length} items…`} value={itemSearch} onChange={e=>setItemSearch(e.target.value)} style={{flex:1,minWidth:180,fontSize:12,padding:"8px 12px"}}/>
            <button className="bg" style={{fontSize:11}} onClick={exportItemsCSV}>⬇ Download CSV</button>
            <input ref={itemFileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleItemFile}/>
            <button className="bw" style={{fontSize:11}} onClick={()=>itemFileRef.current.click()}>⬆ Upload CSV</button>
            <button className="bg" style={{fontSize:11}} onClick={dlItemTemplate}>⬇ Template</button>
          </div>
          <div className="card" style={{padding:"10px 0"}}>
            <div style={{fontSize:10,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",padding:"0 14px",marginBottom:8}}>{itemSearch?`${filtItems.length} of ${items.length}`:`${items.length} items`}</div>
            <div style={{maxHeight:440,overflowY:"auto"}}>
              {filtItems.map(i=>(
                editItem?.id===i.id?(
                  <div key={i.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 12px",background:"rgba(0,212,170,.04)",borderBottom:"1px solid #2A2F45"}}>
                    <input value={editItem.id} readOnly style={{width:110,fontSize:11,padding:"5px 8px",background:"#0F1117",color:"#5A5F78"}}/>
                    <input value={editItem.name} onChange={e=>setEditItem(f=>({...f,name:e.target.value}))} style={{flex:1,fontSize:11,padding:"5px 8px"}} autoFocus/>
                    <input type="number" placeholder="Std min" value={editItem.std_minutes??""} onChange={e=>setEditItem(f=>({...f,std_minutes:e.target.value}))} style={{width:80,fontSize:11,padding:"5px 8px"}}/>
                    <button className="bp" style={{fontSize:11,padding:"5px 10px"}} onClick={saveEditItem}>Save</button>
                    <button className="bg" style={{fontSize:11,padding:"5px 8px"}} onClick={()=>setEditItem(null)}>✕</button>
                  </div>
                ):(
                  <div key={i.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px",borderBottom:"1px solid #1E2135"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#1E2135"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                      <span style={{color:"#00D4AA",fontWeight:600,fontSize:11,flexShrink:0,width:90}}>{i.id}</span>
                      <span style={{color:"#C8CADC",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.name}</span>
                      {i.std_minutes&&<span style={{color:"#7B8CFF",fontSize:10,flexShrink:0}}>⏱ {i.std_minutes}min</span>}
                    </div>
                    <div style={{display:"flex",gap:5,flexShrink:0}}>
                      <button onClick={()=>setEditItem({...i})} style={{background:"none",border:"1px solid #2A3545",color:"#7B8CFF",fontSize:10,padding:"2px 7px",borderRadius:4,cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}>✏ Edit</button>
                      <button className="pdel" onClick={()=>delItem(i.id)}>✕</button>
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EMPLOYEES ── */}
      {tab==="employees"&&(
        <div style={{maxWidth:520}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Add Employee</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"end"}}>
              <div><label>Full Name</label><input placeholder="First Last" value={newEmp} onChange={e=>setNewEmp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEmp()}/></div>
              <button className="bp" onClick={addEmp} disabled={saving} style={{padding:"10px 16px"}}>+ Add</button>
            </div>
          </div>
          <div className="card">
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Employees ({employees.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:380,overflowY:"auto"}}>
              {employees.map(e=>(
                <div key={e} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#13161F",padding:"8px 14px",borderRadius:6}}>
                  <span style={{color:"#C8CADC",fontSize:12}}>👤 {e}</span>
                  <button className="pdel" onClick={()=>delEmp(e)}>✕ Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LINES ── */}
      {tab==="lines"&&(
        <div style={{maxWidth:640}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Add Production Line</div>
            <div style={{display:"grid",gridTemplateColumns:"130px 1fr auto",gap:10,alignItems:"end"}}>
              <div><label>Line ID</label><input placeholder="LINE-09" value={newLine.id} onChange={e=>setNewLine(f=>({...f,id:e.target.value}))}/></div>
              <div><label>Line Name</label><input placeholder="Night Shift Line" value={newLine.name} onChange={e=>setNewLine(f=>({...f,name:e.target.value}))}/></div>
              <button className="bp" onClick={addLine} disabled={saving} style={{padding:"10px 16px"}}>+ Add</button>
            </div>
          </div>
          <div className="card">
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Lines ({lines.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:360,overflowY:"auto"}}>
              {lines.map(l=>(
                <div key={l.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#13161F",padding:"8px 14px",borderRadius:6}}>
                  <div><span style={{color:"#7B8CFF",fontWeight:600,marginRight:10}}>{l.id}</span><span style={{color:"#C8CADC",fontSize:12}}>{l.name}</span></div>
                  <button className="pdel" onClick={()=>delLine(l.id)}>✕ Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── USER ROW ──────────────────────────────────────────────────
function UserRow({u,onToggle,onResetPw}){
  const [pw,setPw]=useState(""); const [show,setShow]=useState(false);
  return(
    <div style={{background:"#13161F",padding:"10px 14px",borderRadius:6,border:"1px solid #2A2F45"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div>
          <span style={{color:"#C8CADC",fontWeight:600,marginRight:10}}>{u.full_name}</span>
          <span style={{color:"#5A5F78",fontSize:11,marginRight:10}}>@{u.username}</span>
          <span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:u.role==="admin"?"rgba(255,149,0,.15)":"rgba(123,140,255,.15)",color:u.role==="admin"?"#FF9500":"#7B8CFF",fontWeight:600}}>{u.role}</span>
          {!u.active&&<span style={{fontSize:10,color:"#FF4B6E",marginLeft:8}}>INACTIVE</span>}
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setShow(s=>!s)} style={{background:"none",border:"1px solid #2A2F45",color:"#8B90A8",fontSize:11,padding:"3px 9px",borderRadius:4,cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}>🔑 PW</button>
          <button className="pdel" style={{borderColor:u.active?"#3A2030":"#1A3020",color:u.active?"#FF4B6E":"#198754"}} onClick={onToggle}>{u.active?"Deactivate":"Activate"}</button>
        </div>
      </div>
      {show&&(
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <input type="password" placeholder="New password" value={pw} onChange={e=>setPw(e.target.value)} style={{flex:1,fontSize:12,padding:"7px 12px"}}/>
          <button className="bw" style={{fontSize:11,padding:"7px 12px"}} onClick={()=>{onResetPw(pw);setPw("");setShow(false);}}>Save</button>
          <button className="bg" style={{fontSize:11,padding:"7px 10px"}} onClick={()=>setShow(false)}>✕</button>
        </div>
      )}
    </div>
  );
}



// ══════════════════════════════════════════════════════════════
//  MONTHLY EFFICIENCY TRACKER
// ══════════════════════════════════════════════════════════════
function MonthlyTracker({orders,items}){
  const nowNZ   = new Date();
  const curNZDate = nowNZ.toLocaleDateString("en-CA",{timeZone:NZ_TZ});
  const curNZYear  = Number(curNZDate.slice(0,4));
  const curNZMonth = Number(curNZDate.slice(5,7))-1; // 0-indexed

  const [selYear,setSelYear]   = useState(curNZYear);
  const [selMonth,setSelMonth] = useState(curNZMonth);
  const [chartView,setChartView] = useState("chart");
  const chartRef=useRef(null); const barRef=useRef(null);
  const effInst=useRef(null); const barInst=useRef(null);
  const [chartReady,setChartReady] = useState(false);

  // Past-month fetch cache: key = "YYYY-MM" → orders array
  const [monthCache,setMonthCache] = useState({});
  const [monthLoading,setMonthLoading] = useState(false);

  const toNZ = dt => !dt?"":new Date(dt).toLocaleDateString("en-CA",{timeZone:NZ_TZ});
  const todayStr = curNZDate;
  const isCurrentMonth = selYear===curNZYear && selMonth===curNZMonth;

  const prevMonth=()=>{ if(selMonth===0){setSelMonth(11);setSelYear(y=>y-1);}else setSelMonth(m=>m-1); };
  const nextMonth=()=>{
    const isLast=selYear===curNZYear&&selMonth===curNZMonth;
    if(isLast) return;
    if(selMonth===11){setSelMonth(0);setSelYear(y=>y+1);}else setSelMonth(m=>m+1);
  };
  const goCurrentMonth=()=>{ setSelYear(curNZYear); setSelMonth(curNZMonth); };

  const monthStr=String(selMonth+1).padStart(2,"0");
  const daysInMonth=new Date(selYear,selMonth+1,0).getDate();
  const monthName=new Date(selYear,selMonth,1).toLocaleDateString("en-NZ",{month:"long",year:"numeric"});
  const cacheKey=`${selYear}-${monthStr}`;

  // Fetch past month if not current and not already cached
  useEffect(()=>{
    if(isCurrentMonth) return;
    if(monthCache[cacheKey]) return;
    let cancelled=false;
    const fetch=async()=>{
      setMonthLoading(true);
      try{
        const lastDay=new Date(selYear,selMonth+1,0).getDate();
        const from=`${selYear}-${monthStr}-01T00:00:00`;
        const to=`${selYear}-${monthStr}-${String(lastDay).padStart(2,"0")}T23:59:59`;
        const data=await db.getMonthOrders(from,to);
        if(!cancelled) setMonthCache(p=>({...p,[cacheKey]:data}));
      }catch(e){ console.error("MonthlyTracker fetch error:",e); }
      if(!cancelled) setMonthLoading(false);
    };
    fetch();
    return()=>{ cancelled=true; };
  },[selYear,selMonth,isCurrentMonth,cacheKey]);

  // Use cached data for past months, live orders for current month
  const activeOrders = isCurrentMonth ? orders : (monthCache[cacheKey]||[]);

  // Build daily data
  const dayData=[];
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${selYear}-${monthStr}-${String(d).padStart(2,"0")}`;
    const isFuture=dateStr>todayStr;
    const label=`${String(d).padStart(2,"0")} ${new Date(dateStr+"T12:00:00").toLocaleDateString("en-NZ",{month:"short"})}`;
    const dayName=new Date(dateStr+"T12:00:00").toLocaleDateString("en-NZ",{weekday:"short"});
    if(isFuture){ dayData.push({dateStr,label,dayName,completed:0,pieces:0,avgEff:null,avgWorkMin:null,manHrs:null,hasData:false,isFuture:true}); continue; }
    const dayOrders=activeOrders.filter(o=>o.status==="Completed"&&toNZ(o.start_datetime)===dateStr);
    if(dayOrders.length===0){ dayData.push({dateStr,label,dayName,completed:0,pieces:0,avgEff:null,avgWorkMin:null,manHrs:null,hasData:false,isFuture:false}); continue; }
    const effs=dayOrders.filter(o=>o.efficiency!=null).map(o=>o.efficiency);
    const avgEff=effs.length?Math.round(effs.reduce((a,b)=>a+b)/effs.length):null;
    const totalManMins=dayOrders.reduce((a,o)=>a+(o.working_minutes||o.actual_minutes||0)*(o.num_employees||1),0);
    const avgWorkMin=Math.round(dayOrders.reduce((a,o)=>a+(o.working_minutes||o.actual_minutes||0),0)/dayOrders.length);
    const pieces=dayOrders.reduce((a,o)=>a+(o.end_qty||0),0);
    dayData.push({dateStr,label,dayName,completed:dayOrders.length,pieces,avgEff,avgWorkMin,manHrs:Number((totalManMins/60).toFixed(2)),hasData:true,isFuture:false});
  }

  const dataOnly=dayData.filter(d=>d.hasData);
  const monthAvgEff=dataOnly.filter(d=>d.avgEff!=null).length
    ?Math.round(dataOnly.filter(d=>d.avgEff!=null).reduce((a,d)=>a+d.avgEff,0)/dataOnly.filter(d=>d.avgEff!=null).length):null;
  const bestDay=[...dataOnly].filter(d=>d.avgEff!=null).sort((a,b)=>b.avgEff-a.avgEff)[0];
  const worstDay=[...dataOnly].filter(d=>d.avgEff!=null).sort((a,b)=>a.avgEff-b.avgEff)[0];
  const totalCompleted=dataOnly.reduce((a,d)=>a+d.completed,0);
  const totalPieces=dataOnly.reduce((a,d)=>a+d.pieces,0);

  // Load Chart.js
  useEffect(()=>{
    if(window.Chart){setChartReady(true);return;}
    if(!document.getElementById("chartjs-cdn")){
      const s=document.createElement("script");
      s.id="chartjs-cdn";
      s.src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
      document.head.appendChild(s);
    }
    const poll=setInterval(()=>{if(window.Chart){setChartReady(true);clearInterval(poll);}},150);
    return()=>clearInterval(poll);
  },[]);

  // Render charts — only days with activity, dynamic Y-axis
  useEffect(()=>{
    if(!chartReady||chartView!=="chart") return;

    // ── Fix 1: filter to only days that have completed orders ──
    const activeDays=dayData.filter(d=>!d.isFuture&&d.hasData);
    if(activeDays.length===0) return;

    const labels  = activeDays.map(d=>d.label);
    const effVals = activeDays.map(d=>d.avgEff);
    const ordVals = activeDays.map(d=>d.completed);
    const pcsVals = activeDays.map(d=>d.pieces);

    // ── Fix 2: dynamic Y-axis max = highest eff + 15% headroom ──
    const maxEff = Math.max(...effVals.filter(v=>v!=null), 100);
    const yMax   = Math.ceil((maxEff + 15) / 10) * 10; // round up to nearest 10

    const gridC="rgba(255,255,255,0.07)"; const txtC="#8B90A8";

    if(effInst.current){effInst.current.destroy();effInst.current=null;}
    if(barInst.current){barInst.current.destroy();barInst.current=null;}

    if(chartRef.current){
      effInst.current=new window.Chart(chartRef.current,{
        type:"line",
        data:{labels,datasets:[
          {
            label:"Efficiency %",
            data:effVals,
            borderColor:"#378ADD",
            backgroundColor:"rgba(55,138,221,0.07)",
            fill:true,tension:0.35,borderWidth:2,
            // ── Fix 3: no nulls — all active days have data ──
            pointBackgroundColor:effVals.map(v=>v>=100?"#00D4AA":v>=80?"#FFC107":"#FF4B6E"),
            pointBorderColor:"#1A1D27",pointBorderWidth:2,pointRadius:5,
            spanGaps:true,
          },
          {
            label:"Target",
            data:Array(labels.length).fill(100),
            borderColor:"#FF4B6E",borderWidth:1.5,borderDash:[5,4],
            pointRadius:0,fill:false,
          },
        ]},
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            tooltip:{callbacks:{label:c=>c.datasetIndex===0?` Eff: ${c.parsed.y}%`:` Target: 100%`}}
          },
          scales:{
            x:{grid:{color:gridC},ticks:{color:txtC,font:{size:10},autoSkip:labels.length>15,maxRotation:45}},
            y:{
              min:0,
              max:yMax,   // ← dynamic
              grid:{color:gridC},
              ticks:{color:txtC,font:{size:10},callback:v=>v+"%",stepSize:yMax<=150?10:20}
            }
          }
        }
      });
    }
    if(barRef.current){
      barInst.current=new window.Chart(barRef.current,{
        type:"bar",
        data:{labels,datasets:[
          {label:"Orders",data:ordVals,backgroundColor:"rgba(0,212,170,0.6)",borderColor:"#00D4AA",borderWidth:1.5,borderRadius:3,yAxisID:"y"},
          {label:"Pieces",data:pcsVals,backgroundColor:"rgba(255,149,0,0.55)",borderColor:"#FF9500",borderWidth:1.5,borderRadius:3,yAxisID:"y1"},
        ]},
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.datasetIndex===0?` ${c.parsed.y} orders`:` ${c.parsed.y} pieces`}}},
          scales:{
            x:{grid:{display:false},ticks:{color:txtC,font:{size:10},autoSkip:labels.length>15,maxRotation:45}},
            y:{position:"left",grid:{color:gridC},ticks:{color:"#00D4AA",font:{size:10}},title:{display:true,text:"Orders",color:"#00D4AA",font:{size:10}}},
            y1:{position:"right",grid:{display:false},ticks:{color:"#FF9500",font:{size:10}},title:{display:true,text:"Pieces",color:"#FF9500",font:{size:10}}},
          }
        }
      });
    }
    return()=>{
      if(effInst.current){effInst.current.destroy();effInst.current=null;}
      if(barInst.current){barInst.current.destroy();barInst.current=null;}
    };
  },[chartReady,chartView,selYear,selMonth,orders,monthCache,monthLoading]);

  return(
    <div>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>Monthly Efficiency Tracker</div>
          <div style={{fontSize:10,color:"#5A5F78",marginTop:2}}>{monthName} — daily efficiency %, orders & pieces</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {/* Month nav */}
          <div style={{display:"flex",alignItems:"center",background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:6,overflow:"hidden"}}>
            <button onClick={prevMonth} style={{background:"none",border:"none",color:"#8B90A8",fontSize:16,padding:"6px 12px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}
              onMouseEnter={e=>{e.currentTarget.style.color="#00D4AA";e.currentTarget.style.background="rgba(0,212,170,.07)";}}
              onMouseLeave={e=>{e.currentTarget.style.color="#8B90A8";e.currentTarget.style.background="none";}}>‹</button>
            <div style={{fontSize:11,color:"#E8EAF0",padding:"6px 14px",fontWeight:700,minWidth:130,textAlign:"center",borderLeft:"1px solid #2A2F45",borderRight:"1px solid #2A2F45"}}>{monthName}</div>
            <button onClick={nextMonth} disabled={isCurrentMonth}
              style={{background:"none",border:"none",color:isCurrentMonth?"#3A3F55":"#8B90A8",fontSize:16,padding:"6px 12px",cursor:isCurrentMonth?"not-allowed":"pointer",fontFamily:"'IBM Plex Mono',monospace"}}
              onMouseEnter={e=>{if(!isCurrentMonth){e.currentTarget.style.color="#00D4AA";e.currentTarget.style.background="rgba(0,212,170,.07)";}}}
              onMouseLeave={e=>{e.currentTarget.style.color=isCurrentMonth?"#3A3F55":"#8B90A8";e.currentTarget.style.background="none";}}>›</button>
          </div>
          {!isCurrentMonth&&(
            <button onClick={goCurrentMonth} style={{background:"rgba(0,212,170,.1)",border:"1px solid rgba(0,212,170,.25)",color:"#00D4AA",fontSize:10,padding:"6px 12px",borderRadius:4,cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,whiteSpace:"nowrap"}}>
              Current Month
            </button>
          )}
          {monthLoading&&<span style={{fontSize:10,color:"#7B8CFF",fontWeight:700,background:"rgba(123,140,255,.1)",border:"1px solid rgba(123,140,255,.2)",padding:"4px 10px",borderRadius:8}}>⟳ Loading…</span>}
          {/* View toggle — radio style */}
          <div style={{display:"flex",background:"#13161F",border:"1px solid #2A2F45",borderRadius:6,overflow:"hidden"}}>
            {[["chart","📊 Chart"],["table","📋 Table"]].map(([v,lbl],i)=>(
              <button key={v} onClick={()=>setChartView(v)} style={{
                background:chartView===v?"rgba(0,212,170,.12)":"none",
                border:"none",borderRight:i===0?"1px solid #2A2F45":"none",
                fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"6px 16px",cursor:"pointer",
                color:chartView===v?"#00D4AA":"#8B90A8",fontWeight:chartView===v?700:400,
                transition:"all .15s",whiteSpace:"nowrap",
              }}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:16}}>
        {[
          {lbl:"Month Avg Eff",   val:monthAvgEff!=null?monthAvgEff+"%":"—",   color:effColor(monthAvgEff), sub:`${dataOnly.length} days with data`},
          {lbl:"Best Day",        val:bestDay?bestDay.avgEff+"%":"—",           color:"#00D4AA",             sub:bestDay?`${bestDay.label} · ${bestDay.completed} orders`:"—"},
          {lbl:"Lowest Day",      val:worstDay?worstDay.avgEff+"%":"—",         color:worstDay&&worstDay.avgEff<80?"#FF4B6E":"#FFC107", sub:worstDay?`${worstDay.label} · ${worstDay.completed} orders`:"—"},
          {lbl:"Total Completed", val:`${totalCompleted} orders`,               color:"#C8CADC",             sub:`${totalPieces.toLocaleString()} pieces this month`},
        ].map(s=>(
          <div key={s.lbl} style={{background:"#13161F",borderRadius:6,padding:"10px 12px"}}>
            <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>{s.lbl}</div>
            <div style={{fontSize:17,fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div>
            <div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── CHART VIEW ── */}
      {chartView==="chart"&&(
        <div>
          <div style={{display:"flex",gap:16,marginBottom:10,flexWrap:"wrap"}}>
            {[
              {color:"#378ADD",label:"Efficiency %",  shape:"square"},
              {color:"#00D4AA",label:"Orders",         shape:"square"},
              {color:"#FF9500",label:"Pieces",         shape:"square"},
              {color:"#FF4B6E",label:"100% target",    shape:"line"},
            ].map(l=>(
              <div key={l.label} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#8B90A8"}}>
                {l.shape==="line"
                  ?<div style={{width:18,height:2,background:l.color}}/>
                  :<div style={{width:10,height:10,borderRadius:2,background:l.color,flexShrink:0}}/>}
                {l.label}
              </div>
            ))}
          </div>
          {!chartReady
            ?<div style={{height:220,display:"flex",alignItems:"center",justifyContent:"center",color:"#5A5F78",fontSize:12}}>Loading chart…</div>
            :<>
              <div style={{position:"relative",width:"100%",height:210,marginBottom:14}}>
                <canvas ref={chartRef} role="img" aria-label={`Line chart of daily efficiency for ${monthName}`}/>
              </div>
              <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Orders completed & pieces per day</div>
              <div style={{position:"relative",width:"100%",height:150}}>
                <canvas ref={barRef} role="img" aria-label={`Bar chart of completed orders and pieces per day for ${monthName}`}/>
              </div>
            </>
          }
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {chartView==="table"&&(
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{borderBottom:"1px solid #2A2F45"}}>
                {["Date","Day","Orders","Pieces","Avg Eff","Avg Work Min","Man Hrs","vs Prev"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:"left",color:"#5A5F78",fontSize:10,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayData.filter(d=>!d.isFuture).map((d,i,arr)=>{
                const isToday=d.dateStr===todayStr;
                const prev=arr[i-1];
                const trend=d.hasData&&prev?.hasData&&d.avgEff!=null&&prev?.avgEff!=null?d.avgEff-prev.avgEff:null;
                const ec=effColor(d.avgEff);
                return(
                  <tr key={d.dateStr} style={{borderBottom:"1px solid #1E2135",background:isToday?"rgba(55,138,221,.07)":"transparent"}}
                    onMouseEnter={e=>e.currentTarget.style.background=isToday?"rgba(55,138,221,.1)":"#1A1F30"}
                    onMouseLeave={e=>e.currentTarget.style.background=isToday?"rgba(55,138,221,.07)":"transparent"}>
                    <td style={{padding:"8px 10px",color:"#00D4AA",fontWeight:isToday?700:400}}>{d.label}{isToday?" ★":""}</td>
                    <td style={{padding:"8px 10px",color:"#5A5F78"}}>{d.dayName}</td>
                    <td style={{padding:"8px 10px",textAlign:"center",color:d.completed>0?"#C8CADC":"#4A4F65"}}>{d.completed||"—"}</td>
                    <td style={{padding:"8px 10px",textAlign:"center",color:d.pieces>0?"#FF9500":"#4A4F65"}}>{d.pieces>0?d.pieces.toLocaleString():"—"}</td>
                    <td style={{padding:"8px 10px"}}>
                      {d.avgEff!=null
                        ?<span style={{fontSize:11,fontWeight:700,color:ec,background:ec+"22",padding:"2px 8px",borderRadius:12,border:`1px solid ${ec}44`}}>{d.avgEff}%</span>
                        :<span style={{color:"#4A4F65"}}>—</span>}
                    </td>
                    <td style={{padding:"8px 10px",textAlign:"center",color:"#C8CADC"}}>{d.avgWorkMin??<span style={{color:"#4A4F65"}}>—</span>}</td>
                    <td style={{padding:"8px 10px",textAlign:"center",color:"#FF9500"}}>{d.manHrs&&d.manHrs>0?d.manHrs+"h":<span style={{color:"#4A4F65"}}>—</span>}</td>
                    <td style={{padding:"8px 10px",color:trend==null?"#4A4F65":trend>0?"#00D4AA":trend<0?"#FF4B6E":"#8B90A8"}}>
                      {trend==null?"—":trend>0?`↑ +${Math.round(trend)}%`:trend<0?`↓ ${Math.round(trend)}%`:"→ 0%"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  EMPLOYEE EFFICIENCY
// ══════════════════════════════════════════════════════════════
function EmployeeEfficiency({orders,employees}){
  const nowNZ = new Date();
  const curNZDate  = nowNZ.toLocaleDateString("en-CA",{timeZone:NZ_TZ});
  const curNZYear  = Number(curNZDate.slice(0,4));
  const curNZMonth = Number(curNZDate.slice(5,7))-1;

  const [selEmp,setSelEmp]     = useState(employees[0]||"");
  const [selYear,setSelYear]   = useState(curNZYear);
  const [selMonth,setSelMonth] = useState(curNZMonth);

  // Past-month fetch cache
  const [monthCache,setMonthCache] = useState({});
  const [monthLoading,setMonthLoading] = useState(false);

  const isCurrentMonth = selYear===curNZYear && selMonth===curNZMonth;
  const prevMonth=()=>{ if(selMonth===0){setSelMonth(11);setSelYear(y=>y-1);}else setSelMonth(m=>m-1); };
  const nextMonth=()=>{ if(isCurrentMonth) return; if(selMonth===11){setSelMonth(0);setSelYear(y=>y+1);}else setSelMonth(m=>m+1); };
  const goCurrentMonth=()=>{ setSelYear(curNZYear); setSelMonth(curNZMonth); };

  const monthStr=String(selMonth+1).padStart(2,"0");
  const monthName=new Date(selYear,selMonth,1).toLocaleDateString("en-NZ",{month:"long",year:"numeric"});
  const toNZ = dt => !dt?"":new Date(dt).toLocaleDateString("en-CA",{timeZone:NZ_TZ});
  const cacheKey=`${selYear}-${monthStr}`;

  // Fetch past month on demand
  useEffect(()=>{
    if(isCurrentMonth) return;
    if(monthCache[cacheKey]) return;
    let cancelled=false;
    const fetch=async()=>{
      setMonthLoading(true);
      try{
        const lastDay=new Date(selYear,selMonth+1,0).getDate();
        const from=`${selYear}-${monthStr}-01T00:00:00`;
        const to=`${selYear}-${monthStr}-${String(lastDay).padStart(2,"0")}T23:59:59`;
        const data=await db.getMonthOrders(from,to);
        if(!cancelled) setMonthCache(p=>({...p,[cacheKey]:data}));
      }catch(e){ console.error("EmpEff fetch error:",e); }
      if(!cancelled) setMonthLoading(false);
    };
    fetch();
    return()=>{ cancelled=true; };
  },[selYear,selMonth,isCurrentMonth,cacheKey]);

  // Use cached or live orders
  const activeOrders = isCurrentMonth ? orders : (monthCache[cacheKey]||[]);

  // Orders this employee worked on within the selected month, completed only
  const empOrders = selEmp ? activeOrders.filter(o=>{
    if(o.status!=="Completed") return false;
    if(!(o.employees||[o.employee]).includes(selEmp)) return false;
    const od=toNZ(o.start_datetime);
    if(!od) return false;
    return od.slice(0,4)===String(selYear) && od.slice(5,7)===monthStr;
  }).sort((a,b)=>new Date(b.start_datetime)-new Date(a.start_datetime)) : [];

  const effVals   = empOrders.filter(o=>o.efficiency!=null).map(o=>o.efficiency);
  const avgEff    = effVals.length ? Math.round(effVals.reduce((a,b)=>a+b,0)/effVals.length) : null;
  const totalPieces = empOrders.reduce((a,o)=>a+(o.end_qty||0),0);
  const totalHrs  = (empOrders.reduce((a,o)=>a+(o.working_minutes||o.actual_minutes||0),0)/60).toFixed(1);

  return(
    <div>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>
            Employee Efficiency <span style={{background:"rgba(0,212,170,.12)",color:"#00D4AA",fontSize:9,padding:"2px 7px",borderRadius:8,border:"1px solid rgba(0,212,170,.2)",fontWeight:700,marginLeft:6}}>NEW</span>
          </div>
          <div style={{fontSize:10,color:"#5A5F78",marginTop:2}}>Average efficiency per employee for the selected month</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {/* Employee select */}
          <select value={selEmp} onChange={e=>setSelEmp(e.target.value)}
            style={{background:"#13161F",border:`1px solid ${selEmp?"#00D4AA":"#2A2F45"}`,color:selEmp?"#00D4AA":"#E8EAF0",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,padding:"7px 12px",borderRadius:5,minWidth:160}}>
            {employees.length===0&&<option value="">No employees</option>}
            {employees.map(e=><option key={e} value={e}>{e}</option>)}
          </select>
          {/* Month nav */}
          <div style={{display:"flex",alignItems:"center",background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:6,overflow:"hidden"}}>
            <button onClick={prevMonth} style={{background:"none",border:"none",color:"#8B90A8",fontSize:15,padding:"6px 11px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}
              onMouseEnter={e=>{e.currentTarget.style.color="#00D4AA";e.currentTarget.style.background="rgba(0,212,170,.07)";}}
              onMouseLeave={e=>{e.currentTarget.style.color="#8B90A8";e.currentTarget.style.background="none";}}>‹</button>
            <div style={{fontSize:11,color:"#E8EAF0",padding:"6px 12px",fontWeight:700,minWidth:110,textAlign:"center",borderLeft:"1px solid #2A2F45",borderRight:"1px solid #2A2F45"}}>{monthName}</div>
            <button onClick={nextMonth} disabled={isCurrentMonth}
              style={{background:"none",border:"none",color:isCurrentMonth?"#3A3F55":"#8B90A8",fontSize:15,padding:"6px 11px",cursor:isCurrentMonth?"not-allowed":"pointer",fontFamily:"'IBM Plex Mono',monospace"}}
              onMouseEnter={e=>{if(!isCurrentMonth){e.currentTarget.style.color="#00D4AA";e.currentTarget.style.background="rgba(0,212,170,.07)";}}}
              onMouseLeave={e=>{e.currentTarget.style.color=isCurrentMonth?"#3A3F55":"#8B90A8";e.currentTarget.style.background="none";}}>›</button>
          </div>
          {!isCurrentMonth&&(
            <button onClick={goCurrentMonth} style={{background:"rgba(0,212,170,.1)",border:"1px solid rgba(0,212,170,.25)",color:"#00D4AA",fontSize:10,padding:"6px 12px",borderRadius:4,cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,whiteSpace:"nowrap"}}>
              Current Month
            </button>
          )}
          {monthLoading&&<span style={{fontSize:10,color:"#7B8CFF",fontWeight:700,background:"rgba(123,140,255,.1)",border:"1px solid rgba(123,140,255,.2)",padding:"4px 10px",borderRadius:8}}>⟳ Loading…</span>}
        </div>
      </div>

      {!selEmp ? (
        <div className="card" style={{textAlign:"center",padding:32,color:"#4A4F65"}}>Select an employee to view their efficiency.</div>
      ) : (
        <div className="card">
          {/* KPI cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:16}}>
            <div style={{background:"#13161F",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Avg Efficiency</div>
              <div style={{fontSize:18,fontWeight:700,color:effColor(avgEff)}}>{avgEff!=null?avgEff+"%":"—"}</div>
              <div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>{empOrders.length} order{empOrders.length!==1?"s":""} this month</div>
            </div>
            <div style={{background:"#13161F",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Orders Worked</div>
              <div style={{fontSize:18,fontWeight:700,color:"#C8CADC"}}>{empOrders.length}</div>
              <div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>solo + multi-employee</div>
            </div>
            <div style={{background:"#13161F",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Total Pieces</div>
              <div style={{fontSize:18,fontWeight:700,color:"#FF9500"}}>{totalPieces.toLocaleString()}</div>
              <div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>contributed across orders</div>
            </div>
            <div style={{background:"#13161F",borderRadius:6,padding:"10px 12px"}}>
              <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Total Hours</div>
              <div style={{fontSize:18,fontWeight:700,color:"#7B8CFF"}}>{totalHrs}h</div>
              <div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>working time only</div>
            </div>
          </div>

          {/* Orders table */}
          {empOrders.length===0?(
            <div style={{textAlign:"center",padding:32,color:"#4A4F65",fontSize:12}}>No completed orders for {selEmp} in {monthName}.</div>
          ):(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #2A2F45"}}>
                    {["Order","Date","Co-workers","Line","End Qty","Efficiency"].map(h=>(
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",color:"#5A5F78",fontSize:10,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empOrders.map(o=>{
                    const coworkers=(o.employees||[o.employee]).filter(e=>e!==selEmp);
                    const ec=effColor(o.efficiency);
                    return(
                      <tr key={o.id} style={{borderBottom:"1px solid #1E2135"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#1A1F30"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"8px 10px",color:"#00D4AA",fontWeight:700}}>{o.order_number}</td>
                        <td style={{padding:"8px 10px",color:"#8B90A8",fontSize:11}}>{new Date(o.start_datetime).toLocaleDateString("en-NZ",{timeZone:NZ_TZ,day:"2-digit",month:"short"})}</td>
                        <td style={{padding:"8px 10px",color:coworkers.length?"#C8CADC":"#5A5F78"}}>{coworkers.length?coworkers.join(", "):"— solo —"}</td>
                        <td style={{padding:"8px 10px",color:"#7B8CFF"}}>{o.line_id}</td>
                        <td style={{padding:"8px 10px",textAlign:"center"}}>{o.end_qty??"—"}</td>
                        <td style={{padding:"8px 10px"}}>
                          {o.efficiency!=null
                            ?<span style={{fontSize:11,fontWeight:700,color:ec,background:ec+"22",padding:"2px 8px",borderRadius:12,border:`1px solid ${ec}44`}}>{o.efficiency}%</span>
                            :<span style={{color:"#4A4F65"}}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{fontSize:9,color:"#5A5F78",marginTop:10}}>Multi-employee orders credit the same efficiency to all workers on that order.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  EFFICIENCY PIE CHART
// ══════════════════════════════════════════════════════════════
function EfficiencyPie({orders}){
  const nowNZ=new Date();
  const curNZDate=nowNZ.toLocaleDateString("en-CA",{timeZone:NZ_TZ});
  const curNZYear=Number(curNZDate.slice(0,4));
  const curNZMonth=Number(curNZDate.slice(5,7))-1;

  const [view,setPieView]=useState("month"); // "month" | "today"
  const [selYear,setSelYear]=useState(curNZYear);
  const [selMonth,setSelMonth]=useState(curNZMonth);
  const [monthCache,setMonthCache]=useState({});
  const [monthLoading,setMonthLoading]=useState(false);
  const svgRef=useRef(null);

  const isCurrentMonth=selYear===curNZYear&&selMonth===curNZMonth;
  const monthStr=String(selMonth+1).padStart(2,"0");
  const cacheKey=`${selYear}-${monthStr}`;
  const monthName=new Date(selYear,selMonth,1).toLocaleDateString("en-NZ",{month:"long",year:"numeric"});
  const toNZ=dt=>!dt?"":new Date(dt).toLocaleDateString("en-CA",{timeZone:NZ_TZ});
  const today=curNZDate;

  const prevMonth=()=>{ if(selMonth===0){setSelMonth(11);setSelYear(y=>y-1);}else setSelMonth(m=>m-1); };
  const nextMonth=()=>{ if(isCurrentMonth)return; if(selMonth===11){setSelMonth(0);setSelYear(y=>y+1);}else setSelMonth(m=>m+1); };

  useEffect(()=>{
    if(isCurrentMonth)return;
    if(monthCache[cacheKey])return;
    let cancelled=false;
    const fetch=async()=>{
      setMonthLoading(true);
      try{
        const lastDay=new Date(selYear,selMonth+1,0).getDate();
        const from=`${selYear}-${monthStr}-01T00:00:00`;
        const to=`${selYear}-${monthStr}-${String(lastDay).padStart(2,"0")}T23:59:59`;
        const data=await db.getMonthOrders(from,to);
        if(!cancelled)setMonthCache(p=>({...p,[cacheKey]:data}));
      }catch(e){console.error("EffPie fetch:",e);}
      if(!cancelled)setMonthLoading(false);
    };
    fetch();
    return()=>{cancelled=true;};
  },[selYear,selMonth,isCurrentMonth,cacheKey]);

  const activeOrders=isCurrentMonth?orders:(monthCache[cacheKey]||[]);

  // Filter source based on view
  const src=activeOrders.filter(o=>{
    if(o.status!=="Completed"||o.efficiency==null)return false;
    if(view==="today")return toNZ(o.start_datetime)===today;
    return toNZ(o.start_datetime).slice(0,7)===`${selYear}-${monthStr}`;
  });

  // 4 bands
  const BANDS=[
    {key:"above", label:"Above",  range:"≥100%", min:100, max:Infinity, color:"#00D4AA", emoji:"🟢"},
    {key:"good",  label:"Good",   range:"≥80%",  min:80,  max:100,      color:"#FFC107", emoji:"🟡"},
    {key:"fair",  label:"Fair",   range:"≥60%",  min:60,  max:80,       color:"#FF9500", emoji:"🟠"},
    {key:"poor",  label:"Poor",   range:"<60%",  min:0,   max:60,       color:"#FF4B6E", emoji:"🔴"},
  ];

  const banded=BANDS.map(b=>({
    ...b,
    orders:src.filter(o=>o.efficiency>=b.min&&o.efficiency<b.max),
  })).map(b=>({
    ...b,
    count:b.orders.length,
    qty:b.orders.reduce((a,o)=>a+(o.end_qty||0),0),
    avgEff:b.orders.length?Math.round(b.orders.reduce((a,o)=>a+o.efficiency,0)/b.orders.length):null,
  }));

  const total=src.length;
  const totalQty=src.reduce((a,o)=>a+(o.end_qty||0),0);
  const totalAvgEff=src.filter(o=>o.efficiency!=null).length?
    Math.round(src.reduce((a,o)=>a+(o.efficiency||0),0)/src.length):null;

  // Draw SVG pie
  useEffect(()=>{
    const svg=svgRef.current;
    if(!svg)return;
    while(svg.firstChild)svg.removeChild(svg.firstChild);
    const cx=115,cy=115,R=100,r=60;
    if(total===0)return;

    const ns="http://www.w3.org/2000/svg";
    function polar(cx,cy,rad,angle){return[cx+rad*Math.cos(angle),cy+rad*Math.sin(angle)];}

    let start=-Math.PI/2;
    banded.forEach(b=>{
      if(b.count===0)return;
      const sweep=(b.count/total)*Math.PI*2;
      const end=start+sweep;
      const large=sweep>Math.PI?1:0;
      const [x1,y1]=polar(cx,cy,R,start);
      const [x2,y2]=polar(cx,cy,R,end);
      const [x3,y3]=polar(cx,cy,r,end);
      const [x4,y4]=polar(cx,cy,r,start);

      const path=document.createElementNS(ns,"path");
      path.setAttribute("d",`M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4}Z`);
      path.setAttribute("fill",b.color);
      path.setAttribute("stroke","#1A1D27");
      path.setAttribute("stroke-width","3");
      svg.appendChild(path);

      // Label inside slice
      if(sweep>0.25){
        const mid=start+sweep/2;
        const lr=(R+r)/2;
        const [lx,ly]=polar(cx,cy,lr,mid);
        const pct=Math.round(b.count/total*100);

        const t1=document.createElementNS(ns,"text");
        t1.setAttribute("x",lx);t1.setAttribute("y",ly-6);
        t1.setAttribute("text-anchor","middle");t1.setAttribute("dominant-baseline","middle");
        t1.setAttribute("fill","#FFFFFF");t1.setAttribute("font-size","13");t1.setAttribute("font-weight","700");
        t1.setAttribute("font-family","IBM Plex Mono,monospace");
        t1.textContent=b.count;
        svg.appendChild(t1);

        const t2=document.createElementNS(ns,"text");
        t2.setAttribute("x",lx);t2.setAttribute("y",ly+9);
        t2.setAttribute("text-anchor","middle");t2.setAttribute("dominant-baseline","middle");
        t2.setAttribute("fill","rgba(255,255,255,0.85)");t2.setAttribute("font-size","10");
        t2.setAttribute("font-family","IBM Plex Mono,monospace");
        t2.textContent=pct+"%";
        svg.appendChild(t2);
      }

      start=end;
    });

    // Donut hole
    const hole=document.createElementNS(ns,"circle");
    hole.setAttribute("cx",cx);hole.setAttribute("cy",cy);hole.setAttribute("r",r-1);
    hole.setAttribute("fill","#1A1D27");
    svg.appendChild(hole);
  },[total,selYear,selMonth,view,monthCache,isCurrentMonth]);

  const fmtNum=n=>n>=1000?(n/1000).toFixed(1)+"k":String(n);

  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>Efficiency Distribution</div>
          <div style={{fontSize:10,color:"#5A5F78",marginTop:2}}>
            {view==="today"?`Today ${today}`:`${monthName}`} · {total} completed orders
            {monthLoading&&<span style={{marginLeft:8,fontSize:10,color:"#7B8CFF",fontWeight:700,background:"rgba(123,140,255,.1)",border:"1px solid rgba(123,140,255,.2)",padding:"2px 8px",borderRadius:8}}>⟳ Loading…</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {/* Today / Month toggle */}
          <div style={{display:"flex",background:"#13161F",border:"1px solid #2A2F45",borderRadius:5,overflow:"hidden"}}>
            {[["month","Month"],["today","Today"]].map(([v,lbl])=>(
              <button key={v} onClick={()=>setPieView(v)}
                style={{background:view===v?"rgba(0,212,170,.07)":"none",border:"none",color:view===v?"#00D4AA":"#8B90A8",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,padding:"5px 12px",cursor:"pointer",borderRight:v==="month"?"1px solid #2A2F45":"none",fontWeight:view===v?700:400}}>
                {lbl}
              </button>
            ))}
          </div>
          {view==="month"&&(
            <div style={{display:"flex",alignItems:"center",background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:6,overflow:"hidden"}}>
              <button onClick={prevMonth} style={{background:"none",border:"none",color:"#8B90A8",fontSize:15,padding:"6px 11px",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}
                onMouseEnter={e=>{e.currentTarget.style.color="#00D4AA";}}
                onMouseLeave={e=>{e.currentTarget.style.color="#8B90A8";}}>‹</button>
              <div style={{fontSize:11,color:"#E8EAF0",padding:"6px 12px",fontWeight:700,minWidth:110,textAlign:"center",borderLeft:"1px solid #2A2F45",borderRight:"1px solid #2A2F45"}}>{monthName}</div>
              <button onClick={nextMonth} disabled={isCurrentMonth}
                style={{background:"none",border:"none",color:isCurrentMonth?"#3A3F55":"#8B90A8",fontSize:15,padding:"6px 11px",cursor:isCurrentMonth?"not-allowed":"pointer",fontFamily:"'IBM Plex Mono',monospace"}}
                onMouseEnter={e=>{if(!isCurrentMonth)e.currentTarget.style.color="#00D4AA";}}
                onMouseLeave={e=>{e.currentTarget.style.color=isCurrentMonth?"#3A3F55":"#8B90A8";}}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* 4 KPI cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:18}}>
        {banded.map(b=>(
          <div key={b.key} style={{background:"#13161F",borderRadius:6,padding:"10px 12px",borderTop:`3px solid ${b.color}`}}>
            <div style={{fontSize:8,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{b.emoji} {b.label} {b.range}</div>
            <div style={{fontSize:20,fontWeight:700,color:b.color,lineHeight:1}}>{b.count}</div>
            <div style={{fontSize:9,color:"#5A5F78",marginTop:4}}>
              {total>0?Math.round(b.count/total*100):0}% · {fmtNum(b.qty)} pcs
              {b.avgEff!=null&&<span style={{marginLeft:6,color:b.color}}>avg {b.avgEff}%</span>}
            </div>
          </div>
        ))}
      </div>

      {total===0?(
        <div className="card" style={{textAlign:"center",padding:32,color:"#4A4F65",fontSize:12}}>
          No completed orders with efficiency data for this period.
        </div>
      ):(
        <div style={{display:"flex",alignItems:"center",gap:28,flexWrap:"wrap"}}>
          {/* SVG Pie */}
          <div style={{position:"relative",flexShrink:0}}>
            <svg ref={svgRef} width="230" height="230" viewBox="0 0 230 230"/>
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none"}}>
              <div style={{fontSize:22,fontWeight:700,color:"#E8EAF0",lineHeight:1}}>{total}</div>
              <div style={{fontSize:9,color:"#5A5F78",marginTop:2}}>orders</div>
            </div>
          </div>

          {/* Table */}
          <div style={{flex:1,minWidth:260,overflowX:"auto"}}>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:14}}>
              {banded.map(b=>(
                <div key={b.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"#8B90A8"}}>
                  <div style={{width:11,height:11,borderRadius:"50%",background:b.color,flexShrink:0}}/>
                  {b.range} {b.label}
                </div>
              ))}
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{borderBottom:"1px solid #2A2F45"}}>
                  {["Band","Orders","%","Total Qty","Avg Eff"].map(h=>(
                    <th key={h} style={{padding:"7px 10px",textAlign:h==="Band"?"left":"right",color:"#5A5F78",fontSize:9,letterSpacing:1,textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {banded.map(b=>(
                  <tr key={b.key} style={{borderBottom:"1px solid #1E2135"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#1A1F30"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"7px 10px"}}>
                      <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:b.color,marginRight:7,verticalAlign:"middle"}}/>
                      <span style={{color:b.color,fontWeight:700}}>{b.range}</span>
                    </td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:b.color,fontWeight:700}}>{b.count}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"#8B90A8"}}>{total>0?Math.round(b.count/total*100):0}%</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"#C8CADC"}}>{b.qty.toLocaleString()}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:b.avgEff!=null?b.color:"#4A4F65",fontWeight:700}}>{b.avgEff!=null?b.avgEff+"%":"—"}</td>
                  </tr>
                ))}
                <tr style={{borderTop:"1px solid #2A2F45"}}>
                  <td style={{padding:"7px 10px",color:"#8B90A8",fontWeight:700}}>Total</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:"#E8EAF0",fontWeight:700}}>{total}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:"#8B90A8"}}>100%</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:"#E8EAF0",fontWeight:700}}>{totalQty.toLocaleString()}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:effColor(totalAvgEff),fontWeight:700}}>{totalAvgEff!=null?totalAvgEff+"%":"—"}</td>
                </tr>
              </tbody>
            </table>
            <div style={{fontSize:9,color:"#5A5F78",marginTop:8}}>Completed orders only · Orders without efficiency score excluded</div>
          </div>
        </div>
      )}
    </div>
  );
}
