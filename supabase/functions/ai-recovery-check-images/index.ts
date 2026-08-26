// Edge Function: recovery backend para geração de imagem por IA presa em
// 'processing' além de um tempo razoável — chamada só por pg_cron
// (BILLING_WORKER_SECRET, reaproveitado — recovery não é específico de
// nenhum domínio de negócio, então não criamos um secret novo só pra
// isto), nunca pelo navegador.
//
// Bug real encontrado no teste de custo Kie.ai (2026-08-24): o webhook do
// provider não chegou para uma task que a própria Kie já reportava como
// concluída (SUCCESS), e o único mecanismo de conclusão existente
// (ai-check-image) depende do frontend estar aberto chamando-o. Este
// worker fecha essa lacuna sem duplicar nenhuma lógica: a RPC
// claim_stuck_image_generations() só reivindica (claim/lock) as linhas
// elegíveis de ai_generations; a conclusão em si é sempre
// completeImageGeneration() — a mesma função usada por ai-webhook e
// ai-check-image. Nunca gera uma segunda imagem, nunca cria uma segunda
// task na Kie — só consulta o status da task já existente.
//
// Bug real encontrado no teste do DNA Visual (2026-08-25): mesmo depois
// deste worker completar as 3 gerações de imagem de uma rodada A/B/C, a
// tabela visual_dna_option_sets ficava presa em 'generating' para sempre,
// porque só o polling do frontend (VisualDnaPage) chamava
// sync_visual_dna_option_set() — se a aba fechasse/o app fosse pro
// background antes da conclusão real, nada mais sincronizava. Agora, ao
// concluir uma geração vinculada a uma direção visual, este worker
// também chama essa MESMA RPC (sem criar um segundo pipeline de
// conclusão) para reconciliar o option_set correspondente.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getMediaProvider, ProviderNotConfiguredError } from '../_shared/ai-gateway/gateway.ts'
import { completeImageGeneration } from '../_shared/ai-gateway/complete-image-generation.ts'

const TIMEOUT_MINUTES = 10
const MAX_ATTEMPTS = 5
const CLAIM_LIMIT = 20

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('BILLING_WORKER_SECRET')
  if (!secret || req.headers.get('x-posttou-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: claimed, error: claimError } = await admin.rpc('claim_stuck_image_generations', {
    p_timeout_minutes: TIMEOUT_MINUTES,
    p_max_attempts: MAX_ATTEMPTS,
    p_limit: CLAIM_LIMIT,
  })
  if (claimError) {
    console.error('ai-recovery-check-images: falha ao reivindicar gerações travadas.', claimError)
    return json({ error: 'claim_failed', detail: claimError }, 500)
  }
  if (!claimed?.length) {
    return json({ claimed: 0, results: [] })
  }

  let mediaProvider
  try {
    mediaProvider = getMediaProvider()
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      // Sem provider configurado: as linhas ficam reivindicadas
      // (recovery_claimed_at setado) e serão reavaliadas no próximo tick
      // após o timeout — não perdemos o rastro, só não há como consultar
      // a Kie agora.
      return json({ claimed: claimed.length, results: [], outcome: 'not_configured' }, 200)
    }
    throw err
  }

  const results: Array<{ id: string; status: string }> = []
  for (const row of claimed as Array<{ id: string; task_id: string }>) {
    const { data: generation } = await admin.from('ai_generations').select('*').eq('id', row.id).maybeSingle()
    if (!generation) {
      results.push({ id: row.id, status: 'not_found' })
      continue
    }
    const result = await completeImageGeneration(admin, mediaProvider, generation)
    results.push({ id: row.id, status: result.status })

    // DNA Visual: se esta geração pertence a uma direção (A/B/C) de uma
    // rodada, reconcilia visual_dna_option_sets sem depender de o
    // navegador estar aberto. Reaproveita a MESMA RPC que o polling do
    // frontend já chama (sync_visual_dna_option_set) — nenhum segundo
    // pipeline de conclusão, nenhuma nova imagem, nenhum novo débito (a
    // RPC só lê ai_generations já concluídos e só reembolsa se a rodada
    // inteira falhou, com guarda de idempotência própria).
    if (result.status === 'success' || result.status === 'failed') {
      const { data: option } = await admin
        .from('visual_dna_options')
        .select('option_set_id')
        .eq('ai_generation_id', row.id)
        .maybeSingle()

      if (option?.option_set_id) {
        const { data: syncedSet, error: syncError } = await admin.rpc('sync_visual_dna_option_set', {
          p_option_set_id: option.option_set_id,
        })
        if (syncError) {
          console.error('ai-recovery-check-images: falha ao sincronizar visual_dna_option_set.', syncError)
        } else if (syncedSet && syncedSet.status !== 'generating') {
          await admin.from('audit_logs').insert({
            workspace_id: syncedSet.workspace_id,
            user_id: null,
            action: 'visual_dna_recovery_sync',
            resource_type: 'visual_dna_option_sets',
            resource_id: syncedSet.id,
            metadata: { status: syncedSet.status, triggered_by: 'ai-recovery-check-images' },
          })
        }
      }
    }
  }

  return json({ claimed: claimed.length, results })
})
