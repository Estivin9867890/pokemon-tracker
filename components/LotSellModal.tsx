'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { InventoryItem } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { ShoppingCart, Loader2, TrendingUp, TrendingDown } from 'lucide-react'

interface LotSellModalProps {
  open: boolean
  onClose: () => void
  item: InventoryItem | null
  onConfirm: (itemsSoldDelta: number, revenueDelta: number) => Promise<void>
}

export default function LotSellModal({ open, onClose, item, onConfirm }: LotSellModalProps) {
  const [qty, setQty]         = useState('1')
  const [revenue, setRevenue] = useState('')
  const [saving, setSaving]   = useState(false)

  if (!item) return null

  const totalCards   = item.item_count ?? 1
  const alreadySold  = item.items_sold ?? 0
  const remaining    = totalCards - alreadySold
  const totalRevenue = item.revenue_generated ?? 0
  const totalCost    = item.lot_total_cost ?? item.purchase_price

  const qtyNum     = Math.max(0, Math.min(remaining, parseInt(qty) || 0))
  const revenueNum = parseFloat(revenue) || 0

  const newRevenue   = totalRevenue + revenueNum
  const profit       = newRevenue - totalCost
  const isProfitable = newRevenue >= totalCost

  async function handleConfirm() {
    if (qtyNum <= 0 || revenueNum <= 0) return
    setSaving(true)
    await onConfirm(qtyNum, revenueNum)
    setQty('1')
    setRevenue('')
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Vente partielle — Lot" maxWidth="max-w-sm">
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

        {/* Inputs */}
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
          disabled={saving || qtyNum <= 0 || revenueNum <= 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}
          Enregistrer la vente
        </button>
      </div>
    </Modal>
  )
}
