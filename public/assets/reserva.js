/* Hotel Portal Norte 170 — página del huésped: confirmación de la reserva y check-in en línea (TRA + fotos) */
(() => {
const qs = new URLSearchParams(location.search);
const RID = qs.get("r") || "", TOK = qs.get("t") || "";
const API = `/api/guest/${encodeURIComponent(RID)}/${encodeURIComponent(TOK)}`;
const DKEY = "pn170-ci-" + RID;
const COUNTRIES = ["Colombia","Venezuela","Ecuador","Perú","Argentina","Chile","México","Estados Unidos","España","Brasil","Panamá","Costa Rica","Canadá","Francia","Alemania","Italia","Reino Unido"];
const ST = {pendiente:["Pendiente de confirmación","warn"],confirmada:["Confirmada","ok"],encasa:["En casa","ok"],finalizada:["Finalizada",""],cancelada:["Cancelada","bad"]};
let D = null;          // datos de la reserva
let showForm = false;  // si ya hizo check-in, el formulario se abre a pedido
const S = {people:[], trip:{eta:"",origin:"",destination:"",purpose:"Turismo",transport:"Terrestre",emergency:""}, consent:false};
const prev = new Map(); // vistas previas locales de las fotos: "i:k" → url

const ageOf = b => { if(!b) return null; const t=todayISO(); const [y,m,d]=b.split("-").map(Number),[Y,M,DD]=t.split("-").map(Number); return Y-y-((M<m||(M===m&&DD<d))?1:0); };
const blankPerson = (i) => ({first:"",last:"",docType:"CC",docNumber:"",nationality:"Colombia",birth:"",sex:"",phone:"",email:"",city:"",job:"",selfie:"",docFront:"",docBack:"",_titular:i===0});
function saveDraft(){ try{ localStorage.setItem(DKEY, JSON.stringify({people:S.people,trip:S.trip,at:Date.now()})); }catch(_){} }
function loadDraft(){ try{ const d=JSON.parse(localStorage.getItem(DKEY)||"null"); if(d && Date.now()-d.at<14*864e5) return d; }catch(_){} return null; }

async function load(){
  if(!RID || !TOK){ fatal("El enlace está incompleto. Pídelo de nuevo al hotel por WhatsApp."); return; }
  try{
    const r = await fetch(API); const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || "No pudimos abrir tu reserva.");
    D = j;
  }catch(e){ fatal(e.message); return; }
  if(D.hotel && D.hotel.name) $("#hName").textContent = D.hotel.name;
  document.title = `Reserva ${D.res.id} · ${D.hotel.name || "Hotel Portal Norte 170"}`;
  const n = Math.min(12, Math.max(1, (Number(D.res.adults)||1) + (Number(D.res.children)||0)));
  const draft = loadDraft();
  if(draft && Array.isArray(draft.people) && draft.people.length){ S.people = draft.people.map((p,i)=>Object.assign(blankPerson(i),p,{_titular:i===0})); Object.assign(S.trip, draft.trip||{});
    while(S.people.length<n) S.people.push(blankPerson(S.people.length)); }
  else { S.people = Array.from({length:n},(_,i)=>blankPerson(i)); Object.assign(S.people[0], {first:D.titular.first||"", last:D.titular.last||"", phone:D.titular.phone||"", email:D.titular.email||""}); S.trip.eta = D.res.eta || ""; }
  render();
}
function fatal(msg){ $("#app").innerHTML = `<div class="gcard"><div class="bd"><h1 style="font-size:1.3rem">No encontramos la reserva</h1><p class="muted" style="margin:0">${esc(msg)}</p></div></div>`; }

/* ---------- confirmación ---------- */
function confirmationHTML(){
  const {res, room, hotel} = D, st = ST[res.status] || [res.status,""];
  const nights = Math.max(0, diff(res.checkIn, res.checkOut)), bal = (Number(res.total)||0) - (Number(res.paid)||0);
  const photo = room && room.photos && room.photos[0];
  return `<section class="gcard" aria-labelledby="cTitle">
    ${photo?`<div class="ph"><img src="${photoUrl(photo)}" alt="Habitación ${esc(room.number)}"></div>`:""}
    <div class="bd">
      <div class="gh"><div><div class="code">Reserva ${esc(res.id)}</div><h1 id="cTitle">${D.titular.first?`Hola, ${esc(D.titular.first.split(" ")[0])}`:"Tu reserva"}</h1></div><span class="pill ${st[1]}">${esc(st[0])}</span></div>
      <div class="dates">
        <div><div class="k">Llegada</div><div class="v">${fd(res.checkIn,{weekday:"short",day:"numeric",month:"short"})}</div><div class="t">desde las ${esc(hotel.checkinFrom||"15:00")}</div></div>
        <div class="n"><b>${nights}</b> noche${nights===1?"":"s"}</div>
        <div><div class="k">Salida</div><div class="v">${fd(res.checkOut,{weekday:"short",day:"numeric",month:"short"})}</div><div class="t">antes de las ${esc(hotel.checkout||"11:00")}</div></div>
      </div>
      <div class="kvs">
        <div><span>Habitación</span><b>${esc(room?`${room.number} · ${room.name||room.type||""}`:"—")}</b></div>
        <div><span>Huéspedes</span><b>${res.adults||1} adulto(s)${res.children?`, ${res.children} niño(s)`:""}</b></div>
        ${res.total?`<div><span>Total</span><b class="num">${cop(res.total)}</b></div><div><span>Saldo por pagar</span><b class="num" style="color:${bal>0?"var(--warn)":"var(--ok)"}">${cop(bal)}</b></div>`:""}
      </div>
      <div class="acts">
        <button class="btn primary" id="pdfBtn" type="button">Descargar PDF</button>
        <button class="btn" id="shareBtn" type="button">Compartir</button>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((hotel.name||"")+", "+(hotel.address||""))}">Cómo llegar</a>
        ${hotel.whatsapp?`<a class="btn" target="_blank" rel="noopener" href="${PNDocs.waUrl(hotel.whatsapp,`Hola, tengo la reserva ${res.id}.`)}">Escribir al hotel</a>`:""}
      </div>
      <div class="muted" style="font-size:.82rem">${esc(hotel.address||"")}${hotel.zone?" · "+esc(hotel.zone):""}</div>
    </div></section>`;
}
async function buildPdf(){
  const logo = await PNDocs.logoBadge();
  const guest = S.people[0] && S.people[0].first ? S.people[0] : D.titular;
  return PNDocs.confirmation({hotel:D.hotel, res:D.res, room:D.room, guest, link:location.href, logo}).blob();
}

/* ---------- check-in ---------- */
const SHOT_LABEL={selfie:"Selfie",docFront:"Documento frente",docBack:"Documento reverso"};
const isMinor = p => (ageOf(p.birth) ?? 99) < 18;
const shotReq = (p,k) => k==="docFront" || (k==="selfie" && !isMinor(p));
const busy = new Set(); // fotos subiendo: "i:k"
function tileInner(i,k){
  const p=S.people[i], has=!!p[k], key=i+":"+k, url=prev.get(key), label=SHOT_LABEL[k];
  return `${url?`<img src="${url}" alt="">`:""}
    ${url?"":`<span class="ic" aria-hidden="true">${k==="selfie"?"🤳":"🪪"}</span><span>${esc(label)}</span><span class="req">${shotReq(p,k)?"Obligatoria":"Opcional"}</span>`}
    ${busy.has(key)?`<span class="st">Subiendo…</span>`:has?`<span class="st">✓ ${esc(label)} lista</span>`:""}`;
}
function shotHTML(i,k,cls){
  const p=S.people[i];
  return `<div class="shotw"><div class="shot ${cls||""} ${p[k]?"ok":""}" data-shot="${i}:${k}"><span class="tin">${tileInner(i,k)}</span></div>
    ${pickBtns(`data-i="${i}" data-k="${k}" aria-label="${esc(SHOT_LABEL[k])} de ${esc(p.first||"huésped "+(i+1))}"`, k==="selfie"?"user":"environment", {cls:"btn sm",cam:k==="selfie"?"Tomar selfie":"Tomar foto"})}</div>`;
}
// Actualiza solo la casilla de una foto, sin reemplazar su campo de archivo.
function updateTile(i,k,errMsg){
  const t=document.querySelector(`[data-shot="${i}:${k}"]`); if(!t) return;
  t.querySelector(".tin").innerHTML = tileInner(i,k) + (errMsg?`<span class="st">${esc(errMsg)}</span>`:"");
  t.classList.toggle("ok", !!S.people[i][k] && !errMsg); t.classList.toggle("err", !!errMsg);
}
function personHTML(p,i){
  const minor = isMinor(p);
  const f = (k,label,type="text",extra="") => `<label class="f">${label}<input type="${type}" data-i="${i}" data-k="${k}" value="${esc(p[k]||"")}" ${extra}></label>`;
  return `<div class="person" data-person="${i}">
    <div class="ph-h"><div><div class="tag">${i===0?"Huésped titular":"Acompañante "+i}</div><h3>${esc(((p.first||"")+" "+(p.last||"")).trim()||"Datos de la persona")}</h3></div>
      ${i>0?`<button class="btn sm" type="button" data-rm="${i}">Quitar</button>`:""}</div>
    <div class="grid g2">
      ${f("first","Nombres","text",'autocomplete="given-name"')}${f("last","Apellidos","text",'autocomplete="family-name"')}
      <label class="f">Tipo de documento<select data-i="${i}" data-k="docType">${DOCS.map(x=>opt(x,DOC_NAMES[x]||x,p.docType)).join("")}</select></label>
      ${f("docNumber","Número de documento","text",'inputmode="text" autocapitalize="characters"')}
      <label class="f">Nacionalidad<input data-i="${i}" data-k="nationality" list="countries" value="${esc(p.nationality||"")}"></label>
      ${f("birth","Fecha de nacimiento","date",`max="${todayISO()}" min="1900-01-01"`)}
      <label class="f">Sexo<select data-i="${i}" data-k="sex">${[["","Prefiero no decir"],["F","Femenino"],["M","Masculino"],["Otro","Otro"]].map(([v,t])=>opt(v,t,p.sex)).join("")}</select></label>
      ${i===0?f("phone","Celular / WhatsApp","tel",'autocomplete="tel" inputmode="tel"')+f("email","Correo","email",'autocomplete="email"')+f("city","Ciudad de residencia")+f("job","Profesión u ocupación"):""}
    </div>
    <div>
      <div class="eyebrow" style="margin-bottom:8px">Fotos de identificación</div>
      <div class="shots">
        ${shotHTML(i,"selfie","")}
        ${shotHTML(i,"docFront","doc")}
        ${shotHTML(i,"docBack","doc back")}
      </div>
      <div class="muted shint" style="font-size:.76rem;margin-top:6px">${minor&&p.birth?"Para menores de edad la selfie es opcional; sube su tarjeta de identidad o registro civil.":"Selfie: rostro de frente, con buena luz y sin gafas oscuras. Documento: completo y legible, sin reflejos."}</div>
    </div>
  </div>`;
}
const resPax=()=>Math.max(1,(Number(D.res.adults)||1)+(Number(D.res.children)||0));
function paxHTML(){
  const n=S.people.length, want=resPax();
  return `<div class="pax"><div><b>¿Cuántas personas se alojan?</b><small>Incluye niños y bebés: cada persona necesita su ficha y sus fotos.</small></div>
    <div class="pax-ctl"><button type="button" class="btn" data-pax="-1" ${n<=1?"disabled":""} aria-label="Una persona menos">−</button><b aria-live="polite">${n}</b><button type="button" class="btn" data-pax="1" ${n>=12?"disabled":""} aria-label="Una persona más">+</button></div></div>
    ${n<want?`<div class="note warn">Tu reserva es para <b>${want} personas</b>. Agrega ${want-n===1?"al acompañante que falta":`a los ${want-n} acompañantes que faltan`} con el botón <b>+</b>.</div>`
      :n>1?`<div class="muted" style="font-size:.82rem">Abajo hay una ficha para cada persona: <b>titular</b> y ${n-1} acompañante${n-1===1?"":"s"}. Llena sus datos y sube su selfie y documento.</div>`:""}`;
}
function checkinHTML(){
  const {res} = D;
  if(D.checkin && !showForm){
    return `<section class="gcard"><div class="bd">
      <div class="done"><span aria-hidden="true" style="font-size:1.6rem">✓</span><div><b>Check-in en línea recibido</b>
        <p>Registramos ${D.checkin.people} persona${D.checkin.people===1?"":"s"} el ${new Date(D.checkin.at).toLocaleString("es-CO",{timeZone:"America/Bogota",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).replace(/\.$/,"")}. Al llegar solo debes mostrar tu documento.</p></div></div>
      ${D.canCheckin?`<button class="btn" type="button" id="redo" style="align-self:flex-start">Corregir datos o enviar de nuevo</button>`:""}
    </div></section>`;
  }
  if(!D.canCheckin){
    return `<section class="gcard"><div class="bd"><h2>Check-in en línea</h2><p class="muted" style="margin:0">${res.status==="cancelada"?"Esta reserva está cancelada.":"El registro en línea ya no está disponible para esta reserva."} Si necesitas ayuda, escríbenos por WhatsApp.</p></div></section>`;
  }
  return `<section aria-labelledby="ciTitle" style="display:flex;flex-direction:column;gap:14px">
    <div class="sec-h"><h2 id="ciTitle">Check-in en línea</h2><div class="steps"><span>1 · Tu viaje</span><span>2 · Huéspedes y fotos</span><span>3 · Autorización</span><span>4 · Contrato</span></div></div>
    <p class="muted" style="margin:0">Completa la tarjeta de registro hotelero (TRA) que exige la ley en Colombia para cada persona que se aloja, incluidos los niños. Tus datos se guardan de forma privada y solo los ve el hotel.</p>
    <fieldset><legend>1 · Tu viaje</legend><div class="grid g2">
      <label class="f">Hora estimada de llegada<input type="time" data-t="eta" value="${esc(S.trip.eta)}"></label>
      <label class="f">¿Desde qué ciudad llegas?<input data-t="origin" value="${esc(S.trip.origin)}" placeholder="Ej. Medellín"></label>
      <label class="f">Destino al salir<input data-t="destination" value="${esc(S.trip.destination)}" placeholder="Ej. Cartagena"></label>
      <label class="f">Motivo del viaje<select data-t="purpose">${MOTIVOS.map(x=>opt(x,x,S.trip.purpose)).join("")}</select></label>
      <label class="f">Medio de transporte<select data-t="transport">${["Terrestre","Aéreo","Otro"].map(x=>opt(x,x,S.trip.transport)).join("")}</select></label>
      <label class="f">Contacto de emergencia<input data-t="emergency" value="${esc(S.trip.emergency)}" placeholder="Nombre y teléfono"></label>
    </div></fieldset>
    <fieldset><legend>2 · Huéspedes y fotos (${S.people.length})</legend>
      <div id="paxBox">${paxHTML()}</div>
      <div id="people" style="display:flex;flex-direction:column;gap:12px">${S.people.map(personHTML).join("")}</div>
      ${S.people.length<12?`<button class="btn" type="button" id="addP" style="align-self:flex-start">+ Agregar acompañante</button>`:""}
    </fieldset>
    <fieldset><legend>3 · Autorización</legend>
      <label class="f chk"><input type="checkbox" id="consent" ${S.consent?"checked":""}> Declaro que los datos son ciertos y autorizo a ${esc(D.hotel.name||"el alojamiento")} a tratarlos, junto con las fotos, para el registro hotelero (TRA), los reportes exigidos por la ley (SIRE de Migración Colombia para extranjeros) y la seguridad del alojamiento, conforme a la Ley 1581 de 2012.</label>
    </fieldset>
    <div class="sticky-go"><div id="ciErr" role="alert"></div><button class="btn primary" type="button" id="send" style="padding:13px;font-size:1rem">Enviar check-in</button></div>
    <datalist id="countries">${COUNTRIES.map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
  </section>`;
}
/* ---------- contrato y políticas (se firma al hacer el check-in) ---------- */
function contractHTML(){
  const c=D.contract; if(!c) return "";
  const when=iso=>new Date(iso).toLocaleString("es-CO",{timeZone:"America/Bogota",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}).replace(/\.$/,"");
  if(c.signed){
    return `<section class="gcard"><div class="bd">
      <div class="done"><span aria-hidden="true" style="font-size:1.6rem">✓</span><div><b>Contrato y políticas firmados</b>
        <p>Firmado por ${esc(c.signerName||"")} el ${esc(when(c.signedAt))}. Código de verificación <span class="num" style="font-size:.8rem">${esc(c.hash||"")}</span>.</p></div></div>
      <div class="acts"><a class="btn primary" href="${API}/contract.pdf">Descargar contrato (PDF)</a></div>
      ${D.wifi?`<div class="wifi"><b>Wi‑Fi del alojamiento</b><span>Red <span class="num">${esc(D.wifi.name)}</span></span>${D.wifi.pass?`<span>Contraseña <span class="num">${esc(D.wifi.pass)}</span></span>`:""}</div>`:""}
    </div></section>`;
  }
  if(!D.canCheckin) return `<section class="gcard"><div class="bd"><h2>Contrato y políticas</h2><p class="muted" style="margin:0">Firma el contrato de hospedaje en recepción al llegar.</p></div></section>`;
  if(!D.checkin) return `<section class="gcard"><div class="bd"><h2>4 · Contrato y políticas</h2><p class="muted" style="margin:0">Cuando envíes el check-in se habilita aquí la lectura y firma del contrato de hospedaje con las políticas del hotel. Es obligatorio para ingresar.</p></div></section>`;
  const t=S.people[0]||{};
  return `<section class="gcard" id="ctSec" aria-labelledby="ctTitle"><div class="bd">
    <div class="sec-h"><h2 id="ctTitle">Último paso: firma el contrato</h2><span class="pill warn">Pendiente</span></div>
    <p class="muted" style="margin:0">Lee las políticas del hotel y los términos y condiciones, marca las declaraciones y firma. Recibirás el contrato en PDF.</p>
    <div id="ctForm" style="display:flex;flex-direction:column;gap:12px">${PNSign.formHTML(c,{name:`${D.titular.first||t.first||""} ${D.titular.last||t.last||""}`.trim(),doc:t.docNumber||""})}</div>
    <div id="ctErr" role="alert"></div>
    <button class="btn primary" type="button" id="ctSend" style="padding:13px;font-size:1rem">Firmar contrato</button>
  </div></section>`;
}
async function refresh(){ try{ const r=await fetch(API); if(r.ok){ D=await r.json(); } }catch(_){} }
function render(){
  $("#app").innerHTML = confirmationHTML() + paymentsHTML() + checkinHTML() + contractHTML() + `<p class="foot-g">${esc(D.hotel.name||"")} · ${esc(D.hotel.address||"")}${D.hotel.whatsapp?" · WhatsApp "+esc(D.hotel.whatsapp):""}</p>`;
  bind();
}
function renderPeople(){ const box=$("#people"); if(!box) return; box.innerHTML=S.people.map(personHTML).join(""); const pb=$("#paxBox"); if(pb) pb.innerHTML=paxHTML(); const lg=box.closest("fieldset").querySelector("legend"); if(lg) lg.textContent=`2 · Huéspedes y fotos (${S.people.length})`; }

/* ---------- pagos: subir comprobante ---------- */
const PST={"verificado":["Verificado","ok"],"por verificar":["Por verificar","warn"],"rechazado":["Rechazado","bad"]};
let payPhoto="", payBusy=false, payPrev="";
function paymentsHTML(){
  if(!D.canPay && !(D.payments||[]).length) return "";
  const bal=Math.max(0,(Number(D.res.total)||0)-(Number(D.res.paid)||0)), list=D.payments||[];
  return `<section class="gcard" aria-labelledby="payTitle"><div class="bd">
    <div class="gh"><div><div class="code">Pagos</div><h2 id="payTitle" style="margin:0;font-size:1.15rem">Envía tu comprobante de pago</h2></div>${D.res.total?`<span class="pill ${bal>0?"warn":"ok"}">${bal>0?"Saldo "+cop(bal):"Pagado"}</span>`:""}</div>
    ${D.payInfo?`<div class="note" style="white-space:pre-wrap">${esc(D.payInfo)}</div>`:""}
    ${list.length?`<div class="paylist">${list.map(p=>`<div class="payit">${p.photo?`<button type="button" class="paythumb" data-gpay="${esc(p.photo)}" data-cap="${esc("Comprobante · "+cop(p.amount)+" · "+fd(p.date))}" aria-label="Ver comprobante"><img src="${API}/payment-photo/${encodeURIComponent(p.photo)}" alt="" loading="lazy"></button>`:""}<div style="flex:1"><b class="num">${cop(p.amount)}</b><small>${esc(p.method)} · ${fd(p.date)}</small></div><span class="pill ${(PST[p.status]||["",""])[1]}">${esc((PST[p.status]||[p.status])[0])}</span></div>`).join("")}</div>`:""}
    ${D.canPay?`<details class="payf" ${!list.length&&bal>0?"open":""}><summary>${list.length?"Enviar otro comprobante":"Ya pagué: subir la foto del comprobante"}</summary>
      <div class="grid2" style="margin-top:10px">
        <label class="f">Valor pagado (COP)<input type="number" id="payAmt" min="1000" step="1000" inputmode="numeric" value="${bal||""}"></label>
        <label class="f">Medio de pago<select id="payMet">${(D.payMethods||[]).map(x=>`<option>${esc(x)}</option>`).join("")}</select></label>
        <label class="f">Fecha del pago<input type="date" id="payDate" value="${esc(D.today||todayISO())}" max="${esc(D.today||todayISO())}"></label>
        <label class="f">Referencia (opcional)<input id="payRef" maxlength="60" placeholder="N.º de transacción"></label>
      </div>
      <div class="payshot ${payPhoto?"ok":""}" id="payShot">
        ${payPrev?`<img src="${payPrev}" alt="Comprobante">`:`<span>🧾</span>`}<div class="payshot-r"><span id="payShotT">${payBusy?"Subiendo foto…":payPhoto?"Foto lista · puedes cambiarla":"Foto del comprobante"}</span>
        ${pickBtns('data-pay="1"',"environment")}</div></div>
      <div id="payErr"></div>
      <button class="btn primary" id="paySend" type="button" style="margin-top:10px">Enviar comprobante</button>
      <p class="muted" style="font-size:.8rem;margin:.6em 0 0">El hotel revisará el comprobante y lo sumará a tu reserva. Te avisaremos si hay algún problema.</p>
    </details>`:""}
  </div></section>`;
}
async function payPick(input){
  const file=input.files&&input.files[0]; if(!file) return;
  if(payPrev) URL.revokeObjectURL(payPrev); payPrev=URL.createObjectURL(file); payPhoto=""; payBusy=true; paySync();
  try{ const blob=await shrink(file); const r=await fetch(API+"/payment-photo",{method:"POST",headers:{"Content-Type":blob.type||"image/jpeg"},body:blob});
    const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||"No se pudo subir la foto."); payPhoto=j.id; }
  catch(e){ $("#payErr").innerHTML=`<div class="note bad">${esc(e.message)}</div>`; }
  payBusy=false; paySync(); input.value="";
}
function paySync(){ const l=$("#payShot"); if(!l) return; l.classList.toggle("ok",!!payPhoto); const img=l.querySelector(":scope > img"); if(payPrev){ if(img) img.src=payPrev; else { const sp=l.querySelector(":scope > span"); const im=document.createElement("img"); im.src=payPrev; im.alt="Comprobante"; sp.replaceWith(im);} }
  $("#payShotT").textContent=payBusy?"Subiendo foto…":payPhoto?"Foto lista · puedes cambiarla":"Foto del comprobante"; }
async function paySend(){
  const err=$("#payErr"), btn=$("#paySend"); err.innerHTML="";
  const amount=Number($("#payAmt").value)||0;
  if(amount<=0){ err.innerHTML=`<div class="note bad">Escribe el valor que pagaste.</div>`; return; }
  if(payBusy){ err.innerHTML=`<div class="note warn">Espera a que termine de subir la foto.</div>`; return; }
  if(!payPhoto){ err.innerHTML=`<div class="note bad">Adjunta la foto del comprobante.</div>`; return; }
  btn.disabled=true; btn.textContent="Enviando…";
  try{ const r=await fetch(API+"/payment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount,method:$("#payMet").value,date:$("#payDate").value,ref:$("#payRef").value,photoId:payPhoto})});
    const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||"No se pudo enviar el comprobante.");
    payPhoto=""; if(payPrev) URL.revokeObjectURL(payPrev); payPrev=""; await refresh(); render(); toast("¡Comprobante enviado! El hotel lo verificará.");
  }catch(e){ err.innerHTML=`<div class="note bad">${esc(e.message)}</div>`; btn.disabled=false; btn.textContent="Enviar comprobante"; }
}

/* ---------- eventos ---------- */
function bind(){
  bindOnce();
  $("#pdfBtn").onclick = async e => { const b=e.currentTarget; b.disabled=true; b.textContent="Generando…"; try{ PNDocs.download(await buildPdf(), `Confirmacion-${D.res.id}.pdf`); }catch(err){ toast("No se pudo generar el PDF."); } b.disabled=false; b.textContent="Descargar PDF"; };
  $("#shareBtn").onclick = async () => {
    const text = `Mi reserva en ${D.hotel.name||"Hotel Portal Norte 170"}: ${fd(D.res.checkIn)} → ${fd(D.res.checkOut)}. ${location.href}`;
    try{ if(await PNDocs.sharePdf(await buildPdf(), `Confirmacion-${D.res.id}.pdf`, text)) return; }catch(_){}
    window.open(PNDocs.waUrl("", text), "_blank", "noopener");
  };
  const redo = $("#redo"); if(redo) redo.onclick = () => { showForm = true; render(); $("#ciTitle").scrollIntoView({behavior:"smooth"}); };
  const cf=$("#ctForm");
  if(cf){ const collect=PNSign.mount(cf); $("#ctSend").onclick=async()=>{
    const err=$("#ctErr"), btn=$("#ctSend"); err.innerHTML="";
    const v=collect(); if(v.error){ err.innerHTML=`<div class="note bad">${esc(v.error)}</div>`; return; }
    btn.disabled=true; btn.textContent="Firmando…";
    try{ const r=await fetch(API+"/contract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(v.data)}); const j=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error||"No se pudo registrar la firma.");
      await refresh(); render(); toast("¡Contrato firmado! Ya puedes descargarlo."); const cs=document.querySelector(".done"); cs&&cs.scrollIntoView({behavior:"smooth",block:"center"});
    }catch(e){ err.innerHTML=`<div class="note bad">${esc(e.message)}</div>`; btn.disabled=false; btn.textContent="Firmar contrato"; }
  }; }
}
let bound=false;
function bindOnce(){
  if(bound) return; bound=true; const app=$("#app");
  app.addEventListener("input", onInput); app.addEventListener("change", onInput);
  app.addEventListener("click", e => {
    const rm = e.target.closest("[data-rm]"); if(rm){ const i=+rm.dataset.rm; S.people.splice(i,1); [...prev.keys()].forEach(k=>{ if(+k.split(":")[0]>=i) prev.delete(k); }); saveDraft(); renderPeople(); return; }
    const px=e.target.closest("[data-pax]");
    if(px){ if(+px.dataset.pax>0){ if(S.people.length<12) S.people.push(blankPerson(S.people.length)); }
      else if(S.people.length>1){ const i=S.people.length-1; S.people.pop(); [...prev.keys()].forEach(k=>{ if(+k.split(":")[0]>=i) prev.delete(k); }); }
      saveDraft(); renderPeople(); if(+px.dataset.pax>0){ const last=$("#people").lastElementChild; last&&last.scrollIntoView({behavior:"smooth",block:"start"}); } return; }
    if(e.target.closest("#addP")){ S.people.push(blankPerson(S.people.length)); saveDraft(); renderPeople(); const last=$("#people").lastElementChild; last && last.scrollIntoView({behavior:"smooth",block:"center"}); if(S.people.length>=12) e.target.remove(); return; }
    if(e.target.closest("#send")) submit();
    if(e.target.closest("#paySend")) paySend();
    const gp=e.target.closest("[data-gpay]"); if(gp) showImage(`${API}/payment-photo/${encodeURIComponent(gp.dataset.gpay)}`,"comprobante.jpg",gp.dataset.cap);
  });
}
function onInput(e){
  const t = e.target;
  if(t.type==="file") { if(t.dataset.pay){ if(e.type==="change") payPick(t); return; } if(e.type==="change") upload(t); return; }
  if(t.id==="consent"){ S.consent=t.checked; return; }
  if(t.dataset.t){ S.trip[t.dataset.t]=t.value; saveDraft(); return; }
  if(t.dataset.i!=null && t.dataset.k){ const p=S.people[+t.dataset.i]; p[t.dataset.k]=t.value;
    if(t.dataset.k==="first"||t.dataset.k==="last"){ const h=t.closest(".person").querySelector("h3"); h.textContent=((p.first||"")+" "+(p.last||"")).trim()||"Datos de la persona"; }
    if(t.dataset.k==="birth" && e.type==="change") renderShots(+t.dataset.i);
    saveDraft(); }
}
function renderShots(i){ ["selfie","docFront","docBack"].forEach(k=>updateTile(i,k)); const card=document.querySelector(`[data-person="${i}"]`); if(!card) return; const tmp=document.createElement("div"); tmp.innerHTML=personHTML(S.people[i],i); card.querySelector(".shint").replaceWith(tmp.querySelector(".shint")); }
async function upload(input){
  const i=+input.dataset.i, k=input.dataset.k, file=input.files&&input.files[0]; if(!file) return;
  const key=i+":"+k; if(prev.get(key)) URL.revokeObjectURL(prev.get(key));
  prev.set(key, URL.createObjectURL(file)); S.people[i][k]=""; busy.add(key); updateTile(i,k);
  try{
    const blob = await shrink(file);
    const r = await fetch(API+"/photo", {method:"POST", headers:{"Content-Type":blob.type||"image/jpeg"}, body:blob});
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || "No se pudo subir la foto.");
    busy.delete(key); S.people[i][k]=j.id; saveDraft(); updateTile(i,k);
  }catch(err){ busy.delete(key); updateTile(i,k,(err.message||"Error")+" Toca para reintentar."); }
  input.value="";
}
function validate(){
  for(let i=0;i<S.people.length;i++){
    const p=S.people[i], who=i===0?"del titular":`del acompañante ${i}`, a=ageOf(p.birth);
    if(!p.first.trim()||!p.last.trim()) return [i,`Escribe nombres y apellidos ${who}.`];
    if(!p.docNumber.trim()) return [i,`Falta el número de documento ${who}.`];
    if(!p.nationality.trim()) return [i,`Falta la nacionalidad ${who}.`];
    if(!p.birth) return [i,`Falta la fecha de nacimiento ${who}.`];
    if(i===0 && a<18) return [i,"El huésped titular debe ser mayor de edad."];
    if(i===0 && (String(p.phone).replace(/\D/g,"").length<7 || !p.city.trim())) return [i,"Escribe el celular y la ciudad de residencia del titular."];
    if(!p.docFront) return [i,`Sube la foto del documento ${who}.`];
    if(a>=18 && !p.selfie) return [i,`Sube la selfie ${who}.`];
  }
  if(!S.consent) return [-1,"Marca la autorización de tratamiento de datos para continuar."];
  return null;
}
async function submit(){
  const err=$("#ciErr"), btn=$("#send"); err.innerHTML="";
  if(busy.size){ err.innerHTML=`<div class="note warn">Espera a que terminen de subir las fotos.</div>`; return; }
  const v=validate();
  if(v){ err.innerHTML=`<div class="note bad">${esc(v[1])}</div>`; const el=v[0]>=0?document.querySelector(`[data-person="${v[0]}"]`):$("#consent"); el&&el.scrollIntoView({behavior:"smooth",block:"center"}); return; }
  btn.disabled=true; btn.textContent="Enviando…";
  try{
    const people=S.people.map(({_titular,...p})=>p);
    const r=await fetch(API+"/checkin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...S.trip,people,consent:true})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||"No se pudo enviar. Intenta de nuevo.");
    try{ localStorage.removeItem(DKEY); }catch(_){}
    D.checkin={at:j.at,people:j.people}; showForm=false; D.titular={...D.titular,first:people[0].first,last:people[0].last};
    await refresh(); render();
    const ct=document.getElementById("ctSec"); if(ct){ ct.scrollIntoView({behavior:"smooth"}); toast("Check-in recibido. Ahora firma el contrato."); } else { window.scrollTo({top:0,behavior:"smooth"}); toast("¡Listo! Recibimos tu check-in."); }
  }catch(e){ err.innerHTML=`<div class="note bad">${esc(e.message)}</div>`; btn.disabled=false; btn.textContent="Enviar check-in"; }
}
load();
})();
