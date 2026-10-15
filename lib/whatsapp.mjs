// Avisos por WhatsApp al administrador (solicitudes de reserva, mensajes de contacto, comprobantes de pago).
// Proveedor, en este orden:
//   1) CallMeBot (gratis, para avisos a tu propio número): WHATSAPP_PHONE + CALLMEBOT_APIKEY
//   2) Twilio WhatsApp: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM + WHATSAPP_PHONE
// WHATSAPP_PHONE puede llevar varios números separados por coma (CallMeBot: CALLMEBOT_APIKEY con las claves en el mismo orden).
const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];
const list = (v) => String(v || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const intl = (n) => { const d = String(n).replace(/\D/g, ""); return d.length === 10 && d.startsWith("3") ? "57" + d : d; };

export function provider() {
  if (!list(env("WHATSAPP_PHONE")).length) return null;
  if (env("CALLMEBOT_APIKEY")) return "callmebot";
  if (env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_WHATSAPP_FROM")) return "twilio";
  return null;
}
export const phones = () => list(env("WHATSAPP_PHONE")).map(intl);
export const masked = () => phones().map((p) => "+" + p.slice(0, 2) + " ••• " + p.slice(-4));

async function sendOne(prov, to, text, i, fetchImpl) {
  if (prov === "callmebot") {
    const keys = list(env("CALLMEBOT_APIKEY")), key = keys[i] || keys[0];
    const u = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent("+" + to)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
    const r = await fetchImpl(u);
    const body = await r.text().catch(() => "");
    if (!r.ok || /APIKey is invalid|ERROR|not active/i.test(body)) throw new Error("CallMeBot: " + (body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "HTTP " + r.status));
    return true;
  }
  const sid = env("TWILIO_ACCOUNT_SID"), from = String(env("TWILIO_WHATSAPP_FROM")).replace(/^whatsapp:/, "");
  const r = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(sid + ":" + env("TWILIO_AUTH_TOKEN")).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: "whatsapp:" + (from.startsWith("+") ? from : "+" + intl(from)), To: "whatsapp:+" + to, Body: text }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error("Twilio: " + (j.message || "HTTP " + r.status)); }
  return true;
}

// Envía el texto a todos los números configurados. Nunca lanza.
export async function send(store, hotel, text, { fetchImpl = fetch, force = false, kind = "aviso" } = {}) {
  if (!force && hotel && hotel.waOff) return { skipped: true, reason: "off" };
  const prov = provider();
  if (!prov) return { skipped: true, reason: "sin configurar" };
  const msg = String(text).slice(0, 1500);
  let out;
  try {
    await Promise.race([Promise.all(phones().map((p, i) => sendOne(prov, p, msg, i, fetchImpl))),
      new Promise((_, rej) => setTimeout(() => rej(new Error("WhatsApp no respondió a tiempo.")), 9000))]);
    out = { ok: true, provider: prov };
  } catch (e) {
    console.error("whatsapp", e.message);
    out = { ok: false, provider: prov, error: e.message };
  }
  try { await store.setJSON("wa/last", { at: new Date().toISOString(), kind, ...out }); } catch {}
  return out;
}

/* ---------- horario de atención ---------- */
export const DEFAULT_HOURS = { from: "08:00", to: "18:00" };
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function hoursOf(hotel) {
  const from = HM.test(hotel?.attentionFrom || "") ? hotel.attentionFrom : DEFAULT_HOURS.from;
  const to = HM.test(hotel?.attentionTo || "") ? hotel.attentionTo : DEFAULT_HOURS.to;
  return { from, to };
}
export function nowBogotaHM(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
export function isOpen(hotel, date = new Date()) {
  const { from, to } = hoursOf(hotel), t = nowBogotaHM(date);
  return from <= to ? t >= from && t < to : t >= from || t < to;
}
// «8:00 a. m. a 6:00 p. m.»
export function hm12(hm) { let [h, m] = hm.split(":").map(Number); const s = h < 12 ? "a. m." : "p. m."; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${s}`; }
export function hoursText(hotel) { const { from, to } = hoursOf(hotel); return `${hm12(from)} a ${hm12(to)}`; }
