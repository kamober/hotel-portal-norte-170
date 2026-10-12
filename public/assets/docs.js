/* Hotel Portal Norte 170 — documentos PDF (confirmación, ficha de reserva con registro hotelero, listado)
   y utilidades para descargar, imprimir y compartir por WhatsApp. Requiere pdf.js. */
(function(root){
const NAVY="#0E2A42", RED="#C62D24", CREAM="#FBEFD9", SAND="#F4EDE2", INK="#1F2A37", MUTED="#6B7280", LINE="#E2D9CC";
const ST={pendiente:"Pendiente de confirmación",confirmada:"Confirmada",encasa:"En casa",finalizada:"Finalizada",cancelada:"Cancelada"};
const CH={directo:"Directo / WhatsApp",booking:"Booking.com",airbnb:"Airbnb",expedia:"Expedia",hotels:"Hoteles.com",web:"Sitio web",otro:"Otro"};
const money=v=>"$ "+Math.round(Number(v)||0).toLocaleString("es-CO");
const fdate=(d,long)=>{if(!d)return "—";try{return new Intl.DateTimeFormat("es-CO",long?{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}:{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(d+"T12:00:00Z"));}catch(_){return d;}};
const nightsOf=r=>Math.max(0,Math.round((Date.parse(r.checkOut+"T00:00:00Z")-Date.parse(r.checkIn+"T00:00:00Z"))/864e5));
const fullName=g=>g?((g.first||"")+" "+(g.last||"")).trim():"";
const age=b=>{if(!b)return null;const d=new Date(b+"T00:00:00Z"),t=new Date();let a=t.getUTCFullYear()-d.getUTCFullYear();if(t.getUTCMonth()<d.getUTCMonth()||(t.getUTCMonth()===d.getUTCMonth()&&t.getUTCDate()<d.getUTCDate()))a--;return isNaN(a)?null:a;};
const nowTxt=()=>{try{return new Intl.DateTimeFormat("es-CO",{timeZone:"America/Bogota",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date());}catch(_){return new Date().toISOString();}};

/* ---------- piezas comunes ---------- */
function header(d,o){
  const W=d.W,h=o.h||104;
  d.rect(0,0,W,h,{fill:NAVY}); d.rect(0,h,W,4,{fill:RED});
  if(o.logo) d.image(o.logo,40,(h-62)/2,62,62);
  const x=o.logo?114:40;
  d.text(o.hotel||"Hotel Portal Norte 170",x,h/2-20,{font:"TB",size:19,color:"#FFFFFF"});
  d.text("HOTEL · COLIVING · BOGOTÁ",x,h/2+4,{font:"B",size:7.5,color:"#E7C9A9"});
  if(o.kicker) d.text(o.kicker,W-40,h/2-22,{font:"B",size:8,color:"#E7C9A9",align:"right"});
  if(o.code) d.text(o.code,W-40,h/2-8,{font:"TB",size:18,color:"#FFFFFF",align:"right"});
  if(o.sub) d.text(o.sub,W-40,h/2+16,{font:"R",size:8.5,color:"#D6DEE6",align:"right"});
  return h+4;
}
function footer(d,hotel,pageNo,total){
  const y=d.H-34; d.line(40,y,d.W-40,y,{color:LINE});
  const c=[hotel.address,hotel.whatsapp?"WhatsApp "+hotel.whatsapp:(hotel.phone?"Tel. "+hotel.phone:""),hotel.email].filter(Boolean).join("  ·  ");
  d.text(c,40,y+8,{font:"R",size:7.5,color:MUTED,maxW:d.W-140,maxLines:1});
  d.text(`Página ${pageNo}${total?" de "+total:""}`,d.W-40,y+8,{font:"R",size:7.5,color:MUTED,align:"right"});
}
function kv(d,x,y,w,rows,o={}){ // filas etiqueta / valor
  const lw=o.labelW||w*0.38, size=o.size||9.5;
  for(const [k,v] of rows){ if(v==null||v==="") continue;
    d.text(k,x,y,{font:"R",size:size-1,color:MUTED,maxW:lw-6});
    const ny=d.text(String(v),x+lw,y,{font:o.bold?"B":"R",size,color:INK,maxW:w-lw});
    y=Math.max(ny,y+size*1.3)+3; }
  return y;
}
function sectionTitle(d,t,x,y){d.text(t.toUpperCase(),x,y,{font:"B",size:7.5,color:RED});return y+14;}
function card(d,x,y,w,h,fill){d.rect(x,y,w,h,{fill:fill||"#FFFFFF",stroke:LINE,lw:0.8,r:8});}
function measureKv(d,w,rows,o={}){const lw=o.labelW||w*0.38,size=o.size||9.5;let y=0;for(const [k,v] of rows){if(v==null||v==="")continue;const n=d.wrap(String(v),w-lw,o.bold?"B":"R",size).length;y+=Math.max(n*size*1.3,size*1.3)+3;}return y;}

/* ---------- 1. Confirmación de reserva ---------- */
function confirmation({hotel={},res,room,guest,link,logo}){
  const d=new PNPDF({title:"Confirmación "+res.id}); d.addPage();
  let y=header(d,{logo,hotel:hotel.name,kicker:"CONFIRMACIÓN DE RESERVA",code:res.id,sub:"Emitida el "+nowTxt()})+26;
  const M=40,W=d.W-2*M, name=fullName(guest)||res.guestName||"huésped";
  const st=res.status==="cancelada"?"Esta reserva fue cancelada.":res.status==="pendiente"?"Recibimos tu reserva. Queda pendiente de confirmación mientras se registra el anticipo.":"¡Tu reserva está confirmada! Te esperamos.";
  y=d.text(`Hola, ${name.split(" ")[0]}`,M,y,{font:"TB",size:20,color:NAVY});
  y=d.text(st,M,y+2,{font:"R",size:10.5,color:INK,maxW:W})+14;
  // tarjetas estancia / pago
  const cw=(W-14)/2, n=nightsOf(res);
  const stay=[["Habitación",room?`${room.number} · ${room.name||room.type||""}`:res.roomId],["Llegada",`${fdate(res.checkIn,true)}`],["Hora de llegada",`desde las ${hotel.checkinFrom||"15:00"}${hotel.checkinTo?" hasta las "+hotel.checkinTo:""}${res.eta?" (estimada "+res.eta+")":""}`],
    ["Salida",`${fdate(res.checkOut,true)}, antes de las ${hotel.checkout||"11:00"}`],["Noches",String(n)],["Huéspedes",`${res.adults||1} adulto(s)${res.children?`, ${res.children} niño(s)`:""}`],["Estado",ST[res.status]||res.status]];
  const pay=[["Tarifa por noche",res.rate?money(res.rate):"—"],["Total de la estadía",money(res.total)],["Abonado",money(res.paid)],["Saldo por pagar",money((Number(res.total)||0)-(Number(res.paid)||0))],
    ["Canal",(CH[res.channel]||res.channel||"—")+(res.externalRef?" · "+res.externalRef:"")],["Medios de pago",hotel.payments||""]];
  const ch=Math.max(measureKv(d,cw-28,stay,{labelW:96}),measureKv(d,cw-28,pay,{labelW:100}))+44;
  card(d,M,y,cw,ch); card(d,M+cw+14,y,cw,ch,SAND);
  sectionTitle(d,"Tu estadía",M+14,y+14); kv(d,M+14,y+32,cw-28,stay,{labelW:96});
  sectionTitle(d,"Pago",M+cw+28,y+14); kv(d,M+cw+28,y+32,cw-28,pay,{labelW:100});
  const bal=(Number(res.total)||0)-(Number(res.paid)||0);
  y+=ch+14;
  if(bal>0&&res.status!=="cancelada"){d.rect(M,y,W,26,{fill:"#FBE3E1",r:6});d.text(`Saldo pendiente: ${money(bal)} — se paga a la llegada o por ${hotel.payments||"transferencia"}.`,M+12,y+8,{font:"B",size:9.5,color:RED,maxW:W-24,maxLines:1});y+=38;}
  // check-in en línea
  if(link&&res.status!=="cancelada"){
    card(d,M,y,W,74,CREAM);
    d.text("Check-in en línea",M+14,y+12,{font:"TB",size:13,color:NAVY});
    d.text("Llena la tarjeta de registro hotelero (TRA) y sube tu selfie y tu documento antes de llegar, para cada huésped. Así el ingreso es más rápido.",M+14,y+30,{font:"R",size:9,color:INK,maxW:W-28});
    d.text(link,M+14,y+56,{font:"B",size:8.5,color:RED,maxW:W-28,maxLines:1}); d.link(M,y,W,74,link); y+=88;
  }
  // cómo llegar
  y=sectionTitle(d,"Cómo llegar",M,y);
  y=d.text(`${hotel.address||""}${hotel.zone?" · "+hotel.zone:""}`,M,y,{font:"B",size:10,color:INK,maxW:W});
  if(hotel.frontDesk) y=d.text(hotel.frontDesk,M,y+2,{font:"R",size:9,color:MUTED,maxW:W});
  const maps="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent((hotel.name||"")+", "+(hotel.address||""));
  d.text("Ver en Google Maps",M,y+4,{font:"B",size:9,color:RED}); d.link(M,y+2,110,14,maps); y+=26;
  // políticas
  const pol=Array.isArray(hotel.policies)?hotel.policies:String(hotel.policies||"").split(/\n+/).filter(Boolean);
  if(pol.length){ y=sectionTitle(d,"Antes de llegar",M,y);
    for(const p of pol.slice(0,10)){ if(y>d.H-80) break; d.text("•",M,y,{font:"B",size:9,color:RED}); y=d.text(p,M+12,y,{font:"R",size:8.8,color:INK,maxW:W-12})+2; } }
  footer(d,hotel,1,1);
  return d;
}

/* ---------- 2. Ficha de reserva + tarjeta de registro hotelero ---------- */
function reservationSheet({hotel={},res,room,people=[],link,logo}){
  const d=new PNPDF({title:"Ficha "+res.id}); const M=40,W=612-2*M; let page=0;
  const newPage=(first)=>{d.addPage();page++;let y=header(d,{logo,hotel:hotel.name,h:first?96:70,kicker:"FICHA DE RESERVA · REGISTRO HOTELERO",code:res.id,sub:first?"Generada el "+nowTxt():""})+20;return y;};
  let y=newPage(true);
  const n=nightsOf(res), bal=(Number(res.total)||0)-(Number(res.paid)||0);
  const left=[["Habitación",room?`${room.number} · ${room.name||room.type||""}`:res.roomId],["Entrada",fdate(res.checkIn,true)+(res.eta?" · "+res.eta:"")],["Salida",fdate(res.checkOut,true)],["Noches",String(n)],["Personas",`${res.adults||1} adulto(s)${res.children?`, ${res.children} niño(s)`:""}`],["Estado",ST[res.status]||res.status]];
  const right=[["Canal",(CH[res.channel]||res.channel||"—")+(res.externalRef?" · "+res.externalRef:"")],["Total",money(res.total)],["Abonado",money(res.paid)+(res.payMethod?" · "+res.payMethod:"")],["Saldo",money(bal)],
    ["Check-in en línea",res.checkin&&res.checkin.at?"Completado el "+new Date(res.checkin.at).toLocaleDateString("es-CO",{timeZone:"America/Bogota"}):"No realizado"]];
  const cw=(W-14)/2, ch=Math.max(measureKv(d,cw-28,left,{labelW:78}),measureKv(d,cw-28,right,{labelW:92}))+40;
  card(d,M,y,cw,ch); card(d,M+cw+14,y,cw,ch,SAND);
  sectionTitle(d,"Estancia",M+14,y+12); kv(d,M+14,y+28,cw-28,left,{labelW:78});
  sectionTitle(d,"Pago y canal",M+cw+28,y+12); kv(d,M+cw+28,y+28,cw-28,right,{labelW:92});
  y+=ch+12;
  if(res.notes){const t=d.wrap(res.notes,W-28,"R",8.8).slice(0,6);const h=t.length*11.5+30;card(d,M,y,W,h);sectionTitle(d,"Notas",M+14,y+10);d.text(t.join("\n"),M+14,y+24,{font:"R",size:8.8,color:INK,maxW:W-28});y+=h+12;}
  y=sectionTitle(d,`Huéspedes registrados (${people.length})`,M,y);
  if(!people.length){d.text("Aún no hay fichas de huéspedes asociadas a esta reserva.",M,y,{font:"R",size:9.5,color:MUTED});y+=20;}
  people.forEach((p,i)=>{
    const g=p.g||{}, ph=p.photos||{}, a=age(g.birth);
    const rows=[["Nombres",g.first],["Apellidos",g.last],["Documento",[g.docType,g.docNumber].filter(Boolean).join(" ")],["Nacionalidad",g.nationality],
      ["Nacimiento",g.birth?fdate(g.birth)+(a!=null?` (${a} años)`:""):""],["Sexo",g.sex],["Teléfono",g.phone],["Correo",g.email],["Residencia",g.city],
      ["Procedencia",g.origin],["Destino",g.destination],["Motivo",g.purpose],["Transporte",g.transport],["Profesión",g.job],["Emergencia",g.emergency]];
    const fw=W-28-196, fh=measureKv(d,fw,rows,{labelW:80,size:9});
    const hasPh=!!(ph.selfie||ph.docFront||ph.docBack);
    const h=Math.max(fh+42+32, hasPh?258:96);
    if(y+h>d.H-60){footer(d,hotel,page);y=newPage(false);}
    card(d,M,y,W,h);
    d.text(i===0?"HUÉSPED TITULAR":`ACOMPAÑANTE ${i}`,M+14,y+12,{font:"B",size:7.5,color:RED});
    d.text(fullName(g)||"Sin nombre",M+14,y+22,{font:"TB",size:13,color:NAVY,maxW:fw});
    kv(d,M+14,y+42,fw,rows,{labelW:80,size:9});
    // fotos
    const px=M+W-14-182; let py=y+14;
    const box=(img,label,bx,by,bw,bh)=>{d.rect(bx,by,bw,bh,{fill:"#F6F3EE",stroke:LINE,lw:0.6,r:4}); if(img) d.image(img,bx+2,by+2,bw-4,bh-4); else d.text("Sin foto",bx+bw/2,by+bh/2-5,{font:"R",size:8,color:MUTED,align:"center"}); d.text(label,bx,by+bh+3,{font:"R",size:7,color:MUTED});};
    if(hasPh){
      box(ph.selfie,"Selfie",px,py,84,104);
      box(ph.docFront,"Documento (frente)",px+92,py,90,104);
      box(ph.docBack,"Documento (reverso)",px,py+118,182,96);
    } else d.text("Sin fotos de identificación",px+91,py+40,{font:"R",size:8.5,color:MUTED,align:"center"});
    const ok=g.first&&g.last&&g.docType&&g.docNumber&&g.nationality&&g.birth;
    d.rect(M+14,y+h-24,ok?120:150,14,{fill:ok?"#E4F1DC":"#FBE3E1",r:7});
    d.text(ok?"Datos TRA completos":"Faltan datos para la TRA",M+21,y+h-21,{font:"B",size:7.5,color:ok?"#3E7A1F":RED});
    y+=h+10;
  });
  // firmas y autorización
  if(y+96>d.H-60){footer(d,hotel,page);y=newPage(false);}
  y+=4;
  y=d.text("El huésped declara que los datos son ciertos y autoriza su tratamiento conforme a la Ley 1581 de 2012 y la política de datos del alojamiento, para el registro hotelero (TRA) y los reportes que exige la ley (SIRE de Migración Colombia para extranjeros).",M,y,{font:"R",size:8,color:MUTED,maxW:W})+34;
  d.line(M,y,M+220,y,{color:INK,lw:0.6}); d.line(M+W-220,y,M+W,y,{color:INK,lw:0.6});
  d.text("Firma del huésped titular",M,y+5,{font:"R",size:8,color:MUTED}); d.text("Recibido por (alojamiento)",M+W-220,y+5,{font:"R",size:8,color:MUTED});
  footer(d,hotel,page);
  return d;
}

/* ---------- 3. Listado de reservas ---------- */
function reservationList({hotel={},rows=[],title="Listado de reservas",subtitle="",logo}){
  const d=new PNPDF({w:792,h:612,title}); const M=34,W=792-2*M; let page=0;
  const cols=[["Código",78],["Huésped",156],["Hab.",38],["Entrada",68],["Salida",68],["Noches",42,"r"],["Personas",50,"r"],["Canal",86],["Estado",74],["Total",70,"r"],["Saldo",68,"r"]];
  const sc=W/cols.reduce((a,c)=>a+c[1],0); cols.forEach(c=>c[1]*=sc);
  const head=(first)=>{d.addPage();page++;let y=header(d,{logo,hotel:hotel.name,h:first?84:62,kicker:title.toUpperCase(),code:first?`${rows.length} reserva${rows.length===1?"":"s"}`:"",sub:first?(subtitle?subtitle+" · ":"")+"Generado el "+nowTxt():""})+16;
    d.rect(M,y,W,20,{fill:SAND,r:4}); let x=M+6; for(const [t,w,al] of cols){d.text(t.toUpperCase(),al?x+w-10:x,y+6.5,{font:"B",size:7,color:MUTED,align:al?"right":"left"});x+=w;} return y+24;};
  let y=head(true), tot=0, bal=0, nts=0;
  rows.forEach((r,i)=>{
    if(y>d.H-64){footer(d,hotel,page);y=head(false);}
    if(i%2) d.rect(M,y-3,W,17,{fill:"#FBF9F6"});
    let x=M+6; const vals=[r.id,r.guest,r.room,r.in,r.out,String(r.nights),String(r.people),r.channel,r.status,money(r.total),money(r.balance)];
    cols.forEach(([t,w,al],k)=>{d.text(vals[k]||"",al?x+w-10:x,y,{font:k===0?"B":"R",size:8,color:k===8&&r.status==="Cancelada"?RED:INK,align:al?"right":"left",maxW:w-12,maxLines:1});x+=w;});
    tot+=Number(r.total)||0; bal+=Number(r.balance)||0; nts+=Number(r.nights)||0; y+=17;
  });
  d.line(M,y+2,M+W,y+2,{color:INK,lw:0.6}); y+=8;
  const xs=[];let x=M+6;cols.forEach(([,w])=>{xs.push(x);x+=w;});
  d.text("Totales",xs[0],y,{font:"B",size:8.5,color:NAVY});
  d.text(String(nts),xs[5]+cols[5][1]-10,y,{font:"B",size:8.5,color:NAVY,align:"right"});
  d.text(money(tot),xs[9]+cols[9][1]-10,y,{font:"B",size:8.5,color:NAVY,align:"right"});
  d.text(money(bal),xs[10]+cols[10][1]-10,y,{font:"B",size:8.5,color:bal>0?RED:NAVY,align:"right"});
  footer(d,hotel,page);
  return d;
}

/* ---------- navegador: imágenes, descarga, impresión, WhatsApp ---------- */
async function toJpeg(src,{max=1100,bg="#FFFFFF",quality=0.82}={}){
  let bmp;
  if(src instanceof Blob) bmp=await createImageBitmap(src);
  else { const r=await fetch(src); if(!r.ok) throw new Error("No se pudo cargar la imagen"); bmp=await createImageBitmap(await r.blob()); }
  const k=Math.min(1,max/Math.max(bmp.width,bmp.height)); const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(bmp.width*k)); c.height=Math.max(1,Math.round(bmp.height*k));
  const x=c.getContext("2d"); x.fillStyle=bg; x.fillRect(0,0,c.width,c.height); x.drawImage(bmp,0,0,c.width,c.height);
  const b=await new Promise(r=>c.toBlob(r,"image/jpeg",quality)); return {bytes:new Uint8Array(await b.arrayBuffer())};
}
let LOGO=null;
async function logoBadge(){
  if(LOGO) return LOGO;
  try{ const bmp=await createImageBitmap(await (await fetch("/assets/logo-mark.png")).blob());
    const c=document.createElement("canvas");c.width=c.height=240;const x=c.getContext("2d");
    x.fillStyle=NAVY;x.fillRect(0,0,240,240);x.fillStyle=CREAM;x.beginPath();x.arc(120,120,116,0,Math.PI*2);x.fill();
    const k=170/Math.max(bmp.width,bmp.height);x.drawImage(bmp,120-bmp.width*k/2,120-bmp.height*k/2,bmp.width*k,bmp.height*k);
    const b=await new Promise(r=>c.toBlob(r,"image/jpeg",0.9)); LOGO={bytes:new Uint8Array(await b.arrayBuffer())};
  }catch(_){LOGO=null;}
  return LOGO;
}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);}
// Abre el PDF en una pestaña nueva (desde el visor del navegador se imprime). Si el navegador lo bloquea, lo descarga.
function openPdf(blob,name){const u=URL.createObjectURL(blob);const w=window.open(u,"_blank");if(!w) download(blob,name);setTimeout(()=>URL.revokeObjectURL(u),60000);}
function printPdf(blob,name){
  const u=URL.createObjectURL(blob);const f=document.createElement("iframe");f.style.cssText="position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";f.src=u;
  f.onload=()=>{try{f.contentWindow.focus();f.contentWindow.print();}catch(_){openPdf(blob,name);}setTimeout(()=>{f.remove();URL.revokeObjectURL(u);},60000);};
  document.body.appendChild(f);
}
function waNumber(phone){let p=String(phone||"").replace(/\D/g,"");if(p.length===10&&p[0]==="3")p="57"+p;return p;}
function waUrl(phone,text){const p=waNumber(phone);return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;}
// Comparte el archivo PDF con la hoja de compartir del teléfono (WhatsApp, correo…). Devuelve false si el navegador no puede.
async function sharePdf(blob,name,text){
  try{const file=new File([blob],name,{type:"application/pdf"});
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text,title:name});return true;}}catch(e){if(e&&e.name==="AbortError")return true;}
  return false;
}
root.PNDocs={confirmation,reservationSheet,reservationList,toJpeg,logoBadge,download,openPdf,printPdf,sharePdf,waUrl,waNumber,money,fdate,nightsOf,ST,CH};
})(typeof window!=="undefined"?window:globalThis);
