/* Hotel Portal Norte 170 — sitio público para huéspedes */
(() => {
const G = {hotel:{}, rooms:[], avail:{}, loaded:false, q:null, type:"", mine:[], rule:0};
const MINE_KEY = "pn170_solicitudes";

/* ---------- iconos (trazos propios) ---------- */
const P = {
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  bed:'<path d="M3 19V6M3 14h18v5M21 14v-1.5A3.5 3.5 0 0 0 17.5 9H11v5"/><circle cx="7" cy="11" r="2"/>',
  wifi:'<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19.3" r=".9"/>',
  kitchen:'<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4-3.5 7v3H17"/>',
  laptop:'<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  tv:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  bus:'<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><circle cx="8" cy="14.5" r=".9"/><circle cx="16" cy="14.5" r=".9"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  pin:'<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  bag:'<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  plane:'<path d="M10.5 21 12 15l7 3 1-2-7-5V5.5a1.5 1.5 0 0 0-3 0V11l-7 5 1 2 7-3 .5 6z"/>',
  tree:'<path d="M12 21v-6M7 15h10l-5-11-5 11z"/>',
  chat:'<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.3L4 20z"/>',
  shower:'<path d="M4 11a8 8 0 0 1 16 0H4z"/><path d="M12 3v1M8 15v1M12 15v2M16 15v1M10 19v1M14 19v1"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="m9 12 2 2 4-4"/>',
  door:'<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18"/><circle cx="15" cy="12" r=".9"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  phone:'<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 7h4M10 11h4M10 15h4"/>',
  check:'<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M9.5 12.5 11 14l3.5-3.5M10 18.5h4"/>',
  game:'<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="17.8" cy="13.8" r="1"/>',
};
const ico = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${P[n]||P.pin}</svg>`;

/* ---------- datos y helpers ---------- */
const hName = () => G.hotel.name || "Hotel Portal Norte 170";
const shortName = () => hName().replace(/^Hotel\s+/i,"");
const sortRooms = () => G.rooms.slice().sort((a,b)=>String(a.number).localeCompare(String(b.number),"es",{numeric:true}));
const roomById = id => G.rooms.find(r=>r.id===id);
function freeG(roomId,a,b){return !(G.avail[roomId]||[]).some(x=>x.i<b && a<x.o);}
function waNum(){const w=String(G.hotel.whatsapp||"").replace(/\D/g,"");return !w?"":(w.length===10?"57"+w:w);}
function guestOk(r,q){
  const pax=q.ad+q.ch;
  if((Number(r.capacity)||1)<pax) return {ok:false,why:`Máximo ${r.capacity} pers.`};
  if(r.status==="mantenimiento") return {ok:false,why:"No disponible"};
  if(!freeG(r.id,q.in,q.out)) return {ok:false,why:"Ocupada en tus fechas"};
  return {ok:true};
}
function amenIcon(t){t=t.toLowerCase();
  if(/wi-?fi|internet/.test(t))return "wifi"; if(/cocina|nevera|estufa/.test(t))return "kitchen"; if(/tv|pantalla|televis/.test(t))return "tv";
  if(/escritorio|trabajo|laptop/.test(t))return "laptop"; if(/baño|ducha|toalla|jab/.test(t))return "shower"; if(/recep|check|llave/.test(t))return "key";
  if(/idioma|inglés|ingles/.test(t))return "chat"; if(/armario|closet/.test(t))return "door"; return "shield";}
function nearIcon(t){t=t.toLowerCase();
  if(/portal|transmilenio|estación|estacion|bus/.test(t))return "bus"; if(/centro comercial|unicentro|santaf|hacienda|mall|andino/.test(t))return "bag";
  if(/aeropuerto/.test(t))return "plane"; if(/parque/.test(t))return "tree"; if(/restaur|café|cafe|comida/.test(t))return "kitchen"; return "pin";}
function loadMine(){try{G.mine=JSON.parse(localStorage.getItem(MINE_KEY)||"[]");}catch(_){G.mine=[];}}
function storeMine(){try{localStorage.setItem(MINE_KEY,JSON.stringify(G.mine.slice(-10)));}catch(_){}}

/* Ilustración de respaldo: atardecer sobre los cerros de Bogotá */
const SCENE = (id) => `<svg viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B2238"/><stop offset=".45" stop-color="#2E4E72"/><stop offset=".78" stop-color="#C98A6E"/><stop offset="1" stop-color="#F2B88A"/></linearGradient></defs>
  <rect width="1440" height="760" fill="url(#sky${id})"/>
  <circle cx="1040" cy="470" r="80" fill="#FFD08A" opacity=".85"/>
  <path d="M480 520 L660 380 L770 430 L900 330 L1030 410 L1160 320 L1300 390 L1440 340 L1440 760 L480 760 Z" fill="#35577A" opacity=".9"/>
  <path d="M300 590 L500 470 L640 520 L800 430 L960 510 L1110 450 L1270 500 L1440 450 L1440 760 L300 760 Z" fill="#203F5F"/>
  <path d="M0 640 L220 570 L420 610 L620 540 L840 610 L1040 560 L1260 600 L1440 570 L1440 760 L0 760 Z" fill="#132E48"/>
  <g fill="#0A1E31">
    <rect x="700" y="600" width="46" height="100"/><rect x="752" y="570" width="38" height="130"/><rect x="796" y="615" width="54" height="85"/>
    <rect x="858" y="585" width="34" height="115"/><rect x="898" y="630" width="60" height="70"/><rect x="966" y="560" width="42" height="140"/>
    <rect x="1014" y="610" width="58" height="90"/><rect x="1080" y="588" width="36" height="112"/><rect x="1122" y="625" width="70" height="75"/>
    <rect x="1200" y="575" width="44" height="125"/><rect x="1250" y="615" width="62" height="85"/><rect x="1320" y="595" width="60" height="105"/><rect x="1386" y="620" width="54" height="80"/>
  </g>
  <g fill="#FFC56B" opacity=".9">
    <rect x="712" y="620" width="6" height="8"/><rect x="726" y="642" width="6" height="8"/><rect x="764" y="592" width="6" height="8"/><rect x="776" y="620" width="6" height="8"/>
    <rect x="874" y="606" width="6" height="8"/><rect x="980" y="584" width="6" height="8"/><rect x="992" y="612" width="6" height="8"/><rect x="1094" y="606" width="6" height="8"/>
    <rect x="1212" y="596" width="6" height="8"/><rect x="1226" y="626" width="6" height="8"/><rect x="1334" y="616" width="6" height="8"/><rect x="1350" y="640" width="6" height="8"/>
  </g>
  <rect x="0" y="700" width="1440" height="60" fill="#071827"/>
</svg>`;

/* ---------- carga ---------- */
async function load(){
  try{
    const r=await fetch("/api/public",{headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error(r.status);
    const j=await r.json();
    G.hotel=j.hotel||{}; G.rooms=j.rooms||[]; G.avail=j.avail||{}; G.loaded=true;
    $("#gNoDb").hidden=true; render();
  }catch(_){ $("#gNoDb").hidden=false; if(!G.loaded) $("#roomsSub").textContent="No pudimos cargar las habitaciones."; }
}
async function refreshMine(){
  if(!G.mine.length) return;
  await Promise.all(G.mine.map(async m=>{
    try{const r=await fetch(`/api/requests/${encodeURIComponent(m.id)}?p=${encodeURIComponent(m.p)}`);if(r.ok){const j=await r.json();Object.assign(m,{status:j.status,room:j.room,checkIn:j.checkIn,checkOut:j.checkOut});}}catch(_){}
  }));
  storeMine(); renderMine();
}

/* ---------- búsqueda y filtros ---------- */
function initSearch(){const t=todayISO();G.q={in:t,out:addDays(t,1),ad:1,ch:0};$("#gIn").value=G.q.in;$("#gOut").value=G.q.out;$("#gIn").min=t;$("#gOut").min=addDays(t,1);}
$("#gIn").addEventListener("change",()=>{const v=$("#gIn").value;if(!v)return;$("#gOut").min=addDays(v,1);if($("#gOut").value<=v)$("#gOut").value=addDays(v,1);});
$("#search").addEventListener("submit",e=>{
  e.preventDefault();
  const a=$("#gIn").value,b=$("#gOut").value;
  if(!a||!b||b<=a){toast("La fecha de salida debe ser posterior a la de llegada.");return;}
  if(a<todayISO()){toast("Elige una fecha de llegada desde hoy.");return;}
  G.q={in:a,out:b,ad:+$("#gAd").value||1,ch:+$("#gCh").value||0};
  renderRooms(); $("#habitaciones").scrollIntoView({block:"start"});
});
$("#cats").addEventListener("click",e=>{const b=e.target.closest("button[data-type]");if(!b)return;G.type=b.dataset.type;renderCats();renderRooms();});

/* ---------- render ---------- */
function render(){ renderHero(); renderPerks(); renderCats(); renderRooms(); renderNear(); renderWhy(); renderRule(); renderDirect(); renderFooter(); renderMine(); }

function coverPhoto(){return G.hotel.heroPhoto || sortRooms().flatMap(r=>r.photos||[])[0];}
function renderHero(){
  const h=G.hotel, photo=coverPhoto();
  document.title = hName()+" · Habitaciones en Suba, Bogotá";
  $("#brandName").textContent=shortName();
  // La portada rota las fotos del hotel; si en el panel se eligió una portada, entra primero.
  if(h.heroPhoto && window.PNPromo) PNPromo.heroFirst(photoUrl(h.heroPhoto));
  const st=document.getElementById("statRooms"); if(st && G.rooms.length) st.textContent=G.rooms.length;
  const rates=G.rooms.map(r=>Number(r.rate)||0).filter(Boolean), hp=document.getElementById("heroPrice");
  if(hp && rates.length){ hp.textContent=cop(Math.min(...rates)); }
  const rc=document.getElementById("roomCount"); if(rc && G.rooms.length) rc.textContent=`${G.rooms.length} habitaciones`;
  const tc=document.getElementById("topContact"); if(tc){ const it=[];
    if(h.email) it.push(`<a href="mailto:${esc(h.email)}">${ico("mail")}${esc(h.email)}</a>`);
    if(h.whatsapp||h.phone) it.push(`<a href="${h.whatsapp?"https://wa.me/"+waNum():"tel:"+esc(String(h.phone).replace(/[^\d+]/g,""))}" target="_blank" rel="noopener">${ico(h.whatsapp?"chat":"phone")}${esc(h.whatsapp||h.phone)}</a>`);
    it.push(`<span>${ico("pin")}${esc(h.address||"Calle 174A # 47-24, Bogotá")}</span>`); tc.innerHTML=it.join(""); }
  void photo;
  const wa=waNum(), nw=$("#navWa");
  if(wa){nw.hidden=false;nw.href=`https://wa.me/${wa}`;nw.target="_blank";nw.rel="noopener";nw.textContent="WhatsApp "+h.whatsapp;
    const mw=$("#mWa");mw.hidden=false;mw.href=`https://wa.me/${wa}`;mw.target="_blank";mw.rel="noopener";mw.textContent="WhatsApp "+h.whatsapp;}
}
function renderPerks(){
  if(!document.getElementById("perks")) return;
  const h=G.hotel, am=(h.amenities||[]).join(" ").toLowerCase();
  const items=[
    {ic:"phone",t:"Recepción smart",s:"Videoportero y cerraduras con clave o huella"},
    {ic:"check",t:"Check-in electrónico",s:"Registro TRA y documento desde el celular"},
    {ic:"shield",t:"Seguridad integral",s:"Monitoreo, extintores, botiquín y camilla"},
    {ic:"kitchen",t:"Cocina compartida",s:/cocina/.test(am)?"Nevera, estufa, campana y comedor":"Espacios comunes"},
    {ic:"game",t:"Zona retro",s:"Máquina arcade para dos jugadores"},
    {ic:"bus",t:"Estrato 4 · Portal Norte",s:"Zona segura a una cuadra de TransMilenio"},
  ];
  $("#perks").innerHTML=items.map(x=>`<div class="perk"><span class="circ">${ico(x.ic)}</span><div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div></div>`).join("");
}
function renderCats(){
  const types=[...new Set(sortRooms().map(r=>r.type).filter(Boolean))];
  if(G.type && !types.includes(G.type)) G.type="";
  $("#cats").innerHTML=[["","Todas"],...types.map(t=>[t,t])].map(([k,l])=>`<button type="button" data-type="${esc(k)}" aria-pressed="${G.type===k}">${esc(l)}</button>`).join("");
}
function renderRooms(){
  const q=G.q, n=diff(q.in,q.out), pax=q.ad+q.ch;
  const rooms=sortRooms().filter(r=>!G.type||r.type===G.type);
  const withSt=rooms.map(r=>({r,st:guestOk(r,q)})).sort((a,b)=>(b.st.ok-a.st.ok));
  if(G.loaded){
    const free=withSt.filter(x=>x.st.ok).length;
    $("#roomsSub").innerHTML=`<b style="color:var(--fg)">${free} de ${rooms.length} disponibles</b><br>${fd(q.in,{weekday:"short"})} → ${fd(q.out,{weekday:"short"})} · ${n} noche${n>1?"s":""} · ${pax} persona${pax>1?"s":""}`;
  }
  $("#rooms").innerHTML=withSt.map(({r,st})=>{const c=(r.photos||[])[0], rate=Number(r.rate)||0;return `
    <article class="card ${st.ok?"":"off"}" data-room="${esc(r.id)}" tabindex="0" aria-label="${esc(r.name||r.type)}">
      <div class="img">${c?`<img class="photo" src="${photoUrl(c)}" alt="${esc(r.name||"Habitación")}" loading="lazy">`:`<div class="ph"><img src="/assets/logo-mark.png" alt="">${esc(r.number)}</div>`}
        <span class="badge ${st.ok?"ok":"no"}">${st.ok?"Disponible":esc(st.why)}</span></div>
      <div class="body">
        <h3>${esc(r.name||r.type||"Habitación")}</h3><div class="where">${ico("pin")}Villa del Prado · Bogotá</div>
        <div class="meta"><span>${ico("user")}${r.capacity||"?"} pers.</span><i></i><span>${esc(r.beds||"")}</span></div><div class="meta bath">Baño ${esc(r.bath||"")}</div>
        <div class="cfoot"><span class="price"><b>${cop(rate)}</b> <small>/ noche</small>${n>1?`<br><small>${cop(rate*n)} por ${n} noches</small>`:""}</span><span class="go">${ico("arrow")}</span></div>
      </div>
    </article>`;}).join("") || `<div class="empty">${G.loaded?"No hay habitaciones de este tipo.":"Cargando habitaciones…"}</div>`;
}
function renderNear(){
  const h=G.hotel;
  $("#addrLine").textContent=[h.address,h.zone].filter(Boolean).join(" · ") || "Suba, Bogotá";
  if(h.address) $("#mapLink").href="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(h.address+", Bogotá");
  $("#near").innerHTML=(h.nearby||[]).map(x=>{const [t,...m]=x.split(" · ");return `<div class="it"><div class="tile">${ico(nearIcon(x))}</div><div class="txt"><b>${esc(t)}</b><small>${esc(m.join(" · "))}</small></div></div>`;}).join("")
    || `<div class="empty">${G.loaded?"Pronto agregaremos los lugares cercanos.":"Cargando…"}</div>`;
}
function renderWhy(){
  if(!document.getElementById("feats")) return;
  const h=G.hotel, am=(h.amenities||[]);
  const feats=[
    {ic:"bus",t:"Transporte a la mano",s:"Portal Norte y rutas hacia la Sabana"},
    {ic:"laptop",t:"Para trabajar",s:"Escritorio y Wi‑Fi en la habitación"},
    {ic:"key",t:"Check-in guiado",s:h.frontDesk?String(h.frontDesk).split(";")[0]:"Te enviamos las instrucciones antes"},
    {ic:"chat",t:"Reserva directa",s:waNum()?"Confirma por WhatsApp":"Solicita tu reserva en línea"},
  ];
  $("#feats").innerHTML=feats.map(x=>`<div class="feat">${ico(x.ic)}<div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div></div>`).join("");
  const rooms=sortRooms(), withPhoto=rooms.find(r=>(r.photos||[]).length);
  const img = withPhoto ? withPhoto.photos[0] : h.heroPhoto;
  $("#whyBg").innerHTML = img ? `<img src="${photoUrl(img)}" alt="">` : SCENE("w");
  void am;
}
function rules(){return (G.hotel.policies||[]).length?G.hotel.policies:["Pronto publicaremos las normas de la casa."];}
function renderRule(){
  const list=rules(); if(G.rule>=list.length) G.rule=0;
  $("#ruleText").textContent=list[G.rule];
  $("#ruleCount").textContent=`${G.rule+1} / ${list.length}`;
  const h=G.hotel;
  $("#ruleTimes").innerHTML=`<div>Llegada<b>${esc(h.checkinFrom||"15:00")}–${esc(h.checkinTo||"18:00")}</b></div><div>Salida<b>${esc(h.checkout||"11:00")}</b></div>`;
}
$("#rulePrev").onclick=()=>{const n=rules().length;G.rule=(G.rule-1+n)%n;renderRule();};
$("#ruleNext").onclick=()=>{const n=rules().length;G.rule=(G.rule+1)%n;renderRule();};
function renderDirect(){
  const h=G.hotel, wa=waNum(), btn=$("#ctaBtn");
  if(wa){btn.href=`https://wa.me/${wa}`;btn.target="_blank";btn.rel="noopener";btn.innerHTML=`Escribir por WhatsApp ${ico("arrow")}`;}
  $("#directLead").textContent = wa ? `Escríbenos al ${h.whatsapp}: te confirmamos disponibilidad, llegada y forma de pago.` : "Solicita tu reserva desde cada habitación y te confirmamos disponibilidad, llegada y forma de pago.";
  const rates=G.rooms.map(r=>Number(r.rate)||0).filter(Boolean);
  const minRate=rates.length?Math.min(...rates):0;
  const k=minRate>=1000?`$${Math.round(minRate/1000)}k`:cop(minRate);
  const dbg=document.getElementById("directBg"); if(dbg) dbg.innerHTML=`<img src="/assets/promo/hero-pasillo.jpg" alt="" loading="lazy">`;
  if($("#stats")) $("#stats").innerHTML=[[G.rooms.length||"—","Habitaciones"],[h.checkinFrom||"15:00","Llegada"],[h.checkout||"11:00","Salida"],[minRate?k:"—","Desde / noche"]]
    .map(([v,l])=>`<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join("");
}
function renderFooter(){
  const h=G.hotel;
  const wa=waNum(), maps="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent((h.address||"Calle 174A # 47-24")+", Bogotá");
  const rows=[
    h.address&&`<a href="${maps}" target="_blank" rel="noopener">${ico("pin")}${esc(h.address)}</a>`,
    h.whatsapp&&`<a href="https://wa.me/${wa}" target="_blank" rel="noopener">${ico("chat")}WhatsApp <span class="num">${esc(h.whatsapp)}</span></a>`,
    h.phone&&`<a href="tel:${esc(String(h.phone).replace(/[^\d+]/g,""))}">${ico("phone")}<span class="num">${esc(h.phone)}</span></a>`,
    h.email&&`<a href="mailto:${esc(h.email)}">${ico("mail")}${esc(h.email)}</a>`,
    `<span>${ico("key")}Check-in ${esc(h.checkinFrom||"15:00")} · Salida ${esc(h.checkout||"11:00")}</span>`,
  ].filter(Boolean);
  $("#footContact").innerHTML=rows.join("");
  $("#copy").textContent=`© ${new Date().getFullYear()} ${hName()} · Bogotá, Colombia`;
}
function renderMine(){
  const mine=G.mine.slice().reverse();
  $("#mineSec").hidden=!mine.length; $("#footMine").hidden=!mine.length; $("#mMine").hidden=!mine.length;
  $("#mine").innerHTML=mine.map(m=>{const st=m.status==="aceptada"?["Confirmada","ok"]:m.status==="rechazada"?["No disponible","bad"]:["En revisión","warn"];
    return `<div class="li"><div class="who"><b>${esc(m.room||"Habitación")}</b><small>${fd(m.checkIn,{weekday:"short"})} → ${fd(m.checkOut,{weekday:"short"})} · <span class="num">${esc(m.id)}</span></small></div><span class="pill ${st[1]}">${st[0]}</span></div>`;}).join("");
}

/* ---------- habitación ---------- */
$("#rooms").addEventListener("click",e=>{const c=e.target.closest("[data-room]");if(c)openRoom(c.dataset.room);});
$("#rooms").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("[data-room]"))openRoom(e.target.dataset.room);});
function openRoom(id){
  const r=roomById(id); if(!r) return; const ph=r.photos||[]; const st=guestOk(r,G.q); const n=diff(G.q.in,G.q.out);
  const body=`<div class="hero-ph r43">${ph[0]?`<img id="grImg" src="${photoUrl(ph[0])}" alt="${esc(r.name||"Habitación")}">`:`<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--muted)"><img src="/assets/logo-mark.png" alt="" style="width:96px;height:96px">Fotos próximamente</div>`}</div>
    ${ph.length>1?`<div class="gallery" id="grThumbs">${ph.map(p=>`<figure><img src="${photoUrl(p)}" alt="" data-ph="${esc(p)}" loading="lazy" style="cursor:pointer"></figure>`).join("")}</div>`:""}
    ${r.description?`<p style="margin:0;max-width:68ch">${esc(r.description)}</p>`:""}
    <dl class="kv"><dt>Tipo</dt><dd>${esc(r.type||"")}</dd><dt>Camas</dt><dd>${esc(r.beds||"")}</dd><dt>Capacidad</dt><dd>${r.capacity||"?"} personas</dd><dt>Baño</dt><dd>${esc(r.bath||"")}</dd>${r.size?`<dt>Área</dt><dd class="num">${esc(r.size)} m²</dd>`:""}<dt>Tarifa</dt><dd class="num">${cop(r.rate)} por noche · ${cop((Number(r.rate)||0)*n)} por ${n} noche${n>1?"s":""}</dd></dl>
    <div class="chips">${(r.features||[]).map(f=>`<span class="chip">${esc(f)}</span>`).join("")}</div>
    <div class="note ${st.ok?"ok":"warn"}">${st.ok?`Disponible del ${fd(G.q.in)} al ${fd(G.q.out)}.`:`${esc(st.why)} (${fd(G.q.in)} – ${fd(G.q.out)}). Cambia las fechas en el buscador.`}</div>`;
  openModal(r.name||"Habitación", body, `<button class="btn" id="grClose">Cerrar</button><button class="btn primary" id="grReq" ${st.ok?"":"disabled"}>Solicitar reserva</button>`, ov=>{
    ov.querySelector("#grClose").onclick=closeModal;
    ov.querySelector("#grReq").onclick=()=>openRequest(id);
    const th=ov.querySelector("#grThumbs"); if(th) th.onclick=e=>{const i=e.target.closest("[data-ph]");if(i)ov.querySelector("#grImg").src=photoUrl(i.dataset.ph);};
  }, true);
}

/* ---------- solicitud ---------- */
function openRequest(roomId){
  const r=roomById(roomId); if(!r) return; const q=G.q, n=diff(q.in,q.out), est=(Number(r.rate)||0)*n;
  const body=`<div class="panel"><div class="eyebrow">Tu estancia</div><b style="display:block;margin-top:4px">${esc(r.name||"Habitación")}</b>
      <div class="sum" style="margin-top:6px"><span>${fd(q.in,{weekday:"long"})} → ${fd(q.out,{weekday:"long"})}</span><span><b>${n}</b> noche${n>1?"s":""}</span><span><b>${q.ad+q.ch}</b> pers.</span><span>Valor estimado <b>${cop(est)}</b></span></div></div>
    <form id="qForm" style="display:flex;flex-direction:column;gap:14px">
    <fieldset><legend>Tus datos</legend><div class="grid g3">
      <label class="f">Nombres<input id="qFirst" autocomplete="given-name" required maxlength="80"></label><label class="f">Apellidos<input id="qLast" autocomplete="family-name" maxlength="80"></label>
      <label class="f">Tipo de documento<select id="qDocT">${DOCS.map(x=>opt(x,x,"CC")).join("")}</select></label>
      <label class="f">Número de documento<input id="qDoc" maxlength="30"></label><label class="f">Nacionalidad<input id="qNat" value="Colombia" maxlength="60"></label>
      <label class="f">Teléfono / WhatsApp<input id="qPhone" inputmode="tel" autocomplete="tel" required maxlength="30"></label><label class="f">Correo<input id="qEmail" type="email" autocomplete="email" maxlength="120"></label>
      <label class="f">Hora estimada de llegada<input type="time" id="qEta"></label></div>
      <label class="f">Comentarios<textarea id="qNotes" maxlength="600" placeholder="Ej. llegaré en bus desde Tunja, necesito toalla extra"></textarea></label>
      <label class="hp" aria-hidden="true">Sitio web<input id="qWeb" tabindex="-1" autocomplete="off"></label>
      <label class="f chk"><input type="checkbox" id="qCons"> Autorizo el tratamiento de mis datos personales para gestionar mi reserva (Ley 1581 de 2012).</label></fieldset>
    </form>
    <div class="muted" style="font-size:.82rem">Esto es una solicitud: el alojamiento te confirmará la disponibilidad y la forma de pago por teléfono o WhatsApp.</div>`;
  openModal("Solicitar reserva", body, `<button class="btn" id="qCancel">Cancelar</button><button class="btn primary" id="qSend">Enviar solicitud</button>`, ov=>{
    ov.querySelector("#qCancel").onclick=closeModal;
    ov.querySelector("#qForm").addEventListener("submit",e=>{e.preventDefault();ov.querySelector("#qSend").click();});
    ov.querySelector("#qSend").onclick=async()=>{
      const v=s=>ov.querySelector(s).value.trim();
      if(!v("#qFirst")||v("#qPhone").replace(/\D/g,"").length<7){toast("Escribe tu nombre y un teléfono válido.");return;}
      if(!ov.querySelector("#qCons").checked){toast("Necesitamos tu autorización de datos para gestionar la reserva.");return;}
      const btn=ov.querySelector("#qSend"); btn.disabled=true; btn.textContent="Enviando…";
      const payload={roomId,checkIn:q.in,checkOut:q.out,adults:q.ad,children:q.ch,first:v("#qFirst"),last:v("#qLast"),docType:v("#qDocT"),docNumber:v("#qDoc"),
        nationality:v("#qNat"),phone:v("#qPhone"),email:v("#qEmail"),eta:v("#qEta"),notes:v("#qNotes"),consent:true,website:v("#qWeb")};
      let id=null, errText="";
      try{
        const res=await fetch("/api/requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        const j=await res.json().catch(()=>({}));
        if(res.ok) id=j.id; else errText=j.error||"No pudimos registrar la solicitud.";
      }catch(_){errText="No hay conexión con el servidor.";}
      if(!id && /disponible/.test(errText)){toast(errText);btn.disabled=false;btn.textContent="Enviar solicitud";load();return;}
      if(id){G.mine.push({id,p:payload.phone.replace(/\D/g,""),room:r.name||r.type,checkIn:q.in,checkOut:q.out,status:"nueva"});storeMine();renderMine();}
      showResult(r,q,payload,id,errText);
    };
  }, true);
}
function showResult(r,q,p,id,errText){
  const msg=`Hola, quiero reservar en ${hName()}.\n• Habitación: ${r.name||r.type} (${r.number})\n• Llegada: ${fd(q.in,{weekday:"long",year:"numeric"})}${p.eta?" hacia las "+p.eta:""}\n• Salida: ${fd(q.out,{weekday:"long",year:"numeric"})}\n• Personas: ${q.ad} adulto(s)${q.ch?", "+q.ch+" niño(s)":""}\n• Nombre: ${p.first} ${p.last}\n• Documento: ${p.docType} ${p.docNumber}\n• Teléfono: ${p.phone}${p.notes?"\n• Comentarios: "+p.notes:""}${id?"\nCódigo de solicitud: "+id:""}`;
  const wa=waNum();
  openModal(id?"Solicitud enviada":"Envía tu solicitud",
    `${id?`<div class="note ok">Recibimos tu solicitud <b class="num">${esc(id)}</b>. Te confirmaremos por teléfono o WhatsApp; puedes ver su estado en «Mis solicitudes» desde este navegador.</div>`
      :`<div class="note warn">${esc(errText||"No pudimos registrar la solicitud en línea.")} Envíala por WhatsApp o copia el mensaje.</div>`}
    <label class="f">Mensaje para el alojamiento<textarea id="rqMsg" rows="10" readonly>${esc(msg)}</textarea></label>
    ${wa?"":`<div class="muted" style="font-size:.82rem">${G.hotel.phone?"Llama o escribe al "+esc(G.hotel.phone)+" para confirmar.":"Pronto publicaremos nuestro WhatsApp."}</div>`}`,
    `<button class="btn" id="rqCopy">Copiar mensaje</button>${wa?`<a class="btn primary" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>`:""}<button class="btn" id="rqDone">Listo</button>`,
    ov=>{ov.querySelector("#rqDone").onclick=closeModal;
      ov.querySelector("#rqCopy").onclick=()=>{const ta=ov.querySelector("#rqMsg");const fb=()=>{ta.focus();ta.select();toast("Mensaje seleccionado: cópialo con Ctrl+C.");};
        try{navigator.clipboard.writeText(msg).then(()=>toast("Mensaje copiado"),fb);}catch(_){fb();}};});
}

/* ---------- menú móvil ---------- */
const mBtn=$("#menuBtn"), mMenu=$("#mMenu");
function setMenu(open){mMenu.hidden=!open;mBtn.setAttribute("aria-expanded",open);mBtn.setAttribute("aria-label",open?"Cerrar menú":"Abrir menú");}
mBtn.addEventListener("click",()=>setMenu(mMenu.hidden));
mMenu.addEventListener("click",e=>{if(e.target.closest("a"))setMenu(false);});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!mMenu.hidden){setMenu(false);mBtn.focus();}});
window.addEventListener("resize",()=>{if(innerWidth>900&&!mMenu.hidden)setMenu(false);});

/* ---------- arranque ---------- */
initSearch(); loadMine(); render(); load(); refreshMine();
setInterval(()=>{if(document.visibilityState==="visible"&&!modalOpen())load();},120000);
})();
