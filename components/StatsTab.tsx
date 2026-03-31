'use client'

import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import { InventoryItem } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import {
  TrendingUp, TrendingDown, ShoppingBag, Clock,
  Zap, BarChart2, Minus, Award,
} from 'lucide-react'

type Period = '7j' | '1m' | '3m' | '6m' | '1an' | 'all'

interface StatsTabProps {
  items: InventoryItem[]
}

const PERIODS: { key: Period; label: string }[] = [
  { key: '7j',  label: '7 jours' },
  { key: '1m',  label: '1 mois' },
  { key: '3m',  label: '3 mois' },
  { key: '6m',  label: '6 mois' },
  { key: '1an', label: '1 an' },
  { key: 'all', label: 'All Time' },
]

function periodStart(p: Period): Date | null {
  if (p === 'all') return null
  const d = new Date()
  if (p === '7j')  d.setDate(d.getDate() - 7)
  if (p === '1m')  d.setMonth(d.getMonth() - 1)
  if (p === '3m')  d.setMonth(d.getMonth() - 3)
  if (p === '6m')  d.setMonth(d.getMonth() - 6)
  if (p === '1an') d.setFullYear(d.getFullYear() - 1)
  return d
}

function prevPeriodStart(p: Period): Date | null {
  if (p === 'all') return null
  const d = new Date()
  if (p === '7j')  d.setDate(d.getDate() - 14)
  if (p === '1m')  d.setMonth(d.getMonth() - 2)
  if (p === '3m')  d.setMonth(d.getMonth() - 6)
  if (p === '6m')  d.setMonth(d.getMonth() - 12)
  if (p === '1an') d.setFullYear(d.getFullYear() - 2)
  return d
}

function filterSold(items: InventoryItem[], from: Date | null, to: Date | null = null): InventoryItem[] {
  return items.filter((i) => {
    if (i.status !== 'Vendu' || !i.sold_at) return false
    const d = new Date(i.sold_at)
    if (from && d < from) return false
    if (to   && d >= to)  return false
    return true
  })
}

function buildChartData(sold: InventoryItem[], period: Period) {
  const groupByMonth = period === '1an' || period === 'all'
  const map: Record<string, { key: string; ca: number; profit: number; count: number }> = {}

  sold.forEach((item) => {
    if (!item.sold_at) return
    const d = new Date(item.sold_at)
    const key = groupByMonth
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : d.toISOString().split('T')[0]
    const label = groupByMonth
      ? d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
      : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })

    if (!map[key]) map[key] = { key, ca: 0, profit: 0, count: 0 }
    const cost = item.purchase_price + item.vinted_fees + item.boost_cost
    map[key].ca      += (item.actual_sale_price ?? 0)
    map[key].profit  += (item.actual_sale_price ?? 0) - item.sale_fees - cost
    map[key].count   += 1
  })

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      date:   v.key.length === 7
        ? new Date(v.key + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
        : new Date(v.key).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      ca:     parseFloat(v.ca.toFixed(2)),
      profit: parseFloat(v.profit.toFixed(2)),
      count:  v.count,
    }))
}

function buildTop5(sold: InventoryItem[]) {
  const map: Record<string, { count: number; ca: number; profit: number }> = {}
  sold.forEach((item) => {
    const raw = item.brand || item.item_name.split(/[\s\-–—]/)[0].trim()
    const brand = raw.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    if (!map[brand]) map[brand] = { count: 0, ca: 0, profit: 0 }
    const cost = item.purchase_price + item.vinted_fees + item.boost_cost
    map[brand].count  += 1
    map[brand].ca     += item.actual_sale_price ?? 0
    map[brand].profit += (item.actual_sale_price ?? 0) - item.sale_fees - cost
  })
  return Object.entries(map)
    .map(([brand, d]) => ({ brand, ...d, avgProfit: d.count > 0 ? d.profit / d.count : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

function buildSizeData(sold: InventoryItem[], category: 'Chaussure' | 'Vêtement') {
  const map: Record<string, number> = {}
  sold
    .filter((i) => i.category === category && i.size)
    .forEach((i) => {
      const s = i.size!.trim()
      map[s] = (map[s] ?? 0) + 1
    })
  return Object.entries(map)
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function Evolution({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-zinc-600">—</span>
  const pos = value >= 0
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? '+' : ''}{value.toFixed(1)}% vs période préc.
    </span>
  )
}

interface KpiCardProps {
  icon: React.ElementType
  label: string
  value: string
  sub?: React.ReactNode
  accent: string
  valueColor?: string
}
function KpiCard({ icon: Icon, label, value, sub, accent, valueColor = 'text-white' }: KpiCardProps) {
  return (
    <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">{label}</span>
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center border ${accent}`}>
          <Icon size={12} />
        </div>
      </div>
      <div>
        <p className={`text-2xl font-bold tracking-tight leading-none ${valueColor}`}>{value}</p>
        {sub && <div className="mt-1.5">{sub}</div>}
      </div>
    </div>
  )
}

// Tooltip custom pour le graphique
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#18181b] border border-zinc-700/60 rounded-xl px-3 py-2.5 shadow-xl text-xs">
      <p className="text-zinc-400 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-semibold" style={{ color: p.name === 'ca' ? '#34d399' : '#60a5fa' }}>
          {p.name === 'ca' ? 'CA' : 'Bénéfice'} : {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function StatsTab({ items }: StatsTabProps) {
  const [period, setPeriod] = useState<Period>('1m')

  const currentStart = useMemo(() => periodStart(period), [period])
  const prevStart    = useMemo(() => prevPeriodStart(period), [period])

  const currentSold = useMemo(
    () => filterSold(items, currentStart),
    [items, currentStart]
  )
  const prevSold = useMemo(
    () => filterSold(items, prevStart, currentStart ?? undefined),
    [items, prevStart, currentStart]
  )

  // ── KPIs ──────────────────────────────────────────────
  const ca      = currentSold.reduce((s, i) => s + (i.actual_sale_price ?? 0), 0)
  const prevCa  = prevSold.reduce((s, i) => s + (i.actual_sale_price ?? 0), 0)
  const caEvol  = prevCa > 0 ? ((ca - prevCa) / prevCa) * 100 : null

  const totalCost     = currentSold.reduce((s, i) => s + i.purchase_price + i.vinted_fees + i.boost_cost, 0)
  const totalSaleFees = currentSold.reduce((s, i) => s + i.sale_fees, 0)
  const netProfit     = ca - totalSaleFees - totalCost
  const avgNetProfit  = currentSold.length > 0 ? netProfit / currentSold.length : 0

  const boostBudget = currentSold.reduce((s, i) => s + i.boost_cost, 0)

  const prevNet     = prevSold.reduce((s, i) => {
    const cost = i.purchase_price + i.vinted_fees + i.boost_cost
    return s + (i.actual_sale_price ?? 0) - i.sale_fees - cost
  }, 0)
  const profitEvol  = prevNet !== 0 ? ((netProfit - prevNet) / Math.abs(prevNet)) * 100 : null

  const delays = currentSold
    .filter((i) => i.sold_at)
    .map((i) => {
      const start = i.posted_at ?? i.created_at
      return (new Date(i.sold_at!).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
    })
  const avgDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null

  const stockListed = items.filter((i) => i.status !== 'Vendu').length

  // ── Chart & Brands ────────────────────────────────────
  const chartData     = useMemo(() => buildChartData(currentSold, period), [currentSold, period])
  const top5          = useMemo(() => buildTop5(currentSold), [currentSold])
  const shoesSizes    = useMemo(() => buildSizeData(currentSold, 'Chaussure'), [currentSold])
  const clothingSizes = useMemo(() => buildSizeData(currentSold, 'Vêtement'), [currentSold])

  return (
    <div className="space-y-6">
      {/* ── Sélecteur de période ── */}
      <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-1 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              period === p.key
                ? 'bg-emerald-500 text-black shadow'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          icon={ShoppingBag}
          label="Chiffre d'affaires"
          value={formatCurrency(ca)}
          sub={<Evolution value={caEvol} />}
          accent="bg-emerald-400/10 border-emerald-400/20 text-emerald-400"
          valueColor="text-emerald-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="Bénéfice net moyen"
          value={currentSold.length > 0 ? formatCurrency(avgNetProfit, true) : '—'}
          sub={<Evolution value={profitEvol} />}
          accent="bg-blue-400/10 border-blue-400/20 text-blue-400"
          valueColor={avgNetProfit >= 0 ? 'text-blue-400' : 'text-red-400'}
        />
        <KpiCard
          icon={BarChart2}
          label="Ventes"
          value={String(currentSold.length)}
          sub={<span className="text-[11px] text-zinc-600">{period === 'all' ? 'All Time' : `Sur la période`}</span>}
          accent="bg-violet-400/10 border-violet-400/20 text-violet-400"
          valueColor="text-violet-400"
        />
        <KpiCard
          icon={Clock}
          label="Délai moyen de vente"
          value={avgDelay !== null ? `${avgDelay.toFixed(0)}j` : '—'}
          sub={<span className="text-[11px] text-zinc-600">{avgDelay !== null ? 'Entre mise en ligne et vente' : 'Pas de données'}</span>}
          accent="bg-amber-400/10 border-amber-400/20 text-amber-400"
          valueColor="text-amber-400"
        />
        <KpiCard
          icon={Minus}
          label="Stock actif"
          value={`${stockListed} articles`}
          sub={<span className="text-[11px] text-zinc-600">En Stock + Sur Vinted</span>}
          accent="bg-zinc-600/20 border-zinc-600/30 text-zinc-400"
        />
        <KpiCard
          icon={Zap}
          label="Budget Boost"
          value={formatCurrency(boostBudget)}
          sub={<span className="text-[11px] text-zinc-600">{currentSold.filter(i => i.boost_cost > 0).length} article{currentSold.filter(i => i.boost_cost > 0).length > 1 ? 's' : ''} boosté{currentSold.filter(i => i.boost_cost > 0).length > 1 ? 's' : ''}</span>}
          accent="bg-amber-400/10 border-amber-400/20 text-amber-400"
          valueColor={boostBudget > 0 ? 'text-amber-400' : 'text-zinc-500'}
        />
      </div>

      {/* ── Graphique ── */}
      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Évolution du CA</p>
          <div className="flex items-center gap-4 text-[11px] text-zinc-600">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />CA</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Bénéfice</span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">
            Aucune vente sur cette période
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#34d399" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#52525b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}€`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="ca"     stroke="#34d399" strokeWidth={2} fill="url(#gradCA)"     dot={false} activeDot={{ r: 4, fill: '#34d399' }} />
              <Area type="monotone" dataKey="profit" stroke="#60a5fa" strokeWidth={2} fill="url(#gradProfit)" dot={false} activeDot={{ r: 4, fill: '#60a5fa' }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Top 5 Marques ── */}
      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/60 flex items-center gap-2">
          <Award size={13} className="text-amber-400" />
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Top 5 marques vendues</p>
        </div>
        {top5.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-zinc-600 text-sm">Aucune donnée</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/40">
                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Rang</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Marque</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Ventes</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">CA total</th>
                <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Marge moy.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/30">
              {top5.map((row, i) => (
                <tr key={row.brand} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-amber-700' : 'text-zinc-600'}`}>
                      #{i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">{row.brand}</td>
                  <td className="px-4 py-3 text-right text-zinc-300">{row.count}</td>
                  <td className="px-4 py-3 text-right text-zinc-300">{formatCurrency(row.ca)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={row.avgProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                      {formatCurrency(row.avgProfit, true)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Tailles Chaussures ── */}
      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-5">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-5">
          👟 Top Tailles Chaussures
        </p>
        {shoesSizes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">Aucune donnée</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={shoesSizes} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="size" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 }}
                formatter={(v: number) => [v, 'Ventes']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {shoesSizes.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#38bdf8' : i === 1 ? '#0ea5e9' : '#0284c7'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Tailles Vêtements ── */}
      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-5">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-5">
          👕 Distribution Tailles Vêtements
        </p>
        {clothingSizes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">Aucune donnée</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={clothingSizes} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="size" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 }}
                formatter={(v: number) => [v, 'Ventes']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {clothingSizes.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#a78bfa' : i === 1 ? '#8b5cf6' : '#7c3aed'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
