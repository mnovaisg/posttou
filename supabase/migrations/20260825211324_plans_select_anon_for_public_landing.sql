
-- Landing pública precisa mostrar preços reais sem exigir login. plans só
-- tem dado público de marketing (nome, preço, franquia, capabilities) —
-- nenhuma informação sensível. Mesma condição da policy authenticated já
-- existente (plans_select_all), só estendendo pra anon.
create policy plans_select_anon on public.plans for select to anon using (is_active);
