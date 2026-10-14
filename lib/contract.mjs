// Contrato de hospedaje: texto de políticas y términos, versión, huella digital y PDF firmado.
// El texto usa un formato simple, igual en el navegador y en el PDF:
//   "# " título · "## " subtítulo · "- " viñeta · "> " cláusula destacada · línea en blanco = nuevo párrafo.
import { createHash } from "node:crypto";
import "../public/assets/pdf.js";
import LOGO_B64 from "./logo-jpg.mjs";

const PNPDF = globalThis.PNPDF;

export const DEFAULT_TEXT = `# POLÍTICAS DEL HOTEL PORTAL 170
Hora de check-in: 3:00 p. m.
Hora de check-out: 11:00 a. m.

## Acceso al alojamiento y a las habitaciones
- Se entregará al huésped una tarjeta de acceso para la habitación y una llave para el ingreso al alojamiento.
- El huésped debe comunicarse con veinte (20) minutos de anticipación antes de llegar al alojamiento a los números telefónicos 300 548 2234 o 316 362 0610.

## No está permitido en el alojamiento ni en las habitaciones
- Realizar fiestas.
- Consumir sustancias alucinógenas ni bebidas alcohólicas.
- Escuchar música a altos niveles de volumen.
- Ingresar damas u hombres de compañía.
- Fumar dentro de las habitaciones o dentro del alojamiento.
- Cocinar o conectar aparatos de cocina en las habitaciones (las instalaciones eléctricas no soportan altos voltajes).

## Normas de uso y responsabilidades del huésped
- El uso de la cocina compartida está autorizado solo hasta las 9:00 p. m.
- Es obligatorio diligenciar el formulario de registro para poder ingresar al alojamiento.
- El alojamiento está ubicado en un sector 100 % residencial; por eso pedimos amablemente mantener la paz dentro de él.
- Es responsabilidad del huésped revisar que la puerta de entrada al alojamiento quede bien cerrada al entrar y al salir.
- Es responsabilidad del huésped cerrar la válvula del gas si hace uso de la cocina.
- Los menores de edad deben presentar tarjeta de identidad y estar acompañados por uno de sus padres.

La administración se reserva el derecho de terminar el contrato y el derecho de admisión.

# TÉRMINOS Y CONDICIONES GENERALES
Hotel Portal 170 (Portal Norte 170 Bogotá)

## 1. Identificación del alojamiento
El presente documento regula la prestación del servicio de alojamiento ofrecido por Hotel Portal 170 (Portal Norte 170), en adelante «el alojamiento», así como las condiciones aplicables a los huéspedes.

## 2. Reservas
- Toda reserva deberá ser confirmada mediante el pago total anticipado (100 %), según las condiciones informadas.
- La confirmación de la reserva implica la aceptación expresa de los presentes términos y condiciones.
- El alojamiento se reserva el derecho de rechazar reservas que no cumplan con los requisitos establecidos.

## 3. Pagos
- El pago podrá realizarse por los medios habilitados e informados por el alojamiento.
- En algunos casos podrá exigirse un depósito o anticipo para garantizar la reserva.
- El incumplimiento del pago anticipado del 100 % en los tiempos establecidos podrá generar la cancelación automática de la reserva.

## 4. Política de cancelación y no presentación (no show)
Una vez confirmada la reserva, la habitación queda bloqueada para el huésped. No se realizan devoluciones de dinero en caso de cancelación.

En caso de no presentación (no show):
- El valor pagado no será reembolsado.
- La imposibilidad de llegada por causas externas (transporte, clima, decisiones personales, etc.) no es responsabilidad del alojamiento.
- Si el huésped no se presenta en la fecha reservada no habrá devolución del dinero, ya que la habitación estuvo disponible y preparada, lo que impidió que otros huéspedes pudieran reservarla.

Modificaciones de fecha:
- Las solicitudes de cambio de fecha deberán realizarse con un mínimo de 48 horas de anticipación.
- Están sujetas a disponibilidad y a posibles diferencias tarifarias.

Cancelaciones:
- Las cancelaciones realizadas fuera del plazo establecido no generan reembolso.
- El pago anticipado se considera garantía de la reserva y de los servicios contratados.

Con esta política buscamos asegurar la correcta gestión de la disponibilidad, ofrecer un servicio confiable a nuestros huéspedes y minimizar las pérdidas que genera la no presentación.

## 5. Modificaciones
Las solicitudes de cambio de fecha estarán sujetas a disponibilidad. El alojamiento no garantiza reprogramaciones.

## 6. Check-in y check-out
- Check-in: según el horario informado al huésped.
- Check-out: según el horario establecido.

El incumplimiento de estos horarios podrá generar cargos adicionales. Si el huésped requiere realizar el check-in antes o después del horario establecido, o el check-out fuera del horario definido, deberá:
- Solicitar autorización previa.
- Pagar una tarifa adicional, que será definida y acordada directamente con el administrador del alojamiento.

El alojamiento se reserva el derecho de aceptar o no dichas solicitudes según su disponibilidad operativa.

## 7. Uso de la habitación
El huésped se compromete a:
- Utilizar la habitación de manera adecuada.
- No exceder el número de ocupantes permitidos.
- Mantener condiciones de orden y cuidado.

Queda prohibido:
- El uso indebido del inmueble.
- Las actividades ilegales.
- Generar disturbios.

## 8. Responsabilidad
El alojamiento no se hace responsable por:
- Pérdida de objetos personales.
- Daños causados por terceros.
- Situaciones externas al control del establecimiento.

El huésped será responsable por cualquier daño causado a la propiedad: sábanas, televisor, escritorio, silla, controles del televisor, camas, entre otros.

## 9. Política de privacidad
La información del huésped será utilizada únicamente para fines de reserva, contacto y cumplimiento legal. No será compartida con terceros sin autorización, salvo obligación legal.

## 10. Terminación del servicio
El alojamiento podrá dar por terminada la estadía sin derecho a reembolso en caso de:
- Incumplimiento de normas.
- Comportamientos inapropiados.
- Afectación a otros huéspedes.

## 11. Normativa y referencias
Las presentes condiciones se alinean con estándares internacionales de plataformas como:
- Airbnb: políticas de cancelación estricta y no reembolsable.
- Booking.com: tarifas no reembolsables y cobro en caso de no presentación.

## 12. Legislación aplicable
El presente documento se rige por las leyes de la República de Colombia.

## 13. Aceptación
Al realizar una reserva, el huésped declara haber leído, entendido y aceptado los presentes términos y condiciones.

## Cláusula
> La reserva implica el bloqueo exclusivo de la habitación; en consecuencia, su cancelación o no utilización no genera derecho a devolución bajo ninguna circunstancia.`;

// Declaraciones que el huésped marca al firmar (también quedan impresas en el contrato).
export const DECLARATIONS = [
  { k: "policies", t: "He leído, entiendo y acepto las políticas del hotel y los términos y condiciones generales." },
  { k: "noRefund", t: "Acepto que la reserva no es reembolsable en caso de cancelación o no presentación (no show)." },
  { k: "data", t: "Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012." },
];

export const textOf = (hotel) => (hotel && typeof hotel.contractText === "string" && hotel.contractText.trim()) ? hotel.contractText.trim() : DEFAULT_TEXT;
export const versionOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12).toUpperCase();
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function parse(text) {
  const out = [];
  for (const raw of String(text).replace(/\r/g, "").split("\n")) {
    const l = raw.trimEnd();
    if (!l.trim()) { out.push({ t: "gap" }); continue; }
    if (l.startsWith("# ")) out.push({ t: "h1", s: l.slice(2).trim() });
    else if (l.startsWith("## ")) out.push({ t: "h2", s: l.slice(3).trim() });
    else if (/^[-•]\s+/.test(l)) out.push({ t: "li", s: l.replace(/^[-•]\s+/, "") });
    else if (l.startsWith("> ")) out.push({ t: "quote", s: l.slice(2).trim() });
    else out.push({ t: "p", s: l.trim() });
  }
  return out;
}

/* ---------- PDF del contrato firmado ---------- */
const NAVY = "#0E2A42", RED = "#C62D24", INK = "#1F2A37", MUTED = "#6B7280", LINE = "#E2D9CC", SAND = "#F4EDE2";
const money = (v) => "$ " + Math.round(Number(v) || 0).toLocaleString("es-CO");
const fdate = (d) => { try { return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")); } catch { return d; } };
const fdt = (iso) => { try { return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso)); } catch { return iso; } };

export function buildPdf({ hotel = {}, res, room, guest, companions = [], text, contract, signatureJpeg }) {
  const d = new PNPDF({ title: "Contrato " + res.id });
  const logo = { bytes: new Uint8Array(Buffer.from(LOGO_B64, "base64")) };
  const sig = signatureJpeg ? { bytes: new Uint8Array(signatureJpeg) } : null;
  const M = 48, W = d.W - 2 * M, BOTTOM = d.H - 56;
  let y = 0, page = 0;
  const header = (first) => {
    d.addPage(); page++;
    const h = first ? 92 : 52;
    d.rect(0, 0, d.W, h, { fill: NAVY }); d.rect(0, h, d.W, 3, { fill: RED });
    d.image(logo, M, (h - (first ? 58 : 36)) / 2, first ? 58 : 36, first ? 58 : 36);
    const x = M + (first ? 70 : 46);
    d.text(hotel.name || "Hotel Portal Norte 170", x, first ? 26 : 14, { font: "TB", size: first ? 17 : 12, color: "#FFFFFF" });
    d.text(first ? "CONTRATO DE HOSPEDAJE Y ACEPTACIÓN DE POLÍTICAS" : "Contrato de hospedaje · " + res.id, x, first ? 50 : 32, { font: "B", size: first ? 8 : 7.5, color: "#E7C9A9" });
    if (first) d.text(`Reserva ${res.id} · Versión del documento ${contract.version}`, d.W - M, 30, { font: "R", size: 8, color: "#D6DEE6", align: "right" });
    y = h + 26;
  };
  const need = (hgt) => { if (y + hgt > BOTTOM) header(false); };
  const para = (s, o = {}) => {
    const size = o.size || 9.2, f = o.font || "R", lh = size * 1.42, x = M + (o.indent || 0), w = W - (o.indent || 0);
    for (const ln of d.wrap(s, w, f, size)) { need(lh); d.text(ln, x, y, { font: f, size, color: o.color || INK }); y += lh; }
  };
  const kv = (rows, x, w, lw) => { for (const [k, v] of rows) { if (v == null || v === "") continue; const lines = d.wrap(String(v), w - lw, "R", 9); need(lines.length * 12.5 + 2); d.text(k, x, y, { font: "R", size: 8.2, color: MUTED }); lines.forEach((l, i) => d.text(l, x + lw, y + i * 12.5, { font: "B", size: 9, color: INK })); y += lines.length * 12.5 + 3; } };
  const section = (t) => { need(34); y += 6; d.text(t.toUpperCase(), M, y, { font: "B", size: 8, color: RED }); y += 4; d.line(M, y + 8, M + W, y + 8, { color: LINE }); y += 16; };

  header(true);
  // Partes y reserva
  const n = Math.max(0, Math.round((Date.parse(res.checkOut) - Date.parse(res.checkIn)) / 864e5));
  section("Partes");
  kv([["Alojamiento", hotel.name || "Hotel Portal Norte 170"], ["Dirección", [hotel.address, hotel.zone].filter(Boolean).join(" · ")]], M, W, 110);
  kv([["Huésped titular", contract.signerName], ["Documento", contract.signerDoc], ["Nacionalidad", guest && guest.nationality], ["Teléfono", guest && guest.phone], ["Correo", guest && guest.email]], M, W, 110);
  if (companions.length) kv([["Acompañantes", companions.map((g) => `${g.first || ""} ${g.last || ""}`.trim() + (g.docNumber ? ` (${g.docType || ""} ${g.docNumber})` : "")).join("; ")]], M, W, 110);
  section("Objeto: datos de la reserva");
  kv([["Habitación", room ? `${room.number} · ${room.name || room.type || ""}` : res.roomId], ["Entrada", fdate(res.checkIn) + " · desde las " + (hotel.checkinFrom || "15:00")],
    ["Salida", fdate(res.checkOut) + " · antes de las " + (hotel.checkout || "11:00")], ["Noches", String(n)],
    ["Personas", `${res.adults || 1} adulto(s)${res.children ? `, ${res.children} niño(s)` : ""}`],
    ["Valor total", res.total ? money(res.total) : "Según lo acordado con el alojamiento"], ["Valor pagado", money(res.paid)]], M, W, 110);
  y += 4;
  para("El huésped titular, en su nombre y en el de sus acompañantes, declara conocer y aceptar las siguientes políticas, términos y condiciones, que forman parte integral de este contrato de hospedaje:", { size: 9, color: MUTED });
  y += 6;
  // Texto del contrato
  for (const b of parse(text)) {
    if (b.t === "gap") { y += 4; continue; }
    if (b.t === "h1") { need(40); y += 8; d.rect(M, y - 4, W, 22, { fill: SAND, r: 4 }); d.text(b.s, M + 10, y + 2, { font: "TB", size: 11.5, color: NAVY, maxW: W - 20, maxLines: 1 }); y += 26; continue; }
    if (b.t === "h2") { need(28); y += 4; d.text(b.s, M, y, { font: "B", size: 9.8, color: NAVY, maxW: W }); y += 15; continue; }
    if (b.t === "li") { const lines = d.wrap(b.s, W - 16, "R", 9.2); need(lines.length * 13); d.text("•", M + 4, y, { font: "B", size: 9.2, color: RED }); lines.forEach((l, i) => d.text(l, M + 16, y + i * 13, { font: "R", size: 9.2, color: INK })); y += lines.length * 13 + 1.5; continue; }
    if (b.t === "quote") { const lines = d.wrap("«" + b.s + "»", W - 28, "B", 9.6); const h = lines.length * 13.5 + 16; need(h + 4); d.rect(M, y - 4, W, h, { fill: "#FBE3E1", r: 6 }); d.rect(M, y - 4, 4, h, { fill: RED }); lines.forEach((l, i) => d.text(l, M + 16, y + 4 + i * 13.5, { font: "B", size: 9.6, color: "#7A1B15" })); y += h + 4; continue; }
    para(b.s);
  }
  // Declaraciones y firma
  section("Declaraciones del huésped");
  for (const dc of DECLARATIONS) { const lines = d.wrap(dc.t, W - 22, "R", 9.2); need(lines.length * 13 + 2); d.rect(M, y - 1, 11, 11, { stroke: NAVY, lw: 0.9, r: 2 }); d.text("X", M + 2.6, y - 0.4, { font: "B", size: 8.5, color: NAVY }); lines.forEach((l, i) => d.text(l, M + 20, y + i * 13, { font: "R", size: 9.2, color: INK })); y += lines.length * 13 + 4; }
  section("Firma");
  need(170);
  const sx = M, sw = 250, sh = 96;
  d.rect(sx, y, sw, sh, { stroke: LINE, lw: 0.8, r: 6 });
  if (sig) d.image(sig, sx + 6, y + 6, sw - 12, sh - 12);
  d.line(sx + 12, y + sh - 16, sx + sw - 12, y + sh - 16, { color: MUTED, lw: 0.5 });
  const rx = sx + sw + 20, rw = W - sw - 20; const y0 = y;
  y = y0; kv([["Firmado por", contract.signerName], ["Documento", contract.signerDoc], ["Fecha y hora", fdt(contract.signedAt) + " (hora de Bogotá)"],
    ["Medio", contract.via === "recepcion" ? "Firma en recepción (dispositivo del alojamiento)" : "Firma en línea (enlace personal del huésped)"]], rx, rw, 76);
  y = Math.max(y, y0 + sh) + 24;
  d.text("Firma del huésped titular", sx, y0 + sh + 4, { font: "R", size: 7.5, color: MUTED });
  section("Registro de la firma electrónica");
  kv([["Código de verificación", contract.hash], ["Versión del texto", contract.version], ["Dirección IP", contract.ip || "—"], ["Dispositivo", (contract.userAgent || "—").slice(0, 160)]], M, W, 130);
  y += 4;
  para("Este documento fue firmado electrónicamente por el huésped y se conserva como mensaje de datos conforme a la Ley 527 de 1999 de la República de Colombia. El código de verificación corresponde a la huella SHA-256 del texto aceptado, los datos de la reserva, el firmante y la imagen de la firma; cualquier alteración del contenido lo invalida.", { size: 7.8, color: MUTED });
  // Pie con número de página
  const total = d.pages.length;
  d.pages.forEach((p, i) => { d.cur = p; d.line(M, d.H - 36, d.W - M, d.H - 36, { color: LINE }); d.text(`${hotel.name || "Hotel Portal Norte 170"} · ${hotel.address || ""}`, M, d.H - 28, { font: "R", size: 7, color: MUTED, maxW: W - 90, maxLines: 1 }); d.text(`Página ${i + 1} de ${total}`, d.W - M, d.H - 28, { font: "R", size: 7, color: MUTED, align: "right" }); });
  return Buffer.from(d.bytes());
}

// Huella que liga el texto, la reserva, el firmante, la fecha y la imagen de la firma.
export function fingerprint({ text, res, signerName, signerDoc, signedAt, signatureJpeg, declarations }) {
  return sha256(JSON.stringify({ text, res: { id: res.id, roomId: res.roomId, checkIn: res.checkIn, checkOut: res.checkOut, total: res.total || 0 }, signerName, signerDoc, signedAt, declarations, signature: sha256(signatureJpeg) })).slice(0, 32).toUpperCase();
}
