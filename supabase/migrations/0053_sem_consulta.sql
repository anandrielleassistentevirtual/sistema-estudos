-- Biblioteca redesenhada: as "obras de consulta" deram lugar à leitura sintópica (Temas).
-- Quem ainda estiver como consulta volta a "aguardando", e o status deixa de existir.
-- (A fila de leitura agora é a ordem das mesas; queue_position fica no banco, mas o sistema não a usa mais.)
update public.books set status = 'aguardando' where status = 'consulta';
alter table public.books drop constraint if exists books_status_check;
alter table public.books add constraint books_status_check check (status in ('aguardando', 'lendo', 'pausado', 'lido'));
