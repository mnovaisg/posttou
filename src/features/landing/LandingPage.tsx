import * as React from 'react'
import { LandingHeader } from '@/features/landing/LandingHeader'
import { LandingHero } from '@/features/landing/LandingHero'
import { LandingIndicators } from '@/features/landing/LandingIndicators'
import { LandingPain } from '@/features/landing/LandingPain'
import { LandingBenefits, LandingHowItWorks } from '@/features/landing/LandingBenefits'
import { LandingFeatures } from '@/features/landing/LandingFeatures'
import { LandingAudience } from '@/features/landing/LandingAudience'
import { LandingComparison } from '@/features/landing/LandingComparison'
import { LandingPricing } from '@/features/landing/LandingPricing'
import { LandingFaq } from '@/features/landing/LandingFaq'
import { LandingCta } from '@/features/landing/LandingCta'
import { LandingFooter } from '@/features/landing/LandingFooter'
import { trackEvent } from '@/lib/analytics'
import { captureAttributionFromLocation } from '@/lib/pendingAttribution'

const TITLE = 'POSTTOU — Seu Instagram trabalhando mesmo quando você não está'
const DESCRIPTION =
  'O POSTTOU entende sua marca, encontra ideias e transforma tudo isso em conteúdo pronto para você publicar. Comece pelo seu @, sem cartão de crédito.'

/**
 * Landing comercial pública, renderizada em "/" para visitantes sem
 * sessão (ver ProtectedRoute.tsx). Nenhuma prova social inventada, nenhum
 * claim que o produto atual não sustenta — copy alinhada ao que os Blocos
 * 8/9/10/10.1 realmente implementaram (Bloco 11: reconstrução da landing).
 */
export function LandingPage() {
  React.useEffect(() => {
    trackEvent('landing_view')
    captureAttributionFromLocation(window.location.search)
  }, [])

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
    canonical.href = 'https://www.posttou.com/'

    const ogTags: [string, string][] = [
      ['og:title', TITLE],
      ['og:description', DESCRIPTION],
      ['og:type', 'website'],
      ['og:url', 'https://www.posttou.com/'],
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
        <LandingIndicators />
        <LandingPain />
        <LandingHowItWorks />
        <LandingFeatures />
        <LandingAudience />
        <LandingComparison />
        <LandingBenefits />
        <LandingPricing />
        <LandingFaq />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  )
}
