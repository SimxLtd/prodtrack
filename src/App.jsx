import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────
const SUPABASE_URL = "https://mdbziytahdeuegxlqggd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnppeXRhaGRldWVneGxxZ2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTI1MTIsImV4cCI6MjA5NTU2ODUxMn0.iPE2dckL4uVw-YewKxjd2IAq0Hii2-0QxDVQo52wH74";

// ─── SUPABASE ──────────────────────────────────────────────────
const sbH = () => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, "Content-Type":"application/json", Prefer:"return=representation" });
const sb = async (path, opts={}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{...sbH(),...(opts.headers||{})}, ...opts});
  if(!r.ok) throw new Error(await r.text());
  const t = await r.text(); return t ? JSON.parse(t) : [];
};
const sbAll = async (table, query="") => {
  const P=1000; let all=[],from=0;
  while(true){
    const qs=query?`${query}&limit=${P}&offset=${from}`:`limit=${P}&offset=${from}`;
    const page=await sb(`${table}?${qs}`);
    all=all.concat(page); if(page.length<P) break; from+=P;
  }
  return all;
};
const db = {
  getUsers:        ()       => sbAll("pt_users","order=full_name.asc"),
  addUser:         (u)      => sb("pt_users",{method:"POST",body:JSON.stringify(u)}),
  updateUser:      (id,u)   => sb(`pt_users?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(u)}),
  loginUser:       (u,p)    => sb(`pt_users?username=eq.${u}&password=eq.${p}&active=eq.true`),
  getItems:        ()       => sbAll("pt_items","active=eq.true&order=id.asc"),
  addItem:         (i)      => sb("pt_items",{method:"POST",body:JSON.stringify(i)}),
  updateItem:      (id,i)   => sb(`pt_items?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(i)}),
  deleteItem:      (id)     => sb(`pt_items?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getEmployees:    ()       => sbAll("pt_employees","active=eq.true&order=name.asc"),
  addEmployee:     (e)      => sb("pt_employees",{method:"POST",body:JSON.stringify(e)}),
  deleteEmployee:  (id)     => sb(`pt_employees?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getLines:        ()       => sbAll("pt_lines","active=eq.true&order=id.asc"),
  addLine:         (l)      => sb("pt_lines",{method:"POST",body:JSON.stringify(l)}),
  deleteLine:      (id)     => sb(`pt_lines?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getOrders:       ()       => sbAll("pt_orders","order=created_at.desc"),
  getMyOrders:     (emp)    => sbAll("pt_orders",`employee=ilike.*${encodeURIComponent(emp)}*&order=created_at.desc`),
  addOrder:        (o)      => sb("pt_orders",{method:"POST",body:JSON.stringify(o)}),
  updateOrder:     (id,o)   => sb(`pt_orders?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(o)}),
  searchOrder:     (n)      => sb(`pt_orders?order_number=eq.${encodeURIComponent(n)}`),
  getPlanned:      ()       => sbAll("pt_planned_orders","order=scheduled_datetime.asc"),
  addPlanned:      (o)      => sb("pt_planned_orders",{method:"POST",body:JSON.stringify(o)}),
  findPlanned:     (n)      => sb(`pt_planned_orders?order_number=eq.${encodeURIComponent(n)}`),
  updatePlanned:   (id,o)   => sb(`pt_planned_orders?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(o)}),
  deletePlanned:   (id)     => sb(`pt_planned_orders?id=eq.${id}`,{method:"DELETE",headers:{Prefer:""}}),
};

// ─── HELPERS ───────────────────────────────────────────────────
const fmt       = dt => !dt?"—":new Date(dt).toLocaleString("en-NZ",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"});
const fmtDate   = dt => !dt?"—":new Date(dt).toLocaleDateString("en-NZ",{day:"2-digit",month:"short",year:"numeric"});
const nowISO    = () => new Date().toISOString();
const todayStr  = () => new Date().toISOString().slice(0,10);
const toLocalDT = () => new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
const getDuration = (s,e) => { const ms=new Date(e)-new Date(s); return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m ${Math.floor((ms%60000)/1000)}s`; };
const getElapsedMin = s => (Date.now()-new Date(s))/60000;
const fmtElapsed = s => { const ms=Date.now()-new Date(s); return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`; };
const calcEff   = (std,qty,workMin,numEmp=1) => std&&qty&&workMin&&workMin>0 ? Math.round((std*qty/(workMin*(numEmp||1)))*100) : null;
const effColor  = e => !e?"#8B90A8":e>=100?"#00D4AA":e>=80?"#FFC107":e>=60?"#FF9500":"#FF4B6E";
const breakTotal= breaks => (breaks||[]).reduce((s,b)=>s+(b.end_time?((new Date(b.end_time)-new Date(b.start_time))/60000):0),0);
const workingMin= (o) => {
  if(!o.start_datetime) return 0;
  const elapsed = o.status==="Completed"&&o.end_datetime ? (new Date(o.end_datetime)-new Date(o.start_datetime))/60000 : getElapsedMin(o.start_datetime);
  const brk = breakTotal(o.breaks);
  const cur = o.is_paused&&o.paused_at ? (Date.now()-new Date(o.paused_at))/60000 : 0;
  return Math.max(0, elapsed - brk - cur);
};

const STATUS_COLORS = {
  "In Progress":{ dot:"#FFC107", bg:"rgba(255,193,7,.1)"  },
  "On Break":   { dot:"#FF9500", bg:"rgba(255,149,0,.1)"  },
  Completed:    { dot:"#198754", bg:"rgba(25,135,84,.1)"  },
};

// ─── CSV parsers ───────────────────────────────────────────────
function parsePlannedCSV(text){
  const lines=text.trim().split(/\r?\n/).slice(1);
  const orders=[]; const errors=[];
  lines.forEach((line,i)=>{
    const cols=line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
    const [order_number,item_id,line_id,production_qty,scheduled_datetime]=cols;
    if(!order_number){errors.push(`Row ${i+2}: missing order_number`);return;}
    orders.push({order_number,item_id:item_id||"",line_id:line_id||"",production_qty:Number(production_qty)||0,scheduled_datetime:scheduled_datetime?new Date(scheduled_datetime).toISOString():null});
  });
  return {orders,errors};
}
function parseItemCSV(text){
  const lines=text.trim().split(/\r?\n/).slice(1);
  const items=[]; const errors=[];
  lines.forEach((line,i)=>{
    const cols=line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
    const [id,name,std]=cols;
    if(!id||!name){errors.push(`Row ${i+2}: missing id or name`);return;}
    items.push({id:id.toUpperCase().trim(),name:name.trim(),std_minutes:std?Number(std):null});
  });
  return {items,errors};
}
const PLANNED_TEMPLATE=`order_number,item_id,line_id,production_qty,scheduled_datetime\nORD-2025-001,ITM-001,LINE-01,100,2026-06-01 08:00\nORD-2025-002,ITM-002,LINE-04,200,2026-06-01 09:30`;
const ITEM_TEMPLATE=`id,name,std_minutes\nITM-011,My New Part,5\nITM-012,Another Part,3`;
const dlFile=(content,name)=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([content],{type:"text/csv"})); a.download=name; a.click(); };

// ══════════════════════════════════════════════════════════════
//  GLOBAL CSS
// ══════════════════════════════════════════════════════════════
const GStyles=()=>(
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0F1117;}
    ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:#1A1D27} ::-webkit-scrollbar-thumb{background:#3A3F55;border-radius:3px}
    .bp{background:#00D4AA;color:#0F1117;border:none;padding:10px 20px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bp:hover{background:#00FFCC;transform:translateY(-1px)} .bp:disabled{opacity:.4;cursor:not-allowed;transform:none}
    .bd{background:#FF4B6E;color:#fff;border:none;padding:8px 16px;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bd:hover{background:#FF2D55} .bd:disabled{opacity:.4;cursor:not-allowed}
    .bg{background:transparent;color:#8B90A8;border:1px solid #2A2F45;padding:8px 16px;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bg:hover{border-color:#00D4AA;color:#00D4AA}
    .bw{background:#FF9500;color:#0F1117;border:none;padding:8px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bw:hover{background:#FFAC30}
    .bpause{background:#FF9500;color:#0F1117;border:none;padding:6px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:11px;cursor:pointer;border-radius:4px;}
    .bresume{background:#00D4AA;color:#0F1117;border:none;padding:6px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:11px;cursor:pointer;border-radius:4px;}
    input,select,textarea{background:#1A1D27;border:1px solid #2A2F45;color:#E8EAF0;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:10px 14px;border-radius:4px;width:100%;outline:none;transition:border .15s}
    input:focus,select:focus,textarea:focus{border-color:#00D4AA}
    input::placeholder{color:#4A4F65} select option{background:#1A1D27}
    input[readonly]{color:#00D4AA;border-color:#00D4AA44;cursor:default;}
    label{display:block;font-size:11px;color:#8B90A8;margin-bottom:6px;letter-spacing:1px;text-transform:uppercase}
    .fg{margin-bottom:16px}
    .card{background:#1A1D27;border:1px solid #2A2F45;border-radius:8px;padding:20px}
    .nb{background:none;border:none;font-family:'IBM Plex Mono',monospace;font-size:12px;padding:10px 14px;cursor:pointer;transition:all .15s;letter-spacing:.5px;white-space:nowrap}
    .tag{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
    .mo{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}
    .md{background:#1A1D27;border:1px solid #2A2F45;border-radius:10px;padding:28px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto}
    .pdel{background:none;border:1px solid #3A2030;color:#FF4B6E;font-size:11px;padding:2px 8px;border-radius:12px;cursor:pointer;font-family:'IBM Plex Mono',monospace}
    .pdel:hover{background:#FF4B6E;color:#fff}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .au{animation:fadeUp .18s ease forwards}
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .ti{animation:toastIn .2s ease}
    th.sort{cursor:pointer;user-select:none} th.sort:hover{color:#C8CADC!important}
    tr:hover td{background:#1A1F30!important}
    .eff-bar{height:5px;border-radius:3px;background:#2A2F45;overflow:hidden;margin-top:3px;width:60px}
    .eff-fill{height:100%;border-radius:3px}
    .tp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center}
    .tp-val{font-size:15px;font-weight:700}
    .tp-lbl{font-size:8px;color:#5A5F78;letter-spacing:1px;text-transform:uppercase;margin-top:2px}
    .brk-row{display:flex;align-items:center;gap:8px;font-size:10px;color:#8B90A8;padding:4px 0;border-bottom:1px solid #1E2135}
    .pill{background:rgba(0,212,170,.1);border:1px solid rgba(0,212,170,.25);color:#00D4AA;font-size:10px;padding:3px 10px;border-radius:12px;display:inline-flex;align-items:center;gap:5px;margin:2px}
    .autofill-banner{background:rgba(0,212,170,.07);border:1px solid rgba(0,212,170,.2);border-radius:6px;padding:9px 14px;margin-bottom:14px;display:flex;align-items:center;gap:8px;font-size:12px;color:#00D4AA}
    .pause-banner{background:rgba(255,149,0,.07);border:1px solid rgba(255,149,0,.2);border-radius:6px;padding:9px 14px;margin:8px 0;display:flex;align-items:center;gap:10px}
    .badge-pending{background:rgba(123,140,255,.12);color:#7B8CFF;border:1px solid rgba(123,140,255,.2);font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600}
    .badge-started{background:rgba(255,193,7,.12);color:#FFC107;border:1px solid rgba(255,193,7,.2);font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600}
    .badge-completed{background:rgba(0,212,170,.12);color:#00D4AA;border:1px solid rgba(0,212,170,.2);font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600}
  `}</style>
);

// ══════════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════════
function LoginScreen({onLogin}){
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false); const [show,setShow]=useState(false);
  const go=async()=>{
    if(!u||!p){setErr("Please enter username and password.");return;}
    setLoading(true); setErr("");
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
          <div style={{fontSize:24,fontWeight:700,color:"#E8EAF0",letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace"}}>PRODTRACK</div>
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
  const [cm,setCm]=useState(null);
  const [cf,setCf]=useState({endQty:"",remarks:""});

  // records filters
  const [fEmp,setFEmp]=useState("All"); const [fLine,setFLine]=useState("All");
  const [fStatus,setFStatus]=useState("All"); const [fFrom,setFFrom]=useState(""); const [fTo,setFTo]=useState("");
  const [sortF,setSortF]=useState("created_at"); const [sortD,setSortD]=useState("desc");

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  const loadAll=useCallback(async()=>{
    setLoading(true);
    try{
      const [o,i,e,l]=await Promise.all([db.getOrders(),db.getItems(),db.getEmployees(),db.getLines()]);
      setOrders(o); setItems(i); setEmployees(e.map(x=>x.name)); setLines(l);
    }catch(e){showToast("Failed to load: "+e.message,"error");}
    setLoading(false);
  },[]);
  useEffect(()=>{loadAll();},[loadAll]);

  // ── Filtered orders ──
  const filteredOrders=orders.filter(o=>{
    const em=fEmp==="All"||o.employee===fEmp||(o.employees&&o.employees.includes(fEmp));
    const lm=fLine==="All"||o.line_id===fLine;
    const sm=fStatus==="All"||o.status===fStatus;
    const df=!fFrom||new Date(o.start_datetime)>=new Date(fFrom);
    const dt=!fTo||new Date(o.start_datetime)<=new Date(fTo+"T23:59:59");
    return em&&lm&&sm&&df&&dt;
  }).sort((a,b)=>{
    let av=a[sortF]??"",bv=b[sortF]??"";
    if(["production_qty","end_qty","efficiency"].includes(sortF)){av=Number(av)||0;bv=Number(bv)||0;}
    return sortD==="asc"?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0);
  });
  const handleSort=f=>{if(sortF===f)setSortD(d=>d==="asc"?"desc":"asc");else{setSortF(f);setSortD("asc");}};

  // ── Today stats ──
  const today=todayStr();
  const todayOrders=orders.filter(o=>o.created_at?.startsWith(today));
  const todayCompleted=todayOrders.filter(o=>o.status==="Completed");
  const todayEffAvg=(()=>{const e=todayCompleted.filter(o=>o.efficiency!=null).map(o=>o.efficiency);return e.length?Math.round(e.reduce((a,b)=>a+b)/e.length):null;})();
  const todayManHrs=(()=>{let t=0;orders.filter(o=>o.status==="In Progress"||o.is_paused).forEach(o=>{t+=workingMin(o);});todayCompleted.forEach(o=>{t+=o.working_minutes||o.actual_minutes||0;});return(t/60).toFixed(1);})();

  // ── Close order ──
  const openClose=o=>{setCm(o);setCf({endQty:"",remarks:""}); };
  const handleClose=async()=>{
    if(!cf.endQty){showToast("Please enter ending quantity.","error");return;}
    if(cm.is_paused){showToast("Resume the order before closing.","error");return;}
    setSaving(true);
    try{
      const item=items.find(i=>i.id===cm.item_id);
      const actualMin=getElapsedMin(cm.start_datetime);
      const brkMin=breakTotal(cm.breaks);
      const workMin=Math.max(0,actualMin-brkMin);
      const numEmp=cm.num_employees||1;
      const eff=calcEff(item?.std_minutes||null,Number(cf.endQty),workMin,numEmp);
      const patch={end_datetime:nowISO(),end_qty:Number(cf.endQty),remarks:cf.remarks,status:"Completed",actual_minutes:Math.round(actualMin),working_minutes:Math.round(workMin),break_minutes:Math.round(brkMin),efficiency:eff};
      await db.updateOrder(cm.id,patch);
      // mark planned order as completed
      try{ const pl=await db.findPlanned(cm.order_number); if(pl.length) await db.updatePlanned(pl[0].id,{status:"completed"}); }catch{}
      setOrders(p=>p.map(o=>o.id===cm.id?{...o,...patch}:o));
      showToast(`Order ${cm.order_number} closed!${eff!=null?" Eff: "+eff+"%":""}`);
      setCm(null);
    }catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };

  // ── Pause / Resume ──
  const handlePause=async(o)=>{
    if(o.is_paused){showToast("Already paused.","error");return;}
    const patch={is_paused:true,paused_at:nowISO()};
    await db.updateOrder(o.id,patch);
    setOrders(p=>p.map(x=>x.id===o.id?{...x,...patch,status:"In Progress"}:x));
    showToast("Order paused — break started.");
  };
  const handleResume=async(o)=>{
    if(!o.is_paused){return;}
    const brk={start_time:o.paused_at,end_time:nowISO()};
    const breaks=[...(o.breaks||[]),brk];
    const brkMin=breakTotal(breaks);
    const patch={is_paused:false,paused_at:null,breaks,break_minutes:Math.round(brkMin)};
    await db.updateOrder(o.id,patch);
    setOrders(p=>p.map(x=>x.id===o.id?{...x,...patch}:x));
    showToast("Order resumed.");
  };

  // ── Export CSV ──
  const exportCSV=()=>{
    const H=["Order #","Employees","Num Employees","Line ID","Line","Item ID","Item","Std Min","Plan Qty","End Qty","Working Min","Break Min","Actual Min","Man Hours","Efficiency %","Start","End","Duration","Status","Remarks","Created By"];
    const R=filteredOrders.map(o=>[
      o.order_number,o.employees?.join("; ")||o.employee,o.num_employees||1,
      o.line_id,o.line_name,o.item_id,o.item_name,
      items.find(i=>i.id===o.item_id)?.std_minutes??"",
      o.production_qty,o.end_qty??"",o.working_minutes??"",o.break_minutes??"",o.actual_minutes??"",
      o.working_minutes?(o.working_minutes/60).toFixed(2):"",o.efficiency??"",
      o.start_datetime?new Date(o.start_datetime).toLocaleString("en-NZ"):"",
      o.end_datetime?new Date(o.end_datetime).toLocaleString("en-NZ"):"",
      o.end_datetime?getDuration(o.start_datetime,o.end_datetime):"",
      o.status,o.remarks||"",o.created_by||""
    ].map(v=>`"${String(v??"").replace(/"/g,'""')}"`));
    dlFile([H.join(","),...R.map(r=>r.join(","))].join("\n"),`prodtrack_${today}.csv`);
    showToast(`Exported ${filteredOrders.length} records.`);
  };

  const TABS=[
    {id:"dashboard",label:"Dashboard",show:true},
    {id:"new",label:"+ New Order",show:true},
    {id:"search",label:"Search",show:true},
    {id:"records",label:"Records",show:isAdmin},
    {id:"admin",label:"⚙ Admin",show:isAdmin},
  ].filter(t=>t.show);

  return(
    <div style={{fontFamily:"'IBM Plex Mono',monospace",background:"#0F1117",minHeight:"100vh",color:"#E8EAF0"}}>
      <GStyles/>
      {/* HEADER */}
      <div style={{background:"#13161F",borderBottom:"1px solid #2A2F45",padding:"0 20px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1400,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,background:"#00D4AA",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>⚙</div>
            <div><div style={{fontSize:13,fontWeight:700,letterSpacing:1}}>PRODTRACK</div><div style={{fontSize:9,color:"#5A5F78",letterSpacing:2}}>PRODUCTION SCHEDULER</div></div>
          </div>
          <nav style={{display:"flex",gap:0}}>
            {TABS.map(t=>(
              <button key={t.id} className="nb" onClick={()=>setView(t.id)}
                style={{color:view===t.id?(t.id==="admin"?"#FF9500":"#00D4AA"):"#8B90A8",background:view===t.id?(t.id==="admin"?"rgba(255,149,0,.08)":"rgba(0,212,170,.08)"):"none",borderBottom:view===t.id?`2px solid ${t.id==="admin"?"#FF9500":"#00D4AA"}`:"2px solid transparent",borderRadius:"4px 4px 0 0"}}>{t.label}</button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}><div style={{fontSize:12,color:"#C8CADC",fontWeight:600}}>{user.full_name}</div><div style={{fontSize:9,color:isAdmin?"#FF9500":"#7B8CFF",letterSpacing:1,textTransform:"uppercase"}}>{user.role}</div></div>
            <button className="bg" style={{fontSize:11,padding:"5px 10px"}} onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1400,margin:"0 auto",padding:"24px 20px"}}>
        {loading?(
          <div style={{textAlign:"center",padding:80,color:"#4A4F65"}}>
            <div style={{fontSize:32,marginBottom:12}}>⏳</div>
            <div>Loading {items.length>0?`(${items.length} items loaded…)`:"data…"}</div>
          </div>
        ):(
          <>
          {view==="dashboard"&&<Dashboard orders={orders} todayOrders={todayOrders} todayCompleted={todayCompleted} todayEffAvg={todayEffAvg} todayManHrs={todayManHrs} items={items} lines={lines} onNewOrder={()=>setView("new")} onClose={openClose} onPause={handlePause} onResume={handleResume} reload={loadAll} isAdmin={isAdmin} user={user}/>}
          {view==="new"&&<NewOrderForm items={items} employees={employees} lines={lines} orders={orders} user={user} setOrders={setOrders} showToast={showToast} onDone={()=>setView("dashboard")}/>}
          {view==="search"&&<SearchView orders={orders} items={items} onClose={openClose} onPause={handlePause} onResume={handleResume}/>}
          {view==="records"&&isAdmin&&(
            <RecordsView orders={filteredOrders} allOrders={orders} items={items} employees={employees} lines={lines}
              fEmp={fEmp} setFEmp={setFEmp} fLine={fLine} setFLine={setFLine}
              fStatus={fStatus} setFStatus={setFStatus} fFrom={fFrom} setFFrom={setFFrom}
              fTo={fTo} setFTo={setFTo} sortF={sortF} sortD={sortD} handleSort={handleSort}
              exportCSV={exportCSV} reload={loadAll}
              clearFilters={()=>{setFEmp("All");setFLine("All");setFStatus("All");setFFrom("");setFTo("");setSortF("created_at");setSortD("desc");}}
            />
          )}
          {view==="admin"&&isAdmin&&<AdminPanel items={items} setItems={setItems} employees={employees} setEmployees={setEmployees} lines={lines} setLines={setLines} showToast={showToast} reload={loadAll}/>}
          </>
        )}
      </div>

      {/* CLOSE MODAL */}
      {cm&&(
        <div className="mo" onClick={e=>e.target===e.currentTarget&&setCm(null)}>
          <div className="md au">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <h3 style={{fontSize:14,color:"#E8EAF0",letterSpacing:1}}>⏹ CLOSE ORDER</h3>
              <button className="bg" style={{padding:"4px 10px"}} onClick={()=>setCm(null)}>✕</button>
            </div>
            <div style={{background:"#13161F",borderRadius:6,padding:"12px 16px",marginBottom:16}}>
              <div style={{fontSize:18,color:"#00D4AA",fontWeight:700}}>{cm.order_number}</div>
              <div style={{fontSize:12,color:"#8B90A8",marginTop:4}}>{cm.item_id} — {cm.item_name}</div>
              <div style={{fontSize:11,color:"#5A5F78",marginTop:2}}>Line: <span style={{color:"#7B8CFF"}}>{cm.line_id} — {cm.line_name}</span></div>
              <div style={{fontSize:11,color:"#5A5F78"}}>Employees: <span style={{color:"#C8CADC"}}>{cm.employees?.join(", ")||cm.employee}</span> <span style={{color:"#FF9500"}}>({cm.num_employees||1} 👥)</span></div>
              <div style={{fontSize:11,color:"#5A5F78"}}>Plan Qty: <span style={{color:"#C8CADC"}}>{cm.production_qty}</span></div>
              {(()=>{const it=items.find(i=>i.id===cm.item_id);return it?.std_minutes?<div style={{fontSize:11,color:"#7B8CFF",marginTop:4}}>⏱ {it.std_minutes} min/piece × end_qty ÷ (work_mins × {cm.num_employees||1}) × 100</div>:null;})()}
            </div>
            {/* Time summary */}
            <div style={{background:"#13161F",borderRadius:6,padding:"10px 14px",marginBottom:16}}>
              <div style={{fontSize:10,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Time Summary</div>
              <div className="tp-grid">
                <div><div className="tp-val" style={{color:"#7B8CFF"}}>{Math.round(getElapsedMin(cm.start_datetime))}m</div><div className="tp-lbl">Total Elapsed</div></div>
                <div><div className="tp-val" style={{color:"#00D4AA"}}>{Math.round(workingMin(cm))}m</div><div className="tp-lbl">Working Time</div></div>
                <div><div className="tp-val" style={{color:"#FF9500"}}>{Math.round(breakTotal(cm.breaks))}m</div><div className="tp-lbl">Break Time</div></div>
                <div><div className="tp-val" style={{color:"#8B90A8"}}>{(cm.breaks||[]).length}</div><div className="tp-lbl">Breaks</div></div>
              </div>
            </div>
            <div className="fg"><label>End Date & Time (Auto-captured)</label><input value={fmt(nowISO())} readOnly/></div>
            <div className="fg"><label>Ending Quantity *</label><input type="number" min="0" placeholder="Actual produced quantity" value={cf.endQty} onChange={e=>setCf(f=>({...f,endQty:e.target.value}))} autoFocus/></div>
            <div className="fg"><label>Remarks</label><textarea rows={3} placeholder="Notes, issues, observations…" value={cf.remarks} onChange={e=>setCf(f=>({...f,remarks:e.target.value}))}/></div>
            <div style={{display:"flex",gap:10}}>
              <button className="bd" style={{flex:1,padding:12,fontSize:13}} onClick={handleClose} disabled={saving||cm.is_paused}>{saving?"Saving…":cm.is_paused?"Resume first":"⏹ CLOSE ORDER"}</button>
              <button className="bg" onClick={()=>setCm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="ti" style={{position:"fixed",bottom:24,right:24,background:toast.type==="error"?"#FF4B6E":"#00D4AA",color:toast.type==="error"?"#fff":"#0F1117",padding:"12px 20px",borderRadius:6,fontSize:13,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.4)",zIndex:300,maxWidth:420}}>{toast.type==="error"?"⚠ ":"✔ "}{toast.msg}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════
function Dashboard({orders,todayOrders,todayCompleted,todayEffAvg,todayManHrs,items,lines,onNewOrder,onClose,onPause,onResume,reload,isAdmin,user}){
  const active=orders.filter(o=>o.status==="In Progress"||o.is_paused);
  const overallAvgEff=(()=>{const e=orders.filter(o=>o.efficiency!=null).map(o=>o.efficiency);return e.length?Math.round(e.reduce((a,b)=>a+b)/e.length):null;})();

  // Man hours by line today
  const lineManHours=(()=>{
    const map={};
    const add=(o,mins)=>{
      if(!map[o.line_id])map[o.line_id]={line_id:o.line_id,line_name:o.line_name,mins:0,emps:[]};
      map[o.line_id].mins+=mins;
      (o.employees||[o.employee]).forEach(e=>{if(!map[o.line_id].emps.includes(e))map[o.line_id].emps.push(e);});
    };
    active.forEach(o=>add(o,workingMin(o)));
    todayCompleted.forEach(o=>add(o,o.working_minutes||o.actual_minutes||0));
    return Object.values(map).sort((a,b)=>b.mins-a.mins);
  })();
  const maxMins=Math.max(...lineManHours.map(l=>l.mins),1);

  // Filter active orders for worker view
  const visibleActive = isAdmin ? active : active.filter(o=>(o.employees||[o.employee]).includes(user.full_name));

  return(
    <div className="au">
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:14,marginBottom:22}}>
        {[
          {label:"TODAY STARTED",   val:todayOrders.length,                        color:"#7B8CFF",icon:"📋"},
          {label:"TODAY COMPLETED", val:todayCompleted.length,                     color:"#00D4AA",icon:"✅"},
          {label:"TODAY EFF AVG",   val:todayEffAvg!=null?todayEffAvg+"%":"—",     color:effColor(todayEffAvg),icon:"⚡"},
          {label:"ACTIVE ORDERS",   val:active.length,                             color:"#FFC107",icon:"🔄"},
          {label:"TOTAL ORDERS",    val:orders.length,                             color:"#8B90A8",icon:"📊"},
          {label:"OVERALL EFF AVG", val:overallAvgEff!=null?overallAvgEff+"%":"—", color:effColor(overallAvgEff),icon:"🎯"},
          {label:"TODAY MAN HRS",   val:todayManHrs+"h",                           color:"#FF9500",icon:"👥"},
        ].map(s=>(
          <div key={s.label} className="card" style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px"}}>
            <div style={{fontSize:22}}>{s.icon}</div>
            <div><div style={{fontSize:20,fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div><div style={{fontSize:9,color:"#5A5F78",letterSpacing:1.5,marginTop:3,textTransform:"uppercase"}}>{s.label}</div></div>
          </div>
        ))}
      </div>

      {/* Man Hours by Line */}
      {lineManHours.length>0&&(
        <div className="card" style={{marginBottom:22}}>
          <div style={{fontSize:11,color:"#FF9500",letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>👥 Man Hours by Production Line (Today)</div>
          <div style={{display:"grid",gap:10}}>
            {lineManHours.map(l=>{
              const hrs=(l.mins/60).toFixed(2);
              const pct=Math.round((l.mins/maxMins)*100);
              return(
                <div key={l.line_id} style={{background:"#13161F",borderRadius:6,padding:"10px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5,flexWrap:"wrap",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{color:"#7B8CFF",fontWeight:700,fontSize:12}}>{l.line_id}</span>
                      <span style={{color:"#C8CADC",fontSize:12}}>{l.line_name}</span>
                      <span style={{background:"rgba(255,149,0,.12)",color:"#FF9500",fontSize:10,padding:"2px 8px",borderRadius:12,fontWeight:600}}>{l.emps.length} emp{l.emps.length!==1?"s":""}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:11,color:"#8B90A8"}}>{l.emps.join(", ")}</span>
                      <span style={{fontSize:16,fontWeight:700,color:"#FF9500"}}>{hrs}h</span>
                    </div>
                  </div>
                  <div style={{height:5,background:"#2A2F45",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:"#FF9500",borderRadius:3}}/></div>
                  <div style={{fontSize:10,color:"#5A5F78",marginTop:4}}>{Math.round(l.mins)} total minutes</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Orders */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>{isAdmin?"Active Orders":"My Active Orders"} ({visibleActive.length})</h2>
        <div style={{display:"flex",gap:8}}>
          <button className="bg" style={{fontSize:11}} onClick={reload}>↻ Refresh</button>
          <button className="bp" onClick={onNewOrder}>+ Start New Order</button>
        </div>
      </div>
      {visibleActive.length===0
        ?<div className="card" style={{textAlign:"center",padding:40,color:"#4A4F65"}}><div style={{fontSize:36,marginBottom:10}}>📭</div><div>No active orders.</div></div>
        :<div style={{display:"grid",gap:10}}>{visibleActive.map(o=><OrderCard key={o.id} order={o} items={items} onClose={()=>onClose(o)} onPause={()=>onPause(o)} onResume={()=>onResume(o)}/>)}</div>
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  NEW ORDER FORM
// ══════════════════════════════════════════════════════════════
function NewOrderForm({items,employees,lines,orders,user,setOrders,showToast,onDone}){
  const [nf,setNf]=useState({selectedEmployees:[],orderNumber:"",itemId:"",lineId:"",productionQty:"",startDateTime:""});
  const [searching,setSearching]=useState(false);
  const [autoFilled,setAutoFilled]=useState(false);
  const [saving,setSaving]=useState(false);
  const [plannedOrder,setPlannedOrder]=useState(null);

  const findOrder=async()=>{
    if(!nf.orderNumber.trim()){showToast("Enter an order number to search.","error");return;}
    setSearching(true);
    try{
      const res=await db.findPlanned(nf.orderNumber.trim().toUpperCase());
      if(res.length){
        const po=res[0];
        setPlannedOrder(po);
        // resolve item & line names
        const it=items.find(i=>i.id===po.item_id);
        const li=lines.find(l=>l.id===po.line_id);
        setNf(f=>({...f,
          orderNumber:po.order_number,
          itemId:po.item_id||"",
          lineId:po.line_id||"",
          productionQty:String(po.production_qty||""),
          startDateTime:po.scheduled_datetime?new Date(new Date(po.scheduled_datetime)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):"",
        }));
        setAutoFilled(true);
        showToast("Order found — fields auto-filled!");
      } else {
        setAutoFilled(false); setPlannedOrder(null);
        showToast("Order not found in planned list. Fill manually.","warn");
      }
    }catch(e){showToast("Search failed: "+e.message,"error");}
    setSearching(false);
  };

  const handleStart=async()=>{
    const{selectedEmployees,orderNumber,itemId,lineId,productionQty}=nf;
    if(!selectedEmployees.length||!orderNumber||!itemId||!lineId||!productionQty){showToast("Please fill all required fields.","error");return;}
    if(orders.find(o=>o.order_number===orderNumber&&o.status!=="Completed")){showToast("Active order with this number exists.","error");return;}
    setSaving(true);
    try{
      const item=items.find(i=>i.id===itemId);
      const line=lines.find(l=>l.id===lineId);
      const numEmp=selectedEmployees.length;
      const o={
        order_number:orderNumber,
        employee:selectedEmployees.join(", "),
        employees:selectedEmployees,
        num_employees:numEmp,
        item_id:itemId,item_name:item?.name||"",
        line_id:lineId,line_name:line?.name||"",
        production_qty:Number(productionQty),
        start_datetime:nf.startDateTime?new Date(nf.startDateTime).toISOString():nowISO(),
        status:"In Progress",is_paused:false,breaks:[],break_minutes:0,
        created_by:user.username,
      };
      const res=await db.addOrder(o);
      // update planned order status
      if(plannedOrder) try{await db.updatePlanned(plannedOrder.id,{status:"started"});}catch{}
      setOrders(p=>[res[0],...p]);
      showToast(`Order ${orderNumber} started with ${numEmp} employee${numEmp>1?"s":""}!`);
      onDone();
    }catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };

  const selectedItem=items.find(i=>i.id===nf.itemId);

  return(
    <div className="au" style={{maxWidth:680}}>
      <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase",marginBottom:24}}>Start New Production Order</h2>
      <div className="card">
        {/* Order number search */}
        <div className="fg">
          <label>Order Number * <span style={{color:"#7B8CFF",fontSize:10,letterSpacing:0}}>— search to auto-fill</span></label>
          <div style={{display:"flex",gap:10}}>
            <input placeholder="e.g. ORD-2025-001" value={nf.orderNumber}
              onChange={e=>{setNf(f=>({...f,orderNumber:e.target.value.toUpperCase()}));setAutoFilled(false);setPlannedOrder(null);}}
              onKeyDown={e=>e.key==="Enter"&&findOrder()} style={{flex:1}}/>
            <button className="bp" style={{whiteSpace:"nowrap",padding:"10px 16px",fontSize:12}} onClick={findOrder} disabled={searching}>
              {searching?"🔍…":"🔍 Find"}
            </button>
          </div>
        </div>

        {autoFilled&&<div className="autofill-banner">✔ Order found — fields auto-filled from planned orders. Select employee(s) to continue.</div>}

        {/* Employee picker */}
        <div className="fg">
          <label>Employee(s) * <span style={{color:"#7B8CFF",fontSize:10,letterSpacing:0}}>— select one or more</span></label>
          <EmployeePicker employees={employees} selected={nf.selectedEmployees} onChange={sel=>setNf(f=>({...f,selectedEmployees:sel}))}/>
          {nf.selectedEmployees.length>0&&<div style={{fontSize:11,color:"#7B8CFF",marginTop:6}}>👥 {nf.selectedEmployees.length} employee{nf.selectedEmployees.length>1?"s":""} selected</div>}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div className="fg">
            <label>Production Line *</label>
            <select value={nf.lineId} onChange={e=>setNf(f=>({...f,lineId:e.target.value}))} style={autoFilled&&nf.lineId?{borderColor:"#00D4AA"}:{}}>
              <option value="">— Select Line —</option>
              {lines.map(l=><option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}
            </select>
            {autoFilled&&nf.lineId&&<div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>✔ Auto-filled</div>}
          </div>
          <div className="fg">
            <label>Production Qty *</label>
            <input type="number" min="1" placeholder="0" value={nf.productionQty} onChange={e=>setNf(f=>({...f,productionQty:e.target.value}))} style={autoFilled&&nf.productionQty?{borderColor:"#00D4AA"}:{}}/>
            {autoFilled&&nf.productionQty&&<div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>✔ Auto-filled</div>}
          </div>
        </div>

        <div className="fg">
          <label>Item Number *</label>
          {autoFilled&&nf.itemId
            ?<div><input value={`${nf.itemId} — ${selectedItem?.name||""}`} readOnly/><div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>✔ Auto-filled</div></div>
            :<ItemSearch items={items} value={nf.itemId} onChange={v=>setNf(f=>({...f,itemId:v}))}/>
          }
          {selectedItem?.std_minutes&&(
            <div style={{background:"#13161F",border:"1px solid #2A3545",borderRadius:5,padding:"9px 12px",marginTop:8,fontSize:11,color:"#8B90A8"}}>
              ⏱ Std: <span style={{color:"#7B8CFF"}}>{selectedItem.std_minutes} min/piece</span> &nbsp;·&nbsp;
              👥 <span style={{color:"#FF9500"}}>{nf.selectedEmployees.length||1} employee{nf.selectedEmployees.length>1?"s":""}</span><br/>
              <span style={{color:"#5A5F78",fontSize:10}}>Efficiency = (std × end_qty) ÷ (working_mins × {nf.selectedEmployees.length||1}) × 100</span>
            </div>
          )}
        </div>

        <div className="fg">
          <label>Start Date & Time</label>
          <div style={{display:"flex",gap:10}}>
            <input type="datetime-local" value={nf.startDateTime} onChange={e=>setNf(f=>({...f,startDateTime:e.target.value}))} style={{flex:1,...(autoFilled&&nf.startDateTime?{borderColor:"#00D4AA"}:{})}}/>
            <button className="bg" style={{whiteSpace:"nowrap",padding:"10px 14px"}} onClick={()=>setNf(f=>({...f,startDateTime:toLocalDT()}))}>📍 Now</button>
          </div>
          {autoFilled&&nf.startDateTime&&<div style={{fontSize:9,color:"#5A5F78",marginTop:3}}>✔ Auto-filled — click "Now" to override</div>}
        </div>

        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button className="bp" onClick={handleStart} disabled={saving} style={{flex:1,padding:12}}>{saving?"Saving…":"▶ START ORDER"}</button>
          <button className="bg" onClick={onDone}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  SEARCH VIEW
// ══════════════════════════════════════════════════════════════
function SearchView({orders,items,onClose,onPause,onResume}){
  const [q,setQ]=useState(""); const [result,setResult]=useState(null); const [notFound,setNotFound]=useState(false);
  const search=async()=>{
    if(!q.trim())return;
    try{ const r=await db.searchOrder(q.trim()); r.length?(setResult(r[0]),setNotFound(false)):(setResult(null),setNotFound(true)); }
    catch(e){}
  };
  return(
    <div className="au" style={{maxWidth:700}}>
      <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase",marginBottom:24}}>Search Order</h2>
      <div className="card" style={{marginBottom:16}}>
        <div style={{display:"flex",gap:10}}>
          <input placeholder="Enter Order Number…" value={q} onChange={e=>setQ(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&search()}/>
          <button className="bp" onClick={search} style={{whiteSpace:"nowrap"}}>🔍 Search</button>
        </div>
      </div>
      {notFound&&<div className="card" style={{textAlign:"center",color:"#FF4B6E",padding:32}}><div style={{fontSize:32,marginBottom:8}}>🚫</div><div>No order found for "{q}"</div></div>}
      {result&&<div className="au"><OrderCard order={result} items={items} onClose={result.status==="In Progress"&&!result.is_paused?()=>onClose(result):null} onPause={result.status==="In Progress"&&!result.is_paused?()=>onPause(result):null} onResume={result.is_paused?()=>onResume(result):null}/></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ORDER CARD (with pause/resume + time tracking)
// ══════════════════════════════════════════════════════════════
function OrderCard({order:o,items,onClose,onPause,onResume}){
  const isPaused=o.is_paused;
  const statusLabel=o.status==="Completed"?"Completed":isPaused?"On Break":"In Progress";
  const sc=STATUS_COLORS[statusLabel]||{dot:"#6C757D",bg:""};
  const breaks=o.breaks||[];
  const brkTotal=Math.round(breakTotal(breaks));
  const wMin=Math.round(workingMin(o));
  const elapsed=o.status==="Completed"?getDuration(o.start_datetime,o.end_datetime):(isPaused?"Paused":fmtElapsed(o.start_datetime));
  const eff=o.efficiency; const ec=effColor(eff);
  const item=items?.find(i=>i.id===o.item_id);
  return(
    <div style={{background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:8,padding:"16px 18px",borderLeft:`3px solid ${sc.dot}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:16,fontWeight:700,color:"#00D4AA"}}>{o.order_number}</span>
          <span className="tag" style={{background:sc.bg,color:sc.dot,border:`1px solid ${sc.dot}44`}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>
            {statusLabel}
          </span>
          {eff!=null&&<span style={{fontSize:12,fontWeight:700,color:ec}}>⚡ {eff}% eff</span>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {onPause&&<button className="bpause" onClick={onPause}>⏸ Break</button>}
          {onResume&&<button className="bresume" onClick={onResume}>▶ Resume</button>}
          {onClose&&!isPaused&&<button className="bd" style={{fontSize:11,padding:"6px 12px"}} onClick={onClose}>⏹ End</button>}
          {isPaused&&<button className="bd" style={{fontSize:11,padding:"6px 12px",opacity:.4}} disabled>⏹ End</button>}
        </div>
      </div>

      {isPaused&&(
        <div className="pause-banner">
          <span style={{fontSize:16}}>⏸</span>
          <div><div style={{fontSize:11,color:"#FF9500",fontWeight:700}}>On break — timer paused</div><div style={{fontSize:10,color:"#8B90A8",marginTop:2}}>Break time will not count toward efficiency</div></div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:"5px 16px",marginBottom:10}}>
        {[
          ["Employees",(o.employees?.join(", ")||o.employee)+((o.num_employees||1)>1?` (${o.num_employees}👥)`:"")],
          ["Line",`${o.line_id} — ${o.line_name}`],
          ["Item",`${o.item_id} — ${o.item_name}`],
          ["Plan Qty",o.production_qty],
          ["Started",fmt(o.start_datetime)],
          ...(o.status==="Completed"
            ?[["Ended",fmt(o.end_datetime)],["End Qty",o.end_qty],["Duration",getDuration(o.start_datetime,o.end_datetime)]]
            :[["Elapsed",elapsed]])
        ].map(([k,v])=>(
          <div key={k}><div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase"}}>{k}</div><div style={{fontSize:11,color:"#C8CADC",marginTop:2}}>{v}</div></div>
        ))}
      </div>

      {/* Time Tracking Panel */}
      {(o.status==="In Progress"||isPaused||o.status==="Completed")&&(
        <div style={{background:"#13161F",borderRadius:6,padding:"10px 14px"}}>
          <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Time Tracking</div>
          <div className="tp-grid" style={{marginBottom:breaks.length>0?8:0}}>
            <div><div className="tp-val" style={{color:"#7B8CFF"}}>{o.status==="Completed"?Math.round(o.actual_minutes||0)+"m":Math.round(getElapsedMin(o.start_datetime))+"m"}</div><div className="tp-lbl">Total Elapsed</div></div>
            <div><div className="tp-val" style={{color:"#00D4AA"}}>{o.status==="Completed"?(o.working_minutes||0)+"m":wMin+"m"}</div><div className="tp-lbl">Working Time</div></div>
            <div><div className="tp-val" style={{color:"#FF9500"}}>{o.status==="Completed"?Math.round(o.break_minutes||0):brkTotal}{isPaused?"m+":"m"}</div><div className="tp-lbl">Break Time</div></div>
            <div><div className="tp-val" style={{color:"#8B90A8"}}>{breaks.length}</div><div className="tp-lbl">Breaks</div></div>
          </div>
          {breaks.length>0&&(
            <div>
              <div style={{fontSize:8,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Break Log</div>
              {breaks.map((b,i)=>{
                const dur=b.end_time?Math.round((new Date(b.end_time)-new Date(b.start_time))/60000)+"m":"running";
                return(<div key={i} className="brk-row"><span style={{color:"#FF9500",fontWeight:700,width:46,flexShrink:0}}>Break {i+1}</span><span>{fmt(b.start_time)} → {b.end_time?fmt(b.end_time):"ongoing…"}</span><span style={{marginLeft:"auto",color:b.end_time?"#C8CADC":"#FF9500"}}>{dur}</span></div>);
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  RECORDS VIEW (admin only)
// ══════════════════════════════════════════════════════════════
function RecordsView({orders,allOrders,items,employees,lines,fEmp,setFEmp,fLine,setFLine,fStatus,setFStatus,fFrom,setFFrom,fTo,setFTo,sortF,sortD,handleSort,exportCSV,reload,clearFilters}){
  return(
    <div className="au">
      <div style={{background:"#13161F",border:"1px solid #2A2F45",borderRadius:8,padding:"14px 16px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>Records <span style={{color:"#4A4F65"}}>({orders.length})</span></h2>
          <div style={{display:"flex",gap:8}}>
            <button className="bg" style={{fontSize:11}} onClick={reload}>↻ Refresh</button>
            <button className="bp" style={{fontSize:12,padding:"8px 16px"}} onClick={exportCSV}>⬇ Export CSV</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
          <div><label>Employee</label><select value={fEmp} onChange={e=>setFEmp(e.target.value)}><option value="All">All</option>{employees.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
          <div><label>Line</label><select value={fLine} onChange={e=>setFLine(e.target.value)}><option value="All">All</option>{lines.map(l=><option key={l.id} value={l.id}>{l.id}</option>)}</select></div>
          <div><label>Status</label><select value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="All">All</option><option>In Progress</option><option>Completed</option></select></div>
          <div><label>From Date</label><input type="date" value={fFrom} onChange={e=>setFFrom(e.target.value)}/></div>
          <div><label>To Date</label><input type="date" value={fTo} onChange={e=>setFTo(e.target.value)}/></div>
          <div style={{display:"flex",alignItems:"flex-end"}}><button className="bg" style={{width:"100%",fontSize:11}} onClick={clearFilters}>✕ Clear</button></div>
        </div>
      </div>
      {orders.length===0
        ?<div className="card" style={{textAlign:"center",padding:48,color:"#4A4F65"}}><div style={{fontSize:40,marginBottom:12}}>📂</div><div>No records found.</div></div>
        :(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:"1px solid #2A2F45"}}>
                  {[["Order #","order_number"],["Employees","employee"],["Line","line_id"],["Item","item_id"],["Plan","production_qty"],["End Qty","end_qty"],["Std Min",null],["Work Min","working_minutes"],["Brk Min","break_minutes"],["Man Hrs",null],["Eff %","efficiency"],["Start","start_datetime"],["End","end_datetime"],["Duration",null],["Status","status"],["Remarks",null],["Action",null]].map(([h,f])=>(
                    <th key={h} className={f?"sort":""} onClick={f?()=>handleSort(f):undefined}
                      style={{padding:"9px 10px",textAlign:"left",color:sortF===f?"#00D4AA":"#5A5F78",fontSize:10,fontWeight:600,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>
                      {h}{f&&<span style={{marginLeft:3,opacity:.6}}>{sortF===f?(sortD==="asc"?"↑":"↓"):"↕"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o=>{
                  const sc=STATUS_COLORS[o.is_paused?"On Break":o.status]||{dot:"#6C757D"};
                  const dur=o.end_datetime?getDuration(o.start_datetime,o.end_datetime):"—";
                  const eff=o.efficiency; const ec=effColor(eff);
                  const stdMin=items.find(i=>i.id===o.item_id)?.std_minutes;
                  const manHrs=o.working_minutes?(o.working_minutes/60).toFixed(2):o.actual_minutes?(o.actual_minutes/60).toFixed(2):null;
                  return(
                    <tr key={o.id} style={{borderBottom:"1px solid #1E2135"}}>
                      <td style={{padding:"8px 10px",color:"#00D4AA",fontWeight:600,whiteSpace:"nowrap"}}>{o.order_number}</td>
                      <td style={{padding:"8px 10px",color:"#C8CADC",maxWidth:140}}>
                        <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.employees?.join(", ")||o.employee}</div>
                        {(o.num_employees||1)>1&&<div style={{fontSize:10,color:"#FF9500"}}>👥{o.num_employees}</div>}
                      </td>
                      <td style={{padding:"8px 10px",color:"#7B8CFF",whiteSpace:"nowrap"}}>{o.line_id}</td>
                      <td style={{padding:"8px 10px",color:"#8B90A8",maxWidth:140}}>
                        <div style={{fontSize:10,color:"#5A5F78"}}>{o.item_id}</div>
                        <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{o.item_name}</div>
                      </td>
                      <td style={{padding:"8px 10px",textAlign:"center"}}>{o.production_qty}</td>
                      <td style={{padding:"8px 10px",textAlign:"center",color:o.end_qty!=null?"#00D4AA":"#4A4F65"}}>{o.end_qty??"—"}</td>
                      <td style={{padding:"8px 10px",textAlign:"center",color:"#7B8CFF"}}>{stdMin??<span style={{color:"#4A4F65"}}>—</span>}</td>
                      <td style={{padding:"8px 10px",textAlign:"center",color:"#00D4AA"}}>{o.working_minutes??<span style={{color:"#4A4F65"}}>—</span>}</td>
                      <td style={{padding:"8px 10px",textAlign:"center",color:"#FF9500"}}>{o.break_minutes?Math.round(o.break_minutes):<span style={{color:"#4A4F65"}}>0</span>}</td>
                      <td style={{padding:"8px 10px",textAlign:"center",color:"#FF9500"}}>{manHrs?manHrs+"h":<span style={{color:"#4A4F65"}}>—</span>}</td>
                      <td style={{padding:"8px 10px",textAlign:"center"}}>
                        {eff!=null?(<div><span style={{color:ec,fontWeight:700}}>{eff}%</span><div className="eff-bar"><div className="eff-fill" style={{width:Math.min(eff,150)+"%",background:ec}}/></div></div>):<span style={{color:"#4A4F65"}}>—</span>}
                      </td>
                      <td style={{padding:"8px 10px",color:"#8B90A8",whiteSpace:"nowrap",fontSize:11}}>{fmt(o.start_datetime)}</td>
                      <td style={{padding:"8px 10px",color:"#8B90A8",whiteSpace:"nowrap",fontSize:11}}>{fmt(o.end_datetime)}</td>
                      <td style={{padding:"8px 10px",color:"#7B8CFF",whiteSpace:"nowrap"}}>{dur}</td>
                      <td style={{padding:"8px 10px"}}>
                        <span className="tag" style={{background:sc.bg||"",color:sc.dot,border:`1px solid ${sc.dot}44`}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>
                          {o.is_paused?"On Break":o.status}
                        </span>
                      </td>
                      <td style={{padding:"8px 10px",color:"#8B90A8",fontSize:11,maxWidth:120}}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.remarks||"—"}</div></td>
                      <td style={{padding:"8px 10px"}}></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════════════════════════
function AdminPanel({items,setItems,employees,setEmployees,lines,setLines,showToast,reload}){
  const [tab,setTab]=useState("planned");
  const [users,setUsers]=useState([]); const [loadingU,setLoadingU]=useState(true);
  const [newUser,setNewUser]=useState({username:"",password:"",full_name:"",role:"worker"});
  const [newItem,setNewItem]=useState({id:"",name:"",std_minutes:""});
  const [editItem,setEditItem]=useState(null); const [itemSearch,setItemSearch]=useState("");
  const [newEmp,setNewEmp]=useState(""); const [newLine,setNewLine]=useState({id:"",name:""});
  const [planned,setPlanned]=useState([]); const [loadingP,setLoadingP]=useState(true);
  const [csvPreview,setCsvPreview]=useState(null); const [csvErr,setCsvErr]=useState([]);
  const [saving,setSaving]=useState(false);
  const fileRef=useRef(); const itemFileRef=useRef(); const plannedFileRef=useRef();

  useEffect(()=>{
    db.getUsers().then(u=>{setUsers(u);setLoadingU(false);}).catch(()=>setLoadingU(false));
    db.getPlanned().then(p=>{setPlanned(p);setLoadingP(false);}).catch(()=>setLoadingP(false));
  },[]);

  // Users
  const addUser=async()=>{ const{username,password,full_name,role}=newUser; if(!username||!password||!full_name){showToast("All fields required.","error");return;} setSaving(true); try{const r=await db.addUser({username:username.trim().toLowerCase(),password:password.trim(),full_name:full_name.trim(),role});setUsers(p=>[...p,r[0]]);setNewUser({username:"",password:"",full_name:"",role:"worker"});showToast("User added.");}catch(e){showToast("Failed: "+e.message,"error");} setSaving(false); };
  const toggleUser=async u=>{try{await db.updateUser(u.id,{active:!u.active});setUsers(p=>p.map(x=>x.id===u.id?{...x,active:!x.active}:x));showToast(u.active?"Deactivated.":"Activated.");}catch{showToast("Failed.","error");}};
  const resetPw=async(u,pw)=>{if(!pw)return;try{await db.updateUser(u.id,{password:pw});showToast(`Password updated for ${u.username}.`);}catch{showToast("Failed.","error")or");}};

  // Items
  const addItem=async()=>{if(!newItem.id||!newItem.name){showToast("ID and Name required.","error");return;}if(items.find(i=>i.id===newItem.id.trim().toUpperCase())){showToast("Item ID exists.","error");return;}setSaving(true);try{const it={id:newItem.id.trim().toUpperCase(),name:newItem.name.trim(),std_minutes:newItem.std_minutes?Number(newItem.std_minutes):null};await db.addItem(it);setItems(p=>[...p,it]);setNewItem({id:"",name:"",std_minutes:""});showToast("Item added.");}catch(e){showToast("Failed: "+e.message,"error");}setSaving(false);};
  const saveEditItem=async()=>{if(!editItem.name){showToast("Name required.","error");return;}try{await db.updateItem(editItem.id,{name:editItem.name,std_minutes:editItem.std_minutes?Number(editItem.std_minutes):null});setItems(p=>p.map(i=>i.id===editItem.id?{...i,name:editItem.name,std_minutes:editItem.std_minutes?Number(editItem.std_minutes):null}:i));setEditItem(null);showToast("Item updated.");}catch(e){showToast("Failed.","error");}};
  const delItem=async id=>{try{await db.deleteItem(id);setItems(p=>p.filter(i=>i.id!==id));showToast("Removed.");}catch{showToast("Failed.","error");}};
  const exportItemsCSV=()=>{dlFile(["id,name,std_minutes",...items.map(i=>`"${i.id}","${i.name}","${i.std_minutes??""}"`)].join("\n"),"prodtrack_items.csv");showToast(`Exported ${items.length} items.`);};
  const handleItemFile=e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{const res=parseItemCSV(ev.target.result);setCsvPreview({type:"items",...res});setCsvErr(res.errors);};r.readAsText(file);e.target.value="";};
  const applyItemImport=async mode=>{if(!csvPreview?.items)return;setSaving(true);try{if(mode==="replace"){for(const i of items){try{await db.deleteItem(i.id);}catch{}}for(const i of csvPreview.items){try{await db.addItem(i);}catch{}}}else{for(const i of csvPreview.items){if(!items.find(x=>x.id===i.id))try{await db.addItem(i);}catch{}}}await reload();setCsvPreview(null);showToast(`${mode==="replace"?"Replaced":"Appended"} ${csvPreview.items.length} items.`);}catch(e){showToast("Import failed.","error");}setSaving(false);};

  // Employees
  const addEmp=async()=>{if(!newEmp.trim()){showToast("Name required.","error");return;}try{await db.addEmployee({name:newEmp.trim()});setEmployees(p=>[...p,newEmp.trim()]);setNewEmp("");showToast("Employee added.");}catch(e){showToast("Failed.","error");}};
  const delEmp=async name=>{try{const all=await db.getEmployees();const rec=all.find(e=>e.name===name);if(rec)await db.deleteEmployee(rec.id);setEmployees(p=>p.filter(e=>e!==name));showToast("Removed.");}catch{showToast("Failed.","error");}};

  // Lines
  const addLine=async()=>{if(!newLine.id||!newLine.name){showToast("ID and Name required.","error");return;}try{const l={id:newLine.id.trim().toUpperCase(),name:newLine.name.trim()};await db.addLine(l);setLines(p=>[...p,l]);setNewLine({id:"",name:""});showToast("Line added.");}catch(e){showToast("Failed.","error");}};
  const delLine=async id=>{try{await db.deleteLine(id);setLines(p=>p.filter(l=>l.id!==id));showToast("Removed.");}catch{showToast("Failed.","error");}};

  const filteredItems=itemSearch.trim()?items.filter(i=>i.id.toLowerCase().includes(itemSearch.toLowerCase())||i.name.toLowerCase().includes(itemSearch.toLowerCase())):items;

  const ATABS=[
    {id:"planned",  label:`📋 Planned (${planned.length})`},
    {id:"users",    label:`👥 Users (${users.length})`},
    {id:"items",    label:`📦 Items (${items.length})`},
    {id:"employees",label:`👤 Employees (${employees.length})`},
    {id:"lines",    label:`🏭 Lines (${lines.length})`},
  ];

  return(
    <div className="au">
      <h2 style={{fontSize:13,color:"#FF9500",letterSpacing:2,textTransform:"uppercase",marginBottom:20}}>⚙ Admin — Manage Master Data</h2>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #2A2F45",marginBottom:24,flexWrap:"wrap"}}>
        {ATABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,padding:"8px 14px",cursor:"pointer",borderRadius:"4px 4px 0 0",color:tab===t.id?"#FF9500":"#8B90A8",borderBottom:tab===t.id?"2px solid #FF9500":"2px solid transparent",fontWeight:tab===t.id?700:400,whiteSpace:"nowrap"}}>{t.label}</button>)}
      </div>

      {/* ── PLANNED ORDERS ── */}
      {tab==="planned"&&(
        <div style={{maxWidth:900}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Upload Planned Orders (CSV)</div>
            <div style={{fontSize:12,color:"#8B90A8",lineHeight:1.8,marginBottom:10}}>Columns: <span style={{color:"#00D4AA"}}>order_number, item_id, line_id, production_qty, scheduled_datetime</span></div>
            <pre style={{background:"#0F1117",borderRadius:5,padding:"10px 14px",fontSize:11,color:"#5A8A7A",lineHeight:1.7,marginBottom:12,fontFamily:"monospace",whiteSpace:"pre-wrap"}}>{"order_number,item_id,line_id,production_qty,scheduled_datetime\nORD-2025-001,ITM-001,LINE-01,100,2026-06-01 08:00\nORD-2025-002,ITM-002,LINE-04,200,2026-06-02 09:30"}</pre>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <input ref={plannedFileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handlePlannedFile}/>
              <button className="bw" onClick={()=>plannedFileRef.current.click()}>⬆ Upload CSV</button>
              <button className="bg" style={{fontSize:11}} onClick={()=>dlFile(PLANNED_TEMPLATE,"planned_orders_template.csv")}>⬇ Download Template</button>
            </div>
          </div>
          {csvPreview?.type==="planned"&&csvPreview.orders?.length>0&&(
            <div className="card au" style={{marginBottom:14,borderColor:"#00D4AA44"}}>
              <div style={{fontSize:12,color:"#00D4AA",fontWeight:700,marginBottom:10}}>✔ Preview: {csvPreview.orders.length} orders ready</div>
              {csvPreview.orders.slice(0,4).map(o=><div key={o.order_number} style={{fontSize:11,color:"#8B90A8",marginBottom:3}}>• {o.order_number} — {o.item_id} — Qty:{o.production_qty}</div>)}
              {csvPreview.orders.length>4&&<div style={{fontSize:11,color:"#4A4F65",marginBottom:8}}>…and {csvPreview.orders.length-4} more</div>}
              <div style={{display:"flex",gap:10,marginTop:10}}>
                <button className="bp" onClick={applyPlannedImport} disabled={saving} style={{flex:1}}>{saving?"Importing…":"➕ Import"}</button>
                <button className="bg" onClick={()=>setCsvPreview(null)}>Cancel</button>
              </div>
            </div>
          )}
          {csvErr.length>0&&<div className="card" style={{marginBottom:14,borderColor:"#FF4B6E44"}}>{csvErr.map((e,i)=><div key={i} style={{fontSize:11,color:"#FF9090",marginBottom:4}}>• {e}</div>)}</div>}
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #2A2F45",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,textTransform:"uppercase"}}>Planned Orders ({planned.length})</div>
              <button className="bg" style={{fontSize:11}} onClick={()=>db.getPlanned().then(setPlanned)}>↻ Refresh</button>
            </div>
            {loadingP?<div style={{padding:24,color:"#4A4F65",fontSize:12}}>Loading…</div>:planned.length===0
              ?<div style={{padding:24,color:"#4A4F65",fontSize:12,textAlign:"center"}}>No planned orders yet. Upload a CSV to add them.</div>
              :(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{borderBottom:"1px solid #2A2F45"}}>{["Order #","Item","Line","Qty","Scheduled","Status",""].map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",color:"#5A5F78",fontSize:10,fontWeight:600,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {planned.map(o=>(
                        <tr key={o.id} style={{borderBottom:"1px solid #1E2135"}}>
                          <td style={{padding:"8px 12px",color:"#00D4AA",fontWeight:600}}>{o.order_number}</td>
                          <td style={{padding:"8px 12px",color:"#C8CADC"}}>{o.item_id}{o.item_name&&o.item_name!==o.item_id?` — ${o.item_name}`:""}</td>
                          <td style={{padding:"8px 12px",color:"#7B8CFF"}}>{o.line_id}</td>
                          <td style={{padding:"8px 12px",textAlign:"center"}}>{o.production_qty}</td>
                          <td style={{padding:"8px 12px",color:"#8B90A8",whiteSpace:"nowrap"}}>{fmt(o.scheduled_datetime)}</td>
                          <td style={{padding:"8px 12px"}}>
                            <span className={o.status==="pending"?"badge-pending":o.status==="started"?"badge-started":"badge-completed"}>{o.status}</span>
                          </td>
                          <td style={{padding:"8px 12px"}}>{o.status==="pending"&&<button className="pdel" onClick={()=>delPlanned(o.id)}>✕</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
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
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>All Users ({users.length})</div>
            {loadingU?<div style={{color:"#4A4F65"}}>Loading…</div>:<div style={{display:"flex",flexDirection:"column",gap:10}}>{users.map(u=><UserRow key={u.id} u={u} onToggle={()=>toggleUser(u)} onResetPw={pw=>resetPw(u,pw)}/>)}</div>}
          </div>
        </div>
      )}

      {/* ── ITEMS ── */}
      {tab==="items"&&(
        <div style={{maxWidth:780}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add New Item</div>
            <div style={{display:"grid",gridTemplateColumns:"140px 1fr 120px auto",gap:10,alignItems:"end"}}>
              <div><label>Item ID *</label><input placeholder="ITM-011" value={newItem.id} onChange={e=>setNewItem(f=>({...f,id:e.target.value}))}/></div>
              <div><label>Item Name *</label><input placeholder="Part description" value={newItem.name} onChange={e=>setNewItem(f=>({...f,name:e.target.value}))}/></div>
              <div><label>Std Min/Piece</label><input type="number" placeholder="5" value={newItem.std_minutes} onChange={e=>setNewItem(f=>({...f,std_minutes:e.target.value}))}/></div>
              <button className="bp" onClick={addItem} disabled={saving} style={{padding:"10px 18px"}}>+ Add</button>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <input placeholder={`Search ${items.length} items…`} value={itemSearch} onChange={e=>setItemSearch(e.target.value)} style={{flex:1,minWidth:200,fontSize:12,padding:"8px 12px"}}/>
            <button className="bg" style={{fontSize:11}} onClick={exportItemsCSV}>⬇ Download CSV</button>
            <input ref={itemFileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleItemFile}/>
            <button className="bw" style={{fontSize:11}} onClick={()=>itemFileRef.current.click()}>⬆ Upload CSV</button>
            <button className="bg" style={{fontSize:11}} onClick={()=>dlFile(ITEM_TEMPLATE,"items_template.csv")}>⬇ Template</button>
          </div>
          {csvPreview?.type==="items"&&csvPreview.items?.length>0&&(
            <div className="card au" style={{marginBottom:14,borderColor:"#00D4AA44"}}>
              <div style={{fontSize:12,color:"#00D4AA",fontWeight:700,marginBottom:10}}>✔ {csvPreview.items.length} items ready</div>
              {csvPreview.items.slice(0,3).map(i=><div key={i.id} style={{fontSize:11,color:"#8B90A8",marginBottom:3}}>• {i.id} — {i.name} {i.std_minutes?"("+i.std_minutes+"min)":""}</div>)}
              <div style={{display:"flex",gap:10,marginTop:10}}>
                <button className="bp" onClick={()=>applyItemImport("append")} disabled={saving} style={{flex:1}}>➕ Append</button>
                <button className="bw" onClick={()=>applyItemImport("replace")} disabled={saving} style={{flex:1}}>🔄 Replace All</button>
                <button className="bg" onClick={()=>setCsvPreview(null)}>Cancel</button>
              </div>
            </div>
          )}
          <div className="card" style={{padding:"12px 0"}}>
            <div style={{fontSize:11,color:"#5A5F78",padding:"0 16px",marginBottom:8}}>{filteredItems.length} of {items.length} items</div>
            <div style={{maxHeight:460,overflowY:"auto"}}>
              {filteredItems.map(i=>(
                editItem?.id===i.id?(
                  <div key={i.id} style={{display:"flex",gap:8,padding:"6px 12px",background:"rgba(0,212,170,.05)",borderBottom:"1px solid #2A2F45"}}>
                    <input value={editItem.id} readOnly style={{width:110,fontSize:12,padding:"5px 10px",background:"#0F1117",color:"#5A5F78"}}/>
                    <input value={editItem.name} onChange={e=>setEditItem(f=>({...f,name:e.target.value}))} style={{flex:1,fontSize:12,padding:"5px 10px"}} autoFocus/>
                    <input type="number" placeholder="Std min" value={editItem.std_minutes??""} onChange={e=>setEditItem(f=>({...f,std_minutes:e.target.value}))} style={{width:90,fontSize:12,padding:"5px 10px"}}/>
                    <button className="bp" style={{fontSize:11,padding:"5px 12px"}} onClick={saveEditItem}>Save</button>
                    <button className="bg" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>setEditItem(null)}>✕</button>
                  </div>
                ):(
                  <div key={i.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 16px",borderBottom:"1px solid #1E2135"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#1E2135"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                      <span style={{color:"#00D4AA",fontWeight:600,fontSize:12,flexShrink:0,width:90}}>{i.id}</span>
                      <span style={{color:"#C8CADC",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.name}</span>
                      {i.std_minutes&&<span style={{color:"#7B8CFF",fontSize:10,flexShrink:0}}>⏱{i.std_minutes}m</span>}
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>setEditItem({...i})} style={{background:"none",border:"1px solid #2A3545",color:"#7B8CFF",fontSize:11,padding:"2px 8px",borderRadius:4,cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}>✏ Edit</button>
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
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add Employee</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"end"}}>
              <div><label>Full Name</label><input placeholder="First Last" value={newEmp} onChange={e=>setNewEmp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEmp()}/></div>
              <button className="bp" onClick={addEmp} disabled={saving} style={{padding:"10px 18px"}}>+ Add</button>
            </div>
          </div>
          <div className="card">
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Employees ({employees.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:380,overflowY:"auto"}}>
              {employees.map(e=><div key={e} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#13161F",padding:"8px 14px",borderRadius:6}}><span style={{color:"#C8CADC",fontSize:12}}>👤 {e}</span><button className="pdel" onClick={()=>delEmp(e)}>✕ Remove</button></div>)}
            </div>
          </div>
        </div>
      )}

      {/* ── LINES ── */}
      {tab==="lines"&&(
        <div style={{maxWidth:640}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add Production Line</div>
            <div style={{display:"grid",gridTemplateColumns:"140px 1fr auto",gap:10,alignItems:"end"}}>
              <div><label>Line ID</label><input placeholder="LINE-09" value={newLine.id} onChange={e=>setNewLine(f=>({...f,id:e.target.value}))}/></div>
              <div><label>Line Name</label><input placeholder="Night Shift Line" value={newLine.name} onChange={e=>setNewLine(f=>({...f,name:e.target.value}))}/></div>
              <button className="bp" onClick={addLine} disabled={saving} style={{padding:"10px 18px"}}>+ Add</button>
            </div>
          </div>
          <div className="card">
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Lines ({lines.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:380,overflowY:"auto"}}>
              {lines.map(l=><div key={l.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#13161F",padding:"8px 14px",borderRadius:6}}><div><span style={{color:"#7B8CFF",fontWeight:600,marginRight:10}}>{l.id}</span><span style={{color:"#C8CADC",fontSize:12}}>{l.name}</span></div><button className="pdel" onClick={()=>delLine(l.id)}>✕ Remove</button></div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EMPLOYEE PICKER ──────────────────────────────────────────
function EmployeePicker({employees,selected,onChange}){
  const [q,setQ]=useState("");
  const filtered=q.trim()?employees.filter(e=>e.toLowerCase().includes(q.toLowerCase())):employees;
  const toggle=name=>selected.includes(name)?onChange(selected.filter(e=>e!==name)):onChange([...selected,name]);
  return(
    <div>
      <div style={{background:"#1A1D27",border:"1px solid #00D4AA",borderRadius:4,overflow:"hidden"}}>
        <input placeholder="Search employees…" value={q} onChange={e=>setQ(e.target.value)}
          style={{background:"#13161F",border:"none",borderBottom:"1px solid #2A2F45",fontSize:12,padding:"8px 12px"}}/>
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
                  {on&&<span style={{color:"#0F1117",fontSize:10,fontWeight:700}}>✓</span>}
                </div>
                <span style={{fontSize:12,color:on?"#00D4AA":"#C8CADC",fontWeight:on?700:400}}>{e}</span>
              </div>
            );
          })}
        </div>
      </div>
      {selected.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
          {selected.map(e=>(
            <div key={e} style={{background:"rgba(0,212,170,.1)",border:"1px solid rgba(0,212,170,.25)",color:"#00D4AA",fontSize:10,padding:"3px 10px",borderRadius:12,display:"inline-flex",alignItems:"center",gap:5}}>
              {e}
              <span onClick={()=>toggle(e)} style={{cursor:"pointer",opacity:.7,fontSize:12}}
                onMouseEnter={ev=>ev.target.style.opacity=1} onMouseLeave={ev=>ev.target.style.opacity=.7}>✕</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ITEM SEARCH (handles 5000+) ──────────────────────────────
function ItemSearch({items,value,onChange}){
  const [q,setQ]=useState(""); const [open,setOpen]=useState(false); const ref=useRef();
  const selected=items.find(i=>i.id===value);
  const filtered=q.trim()?items.filter(i=>i.id.toLowerCase().includes(q.toLowerCase())||i.name.toLowerCase().includes(q.toLowerCase())).slice(0,100):items.slice(0,100);
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{background:"#1A1D27",border:`1px solid ${open?"#00D4AA":"#2A2F45"}`,borderRadius:4,padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,color:selected?"#E8EAF0":"#4A4F65"}}>
        <span>{selected?`${selected.id} — ${selected.name}`:"— Select Item —"}</span>
        <span style={{color:"#5A5F78",fontSize:10}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{position:"absolute",zIndex:999,top:"100%",left:0,right:0,marginTop:4,background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:6,boxShadow:"0 8px 32px rgba(0,0,0,.6)",overflow:"hidden"}}>
          <div style={{padding:8}}>
            <input autoFocus placeholder={`Search ${items.length} items…`} value={q} onChange={e=>setQ(e.target.value)} onClick={e=>e.stopPropagation()} style={{fontSize:12,padding:"7px 12px"}}/>
          </div>
          <div style={{maxHeight:250,overflowY:"auto"}}>
            {filtered.length===0
              ?<div style={{padding:"12px 14px",color:"#4A4F65",fontSize:12}}>No items found.</div>
              :filtered.map(i=>(
                <div key={i.id} onClick={()=>{onChange(i.id);setOpen(false);setQ("");}}
                  style={{padding:"8px 14px",cursor:"pointer",fontSize:12,background:value===i.id?"rgba(0,212,170,.1)":"transparent",borderBottom:"1px solid #1E2135",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(0,212,170,.06)"}
                  onMouseLeave={e=>e.currentTarget.style.background=value===i.id?"rgba(0,212,170,.1)":"transparent"}>
                  <span><span style={{color:"#5A5F78",marginRight:8,fontSize:11}}>{i.id}</span>{i.name}</span>
                  {i.std_minutes&&<span style={{color:"#7B8CFF",fontSize:10}}>⏱{i.std_minutes}m</span>}
                </div>
              ))
            }
            {filtered.length===100&&<div style={{padding:"7px 14px",color:"#4A4F65",fontSize:11,borderTop:"1px solid #1E2135"}}>Type to narrow down ({items.length} total)</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── USER ROW ─────────────────────────────────────────────────
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
