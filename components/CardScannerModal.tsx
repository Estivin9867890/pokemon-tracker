'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Camera, X, Loader2, Search, RefreshCw } from 'lucide-react'
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

// ── TCGdex search ─────────────────────────────────────────────────────────────
async function searchTCGdex(query: string, signal?: AbortSignal): Promise<TCGdexCard[]> {
  if (!query.trim() || query.trim().length < 2) return []
  try {
    const res = await fetch(
      `https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(query.trim())}`,
      { signal },
    )
    if (!res.ok) return []
    const data = await res.json() as TCGdexCard[]
    return Array.isArray(data) ? data.slice(0, 20) : []
  } catch {
    return []
  }
}

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

// ── Crop the top-center of the canvas (card name zone) and scale up ───────────
function cropAndScale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const W = canvas.width
  const H = canvas.height
  // Center 50% width, top 22% height = where the Pokémon name appears
  const sx = Math.floor(W * 0.25)
  const sy = 0
  const sw = Math.floor(W * 0.50)
  const sh = Math.floor(H * 0.22)
  const SCALE = 4
  const out   = document.createElement('canvas')
  out.width   = sw * SCALE
  out.height  = sh * SCALE
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
  // Grayscale + contrast boost (works for both light and dark card backgrounds)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const boosted = Math.min(255, Math.max(0, (gray - 128) * 2.5 + 128))
    d[i] = d[i + 1] = d[i + 2] = boosted
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out
}

// ── Extract plausible Pokémon name from OCR output ────────────────────────────
function extractPokemonName(raw: string): string {
  const cleaned = raw
    .replace(/\r?\n/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Split into words, keep only alpha words ≥ 2 chars, take first 3 words max
  const words = cleaned.split(' ').filter((w) => w.length >= 2 && /[a-zA-ZÀ-ÿ]/.test(w))
  return words.slice(0, 3).join(' ')
}

// ── Component ─────────────────────────────────────────────────────────────────
type WorkerState = 'idle' | 'loading' | 'ready' | 'error'

export default function CardScannerModal({ open, onClose, onResult }: CardScannerModalProps) {
  const videoRef     = useRef<HTMLVideoElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const workerRef    = useRef<import('tesseract.js').Worker | null>(null)
  const scanInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const isScanningRef = useRef(false)
  const mountedRef   = useRef(false)
  const searchAbort  = useRef<AbortController | null>(null)
  const searchTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDetected = useRef('')

  const [cameraError, setCameraError] = useState('')
  const [workerState, setWorkerState] = useState<WorkerState>('idle')
  const [scanLabel, setScanLabel]     = useState('')     // what OCR is currently seeing
  const [results, setResults]         = useState<TCGdexCard[]>([])
  const [query, setQuery]             = useState('')
  const [searching, setSearching]     = useState(false)
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
      if (mountedRef.current) {
        setCameraError(
          n === 'NotAllowedError' ? "Accès caméra refusé — autorisez-le dans les réglages." :
          n === 'NotFoundError'   ? "Aucune caméra détectée." :
          "Impossible d'accéder à la caméra.",
        )
      }
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // ── Tesseract worker (init once per modal open) ───────────────────────────
  async function initWorker() {
    setWorkerState('loading')
    try {
      const { createWorker } = await import('tesseract.js')
      // Use English only — smaller download (~15MB), works for most Pokémon names
      // which are either identical (Pikachu, Mewtwo) or close enough to search
      const w = await createWorker('eng')
      await w.setParameters({
        tessedit_pageseg_mode: 7 as any,  // single line
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -',
      })
      if (!mountedRef.current) { await w.terminate(); return }
      workerRef.current = w
      setWorkerState('ready')
      startScanLoop()
    } catch {
      if (mountedRef.current) setWorkerState('error')
    }
  }

  // ── Continuous scan loop ──────────────────────────────────────────────────
  function startScanLoop() {
    if (scanInterval.current) clearInterval(scanInterval.current)
    scanInterval.current = setInterval(doScan, 2500)
    doScan() // run immediately
  }

  async function doScan() {
    if (isScanningRef.current || !workerRef.current || !videoRef.current || !canvasRef.current) return
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return

    isScanningRef.current = true
    try {
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)

      const cropped = cropAndScale(canvas)
      const { data } = await workerRef.current.recognize(cropped)
      const name     = extractPokemonName(data.text)

      if (!mountedRef.current) return

      if (name.length >= 3) {
        setScanLabel(name)
        // Only search if different from last detected name (avoid duplicate searches)
        if (name.toLowerCase() !== lastDetected.current.toLowerCase()) {
          lastDetected.current = name.toLowerCase()
          setQuery(name)
          triggerSearch(name)
        }
      } else {
        setScanLabel('')
      }
    } catch {
      // OCR error — silently continue
    } finally {
      isScanningRef.current = false
    }
  }

  function triggerSearch(q: string) {
    searchAbort.current?.abort()
    const ctrl = new AbortController()
    searchAbort.current = ctrl
    setSearching(true)
    searchTCGdex(q, ctrl.signal).then((res) => {
      if (mountedRef.current && !ctrl.signal.aborted) {
        setResults(res)
        setSearching(false)
      }
    }).catch(() => { if (mountedRef.current) setSearching(false) })
  }

  // ── Manual search ─────────────────────────────────────────────────────────
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchAbort.current?.abort()

    if (!q.trim()) { setResults([]); setSearching(false); return }
    setSearching(true)

    const ctrl = new AbortController()
    searchAbort.current = ctrl

    searchTimer.current = setTimeout(async () => {
      const data = await searchTCGdex(q, ctrl.signal)
      if (mountedRef.current && !ctrl.signal.aborted) {
        setResults(data)
        setSearching(false)
      }
    }, 300)
  }, [])

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      stopCamera()
      workerRef.current?.terminate()
      workerRef.current = null
      if (scanInterval.current) clearInterval(scanInterval.current)
      scanInterval.current = null
      return
    }

    mountedRef.current = true
    isScanningRef.current = false
    lastDetected.current = ''
    setWorkerState('idle')
    setScanLabel('')
    setResults([])
    setQuery('')
    setSearching(false)
    setLoadingId(null)

    startCamera()
    initWorker()

    return () => {
      mountedRef.current = false
      stopCamera()
      workerRef.current?.terminate()
      workerRef.current = null
      if (scanInterval.current) clearInterval(scanInterval.current)
      scanInterval.current = null
      searchAbort.current?.abort()
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [open])

  // ── Select card → fill form ───────────────────────────────────────────────
  async function selectCard(card: TCGdexCard) {
    if (loadingId === card.id) return
    setLoadingId(card.id)
    // Stop scanning while we fetch prices
    if (scanInterval.current) clearInterval(scanInterval.current)

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

  if (!open) return null

  const statusColor =
    workerState === 'ready'   ? 'text-emerald-400' :
    workerState === 'loading' ? 'text-amber-400' :
    workerState === 'error'   ? 'text-red-400' : 'text-zinc-500'

  const statusText =
    workerState === 'loading' ? 'Chargement du scanner (~15s)…' :
    workerState === 'error'   ? 'Scanner indisponible — utilisez la recherche' :
    workerState === 'ready' && scanLabel ? `Lu : "${scanLabel}"` :
    workerState === 'ready'   ? 'Scan automatique actif — pointez la carte' :
    ''

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#111113] border border-zinc-800 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '90dvh' }}>

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
                <button type="button" onClick={startCamera}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition-colors">
                  <RefreshCw size={13} /> Réessayer
                </button>
              </div>
            ) : (
              <>
                {/* ── Viewfinder ── */}
                <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse 60% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.6) 100%)' }}
                  />
                  {/* Card frame */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative border-2 border-dashed rounded-xl transition-colors duration-500"
                      style={{ width: '52%', aspectRatio: '5/7', borderColor: workerState === 'ready' ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.3)' }}>
                      {/* Solid corner marks */}
                      {['top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl',
                        'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl',
                        'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl',
                        'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl',
                      ].map((cls) => (
                        <div key={cls} className={`absolute w-5 h-5 transition-colors duration-500 ${cls}`}
                          style={{ borderColor: workerState === 'ready' ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.4)', margin: '-2px' }} />
                      ))}
                      {/* Name zone highlight */}
                      <div className="absolute top-0 inset-x-0 h-[16%] rounded-t-xl"
                        style={{ background: workerState === 'ready' ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
                          borderBottom: workerState === 'ready' ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)' }} />
                    </div>
                  </div>
                  {/* Status badge */}
                  {workerState === 'loading' && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full">
                      <Loader2 size={11} className="animate-spin text-amber-400" />
                      <span className="text-[10px] text-amber-300 font-medium whitespace-nowrap">Chargement scanner…</span>
                    </div>
                  )}
                  {workerState === 'ready' && scanLabel && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full border border-emerald-500/30">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] text-emerald-300 font-medium whitespace-nowrap">"{scanLabel}"</span>
                    </div>
                  )}
                  {workerState === 'ready' && !scanLabel && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] text-white/60 font-medium whitespace-nowrap">Scan actif</span>
                    </div>
                  )}
                </div>

                {/* Status line */}
                {statusText && (
                  <p className={`text-center text-[11px] font-medium ${statusColor}`}>{statusText}</p>
                )}

                {/* ── Separator ── */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-widest">
                    {workerState === 'ready' ? 'ou tapez le nom' : 'recherche manuelle'}
                  </span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>

                {/* ── Search bar ── */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder="Dracaufeu, Pikachu ex, Méga-Mewtwo…"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-8 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                    autoComplete="off" autoCorrect="off" spellCheck={false}
                  />
                  {(searching || loadingId) && (
                    <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />
                  )}
                </div>

                {/* ── Results ── */}
                {results.length > 0 && (
                  <div className="rounded-xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/70">
                    {results.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => selectCard(card)}
                        disabled={loadingId === card.id}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/50 text-left transition-colors active:scale-[0.99]"
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
                            {card.set?.id?.toUpperCase()} · {card.localId}
                            {card.set?.name && <span className="text-zinc-700"> · {card.set.name}</span>}
                          </p>
                        </div>
                        {loadingId === card.id
                          ? <Loader2 size={13} className="animate-spin text-zinc-400 shrink-0" />
                          : <span className="text-[10px] text-zinc-700 shrink-0">Choisir</span>
                        }
                      </button>
                    ))}
                  </div>
                )}

                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-center text-xs text-zinc-600 py-2">Aucune carte — essayez un autre nom</p>
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
