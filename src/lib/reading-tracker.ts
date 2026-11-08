"use client";
import { supabase } from "./supabase/client";
import { dayKey } from "./dates";

/**
 * Mede a leitura: cada página avançada credita as palavras daquela página e o tempo
 * que você passou nela. Tempo com a aba escondida não conta, e cada página tem um
 * teto de tempo (para não contar quando você levanta e deixa o livro aberto).
 */
export class ReadingTracker {
  private rowId: string | null = null;
  private rowDay = "";
  private rowTimer = false;
  private pending = { seconds: 0, words: 0 };
  private saved = { seconds: 0, words: 0 };
  private pageStart = performance.now();
  private hiddenAt: number | null = null;
  private hiddenTotal = 0;
  private timer: ReturnType<typeof setInterval>;
  public session = { seconds: 0, words: 0 };
  public onChange?: () => void;

  constructor(private bookId: string, private timerOn: () => boolean = () => false) {
    this.timer = setInterval(() => void this.flush(), 20000);
    document.addEventListener("visibilitychange", this.onVis);
  }

  private onVis = () => {
    if (document.hidden) this.hiddenAt = performance.now();
    else if (this.hiddenAt !== null) {
      this.hiddenTotal += performance.now() - this.hiddenAt;
      this.hiddenAt = null;
    }
    if (document.hidden) void this.flush();
  };

  /** Chamar sempre que a página mudar. `words` = palavras da página que você deixou. */
  turn(words: number, forward: boolean) {
    const now = performance.now();
    const dwell = (now - this.pageStart - this.hiddenTotal) / 1000;
    this.pageStart = now;
    this.hiddenTotal = 0;
    if (!forward || dwell < 2 || words <= 0) return;
    // teto: o tempo de ler a página a 40 ppm, entre 1 e 6 minutos
    const cap = Math.min(360, Math.max(60, (words / 40) * 60));
    const secs = Math.min(dwell, cap);
    this.pending.seconds += secs;
    this.pending.words += words;
    this.session.seconds += secs;
    this.session.words += words;
    this.onChange?.();
  }

  async flush() {
    if (this.pending.seconds < 1 && this.pending.words === 0) return;
    const today = dayKey();
    const sb = supabase();
    const add = { ...this.pending };
    this.pending = { seconds: 0, words: 0 };
    const withTimer = this.timerOn();
    if (!this.rowId || this.rowDay !== today || this.rowTimer !== withTimer) {
      this.saved = { seconds: 0, words: 0 };
      const { data } = await sb
        .from("reading_sessions")
        .insert({ book_id: this.bookId, day: today, seconds: 0, words: 0, during_timer: withTimer })
        .select("id")
        .single();
      this.rowId = data?.id ?? null;
      this.rowDay = today;
      this.rowTimer = withTimer;
    }
    if (!this.rowId) return;
    this.saved.seconds += add.seconds;
    this.saved.words += add.words;
    await sb
      .from("reading_sessions")
      .update({ seconds: Math.round(this.saved.seconds), words: this.saved.words, ended_at: new Date().toISOString() })
      .eq("id", this.rowId);
  }

  async close() {
    clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.onVis);
    await this.flush();
  }
}
