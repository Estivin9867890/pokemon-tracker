'use client'

import Modal from '@/components/ui/Modal'
import { AlertTriangle } from 'lucide-react'
import { InventoryItem } from '@/types'

interface DeleteModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  item: InventoryItem | null
}

export default function DeleteModal({ open, onClose, onConfirm, item }: DeleteModalProps) {
  if (!item) return null

  return (
    <Modal open={open} onClose={onClose} title="Supprimer l'article" maxWidth="max-w-md">
      <div className="px-6 py-5 space-y-4">
        <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-white">{item.item_name}</p>
            <p className="text-xs text-zinc-500 mt-1">
              Cette action est irréversible. L&apos;article sera supprimé définitivement.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-sm transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>
    </Modal>
  )
}
