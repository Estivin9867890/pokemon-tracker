'use client'

import { useState } from 'react'
import { DashboardStats, AppSettings, InventoryItem } from '@/types'
import { formatCurrency, formatROI } from '@/lib/calculations'
import { Wallet, TrendingUp, BarChart3, Package, Info, ShoppingBag } from 'lucide-react'
import EstimatedProfitPopup from '@/components/EstimatedProfitPopup'
import FinancementPopup from '@/components/FinancementPopup'

interface StatsBarProps {
  stats: DashboardStats
  settings: AppSettings
  items: InventoryItem[]
  onSaveSettings: (s: AppSettings) => void
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

function CapitalTile({ stats, onInfoClick, onTresoClick }: { stats: DashboardStats; onInfoClick: () => void; onTresoClick: () => void }) {
  const cashNeg     = stats.cashInHand < 0
  const cashColor   = cashNeg ? 'text-red-500' : 'text-emerald-400'
  const cashDisplay = cashNeg
    ? `-${formatCurrency(Math.abs(stats.cashInHand))}`
    : formatCurrency(stats.cashInHand)

  return (
    <div className={`bg-[#111113] border rounded-2xl p-5 flex flex-col gap-2 transition-colors ${cashNeg ? 'border-red-500/30 hover:border-red-500/50' : 'border-zinc-800/80 hover:border-zinc-700'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Capital</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center border bg-blue-400/10 border-blue-400/20 text-blue-400">
          <Wallet size={14} />
        </div>
      </div>
      <button onClick={onTresoClick} className="text-left group" title="Voir le financement du stock">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Trésorerie</p>
        <p className={`text-[24px] font-bold tracking-tight leading-none ${cashColor} group-hover:opacity-80 transition-opacity`}>
          {cashDisplay}
        </p>
        {cashNeg && (
          <p className="text-[10px] text-red-500/70 mt-0.5">Cliquer pour détails</p>
        )}
      </button>
      <div className="h-px bg-zinc-800/60" />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Valeur Stock</p>
          <p className="text-[18px] font-semibold tracking-tight leading-none text-amber-400">
            {formatCurrency(stats.stockValue)}
          </p>
        </div>
        <button
          onClick={onInfoClick}
          className="w-6 h-6 flex items-center justify-center rounded-full border border-zinc-700 text-zinc-500 hover:text-amber-400 hover:border-amber-400/40 transition-colors"
          title="Bénéfice estimé du stock"
        >
          <Info size={11} />
        </button>
      </div>
    </div>
  )
}

export default function StatsBar({ stats, settings, items, onSaveSettings }: StatsBarProps) {
  const [profitPopupOpen, setProfitPopupOpen]           = useState(false)
  const [financementPopupOpen, setFinancementPopupOpen] = useState(false)
  const capitalGrowth = ((stats.currentCapital - settings.initial_capital) / settings.initial_capital) * 100
  const roiOk = stats.avgROI >= settings.roi_target

  return (
    <>
      <EstimatedProfitPopup
        open={profitPopupOpen}
        onClose={() => setProfitPopupOpen(false)}
        items={items}
        roiTarget={settings.roi_target}
      />
      <FinancementPopup
        open={financementPopupOpen}
        onClose={() => setFinancementPopupOpen(false)}
        stats={stats}
        settings={settings}
        onSaveSettings={onSaveSettings}
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <CapitalTile
          stats={stats}
          onInfoClick={() => setProfitPopupOpen(true)}
          onTresoClick={() => setFinancementPopupOpen(true)}
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
        <StatTile
          icon={ShoppingBag}
          label="Budget Consommables"
          value={stats.consumablesTotal > 0 ? `-${formatCurrency(stats.consumablesTotal)}` : formatCurrency(0)}
          sub={`Moy. mensuelle : ${formatCurrency(stats.avgMonthlyConsumables)} · déduit de la tréso`}
          valueColor={stats.consumablesTotal > 0 ? 'text-red-400' : 'text-zinc-500'}
          accent="bg-red-400/10 border-red-400/20 text-red-400"
        />
      </div>
    </>
  )
}
