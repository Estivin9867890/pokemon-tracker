'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Camera, X, Scan, Loader2, RefreshCw, Search, CheckCircle2, Zap } from 'lucide-react'
import { ItemFormData } from '@/types'

export type ScanData = Pick<ItemFormData, 'pokemon_name' | 'card_number' | 'extension' | 'rarity' | 'expected_sale_price'>

interface CardScannerModalProps {
  open: boolean
  onClose: () => void
  onResult: (data: Partial<ScanData>) => void
}

// ── Rarity mapping EN → FR labels ────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface TCGdexCard {
  id: string
  localId: string
  name: string
  image?: string
  set?: { id: string; name: string }
  rarity?: string
}

interface PriceCard {
  name: string
  number: string
  set?: { name: string; ptcgoCode?: string }
  rarity?: string
  cardmarket?: { prices?: { trendPrice?: number; averageSellPrice?: number } }
  tcgplayer?: { prices?: Record<string, { market?: number }> }
}

function getBestPrice(card: PriceCard): string {
  const t = card.cardmarket?.prices?.trendPrice ?? card.cardmarket?.prices?.averageSellPrice
  if (t != null) return t.toFixed(2)
  if (card.tcgplayer?.prices) {
    for (const tier of Object.values(card.tcgplayer.prices)) {
      if (tier?.market != null) return tier.market.toFixed(2)
    }
  }
  return ''
}

// ── TCGdex search (French names) ──────────────────────────────────────────────
async function searchTCGdex(query: string, signal?: AbortSignal): Promise<TCGdexCard[]> {
  if (!query.trim()) return []
  try {
    const res = await fetch(
      `https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(query.trim())}`,
      { signal },
    )
    if (!res.ok) return []
    const data = await res.json() as TCGdexCard[]
    return Array.isArray(data) ? data.slice(0, 25) : []
  } catch {
    return []
  }
}

// Fetch price data from pokemontcg.io (using TCGdex card ID as pokemontcg.io ID)
async function fetchPrices(tcgdexId: string): Promise<PriceCard | null> {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${tcgdexId}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const json = await res.json() as { data: PriceCard }
    return json.data ?? null
  } catch {
    return null
  }
}

// ── Canvas: crop card name area then scale up ─────────────────────────────────
function cropNameArea(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const W = canvas.width
  const H = canvas.height

  // The card frame is centered in the 4:3 viewfinder.
  // The name is in the top ~18% of the card height.
  // We target a generous center-top region to capture it reliably.
  const cropX = Math.floor(W * 0.22)
  const cropY = Math.floor(H * 0.02)
  const cropW = Math.floor(W * 0.56)
  const cropH = Math.floor(H * 0.24)

  const SCALE = 4
  const out = document.createElement('canvas')
  out.width  = cropW * SCALE
  out.height = cropH * SCALE

  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled  = true
  ctx.imageSmoothingQuality  = 'high'
  ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height)

  // Binary threshold — dark text on light card background
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d   = img.data
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const val  = gray > 150 ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = val
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out
}

// ── Clean OCR text to extract the Pokémon name ───────────────────────────────
function extractName(raw: string): string {
  return raw
    .replace(/\n/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length >= 2)
    .join(' ')
    .slice(0, 40)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CardScannerModal({ open, onClose, onResult }: CardScannerModalProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const abortRef   = useRef<AbortController | null>(null)
  const searchTimer= useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)

  const [cameraError, setCameraError] = useState('')
  const [query, setQuery]             = useState('')
  const [searching, setSearching]     = useState(false)
  const [results, setResults]         = useState<TCGdexCard[]>([])
  const [detecting, setDetecting]     = useState(false)
  const [detectHint, setDetectHint]   = useState('')
  const [loadingId, setLoadingId]     = useState<string | null>(null)

  // ── Camera ────────────────────────────────────────────────────────────────
  async function startCamera() {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch (err) {
      const n = (err as Error).name
      setCameraError(
        n === 'NotAllowedError' ? "Accès caméra refusé. Autorisez-le dans les réglages." :
        n === 'NotFoundError'   ? "Aucune caméra détectée." :
        "Impossible d'accéder à la caméra.",
      )
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    if (!open) { stopCamera(); return }
    mountedRef.current = true
    setQuery(''); setResults([]); setDetectHint(''); setDetecting(false); setLoadingId(null)
    startCamera()
    return () => {
      mountedRef.current = false
      stopCamera()
      abortRef.current?.abort()
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [open])

  // ── Real-time search ──────────────────────────────────────────────────────
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    abortRef.current?.abort()

    if (!q.trim()) { setResults([]); setSearching(false); return }

    setSearching(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    searchTimer.current = setTimeout(async () => {
      const data = await searchTCGdex(q, ctrl.signal)
      if (mountedRef.current && !ctrl.signal.aborted) {
        setResults(data)
        setSearching(false)
      }
    }, 300)
  }, [])

  // ── Auto-detect via OCR ───────────────────────────────────────────────────
  async function handleDetect() {
    if (!videoRef.current || !canvasRef.current) return
    setDetecting(true)
    setDetectHint('Analyse de la carte…')
    setResults([])

    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d')!.drawImage(video, 0, 0)

    try {
      const cropped = cropNameArea(canvas)

      const { createWorker } = await import('tesseract.js')
      // Try French first, fall back to English if needed
      const worker = await createWorker('fra+eng')
      await (worker as any).setParameters({
        tessedit_pageseg_mode: '7',  // single line
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
          'àâäéèêëïîôöùûüÿçÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÇ -',
      })
      const { data } = await worker.recognize(cropped)
      await worker.terminate()

      const name = extractName(data.text)

      if (!name || name.length < 2) {
        setDetectHint("Nom non lisible — essayez de mieux centrer la carte et retaper.")
        setDetecting(false)
        return
      }

      setDetectHint(`Nom détecté : "${name}" — recherche…`)
      setQuery(name)
      setSearching(true)

      const found = await searchTCGdex(name)
      if (mountedRef.current) {
        setResults(found)
        setSearching(false)
        setDetectHint(found.length > 0 ? `${found.length} carte(s) trouvée(s)` : 'Aucune carte — affinez le nom')
      }
    } catch {
      if (mountedRef.current) {
        setDetectHint('Erreur OCR — utilisez la recherche manuelle.')
      }
    } finally {
      if (mountedRef.current) setDetecting(false)
    }
  }

  // ── Select a card → enrich with prices → fill form ───────────────────────
  async function selectCard(card: TCGdexCard) {
    if (loadingId === card.id) return
    setLoadingId(card.id)

    try {
      const priceCard = await fetchPrices(card.id)
      const rarity = RARITY_MAP[priceCard?.rarity ?? ''] ?? priceCard?.rarity ?? ''
      const price  = priceCard ? getBestPrice(priceCard) : ''

      onResult({
        pokemon_name:        card.name,
        card_number:         card.localId,
        extension:           card.set?.name ?? priceCard?.set?.name ?? '',
        rarity,
        expected_sale_price: price,
      })
      onClose()
    } finally {
      if (mountedRef.current) setLoadingId(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#111113] border border-zinc-800 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Camera size={15} className="text-emerald-400" />
            <span className="text-sm font-semibold text-white">Scanner une carte</span>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3">

            {cameraError ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Camera size={24} className="text-red-400" />
                </div>
                <p className="text-sm text-zinc-300 max-w-xs leading-relaxed">{cameraError}</p>
                <button
                  type="button" onClick={startCamera}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition-colors"
                >
                  <RefreshCw size={13} /> Réessayer
                </button>
              </div>
            ) : (
              <>
                {/* ── Viewfinder ── */}
                <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse 60% 90% at 50% 50%, transparent 60%, rgba(0,0,0,0.55) 100%)' }}
                  />

                  {/* Card frame */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative border-2 border-emerald-400/70 rounded-lg" style={{ width: '52%', aspectRatio: '5/7' }}>
                      {['top-0 left-0 border-t-2 border-l-2 rounded-tl', 'top-0 right-0 border-t-2 border-r-2 rounded-tr',
                        'bottom-0 left-0 border-b-2 border-l-2 rounded-bl', 'bottom-0 right-0 border-b-2 border-r-2 rounded-br'
                      ].map((cls) => (
                        <div key={cls} className={`absolute w-4 h-4 border-emerald-400 ${cls}`} style={{ margin: '-2px' }} />
                      ))}
                      {/* Name zone indicator */}
                      <div className="absolute top-0 left-0 right-0 h-[18%] bg-emerald-400/10 border-b border-emerald-400/30 rounded-t flex items-center justify-center">
                        <span className="text-[8px] text-emerald-400/70 font-semibold tracking-widest uppercase">Nom</span>
                      </div>
                    </div>
                  </div>

                  {detecting && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                      <Loader2 size={28} className="animate-spin text-emerald-400" />
                      <span className="text-xs text-white font-medium">Lecture du nom…</span>
                    </div>
                  )}
                </div>

                {/* ── Detect button ── */}
                <button
                  type="button"
                  onClick={handleDetect}
                  disabled={detecting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors"
                >
                  {detecting
                    ? <><Loader2 size={14} className="animate-spin" /> Détection…</>
                    : <><Zap size={14} /> Détecter automatiquement</>
                  }
                </button>

                {detectHint && (
                  <p className="text-center text-[11px] text-zinc-500">{detectHint}</p>
                )}

                {/* ── Separator ── */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-widest">ou recherche manuelle</span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>

                {/* ── Search bar ── */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder="Dracaufeu, Pikachu ex, Mewtwo…"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                    autoComplete="off" autoCorrect="off" spellCheck={false}
                  />
                  {searching && (
                    <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />
                  )}
                </div>

                {/* ── Results ── */}
                {results.length > 0 && (
                  <div className="rounded-xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800">
                    {results.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => selectCard(card)}
                        disabled={loadingId === card.id}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/60 text-left transition-colors active:scale-[0.99]"
                      >
                        <div className="w-8 h-[46px] rounded-md overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                          {card.image
                            ? <img src={`${card.image}/low.webp`} alt={card.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Camera size={10} className="text-zinc-700" /></div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">{card.name}</p>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                            {card.set?.id?.toUpperCase()} {card.localId}
                            {card.set?.name && <span className="text-zinc-700"> · {card.set.name}</span>}
                          </p>
                        </div>
                        {loadingId === card.id
                          ? <Loader2 size={13} className="animate-spin text-zinc-400 shrink-0" />
                          : <CheckCircle2 size={13} className="text-zinc-700 group-hover:text-emerald-400 shrink-0" />
                        }
                      </button>
                    ))}
                  </div>
                )}

                {!searching && query.trim() && results.length === 0 && (
                  <p className="text-center text-xs text-zinc-600 py-2">Aucune carte trouvée — essayez un autre nom</p>
                )}
              </>
            )}
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}
