"use client";
/**
 * Biblioteca: os dados (livros, pastas, mesas, tempo e marcas de cada livro) carregados uma vez para as três abas
 * (Plano, Estante, Temas) e as janelas que qualquer linha de livro pode abrir (ficha, editar, recordar…).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { limparCacheDeLivros, ppmDosLivros, uploadBook } from "@/lib/books";
import { coverUrls } from "@/lib/covers";
import { useTimerEstado } from "@/components/timer-context";
import { progressoDaMesa, type ItemObjetivo, type Objetivo } from "@/lib/objetivos";
import { progressoDoLivro, type Book, type Folder } from "@/lib/types";

export interface Uso { segundos: number; palavras: number }

export type Janela =
  | { tipo: "ficha"; id: string }
  | { tipo: "editar"; id: string }
  | { tipo: "fisico"; pasta: string | null }
  | { tipo: "pasta"; edit?: Folder; pai: string | null }
  | { tipo: "mesa"; edit?: Objetivo }
  | { tipo: "colar" }
  | { tipo: "adicionar"; mesa: Objetivo }
  | { tipo: "na-mesa"; id: string }
  | { tipo: "triagem" }
  | { tipo: "recordar"; id?: string }
  | { tipo: "tema"; tema?: string; ids?: string[] };

export interface Lugar { mesa: Objetivo; n: number; mesaN: number }

interface Ctx {
  carregado: boolean;
  livros: Book[];
  pastas: Folder[];
  mesas: Objetivo[];
  itens: ItemObjetivo[];
  capas: Record<string, string>;
  uso: Map<string, Uso>;
  marcas: Map<string, number>;
  ppm: number;
  pastaDe: (b: Book) => Folder | undefined;
  /** em que mesa está o livro e em que posição (a primeira mesa onde aparece) */
  lugar: Map<string, Lugar>;
  /** o próximo livro do plano: o primeiro não lido da primeira mesa não terminada */
  proximo: Book | null;
  porId: Map<string, Book>;
  recarregar: () => Promise<void>;
  atualizar: (b: Book, patch: Partial<Book>) => Promise<void>;
  setLivros: React.Dispatch<React.SetStateAction<Book[]>>;
  setMesas: React.Dispatch<React.SetStateAction<Objetivo[]>>;
  setItens: React.Dispatch<React.SetStateAction<ItemObjetivo[]>>;
  setCapas: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  janela: Janela | null;
  abrir: (j: Janela | null) => void;
  aviso: string | null;
  avisar: (t: string | null) => void;
  enviando: string | null;
  enviar: (files: FileList | File[], pasta: string | null) => Promise<void>;
  ler: (b: Book) => void;
}

const C = createContext<Ctx | null>(null);
export const useBiblioteca = () => {
  const c = useContext(C);
  if (!c) throw new Error("useBiblioteca fora da Biblioteca");
  return c;
};

export function BibliotecaDados({ children }: { children: React.ReactNode }) {
  const [carregado, setCarregado] = useState(false);
  const [livros, setLivros] = useState<Book[]>([]);
  const [pastas, setPastas] = useState<Folder[]>([]);
  const [mesas, setMesas] = useState<Objetivo[]>([]);
  const [itens, setItens] = useState<ItemObjetivo[]>([]);
  const [capas, setCapas] = useState<Record<string, string>>({});
  const [uso, setUso] = useState<Map<string, Uso>>(new Map());
  const [marcas, setMarcas] = useState<Map<string, number>>(new Map());
  const [ppm, setPpm] = useState(220);
  const [janela, abrir] = useState<Janela | null>(null);
  const [aviso, avisar] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const timer = useTimerEstado();
  const router = useRouter();
  useEffect(() => { if (aviso) { const x = setTimeout(() => avisar(null), aviso.length > 60 ? 6000 : 3000); return () => clearTimeout(x); } }, [aviso]);

  const recarregar = useCallback(async () => {
    const sb = supabase();
    const [f, b, m, i, s, a, n, ritmo] = await Promise.all([
      sb.from("folders").select("*").order("position").order("name"),
      todas<Book>((de, ate) => sb.from("books").select("*").order("title").order("id").range(de, ate)),
      sb.from("objetivos").select("*").order("posicao"),
      todas<ItemObjetivo>((de, ate) => sb.from("objetivo_itens").select("*").order("posicao").order("id").range(de, ate)),
      todas<{ book_id: string; seconds: number; words: number }>((de, ate) =>
        sb.from("reading_sessions").select("book_id,seconds,words").not("book_id", "is", null).order("id").range(de, ate)).catch(() => []),
      todas<{ book_id: string }>((de, ate) => sb.from("annotations").select("book_id").order("id").range(de, ate)).catch(() => []),
      // notas literárias escritas à mão (as que nasceram de um destaque já contam no destaque)
      todas<{ book_id: string }>((de, ate) => sb.from("notes").select("book_id").eq("kind", "literaria").not("book_id", "is", null)
        .is("annotation_id", null).order("id").range(de, ate)).catch(() => []),
      ppmDosLivros(),
    ]);
    // "consulta" não existe mais: quem ainda estiver assim aparece como aguardando
    const lista = b.map((x) => ((x.status as string) === "consulta" ? { ...x, status: "aguardando" as const } : x));
    setPastas((f.data as Folder[]) ?? []);
    setLivros(lista);
    setMesas((m.data as Objetivo[]) ?? []);
    setItens(i);
    const u = new Map<string, Uso>();
    for (const x of s) { const v = u.get(x.book_id) ?? { segundos: 0, palavras: 0 }; v.segundos += x.seconds; v.palavras += x.words; u.set(x.book_id, v); }
    setUso(u);
    const mk = new Map<string, number>();
    for (const x of [...a, ...n]) mk.set(x.book_id, (mk.get(x.book_id) ?? 0) + 1);
    setMarcas(mk);
    if (ritmo) setPpm(ritmo);
    setCarregado(true);
    void coverUrls(lista).then(setCapas);
    void limparCacheDeLivros(lista.map((x) => x.file_path));
  }, []);
  useEffect(() => { void recarregar(); }, [recarregar]);

  const porId = useMemo(() => new Map(livros.map((b) => [b.id, b])), [livros]);
  const pastaPorId = useMemo(() => new Map(pastas.map((f) => [f.id, f])), [pastas]);
  const pastaDe = useCallback((b: Book) => (b.folder_id ? pastaPorId.get(b.folder_id) : undefined), [pastaPorId]);

  const { lugar, proximo } = useMemo(() => {
    const lugar = new Map<string, Lugar>();
    let proximo: Book | null = null;
    mesas.forEach((mesa, k) => {
      const meus = itens.filter((i) => i.objetivo_id === mesa.id);
      meus.forEach((i, n) => { if (i.book_id && !lugar.has(i.book_id)) lugar.set(i.book_id, { mesa, n: n + 1, mesaN: k + 1 }); });
      if (!proximo) {
        const i = meus.find((x) => { const b = x.book_id ? porId.get(x.book_id) : undefined; return b && b.status !== "lido" && b.status !== "lendo" && !x.feito; });
        if (i?.book_id) proximo = porId.get(i.book_id) ?? null;
      }
    });
    return { lugar, proximo };
  }, [mesas, itens, porId]);

  const atualizar = useCallback(async (b: Book, patch: Partial<Book>) => {
    if (patch.status === "lido") { patch.finished_at = new Date().toISOString(); patch.progress = 1; }
    if (patch.status === "lendo" && !b.started_at) patch.started_at = new Date().toISOString();
    setLivros((all) => all.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
    const { error } = await supabase().from("books").update(patch).eq("id", b.id);
    if (error) avisar(`Não consegui salvar: ${error.message}`);
  }, []);

  const enviar = useCallback(async (files: FileList | File[], pasta: string | null) => {
    for (const f of Array.from(files)) {
      setEnviando(`Enviando ${f.name}…`);
      try {
        const novo = await uploadBook(f, pasta, (msg) => setEnviando(`${f.name}: ${msg}`));
        if (!pasta) avisar(`“${novo.title}” entrou sem pasta. Abra a ficha do livro para escolher a pasta.`);
      } catch (e) { avisar((e as Error).message); }
    }
    setEnviando(null);
    void recarregar();
  }, [recarregar]);

  const ler = useCallback((b: Book) => {
    if (b.format !== "fisico") { router.push(`/ler/${b.id}`); return; }
    void (async () => {
      // livro físico: liga o Timer na categoria Leitura (ao encerrar, pergunta a página)
      if (!(await timer.trocar({ category: "Leitura", bookId: b.id, bookTitle: b.title, bookPhysical: true }))) return;
      timer.start();
      avisar(`Timer ligado para “${b.title}”. Ao encerrar, informe a página onde parou.`);
    })();
  }, [router, timer]);

  const v: Ctx = {
    carregado, livros, pastas, mesas, itens, capas, uso, marcas, ppm, pastaDe, lugar, proximo, porId,
    recarregar, atualizar, setLivros, setMesas, setItens, setCapas, janela, abrir, aviso, avisar, enviando, enviar, ler,
  };
  return <C.Provider value={v}>{children}</C.Provider>;
}

/** Progresso de cada mesa (em palavras), na ordem das mesas. */
export function useMesas() {
  const { mesas, itens, porId } = useBiblioteca();
  return useMemo(() => mesas.map((m) => {
    const meus = itens.filter((i) => i.objetivo_id === m.id);
    return { mesa: m, itens: meus, prog: progressoDaMesa(meus, porId) };
  }), [mesas, itens, porId]);
}

/** O que falta ler de um livro (palavras). */
export const faltaDe = (b: Book) => (b.status === "lido" ? 0 : (b.word_count ?? 0) * (1 - progressoDoLivro(b)));
