/* Hotel Portal Norte 170 — panel de administración */
(() => {
const TOKEN_KEY = "pn170_admin_token";
const S = {hotel:null, rooms:[], guests:[], res:[], reqs:[], loaded:false, token:null,
  tab:"panel", calStart:null, eng:null};

/* ---------- API ---------- */
async function api(method, path, body, raw){
  const headers = {};
  if(S.token) headers.Authorization = "Bearer " + S.token;
  let payload;
  if(raw){ headers["Content-Type"] = raw.type || "image/jpeg"; payload = raw; }
  else if(body !== undefined){ headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let r;
  try{ r = await fetch("/api/" + path, {method, headers, body: payload}); }
  catch(_){ throw new Error("Sin conexión con el servidor. Revisa tu internet."); }
  if(r.status === 401 && path !== "login"){ logout("Tu sesión venció. Vuelve a ingresar."); throw new Error("Sesión vencida."); }
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(j.error || ("Error " + r.status)), {status:r.status});
  return j;
}
const ARR = {reservations:"res", guests:"guests", rooms:"rooms", requests:"reqs"};
function upsert(arr, rec){const i=S[arr].findIndex(x=>x.id===rec.id); if(i>=0) S[arr][i]=rec; else S[arr].push(rec);}
async function save(path, data, merge){
  const [kind, id] = path.split("/");
  let rec;
  try{
    if(kind === "hotel"){ rec = await api("PUT","admin/hotel", merge ? Object.assign({}, S.hotel, data) : data); S.hotel = rec; }
    else if(kind === "requests"){ rec = await api("PATCH","admin/requests/"+encodeURIComponent(id), data); upsert("reqs", rec); }
    else {
      const arr = ARR[kind]; const cur = S[arr].find(x=>x.id===id) || {};
      const body = merge ? Object.assign({}, cur, data) : Object.assign({}, data);
      delete body.id;
      rec = await api("PUT", `admin/${kind}/${encodeURIComponent(id)}`, body); upsert(arr, rec);
    }
  }catch(e){ toast(e.message || "No se pudo guardar."); throw e; }
  render(); return rec;
}
async function del(path){
  const [kind, id] = path.split("/");
  await api("DELETE", `admin/${kind}/${encodeURIComponent(id)}`);
  const arr = ARR[kind]; S[arr] = S[arr].filter(x=>x.id!==id); render();
}
async function loadState(){
  try{
    const j = await api("GET","admin/state");
    S.hotel=j.hotel; S.rooms=j.rooms||[]; S.guests=j.guests||[]; S.res=(j.reservations||[]).filter(r=>r.checkIn&&r.checkOut); S.reqs=j.requests||[];
    S.loaded=true; setSync("on","Actualizado " + new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}));
    render();
  }catch(e){ if(S.token) setSync("off", e.message || "Sin conexión"); }
}
function setSync(state,txt){const s=$("#sync");s.className="sync "+state;s.querySelector("span").textContent=txt;}

/* ---------- sesión ---------- */
function logout(msg){
  S.token=null; try{localStorage.removeItem(TOKEN_KEY);}catch(_){}
  $("#app").hidden=true; $("#login").hidden=false; closeModal(); document.body.classList.add("is-login");
  const e=$("#loginErr"); if(msg){e.textContent=msg;e.hidden=false;}else e.hidden=true;
  $("#pw").value=""; try{$("#pw").focus();}catch(_){}
}
function startApp(){ document.body.classList.remove("is-login"); $("#login").hidden=true; $("#app").hidden=false; setTab(S.tab); loadState(); }
$("#loginForm").addEventListener("submit", async e=>{
  e.preventDefault(); const btn=$("#loginBtn"); btn.disabled=true; btn.textContent="Ingresando…"; $("#loginErr").hidden=true;
  try{
    const j = await api("POST","login",{password:$("#pw").value});
    S.token=j.token; try{localStorage.setItem(TOKEN_KEY,JSON.stringify({t:j.token,exp:j.exp}));}catch(_){}
    startApp();
  }catch(err){ $("#loginErr").textContent=err.message; $("#loginErr").hidden=false; }
  btn.disabled=false; btn.textContent="Ingresar";
});
$("#logout").onclick=()=>logout();
$("#backup").onclick=async()=>{
  try{
    const j=await api("GET","admin/state");
    const blob=new Blob([JSON.stringify(j,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`respaldo-portal-norte-170-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
    toast("Respaldo descargado");
  }catch(e){toast(e.message);}
};

/* ---------- helpers de dominio ---------- */
const roomById = id => S.rooms.find(r=>r.id===id);
const guestById = id => S.guests.find(g=>g.id===id);
const gName = g => g ? ((g.first||"")+" "+(g.last||"")).trim() || "Sin nombre" : "Huésped sin ficha";
const resGuest = r => guestById(r.guestId) ? gName(guestById(r.guestId)) : (r.guestName || "Huésped sin ficha");
const active = r => r.status !== "cancelada";
const nights = r => Math.max(0, diff(r.checkIn, r.checkOut));
const balance = r => (Number(r.total)||0) - (Number(r.paid)||0);
const sortRooms = () => S.rooms.slice().sort((a,b)=>String(a.number).localeCompare(String(b.number),"es",{numeric:true}));
function conflicts(roomId,a,b,exceptId){return S.res.filter(r=>r.roomId===roomId && active(r) && r.id!==exceptId && r.checkIn < b && a < r.checkOut);}
function tra(g){const need=["first","last","docType","docNumber","nationality","birth","phone","city"];const miss=need.filter(k=>!g[k]);return {ok:miss.length===0 && !!g.consent, miss};}

/* ---------- pestañas ---------- */
$("#tabs").addEventListener("click", e=>{const b=e.target.closest("button[data-t]");if(b)setTab(b.dataset.t);});
function setTab(t){S.tab=t;document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.t===t));
  document.querySelectorAll("section.tab").forEach(s=>s.hidden = s.id!=="t-"+t);
  try{localStorage.setItem("pn170tab",t);}catch(_){}
  render();}
document.addEventListener("click", e=>{
  const a=e.target.closest("[data-act]"); if(a){const act=a.dataset.act;
    if(act==="newRes") openResForm({}); if(act==="newGuest") openGuestForm({}); if(act==="newRoom") openRoomForm({}); if(act==="editHotel") openHotelForm(); return;}
  const o=e.target.closest("[data-open]"); if(o){openResDetail(o.dataset.open);return;}
  const ci=e.target.closest("[data-ci]"); if(ci){doCheckIn(ci.dataset.ci);return;}
  const co=e.target.closest("[data-co]"); if(co){doCheckOut(co.dataset.co);return;}
});

/* ---------- render ---------- */
function render(){
  if($("#app").hidden) return;
  $("#cRes").textContent = S.res.filter(r=>active(r) && r.checkOut>=todayISO()).length || "";
  $("#cSol").textContent = S.reqs.filter(x=>x.status==="nueva").length || "";
  $("#cGu").textContent = S.guests.length || "";
  $("#cRo").textContent = S.rooms.length || "";
  if(S.hotel){ $("#hName").innerHTML = nameHTML(S.hotel.name||"Portal Norte 170"); $("#hAddr").textContent = (S.hotel.address||"") + (S.hotel.zone? " · "+S.hotel.zone : ""); }
  ({panel:renderPanel,cal:renderCal,motor:renderEngineOptions,res:renderRes,sol:renderSol,hues:renderGuests,hab:renderRooms,aloj:renderHotel}[S.tab]||(()=>{}))();
}
function liRes(r, actions){
  const ro = roomById(r.roomId);
  return `<div class="li"><div class="who"><b>${esc(resGuest(r))}</b>
    <small>Hab. ${esc(ro?ro.number:"?")} · ${fd(r.checkIn)} → ${fd(r.checkOut)} · <span class="ch" style="--c:${chan(r.channel).c}">${esc(chan(r.channel).n)}</span></small></div>
    <div class="grp" style="gap:6px">${actions||""}<button class="btn sm" data-open="${esc(r.id)}">Ver</button></div></div>`;
}
function renderPanel(){
  const t = todayISO();
  $("#todayLbl").textContent = new Intl.DateTimeFormat("es-CO",{timeZone:"America/Bogota",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
  const act = S.res.filter(active);
  const inHouse = act.filter(r=>r.checkIn<=t && r.checkOut>t);
  const arr = act.filter(r=>r.checkIn===t), dep = act.filter(r=>r.checkOut===t);
  const month = t.slice(0,7);
  const monthRev = act.filter(r=>r.checkIn.slice(0,7)===month).reduce((s,r)=>s+(Number(r.total)||0),0);
  const debt = act.filter(r=>balance(r)>0 && r.checkIn<=addDays(t,7)).reduce((s,r)=>s+balance(r),0);
  const nRooms = S.rooms.length || 10, occ = inHouse.length;
  $("#kpis").innerHTML = `
    <div class="kpi"><span class="eyebrow">Ocupación hoy</span><b class="num">${occ}/${nRooms}</b><small>${Math.round(occ/nRooms*100)||0}% de las habitaciones</small></div>
    <div class="kpi"><span class="eyebrow">Llegadas</span><b class="num">${arr.length}</b><small>check-in ${esc(S.hotel?.checkinFrom||"15:00")}–${esc(S.hotel?.checkinTo||"18:00")}</small></div>
    <div class="kpi"><span class="eyebrow">Salidas</span><b class="num">${dep.length}</b><small>check-out antes de ${esc(S.hotel?.checkout||"11:00")}</small></div>
    <div class="kpi"><span class="eyebrow">Ventas del mes</span><b class="num" style="font-size:1.3rem">${cop(monthRev)}</b><small>reservas que entran este mes</small></div>
    <div class="kpi"><span class="eyebrow">Solicitudes nuevas</span><b class="num">${S.reqs.filter(x=>x.status==="nueva").length}</b><small>desde el sitio web</small></div>
    <div class="kpi"><span class="eyebrow">Saldo por cobrar</span><b class="num" style="font-size:1.3rem">${cop(debt)}</b><small>estancias hasta 7 días</small></div>`;
  const ciBtn = r => r.status==="encasa"?'':`<button class="btn sm primary" data-ci="${esc(r.id)}">Check-in</button>`;
  const coBtn = r => r.status==="finalizada"?'':`<button class="btn sm" data-co="${esc(r.id)}">Check-out</button>`;
  $("#arr").innerHTML = arr.map(r=>liRes(r,ciBtn(r))).join("") || `<div class="empty">No hay llegadas programadas para hoy.</div>`;
  $("#dep").innerHTML = dep.map(r=>liRes(r,coBtn(r))).join("") || `<div class="empty">No hay salidas programadas para hoy.</div>`;
  $("#inh").innerHTML = inHouse.map(r=>liRes(r,"")).join("") || `<div class="empty">No hay huéspedes alojados esta noche.</div>`;
  const nx = act.filter(r=>r.checkIn>t && r.checkIn<=addDays(t,7)).sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
  $("#next").innerHTML = nx.map(r=>liRes(r,"")).join("") || `<div class="empty">Sin llegadas en los próximos 7 días.</div>`;
  let bars="";
  for(let i=0;i<14;i++){const d=addDays(t,i);const n=act.filter(r=>r.checkIn<=d && r.checkOut>d).length;
    bars+=`<div class="c ${[0,6].includes(dow(d))?"we":""}" title="${fd(d,{weekday:"long"})}: ${n} ocupadas"><em>${n||""}</em><i style="height:${Math.round(n/nRooms*80)}%"></i><small>${Number(d.slice(8))}</small></div>`;}
  $("#occ").innerHTML = bars;
}

/* ---------- calendario ---------- */
const NDAYS = 21;
$("#calPrev").onclick=()=>{S.calStart=addDays(S.calStart,-7);renderCal();};
$("#calNext").onclick=()=>{S.calStart=addDays(S.calStart,7);renderCal();};
$("#calToday").onclick=()=>{S.calStart=addDays(todayISO(),-1);renderCal();};
$("#calStart").onchange=e=>{if(e.target.value){S.calStart=e.target.value;renderCal();}};
function renderCal(){
  if(!S.calStart) S.calStart = addDays(todayISO(),-1);
  $("#calStart").value = S.calStart;
  const t=todayISO(), days=[...Array(NDAYS)].map((_,i)=>addDays(S.calStart,i)), end=addDays(S.calStart,NDAYS);
  let h=`<div class="calrow calhead" style="--n:${NDAYS}"><div class="rh"><small>Habitación</small></div>`;
  days.forEach((d,i)=>{h+=`<div class="dh ${[0,6].includes(dow(d))?"we":""} ${d===t?"today":""}" style="grid-column:${i+2}">${new Intl.DateTimeFormat("es-CO",{timeZone:"UTC",weekday:"short"}).format(new Date(d+"T00:00:00Z")).replace(".","")}<b>${Number(d.slice(8))}</b>${d.slice(8)==="01"||i===0?fd(d,{day:undefined,month:"short"}):""}</div>`;});
  h+=`</div>`;
  const rooms = sortRooms();
  if(!rooms.length) h += `<div class="empty" style="padding:16px">${S.loaded?"Aún no hay habitaciones registradas.":"Cargando habitaciones…"}</div>`;
  rooms.forEach(ro=>{
    const blocked = ro.status==="mantenimiento";
    h+=`<div class="calrow" style="--n:${NDAYS}"><div class="rh"><b>${esc(ro.number)} · ${esc(ro.type||"")}</b><small>${esc(ro.beds||"")} · ${ro.capacity||"?"} pers.${blocked?" · mantenimiento":""}</small></div>`;
    days.forEach((d,i)=>{h+=`<div class="cell ${[0,6].includes(dow(d))?"we":""} ${blocked?"blocked":""}" style="grid-column:${i+2}" ${blocked?"":`data-cell="${esc(ro.id)}|${d}"`} title="${esc(ro.number)} · ${fd(d,{weekday:"long"})}"></div>`;});
    S.res.filter(r=>r.roomId===ro.id && active(r) && r.checkIn<end && r.checkOut>S.calStart).forEach(r=>{
      const s=Math.max(0,diff(S.calStart,r.checkIn)), e=Math.min(NDAYS,diff(S.calStart,r.checkOut));
      if(e<=s) return;
      h+=`<div class="bar ${r.status==="pendiente"?"pend":""} ${r.status==="finalizada"?"done":""} ${r.checkIn<S.calStart?"cut-l":""}" style="grid-column:${s+2}/${e+2};--c:${chan(r.channel).c}" data-open="${esc(r.id)}" title="${esc(resGuest(r))} · ${fd(r.checkIn)}–${fd(r.checkOut)}"><b>${esc(resGuest(r))}</b>${esc(STATUS[r.status]?.n||"")} · ${nights(r)} n</div>`;
    });
    h+=`</div>`;
  });
  $("#cal").innerHTML=h;
  $("#legend").innerHTML = CHANNELS.map(c=>`<span class="ch" style="--c:${c.c}">${c.n}</span>`).join("") + `<span>Borde punteado = pendiente de confirmar</span>`;
}
$("#cal").addEventListener("click",e=>{const c=e.target.closest("[data-cell]");if(!c)return;const [rid,d]=c.dataset.cell.split("|");openResForm({roomId:rid,checkIn:d,checkOut:addDays(d,1)});});

/* ---------- motor ---------- */
function initEngine(){const t=todayISO();$("#eIn").value=t;$("#eOut").value=addDays(t,1);}
function renderEngineOptions(){
  const types=[...new Set(S.rooms.map(r=>r.type).filter(Boolean))];
  const sel=$("#eType"), cur=sel.value;
  sel.innerHTML=`<option value="">Cualquiera</option>`+types.map(t=>`<option ${t===cur?"selected":""}>${esc(t)}</option>`).join("");
  if(S.eng) runEngine();
}
$("#eIn").addEventListener("change",()=>{if($("#eOut").value<=$("#eIn").value)$("#eOut").value=addDays($("#eIn").value,1);});
$("#engForm").addEventListener("submit",e=>{e.preventDefault();S.eng={in:$("#eIn").value,out:$("#eOut").value,ad:+$("#eAd").value||1,ch:+$("#eCh").value||0,type:$("#eType").value};runEngine();});
function runEngine(){
  const q=S.eng, box=$("#engRes");
  if(!q.in||!q.out||q.out<=q.in){box.innerHTML=`<div class="note bad">La fecha de salida debe ser posterior a la de entrada.</div>`;return;}
  const n=diff(q.in,q.out), pax=q.ad+q.ch;
  const fits=sortRooms().filter(r=>!q.type||r.type===q.type).filter(r=>(Number(r.capacity)||1)>=pax && r.status!=="mantenimiento");
  const free=fits.filter(r=>conflicts(r.id,q.in,q.out).length===0);
  const head=`<div class="toolbar"><div><b>${free.length} de ${S.rooms.length} habitaciones disponibles</b> <span class="muted">· ${fd(q.in,{weekday:"short"})} → ${fd(q.out,{weekday:"short"})} · ${n} noche${n>1?"s":""} · ${pax} persona${pax>1?"s":""}</span></div></div>`;
  if(!free.length){box.innerHTML=head+`<div class="note warn">No hay habitaciones libres para esas fechas y ocupación.</div>`;return;}
  box.innerHTML=head+free.map(r=>{const cov=(r.photos||[])[0];const rate=Number(r.rate)||0;return `
    <div class="offer"><div class="th">${cov?`<img src="${photoUrl(cov)}" alt="Habitación ${esc(r.number)}" loading="lazy">`:`<span>${esc(r.number)}</span>`}</div>
    <div style="min-width:0"><b>${esc(r.name||"Habitación "+r.number)}</b><div class="muted" style="font-size:.84rem">${esc(r.type||"")} · ${esc(r.beds||"")} · hasta ${r.capacity||"?"} pers. · baño ${esc(r.bath||"compartido")}</div>
      <div class="chips" style="margin-top:6px">${(r.features||[]).slice(0,5).map(f=>`<span class="chip">${esc(f)}</span>`).join("")}</div></div>
    <div class="price"><div><b class="num">${cop(rate*n)}</b><span class="muted" style="font-size:.78rem">${cop(rate)} × ${n} noche${n>1?"s":""}</span></div>
      <button class="btn primary" data-book="${esc(r.id)}" style="margin-top:6px">Reservar</button></div></div>`;}).join("");
}
$("#engRes").addEventListener("click",e=>{const b=e.target.closest("[data-book]");if(!b)return;const q=S.eng;openResForm({roomId:b.dataset.book,checkIn:q.in,checkOut:q.out,adults:q.ad,children:q.ch});});

/* ---------- reservas ---------- */
$("#rSt").innerHTML=`<option value="">Todos los estados</option>`+Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v.n}</option>`).join("");
$("#rCh").innerHTML=`<option value="">Todos los canales</option>`+CHANNELS.map(c=>`<option value="${c.k}">${c.n}</option>`).join("");
["rQ","rSt","rCh","rWhen"].forEach(id=>$("#"+id).addEventListener("input",renderRes));
function renderRes(){
  const q=$("#rQ").value.trim().toLowerCase(), st=$("#rSt").value, ch=$("#rCh").value, w=$("#rWhen").value, t=todayISO();
  let list=S.res.filter(r=>(!st||r.status===st)&&(!ch||r.channel===ch)&&(w==="all"||(w==="up"?r.checkOut>=t:r.checkOut<t))&&(!q||(resGuest(r)+" "+r.id).toLowerCase().includes(q)));
  list.sort((a,b)=>w==="past"?b.checkIn.localeCompare(a.checkIn):a.checkIn.localeCompare(b.checkIn));
  $("#rBody").innerHTML = list.map(r=>{const ro=roomById(r.roomId);const bal=balance(r);return `<tr data-open="${esc(r.id)}">
    <td class="num">${esc(r.id)}</td><td>${esc(resGuest(r))}</td><td class="num">${esc(ro?ro.number:"?")}</td>
    <td>${fd(r.checkIn,{weekday:"short"})}</td><td>${fd(r.checkOut,{weekday:"short"})}</td><td class="r num">${nights(r)}</td>
    <td><span class="ch" style="--c:${chan(r.channel).c}">${esc(chan(r.channel).n)}</span></td>
    <td><span class="pill ${STATUS[r.status]?.cls||""}">${esc(STATUS[r.status]?.n||r.status)}</span></td>
    <td class="r num">${cop(r.total)}</td><td class="r num" style="color:${bal>0&&r.status!=="cancelada"?"var(--warn)":"var(--muted)"}">${r.status==="cancelada"?"—":cop(bal)}</td></tr>`;}).join("")
    || `<tr><td colspan="10" class="empty" style="padding:18px 12px;cursor:default">${S.loaded?"No hay reservas con esos filtros.":"Cargando reservas…"}</td></tr>`;
}

/* ---------- solicitudes ---------- */
$("#sSt").addEventListener("change",renderSol);
function renderSol(){
  const f=$("#sSt").value;
  const list=S.reqs.filter(x=>!f||x.status===f).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  $("#solList").innerHTML=list.map(x=>{
    const ro=roomById(x.roomId), n=diff(x.checkIn,x.checkOut), st=REQ_ST[x.status]||REQ_ST.nueva;
    const busy=ro?conflicts(ro.id,x.checkIn,x.checkOut).length>0:false;
    return `<div class="panel" style="display:flex;flex-direction:column;gap:8px">
      <div class="toolbar"><div class="grp"><b>${esc(((x.first||"")+" "+(x.last||"")).trim()||"Sin nombre")}</b><span class="pill ${st.cls}">${st.n}</span></div>
        <span class="muted num" style="font-size:.76rem">${esc(x.id)}${x.createdAt?" · "+esc(new Date(x.createdAt).toLocaleString("es-CO",{dateStyle:"medium",timeStyle:"short"})):""}</span></div>
      <div class="sum"><span>Hab. <b>${esc(ro?ro.number:"?")}</b> ${esc(ro?ro.type||"":"")}</span><span>${fd(x.checkIn,{weekday:"short"})} → ${fd(x.checkOut,{weekday:"short"})} · <b>${n}</b> noche${n>1?"s":""}</span><span><b>${(x.adults||1)+(x.children||0)}</b> pers.</span><span>Estimado <b>${cop(x.estimate)}</b></span></div>
      <div class="muted" style="font-size:.84rem">${esc(x.phone||"Sin teléfono")} · ${esc(x.email||"sin correo")} · ${esc(x.docType||"")} ${esc(x.docNumber||"")} · ${esc(x.nationality||"")}${x.eta?" · llega "+esc(x.eta):""}</div>
      ${x.notes?`<div class="note">${esc(x.notes)}</div>`:""}
      ${x.status==="nueva"&&busy?`<div class="note bad">La habitación ya está ocupada en esas fechas. Asigna otra al crear la reserva.</div>`:""}
      ${x.status==="nueva"?`<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn danger sm" data-rej="${esc(x.id)}">Rechazar</button><button class="btn primary sm" data-acc="${esc(x.id)}">Crear reserva</button></div>`
        : x.resId?`<div style="font-size:.84rem">Convertida en reserva <button class="btn sm" data-open="${esc(x.resId)}">${esc(x.resId)}</button></div>`:""}
    </div>`;}).join("") || `<div class="empty">${S.loaded?(f==="nueva"?"No hay solicitudes nuevas.":"Aún no hay solicitudes del sitio web."):"Cargando solicitudes…"}</div>`;
}
$("#solList").addEventListener("click",async e=>{
  const acc=e.target.closest("[data-acc]");
  if(acc){const x=S.reqs.find(r=>r.id===acc.dataset.acc);if(!x)return;
    const existing=x.docNumber?S.guests.find(g=>g.docNumber&&g.docNumber===x.docNumber):null;
    openResForm({roomId:x.roomId,checkIn:x.checkIn,checkOut:x.checkOut,adults:x.adults||1,children:x.children||0,eta:x.eta||"",channel:"web",status:"confirmada",
      notes:"Solicitud "+x.id+" (sitio web)."+(x.notes?"\n"+x.notes:""),guestId:existing?existing.id:undefined,
      _prefGuest:{first:x.first,last:x.last,docType:x.docType,docNumber:x.docNumber,phone:x.phone,email:x.email,nationality:x.nationality},
      _onSaved:resId=>save("requests/"+x.id,{status:"aceptada",resId,decidedAt:new Date().toISOString()},true)});
    return;}
  const rej=e.target.closest("[data-rej]");
  if(rej){
    if(!rej.dataset.armed){rej.dataset.armed="1";rej.textContent="Toca otra vez para rechazar";setTimeout(()=>{rej.textContent="Rechazar";delete rej.dataset.armed;},3500);return;}
    try{await save("requests/"+rej.dataset.rej,{status:"rechazada",decidedAt:new Date().toISOString()},true);toast("Solicitud rechazada");}catch(_){}
  }
});

/* ---------- huéspedes ---------- */
$("#gQ").addEventListener("input",renderGuests);
function renderGuests(){
  const q=$("#gQ").value.trim().toLowerCase();
  const list=S.guests.filter(g=>!q||[gName(g),g.docNumber,g.phone,g.email].join(" ").toLowerCase().includes(q)).sort((a,b)=>gName(a).localeCompare(gName(b),"es"));
  $("#gBody").innerHTML = list.map(g=>{const tr=tra(g);const stays=S.res.filter(r=>r.guestId===g.id&&active(r)).length;return `<tr data-guest="${esc(g.id)}">
    <td>${esc(gName(g))}</td><td class="num">${esc(g.docType||"")} ${esc(g.docNumber||"—")}</td><td>${esc(g.nationality||"—")}</td>
    <td class="num">${esc(g.phone||"—")}</td><td>${esc(g.email||"—")}</td><td class="r num">${stays}</td>
    <td>${tr.ok?'<span class="pill ok">Completa</span>':`<span class="pill warn">Faltan ${tr.miss.length+(g.consent?0:1)}</span>`}</td></tr>`;}).join("")
    || `<tr><td colspan="7" class="empty" style="padding:18px 12px;cursor:default">${S.loaded?"Aún no hay huéspedes registrados. Se crean al hacer una reserva o con «Nuevo huésped».":"Cargando huéspedes…"}</td></tr>`;
}
$("#gBody").addEventListener("click",e=>{const r=e.target.closest("[data-guest]");if(r)openGuestForm(guestById(r.dataset.guest)||{});});

/* ---------- habitaciones ---------- */
function roomToday(ro){const t=todayISO();
  if(S.res.some(x=>x.roomId===ro.id&&active(x)&&x.checkIn<=t&&x.checkOut>t)) return {n:"Ocupada",cls:"info"};
  if(S.res.some(x=>x.roomId===ro.id&&active(x)&&x.checkIn===t)) return {n:"Llega hoy",cls:"warn"};
  return null;}
function renderRooms(){
  $("#rooms").innerHTML = sortRooms().map(r=>{const cov=(r.photos||[])[0];const st=ROOM_STATUS[r.status]||ROOM_STATUS.disponible;const td=roomToday(r);const np=(r.photos||[]).length;return `
    <article class="room" data-room="${esc(r.id)}" tabindex="0">
      <div class="ph">${cov?`<img src="${photoUrl(cov)}" alt="Habitación ${esc(r.number)}" loading="lazy">`:`<span class="no" style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:1.6rem;color:var(--wood-deep)"><img src="/assets/logo-mark.png" alt="" style="width:84px;height:84px">${esc(r.number)}</span>`}
        <span class="st">${td?`<span class="pill ${td.cls}">${td.n}</span>`:`<span class="pill ${st.cls}">${st.n}</span>`}</span>
        <span class="cnt">${np} foto${np===1?"":"s"}</span></div>
      <div class="bd"><div class="row"><h3>${esc(r.name||"Habitación "+r.number)}</h3><b class="num">${cop(r.rate)}</b></div>
        <div class="muted" style="font-size:.84rem">${esc(r.type||"")} · ${esc(r.beds||"")} · ${r.capacity||"?"} pers. · baño ${esc(r.bath||"")}${r.floor?` · piso ${esc(r.floor)}`:""}</div>
        <div class="chips">${(r.features||[]).slice(0,6).map(f=>`<span class="chip">${esc(f)}</span>`).join("")}</div></div>
    </article>`;}).join("") || `<div class="empty">${S.loaded?"Aún no hay habitaciones. Usa «Agregar habitación».":"Cargando habitaciones…"}</div>`;
}
$("#rooms").addEventListener("click",e=>{const r=e.target.closest("[data-room]");if(r)openRoomDetail(r.dataset.room);});
$("#rooms").addEventListener("keydown",e=>{if(e.key==="Enter"){const r=e.target.closest("[data-room]");if(r)openRoomDetail(r.dataset.room);}});

/* ---------- alojamiento ---------- */
function renderHotel(){
  const h=S.hotel;
  if(!h){$("#aloj").innerHTML=`<div class="empty">${S.loaded?"La ficha del alojamiento está vacía. Usa «Editar ficha».":"Cargando ficha…"}</div>`;return;}
  const link=(u,t)=>u?`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`:`<span class="muted">Sin enlace</span>`;
  const types={};S.rooms.forEach(r=>{const k=r.type||"Sin tipo";types[k]=types[k]||{n:0,min:Infinity,max:0,beds:r.beds,cap:r.capacity};types[k].n++;types[k].min=Math.min(types[k].min,Number(r.rate)||0);types[k].max=Math.max(types[k].max,Number(r.rate)||0);});
  $("#aloj").innerHTML=`
  <div class="facts">
    <div class="panel"><div class="eyebrow">Foto de portada del sitio</div><div class="hero-ph" style="margin-top:8px">${h.heroPhoto?`<img src="${photoUrl(h.heroPhoto)}" alt="Portada">`:`<div style="height:100%;display:grid;place-items:center;color:var(--muted);font-size:.86rem">Sin portada: se muestra la ilustración</div>`}</div></div>
    <div class="panel"><div class="eyebrow">Frase de portada</div><p style="margin:.3em 0 .8em;font-family:var(--display);font-size:1.3rem;font-weight:700">${esc(h.tagline||"Tu base en el norte de Bogotá")}</p>
      <div class="eyebrow">Descripción (se muestra en el sitio)</div><p style="margin:.4em 0 0;max-width:72ch">${esc(h.description||"")}</p></div>
  </div>
  <div class="facts">
    <div class="panel"><h3>Datos generales</h3><dl class="kv" style="margin-top:10px">
      <dt>Nombre</dt><dd>${esc(h.name)}</dd><dt>Nombre en OTAs</dt><dd>${esc(h.otaName||"—")}</dd>
      <dt>Dirección</dt><dd>${esc(h.address)}</dd><dt>Zona</dt><dd>${esc(h.zone||"—")}</dd>
      <dt>Teléfono</dt><dd class="num">${esc(h.phone||"Pendiente")}</dd><dt>WhatsApp</dt><dd class="num">${esc(h.whatsapp||"Pendiente")}</dd>
      <dt>Correo</dt><dd>${esc(h.email||"Pendiente")}</dd><dt>Habitaciones</dt><dd>${S.rooms.length} registradas</dd></dl></div>
    <div class="panel"><h3>Horarios</h3><dl class="kv" style="margin-top:10px">
      <dt>Check-in</dt><dd class="num">${esc(h.checkinFrom||"")} – ${esc(h.checkinTo||"")}</dd><dt>Check-out</dt><dd class="num">${esc(h.checkout||"")}</dd>
      <dt>Recepción</dt><dd>${esc(h.frontDesk||"")}</dd><dt>Pagos</dt><dd>${esc(h.payments||"")}</dd></dl></div>
    <div class="panel"><h3>Tipos de habitación</h3><div class="list" style="margin-top:6px">${Object.entries(types).map(([k,v])=>`<div class="li"><div class="who"><b>${esc(k)}</b><small>${v.n} hab. · ${esc(v.beds||"")} · ${v.cap||"?"} pers.</small></div><span class="num">${cop(v.min)}${v.max>v.min?" – "+cop(v.max):""}</span></div>`).join("")||'<div class="empty">Sin habitaciones</div>'}</div></div>
  </div>
  <div class="facts">
    <div class="panel"><h3>Servicios</h3><ul class="plain" style="margin-top:10px">${(h.amenities||[]).map(a=>`<li>${esc(a)}</li>`).join("")}</ul></div>
    <div class="panel"><h3>Políticas</h3><ul class="plain" style="margin-top:10px">${(h.policies||[]).map(a=>`<li>${esc(a)}</li>`).join("")}</ul></div>
    <div class="panel"><h3>Cerca del alojamiento</h3><ul class="plain" style="margin-top:10px">${(h.nearby||[]).map(a=>`<li>${esc(a)}</li>`).join("")}</ul></div>
  </div>
  <div class="facts">
    <div class="panel"><h3>Canales de venta</h3><dl class="kv" style="margin-top:10px">${["booking","airbnb","expedia","hotels"].map(k=>`<dt><span class="ch" style="--c:${chan(k).c}">${chan(k).n}</span></dt><dd>${link((h.channels||{})[k],"Abrir anuncio")}</dd>`).join("")}</dl>
      <p class="muted" style="font-size:.8rem;margin:10px 0 0">Registra aquí las reservas que lleguen por cada canal para mantener un solo calendario y evitar sobreventas.</p></div>
    <div class="panel"><h3>Reputación en línea</h3>${h.reviews?`<div style="display:flex;gap:14px;align-items:center;margin-top:10px"><span class="score num">${esc(h.reviews.score)}</span><div><b>/10 en ${esc(h.reviews.source)}</b><div class="muted" style="font-size:.82rem">${esc(h.reviews.count)} reseñas</div></div></div>
      <div class="eyebrow" style="margin-top:12px">Puntos a mejorar (solo visible aquí)</div><ul class="plain" style="margin-top:6px">${(h.reviews.notes||[]).map(a=>`<li>${esc(a)}</li>`).join("")}</ul>`:'<div class="empty">Sin datos</div>'}</div>
    <div class="panel"><h3>Fuentes consultadas</h3><ul class="plain" style="margin-top:10px">${(h.sources||[]).map(s=>`<li>${link(s.url,s.title)}</li>`).join("")}</ul>
      ${h.taxNote?`<p class="muted" style="font-size:.8rem;margin:10px 0 0">${esc(h.taxNote)}</p>`:""}</div>
  </div>`;
}

/* ---------- reserva: formulario ---------- */
const PAY=["Efectivo","Transferencia","Nequi / Daviplata","Tarjeta","Cobrado por el canal"];
function openResForm(r){
  const isNew=!r.id; const t=todayISO();
  const d=Object.assign({checkIn:t,checkOut:addDays(t,1),adults:1,children:0,channel:"directo",status:"confirmada",paid:0,notes:""},r);
  const rooms=sortRooms();
  if(!d.roomId && rooms[0]) d.roomId=rooms[0].id;
  const guests=S.guests.slice().sort((a,b)=>gName(a).localeCompare(gName(b),"es"));
  const pg=d._prefGuest||{};
  const body=`
    <fieldset><legend>Estancia</legend><div class="grid g3">
      <label class="f">Habitación<select id="fRoom">${rooms.map(x=>opt(x.id,`${x.number} · ${x.type||""} (${x.capacity||"?"} pers.)`,d.roomId)).join("")}</select></label>
      <label class="f">Entrada<input type="date" id="fIn" value="${esc(d.checkIn)}" required></label>
      <label class="f">Salida<input type="date" id="fOut" value="${esc(d.checkOut)}" required></label>
      <label class="f">Adultos<input type="number" id="fAd" min="1" max="6" value="${esc(d.adults)}"></label>
      <label class="f">Niños<input type="number" id="fCh" min="0" max="4" value="${esc(d.children)}"></label>
      <label class="f">Hora estimada de llegada<input type="time" id="fEta" value="${esc(d.eta||"")}"></label>
    </div><div id="fAvail"></div></fieldset>
    <fieldset><legend>Huésped titular</legend>
      <label class="f">Huésped<select id="fGuest"><option value="__new">+ Registrar huésped nuevo</option>${guests.map(g=>opt(g.id,`${gName(g)} · ${g.docType||""} ${g.docNumber||""}`,d.guestId)).join("")}</select></label>
      <div id="fNewG" class="grid g3">
        <label class="f">Nombres<input id="ngFirst" value="${esc(pg.first||"")}"></label><label class="f">Apellidos<input id="ngLast" value="${esc(pg.last||"")}"></label>
        <label class="f">Tipo de documento<select id="ngDocT">${DOCS.map(x=>opt(x,x,pg.docType||"CC")).join("")}</select></label>
        <label class="f">Número de documento<input id="ngDoc" value="${esc(pg.docNumber||"")}"></label><label class="f">Teléfono / WhatsApp<input id="ngPhone" inputmode="tel" value="${esc(pg.phone||"")}"></label>
        <label class="f">Correo<input id="ngEmail" type="email" value="${esc(pg.email||"")}"></label><label class="f">Nacionalidad<input id="ngNat" value="${esc(pg.nationality||"Colombia")}"></label>
      </div></fieldset>
    <fieldset><legend>Canal y pago</legend><div class="grid g3">
      <label class="f">Canal<select id="fChan">${CHANNELS.map(c=>opt(c.k,c.n,d.channel)).join("")}</select></label>
      <label class="f">Código en el canal<input id="fExt" value="${esc(d.externalRef||"")}" placeholder="Ej. número de Booking"></label>
      <label class="f">Estado<select id="fSt">${Object.entries(STATUS).map(([k,v])=>opt(k,v.n,d.status)).join("")}</select></label>
      <label class="f">Tarifa por noche (COP)<input type="number" id="fRate" min="0" step="1000" value="${esc(d.rate??"")}"></label>
      <label class="f">Total (COP)<input type="number" id="fTotal" min="0" step="1000" value="${esc(d.total??"")}"></label>
      <label class="f">Abonado (COP)<input type="number" id="fPaid" min="0" step="1000" value="${esc(d.paid||0)}"></label>
      <label class="f">Medio de pago<select id="fPay">${PAY.map(x=>opt(x,x,d.payMethod||"Efectivo")).join("")}</select></label>
    </div><div class="sum" id="fSum"></div>
      <label class="f">Notas internas<textarea id="fNotes" placeholder="Solicitudes, hora de llegada, observaciones">${esc(d.notes)}</textarea></label></fieldset>`;
  const foot=`${isNew?"":`<button class="btn" id="fBack">Volver al detalle</button>`}<button class="btn" id="fCancel">Cancelar</button><button class="btn primary" id="fSave">${isNew?"Crear reserva":"Guardar cambios"}</button>`;
  openModal(isNew?"Nueva reserva":"Editar reserva "+d.id, body, foot, ov=>{
    let rateTouched = d.rate!=null, totalTouched = d.total!=null && !isNew;
    const g=ov.querySelector("#fGuest");
    if(!d.guestId) g.value="__new";
    const syncG=()=>ov.querySelector("#fNewG").hidden = g.value!=="__new";
    g.onchange=syncG; syncG();
    function recalc(){
      const ro=roomById(ov.querySelector("#fRoom").value), a=ov.querySelector("#fIn").value, b=ov.querySelector("#fOut").value;
      const n=(a&&b)?diff(a,b):0;
      if(!rateTouched && ro) ov.querySelector("#fRate").value = ro.rate||0;
      const rate=Number(ov.querySelector("#fRate").value)||0;
      if(!totalTouched) ov.querySelector("#fTotal").value = rate*Math.max(n,0);
      const total=Number(ov.querySelector("#fTotal").value)||0, paid=Number(ov.querySelector("#fPaid").value)||0;
      ov.querySelector("#fSum").innerHTML=`<span>Noches <b>${Math.max(n,0)}</b></span><span>Total <b>${cop(total)}</b></span><span>Saldo <b style="color:${total-paid>0?"var(--warn)":"var(--ok)"}">${cop(total-paid)}</b></span>`;
      const av=ov.querySelector("#fAvail"); const pax=(+ov.querySelector("#fAd").value||0)+(+ov.querySelector("#fCh").value||0);
      let msg="";
      if(n<=0) msg=`<div class="note bad">La salida debe ser posterior a la entrada.</div>`;
      else if(ro){const c=conflicts(ro.id,a,b,d.id);
        if(c.length) msg=`<div class="note bad">La habitación ${esc(ro.number)} ya está ocupada en esas fechas por ${c.map(x=>esc(resGuest(x))+" ("+fd(x.checkIn)+"–"+fd(x.checkOut)+")").join(", ")}.</div>`;
        else if(ro.status==="mantenimiento") msg=`<div class="note warn">La habitación está marcada en mantenimiento.</div>`;
        else if(pax>(Number(ro.capacity)||1)) msg=`<div class="note warn">${pax} personas superan la capacidad de la habitación (${ro.capacity}).</div>`;
        else msg=`<div class="note ok">Habitación ${esc(ro.number)} disponible · ${n} noche${n>1?"s":""}.</div>`;}
      av.innerHTML=msg;
      return {ok:n>0&&ro&&!conflicts(ro.id,a,b,d.id).length};
    }
    ov.querySelector("#fRate").addEventListener("input",()=>{rateTouched=true;recalc();});
    ov.querySelector("#fTotal").addEventListener("input",()=>{totalTouched=true;recalc();});
    ov.querySelector("#fRoom").addEventListener("change",()=>{rateTouched=false;recalc();});
    ov.querySelector("#fIn").addEventListener("change",e=>{const o=ov.querySelector("#fOut");if(o.value<=e.target.value)o.value=addDays(e.target.value,1);recalc();});
    ["#fOut","#fAd","#fCh","#fPaid"].forEach(s=>ov.querySelector(s).addEventListener("input",recalc));
    recalc();
    ov.querySelector("#fCancel").onclick=closeModal;
    const back=ov.querySelector("#fBack"); if(back) back.onclick=()=>openResDetail(d.id);
    ov.querySelector("#fSave").onclick=async ()=>{
      if(!recalc().ok){toast("Revisa las fechas: hay un cruce con otra reserva o la estancia no es válida.");return;}
      let guestId=g.value;
      const btn=ov.querySelector("#fSave"); btn.disabled=true;
      try{
        if(guestId==="__new"){
          const first=ov.querySelector("#ngFirst").value.trim(), last=ov.querySelector("#ngLast").value.trim();
          if(!first){toast("Escribe al menos el nombre del huésped.");btn.disabled=false;return;}
          guestId=genId("G");
          await save("guests/"+guestId,{first,last,docType:ov.querySelector("#ngDocT").value,docNumber:ov.querySelector("#ngDoc").value.trim(),
            phone:ov.querySelector("#ngPhone").value.trim(),email:ov.querySelector("#ngEmail").value.trim(),nationality:ov.querySelector("#ngNat").value.trim(),
            consent:!!d._prefGuest,createdAt:new Date().toISOString()});
        }
        const id=d.id||genId("PN");
        const rec={roomId:ov.querySelector("#fRoom").value,checkIn:ov.querySelector("#fIn").value,checkOut:ov.querySelector("#fOut").value,
          adults:+ov.querySelector("#fAd").value||1,children:+ov.querySelector("#fCh").value||0,eta:ov.querySelector("#fEta").value,
          guestId,guestName:gName(guestById(guestId)),channel:ov.querySelector("#fChan").value,externalRef:ov.querySelector("#fExt").value.trim(),status:ov.querySelector("#fSt").value,
          rate:Number(ov.querySelector("#fRate").value)||0,total:Number(ov.querySelector("#fTotal").value)||0,paid:Number(ov.querySelector("#fPaid").value)||0,
          payMethod:ov.querySelector("#fPay").value,notes:ov.querySelector("#fNotes").value,
          createdAt:d.createdAt||new Date().toISOString()};
        await save("reservations/"+id,rec);
        if(d._onSaved) try{await d._onSaved(id);}catch(_){}
        toast(isNew?`Reserva ${id} creada`:"Reserva actualizada");
        closeModal();
      }catch(_){btn.disabled=false;}
    };
  }, true);
}

/* ---------- reserva: detalle ---------- */
function openResDetail(id){
  const r=S.res.find(x=>x.id===id); if(!r){toast("Reserva no encontrada.");return;}
  const ro=roomById(r.roomId), g=guestById(r.guestId), st=STATUS[r.status]||{n:r.status,cls:""};
  const tr=g?tra(g):{ok:false,miss:[]};
  const body=`
    <div class="toolbar"><div class="grp"><span class="pill ${st.cls}">${st.n}</span><span class="ch" style="--c:${chan(r.channel).c}">${esc(chan(r.channel).n)}${r.externalRef?" · "+esc(r.externalRef):""}</span></div><span class="muted num">${esc(r.id)}</span></div>
    <div class="grid g2">
      <div class="panel"><div class="eyebrow">Estancia</div><dl class="kv" style="margin-top:8px">
        <dt>Habitación</dt><dd>${esc(ro?ro.number+" · "+(ro.type||""):"?")}</dd>
        <dt>Entrada</dt><dd>${fd(r.checkIn,{weekday:"long",year:"numeric"})}${r.eta?" · "+esc(r.eta):""}</dd>
        <dt>Salida</dt><dd>${fd(r.checkOut,{weekday:"long",year:"numeric"})}</dd>
        <dt>Noches</dt><dd class="num">${nights(r)}</dd><dt>Personas</dt><dd>${r.adults||1} adulto(s)${r.children?`, ${r.children} niño(s)`:""}</dd></dl></div>
      <div class="panel"><div class="eyebrow">Pago</div><dl class="kv" style="margin-top:8px">
        <dt>Tarifa</dt><dd class="num">${cop(r.rate)} / noche</dd><dt>Total</dt><dd class="num">${cop(r.total)}</dd>
        <dt>Abonado</dt><dd class="num">${cop(r.paid)}</dd><dt>Saldo</dt><dd class="num" style="color:${balance(r)>0?"var(--warn)":"var(--ok)"}">${cop(balance(r))}</dd><dt>Medio</dt><dd>${esc(r.payMethod||"—")}</dd></dl></div>
    </div>
    <div class="panel"><div class="toolbar"><div><div class="eyebrow">Huésped titular</div><b>${esc(resGuest(r))}</b> <span class="muted">${g?esc((g.docType||"")+" "+(g.docNumber||"")):""}</span></div>
      ${g?`<button class="btn sm" id="dGuest">Ver ficha</button>`:""}</div>
      ${g?`<div class="muted" style="font-size:.84rem;margin-top:6px">${esc(g.phone||"Sin teléfono")} · ${esc(g.email||"sin correo")} · ${esc(g.nationality||"")}</div>`:""}
      ${g&&!tr.ok?`<div class="note warn" style="margin-top:10px">Ficha incompleta para la TRA: completa documento, nacimiento, procedencia y autorización de datos antes del check-in.</div>`:""}</div>
    ${r.notes?`<div class="panel"><div class="eyebrow">Notas</div><p style="margin:.3em 0 0;white-space:pre-wrap">${esc(r.notes)}</p></div>`:""}
    <div id="dPayBox"><fieldset><legend>Registrar pago</legend><div class="grid g3" style="align-items:end">
      <label class="f">Valor (COP)<input type="number" id="dPay" min="0" step="1000" value="${Math.max(0,balance(r))}"></label>
      <label class="f">Medio<select id="dPayM">${PAY.map(x=>opt(x,x,r.payMethod||"Efectivo")).join("")}</select></label>
      <button class="btn" id="dPayGo">Registrar abono</button></div></fieldset></div>`;
  const canCI = ["pendiente","confirmada"].includes(r.status), canCO = r.status==="encasa";
  const foot=`<button class="btn danger" id="dDel">Cancelar reserva</button><span style="flex:1"></span><button class="btn" id="dEdit">Editar</button>
    ${canCI?`<button class="btn primary" id="dCI">Hacer check-in</button>`:""}${canCO?`<button class="btn primary" id="dCO">Hacer check-out</button>`:""}`;
  openModal("Reserva de "+resGuest(r), body, foot, ov=>{
    ov.querySelector("#dEdit").onclick=()=>openResForm(r);
    const gb=ov.querySelector("#dGuest"); if(gb) gb.onclick=()=>openGuestForm(g);
    const ci=ov.querySelector("#dCI"); if(ci) ci.onclick=()=>doCheckIn(r.id);
    const co=ov.querySelector("#dCO"); if(co) co.onclick=()=>doCheckOut(r.id);
    const delB=ov.querySelector("#dDel");
    if(r.status==="cancelada"){delB.textContent="Eliminar definitivamente";confirmBtn(delB,"Toca otra vez para eliminar",async()=>{try{await del("reservations/"+r.id);toast("Reserva eliminada");closeModal();}catch(e){toast(e.message);}});}
    else confirmBtn(delB,"Toca otra vez para confirmar",async()=>{try{await save("reservations/"+r.id,{status:"cancelada"},true);toast("Reserva cancelada");closeModal();}catch(_){}});
    ov.querySelector("#dPayGo").onclick=async()=>{const v=Number(ov.querySelector("#dPay").value)||0;if(v<=0){toast("Escribe un valor mayor que cero.");return;}
      try{await save("reservations/"+r.id,{paid:(Number(r.paid)||0)+v,payMethod:ov.querySelector("#dPayM").value},true);toast("Abono de "+cop(v)+" registrado");closeModal();}catch(_){}};
    if(r.status==="cancelada") ov.querySelector("#dPayBox").hidden=true;
  }, true);
}
async function doCheckIn(id){const r=S.res.find(x=>x.id===id);if(!r)return;const g=guestById(r.guestId);
  if(g && !tra(g).ok){toast("Completa la ficha del huésped (TRA) antes del check-in.");openGuestForm(g,{afterSave:()=>doCheckIn(id)});return;}
  try{await save("reservations/"+id,{status:"encasa",checkedInAt:new Date().toISOString()},true);toast("Check-in registrado · "+resGuest(r));closeModal();}catch(_){}}
async function doCheckOut(id){const r=S.res.find(x=>x.id===id);if(!r)return;
  try{await save("reservations/"+id,{status:"finalizada",checkedOutAt:new Date().toISOString()},true);
    if(r.roomId) try{await save("rooms/"+r.roomId,{status:"limpieza"},true);}catch(_){}
    toast(balance(r)>0?`Check-out registrado. Saldo pendiente ${cop(balance(r))}`:"Check-out registrado · habitación pasa a limpieza");closeModal();}catch(_){}}

/* ---------- huésped ---------- */
function openGuestForm(g, opts){
  g=g||{}; const isNew=!g.id;
  const stays=isNew?[]:S.res.filter(r=>r.guestId===g.id).sort((a,b)=>b.checkIn.localeCompare(a.checkIn));
  const body=`
    <fieldset><legend>Identificación</legend><div class="grid g3">
      <label class="f">Nombres<input id="gFirst" value="${esc(g.first||"")}"></label>
      <label class="f">Apellidos<input id="gLast" value="${esc(g.last||"")}"></label>
      <label class="f">Tipo de documento<select id="gDocT">${DOCS.map(x=>opt(x,x,g.docType||"CC")).join("")}</select></label>
      <label class="f">Número de documento<input id="gDoc" value="${esc(g.docNumber||"")}"></label>
      <label class="f">Nacionalidad<input id="gNat" value="${esc(g.nationality||"Colombia")}"></label>
      <label class="f">Fecha de nacimiento<input type="date" id="gBirth" value="${esc(g.birth||"")}"></label>
      <label class="f">Sexo<select id="gSex">${["","F","M","Otro"].map(x=>opt(x,x||"—",g.sex||"")).join("")}</select></label>
      <label class="f">Profesión u ocupación<input id="gJob" value="${esc(g.job||"")}"></label>
    </div></fieldset>
    <fieldset><legend>Contacto</legend><div class="grid g3">
      <label class="f">Teléfono / WhatsApp<input id="gPhone" inputmode="tel" value="${esc(g.phone||"")}"></label>
      <label class="f">Correo<input type="email" id="gEmail" value="${esc(g.email||"")}"></label>
      <label class="f">Ciudad de residencia<input id="gCity" value="${esc(g.city||"")}"></label>
      <label class="f">Contacto de emergencia<input id="gEmer" value="${esc(g.emergency||"")}" placeholder="Nombre y teléfono"></label>
    </div></fieldset>
    <fieldset><legend>Viaje (TRA / SIRE)</legend><div class="grid g3">
      <label class="f">Procedencia<input id="gFrom" value="${esc(g.origin||"")}" placeholder="Ciudad / país de donde viene"></label>
      <label class="f">Destino siguiente<input id="gTo" value="${esc(g.destination||"")}"></label>
      <label class="f">Motivo del viaje<select id="gWhy">${MOTIVOS.map(x=>opt(x,x,g.purpose||"Turismo")).join("")}</select></label>
      <label class="f">Medio de transporte<select id="gTr">${["Terrestre","Aéreo","Otro"].map(x=>opt(x,x,g.transport||"Terrestre")).join("")}</select></label>
    </div>
    <label class="f chk"><input type="checkbox" id="gCons" ${g.consent?"checked":""}> El huésped autoriza el tratamiento de sus datos personales conforme a la Ley 1581 de 2012 y la política de datos del alojamiento.</label></fieldset>
    <label class="f">Notas (preferencias, observaciones)<textarea id="gNotes">${esc(g.notes||"")}</textarea></label>
    ${stays.length?`<div class="panel"><div class="eyebrow">Historial de estancias</div><div class="list">${stays.map(r=>liRes(r,"")).join("")}</div></div>`:""}`;
  const foot=`${isNew?"":`<button class="btn danger" id="gDel">Eliminar ficha</button><span style="flex:1"></span>`}<button class="btn" id="gCancel">Cerrar</button><button class="btn primary" id="gSave">${isNew?"Registrar huésped":"Guardar ficha"}</button>`;
  openModal(isNew?"Nuevo huésped":gName(g), body, foot, ov=>{
    ov.querySelector("#gCancel").onclick=closeModal;
    const delB=ov.querySelector("#gDel");
    if(delB) confirmBtn(delB, stays.length?"Tiene reservas: toca otra vez para eliminar igual":"Toca otra vez para eliminar", async()=>{try{await del("guests/"+g.id);toast("Ficha eliminada");closeModal();}catch(e){toast(e.message);}});
    ov.querySelector("#gSave").onclick=async()=>{
      const v=s=>ov.querySelector(s).value.trim();
      if(!v("#gFirst")){toast("El nombre es obligatorio.");return;}
      const id=g.id||genId("G");
      const rec={first:v("#gFirst"),last:v("#gLast"),docType:v("#gDocT"),docNumber:v("#gDoc"),nationality:v("#gNat"),birth:v("#gBirth"),sex:v("#gSex"),job:v("#gJob"),
        phone:v("#gPhone"),email:v("#gEmail"),city:v("#gCity"),emergency:v("#gEmer"),origin:v("#gFrom"),destination:v("#gTo"),purpose:v("#gWhy"),transport:v("#gTr"),
        consent:ov.querySelector("#gCons").checked,notes:ov.querySelector("#gNotes").value,createdAt:g.createdAt||new Date().toISOString()};
      try{await save("guests/"+id,rec);toast(isNew?"Huésped registrado":"Ficha guardada");closeModal();
        if(opts&&opts.afterSave&&tra(rec).ok) opts.afterSave();}catch(_){}
    };
  }, true);
}

/* ---------- habitación ---------- */
function openRoomDetail(id){
  const r=roomById(id); if(!r) return;
  const photos=r.photos||[]; const st=ROOM_STATUS[r.status]||ROOM_STATUS.disponible;
  const up=S.res.filter(x=>x.roomId===id&&active(x)&&x.checkOut>=todayISO()).sort((a,b)=>a.checkIn.localeCompare(b.checkIn)).slice(0,5);
  const body=`
    <div class="hero-ph r43">${photos[0]?`<img id="rhImg" src="${photoUrl(photos[0])}" alt="Habitación ${esc(r.number)}">`:`<div style="height:100%;display:grid;place-items:center;color:var(--muted)">Sin fotos todavía</div>`}</div>
    ${photos.length>1?`<div class="gallery" id="rhThumbs">${photos.map(p=>`<figure><img src="${photoUrl(p)}" alt="" data-ph="${esc(p)}" loading="lazy" style="cursor:pointer"></figure>`).join("")}</div>`:""}
    <div class="toolbar"><div class="grp"><span class="pill ${st.cls}">${st.n}</span><b class="num">${cop(r.rate)} / noche</b></div>
      <div class="grp"><select id="rhSt" style="width:auto" aria-label="Estado de la habitación">${Object.entries(ROOM_STATUS).map(([k,v])=>opt(k,v.n,r.status||"disponible")).join("")}</select></div></div>
    ${r.description?`<p style="margin:0;max-width:68ch">${esc(r.description)}</p>`:""}
    <dl class="kv"><dt>Tipo</dt><dd>${esc(r.type||"")}</dd><dt>Camas</dt><dd>${esc(r.beds||"")}</dd><dt>Capacidad</dt><dd>${r.capacity||"?"} personas</dd>
      <dt>Baño</dt><dd>${esc(r.bath||"")}</dd>${r.size?`<dt>Área</dt><dd class="num">${esc(r.size)} m²</dd>`:""}${r.floor?`<dt>Piso</dt><dd>${esc(r.floor)}</dd>`:""}</dl>
    <div class="chips">${(r.features||[]).map(f=>`<span class="chip">${esc(f)}</span>`).join("")}</div>
    <div class="panel"><div class="eyebrow">Próximas reservas</div><div class="list">${up.map(x=>liRes(x,"")).join("")||'<div class="empty">Sin reservas próximas.</div>'}</div></div>`;
  openModal(r.name||"Habitación "+r.number, body, `<button class="btn" id="rhClose">Cerrar</button><button class="btn primary" id="rhEdit">Editar y fotos</button>`, ov=>{
    ov.querySelector("#rhClose").onclick=closeModal;
    ov.querySelector("#rhEdit").onclick=()=>openRoomForm(r);
    const th=ov.querySelector("#rhThumbs"); if(th) th.onclick=e=>{const i=e.target.closest("[data-ph]");if(i)ov.querySelector("#rhImg").src=photoUrl(i.dataset.ph);};
    const s=ov.querySelector("#rhSt"); s.onchange=async()=>{try{await save("rooms/"+id,{status:s.value},true);toast("Estado actualizado: "+ROOM_STATUS[s.value].n);}catch(_){}};
  }, true);
}
function openRoomForm(r){
  r=r||{}; const isNew=!r.id; const id=r.id||genId("R");
  let photos=(r.photos||[]).slice();
  const photoOrig=Object.assign({},r.photoOrig||{});
  const feats=new Set(r.features||[]);
  const extra=[...feats].filter(f=>!FEATURES.includes(f));
  const body=`
    <fieldset><legend>Datos</legend><div class="grid g3">
      <label class="f">Número<input id="roNum" value="${esc(r.number||"")}"></label>
      <label class="f">Nombre comercial<input id="roName" value="${esc(r.name||"")}" placeholder="Ej. Doble Confort 201"></label>
      <label class="f">Tipo<input id="roType" list="roTypes" value="${esc(r.type||"")}"><datalist id="roTypes"><option>Doble Confort</option><option>Doble Estándar</option><option>Sencilla</option><option>Triple</option><option>Familiar</option></datalist></label>
      <label class="f">Camas<input id="roBeds" value="${esc(r.beds||"")}" placeholder="1 cama queen"></label>
      <label class="f">Capacidad (personas)<input type="number" id="roCap" min="1" max="8" value="${esc(r.capacity||2)}"></label>
      <label class="f">Tarifa por noche (COP)<input type="number" id="roRate" min="0" step="1000" value="${esc(r.rate||"")}"></label>
      <label class="f">Baño<select id="roBath">${["compartido","privado"].map(x=>opt(x,x,r.bath||"compartido")).join("")}</select></label>
      <label class="f">Área (m²)<input type="number" id="roSize" min="0" value="${esc(r.size||"")}"></label>
      <label class="f">Piso<input id="roFloor" value="${esc(r.floor||"")}"></label>
    </div>
    <label class="f">Descripción para el huésped<textarea id="roDesc">${esc(r.description||"")}</textarea></label></fieldset>
    <fieldset><legend>Características</legend><div class="grid g3">${FEATURES.map(f=>`<label class="f chk"><input type="checkbox" data-feat="${esc(f)}" ${feats.has(f)?"checked":""}> ${esc(f)}</label>`).join("")}</div>
      <label class="f">Otras (separadas por coma)<input id="roExtra" value="${esc(extra.join(", "))}"></label></fieldset>
    <fieldset><legend>Fotos</legend>
      <div id="roPhNote"></div>
      <div class="gallery" id="roGal"></div>
      <label class="btn" style="align-self:flex-start">Subir fotos<input type="file" id="roUp" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
      <div class="muted" style="font-size:.78rem">Al subir cada foto podrás encuadrarla; se guarda con el logo del hotel como marca de agua. La primera foto es la portada en el sitio público. «Encuadrar» permite volver a ajustar una foto ya subida.</div></fieldset>`;
  const foot=`${isNew?"":`<button class="btn danger" id="roDel">Eliminar habitación</button><span style="flex:1"></span>`}<button class="btn" id="roCancel">Cerrar</button><button class="btn primary" id="roSave">${isNew?"Crear habitación":"Guardar"}</button>`;
  openModal(isNew?"Nueva habitación":"Editar habitación "+(r.number||""), body, foot, ov=>{
    const gal=ov.querySelector("#roGal");
    function drawGal(){gal.innerHTML=photos.map((p,i)=>`<figure><img src="${photoUrl(p)}" alt="Foto ${i+1}">${i===0?'<span class="cover">Portada</span>':""}
      <div class="acts"><button data-crop="${i}">Encuadrar</button>${i>0?`<button data-cov="${i}">Portada</button>`:""}<button data-rm="${i}">Quitar</button></div></figure>`).join("")||`<div class="empty">Sin fotos todavía.</div>`;}
    drawGal();
    async function persistPhotos(){ if(!roomById(id)) return; try{await save("rooms/"+id,{photos,photoOrig},true);}catch(_){}}
    const delPhoto=pid=>api("DELETE","admin/photos/"+encodeURIComponent(pid)).catch(()=>{});
    gal.addEventListener("click",async e=>{
      const c=e.target.closest("[data-cov]"); if(c){const i=+c.dataset.cov;photos.unshift(photos.splice(i,1)[0]);drawGal();await persistPhotos();return;}
      const cr=e.target.closest("[data-crop]"); if(cr){
        const i=+cr.dataset.crop, old=photos[i], orig=photoOrig[old]||old;
        const blob=await cropPhoto(photoUrl(orig),{aspect:4/3,outW:1600,title:"Encuadrar foto "+(i+1)});
        if(!blob) return;
        const note=ov.querySelector("#roPhNote"); note.innerHTML=`<div class="note">Guardando el nuevo encuadre…</div>`;
        try{const d=await api("POST","admin/photos",undefined,blob);photos[i]=d.id;photoOrig[d.id]=orig;delete photoOrig[old];drawGal();await persistPhotos();
          if(old!==orig) delPhoto(old);
          note.innerHTML=`<div class="note ok">Foto reencuadrada con marca de agua.</div>`;}
        catch(err){note.innerHTML=`<div class="note bad">${esc(err.message)}</div>`;}
        return;}
      const rm=e.target.closest("[data-rm]"); if(rm){
        if(!rm.dataset.armed){rm.dataset.armed="1";rm.textContent="¿Seguro?";setTimeout(()=>{rm.textContent="Quitar";delete rm.dataset.armed;},3000);return;}
        const i=+rm.dataset.rm; const [pid]=photos.splice(i,1); const orig=photoOrig[pid]; delete photoOrig[pid]; drawGal(); await persistPhotos();
        delPhoto(pid); if(orig&&orig!==pid) delPhoto(orig);
      }
    });
    ov.querySelector("#roUp").addEventListener("change",async e=>{
      const files=[...e.target.files]; e.target.value=""; if(!files.length) return;
      const note=ov.querySelector("#roPhNote"); let done=0;
      for(let k=0;k<files.length;k++){
        note.innerHTML=`<div class="note">Encuadra la foto ${k+1} de ${files.length}…</div>`;
        const orig=await shrink(files[k]); const url=URL.createObjectURL(orig);
        const cropped=await cropPhoto(url,{aspect:4/3,outW:1600,title:`Encuadra la foto ${k+1} de ${files.length}`});
        URL.revokeObjectURL(url);
        if(!cropped) continue;
        note.innerHTML=`<div class="note">Subiendo foto ${k+1} de ${files.length}…</div>`;
        try{const o=await api("POST","admin/photos",undefined,orig);const d=await api("POST","admin/photos",undefined,cropped);photos.push(d.id);photoOrig[d.id]=o.id;done++;drawGal();}
        catch(err){note.innerHTML=`<div class="note bad">${esc(err.message)}</div>`;return;}
      }
      note.innerHTML=done?`<div class="note ok">${done} foto${done>1?"s":""} cargada${done>1?"s":""} con marca de agua${roomById(id)?"":"; se guardarán al crear la habitación"}.</div>`:`<div class="note">No se cargó ninguna foto.</div>`;
      await persistPhotos();
    });
    ov.querySelector("#roCancel").onclick=closeModal;
    const delB=ov.querySelector("#roDel");
    if(delB) confirmBtn(delB,"Toca otra vez para eliminar",async()=>{try{await del("rooms/"+id);toast("Habitación eliminada");closeModal();}catch(e){toast(e.message);}});
    ov.querySelector("#roSave").onclick=async()=>{
      const v=s=>ov.querySelector(s).value.trim();
      if(!v("#roNum")){toast("El número de habitación es obligatorio.");return;}
      const f=[...ov.querySelectorAll("[data-feat]")].filter(x=>x.checked).map(x=>x.dataset.feat).concat(v("#roExtra").split(",").map(s=>s.trim()).filter(Boolean));
      const rec=Object.assign({},r,{number:v("#roNum"),name:v("#roName"),type:v("#roType"),beds:v("#roBeds"),capacity:+v("#roCap")||1,rate:Number(v("#roRate"))||0,
        bath:v("#roBath"),size:v("#roSize"),floor:v("#roFloor"),description:ov.querySelector("#roDesc").value,features:f,photos,photoOrig,status:r.status||"disponible"});
      delete rec.id;
      try{await save("rooms/"+id,rec);toast(isNew?"Habitación creada":"Habitación guardada");closeModal();}catch(_){}
    };
  }, true);
}

/* ---------- editor de encuadre + marca de agua ---------- */
let WM_LOGO=null;
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("No se pudo leer la imagen."));i.src=src;});}
async function wmLogo(){ if(!WM_LOGO) WM_LOGO=await loadImg("/assets/logo-mark.png").catch(()=>null); return WM_LOGO; }
function roundRectPath(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
/* Marca de agua: logo del hotel + nombre en una cápsula translúcida, esquina inferior derecha */
function drawWatermark(c,W,H,logo){
  const u=Math.min(W,H)/100, pad=2.2*u, lw=8*u;
  const F='"Plus Jakarta Sans","Segoe UI",Arial,sans-serif', t1="PORTAL NORTE 170", t2="HOTEL · COLIVING · BOGOTÁ";
  c.save();
  c.font=`700 ${3*u}px ${F}`; const w1=c.measureText(t1).width;
  c.font=`600 ${1.7*u}px ${F}`; const w2=c.measureText(t2).width;
  const boxH=lw+pad*1.1, boxW=pad+lw+pad*.9+Math.max(w1,w2)+pad*1.6;
  const x=W-boxW-3*u, y=H-boxH-3*u;
  c.globalAlpha=.78; c.fillStyle="#FFFFFF"; roundRectPath(c,x,y,boxW,boxH,boxH/2); c.fill();
  c.globalAlpha=.95; if(logo) c.drawImage(logo,x+pad,y+(boxH-lw)/2,lw,lw);
  const tx=x+pad+lw+pad*.9;
  c.fillStyle="#0E2A42"; c.font=`700 ${3*u}px ${F}`; c.textBaseline="alphabetic"; c.fillText(t1,tx,y+boxH/2+.2*u);
  c.fillStyle="#5E6B78"; c.font=`600 ${1.7*u}px ${F}`; c.fillText(t2,tx,y+boxH/2+2.9*u);
  c.restore();
}
/* Abre el editor sobre cualquier modal abierto; devuelve el JPG final (encuadrado y con marca) o null si se cancela */
function cropPhoto(src,{aspect=4/3,outW=1600,title="Encuadra la foto"}={}){
  return new Promise(async resolve=>{
    let img; try{img=await loadImg(src);}catch(e){toast(e.message);resolve(null);return;}
    const logo=await wmLogo();
    let source=img, rot=0, zoom=1, fx=0, fy=0;
    const root=document.createElement("div"); root.className="ov"; root.style.zIndex="70";
    root.innerHTML=`<div class="modal" style="max-width:880px" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="x" type="button" aria-label="Cancelar">×</button></header>
      <div class="mb">
        <div class="crop-stage" style="aspect-ratio:${aspect};width:min(100%, calc(58vh * ${aspect}));margin-inline:auto"><canvas></canvas><div class="crop-grid"></div></div>
        <div class="grp" style="justify-content:space-between;align-items:flex-end">
          <label class="f" style="flex:1;min-width:200px">Zoom<input type="range" id="cz" min="1" max="3" step="0.01" value="1"></label>
          <div class="grp"><button class="btn sm" id="crot" type="button">Girar 90°</button><button class="btn sm" id="ccen" type="button">Centrar</button>
          <label class="f chk" style="margin:0"><input type="checkbox" id="cwm" checked> Marca de agua</label></div>
        </div>
        <div class="muted" style="font-size:.8rem">Arrastra la foto para encuadrarla y usa el zoom para acercarla. El marco es exactamente lo que verán los huéspedes en las tarjetas y la galería.</div>
      </div>
      <footer><button class="btn" id="ccancel" type="button">Cancelar</button><button class="btn primary" id="cok" type="button">Usar esta foto</button></footer></div>`;
    document.body.appendChild(root);
    const stage=root.querySelector(".crop-stage"), cv=stage.querySelector("canvas"), ctx=cv.getContext("2d"), wmChk=root.querySelector("#cwm");
    function rotated(){ if(rot===0) return img; const c=document.createElement("canvas"); const r90=rot%180!==0; c.width=r90?img.height:img.width; c.height=r90?img.width:img.height;
      const x=c.getContext("2d"); x.translate(c.width/2,c.height/2); x.rotate(rot*Math.PI/180); x.drawImage(img,-img.width/2,-img.height/2); return c; }
    function geom(W,H){const s=Math.max(W/source.width,H/source.height)*zoom, dw=source.width*s, dh=source.height*s;
      const mx=(dw-W)/2/W, my=(dh-H)/2/H; fx=Math.max(-mx,Math.min(mx,fx)); fy=Math.max(-my,Math.min(my,fy));
      return {dw,dh,x:(W-dw)/2+fx*W,y:(H-dh)/2+fy*H};}
    function render(c,W,H,wm){const g=geom(W,H); c.fillStyle="#0E2A42"; c.fillRect(0,0,W,H); c.imageSmoothingQuality="high"; c.drawImage(source,g.x,g.y,g.dw,g.dh); if(wm) drawWatermark(c,W,H,logo);}
    function draw(){render(ctx,cv.width,cv.height,wmChk.checked);}
    function fit(){const r=stage.getBoundingClientRect(), d=window.devicePixelRatio||1; cv.width=Math.max(1,Math.round(r.width*d)); cv.height=Math.max(1,Math.round(r.height*d)); draw();}
    let drag=null;
    stage.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);stage.classList.add("dragging");});
    stage.addEventListener("pointermove",e=>{if(!drag)return;const r=stage.getBoundingClientRect();fx+=(e.clientX-drag.x)/r.width;fy+=(e.clientY-drag.y)/r.height;drag={x:e.clientX,y:e.clientY};draw();});
    const end=()=>{drag=null;stage.classList.remove("dragging");};
    stage.addEventListener("pointerup",end); stage.addEventListener("pointercancel",end);
    const zr=root.querySelector("#cz");
    stage.addEventListener("wheel",e=>{e.preventDefault();zoom=Math.max(1,Math.min(3,zoom*(e.deltaY<0?1.06:1/1.06)));zr.value=zoom;draw();},{passive:false});
    zr.addEventListener("input",()=>{zoom=+zr.value;draw();});
    root.querySelector("#crot").onclick=()=>{rot=(rot+90)%360;source=rotated();fx=fy=0;draw();};
    root.querySelector("#ccen").onclick=()=>{fx=fy=0;draw();};
    wmChk.onchange=draw;
    const ro=new ResizeObserver(fit); ro.observe(stage);
    function close(val){ro.disconnect();root.remove();resolve(val);}
    root.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();close(null);}});
    root.querySelector(".x").onclick=()=>close(null);
    root.querySelector("#ccancel").onclick=()=>close(null);
    root.querySelector("#cok").onclick=()=>{
      const out=document.createElement("canvas"); out.width=outW; out.height=Math.round(outW/aspect);
      render(out.getContext("2d"),out.width,out.height,wmChk.checked);
      out.toBlob(b=>close(b),"image/jpeg",.88);
    };
    fit(); try{root.querySelector("#cok").focus({preventScroll:true});}catch(_){}
  });
}

/* ---------- ficha del hotel ---------- */
function openHotelForm(){
  const h=S.hotel||{}; const ch=h.channels||{};
  const lines=a=>esc((a||[]).join("\n"));
  const body=`
    <fieldset><legend>General</legend><div class="grid g2">
      <label class="f">Nombre<input id="hoName" value="${esc(h.name||"")}"></label>
      <label class="f">Nombre en las OTAs<input id="hoOta" value="${esc(h.otaName||"")}"></label>
      <label class="f">Dirección<input id="hoAddr" value="${esc(h.address||"")}"></label>
      <label class="f">Zona<input id="hoZone" value="${esc(h.zone||"")}"></label>
      <label class="f">Teléfono<input id="hoPhone" value="${esc(h.phone||"")}"></label>
      <label class="f">WhatsApp (10 dígitos)<input id="hoWa" value="${esc(h.whatsapp||"")}" placeholder="3001234567"></label>
      <label class="f">Correo<input id="hoMail" value="${esc(h.email||"")}"></label>
      <label class="f">Recepción<input id="hoDesk" value="${esc(h.frontDesk||"")}"></label>
      <label class="f">Check-in desde<input type="time" id="hoCi1" value="${esc(h.checkinFrom||"15:00")}"></label>
      <label class="f">Check-in hasta<input type="time" id="hoCi2" value="${esc(h.checkinTo||"18:00")}"></label>
      <label class="f">Check-out<input type="time" id="hoCo" value="${esc(h.checkout||"11:00")}"></label>
      <label class="f">Medios de pago<input id="hoPay" value="${esc(h.payments||"")}"></label>
    </div>
    <label class="f">Frase de portada (sitio público)<input id="hoTag" value="${esc(h.tagline||"")}" placeholder="Tu base en el norte de Bogotá"></label>
    <label class="f">Descripción (sitio público)<textarea id="hoDesc" rows="4">${esc(h.description||"")}</textarea></label></fieldset>
    <fieldset><legend>Foto de portada del sitio</legend>
      <div class="hero-ph" id="hoHero"></div>
      <div class="grp"><label class="btn">Subir foto de portada<input type="file" id="hoHeroUp" accept="image/jpeg,image/png,image/webp" hidden></label><button class="btn danger sm" id="hoHeroRm" type="button">Quitar portada</button></div>
      <div class="muted" style="font-size:.78rem">Usa una foto horizontal y luminosa de la fachada o de la mejor habitación. Sin portada, el sitio muestra una ilustración de los cerros de Bogotá.</div>
      <div id="hoHeroNote"></div></fieldset>
    <fieldset><legend>Listas (una línea por elemento)</legend><div class="grid g2">
      <label class="f">Servicios<textarea id="hoAm" rows="6">${lines(h.amenities)}</textarea></label>
      <label class="f">Políticas<textarea id="hoPol" rows="6">${lines(h.policies)}</textarea></label>
      <label class="f">Cerca del alojamiento<textarea id="hoNear" rows="6">${lines(h.nearby)}</textarea></label>
    </div></fieldset>
    <fieldset><legend>Enlaces de los anuncios</legend><div class="grid g2">
      ${["booking","airbnb","expedia","hotels"].map(k=>`<label class="f">${esc(chan(k).n)}<input type="url" data-chl="${k}" value="${esc(ch[k]||"")}" placeholder="https://"></label>`).join("")}
    </div></fieldset>`;
  openModal("Editar ficha del alojamiento", body, `<button class="btn" id="hoCancel">Cerrar</button><button class="btn primary" id="hoSave">Guardar ficha</button>`, ov=>{
    ov.querySelector("#hoCancel").onclick=closeModal;
    let heroPhoto=h.heroPhoto||"";
    const drawHero=()=>{ov.querySelector("#hoHero").innerHTML=heroPhoto?`<img src="${photoUrl(heroPhoto)}" alt="Portada">`:`<div style="height:100%;display:grid;place-items:center;color:var(--muted)">Sin foto de portada</div>`;ov.querySelector("#hoHeroRm").hidden=!heroPhoto;};
    drawHero();
    ov.querySelector("#hoHeroUp").addEventListener("change",async e=>{
      const file=e.target.files[0]; e.target.value=""; if(!file) return;
      const note=ov.querySelector("#hoHeroNote");
      const orig=await shrink(file); const url=URL.createObjectURL(orig);
      const cropped=await cropPhoto(url,{aspect:16/9,outW:1920,title:"Encuadra la foto de portada"}); URL.revokeObjectURL(url);
      if(!cropped) return;
      note.innerHTML=`<div class="note">Subiendo portada…</div>`;
      try{const res=await api("POST","admin/photos",undefined,cropped);heroPhoto=res.id;drawHero();note.innerHTML=`<div class="note ok">Portada encuadrada y con marca de agua. Guarda la ficha para publicarla.</div>`;}
      catch(err){note.innerHTML=`<div class="note bad">${esc(err.message)}</div>`;}
    });
    ov.querySelector("#hoHeroRm").onclick=()=>{heroPhoto="";drawHero();ov.querySelector("#hoHeroNote").innerHTML=`<div class="note">Portada quitada. Guarda la ficha para aplicar el cambio.</div>`;};
    ov.querySelector("#hoSave").onclick=async()=>{
      const v=s=>ov.querySelector(s).value.trim(), L=s=>ov.querySelector(s).value.split("\n").map(x=>x.trim()).filter(Boolean);
      const channels={};ov.querySelectorAll("[data-chl]").forEach(i=>channels[i.dataset.chl]=i.value.trim());
      const rec=Object.assign({},h,{name:v("#hoName"),otaName:v("#hoOta"),address:v("#hoAddr"),zone:v("#hoZone"),phone:v("#hoPhone"),whatsapp:v("#hoWa"),email:v("#hoMail"),
        frontDesk:v("#hoDesk"),checkinFrom:v("#hoCi1"),checkinTo:v("#hoCi2"),checkout:v("#hoCo"),payments:v("#hoPay"),description:ov.querySelector("#hoDesc").value.trim(),
        tagline:v("#hoTag"),heroPhoto,
        amenities:L("#hoAm"),policies:L("#hoPol"),nearby:L("#hoNear"),channels});
      try{await save("hotel/info",rec);toast("Ficha guardada");closeModal();}catch(_){}
    };
  }, true);
}

/* ---------- adaptación a celular ---------- */
/* Etiquetas para que las tablas se lean como fichas en pantallas pequeñas */
function labelRows(tb){const hs=[...tb.closest("table").querySelectorAll("thead th")].map(th=>th.textContent.trim());
  tb.querySelectorAll("tr").forEach(tr=>[...tr.children].forEach((td,i)=>{if(!td.hasAttribute("colspan"))td.setAttribute("data-l",hs[i]||"");}));}
["#rBody","#gBody"].forEach(sel=>{const tb=$(sel);new MutationObserver(()=>labelRows(tb)).observe(tb,{childList:true});});
/* Menú de acciones del encabezado */
const hdrBtn=$("#hdrMenu"), hdrActs=$("#hdrActs");
function setHdr(open){hdrActs.classList.toggle("open",open);hdrBtn.setAttribute("aria-expanded",open);}
hdrBtn.addEventListener("click",e=>{e.stopPropagation();setHdr(!hdrActs.classList.contains("open"));});
hdrActs.addEventListener("click",e=>{if(e.target.closest("a,button"))setHdr(false);});
document.addEventListener("click",e=>{if(hdrActs.classList.contains("open")&&!e.target.closest("#hdrActs"))setHdr(false);});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&hdrActs.classList.contains("open"))setHdr(false);});

/* ---------- arranque ---------- */
initEngine();
try{const t=localStorage.getItem("pn170tab");if(t&&document.getElementById("t-"+t))S.tab=t;}catch(_){}
try{const s=JSON.parse(localStorage.getItem(TOKEN_KEY)||"null");if(s&&s.t&&s.exp>Date.now())S.token=s.t;}catch(_){}
if(S.token) startApp(); else logout();
setInterval(()=>{if(S.token&&document.visibilityState==="visible"&&!modalOpen())loadState();},60000);
document.addEventListener("visibilitychange",()=>{if(S.token&&document.visibilityState==="visible"&&!modalOpen())loadState();});
})();
