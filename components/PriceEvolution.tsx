'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react'

interface CardmarketPrices {
  trendPrice?: number
  averageSellPrice?: number
  lowPrice?: number
  avg1?: number
  avg7?: number
  avg30?: number
}

interface PriceData {
  current: number
  low: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
}

interface TCGdexCard {
  id: string
  localId: string
  name: string
  set?: { id: string; name: string }
}

interface Snapshot { date: string; price: number }

type Period = '30J' | '3M' | '1A' | 'ALL'

const STORAGE_KEY = 'pokemon_price_history'

function getHistory(): Record<string, Snapshot[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

function saveSnapshot(cardKey: string, price: number) {
  const today = new Date().toISOString().slice(0, 10)
  const all = getHistory()
  const list = all[cardKey] ?? []
  if (list.length > 0 && list[list.length - 1].date === today) {
    list[list.length - 1].price = price
  } else {
    list.push({ date: today, price })
  }
  all[cardKey] = list
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)) } catch { /* quota */ }
}

function getSnapshots(cardKey: string): Snapshot[] {
  return getHistory()[cardKey] ?? []
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function pctChange(current: number, past: number | null): number | null {
  if (past == null || past === 0) return null
  return ((current - past) / past) * 100
}

function formatPct(v: number | null): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function formatEur(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(2)} €`
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function MiniChart({ points }: { points: { label: string; y: number }[] }) {
  if (points.length < 2) return null
  const minY = Math.min(...points.map((p) => p.y))
  const maxY = Math.max(...points.map((p) => p.y))
  const padY = (maxY - minY) * 0.15 || 0.5
  const yLow = minY - padY
  const yHigh = maxY + padY
  const W = 400
  const H = 150
  const PADX = 10
  const PADY = 22
  const BOTTOM = 18
  const n = points.length
  const showLabelsEvery = n > 12 ? Math.ceil(n / 8) : 1

  const scaled = points.map((p, i) => ({
    x: PADX + (i / (n - 1)) * (W - PADX * 2),
    y: PADY + (1 - (p.y - yLow) / (yHigh - yLow)) * (H - PADY - BOTTOM),
  }))

  const trending = points[n - 1].y >= points[0].y
  const color = trending ? '#34d399' : '#f87171'

  const pathD = scaled.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`
    const prev = scaled[i - 1]
    const cx = (prev.x + p.x) / 2
    return `C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`
  }).join(' ')

  const fillD = `${pathD} L${scaled[n - 1].x},${H - BOTTOM} L${scaled[0].x},${H - BOTTOM} Z`
  const uid = `grad-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3" style={{ height: 170 }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${uid})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {scaled.map((p, i) => {
        const isFirst = i === 0
        const isLast = i === n - 1
        const showDot = isFirst || isLast || n <= 8
        const showLabel = i % showLabelsEvery === 0 || isLast
        return (
          <g key={i}>
            {showDot && <circle cx={p.x} cy={p.y} r="4" fill="#0e0e10" stroke={color} strokeWidth="2" />}
            {(isFirst || isLast) && (
              <text x={p.x} y={p.y - 10} textAnchor={isFirst ? 'start' : 'end'} fill="white" fontSize="10" fontWeight="600" opacity="0.8">
                {points[i].y.toFixed(2)} €
              </text>
            )}
            {showLabel && (
              <text x={p.x} y={H - 2} textAnchor="middle" fill="white" fontSize="8" opacity="0.25">
                {points[i].label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function buildChartFromHistory(snapshots: Snapshot[], period: Period, apiData: PriceData): { label: string; y: number }[] {
  const cutoff = period === '30J' ? daysAgo(30)
    : period === '3M' ? daysAgo(90)
    : period === '1A' ? daysAgo(365)
    : '1970-01-01'

  const filtered = snapshots.filter((s) => s.date >= cutoff)

  if (filtered.length >= 2) {
    return filtered.map((s) => ({ label: formatDateShort(s.date), y: s.price }))
  }

  const points: { label: string; y: number }[] = []
  if (period === '30J' || filtered.length < 2) {
    if (apiData.avg30 != null) points.push({ label: '-30J', y: apiData.avg30 })
    if (apiData.avg7 != null) points.push({ label: '-7J', y: apiData.avg7 })
    if (apiData.avg1 != null) points.push({ label: '-1J', y: apiData.avg1 })
    points.push({ label: 'Auj.', y: apiData.current })
  }
  return points
}

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: '30J', label: '30J' },
  { key: '3M', label: '3M' },
  { key: '1A', label: '1A' },
  { key: 'ALL', label: 'All' },
]

export default function PriceEvolution({ pokemonName, cardNumber }: { pokemonName: string | null; cardNumber: string | null }) {
  const [loading, setLoading] = useState(false)
  const [price, setPrice] = useState<PriceData | null>(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState<Period>('30J')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const cardKey = pokemonName && cardNumber ? `${pokemonName}__${cardNumber}` : pokemonName ?? ''

  useEffect(() => {
    if (!pokemonName) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    async function load() {
      setLoading(true)
      setError('')
      setPrice(null)

      try {
        const res = await fetch(
          `https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(pokemonName!)}`,
          { signal: ctrl.signal },
        )
        if (!res.ok) { setError('Carte introuvable'); return }
        const cards = (await res.json()) as TCGdexCard[]
        if (!Array.isArray(cards) || cards.length === 0) { setError('Carte introuvable'); return }

        let match = cards[0]
        if (cardNumber) {
          const found = cards.find((c) => c.localId === cardNumber || c.localId === cardNumber.split('/')[0])
          if (found) match = found
        }

        const priceRes = await fetch(
          `https://api.pokemontcg.io/v2/cards/${match.id}`,
          { signal: ctrl.signal },
        )
        if (!priceRes.ok) { setError('Prix indisponibles'); return }
        const priceData = ((await priceRes.json()) as { data: { cardmarket?: { prices?: CardmarketPrices } } }).data

        const cm = priceData?.cardmarket?.prices
        if (!cm) { setError('Pas de données Cardmarket'); return }

        const current = cm.trendPrice ?? cm.averageSellPrice ?? 0
        if (current === 0) { setError('Prix non disponible'); return }

        const priceResult: PriceData = {
          current,
          low: cm.lowPrice ?? null,
          avg1: cm.avg1 ?? null,
          avg7: cm.avg7 ?? null,
          avg30: cm.avg30 ?? null,
        }
        setPrice(priceResult)

        const key = cardNumber ? `${pokemonName}__${cardNumber}` : pokemonName!
        saveSnapshot(key, current)
        if (cm.avg30 != null) {
          const key30 = key
          const hist = getSnapshots(key30)
          const d30 = daysAgo(30)
          if (!hist.some((s) => s.date === d30)) {
            saveSnapshot(key30, cm.avg30)
          }
          if (cm.avg7 != null) {
            const d7 = daysAgo(7)
            if (!hist.some((s) => s.date === d7)) {
              saveSnapshot(key30, cm.avg7)
            }
          }
        }
        setSnapshots(getSnapshots(key))
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Erreur réseau')
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }

    load()
    return () => ctrl.abort()
  }, [pokemonName, cardNumber])

  const chartPoints = useMemo(() => {
    if (!price) return []
    return buildChartFromHistory(snapshots, period, price)
  }, [price, snapshots, period])

  const hasLongHistory = useMemo(() => {
    if (snapshots.length < 2) return false
    const first = snapshots[0]?.date
    const last = snapshots[snapshots.length - 1]?.date
    return first !== last
  }, [snapshots])

  if (!pokemonName) return null

  if (loading) {
    return (
      <div className="mb-4">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Prix du marché</p>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-4 py-6 flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin text-zinc-500" />
          <span className="text-xs text-zinc-500">Chargement des prix…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-4">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Prix du marché</p>
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-4 py-4">
          <p className="text-xs text-zinc-500 text-center">{error}</p>
        </div>
      </div>
    )
  }

  if (!price) return null

  const pct1 = pctChange(price.current, price.avg1)
  const pct7 = pctChange(price.current, price.avg7)
  const pct30 = pctChange(price.current, price.avg30)

  const mainPct = pct30 ?? pct7 ?? pct1
  const mainDiff = price.avg30 != null ? price.current - price.avg30 : null
  const trending = (mainPct ?? 0) >= 0

  const periods = [
    { label: '1J', value: pct1 },
    { label: '7J', value: pct7 },
    { label: '30J', value: pct30 },
  ].filter((p) => p.value != null)

  const high = Math.max(price.current, price.avg1 ?? 0, price.avg7 ?? 0, price.avg30 ?? 0)
  const low = price.low ?? Math.min(price.current, price.avg1 ?? Infinity, price.avg7 ?? Infinity, price.avg30 ?? Infinity)
  const amplitude = high - low

  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">
        Prix du marché (Cardmarket)
      </p>
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-4 py-3">
        {/* Current price */}
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-2xl font-bold text-white">{formatEur(price.current)}</span>
          {mainPct != null && (
            <span className={`flex items-center gap-1 text-xs font-semibold ${trending ? 'text-emerald-400' : 'text-red-400'}`}>
              {trending ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {formatPct(mainPct)}
              {mainDiff != null && <span className="text-zinc-500 font-normal">· {formatEur(Math.abs(mainDiff))}</span>}
            </span>
          )}
        </div>

        {/* Period changes */}
        {periods.length > 0 && (
          <div className="flex gap-2 mb-3">
            {periods.map((p) => (
              <div key={p.label} className="flex-1 bg-zinc-800/50 rounded-xl px-3 py-2 text-center">
                <p className="text-[10px] text-zinc-500 font-medium">{p.label}</p>
                <p className={`text-xs font-bold mt-0.5 ${(p.value ?? 0) > 0 ? 'text-emerald-400' : (p.value ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                  {formatPct(p.value)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Low / High / Amplitude */}
        <div className="flex gap-2 mb-1">
          <div className="flex-1">
            <p className="text-[9px] text-zinc-600 uppercase">Bas</p>
            <p className="text-xs font-semibold text-red-400">{formatEur(low)}</p>
          </div>
          <div className="flex-1">
            <p className="text-[9px] text-zinc-600 uppercase">Haut</p>
            <p className="text-xs font-semibold text-emerald-400">{formatEur(high)}</p>
          </div>
          <div className="flex-1">
            <p className="text-[9px] text-zinc-600 uppercase">Amplitude</p>
            <p className="text-xs font-semibold text-zinc-300">{formatEur(amplitude)}</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 mt-3 mb-1">
          {PERIOD_LABELS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                period === p.key
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'bg-zinc-800/40 text-zinc-500 border border-transparent hover:text-zinc-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        {chartPoints.length >= 2 ? (
          <MiniChart points={chartPoints} />
        ) : period !== '30J' ? (
          <div className="flex flex-col items-center py-6 gap-1.5">
            <p className="text-[11px] text-zinc-500">Pas encore assez de données pour cette période</p>
            <p className="text-[10px] text-zinc-600">L'historique se construit automatiquement à chaque visite</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
