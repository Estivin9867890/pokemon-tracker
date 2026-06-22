'use client'

import { useState, useRef, useCallback } from 'react'
import { Search, X, Loader2, Camera, TrendingUp, TrendingDown } from 'lucide-react'
import PriceEvolution from '@/components/PriceEvolution'

interface TCGdexCard {
  id: string; localId: string; name: string
  image?: string; set?: { id: string; name: string }
}

async function searchTCGdex(query: string, signal?: AbortSignal): Promise<TCGdexCard[]> {
  if (!query.trim() || query.trim().length < 2) return []
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(query.trim())}`, { signal })
    if (!res.ok) return []
    const data = await res.json() as TCGdexCard[]
    return Array.isArray(data) ? data.slice(0, 30) : []
  } catch { return [] }
}

export default function MarketTab() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<TCGdexCard[]>([])
  const [selected, setSelected] = useState<TCGdexCard | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    setSelected(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()
    if (!q.trim() || q.trim().length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    timerRef.current = setTimeout(async () => {
      const data = await searchTCGdex(q, ctrl.signal)
      if (!ctrl.signal.aborted) { setResults(data); setSearching(false) }
    }, 350)
  }, [])

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Rechercher une carte Pokémon…"
          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-2xl pl-11 pr-10 py-3.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          autoComplete="off" autoCorrect="off" spellCheck={false}
        />
        {query ? (
          <button type="button" onClick={() => { setQuery(''); setResults([]); setSelected(null) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={14} />
          </button>
        ) : searching && (
          <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />
        )}
      </div>

      {/* Selected card detail */}
      {selected && (
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800/50">
            <button type="button" onClick={() => setSelected(null)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mb-3 flex items-center gap-1">
              ← Retour aux résultats
            </button>
            <div className="flex items-start gap-4">
              <div className="w-20 h-28 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/50 shrink-0">
                {selected.image
                  ? <img src={`${selected.image}/low.webp`} alt={selected.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Camera size={16} className="text-zinc-600" /></div>}
              </div>
              <div className="min-w-0 pt-1">
                <h3 className="text-lg font-bold text-white">{selected.name}</h3>
                <p className="text-xs text-zinc-500 font-mono mt-1">{selected.set?.id?.toUpperCase()} · #{selected.localId}</p>
                {selected.set?.name && <p className="text-xs text-zinc-400 mt-1">{selected.set.name}</p>}
              </div>
            </div>
          </div>
          <div className="px-5 py-4">
            <PriceEvolution pokemonName={selected.name} cardNumber={selected.localId} />
          </div>
        </div>
      )}

      {/* Results grid */}
      {!selected && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {results.map((card) => (
            <button key={card.id} type="button" onClick={() => setSelected(card)}
              className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-3 hover:bg-zinc-800/60 hover:border-zinc-700/60 active:scale-[0.98] transition-all text-left group">
              <div className="w-full aspect-[5/7] rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/40 mb-2.5">
                {card.image
                  ? <img src={`${card.image}/low.webp`} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><Camera size={16} className="text-zinc-600" /></div>}
              </div>
              <p className="text-xs font-bold text-white truncate">{card.name}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{card.set?.id?.toUpperCase()} · {card.localId}</p>
              {card.set?.name && <p className="text-[10px] text-zinc-600 truncate mt-0.5">{card.set.name}</p>}
              <p className="text-[10px] text-emerald-400/50 font-semibold mt-2 group-hover:text-emerald-400 transition-colors">Voir les prix →</p>
            </button>
          ))}
        </div>
      )}

      {/* Searching */}
      {searching && (
        <div className="flex items-center justify-center py-12 gap-2">
          <Loader2 size={16} className="animate-spin text-zinc-600" />
          <span className="text-sm text-zinc-500">Recherche…</span>
        </div>
      )}

      {/* No results */}
      {!searching && query.trim().length >= 2 && results.length === 0 && !selected && (
        <p className="text-center text-sm text-zinc-600 py-12">
          Aucune carte trouvée pour « {query} »
        </p>
      )}

      {/* Empty state */}
      {!query && results.length === 0 && !selected && (
        <div className="flex flex-col items-center py-16 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/8 border border-emerald-500/15 flex items-center justify-center">
            <TrendingUp size={24} className="text-emerald-400/60" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-400">Explorer le marché</p>
            <p className="text-xs text-zinc-600 mt-1 max-w-xs">Recherchez une carte pour voir son prix Cardmarket, l'évolution et les tendances.</p>
          </div>
        </div>
      )}
    </div>
  )
}
