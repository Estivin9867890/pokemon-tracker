'use client'

import { useMemo, useEffect } from 'react'
import { X, TrendingUp } from 'lucide-react'
import { InventoryItem } from '@/types'
import { formatCurrency } from '@/lib/calculations'

interface EstimatedProfitPopupProps {
  open: boolean
  onClose: () => void
  items: InventoryItem[]
  roiTarget: number
}

export default function EstimatedProfitPopup({ open, onClose, items, roiTarget }: EstimatedProfitPopupProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const stats = useMemo(() => {
    const inStock = (i: InventoryItem) =>
      i.status === 'En Attente' ||
      i.status === 'En Stock' ||
      i.status === 'Sur Vinted' ||
      i.status === 'Partiellement vendu'

    const stockItems = items.filter(
      (i) => inStock(i) && !i.is_hit && !(i.lot_id !== null && !i.is_lot)
    )

    const nonHits = stockItems.filter((i) => i.expected_sale_price !== null)

    const totalCost    = nonHits.reduce((s, i) => s + i.purchase_price + i.vinted_fees + i.boost_cost, 0)
    const totalRevenue = nonHits.reduce((s, i) => s + (i.expected_sale_price ?? 0), 0)
    const totalProfit  = totalRevenue - totalCost
    const globalROI    = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0
    const roiProgress  = Math.min(100, Math.max(0, (globalROI / roiTarget) * 100))

    return {
      totalProfit, globalROI, roiProgress,
      withEstimateCount: nonHits.length,
      totalStockCount: stockItems.length,
    }
  }, [items, roiTarget])

  if (!open) return null

  const roiOk    = stats.globalROI >= roiTarget
  const colorCls = roiOk ? 'text-emerald-400' : stats.globalROI >= 0 ? 'text-amber-400' : 'text-red-400'
  const barCls   = roiOk ? 'bg-emerald-500'   : stats.globalROI >= 0 ? 'bg-amber-500'   : 'bg-red-500'
  const borderBg = roiOk
    ? 'bg-emerald-500/5 border-emerald-500/20'
    : stats.globalROI >= 0
    ? 'bg-amber-500/5 border-amber-500/20'
    : 'bg-red-500/5 border-red-500/20'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#0e0e10] border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Bénéfice Estimé du Stock</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-[11px] text-zinc-600">
            {stats.withEstimateCount} article{stats.withEstimateCount > 1 ? 's' : ''} avec prix visé
            {' '}sur {stats.totalStockCount} en stock
          </p>

          <div className={`rounded-2xl p-4 border space-y-3 ${borderBg}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Bénéfice Potentiel</span>
              <span className={`text-xl font-bold ${colorCls}`}>
                {stats.totalProfit >= 0 ? '+' : ''}{formatCurrency(stats.totalProfit)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wider">ROI Global Estimé</span>
              <span className={`text-sm font-bold ${colorCls}`}>
                {stats.globalROI >= 0 ? '+' : ''}{stats.globalROI.toFixed(1)}%
                {roiOk ? ' ✓' : ` (obj. ${roiTarget}%)`}
              </span>
            </div>

            <div className="space-y-1">
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barCls}`}
                  style={{ width: `${stats.roiProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600">
                <span>0%</span>
                <span>Objectif {roiTarget}%</span>
              </div>
            </div>
          </div>

          {stats.withEstimateCount === 0 && (
            <p className="text-xs text-zinc-600 text-center">
              Aucun article en stock n&apos;a de prix de revente renseigné.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
