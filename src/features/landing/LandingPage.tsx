import * as React from 'react'
import { LandingHeader } from '@/features/landing/LandingHeader'
import { LandingHero } from '@/features/landing/LandingHero'
import { LandingBenefits, LandingHowItWorks } from '@/features/landing/LandingBenefits'
import { LandingFeatures } from '@/features/landing/LandingFeatures'
import { LandingAudience } from '@/features/landing/LandingAudience'
import { LandingPricing } from '@/features/landing/LandingPricing'
import { LandingFaq } from '@/features/landing/LandingFaq'
import { LandingCta } from '@/features/landing/LandingCta'
import { LandingFooter } from '@/features/landing/LandingFooter'

const TITLE = 'POSTTOU — Seu Instagram no piloto automático'
const DESCRIPTION =
  'Crie conteúdos com texto e arte, publique no Instagram e acompanhe resultados com uma plataforma que entende a sua marca.'

/**
 * Landing comercial pública, renderizada em "/" para visitantes sem
 * sessão (ver ProtectedRoute.tsx). Nenhuma prova social inventada, nenhum
 * claim que o produto atual não sustenta — copy alinhada às Fases
 * 8/9/10/11 realmente implementadas.
 */
export function LandingPage() {
  React.useEffect(() => {
    const previousTitle = document.title
    document.title = TITLE

    function upsertMeta(selector: string, create: () => HTMLMetaElement | HTMLLinkElement) {
      let el = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null
      if (!el) {
        el = create()
        document.head.appendChild(el)
      }
      return el
    }

    const description = upsertMeta('meta[name="description"]', () => {
      const m = document.createElement('meta')
      m.name = 'description'
      return m
    }) as HTMLMetaElement
    const previousDescription = description.content
    description.content = DESCRIPTION

    const canonical = upsertMeta('link[rel="canonical"]', () => {
      const l = document.createElement('link')
      l.rel = 'canonical'
      return l
    }) as HTMLLinkElement
    const previousCanonical = canonical.href
    canonical.href = window.location.origin + '/'

    const ogTags: [string, string][] = [
      ['og:title', TITLE],
      ['og:description', DESCRIPTION],
      ['og:type', 'website'],
      ['og:url', window.location.origin + '/'],
    ]
    const createdOg: HTMLMetaElement[] = []
    for (const [property, content] of ogTags) {
      let el = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute('property', property)
        document.head.appendChild(el)
        createdOg.push(el)
      }
      el.content = content
    }

    return () => {
      document.title = previousTitle
      description.content = previousDescription
      canonical.href = previousCanonical
      createdOg.forEach((el) => el.remove())
    }
  }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-ink-950">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingBenefits />
        <LandingHowItWorks />
        <LandingFeatures />
        <LandingAudience />
        <LandingPricing />
        <LandingFaq />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  )
}
