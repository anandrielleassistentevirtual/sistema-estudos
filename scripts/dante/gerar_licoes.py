#!/usr/bin/env python3
"""
Gera lições de leitura e escuta da Divina Comédia (texto + tradução + áudio sincronizado).

Cada canto é dividido em lições de ~30 versos (sempre fechando um terceto). Para cada
lição sai uma pasta no padrão de conteudo/README.md:

    licao.json  texto.txt  traducao.txt  audio.mp3  tempos.vtt

O áudio é gerado verso a verso com uma voz neural italiana (Piper), então os tempos de
cada verso são exatos — clicar no verso no site toca exatamente aquele verso.

Uso:
    python gerar_licoes.py --texto commedia.txt --voz it_IT-paola-medium.onnx \
        --cantica Inferno --cantos 1 2 3 --saida ../../conteudo/idiomas/italiano/divina-commedia-inferno

Requisitos: piper-tts (pip), ffmpeg no PATH. Texto: Project Gutenberg #1012 (domínio público).
Traduções: conteudo/idiomas/italiano/traducoes/<cantica>-<NN>.txt (um verso por linha).
"""
import argparse
import json
import re
import subprocess
import tempfile
import wave
from pathlib import Path

ROMANOS = {1: "I", 4: "IV", 5: "V", 9: "IX", 10: "X", 40: "XL", 50: "L"}


def romano(n: int) -> str:
    out = ""
    for v in sorted(ROMANOS, reverse=True):
        while n >= v:
            out += ROMANOS[v]
            n -= v
    return out


def ler_cantos(caminho: Path, cantica: str) -> dict[int, list[str]]:
    t = caminho.read_text(encoding="utf-8").replace("\r", "")
    partes = re.split(r"\n\s*(Inferno|Purgatorio|Paradiso) • Canto ([IVXLC]+)\s*\n", t)
    cantos: dict[int, list[str]] = {}
    for i in range(1, len(partes) - 2, 3):
        c, num, corpo = partes[i], partes[i + 1], partes[i + 2]
        if c != cantica:
            continue
        n = next(k for k in range(1, 40) if romano(k) == num)
        corpo = corpo.split("*** END OF")[0]
        cantos[n] = [l.strip() for l in corpo.split("\n") if l.strip()]
    return cantos


def dividir(versos: list[str], tamanho: int = 30) -> list[tuple[int, int]]:
    """Intervalos [ini, fim) de ~tamanho versos, múltiplos de 3; sobra pequena junta na anterior."""
    faixas, i = [], 0
    while i < len(versos):
        fim = min(len(versos), i + tamanho)
        if len(versos) - fim < 10:
            fim = len(versos)
        faixas.append((i, fim))
        i = fim
    return faixas


def falar(voz, verso: str, destino: Path, cfg) -> float:
    texto = verso.replace("’", "'").replace("«", "").replace("»", "").replace("‘", "'")
    with wave.open(str(destino), "wb") as w:
        voz.synthesize_wav(texto, w, syn_config=cfg)
    with wave.open(str(destino)) as w:
        return w.getnframes() / w.getframerate()


def silencio(destino: Path, segundos: float, taxa: int):
    with wave.open(str(destino), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes(b"\x00\x00" * int(segundos * taxa))


def vtt_tempo(s: float) -> str:
    h, r = divmod(s, 3600)
    m, r = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{r:06.3f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--texto", required=True, type=Path)
    ap.add_argument("--voz", required=True, type=Path)
    ap.add_argument("--cantica", default="Inferno")
    ap.add_argument("--cantos", type=int, nargs="+", required=True)
    ap.add_argument("--traducoes", type=Path, default=Path(__file__).resolve().parents[2] / "conteudo/idiomas/italiano/traducoes")
    ap.add_argument("--saida", required=True, type=Path)
    ap.add_argument("--velocidade", type=float, default=1.12, help="length_scale do Piper (maior = mais devagar)")
    a = ap.parse_args()

    from piper import PiperVoice, SynthesisConfig

    voz = PiperVoice.load(str(a.voz))
    cfg = SynthesisConfig(length_scale=a.velocidade)
    taxa = voz.config.sample_rate
    cantos = ler_cantos(a.texto, a.cantica)

    for n in a.cantos:
        versos = cantos[n]
        trad_arq = a.traducoes / f"{a.cantica.lower()}-{n:02d}.txt"
        trad = [l.rstrip("\n") for l in trad_arq.read_text(encoding="utf-8").splitlines()] if trad_arq.exists() else []
        if trad and len(trad) != len(versos):
            raise SystemExit(f"Canto {n}: {len(versos)} versos e {len(trad)} linhas de tradução")
        for parte, (ini, fim) in enumerate(dividir(versos), 1):
            pasta = a.saida / f"{n:02d}-{parte}-canto-{romano(n).lower()}-vv-{ini + 1:03d}-{fim:03d}"
            pasta.mkdir(parents=True, exist_ok=True)
            trecho = versos[ini:fim]
            (pasta / "texto.txt").write_text("\n".join(trecho) + "\n", encoding="utf-8")
            if trad:
                (pasta / "traducao.txt").write_text("\n".join(trad[ini:fim]) + "\n", encoding="utf-8")
            (pasta / "licao.json").write_text(json.dumps({
                "idioma": "Italiano",
                "colecao": f"Divina Commedia — {a.cantica}",
                "titulo": f"Canto {romano(n)}, vv. {ini + 1}–{fim}",
                "nivel": "Literário",
                "ordem": n * 10 + parte,
                "meta": 10,
            }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

            with tempfile.TemporaryDirectory() as tmp:
                tmp = Path(tmp)
                lista, cues, t = [], [], 0.0
                silencio(tmp / "inicio.wav", 0.5, taxa)
                lista.append(tmp / "inicio.wav")
                t += 0.5
                for k, verso in enumerate(trecho):
                    w = tmp / f"v{k:03d}.wav"
                    d = falar(voz, verso, w, cfg)
                    lista.append(w)
                    cues.append((t, t + d + 0.15, verso))
                    t += d
                    pausa = 1.1 if (ini + k + 1) % 3 == 0 else 0.55
                    p = tmp / f"p{k:03d}.wav"
                    silencio(p, pausa, taxa)
                    lista.append(p)
                    t += pausa
                (tmp / "lista.txt").write_text("".join(f"file '{x}'\n" for x in lista))
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "lista.txt"),
                                "-ac", "1", "-b:a", "64k", str(pasta / "audio.mp3")], check=True)
            (pasta / "tempos.vtt").write_text(
                "WEBVTT\n\n" + "\n".join(f"{vtt_tempo(a0)} --> {vtt_tempo(a1)}\n{txt}\n" for a0, a1, txt in cues),
                encoding="utf-8")
            print(f"✓ {pasta.name}: {len(trecho)} versos, {t:.0f}s de áudio")


if __name__ == "__main__":
    main()
