#!/usr/bin/env bash
# Fase 14A — detecta drift entre supabase/migrations/ (repo) e o histórico
# realmente aplicado no projeto Supabase vinculado. Falha (exit 1) se
# encontrar:
#   - migration aplicada remotamente sem arquivo local correspondente;
#   - arquivo local cuja versão não está aplicada remotamente (migration
#     pendente esquecida, ou nome de arquivo com timestamp incorreto).
#
# Requer: Supabase CLI (via `npx supabase@latest` funciona sem instalação
# global) autenticado (`supabase login`) e projeto linkado
# (`supabase link --project-ref <ref>`), OU as variáveis de ambiente que a
# CLI aceita para autenticação não interativa em CI.
#
# Diferenças de conteúdo/formatação NÃO são o alvo deste check — ele só
# compara a LISTA de versões (o problema real que motivou a Fase 14A).
# Divergência de conteúdo exige comparação semântica de schema à parte.

set -euo pipefail

SUPABASE_BIN="${SUPABASE_BIN:-npx -y supabase@latest}"

echo "==> Comparando histórico de migrations (local × remoto)..."

# `supabase migration list` imprime uma tabela com colunas Local | Remote | Time.
# Uma linha com uma das duas colunas vazia indica drift.
OUTPUT=$($SUPABASE_BIN migration list 2>&1) || {
  echo "Falha ao executar 'supabase migration list'. Confirme login/link antes de rodar este check." >&2
  echo "$OUTPUT" >&2
  exit 2
}

echo "$OUTPUT"

# Linhas de dados da tabela têm o formato "| <local> | <remote> | <time> |".
# Sinaliza qualquer linha onde uma das duas primeiras colunas está vazia.
DRIFT_LINES=$(echo "$OUTPUT" | grep -E '^\s*\|' | grep -Ev 'Local\s*\|\s*Remote' | awk -F'|' '
  {
    local=$2; gsub(/^[ \t]+|[ \t]+$/, "", local);
    remote=$3; gsub(/^[ \t]+|[ \t]+$/, "", remote);
    if ((local == "" && remote != "") || (remote == "" && local != "")) print
  }
')

if [ -n "$DRIFT_LINES" ]; then
  echo ""
  echo "❌ DRIFT DETECTADO — migration presente só localmente ou só remotamente:"
  echo "$DRIFT_LINES"
  exit 1
fi

echo ""
echo "✅ Nenhum drift encontrado — local e remoto têm exatamente o mesmo histórico de versões."
