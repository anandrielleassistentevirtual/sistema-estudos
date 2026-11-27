"use client";
import { MODOS_FOCO } from "./foco-trecho";
import { DEFAULT_PREFS, FONTS, THEMES, type ReaderFont, type ReaderPrefs } from "./types";

/** Painel "Aa" do leitor (livros e aulas): tema, fonte, tamanho, entrelinha e alinhamento. */
export function PrefsPanel({ prefs, setPrefs }: { prefs: ReaderPrefs; setPrefs: (p: ReaderPrefs) => void }) {
  return (
          <div className="absolute right-3 top-3 z-30 card p-4 w-72 space-y-4 text-ink shadow-xl">
            <div>
              <div className="label mb-2">Tema</div>
              <div className="flex gap-2">
                <button onClick={() => setPrefs({ ...prefs, theme: "auto" })} title="Acompanha o tema do sistema (claro ou escuro)"
                  className={`flex-1 rounded-lg border py-2 text-xs bg-surface text-ink ${prefs.theme === "auto" ? "border-muted" : "border-line"}`}>
                  Sistema
                </button>
                {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((k) => (
                  <button key={k} onClick={() => setPrefs({ ...prefs, theme: k })}
                    className={`flex-1 rounded-lg border py-2 text-xs ${prefs.theme === k ? "border-muted" : "border-line"}`}
                    style={{ background: THEMES[k].bg, color: THEMES[k].fg }}>
                    {THEMES[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-2">Fonte</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(FONTS) as ReaderFont[]).map((f) => (
                  <button key={f} onClick={() => setPrefs({ ...prefs, font: f })}
                    className={`btn justify-center text-xs px-1 ${prefs.font === f ? "border-muted" : ""}`}
                    style={{ fontFamily: FONTS[f].css }}>
                    {f === "times" ? "Times" : FONTS[f].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-2 flex justify-between"><span>Tamanho</span><span className="normal-case">{prefs.sizePt} pt</span></div>
              <div className="flex items-center gap-2">
                <button className="btn px-2.5" onClick={() => setPrefs({ ...prefs, sizePt: Math.max(9, prefs.sizePt - 1) })}>A−</button>
                <input type="range" min={9} max={30} step={0.5} value={prefs.sizePt} className="flex-1"
                  onChange={(e) => setPrefs({ ...prefs, sizePt: Number(e.target.value) })} />
                <button className="btn px-2.5" onClick={() => setPrefs({ ...prefs, sizePt: Math.min(30, prefs.sizePt + 1) })}>A+</button>
              </div>
            </div>
            <div>
              <div className="label mb-2">Espaçamento entre linhas</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 1.15, 1.5, 2].map((lh) => (
                  <button key={lh} onClick={() => setPrefs({ ...prefs, lineHeight: lh })}
                    className={`btn justify-center text-xs px-1 ${prefs.lineHeight === lh ? "border-muted" : ""}`}>
                    {String(lh).replace(".", ",")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-2">Alinhamento</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button className={`btn justify-center text-xs ${prefs.justify ? "border-muted" : ""}`} onClick={() => setPrefs({ ...prefs, justify: true })}>Justificado</button>
                <button className={`btn justify-center text-xs ${!prefs.justify ? "border-muted" : ""}`} onClick={() => setPrefs({ ...prefs, justify: false })}>À esquerda</button>
              </div>
            </div>
            <div>
              <div className="label mb-2">Foco no trecho</div>
              <div className="grid grid-cols-3 gap-1.5">
                {MODOS_FOCO.map((m) => (
                  <button key={m.id} onClick={() => setPrefs({ ...prefs, foco: m.id })}
                    className={`btn justify-center text-xs px-1 ${(prefs.foco ?? "off") === m.id ? "border-muted" : ""}`}>{m.nome}</button>
                ))}
              </div>
              <p className="text-xs text-muted mt-1.5 leading-snug">
                {(prefs.foco ?? "off") === "off"
                  ? "O texto fica nublado e o trecho sob o mouse, nítido e em relevo."
                  : prefs.foco === "frase"
                    ? "Todo o texto nublado; só a frase sob o mouse fica nítida."
                    : "O parágrafo sob o mouse fica nítido e em relevo; o resto, nublado."}
              </p>
            </div>
            <button className="text-xs text-accent" onClick={() => setPrefs({ ...DEFAULT_PREFS, theme: prefs.theme, foco: prefs.foco })}>
              Voltar ao padrão (Times 12, justificado, 1,5)
            </button>
            <p className="text-xs text-muted">Use ← e → do teclado ou toque nas bordas para virar a página.</p>
          </div>
  );
}
