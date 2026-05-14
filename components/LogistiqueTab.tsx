'use client'

import { useState, useMemo } from 'react'
import { Consumable, ConsumableCategory } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { Pencil, Trash2, Plus, Package } from 'lucide-react'
import LogistiqueModal from '@/components/LogistiqueModal'

interface LogistiqueTabProps {
  consumables: Consumable[]
  onAdd: () => void
  onEdit: (id: string, data: { name: string; price: number; quantity: number; date: string; category: ConsumableCategory }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const CAT_LABEL: Record<ConsumableCategory, { label: string; color: string }> = {
  PACKAGING: { label: 'Emballage',  color: 'bg-blue-400/15 text-blue-400' },
  SHIPPING:  { label: 'Expédition', color: 'bg-violet-400/15 text-violet-400' },
  OTHER:     { label: 'Autre',      color: 'bg-zinc-600/30 text-zinc-400' },
}

export default function LogistiqueTab({ consumables, onAdd, onEdit, onDelete }: LogistiqueTabProps) {
  const [editTarget, setEditTarget]         = useState<Consumable | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const totalAll   = useMemo(() => consumables.reduce((s, c) => s + c.price * c.quantity, 0), [consumables])
  const byCategory = useMemo(() => {
    const map: Record<ConsumableCategory, number> = { PACKAGING: 0, SHIPPING: 0, OTHER: 0 }
    consumables.forEach((c) => { map[c.category] = (map[c.category] ?? 0) + c.price * c.quantity })
    return map
  }, [consumables])

  const avgMonthly = useMemo(() => {
    const months: Record<string, number> = {}
    consumables.forEach((c) => {
      const m = c.date.slice(0, 7)
      months[m] = (months[m] ?? 0) + c.price * c.quantity
    })
    const vals = Object.values(months)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }, [consumables])

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Total dépensé</p>
          <p className="text-2xl font-bold text-orange-400">{formatCurrency(totalAll)}</p>
        </div>
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Moy. mensuelle</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(avgMonthly)}</p>
        </div>
        {(['PACKAGING', 'SHIPPING'] as ConsumableCategory[]).map((cat) => (
          <div key={cat} className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-4">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">{CAT_LABEL[cat].label}</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(byCategory[cat])}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/60 flex items-center gap-2">
          <Package size={13} className="text-orange-400" />
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex-1">
            Historique ({consumables.length})
          </p>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 transition-colors"
          >
            <Plus size={11} />
            Ajouter
          </button>
        </div>

        {consumables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-3">
            <Package size={28} className="opacity-30" />
            <p className="text-sm">Aucune dépense logistique</p>
            <button onClick={onAdd} className="text-xs text-emerald-400 hover:underline">
              Enregistrer un premier achat
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/30">
            {consumables.map((c) => {
              const cat       = CAT_LABEL[c.category]
              const confirming = confirmDeleteId === c.id
              const amount     = c.price * c.quantity

              if (confirming) {
                return (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3 bg-red-500/5 border-l-2 border-red-500/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-red-300 truncate">{c.name}</p>
                      <p className="text-[11px] text-red-400/70 mt-0.5">
                        Supprimer cette dépense ? <span className="font-bold text-red-400">{formatCurrency(amount)}</span> seront crédités à la trésorerie.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={async () => { await onDelete(c.id); setConfirmDeleteId(null) }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 transition-colors"
                      >
                        Confirmer
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={c.id} className="flex items-center justify-between px-5 py-3 hover:bg-zinc-800/20 transition-colors group">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-white truncate">{c.name}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${cat.color}`}>
                        {cat.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      {c.date}
                      {c.quantity > 1 && ` · ${c.quantity} × ${formatCurrency(c.price)} u.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <p className="text-sm font-semibold text-orange-400">{formatCurrency(amount)}</p>
                    <button
                      onClick={() => setEditTarget(c)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <LogistiqueModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        initialData={editTarget ?? undefined}
        onSave={async (data) => {
          if (!editTarget) return
          await onEdit(editTarget.id, data)
          setEditTarget(null)
        }}
      />
    </div>
  )
}
