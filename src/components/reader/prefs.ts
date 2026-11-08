"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PREFS, type ReaderPrefs } from "./types";

const KEY = "leitor-prefs-v2";
/** Níveis de zoom (100% = Times 12 pt). */
export const ZOOM = [75, 90, 100, 110, 125, 150, 175, 200, 250];

/** Preferências de leitura compartilhadas (livros e aulas). */
export function useReaderPrefs(): [ReaderPrefs, (p: ReaderPrefs | ((p: ReaderPrefs) => ReaderPrefs)) => void] {
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    try {
      const p = localStorage.getItem(KEY);
      if (p) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(p) });
    } catch {}
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
