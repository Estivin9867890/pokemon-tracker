'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Plus, CheckCircle2, Loader2, Camera, Minus, Search } from 'lucide-react'
import { ItemFormData } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface DetectedCard {
  uid: string; apiId: string; name: string; nameFR: string
  number: string; setName: string; setCode: string
  rarityFR: string; imageUrl: string; marketPrice: string; cmTrend: string
}

interface TCGdexCard {
  id: string; localId: string; name: string
  image?: string; set?: { id: string; name: string }
}

interface ApiCard {
  id: string; name: string; number: string
  set?: { name: string; ptcgoCode?: string }
  rarity?: string
  images?: { small: string; large: string }
  cardmarket?: { prices?: { trendPrice?: number; averageSellPrice?: number } }
  tcgplayer?: { prices?: Record<string, { market?: number }> }
}

interface Props {
  open: boolean
  onClose: () => void
  onQuickAdd: (data: ItemFormData) => Promise<void>
  defaultVintedFees?: number
}

// ── Constants ──────────────────────────────────────────────────────────────────
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

const ZOOM_DEFAULT = 1.5
const ZOOM_MIN     = 1.0
const ZOOM_MAX     = 4.0
const ZOOM_STEP    = 0.5

// ── Helpers ────────────────────────────────────────────────────────────────────
function getCMTrend(c: ApiCard) { return c.cardmarket?.prices?.trendPrice?.toFixed(2) ?? '' }
function getMarketPrice(c: ApiCard) {
  const cm = c.cardmarket?.prices?.averageSellPrice
  if (cm != null) return cm.toFixed(2)
  if (c.tcgplayer?.prices) for (const t of Object.values(c.tcgplayer.prices)) if (t?.market != null) return t.market.toFixed(2)
  return ''
}

async function searchTCGdex(query: string, signal?: AbortSignal): Promise<TCGdexCard[]> {
  if (!query.trim() || query.trim().length < 2) return []
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(query.trim())}`, { signal })
    if (!res.ok) return []
    const d = await res.json() as TCGdexCard[]
    return Array.isArray(d) ? d.slice(0, 20) : []
  } catch { return [] }
}

async function fetchPricesForTCGdexCard(tcgId: string): Promise<ApiCard | null> {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${tcgId}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const j = await res.json() as { data: ApiCard }
    return j.data ?? null
  } catch { return null }
}

function cropAndScale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const W = canvas.width, H = canvas.height
  const sx = Math.floor(W * 0.25), sy = 0, sw = Math.floor(W * 0.50), sh = Math.floor(H * 0.22)
  const SCALE = 4
  const out = document.createElement('canvas')
  out.width = sw * SCALE; out.height = sh * SCALE
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
  const img = ctx.getImageData(0, 0, out.width, out.height), d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]
    const v = Math.min(255, Math.max(0, (g - 128) * 2.5 + 128))
    d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out
}

function extractName(raw: string): string {
  return raw.replace(/\r?\n/g, ' ').replace(/[^a-zA-ZÀ-ÿ\s\-]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .split(' ').filter((w) => w.length >= 2 && /[a-zA-ZÀ-ÿ]/.test(w)).slice(0, 3).join(' ')
}

// ── Component ──────────────────────────────────────────────────────────────────
type WorkerState = 'idle' | 'loading' | 'ready' | 'error'

export default function CardScannerLive({ open, onClose, onQuickAdd, defaultVintedFees = 0 }: Props) {
  const videoRef      = useRef<HTMLVideoElement>(null)
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const workerRef     = useRef<import('tesseract.js').Worker | null>(null)
  const scanInterval  = useRef<ReturnType<typeof setInterval> | null>(null)
  const isScanRef     = useRef(false)
  const mountedRef    = useRef(false)
  const zoomRef       = useRef(ZOOM_DEFAULT)
  const nativeZoomRef = useRef(false)
  const searchTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchAbort   = useRef<AbortController | null>(null)
  const lastOcrName   = useRef('')
  const savedUidsRef  = useRef<Set<string>>(new Set())

  const [zoom, setZoom]               = useState(ZOOM_DEFAULT)
  const [workerState, setWorkerState] = useState<WorkerState>('idle')
  const [scanLabel, setScanLabel]     = useState('')
  const [query, setQuery]             = useState('')
  const [searching, setSearching]     = useState(false)
  const [searchResults, setSearchResults] = useState<TCGdexCard[]>([])
  const [detectedCards, setDetectedCards] = useState<DetectedCard[]>([])
  const [loadingCard, setLoadingCard] = useState<string | null>(null)
  const [quickAddCard, setQuickAddCard] = useState<DetectedCard | null>(null)
  const [quickPrice, setQuickPrice]   = useState('')
  const [quickLocation, setQuickLocation] = useState<'CELIAN' | 'ROMAIN'>('CELIAN')
  const [saving, setSaving]           = useState(false)
  const [savedUids, setSavedUids]     = useState<Set<string>>(new Set())

  // ── Camera ─────────────────────────────────────────────────────────────────
  async function applyZoom(val: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(val / ZOOM_STEP) * ZOOM_STEP))
    setZoom(clamped); zoomRef.current = clamped
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const cap = (track as any).getCapabilities?.() ?? {}
      if (cap.zoom) {
        await track.applyConstraints({ advanced: [{ zoom: Math.min(clamped, cap.zoom.max ?? clamped) }] } as any)
        nativeZoomRef.current = true; return
      }
    } catch {}
    nativeZoomRef.current = false
  }

  // ── Tesseract worker ────────────────────────────────────────────────────────
  async function initWorker() {
    setWorkerState('loading')
    try {
      const { createWorker } = await import('tesseract.js')
      const w = await createWorker('eng')
      await w.setParameters({
        tessedit_pageseg_mode: 7 as any,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -',
      })
      if (!mountedRef.current) { await w.terminate(); return }
      workerRef.current = w
      setWorkerState('ready')
      startScanLoop()
    } catch { if (mountedRef.current) setWorkerState('error') }
  }

  // ── Continuous scan ─────────────────────────────────────────────────────────
  function startScanLoop() {
    if (scanInterval.current) clearInterval(scanInterval.current)
    scanInterval.current = setInterval(doScan, 2500)
    doScan()
  }

  async function doScan() {
    if (isScanRef.current || !workerRef.current || !videoRef.current || !canvasRef.current) return
    const video = videoRef.current, canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return
    isScanRef.current = true
    try {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      // Apply digital zoom crop if using CSS zoom
      const ctx = canvas.getContext('2d')!
      if (!nativeZoomRef.current && zoomRef.current > 1) {
        const z = zoomRef.current
        const cw = Math.floor(video.videoWidth / z), ch = Math.floor(video.videoHeight / z)
        const cx = Math.floor((video.videoWidth - cw) / 2), cy = Math.floor((video.videoHeight - ch) / 2)
        canvas.width = cw; canvas.height = ch
        ctx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch)
      } else {
        ctx.drawImage(video, 0, 0)
      }
      const cropped = cropAndScale(canvas)
      const { data } = await workerRef.current.recognize(cropped)
      const name = extractName(data.text)
      if (!mountedRef.current) return
      if (name.length >= 3) {
        setScanLabel(name)
        if (name.toLowerCase() !== lastOcrName.current.toLowerCase()) {
          lastOcrName.current = name.toLowerCase()
          setQuery(name)
          triggerSearch(name)
        }
      } else {
        setScanLabel('')
      }
    } catch { /* silent */ }
    finally { isScanRef.current = false }
  }

  function triggerSearch(q: string) {
    searchAbort.current?.abort()
    const ctrl = new AbortController(); searchAbort.current = ctrl
    setSearching(true)
    searchTCGdex(q, ctrl.signal).then((res) => {
      if (mountedRef.current && !ctrl.signal.aborted) { setSearchResults(res); setSearching(false) }
    }).catch(() => { if (mountedRef.current) setSearching(false) })
  }

  // ── Manual search ───────────────────────────────────────────────────────────
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchAbort.current?.abort()
    if (!q.trim()) { setSearchResults([]); setSearching(false); return }
    setSearching(true)
    const ctrl = new AbortController(); searchAbort.current = ctrl
    searchTimer.current = setTimeout(async () => {
      const data = await searchTCGdex(q, ctrl.signal)
      if (mountedRef.current && !ctrl.signal.aborted) { setSearchResults(data); setSearching(false) }
    }, 350)
  }, [])

  // ── Select result → add to detected list ────────────────────────────────────
  async function selectResult(tcgCard: TCGdexCard) {
    if (loadingCard === tcgCard.id) return
    setLoadingCard(tcgCard.id)
    try {
      const apiCard = await fetchPricesForTCGdexCard(tcgCard.id)
      const card: DetectedCard = {
        uid: `${tcgCard.id}-${Date.now()}`, apiId: tcgCard.id,
        name: apiCard?.name ?? tcgCard.name, nameFR: tcgCard.name,
        number: tcgCard.localId, setName: tcgCard.set?.name ?? apiCard?.set?.name ?? '',
        setCode: apiCard?.set?.ptcgoCode ?? tcgCard.set?.id?.toUpperCase() ?? '',
        rarityFR: RARITY_MAP[apiCard?.rarity ?? ''] ?? apiCard?.rarity ?? '',
        imageUrl: apiCard?.images?.small ?? (tcgCard.image ? `${tcgCard.image}/low.webp` : ''),
        marketPrice: apiCard ? getMarketPrice(apiCard) : '', cmTrend: apiCard ? getCMTrend(apiCard) : '',
      }
      if (mountedRef.current) {
        setDetectedCards((prev) => prev.some((c) => c.apiId === card.apiId) ? prev : [card, ...prev])
        setQuery(''); setSearchResults([])
      }
    } finally { if (mountedRef.current) setLoadingCard(null) }
  }

  // ── Quick-add ───────────────────────────────────────────────────────────────
  async function handleQuickSave() {
    if (!quickAddCard) return
    setSaving(true)
    const price = quickPrice || quickAddCard.cmTrend || quickAddCard.marketPrice
    const formData: ItemFormData = {
      item_name: quickAddCard.nameFR || quickAddCard.name, purchase_price: price,
      vinted_fees: String(defaultVintedFees), expected_sale_price: quickAddCard.cmTrend || quickAddCard.marketPrice,
      location: quickLocation === 'CELIAN' ? 'Chez Célian' : 'Chez Romain', notes: '',
      pokemon_name: quickAddCard.nameFR || quickAddCard.name, card_number: quickAddCard.number,
      extension: quickAddCard.setName, rarity: quickAddCard.rarityFR,
      pokemon_category: 'SINGLE', poke_location: quickLocation,
      is_graded: false, grading_company: '', grading_note: '',
      is_lot: false, lot_total_cost: '', nb_articles: '', funded_by: null, hits: [],
    }
    try {
      await onQuickAdd(formData)
      const uid = quickAddCard.uid
      setSavedUids((prev) => { const n = new Set([...prev, uid]); savedUidsRef.current = n; return n })
      setQuickAddCard(null); setQuickPrice('')
    } finally { setSaving(false) }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
      workerRef.current?.terminate(); workerRef.current = null
      if (scanInterval.current) clearInterval(scanInterval.current); scanInterval.current = null
      return
    }
    mountedRef.current = true
    isScanRef.current = false; lastOcrName.current = ''
    setWorkerState('idle'); setScanLabel(''); setQuery(''); setSearchResults([])
    setDetectedCards([]); setQuickAddCard(null); setSavedUids(new Set()); savedUidsRef.current = new Set()
    setZoom(ZOOM_DEFAULT); zoomRef.current = ZOOM_DEFAULT; nativeZoomRef.current = false

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    }).then((stream) => {
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      const track = stream.getVideoTracks()[0]
      const cap = (track as any).getCapabilities?.() ?? {}
      if (cap.zoom) { nativeZoomRef.current = true; track.applyConstraints({ advanced: [{ zoom: ZOOM_DEFAULT }] } as any).catch(() => {}) }
    }).catch(() => { /* camera error handled by missing video */ })

    initWorker()

    return () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
      workerRef.current?.terminate(); workerRef.current = null
      if (scanInterval.current) clearInterval(scanInterval.current); scanInterval.current = null
      searchAbort.current?.abort()
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [open])

  if (!open) return null

  const cssZoom = !nativeZoomRef.current && zoom > 1 ? { transform: `scale(${zoom})`, transformOrigin: 'center center' } as React.CSSProperties : {}
  const zoomDots = Array.from({ length: Math.round((ZOOM_MAX - ZOOM_MIN) / ZOOM_STEP) + 1 }, (_, i) => ZOOM_MAX - i * ZOOM_STEP)

  const frameColor = workerState === 'ready' ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.3)'
  const cornerColor = workerState === 'ready' ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.4)'

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black select-none">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 h-12 bg-black/90 backdrop-blur border-b border-white/5 z-10">
        <div className="flex items-center gap-2">
          <Camera size={13} className="text-white/50" />
          <span className="text-sm font-bold text-white tracking-wide">Scanner</span>
          {detectedCards.length > 0 && (
            <span className="ml-1 text-[10px] text-white/35 font-medium">· {detectedCards.length} carte{detectedCards.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Camera */}
      <div className="flex-1 relative min-h-0 bg-black overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted
          className="w-full h-full object-cover transition-transform duration-300" style={cssZoom} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 72% at 50% 44%, transparent 28%, rgba(0,0,0,0.6) 100%)' }} />

        {/* Card frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: '70%', aspectRatio: '5/7' }}>
            <div className="absolute inset-0 rounded-2xl border-2 border-dashed" style={{ borderColor: frameColor }} />
            {['top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl', 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl',
              'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl', 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl',
            ].map((cls) => (
              <div key={cls} className={`absolute w-7 h-7 ${cls}`} style={{ borderColor: cornerColor, margin: '-2px' }} />
            ))}
            {/* Name zone */}
            <div className="absolute top-0 inset-x-0 h-[16%] rounded-t-2xl"
              style={{ background: workerState === 'ready' ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)',
                borderBottom: `1px solid ${workerState === 'ready' ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.1)'}` }} />
          </div>
        </div>

        {/* Scan status badge */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          {workerState === 'loading' && (
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full">
              <Loader2 size={10} className="animate-spin text-amber-400" />
              <span className="text-[10px] text-amber-300 font-medium whitespace-nowrap">Chargement scanner (~15s)…</span>
            </div>
          )}
          {workerState === 'ready' && scanLabel && (
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full border border-emerald-500/30">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-300 font-medium whitespace-nowrap">"{scanLabel}"</span>
            </div>
          )}
          {workerState === 'ready' && !scanLabel && (
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-white/60 font-medium whitespace-nowrap">Scan actif — pointez la carte</span>
            </div>
          )}
        </div>

        {/* Zoom controls */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 z-10">
          <button type="button" onClick={() => applyZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}
            className="w-9 h-9 rounded-full bg-black/60 border border-white/18 text-white flex items-center justify-center disabled:opacity-25 backdrop-blur-sm active:scale-95 transition-transform">
            <Plus size={15} />
          </button>
          <div className="flex flex-col items-center gap-[5px] py-0.5">
            {zoomDots.map((v) => (
              <button key={v} type="button" onClick={() => applyZoom(v)}
                className={`rounded-full transition-all ${Math.abs(zoom - v) < 0.01 ? 'w-2.5 h-2.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]' : 'w-1.5 h-1.5 bg-white/28 hover:bg-white/55'}`} />
            ))}
          </div>
          <span className="text-[10px] font-bold text-white/65 font-mono bg-black/55 px-1.5 py-0.5 rounded-md backdrop-blur-sm">×{zoom.toFixed(1)}</span>
          <button type="button" onClick={() => applyZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}
            className="w-9 h-9 rounded-full bg-black/60 border border-white/18 text-white flex items-center justify-center disabled:opacity-25 backdrop-blur-sm active:scale-95 transition-transform">
            <Minus size={15} />
          </button>
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="shrink-0 bg-[#080809] border-t border-white/6 flex flex-col relative" style={{ height: 300 }}>

        {/* Search bar */}
        <div className="px-4 pt-3 pb-2 border-b border-white/5 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
            <input type="text" value={query} onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Nom de la carte (Dracaufeu, Pikachu ex…)"
              className="w-full bg-white/6 border border-white/10 rounded-xl pl-8 pr-8 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/28 transition-colors"
              autoComplete="off" autoCorrect="off" spellCheck={false} />
            {(searching || loadingCard) && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/35" />}
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div className="mt-2 bg-[#0d0d10] border border-white/8 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
              <div className="divide-y divide-white/4">
                {searchResults.map((c) => (
                  <button key={c.id} type="button" onClick={() => selectResult(c)} disabled={loadingCard === c.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/6 text-left transition-colors">
                    <div className="w-7 h-10 rounded-md overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                      {c.image ? <img src={`${c.image}/low.webp`} alt={c.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Camera size={10} className="text-white/20" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate">{c.name}</p>
                      <p className="text-[10px] text-white/35 font-mono mt-0.5">{c.set?.id?.toUpperCase()} {c.localId}</p>
                    </div>
                    {loadingCard === c.id ? <Loader2 size={13} className="animate-spin text-white/40 shrink-0" />
                      : <Plus size={13} className="text-white/40 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detected cards */}
        <div className="flex-1 overflow-y-auto">
          {detectedCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[11px] text-white/25 leading-relaxed">
                {workerState === 'loading' ? 'Chargement scanner (~15s la première fois)…' :
                 workerState === 'ready' ? 'Pointez la carte dans le cadre ou tapez son nom' :
                 'Tapez le nom d\'une carte pour la trouver'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/4">
              {detectedCards.map((card) => {
                const isSaved = savedUids.has(card.uid)
                const price   = card.cmTrend || card.marketPrice
                return (
                  <div key={card.uid} className={`flex items-center gap-3 px-4 py-2.5 ${isSaved ? 'bg-emerald-500/4' : ''}`}>
                    <div className="w-9 h-[52px] rounded-lg overflow-hidden bg-zinc-900/80 border border-white/6 shrink-0">
                      {card.imageUrl ? <img src={card.imageUrl} alt={card.nameFR || card.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Camera size={12} className="text-white/15" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate leading-tight ${isSaved ? 'text-emerald-400' : 'text-white'}`}>{card.nameFR || card.name}</p>
                      <p className="text-[10px] text-white/35 mt-0.5 font-mono">{card.setCode} {card.number}</p>
                    </div>
                    <span className={`text-[13px] font-bold shrink-0 ${price ? 'text-emerald-400' : 'text-white/20'}`}>{price ? `${price}€` : '—'}</span>
                    {isSaved ? (
                      <div className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-500/12 shrink-0"><CheckCircle2 size={14} className="text-emerald-400" /></div>
                    ) : (
                      <button type="button" onClick={() => { setQuickAddCard(card); setQuickPrice(card.cmTrend || card.marketPrice); setQuickLocation('CELIAN') }}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black hover:bg-white/90 active:scale-95 transition-all shrink-0">
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick-add panel */}
        {quickAddCard && (
          <div className="absolute inset-0 bg-[#0d0d10] border-t border-white/6 flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
              <span className="text-xs font-bold text-white">Ajouter au stock</span>
              <button type="button" onClick={() => setQuickAddCard(null)} className="text-white/35 hover:text-white transition-colors"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-[56px] rounded-lg overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                  {quickAddCard.imageUrl && <img src={quickAddCard.imageUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{quickAddCard.nameFR || quickAddCard.name}</p>
                  <p className="text-[10px] text-white/35 mt-0.5 font-mono">{quickAddCard.setCode} {quickAddCard.number}</p>
                  <p className="text-[10px] text-white/25">{quickAddCard.rarityFR}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-white/35">Prix d&apos;achat</label>
                <div className="relative">
                  <input type="number" step="0.01" min="0"
                    placeholder={quickAddCard.cmTrend || quickAddCard.marketPrice || '0.00'}
                    value={quickPrice} onChange={(e) => setQuickPrice(e.target.value)} autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-8 text-sm text-white placeholder-white/18 focus:outline-none focus:border-white/28 transition-colors" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/28">€</span>
                </div>
                {(quickAddCard.cmTrend || quickAddCard.marketPrice) && (
                  <button type="button" onClick={() => setQuickPrice(quickAddCard.cmTrend || quickAddCard.marketPrice)}
                    className="text-[11px] text-left text-white/28 hover:text-emerald-400 transition-colors">
                    CM Trend : <span className="text-emerald-400 font-semibold">{quickAddCard.cmTrend || quickAddCard.marketPrice}€</span>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {(['CELIAN', 'ROMAIN'] as const).map((loc) => (
                  <button key={loc} type="button" onClick={() => setQuickLocation(loc)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${quickLocation === loc ? 'bg-white/10 border-white/25 text-white' : 'border-white/6 text-white/28 hover:text-white/55'}`}>
                    {loc === 'CELIAN' ? 'Célian' : 'Romain'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 px-4 pb-4 pt-2 shrink-0">
              <button type="button" onClick={() => setQuickAddCard(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/8 text-sm text-white/35 hover:text-white transition-colors">Retour</button>
              <button type="button" onClick={handleQuickSave}
                disabled={saving || (!quickPrice && !quickAddCard.cmTrend && !quickAddCard.marketPrice)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-white/92 disabled:opacity-35 active:scale-[0.98] transition-all">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Ajouter
              </button>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
