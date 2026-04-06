'use client'

import { InventoryItem } from '@/types'
import { calcItem, formatCurrency, formatROI, roiColor } from '@/lib/calculations'
import Badge from '@/components/ui/Badge'
import { Pencil, Trash2, Archive, MapPin, StickyNote, TrendingUp, TrendingDown } from 'lucide-react'

interface ArchivesTabProps {
  items: InventoryItem[]
  roiTarget: number
  onEdit: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
  onDetail: (item: InventoryItem) => void
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
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

export default function ArchivesTab({ items, roiTarget, onEdit, onDelete, onDetail }: ArchivesTabProps) {
  const soldItems = items
    .filter((i) => i.status === 'Vendu' && !i.is_hit)
    .sort((a, b) => new Date(b.sold_at ?? b.created_at).getTime() - new Date(a.sold_at ?? a.created_at).getTime())

  if (soldItems.length === 0) return <EmptyArchives />

  const totalRevenue  = soldItems.reduce((s, i) => s + (i.actual_sale_price ?? 0), 0)
  const totalCost     = soldItems.reduce((s, i) => s + i.purchase_price + i.vinted_fees, 0)
  const totalSaleFees = soldItems.reduce((s, i) => s + i.sale_fees, 0)
  const totalProfit   = totalRevenue - totalSaleFees - totalCost
  const overallROI    = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0

  const delays = soldItems
    .filter((i) => i.sold_at)
    .map((i) => (new Date(i.sold_at!).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24))
  const avgDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Bénéfice net</p>
          <p className={`text-2xl font-bold mt-2 ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(totalProfit, true)}
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">{soldItems.length} vente{soldItems.length > 1 ? 's' : ''} réalisée{soldItems.length > 1 ? 's' : ''}</p>
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

      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Article</th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Lieu</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Coût</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Vendu</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Frais vente</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Marge</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">ROI</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {soldItems.map((item) => {
                const calc        = calcItem(item)
                const meetsTarget = (calc.roi_percent ?? 0) >= roiTarget
                const isProfit    = (calc.margin_net ?? 0) >= 0

                return (
                  <tr key={item.id} onClick={() => onDetail(item)} className="cursor-pointer hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meetsTarget ? 'bg-emerald-400' : isProfit ? 'bg-amber-400' : 'bg-red-400'}`} />
                        <div>
                          <p className="font-medium text-white text-sm">{item.item_name}</p>
                          {item.extension && (
                            <p className="text-[10px] text-zinc-600 mt-0.5">{item.extension}</p>
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

                    <td className="px-4 py-3.5 text-center">
                      <Badge variant={item.location === 'Chez Romain' ? 'blue' : 'violet'}>
                        {item.location === 'Chez Romain' ? 'Romain' : 'Célian'}
                      </Badge>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <p className="text-zinc-300 font-medium">{formatCurrency(calc.cost_basis)}</p>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <p className="text-white font-semibold">{item.actual_sale_price != null ? formatCurrency(item.actual_sale_price) : '—'}</p>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <p className="text-zinc-500">{formatCurrency(item.sale_fees)}</p>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isProfit ? <TrendingUp size={11} className="text-emerald-400" /> : <TrendingDown size={11} className="text-red-400" />}
                        <p className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                          {calc.margin_net !== null ? formatCurrency(calc.margin_net, true) : '—'}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <span className={`font-bold text-sm ${roiColor(calc.roi_percent, roiTarget)}`}>
                        {formatROI(calc.roi_percent)}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-left">
                      <p className="text-xs text-zinc-500 whitespace-nowrap">
                        {item.sold_at ? formatDate(item.sold_at) : '—'}
                      </p>
                    </td>

                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onEdit(item)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => onDelete(item)}
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

      <div className="flex items-center gap-3 px-1">
        <MapPin size={11} className="text-zinc-600" />
        <span className="text-[11px] text-zinc-600">
          Chez Romain : {formatCurrency(soldItems.filter(i => i.location === 'Chez Romain').reduce((s, i) => s + (i.actual_sale_price ?? 0), 0))} ·
          Chez Célian : {formatCurrency(soldItems.filter(i => i.location === 'Chez Célian').reduce((s, i) => s + (i.actual_sale_price ?? 0), 0))}
        </span>
      </div>
    </div>
  )
}
