// Lemniscata de Bernoulli (infinito real, se cruza en el centro) + órbita diagonal estilo logo
const INFINITY_PATH =
  'M580,160 L578.9,173.6 L575.8,186.7 L570.7,199.2 L563.8,210.7 L555.4,220.9 L545.7,229.8 L535.1,237.1 L523.8,242.9 L512.1,247.2 L500.1,250.1 L488.2,251.6 L476.3,251.9 L464.7,251.1 L453.5,249.3 L442.6,246.7 L432.1,243.3 L422,239.3 L412.4,234.7 L403.1,229.7 L394.3,224.3 L385.8,218.6 L377.6,212.7 L369.8,206.5 L362.2,200.1 L354.8,193.6 L347.6,187 L340.6,180.3 L333.7,173.6 L326.8,166.8 L320,160 L313.2,153.2 L306.3,146.4 L299.4,139.7 L292.4,133 L285.2,126.4 L277.8,119.9 L270.2,113.5 L262.4,107.3 L254.2,101.4 L245.7,95.7 L236.9,90.3 L227.6,85.3 L218,80.7 L207.9,76.7 L197.4,73.3 L186.5,70.7 L175.3,68.9 L163.7,68.1 L151.8,68.4 L139.9,69.9 L127.9,72.8 L116.2,77.1 L104.9,82.9 L94.3,90.2 L84.6,99.1 L76.2,109.3 L69.3,120.8 L64.2,133.3 L61.1,146.4 L60,160 L61.1,173.6 L64.2,186.7 L69.3,199.2 L76.2,210.7 L84.6,220.9 L94.3,229.8 L104.9,237.1 L116.2,242.9 L127.9,247.2 L139.9,250.1 L151.8,251.6 L163.7,251.9 L175.3,251.1 L186.5,249.3 L197.4,246.7 L207.9,243.3 L218,239.3 L227.6,234.7 L236.9,229.7 L245.7,224.3 L254.2,218.6 L262.4,212.7 L270.2,206.5 L277.8,200.1 L285.2,193.6 L292.4,187 L299.4,180.3 L306.3,173.6 L313.2,166.8 L320,160 L326.8,153.2 L333.7,146.4 L340.6,139.7 L347.6,133 L354.8,126.4 L362.2,119.9 L369.8,113.5 L377.6,107.3 L385.8,101.4 L394.3,95.7 L403.1,90.3 L412.4,85.3 L422,80.7 L432.1,76.7 L442.6,73.3 L453.5,70.7 L464.7,68.9 L476.3,68.1 L488.2,68.4 L500.1,69.9 L512.1,72.8 L523.8,77.1 L535.1,82.9 L545.7,90.2 L555.4,99.1 L563.8,109.3 L570.7,120.8 L575.8,133.3 L578.9,146.4 Z';

const HERO_ORBIT = 'M 75.5 274.1 A 270 60 -25 1 0 564.7 45.9 A 270 60 -25 1 0 75.5 274.1';

export default function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -inset-x-6 sm:-inset-x-16 lg:-inset-x-40 inset-y-0 overflow-hidden">
      <svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" fill="none">
        <defs>
          <linearGradient id="heroInfL" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#20e0b8" />
          </linearGradient>
          <linearGradient id="heroInfR" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#20e0b8" />
            <stop offset="100%" stopColor="#3dff8f" />
          </linearGradient>
          <linearGradient id="heroInf" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#20e0b8" />
            <stop offset="100%" stopColor="#3dff8f" />
          </linearGradient>
          <linearGradient id="heroBand" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="#20e0b8" />
            <stop offset="100%" stopColor="#3dff8f" />
          </linearGradient>
          <filter id="heroGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>
        {/* órbita diagonal detrás (estilo logo) */}
        <g className="globe-float">
          <path d={HERO_ORBIT} stroke="url(#heroBand)" strokeWidth="12" opacity="0.07" />
          <path d={HERO_ORBIT} stroke="url(#heroBand)" strokeWidth="12" strokeLinecap="round" strokeDasharray="46 18" opacity="0.09" className="infinity-drift-rev" />
        </g>
        {/* infinito: cinta lemniscata con gradiente azul→teal→verde */}
        <g className="globe-float">
          <path d={INFINITY_PATH} stroke="#20e0b8" strokeWidth="46" strokeLinecap="round" opacity="0.045" filter="url(#heroGlow)" />
          <path d={INFINITY_PATH} stroke="url(#heroInf)" strokeWidth="30" strokeLinecap="round" opacity="0.1" />
          <path d={INFINITY_PATH} stroke="url(#heroInf)" strokeWidth="30" strokeLinecap="round" strokeDasharray="46 18" opacity="0.15" className="infinity-drift" />
          <path d={INFINITY_PATH} stroke="#f0b429" strokeWidth="4" strokeLinecap="round" strokeDasharray="110 18 110 18" opacity="0.26" className="infinity-drift-rev" />
          <path d={INFINITY_PATH} stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeDasharray="60 196" opacity="0.18" className="infinity-drift" />
        </g>
        {/* nodos en las puntas de los lóbulos, como el logo */}
        <circle cx="60" cy="160" r="7" fill="#38bdf8" opacity="0.4" />
        <circle cx="42" cy="138" r="3.5" fill="#38bdf8" opacity="0.3" />
        <circle cx="46" cy="184" r="3" fill="#38bdf8" opacity="0.28" />
        <circle cx="580" cy="160" r="7" fill="#3dff8f" opacity="0.4" />
        <circle cx="600" cy="140" r="3.5" fill="#3dff8f" opacity="0.3" />
        <circle cx="604" cy="182" r="3" fill="#3dff8f" opacity="0.28" />
        <circle cx="320" cy="160" r="5" fill="#20e0b8" opacity="0.4" />
        <circle cx="452" cy="120" r="6" fill="#f0b429" opacity="0.4" />
        {/* partículas viajando por el infinito y la órbita */}
        {[-6, -3, 0].map((begin) => (
          <circle key={`g${begin}`} r="4" fill="#3dff8f" opacity="0.4">
            <animateMotion dur="9s" begin={`${begin}s`} repeatCount="indefinite" path={INFINITY_PATH} />
          </circle>
        ))}
        {[-4, -9].map((begin) => (
          <circle key={`t${begin}`} r="3" fill="#20e0b8" opacity="0.36">
            <animateMotion dur="12s" begin={`${begin}s`} repeatCount="indefinite" path={INFINITY_PATH} />
          </circle>
        ))}
        <circle r="3" fill="#f0b429" opacity="0.4">
          <animateMotion dur="14s" begin="-7s" repeatCount="indefinite" path={INFINITY_PATH} />
        </circle>
        <circle r="3.5" fill="#1d7fc4" opacity="0.36">
          <animateMotion dur="13s" begin="-4s" repeatCount="indefinite" path={HERO_ORBIT} />
        </circle>
        <circle r="3" fill="#3dff8f" opacity="0.36">
          <animateMotion dur="16s" begin="-10s" repeatCount="indefinite" path={HERO_ORBIT} />
        </circle>
        {/* ambient */}
        <circle cx="92" cy="248" r="36" fill="#1d7fc4" opacity="0.06" filter="url(#heroGlow)" />
        <circle cx="556" cy="76" r="44" fill="#3dff8f" opacity="0.06" filter="url(#heroGlow)" />
        <g className="globe-float">
          <circle cx="90" cy="48" r="2.4" fill="#3dff8f" opacity="0.3" />
          <circle cx="556" cy="52" r="3" fill="#3dff8f" opacity="0.26" />
          <circle cx="48" cy="264" r="2.8" fill="#3dff8f" opacity="0.24" />
          <circle cx="592" cy="272" r="2.2" fill="#3dff8f" opacity="0.3" />
          <circle cx="320" cy="26" r="2" fill="#3dff8f" opacity="0.26" />
        </g>
        <circle cx="140" cy="70" r="14" stroke="#3dff8f" strokeWidth="1" opacity="0.12" />
        <circle cx="505" cy="255" r="18" stroke="#3dff8f" strokeWidth="1" opacity="0.1" />
        <circle cx="70" cy="200" r="9" stroke="#3dff8f" strokeWidth="1" opacity="0.12" />
        <circle cx="600" cy="110" r="22" stroke="#3dff8f" strokeWidth="1" opacity="0.09" strokeDasharray="3 5" />
        <path d="M40 96v10M35 101h10" stroke="#3dff8f" strokeWidth="1.4" opacity="0.22" strokeLinecap="round" />
        <path d="M604 210v10M599 215h10" stroke="#3dff8f" strokeWidth="1.4" opacity="0.2" strokeLinecap="round" />
        <path d="M210 286v8M206 290h8" stroke="#3dff8f" strokeWidth="1.4" opacity="0.18" strokeLinecap="round" />
        <rect x="530" y="30" width="7" height="7" rx="1.5" stroke="#3dff8f" strokeWidth="1" opacity="0.18" transform="rotate(18 533.5 33.5)" />
        <rect x="118" y="250" width="6" height="6" rx="1.2" stroke="#3dff8f" strokeWidth="1" opacity="0.16" transform="rotate(24 121 253)" />
      </svg>
    </div>
  );
}
