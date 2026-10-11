// Sincronización automática de los calendarios de Booking.com y Airbnb (cada 15 minutos).
// Las funciones programadas solo corren en el sitio publicado de Netlify, no en vistas previas.
import { getStore } from "@netlify/blobs";
import { syncAll } from "../../lib/ical.mjs";

export const config = { schedule: "*/15 * * * *" };

export default async () => {
  const store = getStore({ name: "portal-norte", consistency: "strong" });
  try {
    const s = await syncAll(store, { reason: "auto" });
    console.log("ical-sync", JSON.stringify(s.skipped ? s : { feeds: s.feedCount, ...s.totals, conflicts: s.conflicts.length, ok: s.ok }));
  } catch (e) {
    console.error("ical-sync", e);
  }
};
