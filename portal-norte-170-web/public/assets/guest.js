/* Hotel Portal Norte 170 — sitio público para huéspedes */
(() => {
const G = {hotel:{}, rooms:[], avail:{}, loaded:false, q:null, mine:[]};
const MINE_KEY = "pn170_solicitudes";

const hName = () => G.hotel.name || "Hotel Portal Norte 170";
const sortRooms = () => G.rooms.slice().sort((a,b)=>String(a.number).localeCompare(String(b.number),"es",{numeric:true}));
const roomById = id => G.rooms.find(r=>r.id===id);
function freeG(roomId,a,b){return !(G.avail[roomId]||[]).some(x=>x.i<b && a<x.o);}
function waNum(){const w=String(G.hotel.whatsapp||"").replace(/\D/g,"");return !w?"":(w.length===10?"57"+w:w);}
function guestOk(r,q){
  const pax=q.ad+q.ch;
  if((Number(r.capacity)||1)<pax) return {ok:false,why:`Máximo ${r.capacity} pers.`};
  if(r.status==="mantenimiento") return {ok:false,why:"No disponible"};
  if(!freeG(r.id,q.in,q.out)) return {ok:false,why:"Ocupada en esas fechas"};
  return {ok:true};
}
function loadMine(){try{G.mine=JSON.parse(localStorage.getItem(MINE_KEY)||"[]");}catch(_){G.mine=[];}}
function storeMine(){try{localStorage.setItem(MINE_KEY,JSON.stringify(G.mine.slice(-10)));}catch(_){}}

/* ---------- carga ---------- */
async function load(){
  try{
    const r=await fetch("/api/public",{headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error(r.status);
    const j=await r.json();
    G.hotel=j.hotel||{}; G.rooms=j.rooms||[]; G.avail=j.avail||{}; G.loaded=true;
    $("#gNoDb").hidden=true; render();
  }catch(_){ $("#gNoDb").hidden=false; if(!G.loaded) $("#gRoomsSub").textContent="Sin conexión"; }
}
async function refreshMine(){
  if(!G.mine.length){render();return;}
  await Promise.all(G.mine.map(async m=>{
    try{const r=await fetch(`/api/requests/${encodeURIComponent(m.id)}?p=${encodeURIComponent(m.p)}`);if(r.ok){const j=await r.json();m.status=j.status;m.room=j.room;m.checkIn=j.checkIn;m.checkOut=j.checkOut;}}catch(_){}
  }));
  storeMine(); render();
}

/* ---------- búsqueda ---------- */
function initSearch(){const t=todayISO();G.q={in:t,out:addDays(t,1),ad:1,ch:0};$("#gIn").value=G.q.in;$("#gOut").value=G.q.out;$("#gIn").min=t;$("#gOut").min=addDays(t,1);}
$("#gIn").addEventListener("change",()=>{const v=$("#gIn").value;$("#gOut").min=addDays(v,1);if($("#gOut").value<=v)$("#gOut").value=addDays(v,1);});
$("#gSearch").addEventListener("submit",e=>{
  e.preventDefault();
  const a=$("#gIn").value,b=$("#gOut").value;
  if(!a||!b||b<=a){toast("La fecha de salida debe ser posterior a la de llegada.");return;}
  if(a<todayISO()){toast("Elige una fecha de llegada desde hoy.");return;}
  G.q={in:a,out:b,ad:+$("#gAd").value||1,ch:+$("#gCh").value||0};
  render(); $("#gRoomsSec").scrollIntoView({block:"start"});
});

/* ---------- render ---------- */
function render(){
  const h=G.hotel, rooms=sortRooms(), q=G.q, n=diff(q.in,q.out), pax=q.ad+q.ch;
  document.title = hName()+" · Habitaciones en "+(h.zone?h.zone.split(",")[0]:"Suba, Bogotá");
  $("#gLogo").innerHTML=nameHTML(hName()); $("#gName").innerHTML=nameHTML(hName());
  $("#gCopy").textContent=hName()+" · "+(h.address||"Bogotá");
  $("#gZone").textContent="Habitaciones privadas · "+(h.zone||"Suba, Bogotá");
  if(h.description) $("#gDesc").textContent=h.description;
  $("#gFacts").innerHTML=`${h.address?`<span><span class="muted">Dirección</span> ${esc(h.address)}</span>`:""}
    <span><span class="muted">Llegada</span> <b>${esc(h.checkinFrom||"15:00")}–${esc(h.checkinTo||"18:00")}</b></span>
    <span><span class="muted">Salida</span> <b>${esc(h.checkout||"11:00")}</b></span><span><span class="muted">Wi-Fi</span> gratis</span>`;
  const cov=rooms.flatMap(r=>r.photos||[])[0];
  $("#gPic").innerHTML=cov?`<img src="${photoUrl(cov)}" alt="${esc(hName())}">`:`<span class="ph-empty">170</span>`;
  $("#gContactTop").textContent=h.whatsapp?("WhatsApp "+h.whatsapp):"";

  if(G.loaded){
    const free=rooms.filter(r=>guestOk(r,q).ok).length;
    $("#gRoomsSub").textContent=`${free} disponible${free===1?"":"s"} · ${fd(q.in,{weekday:"short"})} → ${fd(q.out,{weekday:"short"})} · ${n} noche${n>1?"s":""} · ${pax} persona${pax>1?"s":""}`;
  }
  $("#gRooms").innerHTML=rooms.map(r=>{const c=(r.photos||[])[0], st=guestOk(r,q), rate=Number(r.rate)||0;return `
    <article class="room" data-groom="${esc(r.id)}" tabindex="0">
      <div class="ph">${c?`<img src="${photoUrl(c)}" alt="${esc(r.name||"Habitación")}" loading="lazy">`:`<span class="no">${esc(r.number)}</span>`}
        <span class="st">${st.ok?'<span class="pill ok">Disponible</span>':`<span class="pill bad">${esc(st.why)}</span>`}</span>
        ${(r.photos||[]).length>1?`<span class="cnt">${r.photos.length} fotos</span>`:""}</div>
      <div class="bd"><h3>${esc(r.name||r.type||"Habitación")}</h3>
        <div class="muted" style="font-size:.84rem">${esc(r.beds||"")} · hasta ${r.capacity||"?"} pers. · baño ${esc(r.bath||"")}</div>
        <div class="chips">${(r.features||[]).slice(0,4).map(f=>`<span class="chip">${esc(f)}</span>`).join("")}</div>
        <div class="g-foot"><div><b class="num">${cop(rate*n)}</b><small class="muted">${cop(rate)} × ${n} noche${n>1?"s":""}</small></div>
          <button class="btn primary" data-req="${esc(r.id)}" ${st.ok?"":"disabled"}>Solicitar</button></div></div>
    </article>`;}).join("") || `<div class="empty">${G.loaded?"Pronto publicaremos nuestras habitaciones.":"Cargando habitaciones…"}</div>`;

  const L=(t,a)=>a&&a.length?`<div class="panel"><h3>${t}</h3><ul class="plain" style="margin-top:10px">${a.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:"";
  $("#gInfo").innerHTML=L("Servicios",h.amenities)+L("Normas de la casa",h.policies)+L("Cerca de ti",h.nearby) || `<div class="empty">Cargando…</div>`;
  const wa=waNum();
  $("#gContact").innerHTML=`<dl class="kv"><dt>Dirección</dt><dd>${esc(h.address||"—")}</dd><dt>Teléfono</dt><dd class="num">${esc(h.phone||"Pronto")}</dd>
    <dt>WhatsApp</dt><dd class="num">${esc(h.whatsapp||"Pronto")}</dd><dt>Correo</dt><dd>${esc(h.email||"Pronto")}</dd></dl>
    ${wa?`<div style="margin-top:12px"><a class="btn primary" href="https://wa.me/${wa}" target="_blank" rel="noopener">Escribir por WhatsApp</a></div>`:""}`;

  const mine=G.mine.slice().reverse();
  $("#gMineSec").hidden=!mine.length;
  $("#gMine").innerHTML=mine.map(m=>{const st=m.status==="aceptada"?["Confirmada","ok"]:m.status==="rechazada"?["No disponible","bad"]:["En revisión","warn"];
    return `<div class="li"><div class="who"><b>${esc(m.room||"Habitación")}</b><small>${fd(m.checkIn,{weekday:"short"})} → ${fd(m.checkOut,{weekday:"short"})} · <span class="num">${esc(m.id)}</span></small></div><span class="pill ${st[1]}">${st[0]}</span></div>`;}).join("");
}

/* ---------- habitación ---------- */
$("#gRooms").addEventListener("click",e=>{const b=e.target.closest("[data-req]");if(b){if(!b.disabled)openRequest(b.dataset.req);return;}
  const c=e.target.closest("[data-groom]");if(c)openRoom(c.dataset.groom);});
$("#gRooms").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("[data-groom]"))openRoom(e.target.dataset.groom);});
function openRoom(id){
  const r=roomById(id); if(!r) return; const ph=r.photos||[]; const st=guestOk(r,G.q);
  const body=`<div class="hero-ph">${ph[0]?`<img id="grImg" src="${photoUrl(ph[0])}" alt="${esc(r.name||"Habitación")}">`:`<div style="height:100%;display:grid;place-items:center;color:var(--muted)">Fotos próximamente</div>`}</div>
    ${ph.length>1?`<div class="gallery" id="grThumbs">${ph.map(p=>`<figure><img src="${photoUrl(p)}" alt="" data-ph="${esc(p)}" loading="lazy" style="cursor:pointer"></figure>`).join("")}</div>`:""}
    ${r.description?`<p style="margin:0;max-width:68ch">${esc(r.description)}</p>`:""}
    <dl class="kv"><dt>Camas</dt><dd>${esc(r.beds||"")}</dd><dt>Capacidad</dt><dd>${r.capacity||"?"} personas</dd><dt>Baño</dt><dd>${esc(r.bath||"")}</dd>${r.size?`<dt>Área</dt><dd class="num">${esc(r.size)} m²</dd>`:""}<dt>Tarifa</dt><dd class="num">${cop(r.rate)} por noche</dd></dl>
    <div class="chips">${(r.features||[]).map(f=>`<span class="chip">${esc(f)}</span>`).join("")}</div>
    <div class="note ${st.ok?"ok":"warn"}">${st.ok?`Disponible del ${fd(G.q.in)} al ${fd(G.q.out)}.`:`${esc(st.why)} (${fd(G.q.in)} – ${fd(G.q.out)}). Prueba otras fechas.`}</div>`;
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
        const r=await fetch("/api/requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        const j=await r.json().catch(()=>({}));
        if(r.ok) id=j.id; else errText=j.error||"No pudimos registrar la solicitud.";
      }catch(_){errText="No hay conexión con el servidor.";}
      if(!id && errText && /disponible/.test(errText)){toast(errText);btn.disabled=false;btn.textContent="Enviar solicitud";load();return;}
      if(id){G.mine.push({id,p:payload.phone.replace(/\D/g,""),room:r.name||r.type,checkIn:q.in,checkOut:q.out,status:"nueva"});storeMine();render();}
      showResult(r,q,payload,id,errText);
    };
  }, true);
}
function showResult(r,q,p,id,errText){
  const msg=`Hola, quiero reservar en ${hName()}.\n• Habitación: ${r.name||r.type} (${r.number})\n• Llegada: ${fd(q.in,{weekday:"long",year:"numeric"})}${p.eta?" hacia las "+p.eta:""}\n• Salida: ${fd(q.out,{weekday:"long",year:"numeric"})}\n• Personas: ${q.ad} adulto(s)${q.ch?", "+q.ch+" niño(s)":""}\n• Nombre: ${p.first} ${p.last}\n• Documento: ${p.docType} ${p.docNumber}\n• Teléfono: ${p.phone}${p.notes?"\n• Comentarios: "+p.notes:""}${id?"\nCódigo de solicitud: "+id:""}`;
  const wa=waNum();
  openModal(id?"Solicitud enviada":"Envía tu solicitud",
    `${id?`<div class="note ok">Recibimos tu solicitud <b class="num">${esc(id)}</b>. Te confirmaremos por teléfono o WhatsApp; también puedes ver su estado en «Mis solicitudes» desde este navegador.</div>`
      :`<div class="note warn">${esc(errText||"No pudimos registrar la solicitud en línea.")} Envíala por WhatsApp o copia el mensaje.</div>`}
    <label class="f">Mensaje para el alojamiento<textarea id="rqMsg" rows="10" readonly>${esc(msg)}</textarea></label>
    ${wa?"":`<div class="muted" style="font-size:.82rem">${G.hotel.phone?"Llama o escribe al "+esc(G.hotel.phone)+" para confirmar.":"Pronto publicaremos nuestro WhatsApp."}</div>`}`,
    `<button class="btn" id="rqCopy">Copiar mensaje</button>${wa?`<a class="btn primary" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>`:""}<button class="btn" id="rqDone">Listo</button>`,
    ov=>{ov.querySelector("#rqDone").onclick=closeModal;
      ov.querySelector("#rqCopy").onclick=()=>{const ta=ov.querySelector("#rqMsg");const fb=()=>{ta.focus();ta.select();toast("Mensaje seleccionado: cópialo con Ctrl+C.");};
        try{navigator.clipboard.writeText(msg).then(()=>toast("Mensaje copiado"),fb);}catch(_){fb();}};});
}

/* ---------- arranque ---------- */
initSearch(); loadMine(); render(); load(); refreshMine();
setInterval(()=>{if(document.visibilityState==="visible"&&!modalOpen())load();},120000);
})();
