// Bot de Telegram del módulo de administración (uso exclusivo del administrador).
//   · Registrar gastos con la foto del recibo (Finanzas).
//   · Reservas: hoy, disponibilidad, crear, consultar, check-in/out, cancelar, abonos y solicitudes del sitio.
//   · Avisos: solicitudes nuevas, mensajes de contacto, comprobantes de pago y novedades de Booking/Airbnb.
// Configuración: TELEGRAM_BOT_TOKEN en Netlify (lo da @BotFather). El webhook y la vinculación se hacen desde
// el panel: Alojamiento → Bot de Telegram. Solo responde a la cuenta de Telegram vinculada.
import { createHmac, randomUUID } from "node:crypto";

const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];
export const token = () => String(env("TELEGRAM_BOT_TOKEN") || "").trim();
export const isConfigured = () => !!token();

const CONFIG_KEY = "tg/config", LINK_KEY = "tg/link", LAST_KEY = "tg/last", UPD_KEY = "tg/upd", SESS = "tg/s/";
const SESSION_TTL = 45 * 60_000;
const MAX_PHOTO = 4 * 1024 * 1024;

/* ---------- API de Telegram ---------- */
export async function call(method, body, fetchImpl = fetch) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const r = await fetchImpl(`https://api.telegram.org/bot${token()}/${method}`, {
      method: "POST", signal: ctrl.signal,
      ...(isForm ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error("Telegram: " + (j.description || "HTTP " + r.status));
    return j.result;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Telegram no respondió a tiempo.");
    throw e;
  } finally { clearTimeout(t); }
}
export const webhookSecret = (secret) => (secret ? createHmac("sha256", secret).update("tg-webhook").digest("hex").slice(0, 48) : "");
// Configuración: { users: [{ userId, chatId, name, username, role, linkedAt }], off }.
// role: «admin» (todo) o «recepcion» (sin cancelar reservas ni verificar/rechazar pagos).
export const ROLES = { admin: "Completo", recepcion: "Recepción" };
export async function getConfig(store) {
  const cfg = (await store.get(CONFIG_KEY, { type: "json" })) || {};
  if (cfg.chatId && !cfg.users) { // formato anterior: una sola cuenta
    cfg.users = [{ userId: cfg.userId, chatId: cfg.chatId, name: cfg.name || "", username: cfg.username || "", role: "admin", linkedAt: cfg.linkedAt }];
    delete cfg.chatId; delete cfg.userId; delete cfg.name; delete cfg.username; delete cfg.linkedAt;
  }
  cfg.users = Array.isArray(cfg.users) ? cfg.users : [];
  return cfg;
}
const MAX_USERS = 5;

/* ---------- utilidades ---------- */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pesos = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const digits = (v) => String(v || "").replace(/\D/g, "");
const waNum = (p) => { const d = digits(p); return d.length === 10 && d.startsWith("3") ? "57" + d : d; };
const genId = (p) => p + "-" + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const overlaps = (aIn, aOut, bIn, bOut) => aIn < bOut && bIn < aOut;
const isActive = (r) => r.status !== "cancelada";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fd = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]}`; };
const nightsTxt = (n) => `${n} noche${n === 1 ? "" : "s"}`;
const STATUS = { pendiente: "🟡 Pendiente", confirmada: "🔵 Confirmada", encasa: "🟢 En casa", finalizada: "⚪ Finalizada", cancelada: "🔴 Cancelada" };
const CH = { directo: "Directo / WhatsApp", booking: "Booking.com", airbnb: "Airbnb", expedia: "Expedia", hotels: "Hoteles.com", web: "Sitio web", otro: "Otro" };
export const PAY_METHODS = ["Efectivo", "Transferencia", "Nequi / Daviplata", "Tarjeta", "Otro"];
export const XCATS = ["Servicios públicos (agua, luz, gas)", "Internet, TV y telefonía", "Arriendo / administración", "Aseo e insumos de limpieza", "Lavandería", "Alimentos y cafetería",
  "Mantenimiento y reparaciones", "Dotación (sábanas, toallas, menaje)", "Nómina y honorarios", "Comisiones de canales (Booking, Airbnb)", "Impuestos, seguros y trámites", "Publicidad y software", "Otros"];
const XSHORT = ["💡 Servicios", "🌐 Internet/TV", "🏠 Arriendo/admón.", "🧽 Aseo", "🧺 Lavandería", "☕ Alimentos", "🔧 Mantenimiento", "🛏 Dotación", "👥 Nómina", "📊 Comisiones", "🧾 Impuestos", "📣 Publicidad/software", "📦 Otros"];
const XKEYS = [
  ["agua", "luz", "gas", "energia", "enel", "codensa", "acueducto", "vanti", "servicios"], ["internet", "claro", "movistar", "etb", "tigo", "wom", "tv", "telefon", "celular", "plan"],
  ["arriendo", "administracion", "canon"], ["aseo", "limpieza", "detergente", "cloro", "jabon", "papel", "desinfect", "escoba", "trapero", "bolsas"], ["lavanderia", "lavado", "planchado"],
  ["alimento", "cafe", "cafeteria", "mercado", "comida", "azucar", "agua botella", "snack"], ["mantenimiento", "reparacion", "arreglo", "plomer", "electric", "pintura", "ferreteria", "bombillo", "cerrajer"],
  ["dotacion", "sabana", "toalla", "menaje", "almohada", "cobija", "colchon", "cortina"], ["nomina", "sueldo", "salario", "honorario", "camarera", "aseadora", "contador"],
  ["comision", "booking", "airbnb", "expedia"], ["impuesto", "predial", "seguro", "tramite", "camara de comercio", "rnt", "dian", "ica"], ["publicidad", "software", "netlify", "dominio", "google ads", "facebook", "instagram", "suscripcion"],
];
export function guessCategory(text) {
  const t = norm(text); if (!t) return -1;
  for (let i = 0; i < XKEYS.length; i++) if (XKEYS[i].some((k) => t.includes(k))) return i;
  return -1;
}

// «hoy», «mañana», «pasado mañana», «15/11», «15-11-2026», «2026-11-15», «15 nov», «15 de noviembre de 2026»
export function parseDate(input, today) {
  const s = norm(input).replace(/\s+/g, " ");
  if (!s) return null;
  if (s === "hoy") return today;
  if (s === "manana") return addDays(today, 1);
  if (s === "pasado manana" || s === "pasado") return addDays(today, 2);
  let y, m, d, m1;
  if ((m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+m1[1], +m1[2], +m1[3]];
  else if ((m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/))) [d, m, y] = [+m1[1], +m1[2], m1[3] ? +m1[3] : null];
  else if ((m1 = s.match(/^(\d{1,2}) (?:de )?([a-z]{3})[a-z]*\.?(?: (?:de )?(\d{4}))?$/))) {
    const k = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 }[m1[2]];
    if (!k) return null; [d, m, y] = [+m1[1], k, m1[3] ? +m1[3] : null];
  } else return null;
  const fixYear = !y; if (y && y < 100) y += 2000; if (!y) y = +today.slice(0, 4);
  const pad = (n) => String(n).padStart(2, "0");
  let iso = `${y}-${pad(m)}-${pad(d)}`;
  const dt = new Date(iso + "T00:00:00Z");
  if (isNaN(dt) || dt.getUTCDate() !== d || dt.getUTCMonth() + 1 !== m) return null;
  if (fixYear && iso < today) iso = `${y + 1}-${pad(m)}-${pad(d)}`;
  return iso;
}

// «45000», «45.000», «$ 45.000», «45k», «45 mil», «1,2 M», «1.200.000»
export function parseMoney(input) {
  const s = norm(input).replace(/\$|cop|pesos/g, "").replace(/\s+/g, " ").trim();
  const m = s.match(/^(\d[\d.,]*)\s*(k|mil|m|mm|millon|millones|mill)?$/);
  if (!m) return null;
  let n;
  if (m[2]) { n = Number(m[1].replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) * (m[2] === "k" || m[2] === "mil" ? 1e3 : 1e6); }
  else n = Number(m[1].replace(/[.,]/g, ""));
  n = Math.round(n);
  return Number.isFinite(n) && n > 0 && n <= 1_000_000_000 ? n : null;
}
// Busca el primer valor dentro de un texto libre (pie de foto): devuelve { amount, rest }.
export function extractMoney(text) {
  const src = String(text || "");
  for (const m of src.matchAll(/\$?\s?\d[\d.,]*\s*(?:k\b|mil\b|millones\b|millon\b|m\b)?/gi)) {
    const amount = parseMoney(m[0]);
    if (!amount || (amount < 100 && !/k|mil|m/i.test(m[0]))) continue; // «3 bombillos» no es el valor
    return { amount, rest: (src.slice(0, m.index) + " " + src.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim() };
  }
  return { amount: null, rest: src.trim() };
}

/* ---------- teclados ---------- */
// rows: [[["Texto","dato"], {text, url}], ...]
const kb = (rows) => ({ inline_keyboard: rows.filter((r) => r && r.length).map((r) => r.map((b) => (Array.isArray(b) ? { text: b[0], callback_data: String(b[1]).slice(0, 64) } : b))) });
const chunk = (arr, n) => arr.reduce((a, x, i) => (i % n ? a[a.length - 1].push(x) : a.push([x]), a), []);
const MENU = kb([[["📅 Hoy", "hoy"], ["🛏 Disponibilidad", "disp"]], [["➕ Nueva reserva", "new"], ["📋 Próximas reservas", "prox"]], [["📨 Solicitudes del sitio", "sol"], ["💸 Registrar gasto", "gasto"]]]);
const CANCEL_ROW = [["✖ Cancelar", "x"]];

/* ---------- avisos al administrador ---------- */
// Nunca lanza. photo = { data: ArrayBuffer, type } (opcional). buttons = filas para kb().
// Se envía a todas las cuentas vinculadas (onlyAdmins: solo a las de rol «admin»; to: a un chat concreto).
export async function alert(store, text, { buttons, photo, kind = "aviso", force = false, onlyAdmins = false, to = null, fetchImpl = fetch } = {}) {
  if (!isConfigured()) return { skipped: true, reason: "sin configurar" };
  let out;
  try {
    const cfg = await getConfig(store);
    const users = to ? [{ chatId: to }] : cfg.users.filter((u) => !onlyAdmins || u.role === "admin");
    if (!users.length) return { skipped: true, reason: "sin vincular" };
    if (cfg.off && !force) return { skipped: true, reason: "off" };
    const markup = buttons ? kb(buttons) : undefined;
    const errors = [];
    for (const u of users) {
      try {
        if (photo && photo.data && typeof FormData !== "undefined") {
          const f = new FormData();
          f.append("chat_id", String(u.chatId)); f.append("parse_mode", "HTML"); f.append("caption", String(text).slice(0, 1000));
          if (markup) f.append("reply_markup", JSON.stringify(markup));
          f.append("photo", new Blob([photo.data], { type: photo.type || "image/jpeg" }), "foto." + ((photo.type || "").split("/")[1] || "jpg"));
          await call("sendPhoto", f, fetchImpl);
        } else await call("sendMessage", { chat_id: u.chatId, text: String(text).slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: markup }, fetchImpl);
      } catch (e) { errors.push((u.name ? u.name + ": " : "") + e.message); }
    }
    out = errors.length ? { ok: false, error: errors.join(" · "), sent: users.length - errors.length } : { ok: true, sent: users.length };
  } catch (e) { console.error("telegram", e.message); out = { ok: false, error: e.message }; }
  try { await store.setJSON(LAST_KEY, { at: new Date().toISOString(), kind, ...out }); } catch {}
  return out;
}

// Textos de aviso que arma api.mjs.
export function requestAlert(item, room, { base, afterHours, hours }) {
  const n = diffDays(item.checkIn, item.checkOut);
  const text = [`🏨 <b>Nueva solicitud de reserva</b> · <code>${esc(item.id)}</code>`, `👤 ${esc(`${item.first} ${item.last || ""}`.trim())}`,
    `📞 ${esc(item.phone)}${item.email ? " · " + esc(item.email) : ""}`, `🛏 Hab. ${esc(room.number)} · ${esc(room.name || room.type || "")}`,
    `📅 ${fd(item.checkIn)} → ${fd(item.checkOut)} (${nightsTxt(n)})`, `👥 ${item.adults} adulto(s)${item.children ? `, ${item.children} niño(s)` : ""} · ≈ ${pesos(item.estimate)}`,
    item.notes ? `📝 ${esc(item.notes)}` : null, afterHours ? `⏰ Llegó fuera del horario de atención (${esc(hours)}).` : null].filter(Boolean).join("\n");
  return { text, buttons: [[["✅ Crear reserva", "sa:" + item.id], ["❌ Rechazar", "sr:" + item.id]], [{ text: "💬 WhatsApp del huésped", url: "https://wa.me/" + waNum(item.phone) }], base ? [{ text: "Abrir el panel", url: base + "/admin" }] : null] };
}
export function contactAlert(item, { afterHours, hours }) {
  const text = [`💬 <b>Mensaje de contacto</b> · <code>${esc(item.id)}</code>`, `👤 ${esc(item.name)}`, `📞 ${esc(item.phone)}${item.email ? " · " + esc(item.email) : ""}`,
    item.topic ? `🏷 ${esc(item.topic)}` : null, `📝 ${esc(item.message)}`, afterHours ? `⏰ Fuera del horario de atención (${esc(hours)}).` : null].filter(Boolean).join("\n");
  return { text, buttons: [[{ text: "💬 Responder por WhatsApp", url: "https://wa.me/" + waNum(item.phone) }]] };
}
export function paymentAlert(r, p, name, room) {
  const text = [`💳 <b>Comprobante de pago</b> · <code>${esc(r.id)}</code>`, `👤 ${esc(name)} · Hab. ${esc(room ? room.number : r.roomId)}`,
    `💵 ${pesos(p.amount)} · ${esc(p.method)}${p.ref ? " · ref. " + esc(p.ref) : ""}`, `📅 Pago del ${fd(p.date)}`, p.note ? `📝 ${esc(p.note)}` : null, "", "¿Lo verificas?"].filter((x) => x !== null).join("\n");
  return { text, buttons: [[["✅ Verificar", `pv:${r.id}:${p.id}`], ["❌ Rechazar", `pr:${r.id}:${p.id}`]]] };
}

/* ---------- sesiones (conversación paso a paso) ---------- */
async function getSession(store, chatId) {
  const s = await store.get(SESS + chatId, { type: "json" });
  return s && Date.now() - Date.parse(s.at) < SESSION_TTL ? s : null;
}
const setSession = (store, chatId, s) => store.setJSON(SESS + chatId, { ...s, at: new Date().toISOString() });
async function clearSession(c, { keepPhoto = false } = {}) {
  const s = await getSession(c.store, c.chatId);
  if (s && !keepPhoto && s.d && s.d.photoId) await c.deps.idPhotos().delete(s.d.photoId).catch(() => {});
  await c.store.delete(SESS + c.chatId).catch(() => {});
}

/* ---------- panel: estado, conexión del webhook y cuentas vinculadas ---------- */
const newLink = async (store, role) => {
  const code = randomUUID().replace(/-/g, "").slice(0, 20), exp = Date.now() + 30 * 60_000;
  await store.setJSON(LINK_KEY, { code, exp, role: ROLES[role] ? role : "admin" });
  return { code, exp };
};
export async function adminRoute(req, action, store, { secret, origin, arg }) {
  const m = req.method, cfg = await getConfig(store);
  const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const userView = (u) => ({ userId: String(u.userId), name: u.name || "", username: u.username || "", role: u.role, roleName: ROLES[u.role] || u.role, at: u.linkedAt });
  if (action === "status" && m === "GET") {
    if (!isConfigured()) return ok({ configured: false, users: cfg.users.map(userView), last: await store.get(LAST_KEY, { type: "json" }) });
    let bot = null, webhook = null, error;
    try {
      const [me, wh] = await Promise.all([call("getMe"), call("getWebhookInfo")]);
      bot = { username: me.username, name: me.first_name };
      webhook = { url: wh.url || "", ours: wh.url === origin + "/api/telegram/webhook", pending: wh.pending_update_count || 0, lastError: wh.last_error_message || "", lastErrorAt: wh.last_error_date ? new Date(wh.last_error_date * 1000).toISOString() : "" };
    } catch (e) { error = e.message; }
    const link = await store.get(LINK_KEY, { type: "json" });
    return ok({ configured: true, bot, webhook, error, users: cfg.users.map(userView), roles: ROLES, off: !!cfg.off,
      pendingLink: link && link.exp > Date.now() && bot ? { url: `https://t.me/${bot.username}?start=${link.code}`, exp: new Date(link.exp).toISOString(), role: link.role, roleName: ROLES[link.role] || link.role } : null,
      last: await store.get(LAST_KEY, { type: "json" }) });
  }
  if (!isConfigured()) return ok({ error: "Falta la variable TELEGRAM_BOT_TOKEN en Netlify. Créala con el token de @BotFather y vuelve a desplegar." }, 400);
  if (action === "setup" && m === "POST") {
    if (!secret) return ok({ error: "Falta la variable TOKEN_SECRET en Netlify." }, 500);
    if (!/^https:\/\//.test(origin)) return ok({ error: "Telegram exige https. Conecta el bot desde el sitio publicado en Netlify, no desde localhost." }, 400);
    try {
      const me = await call("getMe");
      await call("setWebhook", { url: origin + "/api/telegram/webhook", secret_token: webhookSecret(secret), allowed_updates: ["message", "callback_query"], drop_pending_updates: true, max_connections: 5 });
      await call("setMyCommands", { commands: [
        { command: "hoy", description: "Llegadas, salidas y ocupación de hoy" }, { command: "disponible", description: "Habitaciones libres (ej. /disponible 15/11 3)" },
        { command: "reservar", description: "Crear una reserva" }, { command: "reservas", description: "Próximas reservas" },
        { command: "solicitudes", description: "Solicitudes del sitio web por atender" }, { command: "gasto", description: "Registrar un gasto (o envía la foto del recibo)" },
        { command: "cancelar", description: "Cancelar lo que estás haciendo" }, { command: "menu", description: "Menú principal" }] });
      let link = null;
      if (!cfg.users.length) { const l = await newLink(store, "admin"); link = { url: `https://t.me/${me.username}?start=${l.code}`, exp: new Date(l.exp).toISOString() }; }
      return ok({ ok: true, bot: { username: me.username }, link });
    } catch (e) { return ok({ error: e.message }, 502); }
  }
  // Nuevo enlace para vincular otra cuenta (vence en 30 min, un solo uso).
  if (action === "link" && m === "POST") {
    if (cfg.users.length >= MAX_USERS) return ok({ error: `Máximo ${MAX_USERS} cuentas. Quita una antes de agregar otra.` }, 409);
    const b = await req.json().catch(() => ({}));
    try {
      const me = await call("getMe"), l = await newLink(store, b.role);
      return ok({ ok: true, link: { url: `https://t.me/${me.username}?start=${l.code}`, exp: new Date(l.exp).toISOString() } });
    } catch (e) { return ok({ error: e.message }, 502); }
  }
  if (action === "test" && m === "POST") {
    const out = await alert(store, "✅ <b>Prueba del bot del Hotel Portal Norte 170</b>\nDesde aquí recibirás las solicitudes de reserva, los mensajes de contacto y las novedades de Booking y Airbnb.\n\nEscribe /menu para ver lo que puedes hacer.", { force: true, kind: "prueba", buttons: MENU.inline_keyboard });
    return out.ok ? ok(out) : ok({ error: out.error || (out.reason === "sin vincular" ? "Primero vincula una cuenta de Telegram." : "No se pudo enviar.") }, 502);
  }
  if (action === "settings" && m === "PUT") {
    const b = await req.json().catch(() => ({}));
    await store.setJSON(CONFIG_KEY, { ...cfg, off: b.off === true });
    return ok({ ok: true, off: b.off === true });
  }
  // Cambiar el rol de una cuenta.
  if (action === "users" && m === "PATCH" && arg) {
    const b = await req.json().catch(() => ({}));
    if (!ROLES[b.role]) return ok({ error: "Rol no válido." }, 400);
    const users = cfg.users.map((u) => (String(u.userId) === String(arg) ? { ...u, role: b.role } : u));
    if (!users.some((u) => u.role === "admin")) return ok({ error: "Debe quedar al menos una cuenta con acceso completo." }, 409);
    await store.setJSON(CONFIG_KEY, { ...cfg, users });
    return ok({ ok: true });
  }
  // Quitar una cuenta (arg = userId) o cancelar el enlace pendiente (sin arg).
  if ((action === "users" || action === "link") && m === "DELETE") {
    if (!arg) { await store.delete(LINK_KEY).catch(() => {}); return ok({ ok: true }); }
    const u = cfg.users.find((x) => String(x.userId) === String(arg));
    if (!u) return ok({ error: "Esa cuenta no está vinculada." }, 404);
    await alert(store, "🔌 Esta cuenta se desvinculó del bot del hotel desde el panel.", { force: true, kind: "desvinculado", to: u.chatId });
    await store.setJSON(CONFIG_KEY, { ...cfg, users: cfg.users.filter((x) => x !== u) });
    await store.delete(SESS + u.chatId).catch(() => {});
    return ok({ ok: true });
  }
  return ok({ error: "Ruta no encontrada." }, 404);
}

/* ---------- webhook ---------- */
// ctx = { store, req, deps: { listJSON, todayBogota, syncToCalendar, notifyResChange, addPayment, changePayment, idPhotos, ensureSeed, guestUrl } }
export async function handleUpdate(update, ctx) {
  const { store } = ctx;
  if (!update || typeof update.update_id !== "number") return;
  const last = await store.get(UPD_KEY, { type: "json" });
  if (last && update.update_id <= last.id) return; // Telegram reintenta si tardamos: no procesar dos veces
  await store.setJSON(UPD_KEY, { id: update.update_id });

  const msg = update.message, cb = update.callback_query;
  const chat = msg ? msg.chat : cb && cb.message ? cb.message.chat : null, from = msg ? msg.from : cb ? cb.from : null;
  if (!chat || !from || chat.type !== "private") return;
  const c = { ...ctx, chatId: chat.id, cb, msg, today: ctx.deps.todayBogota(), admin: false, who: "" };
  c.say = (text, markup) => call("sendMessage", { chat_id: chat.id, text: String(text).slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: markup });

  const cfg = await getConfig(store);
  const user = cfg.users.find((u) => String(u.userId) === String(from.id));
  if (!user) {
    const text = msg && typeof msg.text === "string" ? msg.text.trim() : "";
    const mm = text.match(/^\/(?:start|vincular)\s+([A-Za-z0-9_-]{8,64})$/);
    if (mm) {
      const link = await store.get(LINK_KEY, { type: "json" });
      if (link && link.exp > Date.now() && link.code === mm[1] && cfg.users.length < MAX_USERS) {
        const role = ROLES[link.role] ? link.role : "admin";
        await store.setJSON(CONFIG_KEY, { ...cfg, users: [...cfg.users, { userId: from.id, chatId: chat.id, name: [from.first_name, from.last_name].filter(Boolean).join(" "), username: from.username || "", role, linkedAt: new Date().toISOString() }] });
        await store.delete(LINK_KEY);
        return c.say(`✅ Listo, ${esc(from.first_name || "")}. Este chat quedó vinculado al panel del <b>Hotel Portal Norte 170</b> (acceso: ${ROLES[role]}).\n\nAquí te llegarán las solicitudes y las novedades de Booking y Airbnb. Para registrar un gasto, envíame la foto del recibo.`, MENU);
      }
      return c.say("Ese enlace venció, ya se usó o no es válido. Pide uno nuevo en el panel: Alojamiento → Bot de Telegram → Agregar cuenta.");
    }
    if (cb) return call("answerCallbackQuery", { callback_query_id: cb.id, text: "Este bot es privado." }).catch(() => {});
    return c.say("Este bot es privado del Hotel Portal Norte 170.");
  }

  c.admin = user.role === "admin"; c.who = user.name || "";
  if (String(user.chatId) !== String(chat.id)) { user.chatId = chat.id; await store.setJSON(CONFIG_KEY, cfg); }
  try {
    if (cb) return await onCallback(c, cb);
    if (msg.photo || (msg.document && /^image\/(jpeg|png|webp)$/.test(msg.document.mime_type || ""))) return await onPhoto(c, msg);
    if (typeof msg.text === "string") return await onText(c, msg.text.trim());
    return c.say("Por ahora entiendo textos, comandos y fotos de recibos. Escribe /menu.");
  } catch (e) {
    console.error("telegram update", e);
    if (cb) await call("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
    return c.say("⚠️ " + esc(e.status ? e.message : "Algo falló: " + (e.message || "error interno")) + "\nPuedes intentarlo de nuevo o hacerlo desde el panel.");
  }
}

/* ---------- textos y comandos ---------- */
async function onText(c, text) {
  const cmd = text.match(/^\/([a-z_]+)(?:@\w+)?\s*(.*)$/i);
  if (cmd) {
    const [, name, arg] = [cmd[0], norm(cmd[1]), cmd[2].trim()];
    if (["start", "menu", "ayuda", "help"].includes(name)) { await clearSession(c); return showMenu(c); }
    if (name === "cancelar" || name === "salir") { await clearSession(c); return c.say("Listo, cancelado.", MENU); }
    if (name === "hoy") return showToday(c);
    if (name === "reservas" || name === "proximas") return showUpcoming(c);
    if (name === "solicitudes") return showRequests(c);
    if (name === "disponible" || name === "disponibilidad") return startDates(c, "disp", arg);
    if (name === "reservar" || name === "nueva") return startDates(c, "res", arg);
    if (name === "gasto") { await clearSession(c); return startExpense(c, null, arg); }
    if (name === "reserva" && arg) return showReservation(c, arg.toUpperCase());
    return c.say("No conozco ese comando.", MENU);
  }
  const s = await getSession(c.store, c.chatId);
  if (!s) return c.say("¿Qué quieres hacer? Para registrar un gasto, envíame la foto del recibo.", MENU);
  return onStep(c, s, text);
}
const showMenu = (c) => c.say("🏨 <b>Hotel Portal Norte 170</b> · panel de administración\n\nElige una opción, o envíame la <b>foto de un recibo</b> para registrar un gasto (puedes escribir en el pie de foto «45000 aseo detergente»).", MENU);

/* ---------- fechas (disponibilidad y nueva reserva) ---------- */
async function startDates(c, flow, arg) {
  await clearSession(c);
  let parts = String(arg || "").split(/\s+(?=\d{1,2}\s*$)|\s+(?:al|a|hasta|-)\s+/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 1 && !parseDate(parts[0], c.today) && /\s/.test(parts[0])) parts = parts[0].split(/\s+/); // «2026-11-15 2026-11-18»
  const checkIn = parts[0] ? parseDate(parts[0], c.today) : null;
  if (checkIn && checkIn >= c.today) {
    const out = parts[1] ? (/^\d{1,2}$/.test(parts[1]) ? addDays(checkIn, +parts[1]) : parseDate(parts[1], c.today)) : null;
    if (out && out > checkIn && diffDays(checkIn, out) <= 30) return afterDates(c, { flow, d: { in: checkIn, out } });
    await setSession(c.store, c.chatId, { flow, step: "nights", d: { in: checkIn } });
    return askNights(c, checkIn);
  }
  await setSession(c.store, c.chatId, { flow, step: "in", d: {} });
  return c.say(`📅 ¿Qué día llega el huésped?\nEscribe la fecha (ej. <i>15/11</i>, <i>15 nov</i>) o elige:`,
    kb([[["Hoy", "di:" + c.today], ["Mañana", "di:" + addDays(c.today, 1)], ["Pasado mañana", "di:" + addDays(c.today, 2)]], CANCEL_ROW]));
}
const askNights = (c, checkIn) => c.say(`Llegada: <b>${fd(checkIn)}</b>.\n¿Cuántas noches? (o escribe la fecha de salida)`,
  kb([[["1", "dn:1"], ["2", "dn:2"], ["3", "dn:3"], ["4", "dn:4"]], [["5", "dn:5"], ["7", "dn:7"], ["14", "dn:14"], ["30", "dn:30"]], CANCEL_ROW]));

async function freeRooms(c, checkIn, checkOut, people = 1) {
  await c.deps.ensureSeed(c.store);
  const [rooms, res] = await Promise.all([c.deps.listJSON(c.store, "rooms/"), c.deps.listJSON(c.store, "res/")]);
  rooms.sort((a, b) => String(a.number).localeCompare(String(b.number), "es", { numeric: true }));
  return rooms.filter((r) => r.status !== "mantenimiento" && (Number(r.capacity) || 1) >= people &&
    !res.some((x) => x.roomId === r.id && isActive(x) && overlaps(checkIn, checkOut, x.checkIn, x.checkOut)));
}
async function afterDates(c, s) {
  const { in: checkIn, out } = s.d, n = diffDays(checkIn, out);
  const free = await freeRooms(c, checkIn, out);
  const head = `🛏 <b>${fd(checkIn)} → ${fd(out)}</b> (${nightsTxt(n)})`;
  if (!free.length) {
    await clearSession(c);
    return c.say(`${head}\n\nNo hay habitaciones libres en esas fechas. 😕`, kb([[["Probar otras fechas", s.flow === "res" ? "new" : "disp"]], [["Menú", "menu"]]]));
  }
  await setSession(c.store, c.chatId, { flow: "res", step: "room", d: { in: checkIn, out } });
  const list = free.map((r) => `• <b>${esc(r.number)}</b> ${esc(r.name || r.type || "")} · ${r.capacity || 1} pers. · ${pesos(r.rate)}/noche`).join("\n");
  const say = s.flow === "disp"
    ? `${head}\n\n✅ <b>${free.length}</b> habitaci${free.length === 1 ? "ón" : "ones"} libre${free.length === 1 ? "" : "s"}, desde ${pesos(Math.min(...free.map((r) => Number(r.rate) || 0)))} la noche:\n${list}\n\nToca una para reservarla:`
    : `${head}\n\nElige la habitación:\n${list}`;
  return c.say(say, kb([...chunk(free.map((r) => [`${r.number} · ${pesos(r.rate)}`, "rm:" + r.id]), 2), CANCEL_ROW]));
}

/* ---------- pasos de texto ---------- */
async function onStep(c, s, text) {
  const d = s.d || {};
  const save = (step, patch = {}) => setSession(c.store, c.chatId, { ...s, step, d: { ...d, ...patch } });
  switch (s.step) {
    case "in": {
      const v = parseDate(text, c.today);
      if (!v) return c.say("No entendí la fecha. Escríbela como <i>15/11</i>, <i>15 nov</i> o <i>mañana</i>.");
      if (v < c.today) return c.say("La llegada debe ser desde hoy.");
      await save("nights", { in: v }); return askNights(c, v);
    }
    case "nights": {
      let out = /^\d{1,2}$/.test(text) ? addDays(d.in, +text) : parseDate(text, c.today);
      if (!out || out <= d.in || diffDays(d.in, out) > 30) return c.say("Escribe de 1 a 30 noches, o la fecha de salida.");
      return afterDates(c, { flow: s.flow, d: { in: d.in, out } });
    }
    case "name": {
      if (text.length < 2 || text.startsWith("/")) return c.say("Escribe el nombre del huésped.");
      await save("phone", { name: text.slice(0, 120) });
      return c.say(`📞 Teléfono de <b>${esc(text)}</b>:`, kb([[["Sin teléfono", "skip"]], CANCEL_ROW]));
    }
    case "phone": {
      if (digits(text).length < 7) return c.say("Escribe un teléfono válido, o toca «Sin teléfono».", kb([[["Sin teléfono", "skip"]]]));
      await save("ppl", { phone: text.slice(0, 30) }); return askPeople(c, { ...d, phone: text });
    }
    case "ppl": {
      const room = await c.store.get("rooms/" + d.roomId, { type: "json" }), max = Number(room?.capacity) || 1, n = +text;
      if (!Number.isInteger(n) || n < 1 || n > max) return c.say(`Escribe un número de 1 a ${max}.`);
      await save("total", { adults: n }); return askTotal(c, { ...d, adults: n });
    }
    case "total": {
      const v = parseMoney(text); if (!v) return c.say("Escribe el valor total, por ejemplo <i>180000</i> o <i>180 mil</i>.");
      await save("paid", { total: v }); return askPaid(c, { ...d, total: v });
    }
    case "paid": {
      const v = /^0+$/.test(text) ? 0 : parseMoney(text);
      if (v == null) return c.say("Escribe el valor abonado, o toca «Sin abono».");
      if (v > d.total) return c.say(`El abono no puede ser mayor que el total (${pesos(d.total)}).`);
      if (!v) { await save("confirm", { paid: 0 }); return confirmReservation(c, { ...d, paid: 0 }); }
      await save("paymethod", { paid: v }); return askMethod(c, "pm");
    }
    case "ab_amount": {
      const v = parseMoney(text); if (!v) return c.say("Escribe el valor del abono, por ejemplo <i>50000</i>.");
      await save("ab_method", { amount: v }); return askMethod(c, "am");
    }
    case "x_amount": {
      const v = parseMoney(text); if (!v) return c.say("Escribe el valor del gasto, por ejemplo <i>45000</i> o <i>45 mil</i>.");
      return nextExpenseStep(c, { ...s, d: { ...d, amount: v } });
    }
    case "x_concept": {
      if (text.length < 2) return c.say("Escribe en pocas palabras qué se compró o pagó.");
      return nextExpenseStep(c, { ...s, d: { ...d, concept: text.slice(0, 160) } });
    }
    case "x_provider": {
      return nextExpenseStep(c, { ...s, d: { ...d, provider: text.slice(0, 120), providerAsked: true } });
    }
    case "x_date": {
      const v = parseDate(text, c.today) || (norm(text) === "ayer" ? addDays(c.today, -1) : null);
      const fixed = v && v > c.today ? v.replace(/^\d{4}/, String(+v.slice(0, 4) - 1)) : v; // «15/11» de este año aunque ya pasó
      if (!fixed || fixed > c.today) return c.say("Escribe la fecha del gasto (ej. <i>ayer</i>, <i>3/11</i>).");
      return nextExpenseStep(c, { ...s, step: "x_confirm", d: { ...d, date: fixed } });
    }
    case "x_cat_other": {
      return nextExpenseStep(c, { ...s, d: { ...d, category: text.slice(0, 60) } });
    }
    default:
      return c.say("Usa los botones del mensaje anterior, o escribe /cancelar.");
  }
}

/* ---------- nueva reserva ---------- */
async function askPeople(c, d) {
  const room = await c.store.get("rooms/" + d.roomId, { type: "json" }), max = Math.max(1, Number(room?.capacity) || 1);
  if (max === 1) { await setSession(c.store, c.chatId, { flow: "res", step: "total", d: { ...d, adults: 1 } }); return askTotal(c, { ...d, adults: 1 }); }
  return c.say("👥 ¿Cuántas personas?", kb([Array.from({ length: Math.min(max, 6) }, (_, i) => [String(i + 1), "pp:" + (i + 1)]), CANCEL_ROW]));
}
async function askTotal(c, d) {
  const room = await c.store.get("rooms/" + d.roomId, { type: "json" }), n = diffDays(d.in, d.out), sug = (Number(room?.rate) || 0) * n;
  return c.say(`💵 Valor total de la estadía (${nightsTxt(n)} × ${pesos(room?.rate)}).\nEscribe otro valor o confirma:`, kb([sug ? [[`${pesos(sug)}`, "tt:" + sug]] : null, CANCEL_ROW].filter(Boolean)));
}
const askPaid = (c, d) => c.say(`¿Cuánto abonó? (total ${pesos(d.total)})`, kb([[["Sin abono", "pd:0"], [`Todo · ${pesos(d.total)}`, "pd:" + d.total]], CANCEL_ROW]));
const askMethod = (c, prefix) => c.say("¿Cómo pagó?", kb([...chunk(PAY_METHODS.map((m, i) => [m, `${prefix}:${i}`]), 2), CANCEL_ROW]));

async function confirmReservation(c, d) {
  const room = await c.store.get("rooms/" + d.roomId, { type: "json" }), n = diffDays(d.in, d.out);
  return c.say([`📝 <b>Confirma la reserva</b>`, `🛏 Hab. ${esc(room?.number)} · ${esc(room?.name || room?.type || "")}`, `📅 ${fd(d.in)} → ${fd(d.out)} (${nightsTxt(n)})`,
    `👤 ${esc(d.name)}${d.phone ? " · " + esc(d.phone) : ""} · ${d.adults || 1} pers.`, `💵 Total ${pesos(d.total)} · abono ${pesos(d.paid)}${d.paid ? ` (${esc(d.payMethod || "")})` : ""} · saldo ${pesos(d.total - d.paid)}`,
    `Canal: Directo / WhatsApp · Estado: Confirmada`].join("\n"), kb([[["✅ Crear reserva", "ok"], ["✖ Cancelar", "x"]]]));
}

async function findOrCreateGuest(c, { first, last = "", phone = "", docType = "", docNumber = "", email = "", nationality = "", consent = false }) {
  const guests = await c.deps.listJSON(c.store, "guests/");
  const p = digits(phone).slice(-10);
  const hit = (docNumber && guests.find((g) => g.docNumber && g.docNumber === docNumber)) || (p.length >= 7 && guests.find((g) => digits(g.phone).slice(-10) === p));
  if (hit) return hit;
  const g = { id: genId("G"), first, last, docType, docNumber, phone, email, nationality, consent, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), note: "Registrado desde Telegram." };
  await c.store.setJSON("guests/" + g.id, g);
  return g;
}
const gName = (g) => `${g.first || ""} ${g.last || ""}`.trim();

async function saveNewReservation(c, rec) {
  const res = await c.deps.listJSON(c.store, "res/");
  const clash = res.filter((r) => r.roomId === rec.roomId && isActive(r) && overlaps(rec.checkIn, rec.checkOut, r.checkIn, r.checkOut));
  if (clash.length) throw Object.assign(new Error(`La habitación ya está ocupada en esas fechas (reserva ${clash.map((x) => x.id).join(", ")}).`), { status: 409 });
  await c.store.setJSON("res/" + rec.id, rec);
  const g = await c.deps.syncToCalendar(c.store, rec);
  await c.deps.notifyResChange(c.store, c.req, null, rec).catch((e) => console.error("aviso", e));
  return g;
}
const calTxt = (g) => (g && g.ok ? "\n📆 Quedó en Google Calendar." : g && g.ok === false ? "\n⚠️ Google Calendar falló; se reintentará solo." : "");

async function createReservation(c, d) {
  const [first, ...rest] = d.name.split(/\s+/);
  const guest = await findOrCreateGuest(c, { first, last: rest.join(" "), phone: d.phone || "" });
  const room = await c.store.get("rooms/" + d.roomId, { type: "json" });
  const now = new Date().toISOString();
  const rec = { id: genId("PN"), roomId: d.roomId, checkIn: d.in, checkOut: d.out, adults: d.adults || 1, children: 0, eta: "", guestId: guest.id, guestName: gName(guest),
    channel: "directo", externalRef: "", status: "confirmada", rate: Number(room?.rate) || 0, total: d.total, paid: d.paid || 0, payMethod: d.paid ? d.payMethod || "" : "",
    notes: `Creada desde Telegram${c.who ? " por " + c.who : ""}.`, createdAt: now, updatedAt: now };
  const g = await saveNewReservation(c, rec);
  await clearSession(c);
  return reservationCreatedMsg(c, rec, room, guest.phone, g);
}
async function reservationCreatedMsg(c, rec, room, phone, g) {
  const link = c.deps.guestUrl(rec.id, c.req);
  const rows = [[["Ver reserva", "rv:" + rec.id], ["Menú", "menu"]]];
  if (phone && digits(phone).length >= 7) {
    const t = `Hola ${rec.guestName.split(" ")[0]}, tu reserva en el Hotel Portal Norte 170 está confirmada: habitación ${room?.number}, del ${fd(rec.checkIn)} al ${fd(rec.checkOut)}. Código ${rec.id}.` + (link ? `\nCompleta tu check-in en línea aquí: ${link}` : "");
    rows.unshift([{ text: "💬 Enviar confirmación por WhatsApp", url: `https://wa.me/${waNum(phone)}?text=${encodeURIComponent(t)}` }]);
  }
  return c.say(`✅ Reserva <code>${esc(rec.id)}</code> creada.\nHab. ${esc(room?.number)} · ${fd(rec.checkIn)} → ${fd(rec.checkOut)} · ${esc(rec.guestName)}${link ? `\n🔗 Check-in en línea: ${esc(link)}` : ""}${calTxt(g)}`, kb(rows));
}

/* ---------- consultas ---------- */
async function loadAll(c) {
  await c.deps.ensureSeed(c.store);
  const [rooms, res, guests] = await Promise.all([c.deps.listJSON(c.store, "rooms/"), c.deps.listJSON(c.store, "res/"), c.deps.listJSON(c.store, "guests/")]);
  const roomBy = Object.fromEntries(rooms.map((r) => [r.id, r])), guestBy = Object.fromEntries(guests.map((g) => [g.id, g]));
  const who = (r) => (r.guestId && guestBy[r.guestId] ? gName(guestBy[r.guestId]) : r.guestName) || (r.block ? "Fecha cerrada" : "Sin nombre");
  return { rooms, res, roomBy, guestBy, who, num: (r) => (roomBy[r.roomId] ? roomBy[r.roomId].number : "?") };
}
const bal = (r) => (Number(r.total) || 0) - (Number(r.paid) || 0);

async function showToday(c) {
  const A = await loadAll(c), t = c.today;
  const act = A.res.filter(isActive).sort((a, b) => String(A.num(a)).localeCompare(String(A.num(b)), "es", { numeric: true }));
  const arr = act.filter((r) => r.checkIn === t && r.status !== "finalizada"), dep = act.filter((r) => r.checkOut === t && r.status !== "finalizada");
  const inHouse = act.filter((r) => r.checkIn < t && r.checkOut > t || r.status === "encasa" && r.checkOut >= t).filter((r) => !dep.includes(r) && !arr.includes(r));
  const busy = new Set(act.filter((r) => r.checkIn <= t && r.checkOut > t).map((r) => r.roomId));
  const free = A.rooms.filter((r) => r.status !== "mantenimiento" && !busy.has(r.id)).sort((a, b) => String(a.number).localeCompare(String(b.number), "es", { numeric: true }));
  const line = (r, extra = "") => `• Hab. <b>${esc(A.num(r))}</b> · ${esc(A.who(r))}${extra}${bal(r) > 0 ? ` · saldo ${pesos(bal(r))}` : ""}`;
  const [reqs, pays] = await Promise.all([c.deps.listJSON(c.store, "req/"), Promise.resolve(A.res.flatMap((r) => (r.payments || []).filter((p) => p.status === "por verificar")))]);
  const newReqs = reqs.filter((x) => x.status === "nueva").length;
  const txt = [`📅 <b>Hoy, ${fd(t)}</b>`, "",
    `🛬 <b>Llegan (${arr.length})</b>`, ...(arr.length ? arr.map((r) => line(r, ` · ${nightsTxt(diffDays(r.checkIn, r.checkOut))}${r.status === "encasa" ? " ✔︎ ya entró" : r.eta ? " · llega " + esc(r.eta) : ""}`)) : ["—"]), "",
    `🛫 <b>Salen (${dep.length})</b>`, ...(dep.length ? dep.map((r) => line(r)) : ["—"]), "",
    `🏠 <b>En casa (${inHouse.length})</b>`, ...(inHouse.length ? inHouse.map((r) => line(r, ` · sale ${fd(r.checkOut)}`)) : ["—"]), "",
    `🟩 <b>Libres esta noche (${free.length}/${A.rooms.length})</b>: ${free.map((r) => esc(r.number)).join(", ") || "ninguna"}`,
    newReqs || pays.length ? "" : null, newReqs ? `📨 ${newReqs} solicitud(es) del sitio por atender` : null, pays.length ? `💳 ${pays.length} comprobante(s) por verificar` : null].filter((x) => x !== null).join("\n");
  const btns = [...arr, ...dep].slice(0, 8).map((r) => [`${r.checkIn === t ? "🛬" : "🛫"} ${A.num(r)} · ${A.who(r).slice(0, 18)}`, "rv:" + r.id]);
  return c.say(txt, kb([...chunk(btns, 2), newReqs ? [["📨 Ver solicitudes", "sol"]] : null, [["📋 Próximas", "prox"], ["Menú", "menu"]]]));
}

async function showUpcoming(c) {
  const A = await loadAll(c);
  const list = A.res.filter((r) => isActive(r) && r.checkOut >= c.today && r.status !== "finalizada").sort((a, b) => a.checkIn.localeCompare(b.checkIn)).slice(0, 15);
  if (!list.length) return c.say("No hay reservas próximas.", kb([[["➕ Nueva reserva", "new"], ["Menú", "menu"]]]));
  const txt = ["📋 <b>Próximas reservas</b>", ...list.map((r) => `• ${fd(r.checkIn)} → ${fd(r.checkOut)} · Hab. <b>${esc(A.num(r))}</b> · ${esc(A.who(r))} · ${esc(CH[r.channel] || r.channel || "")}${r.status === "encasa" ? " · 🟢 en casa" : r.status === "pendiente" ? " · 🟡 pendiente" : ""}`)].join("\n");
  return c.say(txt, kb([...chunk(list.map((r) => [`${A.num(r)} · ${fd(r.checkIn)} · ${A.who(r).slice(0, 14)}`, "rv:" + r.id]), 2), [["Menú", "menu"]]]));
}

async function showReservation(c, id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return c.say("Código no válido.");
  const r = await c.store.get("res/" + id, { type: "json" });
  if (!r) return c.say("No encontré esa reserva.");
  const [room, guest] = await Promise.all([c.store.get("rooms/" + r.roomId, { type: "json" }), r.guestId ? c.store.get("guests/" + r.guestId, { type: "json" }) : null]);
  const name = guest ? gName(guest) : r.guestName || "Sin nombre", phone = guest?.phone || "", n = diffDays(r.checkIn, r.checkOut);
  const pend = (r.payments || []).filter((p) => p.status === "por verificar");
  const link = isActive(r) && r.checkOut >= c.today ? c.deps.guestUrl(r.id, c.req) : null;
  const txt = [`🧾 <b>Reserva</b> <code>${esc(r.id)}</code> · ${STATUS[r.status] || esc(r.status)}`, `🛏 Hab. ${esc(room?.number || r.roomId)} · ${esc(room?.name || room?.type || "")}`,
    `📅 ${fd(r.checkIn)} → ${fd(r.checkOut)} (${nightsTxt(n)})`, `👤 ${esc(name)}${phone ? " · " + esc(phone) : ""} · ${r.adults || 1} adulto(s)${r.children ? `, ${r.children} niño(s)` : ""}`,
    `📡 ${esc(CH[r.channel] || r.channel || "—")}${r.externalRef ? " · " + esc(r.externalRef) : ""}`, `💵 Total ${pesos(r.total)} · abonado ${pesos(r.paid)} · <b>saldo ${pesos(bal(r))}</b>`,
    pend.length ? `💳 ${pend.length} comprobante(s) por verificar` : null, r.checkin ? "✔︎ Check-in en línea completado" : null, r.contract ? "✍️ Contrato firmado" : null,
    r.conflict && r.conflict.length ? `⚠️ Posible sobreventa con ${esc(r.conflict.join(", "))}` : null, r.notes ? `📝 ${esc(String(r.notes).slice(0, 400))}` : null,
    link ? `🔗 ${esc(link)}` : null].filter(Boolean).join("\n");
  const rows = [];
  if (["pendiente", "confirmada"].includes(r.status)) rows.push(c.admin ? [["🛬 Check-in", "ci:" + r.id], ["❌ Cancelar", "cx:" + r.id]] : [["🛬 Check-in", "ci:" + r.id]]);
  if (r.status === "pendiente") rows.unshift([["✔︎ Confirmar", "cf:" + r.id]]);
  if (r.status === "encasa") rows.push([["🛫 Check-out", "co:" + r.id]]);
  if (isActive(r) && bal(r) > 0) rows.push([["💵 Registrar abono", "ab:" + r.id]]);
  if (c.admin) for (const p of pend.slice(0, 3)) rows.push([[`✅ Verificar ${pesos(p.amount)}`, `pv:${r.id}:${p.id}`], ["❌ Rechazar", `pr:${r.id}:${p.id}`]]);
  if (phone && digits(phone).length >= 7) rows.push([{ text: "💬 WhatsApp", url: "https://wa.me/" + waNum(phone) }]);
  rows.push([["📋 Próximas", "prox"], ["Menú", "menu"]]);
  return c.say(txt, kb(rows));
}

async function setStatus(c, id, status) {
  const prev = await c.store.get("res/" + id, { type: "json" });
  if (!prev) return c.say("No encontré esa reserva.");
  const allowed = { confirmada: ["pendiente"], encasa: ["pendiente", "confirmada"], finalizada: ["encasa"], cancelada: ["pendiente", "confirmada"] }[status];
  if (!allowed.includes(prev.status)) return c.say(`La reserva está ${STATUS[prev.status] || prev.status}; no se puede cambiar así.`);
  if (status === "encasa" && prev.checkIn > c.today) return c.say(`La llegada es el ${fd(prev.checkIn)}: el check-in se registra ese día.`);
  const rec = { ...prev, status, updatedAt: new Date().toISOString() };
  if (status === "finalizada" && rec.checkOut > c.today) rec.notes = (rec.notes ? rec.notes + "\n" : "") + `Salida anticipada registrada el ${c.today} desde Telegram.`;
  await c.store.setJSON("res/" + id, rec);
  const g = await c.deps.syncToCalendar(c.store, rec);
  await c.deps.notifyResChange(c.store, c.req, prev, rec).catch((e) => console.error("aviso", e));
  const msg = { confirmada: "✔︎ Reserva confirmada.", encasa: "🛬 Check-in registrado.", finalizada: "🛫 Check-out registrado.", cancelada: "❌ Reserva cancelada; las fechas quedaron libres." }[status];
  const warn = status === "encasa" && !prev.contract ? "\n⚠️ Falta el contrato firmado: pídele al huésped que lo firme en su enlace o en recepción." : status === "finalizada" && bal(rec) > 0 ? `\n⚠️ Queda un saldo de ${pesos(bal(rec))}.` : "";
  return c.say(`${msg} <code>${esc(id)}</code>${warn}${calTxt(g)}`, kb([[["Ver reserva", "rv:" + id], ["Menú", "menu"]]]));
}

/* ---------- solicitudes del sitio ---------- */
async function showRequests(c) {
  const [reqs, rooms] = await Promise.all([c.deps.listJSON(c.store, "req/"), c.deps.listJSON(c.store, "rooms/")]);
  const roomBy = Object.fromEntries(rooms.map((r) => [r.id, r]));
  const list = reqs.filter((x) => x.status === "nueva").sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  if (!list.length) return c.say("📨 No hay solicitudes nuevas del sitio web. 👌", kb([[["Menú", "menu"]]]));
  await c.say(`📨 <b>${list.length} solicitud(es) por atender</b>`);
  for (const x of list.slice(0, 8)) {
    const a = requestAlert(x, roomBy[x.roomId] || { number: x.roomId }, { afterHours: false });
    await c.say(a.text, kb(a.buttons));
  }
  if (list.length > 8) await c.say(`…y ${list.length - 8} más en el panel.`);
}

async function acceptRequest(c, reqId, roomOverride) {
  const x = await c.store.get("req/" + reqId, { type: "json" });
  if (!x) return c.say("No encontré esa solicitud.");
  if (x.status !== "nueva") return c.say(`Esa solicitud ya fue ${x.status}${x.resId ? ` (reserva <code>${esc(x.resId)}</code>)` : ""}.`, x.resId ? kb([[["Ver reserva", "rv:" + x.resId]]]) : undefined);
  const roomId = roomOverride || x.roomId;
  const free = await freeRooms(c, x.checkIn, x.checkOut, (x.adults || 1) + (x.children || 0));
  if (!free.some((r) => r.id === roomId)) {
    if (!free.length) return c.say(`La habitación pedida ya no está libre del ${fd(x.checkIn)} al ${fd(x.checkOut)} y no hay otra con cupo. Escríbele al huésped para ofrecerle otras fechas.`,
      kb([[{ text: "💬 WhatsApp del huésped", url: "https://wa.me/" + waNum(x.phone) }], [["❌ Rechazar", "sr:" + x.id]]]));
    return c.say(`La habitación pedida ya está ocupada en esas fechas. ¿Le asignas otra?`, kb([...chunk(free.map((r) => [`${r.number} · ${pesos(r.rate)}`, `sx:${x.id}:${r.id}`]), 2), [["❌ Rechazar", "sr:" + x.id]]]));
  }
  const room = free.find((r) => r.id === roomId);
  const guest = await findOrCreateGuest(c, { first: x.first, last: x.last || "", phone: x.phone, docType: x.docType || "", docNumber: x.docNumber || "", email: x.email || "", nationality: x.nationality || "", consent: !!x.consent });
  const now = new Date().toISOString(), n = diffDays(x.checkIn, x.checkOut);
  const total = roomId === x.roomId ? Number(x.estimate) || (Number(room.rate) || 0) * n : (Number(room.rate) || 0) * n;
  const rec = { id: genId("PN"), roomId, checkIn: x.checkIn, checkOut: x.checkOut, adults: x.adults || 1, children: x.children || 0, eta: x.eta || "", guestId: guest.id, guestName: gName(guest),
    channel: "web", externalRef: "", status: "confirmada", rate: Number(room.rate) || 0, total, paid: 0, payMethod: "",
    notes: "Solicitud " + x.id + " (sitio web)." + (x.notes ? "\n" + x.notes : ""), createdAt: now, updatedAt: now };
  const g = await saveNewReservation(c, rec);
  await c.store.setJSON("req/" + x.id, { ...x, status: "aceptada", resId: rec.id, decidedAt: now, updatedAt: now });
  return reservationCreatedMsg(c, rec, room, x.phone, g);
}
async function rejectRequest(c, reqId) {
  const x = await c.store.get("req/" + reqId, { type: "json" });
  if (!x) return c.say("No encontré esa solicitud.");
  if (x.status !== "nueva") return c.say(`Esa solicitud ya fue ${x.status}.`);
  const now = new Date().toISOString();
  await c.store.setJSON("req/" + x.id, { ...x, status: "rechazada", decidedAt: now, updatedAt: now });
  const t = `Hola ${x.first}, gracias por escribirnos. Lamentablemente no tenemos disponibilidad del ${fd(x.checkIn)} al ${fd(x.checkOut)} en el Hotel Portal Norte 170. ¿Te podemos ofrecer otras fechas?`;
  return c.say(`Solicitud <code>${esc(x.id)}</code> rechazada.`, kb([[{ text: "💬 Avisarle por WhatsApp", url: `https://wa.me/${waNum(x.phone)}?text=${encodeURIComponent(t)}` }]]));
}

/* ---------- pagos ---------- */
async function reviewPayment(c, resId, payId, status) {
  const r = await c.store.get("res/" + resId, { type: "json" });
  if (!r) return c.say("No encontré esa reserva.");
  const p = (r.payments || []).find((x) => x.id === payId);
  if (!p) return c.say("No encontré ese pago.");
  if (p.status !== "por verificar") return c.say(`Ese pago ya está ${p.status}.`);
  const next = await c.deps.changePayment(c.store, r, payId, status);
  await c.deps.syncToCalendar(c.store, next);
  if (status === "verificado") await c.deps.notifyResChange(c.store, c.req, r, next, { extra: { kind: "pago", tone: "ok", intro: `Se verificó un pago de ${pesos(p.amount)} (${p.method}) desde Telegram.`, rows: [["Pago", `${pesos(p.amount)} · ${p.method} · ${p.date}`]] } }).catch(() => {});
  return c.say(status === "verificado" ? `✅ Pago de ${pesos(p.amount)} verificado. Saldo de <code>${esc(r.id)}</code>: <b>${pesos(bal(next))}</b>.` : `❌ Pago de ${pesos(p.amount)} rechazado.`, kb([[["Ver reserva", "rv:" + r.id]]]));
}
async function saveAbono(c, d) {
  const r = await c.store.get("res/" + d.resId, { type: "json" });
  if (!r) return c.say("No encontré esa reserva.");
  const { next } = await c.deps.addPayment(c.store, r, { amount: d.amount, method: d.method, date: c.today, note: "Registrado desde Telegram." }, "recepcion");
  await clearSession(c);
  await c.deps.syncToCalendar(c.store, next);
  await c.deps.notifyResChange(c.store, c.req, r, next, { extra: { kind: "pago", tone: "ok", intro: `Se registró un pago de ${pesos(d.amount)} (${d.method}) desde Telegram.`, rows: [["Pago", `${pesos(d.amount)} · ${d.method} · ${c.today}`]] } }).catch(() => {});
  return c.say(`💵 Abono de ${pesos(d.amount)} (${esc(d.method)}) registrado en <code>${esc(r.id)}</code>.\nSaldo: <b>${pesos(bal(next))}</b>`, kb([[["Ver reserva", "rv:" + r.id], ["Menú", "menu"]]]));
}

/* ---------- gastos ---------- */
async function downloadPhoto(c, msg) {
  const big = msg.photo ? msg.photo[msg.photo.length - 1] : msg.document;
  if (big.file_size && big.file_size > MAX_PHOTO) throw Object.assign(new Error("La foto supera 4 MB. Envíala como foto (no como archivo) para que Telegram la comprima."), { status: 413 });
  const f = await call("getFile", { file_id: big.file_id });
  const r = await fetch(`https://api.telegram.org/file/bot${token()}/${f.file_path}`);
  if (!r.ok) throw new Error("No se pudo descargar la foto de Telegram.");
  const buf = await r.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_PHOTO) throw Object.assign(new Error("La foto está vacía o supera 4 MB."), { status: 413 });
  const ext = (f.file_path.split(".").pop() || "").toLowerCase();
  const type = msg.document?.mime_type || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  const id = "ADM_" + randomUUID().replace(/-/g, "").slice(0, 24);
  await c.deps.idPhotos().set(id, buf, { metadata: { contentType: type, at: new Date().toISOString(), kind: "recibo", via: "telegram" } });
  return id;
}
async function onPhoto(c, msg) {
  const s = await getSession(c.store, c.chatId);
  if (s && s.flow === "gasto" && !s.d.photoId) { // venía de /gasto y faltaba la foto
    const photoId = await downloadPhoto(c, msg);
    return nextExpenseStep(c, { ...s, d: { ...s.d, photoId, ...captionData(msg.caption, s.d) } });
  }
  await clearSession(c);
  const photoId = await downloadPhoto(c, msg);
  return startExpense(c, photoId, msg.caption || "");
}
function captionData(caption, d = {}) {
  if (!caption) return {};
  const { amount, rest } = extractMoney(caption), out = {};
  if (amount && !d.amount) out.amount = amount;
  const cat = guessCategory(rest);
  if (cat >= 0 && !d.category) out.category = XCATS[cat];
  if (rest && !d.concept) out.concept = rest.slice(0, 160);
  return out;
}
async function startExpense(c, photoId, text) {
  const d = { photoId: photoId || "", date: c.today, ...captionData(text) };
  if (!photoId) {
    await setSession(c.store, c.chatId, { flow: "gasto", step: "x_photo", d });
    return c.say("💸 <b>Registrar gasto</b>\nEnvíame la <b>foto del recibo</b> (cámara o galería). Si no tienes recibo, toca «Sin foto».", kb([[["Sin foto", "xs"]], CANCEL_ROW]));
  }
  return nextExpenseStep(c, { flow: "gasto", step: "x_amount", d });
}
// Pide lo que falte: valor → categoría → concepto → forma de pago → confirmación.
async function nextExpenseStep(c, s) {
  const d = s.d;
  const go = (step, text, markup) => setSession(c.store, c.chatId, { ...s, step, d }).then(() => c.say(text, markup));
  if (!d.amount) return go("x_amount", `${d.photoId ? "📸 Recibo recibido. " : ""}¿Cuál es el <b>valor</b> del gasto?`, kb([CANCEL_ROW]));
  if (!d.category) return go("x_cat", `💵 ${pesos(d.amount)}. ¿En qué <b>categoría</b> va?`, kb([...chunk(XSHORT.map((t, i) => [t, "xc:" + i]), 2), CANCEL_ROW]));
  if (!d.concept) return go("x_concept", "📝 ¿Qué se compró o pagó? (concepto, ej. «Detergente y cloro»)", kb([CANCEL_ROW]));
  if (!d.method) return go("x_method", "¿Cómo se pagó?", kb([...chunk(["Efectivo", "Transferencia", "Nequi / Daviplata", "Tarjeta", "Débito automático", "Otro"].map((m, i) => [m, "xm:" + i]), 3), CANCEL_ROW]));
  return go("x_confirm", [`🧾 <b>Confirma el gasto</b>`, `💵 <b>${pesos(d.amount)}</b>`, `🏷 ${esc(d.category)}`, `📝 ${esc(d.concept)}`, d.provider ? `🏪 ${esc(d.provider)}` : null,
    `💳 ${esc(d.method)} · 📅 ${fd(d.date)}`, d.fixed ? "🔁 Gasto fijo mensual" : null, d.photoId ? "📸 Con foto del recibo" : "Sin foto del recibo"].filter(Boolean).join("\n"),
  kb([[["✅ Guardar gasto", "xok"]], [["📅 Cambiar fecha", "xd"], ["🏪 Proveedor", "xp"]], [[d.fixed ? "Quitar «fijo mensual»" : "🔁 Fijo mensual", "xf"], ["✖ Cancelar", "x"]]]));
}
async function saveExpense(c, d) {
  const id = genId("X"), now = new Date().toISOString();
  const rec = { id, amount: d.amount, date: d.date, category: d.category, concept: d.concept, provider: d.provider || "", method: d.method || "", note: `Registrado desde Telegram${c.who ? " por " + c.who : ""}.`,
    photoId: d.photoId || "", fixed: !!d.fixed, createdAt: now, updatedAt: now };
  await c.store.setJSON("exp/" + id, rec);
  await clearSession(c, { keepPhoto: true });
  // Total del mes para contexto.
  const ym = d.date.slice(0, 7), all = await c.deps.listJSON(c.store, "exp/");
  const month = all.filter((x) => String(x.date || "").startsWith(ym)).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  return c.say(`✅ Gasto guardado: <b>${pesos(d.amount)}</b> · ${esc(d.category)}${d.fixed ? " · fijo mensual" : ""}.\nEgresos de ${MON[+ym.slice(5) - 1]} ${ym.slice(0, 4)} hasta ahora: <b>${pesos(month)}</b>.`, kb([[["💸 Otro gasto", "gasto"], ["Menú", "menu"]]]));
}

/* ---------- botones ---------- */
async function onCallback(c, cb) {
  const data = String(cb.data || ""), [act, a1, a2] = data.split(":");
  const answer = (text) => call("answerCallbackQuery", { callback_query_id: cb.id, text }).catch(() => {});
  if (!c.admin && ["cx", "cy", "pv", "pr"].includes(act)) return answer("Tu cuenta no tiene permiso para esto. Pídeselo al administrador.");
  // En los pasos y confirmaciones se quitan los botones del mensaje para evitar dobles toques.
  const KEEP = new Set(["menu", "hoy", "prox", "sol", "rv", "disp", "new", "gasto"]);
  if (!KEEP.has(act) && cb.message) await call("editMessageReplyMarkup", { chat_id: c.chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  await answer();
  const s = await getSession(c.store, c.chatId), d = s?.d || {};
  const need = (flow, step) => s && s.flow === flow && (!step || [].concat(step).includes(s.step));
  const expired = () => c.say("Esa conversación ya terminó o venció. Empecemos de nuevo:", MENU);

  switch (act) {
    case "menu": await clearSession(c); return showMenu(c);
    case "hoy": return showToday(c);
    case "prox": return showUpcoming(c);
    case "sol": return showRequests(c);
    case "disp": return startDates(c, "disp", "");
    case "new": return startDates(c, "res", "");
    case "gasto": await clearSession(c); return startExpense(c, null, "");
    case "rv": return showReservation(c, a1);
    case "x": await clearSession(c); return c.say("Listo, cancelado.", MENU);

    case "di": if (!need("disp", "in") && !need("res", "in")) return expired();
      await setSession(c.store, c.chatId, { ...s, step: "nights", d: { in: a1 } }); return askNights(c, a1);
    case "dn": if (!s || s.step !== "nights") return expired();
      return afterDates(c, { flow: s.flow, d: { in: d.in, out: addDays(d.in, +a1) } });
    case "rm": if (!need("res", "room")) return expired();
      await setSession(c.store, c.chatId, { flow: "res", step: "name", d: { ...d, roomId: a1 } });
      { const room = await c.store.get("rooms/" + a1, { type: "json" }); return c.say(`Hab. <b>${esc(room?.number)}</b> · ${fd(d.in)} → ${fd(d.out)}.\n👤 ¿Nombre del huésped?`, kb([CANCEL_ROW])); }
    case "skip": if (!need("res", "phone")) return expired();
      await setSession(c.store, c.chatId, { ...s, step: "ppl", d: { ...d, phone: "" } }); return askPeople(c, d);
    case "pp": if (!need("res", "ppl")) return expired();
      await setSession(c.store, c.chatId, { ...s, step: "total", d: { ...d, adults: +a1 } }); return askTotal(c, d);
    case "tt": if (!need("res", "total")) return expired();
      await setSession(c.store, c.chatId, { ...s, step: "paid", d: { ...d, total: +a1 } }); return askPaid(c, { ...d, total: +a1 });
    case "pd": if (!need("res", "paid")) return expired();
      if (+a1 === 0) { await setSession(c.store, c.chatId, { ...s, step: "confirm", d: { ...d, paid: 0 } }); return confirmReservation(c, { ...d, paid: 0 }); }
      await setSession(c.store, c.chatId, { ...s, step: "paymethod", d: { ...d, paid: +a1 } }); return askMethod(c, "pm");
    case "pm": if (!need("res", "paymethod")) return expired();
      { const nd = { ...d, payMethod: PAY_METHODS[+a1] || "Otro" }; await setSession(c.store, c.chatId, { ...s, step: "confirm", d: nd }); return confirmReservation(c, nd); }
    case "ok": if (!need("res", "confirm")) return expired();
      return createReservation(c, d);

    case "cf": return setStatus(c, a1, "confirmada");
    case "ci": return setStatus(c, a1, "encasa");
    case "co": return setStatus(c, a1, "finalizada");
    case "cx": return c.say(`¿Seguro que quieres cancelar la reserva <code>${esc(a1)}</code>? Las fechas quedarán libres y se borra del calendario.`, kb([[["Sí, cancelar reserva", "cy:" + a1], ["No", "rv:" + a1]]]));
    case "cy": return setStatus(c, a1, "cancelada");
    case "ab": { const r = await c.store.get("res/" + a1, { type: "json" }); if (!r) return c.say("No encontré esa reserva.");
      await setSession(c.store, c.chatId, { flow: "abono", step: "ab_amount", d: { resId: a1 } });
      return c.say(`💵 Abono para <code>${esc(a1)}</code> (saldo ${pesos(bal(r))}). ¿Cuánto pagó?`, kb([[[`Todo el saldo · ${pesos(bal(r))}`, "aa:" + bal(r)]], CANCEL_ROW])); }
    case "aa": if (!need("abono", "ab_amount")) return expired();
      await setSession(c.store, c.chatId, { ...s, step: "ab_method", d: { ...d, amount: +a1 } }); return askMethod(c, "am");
    case "am": if (!need("abono", "ab_method")) return expired();
      return saveAbono(c, { ...d, method: PAY_METHODS[+a1] || "Otro" });
    case "pv": return reviewPayment(c, a1, a2, "verificado");
    case "pr": return reviewPayment(c, a1, a2, "rechazado");

    case "sa": return acceptRequest(c, a1);
    case "sx": return acceptRequest(c, a1, a2);
    case "sr": return c.say(`¿Rechazar la solicitud <code>${esc(a1)}</code>?`, kb([[["Sí, rechazar", "sy:" + a1], ["No", "menu"]]]));
    case "sy": return rejectRequest(c, a1);

    case "xs": if (!need("gasto", "x_photo")) return expired();
      return nextExpenseStep(c, { ...s, d: { ...d, photoId: "", noPhoto: true } });
    case "xc": if (!need("gasto", "x_cat")) return expired();
      if (+a1 === XCATS.length - 1) { await setSession(c.store, c.chatId, { ...s, step: "x_cat_other" }); return c.say("Escribe el nombre de la categoría (o «Otros»):"); }
      return nextExpenseStep(c, { ...s, d: { ...d, category: XCATS[+a1] || "Otros" } });
    case "xm": if (!need("gasto", "x_method")) return expired();
      return nextExpenseStep(c, { ...s, d: { ...d, method: ["Efectivo", "Transferencia", "Nequi / Daviplata", "Tarjeta", "Débito automático", "Otro"][+a1] || "Otro" } });
    case "xd": if (!need("gasto", "x_confirm")) return expired();
      await setSession(c.store, c.chatId, { ...s, step: "x_date" }); return c.say("📅 ¿De qué fecha es el gasto?", kb([[["Hoy", "xdd:0"], ["Ayer", "xdd:1"], ["Antier", "xdd:2"]]]));
    case "xdd": if (!need("gasto", "x_date")) return expired();
      return nextExpenseStep(c, { ...s, d: { ...d, date: addDays(c.today, -(+a1 || 0)) } });
    case "xp": if (!need("gasto", "x_confirm")) return expired();
      await setSession(c.store, c.chatId, { ...s, step: "x_provider" }); return c.say("🏪 ¿A quién se le pagó? (proveedor o almacén)");
    case "xf": if (!need("gasto", "x_confirm")) return expired();
      return nextExpenseStep(c, { ...s, d: { ...d, fixed: !d.fixed } });
    case "xok": if (!need("gasto", "x_confirm")) return expired();
      return saveExpense(c, d);
    default: return c.say("Ese botón ya no está disponible.", MENU);
  }
}
