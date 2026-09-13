
-- Bloco 9 — configuração do Radar Viral pelo usuário: termos do nicho,
-- hashtags e concorrentes selecionados/adicionados manualmente. Não
-- existia nada equivalente antes (auditoria confirmou: radar_provider_
-- config/radar_scoring_config são config global operacional, nunca
-- por-workspace). Segue o mesmo padrão de brand_assets (Bloco 8):
-- tabela workspace-scoped + RLS direta (select membros, insert/delete
-- owner/admin/editor) + trigger de limite, sem RPC dedicada.
create table public.radar_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('termo', 'hashtag', 'concorrente')),
  -- Normalizado (minúsculo, sem # ou @ na frente, sem espaços nas pontas)
  -- para a unicidade funcionar de verdade: "#musica" e "musica" não podem
  -- virar duas linhas. O prefixo visual (#, @) é só apresentação.
  value text not null,
  source text not null default 'manual' check (source in ('manual', 'sugestao_dna')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index radar_targets_unique_value on public.radar_targets (workspace_id, kind, value);
create index idx_radar_targets_workspace on public.radar_targets (workspace_id);

create or replace function public.enforce_radar_target_limit()
returns trigger
language plpgsql
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.radar_targets where workspace_id = new.workspace_id and kind = new.kind;
  if v_count >= 5 then
    raise exception 'Limite de 5 itens atingido para este grupo.';
  end if;
  return new;
end;
$$;

create trigger radar_targets_limit_check
  before insert on public.radar_targets
  for each row execute function public.enforce_radar_target_limit();

alter table public.radar_targets enable row level security;

create policy "radar_targets_select_members"
  on public.radar_targets for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "radar_targets_insert_editors"
  on public.radar_targets for insert
  to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

create policy "radar_targets_delete_editors"
  on public.radar_targets for delete
  to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']::public.workspace_role[]));

grant select, insert, delete on public.radar_targets to authenticated;

comment on table public.radar_targets is
  'Bloco 9 — configuração do Radar Viral pelo workspace: termos do nicho, hashtags e concorrentes (manual ou sugestão do DNA), até 5 por kind (trigger enforce_radar_target_limit). value é sempre normalizado (sem #/@, minúsculo). Lido pelo radar-worker para influenciar o cruzamento determinístico de clusters (keywords), sem custo de IA adicional.';
