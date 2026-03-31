'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { AppSettings } from '@/types'
import { saveSettings } from '@/lib/settings'
import { Loader2 } from 'lucide-react'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  settings: AppSettings
  onSave: (s: AppSettings) => void
}

export default function SettingsModal({ open, onClose, settings, onSave }: SettingsModalProps) {
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setForm(settings) }, [open, settings])

  const set = (k: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setForm((p) => ({ ...p, [k]: ['initial_capital','roi_target','obj1_target','obj2_target','obj3_target','default_vinted_fees'].includes(k) ? v : v }))
  }

  function num(k: keyof AppSettings) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveSettings(form)
      onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Paramètres" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

        {/* ── Général ───────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Général</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Capital de départ"
              type="number" step="1" min="0"
              suffix="€"
              value={form.initial_capital}
              onChange={num('initial_capital')}
            />
            <Input
              label="ROI minimum cible"
              type="number" step="0.5" min="0"
              suffix="%"
              value={form.roi_target}
              onChange={num('roi_target')}
            />
          </div>
          <Input
            label="Frais Vinted par défaut (achat)"
            type="number" step="0.01" min="0"
            suffix="€"
            hint="Pré-rempli dans le formulaire d'ajout"
            value={form.default_vinted_fees}
            onChange={num('default_vinted_fees')}
          />
        </div>

        {/* ── Objectifs ─────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Objectifs de bénéfice</p>
          {([
            ['obj1_label', 'obj1_target'],
            ['obj2_label', 'obj2_target'],
            ['obj3_label', 'obj3_target'],
          ] as const).map(([labelKey, targetKey], i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <Input
                label={`Objectif ${i + 1} — label`}
                placeholder="ex : 1 mois"
                value={form[labelKey]}
                onChange={set(labelKey)}
              />
              <Input
                label="Montant cible"
                type="number" step="1" min="0"
                suffix="€"
                value={form[targetKey]}
                onChange={num(targetKey)}
              />
            </div>
          ))}
        </div>

        {/* ── Actions ───────────────────────────── */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
