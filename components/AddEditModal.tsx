'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { Category, InventoryItem, ItemFormData, Location } from '@/types'
import { calcItem, formatCurrency } from '@/lib/calculations'
import { TrendingUp } from 'lucide-react'

interface AddEditModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: ItemFormData, id?: string) => void
  item?: InventoryItem | null
  roiTarget: number
  defaultVintedFees: number
}

const EMPTY_FORM: ItemFormData = {
  item_name: '',
  brand: '',
  purchase_price: '',
  vinted_fees: '',
  expected_sale_price: '',
  location: 'Chez Louis',
  notes: '',
  category: null,
  size: '',
}

const LOCATION_OPTIONS = [
  { value: 'Chez Louis', label: 'Chez Louis' },
  { value: 'Chez Célian', label: 'Chez Célian' },
]

export default function AddEditModal({ open, onClose, onSave, item, roiTarget, defaultVintedFees }: AddEditModalProps) {
  const isEdit = !!item
  const emptyForm: ItemFormData = { ...EMPTY_FORM, vinted_fees: defaultVintedFees > 0 ? String(defaultVintedFees) : '' }
  const [form, setForm] = useState<ItemFormData>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof ItemFormData, string>>>({})

  // Remplir le formulaire en mode édition
  useEffect(() => {
    if (item) {
      setForm({
        item_name: item.item_name,
        brand: item.brand ?? '',
        purchase_price: String(item.purchase_price),
        vinted_fees: String(item.vinted_fees),
        expected_sale_price: item.expected_sale_price != null ? String(item.expected_sale_price) : '',
        location: item.location,
        notes: item.notes ?? '',
        category: item.category ?? null,
        size: item.size ?? '',
      })
    } else {
      setForm(emptyForm)
    }
    setErrors({})
  }, [item, open])

  const set = (k: keyof ItemFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((p) => ({ ...p, [k]: e.target.value }))

  // Preview marge temps réel
  const buyPrice = parseFloat(form.purchase_price) || 0
  const fees = parseFloat(form.vinted_fees) || 0
  const sellEst = parseFloat(form.expected_sale_price) || 0
  const margin = sellEst > 0 ? sellEst - buyPrice - fees : null
  const roi = margin !== null && (buyPrice + fees) > 0 ? (margin / (buyPrice + fees)) * 100 : null

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.item_name.trim()) e.item_name = 'Requis'
    if (!form.purchase_price || isNaN(parseFloat(form.purchase_price))) e.purchase_price = 'Nombre valide requis'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave(form, item?.id)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier l\'article' : 'Ajouter un article'}
    >
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        {/* Nom + Marque */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nom de l'article"
            required
            placeholder="Air Force 1 — T42"
            value={form.item_name}
            onChange={set('item_name')}
            error={errors.item_name}
          />
          <Input
            label="Marque"
            placeholder="Nike"
            value={form.brand}
            onChange={set('brand')}
          />
        </div>

        {/* Prix */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Prix d'achat"
            required
            type="number"
            step="0.01"
            min="0"
            placeholder="35.00"
            suffix="€"
            value={form.purchase_price}
            onChange={set('purchase_price')}
            error={errors.purchase_price}
          />
          <Input
            label="Frais Vinted (achat)"
            type="number"
            step="0.01"
            min="0"
            placeholder="1.50"
            suffix="€"
            hint="Protection acheteur"
            value={form.vinted_fees}
            onChange={set('vinted_fees')}
          />
        </div>

        {/* Prix visé */}
        <Input
          label="Prix de revente visé"
          type="number"
          step="0.01"
          min="0"
          placeholder="65.00"
          suffix="€"
          value={form.expected_sale_price}
          onChange={set('expected_sale_price')}
        />

        {/* Preview marge */}
        {margin !== null && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border text-sm ${
            (roi ?? 0) >= roiTarget
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
              : (roi ?? 0) >= 0
              ? 'bg-amber-500/5 border-amber-500/20 text-amber-400'
              : 'bg-red-500/5 border-red-500/20 text-red-400'
          }`}>
            <TrendingUp size={13} />
            <span>
              Marge estimée : <strong>{formatCurrency(margin, true)}</strong>
              {roi !== null && (
                <> · ROI : <strong>{roi.toFixed(1)}%</strong>
                  {(roi ?? 0) >= roiTarget ? ' — objectif atteint ✓' : ` — objectif : ${roiTarget}%`}
                </>
              )}
            </span>
          </div>
        )}

        {/* Localisation */}
        <Select
          label="Localisation"
          required
          options={LOCATION_OPTIONS}
          value={form.location}
          onChange={set('location')}
        />

        {/* Catégorie + Taille */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-zinc-400">Catégorie &amp; Taille</label>
          <div className="flex items-center gap-2">
            {(['Chaussure', 'Vêtement'] as Category[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm((p) => ({ ...p, category: p.category === cat ? null : cat }))}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  form.category === cat
                    ? cat === 'Chaussure'
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                      : 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {cat === 'Chaussure' ? '👟 Chaussure' : '👕 Vêtement'}
              </button>
            ))}
          </div>
          {form.category && (
            <Input
              label=""
              placeholder={form.category === 'Chaussure' ? 'ex: 42, 43, US10…' : 'ex: M, L, XL, 38…'}
              value={form.size}
              onChange={set('size')}
            />
          )}
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-400">Notes</label>
          <textarea
            placeholder="État, détails..."
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:border-zinc-600 focus:ring-zinc-600/20 transition-colors resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition-colors"
          >
            {isEdit ? 'Enregistrer' : 'Ajouter au stock'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
