'use client'

import { useState, Fragment } from 'react'
import { InventoryItem } from '@/types'
import { calcItem, formatCurrency, formatROI, roiColor } from '@/lib/calculations'
import { Pencil, Trash2, ShoppingCart, MapPin, StickyNote, Package, Tag, X, PackageCheck, Clock, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'

interface StockTabProps {
  items: InventoryItem[]
  roiTarget: number
  onSell: (item: InventoryItem) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
  onToggleVinted: (item: InventoryItem) => void
  onMarkReceived: (item: InventoryItem) => void
  onDetail: (item: InventoryItem) => void
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <Package size={24} className="text-zinc-600" />
      </div>
      <p className="text-sm font-medium text-zinc-400">Stock vide</p>
      <p className="text-xs text-zinc-600 mt-1">Ajoutez votre première carte avec le bouton ci-dessus.</p>
    </div>
  )
}

export default function StockTab({ items, roiTarget, onSell, onEdit, onDelete, onToggleVinted, onMarkReceived, onDetail }: StockTabProps) {
  const [expandedLotId, setExpandedLotId] = useState<string | null>(null)

  // Hits indexés par parent_lot_id
  const hitsByLotId = items.reduce<Record<string, InventoryItem[]>>((acc, i) => {
    if (i.is_hit && i.parent_lot_id) {
      if (!acc[i.parent_lot_id]) acc[i.parent_lot_id] = []
      acc[i.parent_lot_id].push(i)
    }
    return acc
  }, {})

  const stockItems = items.filter((i) =>
    (i.status === 'En Attente' || i.status === 'En Stock' || i.status === 'Sur Vinted' || i.status === 'Partiellement vendu') &&
    !(i.lot_id !== null && !i.is_lot) &&
    !i.is_hit
  )

  if (stockItems.length === 0) return <EmptyState />

  const byLocation: Record<string, InventoryItem[]> = {}
  for (const item of stockItems) {
    if (!byLocation[item.location]) byLocation[item.location] = []
    byLocation[item.location].push(item)
  }

  return (
    <div className="space-y-6">
      {Object.entries(byLocation).map(([location, locationItems]) => (
        <div key={location}>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={12} className={location === 'Chez Romain' ? 'text-blue-400' : 'text-violet-400'} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${location === 'Chez Romain' ? 'text-blue-400' : 'text-violet-400'}`}>
              {location}
            </span>
            <span className="text-xs text-zinc-700 ml-1">{locationItems.length} article{locationItems.length > 1 ? 's' : ''}</span>
          </div>

          <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Article</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Coût</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Prix visé</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Marge est.</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">ROI est.</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {locationItems.map((item) => {
                    const calc        = calcItem(item)
                    const onVinted    = item.status === 'Sur Vinted'
                    const waiting     = item.status === 'En Attente'
                    const partialSold = item.status === 'Partiellement vendu'
                    const itemHits    = item.is_lot ? (hitsByLotId[item.lot_id ?? ''] ?? []) : []
                    const lotSold    = item.items_sold ?? 0
                    const lotTotal   = item.item_count ?? 0
                    const lotRevenue = item.revenue_generated ?? 0
                    const lotCost    = item.lot_total_cost ?? item.purchase_price
                    const lotProgress = lotTotal > 0 ? lotSold / lotTotal : 0
                    const lotProfit  = lotRevenue - lotCost

                    return (
                      <Fragment key={item.id}>
                      <tr
                        onClick={() => onDetail(item)}
                        className={`cursor-pointer hover:bg-zinc-800/30 transition-colors group ${onVinted ? 'bg-teal-500/[0.03]' : waiting ? 'bg-amber-500/[0.03]' : partialSold ? 'bg-violet-500/[0.03]' : ''}`}
                      >
                        {/* Nom */}
                        <td className="px-5 py-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`font-medium text-sm ${waiting ? 'text-zinc-400' : 'text-white'}`}>
                                {item.item_name}
                              </p>
                              {item.is_lot && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25 tracking-wider">
                                  LOT
                                </span>
                              )}
                              {item.is_lot && itemHits.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 tracking-wider">
                                  <Sparkles size={8} />
                                  {itemHits.length} HIT{itemHits.length > 1 ? 'S' : ''}
                                </span>
                              )}
                              {waiting && !item.is_lot && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/10 text-amber-400 border border-amber-400/20">
                                  <Clock size={8} />
                                  En attente
                                </span>
                              )}
                              {onVinted && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-400/10 text-teal-400 border border-teal-400/20">
                                  <Tag size={8} />
                                  Sur Vinted
                                </span>
                              )}
                              {partialSold && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-400/10 text-violet-400 border border-violet-400/20">
                                  <ShoppingCart size={8} />
                                  En cours
                                </span>
                              )}
                            </div>
                            {item.extension && (
                              <p className="text-[11px] text-zinc-600 mt-0.5">{item.extension}</p>
                            )}
                            {item.is_lot && item.item_count && (
                              <div className="mt-1 space-y-1">
                                <p className="text-[11px] text-zinc-500">
                                  Lot de {item.item_count} cartes
                                  {item.lot_total_cost && item.item_count > 0 && (
                                    <> · {formatCurrency(item.lot_total_cost / item.item_count)} / carte</>
                                  )}
                                </p>
                                <div className="flex items-center gap-2 max-w-[180px]">
                                  <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${lotProfit >= 0 && lotSold > 0 ? 'bg-emerald-500' : 'bg-violet-500'}`}
                                      style={{ width: `${Math.min(100, lotProgress * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-zinc-600 shrink-0">{lotSold}/{lotTotal}</span>
                                </div>
                                {lotSold > 0 && (
                                  <p className={`text-[10px] font-medium ${lotProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {lotProfit >= 0
                                      ? `Rentabilisé ✓ (+${formatCurrency(lotProfit)})`
                                      : `Manque ${formatCurrency(Math.abs(lotProfit))}`
                                    }
                                  </p>
                                )}
                              </div>
                            )}
                            {item.notes && (
                              <div className="flex items-center gap-1 mt-1">
                                <StickyNote size={10} className="text-zinc-600" />
                                <span className="text-[11px] text-zinc-600 truncate max-w-[200px]">{item.notes}</span>
                              </div>
                            )}
                            {item.is_lot && itemHits.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setExpandedLotId(expandedLotId === item.lot_id ? null : (item.lot_id ?? null)) }}
                                className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                              >
                                {expandedLotId === item.lot_id ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                {expandedLotId === item.lot_id ? 'Masquer les hits' : `Voir ${itemHits.length} hit${itemHits.length > 1 ? 's' : ''}`}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Coût */}
                        <td className="px-4 py-4 text-right">
                          <p className="text-white font-medium">{formatCurrency(calc.cost_basis)}</p>
                          {item.is_lot && item.item_count && (
                            <p className="text-[10px] text-zinc-600 mt-0.5">{item.item_count} × {formatCurrency((item.lot_total_cost ?? calc.cost_basis) / item.item_count)}</p>
                          )}
                        </td>

                        {/* Prix visé */}
                        <td className="px-4 py-4 text-right">
                          {item.expected_sale_price != null ? (
                            <p className="text-amber-400 font-medium">{formatCurrency(item.expected_sale_price)}</p>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>

                        {/* Marge estimée */}
                        <td className="px-4 py-4 text-right">
                          {calc.margin_net !== null ? (
                            <p className={`font-semibold ${calc.margin_net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatCurrency(calc.margin_net, true)}
                            </p>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>

                        {/* ROI */}
                        <td className="px-4 py-4 text-right">
                          <span className={`font-semibold text-xs ${roiColor(calc.roi_percent, roiTarget)}`}>
                            {formatROI(calc.roi_percent)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {waiting && (
                              <button
                                onClick={() => onMarkReceived(item)}
                                title="Marquer comme reçu"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-medium transition-colors border border-amber-500/20"
                              >
                                <PackageCheck size={11} />
                                Reçu
                              </button>
                            )}
                            {!waiting && (
                              <button
                                onClick={() => onToggleVinted(item)}
                                title={onVinted ? 'Retirer de Vinted' : 'Mettre sur Vinted'}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                                  onVinted
                                    ? 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700'
                                    : 'bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border-teal-500/20'
                                }`}
                              >
                                {onVinted ? <X size={10} /> : <Tag size={10} />}
                                {onVinted ? 'Retirer' : 'Vinted'}
                              </button>
                            )}
                            {!waiting && (
                              <button
                                onClick={() => onSell(item)}
                                title={item.is_lot ? 'Vente partielle du lot' : 'Marquer vendu'}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${item.is_lot ? 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border-violet-500/20' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'}`}
                              >
                                <ShoppingCart size={11} />
                                {item.is_lot ? 'Vendre +' : 'Vendre'}
                              </button>
                            )}
                            <button
                              onClick={() => onEdit(item)}
                              title="Modifier"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => onDelete(item)}
                              title="Supprimer"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Accordéon hits */}
                      {item.is_lot && expandedLotId === item.lot_id && itemHits.map((hit) => {
                        const hitsTotal = itemHits.reduce((s, h) => s + (h.expected_sale_price ?? 0), 0)
                        return (
                          <tr key={hit.id} className="bg-amber-500/[0.03] border-t border-amber-500/10">
                            <td className="pl-10 pr-4 py-2.5" colSpan={6}>
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider shrink-0">
                                    <Sparkles size={7} />
                                    HIT
                                  </span>
                                  <p className="text-xs font-medium text-white">{hit.pokemon_name ?? hit.item_name}</p>
                                  {hit.card_number && <span className="text-[10px] text-zinc-600">#{hit.card_number}</span>}
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                  {hit.expected_sale_price != null && (
                                    <p className="text-xs font-semibold text-amber-400">{formatCurrency(hit.expected_sale_price)}</p>
                                  )}
                                  {hitsTotal > 0 && hit === itemHits[itemHits.length - 1] && (
                                    <p className={`text-[10px] font-medium ${hitsTotal >= (item.lot_total_cost ?? 0) ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                      Total hits : {formatCurrency(hitsTotal)} / {formatCurrency(item.lot_total_cost ?? 0)}
                                      {hitsTotal >= (item.lot_total_cost ?? 0) ? ' ✓' : ''}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
