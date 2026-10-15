// API del Hotel Portal Norte 170 — Netlify Functions (v2) + Netlify Blobs.
// Rutas públicas: /api/public, /api/requests, /api/photos/:id, /api/login
// Rutas de administración (Bearer token): /api/admin/*
import { getStore } from "@netlify/blobs";
import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";
import seed from "../../lib/seed.mjs";
import * as gcal from "../../lib/gcal.mjs";
import * as ical from "../../lib/ical.mjs";
import * as notifier from "../../lib/notify.mjs";
import * as contract from "../../lib/contract.mjs";
import * as calsync from "../../lib/calsync.mjs";
import * as wa from "../../lib/whatsapp.mjs";

export const config = { path: "/api/*" };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const KINDS = { rooms: "rooms/", guests: "guests/", reservations: "res/", requests: "req/", messages: "msg/" };

const data = () => getStore({ name: "portal-norte", consistency: "strong" });
const photos = () => getStore({ name: "portal-norte-photos" });
// Fotos de identidad (selfie y documento): almacén privado, nunca se sirve sin sesión de administrador.
const idPhotos = () => getStore({ name: "portal-norte-ids", consistency: "strong" });
const DOC_TYPES = ["CC", "CE", "Pasaporte", "TI", "RC", "PPT", "PEP", "Otro"];
const MAX_ID_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_ID_PHOTOS_PER_RES = 60;

const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];

/* ---------- utilidades ---------- */
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
const fail = (status, error, extra = {}) => json({ error, ...extra }, status);

function todayBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const diffDays = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const str = (v, max = 200) => (v == null ? "" : String(v).trim().slice(0, max));
const int = (v, min, max, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };
const digits = (v) => String(v || "").replace(/\D/g, "");
const isActive = (r) => r.status !== "cancelada";
const overlaps = (aIn, aOut, bIn, bOut) => aIn < bOut && bIn < aOut;

async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

async function ensureSeed(store) {
  const existing = await store.get("hotel", { type: "json" });
  if (existing) return;
  const { modified } = await store.setJSON("hotel", { ...seed.hotel, updatedAt: new Date().toISOString() }, { onlyIfNew: true });
  if (!modified) return; // otra instancia ya sembró los datos
  await Promise.all(seed.rooms.map((r) => store.setJSON("rooms/" + r.id, r, { onlyIfNew: true })));
}

async function readBody(req, maxBytes = 200_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error("El contenido es demasiado grande."), { status: 413 });
  try {
    const v = JSON.parse(text || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw Object.assign(new Error("El cuerpo de la petición no es JSON válido."), { status: 400 });
  }
}

/* ---------- autenticación ---------- */
function secret() { return env("TOKEN_SECRET") || ""; }
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + sig;
}
function verify(token) {
  if (!token || !secret()) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
function samePassword(given, expected) {
  const a = createHash("sha256").update(String(given)).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}
const bearer = (req) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

/* ---------- vistas públicas ---------- */
const PUBLIC_ROOM_FIELDS = ["id", "number", "name", "type", "beds", "capacity", "rate", "bath", "size", "floor", "description", "features", "photos", "status"];
const PUBLIC_HOTEL_FIELDS = ["name", "address", "zone", "phone", "whatsapp", "email", "checkinFrom", "checkinTo", "checkout", "description", "amenities", "policies", "nearby", "payments", "heroPhoto", "tagline", "attentionFrom", "attentionTo"];
const pick = (o, fields) => Object.fromEntries(fields.filter((f) => o[f] !== undefined).map((f) => [f, o[f]]));

function availability(reservations, today) {
  const out = {};
  for (const r of reservations) {
    if (!isActive(r) || r.checkOut <= today) continue;
    (out[r.roomId] ||= []).push({ i: r.checkIn, o: r.checkOut });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.i.localeCompare(b.i));
  return out;
}

async function handlePublic(store) {
  await ensureSeed(store);
  const today = todayBogota();
  const [hotel, rooms, res] = await Promise.all([store.get("hotel", { type: "json" }), listJSON(store, "rooms/"), listJSON(store, "res/")]);
  return json({
    hotel: pick(hotel || {}, PUBLIC_HOTEL_FIELDS),
    rooms: rooms.map((r) => pick(r, PUBLIC_ROOM_FIELDS)),
    avail: availability(res, today),
    today,
  }, 200, { "Cache-Control": "public, max-age=30" });
}

async function handleNewRequest(req, store) {
  const b = await readBody(req, 20_000);
  if (b.website) return json({ id: "SOL-" + randomUUID().slice(0, 8).toUpperCase() }); // trampa para bots
  const today = todayBogota();
  const roomId = str(b.roomId, 64);
  if (!ID_RE.test(roomId)) return fail(400, "Habitación no válida.");
  const room = await store.get("rooms/" + roomId, { type: "json" });
  if (!room) return fail(404, "La habitación no existe.");
  const checkIn = str(b.checkIn, 10), checkOut = str(b.checkOut, 10);
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) return fail(400, "Fechas no válidas.");
  if (checkIn < today) return fail(400, "La fecha de llegada debe ser desde hoy.");
  const nights = diffDays(checkIn, checkOut);
  if (nights < 1 || nights > 30) return fail(400, "La estancia debe ser de 1 a 30 noches.");
  const adults = int(b.adults, 1, 6, 1), children = int(b.children, 0, 4, 0);
  if (adults + children > (Number(room.capacity) || 1)) return fail(400, `La habitación admite máximo ${room.capacity} personas.`);
  if (room.status === "mantenimiento") return fail(409, "La habitación no está disponible en este momento.");
  const first = str(b.first, 80), phone = str(b.phone, 30);
  if (!first || digits(phone).length < 7) return fail(400, "Escribe tu nombre y un teléfono válido.");
  if (b.consent !== true) return fail(400, "Se requiere la autorización de tratamiento de datos.");
  const reservations = await listJSON(store, "res/");
  if (reservations.some((r) => r.roomId === roomId && isActive(r) && overlaps(checkIn, checkOut, r.checkIn, r.checkOut)))
    return fail(409, "La habitación ya no está disponible en esas fechas. Elige otras fechas u otra habitación.");
  const id = "SOL-" + Date.now().toString(36).toUpperCase().slice(-5) + randomUUID().slice(0, 3).toUpperCase();
  const item = {
    id, roomId, checkIn, checkOut, adults, children,
    first, last: str(b.last, 80), docType: str(b.docType, 20), docNumber: str(b.docNumber, 30), nationality: str(b.nationality, 60),
    phone, email: str(b.email, 120), eta: str(b.eta, 5), notes: str(b.notes, 600),
    estimate: (Number(room.rate) || 0) * nights, consent: true, status: "nueva", createdAt: new Date().toISOString(),
  };
  await store.setJSON("req/" + id, item);
  const hotel = await store.get("hotel", { type: "json" });
  const open = wa.isOpen(hotel), hours = wa.hoursText(hotel), base = notifier.baseUrl(req);
  const waText = [`🏨 *Nueva solicitud de reserva* ${id}`, `👤 ${first} ${item.last}`.trim(), `📞 ${phone}${item.email ? " · " + item.email : ""}`,
    `🛏 Hab. ${room.number} · ${room.name || room.type || ""}`, `📅 ${checkIn} → ${checkOut} (${nights} noche${nights === 1 ? "" : "s"})`,
    `👥 ${adults} adulto(s)${children ? `, ${children} niño(s)` : ""} · ≈ $${item.estimate.toLocaleString("es-CO")}`,
    item.notes ? `📝 ${item.notes}` : null, open ? null : `⏰ Llegó fuera del horario de atención (${hours}). Al huésped se le informó el horario.`,
    `Responder: https://wa.me/${waNum(phone)}`, `Panel: ${base}/admin`].filter(Boolean).join("\n");
  await Promise.all([wa.send(store, hotel, waText, { kind: "solicitud" }), notifier.notify(store, hotel, {
    subject: `Nueva solicitud ${id}`, title: "Nueva solicitud de reserva", tone: "ok",
    intro: `${first} ${item.last} pidió la habitación ${room.number} desde el sitio web.`,
    rows: [["Código", id], ["Habitación", `${room.number} · ${room.name || room.type || ""}`], ["Llegada", checkIn], ["Salida", `${checkOut} (${nights} noche${nights === 1 ? "" : "s"})`],
      ["Personas", `${adults} adulto(s)${children ? `, ${children} niño(s)` : ""}`], ["Teléfono", phone], ["Correo", item.email], ["Valor estimado", "$" + item.estimate.toLocaleString("es-CO")], ["Notas", item.notes],
      ...(open ? [] : [["Horario", `Llegó fuera del horario de atención (${hours})`]])],
    button: { url: base + "/admin", label: "Revisar en el panel" },
  })]);
  return json({ id, estimate: item.estimate, afterHours: !open, hours }, 201);
}

// Número para wa.me (Colombia por defecto).
function waNum(phone) { const d = digits(phone); return d.length === 10 && d.startsWith("3") ? "57" + d : d; }

/* ---------- formulario de contacto ---------- */
async function handleContact(req, store) {
  const b = await readBody(req, 10_000);
  if (b.website) return json({ id: "MSG-" + randomUUID().slice(0, 6).toUpperCase() }); // trampa para bots
  const name = str(b.name, 100), phone = str(b.phone, 30), email = str(b.email, 120), message = str(b.message, 1500);
  if (name.length < 2 || digits(phone).length < 7) return fail(400, "Escribe tu nombre y un teléfono válido.");
  if (message.length < 3) return fail(400, "Escribe tu mensaje.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "El correo no es válido.");
  if (b.consent !== true) return fail(400, "Se requiere la autorización de tratamiento de datos.");
  // Límite simple: máx. 5 mensajes por teléfono al día.
  const today = todayBogota(), mine = (await listJSON(store, "msg/")).filter((m) => digits(m.phone).slice(-7) === digits(phone).slice(-7) && (m.createdAt || "").slice(0, 10) >= addDaysISO(today, -1));
  if (mine.length >= 5) return fail(429, "Ya recibimos tus mensajes. Te responderemos pronto.");
  const hotel = await store.get("hotel", { type: "json" });
  const open = wa.isOpen(hotel), hours = wa.hoursText(hotel), base = notifier.baseUrl(req);
  const id = "MSG-" + Date.now().toString(36).toUpperCase().slice(-5) + randomUUID().slice(0, 3).toUpperCase();
  const item = { id, name, phone, email, message, topic: str(b.topic, 40), consent: true, status: "nueva", afterHours: !open, createdAt: new Date().toISOString() };
  await store.setJSON("msg/" + id, item);
  const waText = [`💬 *Nuevo mensaje de contacto* ${id}`, `👤 ${name}`, `📞 ${phone}${email ? " · " + email : ""}`, item.topic ? `🏷 ${item.topic}` : null, `📝 ${message}`,
    open ? null : `⏰ Llegó fuera del horario de atención (${hours}). Al cliente se le informó el horario.`,
    `Responder: https://wa.me/${waNum(phone)}`, `Panel: ${base}/admin`].filter(Boolean).join("\n");
  await Promise.all([wa.send(store, hotel, waText, { kind: "contacto" }), notifier.notify(store, hotel, {
    subject: `Mensaje de contacto ${id}`, title: "Nuevo mensaje de contacto", tone: "info",
    intro: `${name} escribió desde el sitio web.`,
    rows: [["Código", id], ["Teléfono", phone], ["Correo", email], ["Asunto", item.topic], ["Mensaje", message], ...(open ? [] : [["Horario", `Llegó fuera del horario de atención (${hours})`]])],
    button: { url: base + "/admin", label: "Ver en el panel" },
  })]);
  return json({ id, afterHours: !open, hours }, 201);
}
const addDaysISO = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/* ---------- pagos y comprobantes ---------- */
const PAY_METHODS = ["Efectivo", "Transferencia", "Nequi / Daviplata", "Tarjeta", "Cobrado por el canal", "Otro"];
const PAY_ST = ["verificado", "por verificar", "rechazado"];
const MAX_PAYMENTS = 30;
const verifiedSum = (list) => (list || []).filter((p) => p.status === "verificado").reduce((a, p) => a + (Number(p.amount) || 0), 0);
// Guarda un pago y ajusta el abonado. «paid» sigue siendo editable en el panel; los pagos verificados lo suman o restan.
async function addPayment(store, r, b, by) {
  const amount = Math.round(Number(b.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw Object.assign(new Error("Escribe un valor mayor que cero."), { status: 400 });
  if ((r.payments || []).length >= MAX_PAYMENTS) throw Object.assign(new Error("Esta reserva ya tiene demasiados pagos registrados."), { status: 409 });
  const photoId = str(b.photoId, 80);
  if (photoId && !(ID_RE.test(photoId) && (photoId.startsWith("PAY_" + r.id + "_") || (by === "recepcion" && photoId.startsWith("ADM_"))))) throw Object.assign(new Error("Foto del comprobante no válida."), { status: 400 });
  if (photoId && !(await idPhotos().getMetadata(photoId))) throw Object.assign(new Error("La foto del comprobante no se encontró. Súbela de nuevo."), { status: 400 });
  if (by === "huesped" && !photoId) throw Object.assign(new Error("Adjunta la foto del comprobante."), { status: 400 });
  const status = by === "huesped" ? "por verificar" : (PAY_ST.includes(b.status) ? b.status : "verificado");
  const p = { id: "P" + Date.now().toString(36).toUpperCase() + randomUUID().slice(0, 3).toUpperCase(), amount, method: PAY_METHODS.includes(b.method) ? b.method : "Otro",
    date: DATE_RE.test(b.date || "") ? b.date : todayBogota(), ref: str(b.ref, 60), note: str(b.note, 300), photoId, by, status, at: new Date().toISOString() };
  const cur = (await store.get("res/" + r.id, { type: "json" })) || r;
  const next = { ...cur, payments: [...(cur.payments || []), p], updatedAt: p.at };
  if (status === "verificado") { next.paid = (Number(cur.paid) || 0) + amount; next.payMethod = p.method; }
  await store.setJSON("res/" + r.id, next);
  return { next, p };
}
async function changePayment(store, r, payId, status) {
  const cur = (await store.get("res/" + r.id, { type: "json" })) || r;
  const list = cur.payments || [], i = list.findIndex((p) => p.id === payId);
  if (i < 0) throw Object.assign(new Error("Pago no encontrado."), { status: 404 });
  const before = list[i];
  const nextList = status === null ? list.filter((_, k) => k !== i) : list.map((p, k) => (k === i ? { ...p, status, reviewedAt: new Date().toISOString() } : p));
  const delta = verifiedSum(nextList) - verifiedSum(list);
  const next = { ...cur, payments: nextList, paid: Math.max(0, (Number(cur.paid) || 0) + delta), updatedAt: new Date().toISOString() };
  if (status === "verificado") next.payMethod = before.method;
  await store.setJSON("res/" + r.id, next);
  if (status === null && before.photoId) await idPhotos().delete(before.photoId).catch(() => {});
  return next;
}
const payView = (p) => ({ id: p.id, amount: p.amount, method: p.method, date: p.date, status: p.status, at: p.at, by: p.by, hasPhoto: !!p.photoId,
  photo: p.photoId && p.photoId.startsWith("PAY_") ? p.photoId : undefined });

async function handleRequestStatus(id, url, store) {
  if (!ID_RE.test(id)) return fail(400, "Código no válido.");
  const r = await store.get("req/" + id, { type: "json" });
  const p = digits(url.searchParams.get("p"));
  if (!r || p.length < 7 || digits(r.phone).slice(-7) !== p.slice(-7)) return fail(404, "Solicitud no encontrada.");
  const room = await store.get("rooms/" + r.roomId, { type: "json" });
  return json({ id: r.id, status: r.status, checkIn: r.checkIn, checkOut: r.checkOut, room: room ? room.name || room.type : "" });
}

async function handlePhoto(id) {
  if (!ID_RE.test(id)) return new Response("No encontrada", { status: 404 });
  const entry = await photos().getWithMetadata(id, { type: "arrayBuffer" });
  if (!entry) return new Response("No encontrada", { status: 404 });
  return new Response(entry.data, {
    headers: { "Content-Type": entry.metadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

/* ---------- administración ---------- */
function cleanRecord(body, id) {
  const rec = { ...body, id, updatedAt: new Date().toISOString() };
  delete rec._gcal; delete rec._link;
  return rec;
}

/* ---------- calendario ---------- */
function feedToken() {
  const own = env("CALENDAR_FEED_TOKEN");
  if (own) return own;
  return secret() ? createHmac("sha256", secret()).update("ics-feed").digest("hex").slice(0, 32) : "";
}
function roomFeedSig(roomId, channel) {
  return secret() ? createHmac("sha256", secret()).update(`room-ics:${roomId}:${channel}`).digest("hex").slice(0, 24) : "";
}
function cleanFeeds(list) {
  if (list == null) return undefined;
  if (!Array.isArray(list)) throw Object.assign(new Error("Lista de calendarios no válida."), { status: 400 });
  return list.slice(0, 6).map((f) => {
    const url = str(f && f.url, 800).replace(/^webcals?:\/\//i, "https://");
    if (!url) return null;
    let u; try { u = new URL(url); } catch { throw Object.assign(new Error("Hay un enlace iCal que no es una URL válida."), { status: 400 }); }
    if (u.protocol !== "https:") throw Object.assign(new Error("Los enlaces iCal deben empezar por https://."), { status: 400 });
    const channel = ical.FEED_CHANNELS.includes(f.channel) ? f.channel : "otro";
    const id = ID_RE.test(f.id || "") ? f.id : "F" + randomUUID().replace(/-/g, "").slice(0, 10);
    return { id, channel, url };
  }).filter(Boolean);
}
// Toda escritura en Google Calendar pasa por calsync: inmediata y, si falla, a la cola de reintentos.
const syncToCalendar = (store, rec, deleted = false) => calsync.syncOne(store, rec, deleted);
const touchesEvent = ["name", "address", "checkinFrom", "checkout"];

/* ---------- enlace del huésped: confirmación y check-in en línea ---------- */
function guestSig(resId) { return secret() ? createHmac("sha256", secret()).update("guest:" + resId).digest("hex").slice(0, 24) : ""; }
const guestPath = (resId) => (secret() ? `/reserva?r=${encodeURIComponent(resId)}&t=${guestSig(resId)}` : null);
function sameStr(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); }
const ageOn = (birth, day) => { const [y, m, d] = birth.split("-").map(Number), [Y, M, D] = day.split("-").map(Number); return Y - y - (M < m || (M === m && D < d) ? 1 : 0); };
const GUEST_HOTEL_FIELDS = [...PUBLIC_HOTEL_FIELDS, "frontDesk"];

async function loadGuestRes(store, resId, sig) {
  if (!ID_RE.test(resId) || !guestSig(resId) || !sameStr(sig, guestSig(resId))) return null;
  const r = await store.get("res/" + resId, { type: "json" });
  if (!r) return null;
  if (r.checkOut && diffDays(r.checkOut, todayBogota()) > 30) return null; // el enlace vence 30 días después de la salida
  return r;
}
const canCheckin = (r) => ["pendiente", "confirmada", "encasa"].includes(r.status) && r.checkOut >= todayBogota();

/* ---------- contrato de hospedaje firmado ---------- */
const clientIp = (req) => str((req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0], 60);
function contractView(r, hotel) {
  const text = contract.textOf(hotel);
  const c = r.contract;
  return { signed: !!c, signedAt: c?.signedAt, signerName: c?.signerName, via: c?.via, hash: c?.hash, version: c ? c.version : contract.versionOf(text),
    text: c ? undefined : text, declarations: contract.DECLARATIONS };
}
async function signContract(req, store, r, b, via) {
  if (r.contract) return fail(409, "Esta reserva ya tiene el contrato firmado.");
  if (r.status === "cancelada") return fail(409, "La reserva está cancelada.");
  const signerName = str(b.signerName, 120), signerDoc = str(b.signerDoc, 40);
  if (signerName.length < 3) return fail(400, "Escribe el nombre completo de quien firma.");
  if (digits(signerDoc).length < 4 && signerDoc.replace(/\s/g, "").length < 5) return fail(400, "Escribe el número de documento de quien firma.");
  const decl = {};
  for (const dc of contract.DECLARATIONS) { if (b.accept?.[dc.k] !== true) return fail(400, "Debes marcar todas las declaraciones para firmar."); decl[dc.k] = true; }
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.signature || ""));
  const sig = m ? Buffer.from(m[1], "base64") : null;
  if (!sig || sig.length < 1500 || sig.length > 400_000 || sig[0] !== 0xff || sig[1] !== 0xd8) return fail(400, "La firma no es válida. Firma de nuevo en el recuadro.");
  const hotel = (await store.get("hotel", { type: "json" })) || {};
  const [room, guest] = await Promise.all([store.get("rooms/" + r.roomId, { type: "json" }), r.guestId ? store.get("guests/" + r.guestId, { type: "json" }) : null]);
  const companions = (await Promise.all((r.companions || []).map((id) => store.get("guests/" + id, { type: "json" })))).filter(Boolean);
  const text = contract.textOf(hotel), version = contract.versionOf(text), signedAt = new Date().toISOString();
  const hash = contract.fingerprint({ text, res: r, signerName, signerDoc, signedAt, signatureJpeg: sig, declarations: decl });
  const rec = { signedAt, signerName, signerDoc, via, version, hash, declarations: decl, ip: clientIp(req), userAgent: str(req.headers.get("user-agent"), 300) };
  const pdf = contract.buildPdf({ hotel, res: r, room, guest, companions, text, contract: rec, signatureJpeg: sig });
  const ts = Date.now().toString(36), st = idPhotos();
  rec.signatureId = `${r.id}_SIG_${ts}`; rec.pdfId = `${r.id}_CT_${ts}`; rec.pdfSha256 = contract.sha256(pdf);
  await st.set(rec.signatureId, sig, { metadata: { contentType: "image/jpeg", resId: r.id, kind: "firma" } });
  await st.set(rec.pdfId, pdf, { metadata: { contentType: "application/pdf", resId: r.id, kind: "contrato", sha256: rec.pdfSha256 } });
  const cur = (await store.get("res/" + r.id, { type: "json" })) || r;
  const next = { ...cur, contract: rec, updatedAt: signedAt };
  await store.setJSON("res/" + r.id, next);
  await syncToCalendar(store, next);
  await notifier.notify(store, hotel, {
    subject: `Contrato firmado ${r.id}`, title: "Contrato de hospedaje firmado", tone: "ok",
    intro: `${signerName} firmó el contrato y las políticas del hotel ${via === "recepcion" ? "en recepción" : "desde su enlace"}.`,
    rows: [["Reserva", r.id], ["Habitación", room ? `${room.number} · ${room.name || room.type || ""}` : r.roomId], ["Estancia", `${r.checkIn} → ${r.checkOut}`], ["Código de verificación", hash]],
    button: { url: notifier.baseUrl(req) + "/admin", label: "Ver el contrato en el panel" },
  });
  return json({ ok: true, signedAt, hash, version });
}
async function sendContractPdf(r, inline) {
  if (!r.contract || !r.contract.pdfId) return fail(404, "Esta reserva aún no tiene contrato firmado.");
  const e = await idPhotos().getWithMetadata(r.contract.pdfId, { type: "arrayBuffer" });
  if (!e) return fail(404, "No se encontró el PDF del contrato.");
  return new Response(e.data, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="Contrato-${r.id}.pdf"` } });
}

async function handleGuest(req, rest, store) {
  const [resId, sig, action, extra] = rest;
  const r = await loadGuestRes(store, resId || "", sig || "");
  if (!r) return fail(404, "El enlace no es válido o ya venció. Escríbenos por WhatsApp.");
  const m = req.method;

  if (!action && m === "GET") {
    const [hotel, room, guest] = await Promise.all([store.get("hotel", { type: "json" }), store.get("rooms/" + r.roomId, { type: "json" }), r.guestId ? store.get("guests/" + r.guestId, { type: "json" }) : null]);
    return json({
      hotel: pick(hotel || {}, GUEST_HOTEL_FIELDS),
      room: room ? pick(room, ["number", "name", "type", "beds", "bath", "capacity", "photos"]) : null,
      res: pick(r, ["id", "status", "checkIn", "checkOut", "adults", "children", "rate", "total", "paid", "channel", "externalRef", "eta", "roomId"]),
      titular: guest ? { first: guest.first || "", last: guest.last || "", phone: guest.phone || "", email: guest.email || "" } : { first: r.guestName && !r.source ? r.guestName : "" },
      checkin: r.checkin ? { at: r.checkin.at, people: r.checkin.people } : null,
      contract: contractView(r, hotel),
      wifi: r.contract && hotel && hotel.wifiName ? { name: hotel.wifiName, pass: hotel.wifiPass || "" } : null,
      canCheckin: canCheckin(r), docTypes: DOC_TYPES, today: todayBogota(),
      payments: (r.payments || []).map(payView), payMethods: ["Transferencia", "Nequi / Daviplata", "Tarjeta", "Efectivo", "Otro"], canPay: r.status !== "cancelada",
      payInfo: str(hotel?.payments, 600),
    });
  }

  if (action === "contract" && m === "POST") {
    if (!canCheckin(r)) return fail(409, "Esta reserva ya no admite la firma en línea. Fírmalo en recepción.");
    return await signContract(req, store, r, await readBody(req, 600_000), "enlace");
  }
  if (action === "contract.pdf" && m === "GET") return await sendContractPdf(r, false);

  // El huésped puede ver solo los comprobantes de su propia reserva.
  if (action === "payment-photo" && m === "GET" && extra) {
    if (!ID_RE.test(extra) || !extra.startsWith("PAY_" + resId + "_") || !(r.payments || []).some((p) => p.photoId === extra)) return fail(404, "Comprobante no encontrado.");
    const e = await idPhotos().getWithMetadata(extra, { type: "arrayBuffer" });
    if (!e) return fail(404, "Comprobante no encontrado.");
    return new Response(e.data, { headers: { "Content-Type": e.metadata?.contentType || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  }
  if (action === "payment-photo" && m === "POST") {
    if (r.status === "cancelada") return fail(409, "La reserva está cancelada.");
    const type = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (!PHOTO_TYPES.includes(type)) return fail(415, "Formato no admitido. Usa una foto JPG, PNG o WebP.");
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return fail(400, "La foto está vacía.");
    if (buf.byteLength > MAX_ID_PHOTO_BYTES) return fail(413, "La foto supera 4 MB.");
    const st = idPhotos(), { blobs } = await st.list({ prefix: "PAY_" + resId + "_" });
    if (blobs.length >= 20) return fail(429, "Se alcanzó el máximo de comprobantes para esta reserva. Escríbenos por WhatsApp.");
    const pid = "PAY_" + resId + "_" + randomUUID().replace(/-/g, "").slice(0, 16);
    await st.set(pid, buf, { metadata: { contentType: type, resId, kind: "comprobante", at: new Date().toISOString() } });
    return json({ id: pid }, 201);
  }
  if (action === "payment" && m === "POST") {
    if (r.status === "cancelada") return fail(409, "La reserva está cancelada.");
    const b = await readBody(req, 5_000);
    const { next, p } = await addPayment(store, r, b, "huesped");
    const [hotel, room] = await Promise.all([store.get("hotel", { type: "json" }), store.get("rooms/" + r.roomId, { type: "json" })]);
    const name = (r.guestName || "").trim() || "El huésped", base = notifier.baseUrl(req);
    await Promise.all([
      wa.send(store, hotel, [`💳 *Comprobante de pago* · reserva ${r.id}`, `👤 ${name} · Hab. ${room ? room.number : r.roomId}`, `💵 $${p.amount.toLocaleString("es-CO")} · ${p.method}${p.ref ? " · ref. " + p.ref : ""}`, `Por verificar en el panel: ${base}/admin`].join("\n"), { kind: "pago" }),
      notifier.notify(store, hotel, { subject: `Comprobante de pago ${r.id}`, title: "Comprobante de pago recibido", tone: "info",
        intro: `${name} subió un comprobante de pago desde su enlace. Revísalo y márcalo como verificado para sumarlo al abonado.`,
        rows: [["Reserva", r.id], ["Valor", "$" + p.amount.toLocaleString("es-CO")], ["Medio", p.method], ["Referencia", p.ref], ["Fecha del pago", p.date], ["Nota", p.note]],
        button: { url: base + "/admin", label: "Verificar en el panel" } }),
    ]);
    return json({ ok: true, payment: payView(p), payments: next.payments.map(payView) }, 201);
  }

  if (action === "photo" && m === "POST") {
    if (!canCheckin(r)) return fail(409, "Esta reserva ya no admite registro en línea.");
    const type = (req.headers.get("content-type") || "").split(";")[0].trim();
    if (!PHOTO_TYPES.includes(type)) return fail(415, "Formato no admitido. Usa una foto JPG, PNG o WebP.");
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return fail(400, "La foto está vacía.");
    if (buf.byteLength > MAX_ID_PHOTO_BYTES) return fail(413, "La foto supera 4 MB.");
    const st = idPhotos();
    const { blobs } = await st.list({ prefix: resId + "_" });
    if (blobs.length >= MAX_ID_PHOTOS_PER_RES) return fail(429, "Se alcanzó el máximo de fotos para esta reserva. Escríbenos por WhatsApp.");
    const pid = resId + "_" + randomUUID().replace(/-/g, "").slice(0, 20);
    await st.set(pid, buf, { metadata: { contentType: type, resId, at: new Date().toISOString() } });
    return json({ id: pid }, 201);
  }

  if (action === "checkin" && m === "POST") {
    if (!canCheckin(r)) return fail(409, "Esta reserva ya no admite registro en línea.");
    const b = await readBody(req, 60_000);
    if (b.consent !== true) return fail(400, "Debes autorizar el tratamiento de datos para continuar.");
    const list = Array.isArray(b.people) ? b.people.slice(0, 12) : [];
    if (!list.length) return fail(400, "Agrega al menos al huésped titular.");
    const today = todayBogota(), st = idPhotos();
    const trip = { origin: str(b.origin, 80), destination: str(b.destination, 80), purpose: str(b.purpose, 40), transport: str(b.transport, 20) };
    const people = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i] || {}, who = i === 0 ? "del titular" : `del acompañante ${i}`;
      const g = { first: str(p.first, 80), last: str(p.last, 80), docType: DOC_TYPES.includes(p.docType) ? p.docType : "", docNumber: str(p.docNumber, 30),
        nationality: str(p.nationality, 60), birth: str(p.birth, 10), sex: ["F", "M", "Otro"].includes(p.sex) ? p.sex : "", phone: str(p.phone, 30), email: str(p.email, 120),
        city: str(p.city, 80), job: str(p.job, 80), ...trip };
      if (!g.first || !g.last) return fail(400, `Escribe nombres y apellidos ${who}.`);
      if (!g.docType || !g.docNumber) return fail(400, `Falta el documento ${who}.`);
      if (!g.nationality) return fail(400, `Falta la nacionalidad ${who}.`);
      if (!DATE_RE.test(g.birth) || g.birth >= today || g.birth < "1900-01-01") return fail(400, `Revisa la fecha de nacimiento ${who}.`);
      const adult = ageOn(g.birth, today) >= 18;
      if (i === 0 && !adult) return fail(400, "El huésped titular debe ser mayor de edad.");
      if (i === 0 && (digits(g.phone).length < 7 || !g.city)) return fail(400, "Escribe el teléfono y la ciudad de residencia del titular.");
      const ph = {};
      for (const k of ["selfie", "docFront", "docBack"]) {
        const v = str(p[k], 64);
        if (!v) continue;
        if (!v.startsWith(resId + "_") || !(await st.getMetadata(v))) return fail(400, `Vuelve a subir las fotos ${who}.`);
        ph[k] = v;
      }
      if (!ph.docFront) return fail(400, `Sube la foto del documento ${who}.`);
      if (adult && !ph.selfie) return fail(400, `Sube la selfie ${who}.`);
      people.push({ ...g, ...ph });
    }
    // Guardar fichas: el titular reutiliza la ficha de la reserva; los acompañantes, las del registro anterior.
    const now = new Date().toISOString();
    const prevIds = [r.guestId, ...(Array.isArray(r.companions) ? r.companions : [])];
    const ids = [];
    for (let i = 0; i < people.length; i++) {
      const id = (prevIds[i] && ID_RE.test(prevIds[i])) ? prevIds[i] : "G-" + Date.now().toString(36).toUpperCase().slice(-5) + randomUUID().slice(0, 4).toUpperCase();
      const cur = (await store.get("guests/" + id, { type: "json" })) || {};
      const next = { ...cur, ...people[i], id, consent: true, consentAt: now, source: "checkin-en-linea", emergency: i === 0 ? str(b.emergency, 120) || cur.emergency || "" : cur.emergency,
        createdAt: cur.createdAt || now, updatedAt: now };
      for (const k of ["selfie", "docFront", "docBack"]) if (cur[k] && cur[k] !== next[k]) await st.delete(cur[k]).catch(() => {});
      await store.setJSON("guests/" + id, next);
      ids.push(id);
    }
    const t = people[0];
    const rec = { ...r, guestId: ids[0], guestName: `${t.first} ${t.last}`.trim(), companions: ids.slice(1), eta: str(b.eta, 5) || r.eta || "",
      checkin: { at: now, people: people.length, by: "huesped" }, updatedAt: now };
    await store.setJSON("res/" + r.id, rec);
    await syncToCalendar(store, rec);
    const [hotel, room] = await Promise.all([store.get("hotel", { type: "json" }), store.get("rooms/" + r.roomId, { type: "json" })]);
    await notifier.notify(store, hotel, {
      subject: `Check-in en línea ${r.id}`, title: "Check-in en línea completado", tone: "ok",
      intro: `${rec.guestName} llenó el registro hotelero (TRA) de ${people.length} persona${people.length === 1 ? "" : "s"} y subió las fotos.`,
      rows: [["Reserva", r.id], ["Habitación", room ? `${room.number} · ${room.name || room.type || ""}` : r.roomId], ["Llegada", `${r.checkIn}${rec.eta ? " · " + rec.eta : ""}`], ["Salida", r.checkOut],
        ["Huéspedes", people.map((p) => `${p.first} ${p.last}`).join("; ")], ["Teléfono", t.phone], ["Procedencia", trip.origin]],
      button: { url: notifier.baseUrl(req) + "/admin", label: "Ver la ficha en el panel" },
    });
    return json({ ok: true, people: people.length, at: now });
  }
  return fail(405, "Método no permitido.");
}

async function handleAdmin(req, parts, store) {
  const [kind, id] = parts;
  const m = req.method;

  if (kind === "state" && m === "GET") {
    await ensureSeed(store);
    const [hotel, rooms, guests, reservations, requests, messages] = await Promise.all([
      store.get("hotel", { type: "json" }), listJSON(store, "rooms/"), listJSON(store, "guests/"), listJSON(store, "res/"), listJSON(store, "req/"), listJSON(store, "msg/"),
    ]);
    const links = {};
    if (secret()) for (const r of reservations) links[r.id] = guestPath(r.id);
    return json({ hotel, rooms, guests, reservations, requests, messages, links, today: todayBogota() });
  }

  if (kind === "hotel" && m === "PUT") {
    const b = await readBody(req);
    const prev = (await store.get("hotel", { type: "json" })) || {};
    const rec = { ...b, updatedAt: new Date().toISOString() };
    await store.setJSON("hotel", rec);
    // Si cambian horarios, nombre o dirección, se actualizan los eventos de las reservas vigentes.
    if (touchesEvent.some((k) => (prev[k] || "") !== (rec[k] || ""))) return json({ ...rec, _gcal: await calsync.resyncWhere(store, () => true, { hotel: rec }) });
    return json(rec);
  }

  if (kind === "photos") {
    if (m === "POST") {
      const type = (req.headers.get("content-type") || "").split(";")[0].trim();
      if (!PHOTO_TYPES.includes(type)) return fail(415, "Formato no admitido. Usa JPG, PNG o WebP.");
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return fail(400, "La imagen está vacía.");
      if (buf.byteLength > MAX_PHOTO_BYTES) return fail(413, "La imagen supera 5 MB.");
      const pid = randomUUID().replace(/-/g, "");
      await photos().set(pid, buf, { metadata: { contentType: type, size: buf.byteLength } });
      return json({ id: pid }, 201);
    }
    if (m === "DELETE" && id && ID_RE.test(id)) { await photos().delete(id); return json({ deleted: true }); }
    return fail(405, "Método no permitido.");
  }

  if (kind === "gcal") {
    if (id === "status" && m === "GET") {
      const t = feedToken();
      return json({ configured: gcal.isConfigured(), mode: gcal.authMode(), calendarId: gcal.calendarId(), feedPath: t ? `/api/calendar/${t}.ics` : null,
        last: await store.get("gcal/last", { type: "json" }), queue: await calsync.queueInfo(store) });
    }
    if (id === "test" && m === "POST") return json(await calsync.testConnection());
    if (id === "retry" && m === "POST") return json(await calsync.processQueue(store));
    if (id === "sync" && m === "POST") {
      if (!gcal.isConfigured()) return fail(400, "Google Calendar no está configurado. Revisa las variables de entorno en Netlify.");
      const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const res = (await listJSON(store, "res/")).filter((r) => r.checkOut >= from);
      let ok = 0; const errors = [];
      for (const r of res) {
        const out = await syncToCalendar(store, r);
        if (out.ok) ok++; else if (out.error) errors.push(`${r.id}: ${out.error}`);
      }
      return json({ total: res.length, ok, failed: errors.length, errors: errors.slice(0, 3) });
    }
    return fail(404, "Ruta no encontrada.");
  }

  if (kind === "wa") {
    const hotel = await store.get("hotel", { type: "json" });
    if (id === "status" && m === "GET") return json({ provider: wa.provider(), phones: wa.masked(), off: !!(hotel && hotel.waOff), last: await store.get("wa/last", { type: "json" }), hours: wa.hoursOf(hotel), hoursText: wa.hoursText(hotel), openNow: wa.isOpen(hotel) });
    if (id === "test" && m === "POST") {
      if (!wa.provider()) return fail(400, "WhatsApp no está configurado. Revisa el README, sección «Avisos por WhatsApp».");
      const out = await wa.send(store, hotel, `✅ Prueba del sistema de reservas ${hotel?.name || "Portal Norte 170"}.\nDesde ahora recibirás aquí las solicitudes de reserva, los mensajes de contacto y los comprobantes de pago.`, { force: true, kind: "prueba" });
      return out.ok ? json(out) : fail(502, out.error || "No se pudo enviar.");
    }
    return fail(404, "Ruta no encontrada.");
  }

  if (kind === "payments") {
    const [, payId] = parts.slice(1);
    if (!ID_RE.test(id || "")) return fail(404, "Ruta no encontrada.");
    const r = await store.get("res/" + id, { type: "json" });
    if (!r) return fail(404, "Reserva no encontrada.");
    let next;
    if (m === "POST" && !payId) next = (await addPayment(store, r, await readBody(req, 5_000), "recepcion")).next;
    else if (m === "PATCH" && payId) { const b = await readBody(req, 2_000); if (!PAY_ST.includes(b.status)) return fail(400, "Estado no válido."); next = await changePayment(store, r, payId, b.status); }
    else if (m === "DELETE" && payId) next = await changePayment(store, r, payId, null);
    else return fail(405, "Método no permitido.");
    return json({ ...next, _gcal: await syncToCalendar(store, next) });
  }

  if (kind === "contract") {
    if (id === "text" && m === "GET") {
      const hotel = await store.get("hotel", { type: "json" }); const text = contract.textOf(hotel);
      return json({ text, version: contract.versionOf(text), isDefault: text === contract.DEFAULT_TEXT, defaultText: contract.DEFAULT_TEXT, declarations: contract.DECLARATIONS });
    }
    const rid = String(id || "").replace(/\.pdf$/, "");
    if (!ID_RE.test(rid)) return fail(404, "Ruta no encontrada.");
    const r = await store.get("res/" + rid, { type: "json" });
    if (!r) return fail(404, "Reserva no encontrada.");
    if (m === "GET" && /\.pdf$/.test(id)) return await sendContractPdf(r, true);
    if (m === "POST") return await signContract(req, store, r, await readBody(req, 600_000), "recepcion");
    if (m === "DELETE") {
      if (!r.contract) return fail(404, "No hay contrato firmado para anular.");
      const next = { ...r, contractHistory: [...(r.contractHistory || []), { ...r.contract, voidedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() };
      delete next.contract; await store.setJSON("res/" + rid, next);
      await syncToCalendar(store, next);
      return json({ voided: true });
    }
    return fail(405, "Método no permitido.");
  }

  if (kind === "notify") {
    const hotel = await store.get("hotel", { type: "json" });
    if (id === "status" && m === "GET")
      return json({ provider: notifier.provider(), to: notifier.recipients(hotel), off: !!(hotel && hotel.notifyOff), last: await store.get("notify/last", { type: "json" }), defaultTo: notifier.DEFAULT_TO });
    if (id === "test" && m === "POST") {
      if (!notifier.provider()) return fail(400, "No hay servicio de correo configurado. Revisa el README, sección «Notificaciones por correo».");
      const out = await notifier.notify(store, hotel, { subject: "Correo de prueba", title: "¡Las notificaciones funcionan!", tone: "ok",
        intro: "Desde ahora te llegarán aquí los avisos del sistema de reservas:",
        items: ["Nuevas solicitudes desde el sitio web", "Check-in en línea completado por un huésped", "Reservas nuevas o canceladas en Booking y Airbnb", "Posibles sobreventas y calendarios que fallen"],
        button: { url: notifier.baseUrl(req) + "/admin", label: "Abrir el panel" } }, { force: true });
      return out.ok ? json(out) : fail(502, out.error || "No se pudo enviar.");
    }
    return fail(404, "Ruta no encontrada.");
  }

  if (kind === "ids") {
    const st = idPhotos();
    if (m === "GET" && id && ID_RE.test(id)) {
      const e = await st.getWithMetadata(id, { type: "arrayBuffer" });
      if (!e) return fail(404, "Foto no encontrada.");
      return new Response(e.data, { headers: { "Content-Type": e.metadata?.contentType || "image/jpeg", "Cache-Control": "private, no-store" } });
    }
    if (m === "POST" && !id) {
      const type = (req.headers.get("content-type") || "").split(";")[0].trim();
      if (!PHOTO_TYPES.includes(type)) return fail(415, "Formato no admitido. Usa JPG, PNG o WebP.");
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_ID_PHOTO_BYTES) return fail(413, "La foto debe pesar menos de 4 MB.");
      const pid = "ADM_" + randomUUID().replace(/-/g, "").slice(0, 24);
      await st.set(pid, buf, { metadata: { contentType: type, at: new Date().toISOString() } });
      return json({ id: pid }, 201);
    }
    if (m === "DELETE" && id && ID_RE.test(id)) { await st.delete(id); return json({ deleted: true }); }
    return fail(405, "Método no permitido.");
  }

  if (kind === "ical") {
    if (id === "status" && m === "GET") {
      const rooms = await listJSON(store, "rooms/");
      const exports = {};
      if (secret()) for (const r of rooms) exports[r.id] = Object.fromEntries(["booking", "airbnb"].map((c) => [c, `/api/ical/${r.id}/${c}/${roomFeedSig(r.id, c)}.ics`]));
      return json({ status: await ical.readStatus(store), exports });
    }
    if (id === "sync" && m === "POST") return json(await ical.syncAll(store, { reason: "manual" }));
    return fail(404, "Ruta no encontrada.");
  }

  const prefix = KINDS[kind];
  if (!prefix || !id || !ID_RE.test(id)) return fail(404, "Ruta no encontrada.");
  const key = prefix + id;

  if (m === "DELETE") {
    if (kind === "rooms") {
      const today = todayBogota();
      const res = await listJSON(store, "res/");
      if (res.some((r) => r.roomId === id && isActive(r) && r.checkOut >= today)) return fail(409, "La habitación tiene reservas activas. Muévelas o cancélalas primero.");
    }
    const before = kind === "reservations" ? await store.get(key, { type: "json" }) : null;
    if (kind === "guests") {
      const g = await store.get(key, { type: "json" });
      if (g) await Promise.all(["selfie", "docFront", "docBack"].filter((k) => g[k]).map((k) => idPhotos().delete(g[k]).catch(() => {})));
    }
    await store.delete(key);
    const g = before ? await syncToCalendar(store, before, true) : undefined;
    return json({ deleted: true, _gcal: g });
  }

  if (kind === "messages" && m === "PATCH") {
    const cur = await store.get(key, { type: "json" });
    if (!cur) return fail(404, "Mensaje no encontrado.");
    const b = await readBody(req, 2_000);
    const rec = { ...cur, status: ["nueva", "atendida"].includes(b.status) ? b.status : cur.status, updatedAt: new Date().toISOString() };
    await store.setJSON(key, rec);
    return json(rec);
  }

  if (kind === "requests" && m === "PATCH") {
    const cur = await store.get(key, { type: "json" });
    if (!cur) return fail(404, "Solicitud no encontrada.");
    const b = await readBody(req, 5_000);
    const patch = {};
    if (["nueva", "aceptada", "rechazada"].includes(b.status)) patch.status = b.status;
    if (b.resId && ID_RE.test(b.resId)) patch.resId = b.resId;
    if (b.decidedAt) patch.decidedAt = str(b.decidedAt, 40);
    const rec = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    await store.setJSON(key, rec);
    return json(rec);
  }

  if (m === "PUT" && kind !== "requests" && kind !== "messages") {
    const b = await readBody(req);
    if (kind === "reservations") {
      if (!DATE_RE.test(b.checkIn || "") || !DATE_RE.test(b.checkOut || "") || b.checkOut <= b.checkIn) return fail(400, "La salida debe ser posterior a la entrada.");
      if (!b.roomId || !(await store.get("rooms/" + b.roomId, { type: "json" }))) return fail(400, "La habitación no existe.");
      if (b.status !== "cancelada") {
        const res = await listJSON(store, "res/");
        const clash = res.filter((r) => r.id !== id && r.roomId === b.roomId && isActive(r) && overlaps(b.checkIn, b.checkOut, r.checkIn, r.checkOut));
        if (clash.length) return fail(409, `La habitación ya está ocupada en esas fechas (reserva ${clash.map((c) => c.id).join(", ")}).`, { conflicts: clash.map((c) => c.id) });
      }
    }
    if (kind === "rooms" && !str(b.number)) return fail(400, "El número de habitación es obligatorio.");
    if (kind === "rooms") { const f = cleanFeeds(b.icalFeeds); if (f === undefined) delete b.icalFeeds; else b.icalFeeds = f; }
    if (kind === "guests" && !str(b.first)) return fail(400, "El nombre del huésped es obligatorio.");
    const rec = cleanRecord(b, id);
    if (kind === "reservations") {
      // La firma del contrato solo la escribe el módulo de firma: nunca se toma del panel (evita perderla o alterarla con una copia vieja).
      const prev = await store.get(key, { type: "json" });
      if (prev && prev.contract) rec.contract = prev.contract; else delete rec.contract;
      if (prev && prev.contractHistory) rec.contractHistory = prev.contractHistory; else delete rec.contractHistory;
      if (prev && prev.checkin && !rec.checkin) rec.checkin = prev.checkin;
      // Los pagos con comprobante solo se escriben por sus rutas propias.
      if (prev && prev.payments) rec.payments = prev.payments; else delete rec.payments;
    }
    await store.setJSON(key, rec);
    if (kind === "reservations") return json({ ...rec, _gcal: await syncToCalendar(store, rec) });
    // Cambios en el huésped (nombre, teléfono) o en la habitación (número, nombre) se reflejan en sus eventos.
    if (kind === "guests") return json({ ...rec, _gcal: await calsync.resyncWhere(store, (r) => r.guestId === id || (r.companions || []).includes(id)) });
    if (kind === "rooms") return json({ ...rec, _gcal: await calsync.resyncWhere(store, (r) => r.roomId === id) });
    return json(rec);
  }

  return fail(405, "Método no permitido.");
}

/* ---------- router ---------- */
export default async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const store = data();
  try {
    const [head, ...rest] = parts;

    if (head === "public" && req.method === "GET") return await handlePublic(store);
    if (head === "requests" && req.method === "POST" && !rest.length) return await handleNewRequest(req, store);
    if (head === "contact" && req.method === "POST" && !rest.length) return await handleContact(req, store);
    if (head === "requests" && req.method === "GET" && rest.length === 1) return await handleRequestStatus(rest[0], url, store);
    if (head === "photos" && req.method === "GET" && rest.length === 1) return await handlePhoto(rest[0]);
    if (head === "calendar" && req.method === "GET" && rest.length === 1) {
      const t = feedToken(), given = rest[0].replace(/\.ics$/, "");
      const a = Buffer.from(given), b = Buffer.from(t);
      if (!t || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("No encontrado", { status: 404 });
      const [hotel, rooms, guests, res] = await Promise.all([store.get("hotel", { type: "json" }), listJSON(store, "rooms/"), listJSON(store, "guests/"), listJSON(store, "res/")]);
      return new Response(gcal.buildIcs(res, rooms, guests, hotel || {}), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="reservas-portal-norte-170.ics"' } });
    }

    if (head === "guest" && rest.length >= 2) return await handleGuest(req, rest, store);
    if (head === "ical" && req.method === "GET" && rest.length === 3) {
      const [roomId, channel, file] = rest, sig = file.replace(/\.ics$/, ""), want = ID_RE.test(roomId) ? roomFeedSig(roomId, channel) : "";
      const a = Buffer.from(sig), b = Buffer.from(want);
      if (!want || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("No encontrado", { status: 404 });
      const [room, res] = await Promise.all([store.get("rooms/" + roomId, { type: "json" }), listJSON(store, "res/")]);
      if (!room) return new Response("No encontrado", { status: 404 });
      return new Response(ical.buildRoomIcs(room, res, channel), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
    }

    if (head === "login" && req.method === "POST") {
      const pass = env("ADMIN_PASSWORD");
      if (!pass || !secret()) return fail(500, "Faltan las variables ADMIN_PASSWORD y TOKEN_SECRET en Netlify.");
      const b = await readBody(req, 2_000);
      if (!samePassword(b.password || "", pass)) {
        await new Promise((r) => setTimeout(r, 800));
        return fail(401, "Contraseña incorrecta.");
      }
      const exp = Date.now() + TOKEN_TTL_MS;
      return json({ token: sign({ role: "admin", exp }), exp });
    }

    if (head === "admin") {
      if (!verify(bearer(req))) return fail(401, "Sesión no válida o vencida.");
      return await handleAdmin(req, rest, store);
    }

    return fail(404, "Ruta no encontrada.");
  } catch (e) {
    console.error(e);
    return fail(e.status || 500, e.status ? e.message : "Error interno. Inténtalo de nuevo.");
  }
};
