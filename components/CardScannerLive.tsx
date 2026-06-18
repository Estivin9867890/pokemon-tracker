'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Plus, CheckCircle2, Loader2, Camera, Minus, Search, ScanLine } from 'lucide-react'
import { ItemFormData } from '@/types'

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
const ZOOM_MAX     = 3.0
const ZOOM_STEP    = 0.5

// ── Helpers ──────────────────────────────────────────────────────────────────
function getCMTrend(c: ApiCard) { return c.cardmarket?.prices?.trendPrice?.toFixed(2) ?? '' }
function getMarketPrice(c: ApiCard) {
  const cm = c.cardmarket?.prices?.averageSellPrice
  if (cm != null) return cm.toFixed(2)
  if (c.tcgplayer?.prices) for (const t of Object.values(c.tcgplayer.prices)) if (t?.market != null) return t.market.toFixed(2)
  return ''
}

async function searchTCGdex(query: string, signal?: AbortSignal): Promise<TCGdexCard[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(q)}`, { signal })
    if (!res.ok) return []
    const d = await res.json() as TCGdexCard[]
    return Array.isArray(d) ? d.slice(0, 20) : []
  } catch { return [] }
}

async function fetchPrices(tcgId: string): Promise<ApiCard | null> {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${tcgId}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const j = await res.json() as { data: ApiCard }
    return j.data ?? null
  } catch { return null }
}

// ── OCR: crop the Pokémon name band (y: 6-18% of frame, center 55% width) ────
// The name is BELOW the card type badge (BASE/Stage) and ABOVE the artwork.
// On cards that fill the frame, this corresponds to roughly 8-18% of video height.
// We skip y=0-6% to avoid reading the card-type badge and HP counter.
function cropNameBand(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const W = canvas.width, H = canvas.height
  const sx = Math.floor(W * 0.22)
  const sy = Math.floor(H * 0.06)   // skip top 6% (card type badge area)
  const sw = Math.floor(W * 0.56)
  const sh = Math.floor(H * 0.13)   // read 6-19% height band
  const SCALE = 5
  const out = document.createElement('canvas')
  out.width = sw * SCALE; out.height = sh * SCALE
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
  const img = ctx.getImageData(0, 0, out.width, out.height), d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = Math.min(255, Math.max(0, (g - 128) * 2.8 + 128))
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out
}

// ── Filter OCR output: keep only plausible Pokémon names ─────────────────────
// Rejects: lines that are mostly numbers, HP values ("PV 70"), type badges ("BASE", "STADE")
const JUNK_WORDS = new Set(['base', 'stade', 'stade1', 'stade2', 'ex', 'gx', 'v', 'vmax', 'vstar', 'pv', 'hp', 'evolution', 'de'])

function filterOcrResult(raw: string): string {
  const line = raw.replace(/\r?\n/g, ' ').replace(/[^a-zA-ZÀ-ÿ\s\-]/g, ' ').replace(/\s+/g, ' ').trim()
  const words = line.split(' ').filter((w) => {
    if (w.length < 2) return false
    if (!/[a-zA-ZÀ-ÿ]/.test(w)) return false
    if (JUNK_WORDS.has(w.toLowerCase())) return false
    return true
  })
  // Take up to first 3 words; must be ≥ 3 chars total
  const result = words.slice(0, 3).join(' ')
  return result.length >= 3 ? result : ''
}

// ── Component ─────────────────────────────────────────────────────────────────
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
  const inputRef      = useRef<HTMLInputElement>(null)

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

  // ── Camera ──────────────────────────────────────────────────────────────────
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
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -À-ÿ',
      })
      if (!mountedRef.current) { await w.terminate(); return }
      workerRef.current = w
      setWorkerState('ready')
      startScanLoop()
    } catch { if (mountedRef.current) setWorkerState('error') }
  }

  function startScanLoop() {
    if (scanInterval.current) clearInterval(scanInterval.current)
    scanInterval.current = setInterval(doScan, 2800)
    doScan()
  }

  async function doScan() {
    if (isScanRef.current || !workerRef.current || !videoRef.current || !canvasRef.current) return
    const video = videoRef.current, canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return
    isScanRef.current = true
    try {
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
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
      const cropped = cropNameBand(canvas)
      const { data } = await workerRef.current.recognize(cropped)
      const name = filterOcrResult(data.text)
      if (!mountedRef.current) return
      if (name) {
        setScanLabel(name)
        if (name.toLowerCase() !== lastOcrName.current) {
          lastOcrName.current = name.toLowerCase()
          setQuery(name)
          triggerSearch(name)
        }
      } else {
        setScanLabel('')
      }
    } catch { /* silent */ } finally { isScanRef.current = false }
  }

  function triggerSearch(q: string) {
    searchAbort.current?.abort()
    const ctrl = new AbortController(); searchAbort.current = ctrl
    setSearching(true)
    searchTCGdex(q, ctrl.signal).then((res) => {
      if (mountedRef.current && !ctrl.signal.aborted) { setSearchResults(res); setSearching(false) }
    }).catch(() => { if (mountedRef.current) setSearching(false) })
  }

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

  async function selectResult(tcgCard: TCGdexCard) {
    if (loadingCard === tcgCard.id) return
    setLoadingCard(tcgCard.id)
    try {
      const apiCard = await fetchPrices(tcgCard.id)
      const card: DetectedCard = {
        uid: `${tcgCard.id}-${Date.now()}`, apiId: tcgCard.id,
        name: apiCard?.name ?? tcgCard.name, nameFR: tcgCard.name,
        number: tcgCard.localId, setName: tcgCard.set?.name ?? apiCard?.set?.name ?? '',
        setCode: apiCard?.set?.ptcgoCode ?? tcgCard.set?.id?.toUpperCase() ?? '',
        rarityFR: RARITY_MAP[apiCard?.rarity ?? ''] ?? apiCard?.rarity ?? '',
        imageUrl: apiCard?.images?.small ?? (tcgCard.image ? `${tcgCard.image}/low.webp` : ''),
        marketPrice: apiCard ? getMarketPrice(apiCard) : '',
        cmTrend: apiCard ? getCMTrend(apiCard) : '',
      }
      if (mountedRef.current) {
        setDetectedCards((prev) => prev.some((c) => c.apiId === card.apiId) ? prev : [card, ...prev])
        setQuery(''); setSearchResults([])
      }
    } finally { if (mountedRef.current) setLoadingCard(null) }
  }

  async function handleQuickSave() {
    if (!quickAddCard) return
    setSaving(true)
    const price = quickPrice || quickAddCard.cmTrend || quickAddCard.marketPrice
    try {
      await onQuickAdd({
        item_name: quickAddCard.nameFR || quickAddCard.name, purchase_price: price,
        vinted_fees: String(defaultVintedFees),
        expected_sale_price: quickAddCard.cmTrend || quickAddCard.marketPrice,
        location: quickLocation === 'CELIAN' ? 'Chez Célian' : 'Chez Romain', notes: '',
        pokemon_name: quickAddCard.nameFR || quickAddCard.name,
        card_number: quickAddCard.number, extension: quickAddCard.setName,
        rarity: quickAddCard.rarityFR, pokemon_category: 'SINGLE', poke_location: quickLocation,
        is_graded: false, grading_company: '', grading_note: '',
        is_lot: false, lot_total_cost: '', nb_articles: '', funded_by: null, hits: [],
      })
      const uid = quickAddCard.uid
      setSavedUids((prev) => { const n = new Set([...prev, uid]); savedUidsRef.current = n; return n })
      setQuickAddCard(null); setQuickPrice('')
    } finally { setSaving(false) }
  }

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
      if (cap.zoom) {
        nativeZoomRef.current = true
        track.applyConstraints({ advanced: [{ zoom: ZOOM_DEFAULT }] } as any).catch(() => {})
      }
    }).catch(() => {})

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

  const cssZoom = !nativeZoomRef.current && zoom > 1
    ? { transform: `scale(${zoom})`, transformOrigin: 'center center' } as React.CSSProperties
    : {}

  const isReady   = workerState === 'ready'
  const frameColor = isReady ? 'rgba(52,211,153,0.75)' : 'rgba(255,255,255,0.3)'

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0a0a0a]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-5 h-14 bg-[#0a0a0a] border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <ScanLine size={16} className={isReady ? 'text-emerald-400' : 'text-white/40'} />
          <span className="text-[15px] font-bold text-white tracking-tight">Scanner</span>
          {detectedCards.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] text-emerald-400 font-bold">
              {detectedCards.length}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/6 text-white/60 hover:text-white hover:bg-white/12 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* ── Camera — fixed height, mobile optimised ── */}
      <div className="shrink-0 relative bg-black overflow-hidden" style={{ height: '42vh' }}>
        <video ref={videoRef} autoPlay playsInline muted
          className="w-full h-full object-cover" style={cssZoom} />

        {/* Subtle vignette */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 65% 80% at 50% 50%, transparent 35%, rgba(0,0,0,0.55) 100%)' }} />

        {/* Card frame — 58% width, centered */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: '58%', aspectRatio: '5/7' }}>
            <div className="absolute inset-0 rounded-xl" style={{ border: `2px dashed ${frameColor}` }} />
            {[
              'top-0 left-0 rounded-tl-xl border-t-[3px] border-l-[3px]',
              'top-0 right-0 rounded-tr-xl border-t-[3px] border-r-[3px]',
              'bottom-0 left-0 rounded-bl-xl border-b-[3px] border-l-[3px]',
              'bottom-0 right-0 rounded-br-xl border-b-[3px] border-r-[3px]',
            ].map((cls) => (
              <div key={cls} className={`absolute w-6 h-6 ${cls}`}
                style={{ borderColor: frameColor, margin: '-2px' }} />
            ))}
            {/* Name zone highlight — where the OCR reads */}
            <div className="absolute inset-x-0 rounded-t-xl"
              style={{
                top: '6%', height: '13%',
                background: isReady ? 'rgba(52,211,153,0.08)' : 'transparent',
                borderTop: isReady ? '1px dashed rgba(52,211,153,0.4)' : 'none',
                borderBottom: isReady ? '1px dashed rgba(52,211,153,0.4)' : 'none',
              }} />
          </div>
        </div>

        {/* Scan state badge — top center */}
        <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
          {workerState === 'loading' && (
            <div className="flex items-center gap-2 bg-black/65 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-amber-500/20">
              <Loader2 size={10} className="animate-spin text-amber-400" />
              <span className="text-[11px] text-amber-300 font-semibold">Chargement scanner…</span>
            </div>
          )}
          {isReady && scanLabel && (
            <div className="flex items-center gap-2 bg-black/65 backdrop-blur-sm px-3.5 py-1.5 rounded-full border border-emerald-500/25">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-[11px] text-emerald-300 font-semibold max-w-[200px] truncate">"{scanLabel}"</span>
            </div>
          )}
          {isReady && !scanLabel && (
            <div className="flex items-center gap-2 bg-black/65 backdrop-blur-sm px-3.5 py-1.5 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-[11px] text-white/50 font-medium">Scan actif</span>
            </div>
          )}
        </div>

        {/* Zoom controls — right side, compact */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
          <button type="button" onClick={() => applyZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}
            className="w-8 h-8 rounded-full bg-black/55 border border-white/15 text-white flex items-center justify-center disabled:opacity-20 active:scale-90 transition-transform">
            <Plus size={14} />
          </button>
          <span className="text-[10px] font-bold text-white/55 font-mono bg-black/55 px-1.5 py-0.5 rounded-md">
            ×{zoom.toFixed(1)}
          </span>
          <button type="button" onClick={() => applyZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}
            className="w-8 h-8 rounded-full bg-black/55 border border-white/15 text-white flex items-center justify-center disabled:opacity-20 active:scale-90 transition-transform">
            <Minus size={14} />
          </button>
        </div>
      </div>

      {/* ── Bottom panel — search + results ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#0e0e10]">

        {/* Search bar */}
        <div className="shrink-0 px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              ref={inputRef}
              type="text" value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Chipie, Dracaufeu ex, Pikachu…"
              className="w-full bg-white/7 border border-white/10 rounded-2xl pl-9 pr-9 py-3.5 text-[15px] text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/40 focus:bg-white/9 transition-all"
              autoComplete="off" autoCorrect="off" spellCheck={false}
            />
            {query ? (
              <button type="button" onClick={() => { setQuery(''); setSearchResults([]) }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors p-1">
                <X size={13} />
              </button>
            ) : (searching || loadingCard) ? (
              <Loader2 size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-white/30" />
            ) : null}
          </div>
        </div>

        {/* Results or detected cards — scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="px-4 pb-2 space-y-1">
              <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest px-1 pb-1">
                {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''} — appuyez pour ajouter
              </p>
              {searchResults.map((c) => (
                <button key={c.id} type="button" onClick={() => selectResult(c)} disabled={loadingCard === c.id}
                  className="w-full flex items-center gap-3.5 px-3.5 py-3 bg-white/4 hover:bg-white/8 active:bg-white/12 rounded-2xl border border-white/6 text-left transition-colors active:scale-[0.99]">
                  <div className="w-10 h-[56px] rounded-xl overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                    {c.image
                      ? <img src={`${c.image}/low.webp`} alt={c.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Camera size={11} className="text-white/15" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-white truncate leading-tight">{c.name}</p>
                    <p className="text-[11px] text-white/35 font-mono mt-0.5">{c.set?.id?.toUpperCase()} · {c.localId}</p>
                    {c.set?.name && <p className="text-[10px] text-white/20 mt-0.5 truncate">{c.set.name}</p>}
                  </div>
                  {loadingCard === c.id
                    ? <Loader2 size={16} className="animate-spin text-white/35 shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center shrink-0"><Plus size={14} className="text-white/60" /></div>}
                </button>
              ))}
            </div>
          )}

          {/* No results hint */}
          {!searching && query.trim().length >= 2 && searchResults.length === 0 && (
            <p className="text-center text-[12px] text-white/25 py-6 px-8">
              Aucune carte pour « {query} »<br />
              <span className="text-white/15">Vérifiez l'orthographe du nom français</span>
            </p>
          )}

          {/* Detected cards (added to list, not yet quick-added) */}
          {detectedCards.length > 0 && searchResults.length === 0 && (
            <div className="px-4 pb-4 space-y-1">
              <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest px-1 pb-1">
                Cartes en attente ({detectedCards.length})
              </p>
              {detectedCards.map((card) => {
                const isSaved = savedUids.has(card.uid)
                const price   = card.cmTrend || card.marketPrice
                return (
                  <div key={card.uid}
                    className={`flex items-center gap-3.5 px-3.5 py-3 rounded-2xl border transition-colors ${isSaved ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-white/4 border-white/6'}`}>
                    <div className="w-10 h-[56px] rounded-xl overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                      {card.imageUrl
                        ? <img src={card.imageUrl} alt={card.nameFR} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Camera size={11} className="text-white/15" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] font-bold truncate leading-tight ${isSaved ? 'text-emerald-400' : 'text-white'}`}>
                        {card.nameFR || card.name}
                      </p>
                      <p className="text-[11px] text-white/35 font-mono mt-0.5">{card.setCode} · {card.number}</p>
                      {card.rarityFR && <p className="text-[10px] text-white/20 mt-0.5">{card.rarityFR}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {price && <span className="text-[14px] font-bold text-emerald-400">{price}€</span>}
                      {isSaved
                        ? <CheckCircle2 size={20} className="text-emerald-400" />
                        : <button type="button"
                            onClick={() => { setQuickAddCard(card); setQuickPrice(card.cmTrend || card.marketPrice); setQuickLocation('CELIAN') }}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-black active:scale-90 transition-transform">
                            <Plus size={16} />
                          </button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {detectedCards.length === 0 && searchResults.length === 0 && !query && (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-8 py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/4 border border-white/6 flex items-center justify-center">
                <ScanLine size={20} className="text-white/20" />
              </div>
              <p className="text-[13px] text-white/30 leading-relaxed">
                {workerState === 'loading'
                  ? 'Chargement (~15s la première fois)…'
                  : 'Pointez le nom de la carte dans le cadre vert, ou tapez-le ci-dessus'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick-add overlay ── */}
      {quickAddCard && (
        <div className="absolute inset-0 z-20 bg-[#0e0e10] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-between px-5 h-14 border-b border-white/5 shrink-0">
            <span className="text-[15px] font-bold text-white">Ajouter au stock</span>
            <button type="button" onClick={() => setQuickAddCard(null)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/6 text-white/60 hover:text-white transition-colors"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {/* Card preview */}
            <div className="flex items-center gap-4 p-4 bg-white/4 rounded-2xl border border-white/6">
              <div className="w-14 h-[78px] rounded-xl overflow-hidden bg-zinc-900 border border-white/8 shrink-0">
                {quickAddCard.imageUrl && <img src={quickAddCard.imageUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold text-white truncate">{quickAddCard.nameFR || quickAddCard.name}</p>
                <p className="text-[12px] text-white/40 font-mono mt-1">{quickAddCard.setCode} · {quickAddCard.number}</p>
                <p className="text-[11px] text-white/25 mt-0.5">{quickAddCard.rarityFR}</p>
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">Prix d&apos;achat</label>
              <div className="relative">
                <input type="number" step="0.01" min="0"
                  placeholder={quickAddCard.cmTrend || quickAddCard.marketPrice || '0.00'}
                  value={quickPrice} onChange={(e) => setQuickPrice(e.target.value)} autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 pr-10 text-[18px] font-bold text-white placeholder-white/15 focus:outline-none focus:border-emerald-500/40 transition-all" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-white/25 font-bold">€</span>
              </div>
              {(quickAddCard.cmTrend || quickAddCard.marketPrice) && (
                <button type="button"
                  onClick={() => setQuickPrice(quickAddCard.cmTrend || quickAddCard.marketPrice)}
                  className="text-[12px] text-white/30 hover:text-emerald-400 transition-colors">
                  CM Trend : <span className="text-emerald-400 font-bold">{quickAddCard.cmTrend || quickAddCard.marketPrice}€</span> — appuyer pour remplir
                </button>
              )}
            </div>

            {/* Location */}
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">Stockée chez</label>
              <div className="grid grid-cols-2 gap-3">
                {(['CELIAN', 'ROMAIN'] as const).map((loc) => (
                  <button key={loc} type="button" onClick={() => setQuickLocation(loc)}
                    className={`py-3.5 rounded-2xl text-[14px] font-bold border transition-all ${
                      quickLocation === loc ? 'bg-white text-black border-white' : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
                    }`}>
                    {loc === 'CELIAN' ? 'Célian' : 'Romain'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="shrink-0 px-5 pb-5 pt-3 flex gap-3 border-t border-white/5">
            <button type="button" onClick={() => setQuickAddCard(null)}
              className="flex-1 py-4 rounded-2xl border border-white/8 text-[15px] text-white/40 font-semibold hover:text-white hover:border-white/20 transition-colors">
              Retour
            </button>
            <button type="button" onClick={handleQuickSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 text-black font-bold text-[15px] transition-all active:scale-[0.98]">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Ajouter au stock
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
