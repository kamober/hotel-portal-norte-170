/* Hotel Portal Norte 170 — contrato: texto legible y recuadro de firma (dedo, lápiz o mouse) */
(function(root){
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Mismo formato que el servidor: "# " título, "## " subtítulo, "- " viñeta, "> " cláusula, línea vacía = párrafo.
function toHTML(text){
  const out=[]; let ul=false;
  const close=()=>{if(ul){out.push("</ul>");ul=false;}};
  for(const raw of String(text||"").replace(/\r/g,"").split("\n")){
    const l=raw.trimEnd();
    if(!l.trim()){close();continue;}
    if(l.startsWith("# ")){close();out.push(`<h3 class="ct-h1">${esc(l.slice(2))}</h3>`);}
    else if(l.startsWith("## ")){close();out.push(`<h4 class="ct-h2">${esc(l.slice(3))}</h4>`);}
    else if(/^[-•]\s+/.test(l)){if(!ul){out.push("<ul>");ul=true;}out.push(`<li>${esc(l.replace(/^[-•]\s+/,""))}</li>`);}
    else if(l.startsWith("> ")){close();out.push(`<blockquote>«${esc(l.slice(2))}»</blockquote>`);}
    else{close();out.push(`<p>${esc(l)}</p>`);}
  }
  close(); return out.join("");
}
// Recuadro de firma sobre canvas. Devuelve {clear, isEmpty, toJpeg}.
function pad(canvas,onChange){
  const ctx=canvas.getContext("2d"); let drawing=false, last=null, ink=0;
  function size(){const r=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1);const prev=ink?canvas.toDataURL():null;
    canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#0E2A42";ctx.lineWidth=2.4;
    if(prev){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,r.width,r.height);im.src=prev;}}
  const pos=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  canvas.addEventListener("pointerdown",e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);drawing=true;last=pos(e);ctx.beginPath();ctx.arc(last.x,last.y,1.1,0,Math.PI*2);ctx.fillStyle="#0E2A42";ctx.fill();ink++;});
  canvas.addEventListener("pointermove",e=>{if(!drawing)return;e.preventDefault();const p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();ink+=Math.hypot(p.x-last.x,p.y-last.y)>0?1:0;last=p;});
  const end=()=>{if(drawing){drawing=false;onChange&&onChange();}};
  canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);canvas.addEventListener("pointerleave",end);
  size(); let t; window.addEventListener("resize",()=>{clearTimeout(t);t=setTimeout(size,150);});
  return {
    clear(){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();ink=0;onChange&&onChange();},
    isEmpty(){return ink<12;},
    // JPEG con fondo blanco (el PDF solo incrusta JPEG)
    toJpeg(){const c=document.createElement("canvas");c.width=900;c.height=Math.round(900*canvas.height/canvas.width);const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(canvas,0,0,c.width,c.height);return c.toDataURL("image/jpeg",0.85);},
  };
}
// Bloque completo: texto con desplazamiento, declaraciones, nombre, documento y firma.
function formHTML(c,pre){
  pre=pre||{};
  return `<div class="ct-box" tabindex="0" aria-label="Texto del contrato">${toHTML(c.text)}</div>
    <div class="ct-read" data-ct-read>Desliza hasta el final del texto para habilitar la firma.</div>
    <div class="ct-decl">${(c.declarations||[]).map(d=>`<label class="f chk"><input type="checkbox" data-decl="${esc(d.k)}" disabled> ${esc(d.t)}</label>`).join("")}</div>
    <div class="grid g2"><label class="f">Nombre completo de quien firma<input data-ct="name" value="${esc(pre.name||"")}" autocomplete="name"></label>
      <label class="f">Número de documento<input data-ct="doc" value="${esc(pre.doc||"")}"></label></div>
    <div class="ct-sign"><div class="ct-sign-h"><span>Firma aquí con el dedo, lápiz o mouse</span><button type="button" class="btn sm" data-ct-clear>Borrar</button></div>
      <canvas data-ct-pad aria-label="Recuadro de firma"></canvas><div class="ct-line"></div></div>
    <div class="muted" style="font-size:.76rem">Versión del documento ${esc(c.version||"")}. Tu firma, la fecha, la hora, la dirección IP y el dispositivo quedan registrados en el PDF del contrato (Ley 527 de 1999).</div>`;
}
// Conecta el formulario dentro de `box`. Devuelve una función que valida y entrega los datos para enviar.
function mount(box){
  const txt=box.querySelector(".ct-box"), read=box.querySelector("[data-ct-read]");
  const p=pad(box.querySelector("[data-ct-pad]"));
  box.querySelector("[data-ct-clear]").onclick=()=>p.clear();
  const unlock=()=>{box.querySelectorAll("[data-decl]").forEach(i=>i.disabled=false);read.textContent="✓ Texto leído.";read.classList.add("ok");};
  const check=()=>{if(txt.scrollTop+txt.clientHeight>=txt.scrollHeight-24)unlock();};
  txt.addEventListener("scroll",check,{passive:true}); setTimeout(check,50);
  return function collect(){
    const accept={}; let all=true; box.querySelectorAll("[data-decl]").forEach(i=>{accept[i.dataset.decl]=i.checked; if(!i.checked) all=false;});
    const name=box.querySelector('[data-ct="name"]').value.trim(), doc=box.querySelector('[data-ct="doc"]').value.trim();
    if(box.querySelector("[data-decl]:disabled")) return {error:"Lee el contrato hasta el final antes de firmar."};
    if(!all) return {error:"Marca las tres declaraciones para continuar."};
    if(name.length<3) return {error:"Escribe el nombre completo de quien firma."};
    if(doc.replace(/\s/g,"").length<4) return {error:"Escribe el número de documento."};
    if(p.isEmpty()) return {error:"Dibuja tu firma en el recuadro."};
    return {data:{signerName:name,signerDoc:doc,accept,signature:p.toJpeg()}};
  };
}
root.PNSign={toHTML,pad,formHTML,mount};
})(typeof window!=="undefined"?window:globalThis);
