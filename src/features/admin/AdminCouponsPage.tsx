import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminCoupons } from '@/features/admin/api'
import { STATUS_LABEL, STATUS_COLOR } from '@/features/admin/statusLabels'

function formatDiscount(type: 'percentage' | 'fixed', value: number): string {
  return type === 'percentage' ? `${value}%` : (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function AdminCouponsPage() {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('')

  const couponsQuery = useQuery({
    queryKey: ['admin-coupons', search, status],
    queryFn: () => fetchAdminCoupons(search, status),
  })

  const items = couponsQuery.data?.items ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-ink-50">Cupons</h1>
          <p className="mt-1 text-sm text-ink-500">{couponsQuery.data?.total ?? 0} cupom(ns) cadastrado(s).</p>
        </div>
        <Link to="/admin/cupons/novo" className="rounded-lg bg-brand-500 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-600">
          Criar cupom
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-900"
          placeholder="Buscar por código"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm dark:border-ink-800 dark:bg-ink-900"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {couponsQuery.isLoading && <p className="text-sm text-ink-400">Carregando…</p>}
      {couponsQuery.isError && <p className="text-sm text-danger-500">Não foi possível carregar os cupons.</p>}

      {/* Mobile: cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {items.map((c) => (
          <Link
            key={c.id}
            to={`/admin/cupons/${c.id}`}
            className="rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-ink-900 dark:text-ink-50">{c.code}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[c.derived_status]}`}>
                {STATUS_LABEL[c.derived_status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              {formatDiscount(c.discount_type, c.discount_value)} · {c.duration === 'first_payment' ? '1ª cobrança' : 'recorrente'}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {c.used_count} uso(s){c.max_redemptions ? ` de ${c.max_redemptions}` : ''}
            </p>
          </Link>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800 sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-400 dark:bg-ink-900">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Desconto</th>
              <th className="px-4 py-3">Duração</th>
              <th className="px-4 py-3">Usos</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
            {items.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-800/50">
                <td className="px-4 py-3">
                  <Link to={`/admin/cupons/${c.id}`} className="font-mono font-medium text-ink-900 hover:underline dark:text-ink-50">
                    {c.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{formatDiscount(c.discount_type, c.discount_value)}</td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{c.duration === 'first_payment' ? '1ª cobrança' : 'Recorrente'}</td>
                <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                  {c.used_count}
                  {c.max_redemptions ? ` / ${c.max_redemptions}` : ''}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[c.derived_status]}`}>
                    {STATUS_LABEL[c.derived_status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !couponsQuery.isLoading && <p className="p-4 text-sm text-ink-400">Nenhum cupom encontrado.</p>}
      </div>
    </div>
  )
}
