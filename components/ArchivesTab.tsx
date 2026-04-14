'use client'

import { useState } from 'react'
import { InventoryItem } from '@/types'
import { calcItem, formatCurrency, formatROI, roiColor } from '@/lib/calculations'
import { Pencil, Trash2, Archive, StickyNote, TrendingUp, TrendingDown, AlertCircle, Check, Loader2, Sparkles } from 'lucide-react'

interface ArchivesTabProps {
  items: InventoryItem[]
  roiTarget: number
  onEdit: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
  onDetail: (item: InventoryItem) => void
  onPatchSalePrice?: (item: InventoryItem, price: number) => Promise<void>
}

function EmptyArchives() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <Archive size={24} className="text-zinc-600" />
      </div>
      <p className="text-sm font-medium text-zinc-400">Aucune vente enregistrée</p>
      <p className="text-xs text-zinc-600 mt-1">Les articles vendus apparaîtront ici.</p>
    </div>
  )
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ArchivesTab({ items, roiTarget, onEdit, onDelete, onDetail, onPatchSalePrice }: ArchivesTabProps) {
  const [patchPrices, setPatchPrices] = useState<Record<string, string>>({})
  const [patching, setPatching]       = useState<Record<string, boolean>>({})

  // Index parent lots by lot_id pour afficher le nom du lot sur les hits
  const lotByLotId = items.reduce<Record<string, InventoryItem>>((acc, i) => {
    if (i.is_lot && i.lot_id) acc[i.lot_id] = i
    return acc
  }, {})

  // Articles unité/lot vendus
  const soldItems = items
    .filter((i) => i.status === 'Vendu' && !i.is_hit)
    .sort((a, b) => new Date(b.sold_at ?? b.created_at).getTime() - new Date(a.sold_at ?? a.created_at).getTime())

  // Hits avec prix de vente → lignes de vente individuelles
  const soldHits = items
    .filter((i) => i.is_hit && i.actual_sale_price != null)
    .sort((a, b) => new Date(b.sold_at ?? b.created_at).getTime() - new Date(a.sold_at ?? a.created_at).getTime())

  // Hits marqués vendus SANS prix → alerte récupération
  const orphanHits = items
    .filter((i) => i.is_hit && i.status === 'Vendu' && i.actual_sale_price == null)
    .sort((a, b) => new Date(b.sold_at ?? b.created_at).getTime() - new Date(a.sold_at ?? a.created_at).getTime())

  // ── Totaux : même logique que calcStats (pas de double comptage) ──
  // Source unique : revenue_generated pour les lots (= Σ actual_sale_price des hits)
  // → ne jamais additionner les prix des hits séparément
  const soldSingles  = items.filter(i => i.status === 'Vendu' && !i.is_hit && !i.is_lot)
  const soldLots     = items.filter(i => i.status === 'Vendu' && i.is_lot)
  const partialLots  = items.filter(i => i.is_lot && i.status !== 'Vendu' && (i.revenue_generated ?? 0) > 0)

  // Liste unifiée triée par date (inclut les lots partiellement vendus avec revenue)
  const allEntries = [...soldItems, ...soldHits, ...partialLots]
    .sort((a, b) => new Date(b.sold_at ?? b.created_at).getTime() - new Date(a.sold_at ?? a.created_at).getTime())

  async function handlePatch(item: InventoryItem) {
    const price = parseFloat(patchPrices[item.id] ?? '')
    if (!price || price <= 0 || !onPatchSalePrice) return
    setPatching((p) => ({ ...p, [item.id]: true }))
    await onPatchSalePrice(item, price)
    setPatching((p) => ({ ...p, [item.id]: false }))
  }

  if (allEntries.length === 0 && orphanHits.length === 0) return <EmptyArchives />

  const totalRevenue =
    soldSingles.reduce((s, i) => s + (i.actual_sale_price ?? 0), 0) +
    soldLots.reduce((s, i) => s + (i.revenue_generated ?? 0), 0) +
    partialLots.reduce((s, i) => s + (i.revenue_generated ?? 0), 0)

  const totalCost =
    soldSingles.reduce((s, i) => s + i.purchase_price + i.vinted_fees + i.boost_cost, 0) +
    soldLots.reduce((s, i) => s + i.purchase_price + i.vinted_fees + i.boost_cost, 0) +
    partialLots.reduce((s, i) => s + i.purchase_price + i.vinted_fees + i.boost_cost, 0)

  const totalFees =
    soldSingles.reduce((s, i) => s + i.sale_fees, 0) +
    soldLots.reduce((s, i) => s + i.sale_fees, 0) +
    partialLots.reduce((s, i) => s + i.sale_fees, 0)

  const totalProfit  = totalRevenue - totalFees - totalCost
  const totalPurchase =
    soldSingles.reduce((s, i) => s + i.purchase_price, 0) +
    soldLots.reduce((s, i) => s + i.purchase_price, 0)
  const overallROI   = totalPurchase > 0 ? (totalProfit / totalPurchase) * 100 : 0

  const delays = soldItems
    .filter((i) => i.sold_at)
    .map((i) => (new Date(i.sold_at!).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24))
  const avgDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null

  return (
    <div className="space-y-4">

      {/* ── Orphelins : hits Vendu sans prix ── */}
      {orphanHits.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/25 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={13} className="text-amber-400" />
            <p className="text-xs font-semibold text-amber-400">
              {orphanHits.length} hit{orphanHits.length > 1 ? 's' : ''} — prix de vente manquant
            </p>
          </div>
          <div className="space-y-2">
            {orphanHits.map((hit) => (
              <div key={hit.id} className="flex items-center gap-3 bg-zinc-900/60 rounded-xl px-3 py-2.5 border border-zinc-800">
                <Sparkles size={10} className="text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{hit.pokemon_name ?? hit.item_name}</p>
                  {hit.parent_lot_id && lotByLotId[hit.parent_lot_id] && (
                    <p className="text-[10px] text-zinc-600">{lotByLotId[hit.parent_lot_id].item_name}</p>
                  )}
                </div>
                {hit.card_number && <span className="text-[10px] text-zinc-600 shrink-0">#{hit.card_number}</span>}
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number" step="0.01" min="0" placeholder="Prix €"
                    value={patchPrices[hit.id] ?? ''}
                    onChange={(e) => setPatchPrices((p) => ({ ...p, [hit.id]: e.target.value }))}
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400/50 transition-colors"
                  />
                  <button
                    onClick={() => handlePatch(hit)}
                    disabled={patching[hit.id] || !patchPrices[hit.id]}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 disabled:opacity-40 transition-colors"
                  >
                    {patching[hit.id] ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allEntries.length === 0 ? <EmptyArchives /> : (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Bénéfice net</p>
              <p className={`text-2xl font-bold mt-2 ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(totalProfit, true)}
              </p>
              <p className="text-[11px] text-zinc-600 mt-1">
                {soldItems.length} article{soldItems.length > 1 ? 's' : ''} · {soldHits.length} hit{soldHits.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">ROI Global</p>
              <p className={`text-2xl font-bold mt-2 ${roiColor(overallROI, roiTarget)}`}>{overallROI.toFixed(1)}%</p>
              <p className="text-[11px] text-zinc-600 mt-1">Objectif : {roiTarget}% min</p>
            </div>
            <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Chiffre d&apos;affaires</p>
              <p className="text-2xl font-bold text-white mt-2">{formatCurrency(totalRevenue)}</p>
              <p className="text-[11px] text-zinc-600 mt-1">Investi : {formatCurrency(totalCost)}</p>
            </div>
            <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Délai moyen</p>
              <p className="text-2xl font-bold text-amber-400 mt-2">
                {avgDelay !== null ? `${avgDelay.toFixed(0)}j` : '—'}
              </p>
              <p className="text-[11px] text-zinc-600 mt-1">Entre achat et vente</p>
            </div>
          </div>

          {/* ── Table unifiée ── */}
          <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Article</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Rareté</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Coût</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Vendu</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Frais</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Marge</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">ROI</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {allEntries.map((item) => {
                    const isHit       = item.is_hit
                    const parentLot   = isHit && item.parent_lot_id ? lotByLotId[item.parent_lot_id] : null
                    const salePrice   = item.is_lot ? (item.revenue_generated ?? null) : item.actual_sale_price
                    const costBasis   = isHit ? 0 : item.purchase_price + item.vinted_fees + item.boost_cost
                    const marginNet   = salePrice != null ? salePrice - item.sale_fees - costBasis : null
                    const roiVal      = !isHit && item.purchase_price > 0 && marginNet != null
                      ? parseFloat(((marginNet / item.purchase_price) * 100).toFixed(1))
                      : null
                    const meetsTarget = (roiVal ?? 0) >= roiTarget
                    const isProfit    = (marginNet ?? 0) >= 0

                    return (
                      <tr
                        key={item.id}
                        onClick={() => !isHit && onDetail(item)}
                        className={`hover:bg-zinc-800/30 transition-colors group ${!isHit ? 'cursor-pointer' : ''} ${isHit ? 'bg-amber-500/[0.02]' : ''}`}
                      >
                        {/* Article */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {isHit ? (
                              <Sparkles size={10} className="text-amber-400 shrink-0" />
                            ) : (
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meetsTarget ? 'bg-emerald-400' : isProfit ? 'bg-amber-400' : 'bg-red-400'}`} />
                            )}
                            <div>
                              <p className="font-medium text-white text-sm">{item.item_name}</p>
                              {isHit && parentLot && (
                                <p className="text-[10px] text-zinc-600 mt-0.5">Lot : {parentLot.item_name}</p>
                              )}
                              {!isHit && item.extension && (
                                <p className="text-[10px] text-zinc-600 mt-0.5">{item.extension}</p>
                              )}
                              {!isHit && item.is_lot && item.items_sold != null && (
                                <p className="text-[10px] text-zinc-600 mt-0.5">{item.items_sold}/{item.item_count} cartes</p>
                              )}
                              {item.notes && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <StickyNote size={9} className="text-zinc-700" />
                                  <span className="text-[10px] text-zinc-600 truncate max-w-[160px]">{item.notes}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Rareté */}
                        <td className="px-4 py-3.5">
                          {item.rarity ? (
                            <span className="text-[10px] text-zinc-400 font-medium">{item.rarity}</span>
                          ) : item.extension ? (
                            <span className="text-[10px] text-zinc-600">{item.extension}</span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>

                        {/* Coût */}
                        <td className="px-4 py-3.5 text-right">
                          {isHit ? (
                            <span className="text-[10px] text-zinc-600">—</span>
                          ) : (
                            <p className="text-zinc-300 font-medium">{formatCurrency(costBasis)}</p>
                          )}
                        </td>

                        {/* Vendu */}
                        <td className="px-4 py-3.5 text-right">
                          <p className="text-white font-semibold">
                            {salePrice != null ? formatCurrency(salePrice) : '—'}
                          </p>
                        </td>

                        {/* Frais */}
                        <td className="px-4 py-3.5 text-right">
                          <p className="text-zinc-500">{item.sale_fees > 0 ? formatCurrency(item.sale_fees) : '—'}</p>
                        </td>

                        {/* Marge */}
                        <td className="px-4 py-3.5 text-right">
                          {marginNet != null ? (
                            <div className="flex items-center justify-end gap-1">
                              {isProfit ? <TrendingUp size={11} className="text-emerald-400" /> : <TrendingDown size={11} className="text-red-400" />}
                              <p className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatCurrency(marginNet, true)}
                              </p>
                            </div>
                          ) : <span className="text-zinc-700">—</span>}
                        </td>

                        {/* ROI */}
                        <td className="px-4 py-3.5 text-right">
                          {roiVal != null ? (
                            <span className={`font-bold text-sm ${roiColor(roiVal, roiTarget)}`}>{formatROI(roiVal)}</span>
                          ) : isHit ? (
                            <span className="text-[10px] text-amber-400/60">hit</span>
                          ) : <span className="text-zinc-700">—</span>}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 text-left">
                          <p className="text-xs text-zinc-500 whitespace-nowrap">
                            {item.sold_at ? formatDate(item.sold_at) : '—'}
                          </p>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {!isHit && (
                              <button
                                onClick={() => onEdit(item)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            <button
                              onClick={() => onDelete(item)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              title={isHit ? 'Supprimer ce hit' : 'Supprimer'}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
