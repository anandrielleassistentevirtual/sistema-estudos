-- Fixa o search_path das funções (recomendação de segurança do Supabase)
alter function public.registrar_leitura(uuid, uuid, date) set search_path = '';
alter function public.registrar_escuta(uuid, date) set search_path = '';
alter function public.touch_updated_at() set search_path = '';
