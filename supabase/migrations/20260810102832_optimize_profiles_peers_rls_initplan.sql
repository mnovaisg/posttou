drop policy "profiles_select_workspace_peers" on public.profiles;
create policy "profiles_select_workspace_peers"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm1
      join public.workspace_members wm2 on wm2.workspace_id = wm1.workspace_id
      where wm1.user_id = (select auth.uid())
        and wm2.user_id = profiles.id
    )
  );
