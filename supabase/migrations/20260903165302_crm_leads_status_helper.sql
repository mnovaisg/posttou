-- Deriva o status comercial exclusivamente de subscriptions (já
-- existente) + get_effective_subscription_status (já existente) +
-- subscription_status_history (já existente, escrita real desde a Fase
-- 14B). Nenhum dado novo armazenado para isso — só interpretação.
--
-- Distingue (aprovado item 2, verificado no diagnóstico):
--   - trial_not_converted: expirou e nunca chegou a ativar (activated_at nulo)
--   - expired_involuntary: já foi ativo, ficou past_due, estourou a
--     carência sem pagar de novo (past_due_since sobrevive à transição
--     pro cron, nunca é limpo exceto por um pagamento confirmado real)
--   - cancelled: tem uma linha em subscription_status_history com
--     reason='user_requested' (única origem de cancel_at_period_end
--     hoje — schedule_subscription_cancellation) OU chegou no estado
--     'cancelled' por qualquer outro caminho sem ter passado por past_due
-- Nunca inventa um estado incompatível com o que os fluxos de
-- Billing/Asaas realmente produzem.
create or replace function public._lead_commercial_status(p_sub public.subscriptions, p_has_voluntary_cancel boolean)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_eff public.subscription_status;
begin
  if p_sub is null then
    return 'no_subscription';
  end if;

  v_eff := public.get_effective_subscription_status(p_sub);

  if v_eff = 'trialing' then
    return 'trial_active';
  elsif v_eff = 'active' or v_eff = 'cancel_at_period_end' then
    return 'active_customer';
  elsif v_eff = 'past_due' then
    return 'past_due';
  elsif v_eff = 'expired' then
    if p_sub.activated_at is null then
      return 'trial_not_converted';
    elsif p_has_voluntary_cancel then
      return 'cancelled';
    elsif p_sub.past_due_since is not null then
      return 'expired_involuntary';
    else
      return 'cancelled';
    end if;
  elsif v_eff = 'cancelled' then
    return 'cancelled';
  else
    return 'no_subscription';
  end if;
end;
$$;

revoke execute on function public._lead_commercial_status(subscriptions, boolean) from public;
