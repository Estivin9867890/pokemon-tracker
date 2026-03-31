'use client'

import { DashboardStats, AppSettings } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { Target, TrendingUp } from 'lucide-react'

interface ObjectifsTabProps {
  stats: DashboardStats
  settings: AppSettings
}

const COLORS = [
  { hex: '#60a5fa', trackColor: 'bg-blue-400/15',    textColor: 'text-blue-400',    borderColor: 'border-blue-400/25' },
  { hex: '#34d399', trackColor: 'bg-emerald-400/15', textColor: 'text-emerald-400', borderColor: 'border-emerald-400/25' },
  { hex: '#fbbf24', trackColor: 'bg-amber-400/15',   textColor: 'text-amber-400',   borderColor: 'border-amber-400/25' },
]

export default function ObjectifsTab({ stats, settings }: ObjectifsTabProps) {
  const { netProfit, currentCapital } = stats

  const objectifs = [
    { label: settings.obj1_label, target: settings.obj1_target },
    { label: settings.obj2_label, target: settings.obj2_target },
    { label: settings.obj3_label, target: settings.obj3_target },
  ].map((o, i) => ({ ...o, ...COLORS[i] }))

  return (
    <div className="space-y-6">
      {/* Résumé */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Bénéfice net</p>
          <p className={`text-2xl font-bold mt-2 ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">Profits réalisés sur ventes</p>
        </div>
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Capital total</p>
          <p className="text-2xl font-bold text-white mt-2">{formatCurrency(currentCapital)}</p>
          <p className="text-[11px] text-zinc-600 mt-1">Départ : {formatCurrency(settings.initial_capital)}</p>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-[#111113] border border-zinc-800/80 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Target size={16} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-zinc-500">Prochain objectif</p>
            <p className="text-sm font-bold text-white mt-0.5">
              {objectifs.find((o) => netProfit < o.target)?.label ?? 'Tous atteints ✓'}
            </p>
          </div>
        </div>
      </div>

      {/* Barres de progression */}
      <div className="space-y-3">
        {objectifs.map((obj) => {
          const pct = Math.min((netProfit / obj.target) * 100, 100)
          const done = netProfit >= obj.target
          const remaining = Math.max(obj.target - netProfit, 0)

          return (
            <div
              key={obj.label}
              className={`bg-[#111113] border rounded-2xl p-5 ${done ? obj.borderColor : 'border-zinc-800/80'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={13} className={done ? obj.textColor : 'text-zinc-600'} />
                  <span className="text-sm font-semibold text-white">Objectif {obj.label}</span>
                  {done && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${obj.trackColor} ${obj.textColor} ${obj.borderColor}`}>
                      Atteint ✓
                    </span>
                  )}
                </div>
                <span className={`text-sm font-bold ${done ? obj.textColor : 'text-white'}`}>
                  {formatCurrency(obj.target)} de bénéfice
                </span>
              </div>

              {/* Barre */}
              <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: obj.hex, opacity: done ? 1 : 0.75 }}
                />
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-zinc-600">
                  {formatCurrency(Math.max(netProfit, 0))} · {pct.toFixed(1)}%
                </span>
                {!done && (
                  <span className="text-[11px] text-zinc-500">
                    Il manque <span className="text-zinc-300 font-medium">{formatCurrency(remaining)}</span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
