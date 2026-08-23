// Fase 9 — Piloto Automático: mesma técnica já validada em
// src/lib/timezone.ts (Fase 3/7), portada para Deno. Nunca interpreta
// horário local como UTC silenciosamente (item 8/58/90 da missão).
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`)
  const inTargetTz = naiveUtc.toLocaleString('en-US', { timeZone })
  const asIfUtc = new Date(`${inTargetTz} UTC`)
  const offset = naiveUtc.getTime() - asIfUtc.getTime()
  return new Date(naiveUtc.getTime() + offset)
}

/** Dia da semana (0=domingo..6=sábado) de uma data "de parede" no fuso do workspace. */
export function weekdayInTimeZone(dateStr: string, timeZone: string): number {
  const noonUtc = zonedTimeToUtc(dateStr, '12:00', timeZone)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).formatToParts(noonUtc)
  const label = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[label] ?? 0
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function todayInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}
