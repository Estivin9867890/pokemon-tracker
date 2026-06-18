'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Plus, CheckCircle2, Loader2, Camera, Minus, Search, ScanLine, Zap } from 'lucide-react'
import { ItemFormData, FundedBy, GRADING_COMPANIES } from '@/types'

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

// ── API helpers ────────────────────────────────────────────────────────────────
function getMarketPrice(c: ApiCard) {
  const cm = c.cardmarket?.prices?.averageSellPrice ?? c.cardmarket?.prices?.trendPrice
  if (cm != null) return cm.toFixed(2)
  if (c.tcgplayer?.prices) for (const t of Object.values(c.tcgplayer.prices)) if (t?.market != null) return t.market.toFixed(2)
  return ''
}
function getCMTrend(c: ApiCard) { return c.cardmarket?.prices?.trendPrice?.toFixed(2) ?? '' }

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
    return ((await res.json()) as { data: ApiCard }).data ?? null
  } catch { return null }
}

// ── Capture & resize canvas to JPEG base64 (small for Gemini) ─────────────────
function captureToBase64(video: HTMLVideoElement): string {
  const TARGET_W = 1280
  const ratio    = TARGET_W / video.videoWidth
  const canvas   = document.createElement('canvas')
  canvas.width   = TARGET_W
  canvas.height  = Math.round(video.videoHeight * ratio)
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CardScannerLive({ open, onClose, onQuickAdd, defaultVintedFees = 0 }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const mountedRef  = useRef(false)
  const zoomRef     = useRef(ZOOM_DEFAULT)
  const nativeRef   = useRef(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchAbort = useRef<AbortController | null>(null)

  const [zoom, setZoom]               = useState(ZOOM_DEFAULT)
  const [cameraReady, setCameraReady] = useState(false)

  const [scanning, setScanning]       = useState(false)
  const [scanError, setScanError]     = useState('')
  const [scanResult, setScanResult]   = useState('')
  const [scanNumber, setScanNumber]   = useState('')
  const [scanned, setScanned]         = useState(false)

  const [query, setQuery]             = useState('')
  const [searching, setSearching]     = useState(false)
  const [searchResults, setSearchResults] = useState<TCGdexCard[]>([])

  const [detectedCards, setDetectedCards] = useState<DetectedCard[]>([])
  const [loadingCard, setLoadingCard] = useState<string | null>(null)

  const [quickAddCard, setQuickAddCard] = useState<DetectedCard | null>(null)
  const [quickPrice, setQuickPrice]   = useState('')
  const [quickExpectedPrice, setQuickExpectedPrice] = useState('')
  const [quickLocation, setQuickLocation] = useState<'CELIAN' | 'ROMAIN'>('CELIAN')
  const [quickCategory, setQuickCategory] = useState<'SINGLE' | 'SEALED'>('SINGLE')
  const [quickFundedBy, setQuickFundedBy] = useState<FundedBy | null>(null)
  const [quickIsGraded, setQuickIsGraded] = useState(false)
  const [quickGradingCompany, setQuickGradingCompany] = useState('')
  const [quickGradingNote, setQuickGradingNote] = useState('')
  const [quickNotes, setQuickNotes]   = useState('')
  const [quickIsLot, setQuickIsLot]   = useState(false)
  const [quickLotCost, setQuickLotCost] = useState('')
  const [quickLotNb, setQuickLotNb]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [savedUids, setSavedUids]     = useState<Set<string>>(new Set())

  // ── Camera ──────────────────────────────────────────────────────────────────
  async function applyZoom(val: number) {
    const v = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(val / ZOOM_STEP) * ZOOM_STEP))
    setZoom(v); zoomRef.current = v
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const cap = (track as any).getCapabilities?.() ?? {}
      if (cap.zoom) { await track.applyConstraints({ advanced: [{ zoom: Math.min(v, cap.zoom.max ?? v) }] } as any); nativeRef.current = true; return }
    } catch {}
    nativeRef.current = false
  }

  // ── Gemini AI scan ──────────────────────────────────────────────────────────
  async function handleAiScan() {
    if (!videoRef.current || scanning) return
    setScanning(true); setScanError(''); setScanResult(''); setScanNumber('')
    setSearchResults([])

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
        if (res.status === 503) {
          setScanError('Clé Gemini non configurée — utilisez la recherche')
        } else {
          setScanError(data.error ?? 'Erreur scan IA')
        }
        return
      }

      const name = (data.name ?? '').trim()
      const number = (data.number ?? '').trim()
      if (!name) { setScanError('Carte non reconnue — repositionnez ou tapez le nom'); return }

      setScanResult(name)
      setScanNumber(number)
      setQuery(name)
      setScanned(true)

      searchAbort.current?.abort()
      const ctrl = new AbortController(); searchAbort.current = ctrl
      const cards = await searchTCGdex(name, ctrl.signal)
      if (!mountedRef.current || ctrl.signal.aborted) return

      if (number && cards.length > 0) {
        const num = number.split('/')[0].replace(/^0+/, '') || '0'
        const match = cards.find(c => c.localId.replace(/^0+/, '') === num)
        if (match) {
          setLoadingCard(match.id)
          try {
            const api = await fetchPrices(match.id)
            const card: DetectedCard = {
              uid: `${match.id}-${Date.now()}`, apiId: match.id,
              name: api?.name ?? match.name, nameFR: match.name,
              number: match.localId, setName: match.set?.name ?? api?.set?.name ?? '',
              setCode: api?.set?.ptcgoCode ?? match.set?.id?.toUpperCase() ?? '',
              rarityFR: RARITY_MAP[api?.rarity ?? ''] ?? api?.rarity ?? '',
              imageUrl: api?.images?.small ?? (match.image ? `${match.image}/low.webp` : ''),
              marketPrice: api ? getMarketPrice(api) : '', cmTrend: api ? getCMTrend(api) : '',
            }
            if (mountedRef.current) {
              setDetectedCards(prev => prev.some(c => c.apiId === card.apiId) ? prev : [card, ...prev])
              openQuickAdd(card)
            }
          } finally { if (mountedRef.current) setLoadingCard(null) }
          return
        }
      }

      setSearchResults(cards)
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
      if (mountedRef.current && !ctrl.signal.aborted) { setSearchResults(res); setSearching(false) }
    }).catch(() => { if (mountedRef.current) setSearching(false) })
  }

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q); setScanResult(''); setScanError('')
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchAbort.current?.abort()
    if (!q.trim()) { setSearchResults([]); setSearching(false); return }
    setSearching(true)
    const ctrl = new AbortController(); searchAbort.current = ctrl
    searchTimer.current = setTimeout(async () => {
      const data = await searchTCGdex(q, ctrl.signal)
      if (mountedRef.current && !ctrl.signal.aborted) { setSearchResults(data); setSearching(false) }
    }, 300)
  }, [])

  // ── Select card → enrich → add to list ──────────────────────────────────────
  async function selectResult(tcgCard: TCGdexCard) {
    if (loadingCard === tcgCard.id) return
    setLoadingCard(tcgCard.id)
    try {
      const api = await fetchPrices(tcgCard.id)
      const card: DetectedCard = {
        uid: `${tcgCard.id}-${Date.now()}`, apiId: tcgCard.id,
        name: api?.name ?? tcgCard.name, nameFR: tcgCard.name,
        number: tcgCard.localId, setName: tcgCard.set?.name ?? api?.set?.name ?? '',
        setCode: api?.set?.ptcgoCode ?? tcgCard.set?.id?.toUpperCase() ?? '',
        rarityFR: RARITY_MAP[api?.rarity ?? ''] ?? api?.rarity ?? '',
        imageUrl: api?.images?.small ?? (tcgCard.image ? `${tcgCard.image}/low.webp` : ''),
        marketPrice: api ? getMarketPrice(api) : '', cmTrend: api ? getCMTrend(api) : '',
      }
      if (mountedRef.current) {
        setDetectedCards((prev) => prev.some((c) => c.apiId === card.apiId) ? prev : [card, ...prev])
        setQuery(''); setSearchResults([])
      }
    } finally { if (mountedRef.current) setLoadingCard(null) }
  }

  // ── Quick-add ────────────────────────────────────────────────────────────────
  function openQuickAdd(card: DetectedCard) {
    setQuickAddCard(card)
    setQuickPrice(card.cmTrend || card.marketPrice)
    setQuickExpectedPrice(card.cmTrend || card.marketPrice)
    setQuickLocation('CELIAN')
    setQuickCategory('SINGLE')
    setQuickFundedBy(null)
    setQuickIsGraded(false)
    setQuickGradingCompany('')
    setQuickGradingNote('')
    setQuickNotes('')
    setQuickIsLot(false)
    setQuickLotCost('')
    setQuickLotNb('')
  }

  async function handleQuickSave() {
    if (!quickAddCard) return
    setSaving(true)
    const name = quickAddCard.nameFR || quickAddCard.name
    const price = quickIsLot ? '' : (quickPrice || quickAddCard.cmTrend || quickAddCard.marketPrice)
    try {
      await onQuickAdd({
        item_name: name, purchase_price: price,
        vinted_fees: String(defaultVintedFees),
        expected_sale_price: quickExpectedPrice || quickAddCard.cmTrend || quickAddCard.marketPrice,
        location: quickLocation === 'CELIAN' ? 'Chez Célian' : 'Chez Romain',
        notes: quickNotes,
        pokemon_name: name,
        card_number: quickAddCard.number, extension: quickAddCard.setName,
        rarity: quickAddCard.rarityFR, pokemon_category: quickCategory,
        poke_location: quickLocation,
        is_graded: quickIsGraded, grading_company: quickGradingCompany, grading_note: quickGradingNote,
        is_lot: quickIsLot, lot_total_cost: quickLotCost, nb_articles: quickLotNb,
        funded_by: quickFundedBy, hits: [],
      })
      setSavedUids((prev) => new Set([...prev, quickAddCard.uid]))
      setQuickAddCard(null); setQuickPrice('')
    } finally { setSaving(false) }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
      return
    }
    mountedRef.current = true
    setCameraReady(false); setScanning(false); setScanError(''); setScanResult(''); setScanNumber('')
    setScanned(false); setQuery(''); setSearchResults([]); setDetectedCards([])
    setQuickAddCard(null); setSavedUids(new Set())
    setZoom(ZOOM_DEFAULT); zoomRef.current = ZOOM_DEFAULT; nativeRef.current = false

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    }).then((stream) => {
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.onloadedmetadata = () => setCameraReady(true) }
      const track = stream.getVideoTracks()[0]
      const cap = (track as any).getCapabilities?.() ?? {}
      if (cap.zoom) { nativeRef.current = true; track.applyConstraints({ advanced: [{ zoom: ZOOM_DEFAULT }] } as any).catch(() => {}) }
    }).catch(() => { if (mountedRef.current) setCameraReady(false) })

    return () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
      searchAbort.current?.abort()
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [open])

  if (!open) return null

  const cssZoom = !nativeRef.current && zoom > 1
    ? { transform: `scale(${zoom})`, transformOrigin: 'center center' } as React.CSSProperties
    : {}

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0a0a0a]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 h-14 bg-[#0a0a0a] border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <ScanLine size={16} className="text-emerald-400" />
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

      {/* Camera */}
      <div className="shrink-0 relative bg-black overflow-hidden"
        style={{ height: scanned ? '25vh' : '50vh', transition: 'height 0.3s ease-out' }}>
        <video ref={videoRef} autoPlay playsInline muted
          className="w-full h-full object-cover" style={cssZoom} />

        {/* Dark overlay — only corners, keeps center bright */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 18%, transparent 82%, rgba(0,0,0,0.35) 100%)',
        }} />

        {/* Card frame — 72% width, very visible */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: '72%', aspectRatio: '5/7' }}>
            {/* Corner brackets — thick white + green glow */}
            {[
              'top-0 left-0 border-t-[4px] border-l-[4px] rounded-tl-2xl',
              'top-0 right-0 border-t-[4px] border-r-[4px] rounded-tr-2xl',
              'bottom-0 left-0 border-b-[4px] border-l-[4px] rounded-bl-2xl',
              'bottom-0 right-0 border-b-[4px] border-r-[4px] rounded-br-2xl',
            ].map((cls) => (
              <div key={cls} className={`absolute w-9 h-9 ${cls}`}
                style={{
                  borderColor: cameraReady ? '#34d399' : 'rgba(255,255,255,0.5)',
                  margin: '-2px',
                  filter: cameraReady ? 'drop-shadow(0 0 6px rgba(52,211,153,0.9))' : 'none',
                }} />
            ))}
            {/* Scanning line animation */}
            {cameraReady && !scanning && (
              <div className="absolute inset-x-0 overflow-hidden rounded-2xl" style={{ top: '4px', bottom: '4px' }}>
                <div className="absolute inset-x-0 h-[2px] animate-scan-line"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(52,211,153,0.8), transparent)' }} />
              </div>
            )}
          </div>
        </div>

        {/* Scanning overlay */}
        {scanning && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"
              style={{ boxShadow: '0 0 30px rgba(52,211,153,0.3)' }}>
              <Loader2 size={28} className="animate-spin text-emerald-400" />
            </div>
            <p className="text-[14px] text-white font-semibold">Analyse IA…</p>
          </div>
        )}

        {/* Zoom */}
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

      {/* Bottom panel */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#0e0e10]">

        {/* AI scan button + search */}
        <div className="shrink-0 px-4 pt-3 pb-2 space-y-2.5">

          {/* Primary: AI scan button */}
          <button type="button" onClick={handleAiScan} disabled={scanning || !cameraReady}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-[15px] transition-all active:scale-[0.98]">
            {scanning
              ? <><Loader2 size={16} className="animate-spin" /> Analyse en cours…</>
              : <><Zap size={16} /> Scanner avec l&apos;IA</>
            }
          </button>

          {/* Feedback: result or error */}
          {scanResult && !searching && (
            <p className="text-center text-[12px] text-emerald-400 font-medium">
              ✓ Détecté : « {scanResult} »{scanNumber ? ` · ${scanNumber}` : ''}
            </p>
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

          {/* Manual search */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input type="text" value={query} onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Chipie, Dracaufeu ex, Pikachu…"
              className="w-full bg-white/6 border border-white/8 rounded-2xl pl-9 pr-9 py-3 text-[15px] text-white placeholder-white/20 focus:outline-none focus:border-white/20 focus:bg-white/8 transition-all"
              autoComplete="off" autoCorrect="off" spellCheck={false} />
            {query
              ? <button type="button" onClick={() => { setQuery(''); setSearchResults([]) }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors p-1">
                  <X size={13} />
                </button>
              : (searching || loadingCard)
                ? <Loader2 size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-white/25" />
                : null
            }
          </div>
        </div>

        {/* Scrollable results */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">

          {/* Search / AI results */}
          {searchResults.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest px-1 py-1">
                {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
              </p>
              {searchResults.map((c) => (
                <button key={c.id} type="button" onClick={() => selectResult(c)} disabled={loadingCard === c.id}
                  className="w-full flex items-center gap-3.5 px-4 py-3 bg-white/4 hover:bg-white/7 active:bg-white/10 rounded-2xl border border-white/6 text-left transition-colors active:scale-[0.99]">
                  <div className="w-10 h-[56px] rounded-xl overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                    {c.image
                      ? <img src={`${c.image}/low.webp`} alt={c.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Camera size={10} className="text-white/15" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-white/35 font-mono mt-0.5">{c.set?.id?.toUpperCase()} · {c.localId}</p>
                    {c.set?.name && <p className="text-[10px] text-white/20 truncate mt-0.5">{c.set.name}</p>}
                  </div>
                  {loadingCard === c.id
                    ? <Loader2 size={16} className="animate-spin text-white/30 shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center shrink-0 border border-white/6">
                        <Plus size={14} className="text-white/50" />
                      </div>}
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {!searching && query.trim().length >= 2 && searchResults.length === 0 && (
            <p className="text-center text-[12px] text-white/25 py-6">
              Aucune carte pour « {query} »
            </p>
          )}

          {/* Detected (added to list) */}
          {detectedCards.length > 0 && searchResults.length === 0 && !query && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest px-1 py-1">
                En attente ({detectedCards.length})
              </p>
              {detectedCards.map((card) => {
                const isSaved = savedUids.has(card.uid)
                const price   = card.cmTrend || card.marketPrice
                return (
                  <div key={card.uid}
                    className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl border transition-colors ${isSaved ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-white/4 border-white/6'}`}>
                    <div className="w-10 h-[56px] rounded-xl overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                      {card.imageUrl ? <img src={card.imageUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Camera size={10} className="text-white/15" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] font-bold truncate ${isSaved ? 'text-emerald-400' : 'text-white'}`}>
                        {card.nameFR || card.name}
                      </p>
                      <p className="text-[11px] text-white/35 font-mono mt-0.5">{card.setCode} · {card.number}</p>
                      {card.rarityFR && <p className="text-[10px] text-white/20 mt-0.5">{card.rarityFR}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {price && <span className="text-[14px] font-bold text-emerald-400">{price}€</span>}
                      {isSaved
                        ? <CheckCircle2 size={20} className="text-emerald-400" />
                        : <button type="button"
                            onClick={() => openQuickAdd(card)}
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
          {detectedCards.length === 0 && searchResults.length === 0 && !query && !scanning && (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/6 flex items-center justify-center">
                <Zap size={22} className="text-white/20" />
              </div>
              <div className="space-y-1">
                <p className="text-[14px] font-semibold text-white/40">Pointez la carte dans le cadre</p>
                <p className="text-[12px] text-white/20">puis appuyez sur « Scanner avec l&apos;IA »</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick-add fullscreen */}
      {quickAddCard && (
        <div className="absolute inset-0 z-20 bg-[#0e0e10] flex flex-col"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-between px-5 h-14 border-b border-white/5 shrink-0">
            <span className="text-[15px] font-bold text-white">Ajouter au stock</span>
            <button type="button" onClick={() => setQuickAddCard(null)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/6 text-white/60 hover:text-white transition-colors"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {/* Card preview */}
            <div className="flex items-center gap-4 p-4 bg-white/4 rounded-2xl border border-white/6">
              <div className="w-14 h-[78px] rounded-xl overflow-hidden bg-zinc-900 border border-white/8 shrink-0">
                {quickAddCard.imageUrl && <img src={quickAddCard.imageUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold text-white truncate">{quickAddCard.nameFR || quickAddCard.name}</p>
                <p className="text-[12px] text-white/35 font-mono mt-1">{quickAddCard.setCode} · {quickAddCard.number}</p>
                {quickAddCard.rarityFR && <p className="text-[11px] text-white/20 mt-0.5">{quickAddCard.rarityFR}</p>}
              </div>
            </div>

            {/* Prix d'achat (masqué si lot) */}
            {!quickIsLot && (
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider">Prix d&apos;achat</label>
                <div className="relative">
                  <input type="number" step="0.01" min="0"
                    placeholder={quickAddCard.cmTrend || quickAddCard.marketPrice || '0.00'}
                    value={quickPrice} onChange={(e) => setQuickPrice(e.target.value)} autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 pr-10 text-[18px] font-bold text-white placeholder-white/15 focus:outline-none focus:border-emerald-500/40 transition-all" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-white/25 font-bold">€</span>
                </div>
                {(quickAddCard.cmTrend || quickAddCard.marketPrice) && (
                  <button type="button" onClick={() => setQuickPrice(quickAddCard.cmTrend || quickAddCard.marketPrice)}
                    className="text-[12px] text-white/25 hover:text-emerald-400 transition-colors">
                    CM Trend <span className="text-emerald-400 font-bold">{quickAddCard.cmTrend || quickAddCard.marketPrice}€</span> → appuyer
                  </button>
                )}
              </div>
            )}

            {/* Prix de revente visé (masqué si lot) */}
            {!quickIsLot && (
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider">Prix de revente visé</label>
                <div className="relative">
                  <input type="number" step="0.01" min="0" placeholder="65.00"
                    value={quickExpectedPrice} onChange={(e) => setQuickExpectedPrice(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 pr-10 text-[18px] font-bold text-white placeholder-white/15 focus:outline-none focus:border-emerald-500/40 transition-all" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-white/25 font-bold">€</span>
                </div>
              </div>
            )}

            {/* Ajout en Lot */}
            <button type="button" onClick={() => setQuickIsLot(!quickIsLot)}
              className={`w-full rounded-2xl py-2.5 text-[13px] font-bold border transition-all ${
                quickIsLot
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                  : 'border-white/8 text-white/30 hover:text-white/50'
              }`}>
              📦 Ajout en Lot ? {quickIsLot ? '✓ Activé' : 'Non'}
            </button>

            {quickIsLot && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">Coût total du lot</label>
                  <div className="relative">
                    <input type="number" step="0.01" min="0" placeholder="120.00"
                      value={quickLotCost} onChange={(e) => setQuickLotCost(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 pr-8 text-[15px] font-bold text-white placeholder-white/15 focus:outline-none focus:border-violet-500/40 transition-all" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-white/25 font-bold">€</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">Nb d&apos;articles</label>
                  <input type="number" min="1" placeholder="10"
                    value={quickLotNb} onChange={(e) => setQuickLotNb(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-[15px] font-bold text-white placeholder-white/15 focus:outline-none focus:border-violet-500/40 transition-all" />
                </div>
                {quickLotCost && quickLotNb && (
                  <p className="col-span-2 text-[11px] text-white/30 text-center">
                    {(parseFloat(quickLotCost) / (parseInt(quickLotNb) || 1)).toFixed(2)}€ / carte
                  </p>
                )}
              </div>
            )}

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider">Type</label>
              <div className="grid grid-cols-2 gap-3">
                {(['SINGLE', 'SEALED'] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setQuickCategory(c)}
                    className={`py-2.5 rounded-2xl text-[13px] font-bold border transition-all ${
                      quickCategory === c ? 'bg-white text-black border-white' : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white/60'
                    }`}>
                    {c === 'SINGLE' ? '🃏 Carte unité' : '📦 Scellé / Booster'}
                  </button>
                ))}
              </div>
            </div>

            {/* Stockée chez */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider">Stockée chez</label>
              <div className="grid grid-cols-2 gap-3">
                {(['CELIAN', 'ROMAIN'] as const).map((loc) => (
                  <button key={loc} type="button" onClick={() => setQuickLocation(loc)}
                    className={`py-2.5 rounded-2xl text-[13px] font-bold border transition-all ${
                      quickLocation === loc
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                        : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white/60'
                    }`}>
                    📍 {loc === 'CELIAN' ? 'Chez Célian' : 'Chez Romain'}
                  </button>
                ))}
              </div>
            </div>

            {/* Qui a acheté */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider">
                Qui a acheté ? <span className="text-white/15">(depuis la cagnotte)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'ROMAIN_PERSO' as FundedBy, label: '🛒 Romain' },
                  { value: 'CELIAN_PERSO' as FundedBy, label: '🛒 Célian' },
                ]).map(({ value, label }) => (
                  <button key={value} type="button"
                    onClick={() => setQuickFundedBy(quickFundedBy === value ? null : value)}
                    className={`py-2.5 rounded-2xl text-[13px] font-bold border transition-all ${
                      quickFundedBy === value
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white/60'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Gradée */}
            <button type="button" onClick={() => setQuickIsGraded(!quickIsGraded)}
              className={`w-full rounded-2xl py-2.5 text-[13px] font-bold border transition-all ${
                quickIsGraded
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'border-white/8 text-white/30 hover:text-white/50'
              }`}>
              🏅 Gradée ? {quickIsGraded ? '✓ Oui' : 'Non'}
            </button>
            {quickIsGraded && (
              <div className="grid grid-cols-2 gap-3">
                <select value={quickGradingCompany} onChange={(e) => setQuickGradingCompany(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-[14px] text-white focus:outline-none focus:border-amber-500/40 transition-all">
                  <option value="">Entreprise…</option>
                  {GRADING_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min="1" max="10" placeholder="Note (1-10)"
                  value={quickGradingNote} onChange={(e) => setQuickGradingNote(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-[14px] text-white placeholder-white/15 focus:outline-none focus:border-amber-500/40 transition-all" />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider">Notes</label>
              <textarea placeholder="État, détails..." value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)} rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[14px] text-white placeholder-white/15 focus:outline-none focus:border-white/20 transition-all resize-none" />
            </div>
          </div>

          <div className="shrink-0 px-5 pb-5 pt-3 flex gap-3 border-t border-white/5">
            <button type="button" onClick={() => setQuickAddCard(null)}
              className="flex-1 py-4 rounded-2xl border border-white/8 text-[15px] text-white/35 font-semibold hover:text-white hover:border-white/20 transition-colors">
              Retour
            </button>
            <button type="button" onClick={handleQuickSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 text-black font-bold text-[15px] transition-all active:scale-[0.98]">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Ajouter au stock
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
