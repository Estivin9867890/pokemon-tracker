'use client'

import { useState, Dispatch, SetStateAction } from 'react'
import Input from '@/components/ui/Input'
import ProfitCalculator from '@/components/ProfitCalculator'
import { GRADING_COMPANIES, ItemFormData, POKEMON_RARITIES } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { TrendingUp, Calculator, Sparkles, Plus, Trash2 } from 'lucide-react'

interface PokemonFormProps {
  form: ItemFormData
  setForm: Dispatch<SetStateAction<ItemFormData>>
  errors: Partial<Record<keyof ItemFormData, string>>
  roiTarget: number
  isEdit: boolean
  raritySearch: string
  setRaritySearch: Dispatch<SetStateAction<string>>
  onHitDeleted?: (hitId: string) => void
  itemStatus?: string
  cashInHand?: number
}

export default function PokemonForm({
  form, setForm, errors, roiTarget, isEdit,
  raritySearch, setRaritySearch, onHitDeleted,
  itemStatus, cashInHand,
}: PokemonFormProps) {
  // Verrouillage comptabilité : lot validé (en stock) → prix figés
  const lotLocked = isEdit && form.is_lot && itemStatus !== 'En Attente'
  const [calcOpen, setCalcOpen]       = useState(false)
  const [hitsEnabled, setHitsEnabled] = useState(false)

  function setNbHits(n: number) {
    const clamped = Math.max(0, n)
    setForm((p) => {
      const hits = [...(p.hits ?? [])]
      while (hits.length < clamped) hits.push({ pokemon_name: '', card_number: '', estimated_value: '' })
      return { ...p, hits: hits.slice(0, clamped) }
    })
  }

  function updateHit(i: number, field: 'pokemon_name' | 'card_number' | 'estimated_value', val: string) {
    setForm((p) => {
      const hits = [...(p.hits ?? [])]
      hits[i] = { ...hits[i], [field]: val }
      return { ...p, hits }
    })
  }

  function removeHit(i: number) {
    setForm((p) => {
      const hit = (p.hits ?? [])[i]
      if (hit?.id) onHitDeleted?.(hit.id)
      const hits = (p.hits ?? []).filter((_, idx) => idx !== i)
      return { ...p, hits }
    })
  }

  const set = (k: keyof ItemFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const buyPrice = parseFloat(form.purchase_price)      || 0
  const sellEst  = parseFloat(form.expected_sale_price) || 0
  const margin   = sellEst > 0 ? sellEst - buyPrice : null
  const roi      = margin !== null && buyPrice > 0 ? (margin / buyPrice) * 100 : null

  return (
    <>
      <ProfitCalculator
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        initialBuyPrice={buyPrice}
        initialSellPrice={sellEst}
        initialFees={0}
        roiTarget={roiTarget}
      />

      {/* Prix d'achat + Simuler (masqué en mode lot) */}
      {!form.is_lot && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">
                Prix d&apos;achat <span className="text-zinc-600">*</span>
              </label>
              <button
                type="button"
                onClick={() => setCalcOpen(true)}
                className="flex items-center gap-1 text-[10px] font-semibold text-violet-400 hover:text-violet-300 transition-colors"
              >
                <Calculator size={10} />
                Simuler
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="35.00"
                value={form.purchase_price}
                onChange={set('purchase_price')}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 pr-9 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:border-zinc-600 focus:ring-zinc-600/20 transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none">€</span>
            </div>
            {errors.purchase_price && (
              <p className="text-[11px] text-red-400">{errors.purchase_price}</p>
            )}
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

          {/* Preview marge temps réel */}
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
                    {(roi ?? 0) >= roiTarget
                      ? ' — objectif atteint ✓'
                      : ` — objectif : ${roiTarget}%`}
                  </>
                )}
              </span>
            </div>
          )}
        </>
      )}

      {/* Ajout en Lot (hors édition) */}
      {!isEdit && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, is_lot: !p.is_lot }))}
            className={`w-full rounded-xl py-2 text-xs font-semibold border transition-all ${
              form.is_lot
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            📦 Ajout en Lot ? {form.is_lot ? '✓ Activé' : 'Non'}
          </button>
          {form.is_lot && (
            <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Coût total du lot"
                type="number" step="0.01" min="0" placeholder="120.00" suffix="€"
                value={form.lot_total_cost}
                onChange={(e) => setForm((p) => ({ ...p, lot_total_cost: e.target.value }))}
              />
              <Input
                label="Nombre d'articles"
                type="number" min="1" placeholder="10"
                value={form.nb_articles}
                onChange={(e) => setForm((p) => ({ ...p, nb_articles: e.target.value }))}
              />
              <Input
                label="Estimation revente (lot)"
                type="number" step="0.01" min="0" placeholder="200.00" suffix="€"
                value={form.expected_sale_price}
                onChange={(e) => setForm((p) => ({ ...p, expected_sale_price: e.target.value }))}
              />
              {form.lot_total_cost && form.nb_articles && (
                <p className="text-[11px] text-zinc-500 flex items-end pb-2">
                  {(parseFloat(form.lot_total_cost) / (parseInt(form.nb_articles) || 1)).toFixed(2)}€
                  <span className="text-zinc-700 ml-1">/ carte</span>
                </p>
              )}
              {form.lot_total_cost && form.expected_sale_price && (
                <p className={`col-span-2 text-[11px] text-center font-medium ${
                  parseFloat(form.expected_sale_price) >= parseFloat(form.lot_total_cost)
                    ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  Marge estimée :{' '}
                  {(parseFloat(form.expected_sale_price) - parseFloat(form.lot_total_cost)).toFixed(2)}€
                </p>
              )}
            </div>

            {/* Hits */}
            <div className="border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setHitsEnabled(!hitsEnabled); if (hitsEnabled) setForm((p) => ({ ...p, hits: [] })) }}
                className={`w-full rounded-xl py-2 text-xs font-semibold border transition-all ${
                  hitsEnabled
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Sparkles size={11} className="inline mr-1.5" />
                Identifier des Hits ? {hitsEnabled ? '✓ Activé' : 'Non'}
              </button>

              {hitsEnabled && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-zinc-500 shrink-0">Nombre de hits :</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={form.hits?.length || ''}
                      onChange={(e) => setNbHits(parseInt(e.target.value) || 0)}
                      className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400/50 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setNbHits((form.hits?.length ?? 0) + 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                    >
                      <Plus size={10} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-0.5">
                  {(form.hits ?? []).map((hit, i) => (
                    <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider">
                          <Sparkles size={7} />
                          HIT #{i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeHit(i)}
                          className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          placeholder="Nom du Pokémon"
                          value={hit.pokemon_name}
                          onChange={(e) => updateHit(i, 'pokemon_name', e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                        />
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Prix estimé"
                            value={hit.estimated_value}
                            onChange={(e) => updateHit(i, 'estimated_value', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 pr-5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">€</span>
                        </div>
                        <input
                          placeholder="N° carte (optionnel)"
                          value={hit.card_number}
                          onChange={(e) => updateHit(i, 'card_number', e.target.value)}
                          className="col-span-2 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                        />
                      </div>
                    </div>
                  ))}
                  </div>

                  {(form.hits ?? []).length > 0 && form.lot_total_cost && (
                    <p className="text-[10px] text-zinc-500 text-center mt-1">
                      Valeur estimée hits :{' '}
                      <span className="text-amber-400 font-semibold">
                        {formatCurrency((form.hits ?? []).reduce((s, h) => s + (parseFloat(h.estimated_value) || 0), 0))}
                      </span>
                      {' '}/ coût lot {formatCurrency(parseFloat(form.lot_total_cost) || 0)}
                    </p>
                  )}
                </>
              )}
            </div>
            </div>
          )}
        </div>
      )}

      {/* ── ÉDITION LOT ─────────────────────────────────── */}
      {isEdit && form.is_lot && (
        <div className="space-y-3 border border-violet-500/20 rounded-2xl p-4 bg-violet-500/[0.03]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest">Paramètres du lot</p>
            {lotLocked && (
              <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                🔒 Comptabilité figée
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-400">Coût total</label>
              <div className="relative">
                <input
                  type="number" step="0.01" min="0" placeholder="120.00"
                  value={form.lot_total_cost}
                  onChange={(e) => setForm((p) => ({ ...p, lot_total_cost: e.target.value }))}
                  disabled={lotLocked}
                  className={`w-full border rounded-xl px-3 py-2.5 pr-9 text-sm placeholder-zinc-600 focus:outline-none focus:ring-1 focus:border-violet-500/50 focus:ring-violet-500/10 transition-colors ${lotLocked ? 'bg-zinc-950 border-zinc-800/50 text-zinc-500 cursor-not-allowed' : 'bg-zinc-900 border-zinc-800 text-white'}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">€</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-400">Nb d&apos;articles</label>
              <input
                type="number" min="1" placeholder="10"
                value={form.nb_articles}
                onChange={(e) => setForm((p) => ({ ...p, nb_articles: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:border-violet-500/50 focus:ring-violet-500/10 transition-colors"
              />
            </div>
          </div>

          {form.lot_total_cost && form.nb_articles && (
            <p className="text-[11px] text-zinc-500">
              {(parseFloat(form.lot_total_cost) / (parseInt(form.nb_articles) || 1)).toFixed(2)}€ / carte
            </p>
          )}

          {/* Hits du lot */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-widest flex items-center gap-1">
                <Sparkles size={10} />
                Hits ({(form.hits ?? []).length})
              </p>
              <button
                type="button"
                onClick={() => setForm((p) => ({
                  ...p,
                  hits: [...(p.hits ?? []), { pokemon_name: '', card_number: '', estimated_value: '' }]
                }))}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold hover:bg-amber-500/20 transition-colors"
              >
                <Plus size={10} />
                Ajouter un hit
              </button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-0.5">
              {(form.hits ?? []).length === 0 && (
                <p className="text-[11px] text-zinc-600 text-center py-3">Aucun hit enregistré</p>
              )}
              {(form.hits ?? []).map((hit, i) => (
                <div key={hit.id ?? i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider">
                      <Sparkles size={7} />
                      {hit.id ? 'HIT existant' : 'NOUVEAU HIT'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeHit(i)}
                      className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      placeholder="Nom du Pokémon"
                      value={hit.pokemon_name}
                      onChange={(e) => updateHit(i, 'pokemon_name', e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                    />
                    <div className="relative">
                      <input
                        type="number" step="0.01" min="0" placeholder="Prix estimé"
                        value={hit.estimated_value}
                        onChange={(e) => updateHit(i, 'estimated_value', e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 pr-5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">€</span>
                    </div>
                    <input
                      placeholder="N° carte (optionnel)"
                      value={hit.card_number}
                      onChange={(e) => updateHit(i, 'card_number', e.target.value)}
                      className="col-span-2 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400/40 transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>

            {(form.hits ?? []).length > 0 && form.lot_total_cost && (
              <p className="text-[10px] text-zinc-500 text-center">
                Valeur estimée hits :{' '}
                <span className="text-amber-400 font-semibold">
                  {formatCurrency((form.hits ?? []).reduce((s, h) => s + (parseFloat(h.estimated_value) || 0), 0))}
                </span>
                {' '}/ coût lot {formatCurrency(parseFloat(form.lot_total_cost) || 0)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Nom carte + Numéro */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Nom du Pokémon"
          required
          placeholder="Mewtwo"
          value={form.pokemon_name}
          onChange={(e) => setForm((p) => ({ ...p, pokemon_name: e.target.value, item_name: e.target.value }))}
        />
        <Input
          label="N° de carte"
          placeholder="052/078"
          value={form.card_number}
          onChange={set('card_number')}
        />
      </div>

      <Input
        label="Extension"
        placeholder="Évolution Céleste"
        value={form.extension}
        onChange={set('extension')}
      />

      {/* Type SINGLE / SEALED */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400">Type</label>
        <div className="flex gap-2">
          {(['SINGLE', 'SEALED'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm((p) => ({ ...p, pokemon_category: c }))}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold border transition-all ${
                form.pokemon_category === c
                  ? 'bg-white text-black border-white'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {c === 'SINGLE' ? '🃏 Carte unité' : '📦 Scellé / Booster'}
            </button>
          ))}
        </div>
      </div>

      {/* Rareté avec recherche */}
      <div className="flex flex-col gap-1.5 relative">
        <label className="text-xs font-medium text-zinc-400">Rareté</label>
        <input
          placeholder="🔍 Rechercher une rareté…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:border-zinc-600 focus:ring-zinc-600/20 transition-colors"
          value={raritySearch}
          onChange={(e) => {
            setRaritySearch(e.target.value)
            setForm((p) => ({ ...p, rarity: '' }))
          }}
        />
        {raritySearch && !form.rarity && (
          <ul className="absolute z-50 top-full mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl max-h-48 overflow-y-auto">
            {POKEMON_RARITIES.filter((r) =>
              r.label.toLowerCase().includes(raritySearch.toLowerCase())
            ).map((r) => (
              <li
                key={r.label}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-800/60 text-xs"
                onClick={() => {
                  setForm((p) => ({ ...p, rarity: r.label }))
                  setRaritySearch(r.label)
                }}
              >
                <span className="w-8 text-center font-mono text-zinc-500">{r.symbol}</span>
                <span className="text-zinc-200">{r.label}</span>
              </li>
            ))}
          </ul>
        )}
        {form.rarity && (
          <p className="text-xs text-emerald-400 mt-0.5">✓ {form.rarity}</p>
        )}
      </div>

      {/* Localisation Pokémon */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400">Stockée chez</label>
        <div className="flex gap-2">
          {(['ROMAIN', 'CELIAN'] as const).map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => setForm((p) => ({ ...p, poke_location: loc, location: loc === 'ROMAIN' ? 'Chez Romain' : 'Chez Célian' }))}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold border transition-all ${
                form.poke_location === loc
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              📍 Chez {loc === 'ROMAIN' ? 'Romain' : 'Célian'}
            </button>
          ))}
        </div>
      </div>

      {/* Qui a acheté + avertissement trésorerie */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-400">Qui a acheté ? <span className="text-zinc-600">(depuis la cagnotte)</span></label>
        <div className="flex gap-2">
          {([
            { value: 'ROMAIN_PERSO', label: '🛒 Romain' },
            { value: 'CELIAN_PERSO', label: '🛒 Célian' },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm((p) => ({ ...p, funded_by: p.funded_by === value ? null : value }))}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold border transition-all ${
                form.funded_by === value
                  ? 'bg-zinc-700/50 border-zinc-600 text-white'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {cashInHand !== undefined && (() => {
          const cost = form.is_lot
            ? (parseFloat(form.lot_total_cost) || 0)
            : (parseFloat(form.purchase_price) || 0)
          if (cost > 0 && cost > cashInHand) {
            return (
              <p className="text-[11px] text-amber-400 bg-amber-400/8 border border-amber-400/20 rounded-xl px-3 py-2 mt-0.5">
                ⚠️ Trésorerie insuffisante — Cagnotte : {cashInHand.toFixed(2)}€ · Achat : {cost.toFixed(2)}€ (manque {(cost - cashInHand).toFixed(2)}€)
              </p>
            )
          }
          return null
        })()}
      </div>

      {/* Grading */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, is_graded: !p.is_graded }))}
          className={`w-full rounded-xl py-2 text-xs font-semibold border transition-all ${
            form.is_graded
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
              : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
          }`}
        >
          🏅 Gradée ? {form.is_graded ? '✓ Oui' : 'Non'}
        </button>
        {form.is_graded && (
          <div className="grid grid-cols-2 gap-2">
            <select
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:border-zinc-600"
              value={form.grading_company}
              onChange={(e) => setForm((p) => ({ ...p, grading_company: e.target.value }))}
            >
              <option value="">Entreprise…</option>
              {GRADING_COMPANIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Input
              label=""
              type="number"
              min="1"
              max="10"
              placeholder="Note (1-10)"
              value={form.grading_note}
              onChange={(e) => setForm((p) => ({ ...p, grading_note: e.target.value }))}
            />
          </div>
        )}
      </div>
    </>
  )
}
