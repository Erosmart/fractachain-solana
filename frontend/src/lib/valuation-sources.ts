import type { Locale } from './i18n';

export interface ValuationSourceGroup {
  category: Record<Locale, string>;
  items: [name: string, url: string][];
}

export const valuationSources: ValuationSourceGroup[] = [
  {
    category: { es: 'Datos oficiales y registros', en: 'Official data and registries' },
    items: [
      ['INDEC — Censo Nacional Económico 2020-2021 (resultados provisorios)', 'https://www.indec.gob.ar/ftp/cuadros/economia/cne_2020_2021_resultados_provisorios.pdf'],
      ['INDEC — CNE preguntas frecuentes', 'https://censoeconomico.indec.gob.ar/index.php/preguntas-frecuentes/'],
      ['Errepar — Consultas frecuentes CNE', 'https://documento.errepar.com/actualidad/consultas-frecuentes-censo'],
      ['argentina.gob.ar — Registrar una PyME', 'https://www.argentina.gob.ar/servicio/registrar-una-pyme'],
      ['argentina.gob.ar — Certificado MiPyME', 'https://www.argentina.gob.ar/produccion/registrar-una-pyme/certificado-pyme'],
      ['argentina.gob.ar — Obtener garantía de una SGR', 'https://www.argentina.gob.ar/servicio/obtener-una-garantia-por-parte-de-una-sociedad-de-garantia-reciproca-sgr'],
      ['Infoleg — Normas generales del sistema de SGR', 'https://servicios.infoleg.gob.ar/infolegInternet/anexos/345000-349999/348811/res21.pdf'],
      ['BCRA — Informe de Inclusión Financiera, 1er semestre 2025', 'https://www.bcra.gob.ar/publicaciones/informe-de-inclusion-financiera-primer-semestre-2025/'],
      ['BCRA — Informe de Estabilidad Financiera, 2do semestre 2019', 'https://www.bcra.gob.ar/publicaciones/informe-de-estabilidad-financiera-segundo-semestre-2019/'],
    ],
  },
  {
    category: { es: 'Organismos multilaterales y academia', en: 'Multilateral organizations and academia' },
    items: [
      ['World Bank — MSME Finance Gap', 'https://documents1.worldbank.org/curated/en/653831510568517947/pdf/121264-WP-PUBLIC-MSMEReportFINAL.pdf'],
      ['World Bank — Boosting SME Finance for Growth', 'https://documents1.worldbank.org/curated/en/099092724122562655/pdf/P1790051b7ddde0d51b13b12b908018aa52.pdf'],
      ['World Bank — Capital Markets and SMEs in Emerging Markets', 'https://documents1.worldbank.org/curated/en/270221582271669731/pdf/Capital-Markets-and-SMEs-in-Emerging-Markets-and-Developing-Economies-Can-They-Go-the-Distance.pdf'],
      ['World Bank — Ghana Country Economic Memorandum', 'https://documents1.worldbank.org/curated/en/178001636617909989/pdf/Ghana-Country-Economic-Memorandum-Ghana-Rising-Accelerating-Economic-Transformation-and-Creating-Jobs.pdf'],
      ['IFC — Supply Chain Finance Knowledge Guide', 'https://www.ifc.org/content/dam/ifc/doc/mgrt/scf-knowledge-guide-final.pdf'],
      ['IDB — MSME Financing Instruments in LatAm and the Caribbean', 'https://publications.iadb.org/publications/english/document/MSME-Financing-Instruments-in-Latin-America-and-the-Caribbean-During-COVID-19.pdf'],
      ['IDB — The Role of Capital Markets in Funding MSMEs in LatAm', 'https://publications.iadb.org/publications/english/document/The-Role-of-Capital-Markets-in-Funding-MSMEs-in-Latin-America-and-the-Caribbean.pdf'],
      ['EMU — Enabling Environment for SME Finance', 'https://i-rep.emu.edu.tr/bitstreams/3e9f0d5a-b39f-49b5-bb92-9d4ae374c21f/download'],
      ['UNLP — La inclusión financiera en Argentina', 'https://revistas.unlp.edu.ar/proyecciones/article/download/20587/21940/106424'],
      ['UNR RepHip — Valuación en procesos de M&A', 'https://rephip.unr.edu.ar/bitstreams/569126c8-e189-4c96-a7d8-372fbfb4003d/download'],
      ['UNQ — Análisis de la informalidad laboral', 'https://ridaa.unq.edu.ar/bitstream/handle/20.500.11807/3599/TD_2020_ludmer_026.pdf?sequence=1'],
      ['AACa — Salvia, marginalidad económica y movilidad social', 'https://www.aacademica.org/agustin.salvia/276.pdf'],
      ['CAF — Las pymes en Argentina', 'https://scioteca.caf.com/bitstream/handle/123456789/2199/CAF-Pymes%20ARG.pdf?sequence=1&isAllowed=y'],
      ['RedPyMEs — Gestión empresarial en PyMEs', 'https://redpymes.org.ar/wp-content/uploads/2020/07/Gesti%C3%B3n-empresarial-y-organizaci%C3%B3n-del-trabajo-en-Pymes.pdf'],
      ['UNC — Tokenización de bienes raíces en Argentina', 'https://rdu.unc.edu.ar/bitstreams/1621a421-f51d-46aa-843e-279af920dea0/download'],
      ['CIC GBA — Internacionalización de las PyMEs', 'https://digital.cic.gba.gob.ar/bitstreams/846386aa-0d37-4c3e-9957-fe8953e36bac/download'],
    ],
  },
  {
    category: { es: 'Metodología de valuación (Damodaran, WACC, DLOM)', en: 'Valuation methodology (Damodaran, WACC, DLOM)' },
    items: [
      ['NYU Stern / Damodaran — Private Company Valuations', 'https://pages.stern.nyu.edu/~adamodar/pdfiles/country/PvtCoValuations.pdf'],
      ['NYU Stern / Damodaran — Private Company Valuation (overheads)', 'https://pages.stern.nyu.edu/~adamodar/pdfiles/ovhds/inv2E/PvtFirm.pdf'],
      ['NYU Stern / Damodaran — Discounted Cash Flow Valuation', 'https://people.stern.nyu.edu/adamodar/pdfiles/eqnotes/dcfall2pg.pdf'],
      ['NYU Stern / Damodaran — Valuation packet (Jan 2026)', 'https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/valpacket1spr26.pdf'],
      ['NYU Stern / Damodaran — Tech valuation seminar', 'https://people.stern.nyu.edu/adamodar/pdfiles/Seminars/techval.pdf'],
      ['Damodaran datafile — Country Default Spreads & Risk Premiums', 'https://www.scribd.com/document/980610921/Pages-stern-nyu-Edu-Adamodar-New-Home-Page-Datafile-Ctryprem-html'],
      ['Reasonable Deviations — Aswath Damodaran valuation notes', 'https://reasonabledeviations.com/notes/aswath_valuation/'],
      ['Wall Street Prep — Country Risk Premium', 'https://www.wallstreetprep.com/knowledge/country-risk-premium/'],
      ['Grant Thornton — When to apply a DLOM', 'https://www.grantthornton.co.uk/insights/when-to-apply-a-discount-for-lack-of-marketability/'],
      ['ResearchGate — Value and Marketability: determinants of DLOM', 'https://www.researchgate.net/publication/363294132_Value_and_Marketability_-_Determinants_of_the_Discount_for_Lack_of_Marketablity'],
      ['Valortis — Descuento por Falta de Liquidez (DLOM)', 'https://valortis.com/guias/valoracion-de-empresas/primas-y-descuentos/descuento-por-falta-de-liquidez-dlom/'],
      ['IESE — WACC: definición e interpretaciones equivocadas', 'https://www.iese.edu/media/research/pdfs/DI-0914.pdf'],
      ['PwC — Finanzas corporativas, valoraciones WACC e inversiones', 'https://www.pwc.com/ia/es/publicaciones/perspectivas-pwc/finanzas-corporativas-valoraciones-WACC-e-inversiones.html'],
      ['Empresa Actual — El WACC', 'https://www.empresaactual.com/el-wacc/'],
      ['Infoautónomos — Qué es el WACC', 'https://www.infoautonomos.com/blog/que-es-wacc/'],
      ['Pipedrive — Qué es la tasa de descuento (fórmula WACC)', 'https://www.pipedrive.com/es/blog/tasa-de-descuento'],
      ['Maraz — Tasa de descuento: qué es y cómo calcularla', 'https://maraz.es/tasa-de-descuento/'],
    ],
  },
  {
    category: { es: 'Canales de financiamiento PyME (SGR, leasing, banca)', en: 'SME financing channels (SGRs, leasing, banking)' },
    items: [
      ['BICE — Listado de SGR', 'https://www.bice.com.ar/productos/listado-sgr/'],
      ['BICE — Reporte de Sostenibilidad 2024', 'https://www.bice.com.ar/wp-content/uploads/2025/09/BICE-ReporteSostenibilidad2024.pdf'],
      ['BCR — Las SGR como puerta de acceso de las MiPyMEs al mercado', 'https://www.bcr.com.ar/sites/default/files/mercado%2520de%2520capitales_3.pdf'],
      ['Contadores en Red — SGR: claves de la Resolución 56/2025', 'https://contadoresenred.com/resolucion-56-2025/'],
      ['Diario El Norte — El leasing acelera y supera al crédito prendario', 'https://diarioelnorte.com.ar/el-leasing-acelera-y-supera-al-credito-prendario/'],
      ['Clarín — El leasing financiero creció 25% en 12 meses', 'https://www.clarin.com/economia/mano-pymes-leasing-financiero-crecio-25-12-meses_0_m3ZYnFkinE.html'],
      ['El Cronista — El leasing tuvo el mejor semestre en ocho años', 'https://www.cronista.com/finanzas-mercados/se-despierta-el-leasing-tuvo-el-mejor-semestre-en-ocho-anos/'],
      ['Bancor — EEFF intermedios consolidados (30/09/2025)', 'https://www.bancor.com.ar/downloads/eeff-30-09-2025.pdf'],
      ['BBVA Argentina — Memoria Anual / Reporte Integrado 2025', 'https://www.bbva.com.ar/content/dam/public-web/argentina/documents/Memoria-Anual-Reporte-Integrado-2025.pdf'],
      ['Infopymes — Ventas minoristas pyme septiembre', 'https://infopymes.info/2026/10/ventas-minoristas-pyme-septiembre/'],
      ['Minuto AR — Economía', 'https://minuto.ar/c/economia'],
    ],
  },
  {
    category: { es: 'Capital emprendedor y M&A', en: 'Venture capital and M&A' },
    items: [
      ['EY — ABC del Capital Privado 2026', 'https://www.ey.com/es_ar/insights/strategy-transactions/abc-capital-privado-2026'],
      ['EY — Panorama del Capital Emprendedor Argentino 2026 (PDF)', 'https://www.ey.com/content/dam/ey-unified-site/ey-com/es-ar/insights/strategy-transactions/documents/ey-panorama-capital-emprendedor-argentino-2026.pdf'],
      ['Chambers — Venture Capital 2025', 'https://chambers.com/downloads/gpg/1201/venture-capital-2025.pdf'],
      ['ARCAP — ABC del Capital Privado 2025', 'https://www.aceleradoralitoral.com.ar/wp-content/uploads/2026/03/ABC-del-Capital-Privado-ARCAP-2026.pdf'],
      ['AMEXCAP — Informe Anual 2019', 'https://es.scribd.com/document/661376592/Anuario-2019'],
      ['PwC — M&A Argentina: snapshot 1er semestre 2026', 'https://www.pwc.com.ar/es/publicaciones/fusiones-adquisiciones-perspectivas-argentina.html'],
      ['Criteria — Certificado MiPyME: beneficios', 'https://criteria.com.ar/reportes-pyme/que-es-el-certificado-mipyme-y-que-beneficios-tiene-para-las-empresas/'],
    ],
  },
  {
    category: { es: 'Costos de emisión y acceso al mercado', en: 'Issuance costs and market access' },
    items: [
      ['PAGBAM Abogados — Alternativas regulatorias para la emisión de ON (regímenes y topes)', 'https://pagbam.com/noticias/alternativas-regulatorias-para-la-emision-de-obligaciones-negociables/'],
      ['Neuquén21 — Cómo emitir una ON PyME CNV Garantizada: requisitos, tope y cuánto cuesta', 'https://neuquen21.com.ar/liderazgo-y-estrategia/como-emitir-on-pyme-cnv-garantizada-neuquen-requisitos-2026/'],
      ['Redalyc — Financiamiento mediante ON: el problema de ser PyME (simulación de costos, Gamero)', 'https://www.redalyc.org/pdf/3579/357933895005.pdf'],
      ['InfoPymes — Emitir deuda ya no es solo para grandes empresas (comisión SGR 2–4% anual)', 'https://www.infopymes.com.ar/emitir-deuda-ya-no-es-solo-para-grandes-empresas-alternativas-de-las-pymes-para-acceder-a-fondos-mas-baratos/'],
      ['CPN Gustavo Rojas — Sociedades de Garantía Recíproca (comisión ~3%)', 'https://www.rojas.com.ar/sociedades-de-garantia-reciproca/'],
      ['Del Fino (UNC) — Financiamiento mediante ON (costos de servicios ~1,5% del monto)', 'https://marcelodelfino.net/files/II.pdf'],
      ['Prospecto real — Collins S.A., ON PyME CNV Garantizada Bajo Impacto (desglose de gastos)', 'https://www.bst.com.ar/wp-content/uploads/2025/10/Collins-ON-Pyme-CNV-Bajo-Imp-Serie-I-Prospecto.pdf'],
      ['Forbes Argentina — Por qué no hay más empresas que se animen a cotizar en la Bolsa local', 'https://www.forbesargentina.com/money/mercado-capitales-hay-mas-empresas-animen-cotizar-bolsa-local-n97299'],
      ['La Nación — Claves del proceso para salir a bolsa en Wall Street (costos y plazos de una OPI)', 'https://www.lanacion.com.ar/estados-unidos/claves-del-proceso-para-salir-a-bolsa-en-wall-street-nid17052026/'],
    ],
  },
  {
    category: { es: 'Prensa y contexto macro', en: 'Press and macro context' },
    items: [
      ['Bloomberg Línea — El mercado de capitales en Argentina, uno de los más chicos de la región', 'https://www.bloomberglinea.com/latinoamerica/argentina/el-mercado-de-capitales-en-argentina-uno-de-los-mas-chicos-de-la-region/'],
      ['Chequeado — Binner: las PyMEs aportan 40% del PBI', 'https://chequeado.com/ultimas-noticias/binner-el-rol-de-las-pymes-en-nuestro-pais-es-clave-aportan-40-del-pbi/'],
      ['Clarín — En aprietos financieros por las tasas altas, hay más pymes que necesitan asistencia', 'https://www.clarin.com/economia/aprietos-financieros-tasas-altas-pymes-necesita-asistencia-pagar-creditos_0_B5w1ZzvtxW.html'],
      ['Luma — El Gran Repricing: cómo la IA redefine la valuación', 'https://luma.com/twpsiwvo'],
    ],
  },
];
