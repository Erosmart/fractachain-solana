/**
 * Demo visibility filter: hides test/demo offerings from the public market
 * views so only real listings show. Admin screens and direct links are
 * unaffected — this only filters the listing pickers.
 */
export const HIDDEN_LISTING_IDS = new Set([
  'IPO-SOJA-PERGAMINO-2026', // Las Lilas — licitación ya llena
  'IPO-T02942-mu6ex9gh', // Demo SA — cerrada
  'IPO-DEMO4982-mukdxf8n', // demo — Litoral, deploy sin licitación
  'IPO-DEMO3810-mukd6zqn', // demo — Andina (SOL)
  'IPO-FIVE-muhxe9vd', // test — "555"
  'IPO-MADU-muhxb1tx', // test — marcus dordus
  'IPO-MADO-muhwtllr', // test — Marcos Dorados
  'IPO-LUCAS-muhvrt8i', // test — Mc Lucas
  'IPO-MCC-muaxfboe', // test — Minecraft S.A
]);

export const isVisibleListing = (id?: string | null) => !!id && !HIDDEN_LISTING_IDS.has(id);
