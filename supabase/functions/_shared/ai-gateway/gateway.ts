// Ponto único de acesso a providers de IA. Toda Edge Function de feature
// deve chamar getTextProvider()/getMediaProvider() — nunca instanciar um
// provider concreto diretamente. Trocar/adicionar um provider (ex.: um
// AnthropicProvider futuro) só exige mudar este arquivo.
import { KieProvider } from './kie-provider.ts'
import type { AsyncMediaProvider, TextGenerationProvider } from './types.ts'
import { ProviderNotConfiguredError } from './types.ts'

export function getTextProvider(): TextGenerationProvider {
  const kieKey = Deno.env.get('KIE_API_KEY')
  if (kieKey) {
    return new KieProvider(kieKey, Deno.env.get('KIE_WEBHOOK_HMAC_KEY') ?? undefined)
  }
  throw new ProviderNotConfiguredError('text-generation')
}

export function getMediaProvider(): AsyncMediaProvider {
  const kieKey = Deno.env.get('KIE_API_KEY')
  if (kieKey) {
    return new KieProvider(kieKey, Deno.env.get('KIE_WEBHOOK_HMAC_KEY') ?? undefined)
  }
  throw new ProviderNotConfiguredError('async-media')
}

export { ProviderNotConfiguredError, ProviderRequestError } from './types.ts'
export type * from './types.ts'
