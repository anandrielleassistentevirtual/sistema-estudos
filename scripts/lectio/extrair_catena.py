#!/usr/bin/env python3
"""
Extrai, para os Evangelhos de um intervalo de datas, os comentários dos Padres da
Catena Aurea (catenaaurea.com.br) — um por um, com autor e obra — para a curadoria.

Os arquivos data/<evangelho>.js do site são lidos SÓ COMO DADOS (JSON), nunca executados.

Uso:
    python3 -I extrair_catena.py --de 2026-11-08 --ate 2026-11-14 --dados <pasta> > semana.json

<pasta> precisa ter mateus.js, marcos.js, lucas.js, joao.js baixados de
https://catenaaurea.com.br/data/<nome>.js
A liturgia vem de https://liturgia.up.railway.app/v2/?dia=DD&mes=MM&ano=AAAA
"""
import argparse
import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path

LIVROS = {"Mt": "mateus", "Mc": "marcos", "Lc": "lucas", "Jo": "joao"}
# "São João Crisóstomo. (Hom. 78) texto…"  /  "Beda. texto…"  /  "Glosa. texto"
AUTOR = re.compile(r"^((?:S(?:ão|anto|anta)|Beato|Papa|Orígenes|Beda|Glosa|Teofilato|Remígio|Rábano|Pseudo|Teófilo|Eusébio|Tito|Severiano|Crisóstomo|Ambrósio|Agostinho|Jerônimo|Hilário|Gregório|Cirilo|Atanásio|Basílio|Leão|Isidoro|Máximo|Dídimo|Alcuíno|Apolinário|Pedro|Anselmo|Cipriano|Gelásio|Ireneu|Josefo|Concílio|Autor|Comentário)[^.()]{0,60})\.\s*(\(([^)]{1,120})\))?\s*", re.U)


def carregar(pasta: Path, livro: str) -> dict:
    t = (pasta / f"{livro}.js").read_text(encoding="utf-8")
    m = re.search(r'window\.CATENA_DATA\["%s"\]\s*=\s*' % livro, t)
    if not m:
        raise SystemExit(f"{livro}.js em formato inesperado")
    return json.loads(t[m.end():].rstrip().rstrip(";"))


def liturgia(d: dt.date) -> dict:
    url = f"https://liturgia.up.railway.app/v2/?dia={d.day:02d}&mes={d.month:02d}&ano={d.year}"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "sistema-estudos"}), timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def faixas(ref: str):
    """'Lc 17,7-10' / 'Mt 5,1-12a' / 'Jo 6,51-58' / 'Lc 9,51–10,12' -> (abbr, [(cap, v1, cap2, v2)])"""
    m = re.match(r"\s*(Mt|Mc|Lc|Jo)\s+(.+)$", ref)
    if not m:
        return None, []
    abbr, resto = m.group(1), m.group(2)
    out = []
    cap = None
    for parte in re.split(r"[.;]\s*", resto):
        parte = parte.strip()
        if not parte:
            continue
        mm = re.match(r"(?:(\d+),)?(\d+)[a-z]?(?:\s*[-–]\s*(?:(\d+),)?(\d+)[a-z]?)?$", parte)
        if not mm:
            continue
        c1 = int(mm.group(1)) if mm.group(1) else cap
        v1 = int(mm.group(2))
        c2 = int(mm.group(3)) if mm.group(3) else c1
        v2 = int(mm.group(4)) if mm.group(4) else v1
        cap = c2
        out.append((c1, v1, c2, v2))
    return abbr, out


def secoes(dados: dict, abbr_faixas):
    """Seções da Catena que cruzam as faixas do Evangelho."""
    res = []
    for (c1, v1, c2, v2) in abbr_faixas:
        for cap in range(c1, c2 + 1):
            secs = dados["commentary"].get(str(cap), [])
            for sec in (secs.values() if isinstance(secs, dict) else secs):
                r = re.match(r"(\d+):(\d+)(?:\s*[-–]\s*(?:(\d+):)?(\d+))?", sec["range"])
                if not r:
                    continue
                sc, sv1 = int(r.group(1)), int(r.group(2))
                sv2 = int(r.group(4)) if r.group(4) else sv1
                lo = v1 if cap == c1 else 1
                hi = v2 if cap == c2 else 999
                if sc == cap and sv1 <= hi and sv2 >= lo and sec not in res:
                    res.append(sec)
    return res


def comentarios(sec: dict):
    """Separa o texto da seção em versículos (início) e comentários dos Padres."""
    paras = [p.strip() for p in re.split(r"\n+", sec["text"]) if p.strip()]
    out = []
    for p in paras:
        if re.match(r"^\d+\.\s", p):  # versículo do Evangelho
            continue
        m = AUTOR.match(p)
        if m:
            out.append({"autor": m.group(1).strip(), "fonte": (m.group(3) or "").strip(), "texto": p[m.end():].strip(), "secao": sec["range"]})
        elif out:
            out[-1]["texto"] += "\n\n" + p
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--de", required=True)
    ap.add_argument("--ate", required=True)
    ap.add_argument("--dados", required=True, type=Path)
    a = ap.parse_args()
    cache = {}
    d = dt.date.fromisoformat(a.de)
    fim = dt.date.fromisoformat(a.ate)
    semana = []
    while d <= fim:
        lit = liturgia(d)
        ev = lit["leituras"]["evangelho"][0]
        abbr, fx = faixas(ev["referencia"])
        livro = LIVROS.get(abbr or "")
        coms = []
        if livro:
            if livro not in cache:
                cache[livro] = carregar(a.dados, livro)
            for sec in secoes(cache[livro], fx):
                coms.extend(comentarios(sec))
        semana.append({
            "dia": d.isoformat(), "liturgia": lit["liturgia"], "cor": lit["cor"],
            "referencia": ev["referencia"], "titulo": ev.get("titulo", ""), "evangelho": ev["texto"],
            "catena": {"livro": livro, "capitulos": sorted({c for f in fx for c in range(f[0], f[2] + 1)})},
            "comentarios": coms,
        })
        d += dt.timedelta(days=1)
    json.dump(semana, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
