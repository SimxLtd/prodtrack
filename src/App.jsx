import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────
const SUPABASE_URL = "https://mdbziytahdeuegxlqggd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnppeXRhaGRldWVneGxxZ2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTI1MTIsImV4cCI6MjA5NTU2ODUxMn0.iPE2dckL4uVw-YewKxjd2IAq0Hii2-0QxDVQo52wH74";
// ─── SUPABASE HELPERS ──────────────────────────────────────────
const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
});

const sb = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...sbHeaders(), ...(opts.headers||{}) },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : [];
};

const sbAll = async (table, query = "") => {
  const PAGE = 1000;
  let all = [], from = 0;
  while (true) {
    const qs = query ? `${query}&limit=${PAGE}&offset=${from}` : `limit=${PAGE}&offset=${from}`;
    const page = await sb(`${table}?${qs}`);
    all = all.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  return all;
};

const db = {
  getUsers:       ()       => sbAll("pt_users","order=full_name.asc"),
  addUser:        (u)      => sb("pt_users",{method:"POST",body:JSON.stringify(u)}),
  updateUser:     (id,u)   => sb(`pt_users?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(u)}),
  loginUser:      (u,p)    => sb(`pt_users?username=eq.${u}&password=eq.${p}&active=eq.true`),
  getItems:       ()       => sbAll("pt_items","active=eq.true&order=id.asc"),
  addItem:        (i)      => sb("pt_items",{method:"POST",body:JSON.stringify(i)}),
  updateItem:     (id,i)   => sb(`pt_items?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(i)}),
  deleteItem:     (id)     => sb(`pt_items?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getEmployees:   ()       => sbAll("pt_employees","active=eq.true&order=name.asc"),
  addEmployee:    (e)      => sb("pt_employees",{method:"POST",body:JSON.stringify(e)}),
  deleteEmployee: (id)     => sb(`pt_employees?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getLines:       ()       => sbAll("pt_lines","active=eq.true&order=id.asc"),
  addLine:        (l)      => sb("pt_lines",{method:"POST",body:JSON.stringify(l)}),
  deleteLine:     (id)     => sb(`pt_lines?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({active:false})}),
  getOrders:      ()       => sbAll("pt_orders","order=created_at.desc"),
  addOrder:       (o)      => sb("pt_orders",{method:"POST",body:JSON.stringify(o)}),
  updateOrder:    (id,o)   => sb(`pt_orders?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(o)}),
  searchOrder:    (n)      => sb(`pt_orders?order_number=eq.${encodeURIComponent(n)}`),
};

// ─── HELPERS ───────────────────────────────────────────────────
const fmt = (dt) => !dt ? "—" : new Date(dt).toLocaleString("en-NZ",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"});
const nowISO  = () => new Date().toISOString();
const todayStr= () => new Date().toISOString().slice(0,10);
const getDuration = (s,e) => { const ms=new Date(e)-new Date(s); return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m ${Math.floor((ms%60000)/1000)}s`; };
const getMinutes  = (s,e) => (new Date(e)-new Date(s))/60000;
const getElapsed  = (s)   => { const ms=Date.now()-new Date(s); return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m (running)`; };
const calcEff     = (stdMin,endQty,actualMin) => stdMin&&endQty&&actualMin ? Math.round((stdMin*endQty/actualMin)*100) : null;
const effColor    = (e) => !e?"#8B90A8": e>=100?"#00D4AA": e>=80?"#FFC107": e>=60?"#FF9500":"#FF4B6E";

const STATUS_COLORS = {
  "In Progress":{ dot:"#FFC107", bg:"#FFF3CD33" },
  Completed:    { dot:"#198754", bg:"#D1E7DD33" },
};

function parseCSVItems(text) {
  const lines = text.trim().split(/\r?\n/).slice(1);
  const items=[]; const errors=[];
  lines.forEach((line,i)=>{
    const cols = line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
    const [id,name,std] = cols;
    if(!id||!name){errors.push(`Row ${i+2}: missing id or name`);return;}
    items.push({id:id.toUpperCase().trim(),name:name.trim(),std_minutes:std?Number(std):null});
  });
  return {items,errors};
}
const ITEM_TEMPLATE = `id,name,std_minutes\nITM-011,My New Part,5\nITM-012,Another Part,3`;
function dlItemTemplate(){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([ITEM_TEMPLATE],{type:"text/csv"}));
  a.download="items_template.csv"; a.click();
}

// ══════════════════════════════════════════════════════════════
//  GLOBAL CSS
// ══════════════════════════════════════════════════════════════
const GStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0F1117;}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:#1A1D27}
    ::-webkit-scrollbar-thumb{background:#3A3F55;border-radius:3px}
    .bp{background:#00D4AA;color:#0F1117;border:none;padding:10px 20px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bp:hover{background:#00FFCC;transform:translateY(-1px)} .bp:disabled{opacity:.4;cursor:not-allowed;transform:none}
    .bd{background:#FF4B6E;color:#fff;border:none;padding:8px 16px;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bd:hover{background:#FF2D55}
    .bg{background:transparent;color:#8B90A8;border:1px solid #2A2F45;padding:8px 16px;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bg:hover{border-color:#00D4AA;color:#00D4AA}
    .bw{background:#FF9500;color:#0F1117;border:none;padding:8px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .bw:hover{background:#FFAC30}
    input,select,textarea{background:#1A1D27;border:1px solid #2A2F45;color:#E8EAF0;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:10px 14px;border-radius:4px;width:100%;outline:none;transition:border .15s}
    input:focus,select:focus,textarea:focus{border-color:#00D4AA}
    input::placeholder{color:#4A4F65} select option{background:#1A1D27}
    label{display:block;font-size:11px;color:#8B90A8;margin-bottom:6px;letter-spacing:1px;text-transform:uppercase}
    .fg{margin-bottom:18px}
    .card{background:#1A1D27;border:1px solid #2A2F45;border-radius:8px;padding:20px}
    .nb{background:none;border:none;font-family:'IBM Plex Mono',monospace;font-size:12px;padding:10px 14px;cursor:pointer;transition:all .15s;letter-spacing:.5px;white-space:nowrap}
    .tag{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
    .mo{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}
    .md{background:#1A1D27;border:1px solid #2A2F45;border-radius:10px;padding:28px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto}
    .pdel{background:none;border:1px solid #3A2030;color:#FF4B6E;font-size:11px;padding:2px 8px;border-radius:12px;cursor:pointer;font-family:'IBM Plex Mono',monospace;transition:all .15s}
    .pdel:hover{background:#FF4B6E;color:#fff}
    @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .au{animation:fadeUp .18s ease forwards}
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .ti{animation:toastIn .2s ease}
    th.sortable{cursor:pointer;user-select:none} th.sortable:hover{color:#C8CADC!important}
    tr:hover td{background:#1A1F30!important}
    .eff-bar{height:6px;border-radius:3px;background:#2A2F45;overflow:hidden;margin-top:4px}
    .eff-fill{height:100%;border-radius:3px;transition:width .3s}
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

  // new order
  const [nf,setNf]=useState({selectedEmployees:[],orderNumber:"",itemId:"",lineId:"",productionQty:"",startDateTime:""});
  // search
  const [sq,setSq]=useState(""); const [sr,setSr]=useState(null); const [snf,setSnf]=useState(false);
  // close modal
  const [cm,setCm]=useState(null); const [cf,setCf]=useState({endQty:"",remarks:""});
  // records filters/sort
  const [fEmp,setFEmp]=useState("All"); const [fLine,setFLine]=useState("All"); const [fStatus,setFStatus]=useState("All");
  const [fFrom,setFFrom]=useState(""); const [fTo,setFTo]=useState("");
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

  // ── Filtered + sorted orders ──
  const filteredOrders = orders
    .filter(o=>{
      const em=fEmp==="All"||o.employee===fEmp||(o.employees&&o.employees.includes(fEmp));
      const lm=fLine==="All"||o.line_id===fLine;
      const sm=fStatus==="All"||o.status===fStatus;
      const df=!fFrom||new Date(o.start_datetime)>=new Date(fFrom);
      const dt=!fTo||new Date(o.start_datetime)<=new Date(fTo+"T23:59:59");
      return em&&lm&&sm&&df&&dt;
    })
    .sort((a,b)=>{
      let av=a[sortF]??"", bv=b[sortF]??"";
      if(["production_qty","end_qty","efficiency"].includes(sortF)){av=Number(av)||0;bv=Number(bv)||0;}
      return sortD==="asc"?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0);
    });

  const handleSort=(f)=>{ if(sortF===f)setSortD(d=>d==="asc"?"desc":"asc"); else{setSortF(f);setSortD("asc");} };

  // ── Today stats ──
  const today = todayStr();
  const todayOrders    = orders.filter(o=>o.created_at?.startsWith(today));
  const todayCompleted = todayOrders.filter(o=>o.status==="Completed");
  const todayEffAvg    = (() => {
    const eff=todayCompleted.filter(o=>o.efficiency!=null).map(o=>o.efficiency);
    return eff.length ? Math.round(eff.reduce((a,b)=>a+b,0)/eff.length) : null;
  })();

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
        order_number:orderNumber,
        employee:selectedEmployees.join(", "),
        employees:selectedEmployees,
        num_employees:numEmp,
        item_id:itemId,item_name:item?.name||"",
        line_id:lineId,line_name:lines.find(l=>l.id===lineId)?.name||"",
        production_qty:Number(productionQty),
        start_datetime:nf.startDateTime?new Date(nf.startDateTime).toISOString():nowISO(),
        status:"In Progress",created_by:user.username,
      };
      const res=await db.addOrder(o);
      setOrders(p=>[res[0],...p]);
      setNf({selectedEmployees:[],orderNumber:"",itemId:"",lineId:"",productionQty:"",startDateTime:""});
      showToast(`Order ${orderNumber} started with ${numEmp} employee${numEmp>1?"s":""}!`);
      setView("dashboard");
    }catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };

  // ── Search ──
  const handleSearch=async()=>{
    if(!sq.trim())return;
    try{ const r=await db.searchOrder(sq.trim()); r.length?(setSr(r[0]),setSnf(false)):(setSr(null),setSnf(true)); }
    catch(e){showToast("Search failed.","error");}
  };

  // ── Close order ──
  const openClose=(o)=>{setCm(o);setCf({endQty:"",remarks:""});};
  const handleClose=async()=>{
    if(!cf.endQty){showToast("Please enter ending quantity.","error");return;}
    setSaving(true);
    try{
      const item=items.find(i=>i.id===cm.item_id);
      const actualMin=getMinutes(cm.start_datetime,nowISO());
      const numEmp=cm.num_employees||1;
      const eff=calcEff(item?.std_minutes||null,Number(cf.endQty),actualMin,numEmp);
      const patch={end_datetime:nowISO(),end_qty:Number(cf.endQty),remarks:cf.remarks,status:"Completed",actual_minutes:Math.round(actualMin),efficiency:eff};
      await db.updateOrder(cm.id,patch);
      setOrders(p=>p.map(o=>o.id===cm.id?{...o,...patch}:o));
      showToast(`Order ${cm.order_number} closed!${eff!=null?" Efficiency: "+eff+"%":""}`);
      setCm(null); if(sr?.id===cm.id)setSr(null); setView("records");
    }catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };

  // ── Export CSV ──
  const exportCSV=()=>{
    const H=["Order #","Employees","Num Employees","Line ID","Line","Item ID","Item","Std Min","Plan Qty","End Qty","Actual Min","Man Hours","Efficiency %","Start","End","Duration","Status","Remarks","Created By"];
    const R=filteredOrders.map(o=>[
      o.order_number,o.employee,o.line_id,o.line_name,o.item_id,o.item_name,
      items.find(i=>i.id===o.item_id)?.std_minutes??"",
      o.employees?.join("; ")||o.employee,o.num_employees||1,o.line_id,o.line_name,o.item_id,o.item_name,
      items.find(i=>i.id===o.item_id)?.std_minutes??"",
      o.production_qty,o.end_qty??"",o.actual_minutes??"",o.actual_minutes?(o.actual_minutes/60).toFixed(2):"",o.efficiency??"",
      o.start_datetime?new Date(o.start_datetime).toLocaleString("en-NZ"):"",
      o.end_datetime?new Date(o.end_datetime).toLocaleString("en-NZ"):"",
      o.end_datetime?getDuration(o.start_datetime,o.end_datetime):"",
      o.status,o.remarks||"",o.created_by||""
    ].map(v=>`"${String(v??"").replace(/"/g,'""')}"`));
    const csv=[H.join(","),...R.map(r=>r.join(","))].join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`prodtrack_${today}.csv`; a.click();
    showToast(`Exported ${filteredOrders.length} records.`);
  };

  const TABS=[
    {id:"dashboard",label:"Dashboard"},
    {id:"new",label:"+ New Order"},
    {id:"search",label:"Search"},
    {id:"records",label:"Records"},
    ...(isAdmin?[{id:"admin",label:"⚙ Admin"}]:[]),
  ];

  return(
    <div style={{fontFamily:"'IBM Plex Mono','Courier New',monospace",background:"#0F1117",minHeight:"100vh",color:"#E8EAF0"}}>
      <GStyles/>
      {/* HEADER */}
      <div style={{background:"#13161F",borderBottom:"1px solid #2A2F45",padding:"0 20px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1400,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,background:"#00D4AA",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>⚙</div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#E8EAF0",letterSpacing:1}}>PRODTRACK</div>
              <div style={{fontSize:9,color:"#5A5F78",letterSpacing:2}}>PRODUCTION SCHEDULER</div>
            </div>
          </div>
          <nav style={{display:"flex",gap:0}}>
            {TABS.map(t=>(
              <button key={t.id} className="nb"
                onClick={()=>{setView(t.id);setSr(null);setSnf(false);}}
                style={{
                  color:view===t.id?(t.id==="admin"?"#FF9500":"#00D4AA"):"#8B90A8",
                  background:view===t.id?(t.id==="admin"?"rgba(255,149,0,.08)":"rgba(0,212,170,.08)"):"none",
                  borderBottom:view===t.id?`2px solid ${t.id==="admin"?"#FF9500":"#00D4AA"}`:"2px solid transparent",
                  borderRadius:"4px 4px 0 0",
                }}>{t.label}</button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:"#C8CADC",fontWeight:600}}>{user.full_name}</div>
              <div style={{fontSize:9,color:isAdmin?"#FF9500":"#7B8CFF",letterSpacing:1,textTransform:"uppercase"}}>{user.role}</div>
            </div>
            <button className="bg" style={{fontSize:11,padding:"5px 10px"}} onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1400,margin:"0 auto",padding:"24px 20px"}}>
        {loading?(
          <div style={{textAlign:"center",padding:80,color:"#4A4F65"}}>
            <div style={{fontSize:32,marginBottom:12,animation:"spin 1s linear infinite"}}>⏳</div>
            <div>Loading {items.length>0?`(${items.length} items loaded…)`:"data…"}</div>
          </div>
        ):(
          <>
          {/* ═══ DASHBOARD ═══ */}
          {view==="dashboard"&&<Dashboard orders={orders} todayOrders={todayOrders} todayCompleted={todayCompleted} todayEffAvg={todayEffAvg} items={items} onNewOrder={()=>setView("new")} onClose={openClose} reload={loadAll}/>}

          {/* ═══ NEW ORDER ═══ */}
          {view==="new"&&(
            <div className="au" style={{maxWidth:660}}>
              <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase",marginBottom:24}}>Start New Production Order</h2>
              <div className="card">
                {/* Multi-employee picker */}
                <div className="fg">
                  <label>Employee(s) * <span style={{color:"#7B8CFF",fontSize:10,letterSpacing:0}}>— select one or more</span></label>
                  <EmployeePicker
                    employees={employees}
                    selected={nf.selectedEmployees}
                    onChange={sel=>setNf(f=>({...f,selectedEmployees:sel}))}
                  />
                  {nf.selectedEmployees.length>0&&(
                    <div style={{fontSize:11,color:"#7B8CFF",marginTop:6}}>
                      👥 {nf.selectedEmployees.length} employee{nf.selectedEmployees.length>1?"s":""} selected — man hours will be combined
                    </div>
                  )}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div className="fg"><label>Order Number *</label><input placeholder="ORD-2025-001" value={nf.orderNumber} onChange={e=>setNf(f=>({...f,orderNumber:e.target.value.toUpperCase()}))}/></div>
                  <div className="fg"><label>Production Qty *</label><input type="number" min="1" placeholder="0" value={nf.productionQty} onChange={e=>setNf(f=>({...f,productionQty:e.target.value}))}/></div>
                </div>
                <div className="fg"><label>Production Line *</label>
                  <select value={nf.lineId} onChange={e=>setNf(f=>({...f,lineId:e.target.value}))}>
                    <option value="">— Select Line —</option>
                    {lines.map(l=><option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Item Number *</label>
                  <ItemSearch items={items} value={nf.itemId} onChange={v=>setNf(f=>({...f,itemId:v}))}/>
                  {nf.itemId&&(()=>{
                    const it=items.find(i=>i.id===nf.itemId);
                    if(!it?.std_minutes) return null;
                    const numEmp=nf.selectedEmployees.length||1;
                    return(
                      <div style={{background:"#13161F",border:"1px solid #2A3545",borderRadius:6,padding:"10px 14px",marginTop:8}}>
                        <div style={{fontSize:10,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Efficiency formula preview</div>
                        <div style={{fontSize:11,color:"#8B90A8",lineHeight:1.8}}>
                          ⏱ Std Time: <span style={{color:"#7B8CFF"}}>{it.std_minutes} min/piece</span>
                          &nbsp;·&nbsp; 👥 Employees: <span style={{color:"#FF9500"}}>{numEmp}</span>
                        </div>
                        <div style={{fontSize:11,color:"#8B90A8",marginTop:2}}>
                          Efficiency = (std × end_qty) ÷ (actual_mins × <span style={{color:"#FF9500"}}>{numEmp}</span>) × 100
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="fg"><label>Start Date & Time</label>
                  <div style={{display:"flex",gap:10}}>
                    <input type="datetime-local" value={nf.startDateTime} onChange={e=>setNf(f=>({...f,startDateTime:e.target.value}))} style={{flex:1}}/>
                    <button className="bg" style={{whiteSpace:"nowrap",padding:"10px 14px"}} onClick={()=>{const l=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);setNf(f=>({...f,startDateTime:l}));}}>📍 Now</button>
                  </div>
                </div>
                <div style={{display:"flex",gap:10,marginTop:8}}>
                  <button className="bp" onClick={handleStart} disabled={saving} style={{flex:1,padding:12}}>{saving?"Saving…":"▶ START ORDER"}</button>
                  <button className="bg" onClick={()=>setView("dashboard")}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SEARCH ═══ */}
          {view==="search"&&(
            <div className="au" style={{maxWidth:700}}>
              <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase",marginBottom:24}}>Search Order</h2>
              <div className="card" style={{marginBottom:16}}>
                <div style={{display:"flex",gap:10}}>
                  <input placeholder="Enter Order Number…" value={sq} onChange={e=>setSq(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&handleSearch()}/>
                  <button className="bp" onClick={handleSearch} style={{whiteSpace:"nowrap"}}>🔍 Search</button>
                </div>
              </div>
              {snf&&<div className="card" style={{textAlign:"center",color:"#FF4B6E",padding:32}}><div style={{fontSize:32,marginBottom:8}}>🚫</div><div>No order found for <strong>"{sq}"</strong></div></div>}
              {sr&&<div className="au"><OrderCard order={sr} item={items.find(i=>i.id===sr.item_id)} onClose={sr.status==="In Progress"?()=>openClose(sr):null}/></div>}
            </div>
          )}

          {/* ═══ RECORDS ═══ */}
          {view==="records"&&(
            <div className="au">
              {/* Filter bar */}
              <div style={{background:"#13161F",border:"1px solid #2A2F45",borderRadius:8,padding:"14px 16px",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>
                    Records <span style={{color:"#4A4F65"}}>({filteredOrders.length})</span>
                  </h2>
                  <div style={{display:"flex",gap:8}}>
                    <button className="bg" style={{fontSize:11}} onClick={loadAll}>↻ Refresh</button>
                    <button className="bp" style={{fontSize:12,padding:"8px 16px"}} onClick={exportCSV}>⬇ Export CSV</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
                  <div><label>Employee</label>
                    <select value={fEmp} onChange={e=>setFEmp(e.target.value)}>
                      <option value="All">All</option>{employees.map(e=><option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <div><label>Line</label>
                    <select value={fLine} onChange={e=>setFLine(e.target.value)}>
                      <option value="All">All</option>{lines.map(l=><option key={l.id} value={l.id}>{l.id}</option>)}
                    </select>
                  </div>
                  <div><label>Status</label>
                    <select value={fStatus} onChange={e=>setFStatus(e.target.value)}>
                      <option value="All">All</option><option value="In Progress">In Progress</option><option value="Completed">Completed</option>
                    </select>
                  </div>
                  <div><label>From Date</label><input type="date" value={fFrom} onChange={e=>setFFrom(e.target.value)}/></div>
                  <div><label>To Date</label><input type="date" value={fTo} onChange={e=>setFTo(e.target.value)}/></div>
                  <div style={{display:"flex",alignItems:"flex-end"}}>
                    <button className="bg" style={{width:"100%",fontSize:11}} onClick={()=>{setFEmp("All");setFLine("All");setFStatus("All");setFFrom("");setFTo("");setSortF("created_at");setSortD("desc");}}>✕ Clear</button>
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
                          {[
                            ["Order #","order_number"],["Employee","employee"],["Line","line_id"],["Item","item_id"],["Man Hrs","actual_minutes"],
                            ["Plan Qty","production_qty"],["End Qty","end_qty"],["Std Min",null],
                            ["Actual Min","actual_minutes"],["Man Hrs",null],["Efficiency","efficiency"],
                            ["Start","start_datetime"],["End","end_datetime"],["Duration",null],
                            ["Status","status"],["Remarks",null],["Action",null]
                          ].map(([h,f])=>(
                            <th key={h} className={f?"sortable":""} onClick={f?()=>handleSort(f):undefined}
                              style={{padding:"10px 10px",textAlign:"left",color:sortF===f?"#00D4AA":"#5A5F78",letterSpacing:1,fontWeight:600,fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>
                              {h}{f&&<span style={{marginLeft:3,opacity:.6}}>{sortF===f?(sortD==="asc"?"↑":"↓"):"↕"}</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map(o=>{
                          const sc=STATUS_COLORS[o.status]||{dot:"#6C757D",bg:""};
                          const dur=o.end_datetime?getDuration(o.start_datetime,o.end_datetime):"—";
                          const eff=o.efficiency; const ec=effColor(eff);
                          const stdMin=items.find(i=>i.id===o.item_id)?.std_minutes;
                          return(
                            <tr key={o.id} style={{borderBottom:"1px solid #1E2135"}}>
                              <td style={{padding:"9px 10px",color:"#00D4AA",fontWeight:600,whiteSpace:"nowrap"}}>{o.order_number}</td>
                              <td style={{padding:"9px 10px",color:"#C8CADC",maxWidth:140}}>
                              <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.employees?.join(", ")||o.employee}</div>
                              {(o.num_employees||1)>1&&<div style={{fontSize:10,color:"#FF9500"}}>👥 {o.num_employees} employees</div>}
                            </td>
                              <td style={{padding:"9px 10px",color:"#7B8CFF"}}>
                                <div style={{fontSize:10,color:"#5A5F78"}}>{o.line_id}</div>
                                <div style={{whiteSpace:"nowrap"}}>{o.line_name}</div>
                              </td>
                              <td style={{padding:"9px 10px",color:"#8B90A8"}}>
                                <div style={{fontSize:10,color:"#5A5F78"}}>{o.item_id}</div>
                                <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{o.item_name}</div>
                              </td>
                              <td style={{padding:"9px 10px",textAlign:"center"}}>{o.production_qty}</td>
                              <td style={{padding:"9px 10px",textAlign:"center",color:o.end_qty!=null?"#00D4AA":"#4A4F65"}}>{o.end_qty??"—"}</td>
                              <td style={{padding:"9px 10px",textAlign:"center",color:"#7B8CFF"}}>{stdMin??<span style={{color:"#4A4F65"}}>—</span>}</td>
                              <td style={{padding:"9px 10px",textAlign:"center",color:"#C8CADC"}}>{o.actual_minutes??<span style={{color:"#4A4F65"}}>—</span>}</td>
                              <td style={{padding:"9px 10px",textAlign:"center",color:"#FF9500"}}>{o.actual_minutes?((o.actual_minutes/60).toFixed(2))+"h":<span style={{color:"#4A4F65"}}>—</span>}</td>
                              <td style={{padding:"9px 10px",textAlign:"center"}}>
                                {eff!=null?(
                                  <div>
                                    <span style={{color:ec,fontWeight:700}}>{eff}%</span>
                                    <div className="eff-bar" style={{width:60}}><div className="eff-fill" style={{width:`${Math.min(eff,150)}%`,background:ec}}/></div>
                                  </div>
                                ):<span style={{color:"#4A4F65"}}>—</span>}
                              </td>
                              <td style={{padding:"9px 10px",color:"#8B90A8",whiteSpace:"nowrap",fontSize:11}}>{fmt(o.start_datetime)}</td>
                              <td style={{padding:"9px 10px",color:"#8B90A8",whiteSpace:"nowrap",fontSize:11}}>{fmt(o.end_datetime)}</td>
                              <td style={{padding:"9px 10px",color:"#7B8CFF",whiteSpace:"nowrap"}}>{dur}</td>
                              <td style={{padding:"9px 10px"}}>
                                <span className="tag" style={{background:sc.bg,color:sc.dot,border:`1px solid ${sc.dot}44`}}>
                                  <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>
                                  {o.status}
                                </span>
                              </td>
                              <td style={{padding:"9px 10px",color:"#8B90A8",fontSize:11}}>
                                <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{o.remarks||"—"}</div>
                              </td>
                              <td style={{padding:"9px 10px"}}>
                                {o.status==="In Progress"&&<button className="bd" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>openClose(o)}>⏹ End</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}

          {/* ═══ ADMIN ═══ */}
          {view==="admin"&&isAdmin&&(
            <AdminPanel items={items} setItems={setItems} employees={employees} setEmployees={setEmployees}
              lines={lines} setLines={setLines} showToast={showToast} reload={loadAll}/>
          )}
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
            <div style={{background:"#13161F",borderRadius:6,padding:"12px 16px",marginBottom:20}}>
              <div style={{fontSize:18,color:"#00D4AA",fontWeight:700}}>{cm.order_number}</div>
              <div style={{fontSize:12,color:"#8B90A8",marginTop:4}}>{cm.item_id} — {cm.item_name}</div>
              <div style={{fontSize:11,color:"#5A5F78",marginTop:2}}>Line: <span style={{color:"#7B8CFF"}}>{cm.line_id} — {cm.line_name}</span></div>
              <div style={{fontSize:11,color:"#5A5F78"}}>Employees: <span style={{color:"#C8CADC"}}>{cm.employees?.join(", ")||cm.employee}</span></div>
              <div style={{fontSize:11,color:"#5A5F78"}}>👥 <span style={{color:"#FF9500"}}>{cm.num_employees||1} employee{(cm.num_employees||1)>1?"s":""}</span> | Plan Qty: <span style={{color:"#C8CADC"}}>{cm.production_qty}</span></div>
              {(()=>{const it=items.find(i=>i.id===cm.item_id); return it?.std_minutes?<div style={{fontSize:11,color:"#7B8CFF",marginTop:4}}>⏱ Std: {it.std_minutes} min/piece × end_qty ÷ (actual_mins × {cm.num_employees||1} employees) × 100</div>:null;})()}
            </div>
            <div className="fg"><label>End Date & Time (Auto-captured)</label><input value={fmt(nowISO())} readOnly style={{color:"#00D4AA",opacity:.8}}/></div>
            <div className="fg"><label>Ending Quantity *</label><input type="number" min="0" placeholder="Actual produced quantity" value={cf.endQty} onChange={e=>setCf(f=>({...f,endQty:e.target.value}))} autoFocus/></div>
            <div className="fg"><label>Remarks</label><textarea rows={3} placeholder="Notes, issues, observations…" value={cf.remarks} onChange={e=>setCf(f=>({...f,remarks:e.target.value}))}/></div>
            <div style={{display:"flex",gap:10,marginTop:8}}>
              <button className="bd" style={{flex:1,padding:12,fontSize:13}} onClick={handleClose} disabled={saving}>{saving?"Saving…":"⏹ CLOSE ORDER"}</button>
              <button className="bg" onClick={()=>setCm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast&&(
        <div className="ti" style={{position:"fixed",bottom:24,right:24,background:toast.type==="error"?"#FF4B6E":toast.type==="warn"?"#FF9500":"#00D4AA",color:toast.type==="error"?"#fff":"#0F1117",padding:"12px 20px",borderRadius:6,fontSize:13,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.4)",zIndex:300,maxWidth:420}}>
          {toast.type==="error"?"⚠ ":"✔ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════
function Dashboard({orders,todayOrders,todayCompleted,todayEffAvg,items,onNewOrder,onClose,reload}){
  const active=orders.filter(o=>o.status==="In Progress");
  const totalCompleted=orders.filter(o=>o.status==="Completed");
  const allEfficiencies=totalCompleted.filter(o=>o.efficiency!=null).map(o=>o.efficiency);
  const overallAvgEff=allEfficiencies.length?Math.round(allEfficiencies.reduce((a,b)=>a+b)/allEfficiencies.length):null;

  // ── Man Hours: group active orders by line, sum actual_minutes per employee ──
  const lineManHours = (() => {
    const map = {};
    // For active orders — use elapsed minutes so far
    active.forEach(o => {
      const key = o.line_id;
      if (!map[key]) map[key] = { line_id:o.line_id, line_name:o.line_name, employees:[], totalMins:0 };
      const elapsedMins = (Date.now() - new Date(o.start_datetime)) / 60000;
      map[key].employees.push(o.employee);
      map[key].totalMins += elapsedMins;
    });
    // For today's completed orders — use actual_minutes
    todayCompleted.forEach(o => {
      const key = o.line_id;
      if (!map[key]) map[key] = { line_id:o.line_id, line_name:o.line_name, employees:[], totalMins:0 };
      map[key].employees.push(o.employee);
      map[key].totalMins += o.actual_minutes || 0;
    });
    return Object.values(map).map(l => ({
      ...l,
      employees: [...new Set(l.employees)],
      totalHours: (l.totalMins / 60).toFixed(2),
    })).sort((a,b) => b.totalMins - a.totalMins);
  })();

  // ── Today's total man hours across all lines ──
  const todayTotalManHours = (() => {
    let total = 0;
    active.forEach(o => { total += (Date.now() - new Date(o.start_datetime)) / 60000; });
    todayCompleted.forEach(o => { total += o.actual_minutes || 0; });
    return (total / 60).toFixed(2);
  })();

  return(
    <div className="au">
      {/* KPI Row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:14,marginBottom:22}}>
        {[
          {label:"TODAY STARTED",    val:todayOrders.length,                          color:"#7B8CFF", icon:"📋"},
          {label:"TODAY COMPLETED",  val:todayCompleted.length,                       color:"#00D4AA", icon:"✅"},
          {label:"TODAY EFF AVG",    val:todayEffAvg!=null?todayEffAvg+"%":"—",       color:effColor(todayEffAvg), icon:"⚡"},
          {label:"ACTIVE ORDERS",    val:active.length,                               color:"#FFC107", icon:"🔄"},
          {label:"TOTAL ORDERS",     val:orders.length,                               color:"#8B90A8", icon:"📊"},
          {label:"OVERALL EFF AVG",  val:overallAvgEff!=null?overallAvgEff+"%":"—",   color:effColor(overallAvgEff), icon:"🎯"},
          {label:"TODAY MAN HRS",    val:todayTotalManHours+"h",                      color:"#FF9500", icon:"👥"},
        ].map(s=>(
          <div key={s.label} className="card" style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px"}}>
            <div style={{fontSize:22}}>{s.icon}</div>
            <div>
              <div style={{fontSize:20,fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div>
              <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1.5,marginTop:3,textTransform:"uppercase"}}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Man Hours by Line */}
      {lineManHours.length>0&&(
        <div className="card" style={{marginBottom:22}}>
          <div style={{fontSize:11,color:"#FF9500",letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>👥 Man Hours by Production Line (Today)</div>
          <div style={{display:"grid",gap:10}}>
            {lineManHours.map(l=>{
              const empCount=l.employees.length;
              const hrs=Number(l.totalHours);
              const barPct=Math.min((hrs/Math.max(...lineManHours.map(x=>Number(x.totalHours)),1))*100,100);
              return(
                <div key={l.line_id} style={{background:"#13161F",borderRadius:6,padding:"10px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{color:"#7B8CFF",fontWeight:700,fontSize:12}}>{l.line_id}</span>
                      <span style={{color:"#C8CADC",fontSize:12}}>{l.line_name}</span>
                      <span style={{background:"rgba(255,149,0,.12)",color:"#FF9500",fontSize:10,padding:"2px 8px",borderRadius:12,fontWeight:600}}>
                        {empCount} employee{empCount!==1?"s":""}
                      </span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:11,color:"#8B90A8"}}>{l.employees.join(", ")}</span>
                      <span style={{fontSize:16,fontWeight:700,color:"#FF9500"}}>{hrs.toFixed(2)}h</span>
                    </div>
                  </div>
                  <div style={{height:5,background:"#2A2F45",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:barPct+"%",background:"#FF9500",borderRadius:3,transition:"width .3s"}}/>
                  </div>
                  <div style={{fontSize:10,color:"#5A5F78",marginTop:4}}>{(hrs*60).toFixed(0)} total minutes across {empCount} employee{empCount!==1?"s":""}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Orders */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>Active Orders ({active.length})</h2>
        <div style={{display:"flex",gap:8}}>
          <button className="bg" style={{fontSize:11}} onClick={reload}>↻ Refresh</button>
          <button className="bp" onClick={onNewOrder}>+ Start New Order</button>
        </div>
      </div>
      {active.length===0
        ?<div className="card" style={{textAlign:"center",padding:40,color:"#4A4F65"}}><div style={{fontSize:36,marginBottom:10}}>📭</div><div>No active orders.</div></div>
        :<div style={{display:"grid",gap:10}}>{active.map(o=><OrderCard key={o.id} order={o} onClose={()=>onClose(o)}/>)}</div>
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ORDER CARD
// ══════════════════════════════════════════════════════════════
function OrderCard({order:o,item,onClose}){
  const sc=STATUS_COLORS[o.status]||{dot:"#6C757D",bg:""};
  const dur=o.end_datetime?getDuration(o.start_datetime,o.end_datetime):getElapsed(o.start_datetime);
  const eff=o.efficiency; const ec=effColor(eff);
  return(
    <div style={{background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:8,padding:"16px 18px",borderLeft:`3px solid ${sc.dot}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:16,fontWeight:700,color:"#00D4AA"}}>{o.order_number}</span>
            <span className="tag" style={{background:sc.bg,color:sc.dot,border:`1px solid ${sc.dot}44`}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>
              {o.status}
            </span>
            {eff!=null&&<span style={{fontSize:12,fontWeight:700,color:ec}}>⚡ {eff}% eff</span>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:"5px 20px"}}>
            {[
              ["Employee",(o.employees?.join(", ")||o.employee)+(( o.num_employees||1)>1?" ("+o.num_employees+"👥)":"")],["Line",`${o.line_id} — ${o.line_name}`],["Item",`${o.item_id} — ${o.item_name}`],
              ["Plan Qty",o.production_qty],["Started",fmt(o.start_datetime)],
              ...(o.status==="Completed"
                ?[["Ended",fmt(o.end_datetime)],["End Qty",o.end_qty],["Duration",getDuration(o.start_datetime,o.end_datetime)],
                  ...(o.actual_minutes?[["Actual Min",o.actual_minutes]]:[])]
                :[["Elapsed",dur]])
            ].map(([k,v])=>(
              <div key={k}>
                <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase"}}>{k}</div>
                <div style={{fontSize:11,color:"#C8CADC",marginTop:2}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {onClose&&<button className="bd" onClick={onClose} style={{alignSelf:"flex-start",fontSize:12}}>⏹ End Order</button>}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
//  EMPLOYEE PICKER (multi-select with search + pills)
// ══════════════════════════════════════════════════════════════
function EmployeePicker({employees,selected,onChange}){
  const [q,setQ]=useState("");
  const filtered=q.trim()?employees.filter(e=>e.toLowerCase().includes(q.toLowerCase())):employees;
  const toggle=(name)=>{
    if(selected.includes(name)) onChange(selected.filter(e=>e!==name));
    else onChange([...selected,name]);
  };
  const scrollRef=useRef();
  return(
    <div>
      <div style={{background:"#1A1D27",border:"1px solid #00D4AA",borderRadius:4,overflow:"hidden"}}>
        <input
          placeholder="Search employees…"
          value={q} onChange={e=>setQ(e.target.value)}
          style={{background:"#13161F",border:"none",borderBottom:"1px solid #2A2F45",color:"#E8EAF0",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,padding:"8px 12px",width:"100%",outline:"none"}}
        />
        <div ref={scrollRef} style={{maxHeight:160,overflowY:"auto"}}>
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
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
          {selected.map(e=>(
            <div key={e} style={{background:"rgba(0,212,170,.1)",border:"1px solid rgba(0,212,170,.25)",color:"#00D4AA",fontSize:10,padding:"3px 10px",borderRadius:12,display:"flex",alignItems:"center",gap:5}}>
              {e}
              <span onClick={()=>toggle(e)} style={{cursor:"pointer",opacity:.7,fontSize:12}} onMouseEnter={ev=>ev.target.style.opacity=1} onMouseLeave={ev=>ev.target.style.opacity=.7}>✕</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ITEM SEARCH (handles 5000+)
// ══════════════════════════════════════════════════════════════
function ItemSearch({items,value,onChange}){
  const [q,setQ]=useState(""); const [open,setOpen]=useState(false); const ref=useRef();
  const selected=items.find(i=>i.id===value);
  const filtered=q.trim()
    ?items.filter(i=>i.id.toLowerCase().includes(q.toLowerCase())||i.name.toLowerCase().includes(q.toLowerCase())).slice(0,100)
    :items.slice(0,100);
  useEffect(()=>{
    const h=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
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
          <div style={{padding:8}}><input autoFocus placeholder={`Search ${items.length} items…`} value={q} onChange={e=>setQ(e.target.value)} onClick={e=>e.stopPropagation()} style={{fontSize:12,padding:"7px 12px"}}/></div>
          <div style={{maxHeight:260,overflowY:"auto"}}>
            {filtered.length===0?<div style={{padding:"12px 14px",color:"#4A4F65",fontSize:12}}>No items found.</div>
              :filtered.map(i=>(
                <div key={i.id} onClick={()=>{onChange(i.id);setOpen(false);setQ("");}}
                  style={{padding:"8px 14px",cursor:"pointer",fontSize:12,background:value===i.id?"rgba(0,212,170,.1)":"transparent",color:value===i.id?"#00D4AA":"#C8CADC",borderBottom:"1px solid #1E2135",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.background=value===i.id?"rgba(0,212,170,.12)":"rgba(255,255,255,.03)"}
                  onMouseLeave={e=>e.currentTarget.style.background=value===i.id?"rgba(0,212,170,.1)":"transparent"}>
                  <span><span style={{color:"#5A5F78",marginRight:8,fontSize:11}}>{i.id}</span>{i.name}</span>
                  {i.std_minutes&&<span style={{color:"#7B8CFF",fontSize:10,marginLeft:8}}>{i.std_minutes}min</span>}
                </div>
              ))
            }
            {filtered.length===100&&<div style={{padding:"7px 14px",color:"#4A4F65",fontSize:11,borderTop:"1px solid #1E2135"}}>Showing 100 of {items.length}. Type to narrow down.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════════════════════════
function AdminPanel({items,setItems,employees,setEmployees,lines,setLines,showToast,reload}){
  const [tab,setTab]=useState("users");
  const [users,setUsers]=useState([]); const [loadingU,setLoadingU]=useState(true);
  const [newUser,setNewUser]=useState({username:"",password:"",full_name:"",role:"worker"});
  const [newItem,setNewItem]=useState({id:"",name:"",std_minutes:""});
  const [editItem,setEditItem]=useState(null);
  const [itemSearch,setItemSearch]=useState("");
  const [newEmp,setNewEmp]=useState("");
  const [newLine,setNewLine]=useState({id:"",name:""});
  const [csvPreview,setCsvPreview]=useState(null); const [csvErr,setCsvErr]=useState([]);
  const [saving,setSaving]=useState(false);
  const fileRef=useRef(); const itemFileRef=useRef();

  useEffect(()=>{ db.getUsers().then(u=>{setUsers(u);setLoadingU(false);}).catch(()=>setLoadingU(false)); },[]);

  // Users
  const addUser=async()=>{
    const{username,password,full_name,role}=newUser;
    if(!username||!password||!full_name){showToast("All fields required.","error");return;}
    setSaving(true);
    try{ const r=await db.addUser({username:username.trim().toLowerCase(),password:password.trim(),full_name:full_name.trim(),role}); setUsers(p=>[...p,r[0]]); setNewUser({username:"",password:"",full_name:"",role:"worker"}); showToast("User added."); }
    catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };
  const toggleUser=async(u)=>{ try{ await db.updateUser(u.id,{active:!u.active}); setUsers(p=>p.map(x=>x.id===u.id?{...x,active:!x.active}:x)); showToast(u.active?"Deactivated.":"Activated."); }catch{showToast("Failed.","error");} };
  const resetPw=async(u,pw)=>{ if(!pw)return; try{ await db.updateUser(u.id,{password:pw}); showToast(`Password updated for ${u.username}.`); }catch{showToast("Failed.","error");} };

  // Items
  const addItem=async()=>{
    if(!newItem.id||!newItem.name){showToast("ID and Name required.","error");return;}
    if(items.find(i=>i.id===newItem.id.trim().toUpperCase())){showToast("Item ID exists.","error");return;}
    setSaving(true);
    try{
      const it={id:newItem.id.trim().toUpperCase(),name:newItem.name.trim(),std_minutes:newItem.std_minutes?Number(newItem.std_minutes):null};
      await db.addItem(it); setItems(p=>[...p,it]); setNewItem({id:"",name:"",std_minutes:""}); showToast("Item added.");
    }catch(e){showToast("Failed: "+e.message,"error");}
    setSaving(false);
  };
  const saveEditItem=async()=>{
    if(!editItem.name){showToast("Name required.","error");return;}
    try{
      await db.updateItem(editItem.id,{name:editItem.name,std_minutes:editItem.std_minutes?Number(editItem.std_minutes):null});
      setItems(p=>p.map(i=>i.id===editItem.id?{...i,name:editItem.name,std_minutes:editItem.std_minutes?Number(editItem.std_minutes):null}:i));
      setEditItem(null); showToast("Item updated.");
    }catch(e){showToast("Failed: "+e.message,"error");}
  };
  const delItem=async(id)=>{ try{ await db.deleteItem(id); setItems(p=>p.filter(i=>i.id!==id)); showToast("Removed."); }catch{showToast("Failed.","error");} };

  const exportItemsCSV=()=>{
    const csv=["id,name,std_minutes",...items.map(i=>`"${i.id}","${i.name}","${i.std_minutes??""}"`)].join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="prodtrack_items.csv"; a.click();
    showToast(`Exported ${items.length} items.`);
  };

  const handleItemFile=async(e)=>{
    const file=e.target.files[0]; if(!file)return;
    const r=new FileReader(); r.onload=(ev)=>{ const res=parseCSVItems(ev.target.result); setCsvPreview(res); setCsvErr(res.errors); }; r.readAsText(file); e.target.value="";
  };
  const applyItemImport=async(mode)=>{
    if(!csvPreview)return; setSaving(true);
    try{
      if(mode==="replace"){
        for(const i of items){ try{await db.deleteItem(i.id);}catch{} }
        for(const i of csvPreview.items){ try{await db.addItem(i);}catch{} }
      } else {
        for(const i of csvPreview.items){ if(!items.find(x=>x.id===i.id)) try{await db.addItem(i);}catch{} }
      }
      await reload(); setCsvPreview(null); showToast(`${mode==="replace"?"Replaced":"Appended"} ${csvPreview.items.length} items.`);
    }catch(e){showToast("Import failed: "+e.message,"error");}
    setSaving(false);
  };

  // Employees & Lines
  const addEmp=async()=>{ if(!newEmp.trim()){showToast("Name required.","error");return;} try{ await db.addEmployee({name:newEmp.trim()}); setEmployees(p=>[...p,newEmp.trim()]); setNewEmp(""); showToast("Employee added."); }catch(e){showToast("Failed: "+e.message,"error");} };
  const delEmp=async(name)=>{ try{ const all=await db.getEmployees(); const rec=all.find(e=>e.name===name); if(rec)await db.deleteEmployee(rec.id); setEmployees(p=>p.filter(e=>e!==name)); showToast("Removed."); }catch{showToast("Failed.","error");} };
  const addLine=async()=>{ if(!newLine.id||!newLine.name){showToast("ID and Name required.","error");return;} try{ const l={id:newLine.id.trim().toUpperCase(),name:newLine.name.trim()}; await db.addLine(l); setLines(p=>[...p,l]); setNewLine({id:"",name:""}); showToast("Line added."); }catch(e){showToast("Failed: "+e.message,"error");} };
  const delLine=async(id)=>{ try{ await db.deleteLine(id); setLines(p=>p.filter(l=>l.id!==id)); showToast("Removed."); }catch{showToast("Failed.","error");} };

  // General CSV import (employees/lines)
  const handleGenFile=(e)=>{
    const file=e.target.files[0]; if(!file)return;
    const r=new FileReader(); r.onload=(ev)=>{ const res=parseCSV(ev.target.result); setCsvPreview({...res,items:[]}); setCsvErr(res.errors); }; r.readAsText(file); e.target.value="";
  };
  const applyGenImport=async()=>{
    if(!csvPreview)return; setSaving(true);
    try{
      for(const e of csvPreview.employees){ try{await db.addEmployee({name:e});}catch{} }
      for(const l of csvPreview.lines){ try{await db.addLine(l);}catch{} }
      await reload(); setCsvPreview(null); showToast(`Imported: ${csvPreview.employees.length} employees, ${csvPreview.lines.length} lines.`);
    }catch(e){showToast("Import failed.","error");}
    setSaving(false);
  };

  const filteredItems=itemSearch.trim()?items.filter(i=>i.id.toLowerCase().includes(itemSearch.toLowerCase())||i.name.toLowerCase().includes(itemSearch.toLowerCase())):items;

  const ATABS=[
    {id:"users",label:`👥 Users (${users.length})`},
    {id:"items",label:`📦 Items (${items.length})`},
    {id:"employees",label:`👤 Employees (${employees.length})`},
    {id:"lines",label:`🏭 Lines (${lines.length})`},
    {id:"import",label:"⬆ CSV Import"},
  ];

  return(
    <div className="au">
      <h2 style={{fontSize:13,color:"#FF9500",letterSpacing:2,textTransform:"uppercase",marginBottom:20}}>⚙ Admin — Manage Master Data</h2>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #2A2F45",marginBottom:24,flexWrap:"wrap"}}>
        {ATABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,padding:"8px 14px",cursor:"pointer",borderRadius:"4px 4px 0 0",color:tab===t.id?"#FF9500":"#8B90A8",borderBottom:tab===t.id?"2px solid #FF9500":"2px solid transparent",fontWeight:tab===t.id?700:400,whiteSpace:"nowrap"}}>{t.label}</button>
        ))}
      </div>

      {/* ── USERS ── */}
      {tab==="users"&&(
        <div style={{maxWidth:700}}>
          <div className="card" style={{marginBottom:16}}>
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
            {loadingU?<div style={{color:"#4A4F65"}}>Loading…</div>:<div style={{display:"flex",flexDirection:"column",gap:10}}>{users.map(u=><UserRow key={u.id} u={u} onToggle={()=>toggleUser(u)} onResetPw={(pw)=>resetPw(u,pw)}/>)}</div>}
          </div>
        </div>
      )}

      {/* ── ITEMS ── */}
      {tab==="items"&&(
        <div style={{maxWidth:780}}>
          {/* Add new */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add New Item</div>
            <div style={{display:"grid",gridTemplateColumns:"140px 1fr 120px auto",gap:10,alignItems:"end"}}>
              <div><label>Item ID *</label><input placeholder="ITM-011" value={newItem.id} onChange={e=>setNewItem(f=>({...f,id:e.target.value}))}/></div>
              <div><label>Item Name *</label><input placeholder="Part description" value={newItem.name} onChange={e=>setNewItem(f=>({...f,name:e.target.value}))}/></div>
              <div><label>Std Min/Item</label><input type="number" placeholder="e.g. 5" value={newItem.std_minutes} onChange={e=>setNewItem(f=>({...f,std_minutes:e.target.value}))}/></div>
              <button className="bp" onClick={addItem} disabled={saving} style={{padding:"10px 18px"}}>+ Add</button>
            </div>
          </div>
          {/* Toolbar */}
          <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <input placeholder={`Search ${items.length} items…`} value={itemSearch} onChange={e=>setItemSearch(e.target.value)} style={{flex:1,minWidth:200,fontSize:12,padding:"8px 12px"}}/>
            <button className="bg" style={{fontSize:11}} onClick={exportItemsCSV}>⬇ Download CSV</button>
            <input ref={itemFileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleItemFile}/>
            <button className="bw" style={{fontSize:11}} onClick={()=>itemFileRef.current.click()}>⬆ Upload CSV</button>
            <button className="bg" style={{fontSize:11}} onClick={dlItemTemplate}>⬇ Template</button>
          </div>
          {/* CSV preview */}
          {csvPreview?.items?.length>0&&(
            <div className="card au" style={{marginBottom:14,borderColor:"#00D4AA44"}}>
              <div style={{fontSize:12,color:"#00D4AA",fontWeight:700,marginBottom:10}}>✔ Preview: {csvPreview.items.length} items ready</div>
              {csvPreview.items.slice(0,4).map(i=><div key={i.id} style={{fontSize:11,color:"#8B90A8",marginBottom:3}}>• {i.id} — {i.name} {i.std_minutes?"("+i.std_minutes+" min)":""}</div>)}
              {csvPreview.items.length>4&&<div style={{fontSize:11,color:"#4A4F65"}}>…and {csvPreview.items.length-4} more</div>}
              <div style={{display:"flex",gap:10,marginTop:12}}>
                <button className="bp" onClick={()=>applyItemImport("append")} disabled={saving} style={{flex:1,fontSize:12}}>{saving?"Importing…":"➕ Append"}</button>
                <button className="bw" onClick={()=>applyItemImport("replace")} disabled={saving} style={{flex:1,fontSize:12}}>{saving?"Importing…":"🔄 Replace All"}</button>
                <button className="bg" onClick={()=>setCsvPreview(null)}>Cancel</button>
              </div>
            </div>
          )}
          {/* Item list */}
          <div className="card" style={{padding:"12px 0"}}>
            <div style={{fontSize:11,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",padding:"0 16px",marginBottom:8}}>
              {itemSearch?`${filteredItems.length} of ${items.length} items`:`${items.length} items total`}
            </div>
            <div style={{maxHeight:460,overflowY:"auto"}}>
              {filteredItems.map(i=>(
                editItem?.id===i.id?(
                  <div key={i.id} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 12px",background:"rgba(0,212,170,.05)",borderBottom:"1px solid #2A2F45"}}>
                    <input value={editItem.id} readOnly style={{width:120,fontSize:12,padding:"5px 10px",background:"#0F1117",color:"#5A5F78"}}/>
                    <input value={editItem.name} onChange={e=>setEditItem(f=>({...f,name:e.target.value}))} style={{flex:1,fontSize:12,padding:"5px 10px"}} autoFocus/>
                    <input type="number" placeholder="Std min" value={editItem.std_minutes??""} onChange={e=>setEditItem(f=>({...f,std_minutes:e.target.value}))} style={{width:90,fontSize:12,padding:"5px 10px"}}/>
                    <button className="bp" style={{fontSize:11,padding:"5px 12px"}} onClick={saveEditItem}>Save</button>
                    <button className="bg" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>setEditItem(null)}>✕</button>
                  </div>
                ):(
                  <div key={i.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 16px",borderBottom:"1px solid #1E2135"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#1E2135"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                      <span style={{color:"#00D4AA",fontWeight:600,fontSize:12,flexShrink:0,width:90}}>{i.id}</span>
                      <span style={{color:"#C8CADC",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.name}</span>
                      {i.std_minutes&&<span style={{color:"#7B8CFF",fontSize:10,flexShrink:0}}>⏱ {i.std_minutes}min</span>}
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

      {/* ── CSV IMPORT (employees + lines) ── */}
      {tab==="import"&&(
        <div style={{maxWidth:700}}>
          <div className="card" style={{marginBottom:14}}>
            <div style={{fontSize:13,color:"#FF9500",fontWeight:700,marginBottom:10}}>📋 Import Employees & Lines via CSV</div>
            <div style={{fontSize:12,color:"#8B90A8",lineHeight:1.8}}>
              Columns: <span style={{color:"#00D4AA"}}>type, id, name</span><br/>
              type = <code style={{color:"#7B8CFF"}}>employee</code> or <code style={{color:"#7B8CFF"}}>line</code> (for items use the Items tab)
            </div>
            <div style={{background:"#0F1117",borderRadius:6,padding:"10px 14px",marginTop:10,fontSize:11,color:"#5A8A7A",lineHeight:1.7}}>
              type,id,name<br/>employee,,John Smith<br/>line,LINE-09,Night Shift Line
            </div>
          </div>
          <div className="card" style={{marginBottom:14}}>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handleGenFile}/>
            <button className="bw" onClick={()=>fileRef.current.click()}>⬆ Choose CSV File</button>
          </div>
          {csvErr.length>0&&<div className="card" style={{marginBottom:14,borderColor:"#FF4B6E44"}}>{csvErr.map((e,i)=><div key={i} style={{fontSize:11,color:"#FF9090",marginBottom:4}}>• {e}</div>)}</div>}
          {csvPreview&&csvPreview.employees?.length+csvPreview.lines?.length>0&&(
            <div className="card au" style={{borderColor:"#00D4AA44"}}>
              <div style={{fontSize:12,color:"#00D4AA",fontWeight:700,marginBottom:12}}>✔ Ready: {csvPreview.employees?.length} employees, {csvPreview.lines?.length} lines</div>
              <div style={{display:"flex",gap:10}}>
                <button className="bp" onClick={applyGenImport} disabled={saving} style={{flex:1}}>{saving?"Importing…":"➕ Import"}</button>
                <button className="bg" onClick={()=>setCsvPreview(null)}>Cancel</button>
              </div>
            </div>
          )}
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

// ── parseCSV for employees/lines ─────────────────────────────
function parseCSV(text){
  const lines=text.trim().split(/\r?\n/).slice(1);
  const employees=[],linesList=[],errors=[];
  lines.forEach((line,i)=>{
    const cols=line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
    const[type,id,name]=cols;
    if(!type||!name){errors.push(`Row ${i+2}: missing type or name`);return;}
    if(type==="employee")employees.push(name);
    else if(type==="line"){if(!id){errors.push(`Row ${i+2}: line missing id`);return;}linesList.push({id,name});}
    else errors.push(`Row ${i+2}: unknown type "${type}"`);
  });
  return{employees,lines:linesList,errors};
}
