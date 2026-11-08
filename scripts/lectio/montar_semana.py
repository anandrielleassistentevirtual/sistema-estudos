#!/usr/bin/env python3
"""
Monta a semana da Lectio Divina a partir da extração (extrair_catena.py) e da curadoria
(conteudo/lectio/curadoria-AAAA-MM-DD.json). CONFERE que cada trecho é cópia exata do
comentário original — se algum trecho não for encontrado, para com erro.

Uso:
    python3 -I montar_semana.py --extracao semana.json --curadoria curadoria.json > dias.json
"""
import argparse
import json
import re
import sys

URL_CATENA = "https://catenaaurea.com.br/?evangelho={livro}&capitulo={cap}"


def versiculos(texto: str):
    texto = re.sub(r"\s*-?\s*Palavra da [Ss]alva[çc][ãa]o\.?\s*$", "", texto.strip())
    partes = re.split(r"(?<![\d,])(\d{1,3})(?=[^\d,])", texto)
    intro = partes[0].strip()
    vs = [{"n": int(partes[k]), "texto": partes[k + 1].strip()} for k in range(1, len(partes) - 1, 2)]
    return intro, vs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extracao", required=True)
    ap.add_argument("--curadoria", required=True)
    a = ap.parse_args()
    ext = {d["dia"]: d for d in json.load(open(a.extracao, encoding="utf-8"))}
    cur = json.load(open(a.curadoria, encoding="utf-8"))
    saida, erros = [], []
    for dia, c in cur.items():
        if dia.startswith("_"):
            continue
        d = ext[dia]
        intro, vs = versiculos(d["evangelho"])
        chave = [v for v in vs if v["n"] in c["chave"]]
        if len(chave) != len(c["chave"]):
            erros.append(f"{dia}: versículo-chave {c['chave']} não encontrado")
        coms = []
        for item in c["comentarios"]:
            originais = [d["comentarios"][i] for i in item["i"]]
            fonte_txt = "\n".join(o["texto"] for o in originais)
            for t in item["trechos"]:
                if t not in fonte_txt:
                    erros.append(f"{dia} [{item['i']}]: trecho não é cópia exata → {t[:80]}…")
            o = originais[0]
            coms.append({
                "autor": o["autor"],
                "fonte": o["fonte"],
                "sobre": item.get("sobre", ""),
                "texto": " […] ".join(item["trechos"]),
                "destaque": bool(item.get("destaque")),
            })
        caps = d["catena"]["capitulos"]
        saida.append({
            "dia": dia, "liturgia": d["liturgia"], "cor": d["cor"],
            "referencia": d["referencia"], "titulo": d["titulo"],
            "introducao": intro, "versiculos": vs,
            "chave": " ".join(f"{v['texto']}" for v in chave),
            "chave_ref": f"{d['referencia'].split(',')[0]},{'-'.join(str(n) for n in c['chave'])}",
            "comentarios": coms,
            "catena_url": URL_CATENA.format(livro=d["catena"]["livro"], cap=caps[0]) if caps else "",
        })
    if erros:
        print("\n".join(erros), file=sys.stderr)
        sys.exit(1)
    json.dump(saida, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
