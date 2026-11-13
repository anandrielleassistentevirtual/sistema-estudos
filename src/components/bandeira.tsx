/**
 * Bandeiras desenhadas (SVG): aparecem iguais em qualquer aparelho — o Windows não mostra emoji de bandeira.
 * Simplificadas, no tamanho de um ícone.
 */
export const BANDEIRAS: { id: string; nome: string }[] = [
  { id: "us", nome: "Estados Unidos" },
  { id: "gb", nome: "Reino Unido" },
  { id: "br", nome: "Brasil" },
  { id: "pt", nome: "Portugal" },
  { id: "es", nome: "Espanha" },
  { id: "it", nome: "Itália" },
  { id: "fr", nome: "França" },
  { id: "de", nome: "Alemanha" },
  { id: "va", nome: "Vaticano (latim)" },
  { id: "gr", nome: "Grécia" },
  { id: "il", nome: "Israel (hebraico)" },
  { id: "ru", nome: "Rússia" },
  { id: "jp", nome: "Japão" },
  { id: "cn", nome: "China" },
];

/** Bandeira sugerida pelo nome do idioma. */
export function bandeiraDoIdioma(nome: string): string | null {
  const n = nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const m: [RegExp, string][] = [
    [/ingles|english/, "us"], [/portugues/, "br"], [/espanhol|spanish|castelhano/, "es"], [/italiano|italian/, "it"],
    [/frances|french/, "fr"], [/alemao|german|deutsch/, "de"], [/latim|latin/, "va"], [/grego|greek/, "gr"],
    [/hebraico|hebrew/, "il"], [/russo|russian/, "ru"], [/japones|japanese/, "jp"], [/mandarim|chines|chinese/, "cn"],
  ];
  return m.find(([r]) => r.test(n))?.[1] ?? null;
}

function Listras({ cores, vertical }: { cores: string[]; vertical?: boolean }) {
  const n = cores.length;
  return (
    <>
      {cores.map((c, i) => vertical
        ? <rect key={i} x={(30 / n) * i} y={0} width={30 / n + 0.2} height={20} fill={c} />
        : <rect key={i} x={0} y={(20 / n) * i} width={30} height={20 / n + 0.2} fill={c} />)}
    </>
  );
}

function Desenho({ id }: { id: string }) {
  switch (id) {
    case "us":
      return (
        <>
          {Array.from({ length: 13 }, (_, i) => <rect key={i} x={0} y={(20 / 13) * i} width={30} height={20 / 13 + 0.1} fill={i % 2 ? "#fff" : "#b22234"} />)}
          <rect x={0} y={0} width={12} height={(20 / 13) * 7} fill="#3c3b6e" />
          {Array.from({ length: 4 }, (_, r) => Array.from({ length: 5 }, (_, c) => (
            <circle key={`${r}-${c}`} cx={1.4 + c * 2.3 + (r % 2) * 1.1} cy={1.5 + r * 2.5} r={0.45} fill="#fff" />
          )))}
        </>
      );
    case "gb":
      return (
        <>
          <rect width={30} height={20} fill="#012169" />
          <path d="M0 0L30 20M30 0L0 20" stroke="#fff" strokeWidth={4} />
          <path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" strokeWidth={1.4} />
          <path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth={6} />
          <path d="M15 0V20M0 10H30" stroke="#c8102e" strokeWidth={3.4} />
        </>
      );
    case "br":
      return (
        <>
          <rect width={30} height={20} fill="#009c3b" />
          <path d="M15 2.5L27 10L15 17.5L3 10Z" fill="#ffdf00" />
          <circle cx={15} cy={10} r={4.6} fill="#002776" />
          <path d="M10.6 9.2Q15 8 19.4 10.6" stroke="#fff" strokeWidth={0.8} fill="none" />
        </>
      );
    case "pt":
      return (
        <>
          <rect width={30} height={20} fill="#da291c" />
          <rect width={12} height={20} fill="#046a38" />
          <circle cx={12} cy={10} r={3.6} fill="#ffe900" />
          <circle cx={12} cy={10} r={2.2} fill="#da291c" />
        </>
      );
    case "es":
      return (
        <>
          <Listras cores={["#aa151b", "#f1bf00", "#f1bf00", "#aa151b"]} />
          <rect x={6} y={7} width={3.6} height={6} rx={0.8} fill="#aa151b" opacity={0.85} />
        </>
      );
    case "it": return <Listras vertical cores={["#009246", "#fff", "#ce2b37"]} />;
    case "fr": return <Listras vertical cores={["#0055a4", "#fff", "#ef4135"]} />;
    case "de": return <Listras cores={["#000", "#dd0000", "#ffce00"]} />;
    case "ru": return <Listras cores={["#fff", "#0039a6", "#d52b1e"]} />;
    case "va":
      return (
        <>
          <rect width={15} height={20} fill="#ffe000" />
          <rect x={15} width={15} height={20} fill="#fff" />
          <path d="M20.5 7L24.5 13M24.5 7L20.5 13" stroke="#c8a400" strokeWidth={1.3} strokeLinecap="round" />
        </>
      );
    case "gr":
      return (
        <>
          {Array.from({ length: 9 }, (_, i) => <rect key={i} x={0} y={(20 / 9) * i} width={30} height={20 / 9 + 0.1} fill={i % 2 ? "#fff" : "#0d5eaf"} />)}
          <rect width={11.1} height={11.1} fill="#0d5eaf" />
          <path d="M5.55 0V11.1M0 5.55H11.1" stroke="#fff" strokeWidth={2.2} />
        </>
      );
    case "il":
      return (
        <>
          <rect width={30} height={20} fill="#fff" />
          <rect y={2} width={30} height={2.6} fill="#0038b8" />
          <rect y={15.4} width={30} height={2.6} fill="#0038b8" />
          <path d="M15 6.2L18.3 11.9H11.7ZM15 13.8L11.7 8.1H18.3Z" fill="none" stroke="#0038b8" strokeWidth={0.9} />
        </>
      );
    case "jp":
      return (<><rect width={30} height={20} fill="#fff" /><circle cx={15} cy={10} r={5.6} fill="#bc002d" /></>);
    case "cn":
      return (
        <>
          <rect width={30} height={20} fill="#de2910" />
          <path d="M5 3.2L5.9 6H8.8L6.5 7.7L7.4 10.5L5 8.8L2.6 10.5L3.5 7.7L1.2 6H4.1Z" fill="#ffde00" />
        </>
      );
    default:
      return <rect width={30} height={20} fill="var(--surface-2, #ccc)" />;
  }
}

export function Bandeira({ codigo, tamanho = 18, className = "" }: { codigo: string | null | undefined; tamanho?: number; className?: string }) {
  if (!codigo) return null;
  return (
    <svg viewBox="0 0 30 20" width={tamanho * 1.5} height={tamanho} className={`shrink-0 rounded-[3px] ${className}`}
      style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.12)" }} role="img" aria-label={BANDEIRAS.find((b) => b.id === codigo)?.nome ?? codigo}>
      <Desenho id={codigo} />
    </svg>
  );
}
