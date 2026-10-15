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
    if(kind === "hotel"){ rec = await api("PUT","admin/hotel", merge ? Object.assign({}, S.hotel, data) : data); const g = rec._gcal; delete rec._gcal; S.hotel = rec; gcalWarn(g); }
    else if(kind === "requests"){ rec = await api("PATCH","admin/requests/"+encodeURIComponent(id), data); upsert("reqs", rec); }
    else {
      const arr = ARR[kind]; const cur = S[arr].find(x=>x.id===id) || {};
      const body = merge ? Object.assign({}, cur, data) : Object.assign({}, data);
      delete body.id;
      rec = await api("PUT", `admin/${kind}/${encodeURIComponent(id)}`, body);
      const g = rec._gcal; delete rec._gcal; upsert(arr, rec); gcalWarn(g);
    }
  }catch(e){ toast(e.message || "No se pudo guardar."); throw e; }
  render(); return rec;
}
async function del(path){
  const [kind, id] = path.split("/");
  const out = await api("DELETE", `admin/${kind}/${encodeURIComponent(id)}`); gcalWarn(out && out._gcal);
  const arr = ARR[kind]; S[arr] = S[arr].filter(x=>x.id!==id); render();
}
async function loadState(){
  try{
    const j = await api("GET","admin/state");
    S.hotel=j.hotel; S.rooms=j.rooms||[]; S.guests=j.guests||[]; S.res=(j.reservations||[]).filter(r=>r.checkIn&&r.checkOut); S.reqs=j.requests||[]; S.msgs=j.messages||[]; S.links=j.links||{};
    S.loaded=true; loadIcal(); setSync("on","Actualizado " + new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"}));
    render();
  }catch(e){ if(S.token) setSync("off", e.message || "Sin conexión"); }
}
function setSync(state,txt){const s=$("#sync");s.className="icon-btn sync "+state;s.title=txt;s.querySelector("span").textContent=txt;const x=$("#syncTxt");if(x)x.textContent=(state==="on"?"● ":"○ ")+txt;}

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
// Datos mínimos para la TRA. A los acompañantes no se les exige teléfono ni ciudad (comparten los del titular).
const isCompanion=g=>S.res.some(r=>(r.companions||[]).includes(g.id));
function tra(g){const need=["first","last","docType","docNumber","nationality","birth"].concat(isCompanion(g)?[]:["phone","city"]);const miss=need.filter(k=>!g[k]);return {ok:miss.length===0 && !!g.consent, miss};}

/* ---------- pestañas ---------- */
$("#tabs").addEventListener("click", e=>{const b=e.target.closest("button[data-t]");if(b)setTab(b.dataset.t);});
function setTab(t){S.tab=t;document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.t===t));
  document.querySelectorAll("section.tab").forEach(s=>s.hidden = s.id!=="t-"+t);
  try{localStorage.setItem("pn170tab",t);}catch(_){}
  render();}
document.addEventListener("click", e=>{
  const a=e.target.closest("[data-act]"); if(a){const act=a.dataset.act;
    if(act==="newRes") openResForm({}); if(act==="newGuest") openGuestForm({}); if(act==="newRoom") openRoomForm({}); if(act==="editHotel") openHotelForm(); return;}
  const o=e.target.closest("[data-open]"); if(o){e.preventDefault();openResDetail(o.dataset.open);return;}
  const ci=e.target.closest("[data-ci]"); if(ci){doCheckIn(ci.dataset.ci);return;}
  const co=e.target.closest("[data-co]"); if(co){doCheckOut(co.dataset.co);return;}
});

/* ---------- render ---------- */
function render(){
  if($("#app").hidden) return;
  $("#cRes").textContent = S.res.filter(r=>active(r) && r.checkOut>=todayISO()).length || "";
  $("#cSol").textContent = (S.reqs.filter(x=>x.status==="nueva").length + (S.msgs||[]).filter(x=>x.status==="nueva").length) || "";
  $("#cGu").textContent = S.guests.length || "";
  $("#cRo").textContent = S.rooms.length || "";
  if(S.hotel){ $("#hName").innerHTML = nameHTML(S.hotel.name||"Portal Norte 170").replace(/^Hotel\s+/,'<span class="hp">Hotel </span>'); $("#hAddr").textContent = (S.hotel.address||"") + (S.hotel.zone? " · "+S.hotel.zone : ""); }
  ({panel:renderPanel,plano:renderPlano,cal:renderCal,motor:renderEngineOptions,res:renderRes,sol:()=>{renderSol();renderMsgs();},hues:renderGuests,hab:renderRooms,aloj:renderHotel}[S.tab]||(()=>{}))();
}
function liRes(r, actions){
  const ro = roomById(r.roomId);
  return `<div class="li"><div class="who"><b>${esc(resGuest(r))}</b>
    <small>Hab. ${esc(ro?ro.number:"?")} · ${fd(r.checkIn)} → ${fd(r.checkOut)} · <span class="ch" style="--c:${chan(r.channel).c}">${esc(chan(r.channel).n)}</span></small></div>
    <div class="grp" style="gap:6px">${actions||""}<button class="btn sm" data-open="${esc(r.id)}">Ver</button></div></div>`;
}
function renderPanel(){
  const t = todayISO(), R = S.dashR || 7, nRooms = S.rooms.length || 10;
  $("#todayLbl").textContent = "Resumen de reservas y actividad · " + new Intl.DateTimeFormat("es-CO",{timeZone:"America/Bogota",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
  document.querySelectorAll("#dashRange button").forEach(b=>b.setAttribute("aria-pressed", String(+b.dataset.r===R)));
  renderPanelAlerts();
  const act = S.res.filter(active);
  const inHouse = act.filter(r=>r.checkIn<=t && r.checkOut>t);
  const arr = act.filter(r=>r.checkIn===t), dep = act.filter(r=>r.checkOut===t);
  // ventas: reservas que entran este mes vs. el mes anterior
  const month=t.slice(0,7), pm=(()=>{const [y,m]=month.split("-").map(Number);return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,"0")}`;})();
  const rev=mm=>act.filter(r=>r.checkIn.slice(0,7)===mm).reduce((s,r)=>s+(Number(r.total)||0),0);
  const monthRev=rev(month), prevRev=rev(pm);
  const delta=(a,b)=>b>0?Math.round((a-b)/b*100):null;
  const dRev=delta(monthRev,prevRev);
  const debtList=act.filter(r=>balance(r)>0 && r.checkIn<=addDays(t,7)), debt=debtList.reduce((s,r)=>s+balance(r),0);
  const chipD=(d,ghost)=>d==null?"":`<span class="chip ${ghost?"ghost":d>=0?"up":"down"}">${d>=0?"+":""}${d}%</span>`;
  // ocupación del periodo elegido (noches-habitación)
  const occ=(from,n)=>{let used=0;for(let i=0;i<n;i++){const d=addDays(from,i);used+=act.filter(r=>r.checkIn<=d&&r.checkOut>d).length;}return {used,cap:n*nRooms,pct:n*nRooms?Math.round(used/(n*nRooms)*100):0};};
  const cur=occ(t,R), prev=occ(addDays(t,-R),R), dOcc=cur.pct-prev.pct;
  const comingN=act.filter(r=>r.checkIn>t&&r.checkIn<addDays(t,R)).length;
  // medidor: habitaciones ocupadas esta noche
  const tonight=inHouse.length, pctT=Math.round(tonight/nRooms*100), guestsIn=inHouse.reduce((s,r)=>s+(Number(r.adults)||1)+(Number(r.children)||0),0);
  const segs=22, filled=Math.round(tonight/nRooms*segs);
  let gs="";
  for(let i=0;i<segs;i++){const a=Math.PI*(1-(i+.5)/segs), cx=160+Math.cos(a)*118, cy=160-Math.sin(a)*118, deg=90-(a*180/Math.PI);
    const k=filled>1?i/(filled-1):1, col=i<filled?`rgb(${Math.round(63+(14-63)*k)},${Math.round(107+(42-107)*k)},${Math.round(147+(66-147)*k)})`:"var(--soft-2)";
    gs+=`<rect x="${(cx-5.5).toFixed(1)}" y="${(cy-20).toFixed(1)}" width="11" height="40" rx="5.5" fill="${col}" transform="rotate(${deg.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;}
  $("#kpis").innerHTML = `
    <div class="stack">
      <div class="panel kpi-dark"><div class="w-h"><h3>Ventas del mes</h3><button class="more" type="button" data-go="res" aria-label="Ver reservas">···</button></div>
        <div class="big" style="margin-top:14px">${cop(monthRev)}</div>
        <div class="kpi-row">${chipD(dRev,true)}<small>${dRev==null?"reservas que entran este mes":"frente al mes anterior"}</small></div></div>
      <div class="panel"><div class="w-h"><h3>Saldo por cobrar</h3><button class="more" type="button" data-go="res" aria-label="Ver reservas">···</button></div>
        <div class="big" style="margin-top:14px;font-size:2rem">${cop(debt)}</div>
        <div class="kpi-row"><span class="chip">${debtList.length} reserva${debtList.length===1?"":"s"}</span><small>con llegada en los próximos 7 días</small></div></div>
    </div>
    <div class="panel"><div class="w-h"><h3>Ocupación</h3><button class="more" type="button" data-go="cal" aria-label="Ver disponibilidad">···</button></div>
      <div class="seg" style="margin-top:12px" role="group" aria-label="Periodo">${[7,14,30].map(n=>`<button type="button" data-r="${n}" aria-pressed="${n===R}">${n} días</button>`).join("")}</div>
      <div class="kpi-row" style="justify-content:space-between;margin-top:18px"><div class="big">${cur.used}<small style="font-size:1rem;color:var(--muted);font-weight:500"> / ${cur.cap} noches</small></div><span class="chip ${dOcc>=0?"up":"down"}">${dOcc>=0?"+":""}${dOcc}%</span></div>
      <div class="progress" role="img" aria-label="Ocupación ${cur.pct}%"><i style="width:${Math.max(2,cur.pct)}%"></i></div>
      <div class="p-foot"><span>Ocupación <b>${cur.pct}%</b> · próximos ${R} días</span><span><b>+${comingN}</b> llegadas</span></div></div>
    <div class="panel gauge-card"><div class="w-h"><h3>Esta noche</h3><button class="more" type="button" data-go="cal" aria-label="Ver disponibilidad">···</button></div>
      <div class="gauge"><svg viewBox="0 0 320 190" role="img" aria-label="${tonight} de ${nRooms} habitaciones ocupadas">${gs}</svg>
        <div class="center"><b>${tonight}<span style="font-size:1.2rem;color:var(--muted)">/${nRooms}</span></b><small>habitaciones ocupadas</small></div></div>
      <div class="g-foot">${guestsIn} huésped${guestsIn===1?"":"es"} en casa · ${arr.length} llegada${arr.length===1?"":"s"} y ${dep.length} salida${dep.length===1?"":"s"} hoy <span class="chip">${pctT}%</span></div></div>`;
  // estadística semanal + próximas llegadas
  const days=[...Array(7)].map((_,i)=>addDays(t,i));
  const vals=days.map(d=>Math.round(act.filter(r=>r.checkIn<=d&&r.checkOut>d).length/nRooms*100));
  const avg=Math.round(vals.reduce((a,b)=>a+b,0)/7), hi=vals.indexOf(Math.max(...vals));
  const wd=d=>new Intl.DateTimeFormat("es-CO",{timeZone:"UTC",weekday:"short"}).format(new Date(d+"T12:00:00Z")).replace(".","");
  const next=act.filter(r=>r.checkIn>=t).sort((a,b)=>a.checkIn.localeCompare(b.checkIn)).slice(0,4);
  const chCount={}; act.filter(r=>r.checkIn.slice(0,7)===month).forEach(r=>chCount[r.channel]=(chCount[r.channel]||0)+1);
  const ini=n=>String(n||"?").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();
  $("#dash2").innerHTML = `
    <div class="panel"><div class="w-h"><h3>Ocupación de la semana</h3><div class="seg" role="group" aria-label="Vista"><button type="button" aria-pressed="true">Por noche</button><button type="button" data-go="cal" aria-pressed="false">Calendario</button></div></div>
      <div class="stats"><div class="lead"><b>${avg}%</b><small>ocupación promedio de los próximos 7 días · día más alto: ${wd(days[hi])}</small></div>
        <div class="bars">${days.map((d,i)=>`<div class="b ${i===hi&&vals[i]>0?"hi":[0,6].includes(dow(d))?"we":""}" title="${fd(d,{weekday:"long"})}: ${vals[i]}% ocupado"><span class="chip ${vals[i]<30?"down":""}">${vals[i]}%</span><span class="col" style="height:${Math.max(6,vals[i])}%"></span><small>${wd(d)}</small></div>`).join("")}</div></div></div>
    <div class="panel arrivals"><div class="w-h"><h3>Próximas llegadas</h3><button class="more" type="button" data-go="res" aria-label="Ver reservas">···</button></div>
      <div class="arr-list">${next.map(r=>{const ro=roomById(r.roomId);return `<button class="arr" type="button" data-open="${esc(r.id)}"><span class="who"><span class="av">${esc(ini(resGuest(r)))}</span><span><b>${esc(resGuest(r))}</b><small>${r.checkIn===t?"Llega hoy":"Llega el "+fd(r.checkIn,{weekday:"short"})} · ${nights(r)} noche${nights(r)===1?"":"s"} · ${esc(chan(r.channel).n)}</small></span></span>
        <span class="badge"><i>${esc(ro?ro.number:"?")}</i>${esc(ro?(ro.type||"Hab."):"Hab.")}</span></button>`;}).join("")||`<div class="empty">No hay llegadas programadas.</div>`}</div>
      ${Object.keys(chCount).length?`<div class="ch-row">${Object.entries(chCount).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<span class="ch" style="--c:${chan(k).c}">${esc(chan(k).n)} · ${n}</span>`).join("")}</div>`:""}</div>`;
  const ciBtn = r => (r.status==="encasa"||r.block)?'':`<button class="btn sm primary" data-ci="${esc(r.id)}">Check-in</button>`;
  const coBtn = r => (r.status==="finalizada"||r.block)?'':`<button class="btn sm" data-co="${esc(r.id)}">Check-out</button>`;
  $("#arr").innerHTML = arr.map(r=>liRes(r,ciBtn(r))).join("") || `<div class="empty">No hay llegadas programadas para hoy.</div>`;
  $("#dep").innerHTML = dep.map(r=>liRes(r,coBtn(r))).join("") || `<div class="empty">No hay salidas programadas para hoy.</div>`;
  $("#inh").innerHTML = inHouse.map(r=>liRes(r,"")).join("") || `<div class="empty">No hay huéspedes alojados esta noche.</div>`;
}
$("#t-panel").addEventListener("click",e=>{
  const r=e.target.closest("[data-r]"); if(r){S.dashR=+r.dataset.r;try{localStorage.setItem("pn170dashR",S.dashR);}catch(_){}renderPanel();return;}
  const g=e.target.closest("[data-go]"); if(g){setTab(g.dataset.go);return;}
});
try{const v=+localStorage.getItem("pn170dashR");if([7,14,30].includes(v))S.dashR=v;}catch(_){}
$("#dashPrint").onclick=async()=>{
  const t=todayISO(), R=S.dashR||7, end=addDays(t,R);
  const list=S.res.filter(r=>active(r)&&r.checkIn<end&&r.checkOut>t).sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
  if(!list.length){toast("No hay reservas en ese periodo.");return;}
  const b=$("#dashPrint"); b.disabled=true;
  try{const logo=await PNDocs.logoBadge();PNDocs.openPdf(PNDocs.reservationList({hotel:S.hotel||{},rows:resRows(list),title:"Reservas del periodo",subtitle:`Del ${fd(t,{year:"numeric"})} al ${fd(addDays(end,-1),{year:"numeric"})}`,logo}).blob(),`Reservas-${t}.pdf`);}catch(e){toast("No se pudo generar el PDF.");}
  b.disabled=false;
};

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
  S.resList=list;
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
  <div class="panel" id="gcalCard"></div>
  <div class="panel" id="icalCard"></div>
  <div class="panel" id="waCard"></div>
  <div class="panel" id="notifyCard"></div>
  <div class="panel" id="contractCard"></div>
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
  renderGcal(); renderIcal(); renderWa(); renderNotify(); loadContractCard();
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
      <label class="f">Huésped<select id="fGuest">${d.source==="ical"?`<option value="__none">${esc(d.guestName||"Sin ficha todavía")} (sin ficha)</option>`:""}<option value="__new">+ Registrar huésped nuevo</option>${guests.map(g=>opt(g.id,`${gName(g)} · ${g.docType||""} ${g.docNumber||""}`,d.guestId)).join("")}</select></label>
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
    if(!d.guestId) g.value=d.source==="ical"?"__none":"__new";
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
          guestId:guestId==="__none"?"":guestId,guestName:guestId==="__none"?(d.guestName||""):gName(guestById(guestId)),channel:ov.querySelector("#fChan").value,externalRef:ov.querySelector("#fExt").value.trim(),status:ov.querySelector("#fSt").value,
          rate:Number(ov.querySelector("#fRate").value)||0,total:Number(ov.querySelector("#fTotal").value)||0,paid:Number(ov.querySelector("#fPaid").value)||0,
          payMethod:ov.querySelector("#fPay").value,notes:ov.querySelector("#fNotes").value,
          createdAt:d.createdAt||new Date().toISOString()};
        await save("reservations/"+id,rec,true);
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
    ${r.source==="ical"?`<div class="note ${r.conflict&&r.conflict.length&&active(r)?"bad":""}">${r.conflict&&r.conflict.length&&active(r)?`<b>Posible sobreventa:</b> se cruza con ${r.conflict.map(c=>`<a href="#" data-open="${esc(c)}">${esc(c)}</a>`).join(", ")}. Reubica una de las dos reservas.<br>`:""}
      ${r.block?"Fechas bloqueadas":"Reserva importada"} automáticamente del calendario de ${esc(chan(r.channel).n)}. Las fechas se actualizan solas desde el canal${r.status==="cancelada"&&r.autoCancelled?"; se canceló porque desapareció del canal":""}. Puedes asociar el huésped, registrar el valor y los pagos.</div>`:""}
    <div class="panel" id="dOnline"></div>
    ${r.notes?`<div class="panel"><div class="eyebrow">Notas</div><p style="margin:.3em 0 0;white-space:pre-wrap">${esc(r.notes)}</p></div>`:""}
    <div class="panel" id="dPays">${paysHTML(r)}</div>
    <div id="dPayBox"><fieldset><legend>Registrar pago</legend><div class="grid g3" style="align-items:end">
      <label class="f">Valor (COP)<input type="number" id="dPay" min="0" step="1000" value="${Math.max(0,balance(r))}"></label>
      <label class="f">Medio<select id="dPayM">${PAY.map(x=>opt(x,x,r.payMethod||"Efectivo")).join("")}</select></label>
      <label class="f">Fecha<input type="date" id="dPayD" value="${todayISO()}"></label>
      <label class="f">Referencia<input id="dPayR" maxlength="60" placeholder="Opcional"></label>
      <label class="btn" id="dPayPhL" style="justify-content:center">📎 Foto del comprobante<input type="file" id="dPayPh" accept="image/*" hidden></label>
      <button class="btn primary" id="dPayGo">Registrar abono</button></div>
      <div id="dPayPrev" class="muted" style="font-size:.8rem;margin-top:6px"></div></fieldset></div>`;
  const canCI = ["pendiente","confirmada"].includes(r.status), canCO = r.status==="encasa";
  const foot=`<button class="btn danger" id="dDel">Cancelar reserva</button><span style="flex:1"></span><button class="btn" id="dEdit">Editar</button>
    ${canCI?`<button class="btn primary" id="dCI">Hacer check-in</button>`:""}${canCO?`<button class="btn primary" id="dCO">Hacer check-out</button>`:""}`;
  openModal((r.source==="ical"&&!r.guestId?"":"Reserva de ")+resGuest(r), body, foot, ov=>{
    ov.querySelector("#dEdit").onclick=()=>openResForm(r);
    fillOnline(ov.querySelector("#dOnline"),r);
    const gb=ov.querySelector("#dGuest"); if(gb) gb.onclick=()=>openGuestForm(g);
    const ci=ov.querySelector("#dCI"); if(ci) ci.onclick=()=>doCheckIn(r.id);
    const co=ov.querySelector("#dCO"); if(co) co.onclick=()=>doCheckOut(r.id);
    const delB=ov.querySelector("#dDel");
    if(r.status==="cancelada"){delB.textContent="Eliminar definitivamente";confirmBtn(delB,"Toca otra vez para eliminar",async()=>{try{await del("reservations/"+r.id);toast("Reserva eliminada");closeModal();}catch(e){toast(e.message);}});}
    else confirmBtn(delB,"Toca otra vez para confirmar",async()=>{try{await save("reservations/"+r.id,{status:"cancelada"},true);toast("Reserva cancelada");closeModal();}catch(_){}});
    bindPays(ov,r);
    if(r.status==="cancelada") ov.querySelector("#dPayBox").hidden=true;
  }, true);
}
async function doCheckIn(id,o){o=o||{};const r=S.res.find(x=>x.id===id);if(!r)return;const g=guestById(r.guestId);
  if(g && !tra(g).ok){toast("Completa la ficha del huésped (TRA) antes del check-in.");openGuestForm(g,{afterSave:()=>doCheckIn(id)});return;}
  if(!r.contract && !o.skipContract){ openContractSign(r,{onDone:()=>doCheckIn(id,{skipContract:true}),allowSkip:()=>doCheckIn(id,{skipContract:true})}); return; }
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
    <fieldset><legend>Fotos de identificación</legend>
      <div class="idshots" id="gPh"></div>
      <div class="muted" style="font-size:.76rem">Privadas: solo se ven con sesión de administrador. El huésped también puede subirlas desde su enlace de check-in en línea.</div></fieldset>
    <label class="f">Notas (preferencias, observaciones)<textarea id="gNotes">${esc(g.notes||"")}</textarea></label>
    ${stays.length?`<div class="panel"><div class="eyebrow">Historial de estancias</div><div class="list">${stays.map(r=>liRes(r,"")).join("")}</div></div>`:""}
    ${(()=>{const pays=stays.flatMap(r=>(r.payments||[]).map(p=>({r,p}))).sort((a,b)=>String(b.p.at).localeCompare(String(a.p.at)));
      const tot=pays.filter(x=>x.p.status==="verificado").reduce((a,x)=>a+(Number(x.p.amount)||0),0);
      return pays.length?`<div class="panel" id="gPays"><div class="toolbar"><div class="eyebrow">Historial de pagos</div><span class="muted" style="font-size:.84rem">Verificado: <b class="num">${cop(tot)}</b></span></div><div class="paylist">${pays.map(x=>payRow(x.r,x.p,true)).join("")}</div></div>`:"";})()}`;
  const foot=`${isNew?"":`<button class="btn danger" id="gDel">Eliminar ficha</button><span style="flex:1"></span>`}<button class="btn" id="gCancel">Cerrar</button><button class="btn primary" id="gSave">${isNew?"Registrar huésped":"Guardar ficha"}</button>`;
  const ph={selfie:g.selfie||"",docFront:g.docFront||"",docBack:g.docBack||""}, phOld=new Set(), phNew=new Set();
  openModal(isNew?"Nuevo huésped":gName(g), body, foot, ov=>{
    const gp=ov.querySelector("#gPays"); if(gp) hydrateIdImgs(gp);
    ov.querySelector("#gCancel").onclick=()=>{phNew.forEach(id=>api("DELETE","admin/ids/"+encodeURIComponent(id)).catch(()=>{}));closeModal();};
    const box=ov.querySelector("#gPh");
    const drawPh=()=>{box.innerHTML=Object.entries(ID_LABELS).map(([k,l])=>`<div class="idshot">
        <div class="im ${k==="selfie"?"tall":"docim"}">${ph[k]?`<img data-idimg="${esc(ph[k])}" alt="${esc(l)}">`:`<span>Sin foto</span>`}</div>
        <b>${esc(l)}</b>
        <div class="grp"><label class="btn sm">${ph[k]?"Cambiar":"Tomar o subir"}<input type="file" accept="image/*" ${k==="selfie"?'capture="user"':""} data-up="${k}" hidden></label>
          ${ph[k]?`<button class="btn sm" type="button" data-view="${k}">Ver</button><button class="btn sm" type="button" data-rmph="${k}">Quitar</button>`:""}</div></div>`).join("");
      hydrateIdImgs(box);};
    drawPh();
    box.addEventListener("change",async e=>{const inp=e.target.closest("[data-up]");if(!inp||!inp.files[0])return;const k=inp.dataset.up;
      const lbl=inp.parentElement; lbl.firstChild.textContent="Subiendo…";
      try{const blob=await shrink(inp.files[0]);const d=await api("POST","admin/ids",undefined,blob);
        if(ph[k]) (phNew.has(ph[k])?api("DELETE","admin/ids/"+encodeURIComponent(ph[k])).catch(()=>{}):phOld.add(ph[k]));
        ph[k]=d.id;phNew.add(d.id);drawPh();}catch(err){toast(err.message);drawPh();}});
    box.addEventListener("click",async e=>{const v=e.target.closest("[data-view]");if(v){try{showImage(await idImgUrl(ph[v.dataset.view]),"foto-"+v.dataset.view+".jpg",gName(g));}catch(err){toast(err.message);}return;}
      const rm=e.target.closest("[data-rmph]");if(rm){const k=rm.dataset.rmph;phNew.has(ph[k])?api("DELETE","admin/ids/"+encodeURIComponent(ph[k])).catch(()=>{}):phOld.add(ph[k]);ph[k]="";drawPh();}});
    const delB=ov.querySelector("#gDel");
    if(delB) confirmBtn(delB, stays.length?"Tiene reservas: toca otra vez para eliminar igual":"Toca otra vez para eliminar", async()=>{try{await del("guests/"+g.id);toast("Ficha eliminada");closeModal();}catch(e){toast(e.message);}});
    ov.querySelector("#gSave").onclick=async()=>{
      const v=s=>ov.querySelector(s).value.trim();
      if(!v("#gFirst")){toast("El nombre es obligatorio.");return;}
      const id=g.id||genId("G");
      const rec={first:v("#gFirst"),last:v("#gLast"),docType:v("#gDocT"),docNumber:v("#gDoc"),nationality:v("#gNat"),birth:v("#gBirth"),sex:v("#gSex"),job:v("#gJob"),
        phone:v("#gPhone"),email:v("#gEmail"),city:v("#gCity"),emergency:v("#gEmer"),origin:v("#gFrom"),destination:v("#gTo"),purpose:v("#gWhy"),transport:v("#gTr"),
        consent:ov.querySelector("#gCons").checked,notes:ov.querySelector("#gNotes").value,createdAt:g.createdAt||new Date().toISOString(),
        selfie:ph.selfie,docFront:ph.docFront,docBack:ph.docBack};
      try{await save("guests/"+id,rec,true); phOld.forEach(pid=>api("DELETE","admin/ids/"+encodeURIComponent(pid)).catch(()=>{}));toast(isNew?"Huésped registrado":"Ficha guardada");closeModal();
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
    <fieldset><legend>Calendarios de Booking y Airbnb (iCal)</legend>
      <div class="muted" style="font-size:.8rem">Pega el enlace de exportación de esta habitación en cada canal. Las reservas y fechas cerradas se importan cada 15 minutos, bloquean la habitación aquí y pasan a tu Google Calendar.</div>
      <div id="roFeeds" style="display:flex;flex-direction:column;gap:8px"></div>
      <button class="btn sm" type="button" id="roFeedAdd" style="align-self:flex-start">+ Agregar calendario</button>
      <div id="roExport"></div></fieldset>
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
    let feeds=(r.icalFeeds||[]).map(f=>Object.assign({},f));
    const fbox=ov.querySelector("#roFeeds");
    function readFeeds(){fbox.querySelectorAll("[data-fi]").forEach(row=>{const f=feeds[+row.dataset.fi];f.channel=row.querySelector("select").value;f.url=row.querySelector("input").value.trim();});}
    function drawFeeds(){
      const st=(S.ical&&S.ical.status&&S.ical.status.feeds)||{};
      fbox.innerHTML=feeds.map((f,i)=>{const x=st[f.id];return `<div class="feed-row" data-fi="${i}">
        <select aria-label="Canal">${ICAL_CH.map(c=>opt(c,chan(c).n,f.channel||"booking")).join("")}</select>
        <input type="url" inputmode="url" placeholder="https://admin.booking.com/hotel/hoteladmin/ical.html?t=…" value="${esc(f.url||"")}" aria-label="Enlace iCal">
        <button class="btn sm" type="button" data-frm="${i}">Quitar</button>
        ${x?`<small class="${x.ok?"ok":"bad"}">${x.ok?`Última lectura ${fdt(x.at)} · ${x.events} evento${x.events===1?"":"s"}`:`Error: ${esc(x.error)}`}</small>`:""}</div>`;}).join("")||`<div class="empty" style="padding:10px">Sin calendarios conectados.</div>`;}
    drawFeeds();
    fbox.addEventListener("click",e=>{const b=e.target.closest("[data-frm]");if(!b)return;readFeeds();feeds.splice(+b.dataset.frm,1);drawFeeds();});
    ov.querySelector("#roFeedAdd").onclick=()=>{readFeeds();const used=feeds.map(f=>f.channel);feeds.push({id:genId("F"),channel:used.includes("booking")?(used.includes("airbnb")?"otro":"airbnb"):"booking",url:""});drawFeeds();fbox.querySelector(".feed-row:last-child input").focus();};
    const exBox=ov.querySelector("#roExport");
    const drawExport=()=>{const ex=S.ical&&S.ical.exports&&S.ical.exports[id];
      exBox.innerHTML=isNew?`<div class="muted" style="font-size:.8rem">Después de crear la habitación verás aquí los enlaces para exportar su disponibilidad.</div>`
      :ex?`<div class="eyebrow" style="margin-top:6px">Enlaces para pegar en cada canal (exportar)</div>
        <div class="muted" style="font-size:.8rem;margin:2px 0 6px">Así Booking y Airbnb también cierran las fechas vendidas aquí o en el otro canal. No contienen datos de huéspedes.</div>
        ${["booking","airbnb"].map(c=>`<div class="grp" style="margin-top:6px"><span style="min-width:96px;font-size:.84rem">${esc(chan(c).n)}</span><input readonly value="${esc(location.origin+ex[c])}" style="flex:1 1 220px;font-family:var(--mono);font-size:.74rem"><button class="btn sm" type="button" data-cp="${esc(location.origin+ex[c])}">Copiar</button></div>`).join("")}`
      :`<div class="muted" style="font-size:.8rem">Los enlaces de exportación aparecen cuando TOKEN_SECRET está configurado.</div>`;};
    if(!S.ical) loadIcal().then(()=>{if(ov.isConnected){drawFeeds();drawExport();}}); drawExport();
    exBox.addEventListener("click",e=>{const b=e.target.closest("[data-cp]");if(b)copyText(b.dataset.cp);});
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
      readFeeds(); const bad=feeds.find(x=>x.url&&!/^(https|webcal):\/\//i.test(x.url));
      if(bad){toast("Los enlaces iCal deben empezar por https://");return;}
      const before=JSON.stringify(r.icalFeeds||[]); rec.icalFeeds=feeds.filter(x=>x.url);
      delete rec.id;
      try{await save("rooms/"+id,rec);toast(isNew?"Habitación creada":"Habitación guardada");closeModal();
        if(JSON.stringify(rec.icalFeeds)!==before && rec.icalFeeds.length) runIcalSync(true);}catch(_){}
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
      <label class="f">Medios de pago (se muestran al huésped para pagar)<textarea id="hoPay" rows="2" placeholder="Transferencia Bancolombia ahorros 000-000000-00 · Nequi 300 000 0000">${esc(h.payments||"")}</textarea></label>
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

/* ---------- Google Calendar ---------- */
function gcalWarn(g){
  if(!g) return;
  if(g.ok===false||g.failed) setTimeout(()=>toast("Se guardó, pero Google Calendar no se actualizó ("+(g.error||"error")+"). Se reintentará automáticamente."),1400);
  if(S.gcal) S.gcal=null; // refresca la tarjeta la próxima vez que se muestre
}
async function loadGcal(){ try{ S.gcal=await api("GET","admin/gcal/status"); }catch(_){ S.gcal={error:true}; } renderGcal(); }
function renderGcal(){
  const box=$("#gcalCard"); if(!box) return;
  if(!S.gcal){ box.innerHTML=`<div class="empty">Consultando la conexión con Google Calendar…</div>`; loadGcal(); return; }
  const g=S.gcal, feed=g.feedPath?location.origin+g.feedPath:"";
  const sub=feed?"https://calendar.google.com/calendar/r?cid="+encodeURIComponent(feed.replace(/^https?:/,"webcal:")):"";
  const last=g.last, q=g.queue||{count:0};
  const lastHtml=!g.configured?"":last?(last.ok?`<div class="note ok">Última sincronización correcta: ${esc(fdt(last.at))}${last.resId?" · "+esc(last.resId):""}.</div>`
      :`<div class="note bad">Último intento falló (${esc(fdt(last.at))}): ${esc(last.error||"")}</div>`):`<div class="note">Aún no se ha escrito ningún evento. Usa «Probar conexión».</div>`;
  const qHtml=q.count?`<div class="note warn" style="margin-top:6px">${q.count} reserva${q.count===1?"":"s"} pendiente${q.count===1?"":"s"} de llegar al calendario (se reintenta cada 15 min). <button class="btn sm" id="gcalRetry" type="button">Reintentar ahora</button></div>`:"";
  box.innerHTML=`
    <div class="toolbar"><div class="grp"><h3>Google Calendar</h3>${g.configured?(last&&last.ok===false?'<span class="pill bad">Con errores</span>':'<span class="pill ok">Conectado</span>'):'<span class="pill warn">Sin conectar</span>'}</div>
      <div class="grp">${g.configured?`<button class="btn sm" id="gcalTest" type="button">Probar conexión</button><button class="btn sm primary" id="gcalSync" type="button">Sincronizar todas las reservas</button>`:""}</div></div>
    <div class="grid g2" style="margin-top:12px">
      <div><div class="eyebrow">Tiempo real</div>
        ${g.configured?`<p style="margin:.4em 0 0;font-size:.88rem">Al instante, en el calendario <b>${esc(g.calendarId)}</b>: reservas nuevas, cambios de fechas, habitación o estado, cancelaciones, check-in en línea, contrato firmado y cambios en la ficha del huésped o la habitación. Conexión: ${g.mode==="oauth"?`cuenta de Google${g.connectedEmail?` <b>${esc(g.connectedEmail)}</b>`:" (OAuth)"}`:"cuenta de servicio"}.${g.connectedEmail?` <button class="btn sm" id="gcalOff" type="button" style="margin-left:6px">Desconectar</button>`:""}</p>${lastHtml}${qHtml}`
          :g.hasClient?`<div class="note warn" style="margin-top:8px"><b>Último paso:</b> pulsa el botón, entra con <b>${esc(g.calendarId||"cbernal@gesoltec.co")}</b> y acepta los permisos.</div>
            <button class="btn primary" id="gcalConnect" type="button" style="margin-top:10px">Conectar con Google</button>`
          :`<p style="margin:.4em 0 0;font-size:.88rem">Aún no está conectado: por eso las reservas solo llegan por el enlace iCal (Google lo revisa cada pocas horas). Sigue la guía del README, sección «Google Calendar». Cuando Google te pida el <b>URI de redireccionamiento autorizado</b>, copia este:</p>
            <div class="grp" style="margin-top:6px"><input id="gcalRedir" readonly value="${esc(g.redirectUri||"")}" style="flex:1 1 220px;font-family:var(--mono);font-size:.78rem"><button class="btn sm" id="gcalRedirCp" type="button">Copiar</button></div>`}
        <div id="gcalNote" style="margin-top:8px"></div></div>
      <div><div class="eyebrow">Enlace privado iCal (respaldo)</div>
        ${feed?`<p style="margin:.4em 0 6px;font-size:.88rem">Solo lectura y lento: Google lo revisa cada varias horas. ${g.configured?"Con la conexión en tiempo real activa no lo necesitas en Google Calendar (si lo tienes suscrito, verás cada reserva duplicada).":""} Úsalo en Apple Calendar u Outlook. No lo compartas: muestra nombres y teléfonos.</p>
          <div class="grp"><input id="gcalFeed" readonly value="${esc(feed)}" style="flex:1 1 220px;font-family:var(--mono);font-size:.78rem"><button class="btn sm" id="gcalCopy" type="button">Copiar</button></div>
          ${g.configured?"":`<a class="btn sm" style="margin-top:8px" href="${esc(sub)}" target="_blank" rel="noopener">Agregar a Google Calendar</a>`}`
          :`<p style="margin:.4em 0 0;font-size:.88rem">Disponible cuando se configure TOKEN_SECRET en Netlify.</p>`}</div>
    </div>`;
  const cn=$("#gcalConnect"); if(cn) cn.onclick=async()=>{ cn.disabled=true; cn.textContent="Abriendo Google…"; try{ const r=await api("GET","admin/gcal/connect"); location.href=r.url; }catch(e){ toast(e.message); cn.disabled=false; cn.textContent="Conectar con Google"; } };
  const rc=$("#gcalRedirCp"); if(rc) rc.onclick=()=>copyText($("#gcalRedir").value);
  const off=$("#gcalOff"); if(off) confirmBtn(off,"¿Seguro? Toca otra vez",async()=>{ try{ await api("DELETE","admin/gcal/connect"); toast("Google Calendar desconectado"); S.gcal=null; renderGcal(); }catch(e){ toast(e.message); } });
  const ts=$("#gcalTest"); if(ts) ts.onclick=async()=>{
    ts.disabled=true; ts.textContent="Probando…"; const n=$("#gcalNote");
    try{const r=await api("POST","admin/gcal/test");
      n.innerHTML=r.ok?`<div class="note ok">Conexión correcta: se creó y borró un evento de prueba en <b>${esc(r.calendarId)}</b>.</div>`
        :`<div class="note bad"><b>Falló en «${esc(r.step)}»:</b> ${esc(r.error)}${r.hint?`<br>${esc(r.hint)}`:""}</div>`;}
    catch(e){n.innerHTML=`<div class="note bad">${esc(e.message)}</div>`;}
    ts.disabled=false; ts.textContent="Probar conexión";
  };
  const rt=$("#gcalRetry"); if(rt) rt.onclick=async()=>{
    rt.disabled=true; try{const r=await api("POST","admin/gcal/retry"); toast(r.failed?`${r.ok} enviada(s), ${r.failed} siguen fallando.`:`${r.ok} reserva(s) enviadas al calendario.`);}catch(e){toast(e.message);}
    S.gcal=null; renderGcal();
  };
  const cp=$("#gcalCopy"); if(cp) cp.onclick=()=>{const i=$("#gcalFeed");const fb=()=>{i.focus();i.select();toast("Enlace seleccionado: cópialo con Ctrl+C.");};try{navigator.clipboard.writeText(i.value).then(()=>toast("Enlace copiado"),fb);}catch(_){fb();}};
  const sy=$("#gcalSync"); if(sy) sy.onclick=async()=>{
    sy.disabled=true; sy.textContent="Sincronizando…"; const n=$("#gcalNote");
    try{const r=await api("POST","admin/gcal/sync");
      n.innerHTML=r.failed?`<div class="note warn">${r.ok} de ${r.total} reservas sincronizadas. Errores: ${esc(r.errors.join(" · "))}</div>`:`<div class="note ok">${r.ok} reserva${r.ok===1?"":"s"} sincronizada${r.ok===1?"":"s"} con Google Calendar.</div>`;}
    catch(e){n.innerHTML=`<div class="note bad">${esc(e.message)}</div>`;}
    sy.disabled=false; sy.textContent="Sincronizar todas las reservas";
  };
}

/* ---------- Booking / Airbnb (iCal) ---------- */
const ICAL_CH=["booking","airbnb","expedia","hotels","otro"];
const fdt=iso=>{try{return new Intl.DateTimeFormat("es-CO",{timeZone:"America/Bogota",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(iso));}catch(_){return "";}};
function copyText(t){try{navigator.clipboard.writeText(t).then(()=>toast("Enlace copiado"),()=>toast("No se pudo copiar; selecciónalo y copia con Ctrl+C."));}catch(_){toast("Selecciona el enlace y cópialo con Ctrl+C.");}}
async function loadIcal(){try{S.ical=await api("GET","admin/ical/status");}catch(_){S.ical={error:true};} renderIcal(); if(S.tab==="panel") renderPanelAlerts();}
let icalBusy=false;
async function runIcalSync(quiet){
  if(icalBusy) return; icalBusy=true; renderIcal();
  try{const r=await api("POST","admin/ical/sync");
    if(r.skipped){ if(!quiet) toast(r.message); }
    else{ const t=r.totals||{}; const ch=(t.added||0)+(t.updated||0)+(t.cancelled||0);
      toast(r.ok===false?"Algunos calendarios no se pudieron leer; revisa la tarjeta de Booking y Airbnb.":ch?`Canales sincronizados: ${t.added} nueva(s), ${t.updated} actualizada(s), ${t.cancelled} cancelada(s).`:"Canales sincronizados: sin cambios.");
      if(r.gcal&&r.gcal.failed) setTimeout(()=>toast("Google Calendar: "+r.gcal.error),1600);}
    await loadState();
  }catch(e){toast(e.message);}
  icalBusy=false; await loadIcal();
}
function renderPanelAlerts(){
  const box=$("#panelAlerts"); if(!box) return; const t=todayISO();
  const conf=S.res.filter(r=>r.source==="ical"&&active(r)&&r.checkOut>t&&r.conflict&&r.conflict.length);
  const errs=S.ical&&S.ical.status?Object.values(S.ical.status.feeds||{}).filter(f=>!f.ok):[];
  box.innerHTML=(conf.length?`<div class="note bad" style="margin-bottom:12px"><b>Posible sobreventa.</b> ${conf.length} reserva${conf.length>1?"s":""} de los canales se cruza${conf.length>1?"n":""} con otra en la misma habitación: ${conf.map(r=>{const ro=roomById(r.roomId);return `<a href="#" data-open="${esc(r.id)}">Hab. ${esc(ro?ro.number:"?")} · ${fd(r.checkIn)}</a>`;}).join(", ")}.</div>`:"")
    +(pendingPays()?`<div class="note warn" style="margin-bottom:12px"><b>${pendingPays()} comprobante${pendingPays()>1?"s":""} de pago por verificar.</b> ${S.res.filter(r=>(r.payments||[]).some(p=>p.status==="por verificar")).map(r=>`<a href="#" data-open="${esc(r.id)}">${esc(resGuest(r))} · ${esc(r.id)}</a>`).join(", ")}</div>`:"")
    +((S.msgs||[]).some(m=>m.status==="nueva")?`<div class="note" style="margin-bottom:12px"><b>${S.msgs.filter(m=>m.status==="nueva").length} mensaje(s) de contacto sin atender.</b> Míralos en Solicitudes.</div>`:"")
    +(errs.length?`<div class="note warn" style="margin-bottom:12px">${errs.length} calendario${errs.length>1?"s":""} de Booking/Airbnb no se pudo leer en la última sincronización. Revísalo en Alojamiento.</div>`:"");
}
function renderIcal(){
  const box=$("#icalCard"); if(!box) return;
  if(!S.ical){box.innerHTML=`<div class="empty">Consultando los calendarios de los canales…</div>`;loadIcal();return;}
  const st=(S.ical.status)||null, fs=(st&&st.feeds)||{};
  const rows=sortRooms().map(ro=>{const feeds=ro.icalFeeds||[];
    return `<tr><td data-l="Habitación"><span><b>${esc(ro.number)}</b> <span class="muted">${esc(ro.type||"")}</span></span></td>
      <td data-l="Calendarios"><div>${feeds.length?feeds.map(f=>{const x=fs[f.id];return `<div class="feed-st"><span class="ch" style="--c:${chan(f.channel).c}">${esc(chan(f.channel).n)}</span> ${x?(x.ok?`<span class="ok">✓ ${x.events} evento${x.events===1?"":"s"}</span>`:`<span class="bad" title="${esc(x.error)}">✕ ${esc(x.error)}</span>`):`<span class="muted">pendiente</span>`}</div>`;}).join(""):`<span class="muted">Sin conectar</span>`}</div></td>
      <td class="r" data-l=""><button class="btn sm" type="button" data-icroom="${esc(ro.id)}">Configurar</button></td></tr>`;}).join("");
  const n=S.rooms.reduce((a,r)=>a+(r.icalFeeds||[]).length,0);
  box.innerHTML=`
    <div class="toolbar"><div class="grp"><h3>Booking y Airbnb (iCal)</h3>${n?`<span class="pill ${st&&st.ok===false?"warn":"ok"}">${n} calendario${n>1?"s":""}</span>`:'<span class="pill warn">Sin conectar</span>'}</div>
      ${n?`<button class="btn sm primary" id="icalSync" type="button" ${icalBusy?"disabled":""}>${icalBusy?"Sincronizando…":"Sincronizar ahora"}</button>`:""}</div>
    <p style="margin:.5em 0 0;font-size:.88rem;max-width:80ch">Las reservas y fechas cerradas de cada canal se importan solas cada 15 minutos. Bloquean la habitación en el panel y en el sitio, y se envían a Google Calendar. Si una reserva desaparece del canal, se cancela aquí. ${st?`Última sincronización: <b>${fdt(st.at)}</b>${st.reason==="manual"?" (manual)":""}.`:"Todavía no se ha sincronizado."}</p>
    <div class="tablewrap" style="margin-top:10px"><table class="ical-tbl"><thead><tr><th>Habitación</th><th>Calendarios</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const sy=$("#icalSync"); if(sy) sy.onclick=()=>runIcalSync(false);
  box.querySelectorAll("[data-icroom]").forEach(b=>b.onclick=()=>openRoomForm(roomById(b.dataset.icroom)));
}

/* ---------- fotos de identidad (privadas: se cargan con la sesión) ---------- */
const ID_LABELS={selfie:"Selfie",docFront:"Documento (frente)",docBack:"Documento (reverso)"};
const IDIMG=new Map();
function idImgUrl(id){ if(IDIMG.has(id)) return IDIMG.get(id);
  const p=(async()=>{const r=await fetch("/api/admin/ids/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+S.token}});if(!r.ok) throw new Error("No se pudo cargar la foto.");return URL.createObjectURL(await r.blob());})();
  IDIMG.set(id,p); p.catch(()=>IDIMG.delete(id)); return p; }
async function idBlob(id){const r=await fetch("/api/admin/ids/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+S.token}});if(!r.ok) throw new Error("foto");return r.blob();}
function hydrateIdImgs(root){root.querySelectorAll("img[data-idimg]").forEach(async img=>{try{img.src=await idImgUrl(img.dataset.idimg);}catch(_){img.replaceWith(Object.assign(document.createElement("span"),{textContent:"No disponible"}));}});}

/* ---------- enlace del huésped, PDF, impresión y WhatsApp ---------- */
const guestLink=id=>S.links&&S.links[id]?location.origin+S.links[id]:"";
const resPeople=r=>[r.guestId,...(r.companions||[])].filter((v,i,a)=>v&&a.indexOf(v)===i).map(guestById).filter(Boolean);
const canShareFiles=(()=>{try{return !!(navigator.canShare&&navigator.canShare({files:[new File([""],"x.pdf",{type:"application/pdf"})]}));}catch(_){return false;}})();
async function confPdf(r){const logo=await PNDocs.logoBadge();return PNDocs.confirmation({hotel:S.hotel||{},res:r,room:roomById(r.roomId),guest:guestById(r.guestId)||{first:resGuest(r)},link:guestLink(r.id),logo}).blob();}
async function sheetPdf(r){
  const logo=await PNDocs.logoBadge();
  const people=await Promise.all(resPeople(r).map(async g=>{const photos={};
    await Promise.all(Object.keys(ID_LABELS).filter(k=>g[k]).map(async k=>{try{photos[k]=await PNDocs.toJpeg(await idBlob(g[k]),{max:900});}catch(_){}}));
    return {g,photos};}));
  return PNDocs.reservationSheet({hotel:S.hotel||{},res:r,room:roomById(r.roomId),people,link:guestLink(r.id),logo}).blob();
}
function waText(r){
  const h=S.hotel||{}, ro=roomById(r.roomId), g=guestById(r.guestId), first=(g?g.first:resGuest(r)).split(" ")[0], link=guestLink(r.id), bal=balance(r);
  const st={pendiente:"recibida y pendiente de confirmación",confirmada:"confirmada",encasa:"activa",finalizada:"finalizada",cancelada:"cancelada"}[r.status]||r.status;
  return [`Hola ${first}, te saluda ${h.name||"Hotel Portal Norte 170"}.`,`Tu reserva *${r.id}* está ${st}.`,"",
    `🏨 Habitación ${ro?ro.number+" · "+(ro.name||ro.type||""):""}`,
    `📅 Llegada: ${fd(r.checkIn,{weekday:"long",day:"numeric",month:"long"})} desde las ${h.checkinFrom||"15:00"}`,
    `📅 Salida: ${fd(r.checkOut,{weekday:"long",day:"numeric",month:"long"})} antes de las ${h.checkout||"11:00"}`,
    `👥 ${r.adults||1} adulto(s)${r.children?`, ${r.children} niño(s)`:""} · ${nights(r)} noche(s)`,
    r.total?`💵 Total ${cop(r.total)} · Abonado ${cop(r.paid)} · Saldo ${cop(bal)}`:null,"",
    link?(r.checkin?`Aquí puedes ver y descargar tu confirmación en PDF:\n${link}`:`✅ Antes de llegar, haz tu check-in en línea: llena el registro hotelero (TRA), sube la selfie y el documento de cada huésped y firma el contrato con las políticas del hotel. Ahí mismo descargas tu confirmación en PDF:\n${link}`):null,"",
    h.address?`📍 ${h.address}${h.zone?" · "+h.zone:""}`:null].filter(x=>x!==null).join("\n");
}
function fillOnline(box,r){
  if(!box) return; const link=guestLink(r.id), ppl=resPeople(r), ci=r.checkin, g=guestById(r.guestId);
  box.innerHTML=`<div class="toolbar"><div><div class="eyebrow">Huésped en línea</div><b>Confirmación, check-in y documentos</b></div>
      ${ci?`<span class="pill ok">Check-in en línea: ${ci.people} persona${ci.people===1?"":"s"} · ${fdt(ci.at)}</span>`:`<span class="pill warn">Check-in en línea pendiente</span>`}</div>
    ${link?`<div class="grp" style="margin-top:10px"><input readonly value="${esc(link)}" style="flex:1 1 240px;font-family:var(--mono);font-size:.74rem" aria-label="Enlace del huésped"><button class="btn sm" type="button" data-on="copy">Copiar enlace</button>
      <a class="btn sm primary" target="_blank" rel="noopener" href="${esc(PNDocs.waUrl(g&&g.phone,waText(r)))}">Enviar por WhatsApp</a></div>
      <div class="muted" style="font-size:.76rem;margin-top:4px">${g&&g.phone?"Se abre WhatsApp con el mensaje listo para "+esc(g.phone)+".":"La reserva no tiene teléfono: WhatsApp te pedirá elegir el contacto."} El huésped ve su confirmación, descarga el PDF y hace el check-in con selfie y documento.</div>`
      :`<div class="note warn" style="margin-top:10px">Configura TOKEN_SECRET en Netlify para generar enlaces de huésped.</div>`}
    <div class="ct-status ${r.contract?"ok":""}">
      <div><span class="eyebrow">Contrato y políticas</span>
        ${r.contract?`<b>Firmado por ${esc(r.contract.signerName)}</b><small>${fdt(r.contract.signedAt)} · ${r.contract.via==="recepcion"?"en recepción":"en línea"} · código ${esc(r.contract.hash)}</small>`
          :`<b>Pendiente de firma</b><small>Se firma con el check-in: el huésped desde su enlace o aquí en recepción.</small>`}</div>
      <div class="grp">${r.contract?`<button class="btn sm primary" type="button" data-on="ctpdf">Ver contrato (PDF)</button><button class="btn sm" type="button" data-on="ctvoid">Anular firma</button>`
          :(r.status!=="cancelada"?`<button class="btn sm primary" type="button" data-on="ctsign">Firmar en recepción</button>`:"")}</div>
    </div>
    <div class="doc-acts">
      <div><span class="eyebrow">Confirmación</span><div class="grp"><button class="btn sm" type="button" data-on="cpdf">Descargar PDF</button><button class="btn sm" type="button" data-on="cprint">Imprimir</button>${canShareFiles?`<button class="btn sm" type="button" data-on="cshare">Compartir PDF</button>`:""}</div></div>
      <div><span class="eyebrow">Ficha y registro hotelero</span><div class="grp"><button class="btn sm" type="button" data-on="spdf">Descargar PDF</button><button class="btn sm" type="button" data-on="sprint">Imprimir</button></div></div>
    </div>
    ${ppl.length?`<div class="ppl">${ppl.map((p,i)=>`<button type="button" class="pp" data-gid="${esc(p.id)}">
      <span class="av">${p.selfie?`<img data-idimg="${esc(p.selfie)}" alt="">`:esc((p.first||"?")[0])}</span>
      <span><b>${esc(gName(p))}</b><small>${i===0?"Titular":"Acompañante"} · ${esc(p.docType||"")} ${esc(p.docNumber||"sin documento")}${p.docFront?" · 🪪":""}${tra(p).ok?"":" · <em>TRA incompleta</em>"}</small></span></button>`).join("")}</div>`:""}`;
  hydrateIdImgs(box);
  box.querySelectorAll(".pp small em").forEach(e=>{e.outerHTML=`<span style="color:var(--warn)">TRA incompleta</span>`;});
  const run=async(btn,fn)=>{const t=btn.textContent;btn.disabled=true;btn.textContent="Generando…";try{await fn();}catch(e){toast(e.message||"No se pudo generar el PDF.");}btn.disabled=false;btn.textContent=t;};
  box.onclick=e=>{
    const pp=e.target.closest("[data-gid]"); if(pp){openGuestForm(guestById(pp.dataset.gid));return;}
    const b=e.target.closest("[data-on]"); if(!b) return; const a=b.dataset.on, name=n=>`${n}-${r.id}.pdf`;
    if(a==="copy") copyText(link);
    if(a==="ctsign") openContractSign(r,{});
    if(a==="ctpdf") run(b,async()=>{const rr=await fetch("/api/admin/contract/"+encodeURIComponent(r.id)+".pdf",{headers:{Authorization:"Bearer "+S.token}});if(!rr.ok)throw new Error("No se pudo abrir el contrato.");PNDocs.openPdf(await rr.blob(),name("Contrato"));});
    if(a==="ctvoid"){ if(!b.dataset.armed){b.dataset.armed="1";b.textContent="¿Anular? Toca otra vez";setTimeout(()=>{b.textContent="Anular firma";delete b.dataset.armed;},3500);return;}
      api("DELETE","admin/contract/"+encodeURIComponent(r.id)).then(async()=>{toast("Firma anulada: el huésped debe firmar de nuevo.");await loadState();const nr=S.res.find(x=>x.id===r.id);closeModal();if(nr)openResDetail(nr.id);}).catch(e=>toast(e.message)); }
    if(a==="cpdf") run(b,async()=>PNDocs.download(await confPdf(r),name("Confirmacion")));
    if(a==="cprint") run(b,async()=>PNDocs.printPdf(await confPdf(r),name("Confirmacion")));
    if(a==="cshare") run(b,async()=>{if(!(await PNDocs.sharePdf(await confPdf(r),name("Confirmacion"),waText(r)))) toast("Este navegador no permite compartir archivos.");});
    if(a==="spdf") run(b,async()=>PNDocs.download(await sheetPdf(r),name("Ficha")));
    if(a==="sprint") run(b,async()=>PNDocs.printPdf(await sheetPdf(r),name("Ficha")));
  };
}
function resRows(list){const short={directo:"Directo",web:"Sitio web"};
  return list.map(r=>{const ro=roomById(r.roomId);return {id:r.id,guest:resGuest(r),room:ro?String(ro.number):"?",in:fd(r.checkIn,{year:"numeric"}),out:fd(r.checkOut,{year:"numeric"}),
    nights:nights(r),people:(Number(r.adults)||1)+(Number(r.children)||0),channel:short[r.channel]||chan(r.channel).n,status:(STATUS[r.status]||{n:r.status}).n,total:r.status==="cancelada"?0:r.total,balance:r.status==="cancelada"?0:Math.max(0,balance(r))};});}
async function printList(){
  const list=S.resList||[]; if(!list.length){toast("No hay reservas en la lista para imprimir.");return;}
  const sel=id=>{const e=$(id);return e&&e.selectedIndex>=0?e.options[e.selectedIndex].text:"";};
  const rows=resRows(list);
  const q=$("#rQ").value.trim();
  const sub=[sel("#rWhen"),$("#rSt").value?sel("#rSt"):"",$("#rCh").value?sel("#rCh"):"",q?`búsqueda «${q}»`:""].filter(Boolean).join(" · ");
  const b=$("#rPrint"); b.disabled=true;
  try{const logo=await PNDocs.logoBadge();PNDocs.openPdf(PNDocs.reservationList({hotel:S.hotel||{},rows,subtitle:sub,logo}).blob(),`Reservas-${todayISO()}.pdf`);}catch(e){toast("No se pudo generar el listado.");}
  b.disabled=false;
}
$("#rPrint").onclick=printList;

/* ---------- contrato: firma en recepción ---------- */
async function openContractSign(r,opts){
  opts=opts||{}; let c;
  try{ c=await api("GET","admin/contract/text"); }catch(e){ toast(e.message); return; }
  const g=guestById(r.guestId)||{};
  openModal("Contrato de hospedaje · "+resGuest(r), `
    <div class="note">Entrega el dispositivo al huésped titular para que lea, marque las declaraciones y firme. Al firmar se genera el PDF del contrato y queda guardado en la reserva.</div>
    <div id="rcForm" style="display:flex;flex-direction:column;gap:12px">${PNSign.formHTML(c,{name:gName(guestById(r.guestId))!=="Huésped sin ficha"?gName(guestById(r.guestId)):"",doc:g.docNumber||""})}</div>
    <div id="rcErr" role="alert"></div>`,
    `${opts.allowSkip?`<button class="btn" id="rcSkip">Check-in sin firma</button><span style="flex:1"></span>`:""}<button class="btn" id="rcCancel">Cancelar</button><button class="btn primary" id="rcSign">Firmar contrato</button>`, ov=>{
      const collect=PNSign.mount(ov.querySelector("#rcForm"));
      ov.querySelector("#rcCancel").onclick=closeModal;
      const sk=ov.querySelector("#rcSkip"); if(sk) confirmBtn(sk,"Toca otra vez: queda sin respaldo firmado",()=>{closeModal();opts.allowSkip();});
      ov.querySelector("#rcSign").onclick=async()=>{
        const v=collect(), err=ov.querySelector("#rcErr"); err.innerHTML="";
        if(v.error){err.innerHTML=`<div class="note bad">${esc(v.error)}</div>`;return;}
        const b=ov.querySelector("#rcSign"); b.disabled=true; b.textContent="Firmando…";
        try{ await api("POST","admin/contract/"+encodeURIComponent(r.id),v.data); toast("Contrato firmado y guardado en PDF"); await loadState(); closeModal();
          if(opts.onDone) opts.onDone(); else openResDetail(r.id); }
        catch(e){ err.innerHTML=`<div class="note bad">${esc(e.message)}</div>`; b.disabled=false; b.textContent="Firmar contrato"; }
      };
    }, true);
}
async function loadContractCard(){
  const box=$("#contractCard"); if(!box) return;
  let c; try{ c=await api("GET","admin/contract/text"); }catch(e){ box.innerHTML=`<div class="note bad">${esc(e.message)}</div>`; return; }
  const h=S.hotel||{};
  box.innerHTML=`<div class="toolbar"><div class="grp"><h3>Contrato y políticas</h3><span class="pill ${c.isDefault?"info":"ok"}">Versión ${esc(c.version)}${c.isDefault?" · texto original":" · personalizado"}</span></div>
      <button class="btn sm" type="button" id="ctPrev">Vista previa</button></div>
    <p class="muted" style="font-size:.86rem;margin:.5em 0 10px">El huésped lo lee y firma al hacer el check-in (en línea o en recepción). Si cambias el texto se crea una versión nueva; los contratos ya firmados conservan su versión. Formato: «# » título, «## » subtítulo, «- » viñeta, «> » cláusula destacada.</p>
    <label class="f">Texto del contrato<textarea id="ctText" rows="14" style="font-family:var(--mono);font-size:.78rem;line-height:1.5">${esc(c.text)}</textarea></label>
    <div class="grid g3" style="margin-top:10px;align-items:end">
      <label class="f">Red Wi‑Fi<input id="ctWifi" value="${esc(h.wifiName||"")}" placeholder="Nombre de la red"></label>
      <label class="f">Contraseña Wi‑Fi<input id="ctWifiP" value="${esc(h.wifiPass||"")}"></label>
      <div class="muted" style="font-size:.76rem">El Wi‑Fi se le muestra al huésped solo después de firmar el contrato.</div></div>
    <div class="grp" style="margin-top:12px"><button class="btn primary" type="button" id="ctSave">Guardar</button>${c.isDefault?"":`<button class="btn" type="button" id="ctReset">Restaurar texto original</button>`}</div>`;
  $("#ctSave").onclick=async()=>{const t=$("#ctText").value.trim();
    try{await save("hotel",{contractText:t===c.defaultText.trim()?"":t,wifiName:$("#ctWifi").value.trim(),wifiPass:$("#ctWifiP").value.trim()},true);toast("Contrato guardado");}catch(_){}};
  const rs=$("#ctReset"); if(rs) confirmBtn(rs,"Toca otra vez para restaurar",async()=>{try{await save("hotel",{contractText:""},true);toast("Texto original restaurado");}catch(_){}});
  $("#ctPrev").onclick=()=>openModal("Vista previa del contrato",`<div class="ct-box" style="max-height:none">${PNSign.toHTML($("#ctText").value)}</div>`,`<button class="btn" onclick="closeModal()">Cerrar</button>`,null,true);
}

/* ---------- notificaciones por correo ---------- */
async function loadNotify(){try{S.notify=await api("GET","admin/notify/status");}catch(_){S.notify={error:true};}renderNotify();}
function renderNotify(){
  const box=$("#notifyCard"); if(!box) return;
  if(!S.notify){box.innerHTML=`<div class="empty">Consultando las notificaciones…</div>`;loadNotify();return;}
  const n=S.notify, h=S.hotel||{}, prov={resend:"Resend",gmail:"Gmail (cuenta de Google conectada)"}[n.provider];
  const on=!!n.provider&&!h.notifyOff, last=n.last;
  box.innerHTML=`
    <div class="toolbar"><div class="grp"><h3>Notificaciones por correo</h3>${on?'<span class="pill ok">Activas</span>':n.provider?'<span class="pill warn">En pausa</span>':'<span class="pill warn">Sin servicio de correo</span>'}</div>
      ${n.provider?`<button class="btn sm primary" type="button" id="nTest">Enviar correo de prueba</button>`:""}</div>
    <div class="grid g2" style="margin-top:12px">
      <div><label class="f">Enviar los avisos a<input id="nTo" type="text" inputmode="email" value="${esc(h.notifyEmail||(n.to||[]).join(", ")||n.defaultTo||"")}" placeholder="correo@dominio.com, otro@dominio.com"></label>
        <label class="f chk" style="margin-top:8px"><input type="checkbox" id="nOff" ${h.notifyOff?"checked":""}> Pausar los avisos por correo</label>
        <button class="btn sm" type="button" id="nSave" style="margin-top:8px">Guardar</button></div>
      <div><div class="eyebrow">Te llega un correo cuando</div>
        <ul style="margin:.4em 0 0;padding-left:18px;font-size:.86rem;line-height:1.6"><li>alguien pide una reserva en el sitio web</li><li>un huésped completa el check-in en línea</li><li>entra o se cancela una reserva de Booking o Airbnb</li><li>hay una posible sobreventa o un calendario falla</li></ul>
        <div style="font-size:.84rem;margin-top:8px">${prov?`Servicio: <b>${esc(prov)}</b>.`:`Falta configurar el servicio de correo en Netlify (README, sección «Notificaciones por correo»).`}</div>
        ${last?`<div class="note ${last.ok?"ok":"bad"}" style="margin-top:8px">Último envío ${fdt(last.at)} · «${esc(last.subject)}»: ${last.ok?"entregado al servicio":esc(last.error||"falló")}</div>`:""}
        <div id="nNote" style="margin-top:8px"></div></div>
    </div>`;
  $("#nSave").onclick=async()=>{const v=$("#nTo").value.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);
    if(!v.length||v.some(x=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))){toast("Revisa los correos: sepáralos con coma.");return;}
    try{await save("hotel",{notifyEmail:v.join(", "),notifyOff:$("#nOff").checked},true);toast("Notificaciones guardadas");S.notify=null;renderNotify();}catch(_){}};
  const t=$("#nTest"); if(t) t.onclick=async()=>{t.disabled=true;t.textContent="Enviando…";
    try{await api("POST","admin/notify/test");$("#nNote").innerHTML=`<div class="note ok">Correo de prueba enviado a ${esc((n.to||[]).join(", "))}. Revisa también la carpeta de spam.</div>`;}
    catch(e){$("#nNote").innerHTML=`<div class="note bad">${esc(e.message)}</div>`;}
    t.disabled=false;t.textContent="Enviar correo de prueba";loadNotify();};
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

/* ---------- pagos con comprobante ---------- */
const PST={"verificado":{n:"Verificado",cls:"ok"},"por verificar":{n:"Por verificar",cls:"warn"},"rechazado":{n:"Rechazado",cls:"bad"}};
function payRow(r,p,withRes){
  const st=PST[p.status]||{n:p.status,cls:""};
  return `<div class="payrow">${p.photoId?`<button type="button" class="paythumb" data-payview="${esc(p.photoId)}" data-cap="${esc("Comprobante · "+cop(p.amount)+" · "+p.method+" · "+fd(p.date))}" aria-label="Ver comprobante" title="Ver comprobante"><img data-idimg="${esc(p.photoId)}" alt=""><i>Ver</i></button>`:`<span class="paythumb none" title="Sin foto">—</span>`}
    <div class="pinfo"><div class="grp" style="gap:8px"><b class="num">${cop(p.amount)}</b><span class="pill ${st.cls}">${st.n}</span></div>
      <small>${esc(p.method)} · ${fd(p.date)}${p.ref?" · ref. "+esc(p.ref):""} · ${p.by==="huesped"?"subido por el huésped":"recepción"}${withRes?` · <a href="#" data-open="${esc(r.id)}">${esc(r.id)}</a>`:""}</small>${p.note?`<small>${esc(p.note)}</small>`:""}</div>
    ${withRes?"":`<div class="grp" style="gap:6px">${p.status==="por verificar"?`<button class="btn sm primary" data-payst="${esc(p.id)}|verificado">Verificar</button><button class="btn sm" data-payst="${esc(p.id)}|rechazado">Rechazar</button>`:""}${p.status==="rechazado"?`<button class="btn sm" data-payst="${esc(p.id)}|verificado">Verificar</button>`:""}<button class="btn sm danger" data-paydel="${esc(p.id)}">Quitar</button></div>`}</div>`;
}
function paysHTML(r){
  const list=(r.payments||[]).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  const pend=list.filter(p=>p.status==="por verificar").length;
  return `<div class="toolbar"><div class="eyebrow">Pagos y comprobantes</div>${pend?`<span class="pill warn">${pend} por verificar</span>`:""}</div>
    ${list.length?`<div class="paylist">${list.map(p=>payRow(r,p)).join("")}</div>`:`<div class="muted" style="font-size:.86rem;margin-top:6px">Sin pagos con comprobante. El huésped puede subir la foto desde su enlace, o regístralo abajo.</div>`}`;
}
function bindPays(ov,r){
  let photo="";
  const box=ov.querySelector("#dPays"); hydrateIdImgs(box);
  // Trae los comprobantes que el huésped haya subido mientras el panel estaba abierto.
  api("GET","admin/state").then(j=>{const fresh=(j.reservations||[]).find(x=>x.id===r.id); if(!fresh||!box.isConnected) return;
    if(JSON.stringify(fresh.payments||[])!==JSON.stringify(r.payments||[])){ upsert("res",fresh); redraw(fresh); render(); }}).catch(()=>{});
  const redraw=rec=>{ r=rec; box.innerHTML=paysHTML(rec); hydrateIdImgs(box); };
  const after=rec=>{ const g=rec._gcal; delete rec._gcal; upsert("res",rec); gcalWarn(g); render(); redraw(rec); const k=ov.querySelector("#dPay"); if(k) k.value=Math.max(0,balance(rec)); };
  box.addEventListener("click",async e=>{
    const st=e.target.closest("[data-payst]"); if(st){ const [pid,status]=st.dataset.payst.split("|"); st.disabled=true;
      try{ after(await api("PATCH",`admin/payments/${encodeURIComponent(r.id)}/${encodeURIComponent(pid)}`,{status})); toast(status==="verificado"?"Pago verificado y sumado al abonado":"Pago marcado como rechazado"); }catch(err){ toast(err.message); st.disabled=false; } return; }
    const d=e.target.closest("[data-paydel]"); if(d){ if(d.dataset.sure!=="1"){ d.dataset.sure="1"; d.textContent="¿Quitar?"; return; }
      try{ after(await api("DELETE",`admin/payments/${encodeURIComponent(r.id)}/${encodeURIComponent(d.dataset.paydel)}`)); toast("Pago quitado"); }catch(err){ toast(err.message); } }
  });
  const inp=ov.querySelector("#dPayPh"), prevBox=ov.querySelector("#dPayPrev");
  if(inp) inp.onchange=async()=>{ const f=inp.files&&inp.files[0]; if(!f) return; prevBox.textContent="Subiendo foto…";
    try{ const blob=await shrink(f); const d=await api("POST","admin/ids",undefined,blob); if(photo) api("DELETE","admin/ids/"+encodeURIComponent(photo)).catch(()=>{}); photo=d.id; prevBox.innerHTML=`✓ Foto adjunta: <b>${esc(f.name)}</b>`; ov.querySelector("#dPayPhL").classList.add("primary"); }
    catch(err){ prevBox.innerHTML=`<span style="color:var(--bad)">${esc(err.message)}</span>`; toast(err.message); } inp.value=""; };
  const go=ov.querySelector("#dPayGo"); if(go) go.onclick=async()=>{ const amount=Number(ov.querySelector("#dPay").value)||0; if(amount<=0){toast("Escribe un valor mayor que cero.");return;}
    go.disabled=true;
    try{ after(await api("POST","admin/payments/"+encodeURIComponent(r.id),{amount,method:ov.querySelector("#dPayM").value,date:ov.querySelector("#dPayD").value,ref:ov.querySelector("#dPayR").value,photoId:photo}));
      toast("Abono de "+cop(amount)+" registrado"); photo=""; prevBox.textContent=""; ov.querySelector("#dPayPhL").classList.remove("primary"); ov.querySelector("#dPayR").value=""; }
    catch(err){ toast(err.message); } go.disabled=false; };
}
document.addEventListener("click",async e=>{const v=e.target.closest("[data-payview]"); if(!v) return; e.preventDefault();
  try{ showImage(await idImgUrl(v.dataset.payview), "comprobante-"+v.dataset.payview+".jpg", v.dataset.cap||"Comprobante de pago"); }catch(err){ toast(err.message); }});
const pendingPays=()=>S.res.reduce((n,r)=>n+(r.payments||[]).filter(p=>p.status==="por verificar").length,0);

/* ---------- mensajes de contacto ---------- */
function waLink(phone,text){ const d=String(phone||"").replace(/\D/g,""); const n=d.length===10&&d.startsWith("3")?"57"+d:d; return n?`https://wa.me/${n}${text?"?text="+encodeURIComponent(text):""}`:""; }
function renderMsgs(){
  const box=$("#msgList"); if(!box) return;
  const f=$("#mSt").value, list=(S.msgs||[]).filter(x=>!f||x.status===f).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  box.innerHTML=list.map(x=>{const wa=waLink(x.phone,`Hola ${String(x.name||"").split(" ")[0]}, te escribimos de ${S.hotel&&S.hotel.name||"Hotel Portal Norte 170"} por tu mensaje.`);
    return `<div class="panel" style="display:flex;flex-direction:column;gap:8px">
      <div class="toolbar"><div class="grp"><b>${esc(x.name)}</b><span class="pill ${x.status==="nueva"?"warn":"ok"}">${x.status==="nueva"?"Nuevo":"Atendido"}</span>${x.afterHours?`<span class="pill">Fuera de horario</span>`:""}${x.topic?`<span class="chip">${esc(x.topic)}</span>`:""}</div>
        <span class="muted num" style="font-size:.76rem">${esc(x.id)} · ${esc(new Date(x.createdAt).toLocaleString("es-CO",{dateStyle:"medium",timeStyle:"short"}))}</span></div>
      <div style="white-space:pre-wrap;font-size:.9rem">${esc(x.message)}</div>
      <div class="muted" style="font-size:.84rem">${esc(x.phone)}${x.email?" · "+esc(x.email):""}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn sm danger" data-mdel="${esc(x.id)}">Eliminar</button>
        ${x.email?`<a class="btn sm" href="mailto:${esc(x.email)}">Correo</a>`:""}
        <a class="btn sm" href="tel:${esc(String(x.phone).replace(/[^\d+]/g,""))}">Llamar</a>
        ${wa?`<a class="btn sm" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>`:""}
        ${x.status==="nueva"?`<button class="btn sm primary" data-mdone="${esc(x.id)}">Marcar atendido</button>`:`<button class="btn sm" data-mnew="${esc(x.id)}">Marcar como nuevo</button>`}</div></div>`;}).join("")
    || `<div class="empty">${S.loaded?(f==="nueva"?"No hay mensajes nuevos.":"Aún no hay mensajes de contacto."):"Cargando…"}</div>`;
}
$("#mSt").addEventListener("change",renderMsgs);
$("#msgList").addEventListener("click",async e=>{
  const done=e.target.closest("[data-mdone],[data-mnew]");
  if(done){ const id=done.dataset.mdone||done.dataset.mnew; try{ const rec=await api("PATCH","admin/messages/"+encodeURIComponent(id),{status:done.dataset.mdone?"atendida":"nueva"}); S.msgs=S.msgs.map(m=>m.id===id?rec:m); render(); }catch(err){toast(err.message);} return; }
  const d=e.target.closest("[data-mdel]"); if(d){ if(d.dataset.sure!=="1"){d.dataset.sure="1";d.textContent="¿Eliminar?";return;}
    try{ await api("DELETE","admin/messages/"+encodeURIComponent(d.dataset.mdel)); S.msgs=S.msgs.filter(m=>m.id!==d.dataset.mdel); render(); toast("Mensaje eliminado"); }catch(err){toast(err.message);} }
});

/* ---------- WhatsApp ---------- */
async function loadWa(){ try{ S.wa=await api("GET","admin/wa/status"); }catch(_){ S.wa={error:true}; } renderWa(); }
function renderWa(){
  const box=$("#waCard"); if(!box) return;
  if(!S.wa){ box.innerHTML=`<div class="empty">Consultando WhatsApp…</div>`; loadWa(); return; }
  const w=S.wa, h=S.hotel||{}, on=!!w.provider&&!h.waOff, last=w.last, hrs=w.hours||{from:"08:00",to:"18:00"};
  box.innerHTML=`
    <div class="toolbar"><div class="grp"><h3>Avisos por WhatsApp</h3>${on?'<span class="pill ok">Activos</span>':w.provider?'<span class="pill warn">En pausa</span>':'<span class="pill warn">Sin conectar</span>'}</div>
      ${w.provider?`<button class="btn sm primary" type="button" id="waTest">Enviar WhatsApp de prueba</button>`:""}</div>
    <div class="grid g2" style="margin-top:12px">
      <div><div class="eyebrow">Te llega un WhatsApp cuando</div>
        <ul style="margin:.4em 0 0;padding-left:18px;font-size:.86rem;line-height:1.6"><li>alguien envía una solicitud de reserva</li><li>alguien escribe por el formulario de contacto</li><li>un huésped sube un comprobante de pago</li></ul>
        <div style="font-size:.84rem;margin-top:8px">${w.provider?`Servicio: <b>${({greenapi:"Green-API",meta:"WhatsApp Cloud API (Meta)",callmebot:"CallMeBot",twilio:"Twilio"})[w.provider]||w.provider}</b> · a ${esc((w.phones||[]).join(", "))}.`:`Falta configurar WhatsApp en Netlify (README, sección «Avisos por WhatsApp»).`}</div>
        ${last?`<div class="note ${last.ok?"ok":"bad"}" style="margin-top:8px">Último envío ${fdt(last.at)} (${esc(last.kind||"")}): ${last.ok?"enviado":esc(last.error||"falló")}</div>`:""}
        <label class="f chk" style="margin-top:8px"><input type="checkbox" id="waOff" ${h.waOff?"checked":""}> Pausar los avisos por WhatsApp</label>
        <div id="waNote" style="margin-top:8px"></div></div>
      <div><div class="eyebrow">Horario de atención</div>
        <div class="grid g2" style="margin-top:6px"><label class="f">Desde<input type="time" id="waFrom" value="${esc(hrs.from)}"></label><label class="f">Hasta<input type="time" id="waTo" value="${esc(hrs.to)}"></label></div>
        <p style="font-size:.84rem;margin:.5em 0">Si alguien escribe o pide una reserva fuera de este horario, el sitio le responde: <i>«Nuestro horario de atención es de ${esc(w.hoursText||"8:00 a. m. a 6:00 p. m.")} (hora de Colombia)»</i>, y tu aviso lo marca como fuera de horario. Ahora: <b>${w.openNow?"dentro del horario":"fuera de horario"}</b>.</p>
        <button class="btn sm" type="button" id="waSave">Guardar</button></div>
    </div>`;
  $("#waSave").onclick=async()=>{ const from=$("#waFrom").value, to=$("#waTo").value; if(!from||!to||from===to){toast("Revisa el horario.");return;}
    try{ await save("hotel",{attentionFrom:from,attentionTo:to,waOff:$("#waOff").checked},true); toast("Guardado"); S.wa=null; renderWa(); }catch(_){} };
  $("#waOff").onchange=()=>$("#waSave").click();
  const t=$("#waTest"); if(t) t.onclick=async()=>{ t.disabled=true; t.textContent="Enviando…";
    try{ await api("POST","admin/wa/test"); $("#waNote").innerHTML=`<div class="note ok">Mensaje de prueba enviado. Revisa tu WhatsApp.</div>`; }
    catch(e){ $("#waNote").innerHTML=`<div class="note bad">${esc(e.message)}</div>`; }
    t.disabled=false; t.textContent="Enviar WhatsApp de prueba"; S.wa=null; setTimeout(loadWa,300); };
}

/* ---------- plano de habitaciones (para responder llamadas) ---------- */
const PL={in:null,out:null,pax:1,find:""};
function plInit(){
  const t=todayISO(); if(!PL.in){PL.in=t;PL.out=addDays(t,1);}
  $("#plIn").value=PL.in; $("#plOut").value=PL.out;
  const maxCap=Math.max(4,...S.rooms.map(r=>Number(r.capacity)||1));
  $("#plPax").innerHTML=[...Array(maxCap)].map((_,i)=>`<option value="${i+1}" ${i+1===PL.pax?"selected":""}>${i+1} persona${i?"s":""}</option>`).join("");
}
const plFloor=r=>String(r.floor||String(r.number||"").trim().charAt(0)||"1");
function plOcc(roomId,a,b){return S.res.filter(r=>r.roomId===roomId&&active(r)&&r.status!=="finalizada"&&r.checkIn<b&&a<r.checkOut).sort((x,y)=>x.checkIn<y.checkIn?-1:1);}
function plFreeFrom(roomId,from){ // primera noche libre desde «from»
  let d=from; for(let i=0;i<120;i++){ if(!plOcc(roomId,d,addDays(d,1)).length) return d; d=addDays(d,1);} return null; }
function plNextIn(roomId,from){const n=S.res.filter(r=>r.roomId===roomId&&active(r)&&r.status!=="finalizada"&&r.checkIn>=from).sort((x,y)=>x.checkIn<y.checkIn?-1:1)[0];return n||null;}
function plInfo(ro){
  const a=PL.in,b=PL.out,cap=Number(ro.capacity)||1,occ=plOcc(ro.id,a,b);
  const arrive=S.res.find(r=>r.roomId===ro.id&&active(r)&&r.status!=="finalizada"&&r.checkIn===a);
  const leave=S.res.find(r=>r.roomId===ro.id&&active(r)&&r.status!=="cancelada"&&r.checkOut===a);
  let cls,st;
  if(ro.status==="mantenimiento"){cls="off";st="Mantenimiento";}
  else if(occ.length){const pend=occ.every(r=>r.status==="pendiente");cls=pend?"pend":"occ";st=pend?"Reserva pendiente":(occ[0].status==="encasa"?"Ocupada · en casa":"Reservada");}
  else if(cap<PL.pax){cls="small";st=`Libre · máx. ${cap} pers.`;}
  else {cls="free";st="Disponible";}
  const nx=occ.length?null:plNextIn(ro.id,a);
  const freeFrom=occ.length?plFreeFrom(ro.id,a):null;
  const strip=[...Array(14)].map((_,i)=>{const d=addDays(a,i),o=plOcc(ro.id,d,addDays(d,1))[0];return {d,o,q:d<b};});
  return {cls,st,occ,arrive,leave,nx,freeFrom,strip,cap};
}
function plMatch(r,q){if(!q)return false;q=q.toLowerCase();const g=guestById(r.guestId)||{};
  return [resGuest(r),r.id,g.phone,g.docNumber].filter(Boolean).some(x=>String(x).toLowerCase().replace(/\s/g,"").includes(q.replace(/\s/g,"")));}
function renderPlano(){
  if(!$("#plIn").value||!$("#plPax").options.length) plInit();
  const n=diff(PL.in,PL.out), rooms=sortRooms(), info=Object.fromEntries(rooms.map(r=>[r.id,plInfo(r)]));
  const free=rooms.filter(r=>info[r.id].cls==="free"), small=rooms.filter(r=>info[r.id].cls==="small");
  const occN=rooms.filter(r=>["occ","pend"].includes(info[r.id].cls)).length;
  const arrivals=rooms.filter(r=>info[r.id].arrive).length, departures=rooms.filter(r=>info[r.id].leave).length;
  // Respuesta lista para decir por teléfono
  const minRate=free.length?Math.min(...free.map(r=>Number(r.rate)||0)):0;
  const types=[...new Set(free.map(r=>r.type).filter(Boolean))];
  const say=free.length?`Sí hay: <b>${free.length} ${free.length>1?"habitaciones":"habitación"}</b> para ${PL.pax} persona${PL.pax>1?"s":""}, ${fd(PL.in,{weekday:"short"})} → ${fd(PL.out,{weekday:"short"})} (${n} noche${n>1?"s":""})${minRate?`, desde <b>${cop(minRate*n)}</b>`:""}${types.length?` · ${esc(types.join(", "))}`:""}.`
    :`No hay habitaciones libres para ${PL.pax} persona${PL.pax>1?"s":""} en esas fechas.${(()=>{const alt=plAlternative();return alt?` Próxima opción: <b>${fd(alt.in,{weekday:"short"})} → ${fd(alt.out,{weekday:"short"})}</b> (hab. ${esc(alt.room.number)}).`:"";})()}`;
  $("#plSum").innerHTML=`<div class="k ok"><b>${free.length}</b>libres</div><div class="k"><b>${occN}</b>ocupadas</div>${small.length?`<div class="k"><b>${small.length}</b>libres sin cupo</div>`:""}<div class="k"><b>${arrivals}</b>llegan</div><div class="k"><b>${departures}</b>salen</div>
    <div class="say"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg><span>${say}</span></div>`;
  const floors={}; rooms.forEach(r=>(floors[plFloor(r)]=floors[plFloor(r)]||[]).push(r));
  const q=PL.find.trim();
  $("#plMap").innerHTML=Object.keys(floors).sort((x,y)=>x.localeCompare(y,"es",{numeric:true})).map(f=>{
    const list=floors[f], cols=Math.max(1,Math.ceil(list.length/2)), top=list.slice(0,cols), bot=list.slice(cols);
    const freeF=list.filter(r=>info[r.id].cls==="free").length;
    const tile=ro=>{const i=info[ro.id],o=i.occ[0],hit=q&&S.res.some(r=>r.roomId===ro.id&&active(r)&&r.checkOut>=todayISO()&&plMatch(r,q));
      const line2=o?`<div class="gu">${esc(resGuest(o))}</div><div class="nx">${fd(o.checkIn)} → ${fd(o.checkOut)}${i.occ.length>1?` · +${i.occ.length-1} reserva${i.occ.length>2?"s":""}`:""}</div>`
        :(i.cls==="off"?`<div class="nx">No disponible</div>`:`<div class="nx">${i.nx?`Libre hasta ${fd(i.nx.checkIn,{weekday:"short"})}`:"Sin reservas próximas"}</div>${!o&&i.cls!=="off"?`<div class="nx">${cop(Number(ro.rate)||0)} / noche</div>`:""}`);
      return `<button type="button" class="pl-room ${i.cls} ${hit?"hit":""} ${q&&!hit?"dim":""}" data-pl="${esc(ro.id)}" aria-label="Habitación ${esc(ro.number)}: ${esc(i.st)}${o?", "+esc(resGuest(o)):""}">
        <div class="no">${esc(ro.number)}<span class="cap">${i.cap} pers.</span></div><div class="ty">${esc(ro.type||ro.name||"")}${ro.bath?` · baño ${esc(ro.bath)}`:""}</div>
        <div class="st">${esc(i.st)}</div>${line2}
        <div class="tags">${i.arrive&&!(o&&o.id!==i.arrive.id)?`<span class="tag in">Llega ${PL.in===todayISO()?"hoy":fd(PL.in)}</span>`:""}${i.leave?`<span class="tag out">Sale ${PL.in===todayISO()?"hoy":fd(PL.in)}</span>`:""}${ro.status==="limpieza"?`<span class="tag">En limpieza</span>`:""}${o&&o.contract?`<span class="tag">Contrato ✓</span>`:""}</div>
        <div class="strip" aria-hidden="true">${i.strip.map(s=>`<i class="${s.o?(s.o.status==="pendiente"?"p":"o"):""} ${s.q?"q":""}" title="${fd(s.d,{weekday:"short"})}${s.o?" · "+esc(resGuest(s.o)):" · libre"}"></i>`).join("")}</div></button>`;};
    return `<div class="pl-floor"><h3>Piso ${esc(f)}<small>${freeF} de ${list.length} libres</small></h3>
      <div class="pl-plan" style="--cols:${cols}">${top.map(tile).join("")}${bot.length?`<div class="pl-hall">Pasillo</div>${bot.map(tile).join("")}`:""}</div></div>`;
  }).join("") || `<div class="empty">${S.loaded?"Aún no hay habitaciones registradas.":"Cargando habitaciones…"}</div>`;
}
// Si no hay cupo, busca el primer rango con las mismas noches en los próximos 60 días.
function plAlternative(){const n=diff(PL.in,PL.out);
  for(let k=1;k<=60;k++){const a=addDays(PL.in,k),b=addDays(a,n);
    const r=sortRooms().find(ro=>ro.status!=="mantenimiento"&&(Number(ro.capacity)||1)>=PL.pax&&!plOcc(ro.id,a,b).length); if(r) return {in:a,out:b,room:r};}
  return null;}
function openPlRoom(id){
  const ro=roomById(id); if(!ro) return; const i=plInfo(ro), n=diff(PL.in,PL.out), t=todayISO();
  const upcoming=S.res.filter(r=>r.roomId===id&&active(r)&&r.checkOut>=t&&r.status!=="finalizada").sort((x,y)=>x.checkIn<y.checkIn?-1:1).slice(0,5);
  const o=i.occ[0], g=o?guestById(o.guestId):null, ph=g&&g.phone?String(g.phone).replace(/[^\d+]/g,""):"";
  const wa=ph?"https://wa.me/"+(ph.startsWith("+")?ph.slice(1):(ph.length===10?"57"+ph:ph)):"";
  openModal("Habitación "+ro.number, `<div class="pl-det">
    <div class="muted" style="margin-bottom:10px">${esc(ro.type||"")} · ${esc(ro.beds||"")} · hasta ${i.cap} pers. · ${cop(Number(ro.rate)||0)} / noche</div>
    <div class="note ${i.cls==="free"?"ok":i.cls==="off"?"bad":i.cls==="small"?"warn":"info"}"><b>${esc(i.st)}</b> · ${fd(PL.in,{weekday:"long"})} → ${fd(PL.out,{weekday:"long"})} (${n} noche${n>1?"s":""})${i.freeFrom&&i.freeFrom!==PL.in?` · se libera el <b>${fd(i.freeFrom,{weekday:"short"})}</b>`:""}</div>
    ${o?`<div class="row"><span>Huésped</span><b>${esc(resGuest(o))}</b></div>
      <div class="row"><span>Estancia</span><b>${fd(o.checkIn)} → ${fd(o.checkOut)} · ${nights(o)} n</b></div>
      <div class="row"><span>Personas</span><b>${(Number(o.adults)||1)+(Number(o.children)||0)}</b></div>
      <div class="row"><span>Canal / estado</span><b>${esc(chan(o.channel).n)} · ${esc(STATUS[o.status]?.n||o.status)}</b></div>
      <div class="row"><span>Saldo</span><b>${cop(Math.max(0,balance(o)))}</b></div>
      ${g&&g.phone?`<div class="row"><span>Teléfono</span><b><a href="tel:${esc(ph)}">${esc(g.phone)}</a></b></div>`:""}`:""}
    <h3 style="margin:16px 0 4px;font-size:.95rem">Próximas reservas</h3>
    <div class="tl">${upcoming.length?upcoming.map(r=>`<div class="it"><span><b>${esc(resGuest(r))}</b><br><small class="muted">${fd(r.checkIn,{weekday:"short"})} → ${fd(r.checkOut,{weekday:"short"})} · ${esc(STATUS[r.status]?.n||"")}</small></span><button class="btn sm" data-plres="${esc(r.id)}" type="button">Ver</button></div>`).join(""):`<div class="muted">Sin reservas próximas.</div>`}</div></div>`,
    `<div class="grp" style="flex-wrap:wrap;gap:8px;justify-content:flex-end">
      ${i.cls==="free"||i.cls==="small"?`<button class="btn primary" data-plbook="${esc(ro.id)}" type="button">Reservar ${fd(PL.in)} → ${fd(PL.out)}</button>`:""}
      ${i.cls!=="free"&&i.cls!=="off"&&i.freeFrom?`<button class="btn" data-plbookfrom="${esc(ro.id)}|${i.freeFrom}" type="button">Reservar desde ${fd(i.freeFrom)}</button>`:""}
      ${wa?`<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp al huésped</a>`:""}
      <button class="btn" data-plroom="${esc(ro.id)}" type="button">Ficha de la habitación</button>
    </div>`);
}
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-pl]"); if(t){openPlRoom(t.dataset.pl);return;}
  const r=e.target.closest("[data-plres]"); if(r){closeModal();openResDetail(r.dataset.plres);return;}
  const b=e.target.closest("[data-plbook]"); if(b){closeModal();openResForm({roomId:b.dataset.plbook,checkIn:PL.in,checkOut:PL.out,adults:PL.pax});return;}
  const bf=e.target.closest("[data-plbookfrom]"); if(bf){const [id,d]=bf.dataset.plbookfrom.split("|");closeModal();openResForm({roomId:id,checkIn:d,checkOut:addDays(d,Math.max(1,diff(PL.in,PL.out))),adults:PL.pax});return;}
  const rm=e.target.closest("[data-plroom]"); if(rm){closeModal();openRoomDetail(rm.dataset.plroom);return;}
  const qk=e.target.closest("[data-pq]"); if(qk){const t0=todayISO();let a=t0,n=1;
    if(qk.dataset.pq==="manana")a=addDays(t0,1); if(qk.dataset.pq==="finde"){a=addDays(t0,(5-dow(t0)+7)%7);n=2;} if(qk.dataset.pq==="semana")n=7;
    PL.in=a;PL.out=addDays(a,n);$("#plIn").value=PL.in;$("#plOut").value=PL.out;renderPlano();}
});
$("#plIn").addEventListener("change",()=>{const n=Math.max(1,diff(PL.in,PL.out));PL.in=$("#plIn").value||todayISO();if(!$("#plOut").value||$("#plOut").value<=PL.in){$("#plOut").value=addDays(PL.in,n);}PL.out=$("#plOut").value;renderPlano();});
$("#plOut").addEventListener("change",()=>{let v=$("#plOut").value;if(!v||v<=PL.in){v=addDays(PL.in,1);$("#plOut").value=v;}PL.out=v;renderPlano();});
$("#plPax").addEventListener("change",()=>{PL.pax=+$("#plPax").value||1;renderPlano();});
$("#plFind").addEventListener("input",()=>{PL.find=$("#plFind").value;renderPlano();});
$("#plForm").addEventListener("submit",e=>e.preventDefault());

/* ---------- regreso de «Conectar con Google» ---------- */
(()=>{const q=new URLSearchParams(location.search), g=q.get("gcal"); if(!g) return;
  history.replaceState(null,"",location.pathname); S.tab="aloj"; try{localStorage.setItem("pn170tab","aloj");}catch(_){}
  if(g==="ok"){ setTimeout(()=>toast("¡Google Calendar conectado"+(q.get("email")?" con "+q.get("email"):"")+"! Ahora pulsa «Probar conexión» y luego «Sincronizar todas las reservas»."),900); }
  else setTimeout(()=>toast("No se pudo conectar Google: "+(q.get("msg")||"error")),900);
})();

/* ---------- arranque ---------- */
initEngine();
try{const t=localStorage.getItem("pn170tab");if(t&&document.getElementById("t-"+t))S.tab=t;}catch(_){}
try{const s=JSON.parse(localStorage.getItem(TOKEN_KEY)||"null");if(s&&s.t&&s.exp>Date.now())S.token=s.t;}catch(_){}
if(S.token) startApp(); else logout();
setInterval(()=>{if(S.token&&document.visibilityState==="visible"&&!modalOpen())loadState();},60000);
document.addEventListener("visibilitychange",()=>{if(S.token&&document.visibilityState==="visible"&&!modalOpen())loadState();});
})();
