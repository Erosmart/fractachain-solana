import type { Locale } from './i18n';

export interface ReportTable {
  head: Record<Locale, string[]>;
  rows: string[][];
}

export interface ReportSection {
  id: string;
  title: Record<Locale, string>;
  paras: Record<Locale, string[]>;
  bullets?: Record<Locale, { term: string; def: string }[]>;
  formulas?: string[];
  table?: ReportTable;
  statCards?: { n: string; label: Record<Locale, string> }[];
  note?: Record<Locale, string>;
}

export const reportSections: ReportSection[] = [
  {
    id: 'intro',
    title: {
      es: '1. Introducción y alcance metodológico',
      en: '1. Introduction and methodological scope',
    },
    paras: {
      es: [
        'Cuantificar el valor económico —la "capitalización de mercado"— de un ecosistema empresarial compuesto íntegramente por compañías de capital cerrado es uno de los problemas más difíciles de las finanzas corporativas. A diferencia de las corporaciones públicas, cuyas acciones se negocian en mercados como BYMA o NYSE, las PyMEs operan fuera del escrutinio público: no existe un precio de mercado observable, continuo y dictado por la liquidez diaria.',
        'El mercado de capitales argentino es excepcionalmente reducido en el contexto internacional: su capitalización bursátil equivale a apenas el 9% del PBI, frente a ~50% del promedio latinoamericano, 83% en Chile y 76% en Brasil. Como resultado, la abrumadora mayoría del entramado productivo —y la totalidad del ecosistema PyME— está fuera del mercado bursátil.',
        'Para cuantificar el equity value agregado de las empresas privadas no cotizantes, aplicamos un modelo de valuación intrínseca basado en el descuento de flujos de caja a nivel macroeconómico (marco de valuación de empresas privadas de Aswath Damodaran, NYU Stern), ajustando la tasa de descuento por el Country Risk Premium argentino y castigando el resultado con el Descuento por Falta de Comerciabilidad (DLOM) inherente a todo activo ilíquido.',
      ],
      en: [
        'Quantifying the economic value —the "market capitalization"— of a business ecosystem made entirely of closely-held companies is one of the hardest problems in corporate finance. Unlike public corporations, whose shares trade on venues like BYMA or NYSE, SMEs operate outside public scrutiny: there is no observable, continuous market price dictated by daily liquidity.',
        'Argentina\u2019s capital market is exceptionally small internationally: its stock market capitalization equals just 9% of GDP, versus ~50% for the Latin American average, 83% in Chile and 76% in Brazil. As a result, the overwhelming majority of the productive fabric —and the entire SME ecosystem— sits outside the stock market.',
        'To quantify the aggregate equity value of unlisted private companies we apply an intrinsic valuation model based on macro-level discounted cash flows (Aswath Damodaran\u2019s private-company valuation framework, NYU Stern), adjusting the discount rate by Argentina\u2019s Country Risk Premium and penalizing the result with the Discount for Lack of Marketability (DLOM) inherent to any illiquid asset.',
      ],
    },
  },
  {
    id: 'demografia',
    title: {
      es: '2. Demografía del ecosistema corporativo argentino',
      en: '2. Demographics of the Argentine corporate ecosystem',
    },
    paras: {
      es: [
        'El Censo Nacional Económico (CNE 2020-2021, INDEC) identificó 2.189.472 unidades económicas activas. Depurando cuentapropistas y organizaciones sin fines de lucro, el núcleo de empresas empleadoras con fines de lucro asciende a 273.176 organizaciones formalmente constituidas.',
        'La estratificación demuestra la dominancia absoluta de las unidades de menor escala: la economía argentina es, en su esencia, una economía de micro y pequeñas empresas. El 99% de las organizaciones con fines de lucro clasifican como PyMEs, generan aproximadamente el 40% del PBI (CEPAL / CAME) y sostienen más de la mitad del empleo formal registrado.',
        'Distribución sectorial: comercio y transporte 23,3%; servicios empresariales, inmobiliarios y de apoyo 18,4%; industria manufacturera 10,4%; agro, ganadería, caza y silvicultura 9,9%; construcción 5,9%; intermediación financiera 1,2%. Densidad por millón de habitantes: CABA 40.161; Santa Fe 8.512; La Pampa 8.415; Córdoba 7.961; en el otro extremo, Formosa 1.694 y Santiago del Estero 1.939.',
        'Para acceder a beneficios fiscales y financiamiento subsidiado, la empresa debe inscribirse en el Registro MiPyME (Secretaría de Industria): la categorización triangula datos de AFIP (ventas, empleo, activos, relaciones societarias) de los últimos tres ejercicios; las financieras, aseguradoras e inmobiliarias tienen un tope patrimonial de $3.438 millones; las ventas consolidadas descuentan el 75% de las exportaciones; el certificado se renueva automáticamente cada año calendario (formulario 1272 + DDJJ de IVA y cargas sociales).',
        'El desempeño sectorial muestra una dualidad marcada: los rubros atados al consumo interno básico retroceden (Alimentos y Bebidas −3,1% interanual; Bazar y muebles −3,4%), mientras Textil +5,0%, Calzado +3,5% y Ferretería +3,3% cierran en positivo. Las PyMEs insertas en cadenas exportadoras —Vaca Muerta, agroindustria con producción proyectada récord de 157,9 millones de toneladas para 2026/27— exhiben perfiles de flujo de caja diametralmente superiores, y eso es lo que ponderan los inversores en procesos de M&A.',
      ],
      en: [
        'The National Economic Census (CNE 2020-2021, INDEC) identified 2,189,472 active economic units. Removing self-employed workers and non-profits, the core of for-profit employer companies stands at 273,176 formally incorporated organizations.',
        'The stratification shows the absolute dominance of small-scale units: Argentina\u2019s economy is, at its core, an economy of micro and small businesses. 99% of for-profit organizations classify as SMEs; they generate roughly 40% of GDP (ECLAC / CAME) and sustain more than half of registered formal employment.',
        'Sectoral distribution: trade and transport 23.3%; business, real-estate and support services 18.4%; manufacturing 10.4%; agriculture, livestock, hunting and forestry 9.9%; construction 5.9%; financial intermediation 1.2%. Density per million inhabitants: CABA 40,161; Santa Fe 8,512; La Pampa 8,415; Córdoba 7,961; at the other end, Formosa 1,694 and Santiago del Estero 1,939.',
        'To access fiscal benefits and subsidized financing a company must register with the MiPyME Registry (Secretariat of Industry): categorization triangulates AFIP data (sales, employment, assets, corporate relations) over the last three fiscal years; financial, insurance and real-estate companies face an asset cap of AR$3.438 billion; consolidated sales deduct 75% of exports; the certificate auto-renews every calendar year (form 1272 + VAT and social-security filings).',
        'Sector performance shows a marked duality: segments tied to basic domestic consumption are contracting (Food & Beverages −3.1% YoY; Bazaar & furniture −3.4%), while Textiles +5.0%, Footwear +3.5% and Hardware +3.3% close positive. SMEs inside export value chains —Vaca Muerta, agribusiness with a projected record 157.9Mt crop for 2026/27— show far stronger cash-flow profiles, which is exactly what investors weigh in M&A processes.',
      ],
    },
    table: {
      head: {
        es: ['Categoría', 'Participación sobre el total', 'Asalariados registrados (agregado)', 'Fuente'],
        en: ['Category', 'Share of total organizations', 'Registered employees (aggregate)', 'Source'],
      },
      rows: [
        ['Microempresas / Micro', '79,6%', '522.530', 'CNE'],
        ['Pequeñas / Small', '15,5%', '1.126.974', 'CNE'],
        ['Medianas / Medium', '3,9%', '1.261.912', 'CNE'],
        ['Grandes / Large', '1,0%', '2.290.076', 'CNE'],
      ],
    },
  },
  {
    id: 'brecha',
    title: {
      es: '3. El diagnóstico financiero: la brecha de crédito y la exclusión bursátil',
      en: '3. The financial diagnosis: the credit gap and exchange exclusion',
    },
    paras: {
      es: [
        'A nivel global, la IFC y el Banco Mundial sistematizaron las restricciones crediticias con la métrica "MSME Finance Gap": la brecha entre la demanda potencial de financiamiento de las MiPyMEs y el crédito que efectivamente provee el sistema formal. Mundialmente la brecha del sector formal se estima en US$5,2 billones — 19% del PBI de las economías emergentes. En América Latina y el Caribe alcanza US$1,8 billones, el 35% del PBI regional: la necesidad es hasta 5,2 veces la oferta actual.',
        'En Argentina, el crédito bancario al sector privado no financiero está en mínimos históricos. Asimetrías de información, historiales crediticios débiles, exigencias desproporcionadas de garantías y tasas reales elevadas por el riesgo soberano desplazan a las PyMEs del mercado de capitales. Las Enterprise Surveys del Banco Mundial las categorizan como "totalmente restringidas al crédito": dependen del autofinanciamiento o del crédito informal a tasas usurarias.',
        'Al mismo tiempo, los pagos se digitalizaron: el BCRA reporta 51.760 puntos de acceso financiero con cobertura del 94,2% de los adultos, y ~161.000 empresas incorporadas al crédito transaccional en un solo semestre lideradas por las micro. La mora FinTech bajó del 12,9% al 8,6% (enero 2025), pero la situación regular en banca tradicional cayó al 91,9%, mínimo en cinco años.',
        'El impacto en la valuación es brutal: sin apalancamiento eficiente, el WACC de las PyMEs argentinas queda artificialmente elevado. Matemáticamente, una tasa de descuento alta destruye el valor presente de los flujos futuros y oprime la valuación intrínseca de todo el sector.',
      ],
      en: [
        'Globally, the IFC and the World Bank systematized credit constraints through the "MSME Finance Gap": the gap between potential financing demand of MSMEs and the credit actually provided by formal institutions. Worldwide, the formal-sector gap is estimated at US$5.2 trillion — 19% of emerging-market GDP. In Latin America and the Caribbean it reaches US$1.8 trillion, 35% of regional GDP: the need is up to 5.2x the current supply.',
        'In Argentina, bank credit to the non-financial private sector is at historic lows. Information asymmetries, weak credit histories, disproportionate collateral requirements and high real rates driven by sovereign risk crowd SMEs out of the capital market. World Bank Enterprise Surveys categorize a large share as "fully credit constrained": they rely on retained earnings or informal credit at usurious rates.',
        'At the same time, payments digitalized: the BCRA reports 51,760 financial access points covering 94.2% of adults, and ~161,000 companies added to transactional credit in a single semester, led by micro businesses. FinTech delinquency fell from 12.9% to 8.6% (Jan 2025), but regular status in traditional banking dropped to 91.9%, a five-year low.',
        'The impact on valuation is brutal: without efficient leverage, the WACC of Argentine SMEs stays artificially high. Mathematically, a high discount rate destroys the present value of future cash flows and depresses the intrinsic valuation of the entire sector.',
      ],
    },
  },
  {
    id: 'mitigacion',
    title: {
      es: '4. Instrumentos de mitigación: SGRs, leasing y fomento',
      en: '4. Mitigation instruments: SGRs, leasing and structural promotion',
    },
    paras: {
      es: [
        'Las Sociedades de Garantía Recíproca (SGR) son la principal herramienta de inclusión financiera de las PyMEs: otorgan avales que mejoran la calificación crediticia y habilitan mayores plazos, menores tasas y líneas blandas. Administran un Fondo de Riesgo aportado por Socios Protectores (que obtienen exenciones en Ganancias a cambio de inmovilizar capital); si la PyME incumple, la SGR ejecuta el fondo ante los acreedores.',
        'La Resolución 56/2025 de la Secretaría de Industria endureció el marco: exige un multiplicador mínimo de 2,7x entre el saldo bruto de garantías vigentes y el Fondo de Riesgo disponible, y que el Fondo de Riesgo Computable esté integrado al menos en un 95% para ampliar capital. A fines de 2025 la mora que debieron afrontar las SGR aumentó por el apremio financiero generalizado, y la autoridad tipificó como infracción grave los atrasos mayores a seis meses en garantías sindicadas con fondos públicos (FoGAr).',
        'El leasing emergió como instrumento predilecto para bienes de capital: la participación PyME en la cartera total trepó al 49,3%. Lideran The Capita Corporation (Banco Comafi), Banco Supervielle y el BICE — que destinó más de $200.000 millones en créditos durante 2024, con el 81,5% de las operaciones de leasing del mercado enfocadas en equipamiento de transporte y logística.',
      ],
      en: [
        'Reciprocal Guarantee Societies (SGRs) are the main financial-inclusion tool for SMEs: they issue guarantees that improve credit ratings and enable longer terms, lower rates and soft credit lines. They manage a Risk Fund funded by "Protector Partners" (who get income-tax exemptions in exchange for locking up capital); if the SME defaults, the SGR executes the fund with creditors.',
        'Resolution 56/2025 of the Secretariat of Industry tightened the framework: it requires a minimum 2.7x multiplier between outstanding gross guarantees and the available Risk Fund, and that the Computable Risk Fund be at least 95% funded to expand capital. In late 2025 the arrears SGRs had to cover rose amid widespread financial stress, and the regulator classified delays over six months on syndicated guarantees backed by public funds (FoGAr) as serious infractions.',
        'Leasing emerged as the preferred instrument for capital goods: the SME share of the total leasing portfolio climbed to 49.3%. Leaders are The Capita Corporation (Banco Comafi), Banco Supervielle and BICE — which deployed over AR$200 billion in credit during 2024, with 81.5% of the market\u2019s leasing operations focused on transport and logistics equipment.',
      ],
    },
  },
  {
    id: 'costos',
    title: {
      es: '5. Cuánto cuesta salir al mercado: el costo de emisión',
      en: '5. What it costs to access the market: issuance costs',
    },
    paras: {
      es: [
        'Ninguna fuente publica un "precio único" para salir al mercado porque el costo depende del monto emitido y del régimen elegido. Pero los componentes sí están documentados: garantía de una Sociedad de Garantía Recíproca, comisión de colocación de la ALyC, calificación de riesgo, honorarios legales y contables, y gastos de mercado. Reconstruimos el total juntando las piezas citadas en las fuentes.',
        'Los regímenes vigentes (PAGBAM; Resolución General CNV 1095/2025): el régimen de Oferta Pública con Autorización Automática por Bajo Impacto tiene un tope de UVA 1.000.000 sin garantía (~US$1,36 millones), y la ON PyME CNV Garantizada llega a UVA 20.000.000 (~US$27 millones) cuando la emisión está totalmente garantizada. Las PyMEs están exentas del arancel CNV y de la tasa de fiscalización.',
        'El hallazgo académico central (Gamero; simulación de costos de emisión de ON PyME): cuanto menor es el monto de la emisión, mayor es el costo relativo — los honorarios profesionales son en gran parte fijos y dominan el costo total. La barrera de entrada al mercado no es la tasa de interés sino el costo fijo de estructurar.',
        'Salir a bolsa de acciones (IPO) es un salto de categoría: exige reportes trimestrales a la CNV, escrutinio permanente de accionistas y una estructura de compliance que tensiona al management (Forbes Argentina). Una OPI completa "puede durar meses o años y costar millones de dólares" (La Nación). Por eso incluso empresas que podrían cotizar —el caso Arcor— prefieren emitir deuda.',
        'La implicación para este ecosistema: una ON PyME garantizada de ~US$2 millones cuesta entre US$195.000 y US$230.000 all-in — cerca del 10% del monto captado antes de pagar un solo interés. Y en emisiones chicas sin garantía, los US$35.000–62.000 de costo fijo representan 7–12% de lo levantado. Esa fricción es la que la emisión tokenizada con liquidación on-chain busca reducir.',
      ],
      en: [
        'No source publishes a single "price" for accessing the market because the cost depends on the amount issued and the chosen regime. But the components are documented: Reciprocal Guarantee Society (SGR) guarantee, ALyC placement commission, credit rating, legal and accounting fees, and market expenses. We reconstruct the total by assembling the pieces cited in the sources.',
        'Current regimes (PAGBAM; CNV General Resolution 1095/2025): the Public Offering with Automatic Authorization for Low Impact regime caps at UVA 1,000,000 unguaranteed (~US$1.36M), and the CNV Guaranteed SME Note reaches UVA 20,000,000 (~US$27M) when fully guaranteed. SMEs are exempt from the CNV fee and the oversight levy.',
        'The central academic finding (Gamero; SME-note issuance cost simulation): the smaller the issuance, the higher the relative cost — professional fees are largely fixed and dominate the total. The barrier to market access is not the interest rate but the fixed structuring cost.',
        'Listing shares (IPO) is a different league: it demands quarterly CNV reporting, permanent shareholder scrutiny and a compliance structure that strains management (Forbes Argentina). A full IPO "can take months or years and cost millions of dollars" (La Nación). That is why even companies that could list —the Arcor case— prefer issuing debt.',
        'The implication for this ecosystem: a ~US$2M guaranteed SME note costs US$195,000–230,000 all-in — about 10% of the amount raised before paying a single interest payment. And on small unguaranteed issuances, the US$35,000–62,000 fixed cost represents 7–12% of what was raised. That friction is what tokenized issuance with on-chain settlement aims to reduce.',
      ],
    },
    table: {
      head: {
        es: ['Componente del costo', 'ON PyME Garantizada · ~US$2M a 24 meses', 'ON Bajo Impacto · ~US$500K a 12 meses'],
        en: ['Cost component', 'Guaranteed SME Note · ~US$2M over 24 months', 'Low Impact Note · ~US$500K over 12 months'],
      },
      rows: [
        ['Garantía SGR (2–4% anual / per year)', '~US$120K', 'Sin garantía / None'],
        ['Colocación ALyC (~1,5%) / Placement (~1.5%)', '~US$30K', '~US$7,5K'],
        ['Calificación de riesgo / Credit rating', '~US$10K', 'Opcional / Optional'],
        ['Honorarios legales, contables y prospecto / Legal, accounting, prospectus', '~US$30–60K', '~US$25–50K'],
        ['Aranceles CNV + Mercados + depósito / CNV + exchange + depositary fees', '~US$5–10K (PyME exenta de CNV / SME exempt from CNV fee)', '~US$2–5K'],
        ['TOTAL all-in (antes de la tasa / before interest)', '≈ US$195–230K (~10% del monto / of proceeds)', '≈ US$35–62K (7–12% del monto / of proceeds)'],
      ],
    },
    note: {
      es: 'Los totales son estimaciones propias armadas desde componentes documentados — no existe una cifra única publicada del costo de emitir. Referencias de la IPO: reportes trimestrales a la CNV, exposición pública y costos de estructura (Forbes Argentina, sep/2026); duración y orden de magnitud de una OPI (La Nación, may/2026).',
      en: 'Totals are our own estimates assembled from documented components — there is no single published figure for the cost of issuing. IPO references: quarterly CNV reporting, public exposure and structural costs (Forbes Argentina, Sep 2026); duration and order of magnitude of an IPO (La Nación, May 2026).',
    },
  },
  {
    id: 'vc',
    title: {
      es: '6. La excepción a la regla: el dinamismo del Venture Capital',
      en: '6. The exception to the rule: Venture Capital dynamism',
    },
    paras: {
      es: [
        'El ecosistema privado no es homogéneo. Mientras la metalúrgica de Rosario o el aserradero de Misiones se rigen por los descuentos de los flujos locales, existe un subsector minoritario que se aísla de las penalizaciones macro: el Venture Capital enfocado en startups tecnológicas.',
        'Según ARCAP y EY, en 2025 el Capital Semilla y Emprendedor totalizó ~US$270 millones en 73 transacciones — minúsculo frente a la economía total, pero estructuralmente relevante. Operaciones destacadas: Aleph US$29M, Vercel US$300M y Unblock US$13,5M (gas varado de Vaca Muerta para procesamiento de datos).',
        'La metodología de valuación de este subgrupo es drásticamente distinta: proyecciones de hipercrecimiento, valuation step-ups ronda tras ronda y múltiplos sobre ingresos recurrentes, ignorando temporalmente la falta de rentabilidad. Muchas incorporan HoldCos en Delaware o Reino Unido, lo que les permite eludir contablemente el castigo del riesgo país — un fenómeno de valuación dual: mientras cientos de miles de PyMEs ven sus patrimonios deprimidos, un puñado de startups alcanza status de "unicornio" sobre la promesa de escala global.',
        'En el cómputo demográfico, estas anomalías representan menos del 0,1% del entramado. Por eso el modelo macroeconómico general se rige por los fundamentos de las finanzas corporativas tradicionales.',
      ],
      en: [
        'The private ecosystem is not homogeneous. While a metalworking shop in Rosario or a sawmill in Misiones is governed by the discounts on local cash flows, there is a minority subsector insulated from macro penalties: Venture Capital focused on tech startups.',
        'Per ARCAP and EY, in 2025 Seed and Venture Capital totaled ~US$270 million across 73 deals — minuscule against the whole economy, but structurally relevant. Notable deals: Aleph US$29M, Vercel US$300M and Unblock US$13.5M (stranded Vaca Muerta gas for data processing).',
        'This subgroup\u2019s valuation methodology is drastically different: hypergrowth projections, valuation step-ups round after round, and multiples on recurring revenue, temporarily ignoring the lack of net profitability. Many incorporate HoldCos in Delaware or the UK, which lets them accounting-wise sidestep the country-risk penalty — a dual-valuation phenomenon: while hundreds of thousands of SMEs see their net worth depressed, a handful of startups reach "unicorn" status purely on the promise of global scale.',
        'Demographically, these anomalies are under 0.1% of the fabric. That is why the general macroeconomic model is governed by traditional corporate-finance fundamentals.',
      ],
    },
    table: {
      head: {
        es: ['Métrica VC Argentina (ARCAP/EY 2025-2026)', 'Dato'],
        en: ['Argentine VC metric (ARCAP/EY 2025-2026)', 'Value'],
      },
      rows: [
        [
          'Inversión total / Total investment',
          'US$270M',
        ],
        ['Transacciones / Deals', '73'],
        ['Concentración / Concentration', '12,3% de las rondas = 75,7% del monto / 12.3% of rounds = 75.7% of capital'],
        ['Estadio principal / Main stage', '52,1% pre-seed'],
        ['Sectores / Sectors', 'FinTech, E-commerce, HealthTech, BioTech'],
        ['Brecha de género / Gender gap', '43,8% con mujer fundadora · 12,5% CEO mujer / 43.8% with a woman founder · 12.5% women CEOs'],
        ['Geografía / Geography', '52,8% CABA/GBA · Santa Fe, Córdoba, Tucumán'],
      ],
    },
  },
  {
    id: 'marco',
    title: {
      es: '7. Marco teórico: valuación de capital privado',
      en: '7. Theoretical framework: private-company valuation',
    },
    paras: {
      es: [
        'Al no existir un mercado cotizante que fije el precio diariamente, se recurre a los Flujos de Caja Descontados (DCF). Según Damodaran (NYU), la valuación de empresas de capital cerrado difiere de las públicas por tres factores críticos: el inversor no puede diversificar el riesgo, el Riesgo País jurisdiccional, y la profunda iliquidez del activo.',
        'Para descontar los flujos a nivel de la firma se usa el Costo Promedio Ponderado de Capital. Como la inmensa mayoría de las PyMEs argentinas opera con apalancamiento a largo plazo marginal o nulo por la falta de crédito, la ponderación converge casi íntegramente hacia el costo del capital propio (Ke).',
        'La estimación de Ke se realiza mediante el CAPM ajustado para mercados emergentes e ilíquidos. Al consolidar sus componentes, el costo de capital exigido a una PyME privada argentina supera habitualmente el 25–30% en dólares — un "agujero negro" gravitacional sobre los flujos futuros que explica por qué los múltiplos implícitos (EV/EBITDA) son abrumadoramente más bajos que en EE.UU. o Europa. Si el WACC es 27% y el crecimiento a perpetuidad 2%, el múltiplo de capitalización implícito apenas alcanza 4,0x.',
        'Incluso tras descontar con esa tasa agresiva, la doctrina impone una deducción final: el DLOM (Discount for Lack of Marketability). Una acción en una PyME privada no se convierte en efectivo con la velocidad ni el costo de una acción de Pampa o MercadoLibre: hay meses de negociación, due diligence costosa y pocos compradores. Los estudios de acciones restringidas y comparativos de IPO fijan el DLOM promedio en 20–30% del valor intrínseco. Sinergias y prima por control pueden compensar, pero en el caso general el DLOM domina la ecuación.',
      ],
      en: [
        'Since no listed market sets a daily price, we resort to Discounted Cash Flows (DCF). Per Damodaran (NYU), closely-held valuation differs from public companies on three critical factors: the investor cannot diversify risk, jurisdictional Country Risk, and the asset\u2019s deep illiquidity.',
        'To discount firm-level cash flows we use the Weighted Average Cost of Capital. Since the vast majority of Argentine SMEs operate with marginal or zero long-term leverage due to the lack of credit, the weighting converges almost entirely toward the cost of equity (Ke).',
        'Ke is estimated through the CAPM adjusted for emerging, illiquid markets. Consolidating its components, the required cost of capital for a private Argentine SME habitually exceeds 25–30% in USD — a gravitational "black hole" over future cash flows that explains why implied multiples (EV/EBITDA) are overwhelmingly lower than in the U.S. or Europe. If WACC is 27% and perpetuity growth 2%, the implied capitalization multiple barely reaches 4.0x.',
        'Even after discounting at that aggressive rate, doctrine imposes a final deduction: the DLOM (Discount for Lack of Marketability). A share in a private SME cannot be converted to cash with the speed or cost of a Pampa or MercadoLibre share: there are months of negotiation, expensive due diligence and few buyers. Restricted-stock studies and IPO comparatives set the average DLOM at 20–30% of intrinsic value. Synergies and control premia can compensate, but in the general case the DLOM dominates the equation.',
      ],
    },
    formulas: [
      'WACC = Ke · (E / (D+E)) + Kd · (1 − T) · (D / (D+E))',
      'Ke = Rf + β · (ERP) + CRP + SP',
      'Múltiplo implícito = 1 / (WACC − g) = 1 / 0,25 = 4,0x',
    ],
    bullets: {
      es: [
        { term: 'Tasa libre de riesgo (Rf)', def: 'Rendimiento de los bonos del Tesoro de EE.UU. a 10 años; base ~4,00–4,25%.' },
        { term: 'Prima de riesgo de mercado (ERP)', def: 'Exceso de retorno histórico esperado por acciones sobre activos libres de riesgo en mercados maduros: ~5,00–5,78%.' },
        { term: 'Riesgo País (CRP)', def: 'La principal penalización. Calificación Moody\u2019s Ca de Argentina → CRP excepcionalmente alto: 18,21% (datafile Damodaran).' },
        { term: 'Prima por tamaño (SP)', def: 'Recargo por riesgo idiosincrático y mortalidad de pequeñas empresas: +2,00–3,00%.' },
      ],
      en: [
        { term: 'Risk-free rate (Rf)', def: 'U.S. Treasury 10-year yield; base ~4.00–4.25%.' },
        { term: 'Equity Risk Premium (ERP)', def: 'Historical excess return expected from equities over risk-free assets in mature markets: ~5.00–5.78%.' },
        { term: 'Country Risk Premium (CRP)', def: 'The main penalty. Argentina\u2019s Moody\u2019s Ca rating → exceptionally high CRP: 18.21% (Damodaran datafile).' },
        { term: 'Size Premium (SP)', def: 'Surcharge for idiosyncratic risk and small-business mortality: +2.00–3.00%.' },
      ],
    },
  },
  {
    id: 'informalidad',
    title: {
      es: '8. La sombra de la informalidad y su impacto valuatorio',
      en: '8. The shadow of informality and its valuation impact',
    },
    paras: {
      es: [
        'La estructura tributaria, la complejidad regulatoria y los procesos inflacionarios inducen la "subdeclaración" de ingresos incluso en empresas formalmente constituidas: contabilidades paralelas o elusión en la marginalidad para garantizar la subsistencia. Frecuentemente los propios empresarios carecen de instrumental para cuantificar sus márgenes reales o sus inventarios verdaderos.',
        'Esto bifurca la valuación: el valor contable declarado (balances ante AFIP/ARCA) está artificialmente deprimido; el valor económico intrínseco solo se captura apalancándose en la contribución real de las PyMEs al PBI. Pero en una transacción de M&A real, el choque destruye valor: el inversor institucional descuenta todos los flujos "no comprobables" — el capital profesional tiene impedido por compliance adquirir negocios sostenidos sobre evasión — y el vendedor debe sincerar pasivos y aceptar un precio drásticamente menor.',
        'En la práctica, la informalidad amplifica silenciosamente el DLOM: es una barrera que impide transformar el valor intrínseco en riqueza líquida transaccionable.',
      ],
      en: [
        'The tax structure, regulatory complexity and inflationary processes induce income "underreporting" even in formally incorporated companies: parallel books or marginal evasion to guarantee subsistence. Owners frequently lack the tooling to quantify their real margins or true inventories.',
        'This bifurcates valuation: the declared book value (filings with AFIP/ARCA) is artificially depressed; intrinsic economic value can only be captured by leveraging the SMEs\u2019 real contribution to GDP. But in a real M&A transaction the clash destroys value: the institutional investor discounts all "unverifiable" flows — professional capital is barred by compliance from acquiring businesses sustained on evasion — and the seller must come clean on liabilities and accept a drastically lower price.',
        'In practice, informality silently amplifies the DLOM: it is a barrier that prevents intrinsic value from turning into transactable liquid wealth.',
      ],
    },
  },
  {
    id: 'modelo',
    title: {
      es: '9. Modelización cuantitativa: la cifra aproximada',
      en: '9. Quantitative model: the approximate figure',
    },
    paras: {
      es: [
        'Con las premisas teóricas, los determinantes de riesgo y las fricciones del entorno argentino desglosadas, construimos el modelo: PBI nominal estabilizado de US$500.000 millones × 40% de contribución PyME = US$200.000 millones de valor agregado anual. Aplicando un margen conservador de flujo de caja libre del 12% (presión fiscal, salarios, CapEx de reposición): FCFF agregado de US$24.000 millones.',
        'Con WACC 27% y crecimiento a perpetuidad 2%, la tasa de capitalización es 25% — un múltiplo de apenas 4,0x. Enterprise Value teórico: US$96.000 millones. Aplicando el DLOM del 25% (punto medio del consenso académico): capitalización neta del sector privado ≈ US$72.000 millones.',
      ],
      en: [
        'With the theoretical premises, risk determinants and frictions of the Argentine environment laid out, we build the model: stabilized nominal GDP of US$500 billion × 40% SME contribution = US$200 billion of annual value added. Applying a conservative 12% free-cash-flow margin (tax pressure, wages, replacement CapEx): aggregate FCFF of US$24 billion.',
        'With a 27% WACC and 2% perpetuity growth, the capitalization rate is 25% — a multiple of barely 4.0x. Theoretical Enterprise Value: US$96 billion. Applying the 25% DLOM (midpoint of academic consensus): net private-sector capitalization ≈ US$72 billion.',
      ],
    },
    table: {
      head: {
        es: ['Parámetro', 'Valor (USD)', 'Justificación / fuente del insumo'],
        en: ['Parameter', 'Value (USD)', 'Justification / input source'],
      },
      rows: [
        ['PBI nominal estabilizado / Stabilized nominal GDP', 'US$500B', 'Proxy de consenso macro internacional / International macro consensus proxy'],
        ['Contribución PyME al PBI / SME share of GDP', '40%', 'CEPAL / sector bodies'],
        ['Valor agregado anual / Annual value added', 'US$200B', 'Derivación directa / Direct derivation'],
        ['Margen FCFF / FCFF margin', '12%', 'Presión fiscal, salarios, CapEx / Tax pressure, wages, CapEx'],
        ['FCFF agregado / Aggregate FCFF', 'US$24B', 'Base de efectivo descontable / Discountable cash base'],
        ['WACC (USD)', '27%', 'CAPM + CRP 18,21% (Moody\u2019s Ca — Damodaran)'],
        ['Crecimiento terminal (g) / Terminal growth (g)', '2%', 'Expectativa a perpetuidad / Perpetuity expectation'],
        ['Enterprise Value teórico / Theoretical EV', 'US$96B', 'FCFF / (WACC − g) = 24B / 25%'],
        ['DLOM', '−25%', 'Consenso académico 20–30% / Academic consensus 20–30%'],
        ['Equity value estimado / Estimated equity value', '~US$72B', 'Cifra final del modelo / Final model figure'],
      ],
    },
    note: {
      es: 'Las deudas financieras de largo plazo del sector PyME argentino son estadísticamente exiguas frente al volumen operativo: el Enterprise Value converge en gran medida con el Equity Value del ecosistema. Rango robusto del resultado: US$60.000–90.000 millones; escenario base de mayor rigurosidad: US$72.000 millones.',
      en: 'Long-term financial debt of the Argentine SME sector is statistically negligible relative to operating volume: Enterprise Value largely converges with the ecosystem\u2019s Equity Value. Robust result range: US$60–90 billion; most rigorous base case: US$72 billion.',
    },
  },
  {
    id: 'catalizadores',
    title: {
      es: '10. Perspectivas futuras y catalizadores de valor',
      en: '10. Future outlook and value catalysts',
    },
    paras: {
      es: [
        'El ecosistema no está condenado a esta valuación. Según PwC y KPMG, el RIGI (Régimen de Incentivo para Grandes Inversiones) promete inyectar más de US$150.000 millones en proyectos de infraestructura e hidrocarburos —especialmente Neuquén, Río Negro, Salta y San Juan— que actuarán como multiplicador sobre la base de la pirámide productiva: las grandes corporaciones traccionarán la cadena de proveedores PyME (metalmecánica, logística, servicios petroleros, IT), incrementando sus flujos de caja.',
        'La consolidación vía M&A de empresas medianas para formar proveedores de escala regional permitirá profesionalizar las prácticas contables (abandonar la informalidad) y mejorar el acceso a deuda corporativa estandarizada —factores que licúan el DLOM y reducen el WACC.',
        'Y cuando la economía comprima el riesgo soberano desde niveles distópicos (18%) hacia estándares regionales, la sola matemática del descuento de flujos provoca una revalorización exponencial (repricing): el ecosistema PyME argentino cuenta con la infraestructura física y el talento para duplicar su capitalización teórica, reclamando el valor que hoy le niega la coyuntura financiera.',
      ],
      en: [
        'The ecosystem is not condemned to this valuation. Per PwC and KPMG, the RIGI (Incentive Regime for Large Investments) promises to inject over US$150 billion into infrastructure and hydrocarbon projects —especially in Neuquén, Río Negro, Salta and San Juan— acting as a multiplier on the base of the productive pyramid: large corporations will pull the SME supplier chain (metalworking, logistics, oilfield services, IT), increasing their cash flows.',
        'M&A consolidation of mid-size companies into regional-scale suppliers will let them professionalize accounting practices (abandoning informality) and improve access to standardized corporate debt —factors that dilute the DLOM and lower the WACC.',
        'And when the economy compresses sovereign risk from dystopian levels (18%) toward regional standards, the discounted-cash-flow math alone triggers an exponential repricing: the Argentine SME ecosystem has the physical infrastructure and talent to double its theoretical capitalization, claiming back the value today denied by financial circumstances.',
      ],
    },
  },
];
