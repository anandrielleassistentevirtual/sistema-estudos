"use client";
/**
 * O cofre do exame de consciência: abrir com a senha, gravar cifrado e nunca perder uma marcação.
 *
 * - Cada mudança é guardada na hora, cifrada, neste aparelho (cópia de segurança) e enviada ao banco logo depois.
 * - Se o banco não responde (sem internet), a tela avisa e tenta de novo a cada 15 s; a cópia do aparelho fica.
 * - Se o exame foi mexido em outro aparelho (iPhone e computador abertos), as duas versões são juntadas:
 *   o banco só aceita a gravação se ainda estiver na versão que este aparelho conhece.
 * - Se a confissão foi registrada depois, o que está aqui já foi confessado: é descartado (não "ressuscita").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase/client";
import {
  ITERACOES, apagarCopiaLocal, cifrar, completarExame, decifrar, derivarChave, exameTemAlgo, exameVazio, guardarCopiaLocal,
  juntarExames, lerCopiaLocal, mesmoExame, novoSal, senhaConfere, verificadorNovo, type ExameDados,
} from "./exame";
import { registrarConfissao, registroDaUltimaConfissao } from "./confissao";

interface Cofre { sal: string; iteracoes: number; verificador: string; conteudo: string | null; atualizado_em: string }
const COLUNAS = "sal,iteracoes,verificador,conteudo,atualizado_em";
export type EstadoGravacao = "" | "salvando" | "salvo" | "sem-conexao";

async function lerConteudo(chave: CryptoKey, cifra: string | null): Promise<ExameDados> {
  return cifra ? completarExame(JSON.parse(await decifrar(chave, cifra))) : exameVazio();
}

export function useCofre() {
  const [cofre, setCofre] = useState<Cofre | null | undefined>(undefined); // undefined = carregando; null = sem senha ainda
  const [chave, setChave] = useState<CryptoKey | null>(null);
  const [dados, setDados] = useState<ExameDados>(exameVazio);
  const [gravacao, setGravacao] = useState<EstadoGravacao>("");
  const [aviso, setAviso] = useState<string | null>(null);

  const chaveRef = useRef<CryptoKey | null>(null);
  const dadosRef = useRef<ExameDados>(exameVazio());
  const versao = useRef(0);       // conta as mudanças feitas aqui
  const gravada = useRef(0);      // última versão que o banco confirmou
  const conhecida = useRef<string | null>(null); // "atualizado_em" do banco que este aparelho conhece
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravando = useRef(false);
  const parado = useRef(false);   // o exame foi apagado/trocado em outro aparelho: não insiste em gravar

  useEffect(() => {
    void supabase().from("exame_cofre").select(COLUNAS).maybeSingle().then(({ data }) => setCofre((data as Cofre | null) ?? null));
  }, []);

  const trocarDados = useCallback((d: ExameDados) => { dadosRef.current = d; setDados(d); }, []);

  const agendar = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void gravarRef.current(); }, ms);
  }, []);

  /** O exame mudou em outro aparelho: junta as duas versões (ou descarta, se a confissão já foi feita). */
  const reconciliar = useCallback(async (k: CryptoKey) => {
    const { data } = await supabase().from("exame_cofre").select(COLUNAS).maybeSingle();
    const s = data as Cofre | null;
    if (!s || !(await senhaConfere(k, s.verificador))) {
      setAviso("O exame foi apagado ou ganhou outra senha em outro aparelho. O que está nesta tela continua guardado (cifrado) só neste aparelho.");
      return false;
    }
    const base = conhecida.current;
    const confissao = await registroDaUltimaConfissao();
    const doBanco = await lerConteudo(k, s.conteudo);
    conhecida.current = s.atualizado_em;
    if (confissao && base && new Date(confissao) > new Date(base)) {
      trocarDados(doBanco);
      gravada.current = ++versao.current;
      apagarCopiaLocal();
      setAviso("A confissão foi registrada em outro aparelho: os pecados desta tela já foram apagados.");
      return true;
    }
    const junto = juntarExames(doBanco, dadosRef.current);
    if (!mesmoExame(junto, dadosRef.current)) setAviso("O exame também foi mexido em outro aparelho: juntei as marcações dos dois.");
    trocarDados(junto);
    versao.current++;
    return true;
  }, [trocarDados]);

  const gravar = useCallback(async () => {
    const k = chaveRef.current;
    if (!k || parado.current || gravando.current || gravada.current === versao.current) return;
    gravando.current = true;
    const v = versao.current;
    const d = dadosRef.current;
    setGravacao("salvando");
    try {
      const conteudo = exameTemAlgo(d) ? await cifrar(k, JSON.stringify(d)) : null;
      let q = supabase().from("exame_cofre").update({ conteudo, atualizado_em: new Date().toISOString() });
      q = conhecida.current ? q.eq("atualizado_em", conhecida.current) : q.not("user_id", "is", null);
      const { data, error } = await q.select("atualizado_em");
      if (error) throw new Error(error.message);
      if (!(data as unknown[] | null)?.length) {
        // o banco não está mais na versão que conhecíamos: alguém mexeu em outro aparelho
        if (!(await reconciliar(k))) { parado.current = true; gravando.current = false; setGravacao(""); return; }
      } else {
        conhecida.current = (data as { atualizado_em: string }[])[0].atualizado_em;
        gravada.current = v;
        if (versao.current === v) { apagarCopiaLocal(); setGravacao("salvo"); }
      }
    } catch {
      setGravacao("sem-conexao");
      gravando.current = false;
      agendar(15_000);
      return;
    }
    gravando.current = false;
    if (gravada.current !== versao.current) agendar(400);
  }, [agendar, reconciliar]);
  const gravarRef = useRef(gravar);
  gravarRef.current = gravar;

  /** Toda mudança: tela na hora, cópia cifrada no aparelho na hora, banco logo depois. */
  const mudar = useCallback((f: (d: ExameDados) => ExameDados) => {
    const n = f(dadosRef.current);
    trocarDados(n);
    const v = ++versao.current;
    const k = chaveRef.current;
    if (k) {
      void (async () => {
        const cifra = exameTemAlgo(n) ? await cifrar(k, JSON.stringify(n)) : null;
        if (versao.current === v) guardarCopiaLocal({ cifra, base: conhecida.current, em: new Date().toISOString() });
      })();
    }
    agendar(700);
  }, [agendar, trocarDados]);

  const abrir = useCallback(async (senha: string): Promise<string | null> => {
    // sempre a versão guardada agora (pode ter mudado desde que a página abriu, ou em outro aparelho)
    const { data, error } = await supabase().from("exame_cofre").select(COLUNAS).maybeSingle();
    if (error) return "Sem conexão com o banco. Tente de novo em instantes.";
    const atual = data as Cofre | null;
    if (!atual) { setCofre(null); return "O exame foi apagado. Crie uma senha nova."; }
    setCofre(atual);
    const k = await derivarChave(senha, atual.sal, atual.iteracoes);
    if (!(await senhaConfere(k, atual.verificador))) return "Senha incorreta.";
    let d: ExameDados;
    try { d = await lerConteudo(k, atual.conteudo); } catch { return "Não foi possível abrir o exame."; }
    conhecida.current = atual.atualizado_em;
    parado.current = false;
    let recuperar = false;
    // ficou neste aparelho alguma mudança que não chegou ao banco?
    const copia = lerCopiaLocal();
    if (copia) {
      try {
        const local = await lerConteudo(k, copia.cifra);
        const confissao = await registroDaUltimaConfissao();
        if (confissao && new Date(confissao) > new Date(copia.em)) apagarCopiaLocal(); // já confessado depois dessa cópia
        else {
          const junto = copia.base === atual.atualizado_em ? local : juntarExames(d, local);
          if (!mesmoExame(junto, d)) { d = junto; recuperar = true; } else apagarCopiaLocal();
        }
      } catch { apagarCopiaLocal(); } // cifrada com outra senha: não serve
    }
    trocarDados(d);
    chaveRef.current = k;
    setChave(k);
    versao.current = recuperar ? 1 : 0;
    gravada.current = 0;
    setGravacao("");
    if (recuperar) {
      setAviso("Havia marcações deste aparelho que ainda não tinham chegado ao banco: foram recuperadas e enviadas agora.");
      agendar(300);
    }
    return null;
  }, [agendar, trocarDados]);

  const criar = useCallback(async (senha: string) => {
    const sal = novoSal();
    const k = await derivarChave(senha, sal);
    const verificador = await verificadorNovo(k);
    const { data, error } = await supabase().from("exame_cofre")
      .upsert({ sal, iteracoes: ITERACOES, verificador, conteudo: null, atualizado_em: new Date().toISOString() })
      .select(COLUNAS).single();
    if (error) throw new Error(error.message);
    apagarCopiaLocal();
    parado.current = false;
    setCofre(data as Cofre);
    conhecida.current = (data as Cofre).atualizado_em;
    trocarDados(exameVazio());
    versao.current = gravada.current = 0;
    chaveRef.current = k;
    setChave(k);
  }, [trocarDados]);

  /** Esqueceu a senha: o exame em andamento não pode ser aberto por ninguém, então é apagado. */
  const apagarTudo = useCallback(async () => {
    await supabase().from("exame_cofre").delete().not("user_id", "is", null);
    apagarCopiaLocal();
    setCofre(null);
  }, []);

  /** Tranca: grava o que falta e esquece a chave e o conteúdo desta tela. */
  const trancar = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await gravarRef.current();
    chaveRef.current = null;
    setChave(null);
    trocarDados(exameVazio());
    setAviso(null);
    setGravacao("");
  }, [trocarDados]);

  /** Fiz a confissão: apaga os pecados para sempre; guarda só a data (e a penitência, cifrada, se você anotar). */
  const confessar = useCallback(async (dia: string, penitencia: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await registrarConfissao(dia);
    const { data } = await supabase().from("exame_cofre").select("atualizado_em").maybeSingle();
    conhecida.current = (data as { atualizado_em: string } | null)?.atualizado_em ?? null;
    const novo: ExameDados = { ...exameVazio(), penitencia: penitencia.trim() ? { texto: penitencia.trim(), desde: dia } : null };
    trocarDados(novo);
    versao.current++;
    if (exameTemAlgo(novo)) agendar(100); else gravada.current = versao.current;
    setGravacao("");
  }, [agendar, trocarDados]);

  // ao sair da página com algo pendente, tenta mandar (a cópia do aparelho cobre se não der tempo)
  useEffect(() => () => { if (gravada.current !== versao.current) void gravarRef.current(); }, []);

  return { cofre, chave, dados, gravacao, aviso, setAviso, mudar, abrir, criar, apagarTudo, trancar, confessar };
}
