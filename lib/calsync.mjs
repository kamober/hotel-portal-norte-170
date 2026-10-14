// Sincronización inmediata con Google Calendar + cola de reintentos.
// Cada cambio intenta escribir el evento al instante; si Google falla (sin red, cuota, credencial),
// la reserva queda en la cola «gcalq/» y la función programada la reintenta cada 15 minutos.
import * as gcal from "./gcal.mjs";

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Google Calendar no respondió a tiempo.")), ms))]);
const QPFX = "gcalq/";
const MAX_TRIES = 48; // ~12 horas de reintentos cada 15 min

async function listJSON(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
}
async function setLast(store, out) {
  try { await store.setJSON("gcal/last", { at: new Date().toISOString(), ...out }); } catch (_) {}
}

// Sincroniza una reserva (o la borra). Nunca lanza: devuelve {ok}|{skipped}|{ok:false,error,queued}.
export async function syncOne(store, rec, deleted = false, ctx = {}) {
  if (!rec || !rec.id) return { skipped: true };
  if (!gcal.isConfigured()) return { skipped: true };
  try {
    let out;
    if (deleted) out = await timeout(gcal.deleteReservation(rec.id), 8000);
    else {
      const [room, guest, hotel] = await Promise.all([
        ctx.room !== undefined ? ctx.room : rec.roomId ? store.get("rooms/" + rec.roomId, { type: "json" }) : null,
        ctx.guest !== undefined ? ctx.guest : rec.guestId ? store.get("guests/" + rec.guestId, { type: "json" }) : null,
        ctx.hotel !== undefined ? ctx.hotel : store.get("hotel", { type: "json" }),
      ]);
      out = await timeout(gcal.syncReservation(rec, room, guest, hotel || {}), 8000);
    }
    await store.delete(QPFX + rec.id).catch(() => {});
    if (!ctx.quiet) await setLast(store, { ok: true, resId: rec.id, action: out.action });
    return out;
  } catch (e) {
    console.error("gcal", rec.id, e.message);
    const prev = await store.get(QPFX + rec.id, { type: "json" }).catch(() => null);
    await store.setJSON(QPFX + rec.id, { id: rec.id, deleted: !!deleted, tries: (prev?.tries || 0) + 1, error: e.message, at: new Date().toISOString() }).catch(() => {});
    await setLast(store, { ok: false, resId: rec.id, error: e.message });
    return { ok: false, error: e.message, queued: true };
  }
}

// Vuelve a sincronizar las reservas vigentes que cumplan un filtro (p. ej. de un huésped o habitación).
export async function resyncWhere(store, pred, { hotel } = {}) {
  if (!gcal.isConfigured()) return { skipped: true };
  const from = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const all = (await listJSON(store, "res/")).filter((r) => r.checkOut >= from && pred(r));
  const h = hotel !== undefined ? hotel : await store.get("hotel", { type: "json" });
  let ok = 0; const errors = [];
  for (let i = 0; i < all.length; i += 5) {
    const outs = await Promise.all(all.slice(i, i + 5).map((r) => syncOne(store, r, false, { hotel: h, quiet: true })));
    outs.forEach((o, k) => { if (o.ok) ok++; else if (o.error) errors.push(`${all[i + k].id}: ${o.error}`); });
  }
  if (all.length) await setLast(store, errors.length ? { ok: false, error: errors[0] } : { ok: true, count: ok });
  return { total: all.length, ok, failed: errors.length, error: errors[0] };
}

// Reintenta lo que quedó pendiente. Lo llama la función programada y el botón «Reintentar».
export async function processQueue(store) {
  if (!gcal.isConfigured()) return { skipped: true };
  const { blobs } = await store.list({ prefix: QPFX });
  let ok = 0, failed = 0, dropped = 0;
  for (const b of blobs) {
    const q = await store.get(b.key, { type: "json" });
    if (!q) continue;
    if (q.tries >= MAX_TRIES) { await store.delete(b.key); dropped++; continue; }
    const rec = await store.get("res/" + q.id, { type: "json" });
    const out = rec ? await syncOne(store, rec, rec.status === "cancelada", { quiet: true }) : await syncOne(store, { id: q.id }, true, { quiet: true });
    if (out.ok) ok++; else failed++;
  }
  return { pending: blobs.length, ok, failed, dropped };
}

export async function queueInfo(store) {
  const { blobs } = await store.list({ prefix: QPFX });
  const first = blobs[0] ? await store.get(blobs[0].key, { type: "json" }) : null;
  return { count: blobs.length, sample: first };
}

// Prueba real: crea un evento de prueba, lo lee y lo borra. Devuelve el error exacto de Google.
export async function testConnection(fetchImpl = fetch) {
  if (!gcal.isConfigured()) return { ok: false, step: "config", error: "Faltan las variables GOOGLE_* en Netlify." };
  let token;
  try { token = await gcal.accessToken(fetchImpl); } catch (e) {
    const hint = /invalid_grant|expired|revoked/i.test(e.message)
      ? (gcal.authMode() === "oauth" ? "El refresh token venció o fue revocado. Genera uno nuevo en OAuth Playground. Para que no vuelva a vencer, pon la pantalla de consentimiento como «Interna» (Workspace) o «En producción»: en modo «Prueba» Google lo invalida a los 7 días." : "La clave privada de la cuenta de servicio no es válida o fue eliminada: crea una clave JSON nueva.")
      : /invalid_client/i.test(e.message) ? "GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no coinciden con el cliente OAuth." : "";
    return { ok: false, step: "credenciales", error: e.message, hint };
  }
  const cal = encodeURIComponent(gcal.calendarId()), API = "https://www.googleapis.com/calendar/v3";
  const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const day = new Date(Date.now() + 864e5).toISOString().slice(0, 10), next = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const r = await fetchImpl(`${API}/calendars/${cal}/events`, { method: "POST", headers: H, body: JSON.stringify({
    summary: "Prueba · Sistema de reservas Portal Norte 170", description: "Evento de prueba creado y borrado automáticamente.",
    start: { date: day }, end: { date: next }, transparency: "transparent" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || "HTTP " + r.status;
    const hint = r.status === 404 ? `El calendario «${gcal.calendarId()}» no existe o no está compartido con la cuenta conectada.`
      : r.status === 403 ? "La cuenta conectada no tiene permiso para crear eventos en ese calendario (compártelo con permiso «Hacer cambios en eventos») o la API de Calendar no está habilitada en Google Cloud."
      : r.status === 401 ? "La credencial expiró o fue revocada: genera un nuevo GOOGLE_REFRESH_TOKEN." : "";
    return { ok: false, step: "crear evento", error: msg, hint };
  }
  await fetchImpl(`${API}/calendars/${cal}/events/${encodeURIComponent(j.id)}`, { method: "DELETE", headers: H }).catch(() => {});
  return { ok: true, calendarId: gcal.calendarId(), mode: gcal.authMode() };
}
