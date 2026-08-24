-- =========================================================
-- RLS: soft-delete filtrado por padrão, approver pode gravar linha
-- (a trigger de transição já restringe o que ele pode de fato mudar),
-- e exclusão física de contents é bloqueada — só soft-delete via UPDATE.
-- =========================================================
drop policy "contents_select_members" on public.contents;
create policy "contents_select_members"
  on public.contents for select
  to authenticated
  using (public.is_workspace_member(workspace_id) and deleted_at is null);

drop policy "contents_write_editors" on public.contents;
create policy "contents_insert_editors"
  on public.contents for insert
  to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

create policy "contents_update_editors"
  on public.contents for update
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

create policy "contents_update_approvers"
  on public.contents for update
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'approver']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'approver']::public.workspace_role[]));

-- Sem policy de DELETE: exclusão sempre passa por UPDATE (deleted_at),
-- reforçado abaixo por uma trigger que bloqueia DELETE físico mesmo que
-- alguém tente via service role por engano.
create or replace function public.forbid_content_hard_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'contents não pode ser excluído fisicamente — use soft-delete (UPDATE deleted_at).';
end;
$$;

create trigger contents_forbid_delete
  before delete on public.contents
  for each row execute function public.forbid_content_hard_delete();

grant update on public.contents to authenticated;

revoke execute on function public.enforce_content_status_transition() from public, anon, authenticated;
revoke execute on function public.audit_content_changes() from public, anon, authenticated;
revoke execute on function public.forbid_content_hard_delete() from public, anon, authenticated;
