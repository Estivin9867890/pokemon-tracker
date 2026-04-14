'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Layers, Lock, Eye, EyeOff } from 'lucide-react'

// Mot de passe modifiable ici ou via NEXT_PUBLIC_GATE_PASSWORD dans .env.local
const GATE_PASSWORD = process.env.NEXT_PUBLIC_GATE_PASSWORD ?? 'Ccbdg'

export default function GatePage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (localStorage.getItem('pokemon_auth')) {
      router.replace('/dashboard')
    } else {
      setChecking(false)
    }
  }, [router])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === GATE_PASSWORD) {
      localStorage.setItem('pokemon_auth', '1')
      router.push('/dashboard')
    } else {
      setError(true)
      setPassword('')
    }
  }

  if (checking) return null

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mb-4">
            <Layers size={22} className="text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-widest uppercase">Pokémon</h1>
          <p className="text-xs text-zinc-600 mt-1">Card Flipping · Célian &amp; Romain</p>
        </div>

        {/* Card */}
        <div className="bg-[#111113] border border-zinc-800/80 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <Lock size={12} className="text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Accès privé</p>
              <p className="text-[11px] text-zinc-600">Entrez le mot de passe pour continuer</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Mot de passe"
                autoFocus
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false) }}
                className={`w-full bg-zinc-900 border rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 transition-colors ${
                  error
                    ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/10'
                    : 'border-zinc-800 focus:border-zinc-600 focus:ring-zinc-600/20'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {error && (
              <p className="text-[12px] text-red-400 text-center">Mot de passe incorrect</p>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors"
            >
              Accéder au dashboard
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-zinc-700 mt-6">
          Données personnelles · Accès restreint
        </p>
      </div>
    </div>
  )
}
