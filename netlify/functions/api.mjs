// API del Hotel Portal Norte 170 — Netlify Functions (v2) + Netlify Blobs.
// Rutas públicas: /api/public, /api/requests, /api/photos/:id, /api/login
// Rutas de administración (Bearer token): /api/admin/*
import { getStore } from "@netlify/blobs";
import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";
import seed from "../../lib/seed.mjs";
import * as gcal from "../../lib/gcal.mjs";

export const config = { path: "/api/*" };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const KINDS = { rooms: "rooms/", guests: "guests/", reservations: "res/", requests: "req/" };

const data = () => getStore({ name: "portal-norte", consistency: "strong" });
const photos = () => getStore({ name: "portal-norte-photos" });

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
const PUBLIC_HOTEL_FIELDS = ["name", "address", "zone", "phone", "whatsapp", "email", "checkinFrom", "checkinTo", "checkout", "description", "amenities", "policies", "nearby", "payments", "heroPhoto", "tagline"];
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
  return json({ id, estimate: item.estimate }, 201);
}

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
  delete rec._gcal;
  return rec;
}

/* ---------- calendario ---------- */
function feedToken() {
  const own = env("CALENDAR_FEED_TOKEN");
  if (own) return own;
  return secret() ? createHmac("sha256", secret()).update("ics-feed").digest("hex").slice(0, 32) : "";
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Google Calendar no respondió a tiempo.")), ms))]);
async function syncToCalendar(store, rec, deleted = false) {
  if (!gcal.isConfigured()) return { skipped: true };
  try {
    if (deleted) return await withTimeout(gcal.deleteReservation(rec.id), 8000);
    const [room, guest, hotel] = await Promise.all([
      rec.roomId ? store.get("rooms/" + rec.roomId, { type: "json" }) : null,
      rec.guestId ? store.get("guests/" + rec.guestId, { type: "json" }) : null,
      store.get("hotel", { type: "json" }),
    ]);
    return await withTimeout(gcal.syncReservation(rec, room, guest, hotel || {}), 8000);
  } catch (e) {
    console.error("gcal", e);
    return { ok: false, error: e.message };
  }
}

async function handleAdmin(req, parts, store) {
  const [kind, id] = parts;
  const m = req.method;

  if (kind === "state" && m === "GET") {
    await ensureSeed(store);
    const [hotel, rooms, guests, reservations, requests] = await Promise.all([
      store.get("hotel", { type: "json" }), listJSON(store, "rooms/"), listJSON(store, "guests/"), listJSON(store, "res/"), listJSON(store, "req/"),
    ]);
    return json({ hotel, rooms, guests, reservations, requests, today: todayBogota() });
  }

  if (kind === "hotel" && m === "PUT") {
    const b = await readBody(req);
    const rec = { ...b, updatedAt: new Date().toISOString() };
    await store.setJSON("hotel", rec);
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
      return json({ configured: gcal.isConfigured(), mode: gcal.authMode(), calendarId: gcal.calendarId(), feedPath: t ? `/api/calendar/${t}.ics` : null });
    }
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
    await store.delete(key);
    const g = before ? await syncToCalendar(store, before, true) : undefined;
    return json({ deleted: true, _gcal: g });
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

  if (m === "PUT" && kind !== "requests") {
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
    if (kind === "guests" && !str(b.first)) return fail(400, "El nombre del huésped es obligatorio.");
    const rec = cleanRecord(b, id);
    await store.setJSON(key, rec);
    if (kind === "reservations") return json({ ...rec, _gcal: await syncToCalendar(store, rec) });
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
    if (head === "requests" && req.method === "GET" && rest.length === 1) return await handleRequestStatus(rest[0], url, store);
    if (head === "photos" && req.method === "GET" && rest.length === 1) return await handlePhoto(rest[0]);
    if (head === "calendar" && req.method === "GET" && rest.length === 1) {
      const t = feedToken(), given = rest[0].replace(/\.ics$/, "");
      const a = Buffer.from(given), b = Buffer.from(t);
      if (!t || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("No encontrado", { status: 404 });
      const [hotel, rooms, guests, res] = await Promise.all([store.get("hotel", { type: "json" }), listJSON(store, "rooms/"), listJSON(store, "guests/"), listJSON(store, "res/")]);
      return new Response(gcal.buildIcs(res, rooms, guests, hotel || {}), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="reservas-portal-norte-170.ics"' } });
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
