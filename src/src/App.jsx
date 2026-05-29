import { useState, useEffect, useRef } from "react";

// ─── SUPABASE CONFIG ───────────────────────────────────────────
const SUPABASE_URL = "https://mdbziytahdeuegxlqggd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnppeXRhaGRldWVneGxxZ2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTI1MTIsImV4cCI6MjA5NTU2ODUxMn0.iPE2dckL4uVw-YewKxjd2IAq0Hii2-0QxDVQo52wH74";

const sb = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const db = {
  // users
  getUsers:    ()         => sb("pt_users?order=full_name.asc"),
  addUser:     (u)        => sb("pt_users", { method:"POST", body: JSON.stringify(u) }),
  updateUser:  (id, u)    => sb(`pt_users?id=eq.${id}`, { method:"PATCH", body: JSON.stringify(u) }),
  deleteUser:  (id)       => sb(`pt_users?id=eq.${id}`, { method:"DELETE", prefer:"" }),
  loginUser:   (u, p)     => sb(`pt_users?username=eq.${u}&password=eq.${p}&active=eq.true`),
  // master data
  getItems:    ()         => sb("pt_items?active=eq.true&order=id.asc"),
  addItem:     (i)        => sb("pt_items", { method:"POST", body: JSON.stringify(i) }),
  deleteItem:  (id)       => sb(`pt_items?id=eq.${id}`, { method:"PATCH", body: JSON.stringify({ active:false }) }),
  getEmployees:()         => sb("pt_employees?active=eq.true&order=name.asc"),
  addEmployee: (e)        => sb("pt_employees", { method:"POST", body: JSON.stringify(e) }),
  deleteEmployee:(id)     => sb(`pt_employees?id=eq.${id}`, { method:"PATCH", body: JSON.stringify({ active:false }) }),
  getLines:    ()         => sb("pt_lines?active=eq.true&order=id.asc"),
  addLine:     (l)        => sb("pt_lines", { method:"POST", body: JSON.stringify(l) }),
  deleteLine:  (id)       => sb(`pt_lines?id=eq.${id}`, { method:"PATCH", body: JSON.stringify({ active:false }) }),
  // orders
  getOrders:   ()         => sb("pt_orders?order=created_at.desc"),
  addOrder:    (o)        => sb("pt_orders", { method:"POST", body: JSON.stringify(o) }),
  updateOrder: (id, o)    => sb(`pt_orders?id=eq.${id}`, { method:"PATCH", body: JSON.stringify(o) }),
  searchOrder: (num)      => sb(`pt_orders?order_number=eq.${encodeURIComponent(num)}`),
};

// ─── HELPERS ───────────────────────────────────────────────────
const fmt = (dt) => {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-NZ", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit",
  });
};
const nowISO = () => new Date().toISOString();
const getDuration = (s, e) => {
  const ms = new Date(e) - new Date(s);
  return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m ${Math.floor((ms%60000)/1000)}s`;
};
const getElapsed = (s) => {
  const ms = Date.now() - new Date(s);
  return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m (running)`;
};

const STATUS_COLORS = {
  "In Progress": { dot:"#FFC107", bg:"#FFF3CD" },
  Completed:     { dot:"#198754", bg:"#D1E7DD" },
};

// ─── CSV PARSER ────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).slice(1);
  const items=[], employees=[], linesList=[], errors=[];
  lines.forEach((line, i) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g,""));
    const [type, id, name] = cols;
    if (!type||!name) { errors.push(`Row ${i+2}: missing type or name`); return; }
    if (type==="item")     { if(!id){errors.push(`Row ${i+2}: item missing id`);return;} items.push({id,name}); }
    else if (type==="employee") employees.push(name);
    else if (type==="line")     { if(!id){errors.push(`Row ${i+2}: line missing id`);return;} linesList.push({id,name}); }
    else errors.push(`Row ${i+2}: unknown type "${type}"`);
  });
  return { items, employees, lines:linesList, errors };
}
const CSV_TEMPLATE = `type,id,name\nitem,ITM-011,My New Part\nitem,ITM-012,Another Part\nemployee,,John Smith\nline,LINE-09,Night Shift Line`;
function downloadTemplate() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([CSV_TEMPLATE],{type:"text/csv"}));
  a.download = "prodtrack_import_template.csv";
  a.click();
}

// ══════════════════════════════════════════════════════════════
//  GLOBAL STYLES
// ══════════════════════════════════════════════════════════════
const G = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0F1117;}
    ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#1A1D27} ::-webkit-scrollbar-thumb{background:#3A3F55;border-radius:3px}
    .btn-p{background:#00D4AA;color:#0F1117;border:none;padding:10px 22px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;cursor:pointer;border-radius:4px;transition:all .15s}
    .btn-p:hover{background:#00FFCC;transform:translateY(-1px)}
    .btn-p:disabled{opacity:.4;cursor:not-allowed;transform:none}
    .btn-d{background:#FF4B6E;color:#fff;border:none;padding:8px 18px;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .btn-d:hover{background:#FF2D55}
    .btn-g{background:transparent;color:#8B90A8;border:1px solid #2A2F45;padding:8px 18px;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .btn-g:hover{border-color:#00D4AA;color:#00D4AA}
    .btn-w{background:#FF9500;color:#0F1117;border:none;padding:8px 16px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12px;cursor:pointer;border-radius:4px;transition:all .15s}
    .btn-w:hover{background:#FFAC30}
    input,select,textarea{background:#1A1D27;border:1px solid #2A2F45;color:#E8EAF0;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:10px 14px;border-radius:4px;width:100%;outline:none;transition:border .15s}
    input:focus,select:focus,textarea:focus{border-color:#00D4AA}
    input::placeholder{color:#4A4F65} select option{background:#1A1D27}
    label{display:block;font-size:11px;color:#8B90A8;margin-bottom:6px;letter-spacing:1px;text-transform:uppercase}
    .fg{margin-bottom:18px}
    .card{background:#1A1D27;border:1px solid #2A2F45;border-radius:8px;padding:20px}
    .nav-btn{background:none;border:none;font-family:'IBM Plex Mono',monospace;font-size:12px;padding:10px 16px;cursor:pointer;border-radius:4px;transition:all .15s;letter-spacing:.5px;white-space:nowrap}
    .tag{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
    .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
    .modal{background:#1A1D27;border:1px solid #2A2F45;border-radius:10px;padding:28px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto}
    .pill-del{background:none;border:1px solid #3A2030;color:#FF4B6E;font-size:11px;padding:2px 8px;border-radius:12px;cursor:pointer;font-family:'IBM Plex Mono',monospace;transition:all .15s}
    .pill-del:hover{background:#FF4B6E;color:#fff}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    .au{animation:fadeUp .2s ease forwards}
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .ti{animation:toastIn .25s ease}
    tr:hover td{background:#1E2135!important}
  `}</style>
);

// ══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ══════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);

  const handleLogin = async () => {
    if (!username||!password) { setError("Please enter username and password."); return; }
    setLoading(true); setError("");
    try {
      const res = await db.loginUser(username.trim(), password.trim());
      if (res.length===0) { setError("Invalid username or password."); }
      else { onLogin(res[0]); }
    } catch(e) { setError("Connection error. Please try again."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0F1117", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <G/>
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ width:56, height:56, background:"#00D4AA", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, margin:"0 auto 16px" }}>⚙</div>
          <div style={{ fontSize:22, fontWeight:700, color:"#E8EAF0", letterSpacing:2, fontFamily:"'IBM Plex Mono',monospace" }}>PRODTRACK</div>
          <div style={{ fontSize:11, color:"#5A5F78", letterSpacing:3, marginTop:4, fontFamily:"'IBM Plex Mono',monospace" }}>PRODUCTION SCHEDULER</div>
        </div>
        <div className="card">
          <div className="fg">
            <label>Username</label>
            <input placeholder="Enter your username" value={username}
              onChange={e=>setUsername(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()} autoFocus />
          </div>
          <div className="fg">
            <label>Password</label>
            <div style={{ position:"relative" }}>
              <input type={showPw?"text":"password"} placeholder="Enter your password"
                value={password} onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{ paddingRight:44 }} />
              <button onClick={()=>setShowPw(p=>!p)} style={{
                position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", color:"#5A5F78", cursor:"pointer", fontSize:16
              }}>{showPw?"🙈":"👁"}</button>
            </div>
          </div>
          {error && (
            <div style={{ background:"#2A1520", border:"1px solid #FF4B6E44", borderRadius:6, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#FF4B6E" }}>
              ⚠ {error}
            </div>
          )}
          <button className="btn-p" onClick={handleLogin} disabled={loading} style={{ width:"100%", padding:13, fontSize:14 }}>
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </div>
        <div style={{ textAlign:"center", marginTop:20, fontSize:10, color:"#3A3F55", fontFamily:"'IBM Plex Mono',monospace" }}>
          Contact your administrator for access
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  if (!user) return <LoginScreen onLogin={setUser} />;
  return <ProductionScheduler user={user} onLogout={()=>setUser(null)} />;
}

function ProductionScheduler({ user, onLogout }) {
  const isAdmin = user.role === "admin";
  const [view, setView] = useState("dashboard");
  const [orders,    setOrders]    = useState([]);
  const [items,     setItems]     = useState([]);
  const [employees, setEmployees] = useState([]);
  const [lines,     setLines]     = useState([]);
  const [loading,   setLoading]   = useState(true);

  const [newForm, setNewForm] = useState({ employee:"", orderNumber:"", itemId:"", lineId:"", productionQty:"", startDateTime:"" });
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResult, setSearchResult]     = useState(null);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [closeModal, setCloseModal]         = useState(null);
  const [closeForm, setCloseForm]           = useState({ endQty:"", remarks:"" });
  const [filterEmployee, setFilterEmployee] = useState("All");
  const [filterLine, setFilterLine]         = useState("All");
  const [filterStatus, setFilterStatus]     = useState("All");
  const [toast, setToast]                   = useState(null);
  const [saving, setSaving]                 = useState(false);

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  // ── Load data ──
  const loadAll = async () => {
    setLoading(true);
    try {
      const [o,i,e,l] = await Promise.all([db.getOrders(), db.getItems(), db.getEmployees(), db.getLines()]);
      setOrders(o); setItems(i);
      setEmployees(e.map(x=>x.name));
      setLines(l);
    } catch(e) { showToast("Failed to load data: "+e.message,"error"); }
    setLoading(false);
  };
  useEffect(()=>{ loadAll(); },[]);

  // ── New Order ──
  const handleStartOrder = async () => {
    const { employee, orderNumber, itemId, lineId, productionQty } = newForm;
    if (!employee||!orderNumber||!itemId||!lineId||!productionQty) { showToast("Please fill all required fields.","error"); return; }
    const active = orders.find(o=>o.order_number===orderNumber && o.status!=="Completed");
    if (active) { showToast("An active order with this number already exists.","error"); return; }
    setSaving(true);
    try {
      const o = {
        order_number: orderNumber,
        employee,
        item_id: itemId,
        item_name: items.find(i=>i.id===itemId)?.name||"",
        line_id: lineId,
        line_name: lines.find(l=>l.id===lineId)?.name||"",
        production_qty: Number(productionQty),
        start_datetime: newForm.startDateTime ? new Date(newForm.startDateTime).toISOString() : nowISO(),
        status: "In Progress",
        created_by: user.username,
      };
      const res = await db.addOrder(o);
      setOrders(p=>[res[0],...p]);
      setNewForm({ employee:"", orderNumber:"", itemId:"", lineId:"", productionQty:"", startDateTime:"" });
      showToast(`Order ${orderNumber} started!`);
      setView("dashboard");
    } catch(e) { showToast("Failed to save order: "+e.message,"error"); }
    setSaving(false);
  };

  // ── Search ──
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await db.searchOrder(searchQuery.trim());
      if (res.length>0) { setSearchResult(res[0]); setSearchNotFound(false); }
      else              { setSearchResult(null);    setSearchNotFound(true); }
    } catch(e) { showToast("Search failed.","error"); }
  };

  // ── Close Order ──
  const openCloseModal = (order) => { setCloseModal(order); setCloseForm({endQty:"",remarks:""}); };
  const handleCloseOrder = async () => {
    if (!closeForm.endQty) { showToast("Please enter ending quantity.","error"); return; }
    setSaving(true);
    try {
      const patch = { end_datetime: nowISO(), end_qty: Number(closeForm.endQty), remarks: closeForm.remarks, status:"Completed" };
      await db.updateOrder(closeModal.id, patch);
      setOrders(p=>p.map(o=>o.id===closeModal.id?{...o,...patch}:o));
      showToast(`Order ${closeModal.order_number} closed!`);
      setCloseModal(null);
      if (searchResult?.id===closeModal.id) setSearchResult(null);
      setView("records");
    } catch(e) { showToast("Failed to close order: "+e.message,"error"); }
    setSaving(false);
  };

  const filteredOrders = orders.filter(o=>{
    const em = filterEmployee==="All"||o.employee===filterEmployee;
    const lm = filterLine==="All"||o.line_id===filterLine;
    const sm = filterStatus==="All"||o.status===filterStatus;
    return em&&lm&&sm;
  });

  const inProgress = orders.filter(o=>o.status==="In Progress").length;
  const completed  = orders.filter(o=>o.status==="Completed").length;

  const TABS = [
    { id:"dashboard", label:"Dashboard",    show:true },
    { id:"new",       label:"+ New Order",  show:true },
    { id:"search",    label:"Search",       show:true },
    { id:"records",   label:"Records",      show:true },
    { id:"admin",     label:"⚙ Admin",      show:isAdmin },
  ].filter(t=>t.show);

  return (
    <div style={{ fontFamily:"'IBM Plex Mono','Courier New',monospace", background:"#0F1117", minHeight:"100vh", color:"#E8EAF0" }}>
      <G/>
      {/* ── HEADER ── */}
      <div style={{ background:"#13161F", borderBottom:"1px solid #2A2F45", padding:"0 24px" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, gap:8, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:32, height:32, background:"#00D4AA", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚙</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#E8EAF0", letterSpacing:1 }}>PRODTRACK</div>
              <div style={{ fontSize:10, color:"#5A5F78", letterSpacing:2 }}>PRODUCTION SCHEDULER</div>
            </div>
          </div>
          <nav style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
            {TABS.map(tab=>(
              <button key={tab.id} className="nav-btn"
                onClick={()=>{ setView(tab.id); setSearchResult(null); setSearchNotFound(false); }}
                style={{
                  color: view===tab.id?(tab.id==="admin"?"#FF9500":"#00D4AA"):"#8B90A8",
                  background: view===tab.id?(tab.id==="admin"?"rgba(255,149,0,.08)":"rgba(0,212,170,.08)"):"none",
                  borderBottom: view===tab.id?`2px solid ${tab.id==="admin"?"#FF9500":"#00D4AA"}`:"2px solid transparent",
                  borderRadius:"4px 4px 0 0",
                }}>{tab.label}</button>
            ))}
          </nav>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:12, color:"#C8CADC", fontWeight:600 }}>{user.full_name}</div>
              <div style={{ fontSize:10, color: isAdmin?"#FF9500":"#7B8CFF", letterSpacing:1, textTransform:"uppercase" }}>{user.role}</div>
            </div>
            <button className="btn-g" style={{ fontSize:11, padding:"6px 12px" }} onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"28px 24px" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:80, color:"#4A4F65" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
            <div>Loading data…</div>
          </div>
        ) : (
          <>
          {/* ════ DASHBOARD ════ */}
          {view==="dashboard" && (
            <div className="au">
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:28 }}>
                {[
                  { label:"TOTAL ORDERS", val:orders.length,  color:"#7B8CFF", icon:"📋" },
                  { label:"IN PROGRESS",  val:inProgress,     color:"#FFC107", icon:"🔄" },
                  { label:"COMPLETED",    val:completed,      color:"#00D4AA", icon:"✅" },
                ].map(s=>(
                  <div key={s.label} className="card" style={{ display:"flex", alignItems:"center", gap:16 }}>
                    <div style={{ fontSize:28 }}>{s.icon}</div>
                    <div>
                      <div style={{ fontSize:28, fontWeight:700, color:s.color, lineHeight:1 }}>{s.val}</div>
                      <div style={{ fontSize:10, color:"#5A5F78", letterSpacing:2, marginTop:4 }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <h2 style={{ fontSize:13, color:"#8B90A8", letterSpacing:2, textTransform:"uppercase" }}>Active Orders</h2>
                <div style={{ display:"flex", gap:10 }}>
                  <button className="btn-g" style={{ fontSize:11 }} onClick={loadAll}>↻ Refresh</button>
                  <button className="btn-p" onClick={()=>setView("new")}>+ Start New Order</button>
                </div>
              </div>
              {orders.filter(o=>o.status==="In Progress").length===0
                ? <div className="card" style={{ textAlign:"center", padding:48, color:"#4A4F65" }}><div style={{ fontSize:40, marginBottom:12 }}>📭</div><div>No active orders.</div></div>
                : <div style={{ display:"grid", gap:12 }}>{orders.filter(o=>o.status==="In Progress").map(o=><OrderCard key={o.id} order={o} onClose={()=>openCloseModal(o)}/>)}</div>
              }
            </div>
          )}

          {/* ════ NEW ORDER ════ */}
          {view==="new" && (
            <div className="au" style={{ maxWidth:620 }}>
              <h2 style={{ fontSize:13, color:"#8B90A8", letterSpacing:2, textTransform:"uppercase", marginBottom:24 }}>Start New Production Order</h2>
              <div className="card">
                <div className="fg">
                  <label>Employee Name *</label>
                  <select value={newForm.employee} onChange={e=>setNewForm(f=>({...f,employee:e.target.value}))}>
                    <option value="">— Select Employee —</option>
                    {employees.map(e=><option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                  <div className="fg">
                    <label>Order Number *</label>
                    <input placeholder="e.g. ORD-2025-001" value={newForm.orderNumber} onChange={e=>setNewForm(f=>({...f,orderNumber:e.target.value.toUpperCase()}))} />
                  </div>
                  <div className="fg">
                    <label>Production Qty *</label>
                    <input type="number" min="1" placeholder="0" value={newForm.productionQty} onChange={e=>setNewForm(f=>({...f,productionQty:e.target.value}))} />
                  </div>
                </div>
                <div className="fg">
                  <label>Production Line *</label>
                  <select value={newForm.lineId} onChange={e=>setNewForm(f=>({...f,lineId:e.target.value}))}>
                    <option value="">— Select Line —</option>
                    {lines.map(l=><option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Item Number *</label>
                  <select value={newForm.itemId} onChange={e=>setNewForm(f=>({...f,itemId:e.target.value}))}>
                    <option value="">— Select Item —</option>
                    {items.map(i=><option key={i.id} value={i.id}>{i.id} — {i.name}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Start Date & Time</label>
                  <div style={{ display:"flex", gap:10 }}>
                    <input type="datetime-local" value={newForm.startDateTime} onChange={e=>setNewForm(f=>({...f,startDateTime:e.target.value}))} style={{ flex:1 }} />
                    <button className="btn-g" style={{ whiteSpace:"nowrap", padding:"10px 16px" }}
                      onClick={()=>{ const l=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); setNewForm(f=>({...f,startDateTime:l})); }}>
                      📍 Now
                    </button>
                  </div>
                  <div style={{ fontSize:10, color:"#4A4F65", marginTop:6 }}>Leave blank to auto-capture on submit</div>
                </div>
                <div style={{ display:"flex", gap:10, marginTop:8 }}>
                  <button className="btn-p" onClick={handleStartOrder} disabled={saving} style={{ flex:1, padding:12 }}>
                    {saving?"Saving…":"▶ START ORDER"}
                  </button>
                  <button className="btn-g" onClick={()=>setView("dashboard")}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* ════ SEARCH ════ */}
          {view==="search" && (
            <div className="au" style={{ maxWidth:700 }}>
              <h2 style={{ fontSize:13, color:"#8B90A8", letterSpacing:2, textTransform:"uppercase", marginBottom:24 }}>Search Order</h2>
              <div className="card" style={{ marginBottom:20 }}>
                <div style={{ display:"flex", gap:10 }}>
                  <input placeholder="Enter Order Number…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&handleSearch()} />
                  <button className="btn-p" onClick={handleSearch} style={{ whiteSpace:"nowrap" }}>🔍 Search</button>
                </div>
              </div>
              {searchNotFound && <div className="card" style={{ textAlign:"center", color:"#FF4B6E", padding:32 }}><div style={{ fontSize:32, marginBottom:8 }}>🚫</div><div>No order found for <strong>"{searchQuery}"</strong></div></div>}
              {searchResult  && <div className="au"><OrderCard order={searchResult} onClose={searchResult.status==="In Progress"?()=>openCloseModal(searchResult):null} /></div>}
            </div>
          )}

          {/* ════ RECORDS ════ */}
          {view==="records" && (
            <div className="au">
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:10 }}>
                <h2 style={{ fontSize:13, color:"#8B90A8", letterSpacing:2, textTransform:"uppercase" }}>
                  All Records <span style={{ color:"#4A4F65" }}>({filteredOrders.length})</span>
                </h2>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <select value={filterEmployee} onChange={e=>setFilterEmployee(e.target.value)} style={{ width:180 }}>
                    <option value="All">All Employees</option>
                    {employees.map(e=><option key={e} value={e}>{e}</option>)}
                  </select>
                  <select value={filterLine} onChange={e=>setFilterLine(e.target.value)} style={{ width:170 }}>
                    <option value="All">All Lines</option>
                    {lines.map(l=><option key={l.id} value={l.id}>{l.id} — {l.name}</option>)}
                  </select>
                  <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ width:150 }}>
                    <option value="All">All Status</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <button className="btn-g" style={{ fontSize:11 }} onClick={loadAll}>↻ Refresh</button>
                </div>
              </div>
              {filteredOrders.length===0
                ? <div className="card" style={{ textAlign:"center", padding:48, color:"#4A4F65" }}><div style={{ fontSize:40, marginBottom:12 }}>📂</div><div>No records found.</div></div>
                : (
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid #2A2F45" }}>
                          {["Order #","Employee","Line","Item","Plan Qty","End Qty","Start","End","Duration","Status","Remarks","Action"].map(h=>(
                            <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:"#5A5F78", letterSpacing:1, fontWeight:600, fontSize:10, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map(o=>{
                          const sc=STATUS_COLORS[o.status]||{dot:"#6C757D"};
                          const dur=o.end_datetime?getDuration(o.start_datetime,o.end_datetime):"—";
                          return (
                            <tr key={o.id} style={{ borderBottom:"1px solid #1E2135" }}>
                              <td style={{ padding:"11px 12px", color:"#00D4AA", fontWeight:600 }}>{o.order_number}</td>
                              <td style={{ padding:"11px 12px", color:"#C8CADC" }}>{o.employee}</td>
                              <td style={{ padding:"11px 12px", color:"#7B8CFF" }}>
                                <div style={{ fontSize:10, color:"#5A5F78" }}>{o.line_id}</div>
                                <div style={{ whiteSpace:"nowrap" }}>{o.line_name}</div>
                              </td>
                              <td style={{ padding:"11px 12px", color:"#8B90A8" }}>
                                <div style={{ fontSize:10, color:"#5A5F78" }}>{o.item_id}</div>
                                <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:150 }}>{o.item_name}</div>
                              </td>
                              <td style={{ padding:"11px 12px", textAlign:"center" }}>{o.production_qty}</td>
                              <td style={{ padding:"11px 12px", textAlign:"center", color:o.end_qty!=null?"#00D4AA":"#4A4F65" }}>{o.end_qty??  "—"}</td>
                              <td style={{ padding:"11px 12px", color:"#8B90A8", whiteSpace:"nowrap", fontSize:11 }}>{fmt(o.start_datetime)}</td>
                              <td style={{ padding:"11px 12px", color:"#8B90A8", whiteSpace:"nowrap", fontSize:11 }}>{fmt(o.end_datetime)}</td>
                              <td style={{ padding:"11px 12px", color:"#7B8CFF", whiteSpace:"nowrap" }}>{dur}</td>
                              <td style={{ padding:"11px 12px" }}>
                                <span className="tag" style={{ background:sc.bg+"22", color:sc.dot, border:`1px solid ${sc.dot}33` }}>
                                  <span style={{ width:6, height:6, borderRadius:"50%", background:sc.dot, display:"inline-block" }}></span>
                                  {o.status}
                                </span>
                              </td>
                              <td style={{ padding:"11px 12px", color:"#8B90A8", fontSize:11 }}>
                                <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:140 }}>{o.remarks||"—"}</div>
                              </td>
                              <td style={{ padding:"11px 12px" }}>
                                {o.status==="In Progress"&&<button className="btn-d" style={{ fontSize:11, padding:"5px 12px" }} onClick={()=>openCloseModal(o)}>⏹ End</button>}
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

          {/* ════ ADMIN ════ */}
          {view==="admin" && isAdmin && (
            <AdminPanel items={items} setItems={setItems} employees={employees} setEmployees={setEmployees}
              lines={lines} setLines={setLines} showToast={showToast} reload={loadAll} />
          )}
          </>
        )}
      </div>

      {/* ── CLOSE MODAL ── */}
      {closeModal && (
        <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&setCloseModal(null)}>
          <div className="modal au">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <h3 style={{ fontSize:14, color:"#E8EAF0", letterSpacing:1 }}>⏹ CLOSE ORDER</h3>
              <button className="btn-g" style={{ padding:"4px 10px" }} onClick={()=>setCloseModal(null)}>✕</button>
            </div>
            <div style={{ background:"#13161F", borderRadius:6, padding:"12px 16px", marginBottom:20 }}>
              <div style={{ fontSize:18, color:"#00D4AA", fontWeight:700 }}>{closeModal.order_number}</div>
              <div style={{ fontSize:12, color:"#8B90A8", marginTop:4 }}>{closeModal.item_id} — {closeModal.item_name}</div>
              <div style={{ fontSize:11, color:"#5A5F78", marginTop:2 }}>Line: <span style={{ color:"#7B8CFF" }}>{closeModal.line_id} — {closeModal.line_name}</span></div>
              <div style={{ fontSize:11, color:"#5A5F78" }}>Employee: {closeModal.employee}</div>
              <div style={{ fontSize:11, color:"#5A5F78" }}>Planned Qty: <span style={{ color:"#C8CADC" }}>{closeModal.production_qty}</span></div>
            </div>
            <div className="fg">
              <label>End Date & Time (Auto-captured)</label>
              <input value={fmt(nowISO())} readOnly style={{ color:"#00D4AA", cursor:"not-allowed", opacity:.8 }} />
            </div>
            <div className="fg">
              <label>Ending Quantity *</label>
              <input type="number" min="0" placeholder="Enter actual produced quantity" value={closeForm.endQty} onChange={e=>setCloseForm(f=>({...f,endQty:e.target.value}))} autoFocus />
            </div>
            <div className="fg">
              <label>Remarks</label>
              <textarea rows={3} placeholder="Any notes, issues, or observations…" value={closeForm.remarks} onChange={e=>setCloseForm(f=>({...f,remarks:e.target.value}))} />
            </div>
            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <button className="btn-d" style={{ flex:1, padding:12, fontSize:13 }} onClick={handleCloseOrder} disabled={saving}>
                {saving?"Saving…":"⏹ CLOSE ORDER"}
              </button>
              <button className="btn-g" onClick={()=>setCloseModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast&&(
        <div className="ti" style={{
          position:"fixed", bottom:24, right:24,
          background:toast.type==="error"?"#FF4B6E":toast.type==="warn"?"#FF9500":"#00D4AA",
          color:toast.type==="error"?"#fff":"#0F1117",
          padding:"12px 20px", borderRadius:6, fontSize:13, fontWeight:600,
          boxShadow:"0 8px 32px rgba(0,0,0,.4)", zIndex:200, maxWidth:400,
        }}>
          {toast.type==="error"?"⚠ ":toast.type==="warn"?"⚠ ":"✔ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ADMIN PANEL
// ══════════════════════════════════════════════════════════════
function AdminPanel({ items, setItems, employees, setEmployees, lines, setLines, showToast, reload }) {
  const [tab, setTab]           = useState("users");
  const [users, setUsers]       = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [newItem, setNewItem]   = useState({ id:"", name:"" });
  const [newEmp,  setNewEmp]    = useState("");
  const [newLine, setNewLine]   = useState({ id:"", name:"" });
  const [newUser, setNewUser]   = useState({ username:"", password:"", full_name:"", role:"worker" });
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvErrors,  setCsvErrors]  = useState([]);
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef();

  useEffect(()=>{
    db.getUsers().then(u=>{ setUsers(u); setLoadingUsers(false); }).catch(()=>setLoadingUsers(false));
  },[]);

  // Users
  const handleAddUser = async () => {
    const { username, password, full_name, role } = newUser;
    if (!username||!password||!full_name) { showToast("All user fields required.","error"); return; }
    setSaving(true);
    try {
      const res = await db.addUser({ username:username.trim().toLowerCase(), password:password.trim(), full_name:full_name.trim(), role });
      setUsers(p=>[...p, res[0]]);
      setNewUser({ username:"", password:"", full_name:"", role:"worker" });
      showToast("User added.");
    } catch(e) { showToast("Failed: "+e.message,"error"); }
    setSaving(false);
  };
  const handleToggleUser = async (u) => {
    try {
      await db.updateUser(u.id, { active:!u.active });
      setUsers(p=>p.map(x=>x.id===u.id?{...x,active:!x.active}:x));
      showToast(u.active?"User deactivated.":"User activated.");
    } catch(e) { showToast("Failed.","error"); }
  };
  const handleResetPw = async (u, pw) => {
    if (!pw) return;
    try {
      await db.updateUser(u.id, { password:pw });
      showToast(`Password updated for ${u.username}.`);
    } catch(e) { showToast("Failed.","error"); }
  };

  // Items
  const handleAddItem = async () => {
    if (!newItem.id.trim()||!newItem.name.trim()) { showToast("ID and Name required.","error"); return; }
    if (items.find(i=>i.id===newItem.id.trim())) { showToast("Item ID already exists.","error"); return; }
    setSaving(true);
    try {
      await db.addItem({ id:newItem.id.trim().toUpperCase(), name:newItem.name.trim() });
      setItems(p=>[...p,{ id:newItem.id.trim().toUpperCase(), name:newItem.name.trim() }]);
      setNewItem({ id:"", name:"" }); showToast("Item added.");
    } catch(e) { showToast("Failed: "+e.message,"error"); }
    setSaving(false);
  };
  const handleDelItem = async (id) => {
    try { await db.deleteItem(id); setItems(p=>p.filter(i=>i.id!==id)); showToast("Item removed."); }
    catch(e) { showToast("Failed.","error"); }
  };

  // Employees
  const handleAddEmp = async () => {
    if (!newEmp.trim()) { showToast("Name required.","error"); return; }
    if (employees.includes(newEmp.trim())) { showToast("Employee already exists.","error"); return; }
    setSaving(true);
    try {
      await db.addEmployee({ name:newEmp.trim() });
      setEmployees(p=>[...p,newEmp.trim()]); setNewEmp(""); showToast("Employee added.");
    } catch(e) { showToast("Failed: "+e.message,"error"); }
    setSaving(false);
  };
  const handleDelEmp = async (name) => {
    try {
      const all = await db.getEmployees();
      const rec = all.find(e=>e.name===name);
      if (rec) await db.deleteEmployee(rec.id);
      setEmployees(p=>p.filter(e=>e!==name)); showToast("Employee removed.");
    } catch(e) { showToast("Failed.","error"); }
  };

  // Lines
  const handleAddLine = async () => {
    if (!newLine.id.trim()||!newLine.name.trim()) { showToast("ID and Name required.","error"); return; }
    if (lines.find(l=>l.id===newLine.id.trim())) { showToast("Line ID already exists.","error"); return; }
    setSaving(true);
    try {
      await db.addLine({ id:newLine.id.trim().toUpperCase(), name:newLine.name.trim() });
      setLines(p=>[...p,{ id:newLine.id.trim().toUpperCase(), name:newLine.name.trim() }]);
      setNewLine({ id:"", name:"" }); showToast("Line added.");
    } catch(e) { showToast("Failed: "+e.message,"error"); }
    setSaving(false);
  };
  const handleDelLine = async (id) => {
    try { await db.deleteLine(id); setLines(p=>p.filter(l=>l.id!==id)); showToast("Line removed."); }
    catch(e) { showToast("Failed.","error"); }
  };

  // CSV
  const handleFile = (e) => {
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader();
    r.onload=(ev)=>{ const res=parseCSV(ev.target.result); setCsvPreview(res); setCsvErrors(res.errors); };
    r.readAsText(file); e.target.value="";
  };
  const applyImport = async () => {
    if (!csvPreview) return;
    setSaving(true);
    try {
      for (const i of csvPreview.items) { try { await db.addItem(i); } catch{} }
      for (const e of csvPreview.employees) { try { await db.addEmployee({ name:e }); } catch{} }
      for (const l of csvPreview.lines) { try { await db.addLine(l); } catch{} }
      await reload(); setCsvPreview(null);
      showToast(`Imported: ${csvPreview.items.length} items, ${csvPreview.employees.length} employees, ${csvPreview.lines.length} lines.`);
    } catch(e) { showToast("Import failed: "+e.message,"error"); }
    setSaving(false);
  };

  const ATABS = [
    { id:"users",     label:`👥 Users (${users.length})` },
    { id:"items",     label:`📦 Items (${items.length})` },
    { id:"employees", label:`👤 Employees (${employees.length})` },
    { id:"lines",     label:`🏭 Lines (${lines.length})` },
    { id:"import",    label:"⬆ CSV Import" },
  ];

  return (
    <div className="au">
      <h2 style={{ fontSize:13, color:"#FF9500", letterSpacing:2, textTransform:"uppercase", marginBottom:20 }}>⚙ Admin — Manage Master Data</h2>
      <div style={{ display:"flex", gap:0, borderBottom:"1px solid #2A2F45", marginBottom:24, flexWrap:"wrap" }}>
        {ATABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:"none", border:"none", fontFamily:"'IBM Plex Mono',monospace", fontSize:12,
            padding:"8px 16px", cursor:"pointer", borderRadius:"4px 4px 0 0",
            color:tab===t.id?"#FF9500":"#8B90A8",
            borderBottom:tab===t.id?"2px solid #FF9500":"2px solid transparent",
            fontWeight:tab===t.id?700:400, whiteSpace:"nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── USERS ── */}
      {tab==="users" && (
        <div style={{ maxWidth:700 }}>
          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, color:"#FF9500", letterSpacing:1, marginBottom:14, textTransform:"uppercase" }}>Add New User</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <div><label>Username *</label><input placeholder="e.g. jsmith" value={newUser.username} onChange={e=>setNewUser(f=>({...f,username:e.target.value}))}/></div>
              <div><label>Password *</label><input type="password" placeholder="Set password" value={newUser.password} onChange={e=>setNewUser(f=>({...f,password:e.target.value}))}/></div>
              <div><label>Full Name *</label><input placeholder="John Smith" value={newUser.full_name} onChange={e=>setNewUser(f=>({...f,full_name:e.target.value}))}/></div>
              <div><label>Role *</label>
                <select value={newUser.role} onChange={e=>setNewUser(f=>({...f,role:e.target.value}))}>
                  <option value="worker">Worker</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button className="btn-w" onClick={handleAddUser} disabled={saving}>+ Add User</button>
          </div>
          <div className="card">
            <div style={{ fontSize:11, color:"#FF9500", letterSpacing:1, marginBottom:14, textTransform:"uppercase" }}>All Users ({users.length})</div>
            {loadingUsers ? <div style={{ color:"#4A4F65" }}>Loading…</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {users.map(u=>(
                  <UserRow key={u.id} u={u} onToggle={()=>handleToggleUser(u)} onResetPw={(pw)=>handleResetPw(u,pw)} showToast={showToast} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ITEMS ── */}
      {tab==="items" && (
        <div style={{ maxWidth:640 }}>
          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, color:"#FF9500", letterSpacing:1, marginBottom:12, textTransform:"uppercase" }}>Add New Item</div>
            <div style={{ display:"grid", gridTemplateColumns:"160px 1fr auto", gap:10, alignItems:"end" }}>
              <div><label>Item ID</label><input placeholder="ITM-011" value={newItem.id} onChange={e=>setNewItem(f=>({...f,id:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAddItem()}/></div>
              <div><label>Item Name</label><input placeholder="Part description" value={newItem.name} onChange={e=>setNewItem(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAddItem()}/></div>
              <button className="btn-p" onClick={handleAddItem} disabled={saving} style={{ padding:"10px 20px" }}>+ Add</button>
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize:11, color:"#FF9500", letterSpacing:1, marginBottom:14, textTransform:"uppercase" }}>Current Items ({items.length})</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:360, overflowY:"auto" }}>
              {items.map(i=>(
                <div key={i.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#13161F", padding:"8px 14px", borderRadius:6 }}>
                  <div><span style={{ color:"#00D4AA", fontWeight:600, marginRight:12 }}>{i.id}</span><span style={{ color:"#C8CADC", fontSize:12 }}>{i.name}</span></div>
                  <button className="pill-del" onClick={()=>handleDelItem(i.id)}>✕ Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EMPLOYEES ── */}
      {tab==="employees" && (
        <div style={{ maxWidth:520 }}>
          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, color:"#FF9500", letterSpacing:1, marginBottom:12, textTransform:"uppercase" }}>Add Employee</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end" }}>
              <div><label>Full Name</label><input placeholder="First Last" value={newEmp} onChange={e=>setNewEmp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddEmp()}/></div>
              <button className="btn-p" onClick={handleAddEmp} disabled={saving} style={{ padding:"10px 20px" }}>+ Add</button>
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize:11, color:"#FF9500", letterSpacing:1, marginBottom:14, textTransform:"uppercase" }}>Employees ({employees.length})</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:360, overflowY:"auto" }}>
              {employees.map(e=>(
                <div key={e} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#13161F", padding:"8px 14px", borderRadius:6 }}>
                  <span style={{ color:"#C8CADC", fontSize:12 }}>👤 {e}</span>
                  <button className="pill-del" onClick={()=>handleDelEmp(e)}>✕ Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LINES ── */}
      {tab==="lines" && (
        <div style={{ maxWidth:640 }}>
          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, color:"#FF9500", letterSpacing:1, marginBottom:12, textTransform:"uppercase" }}>Add Production Line</div>
            <div style={{ display:"grid", gridTemplateColumns:"160px 1fr auto", gap:10, alignItems:"end" }}>
              <div><label>Line ID</label><input placeholder="LINE-09" value={newLine.id} onChange={e=>setNewLine(f=>({...f,id:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAddLine()}/></div>
              <div><label>Line Name</label><input placeholder="e.g. Night Shift Line" value={newLine.name} onChange={e=>setNewLine(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAddLine()}/></div>
              <button className="btn-p" onClick={handleAddLine} disabled={saving} style={{ padding:"10px 20px" }}>+ Add</button>
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize:11, color:"#FF9500", letterSpacing:1, marginBottom:14, textTransform:"uppercase" }}>Lines ({lines.length})</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:360, overflowY:"auto" }}>
              {lines.map(l=>(
                <div key={l.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#13161F", padding:"8px 14px", borderRadius:6 }}>
                  <div><span style={{ color:"#7B8CFF", fontWeight:600, marginRight:12 }}>{l.id}</span><span style={{ color:"#C8CADC", fontSize:12 }}>{l.name}</span></div>
                  <button className="pill-del" onClick={()=>handleDelLine(l.id)}>✕ Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CSV IMPORT ── */}
      {tab==="import" && (
        <div style={{ maxWidth:700 }}>
          <div className="card" style={{ marginBottom:20, borderColor:"#2A3545" }}>
            <div style={{ fontSize:13, color:"#FF9500", fontWeight:700, marginBottom:12 }}>📋 CSV Import Instructions</div>
            <div style={{ fontSize:12, color:"#8B90A8", lineHeight:1.8 }}>
              Three columns: <span style={{ color:"#00D4AA" }}>type</span>, <span style={{ color:"#00D4AA" }}>id</span>, <span style={{ color:"#00D4AA" }}>name</span><br/>
              • type = <code style={{ color:"#7B8CFF" }}>item</code> | <code style={{ color:"#7B8CFF" }}>employee</code> | <code style={{ color:"#7B8CFF" }}>line</code><br/>
              • id = required for items &amp; lines; leave blank for employees
            </div>
            <div style={{ background:"#0F1117", borderRadius:6, padding:"12px 16px", marginTop:14, fontSize:11, color:"#5A8A7A", lineHeight:1.7 }}>
              type,id,name<br/>item,ITM-011,My New Part<br/>employee,,John Smith<br/>line,LINE-09,Night Shift Line
            </div>
            <button className="btn-g" style={{ marginTop:14 }} onClick={downloadTemplate}>⬇ Download Template</button>
          </div>
          <div className="card" style={{ marginBottom:20 }}>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={handleFile} />
            <button className="btn-w" onClick={()=>fileRef.current.click()}>⬆ Choose CSV File</button>
          </div>
          {csvErrors.length>0&&(
            <div className="card" style={{ marginBottom:20, borderColor:"#FF4B6E44" }}>
              <div style={{ fontSize:12, color:"#FF4B6E", marginBottom:8, fontWeight:700 }}>⚠ Parse Warnings</div>
              {csvErrors.map((e,i)=><div key={i} style={{ fontSize:11, color:"#FF9090", marginBottom:4 }}>• {e}</div>)}
            </div>
          )}
          {csvPreview&&(
            <div className="card au" style={{ borderColor:"#00D4AA44" }}>
              <div style={{ fontSize:13, color:"#00D4AA", fontWeight:700, marginBottom:16 }}>✔ Preview — Ready to Import</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:20 }}>
                {[["Items",csvPreview.items.length,"#00D4AA"],["Employees",csvPreview.employees.length,"#7B8CFF"],["Lines",csvPreview.lines.length,"#FF9500"]].map(([l,v,c])=>(
                  <div key={l} style={{ background:"#13161F", padding:"12px 16px", borderRadius:6 }}>
                    <div style={{ fontSize:22, fontWeight:700, color:c }}>{v}</div>
                    <div style={{ fontSize:10, color:"#5A5F78", letterSpacing:1, marginTop:4 }}>{l} Found</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button className="btn-p" onClick={applyImport} disabled={saving} style={{ flex:1 }}>
                  {saving?"Importing…":"➕ Import (Append)"}
                </button>
                <button className="btn-g" onClick={()=>setCsvPreview(null)}>Cancel</button>
              </div>
              <div style={{ fontSize:10, color:"#4A4F65", marginTop:10 }}>Duplicate IDs/names are skipped automatically.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── USER ROW with inline password reset ──
function UserRow({ u, onToggle, onResetPw }) {
  const [pw, setPw]       = useState("");
  const [show, setShow]   = useState(false);
  return (
    <div style={{ background:"#13161F", padding:"10px 14px", borderRadius:6, border:"1px solid #2A2F45" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div>
          <span style={{ color:"#C8CADC", fontWeight:600, marginRight:10 }}>{u.full_name}</span>
          <span style={{ color:"#5A5F78", fontSize:11, marginRight:10 }}>@{u.username}</span>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:12, background: u.role==="admin"?"rgba(255,149,0,.15)":"rgba(123,140,255,.15)", color: u.role==="admin"?"#FF9500":"#7B8CFF", fontWeight:600 }}>{u.role}</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={()=>setShow(s=>!s)} style={{ background:"none", border:"1px solid #2A2F45", color:"#8B90A8", fontSize:11, padding:"3px 10px", borderRadius:4, cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace" }}>
            🔑 Reset PW
          </button>
          <button className="pill-del" style={{ borderColor: u.active?"#3A2030":"#1A3020", color: u.active?"#FF4B6E":"#198754" }} onClick={onToggle}>
            {u.active?"Deactivate":"Activate"}
          </button>
          {!u.active&&<span style={{ fontSize:10, color:"#FF4B6E" }}>INACTIVE</span>}
        </div>
      </div>
      {show&&(
        <div style={{ display:"flex", gap:8, marginTop:10, alignItems:"center" }}>
          <input type="password" placeholder="New password" value={pw} onChange={e=>setPw(e.target.value)} style={{ flex:1, fontSize:12, padding:"7px 12px" }} />
          <button className="btn-w" style={{ fontSize:11, padding:"7px 14px" }} onClick={()=>{ onResetPw(pw); setPw(""); setShow(false); }}>Save</button>
          <button className="btn-g" style={{ fontSize:11, padding:"7px 12px" }} onClick={()=>setShow(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── ORDER CARD ──
function OrderCard({ order, onClose }) {
  const sc = STATUS_COLORS[order.status]||{dot:"#6C757D",bg:"#E2E3E5"};
  const duration = order.end_datetime ? getDuration(order.start_datetime,order.end_datetime) : getElapsed(order.start_datetime);
  return (
    <div style={{ background:"#1A1D27", border:"1px solid #2A2F45", borderRadius:8, padding:"18px 20px", borderLeft:`3px solid ${sc.dot}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
            <span style={{ fontSize:18, fontWeight:700, color:"#00D4AA" }}>{order.order_number}</span>
            <span className="tag" style={{ background:sc.bg+"22", color:sc.dot, border:`1px solid ${sc.dot}33` }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:sc.dot, display:"inline-block" }}></span>
              {order.status}
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"6px 24px" }}>
            {[
              ["Employee", order.employee],
              ["Line", `${order.line_id} — ${order.line_name}`],
              ["Item", `${order.item_id} — ${order.item_name}`],
              ["Plan Qty", order.production_qty],
              ["Started", fmt(order.start_datetime)],
              ...(order.status==="Completed"
                ? [["Ended",fmt(order.end_datetime)],["End Qty",order.end_qty],["Duration",getDuration(order.start_datetime,order.end_datetime)],["Remarks",order.remarks||"—"]]
                : [["Elapsed",duration]])
            ].map(([k,v])=>(
              <div key={k}>
                <div style={{ fontSize:9, color:"#5A5F78", letterSpacing:1, textTransform:"uppercase" }}>{k}</div>
                <div style={{ fontSize:12, color:"#C8CADC", marginTop:2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {onClose&&<button className="btn-d" onClick={onClose} style={{ alignSelf:"flex-start" }}>⏹ End Order</button>}
      </div>
    </div>
  );
}
