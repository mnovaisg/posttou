import * as React from 'react'
import type { EditorPage } from '@/features/editor/types'

const MAX_HISTORY = 50

/**
 * Histórico local de alterações (undo/redo) — nunca persistido no banco.
 * Cada chamada a commit() é um "estado" (ex.: terminou de arrastar,
 * terminou de digitar, adicionou elemento) — não uma alteração por pixel.
 */
export function useEditorHistory(initial: EditorPage[]) {
  const [pages, setPagesState] = React.useState<EditorPage[]>(initial)
  const past = React.useRef<EditorPage[][]>([])
  const future = React.useRef<EditorPage[][]>([])
  const [, forceRender] = React.useReducer((c) => c + 1, 0)

  const commit = React.useCallback((next: EditorPage[]) => {
    past.current.push(pages)
    if (past.current.length > MAX_HISTORY) past.current.shift()
    future.current = []
    setPagesState(next)
  }, [pages])

  const undo = React.useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(pages)
    setPagesState(prev)
    forceRender()
  }, [pages])

  const redo = React.useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(pages)
    setPagesState(next)
    forceRender()
  }, [pages])

  const resetHistory = React.useCallback((next: EditorPage[]) => {
    past.current = []
    future.current = []
    setPagesState(next)
  }, [])

  return {
    pages,
    commit,
    undo,
    redo,
    resetHistory,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
