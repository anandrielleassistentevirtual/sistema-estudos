"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PREFS, type ConcreteTheme, type ReaderPrefs, type ReaderTheme } from "./types";

const KEY = "leitor-prefs-v2";
/** Níveis de zoom (100% = Times 12 pt). */
export const ZOOM = [75, 90, 100, 110, 125, 150, 175, 200, 250];

/** Preferências de leitura compartilhadas (livros e aulas). */
const MIGRADO = "leitor-tema-auto";

/** Lê as preferências salvas. Uma única vez, troca o antigo padrão "claro" por "auto" (seguir o sistema). */
export function loadPrefs(): ReaderPrefs | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p: ReaderPrefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    if (!localStorage.getItem(MIGRADO)) {
      if (p.theme === "claro") p.theme = "auto";
      localStorage.setItem(MIGRADO, "1");
      localStorage.setItem(KEY, JSON.stringify(p));
    }
    return p;
  } catch {
    return null;
  }
}

function appIsDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Tema real do leitor: "auto" vira claro ou escuro conforme o tema do sistema (e acompanha a troca). */
export function useEffectiveTheme(theme: ReaderTheme): ConcreteTheme {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(appIsDark());
    const o = new MutationObserver(() => setDark(appIsDark()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => o.disconnect();
  }, []);
  return theme === "auto" ? (dark ? "escuro" : "claro") : theme;
}

export function useReaderPrefs(): [ReaderPrefs, (p: ReaderPrefs | ((p: ReaderPrefs) => ReaderPrefs)) => void] {
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    const p = loadPrefs();
    if (p) setPrefs(p);
  }, []);
  const set = (p: ReaderPrefs | ((p: ReaderPrefs) => ReaderPrefs)) =>
    setPrefs((cur) => {
      const next = typeof p === "function" ? p(cur) : p;
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  return [prefs, set];
}

export function zoomOf(p: ReaderPrefs) {
  return Math.round((p.sizePt / 12) * 100);
}

export function stepZoom(p: ReaderPrefs, dir: 1 | -1): ReaderPrefs {
  const z = zoomOf(p);
  const next = dir > 0 ? ZOOM.find((x) => x > z + 1) : [...ZOOM].reverse().find((x) => x < z - 1);
  return next ? { ...p, sizePt: Math.round(((12 * next) / 100) * 10) / 10 } : p;
}
