// Importación de calendarios iCal de Booking.com, Airbnb y otros canales.
// Cada habitación puede tener uno o varios enlaces (room.icalFeeds = [{id, channel, url}]).
// Cada evento del canal se convierte en una reserva (source:"ical") que bloquea fechas,
// aparece en el panel y se envía a Google Calendar. Si el evento desaparece del canal,
// la reserva futura se cancela sola. También genera el iCal de salida por habitación
// (sin datos personales) para pegarlo en Booking y Airbnb.
import { createHash } from "node:crypto";
import * as gcal from "./gcal.mjs";
import * as notifier from "./notify.mjs";

export const FEED_CHANNELS = ["booking", "airbnb", "expedia", "hotels", "otro"];
const CH_NAME = { booking: "Booking.com", airbnb: "Airbnb", expedia: "Expedia", hotels: "Hoteles.com", otro: "otro canal" };
const MAX_BYTES = 2_000_000;
const FETCH_MS = 12_000;
const LOCK_MS = 90_000;
const STATUS_KEY = "ical/status";
const LOCK_KEY = "ical/lock";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const active = (r) => r.status !== "cancelada";
const overlaps = (aIn, aOut, bIn, bOut) => aIn < bOut && bIn < aOut;
export const resIdFor = (feedId, uid) => "IC" + createHash("sha256").update(feedId + "|" + uid).digest("hex").slice(0, 16).toUpperCase();

/* ---------- lectura de iCal ---------- */
function unescapeText(s) { return String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim(); }
function toDate(value, params) {
  const v = String(value || "").trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  if (m[7]) { // hora UTC → fecha en Bogotá (UTC-5)
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - 5 * 3600e3;
    return new Date(t).toISOString().slice(0, 10);
  }
  return `${m[1]}-${m[2]}-${m[3]}`; // hora local o con TZID: basta la fecha
}
export function parseIcs(text) {
  const src = String(text || "");
  if (!/BEGIN:VCALENDAR/i.test(src)) throw new Error("El enlace no devolvió un calendario iCal válido.");
  const lines = src.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const events = []; let cur = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(";");
    const key = name.toUpperCase(), value = line.slice(i + 1);
    if (key === "DTSTART" || key === "DTEND") cur[key] = toDate(value, params);
    else if (["UID", "SUMMARY", "DESCRIPTION", "STATUS"].includes(key)) cur[key] = unescapeText(value);
  }
  return events
    .filter((e) => e.DTSTART && (e.STATUS || "").toUpperCase() !== "CANCELLED")
    .map((e) => {
      const checkIn = e.DTSTART;
      let checkOut = e.DTEND && e.DTEND > checkIn ? e.DTEND : addDays(checkIn, 1);
      return { uid: e.UID || `${checkIn}-${checkOut}-${e.SUMMARY || ""}`, checkIn, checkOut, summary: e.SUMMARY || "", description: e.DESCRIPTION || "" };
    });
}

// Interpreta lo que publica cada canal: Booking no envía nombres; Airbnb envía «Reserved» y un código.
export function describeEvent(channel, ev) {
  const s = ev.summary.toLowerCase(), name = CH_NAME[channel] || "canal";
  const blocked = /not available|closed|no disponible|cerrad|blocked|bloque/.test(s);
  const code = (ev.description.match(/details\/([A-Z0-9]{6,})/) || ev.description.match(/\b(HM[A-Z0-9]{6,})\b/) || [])[1] || "";
  const phone4 = (ev.description.match(/Last 4 Digits\)?:\s*(\d{4})/i) || [])[1] || "";
  // Booking marca igual reservas y fechas cerradas («CLOSED - Not available»): se trata como ocupación con huésped por identificar.
  const isBooking = channel === "booking";
  const guestName = isBooking ? `Ocupado en ${name}` : blocked ? `Bloqueado en ${name}` : `Reserva ${name}`;
  const notes = [`Importada automáticamente del calendario de ${name}.`,
    ev.summary ? `Texto del canal: ${ev.summary}` : "", phone4 ? `Teléfono (últimos 4): ${phone4}` : ""].filter(Boolean).join("\n");
  return { blocked: blocked && !isBooking, guestName, externalRef: code, notes };
}

/* ---------- descarga ---------- */
async function download(url, fetchImpl) {
  let u;
  try { u = new URL(String(url).trim().replace(/^webcals?:\/\//i, "https://")); } catch { throw new Error("El enlace no es una URL válida."); }
  if (u.protocol !== "https:") throw new Error("El enlace debe empezar por https://.");
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const r = await fetchImpl(u.toString(), { signal: ctrl.signal, headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "PortalNorte170-Reservas/1.0" }, redirect: "follow" });
    if (!r.ok) throw new Error(`El canal respondió ${r.status}${r.status === 404 ? " (el enlace ya no existe o cambió)" : ""}.`);
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error("El calendario es demasiado grande.");
    return text;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("El canal no respondió a tiempo.");
    throw e;
  } finally { clearTimeout(t); }
}

/* ---------- bloqueo para que no corran dos sincronizaciones a la vez ---------- */
async function acquire(store) {
  const { modified } = await store.setJSON(LOCK_KEY, { at: Date.now() }, { onlyIfNew: true });
  if (modified) return true;
  const cur = await store.get(LOCK_KEY, { type: "json" });
  if (cur && Date.now() - cur.at < LOCK_MS) return false;
  await store.setJSON(LOCK_KEY, { at: Date.now() });
  return true;
}

/* ---------- sincronización ---------- */
async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export async function syncAll(store, { fetchImpl = fetch, reason = "auto" } = {}) {
  if (!(await acquire(store))) return { skipped: true, message: "Ya hay una sincronización en curso. Intenta en un minuto." };
  try {
    const t0 = today(), from = addDays(t0, -1);
    const [rooms, all, guests, hotel, prev] = await Promise.all([listJSON(store, "rooms/"), listJSON(store, "res/"), listJSON(store, "guests/"), store.get("hotel", { type: "json" }), store.get(STATUS_KEY, { type: "json" })]);
    const byId = new Map(all.map((r) => [r.id, r]));
    const feeds = rooms.flatMap((room) => (Array.isArray(room.icalFeeds) ? room.icalFeeds : []).filter((f) => f && f.id && f.url).map((f) => ({ ...f, room })));
    const status = { at: new Date().toISOString(), reason, feeds: {}, conflicts: [], totals: { added: 0, updated: 0, cancelled: 0 } };
    const changed = []; // reservas que hay que llevar a Google Calendar

    const downloads = await pool(feeds, 6, async (f) => {
      try { return { f, events: parseIcs(await download(f.url, fetchImpl)) }; }
      catch (e) { return { f, error: e.message || String(e) }; }
    });

    for (const { f, events, error } of downloads) {
      const st = { roomId: f.room.id, channel: f.channel, at: status.at, ok: !error, error: error || undefined, events: 0, added: 0, updated: 0, cancelled: 0 };
      status.feeds[f.id] = st;
      if (error) continue; // si el canal falla, no se toca nada de lo ya importado
      const upcoming = events.filter((e) => e.checkOut > from);
      st.events = upcoming.length;
      const seen = new Set();
      for (const ev of upcoming) {
        const id = resIdFor(f.id, ev.uid); seen.add(id);
        const d = describeEvent(f.channel, ev), cur = byId.get(id);
        if (!cur) {
          const rec = { id, roomId: f.room.id, checkIn: ev.checkIn, checkOut: ev.checkOut, adults: 1, children: 0, status: "confirmada",
            channel: f.channel, externalRef: d.externalRef, guestName: d.guestName, notes: d.notes, block: d.blocked,
            source: "ical", feedId: f.id, icalUid: ev.uid, icalSummary: ev.summary, paid: 0,
            createdAt: status.at, updatedAt: status.at, importedAt: status.at };
          byId.set(id, rec); changed.push(rec); st.added++;
          continue;
        }
        const patch = {};
        if (cur.checkIn !== ev.checkIn) patch.checkIn = ev.checkIn;
        if (cur.checkOut !== ev.checkOut) patch.checkOut = ev.checkOut;
        if (cur.roomId !== f.room.id) patch.roomId = f.room.id;
        if ((cur.icalSummary || "") !== ev.summary) { patch.icalSummary = ev.summary; patch.block = d.blocked; if (!cur.guestId) patch.guestName = d.guestName; }
        if (d.externalRef && !cur.externalRef) patch.externalRef = d.externalRef;
        if (cur.status === "cancelada" && cur.autoCancelled) { patch.status = "confirmada"; patch.autoCancelled = false; } // volvió a aparecer
        if (Object.keys(patch).length) {
          const rec = { ...cur, ...patch, updatedAt: status.at };
          byId.set(id, rec); changed.push(rec); st.updated++;
        }
      }
      // Lo que ya no está en el canal: se cancela si aún no ha ocurrido (canceló el huésped o se liberó la fecha).
      for (const r of byId.values()) {
        if (r.source !== "ical" || r.feedId !== f.id || seen.has(r.id)) continue;
        if (!["pendiente", "confirmada"].includes(r.status) || r.checkIn < t0) continue;
        const rec = { ...r, status: "cancelada", autoCancelled: true, updatedAt: status.at,
          notes: (r.notes ? r.notes + "\n" : "") + `Cancelada automáticamente el ${t0}: ya no aparece en el calendario de ${CH_NAME[f.channel] || "el canal"}.` };
        byId.set(r.id, rec); changed.push(rec); st.cancelled++;
      }
      status.totals.added += st.added; status.totals.updated += st.updated; status.totals.cancelled += st.cancelled;
    }

    // Cruces (posible sobreventa): reservas activas futuras que se pisan en la misma habitación.
    const act = [...byId.values()].filter((r) => active(r) && r.checkOut > t0);
    const flagged = new Map();
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      if (a.roomId === b.roomId && (a.source === "ical" || b.source === "ical") && overlaps(a.checkIn, a.checkOut, b.checkIn, b.checkOut)) {
        status.conflicts.push({ roomId: a.roomId, a: a.id, b: b.id, from: a.checkIn > b.checkIn ? a.checkIn : b.checkIn, to: a.checkOut < b.checkOut ? a.checkOut : b.checkOut });
        for (const [x, y] of [[a, b], [b, a]]) if (x.source === "ical") (flagged.get(x.id) || flagged.set(x.id, new Set()).get(x.id)).add(y.id);
      }
    }
    for (const r of byId.values()) {
      if (r.source !== "ical") continue;
      const want = flagged.has(r.id) ? [...flagged.get(r.id)].sort() : [];
      const had = Array.isArray(r.conflict) ? r.conflict : [];
      if (want.join() !== had.join()) {
        const rec = { ...r, conflict: want.length ? want : undefined };
        byId.set(r.id, rec);
        if (!changed.some((c) => c.id === r.id)) changed.push({ ...rec, _noCal: true }); else Object.assign(changed.find((c) => c.id === r.id), { conflict: rec.conflict });
      }
    }

    // Guardar y llevar a Google Calendar.
    const roomBy = Object.fromEntries(rooms.map((r) => [r.id, r])), guestBy = Object.fromEntries(guests.map((g) => [g.id, g]));
    let calOk = 0; const calErrors = [];
    await pool(changed, 5, async (rec) => {
      const noCal = rec._noCal; delete rec._noCal;
      await store.setJSON("res/" + rec.id, rec);
      if (noCal || !gcal.isConfigured()) return;
      try {
        await Promise.race([gcal.syncReservation(rec, roomBy[rec.roomId], guestBy[rec.guestId], hotel || {}, fetchImpl),
          new Promise((_, rej) => setTimeout(() => rej(new Error("Google Calendar no respondió a tiempo.")), 8000))]);
        calOk++;
      } catch (e) { calErrors.push(e.message); }
    });
    status.gcal = gcal.isConfigured() ? { ok: calOk, failed: calErrors.length, error: calErrors[0] } : { skipped: true };
    status.feedCount = feeds.length;
    status.ok = Object.values(status.feeds).every((f) => f.ok);
    // Aviso por correo solo con novedades: reservas nuevas o canceladas, cruces nuevos, canales que empiezan a fallar.
    try {
      const roomNo = (id) => (roomBy[id] ? roomBy[id].number : id);
      const fmt = (r) => `Hab. ${roomNo(r.roomId)} · ${r.checkIn} → ${r.checkOut} · ${r.guestName || "Reserva"} (${CH_NAME[r.channel] || r.channel})`;
      const added = changed.filter((r) => r.importedAt === status.at), cancelled = changed.filter((r) => r.autoCancelled && r.updatedAt === status.at && r.status === "cancelada");
      const seenConf = new Set(((prev && prev.conflicts) || []).map((c) => c.a + "|" + c.b));
      const newConf = status.conflicts.filter((c) => !seenConf.has(c.a + "|" + c.b));
      const newErr = Object.entries(status.feeds).filter(([id, f]) => !f.ok && !(prev && prev.feeds && prev.feeds[id] && !prev.feeds[id].ok));
      const items = [...added.map((r) => "Nueva: " + fmt(r)), ...cancelled.map((r) => "Cancelada en el canal: " + fmt(r)),
        ...newConf.map((c) => `POSIBLE SOBREVENTA en Hab. ${roomNo(c.roomId)} del ${c.from} al ${c.to} (${c.a} y ${c.b})`),
        ...newErr.map(([, f]) => `No se pudo leer ${CH_NAME[f.channel] || f.channel} de la Hab. ${roomNo(f.roomId)}: ${f.error}`)];
      if (items.length) {
        const base = notifier.baseUrl();
        status.notified = await notifier.notify(store, hotel, {
          subject: newConf.length ? "⚠ Posible sobreventa" : added.length ? `${added.length} reserva(s) nueva(s) de los canales` : "Cambios en Booking/Airbnb",
          title: newConf.length ? "Posible sobreventa" : "Novedades de Booking y Airbnb", tone: newConf.length || newErr.length ? "alert" : "info",
          intro: "La sincronización de calendarios encontró estos cambios:", items,
          button: base ? { url: base + "/admin", label: "Abrir el panel" } : null,
        }, { fetchImpl });
      }
    } catch (e) { console.error("ical notify", e); }
    await store.setJSON(STATUS_KEY, status);
    return status;
  } finally {
    await store.delete(LOCK_KEY).catch(() => {});
  }
}

export const readStatus = (store) => store.get(STATUS_KEY, { type: "json" });

/* ---------- iCal de salida por habitación (para pegar en Booking / Airbnb) ---------- */
// No incluye nombres ni teléfonos. Excluye lo que vino del mismo canal para no devolverle sus propias reservas.
export function buildRoomIcs(room, reservations, forChannel) {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const from = addDays(today(), -1);
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hotel Portal Norte 170//Disponibilidad//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:Portal Norte 170 - Hab. ${String(room.number || room.id).replace(/[,;\\\n]/g, " ")}`];
  for (const r of reservations) {
    if (r.roomId !== room.id || !active(r) || r.checkOut <= from) continue;
    if (forChannel && r.channel === forChannel) continue;
    L.push("BEGIN:VEVENT", `UID:${r.id}@portalnorte170`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${r.checkIn.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${r.checkOut.replace(/-/g, "")}`,
      "SUMMARY:Ocupado - Portal Norte 170", "TRANSP:OPAQUE", "END:VEVENT");
  }
  if (room.status === "mantenimiento") {
    L.push("BEGIN:VEVENT", `UID:mant-${room.id}@portalnorte170`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${today().replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(today(), 1).replace(/-/g, "")}`,
      "SUMMARY:Mantenimiento - Portal Norte 170", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
