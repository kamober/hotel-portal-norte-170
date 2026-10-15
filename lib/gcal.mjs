// Integración con Google Calendar (tiempo real) y generación del feed iCal.
// Autenticación, en este orden de preferencia:
//   1) OAuth de la cuenta: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
//   2) Cuenta de servicio: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY (calendario compartido con ella)
// Calendario destino: GOOGLE_CALENDAR_ID (por defecto cbernal@gesoltec.co).
import { createSign } from "node:crypto";

const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];
const TZ = "America/Bogota";
const API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_CALENDAR = "cbernal@gesoltec.co";
const STATUS_TXT = { pendiente: "Pendiente", confirmada: "Confirmada", encasa: "En casa", finalizada: "Finalizada", cancelada: "Cancelada" };
const COLOR = { pendiente: "5", confirmada: "9", encasa: "10", finalizada: "8" }; // amarillo, azul, verde, gris
const CHANNEL_TXT = { directo: "Directo / WhatsApp", booking: "Booking.com", airbnb: "Airbnb", expedia: "Expedia", hotels: "Hoteles.com", web: "Sitio web", otro: "Otro" };

export function calendarId() { return env("GOOGLE_CALENDAR_ID") || DEFAULT_CALENDAR; }
/* ---------- conexión desde el panel («Conectar con Google») ----------
   Con GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET en Netlify, el botón del panel obtiene el refresh token
   y lo guarda en Netlify Blobs (clave «gcal/oauth»). GOOGLE_REFRESH_TOKEN en Netlify sigue funcionando y tiene prioridad. */
let stored = null, storedAt = 0;
export const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.send", "openid", "email"];
export const hasClient = () => !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
export async function loadStored(store, force = false) {
  if (!force && Date.now() - storedAt < 30_000) return stored;
  try { stored = (await store.get("gcal/oauth", { type: "json" })) || null; } catch { /* sin cambios */ }
  storedAt = Date.now(); return stored;
}
export function setStored(v) { stored = v; storedAt = Date.now(); cached = { token: null, exp: 0 }; }
export const connectedEmail = () => (env("GOOGLE_REFRESH_TOKEN") ? null : stored?.email || null);
const refreshToken = () => env("GOOGLE_REFRESH_TOKEN") || stored?.refresh || "";
export function authUrl(redirectUri, state) {
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, login_hint: calendarId() });
}
export async function exchangeCode(code, redirectUri, fetchImpl = fetch) {
  const r = await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || (j.access_token ? "Google no entregó el permiso permanente. Vuelve a pulsar «Conectar con Google»." : "HTTP " + r.status));
  let email = "";
  try { email = JSON.parse(Buffer.from(String(j.id_token || "").split(".")[1] || "", "base64url").toString()).email || ""; } catch {}
  return { refresh: j.refresh_token, email, scope: j.scope || "", at: new Date().toISOString() };
}

export function authMode() {
  if (env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") && refreshToken()) return "oauth";
  if (env("GOOGLE_SERVICE_ACCOUNT_EMAIL") && env("GOOGLE_PRIVATE_KEY")) return "service";
  return null;
}
export const isConfigured = () => authMode() !== null;

/* ---------- token de acceso (cacheado mientras viva la función) ---------- */
let cached = { token: null, exp: 0 };
export async function accessToken(fetchImpl = fetch) {
  if (cached.token && cached.exp > Date.now() + 60_000) return cached.token;
  const mode = authMode();
  let body;
  if (mode === "oauth") {
    body = new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: refreshToken(), grant_type: "refresh_token" });
  } else if (mode === "service") {
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({
      iss: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"), scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    });
    const key = String(env("GOOGLE_PRIVATE_KEY")).replace(/\\n/g, "\n");
    const sig = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
    body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + sig });
  } else throw new Error("Google Calendar no está configurado.");
  const r = await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google rechazó las credenciales: " + (j.error_description || j.error || r.status));
  cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return cached.token;
}

/* ---------- evento a partir de una reserva ---------- */
// Id determinista (base32hex permitido por Google: a-v y 0-9) para que guardar dos veces no duplique.
export const eventId = (resId) => "pn" + Buffer.from(String(resId)).toString("hex");

function money(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("es-CO"); }
function describe(res, room, guest) {
  const pax = `${res.adults || 1} adulto(s)${res.children ? `, ${res.children} niño(s)` : ""}`;
  const name = guest ? `${guest.first || ""} ${guest.last || ""}`.trim() : (res.guestName || "Huésped");
  const lines = [
    `Huésped: ${name}`,
    guest?.phone ? `Teléfono: ${guest.phone}` : null,
    `Habitación: ${room ? `${room.number} · ${room.name || room.type || ""}` : res.roomId}`,
    `Personas: ${pax}`,
    `Canal: ${CHANNEL_TXT[res.channel] || res.channel || "—"}${res.externalRef ? ` (${res.externalRef})` : ""}`,
    `Estado: ${STATUS_TXT[res.status] || res.status}`,
    `Total: ${money(res.total)} · Abonado: ${money(res.paid)} · Saldo: ${money((Number(res.total) || 0) - (Number(res.paid) || 0))}`,
    res.eta ? `Llegada estimada: ${res.eta}` : null,
    res.checkin?.at ? `Check-in en línea: completado (${res.checkin.people || 1} persona(s))` : null,
    res.contract?.signedAt ? `Contrato: firmado por ${res.contract.signerName}` : (["confirmada", "encasa"].includes(res.status) ? "Contrato: pendiente de firma" : null),
    res.notes ? `Notas: ${res.notes}` : null,
    `Código: ${res.id}`,
  ];
  return { name, text: lines.filter(Boolean).join("\n") };
}
export function buildEvent(res, room, guest, hotel = {}) {
  const { name, text } = describe(res, room, guest);
  const inT = (hotel.checkinFrom || "15:00") + ":00", outT = (hotel.checkout || "11:00") + ":00";
  return {
    summary: `Hab. ${room?.number || res.roomId} · ${name}${res.status === "pendiente" ? " (pendiente)" : ""}`,
    description: text,
    location: hotel.address ? `${hotel.name || "Hotel Portal Norte 170"}, ${hotel.address}` : undefined,
    start: { dateTime: `${res.checkIn}T${inT}`, timeZone: TZ },
    end: { dateTime: `${res.checkOut}T${outT}`, timeZone: TZ },
    colorId: COLOR[res.status],
    transparency: "transparent", // no bloquea la agenda personal
    status: "confirmed",
    extendedProperties: { private: { pn170: res.id } },
  };
}

/* ---------- operaciones ---------- */
async function gfetch(method, path, body, fetchImpl = fetch) {
  const token = await accessToken(fetchImpl);
  return fetchImpl(API + path, { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}
async function errText(r) { const j = await r.json().catch(() => ({})); return j.error?.message || ("HTTP " + r.status); }

// Crea o actualiza el evento de la reserva; si está cancelada, lo elimina.
export async function syncReservation(res, room, guest, hotel, fetchImpl = fetch) {
  if (!isConfigured()) return { skipped: true };
  const cal = encodeURIComponent(calendarId()), id = eventId(res.id);
  if (res.status === "cancelada") return deleteReservation(res.id, fetchImpl);
  const ev = buildEvent(res, room, guest, hotel);
  let r = await gfetch("PUT", `/calendars/${cal}/events/${id}`, ev, fetchImpl);
  if (r.status === 404) {
    r = await gfetch("POST", `/calendars/${cal}/events`, { ...ev, id }, fetchImpl);
    if (r.status === 409) r = await gfetch("PUT", `/calendars/${cal}/events/${id}`, ev, fetchImpl); // existía como borrado
  }
  if (!r.ok) throw new Error("Google Calendar: " + (await errText(r)));
  return { ok: true, action: "upsert", eventId: id };
}
export async function deleteReservation(resId, fetchImpl = fetch) {
  if (!isConfigured()) return { skipped: true };
  const r = await gfetch("DELETE", `/calendars/${encodeURIComponent(calendarId())}/events/${eventId(resId)}`, null, fetchImpl);
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error("Google Calendar: " + (await errText(r)));
  return { ok: true, action: "delete" };
}

/* ---------- feed iCal (RFC 5545) ---------- */
const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) { // líneas de máx. 75 octetos
  const out = []; let cur = "";
  for (const ch of line) { if (Buffer.byteLength(cur + ch) > 75) { out.push(cur); cur = " " + ch; } else cur += ch; }
  out.push(cur); return out.join("\r\n");
}
const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const local = (date, time) => date.replace(/-/g, "") + "T" + time.replace(":", "") + "00";
export function buildIcs(reservations, rooms, guests, hotel = {}) {
  const roomBy = Object.fromEntries(rooms.map((r) => [r.id, r])), guestBy = Object.fromEntries(guests.map((g) => [g.id, g]));
  const now = stamp(new Date()), inT = hotel.checkinFrom || "15:00", outT = hotel.checkout || "11:00";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hotel Portal Norte 170//Reservas//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Reservas Portal Norte 170", "X-WR-TIMEZONE:" + TZ, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE", "TZID:" + TZ, "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0500", "TZNAME:-05", "END:STANDARD", "END:VTIMEZONE"];
  for (const res of reservations) {
    if (res.status === "cancelada" || !res.checkIn || !res.checkOut) continue;
    const room = roomBy[res.roomId], guest = guestBy[res.guestId], ev = buildEvent(res, room, guest, hotel);
    L.push("BEGIN:VEVENT", "UID:" + eventId(res.id) + "@portalnorte170", "DTSTAMP:" + now,
      `DTSTART;TZID=${TZ}:` + local(res.checkIn, inT), `DTEND;TZID=${TZ}:` + local(res.checkOut, outT),
      "SUMMARY:" + icsEsc(ev.summary), "DESCRIPTION:" + icsEsc(ev.description),
      ev.location ? "LOCATION:" + icsEsc(ev.location) : null, "STATUS:" + (res.status === "pendiente" ? "TENTATIVE" : "CONFIRMED"),
      "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.filter(Boolean).map(fold).join("\r\n") + "\r\n";
}
