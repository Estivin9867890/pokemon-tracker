'use client'

import { useState, Fragment } from 'react'
import { InventoryItem } from '@/types'
import { calcItem, formatCurrency, formatROI, roiColor } from '@/lib/calculations'
import { Pencil, Trash2, ShoppingCart, StickyNote, Package, Tag, X, PackageCheck, Clock, ChevronDown, ChevronRight, Sparkles, Search, Layers, Wrench, QrCode } from 'lucide-react'

type StockFilter = 'all' | 'lots' | 'singles'

interface StockTabProps {
  items: InventoryItem[]
  roiTarget: number
  onSell: (item: InventoryItem) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
  onToggleVinted: (item: InventoryItem) => void
  onMarkReceived: (item: InventoryItem) => void
  onDetail: (item: InventoryItem) => void
  onQRCode: (item: InventoryItem) => void
  onCleanupLots?: () => Promise<void>
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

export default function StockTab({ items, roiTarget, onSell, onEdit, onDelete, onToggleVinted, onMarkReceived, onDetail, onQRCode, onCleanupLots }: StockTabProps) {
  const [expandedLotId, setExpandedLotId]   = useState<string | null>(null)
  const [search, setSearch]                  = useState('')
  const [filter, setFilter]                  = useState<StockFilter>('all')
  const [cleaningUp, setCleaningUp]          = useState(false)

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

  const q = search.trim().toLowerCase()

  // IDs des lots qui remontent uniquement grâce à un hit → auto-dépliés
  const lotsMatchedByHit = new Set(
    q ? stockItems
      .filter((i) => i.is_lot)
      .filter((i) => {
        const selfMatch =
          i.item_name?.toLowerCase().includes(q) ||
          i.pokemon_name?.toLowerCase().includes(q) ||
          i.card_number?.toLowerCase().includes(q) ||
          i.rarity?.toLowerCase().includes(q) ||
          i.extension?.toLowerCase().includes(q)
        if (selfMatch) return false
        return (hitsByLotId[i.lot_id ?? ''] ?? []).some((h) =>
          h.item_name?.toLowerCase().includes(q) ||
          h.pokemon_name?.toLowerCase().includes(q) ||
          h.card_number?.toLowerCase().includes(q) ||
          h.rarity?.toLowerCase().includes(q) ||
          h.extension?.toLowerCase().includes(q)
        )
      })
      .map((i) => i.id)
    : []
  )

  const filteredItems = stockItems
    .filter((i) => {
      if (filter === 'lots') return i.is_lot
      if (filter === 'singles') return !i.is_lot
      return true
    })
    .filter((i) => {
      if (!q) return true
      const matchesSelf =
        i.item_name?.toLowerCase().includes(q) ||
        i.pokemon_name?.toLowerCase().includes(q) ||
        i.card_number?.toLowerCase().includes(q) ||
        i.rarity?.toLowerCase().includes(q) ||
        i.extension?.toLowerCase().includes(q)
      if (matchesSelf) return true
      // Pour les lots : chercher aussi dans les hits à l'intérieur
      if (i.is_lot) {
        const hits = hitsByLotId[i.lot_id ?? ''] ?? []
        return hits.some((h) =>
          h.item_name?.toLowerCase().includes(q) ||
          h.pokemon_name?.toLowerCase().includes(q) ||
          h.card_number?.toLowerCase().includes(q) ||
          h.rarity?.toLowerCase().includes(q) ||
          h.extension?.toLowerCase().includes(q)
        )
      }
      return false
    })

  const lotsCount   = stockItems.filter((i) => i.is_lot).length
  const singlesCount = stockItems.filter((i) => !i.is_lot).length

  // Lots techniquement terminés mais toujours en stock
  const completableLots = stockItems.filter((i) =>
    i.is_lot &&
    i.item_count != null && i.items_sold != null &&
    i.items_sold >= i.item_count
  )

  async function handleCleanup() {
    if (!onCleanupLots) return
    setCleaningUp(true)
    try { await onCleanupLots() } finally { setCleaningUp(false) }
  }

  return (
    <div className="space-y-4">

      {/* Bandeau lots bloqués */}
      {completableLots.length > 0 && onCleanupLots && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-500/8 border border-amber-500/25 rounded-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench size={13} className="text-amber-400 shrink-0" />
            <p className="text-[12px] text-amber-300 font-medium">
              {completableLots.length} lot{completableLots.length > 1 ? 's' : ''} terminé{completableLots.length > 1 ? 's' : ''} bloqué{completableLots.length > 1 ? 's' : ''} en stock
            </p>
          </div>
          <button
            onClick={handleCleanup}
            disabled={cleaningUp}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors disabled:opacity-50"
          >
            <Wrench size={11} />
            {cleaningUp ? 'Nettoyage…' : 'Nettoyer les lots'}
          </button>
        </div>
      )}

      {/* Filtres + Recherche */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Pills de filtre */}
        <div className="flex items-center gap-1 shrink-0">
          {([
            { key: 'all' as const, label: 'Tous', count: stockItems.length },
            { key: 'lots' as const, label: 'Lots', count: lotsCount, icon: <Layers size={10} /> },
            { key: 'singles' as const, label: 'Cartes à l\'unité', count: singlesCount },
          ]).map(({ key, label, count, icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                filter === key
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {icon}
              {label}
              <span className={`text-[10px] px-1 py-0.5 rounded-full ${filter === key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-600'}`}>{count}</span>
            </button>
          ))}
        </div>

        {/* Barre de recherche */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Nom, N° de carte (ex: 52/433), rareté…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        stockItems.length === 0 ? <EmptyState /> : (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-500">Aucun résultat{q ? ` pour "${search}"` : ''}</p>
          </div>
        )
      ) : (
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
                {filteredItems.map((item) => {
                  const calc        = calcItem(item)
                  const onVinted    = item.status === 'Sur Vinted'
                  const waiting     = item.status === 'En Attente'
                  const partialSold = item.status === 'Partiellement vendu'
                  const itemHits    = item.is_lot ? (hitsByLotId[item.lot_id ?? ''] ?? []) : []
                  const lotSold     = item.items_sold ?? 0
                  const lotTotal    = item.item_count ?? 0
                  const lotRevenue  = item.revenue_generated ?? 0
                  const lotCost     = item.lot_total_cost ?? item.purchase_price
                  const lotProgress = lotTotal > 0 ? lotSold / lotTotal : 0
                  const lotProfit   = lotRevenue - lotCost
                  const isExpanded  = expandedLotId === item.lot_id || lotsMatchedByHit.has(item.id)

                  return (
                    <Fragment key={item.id}>
                    <tr
                      onClick={() => onDetail(item)}
                      className={`cursor-pointer hover:bg-zinc-800/30 transition-colors group ${onVinted ? 'bg-teal-500/[0.03]' : waiting ? 'bg-amber-500/[0.03]' : partialSold ? 'bg-violet-500/[0.03]' : ''}`}
                    >
                      {/* Article */}
                      <td className="px-5 py-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-medium text-sm ${waiting ? 'text-zinc-400' : 'text-white'}`}>{item.item_name}</p>
                            {item.is_lot && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25 tracking-wider">LOT</span>
                            )}
                            {item.is_lot && itemHits.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 tracking-wider">
                                <Sparkles size={8} />{itemHits.length} HIT{itemHits.length > 1 ? 'S' : ''}
                              </span>
                            )}
                            {waiting && !item.is_lot && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/10 text-amber-400 border border-amber-400/20">
                                <Clock size={8} />En attente
                              </span>
                            )}
                            {onVinted && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-400/10 text-teal-400 border border-teal-400/20">
                                <Tag size={8} />Sur Vinted
                              </span>
                            )}
                            {partialSold && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-400/10 text-violet-400 border border-violet-400/20">
                                <ShoppingCart size={8} />En cours
                              </span>
                            )}
                          </div>
                          {item.extension && <p className="text-[11px] text-zinc-600 mt-0.5">{item.extension}</p>}
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
                                  {lotProfit >= 0 ? `Rentabilisé ✓ (+${formatCurrency(lotProfit)})` : `Manque ${formatCurrency(Math.abs(lotProfit))}`}
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
                              onClick={(e) => { e.stopPropagation(); setExpandedLotId(isExpanded ? null : (item.lot_id ?? null)) }}
                              className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                            >
                              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              {isExpanded ? 'Masquer les hits' : `Voir ${itemHits.length} hit${itemHits.length > 1 ? 's' : ''}`}
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
                              <PackageCheck size={11} />Reçu
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
                            onClick={() => onQRCode(item)}
                            title="QR Code"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20"
                          >
                            <QrCode size={11} />
                            QR
                          </button>
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

                    {/* Accordéon hits — conteneur scrollable illimité */}
                    {item.is_lot && isExpanded && itemHits.length > 0 && (
                      <tr className="border-t border-amber-500/10">
                        <td colSpan={6} className="px-5 py-2 bg-amber-500/[0.02]">
                          <div className="max-h-96 overflow-y-auto pr-1 divide-y divide-zinc-800/30">
                            {itemHits.map((hit) => {
                              const hitsTotal = itemHits.reduce((s, h) => s + (h.is_sold ? (h.sold_price ?? 0) : (h.expected_sale_price ?? 0)), 0)
                              return (
                                <div key={hit.id} className={`flex items-center justify-between gap-4 py-2 ${hit.is_sold ? 'bg-emerald-500/[0.04]' : ''}`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider shrink-0 ${hit.is_sold ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                                      <Sparkles size={7} />
                                      {hit.is_sold ? 'VENDU' : 'HIT'}
                                    </span>
                                    <p className={`text-xs font-medium ${hit.is_sold ? 'text-emerald-300' : 'text-white'}`}>{hit.pokemon_name ?? hit.item_name}</p>
                                    {hit.card_number && <span className="text-[10px] text-zinc-600">#{hit.card_number}</span>}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    {hit.is_sold ? (
                                      <p className="text-xs font-semibold text-emerald-400">{formatCurrency(hit.sold_price ?? 0)} <span className="text-[10px] text-emerald-600">vendu</span></p>
                                    ) : hit.expected_sale_price != null ? (
                                      <p className="text-xs font-semibold text-amber-400">{formatCurrency(hit.expected_sale_price)}</p>
                                    ) : null}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onQRCode(hit) }}
                                      title="QR Code"
                                      className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-600 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                                    >
                                      <QrCode size={10} />
                                    </button>
                                    {hitsTotal > 0 && hit === itemHits[itemHits.length - 1] && (
                                      <p className={`text-[10px] font-medium ${hitsTotal >= (item.lot_total_cost ?? 0) ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                        Total hits : {formatCurrency(hitsTotal)} / {formatCurrency(item.lot_total_cost ?? 0)}
                                        {hitsTotal >= (item.lot_total_cost ?? 0) ? ' ✓' : ''}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
