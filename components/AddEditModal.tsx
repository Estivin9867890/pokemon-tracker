'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { InventoryItem, ItemFormData } from '@/types'
import PokemonForm from '@/components/forms/PokemonForm'

interface AddEditModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: ItemFormData, id?: string) => Promise<void>
  item?: InventoryItem | null
  existingHits?: InventoryItem[]
  roiTarget: number
  defaultVintedFees: number
}

function emptyForm(defaultVintedFees: number): ItemFormData {
  return {
    item_name: '',
    purchase_price: '',
    vinted_fees: defaultVintedFees > 0 ? String(defaultVintedFees) : '',
    expected_sale_price: '',
    location: 'Chez Célian',
    notes: '',
    pokemon_name: '',
    card_number: '',
    extension: '',
    rarity: '',
    pokemon_category: 'SINGLE',
    poke_location: 'CELIAN',
    is_graded: false,
    grading_company: '',
    grading_note: '',
    is_lot: false,
    lot_total_cost: '',
    nb_articles: '',
    funded_by: null,
    hits: [],
  }
}

export default function AddEditModal({ open, onClose, onSave, item, existingHits = [], roiTarget, defaultVintedFees }: AddEditModalProps) {
  const isEdit = !!item
  const [form, setForm]               = useState<ItemFormData>(() => emptyForm(defaultVintedFees))
  const [errors, setErrors]           = useState<Partial<Record<keyof ItemFormData, string>>>({})
  const [raritySearch, setRaritySearch] = useState('')
  const [deletedHitIds, setDeletedHitIds] = useState<string[]>([])

  useEffect(() => {
    setDeletedHitIds([])
    if (item) {
      const hits = item.is_lot
        ? existingHits.map((h) => ({
            id:              h.id,
            pokemon_name:    h.pokemon_name ?? h.item_name,
            card_number:     h.card_number ?? '',
            estimated_value: h.expected_sale_price != null ? String(h.expected_sale_price) : '',
          }))
        : []
      setForm({
        item_name: item.item_name,
        purchase_price: String(item.purchase_price),
        vinted_fees: String(item.vinted_fees),
        expected_sale_price: item.expected_sale_price != null ? String(item.expected_sale_price) : '',
        location: item.location,
        notes: item.notes ?? '',
        pokemon_name: item.pokemon_name ?? '',
        card_number: item.card_number ?? '',
        extension: item.extension ?? '',
        rarity: item.rarity ?? '',
        pokemon_category: item.pokemon_category ?? 'SINGLE',
        poke_location: item.poke_location ?? 'CELIAN',
        is_graded: item.is_graded ?? false,
        grading_company: item.grading_company ?? '',
        grading_note: String(item.grading_note ?? ''),
        is_lot: item.is_lot ?? false,
        lot_total_cost: item.lot_total_cost != null ? String(item.lot_total_cost) : '',
        nb_articles: item.item_count != null ? String(item.item_count) : '',
        funded_by: item.funded_by ?? null,
        lot_id: item.lot_id ?? undefined,
        hits,
      })
      setRaritySearch(item.rarity ?? '')
    } else {
      setForm(emptyForm(defaultVintedFees))
      setRaritySearch('')
    }
    setErrors({})
  }, [item, open, defaultVintedFees]) // existingHits intentionnellement omis — stable à l'ouverture

  const set = (k: keyof ItemFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((p) => ({ ...p, [k]: e.target.value }))

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.pokemon_name.trim()) e.item_name = 'Requis'
    if (form.is_lot) {
      if (!form.lot_total_cost || isNaN(parseFloat(form.lot_total_cost))) e.purchase_price = 'Coût total requis'
      if (!form.nb_articles || parseInt(form.nb_articles) < 1) e.purchase_price = 'Nb articles requis'
    } else {
      if (!form.purchase_price || isNaN(parseFloat(form.purchase_price))) e.purchase_price = 'Nombre valide requis'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleHitDeleted(hitId: string) {
    setDeletedHitIds((prev) => [...prev, hitId])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    await onSave({ ...form, deletedHitIds }, item?.id)
    onClose()
  }

  const isEditLot = isEdit && !!item?.is_lot
  const title = isEditLot ? 'Modifier le lot' : isEdit ? 'Modifier la carte' : 'Ajouter une carte'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth={isEditLot ? 'max-w-xl' : 'max-w-lg'}
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="px-6 py-5 space-y-4 flex-1 overflow-y-auto">
          <PokemonForm
            form={form}
            setForm={setForm}
            errors={errors}
            roiTarget={roiTarget}
            isEdit={isEdit}
            raritySearch={raritySearch}
            setRaritySearch={setRaritySearch}
            onHitDeleted={handleHitDeleted}
          />

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
        </div>

        {/* Actions sticky */}
        <div className="flex gap-3 px-6 py-4 border-t border-zinc-800/80 shrink-0 bg-[#111113]">
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
