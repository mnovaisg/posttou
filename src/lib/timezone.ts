/**
 * Conversão de datas com fuso horário do workspace, sem dependência externa.
 * Técnica padrão: comparar como o mesmo instante é formatado em UTC vs. no
 * fuso alvo para descobrir o offset e aplicá-lo.
 */

/** Converte uma data+hora "de parede" (o que o usuário digitou) no fuso do
 * workspace para um Date UTC real, pronto para salvar em timestamptz.
 * Independe do fuso horário do navegador/servidor rodando o código — usa o
 * dígito literal digitado como se fosse UTC e mede o desvio a partir daí. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`)
  const inTargetTz = naiveUtc.toLocaleString('en-US', { timeZone })
  const asIfUtc = new Date(`${inTargetTz} UTC`)
  const offset = naiveUtc.getTime() - asIfUtc.getTime()
  return new Date(naiveUtc.getTime() + offset)
}

/** Quebra um timestamp UTC salvo no banco em {date, time} de acordo com o
 * fuso do workspace, para preencher inputs de formulário. */
export function getDatePartsInTimeZone(
  isoString: string,
  timeZone: string,
): { date: string; time: string } {
  const d = new Date(isoString)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

/** Formata um timestamp UTC para exibição amigável no fuso do workspace. */
export function formatInTimeZone(
  isoString: string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, ...opts }).format(new Date(isoString))
}

/** Chave YYYY-MM-DD de um timestamp no fuso do workspace — usada para
 * agrupar conteúdos por dia no calendário. */
export function dayKeyInTimeZone(isoString: string, timeZone: string): string {
  const d = new Date(isoString)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}
