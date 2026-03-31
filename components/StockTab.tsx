'use client'

import { InventoryItem } from '@/types'
import { calcItem, formatCurrency, formatROI, roiColor } from '@/lib/calculations'
import { Pencil, Trash2, ShoppingCart, MapPin, StickyNote, Package, Tag, X, PackageCheck, Clock } from 'lucide-react'

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
      <p className="text-xs text-zinc-600 mt-1">Ajoutez votre premier article avec le bouton ci-dessus.</p>
    </div>
  )
}

export default function StockTab({ items, roiTarget, onSell, onEdit, onDelete, onToggleVinted, onMarkReceived, onDetail }: StockTabProps) {
  const stockItems = items.filter((i) => i.status === 'En Attente' || i.status === 'En Stock' || i.status === 'Sur Vinted')

  if (stockItems.length === 0) return <EmptyState />

  // Grouper par localisation
  const byLocation: Record<string, InventoryItem[]> = {}
  for (const item of stockItems) {
    if (!byLocation[item.location]) byLocation[item.location] = []
    byLocation[item.location].push(item)
  }

  return (
    <div className="space-y-6">
      {Object.entries(byLocation).map(([location, locationItems]) => (
        <div key={location}>
          {/* Section header */}
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={12} className={location === 'Chez Louis' ? 'text-blue-400' : 'text-violet-400'} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${location === 'Chez Louis' ? 'text-blue-400' : 'text-violet-400'}`}>
              {location}
            </span>
            <span className="text-xs text-zinc-700 ml-1">{locationItems.length} article{locationItems.length > 1 ? 's' : ''}</span>
          </div>

          {/* Table */}
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
                    const calc = calcItem(item)
                    const onVinted = item.status === 'Sur Vinted'
                    const waiting = item.status === 'En Attente'
                    return (
                      <tr key={item.id} onClick={() => onDetail(item)} className={`cursor-pointer hover:bg-zinc-800/30 transition-colors group ${onVinted ? 'bg-teal-500/[0.03]' : waiting ? 'bg-amber-500/[0.03]' : ''}`}>
                        {/* Nom */}
                        <td className="px-5 py-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`font-medium text-sm ${waiting ? 'text-zinc-400' : 'text-white'}`}>{item.item_name}</p>
                              {waiting && (
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
                            </div>
                            {item.notes && (
                              <div className="flex items-center gap-1 mt-1">
                                <StickyNote size={10} className="text-zinc-600" />
                                <span className="text-[11px] text-zinc-600 truncate max-w-[200px]">{item.notes}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Coût */}
                        <td className="px-4 py-4 text-right">
                          <p className="text-white font-medium">{formatCurrency(calc.cost_basis)}</p>
                          {item.vinted_fees > 0 && (
                            <p className="text-[11px] text-zinc-600 mt-0.5">dont {formatCurrency(item.vinted_fees)} frais</p>
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
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Bouton Reçu (uniquement si En Attente) */}
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

                            {/* Bouton Vinted / Retirer (désactivé si En Attente) */}
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

                            {/* Bouton Vendre (désactivé si En Attente) */}
                            {!waiting && (
                              <button
                                onClick={() => onSell(item)}
                                title="Marquer vendu"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium transition-colors border border-emerald-500/20"
                              >
                                <ShoppingCart size={11} />
                                Vendre
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
