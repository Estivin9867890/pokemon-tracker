'use client'

import { useState, useMemo } from 'react'
import { InventoryItem } from '@/types'
import { calcItem, formatCurrency } from '@/lib/calculations'
import { ChevronLeft, ChevronRight, CalendarDays, TrendingUp, TrendingDown, Package, Zap, BarChart2, Sparkles } from 'lucide-react'

const DAYS   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

interface CalendarTabProps {
  items: InventoryItem[]
  monthlyTarget?: number
}

export default function CalendarTab({ items, monthlyTarget = 0 }: CalendarTabProps) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  // Cartes vendues : singles + hits de lots
  const soldItems = useMemo(() =>
    items.filter((i) =>
      (i.status === 'Vendu' && !i.is_lot && !i.is_hit) ||
      (i.is_hit && i.is_sold && !!i.sold_at)
    ),
  [items])

  // Map ventes par jour (clé = YYYY-MM-DD)
  const salesByDay = useMemo(() => {
    const map: Record<string, InventoryItem[]> = {}
    soldItems
      .filter((i) => i.sold_at)
      .forEach((item) => {
        const key = item.sold_at!.slice(0, 10)
        if (!map[key]) map[key] = []
        map[key].push(item)
      })
    return map
  }, [soldItems])

  // Grille calendrier
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth  = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) } else setMonth((m) => m - 1)
    setSelectedDay(null)
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) } else setMonth((m) => m + 1)
    setSelectedDay(null)
  }

  // Résumé du mois affiché
  const monthPrefix  = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthSold    = soldItems.filter((i) => i.sold_at?.startsWith(monthPrefix))
  const monthRevenue = monthSold.reduce((s, i) => s + (i.actual_sale_price ?? 0), 0)
  const monthProfit  = monthSold.reduce((s, i) => s + (calcItem(i).margin_net ?? 0), 0)

  const todayStr      = today.toISOString().slice(0, 10)
  const selectedItems = selectedDay ? (salesByDay[selectedDay] ?? []) : []

  // Meilleur jour du mois
  let bestDay = ''; let bestDayProfit = -Infinity
  for (const [day, dayItems] of Object.entries(salesByDay)) {
    if (!day.startsWith(monthPrefix)) continue
    const p = dayItems.reduce((s, i) => s + (calcItem(i).margin_net ?? 0), 0)
    if (p > bestDayProfit) { bestDayProfit = p; bestDay = day }
  }

  // Projection (mois courant seulement, basée sur les cartes à l'unité)
  const projection = useMemo(() => {
    if (!isCurrentMonth) return null

    const daysElapsed = today.getDate()
    const daysLeft    = daysInMonth - daysElapsed

    const stockWithPrice = items.filter((i) =>
      !i.is_lot && !i.is_hit &&
      (i.status === 'En Stock' || i.status === 'Sur Vinted' || i.status === 'En Attente') &&
      i.expected_sale_price != null && i.expected_sale_price > 0
    )
    const stockEstimatedProfit = stockWithPrice.reduce((s, i) => {
      const cost = i.purchase_price + i.vinted_fees + (i.boost_cost ?? 0)
      return s + (i.expected_sale_price! - cost)
    }, 0)

    const allSoldWithDates = soldItems.filter((i) => !i.is_hit && i.sold_at)
    const delays = allSoldWithDates.map((i) =>
      (new Date(i.sold_at!).getTime() - new Date(i.created_at).getTime()) / 86400000
    ).filter((d) => d >= 0 && d < 365)
    const avgDelay = delays.length > 0 ? delays.reduce((s, d) => s + d, 0) / delays.length : 14

    const matureStock = stockWithPrice.filter((i) => {
      const ageDays = (Date.now() - new Date(i.created_at).getTime()) / 86400000
      return ageDays >= avgDelay * 0.5
    })
    const matureProfit = matureStock.reduce((s, i) => {
      const cost = i.purchase_price + i.vinted_fees + (i.boost_cost ?? 0)
      return s + (i.expected_sale_price! - cost)
    }, 0)

    const trendPerDay    = daysElapsed > 0 ? monthProfit / daysElapsed : 0
    const trendTotal     = trendPerDay * daysInMonth
    const realisticTotal = monthProfit + matureProfit

    return {
      daysElapsed, daysLeft, daysInMonth,
      stockCount: stockWithPrice.length,
      stockEstimatedProfit,
      matureCount: matureStock.length,
      matureProfit,
      trendTotal,
      realisticTotal,
      optimisticTotal: monthProfit + stockEstimatedProfit,
      avgDelay,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentMonth, items, monthProfit, daysInMonth, soldItems])

  // Historique 6 derniers mois
  const history = useMemo(() => {
    const result = []
    for (let offset = 5; offset >= 0; offset--) {
      let m = month - offset
      let y = year
      while (m < 0) { m += 12; y-- }
      const prefix    = `${y}-${String(m + 1).padStart(2, '0')}`
      const sold      = soldItems.filter((i) => i.sold_at?.startsWith(prefix))
      const profit    = sold.reduce((s, i) => s + (calcItem(i).margin_net ?? 0), 0)
      const isCurrent = m === month && y === year
      result.push({ year: y, month: m, label: MONTHS[m].slice(0, 3), profit, sales: sold.length, isCurrent })
    }
    return result
  }, [soldItems, year, month])

  const maxHistoryProfit = Math.max(...history.map((h) => h.profit), monthlyTarget * 0.1, 1)

  return (
    <div className="space-y-5">

      {/* Projection mois courant */}
      {isCurrentMonth && projection && (
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-800/60 flex items-center gap-2">
            <Zap size={13} className="text-amber-400" />
            <p className="text-sm font-bold text-white">Projection — {MONTHS[month]} {year}</p>
            <span className="ml-auto text-[11px] text-zinc-600">
              J{projection.daysElapsed}/{projection.daysInMonth} · {projection.daysLeft}j restants
            </span>
          </div>

          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Réalisé ce mois</p>
              <p className={`text-2xl font-bold ${monthProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(monthProfit, true)}
              </p>
              <p className="text-[11px] text-zinc-600">
                {monthSold.length} vente{monthSold.length > 1 ? 's' : ''}
                {monthlyTarget > 0 && (
                  <span className="ml-1 text-zinc-500">
                    · {Math.min(100, (monthProfit / monthlyTarget * 100)).toFixed(0)}% de l&apos;objectif
                  </span>
                )}
              </p>
              {monthlyTarget > 0 && (
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, (monthProfit / monthlyTarget) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Stock à vendre</p>
              <p className="text-2xl font-bold text-sky-400">
                ~{formatCurrency(projection.stockEstimatedProfit, true)}
              </p>
              <p className="text-[11px] text-zinc-600">
                {projection.stockCount} cartes avec prix visé
              </p>
              <p className="text-[11px] text-zinc-500">
                <span className="text-zinc-400 font-medium">{projection.matureCount} mûres</span>
                {' '}(âge ≥ {(projection.avgDelay * 0.5).toFixed(0)}j)
                {' '}→ ~{formatCurrency(projection.matureProfit, true)}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Projections fin de mois</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <TrendingUp size={9} className="text-amber-400" /> Tendance actuelle
                  </span>
                  <span className="text-[11px] font-semibold text-amber-400">{formatCurrency(projection.trendTotal, true)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Package size={9} className="text-sky-400" /> Réaliste (stock mûr)
                  </span>
                  <span className="text-[11px] font-semibold text-sky-400">{formatCurrency(projection.realisticTotal, true)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Zap size={9} className="text-violet-400" /> Optimiste (tout vendu)
                  </span>
                  <span className="text-[11px] font-semibold text-violet-400">{formatCurrency(projection.optimisticTotal, true)}</span>
                </div>
                {monthlyTarget > 0 && (
                  <div className="flex items-center justify-between border-t border-zinc-800/60 pt-1.5 mt-1">
                    <span className="text-[11px] text-zinc-500">Objectif mensuel</span>
                    <span className="text-[11px] font-bold text-amber-400">{formatCurrency(monthlyTarget)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs du mois */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Ventes</p>
          <p className="text-2xl font-bold text-violet-400">{monthSold.length}</p>
          <p className="text-[11px] text-zinc-600 mt-1">{MONTHS[month].toLowerCase()}</p>
        </div>
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">CA</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(monthRevenue)}</p>
          <p className="text-[11px] text-zinc-600 mt-1">encaissé</p>
        </div>
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Bénéfice</p>
          <p className={`text-2xl font-bold ${monthProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(monthProfit, true)}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">net</p>
        </div>
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Meilleur jour</p>
          {bestDay ? (
            <>
              <p className="text-2xl font-bold text-amber-400">
                {new Date(bestDay + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </p>
              <p className="text-[11px] text-violet-400 mt-1">{formatCurrency(bestDayProfit, true)}</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-zinc-700">—</p>
          )}
        </div>
      </div>

      {/* Calendrier */}
      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <h3 className="text-sm font-bold text-white">{MONTHS[month]} {year}</h3>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-zinc-800/40">
          {DAYS.map((d) => (
            <div key={d} className="py-2.5 text-center text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return (
              <div key={`e-${i}`} className={`h-14 border-zinc-800/20 border-b ${(i + 1) % 7 === 0 ? '' : 'border-r'}`} />
            )
            const dayStr    = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const daySales  = salesByDay[dayStr] ?? []
            const dayProfit = daySales.reduce((s, item) => s + (calcItem(item).margin_net ?? 0), 0)
            const isToday    = dayStr === todayStr
            const isSelected = dayStr === selectedDay
            const hasSales   = daySales.length > 0
            const isBestDay  = dayStr === bestDay
            const isFuture   = isCurrentMonth && day > today.getDate()

            return (
              <button
                key={dayStr}
                onClick={() => setSelectedDay(isSelected ? null : dayStr)}
                className={`h-14 flex flex-col items-center justify-center gap-0.5 border-b transition-colors
                  ${(i + 1) % 7 === 0 ? '' : 'border-r'} border-zinc-800/20
                  ${isSelected ? 'bg-violet-500/15' : hasSales ? 'hover:bg-zinc-800/50 cursor-pointer' : 'hover:bg-zinc-900/40'}
                  ${isFuture ? 'opacity-40' : ''}
                `}
              >
                <span className={`text-sm leading-none font-medium flex items-center justify-center ${
                  isToday     ? 'w-7 h-7 rounded-full bg-emerald-500 text-black font-bold'
                  : isSelected ? 'text-violet-300 font-bold'
                  : hasSales  ? 'text-white'
                  : 'text-zinc-700'
                }`}>
                  {day}
                </span>
                {hasSales && (
                  <div className="flex items-center gap-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      dayProfit >= 0 ? (isBestDay ? 'bg-violet-400' : 'bg-emerald-400') : 'bg-red-400'
                    }`} />
                    {daySales.length > 1 && <span className="text-[9px] text-zinc-600">{daySales.length}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Détail jour sélectionné */}
      {selectedDay && (
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-800/60 flex items-center gap-2">
            <CalendarDays size={13} className="text-violet-400" />
            <p className="text-sm font-semibold text-white">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
            <span className="ml-auto text-xs text-zinc-600">
              {selectedItems.length} vente{selectedItems.length > 1 ? 's' : ''}
            </span>
          </div>

          {selectedItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-600">Aucune vente enregistrée ce jour</div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {selectedItems.map((item) => {
                const calc = calcItem(item)
                return (
                  <div key={item.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {item.is_hit && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 shrink-0">
                            <Sparkles size={7} />HIT
                          </span>
                        )}
                        <p className="text-sm font-medium text-white truncate">{item.pokemon_name ?? item.item_name}</p>
                      </div>
                      <p className="text-[11px] text-zinc-600">
                        {item.extension && <span>{item.extension}</span>}
                        {item.card_number && <span className="ml-1">#{item.card_number}</span>}
                        {(item.extension || item.card_number) && ' · '}
                        {item.is_hit ? 'Estimé' : 'Coût'} : {formatCurrency(calc.cost_basis)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white">
                        {item.actual_sale_price ? formatCurrency(item.actual_sale_price) : '—'}
                      </p>
                      <p className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${(calc.margin_net ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(calc.margin_net ?? 0) >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {calc.margin_net !== null ? formatCurrency(calc.margin_net, true) : '—'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedItems.length > 1 && (() => {
            const dayRev = selectedItems.reduce((s, i) => s + (i.actual_sale_price ?? 0), 0)
            const dayNet = selectedItems.reduce((s, i) => s + (calcItem(i).margin_net ?? 0), 0)
            return (
              <div className="px-5 py-3 bg-zinc-900/50 border-t border-zinc-800/60 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">Total jour</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{formatCurrency(dayRev)}</span>
                  <span className={`text-xs font-bold ${dayNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(dayNet, true)}
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Historique mensuel 6 mois */}
      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-800/60 flex items-center gap-2">
          <BarChart2 size={13} className="text-zinc-400" />
          <p className="text-sm font-bold text-white">Historique mensuel</p>
          <span className="ml-auto text-[11px] text-zinc-600">6 derniers mois</span>
        </div>
        <div className="p-5 space-y-3">
          {history.map((h) => {
            const pct      = maxHistoryProfit > 0 ? Math.min(100, (h.profit / maxHistoryProfit) * 100) : 0
            const vsTarget = monthlyTarget > 0 ? (h.profit / monthlyTarget) * 100 : null
            return (
              <div key={`${h.year}-${h.month}`} className="flex items-center gap-3">
                <div className="w-14 text-right shrink-0">
                  <span className={`text-[11px] font-semibold ${h.isCurrent ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {h.label}
                  </span>
                  <p className="text-[9px] text-zinc-700">{h.year}</p>
                </div>
                <div className="flex-1 h-5 bg-zinc-900 rounded-full overflow-hidden relative">
                  {monthlyTarget > 0 && maxHistoryProfit > 0 && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-zinc-600/50 z-10"
                      style={{ left: `${Math.min(100, (monthlyTarget / maxHistoryProfit) * 100)}%` }}
                    />
                  )}
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      h.isCurrent
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                        : h.profit >= monthlyTarget && monthlyTarget > 0
                        ? 'bg-emerald-500'
                        : h.profit > 0
                        ? 'bg-zinc-600'
                        : 'bg-zinc-800'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-24 text-right shrink-0">
                  <span className={`text-[11px] font-bold ${
                    h.isCurrent ? 'text-amber-400' : (h.profit >= monthlyTarget && monthlyTarget > 0) ? 'text-emerald-400' : 'text-zinc-400'
                  }`}>
                    {formatCurrency(h.profit, true)}
                  </span>
                  {vsTarget !== null && (
                    <p className="text-[9px] text-zinc-700">{vsTarget.toFixed(0)}% obj.</p>
                  )}
                </div>
                <div className="w-8 text-right shrink-0">
                  <span className="text-[10px] text-zinc-700">{h.sales}v</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Légende */}
      <div className="flex items-center gap-5 text-[11px] text-zinc-600 justify-center flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Vente rentable</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400" />Meilleur jour</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Vente à perte</span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-emerald-500 inline-flex items-center justify-center text-[9px] text-black font-bold">J</span>
          Aujourd&apos;hui
        </span>
      </div>

    </div>
  )
}
