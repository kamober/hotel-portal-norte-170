// Notificaciones por correo del sistema de reservas.
// Proveedor, en este orden:
//   1) Resend (RESEND_API_KEY) — el más simple; sin dominio verificado solo envía al correo dueño de la cuenta.
//   2) Gmail con la cuenta de Google conectada por OAuth (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN con permiso gmail.send).
// Destino: el correo guardado en el panel (hotel.notifyEmail), si no NOTIFY_EMAIL, si no cbernal@gesoltec.co.
import * as gcal from "./gcal.mjs";

const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];
export const DEFAULT_TO = "cbernal@gesoltec.co";
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function provider() {
  if (env("RESEND_API_KEY")) return "resend";
  if (gcal.authMode() === "oauth") return "gmail";
  return null;
}
export function recipients(hotel) {
  const raw = (hotel && hotel.notifyEmail) || env("NOTIFY_EMAIL") || DEFAULT_TO;
  return String(raw).split(/[,;\s]+/).map((s) => s.trim()).filter((s) => EMAIL_RE.test(s)).slice(0, 5);
}
export const enabled = (hotel) => !(hotel && hotel.notifyOff) && !!provider();
export function baseUrl(req) {
  try { if (req) return new URL(req.url).origin; } catch {}
  return (env("URL") || env("DEPLOY_PRIME_URL") || "").replace(/\/$/, "");
}

/* ---------- plantilla ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function render({ title, intro, rows = [], items = [], button, tone = "info", hotelName = "Hotel Portal Norte 170" }) {
  const accent = tone === "alert" ? "#C62D24" : tone === "ok" ? "#1E74F0" : "#0A1F44";
  const rowsHtml = rows.filter(([, v]) => v != null && v !== "").map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#1F2A37;font-size:14px">${esc(v)}</td></tr>`).join("");
  const itemsHtml = items.length ? `<ul style="margin:12px 0 0;padding-left:18px;color:#1F2A37;font-size:14px;line-height:1.5">${items.map((i) => `<li style="margin:3px 0">${esc(i)}</li>`).join("")}</ul>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F1F5FB;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5FB;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E2D9CC;border-radius:12px;overflow:hidden">
<tr><td style="background:#0A1F44;padding:18px 24px;border-bottom:4px solid #E3261C"><div style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold">${esc(hotelName)}</div><div style="color:#7FD3FF;font-size:11px;letter-spacing:.08em;margin-top:2px">HOTEL · COLIVING · BOGOTÁ — SISTEMA DE RESERVAS</div></td></tr>
<tr><td style="padding:22px 24px">
<div style="color:${accent};font-family:Georgia,serif;font-size:20px;font-weight:bold;margin:0 0 6px">${esc(title)}</div>
${intro ? `<p style="margin:0 0 12px;color:#1F2A37;font-size:14px;line-height:1.5">${esc(intro)}</p>` : ""}
${rowsHtml ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:6px">${rowsHtml}</table>` : ""}${itemsHtml}
${button && button.url ? `<p style="margin:20px 0 0"><a href="${esc(button.url)}" style="display:inline-block;background:#1E74F0;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:999px">${esc(button.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:14px 24px;background:#EEF3FA;color:#6B7280;font-size:11px">Aviso automático del sistema de reservas. Puedes cambiar el correo de destino en el panel, pestaña Alojamiento.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, intro, ...rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}: ${v}`), ...items.map((i) => "- " + i), button && button.url ? `${button.label}: ${button.url}` : ""].filter(Boolean).join("\n");
  return { html, text };
}

/* ---------- envío ---------- */
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
function mime({ to, subject, html, text }) {
  const bd = "pn170" + Date.now().toString(36);
  return [
    `To: ${to.join(", ")}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${bd}"`, "",
    `--${bd}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(text).replace(/.{76}/g, "$&\r\n"),
    `--${bd}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(html).replace(/.{76}/g, "$&\r\n"),
    `--${bd}--`, "",
  ].join("\r\n");
}
async function sendResend({ to, subject, html, text }, fetchImpl) {
  const r = await fetchImpl("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + env("RESEND_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("NOTIFY_FROM") || "Portal Norte 170 <onboarding@resend.dev>", to, subject, html, text }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Resend: " + (j.message || j.error || r.status));
  return j.id;
}
async function sendGmail(msg, fetchImpl) {
  const token = await gcal.accessToken(fetchImpl);
  const raw = Buffer.from(mime(msg), "utf8").toString("base64url");
  const r = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ raw }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j.error?.message || r.status;
    throw new Error("Gmail: " + m + (/insufficient|scope/i.test(String(m)) ? " (el token de Google no tiene el permiso gmail.send; genera uno nuevo con ese permiso)" : ""));
  }
  return j.id;
}

// Envía un aviso. Nunca lanza: devuelve {ok} o {ok:false,error} o {skipped}. Guarda el último resultado.
export async function notify(store, hotel, { subject, ...content }, { fetchImpl = fetch, force = false } = {}) {
  if (!force && hotel && hotel.notifyOff) return { skipped: true, reason: "off" };
  const prov = provider();
  if (!prov) return { skipped: true, reason: "sin proveedor" };
  const to = recipients(hotel);
  if (!to.length) return { skipped: true, reason: "sin destinatario" };
  const { html, text } = render({ ...content, hotelName: hotel?.name || "Hotel Portal Norte 170" });
  const msg = { to, subject: `${subject} · Portal Norte 170`, html, text, fromName: "Portal Norte 170" };
  let out;
  try {
    const send = prov === "resend" ? sendResend : sendGmail;
    const id = await Promise.race([send(msg, fetchImpl), new Promise((_, rej) => setTimeout(() => rej(new Error("El servicio de correo no respondió a tiempo.")), 8000))]);
    out = { ok: true, provider: prov, id };
  } catch (e) {
    console.error("notify", e);
    out = { ok: false, provider: prov, error: e.message };
  }
  try { await store.setJSON("notify/last", { at: new Date().toISOString(), subject, to, ...out }); } catch {}
  return out;
}
