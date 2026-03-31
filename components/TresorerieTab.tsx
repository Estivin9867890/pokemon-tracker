'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { DashboardStats } from '@/types'
import { formatCurrency } from '@/lib/calculations'

interface TresorerieTabProps {
  stats: DashboardStats
}

const SLICES = [
  { key: 'stockValueLouis', label: 'Stock Louis', color: '#60a5fa' },
  { key: 'stockValueCelian', label: 'Stock Célian', color: '#a78bfa' },
  { key: 'cashInHand', label: 'Cash disponible', color: '#34d399' },
] as const

export default function TresorerieTab({ stats }: TresorerieTabProps) {
  const data = SLICES.map((s) => ({
    name: s.label,
    value: Math.max(stats[s.key], 0),
    color: s.color,
  })).filter((d) => d.value > 0)

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="space-y-6">
      {/* Tuiles résumé */}
      <div className="grid grid-cols-3 gap-3">
        {SLICES.map((s) => (
          <div key={s.key} className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider truncate">{s.label}</p>
            </div>
            <p className="text-xl font-bold text-white">{formatCurrency(Math.max(stats[s.key], 0))}</p>
            {total > 0 && (
              <p className="text-[11px] text-zinc-600 mt-1">
                {((Math.max(stats[s.key], 0) / total) * 100).toFixed(1)}% du capital
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Donut chart */}
      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-6">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-6">
          Répartition du capital
        </p>

        {data.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">
            Aucune donnée à afficher
          </div>
        ) : (
          <>
            <div className="relative h-64">
              <ResponsiveContainer width="100%" height={256}>
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} opacity={0.9} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#fafafa',
                    }}
                    formatter={(value) => [formatCurrency(value as number), '']}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Centre */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Total</p>
                <p className="text-xl font-bold text-white mt-0.5">{formatCurrency(total)}</p>
              </div>
            </div>

            {/* Légende */}
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              {data.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 flex-1">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: entry.color }} />
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400 truncate">{entry.name}</p>
                    <p className="text-sm font-semibold text-white">{formatCurrency(entry.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
