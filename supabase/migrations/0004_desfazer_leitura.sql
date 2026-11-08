-- Desfaz um +1 (numa frase, ou em todas se p_sentence for null). Nunca fica negativo.
create or replace function public.desfazer_leitura(p_lesson uuid, p_sentence uuid, p_day date)
returns void language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  update public.lesson_sentences
     set read_count = read_count - 1
   where lesson_id = p_lesson
     and user_id = auth.uid()
     and read_count > 0
     and (p_sentence is null or id = p_sentence);
  get diagnostics n = row_count;
  update public.language_daily
     set reads = greatest(0, reads - n)
   where user_id = auth.uid() and day = p_day;
end $$;
