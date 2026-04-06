'use client'

import { useMemo } from 'react'
import { InventoryItem } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { Layers } from 'lucide-react'

interface LotTrackerProps {
  items: InventoryItem[]
}

interface LotSummary {
  parent: InventoryItem
  soldTotal: number
  costTotal: number
  soldCount: number
  totalCount: number
}

export default function LotTracker({ items }: LotTrackerProps) {
  const lots = useMemo<LotSummary[]>(() => {
    const parents = items.filter((i) => i.is_lot)
    return parents.map((parent) => {
      const children = items.filter(
        (i) => !i.is_lot && i.lot_id === parent.lot_id
      )
      const soldChildren = children.filter((i) => i.status === 'Vendu')
      const soldTotal = soldChildren.reduce(
        (s, i) => s + (i.actual_sale_price ?? 0) - i.sale_fees,
        0
      )
      return {
        parent,
        soldTotal,
        costTotal: parent.lot_total_cost ?? parent.purchase_price,
        soldCount: soldChildren.length,
        totalCount: parent.item_count ?? children.length,
      }
    })
  }, [items])

  if (lots.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Layers size={13} className="text-violet-400" />
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
          Suivi des Lots
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lots.map((lot) => {
          const progress   = lot.costTotal > 0 ? Math.min(100, (lot.soldTotal / lot.costTotal) * 100) : 0
          const isRecouped = lot.soldTotal >= lot.costTotal

          return (
            <div
              key={lot.parent.id}
              className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-white leading-tight">
                    {lot.parent.item_name}
                  </p>
                  {lot.parent.extension && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">{lot.parent.extension}</p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
                  {lot.soldCount}/{lot.totalCount} vendus
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <span className={`text-base font-bold ${isRecouped ? 'text-emerald-400' : 'text-white'}`}>
                  {formatCurrency(lot.soldTotal)}
                </span>
                <span className="text-[11px] text-zinc-600">
                  / {formatCurrency(lot.costTotal)}
                </span>
              </div>

              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isRecouped ? 'bg-emerald-500' : 'bg-violet-500'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className={`text-[10px] text-right ${isRecouped ? 'text-emerald-500' : 'text-zinc-600'}`}>
                {isRecouped ? '✓ Coût remboursé' : `${progress.toFixed(0)}% remboursé`}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
