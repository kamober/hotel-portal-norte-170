/* Hotel Portal Norte 170 — portada rotativa y galería promocional del sitio público */
(() => {
const IMG = n => `/assets/promo/${n}.jpg`;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- portada: fotos que rotan ---------- */
// Portada: ilustración de Bogotá primero (versión liviana en celulares) y luego fotos del hotel.
// pos = encuadre de cada foto; en la ilustración se privilegia el bus de TransMilenio (abajo a la izquierda).
const small = matchMedia("(max-width:700px)").matches;
const HERO = [
  {src:IMG(small?"hero-bogota-m":"hero-bogota"), cap:"Bogotá · TransMilenio a una cuadra", pos:small?"18% 100%":"center 100%"},
  {src:IMG("hero-fachada"), cap:"Fachada en Villa del Prado · a una cuadra del Portal Norte", pos:"center 55%"},
  {src:IMG("hero-pasillo"), cap:"Pasillos amplios, luminosos y con acceso controlado", pos:"center 50%"},
  {src:IMG("hero-cocina"), cap:"Cocina compartida equipada y comedor", pos:"center 55%"},
  {src:IMG("hero-pasillo2"), cap:"Habitaciones privadas con escritorio y Wi‑Fi", pos:"center 50%"},
];
const hero = {i:0, t:null, slides:HERO.slice()};
function heroRender(){
  const bg=document.getElementById("heroBg"); if(!bg) return;
  bg.innerHTML = hero.slides.map((s,i)=>`<img class="slide${i===hero.i?" on":""}" src="${s.src}" alt="" ${s.pos?`style="object-position:${s.pos}"`:""} ${i?'loading="lazy"':'fetchpriority="high"'} decoding="async">`).join("");
  const dots=document.getElementById("heroDots");
  if(dots) dots.innerHTML = hero.slides.map((s,i)=>`<button type="button" aria-label="Foto ${i+1}: ${s.cap}" aria-current="${i===hero.i}"><i></i></button>`).join("");
  heroCap();
}
function heroCap(){const c=document.getElementById("heroSlideCap"); if(c) c.textContent=hero.slides[hero.i].cap; const h=document.getElementById("inicio"); if(h) h.classList.toggle("is-photo",hero.i>0);}
function heroGo(i){
  const n=hero.slides.length; hero.i=(i+n)%n;
  document.querySelectorAll("#heroBg .slide").forEach((el,k)=>el.classList.toggle("on",k===hero.i));
  document.querySelectorAll("#heroDots button").forEach((el,k)=>el.setAttribute("aria-current",String(k===hero.i)));
  heroCap(); heroPlay();
}
// La ilustración principal se queda más tiempo; las fotos del hotel rotan cada 5,5 s.
function heroPlay(){clearTimeout(hero.t); if(!reduce && hero.slides.length>1) hero.t=setTimeout(()=>heroGo(hero.i+1),hero.i===0?8000:5500);}
document.addEventListener("click",e=>{const b=e.target.closest("#heroDots button");if(b){heroGo([...b.parentElement.children].indexOf(b));}});
document.addEventListener("visibilitychange",()=>{if(document.hidden)clearTimeout(hero.t);else heroPlay();});

/* ---------- galería por categorías ---------- */
const CATS = [
  ["todo","Todo el hotel"],["acceso","Fachada y acceso smart"],["interiores","Interiores"],["habitaciones","Habitaciones"],
  ["cocina","Cocina compartida"],["retro","Zona retro"],["seguridad","Seguridad"],["entorno","El barrio"],
];
const PHOTOS = [
  {n:"fachada",c:"acceso",t:"Fachada en Villa del Prado",s:"Casa remodelada en zona residencial estrato 4, a una cuadra del Portal Norte."},
  {n:"entrada",c:"acceso",t:"Entrada principal",s:"Puerta de seguridad y pasillo de acceso con piso en madera."},
  {n:"videoportero",c:"acceso",t:"Videoportero con lector de tarjeta",s:"Recepción inteligente: te vemos y te abrimos aunque no haya nadie en la puerta."},
  {n:"cerradura",c:"acceso",t:"Cerraduras inteligentes",s:"Ingresa con clave, tarjeta o huella. Sin llaves que perder."},
  {n:"fachada-v",c:"acceso",t:"Acceso a la calle",s:"Llegada fácil en carro, taxi o TransMilenio."},
  {n:"pasillo-entrada",c:"interiores",t:"Pasillo de entrada",s:"Claraboyas con luz natural durante todo el día."},
  {n:"pasillo-1",c:"interiores",t:"Pasillos con diseño",s:"Murales geométricos en gris y amarillo."},
  {n:"pasillo-2",c:"interiores",t:"Zona de habitaciones",s:"Habitaciones privadas con escritorio, silla y Wi‑Fi."},
  {n:"pasillo-3",c:"interiores",t:"Circulación amplia",s:"Espacios limpios, iluminados y con señalización."},
  {n:"hab-doble",c:"habitaciones",t:"Habitación con cama doble",s:"Colchón, duvet y plumón con almohadas tipo hotel, TV y armario."},
  {n:"hab-cabecero",c:"habitaciones",t:"Descanso de hotel",s:"Ropa de cama blanca, cabecero y repisas."},
  {n:"hab-escritorio",c:"habitaciones",t:"Para estudiar o trabajar",s:"Escritorio con silla ergonómica en cada habitación."},
  {n:"banos",c:"habitaciones",t:"Baños",s:"Aseo diario en baños y zonas comunes."},
  {n:"cocina-comedor",c:"cocina",t:"Cocina y comedor",s:"Mesa de vidrio con sillas para compartir."},
  {n:"cocina-1",c:"cocina",t:"Cocina equipada",s:"Estufa a gas de cuatro puestos, campana, lavaplatos y gabinetes."},
  {n:"cocina-2",c:"cocina",t:"Nevera de uso común",s:"Cocina tu comida como en casa."},
  {n:"retro-zona",c:"retro",t:"Zona retro arcade",s:"Máquina arcade para dos jugadores junto a la cocina."},
  {n:"retro-kof97",c:"retro",t:"Clásicos de lucha",s:"Juegos de los 90 y 2000 para desconectarte un rato."},
  {n:"retro-kof2002",c:"retro",t:"Retos entre huéspedes",s:"Dos controles: trae a un amigo."},
  {n:"extintor",c:"seguridad",t:"Extintores",s:"Extintor multipropósito con instrucciones y mantenimiento al día."},
  {n:"emergencia",c:"seguridad",t:"Botiquín y camilla",s:"Botiquín, camilla de emergencia, números de emergencia y planos de evacuación."},
  {n:"zona-portal-norte",c:"entorno",t:"Portal del Norte",s:"Estación de TransMilenio a una cuadra."},
  {n:"zona-transmilenio",c:"entorno",t:"Transporte a toda la ciudad",s:"Troncal Autopista Norte, alimentadores y buses hacia la Sabana."},
  {n:"zona-exito",c:"entorno",t:"Éxito, Easy y Smart Fit",s:"Mercado, hogar y gimnasio a pocos minutos."},
  {n:"zona-panama",c:"entorno",t:"Centros comerciales",s:"Panamá y Santafé muy cerca."},
  {n:"zona-restaurantes",c:"entorno",t:"Restaurantes y panaderías",s:"Comida rápida, almuerzos y panaderías en la cuadra."},
];
const gal = {cat:"todo", i:0, t:null, touch:null};
const list = () => gal.cat==="todo" ? PHOTOS : PHOTOS.filter(p=>p.c===gal.cat);
function galRender(){
  const box=document.getElementById("galeriaBox"); if(!box) return;
  const L=list(); if(gal.i>=L.length) gal.i=0;
  const p=L[gal.i];
  box.innerHTML = `
    <div class="g-tabs" role="tablist" aria-label="Categorías de fotos">${CATS.map(([k,l])=>`<button type="button" role="tab" data-cat="${k}" aria-selected="${gal.cat===k}">${l}</button>`).join("")}</div>
    <div class="g-stage" aria-roledescription="carrusel" aria-label="Fotos del hotel">
      <div class="g-slides">${L.map((x,k)=>`<figure class="g-slide${k===gal.i?" on":""}" aria-hidden="${k!==gal.i}"><img src="${IMG(x.n)}" alt="${x.t}" loading="lazy" decoding="async"><img class="g-blur" src="${IMG(x.n)}" alt="" aria-hidden="true" loading="lazy"></figure>`).join("")}</div>
      <figcaption class="g-cap" aria-live="polite"><span class="g-n">${String(gal.i+1).padStart(2,"0")} / ${String(L.length).padStart(2,"0")}</span><b>${p.t}</b><small>${p.s}</small></figcaption>
      <button class="g-nav prev" type="button" data-g="-1" aria-label="Foto anterior"><svg class="ico" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <button class="g-nav next" type="button" data-g="1" aria-label="Foto siguiente"><svg class="ico" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <div class="g-bar"><i style="animation-duration:${reduce?0:5}s"></i></div>
    </div>
    <div class="g-thumbs">${L.map((x,k)=>`<button type="button" data-k="${k}" aria-label="${x.t}" aria-current="${k===gal.i}"><img src="${IMG(x.n)}" alt="" loading="lazy"></button>`).join("")}</div>`;
  // Centra la miniatura activa sin mover la página.
  const th=box.querySelector(".g-thumbs"), cur=th&&th.querySelector('[aria-current="true"]');
  if(cur) th.scrollLeft=Math.max(0,cur.offsetLeft-th.clientWidth/2+cur.clientWidth/2);
  galPlay();
}
function galGo(d){const n=list().length; gal.i=(gal.i+d+n)%n; galRender();}
function galPlay(){clearTimeout(gal.t); if(!reduce && galVisible) gal.t=setTimeout(()=>galGo(1),5000);}
let galVisible=false;
document.addEventListener("click",e=>{
  const box=e.target.closest("#galeriaBox"); if(!box) return;
  const c=e.target.closest("[data-cat]"); if(c){gal.cat=c.dataset.cat;gal.i=0;galRender();return;}
  const g=e.target.closest("[data-g]"); if(g){galGo(+g.dataset.g);return;}
  const k=e.target.closest("[data-k]"); if(k){gal.i=+k.dataset.k;galRender();}
});
document.addEventListener("keydown",e=>{if(!e.target.closest||!e.target.closest("#galeriaBox"))return; if(e.key==="ArrowRight")galGo(1); if(e.key==="ArrowLeft")galGo(-1);});
document.addEventListener("touchstart",e=>{if(e.target.closest(".g-stage"))gal.touch=e.touches[0].clientX;},{passive:true});
document.addEventListener("touchend",e=>{if(gal.touch==null)return;const dx=e.changedTouches[0].clientX-gal.touch;gal.touch=null;if(Math.abs(dx)>40)galGo(dx<0?1:-1);},{passive:true});
document.addEventListener("mouseover",e=>{if(e.target.closest&&e.target.closest(".g-stage"))clearTimeout(gal.t);});
document.addEventListener("mouseout",e=>{if(e.target.closest&&e.target.closest(".g-stage")&&!(e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest(".g-stage")))galPlay();});

/* Abrir la galería en una categoría desde las tarjetas de «experiencia» */
document.addEventListener("click",e=>{const a=e.target.closest("[data-open-cat]");if(!a)return;e.preventDefault();gal.cat=a.dataset.openCat;gal.i=0;galRender();document.getElementById("galeria").scrollIntoView({behavior:reduce?"auto":"smooth"});});

if("IntersectionObserver" in window){
  const io=new IntersectionObserver(es=>es.forEach(en=>{galVisible=en.isIntersecting; if(galVisible) galPlay(); else clearTimeout(gal.t);}),{threshold:.35});
  addEventListener("DOMContentLoaded",()=>{const s=document.getElementById("galeria"); if(s) io.observe(s);});
  // Aparición suave de secciones
  const rv=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.add("in");rv.unobserve(en.target);}}),{threshold:.12});
  addEventListener("DOMContentLoaded",()=>document.querySelectorAll(".reveal").forEach(el=>reduce?el.classList.add("in"):rv.observe(el)));
} else { galVisible=true; addEventListener("DOMContentLoaded",()=>document.querySelectorAll(".reveal").forEach(el=>el.classList.add("in"))); }

addEventListener("DOMContentLoaded",()=>{heroRender();heroPlay();galRender();});

window.PNPromo = {
  // La foto de portada elegida en el panel entra primero en la rotación.
  // La foto de portada del panel se agrega después de la ilustración principal.
  heroFirst(src){ if(!src || hero.slides.some(s=>s.src===src)) return; hero.slides.push({src,cap:"Hotel Portal Norte 170"}); heroRender(); heroPlay(); },
};
})();
