/* Hotel Portal Norte 170 — utilidades compartidas (scripts clásicos, ámbito global) */
const CHANNELS = [
  {k:"directo",n:"Directo / WhatsApp",c:"var(--ch-directo)"},
  {k:"booking",n:"Booking.com",c:"var(--ch-booking)"},
  {k:"airbnb",n:"Airbnb",c:"var(--ch-airbnb)"},
  {k:"expedia",n:"Expedia",c:"var(--ch-expedia)"},
  {k:"hotels",n:"Hoteles.com",c:"var(--ch-hotels)"},
  {k:"web",n:"Sitio web",c:"var(--ch-directo)"},
  {k:"otro",n:"Otro",c:"var(--ch-otro)"}];
const STATUS = {
  pendiente:{n:"Pendiente",cls:"warn"}, confirmada:{n:"Confirmada",cls:"info"},
  encasa:{n:"En casa",cls:"ok"}, finalizada:{n:"Finalizada",cls:""}, cancelada:{n:"Cancelada",cls:"bad"}};
const ROOM_STATUS = {disponible:{n:"Disponible",cls:"ok"}, limpieza:{n:"En limpieza",cls:"warn"}, mantenimiento:{n:"Mantenimiento",cls:"bad"}};
const REQ_ST = {nueva:{n:"Nueva",cls:"warn"}, aceptada:{n:"Aceptada",cls:"ok"}, rechazada:{n:"Rechazada",cls:"bad"}};
const FEATURES = ["TV pantalla plana","Wi-Fi gratis","Armario","Escritorio","Zona de trabajo","Toallas","Jabón y champú","Ventana exterior","Cobijas extra","Ventilador","Mesa de noche","Cortinas blackout"];
const DOCS = ["CC","CE","Pasaporte","TI","PPT","PEP","Otro"];
const MOTIVOS = ["Turismo","Negocios / trabajo","Visita familiar","Salud","Estudio","Tránsito","Otro"];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cop = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(n)||0);
const pad = n => String(n).padStart(2,"0");
function todayISO(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bogota",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function addDays(iso,n){const [y,m,d]=iso.split("-").map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);}
function diff(a,b){return Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/864e5);}
function fd(iso,o){if(!iso)return "—";return new Intl.DateTimeFormat("es-CO",Object.assign({timeZone:"UTC",day:"numeric",month:"short"},o||{})).format(new Date(iso+"T00:00:00Z"));}
function dow(iso){return new Date(iso+"T00:00:00Z").getUTCDay();}
const chan = k => CHANNELS.find(c=>c.k===k) || CHANNELS[CHANNELS.length-1];
function genId(p){return p + "-" + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();}
function photoUrl(id){return "/api/photos/" + encodeURIComponent(id);}
function nameHTML(n){const m=String(n||"").match(/^(.*?)(\d+)\s*$/);return m?esc(m[1])+"<span>"+esc(m[2])+"</span>":esc(n);}
const opt=(v,t,sel)=>`<option value="${esc(v)}" ${String(v)===String(sel)?"selected":""}>${esc(t)}</option>`;

let toastT;
function toast(msg){let t=$(".toast");if(!t){t=document.createElement("div");t.className="toast";t.setAttribute("role","status");document.body.appendChild(t);}t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3600);}

function openModal(title, body, footer, onMount, wide){
  const root=$("#modalRoot");
  root.innerHTML=`<div class="ov" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal" ${wide?'style="max-width:880px"':''}><header><h2>${esc(title)}</h2><button class="x" aria-label="Cerrar">×</button></header><div class="mb">${body}</div>${footer?`<footer>${footer}</footer>`:""}</div></div>`;
  const ov=root.firstElementChild;
  ov.addEventListener("click",e=>{if(e.target===ov||e.target.closest(".x"))closeModal();});
  document.addEventListener("keydown",escClose);
  if(onMount) onMount(ov);
  const f=ov.querySelector(".mb input,.mb select,.mb textarea");if(f)try{f.focus({preventScroll:true});}catch(_){}
  return ov;
}
function escClose(e){if(e.key==="Escape")closeModal();}
function closeModal(){$("#modalRoot").innerHTML="";document.removeEventListener("keydown",escClose);}
const modalOpen=()=>!!$("#modalRoot").firstElementChild;
function confirmBtn(btn,label,fn){btn.addEventListener("click",()=>{if(btn.dataset.armed){fn();return;}btn.dataset.armed="1";const o=btn.textContent;btn.textContent=label;setTimeout(()=>{btn.textContent=o;delete btn.dataset.armed;},3500);});}

/* Reduce fotos grandes a 1800 px antes de subirlas */
async function shrink(file){
  try{
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const bmp=await createImageBitmap(file); const max=1800; const k=Math.min(1,max/Math.max(bmp.width,bmp.height));
    if(k===1 && file.size<2.5e6) return file;
    const c=document.createElement("canvas"); c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k);
    c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
    const b=await new Promise(res=>c.toBlob(res,"image/jpeg",.85)); return b||file;
  }catch(_){return file;}
}
