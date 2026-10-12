/* Hotel Portal Norte 170 — generador PDF mínimo, sin dependencias.
   Fuentes estándar (Helvetica y Times, codificación WinAnsi para tildes y ñ), rectángulos, líneas,
   imágenes JPEG y enlaces. Coordenadas en puntos con origen arriba a la izquierda. */
(function(root){
const WIDTHS={"R":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,556,222,556,333,1000,556,556,333,1000,667,333,1000,556,611,556,556,222,222,333,333,350,556,1000,333,1000,500,333,944,556,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],"B":[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,611,278,556,500,1000,556,556,333,1000,667,333,1000,611,611,611,611,278,278,500,500,350,556,1000,333,1000,556,333,944,611,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],"T":[250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541,761,500,444,333,500,444,1000,500,500,333,1000,556,333,889,444,611,444,444,333,333,444,444,350,500,1000,333,980,389,333,722,444,444,722,250,333,500,500,500,500,200,500,333,760,276,500,564,333,760,333,400,564,300,300,333,500,453,250,333,300,310,500,750,750,750,444,722,722,722,722,722,722,889,667,611,611,611,611,333,333,333,333,722,722,722,722,722,722,722,564,722,722,722,722,722,722,556,500,444,444,444,444,444,444,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,564,500,500,500,500,500,500,500,500],"TB":[250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,761,500,500,333,500,500,1000,500,500,333,1000,556,333,1000,500,667,500,500,333,333,500,500,350,500,1000,333,1000,389,333,722,500,444,722,250,333,500,500,500,500,220,500,333,747,300,500,570,333,747,333,400,570,300,300,333,556,540,250,333,300,330,500,750,750,750,500,722,722,722,722,722,722,1000,722,667,667,667,667,389,389,389,389,722,722,778,778,778,778,778,570,778,722,722,722,722,722,611,556,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,500,556,500]};
const FONTS={R:"Helvetica",B:"Helvetica-Bold",T:"Times-Roman",TB:"Times-Bold"};
const CP={0x20AC:128,0x201A:130,0x0192:131,0x201E:132,0x2026:133,0x2020:134,0x2021:135,0x02C6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017D:142,
  0x2018:145,0x2019:146,0x201C:147,0x201D:148,0x2022:149,0x2013:150,0x2014:151,0x02DC:152,0x2122:153,0x0161:154,0x203A:155,0x0153:156,0x017E:158,0x0178:159};
const SUBST={"→":"->","←":"<-"," ":" "," ":" "," ":" ","✓":"v","✕":"x","·":"·"};
function code(ch){const c=ch.codePointAt(0); if(c>=32&&c<127) return c; if(c>=160&&c<=255) return c; if(CP[c]) return CP[c]; return -1;}
function norm(s){let o="";for(const ch of String(s==null?"":s)){if(SUBST[ch]!==undefined){o+=SUBST[ch];continue;} if(ch==="\n"||ch==="\t"){o+=" ";continue;} o+=code(ch)<0?(ch.normalize("NFD").replace(/[̀-ͯ]/g,"").split("").every(c=>code(c)>=0)?ch.normalize("NFD").replace(/[̀-ͯ]/g,""):"?"):ch;} return o;}
function enc(s){let o="";for(const ch of s){const c=code(ch);const b=c<0?63:c; if(b===40||b===41||b===92) o+="\\"+String.fromCharCode(b); else o+=String.fromCharCode(b);} return o;}
function rgb(hex){const h=String(hex||"#000").replace("#","");const v=h.length===3?h.split("").map(x=>x+x).join(""):h;return [0,2,4].map(i=>(parseInt(v.slice(i,i+2),16)/255).toFixed(3)).join(" ");}
const n=v=>(Math.round(v*100)/100).toString();
function jpegInfo(bytes){
  let i=2; while(i<bytes.length){ if(bytes[i]!==0xFF){i++;continue;} const m=bytes[i+1]; const len=(bytes[i+2]<<8)|bytes[i+3];
    if(m>=0xC0&&m<=0xCF&&![0xC4,0xC8,0xCC].includes(m)) return {h:(bytes[i+5]<<8)|bytes[i+6], w:(bytes[i+7]<<8)|bytes[i+8], comps:bytes[i+9]};
    i+=2+len; }
  throw new Error("Imagen JPEG no válida");
}
class PNPDF{
  constructor(o={}){this.W=o.w||612;this.H=o.h||792;this.pages=[];this.images=[];this.font="R";this.size=10;this.color="#000000";this.meta=o.title||"";}
  addPage(){this.cur={ops:[],links:[]};this.pages.push(this.cur);return this;}
  setFont(f,s){if(f)this.font=f;if(s)this.size=s;return this;}
  setColor(c){this.color=c;return this;}
  width(s,f=this.font,size=this.size){let w=0;for(const ch of norm(s)){const c=code(ch);w+=(WIDTHS[f][(c<0?63:c)-32]||500);}return w*size/1000;}
  wrap(s,maxW,f=this.font,size=this.size){
    const out=[];for(const para of String(s==null?"":s).split(/\n/)){let line="";
      for(const word of para.split(/\s+/).filter(Boolean)){const t=line?line+" "+word:word;
        if(this.width(t,f,size)<=maxW){line=t;continue;} if(line) out.push(line);
        if(this.width(word,f,size)>maxW){let part="";for(const ch of word){if(this.width(part+ch,f,size)>maxW){out.push(part);part="";}part+=ch;}line=part;} else line=word;}
      out.push(line);} return out;}
  // y = parte superior de la línea. Devuelve la y siguiente.
  text(s,x,y,o={}){
    const f=o.font||this.font,size=o.size||this.size,lh=o.lineH||size*1.3,color=o.color||this.color;
    const lines=o.maxW?this.wrap(s,o.maxW,f,size):[norm(s)];
    const max=o.maxLines?lines.slice(0,o.maxLines):lines;
    if(o.maxLines&&lines.length>o.maxLines){let l=max[max.length-1];while(l&&this.width(l+"…",f,size)>o.maxW)l=l.slice(0,-1);max[max.length-1]=l+"…";}
    max.forEach((ln,i)=>{const w=this.width(ln,f,size);let tx=x;if(o.align==="right")tx=x-w;else if(o.align==="center")tx=x-w/2;
      const by=this.H-(y+i*lh+size*0.8);
      this.cur.ops.push(`BT /${f} ${n(size)} Tf ${rgb(color)} rg ${n(tx)} ${n(by)} Td (${enc(norm(ln))}) Tj ET`);});
    return y+max.length*lh;}
  rect(x,y,w,h,o={}){const ops=this.cur.ops;ops.push("q");
    if(o.fill) ops.push(rgb(o.fill)+" rg"); if(o.stroke) ops.push(rgb(o.stroke)+" RG "+n(o.lw||0.75)+" w");
    const r=Math.min(o.r||0,w/2,h/2),Y=this.H-y-h;
    if(r>0){const k=r*0.5523;ops.push(`${n(x+r)} ${n(Y)} m ${n(x+w-r)} ${n(Y)} l ${n(x+w-r+k)} ${n(Y)} ${n(x+w)} ${n(Y+r-k)} ${n(x+w)} ${n(Y+r)} c ${n(x+w)} ${n(Y+h-r)} l ${n(x+w)} ${n(Y+h-r+k)} ${n(x+w-r+k)} ${n(Y+h)} ${n(x+w-r)} ${n(Y+h)} c ${n(x+r)} ${n(Y+h)} l ${n(x+r-k)} ${n(Y+h)} ${n(x)} ${n(Y+h-r+k)} ${n(x)} ${n(Y+h-r)} c ${n(x)} ${n(Y+r)} l ${n(x)} ${n(Y+r-k)} ${n(x+r-k)} ${n(Y)} ${n(x+r)} ${n(Y)} c h`);}
    else ops.push(`${n(x)} ${n(Y)} ${n(w)} ${n(h)} re`);
    ops.push(o.fill&&o.stroke?"B":o.fill?"f":"S");ops.push("Q");return this;}
  line(x1,y1,x2,y2,o={}){this.cur.ops.push(`q ${rgb(o.color||"#999999")} RG ${n(o.lw||0.75)} w ${o.dash?"[3 3] 0 d ":""}${n(x1)} ${n(this.H-y1)} m ${n(x2)} ${n(this.H-y2)} l S Q`);return this;}
  // img = {bytes:Uint8Array JPEG, w, h}. Ajusta dentro de (x,y,w,h) manteniendo proporción si fit=true.
  image(img,x,y,w,h,o={}){
    let idx=this.images.indexOf(img); if(idx<0){if(!img.info) img.info=jpegInfo(img.bytes); this.images.push(img); idx=this.images.length-1;}
    let dw=w,dh=h,dx=x,dy=y; if(o.fit!==false){const k=Math.min(w/img.info.w,h/img.info.h);dw=img.info.w*k;dh=img.info.h*k;dx=x+(w-dw)/2;dy=y+(h-dh)/2;}
    this.cur.ops.push(`q ${n(dw)} 0 0 ${n(dh)} ${n(dx)} ${n(this.H-dy-dh)} cm /Im${idx} Do Q`);return {x:dx,y:dy,w:dw,h:dh};}
  link(x,y,w,h,url){this.cur.links.push({x,y,w,h,url});return this;}
  bytes(){
    const parts=[],offs=[];let len=0;const te=s=>{const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i)&255;return b;};
    const push=b=>{parts.push(b);len+=b.length;}; const objs=[];
    const add=(body)=>{objs.push(body);return objs.length;};
    // 1 catálogo, 2 páginas (se completan al final)
    add(null);add(null);
    const fontIds={};for(const k of Object.keys(FONTS)) fontIds[k]=add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[k]} /Encoding /WinAnsiEncoding >>`);
    const imgIds=this.images.map(img=>{const i=img.info;return add({stream:img.bytes,dict:`/Type /XObject /Subtype /Image /Width ${i.w} /Height ${i.h} /ColorSpace /${i.comps===1?"DeviceGray":i.comps===4?"DeviceCMYK":"DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode${i.comps===4?" /Decode [1 0 1 0 1 0 1 0]":""}`});});
    const res=`<< /Font << ${Object.keys(FONTS).map(k=>`/${k} ${fontIds[k]} 0 R`).join(" ")} >> /XObject << ${imgIds.map((id,i)=>`/Im${i} ${id} 0 R`).join(" ")} >> >>`;
    const pageIds=this.pages.map(p=>{
      const content=add({stream:te(p.ops.join("\n")),dict:""});
      const annots=p.links.map(l=>add(`<< /Type /Annot /Subtype /Link /Rect [${n(l.x)} ${n(this.H-l.y-l.h)} ${n(l.x+l.w)} ${n(this.H-l.y)}] /Border [0 0 0] /A << /S /URI /URI (${enc(norm(l.url))}) >> >>`));
      return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources ${res} /Contents ${content} 0 R${annots.length?` /Annots [${annots.map(a=>a+" 0 R").join(" ")}]`:""} >>`);});
    objs[0]=`<< /Type /Catalog /Pages 2 0 R >>`; objs[1]=`<< /Type /Pages /Kids [${pageIds.map(i=>i+" 0 R").join(" ")}] /Count ${pageIds.length} >>`;
    const info=add(`<< /Producer (Portal Norte 170) /Title (${enc(norm(this.meta))}) >>`);
    push(te("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
    objs.forEach((o,i)=>{offs[i]=len;
      if(o&&o.stream){push(te(`${i+1} 0 obj\n<< ${o.dict} /Length ${o.stream.length} >>\nstream\n`));push(o.stream);push(te("\nendstream\nendobj\n"));}
      else push(te(`${i+1} 0 obj\n${o}\nendobj\n`));});
    const xref=len; let x=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`; offs.forEach(o=>{x+=String(o).padStart(10,"0")+" 00000 n \n";});
    push(te(x+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    const out=new Uint8Array(len);let p=0;for(const b of parts){out.set(b,p);p+=b.length;}return out;}
  blob(){return new Blob([this.bytes()],{type:"application/pdf"});}
}
root.PNPDF=PNPDF;
})(typeof window!=="undefined"?window:globalThis);
