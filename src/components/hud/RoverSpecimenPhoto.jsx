import React, { useId } from 'react';

function LeopardMudstoneSvg({ gradId }) {
  const spots = [
    { x: 64, y: 42, rx: 11, ry: 8 },
    { x: 108, y: 58, rx: 14, ry: 9 },
    { x: 148, y: 38, rx: 9, ry: 7 },
    { x: 86, y: 84, rx: 13, ry: 10 },
    { x: 175, y: 76, rx: 12, ry: 8 },
    { x: 132, y: 104, rx: 15, ry: 10 },
    { x: 204, y: 98, rx: 10, ry: 7 },
  ];

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8c3b23" />
          <stop offset="55%" stopColor="#6f2d1b" />
          <stop offset="100%" stopColor="#542115" />
        </linearGradient>
      </defs>
      <rect width="260" height="140" fill={`url(#${gradId})`} />
      {/* White Ca-sulfate parallel veins */}
      <path d="M-10,28 Q75,20 155,34 T275,26" stroke="#e7dfd3" strokeWidth="5.5" fill="none" opacity="0.88" />
      <path d="M-10,118 Q95,108 180,122 T275,112" stroke="#ded4c5" strokeWidth="4" fill="none" opacity="0.8" />
      {/* Sedimentary laminations */}
      <path d="M0,66 Q120,60 260,72" stroke="#471a0e" strokeWidth="1.4" fill="none" opacity="0.55" />
      <path d="M0,92 Q130,86 260,96" stroke="#a65439" strokeWidth="1.2" fill="none" opacity="0.45" />
      {/* Leopard spots: dark Fe-phosphate rim + pale redox core */}
      {spots.map((s, idx) => (
        <g key={idx}>
          <ellipse cx={s.x} cy={s.y} rx={s.rx + 2.6} ry={s.ry + 2.2} fill="#1f1512" opacity="0.86" />
          <ellipse cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill="#d7cfc2" opacity="0.92" />
          <ellipse cx={s.x - 1} cy={s.y - 0.5} rx={s.rx * 0.45} ry={s.ry * 0.45} fill="#b5aa99" opacity="0.65" />
        </g>
      ))}
    </>
  );
}

function AbradedBasaltSvg({ gradId }) {
  const grains = [
    { x: 108, y: 54, r: 4, c: '#74856e' },
    { x: 146, y: 50, r: 3.5, c: '#cbd5e1' },
    { x: 118, y: 84, r: 4.5, c: '#8c9c7d' },
    { x: 152, y: 82, r: 3.2, c: '#e2e8f0' },
    { x: 96, y: 70, r: 3.8, c: '#9ca3af' },
    { x: 162, y: 66, r: 4.2, c: '#6f7e69' },
    { x: 132, y: 44, r: 3.0, c: '#f1f5f9' },
    { x: 136, y: 94, r: 3.5, c: '#64748b' },
  ];

  return (
    <>
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="65%" stopColor="#475569" />
          <stop offset="100%" stopColor="#334155" />
        </radialGradient>
      </defs>
      {/* Rusty un-abraded basalt exterior */}
      <rect width="260" height="140" fill="#5e3222" />
      <circle cx="38" cy="30" r="18" fill="#49271b" opacity="0.7" />
      <circle cx="225" cy="112" r="24" fill="#7c422c" opacity="0.65" />
      {/* 45mm Circular Rover Abrasion Patch & Tailings Halo */}
      <circle cx="130" cy="70" r="49" fill="#9c593c" opacity="0.55" />
      <circle cx="130" cy="70" r="40" fill={`url(#${gradId})`} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 2" />
      {/* Interlocking crystals & sulfate-filled vesicles */}
      {grains.map((g, i) => (
        <circle key={i} cx={g.x} cy={g.y} r={g.r} fill={g.c} opacity="0.9" />
      ))}
      {/* Central rotary drill core borehole */}
      <circle cx="130" cy="70" r="10.5" fill="#0f172a" stroke="#cbd5e1" strokeWidth="1.2" />
    </>
  );
}

function BoxworkVeinSvg({ gradId }) {
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6d3a27" />
          <stop offset="100%" stopColor="#482519" />
        </linearGradient>
      </defs>
      <rect width="260" height="140" fill={`url(#${gradId})`} />
      {/* Intersecting dark Fe-oxide alteration halos under veins */}
      <path d="M12,-8 L112,148" stroke="#2c1710" strokeWidth="16" opacity="0.6" />
      <path d="M235,-5 L68,145" stroke="#2c1710" strokeWidth="14" opacity="0.55" />
      <path d="M-8,82 L270,54" stroke="#2c1710" strokeWidth="13" opacity="0.55" />
      {/* Raised bright CaSO4 / gypsum boxwork veins */}
      <path d="M12,-8 L112,148" stroke="#efe6da" strokeWidth="7.5" />
      <path d="M235,-5 L68,145" stroke="#e5d7c6" strokeWidth="6.5" />
      <path d="M-8,82 L270,54" stroke="#dfd0bd" strokeWidth="5.5" />
      <path d="M148,14 L245,126" stroke="#d9c6b0" strokeWidth="4.2" />
    </>
  );
}

function SheepbedDrillSvg({ gradId }) {
  return (
    <>
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="55%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#7a422b" />
        </radialGradient>
      </defs>
      {/* Ferric dust surface crust */}
      <rect width="260" height="140" fill="#7c422b" />
      {/* Fine anhydrite veinlets */}
      <path d="M18,22 L242,46" stroke="#cbd5e1" strokeWidth="1.6" opacity="0.7" />
      <path d="M25,112 L228,95" stroke="#e2e8f0" strokeWidth="1.8" opacity="0.65" />
      {/* Gray-blue pulverized smectite clay drill tailings cone */}
      <circle cx="130" cy="70" r="39" fill={`url(#${gradId})`} opacity="0.95" />
      <circle cx="130" cy="70" r="24" fill="#cbd5e1" opacity="0.5" />
      {/* Central 16mm drill borehole */}
      <circle cx="130" cy="70" r="13" fill="#0b1120" stroke="#94a3b8" strokeWidth="1.5" />
    </>
  );
}

function SublimatingIceSvg({ gradId }) {
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7d3e27" />
          <stop offset="60%" stopColor="#5c2b1a" />
          <stop offset="100%" stopColor="#3c1b10" />
        </linearGradient>
      </defs>
      <rect width="260" height="140" fill={`url(#${gradId})`} />
      {/* Trench sidewall shadows */}
      <path d="M26,28 L234,24 L218,116 L42,112 Z" fill="#2c140c" opacity="0.78" />
      {/* Bright crystalline sublimating water-ice table in trench floor */}
      <polygon points="56,42 152,36 184,78 135,104 62,96" fill="#e0f2fe" opacity="0.95" />
      <polygon points="82,48 144,44 166,74 128,96 74,88" fill="#bae6fd" opacity="0.75" />
      <polygon points="164,52 204,48 198,92 170,88" fill="#f0f9ff" opacity="0.9" />
      {/* Soil clumps & scoop tines */}
      <circle cx="48" cy="94" r="6" fill="#512517" />
      <circle cx="210" cy="40" r="5" fill="#6d3421" />
      <path d="M188,24 L208,34 M194,20 L214,30 M200,16 L220,26" stroke="#38bdf8" strokeWidth="1" opacity="0.45" />
    </>
  );
}

function AeolianRegolithSvg({ gradId }) {
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#43281e" />
          <stop offset="50%" stopColor="#2b1e1a" />
          <stop offset="100%" stopColor="#1e1715" />
        </linearGradient>
      </defs>
      <rect width="260" height="140" fill={`url(#${gradId})`} />
      {/* Asymmetric wind-sorted basaltic sand ripple crests */}
      {[18, 42, 68, 94, 120].map((y, idx) => (
        <g key={idx}>
          <path d={`M-10,${y + 6} Q130,${y - 8} 270,${y + 5}`} stroke="#b35c38" strokeWidth="7" fill="none" opacity="0.7" />
          <path d={`M-10,${y + 9} Q130,${y - 5} 270,${y + 8}`} stroke="#161414" strokeWidth="3.5" fill="none" opacity="0.85" />
        </g>
      ))}
      {/* Olivine/basalt coarse armored crest grains */}
      {[34, 72, 114, 152, 198, 224].map((x, i) => (
        <circle key={i} cx={x} cy={62 + (i % 3) * 14} r="2.2" fill="#9ca3af" opacity="0.75" />
      ))}
    </>
  );
}

function CarbonateSilicaSvg({ gradId, opaline = false }) {
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={opaline ? '#94a3b8' : '#b89f82'} />
          <stop offset="50%" stopColor={opaline ? '#64748b' : '#8d7357'} />
          <stop offset="100%" stopColor={opaline ? '#475569' : '#6b533b'} />
        </linearGradient>
      </defs>
      <rect width="260" height="140" fill={`url(#${gradId})`} />
      {/* Hydrated carbonate/silica nodules & crust polygons */}
      <path d="M10,48 L92,38 L145,76 L248,54" stroke="#f8fafc" strokeWidth="2.5" fill="none" opacity="0.75" />
      <path d="M40,120 L118,88 L195,122" stroke="#cbd5e1" strokeWidth="2" fill="none" opacity="0.65" />
      <circle cx="88" cy="64" r="14" fill={opaline ? '#bae6fd' : '#e7dcc8'} opacity="0.78" />
      <circle cx="164" cy="54" r="18" fill={opaline ? '#e0f2fe' : '#ddd0ba'} opacity="0.72" />
      <circle cx="132" cy="102" r="11" fill="#5c4028" opacity="0.6" />
      <circle cx="72" cy="96" r="4" fill="#4d5e43" opacity="0.85" />
      <circle cx="188" cy="88" r="5" fill="#4d5e43" opacity="0.85" />
    </>
  );
}

function SulfateMudstoneSvg({ gradId }) {
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9c5637" />
          <stop offset="50%" stopColor="#7a4029" />
          <stop offset="100%" stopColor="#5e2e1d" />
        </linearGradient>
      </defs>
      <rect width="260" height="140" fill={`url(#${gradId})`} />
      {/* Fine horizontal laminated mudstone strata & gypsum nodules */}
      {[20, 34, 50, 66, 82, 98, 114, 128].map((y, idx) => (
        <path
          key={idx}
          d={`M0,${y} Q130,${y + (idx % 2 === 0 ? 4 : -4)} 260,${y}`}
          stroke={idx % 3 === 0 ? '#e5d4be' : '#4a2113'}
          strokeWidth={idx % 3 === 0 ? 2.4 : 1.5}
          fill="none"
          opacity="0.78"
        />
      ))}
      <ellipse cx="95" cy="58" rx="16" ry="5" fill="#f1e6d8" opacity="0.82" />
      <ellipse cx="176" cy="90" rx="19" ry="5.5" fill="#eadbca" opacity="0.8" />
    </>
  );
}

function SpecimenArtwork({ styleName, gradId }) {
  switch (styleName) {
    case 'leopard-mudstone':
      return <LeopardMudstoneSvg gradId={gradId} />;
    case 'abraded-basalt':
      return <AbradedBasaltSvg gradId={gradId} />;
    case 'boxwork-vein':
      return <BoxworkVeinSvg gradId={gradId} />;
    case 'sheepbed-drill':
      return <SheepbedDrillSvg gradId={gradId} />;
    case 'sublimating-ice':
      return <SublimatingIceSvg gradId={gradId} />;
    case 'aeolian-regolith':
      return <AeolianRegolithSvg gradId={gradId} />;
    case 'carbonate-crust':
      return <CarbonateSilicaSvg gradId={gradId} opaline={false} />;
    case 'opal-silica':
      return <CarbonateSilicaSvg gradId={gradId} opaline />;
    case 'sulfate-mudstone':
    default:
      return <SulfateMudstoneSvg gradId={gradId} />;
  }
}

export default function RoverSpecimenPhoto({ target, compact = false }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `specimen-${uid}`;

  if (!target) return null;

  return (
    <div
      className={`relative overflow-hidden rounded border border-sky-400/35 bg-black/80 ${
        compact ? 'h-12 w-20 shrink-0' : 'w-full'
      }`}
    >
      <svg
        viewBox="0 0 260 140"
        className="block h-full w-full object-cover"
        preserveAspectRatio="xMidYMid slice"
        aria-label={target.name}
      >
        <SpecimenArtwork styleName={target.specimenStyle} gradId={gradId} />

        {/* Subtle NASA Rover Optical Vignette & Fiducial Crosshair Overlay */}
        <line x1="130" y1="58" x2="130" y2="82" stroke="#38bdf8" strokeWidth="0.9" opacity="0.55" />
        <line x1="118" y1="70" x2="142" y2="70" stroke="#38bdf8" strokeWidth="0.9" opacity="0.55" />
        {!compact && (
          <>
            <path d="M12,20 L12,12 L20,12" stroke="#ffffff" strokeWidth="1.2" fill="none" opacity="0.65" />
            <path d="M240,12 L248,12 L248,20" stroke="#ffffff" strokeWidth="1.2" fill="none" opacity="0.65" />
            <path d="M12,120 L12,128 L20,128" stroke="#ffffff" strokeWidth="1.2" fill="none" opacity="0.65" />
            <path d="M240,128 L248,128 L248,120" stroke="#ffffff" strokeWidth="1.2" fill="none" opacity="0.65" />
          </>
        )}
      </svg>

      {!compact ? (
        <>
          <div className="absolute top-1.5 left-2 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[8.5px] tracking-wider text-sky-300 backdrop-blur-xs">
            ROVER MACRO IMAGERY
          </div>
          <div className="absolute right-2 bottom-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[8.5px] text-white/85">
            <span className="inline-block h-0.5 w-4 bg-white/90" />
            <span>10 mm</span>
          </div>
        </>
      ) : (
        <div className="absolute right-1 bottom-0.5 font-mono text-[7px] text-white/75">10mm</div>
      )}
    </div>
  );
}
