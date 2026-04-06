'use client'

import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown } from 'lucide-react'

interface ProfitCalculatorProps {
  open: boolean
  onClose: () => void
  initialBuyPrice: number
  initialSellPrice: number
  initialFees: number
  roiTarget: number
}

export default function ProfitCalculator({
  open, onClose,
  initialBuyPrice, initialSellPrice, initialFees,
  roiTarget,
}: ProfitCalculatorProps) {
  const [buyPrice, setBuyPrice]   = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [fees, setFees]           = useState('')

  useEffect(() => {
    if (!open) return
    setBuyPrice(initialBuyPrice  > 0 ? String(initialBuyPrice)  : '')
    setSellPrice(initialSellPrice > 0 ? String(initialSellPrice) : '')
    setFees(initialFees          > 0 ? String(initialFees)       : '')
  }, [open, initialBuyPrice, initialSellPrice, initialFees])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const buy    = parseFloat(buyPrice)  || 0
  const sell   = parseFloat(sellPrice) || 0
  const fee    = parseFloat(fees)      || 0
  const profit = sell > 0 ? sell - buy - fee : null
  const roi    = profit !== null && (buy + fee) > 0
    ? (profit / (buy + fee)) * 100
    : null
  const roiOk  = roi !== null && roi >= roiTarget

  const colorClass = roiOk
    ? 'text-emerald-400'
    : (profit ?? 0) >= 0
    ? 'text-amber-400'
    : 'text-red-400'

  const borderBg = roiOk
    ? 'bg-emerald-500/5 border-emerald-500/20'
    : (profit ?? 0) >= 0
    ? 'bg-amber-500/5 border-amber-500/20'
    : 'bg-red-500/5 border-red-500/20'

  const barColor = roiOk
    ? 'bg-emerald-500'
    : (profit ?? 0) >= 0
    ? 'bg-amber-500'
    : 'bg-red-500'

  const fields = [
    { label: "Prix d'achat",         value: buyPrice,  set: setBuyPrice,  placeholder: '35.00' },
    { label: 'Prix de vente estimé', value: sellPrice, set: setSellPrice, placeholder: '65.00' },
    { label: 'Frais (Vinted / Boost)', value: fees,    set: setFees,      placeholder: '2.50'  },
  ]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#0e0e10] border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="text-base">🧮</span>
            <h3 className="text-sm font-semibold text-white">Simulateur de Bénéfice</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="space-y-3">
            {fields.map(({ label, value, set, placeholder }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  {label}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:border-zinc-600 focus:ring-zinc-600/20 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-600 pointer-events-none">€</span>
                </div>
              </div>
            ))}
          </div>

          <div className="h-px bg-zinc-800/60" />

          {profit !== null ? (
            <div className={`rounded-2xl p-4 border space-y-3 ${borderBg}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Bénéfice Net</span>
                <div className={`flex items-center gap-1.5 text-xl font-bold ${colorClass}`}>
                  {profit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {profit >= 0 ? '+' : ''}{profit.toFixed(2)}€
                </div>
              </div>

              {roi !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 uppercase tracking-wider">ROI</span>
                  <span className={`text-sm font-bold ${colorClass}`}>
                    {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                    {roiOk ? ' ✓' : ` (obj. ${roiTarget}%)`}
                  </span>
                </div>
              )}

              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, roi ?? 0))}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-4 border border-zinc-800/60 bg-zinc-900/30 text-center">
              <p className="text-xs text-zinc-600">
                Renseigne un prix de vente pour voir le bénéfice
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
