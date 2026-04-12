'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { InventoryItem } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { CheckCircle2, Zap, Loader2 } from 'lucide-react'

interface SellModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (actualPrice: number, saleFees: number, boostCost: number) => Promise<void>
  item: InventoryItem | null
  roiTarget: number
}

export default function SellModal({ open, onClose, onConfirm, item, roiTarget }: SellModalProps) {
  const [actualPrice, setActualPrice] = useState('')
  const [saleFees, setSaleFees] = useState('')
  const [usedBoost, setUsedBoost] = useState(false)
  const [boostCost, setBoostCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setActualPrice(item?.expected_sale_price != null ? String(item.expected_sale_price) : '')
      setSaleFees('')
      setUsedBoost(false)
      setBoostCost('')
    }
  }, [open, item])

  if (!item) return null

  const price = parseFloat(actualPrice) || 0
  const fees = parseFloat(saleFees) || 0
  const boost = usedBoost ? (parseFloat(boostCost) || 0) : 0
  const costBasis = item.purchase_price + item.vinted_fees + boost
  const margin = price > 0 ? price - fees - costBasis : null
  const roi = margin !== null && costBasis > 0 ? (margin / costBasis) * 100 : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (price <= 0) return
    setSaving(true)
    setError(null)
    try {
      await onConfirm(price, fees, boost)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la vente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Confirmer la vente">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        {/* Info article */}
        <div className="bg-zinc-900 rounded-xl px-4 py-3 border border-zinc-800">
          <p className="text-sm font-medium text-white">{item.item_name}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 flex-wrap">
            <span>Achat : <span className="text-zinc-300">{formatCurrency(item.purchase_price + item.vinted_fees)}</span></span>
            <span>·</span>
            <span>Prix visé : <span className="text-zinc-300">{item.expected_sale_price != null ? formatCurrency(item.expected_sale_price) : '—'}</span></span>
            <span>·</span>
            <span>{item.location}</span>
          </div>
        </div>

        {/* Prix + frais */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Prix de vente réel"
            required
            type="number" step="0.01" min="0"
            placeholder="65.00" suffix="€"
            value={actualPrice}
            onChange={(e) => setActualPrice(e.target.value)}
          />
          <Input
            label="Frais Vinted (vente)"
            type="number" step="0.01" min="0"
            placeholder="2.60" suffix="€"
            hint="~4% du prix"
            value={saleFees}
            onChange={(e) => setSaleFees(e.target.value)}
          />
        </div>

        {/* Boost */}
        <div className="space-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setUsedBoost(!usedBoost)}
              className={`w-9 h-5 rounded-full transition-colors relative ${usedBoost ? 'bg-amber-500' : 'bg-zinc-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${usedBoost ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <div className="flex items-center gap-1.5">
              <Zap size={12} className={usedBoost ? 'text-amber-400' : 'text-zinc-600'} />
              <span className="text-xs font-medium text-zinc-400">Boost Vinted utilisé</span>
            </div>
          </label>

          {usedBoost && (
            <Input
              label="Coût du boost"
              type="number" step="0.01" min="0"
              placeholder="0.95" suffix="€"
              hint="Déduit de la marge nette"
              value={boostCost}
              onChange={(e) => setBoostCost(e.target.value)}
            />
          )}
        </div>

        {/* Résultat */}
        {margin !== null && (
          <div className={`rounded-xl px-4 py-3.5 border space-y-1.5 ${
            (roi ?? 0) >= roiTarget ? 'bg-emerald-500/5 border-emerald-500/20'
            : (roi ?? 0) >= 0 ? 'bg-amber-500/5 border-amber-500/20'
            : 'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Marge nette{boost > 0 ? ' (boost inclus)' : ''}</span>
              <span className={`font-bold text-base ${margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(margin, true)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">ROI réalisé</span>
              <span className={`font-semibold text-sm ${
                (roi ?? 0) >= roiTarget ? 'text-emerald-400' : (roi ?? 0) >= 0 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {roi !== null ? `${roi.toFixed(1)}%` : '—'}
                {(roi ?? 0) >= roiTarget && <span className="ml-1 text-xs">✓</span>}
              </span>
            </div>
            {boost > 0 && (
              <div className="flex items-center justify-between border-t border-zinc-800/60 pt-1.5 mt-1">
                <span className="text-xs text-zinc-600 flex items-center gap-1"><Zap size={10} />Boost</span>
                <span className="text-xs text-amber-400">-{formatCurrency(boost)}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-[11px] text-red-400 text-center px-1">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors disabled:opacity-40">
            Annuler
          </button>
          <button type="submit" disabled={saving || price <= 0}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {saving ? 'Enregistrement…' : 'Confirmer la vente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
