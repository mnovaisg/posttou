import { Camera, Palette, Box } from 'lucide-react'

// Previews 100% CSS/lucide, próprios do POSTTOU — nunca reproduzem
// artes ou layouts de referências externas, só sugerem a diferença
// visual entre as opções pelo tratamento de forma/cor.

export function ImageStylePreview({ style, primary }: { style: 'fotografico' | 'ilustracao' | '3d'; primary: string }) {
  if (style === 'fotografico') {
    return (
      <div className="relative flex h-20 w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-ink-300 via-ink-400 to-ink-600">
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/40 to-transparent" />
        <Camera className="relative h-7 w-7 text-white/90" strokeWidth={1.5} />
      </div>
    )
  }
  if (style === 'ilustracao') {
    return (
      <div className="relative flex h-20 w-full items-center justify-center overflow-hidden rounded-lg" style={{ background: `${primary}22` }}>
        <span className="absolute h-10 w-10 rounded-full" style={{ background: primary, opacity: 0.85 }} />
        <span className="absolute -right-2 bottom-1 h-8 w-8 rotate-12 rounded-md" style={{ background: `${primary}bb` }} />
        <Palette className="relative h-6 w-6 text-white drop-shadow" strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <div className="relative flex h-20 w-full items-center justify-center overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-800">
      <span
        className="absolute h-9 w-9 rounded-lg"
        style={{ background: primary, boxShadow: `6px 6px 0 ${primary}55, 12px 12px 0 ${primary}22` }}
      />
      <Box className="relative right-3 top-2 h-5 w-5 text-ink-500 dark:text-ink-300" strokeWidth={1.5} />
    </div>
  )
}

export function DesignStylePreview({ style, primary }: { style: 'moderno' | 'editorial' | 'pop' | 'minimalista' | 'impactante'; primary: string }) {
  const base = 'relative flex h-20 w-full flex-col justify-center gap-1.5 overflow-hidden rounded-lg p-3'
  if (style === 'moderno') {
    return (
      <div className={base} style={{ background: `${primary}15` }}>
        <span className="h-2.5 w-2/3 rounded-full" style={{ background: primary }} />
        <span className="h-1.5 w-1/3 rounded-full bg-ink-300 dark:bg-ink-600" />
      </div>
    )
  }
  if (style === 'editorial') {
    return (
      <div className={`${base} bg-white dark:bg-ink-900`}>
        {[...Array(4)].map((_, i) => (
          <span key={i} className="h-px w-full bg-ink-300 dark:bg-ink-600" style={{ opacity: 1 - i * 0.15 }} />
        ))}
        <span className="absolute right-3 top-3 h-3 w-3 rounded-full" style={{ background: primary }} />
      </div>
    )
  }
  if (style === 'pop') {
    return (
      <div className={base} style={{ background: primary }}>
        <span className="absolute -left-3 -top-3 h-10 w-10 rounded-full bg-white/25" />
        <span className="absolute -right-2 bottom-0 h-8 w-8 rounded-full bg-black/20" />
        <span className="relative h-3 w-1/2 rounded-full bg-white" />
      </div>
    )
  }
  if (style === 'minimalista') {
    return (
      <div className={`${base} items-center bg-white dark:bg-ink-900`}>
        <span className="h-2 w-2 rounded-full" style={{ background: primary }} />
      </div>
    )
  }
  return (
    <div className={`${base} bg-ink-900`}>
      <span className="absolute -left-6 top-0 h-24 w-16 -rotate-12" style={{ background: primary }} />
      <span className="relative ml-auto h-2.5 w-1/2 rounded-full bg-white" />
    </div>
  )
}
