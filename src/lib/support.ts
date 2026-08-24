// Preparação do beta fechado — nunca mostrar um e-mail de suporte
// inventado para o usuário real. Se VITE_SUPPORT_EMAIL não estiver
// configurada, os componentes que usam isto devem deixar claro (em vez
// de linkar para um endereço que não existe).
export function getSupportEmail(): string | null {
  const email = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined
  return email && email.trim() ? email.trim() : null
}
