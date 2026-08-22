import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listContentsForCalendarRange } from '@/features/content/api'
import { TYPE_ICON } from '@/features/content/types'
import { dayKeyInTimeZone, formatInTimeZone } from '@/lib/timezone'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const STATUS_DOT: Record<string, string> = {
  rascunho: 'bg-ink-400',
  em_revisao: 'bg-amber-500',
  rejeitado: 'bg-red-500',
  aprovado: 'bg-brand-500',
  agendado: 'bg-brand-600',
  publicando: 'bg-amber-600',
  publicado: 'bg-green-500',
  falhou: 'bg-red-600',
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}
function addDays(d: Date, n: number) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export function CalendarView({ workspaceId, timezone }: { workspaceId: string; timezone: string }) {
  const [cursor, setCursor] = React.useState(() => startOfMonth(new Date()))

  const gridStart = React.useMemo(() => {
    const first = startOfMonth(cursor)
    return addDays(first, -first.getDay())
  }, [cursor])
  const gridDays = React.useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])
  const gridEnd = gridDays[gridDays.length - 1]

  const { data: contents, isLoading } = useQuery({
    queryKey: ['contents', 'calendario', workspaceId, gridStart.toISOString(), gridEnd.toISOString()],
    queryFn: () =>
      listContentsForCalendarRange(
        workspaceId,
        new Date(gridStart.setHours(0, 0, 0, 0)).toISOString(),
        new Date(gridEnd.setHours(23, 59, 59, 999)).toISOString(),
      ),
  })

  const byDay = React.useMemo(() => {
    const map = new Map<string, typeof contents>()
    for (const c of contents ?? []) {
      if (!c.scheduled_at) continue
      const key = dayKeyInTimeZone(c.scheduled_at, timezone)
      const list = map.get(key) ?? []
      list.push(c)
      map.set(key, list as never)
    }
    return map
  }, [contents, timezone])

  const monthLabel = cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const todayKey = dayKeyInTimeZone(new Date().toISOString(), timezone)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize text-ink-900 dark:text-ink-50">{monthLabel}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => addMonths(c, -1))}>
            ‹
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor((c) => addMonths(c, 1))}>
            ›
          </Button>
        </div>
      </div>

      {!isLoading && (contents?.length ?? 0) === 0 && (
        <p className="rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-500 dark:bg-ink-800">
          Nenhum conteúdo agendado para este período.
        </p>
      )}

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-ink-50 px-2 py-2 text-center text-xs font-medium text-ink-400 dark:bg-ink-800">
            {w}
          </div>
        ))}
        {gridDays.map((day) => {
          const key = dayKeyInTimeZone(day.toISOString(), timezone)
          const items = byDay.get(key) ?? []
          const inMonth = day.getMonth() === cursor.getMonth()
          const isToday = key === todayKey
          return (
            <div
              key={key}
              className={cn(
                'min-h-[92px] border-b border-r border-ink-100 p-1.5 dark:border-ink-800',
                !inMonth && 'bg-ink-50/50 dark:bg-ink-900/50',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs',
                  isToday ? 'bg-brand-600 text-white' : 'text-ink-400',
                  !inMonth && 'opacity-40',
                )}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 flex flex-col gap-1">
                {items.slice(0, 3).map((item) => (
                  <Link
                    key={item!.id}
                    to={`/conteudo/${item!.id}`}
                    className="flex items-center gap-1 truncate rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-700 hover:bg-brand-100 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-brand-900"
                    title={item!.title}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[item!.status])} />
                    <span className="shrink-0">{TYPE_ICON[item!.type]}</span>
                    <span className="truncate">{item!.title}</span>
                    <span className="ml-auto shrink-0 text-ink-400">
                      {formatInTimeZone(item!.scheduled_at!, timezone, { timeStyle: 'short' })}
                    </span>
                  </Link>
                ))}
                {items.length > 3 && <span className="text-[11px] text-ink-400">+{items.length - 3} mais</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
