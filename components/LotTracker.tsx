'use client'

import { useMemo, useState } from 'react'
import { InventoryItem } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { Layers, ChevronDown, ChevronRight, PackageCheck } from 'lucide-react'

interface LotTrackerProps {
  items: InventoryItem[]
  onMarkReceived?: (item: InventoryItem) => void
}

interface LotSummary {
  parent: InventoryItem
  soldTotal: number
  costTotal: number
  soldCount: number
  totalCount: number
}

export default function LotTracker({ items, onMarkReceived }: LotTrackerProps) {
  const [open, setOpen] = useState(false)

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

  const enCoursCount = lots.filter((l) => l.parent.status !== 'Vendu').length

  if (lots.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-fit group"
      >
        {open ? <ChevronDown size={13} className="text-zinc-500" /> : <ChevronRight size={13} className="text-zinc-500" />}
        <Layers size={13} className="text-violet-400" />
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest group-hover:text-zinc-400 transition-colors">
          Suivi des Lots
        </span>
        {enCoursCount > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
            {enCoursCount} en cours
          </span>
        )}
      </button>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lots.map((lot) => {
            const progress   = lot.costTotal > 0 ? Math.min(100, (lot.soldTotal / lot.costTotal) * 100) : 0
            const isRecouped = lot.soldTotal >= lot.costTotal
            const isPending  = lot.parent.status === 'En Attente'

            return (
              <div
                key={lot.parent.id}
                className={`bg-[#111113] border rounded-2xl p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors ${isPending ? 'border-amber-500/30' : 'border-zinc-800/80'}`}
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
                  {isPending ? (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                      En transit
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
                      {lot.soldCount}/{lot.totalCount} vendus
                    </span>
                  )}
                </div>

                {isPending && onMarkReceived ? (
                  <button
                    type="button"
                    onClick={() => onMarkReceived(lot.parent)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-semibold transition-colors border border-amber-500/20"
                  >
                    <PackageCheck size={12} />
                    Marquer comme reçu
                  </button>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
