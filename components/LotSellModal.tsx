'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { InventoryItem } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { ShoppingCart, Loader2, TrendingUp, TrendingDown, Sparkles } from 'lucide-react'

interface LotSellModalProps {
  open: boolean
  onClose: () => void
  item: InventoryItem | null
  hits?: InventoryItem[]
  onConfirm: (itemsSoldDelta: number, revenueDelta: number, hitSales?: { id: string; soldPrice: number }[]) => Promise<void>
}

export default function LotSellModal({ open, onClose, item, hits = [], onConfirm }: LotSellModalProps) {
  const [qty, setQty]         = useState('1')
  const [revenue, setRevenue] = useState('')
  const [saving, setSaving]   = useState(false)
  // Hits mode
  const [checkedHits, setCheckedHits] = useState<Record<string, boolean>>({})
  const [hitPrices, setHitPrices]     = useState<Record<string, string>>({})

  if (!item) return null

  const unsoldHits   = hits.filter((h) => !h.is_sold)
  const hasHits      = unsoldHits.length > 0
  const totalCards   = item.item_count ?? 1
  const alreadySold  = item.items_sold ?? 0
  const remaining    = totalCards - alreadySold
  const totalRevenue = item.revenue_generated ?? 0
  const totalCost    = item.lot_total_cost ?? item.purchase_price

  // Hits mode calculations
  const selectedHits = unsoldHits.filter((h) => checkedHits[h.id])
  const hitsRevenue  = selectedHits.reduce((s, h) => s + (parseFloat(hitPrices[h.id] ?? '') || 0), 0)

  // Classic mode calculations
  const qtyNum     = Math.max(0, Math.min(remaining, parseInt(qty) || 0))
  const revenueNum = hasHits ? hitsRevenue : (parseFloat(revenue) || 0)
  const qtyDelta   = hasHits ? selectedHits.length : qtyNum

  const newRevenue   = totalRevenue + revenueNum
  const profit       = newRevenue - totalCost
  const isProfitable = newRevenue >= totalCost

  const canConfirm = hasHits
    ? selectedHits.length > 0 && selectedHits.every((h) => (parseFloat(hitPrices[h.id] ?? '') || 0) > 0)
    : qtyNum > 0 && revenueNum > 0

  async function handleConfirm() {
    if (!canConfirm) return
    setSaving(true)
    const hitSales = hasHits
      ? selectedHits.map((h) => ({ id: h.id, soldPrice: parseFloat(hitPrices[h.id]) }))
      : undefined
    await onConfirm(qtyDelta, revenueNum, hitSales)
    setQty('1')
    setRevenue('')
    setCheckedHits({})
    setHitPrices({})
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Vente partielle — Lot" maxWidth="max-w-md">
      <div className="px-6 py-5 space-y-4">

        {/* Info lot */}
        <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-white">{item.item_name}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Lot de {totalCards} cartes · Coût total : {formatCurrency(totalCost)}
          </p>
          <div className="mt-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500">{alreadySold} vendues</span>
              <span className="text-[10px] text-zinc-500">{remaining} restantes</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, totalCards > 0 ? (alreadySold / totalCards) * 100 : 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Hits checklist */}
        {hasHits ? (
          <div className="space-y-2">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Hits à vendre ({unsoldHits.length})</p>
            <div className="max-h-96 overflow-y-auto space-y-2 pr-0.5">
            {unsoldHits.map((hit) => (
              <div key={hit.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${checkedHits[hit.id] ? 'bg-amber-500/8 border-amber-500/25' : 'bg-zinc-900/60 border-zinc-800'}`}>
                <input
                  type="checkbox"
                  checked={!!checkedHits[hit.id]}
                  onChange={(e) => setCheckedHits((prev) => ({ ...prev, [hit.id]: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-amber-400 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={9} className="text-amber-400 shrink-0" />
                    <p className="text-xs font-medium text-white truncate">{hit.pokemon_name ?? hit.item_name}</p>
                    {hit.card_number && <span className="text-[10px] text-zinc-600 shrink-0">#{hit.card_number}</span>}
                  </div>
                  {hit.expected_sale_price != null && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">Estim. {formatCurrency(hit.expected_sale_price)}</p>
                  )}
                </div>
                {checkedHits[hit.id] && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Prix €"
                    value={hitPrices[hit.id] ?? ''}
                    onChange={(e) => setHitPrices((prev) => ({ ...prev, [hit.id]: e.target.value }))}
                    className="w-24 shrink-0 bg-zinc-800 border border-zinc-700/60 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400/50 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            ))}
            </div>
          </div>
        ) : (
          /* Formulaire classique */
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Nb cartes vendues</label>
              <input
                type="number"
                min="1"
                max={remaining}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400/50 transition-colors"
              />
              <p className="text-[10px] text-zinc-600 mt-0.5">{remaining} restantes sur {totalCards}</p>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Revenus encaissés (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-400/50 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Bilan prévisionnel */}
        {revenueNum > 0 && (
          <div className={`rounded-xl px-4 py-3 ${isProfitable ? 'bg-emerald-500/8 border border-emerald-500/20' : 'bg-red-500/8 border border-red-500/20'}`}>
            <div className="flex items-center gap-2 mb-1">
              {isProfitable
                ? <TrendingUp size={12} className="text-emerald-400" />
                : <TrendingDown size={12} className="text-red-400" />
              }
              <p className="text-xs font-semibold text-white">
                {isProfitable ? 'Lot rentabilisé ✓' : `Manque ${formatCurrency(Math.abs(profit))} pour rentabiliser`}
              </p>
            </div>
            <p className="text-[10px] text-zinc-500">
              Total encaissé : {formatCurrency(newRevenue)} / {formatCurrency(totalCost)}
            </p>
            <p className={`text-[10px] font-medium mt-0.5 ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {profit >= 0 ? '+' : ''}{formatCurrency(profit)} marge brute
            </p>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={saving || !canConfirm}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}
          Enregistrer la vente
        </button>
      </div>
    </Modal>
  )
}
