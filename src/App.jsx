import { useState, useEffect, useRef, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════
   SUPABASE CONFIG  ← your credentials are already wired in
══════════════════════════════════════════════════════════════ */
const SUPABASE_URL = "https://mdbziytahdeuegxlqggd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnppeXRhaGRldWVneGxxZ2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTI1MTIsImV4cCI6MjA5NTU2ODUxMn0.iPE2dckL4uVw-YewKxjd2IAq0Hii2-0QxDVQo52wH74";

const sbH = () => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, "Content-Type":"application/json", Prefer:"return=representation" });
const sb  = async (path, opts={}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers:{...sbH(),...(opts.headers||{})}, ...opts });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text(); return t ? JSON.parse(t) : [];
};
const sbAll = async (table, q="") => {
  const PAGE=1000; let all=[], from=0;
  while(true){ const qs=q?`${q}&limit=${PAGE}&offset=${from}`:`limit=${PAGE}&offset=${from}`; const pg=await sb(`${table}?${qs}`); all=[...all,...pg]; if(pg.length<PAGE)break; from+=PAGE; }
  return all;
};
const db = {
  getUsers:     ()          => sbAll("pt_users","order=full_name.asc"),
  getUser:      (uid)       => sb(`pt_users?user_id=eq.${uid}&limit=1`),
  addUser:      (d)         => sb("pt_users", {method:"POST",body:JSON.stringify(d)}),
  updateUser:   (uid,d)     => sb(`pt_users?user_id=eq.${uid}`,{method:"PATCH",body:JSON.stringify(d)}),
  getItems:     ()          => sbAll("pt_items","order=item_id.asc"),
  setItems:     (list)      => sb("pt_items_bulk",{method:"POST",body:JSON.stringify({list})}),
  getEmployees: ()          => sbAll("pt_employees","order=name.asc"),
  setEmployees: (list)      => sb("pt_employees_bulk",{method:"POST",body:JSON.stringify({list})}),
  getLines:     ()          => sbAll("pt_lines","order=line_id.asc"),
  setLines:     (list)      => sb("pt_lines_bulk",{method:"POST",body:JSON.stringify({list})}),
  getMasterOrders:()        => sbAll("pt_master_orders","order=order_number.asc"),
  setMasterOrders:(list)    => sb("pt_master_orders_bulk",{method:"POST",body:JSON.stringify({list})}),
  getOrders:    ()          => sbAll("pt_orders","order=created_at.desc"),
  addOrder:     (d)         => sb("pt_orders",{method:"POST",body:JSON.stringify(d)}),
  updateOrder:  (id,d)      => sb(`pt_orders?id=eq.${id}`,{method:"PATCH",body:JSON.stringify(d)}),
};

/* ══════════════════════════════════════════════════════════════
   DEFAULTS (used when DB tables are empty)
══════════════════════════════════════════════════════════════ */
const D_ITEMS     = [{item_id:"ITM-001",name:"Hydraulic Pump Assembly"},{item_id:"ITM-002",name:"Steel Bracket Type-A"},{item_id:"ITM-003",name:"Conveyor Belt Module"},{item_id:"ITM-004",name:"Pneumatic Valve Pack"},{item_id:"ITM-005",name:"Motor Drive Unit"}];
const D_EMPLOYEES = [{name:"Alice Johnson"},{name:"Bob Martinez"},{name:"Carlos Rivera"},{name:"Diana Chen"},{name:"Edward Kim"}];
const D_LINES     = [{line_id:"LINE-01",name:"Assembly Line 1"},{line_id:"LINE-02",name:"Assembly Line 2"},{line_id:"LINE-03",name:"Fabrication Line"},{line_id:"LINE-04",name:"Welding Line"}];

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
const nowISO = () => new Date().toISOString();
const fmt = (dt) => { if(!dt)return"—"; return new Date(dt).toLocaleString("en-NZ",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}); };
const fmtTime = (dt) => { if(!dt)return"—"; return new Date(dt).toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); };
const msDur = (ms) => { const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000); return `${h}h ${m}m ${s}s`; };
const minDur = (ms) => { const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; };

/** Compute working ms (total elapsed minus break time) */
const calcTimes = (order) => {
  const breaks = order.breaks || [];
  const startMs = new Date(order.start_datetime).getTime();
  const endMs   = order.end_datetime ? new Date(order.end_datetime).getTime() : Date.now();
  const totalMs = endMs - startMs;
  let breakMs = 0;
  breaks.forEach(b => {
    const bStart = new Date(b.start).getTime();
    const bEnd   = b.end ? new Date(b.end).getTime() : Date.now();
    breakMs += bEnd - bStart;
  });
  return { totalMs, breakMs, workMs: Math.max(0, totalMs - breakMs) };
};

const parseCSV = (text) => {
  const rows = text.trim().split(/\r?\n/).slice(1);
  const items=[], employees=[], lines=[], masterOrders=[], errors=[];
  rows.forEach((row,i) => {
    const cols = row.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
    const [type,...rest] = cols;
    if (!type) return;
    if (type==="item")        { if(!rest[0]||!rest[1]){errors.push(`Row ${i+2}: item needs id,name`);return;} items.push({item_id:rest[0],name:rest[1]}); }
    else if (type==="employee") { if(!rest[0]){errors.push(`Row ${i+2}: employee needs name`);return;} employees.push({name:rest[0]}); }
    else if (type==="line")   { if(!rest[0]||!rest[1]){errors.push(`Row ${i+2}: line needs id,name`);return;} lines.push({line_id:rest[0],name:rest[1]}); }
    else if (type==="order")  { if(!rest[0]||!rest[1]||!rest[2]){errors.push(`Row ${i+2}: order needs order_number,item_id,qty`);return;} masterOrders.push({order_number:rest[0],item_id:rest[1],qty:Number(rest[2]),description:rest[3]||""}); }
    else errors.push(`Row ${i+2}: unknown type "${type}"`);
  });
  return { items, employees, lines, masterOrders, errors };
};

const CSV_TEMPLATE = `type,id_or_name,name_or_blank,extra
item,ITM-006,New Part Name,
employee,John Smith,,
line,LINE-05,Night Shift Line,
order,ORD-2025-100,ITM-001,200,Optional description`;

const downloadTemplate = () => {
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([CSV_TEMPLATE],{type:"text/csv"})); a.download="prodtrack_import_template.csv"; a.click();
};

/* ══════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#1A1D27} ::-webkit-scrollbar-thumb{background:#3A3F55;border-radius:3px}
.bp{background:#00D4AA;color:#0F1117;border:none;padding:10px 22px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;cursor:pointer;border-radius:4px;transition:all .15s}
.bp:hover{background:#00FFCC;transform:translateY(-1px)} .bp:disabled{background:#2A3A38;color:#4A6A68;cursor:not-allowed;transform:none}
.bd{background:#FF4B6E;color:#fff;border:none;padding:7px 16px;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:11px;cursor:pointer;border-radius:4px;transition:all .15s}
.bd:hover{background:#FF2D55} .bd:disabled{opacity:.35;cursor:not-allowed}
.bg{background:transparent;color:#8B90A8;border:1px solid #2A2F45;padding:7px 16px;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
.bg:hover{border-color:#00D4AA;color:#00D4AA}
.bpa{background:#FF9500;color:#0F1117;border:none;padding:7px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:11px;cursor:pointer;border-radius:4px;transition:all .15s}
.bpa:hover{background:#FFAC30}
.bre{background:#00D4AA;color:#0F1117;border:none;padding:7px 14px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:11px;cursor:pointer;border-radius:4px;transition:all .15s}
.bre:hover{background:#00FFCC}
.bw{background:#FF9500;color:#0F1117;border:none;padding:8px 16px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
.bw:hover{background:#FFAC30}
.br{background:#7B8CFF22;color:#7B8CFF;border:1px solid #7B8CFF44;padding:5px 12px;font-family:'IBM Plex Mono',monospace;font-size:11px;cursor:pointer;border-radius:4px;transition:all .15s}
.br:hover{background:#7B8CFF33}
input,select,textarea{background:#1A1D27;border:1px solid #2A2F45;color:#E8EAF0;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:10px 14px;border-radius:4px;width:100%;outline:none;transition:border .15s}
input:focus,select:focus,textarea:focus{border-color:#00D4AA}
input[type=password]{letter-spacing:2px} input::placeholder{color:#4A4F65} select option{background:#1A1D27}
label{display:block;font-size:11px;color:#8B90A8;margin-bottom:6px;letter-spacing:1px;text-transform:uppercase}
.fg{margin-bottom:16px} .card{background:#1A1D27;border:1px solid #2A2F45;border-radius:8px;padding:20px}
.nb{background:none;border:none;font-family:'IBM Plex Mono',monospace;font-size:12px;padding:10px 15px;cursor:pointer;transition:all .15s;letter-spacing:.5px;white-space:nowrap}
.tag{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:12px;font-size:10px;font-weight:700}
.moc{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
.mo{background:#1A1D27;border:1px solid #2A2F45;border-radius:10px;padding:26px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto}
.pdel{background:none;border:1px solid #3A2030;color:#FF4B6E;font-size:10px;padding:2px 7px;border-radius:10px;cursor:pointer;font-family:'IBM Plex Mono',monospace;transition:all .15s}
.pdel:hover{background:#FF4B6E;color:#fff}
@keyframes si{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} .ai{animation:si .2s ease forwards}
@keyframes ti{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}} .ta{animation:ti .25s ease}
@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite;display:inline-block}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .pulse{animation:pulse 1.5s ease infinite}
.rh:hover td{background:#1E2135!important}
.atab{background:none;border:none;font-family:'IBM Plex Mono',monospace;font-size:12px;padding:8px 14px;cursor:pointer;border-radius:4px 4px 0 0;transition:all .15s;letter-spacing:.5px}
.ba{background:#FF950022;color:#FF9500;border:1px solid #FF950044;padding:1px 9px;border-radius:10px;font-size:9px;font-weight:700;letter-spacing:1px}
.bo{background:#7B8CFF22;color:#7B8CFF;border:1px solid #7B8CFF44;padding:1px 9px;border-radius:10px;font-size:9px;font-weight:700;letter-spacing:1px}
.inp-err{border-color:#FF4B6E!important}
.time-panel{background:#13161F;border-radius:6px;padding:10px 14px;margin-top:10px}
.tp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tp-item{text-align:center}
.break-log{margin-top:10px}
.break-row{display:flex;align-items:center;gap:10px;font-size:10px;color:#8B90A8;padding:4px 0;border-bottom:1px solid #1E2135}
.pause-banner{background:rgba(255,149,0,.08);border:1px solid rgba(255,149,0,.25);border-radius:6px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-top:10px}
.order-suggestion{background:#13161F;border:1px solid #2A2F45;border-radius:4px;max-height:200px;overflow-y:auto;position:absolute;top:100%;left:0;right:0;z-index:50}
.order-sugg-row{padding:9px 12px;cursor:pointer;font-size:12px;transition:background .1s;border-bottom:1px solid #1E2135}
.order-sugg-row:hover{background:#1E2135}
`;

/* ══════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════ */
export default function App() {
  const [session, setSession] = useState(null);
  const [toast,   setToast]   = useState(null);
  const [loading, setLoading] = useState(false);

  const showToast = useCallback((msg, type="success") => {
    setToast({msg,type}); setTimeout(()=>setToast(null),3500);
  },[]);

  if (!session) return <LoginScreen onLogin={setSession} showToast={showToast} loading={loading} setLoading={setLoading} />;

  return (
    <>
      <style>{CSS}</style>
      <MainApp session={session} onLogout={()=>setSession(null)} showToast={showToast} />
      {toast && (
        <div className="ta" style={{position:"fixed",bottom:24,right:24,zIndex:999,background:toast.type==="error"?"#FF4B6E":toast.type==="warn"?"#FF9500":"#00D4AA",color:toast.type==="error"?"#fff":"#0F1117",padding:"12px 20px",borderRadius:6,fontSize:13,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,.5)",maxWidth:400}}>
          {toast.type==="error"?"⚠ ":toast.type==="warn"?"⚠ ":"✔ "}{toast.msg}
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════════════════ */
function LoginScreen({onLogin, showToast, loading, setLoading}) {
  const [uid,setPw0]  = useState("");
  const [pw,setPw1]   = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errs,setErrs]= useState({});

  const login = async () => {
    const e={};
    if (!uid.trim()) e.uid="User ID required";
    if (!pw.trim())  e.pw ="Password required";
    if (Object.keys(e).length) { setErrs(e); return; }
    setLoading(true);
    try {
      const rows = await db.getUser(uid.trim());
      if (!rows.length)           { showToast("User ID not found.","error"); return; }
      const u = rows[0];
      if (u.password !== pw)      { showToast("Incorrect password.","error"); return; }
      if (u.active===false)       { showToast("Account disabled. Contact admin.","error"); return; }
      onLogin({ userId:u.user_id, name:u.full_name, role:u.role });
    } catch(err) {
      showToast("Login failed: "+err.message,"error");
    } finally { setLoading(false); }
  };

  return (
    <div style={{background:"#0F1117",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'IBM Plex Mono',monospace",color:"#E8EAF0"}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{width:56,height:56,background:"#00D4AA",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 16px"}}>⚙</div>
          <div style={{fontSize:22,fontWeight:700,letterSpacing:3}}>PRODTRACK</div>
          <div style={{fontSize:11,color:"#5A5F78",letterSpacing:3,marginTop:4}}>PRODUCTION SCHEDULER</div>
        </div>
        <div className="card">
          <div className="fg">
            <label>User ID</label>
            <input className={errs.uid?"inp-err":""} placeholder="Enter your user ID" value={uid} onChange={e=>{setPw0(e.target.value);setErrs(p=>({...p,uid:""}))}} onKeyDown={e=>e.key==="Enter"&&login()} autoFocus />
            {errs.uid && <div style={{fontSize:11,color:"#FF4B6E",marginTop:5}}>⚠ {errs.uid}</div>}
          </div>
          <div className="fg">
            <label>Password</label>
            <div style={{position:"relative"}}>
              <input className={errs.pw?"inp-err":""} type={showPw?"text":"password"} placeholder="Enter your password" value={pw} onChange={e=>{setPw1(e.target.value);setErrs(p=>({...p,pw:""}))}} onKeyDown={e=>e.key==="Enter"&&login()} />
              <button onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#5A5F78",cursor:"pointer",fontSize:14}}>
                {showPw?"🙈":"👁"}
              </button>
            </div>
            {errs.pw && <div style={{fontSize:11,color:"#FF4B6E",marginTop:5}}>⚠ {errs.pw}</div>}
          </div>
          <button className="bp" onClick={login} disabled={loading} style={{width:"100%",padding:13,fontSize:14}}>
            {loading?<><span className="spin">⚙</span> Signing in…</>:"→ SIGN IN"}
          </button>
        </div>
        <div style={{textAlign:"center",fontSize:11,color:"#3A3F55",marginTop:16}}>Contact your administrator to reset your password</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════════ */
function MainApp({session, onLogout, showToast}) {
  const isAdmin = session.role==="admin";
  const [view,setView] = useState("dashboard");

  const [items,        setItems]        = useState(D_ITEMS);
  const [employees,    setEmployees]    = useState(D_EMPLOYEES);
  const [lines,        setLines]        = useState(D_LINES);
  const [masterOrders, setMasterOrders] = useState([]);
  const [orders,       setOrders]       = useState([]);
  const [dataLoading,  setDataLoading]  = useState(true);

  const [newForm, setNewForm] = useState({orderNumber:"",manualEntry:false,employee:"",itemId:"",lineId:"",productionQty:"",startDateTime:""});
  const [closeModal, setCloseModal] = useState(null);
  const [closeForm,  setCloseForm]  = useState({endQty:"",remarks:""});
  const [pauseModal, setPauseModal] = useState(null);
  const [fEmp,setFEmp]=useState("All"); const [fLine,setFLine]=useState("All"); const [fStatus,setFStatus]=useState("All");
  const [srch,setSrch]=useState(""); const [srchRes,setSrchRes]=useState(null); const [srchMiss,setSrchMiss]=useState(false);
  const [tick, setTick] = useState(0); // force re-render every second for live timers

  // Live timer tick
  useEffect(()=>{ const t=setInterval(()=>setTick(p=>p+1),1000); return ()=>clearInterval(t); },[]);

  // Load data
  useEffect(()=>{
    (async()=>{
      setDataLoading(true);
      try {
        const [it,em,li,mo,or] = await Promise.all([db.getItems(),db.getEmployees(),db.getLines(),db.getMasterOrders(),db.getOrders()]);
        if(it.length) setItems(it); if(em.length) setEmployees(em); if(li.length) setLines(li);
        setMasterOrders(mo); setOrders(or.map(o=>({...o,breaks:o.breaks||[]})));
      } catch(e){ showToast("Failed to load data: "+e.message,"error"); }
      setDataLoading(false);
    })();
  },[]);

  const reloadOrders = async () => {
    const or = await db.getOrders(); setOrders(or.map(o=>({...o,breaks:o.breaks||[]})));
  };

  const saveMaster = async (type, list) => {
    try {
      if(type==="items")        { await db.setItems(list);     setItems(list); }
      if(type==="employees")    { await db.setEmployees(list); setEmployees(list); }
      if(type==="lines")        { await db.setLines(list);     setLines(list); }
      if(type==="masterOrders") { await db.setMasterOrders(list); setMasterOrders(list); }
    } catch(e) { showToast("Save failed: "+e.message,"error"); }
  };

  /* ── Start Order ── */
  const handleStart = async () => {
    const {employee,orderNumber,itemId,lineId,productionQty} = newForm;
    if (!employee||!orderNumber||!itemId||!lineId||!productionQty) { showToast("Fill all required fields.","error"); return; }
    if (orders.find(o=>o.order_number===orderNumber&&o.status!=="Completed")) { showToast("Active order with this number exists.","error"); return; }
    const order = {
      order_number:orderNumber,
      employee, item_id:itemId, item_name:items.find(i=>i.item_id===itemId)?.name||"",
      line_id:lineId, line_name:lines.find(l=>l.line_id===lineId)?.name||"",
      production_qty:Number(productionQty),
      start_datetime: newForm.startDateTime||nowISO(),
      end_datetime:null, end_qty:null, remarks:"",
      status:"In Progress", created_at:nowISO(),
      started_by:session.userId, breaks:[],
    };
    try {
      await db.addOrder(order); await reloadOrders();
      setNewForm({orderNumber:"",manualEntry:false,employee:"",itemId:"",lineId:"",productionQty:"",startDateTime:""});
      showToast(`Order ${orderNumber} started!`); setView("dashboard");
    } catch(e){ showToast("Failed to start order: "+e.message,"error"); }
  };

  /* ── Pause Order ── */
  const handlePause = async (order) => {
    const breaks = [...(order.breaks||[]), {start:nowISO(),end:null}];
    try {
      await db.updateOrder(order.id,{status:"On Break",breaks});
      setOrders(p=>p.map(o=>o.id===order.id?{...o,status:"On Break",breaks}:o));
      showToast(`Order ${order.order_number} paused.`,"warn");
    } catch(e){ showToast("Failed: "+e.message,"error"); }
  };

  /* ── Resume Order ── */
  const handleResume = async (order) => {
    const breaks = (order.breaks||[]).map((b,i)=> i===order.breaks.length-1 && !b.end ? {...b,end:nowISO()} : b);
    try {
      await db.updateOrder(order.id,{status:"In Progress",breaks});
      setOrders(p=>p.map(o=>o.id===order.id?{...o,status:"In Progress",breaks}:o));
      showToast(`Order ${order.order_number} resumed.`);
    } catch(e){ showToast("Failed: "+e.message,"error"); }
  };

  /* ── Close Order ── */
  const handleClose = async () => {
    if (!closeForm.endQty) { showToast("Enter ending quantity.","error"); return; }
    // Make sure any open break is closed
    const breaks = (closeModal.breaks||[]).map((b,i)=> i===closeModal.breaks.length-1&&!b.end?{...b,end:nowISO()}:b);
    const upd = {end_datetime:nowISO(),end_qty:Number(closeForm.endQty),remarks:closeForm.remarks,status:"Completed",closed_by:session.userId,breaks};
    try {
      await db.updateOrder(closeModal.id,upd);
      setOrders(p=>p.map(o=>o.id===closeModal.id?{...o,...upd}:o));
      showToast(`Order ${closeModal.order_number} closed!`);
      setCloseModal(null); setView("records");
    } catch(e){ showToast("Failed: "+e.message,"error"); }
  };

  const doSearch = () => {
    if (!srch.trim()) return;
    const f=orders.find(o=>o.order_number.toLowerCase()===srch.trim().toLowerCase());
    f?(setSrchRes(f),setSrchMiss(false)):(setSrchRes(null),setSrchMiss(true));
  };

  const filtered = orders.filter(o=>
    (fEmp==="All"||o.employee===fEmp)&&(fLine==="All"||o.line_id===fLine)&&(fStatus==="All"||o.status===fStatus)
  );
  const active    = orders.filter(o=>o.status==="In Progress"||o.status==="On Break");
  const completed = orders.filter(o=>o.status==="Completed");

  const NAV = [
    {id:"dashboard",label:"Dashboard"},{id:"new",label:"+ New Order"},
    {id:"search",label:"Search"},{id:"records",label:"Records"},
    ...(isAdmin?[{id:"admin",label:"⚙ Admin"}]:[]),
  ];

  return (
    <div style={{fontFamily:"'IBM Plex Mono',monospace",background:"#0F1117",minHeight:"100vh",color:"#E8EAF0"}}>
      {/* HEADER */}
      <div style={{background:"#13161F",borderBottom:"1px solid #2A2F45",padding:"0 20px"}}>
        <div style={{maxWidth:1340,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:58,gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:32,height:32,background:"#00D4AA",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚙</div>
            <div><div style={{fontSize:14,fontWeight:700,letterSpacing:1}}>PRODTRACK</div><div style={{fontSize:10,color:"#5A5F78",letterSpacing:2}}>PRODUCTION SCHEDULER</div></div>
          </div>
          <nav style={{display:"flex",gap:2,flexWrap:"wrap"}}>
            {NAV.map(t=>(
              <button key={t.id} className="nb" onClick={()=>{setView(t.id);setSrchRes(null);setSrchMiss(false);}}
                style={{color:view===t.id?(t.id==="admin"?"#FF9500":"#00D4AA"):"#8B90A8",background:view===t.id?(t.id==="admin"?"rgba(255,149,0,.08)":"rgba(0,212,170,.08)"):"none",borderBottom:view===t.id?`2px solid ${t.id==="admin"?"#FF9500":"#00D4AA"}`:"2px solid transparent",borderRadius:"4px 4px 0 0"}}>
                {t.label}
              </button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:"#C8CADC",fontWeight:600}}>{session.name}</div>
              <div style={{display:"flex",gap:6,justifyContent:"flex-end",marginTop:2}}>
                <span className={isAdmin?"ba":"bo"}>{isAdmin?"ADMIN":"OPERATOR"}</span>
              </div>
            </div>
            <button className="bg" style={{padding:"6px 12px",fontSize:11}} onClick={onLogout}>⎋ Logout</button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1340,margin:"0 auto",padding:"28px 20px"}}>
        {dataLoading && <div style={{textAlign:"center",padding:60,color:"#5A5F78"}}><span className="spin" style={{fontSize:28}}>⚙</span><div style={{marginTop:12,letterSpacing:2}}>Loading data…</div></div>}
        {!dataLoading && (
          <>
            {/* ═══ DASHBOARD ═══ */}
            {view==="dashboard" && (
              <div className="ai">
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:28}}>
                  {[
                    {label:"TOTAL",      val:orders.length,    color:"#7B8CFF",icon:"📋"},
                    {label:"IN PROGRESS",val:orders.filter(o=>o.status==="In Progress").length, color:"#FFC107",icon:"🔄"},
                    {label:"ON BREAK",   val:orders.filter(o=>o.status==="On Break").length,    color:"#FF9500",icon:"⏸"},
                    {label:"COMPLETED",  val:completed.length, color:"#00D4AA",icon:"✅"},
                  ].map(s=>(
                    <div key={s.label} className="card" style={{display:"flex",alignItems:"center",gap:14}}>
                      <div style={{fontSize:26}}>{s.icon}</div>
                      <div><div style={{fontSize:26,fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div><div style={{fontSize:9,color:"#5A5F78",letterSpacing:2,marginTop:3}}>{s.label}</div></div>
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div style={{display:"flex",gap:18,marginBottom:14,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
                  <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>Active Orders</h2>
                  <div style={{display:"flex",gap:16}}>
                    {[{c:"#FFC107",l:"In Progress"},{c:"#FF9500",l:"On Break"},{c:"#198754",l:"Completed"}].map(x=>(
                      <div key={x.l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#8B90A8"}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:x.c}}></div>{x.l}
                      </div>
                    ))}
                    <button className="bp" onClick={()=>setView("new")} style={{padding:"6px 16px",fontSize:12}}>+ New Order</button>
                  </div>
                </div>

                {active.length===0
                  ? <div className="card" style={{textAlign:"center",padding:48,color:"#4A4F65"}}><div style={{fontSize:36,marginBottom:12}}>📭</div>No active orders.</div>
                  : <div style={{display:"grid",gap:14}}>
                      {active.map(o=>(
                        <ActiveOrderCard key={o.id} order={o} tick={tick}
                          onPause={()=>handlePause(o)}
                          onResume={()=>handleResume(o)}
                          onEnd={()=>{setCloseModal(o);setCloseForm({endQty:"",remarks:""}); }}
                        />
                      ))}
                    </div>
                }
              </div>
            )}

            {/* ═══ NEW ORDER ═══ */}
            {view==="new" && (
              <div className="ai" style={{maxWidth:660}}>
                <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase",marginBottom:24}}>Start New Production Order</h2>
                <NewOrderForm
                  form={newForm} setForm={setNewForm}
                  items={items} employees={employees} lines={lines} masterOrders={masterOrders}
                  onSubmit={handleStart} onCancel={()=>setView("dashboard")}
                />
              </div>
            )}

            {/* ═══ SEARCH ═══ */}
            {view==="search" && (
              <div className="ai" style={{maxWidth:780}}>
                <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase",marginBottom:24}}>Search Order</h2>
                <div className="card" style={{marginBottom:20}}>
                  <div style={{display:"flex",gap:10}}>
                    <input placeholder="Enter Order Number…" value={srch} onChange={e=>setSrch(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&doSearch()} />
                    <button className="bp" onClick={doSearch} style={{whiteSpace:"nowrap"}}>🔍 Search</button>
                  </div>
                </div>
                {srchMiss && <div className="card" style={{textAlign:"center",color:"#FF4B6E",padding:32}}><div style={{fontSize:32,marginBottom:8}}>🚫</div>No order found for <strong>"{srch}"</strong></div>}
                {srchRes && (
                  <div className="ai">
                    {(srchRes.status==="In Progress"||srchRes.status==="On Break")
                      ? <ActiveOrderCard order={srchRes} tick={tick}
                          onPause={()=>handlePause(srchRes)} onResume={()=>handleResume(srchRes)}
                          onEnd={()=>{setCloseModal(srchRes);setCloseForm({endQty:"",remarks:""});}} />
                      : <CompletedOrderCard order={srchRes} />
                    }
                  </div>
                )}
              </div>
            )}

            {/* ═══ RECORDS ═══ */}
            {view==="records" && (
              <div className="ai">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:10}}>
                  <h2 style={{fontSize:13,color:"#8B90A8",letterSpacing:2,textTransform:"uppercase"}}>All Records <span style={{color:"#4A4F65"}}>({filtered.length})</span></h2>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <select value={fEmp}    onChange={e=>setFEmp(e.target.value)}    style={{width:170}}><option value="All">All Employees</option>{employees.map(e=><option key={e.name} value={e.name}>{e.name}</option>)}</select>
                    <select value={fLine}   onChange={e=>setFLine(e.target.value)}   style={{width:155}}><option value="All">All Lines</option>{lines.map(l=><option key={l.line_id} value={l.line_id}>{l.line_id}</option>)}</select>
                    <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{width:155}}><option value="All">All Status</option><option>In Progress</option><option>On Break</option><option>Completed</option></select>
                  </div>
                </div>
                {filtered.length===0
                  ? <div className="card" style={{textAlign:"center",padding:48,color:"#4A4F65"}}><div style={{fontSize:36,marginBottom:12}}>📂</div>No records found.</div>
                  : <RecordsTable orders={filtered} tick={tick} onEnd={(o)=>{setCloseModal(o);setCloseForm({endQty:"",remarks:""}); }} onPause={handlePause} onResume={handleResume} />
                }
              </div>
            )}

            {/* ═══ ADMIN ═══ */}
            {view==="admin" && isAdmin && (
              <AdminPanel items={items} employees={employees} lines={lines} masterOrders={masterOrders}
                saveMaster={saveMaster} showToast={showToast} />
            )}
          </>
        )}
      </div>

      {/* CLOSE MODAL */}
      {closeModal && (
        <div className="moc" onClick={e=>e.target===e.currentTarget&&setCloseModal(null)}>
          <div className="mo ai">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <h3 style={{fontSize:14,color:"#E8EAF0",letterSpacing:1}}>⏹ CLOSE ORDER</h3>
              <button className="bg" style={{padding:"4px 10px"}} onClick={()=>setCloseModal(null)}>✕</button>
            </div>
            <div style={{background:"#13161F",borderRadius:6,padding:"12px 16px",marginBottom:20}}>
              <div style={{fontSize:18,color:"#00D4AA",fontWeight:700}}>{closeModal.order_number}</div>
              <div style={{fontSize:12,color:"#8B90A8",marginTop:4}}>{closeModal.item_id} — {closeModal.item_name}</div>
              <div style={{fontSize:11,color:"#5A5F78",marginTop:2}}>Line: <span style={{color:"#7B8CFF"}}>{closeModal.line_id} — {closeModal.line_name}</span></div>
              <div style={{fontSize:11,color:"#5A5F78"}}>Employee: {closeModal.employee} &nbsp;·&nbsp; Plan Qty: <span style={{color:"#C8CADC"}}>{closeModal.production_qty}</span></div>
              {(()=>{const {workMs,breakMs}=calcTimes(closeModal); return <div style={{fontSize:11,color:"#5A5F78",marginTop:3}}>Working time: <span style={{color:"#00D4AA"}}>{minDur(workMs)}</span> &nbsp;·&nbsp; Break: <span style={{color:"#FF9500"}}>{minDur(breakMs)}</span></div>;})()}
            </div>
            <div className="fg">
              <label>End Date & Time (Auto-captured)</label>
              <input value={fmt(nowISO())} readOnly style={{color:"#00D4AA",cursor:"not-allowed",opacity:.8}} />
            </div>
            <div className="fg">
              <label>Ending Quantity *</label>
              <input type="number" min="0" placeholder="Actual produced quantity" value={closeForm.endQty} onChange={e=>setCloseForm(f=>({...f,endQty:e.target.value}))} autoFocus />
            </div>
            <div className="fg">
              <label>Remarks</label>
              <textarea rows={3} placeholder="Notes, issues, observations…" value={closeForm.remarks} onChange={e=>setCloseForm(f=>({...f,remarks:e.target.value}))} />
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="bd" style={{flex:1,padding:12,fontSize:13}} onClick={handleClose}>⏹ CLOSE ORDER</button>
              <button className="bg" onClick={()=>setCloseModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   NEW ORDER FORM  — with master order lookup
══════════════════════════════════════════════════════════════ */
function NewOrderForm({form, setForm, items, employees, lines, masterOrders, onSubmit, onCancel}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg]       = useState(false);
  const srchRef = useRef();

  const handleOrderInput = (val) => {
    setForm(f=>({...f,orderNumber:val.toUpperCase(),manualEntry:true}));
    if (val.length>=2) {
      const s = masterOrders.filter(o=>o.order_number.toLowerCase().includes(val.toLowerCase())).slice(0,8);
      setSuggestions(s); setShowSugg(s.length>0);
    } else { setShowSugg(false); }
  };

  const selectMasterOrder = (mo) => {
    setForm(f=>({...f, orderNumber:mo.order_number, itemId:mo.item_id, productionQty:String(mo.qty), manualEntry:false}));
    setShowSugg(false);
  };

  return (
    <div className="card">
      {/* Order Number — with live search from master orders */}
      <div className="fg" style={{position:"relative"}}>
        <label>Order Number * {masterOrders.length>0 && <span style={{color:"#5A5F78",fontWeight:400,letterSpacing:0}}>— type to search from {masterOrders.length} loaded orders</span>}</label>
        <input ref={srchRef} placeholder="Type order number or search loaded orders…" value={form.orderNumber}
          onChange={e=>handleOrderInput(e.target.value)}
          onBlur={()=>setTimeout(()=>setShowSugg(false),200)} />
        {showSugg && (
          <div className="order-suggestion">
            {suggestions.map(mo=>(
              <div key={mo.order_number} className="order-sugg-row" onMouseDown={()=>selectMasterOrder(mo)}>
                <span style={{color:"#00D4AA",fontWeight:700,marginRight:10}}>{mo.order_number}</span>
                <span style={{color:"#8B90A8",marginRight:10}}>{mo.item_id}</span>
                <span style={{color:"#C8CADC"}}>{items.find(i=>i.item_id===mo.item_id)?.name||""}</span>
                <span style={{color:"#5A5F78",marginLeft:10}}>Qty: {mo.qty}</span>
                {mo.description && <span style={{color:"#4A4F65",marginLeft:10}}>· {mo.description}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-populated notice */}
      {form.orderNumber && !form.manualEntry && masterOrders.find(m=>m.order_number===form.orderNumber) && (
        <div style={{background:"#0D2A1A",border:"1px solid #00D4AA33",borderRadius:6,padding:"8px 14px",marginBottom:16,fontSize:11,color:"#00D4AA",display:"flex",alignItems:"center",gap:8}}>
          ✔ Order loaded — Item and Qty auto-populated from master order list
        </div>
      )}

      <div className="fg">
        <label>Employee *</label>
        <select value={form.employee} onChange={e=>setForm(f=>({...f,employee:e.target.value}))}>
          <option value="">— Select Employee —</option>
          {employees.map(e=><option key={e.name} value={e.name}>{e.name}</option>)}
        </select>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div className="fg">
          <label>Production Line *</label>
          <select value={form.lineId} onChange={e=>setForm(f=>({...f,lineId:e.target.value}))}>
            <option value="">— Select Line —</option>
            {lines.map(l=><option key={l.line_id} value={l.line_id}>{l.line_id} — {l.name}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Item Number *</label>
          <select value={form.itemId} onChange={e=>setForm(f=>({...f,itemId:e.target.value}))}>
            <option value="">— Select Item —</option>
            {items.map(i=><option key={i.item_id} value={i.item_id}>{i.item_id} — {i.name}</option>)}
          </select>
        </div>
      </div>
      <div className="fg">
        <label>Production Qty *</label>
        <input type="number" min="1" placeholder="0" value={form.productionQty} onChange={e=>setForm(f=>({...f,productionQty:e.target.value}))} />
      </div>
      <div className="fg">
        <label>Start Date & Time</label>
        <div style={{display:"flex",gap:10}}>
          <input type="datetime-local" value={form.startDateTime} onChange={e=>setForm(f=>({...f,startDateTime:e.target.value}))} style={{flex:1}} />
          <button className="bg" onClick={()=>{const l=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);setForm(f=>({...f,startDateTime:l}));}}>📍 Now</button>
        </div>
        <div style={{fontSize:10,color:"#4A4F65",marginTop:5}}>Leave blank to auto-capture on submit</div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="bp" onClick={onSubmit} style={{flex:1,padding:12}}>▶ START ORDER</button>
        <button className="bg" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ACTIVE ORDER CARD  (with Pause/Resume + time tracking)
══════════════════════════════════════════════════════════════ */
function ActiveOrderCard({order, tick, onPause, onResume, onEnd}) {
  const paused = order.status==="On Break";
  const {totalMs, breakMs, workMs} = calcTimes(order);
  const breaks = order.breaks||[];
  const sc = paused ? {dot:"#FF9500",border:"#FF9500"} : {dot:"#FFC107",border:"#FFC107"};
  const currentBreak = paused ? breaks[breaks.length-1] : null;

  return (
    <div style={{background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:8,padding:"18px 20px",borderLeft:`3px solid ${sc.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <span style={{fontSize:16,fontWeight:700,color:"#00D4AA"}}>{order.order_number}</span>
            <span className="tag" style={{background:sc.dot+"22",color:sc.dot,border:`1px solid ${sc.dot}33`}}>
              {paused && <span className="pulse" style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>}
              {!paused && <span style={{width:6,height:6,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>}
              {order.status}
            </span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:"5px 20px",marginBottom:4}}>
            {[["Employee",order.employee],["Line",`${order.line_id} — ${order.line_name}`],["Item",`${order.item_id} — ${order.item_name}`],["Plan Qty",order.production_qty],["Started",fmt(order.start_datetime)]].map(([k,v])=>(
              <div key={k}><div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase"}}>{k}</div><div style={{fontSize:11,color:"#C8CADC",marginTop:1}}>{v}</div></div>
            ))}
          </div>
        </div>
        {/* Buttons */}
        <div style={{display:"flex",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
          {paused
            ? <button className="bre" onClick={onResume}>▶ Resume</button>
            : <button className="bpa" onClick={onPause}>⏸ Pause (Break)</button>
          }
          <button className="bd" onClick={onEnd} disabled={paused} title={paused?"Resume before ending":""}>⏹ End Order</button>
        </div>
      </div>

      {/* Pause banner */}
      {paused && currentBreak && (
        <div className="pause-banner">
          <div style={{fontSize:20}}>⏸</div>
          <div>
            <div style={{fontSize:12,color:"#FF9500",fontWeight:700}}>Currently on break — timer paused</div>
            <div style={{fontSize:10,color:"#8B90A8",marginTop:2}}>Break started at {fmtTime(currentBreak.start)} · Break time excluded from working time</div>
          </div>
        </div>
      )}

      {/* Time tracking */}
      <div className="time-panel">
        <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Time Tracking</div>
        <div className="tp-grid">
          <div className="tp-item"><div style={{fontSize:15,fontWeight:700,color:"#7B8CFF"}}>{minDur(totalMs)}</div><div style={{fontSize:8,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Total Elapsed</div></div>
          <div className="tp-item"><div style={{fontSize:15,fontWeight:700,color:"#00D4AA"}}>{minDur(workMs)}</div><div style={{fontSize:8,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Working Time</div></div>
          <div className="tp-item"><div style={{fontSize:15,fontWeight:700,color:"#FF9500"}}>{minDur(breakMs)}{paused?"+":" "}</div><div style={{fontSize:8,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Break Time</div></div>
          <div className="tp-item"><div style={{fontSize:15,fontWeight:700,color:"#8B90A8"}}>{breaks.length}</div><div style={{fontSize:8,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Breaks Taken</div></div>
        </div>
        {breaks.length>0 && (
          <div className="break-log">
            <div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase",marginBottom:6,marginTop:10}}>Break Log</div>
            {breaks.map((b,i)=>{
              const dur = b.end ? msDur(new Date(b.end)-new Date(b.start)) : null;
              return (
                <div key={i} className="break-row">
                  <span style={{color:"#FF9500",fontWeight:700,minWidth:55}}>Break {i+1}</span>
                  <span>{fmtTime(b.start)} → {b.end?fmtTime(b.end):"ongoing…"}</span>
                  <span style={{marginLeft:"auto",color:b.end?"#C8CADC":"#FF9500"}}>{dur||<span className="pulse">running</span>}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* Compact completed card */
function CompletedOrderCard({order}) {
  const {workMs,breakMs} = calcTimes(order);
  return (
    <div style={{background:"#1A1D27",border:"1px solid #2A2F45",borderRadius:8,padding:"18px 20px",borderLeft:"3px solid #198754"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <span style={{fontSize:16,fontWeight:700,color:"#00D4AA"}}>{order.order_number}</span>
        <span className="tag" style={{background:"#D1E7DD22",color:"#198754",border:"1px solid #19875433"}}><span style={{width:6,height:6,borderRadius:"50%",background:"#198754",display:"inline-block"}}></span>Completed</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:"5px 20px"}}>
        {[["Employee",order.employee],["Line",`${order.line_id} — ${order.line_name}`],["Item",`${order.item_id} — ${order.item_name}`],["Plan Qty",order.production_qty],["End Qty",order.end_qty],["Working Time",minDur(workMs)],["Break Time",minDur(breakMs)],["Breaks",order.breaks?.length||0],["Remarks",order.remarks||"—"]].map(([k,v])=>(
          <div key={k}><div style={{fontSize:9,color:"#5A5F78",letterSpacing:1,textTransform:"uppercase"}}>{k}</div><div style={{fontSize:11,color:"#C8CADC",marginTop:1}}>{v}</div></div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   RECORDS TABLE
══════════════════════════════════════════════════════════════ */
function RecordsTable({orders, tick, onEnd, onPause, onResume}) {
  const SC = {"In Progress":{dot:"#FFC107"},"On Break":{dot:"#FF9500"},Completed:{dot:"#198754"}};
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead>
          <tr style={{borderBottom:"1px solid #2A2F45"}}>
            {["Order #","Employee","Line","Item","Plan","End Qty","Working Time","Break","Breaks","Status","Remarks","Action"].map(h=>(
              <th key={h} style={{padding:"9px 11px",textAlign:"left",color:"#5A5F78",letterSpacing:1,fontWeight:600,fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(o=>{
            const sc=SC[o.status]||{dot:"#6C757D"};
            const {workMs,breakMs}=calcTimes(o);
            const paused=o.status==="On Break";
            return (
              <tr key={o.id} className="rh" style={{borderBottom:"1px solid #1E2135"}}>
                <td style={{padding:"10px 11px",color:"#00D4AA",fontWeight:600}}>{o.order_number}</td>
                <td style={{padding:"10px 11px",color:"#C8CADC"}}>{o.employee}</td>
                <td style={{padding:"10px 11px",color:"#7B8CFF"}}><div style={{fontSize:9,color:"#5A5F78"}}>{o.line_id}</div><div>{o.line_name}</div></td>
                <td style={{padding:"10px 11px",color:"#8B90A8",maxWidth:150}}><div style={{fontSize:9,color:"#5A5F78"}}>{o.item_id}</div><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{o.item_name}</div></td>
                <td style={{padding:"10px 11px",textAlign:"center"}}>{o.production_qty}</td>
                <td style={{padding:"10px 11px",textAlign:"center",color:o.end_qty!=null?"#00D4AA":"#4A4F65"}}>{o.end_qty??  "—"}</td>
                <td style={{padding:"10px 11px",color:"#00D4AA",whiteSpace:"nowrap"}}>{minDur(workMs)}</td>
                <td style={{padding:"10px 11px",color:"#FF9500",whiteSpace:"nowrap"}}>{breakMs>0?minDur(breakMs):"—"}</td>
                <td style={{padding:"10px 11px",textAlign:"center",color:"#8B90A8"}}>{o.breaks?.length||0}</td>
                <td style={{padding:"10px 11px"}}>
                  <span className="tag" style={{background:sc.dot+"22",color:sc.dot,border:`1px solid ${sc.dot}33`}}>
                    <span style={{width:5,height:5,borderRadius:"50%",background:sc.dot,display:"inline-block"}}></span>
                    {o.status}
                  </span>
                </td>
                <td style={{padding:"10px 11px",color:"#8B90A8",maxWidth:140,fontSize:10}}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{o.remarks||"—"}</div></td>
                <td style={{padding:"10px 11px"}}>
                  <div style={{display:"flex",gap:5}}>
                    {o.status==="In Progress" && <><button className="bpa" style={{fontSize:10,padding:"3px 10px"}} onClick={()=>onPause(o)}>⏸</button><button className="bd" style={{fontSize:10,padding:"3px 10px"}} onClick={()=>onEnd(o)}>⏹</button></>}
                    {o.status==="On Break"    && <button className="bre" style={{fontSize:10,padding:"3px 10px"}} onClick={()=>onResume(o)}>▶</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ADMIN PANEL
══════════════════════════════════════════════════════════════ */
function AdminPanel({items, employees, lines, masterOrders, saveMaster, showToast}) {
  const [tab,setTab]   = useState("users");
  const [users,setUsers] = useState([]);
  const [newUser,setNewUser] = useState({id:"",name:"",password:"",role:"operator"});
  const [newItem,setNewItem] = useState({id:"",name:""});
  const [newEmp,setNewEmp]   = useState("");
  const [newLine,setNewLine] = useState({id:"",name:""});
  const [csvPrev,setCsvPrev] = useState(null);
  const [csvErrs,setCsvErrs] = useState([]);
  const [showPw,setShowPw]   = useState(false);
  const [userLoading,setUserLoading] = useState(false);
  const fileRef = useRef();

  useEffect(()=>{
    db.getUsers().then(setUsers).catch(e=>showToast("Load users: "+e.message,"error"));
  },[]);

  const addUser = async () => {
    const {id,name,password,role}=newUser;
    if(!id||!name||!password){showToast("All user fields required.","error");return;}
    if(users.find(u=>u.user_id===id)){showToast("User ID already exists.","error");return;}
    setUserLoading(true);
    try {
      await db.addUser({user_id:id,full_name:name,password,role,active:true,created_at:nowISO()});
      const updated = await db.getUsers(); setUsers(updated);
      setNewUser({id:"",name:"",password:"",role:"operator"});
      showToast(`User "${name}" added.`);
    } catch(e){showToast("Add user failed: "+e.message,"error");}
    setUserLoading(false);
  };

  const toggleUser = async (uid,active) => {
    try { await db.updateUser(uid,{active}); const u=await db.getUsers(); setUsers(u); showToast(active?"User enabled.":"User disabled.","warn"); }
    catch(e){showToast("Update failed: "+e.message,"error");}
  };
  const resetPw = async (uid,pw) => {
    if(!pw)return;
    try { await db.updateUser(uid,{password:pw}); showToast("Password updated."); }
    catch(e){showToast("Update failed: "+e.message,"error");}
  };

  const addItem = async () => {
    if(!newItem.id||!newItem.name){showToast("ID and Name required.","error");return;}
    if(items.find(i=>i.item_id===newItem.id)){showToast("Item ID exists.","error");return;}
    await saveMaster("items",[...items,{item_id:newItem.id.toUpperCase(),name:newItem.name}]);
    setNewItem({id:"",name:""}); showToast("Item added.");
  };
  const addEmp = async () => {
    if(!newEmp){showToast("Name required.","error");return;}
    if(employees.find(e=>e.name===newEmp)){showToast("Already exists.","error");return;}
    await saveMaster("employees",[...employees,{name:newEmp}]);
    setNewEmp(""); showToast("Employee added.");
  };
  const addLine = async () => {
    if(!newLine.id||!newLine.name){showToast("ID and Name required.","error");return;}
    if(lines.find(l=>l.line_id===newLine.id)){showToast("Line ID exists.","error");return;}
    await saveMaster("lines",[...lines,{line_id:newLine.id.toUpperCase(),name:newLine.name}]);
    setNewLine({id:"",name:""}); showToast("Line added.");
  };

  const handleFile = (e) => {
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{ const p=parseCSV(ev.target.result); setCsvPrev(p); setCsvErrs(p.errors); };
    r.readAsText(f); e.target.value="";
  };

  const applyImport = async (mode) => {
    if(!csvPrev) return;
    const {items:ni,employees:ne,lines:nl,masterOrders:nmo}=csvPrev;
    if(mode==="replace"){
      if(ni.length)  await saveMaster("items",ni);
      if(ne.length)  await saveMaster("employees",ne);
      if(nl.length)  await saveMaster("lines",nl);
      if(nmo.length) await saveMaster("masterOrders",nmo);
    } else {
      if(ni.length)  { const s=new Set(items.map(x=>x.item_id)); await saveMaster("items",[...items,...ni.filter(x=>!s.has(x.item_id))]); }
      if(ne.length)  { const s=new Set(employees.map(x=>x.name)); await saveMaster("employees",[...employees,...ne.filter(x=>!s.has(x.name))]); }
      if(nl.length)  { const s=new Set(lines.map(x=>x.line_id)); await saveMaster("lines",[...lines,...nl.filter(x=>!s.has(x.line_id))]); }
      if(nmo.length) { const s=new Set(masterOrders.map(x=>x.order_number)); await saveMaster("masterOrders",[...masterOrders,...nmo.filter(x=>!s.has(x.order_number))]); }
    }
    showToast(`Imported: ${ni.length} items, ${ne.length} employees, ${nl.length} lines, ${nmo.length} orders.`);
    setCsvPrev(null);
  };

  const TABS=[{id:"users",label:`👥 Users (${users.length})`},{id:"masterOrders",label:`📋 Master Orders (${masterOrders.length})`},{id:"items",label:`Items (${items.length})`},{id:"employees",label:`Employees (${employees.length})`},{id:"lines",label:`Lines (${lines.length})`},{id:"import",label:"⬆ CSV Import"}];

  return (
    <div className="ai">
      <h2 style={{fontSize:13,color:"#FF9500",letterSpacing:2,textTransform:"uppercase",marginBottom:20}}>⚙ Admin Panel</h2>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #2A2F45",marginBottom:24,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} className="atab" onClick={()=>setTab(t.id)}
            style={{color:tab===t.id?"#00D4AA":"#8B90A8",borderBottom:tab===t.id?"2px solid #00D4AA":"2px solid transparent",fontWeight:tab===t.id?700:400}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="users" && (
        <div style={{maxWidth:720}}>
          <div className="card" style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#FF9500",letterSpacing:1,marginBottom:14,textTransform:"uppercase",fontWeight:700}}>Add New User</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div className="fg"><label>User ID *</label><input placeholder="e.g. operator3" value={newUser.id} onChange={e=>setNewUser(f=>({...f,id:e.target.value}))} /></div>
              <div className="fg"><label>Full Name *</label><input placeholder="First Last" value={newUser.name} onChange={e=>setNewUser(f=>({...f,name:e.target.value}))} /></div>
              <div className="fg">
                <label>Password *</label>
                <div style={{position:"relative"}}>
                  <input type={showPw?"text":"password"} placeholder="Min 6 characters" value={newUser.password} onChange={e=>setNewUser(f=>({...f,password:e.target.value}))} />
                  <button onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#5A5F78",cursor:"pointer",fontSize:13}}>{showPw?"🙈":"👁"}</button>
                </div>
              </div>
              <div className="fg"><label>Role *</label><select value={newUser.role} onChange={e=>setNewUser(f=>({...f,role:e.target.value}))}><option value="operator">Operator</option><option value="admin">Admin</option></select></div>
            </div>
            <button className="bp" onClick={addUser} disabled={userLoading}>{userLoading?"Adding…":"+ Add User"}</button>
          </div>
          <div className="card">
            <div style={{fontSize:11,color:"#8B90A8",letterSpacing:1,marginBottom:14,textTransform:"uppercase"}}>All Users</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,maxHeight:420,overflowY:"auto"}}>
              {users.map(u=><UserRow key={u.user_id} user={u} onToggle={toggleUser} onResetPw={resetPw} showToast={showToast} />)}
            </div>
          </div>
        </div>
      )}

      {tab==="masterOrders" && (
        <div style={{maxWidth:760}}>
          <div style={{fontSize:11,color:"#8B90A8",marginBottom:14,lineHeight:1.7}}>
            Master orders are pre-loaded production orders. When an operator types an order number in the New Order form, it auto-populates the Item and Quantity.<br/>
            <span style={{color:"#5A5F78"}}>Add manually below or upload in bulk via the CSV Import tab (use type = <code style={{color:"#00D4AA"}}>order</code>).</span>
          </div>
          <div className="card" style={{marginBottom:20}}>
            <AddMasterOrderForm masterOrders={masterOrders} saveMaster={saveMaster} showToast={showToast} />
          </div>
          <div className="card">
            <div style={{fontSize:11,color:"#8B90A8",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Loaded Orders ({masterOrders.length})</div>
            <div style={{maxHeight:400,overflowY:"auto"}}>
              {masterOrders.length===0 ? <div style={{color:"#4A4F65",fontSize:12,padding:16,textAlign:"center"}}>No master orders loaded yet. Add manually or import via CSV.</div>
              : masterOrders.map(mo=>(
                <div key={mo.order_number} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#13161F",padding:"8px 14px",borderRadius:6,marginBottom:6}}>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                    <span style={{color:"#00D4AA",fontWeight:600}}>{mo.order_number}</span>
                    <span style={{color:"#8B90A8",fontSize:11}}>{mo.item_id}</span>
                    <span style={{color:"#C8CADC",fontSize:11}}>Qty: {mo.qty}</span>
                    {mo.description && <span style={{color:"#5A5F78",fontSize:11}}>{mo.description}</span>}
                  </div>
                  <button className="pdel" onClick={()=>saveMaster("masterOrders",masterOrders.filter(x=>x.order_number!==mo.order_number))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==="items" && (
        <div style={{maxWidth:640}}>
          <div className="card" style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#8B90A8",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add New Item</div>
            <div style={{display:"grid",gridTemplateColumns:"150px 1fr auto",gap:10,alignItems:"end"}}>
              <div><label>Item ID</label><input placeholder="ITM-011" value={newItem.id} onChange={e=>setNewItem(f=>({...f,id:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addItem()} /></div>
              <div><label>Name</label><input placeholder="Part description" value={newItem.name} onChange={e=>setNewItem(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addItem()} /></div>
              <button className="bp" onClick={addItem} style={{padding:"10px 18px"}}>+ Add</button>
            </div>
          </div>
          <div className="card"><div style={{fontSize:11,color:"#8B90A8",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Items ({items.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:340,overflowY:"auto"}}>
              {items.map(i=>(
                <div key={i.item_id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#13161F",padding:"8px 14px",borderRadius:6}}>
                  <div><span style={{color:"#00D4AA",fontWeight:600,marginRight:12}}>{i.item_id}</span><span style={{color:"#C8CADC",fontSize:11}}>{i.name}</span></div>
                  <button className="pdel" onClick={()=>saveMaster("items",items.filter(x=>x.item_id!==i.item_id))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==="employees" && (
        <div style={{maxWidth:500}}>
          <div className="card" style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#8B90A8",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add Employee</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"end"}}>
              <div><label>Full Name</label><input placeholder="First Last" value={newEmp} onChange={e=>setNewEmp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEmp()} /></div>
              <button className="bp" onClick={addEmp} style={{padding:"10px 18px"}}>+ Add</button>
            </div>
          </div>
          <div className="card"><div style={{fontSize:11,color:"#8B90A8",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Employees ({employees.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:340,overflowY:"auto"}}>
              {employees.map(e=>(
                <div key={e.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#13161F",padding:"8px 14px",borderRadius:6}}>
                  <span style={{color:"#C8CADC",fontSize:11}}>👤 {e.name}</span>
                  <button className="pdel" onClick={()=>saveMaster("employees",employees.filter(x=>x.name!==e.name))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==="lines" && (
        <div style={{maxWidth:640}}>
          <div className="card" style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#8B90A8",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Add Line</div>
            <div style={{display:"grid",gridTemplateColumns:"150px 1fr auto",gap:10,alignItems:"end"}}>
              <div><label>Line ID</label><input placeholder="LINE-09" value={newLine.id} onChange={e=>setNewLine(f=>({...f,id:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addLine()} /></div>
              <div><label>Name</label><input placeholder="e.g. Night Shift Line" value={newLine.name} onChange={e=>setNewLine(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addLine()} /></div>
              <button className="bp" onClick={addLine} style={{padding:"10px 18px"}}>+ Add</button>
            </div>
          </div>
          <div className="card"><div style={{fontSize:11,color:"#8B90A8",letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>Lines ({lines.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:340,overflowY:"auto"}}>
              {lines.map(l=>(
                <div key={l.line_id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#13161F",padding:"8px 14px",borderRadius:6}}>
                  <div><span style={{color:"#7B8CFF",fontWeight:600,marginRight:12}}>{l.line_id}</span><span style={{color:"#C8CADC",fontSize:11}}>{l.name}</span></div>
                  <button className="pdel" onClick={()=>saveMaster("lines",lines.filter(x=>x.line_id!==l.line_id))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
