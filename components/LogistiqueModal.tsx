'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { Consumable, ConsumableCategory } from '@/types'
import { Loader2 } from 'lucide-react'

interface LogistiqueModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: { name: string; price: number; quantity: number; date: string; category: ConsumableCategory }) => Promise<void>
  initialData?: Consumable
}

const CATEGORIES: { value: ConsumableCategory; label: string }[] = [
  { value: 'PACKAGING', label: 'Emballage (cartons, bulles…)' },
  { value: 'SHIPPING',  label: 'Expédition / timbre' },
  { value: 'OTHER',     label: 'Autre' },
]

export default function LogistiqueModal({ open, onClose, onSave, initialData }: LogistiqueModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const [name, setName]         = useState('')
  const [price, setPrice]       = useState('')
  const [quantity, setQuantity] = useState('1')
  const [date, setDate]         = useState(today)
  const [category, setCategory] = useState<ConsumableCategory>('PACKAGING')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name)
      setPrice(String(initialData.price))
      setQuantity(String(initialData.quantity ?? 1))
      setDate(initialData.date)
      setCategory(initialData.category)
    } else if (open && !initialData) {
      reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function reset() {
    setName(''); setPrice(''); setQuantity('1'); setDate(today); setCategory('PACKAGING'); setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const p = parseFloat(price)
    const q = parseInt(quantity) || 1
    if (!name.trim()) return setError('Nom requis')
    if (isNaN(p) || p <= 0) return setError('Prix unitaire invalide')
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), price: p, quantity: q, date, category })
      reset()
      onClose()
    } catch {
      setError("Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={initialData ? 'Modifier la dépense' : 'Ajouter un achat logistique'} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

        <div>
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Article</label>
          <input
            type="text"
            placeholder="ex : Cartons, Scotch, Enveloppe bulle…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Prix unitaire (€)</label>
            <input
              type="number" placeholder="0,00" min="0" step="0.01"
              value={price} onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Quantité</label>
            <input
              type="number" placeholder="1" min="1" step="1"
              value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
        </div>
        {parseFloat(price) > 0 && parseInt(quantity) > 1 && (
          <p className="text-xs text-zinc-500 -mt-2">
            Total : <span className="text-white font-semibold">{(parseFloat(price) * parseInt(quantity)).toFixed(2)}€</span>
          </p>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Date</label>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Catégorie</label>
          <div className="flex flex-col gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`text-left px-3.5 py-2 rounded-xl text-xs font-medium transition-colors border ${
                  category === c.value
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-zinc-900 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button" onClick={handleClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700/60 text-zinc-400 text-sm font-medium hover:bg-zinc-800/50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit" disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-sm font-bold transition-colors"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  )
}
