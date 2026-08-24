-- Bug real encontrado em teste: BEFORE INSERT não pode inserir em
-- content_franchise_ledger referenciando new.id via FK, porque a linha de
-- contents ainda não é visível para constraints até o INSERT efetivamente
-- acontecer. AFTER INSERT tem o mesmo efeito de bloqueio (uma exceção
-- ainda reverte a transação inteira, incluindo a inserção em contents),
-- e resolve o problema de visibilidade da FK.
drop trigger content_franchise_gate on public.contents;
create trigger content_franchise_gate
  after insert on public.contents
  for each row execute function public.enforce_content_franchise_gate();
