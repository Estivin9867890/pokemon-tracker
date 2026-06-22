'use client'

import { useEffect, useState, useRef } from 'react'
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

function MiniChart({ points }: { points: { x: number; y: number }[] }) {
  if (points.length < 2) return null
  const minY = Math.min(...points.map((p) => p.y))
  const maxY = Math.max(...points.map((p) => p.y))
  const range = maxY - minY || 1
  const W = 280
  const H = 80
  const PAD = 8

  const scaled = points.map((p) => ({
    x: PAD + ((p.x) / (points[points.length - 1].x)) * (W - PAD * 2),
    y: PAD + (1 - (p.y - minY) / range) * (H - PAD * 2),
  }))

  const path = scaled.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const trending = points[points.length - 1].y >= points[0].y
  const color = trending ? '#34d399' : '#f87171'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 mt-2">
      <defs>
        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${scaled[scaled.length - 1].x},${H} L${scaled[0].x},${H} Z`}
        fill="url(#priceGrad)"
      />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {scaled.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </svg>
  )
}

export default function PriceEvolution({ pokemonName, cardNumber }: { pokemonName: string | null; cardNumber: string | null }) {
  const [loading, setLoading] = useState(false)
  const [price, setPrice] = useState<PriceData | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

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

        setPrice({
          current,
          low: cm.lowPrice ?? null,
          avg1: cm.avg1 ?? null,
          avg7: cm.avg7 ?? null,
          avg30: cm.avg30 ?? null,
        })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Erreur réseau')
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }

    load()
    return () => ctrl.abort()
  }, [pokemonName, cardNumber])

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

  const chartPoints: { x: number; y: number }[] = []
  if (price.avg30 != null) chartPoints.push({ x: 0, y: price.avg30 })
  if (price.avg7 != null) chartPoints.push({ x: 23, y: price.avg7 })
  if (price.avg1 != null) chartPoints.push({ x: 29, y: price.avg1 })
  chartPoints.push({ x: 30, y: price.current })

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

        {/* Chart */}
        {chartPoints.length >= 2 && <MiniChart points={chartPoints} />}
      </div>
    </div>
  )
}
