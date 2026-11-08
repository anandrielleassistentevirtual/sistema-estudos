"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { fmtDuration, nf } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { Book, STATUS_LABEL } from "@/lib/types";
import { Cover } from "@/components/cover";
import { coverUrls } from "@/lib/covers";

export default function Fila() {
  const [queue, setQueue] = useState<Book[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [wpm, setWpm] = useState(220);

  const load = async () => {
    const sb = supabase();
    const [{ data }, r] = await Promise.all([
      sb.from("books").select("*").not("queue_position", "is", null).neq("status", "lido").order("queue_position"),
      sb.from("reading_sessions").select("seconds,words").order("started_at", { ascending: false }).limit(200),
    ]);
    setQueue((data as Book[]) ?? []);
    void coverUrls((data as Book[]) ?? []).then(setCovers);
    const secs = (r.data ?? []).reduce((a, x) => a + x.seconds, 0);
    if (secs > 300) setWpm(Math.round((r.data ?? []).reduce((a, x) => a + x.words, 0) / (secs / 60)));
  };
  useEffect(() => { void load(); }, []);

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= queue.length) return;
    const next = [...queue];
    [next[i], next[j]] = [next[j], next[i]];
    setQueue(next);
    const sb = supabase();
    await Promise.all(next.map((b, k) => sb.from("books").update({ queue_position: k + 1 }).eq("id", b.id)));
  }

  async function remove(b: Book) {
    setQueue((q) => q.filter((x) => x.id !== b.id));
    await supabase().from("books").update({ queue_position: null }).eq("id", b.id);
  }

  let acc = 0;
  return (
    <Page title="Fila de leitura" subtitle="A ordem em que você vai atacar o Mapa da Ignorância. Adicione livros pela biblioteca.">
      {queue.length === 0 ? (
        <Empty>
          A fila está vazia. Na <Link href="/biblioteca" className="text-accent">biblioteca</Link>, use o ícone de lista em um livro para enfileirá-lo.
        </Empty>
      ) : (
        <ol className="card divide-y divide-line">
          {queue.map((b, i) => {
            const left = (b.word_count ?? 0) * (1 - b.progress);
            acc += left;
            return (
              <li key={b.id} className="p-3 flex items-center gap-3">
                <span className="w-7 text-center text-lg font-semibold text-faint tabular-nums">{i + 1}</span>
                <Cover book={b} url={covers[b.id]} className="w-10 h-14" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{b.title}</div>
                  <div className="text-xs text-muted">
                    {STATUS_LABEL[b.status]}
                    {b.word_count ? ` · ${nf.format(Math.round(left))} palavras restantes · ≈ ${fmtDuration((left / wpm) * 60)}` : ""}
                    {acc && i > 0 ? ` · termina em ≈ ${fmtDuration((acc / wpm) * 60)} de leitura` : ""}
                  </div>
                </div>
                <button className="btn btn-ghost px-2" onClick={() => move(i, -1)} disabled={i === 0} title="Subir"><ArrowUp size={15} /></button>
                <button className="btn btn-ghost px-2" onClick={() => move(i, 1)} disabled={i === queue.length - 1} title="Descer"><ArrowDown size={15} /></button>
                <Link href={`/ler/${b.id}`} className="btn"><BookOpen size={15} /> Ler</Link>
                <button className="btn btn-ghost px-2" onClick={() => remove(b)} title="Tirar da fila"><X size={15} /></button>
              </li>
            );
          })}
        </ol>
      )}
    </Page>
  );
}
