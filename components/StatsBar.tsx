'use client'

import { DashboardStats, AppSettings } from '@/types'
import { formatCurrency, formatROI } from '@/lib/calculations'
import { Wallet, TrendingUp, BarChart3, Package } from 'lucide-react'

interface StatsBarProps {
  stats: DashboardStats
  settings: AppSettings
}

interface StatTileProps {
  icon: React.ElementType
  label: string
  value: string
  sub: string
  valueColor?: string
  accent: string
}

function StatTile({ icon: Icon, label, value, sub, valueColor = 'text-white', accent }: StatTileProps) {
  return (
    <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${accent}`}>
          <Icon size={14} />
        </div>
      </div>
      <div>
        <p className={`text-[26px] font-bold tracking-tight leading-none ${valueColor}`}>{value}</p>
        <p className="text-[11px] text-zinc-600 mt-1.5">{sub}</p>
      </div>
    </div>
  )
}

export default function StatsBar({ stats, settings }: StatsBarProps) {
  const capitalGrowth = ((stats.currentCapital - settings.initial_capital) / settings.initial_capital) * 100
  const roiOk = stats.avgROI >= settings.roi_target

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatTile
        icon={Wallet}
        label="Capital Actuel"
        value={formatCurrency(stats.currentCapital)}
        sub={`Cash : ${formatCurrency(stats.cashInHand)} · Stock : ${formatCurrency(stats.stockValue)}`}
        valueColor={stats.currentCapital >= settings.initial_capital ? 'text-white' : 'text-red-400'}
        accent="bg-blue-400/10 border-blue-400/20 text-blue-400"
      />
      <StatTile
        icon={TrendingUp}
        label="Bénéfice Net"
        value={formatCurrency(stats.netProfit, true)}
        sub={`${stats.soldCount} article${stats.soldCount > 1 ? 's' : ''} vendu${stats.soldCount > 1 ? 's' : ''} · croissance ${capitalGrowth >= 0 ? '+' : ''}${capitalGrowth.toFixed(1)}%`}
        valueColor={stats.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
        accent="bg-emerald-400/10 border-emerald-400/20 text-emerald-400"
      />
      <StatTile
        icon={BarChart3}
        label="ROI Moyen"
        value={formatROI(stats.avgROI)}
        sub={roiOk ? `Objectif ${settings.roi_target}% atteint ✓` : `Objectif : ${settings.roi_target}% minimum`}
        valueColor={roiOk ? 'text-emerald-400' : 'text-amber-400'}
        accent={roiOk ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'bg-amber-400/10 border-amber-400/20 text-amber-400'}
      />
      <StatTile
        icon={Package}
        label="En Stock"
        value={`${stats.stockCount} articles`}
        sub={`Valeur estimée : ${formatCurrency(stats.pendingValue)}`}
        valueColor="text-amber-400"
        accent="bg-amber-400/10 border-amber-400/20 text-amber-400"
      />
    </div>
  )
}
