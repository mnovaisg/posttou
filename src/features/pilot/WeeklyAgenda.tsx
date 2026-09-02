import * as React from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WEEKDAY_ORDER_MON_FIRST } from '@/features/pilot/types'
import type { PilotScheduleSlotRow } from '@/features/pilot/schedule-api'

interface WeeklyAgendaProps {
  slots: PilotScheduleSlotRow[]
  canWrite: boolean
  busy: boolean
  onAdd: (weekday: number, timeOfDay: string, directive: string | null) => void
  onRemove: (slotId: string) => void
}

/**
 * Bloco 10 — agenda semanal Segunda→Domingo. Cada slot = 1 conteúdo do
 * Piloto. Em telas largas vira um grid de 7 colunas; abaixo de sm vira
 * naturalmente uma lista empilhada por dia (grid-cols-1), sem precisar de
 * um componente separado para mobile.
 */
export function WeeklyAgenda({ slots, canWrite, busy, onAdd, onRemove }: WeeklyAgendaProps) {
  const [openDay, setOpenDay] = React.useState<number | null>(null)
  const [time, setTime] = React.useState('18:00')
  const [directive, setDirective] = React.useState('')

  const byWeekday = (wd: number) => slots.filter((s) => s.weekday === wd).sort((a, b) => a.time_of_day.localeCompare(b.time_of_day))

  function openForm(wd: number) {
    setOpenDay(wd)
    setTime('18:00')
    setDirective('')
  }

  function submit(wd: number) {
    onAdd(wd, time, directive.trim() || null)
    setOpenDay(null)
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
      {WEEKDAY_ORDER_MON_FIRST.map(({ weekday, label }) => {
        const daySlots = byWeekday(weekday)
        return (
          <div key={weekday} className="flex flex-col gap-2 rounded-lg border border-ink-200 p-2 dark:border-ink-700">
            <p className="text-xs font-medium text-ink-500">{label}</p>
            <div className="flex flex-col gap-1.5">
              {daySlots.map((slot) => (
                <div key={slot.id} className="flex items-start justify-between gap-1 rounded-md bg-ink-50 px-2 py-1.5 text-xs dark:bg-ink-800">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900 dark:text-ink-50">{slot.time_of_day.slice(0, 5)}</p>
                    {slot.directive && <p className="truncate text-ink-500" title={slot.directive}>{slot.directive}</p>}
                  </div>
                  {canWrite && (
                    <button type="button" disabled={busy} onClick={() => onRemove(slot.id)} className="shrink-0 text-ink-400 hover:text-danger-500" aria-label="Remover slot">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canWrite && openDay === weekday && (
              <div className="flex flex-col gap-1.5 rounded-md border border-brand-200 p-2 dark:border-brand-800">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-xs" />
                <Input
                  placeholder="Diretriz (opcional): dica prática…"
                  value={directive}
                  onChange={(e) => setDirective(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 flex-1 text-xs" disabled={busy} onClick={() => submit(weekday)}>
                    Adicionar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpenDay(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {canWrite && openDay !== weekday && (
              <button
                type="button"
                onClick={() => openForm(weekday)}
                disabled={busy}
                className="flex items-center justify-center gap-1 rounded-md border border-dashed border-ink-300 py-1.5 text-xs text-ink-500 hover:border-brand-400 hover:text-brand-600 dark:border-ink-600"
              >
                <Plus className="h-3.5 w-3.5" /> horário
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
