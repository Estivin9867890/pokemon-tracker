'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Camera, X, Loader2, Search, Zap } from 'lucide-react'
import { ItemFormData } from '@/types'

export type ScanData = Pick<ItemFormData, 'pokemon_name' | 'card_number' | 'extension' | 'rarity' | 'expected_sale_price'>

interface CardScannerModalProps {
  open: boolean
  onClose: () => void
  onResult: (data: Partial<ScanData>) => void
}

const RARITY_MAP: Record<string, string> = {
  'Common': 'Commune', 'Uncommon': 'Peu commune', 'Rare': 'Rare',
  'Rare Holo': 'Rare Holo', 'Rare Reverse Holo': 'Reverse Holo',
  'Rare Holo EX': 'EX / GX / V', 'Rare Ultra': 'EX / GX / V',
  'Rare Holo GX': 'EX / GX / V', 'Rare Holo V': 'EX / GX / V',
  'Double Rare': 'EX / GX / V', 'Ultra Rare': 'EX / GX / V',
  'Rare Holo VMAX': 'VMAX / VSTAR', 'Rare Holo VSTAR': 'VMAX / VSTAR',
  'Rare Rainbow': 'Rainbow Rare', 'Rare Secret': 'Secret Rare (>set)',
  'Secret Rare': 'Secret Rare (>set)', 'Hyper Rare': 'Secret Rare (>set)',
  'ACE SPEC Rare': 'Secret Rare (>set)', 'Rare Shiny': 'Shiny',
  'Shiny Rare': 'Shiny', 'Shiny Ultra Rare': 'Shiny', 'Amazing Rare': 'Amazing Rare',
  'Promo': 'Promo', 'Full Art': 'Full Art', 'Illustration Rare': 'Illustration Rare',
  'Special Illustration Rare': 'Special Illustration Rare',
  'Trainer Gallery Rare Holo': 'Trainer Gallery', 'Radiant Rare': 'AR (Art Rare)',
  'Super Rare': 'SAR (Special Art Rare)', 'Tera': 'AR (Art Rare)',
}

interface TCGdexCard {
  id: string; localId: string; name: string
  image?: string; set?: { id: string; name: string }
}

interface PriceCard {
  name: string; number: string
  set?: { name: string; ptcgoCode?: string }
  rarity?: string
  cardmarket?: { prices?: { trendPrice?: number; averageSellPrice?: number } }
  tcgplayer?: { prices?: Record<string, { market?: number }> }
}

function getBestPrice(card: PriceCard): string {
  const t = card.cardmarket?.prices?.trendPrice ?? card.cardmarket?.prices?.averageSellPrice
  if (t != null) return t.toFixed(2)
  if (card.tcgplayer?.prices)
    for (const tier of Object.values(card.tcgplayer.prices))
      if (tier?.market != null) return tier.market.toFixed(2)
  return ''
}

async function searchTCGdex(query: string, signal?: AbortSignal): Promise<TCGdexCard[]> {
  if (!query.trim() || query.trim().length < 2) return []
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(query.trim())}`, { signal })
    if (!res.ok) return []
    const data = await res.json() as TCGdexCard[]
    return Array.isArray(data) ? data.slice(0, 20) : []
  } catch { return [] }
}

async function fetchPrices(tcgdexId: string): Promise<PriceCard | null> {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${tcgdexId}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return ((await res.json()) as { data: PriceCard }).data ?? null
  } catch { return null }
}

function captureToBase64(video: HTMLVideoElement): string {
  const TARGET_W = 800
  const ratio = TARGET_W / video.videoWidth
  const canvas = document.createElement('canvas')
  canvas.width = TARGET_W
  canvas.height = Math.round(video.videoHeight * ratio)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

export default function CardScannerModal({ open, onClose, onResult }: CardScannerModalProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const mountedRef  = useRef(false)
  const searchAbort = useRef<AbortController | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const [scanning, setScanning]       = useState(false)
  const [scanResult, setScanResult]   = useState('')
  const [scanError, setScanError]     = useState('')

  const [query, setQuery]             = useState('')
  const [searching, setSearching]     = useState(false)
  const [results, setResults]         = useState<TCGdexCard[]>([])
  const [loadingId, setLoadingId]     = useState<string | null>(null)

  // ── Camera ──────────────────────────────────────────────────────────────────
  async function startCamera() {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => { if (mountedRef.current) setCameraReady(true) }
      }
    } catch (err) {
      const n = (err as Error).name
      if (mountedRef.current) {
        setCameraError(
          n === 'NotAllowedError' ? "Accès caméra refusé — autorisez dans les réglages." :
          n === 'NotFoundError'   ? "Aucune caméra détectée." :
          "Impossible d'accéder à la caméra.",
        )
      }
    }
  }

  // ── Gemini AI scan ──────────────────────────────────────────────────────────
  async function handleAiScan() {
    if (!videoRef.current || scanning) return
    setScanning(true); setScanError(''); setScanResult(''); setResults([])

    try {
      const base64 = captureToBase64(videoRef.current)
      const res = await fetch('/api/scan-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json() as { name?: string; number?: string; error?: string }
      if (!mountedRef.current) return

      if (!res.ok || data.error) {
        setScanError(res.status === 503 ? 'Clé Gemini non configurée — tapez le nom' : (data.error ?? 'Erreur scan IA'))
        return
      }
      const name = (data.name ?? '').trim()
      if (!name) { setScanError('Carte non reconnue — repositionnez et réessayez'); return }

      setScanResult(name)
      setQuery(name)
      triggerSearch(name)
    } catch (err) {
      if (mountedRef.current) setScanError((err as Error).message ?? 'Erreur réseau')
    } finally {
      if (mountedRef.current) setScanning(false)
    }
  }

  // ── Search ──────────────────────────────────────────────────────────────────
  function triggerSearch(q: string) {
    searchAbort.current?.abort()
    const ctrl = new AbortController(); searchAbort.current = ctrl
    setSearching(true)
    searchTCGdex(q, ctrl.signal).then((res) => {
      if (mountedRef.current && !ctrl.signal.aborted) { setResults(res); setSearching(false) }
    }).catch(() => { if (mountedRef.current) setSearching(false) })
  }

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q); setScanResult(''); setScanError('')
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchAbort.current?.abort()
    if (!q.trim()) { setResults([]); setSearching(false); return }
    setSearching(true)
    const ctrl = new AbortController(); searchAbort.current = ctrl
    searchTimer.current = setTimeout(async () => {
      const data = await searchTCGdex(q, ctrl.signal)
      if (mountedRef.current && !ctrl.signal.aborted) { setResults(data); setSearching(false) }
    }, 300)
  }, [])

  // ── Select card → fill form ─────────────────────────────────────────────────
  async function selectCard(card: TCGdexCard) {
    if (loadingId === card.id) return
    setLoadingId(card.id)
    try {
      const priceCard = await fetchPrices(card.id)
      const rarity = RARITY_MAP[priceCard?.rarity ?? ''] ?? priceCard?.rarity ?? ''
      onResult({
        pokemon_name:        card.name,
        card_number:         card.localId,
        extension:           card.set?.name ?? priceCard?.set?.name ?? '',
        rarity,
        expected_sale_price: priceCard ? getBestPrice(priceCard) : '',
      })
      onClose()
    } finally {
      if (mountedRef.current) setLoadingId(null)
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
      return
    }
    mountedRef.current = true
    setCameraReady(false); setCameraError('')
    setScanning(false); setScanResult(''); setScanError('')
    setQuery(''); setResults([]); setSearching(false); setLoadingId(null)
    startCamera()
    return () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
      searchAbort.current?.abort()
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0e0e10] border border-white/8 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '92dvh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/6 shrink-0">
          <div className="flex items-center gap-2.5">
            <Zap size={15} className="text-emerald-400" />
            <span className="text-[15px] font-bold text-white">Scanner une carte</span>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/6 text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4 space-y-3">

            {cameraError ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-500/8 border border-red-500/15 flex items-center justify-center">
                  <Camera size={22} className="text-red-400" />
                </div>
                <p className="text-[13px] text-white/50 max-w-xs leading-relaxed">{cameraError}</p>
              </div>
            ) : (
              <>
                {/* Camera */}
                <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse 60% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)' }} />

                  {/* Card frame */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative" style={{ width: '52%', aspectRatio: '5/7' }}>
                      <div className="absolute inset-0 rounded-xl"
                        style={{ border: `2px dashed ${cameraReady ? 'rgba(52,211,153,0.55)' : 'rgba(255,255,255,0.2)'}` }} />
                      {['top-0 left-0 rounded-tl-xl border-t-[3px] border-l-[3px]',
                        'top-0 right-0 rounded-tr-xl border-t-[3px] border-r-[3px]',
                        'bottom-0 left-0 rounded-bl-xl border-b-[3px] border-l-[3px]',
                        'bottom-0 right-0 rounded-br-xl border-b-[3px] border-r-[3px]',
                      ].map((cls) => (
                        <div key={cls} className={`absolute w-5 h-5 ${cls}`}
                          style={{ borderColor: cameraReady ? 'rgba(52,211,153,0.8)' : 'rgba(255,255,255,0.3)', margin: '-2px' }} />
                      ))}
                    </div>
                  </div>

                  {/* Scanning overlay */}
                  {scanning && (
                    <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2">
                      <Loader2 size={22} className="animate-spin text-emerald-400" />
                      <p className="text-[11px] text-white/60 font-medium">Analyse IA…</p>
                    </div>
                  )}
                </div>

                {/* AI scan button */}
                <button type="button" onClick={handleAiScan} disabled={scanning || !cameraReady}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-[15px] transition-all active:scale-[0.98]">
                  {scanning
                    ? <><Loader2 size={15} className="animate-spin" /> Analyse en cours…</>
                    : <><Zap size={15} /> Scanner avec l&apos;IA</>
                  }
                </button>

                {/* Feedback */}
                {scanResult && !searching && (
                  <p className="text-center text-[12px] text-emerald-400 font-medium">✓ Détecté : « {scanResult} »</p>
                )}
                {scanError && (
                  <p className="text-center text-[12px] text-red-400">{scanError}</p>
                )}

                {/* Separator */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[10px] text-white/20 font-medium uppercase tracking-widest">ou tapez le nom</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
                  <input type="text" value={query} onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder="Dracaufeu, Pikachu ex, Méga-Mewtwo…"
                    className="w-full bg-white/5 border border-white/8 rounded-2xl pl-9 pr-9 py-3 text-[14px] text-white placeholder-white/15 focus:outline-none focus:border-white/18 transition-colors"
                    autoComplete="off" autoCorrect="off" spellCheck={false} />
                  {query
                    ? <button type="button" onClick={() => { setQuery(''); setResults([]) }}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 p-1">
                        <X size={12} />
                      </button>
                    : (searching || loadingId) && <Loader2 size={12} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-white/25" />
                  }
                </div>

                {/* Results */}
                {results.length > 0 && (
                  <div className="rounded-2xl border border-white/6 overflow-hidden divide-y divide-white/4 bg-white/2">
                    {results.map((card) => (
                      <button key={card.id} type="button" onClick={() => selectCard(card)} disabled={loadingId === card.id}
                        className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-white/5 active:bg-white/8 text-left transition-colors">
                        <div className="w-9 h-[50px] rounded-xl overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                          {card.image
                            ? <img src={`${card.image}/low.webp`} alt={card.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Camera size={9} className="text-white/15" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-white truncate">{card.name}</p>
                          <p className="text-[10px] text-white/30 font-mono mt-0.5">{card.set?.id?.toUpperCase()} · {card.localId}</p>
                          {card.set?.name && <p className="text-[10px] text-white/18 truncate mt-0.5">{card.set.name}</p>}
                        </div>
                        {loadingId === card.id
                          ? <Loader2 size={14} className="animate-spin text-white/30 shrink-0" />
                          : <span className="text-[10px] text-emerald-400/60 font-semibold shrink-0">Choisir →</span>}
                      </button>
                    ))}
                  </div>
                )}

                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-center text-[12px] text-white/20 py-3">
                    Aucune carte pour « {query} »
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
