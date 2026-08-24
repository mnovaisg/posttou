-- Recomendação do Supabase Advisor: (select auth.uid()) permite ao
-- planner cachear o valor por statement em vez de reavaliar por linha.
drop policy "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

drop policy "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
