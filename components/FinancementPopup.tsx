'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { AppSettings, DashboardStats } from '@/types'
import { formatCurrency } from '@/lib/calculations'
import { saveOwed } from '@/lib/settings'
import { User, ArrowDownCircle, Loader2, Check, RotateCcw } from 'lucide-react'

interface FinancementPopupProps {
  open: boolean
  onClose: () => void
  stats: DashboardStats
  settings: AppSettings
  onSaveSettings: (s: AppSettings) => void
}

export default function FinancementPopup({ open, onClose, stats, settings, onSaveSettings }: FinancementPopupProps) {
  const [romainR, setRomainR]   = useState(String(settings.romain_owed_pokemon ?? 0))
  const [celianR, setCelianR]   = useState(String(settings.celian_owed_pokemon ?? 0))
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    setRomainR(String(settings.romain_owed_pokemon ?? 0))
    setCelianR(String(settings.celian_owed_pokemon ?? 0))
    setError(null)
  }, [open, settings.romain_owed_pokemon, settings.celian_owed_pokemon])

  const romainOwed = parseFloat(romainR) || 0
  const celianOwed = parseFloat(celianR) || 0
  const totalOwed  = romainOwed + celianOwed

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveOwed('romain_owed_pokemon', romainOwed, 'celian_owed_pokemon', celianOwed)
      onSaveSettings({ ...settings, romain_owed_pokemon: romainOwed, celian_owed_pokemon: celianOwed })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Erreur Appwrite : ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setSaving(true)
    setError(null)
    try {
      await saveOwed('romain_owed_pokemon', 0, 'celian_owed_pokemon', 0)
      setRomainR('0')
      setCelianR('0')
      onSaveSettings({ ...settings, romain_owed_pokemon: 0, celian_owed_pokemon: 0 })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Erreur Appwrite : ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Financement · Pokémon" maxWidth="max-w-md">
      <div className="px-6 py-5 space-y-4">

        {/* Romain */}
        <div className="bg-blue-400/5 border border-blue-400/15 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-400/15 flex items-center justify-center">
                <User size={12} className="text-blue-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Romain (Perso)</p>
                <p className="text-[10px] text-zinc-500">Apport : {formatCurrency(stats.romainContribution)}</p>
              </div>
            </div>
            <p className={`text-base font-bold ${romainOwed > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {romainOwed > 0 ? formatCurrency(romainOwed) : 'Soldé ✓'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-zinc-500 shrink-0">À rembourser :</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={romainR}
              onChange={(e) => { setRomainR(e.target.value); setError(null) }}
              className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-400/50 transition-colors"
            />
            <span className="text-[10px] text-zinc-500">€</span>
          </div>
        </div>

        {/* Célian */}
        <div className="bg-violet-400/5 border border-violet-400/15 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-violet-400/15 flex items-center justify-center">
                <User size={12} className="text-violet-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Célian (Perso)</p>
                <p className="text-[10px] text-zinc-500">Apport : {formatCurrency(stats.celianContribution)}</p>
              </div>
            </div>
            <p className={`text-base font-bold ${celianOwed > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {celianOwed > 0 ? formatCurrency(celianOwed) : 'Soldé ✓'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-zinc-500 shrink-0">À rembourser :</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={celianR}
              onChange={(e) => { setCelianR(e.target.value); setError(null) }}
              className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-400/50 transition-colors"
            />
            <span className="text-[10px] text-zinc-500">€</span>
          </div>
        </div>

        <div className="h-px bg-zinc-800/60" />

        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-xs text-zinc-500">Trésorerie nette</p>
            <p className="text-[10px] text-zinc-700">après dettes + logistique</p>
          </div>
          <p className={`text-sm font-bold ${stats.cashInHand < 0 ? 'text-red-500' : 'text-emerald-400'}`}>
            {stats.cashInHand < 0 ? '-' : ''}{formatCurrency(Math.abs(stats.cashInHand))}
          </p>
        </div>

        <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${totalOwed > 0 ? 'bg-red-500/8 border border-red-500/20' : 'bg-emerald-500/8 border border-emerald-500/20'}`}>
          <div className="flex items-center gap-2.5">
            <ArrowDownCircle size={14} className={totalOwed > 0 ? 'text-red-400' : 'text-emerald-400'} />
            <div>
              <p className="text-xs font-semibold text-white">Total dette commune</p>
              <p className="text-[10px] text-zinc-500">Romain + Célian</p>
            </div>
          </div>
          <p className={`text-base font-bold ${totalOwed > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {totalOwed > 0 ? formatCurrency(totalOwed) : 'Tout soldé ✓'}
          </p>
        </div>

        {stats.romainContribution === 0 && stats.celianContribution === 0 && (
          <p className="text-center text-xs text-zinc-600 py-1">
            Aucun apport perso enregistré. Taguez vos articles &quot;Romain Perso&quot; ou &quot;Célian Perso&quot; à l&apos;ajout.
          </p>
        )}

        {error && (
          <p className="text-[11px] text-red-400 text-center px-1">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs font-medium transition-colors disabled:opacity-50"
            title="Marquer tout comme remboursé"
          >
            <RotateCcw size={12} />
            Tout soldé
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Sauvegarder
          </button>
        </div>
      </div>
    </Modal>
  )
}
