-- Reconciliação: __test_default_privileges_disposable() foi criada para
-- provar o ALTER DEFAULT PRIVILEGES (migration anterior) e já tinha sido
-- removida fora do fluxo de migration, via DROP direto, assim que provou
-- ser insuficiente (ver fase14c_auto_revoke_event_trigger, a solução que
-- de fato funcionou). Este DROP formal alinha o histórico de migrations
-- ao estado real do banco — reconstruir do zero a partir dos arquivos
-- locais agora chega exatamente ao mesmo schema atual.
drop function if exists public.__test_default_privileges_disposable();
