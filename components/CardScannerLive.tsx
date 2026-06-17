'use client'

import { useRef, useState, useEffect } from 'react'
import { X, Plus, CheckCircle2, Loader2, Scan, Camera, Minus } from 'lucide-react'
import { ItemFormData } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────
interface ApiCard {
  id: string
  name: string
  number: string
  set?: { name: string; ptcgoCode?: string }
  rarity?: string
  images?: { small: string; large: string }
  cardmarket?: {
    prices?: {
      trendPrice?: number
      averageSellPrice?: number
      lowPrice?: number
      avg1?: number
      avg7?: number
      avg30?: number
    }
  }
  tcgplayer?: { prices?: Record<string, { market?: number }> }
}

export interface DetectedCard {
  uid: string
  apiId: string
  name: string
  number: string
  setName: string
  setCode: string
  rarityFR: string
  imageUrl: string
  marketPrice: string
  cmTrend: string
}

// ── Constants ────────────────────────────────────────────────────────────────
const RARITY_MAP: Record<string, string> = {
  'Common': 'Commune',
  'Uncommon': 'Peu commune',
  'Rare': 'Rare',
  'Rare Holo': 'Rare Holo',
  'Rare Reverse Holo': 'Reverse Holo',
  'Rare Holo EX': 'EX / GX / V',
  'Rare Ultra': 'EX / GX / V',
  'Rare Holo GX': 'EX / GX / V',
  'Rare Holo V': 'EX / GX / V',
  'Double Rare': 'EX / GX / V',
  'Ultra Rare': 'EX / GX / V',
  'Rare Holo VMAX': 'VMAX / VSTAR',
  'Rare Holo VSTAR': 'VMAX / VSTAR',
  'Rare Rainbow': 'Rainbow Rare',
  'Rare Secret': 'Secret Rare (>set)',
  'Secret Rare': 'Secret Rare (>set)',
  'Hyper Rare': 'Secret Rare (>set)',
  'ACE SPEC Rare': 'Secret Rare (>set)',
  'Rare Shiny': 'Shiny',
  'Shiny Rare': 'Shiny',
  'Shiny Ultra Rare': 'Shiny',
  'Amazing Rare': 'Amazing Rare',
  'Promo': 'Promo',
  'Full Art': 'Full Art',
  'Illustration Rare': 'Illustration Rare',
  'Special Illustration Rare': 'Special Illustration Rare',
  'Trainer Gallery Rare Holo': 'Trainer Gallery',
  'Radiant Rare': 'AR (Art Rare)',
  'Super Rare': 'SAR (Special Art Rare)',
  'Tera': 'AR (Art Rare)',
}

const SCAN_INTERVAL_MS      = 250
const SAME_CARD_DEBOUNCE_MS = 2_000
const LIST_COOLDOWN_MS      = 30_000
const ZOOM_DEFAULT          = 2.0
const ZOOM_MIN              = 1.0
const ZOOM_MAX              = 5.0
const ZOOM_STEP             = 0.5

// ── Image preprocessing ─────────────────────────────────────────────────────
function cropScalePreprocess(
  src: HTMLCanvasElement,
  cropFromTop = 0.70,
  scale = 3,
): HTMLCanvasElement {
  const srcH  = src.height
  const cropY = Math.floor(srcH * cropFromTop)
  const cropH = srcH - cropY

  const out    = document.createElement('canvas')
  out.width    = src.width * scale
  out.height   = cropH * scale

  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, cropY, src.width, cropH, 0, 0, out.width, out.height)

  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d   = img.data
  for (let i = 0; i < d.length; i += 4) {
    const gray     = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const enhanced = Math.min(255, Math.max(0, (gray - 128) * 2.2 + 128))
    d[i] = d[i + 1] = d[i + 2] = enhanced
  }
  ctx.putImageData(img, 0, 0)
  return out
}

// ── OCR text parsing ─────────────────────────────────────────────────────────
interface CardInfo { number: string | null; setCode: string | null }

function parseCardInfo(rawText: string): CardInfo {
  let text = rawText.replace(/\n/g, ' ')
  text = text.replace(/(\d)\s+(\d)/g, '$1$2')
  text = text.replace(/(\d)\s+(\d)/g, '$1$2')
  text = text.replace(/\s+/g, ' ')

  const patterns = [
    /\b(TG\d{1,2})\/(TG\d{1,2})\b/i,
    /\b(GG\d{1,2})\/(GG\d{1,2})\b/i,
    /\b([A-Z]{0,3}\d{1,4})\/(\d{1,4})\b/i,
  ]

  let cardNumber: string | null = null
  let numIndex = -1

  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const [a, b] = m[0].split('/').map((s) => parseInt(s, 10) || 0)
      if (a < 1 || b < 1 || b > 800 || a > 800) continue
      cardNumber = m[0].toUpperCase()
      numIndex   = text.indexOf(m[0])
      break
    }
  }

  if (!cardNumber || numIndex === -1) return { number: null, setCode: null }

  const prefix = text.slice(Math.max(0, numIndex - 80), numIndex)
  const tokens = prefix.trim().split(/\s+/).filter(Boolean)
  let setCode: string | null = null
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^[A-Z]{3,5}$/.test(tokens[i])) { setCode = tokens[i]; break }
  }

  return { number: cardNumber, setCode }
}

// ── Prices ──────────────────────────────────────────────────────────────────
function getCMTrend(card: ApiCard): string {
  const t = card.cardmarket?.prices?.trendPrice
  return t != null ? t.toFixed(2) : ''
}

function getMarketPrice(card: ApiCard): string {
  const cm = card.cardmarket?.prices?.averageSellPrice
  if (cm != null) return cm.toFixed(2)
  if (card.tcgplayer?.prices) {
    for (const tier of Object.values(card.tcgplayer.prices)) {
      if (tier?.market != null) return tier.market.toFixed(2)
    }
  }
  return ''
}

// ── API fetch with ambiguity detection ───────────────────────────────────────
interface FetchResult { best: ApiCard | null; candidates: ApiCard[] }

async function fetchCard(number: string, setCode: string | null): Promise<FetchResult> {
  const numPart = number.split('/')[0]
  const queries = setCode
    ? [`number:"${numPart}" set.ptcgoCode:${setCode}`, `number:"${numPart}"`]
    : [`number:"${numPart}"`]

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=8`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (!res.ok) continue
      const json = await res.json() as { data: ApiCard[] }
      const data = json.data ?? []
      if (!data.length) continue

      if (setCode) {
        const exact = data.find((c) => c.set?.ptcgoCode === setCode)
        if (exact) return { best: exact, candidates: [] }
      }
      if (data.length === 1) return { best: data[0], candidates: [] }
      return { best: null, candidates: data }
    } catch { continue }
  }
  return { best: null, candidates: [] }
}

// ── Component ───────────────────────────────────────────────────────────────
interface Props {
  open: boolean
  onClose: () => void
  onQuickAdd: (data: ItemFormData) => Promise<void>
  defaultVintedFees?: number
}

export default function CardScannerLive({ open, onClose, onQuickAdd, defaultVintedFees = 0 }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const workerRef   = useRef<import('tesseract.js').Worker | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef  = useRef(false)

  const isProcessingRef   = useRef(false)
  const showCandidatesRef = useRef(false)
  const lastDetectionRef  = useRef<{ key: string; time: number } | null>(null)
  const listCooldownRef   = useRef(new Map<string, number>())
  const detectedCardsRef  = useRef<DetectedCard[]>([])
  const savedUidsRef      = useRef<Set<string>>(new Set())

  const [workerReady, setWorkerReady]     = useState(false)
  const [cameraError, setCameraError]     = useState('')
  const [zoom, setZoom]                   = useState(ZOOM_DEFAULT)
  const [nativeZoom, setNativeZoom]       = useState(false)
  const [detectedCards, setDetectedCards] = useState<DetectedCard[]>([])
  const [flashName, setFlashName]         = useState<string | null>(null)
  const [ocrDebug, setOcrDebug]           = useState('')
  const [candidates, setCandidates]       = useState<ApiCard[]>([])
  const [quickAddCard, setQuickAddCard]   = useState<DetectedCard | null>(null)
  const [quickPrice, setQuickPrice]       = useState('')
  const [quickLocation, setQuickLocation] = useState<'CELIAN' | 'ROMAIN'>('CELIAN')
  const [saving, setSaving]               = useState(false)
  const [savedUids, setSavedUids]         = useState<Set<string>>(new Set())

  // ── Zoom ──────────────────────────────────────────────────────────────────
  async function applyZoom(val: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(val / ZOOM_STEP) * ZOOM_STEP))
    setZoom(clamped)
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const cap = (track as any).getCapabilities?.() ?? {}
      if (cap.zoom) {
        await track.applyConstraints({ advanced: [{ zoom: Math.min(clamped, cap.zoom.max ?? clamped) }] } as any)
        setNativeZoom(true)
        return
      }
    } catch {}
    setNativeZoom(false)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    mountedRef.current = true

    setWorkerReady(false); setCameraError(''); setDetectedCards([])
    detectedCardsRef.current = []; setFlashName(null); setOcrDebug('')
    setQuickAddCard(null); setCandidates([]); showCandidatesRef.current = false
    setSavedUids(new Set()); savedUidsRef.current = new Set()
    listCooldownRef.current.clear(); lastDetectionRef.current = null
    isProcessingRef.current = false; setZoom(ZOOM_DEFAULT)

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream

        const track = stream.getVideoTracks()[0]
        const cap   = (track as any).getCapabilities?.() ?? {}
        if (cap.zoom) {
          setNativeZoom(true)
          await track.applyConstraints({ advanced: [{ zoom: ZOOM_DEFAULT }] } as any).catch(() => {})
        }
      } catch (err) {
        if (!mountedRef.current) return
        const n = (err as Error).name
        setCameraError(
          n === 'NotAllowedError' ? "Accès caméra refusé." :
          n === 'NotFoundError'  ? "Aucune caméra détectée." :
          "Impossible d'accéder à la caméra."
        )
        return
      }

      try {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker('eng')
        if (!mountedRef.current) { await worker.terminate(); return }
        workerRef.current = worker
        setWorkerReady(true)
      } catch {
        if (mountedRef.current) setCameraError('Échec OCR. Rechargez la page.')
        return
      }

      async function doScan() {
        if (!mountedRef.current || !workerRef.current || isProcessingRef.current) return
        if (showCandidatesRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2 || video.videoWidth === 0) return

        isProcessingRef.current = true
        try {
          const canvas = canvasRef.current!
          canvas.width  = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d')!.drawImage(video, 0, 0)

          const ocrCanvas = cropScalePreprocess(canvas, 0.70, 3)
          const { data }  = await workerRef.current.recognize(ocrCanvas)
          if (!mountedRef.current) return

          const { number, setCode } = parseCardInfo(data.text)
          if (!number) return

          const now = Date.now()
          const key = `${number}-${setCode ?? ''}`
          if (mountedRef.current) setOcrDebug(`${number}${setCode ? ` · ${setCode}` : ''}`)

          const last = lastDetectionRef.current
          if (last && last.key === key && now - last.time < SAME_CARD_DEBOUNCE_MS) return
          lastDetectionRef.current = { key, time: now }

          if ((listCooldownRef.current.get(key) ?? 0) + LIST_COOLDOWN_MS > now) return

          const { best, candidates: found } = await fetchCard(number, setCode)
          if (!mountedRef.current) return

          if (!best && found.length > 1) {
            showCandidatesRef.current = true
            setCandidates(found)
            return
          }

          const apiCard = best
          if (!apiCard) return

          if (detectedCardsRef.current.some((c) => c.apiId === apiCard.id && !savedUidsRef.current.has(c.uid))) return

          const resolvedCode = apiCard.set?.ptcgoCode ?? setCode ?? ''
          const card: DetectedCard = {
            uid:         `${apiCard.id}-${now}`,
            apiId:       apiCard.id,
            name:        apiCard.name,
            number,
            setName:     apiCard.set?.name ?? '',
            setCode:     resolvedCode,
            rarityFR:    RARITY_MAP[apiCard.rarity ?? ''] ?? apiCard.rarity ?? '',
            imageUrl:    apiCard.images?.small ?? '',
            marketPrice: getMarketPrice(apiCard),
            cmTrend:     getCMTrend(apiCard),
          }

          listCooldownRef.current.set(key, now)
          setDetectedCards((prev) => { const next = [card, ...prev]; detectedCardsRef.current = next; return next })
          setFlashName(card.name)
          setTimeout(() => { if (mountedRef.current) setFlashName(null) }, 2500)
        } catch {
          // ignore
        } finally {
          isProcessingRef.current = false
        }
      }

      intervalRef.current = setInterval(doScan, SCAN_INTERVAL_MS)
    }

    init()

    return () => {
      mountedRef.current = false
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      workerRef.current?.terminate().catch(() => {})
      workerRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      isProcessingRef.current = false
    }
  }, [open])

  // ── Ambiguity resolution ─────────────────────────────────────────────────
  function selectCandidate(apiCard: ApiCard) {
    const now     = Date.now()
    const code    = apiCard.set?.ptcgoCode ?? ''
    const key     = `${apiCard.number}-${code}`
    const card: DetectedCard = {
      uid: `${apiCard.id}-${now}`, apiId: apiCard.id, name: apiCard.name,
      number: apiCard.number, setName: apiCard.set?.name ?? '', setCode: code,
      rarityFR: RARITY_MAP[apiCard.rarity ?? ''] ?? apiCard.rarity ?? '',
      imageUrl: apiCard.images?.small ?? '',
      marketPrice: getMarketPrice(apiCard), cmTrend: getCMTrend(apiCard),
    }
    listCooldownRef.current.set(key, now)
    setDetectedCards((prev) => { const next = [card, ...prev]; detectedCardsRef.current = next; return next })
    setFlashName(card.name)
    setTimeout(() => { if (mountedRef.current) setFlashName(null) }, 2500)
    setCandidates([]); showCandidatesRef.current = false
  }

  function dismissCandidates() {
    setCandidates([]); showCandidatesRef.current = false; lastDetectionRef.current = null
  }

  // ── Quick-add ─────────────────────────────────────────────────────────────
  async function handleQuickSave() {
    if (!quickAddCard) return
    setSaving(true)
    const price     = quickPrice || quickAddCard.cmTrend || quickAddCard.marketPrice
    const salePrice = quickAddCard.cmTrend || quickAddCard.marketPrice
    const formData: ItemFormData = {
      item_name: quickAddCard.name, purchase_price: price,
      vinted_fees: String(defaultVintedFees), expected_sale_price: salePrice,
      location: quickLocation === 'CELIAN' ? 'Chez Célian' : 'Chez Romain',
      notes: '', pokemon_name: quickAddCard.name, card_number: quickAddCard.number,
      extension: quickAddCard.setName, rarity: quickAddCard.rarityFR,
      pokemon_category: 'SINGLE', poke_location: quickLocation,
      is_graded: false, grading_company: '', grading_note: '',
      is_lot: false, lot_total_cost: '', nb_articles: '',
      funded_by: null, hits: [],
    }
    try {
      await onQuickAdd(formData)
      const uid = quickAddCard.uid
      setSavedUids((prev) => { const next = new Set([...prev, uid]); savedUidsRef.current = next; return next })
      setQuickAddCard(null); setQuickPrice('')
    } finally { setSaving(false) }
  }

  function openQuickAdd(card: DetectedCard) {
    setQuickAddCard(card); setQuickPrice(card.cmTrend || card.marketPrice); setQuickLocation('CELIAN')
  }

  function removeCard(uid: string) {
    setDetectedCards((prev) => { const next = prev.filter((c) => c.uid !== uid); detectedCardsRef.current = next; return next })
  }

  if (!open) return null

  const cssZoomStyle = !nativeZoom && zoom > 1
    ? { transform: `scale(${zoom})`, transformOrigin: 'center center' } as React.CSSProperties
    : {}

  // Dot positions for the zoom indicator (ZOOM_MAX → ZOOM_MIN)
  const zoomDots = Array.from({ length: Math.round((ZOOM_MAX - ZOOM_MIN) / ZOOM_STEP) + 1 }, (_, i) =>
    ZOOM_MAX - i * ZOOM_STEP
  )

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black select-none">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-5 h-12 bg-black/90 backdrop-blur border-b border-white/5 z-10">
        <div className="flex items-center gap-2">
          <Scan size={13} className="text-white/50" />
          <span className="text-sm font-bold text-white tracking-wide">Scanner</span>
          {workerReady && detectedCards.length > 0 && (
            <span className="ml-1 text-[10px] text-white/35 font-medium">
              · {detectedCards.length} carte{detectedCards.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Video area ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 bg-black overflow-hidden">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8">
            <Camera size={32} className="text-white/15" />
            <p className="text-sm text-white/40 leading-relaxed">{cameraError}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className="w-full h-full object-cover transition-transform duration-300"
              style={cssZoomStyle}
            />

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 60% 72% at 50% 44%, transparent 28%, rgba(0,0,0,0.6) 100%)' }}
            />

            {/* ── Dashed card frame ──────────────────────────────────── */}
            <div
              className="absolute inset-x-0 top-0 flex items-center justify-center pointer-events-none"
              style={{ bottom: 272 }}
            >
              <div className="relative" style={{ width: '70%', aspectRatio: '5/7' }}>
                {/* Dashed border */}
                <div className={`absolute inset-0 rounded-2xl border-2 border-dashed transition-colors duration-500 ${
                  workerReady ? 'border-white/55' : 'border-white/18'
                }`} />

                {/* Solid corner reinforcements */}
                {[
                  'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl',
                  'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl',
                  'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl',
                  'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl',
                ].map((cls) => (
                  <div key={cls}
                    className={`absolute w-7 h-7 transition-colors duration-500 ${workerReady ? 'border-white' : 'border-white/25'} ${cls}`}
                    style={{ margin: '-2px' }}
                  />
                ))}

                {/* Hint text */}
                {!flashName && workerReady && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-white/45 text-xs font-medium text-center leading-relaxed px-6">
                      Remplis le cadre{'\n'}avec la carte
                    </p>
                  </div>
                )}

                {/* Loading */}
                {!workerReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Loader2 size={20} className="text-white/50 animate-spin" />
                    <p className="text-[11px] text-white/40">Initialisation…</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Zoom controls (right side) ─────────────────────────── */}
            <div className="absolute right-3 flex flex-col items-center gap-2.5 z-10"
              style={{ top: '50%', transform: 'translateY(calc(-50% - 136px))' }}
            >
              <button type="button" onClick={() => applyZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}
                className="w-9 h-9 rounded-full bg-black/60 border border-white/18 text-white flex items-center justify-center disabled:opacity-25 backdrop-blur-sm active:scale-95 transition-transform"
              >
                <Plus size={15} />
              </button>

              <div className="flex flex-col items-center gap-[5px] py-0.5">
                {zoomDots.map((v) => (
                  <button key={v} type="button" onClick={() => applyZoom(v)}
                    className={`rounded-full transition-all duration-150 ${
                      Math.abs(zoom - v) < 0.01
                        ? 'w-2.5 h-2.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'
                        : 'w-1.5 h-1.5 bg-white/28 hover:bg-white/55'
                    }`}
                  />
                ))}
              </div>

              <span className="text-[10px] font-bold text-white/65 font-mono bg-black/55 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                ×{zoom.toFixed(1)}
              </span>

              <button type="button" onClick={() => applyZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}
                className="w-9 h-9 rounded-full bg-black/60 border border-white/18 text-white flex items-center justify-center disabled:opacity-25 backdrop-blur-sm active:scale-95 transition-transform"
              >
                <Minus size={15} />
              </button>
            </div>

            {/* ── Detection badge ────────────────────────────────────── */}
            {flashName && (
              <div
                className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500 text-white text-sm font-bold shadow-xl pointer-events-none whitespace-nowrap animate-bounce-once"
                style={{ bottom: 'calc(272px + 10%)' }}
              >
                <CheckCircle2 size={14} />
                {flashName}
              </div>
            )}

            {/* OCR debug */}
            {ocrDebug && workerReady && (
              <div className="absolute bottom-3 left-3 text-[9px] text-white/25 font-mono pointer-events-none bg-black/40 px-1.5 py-0.5 rounded">
                {ocrDebug}
              </div>
            )}

            {/* ── Ambiguity overlay ──────────────────────────────────── */}
            {candidates.length > 0 && (
              <div className="absolute inset-x-0 top-0 bg-black/88 flex flex-col z-20 backdrop-blur-sm" style={{ bottom: 272 }}>
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/8 shrink-0">
                  <div>
                    <p className="text-sm font-bold text-white">{candidates.length} cartes trouvées</p>
                    <p className="text-[11px] text-red-400 mt-0.5">Sélectionnez la bonne</p>
                  </div>
                  <button type="button" onClick={dismissCandidates}
                    className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {candidates.map((c) => {
                    const price = getCMTrend(c) || getMarketPrice(c)
                    return (
                      <button key={c.id} type="button" onClick={() => selectCandidate(c)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/6 hover:bg-white/12 border border-white/8 hover:border-red-400/40 text-left transition-all active:scale-[0.98]"
                      >
                        <div className="w-9 h-[52px] rounded-lg overflow-hidden bg-zinc-900 border border-white/8 shrink-0">
                          {c.images?.small
                            ? <img src={c.images.small} alt={c.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Camera size={12} className="text-white/20" /></div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">{c.name}</p>
                          <p className="text-[10px] text-white/45 mt-0.5 font-mono">{c.set?.ptcgoCode} {c.number.split('/')[0]}</p>
                          <p className="text-[10px] text-white/30">{c.rarity}</p>
                        </div>
                        {price && <span className="text-sm font-bold text-emerald-400 shrink-0">{price}€</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#080809] border-t border-white/6 flex flex-col relative" style={{ height: 272 }}>

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0">
          <span className="text-xs font-bold text-white/70">
            {detectedCards.length === 0 ? 'En cours' : `En cours · ${detectedCards.length}`}
          </span>
          {detectedCards.length > 0 && (
            <button type="button"
              onClick={() => { setDetectedCards([]); detectedCardsRef.current = []; listCooldownRef.current.clear() }}
              className="text-[11px] text-white/25 hover:text-white/55 transition-colors"
            >
              Effacer
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {detectedCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Camera size={16} className="text-white/12" />
              <p className="text-[11px] text-white/25">
                {workerReady ? 'Alignez une carte dans le cadre' : 'Démarrage…'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/4">
              {detectedCards.map((card) => {
                const isSaved   = savedUids.has(card.uid)
                const price     = card.cmTrend || card.marketPrice
                const codeLabel = `${card.setCode} ${card.number.split('/')[0]}`

                return (
                  <div key={card.uid}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isSaved ? 'bg-emerald-500/4' : ''}`}
                  >
                    <div className="w-9 h-[52px] rounded-lg overflow-hidden bg-zinc-900/80 border border-white/6 shrink-0">
                      {card.imageUrl
                        ? <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Camera size={12} className="text-white/15" /></div>
                      }
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate leading-tight ${isSaved ? 'text-emerald-400' : 'text-white'}`}>
                        {card.name}
                      </p>
                      <p className="text-[10px] text-white/35 mt-0.5 font-mono">{codeLabel}</p>
                    </div>

                    <span className={`text-[13px] font-bold shrink-0 ${price ? 'text-emerald-400' : 'text-white/20'}`}>
                      {price ? `${price}€` : '—'}
                    </span>

                    {isSaved ? (
                      <div className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-500/12 shrink-0">
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button type="button" onClick={() => openQuickAdd(card)}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black hover:bg-white/90 active:scale-95 transition-all"
                        >
                          <Plus size={14} />
                        </button>
                        <button type="button" onClick={() => removeCard(card.uid)}
                          className="text-[9px] text-white/18 hover:text-white/45 transition-colors leading-none"
                        >✕</button>
                      </div>
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
              <button type="button" onClick={() => setQuickAddCard(null)} className="text-white/35 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-[56px] rounded-lg overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                  {quickAddCard.imageUrl && <img src={quickAddCard.imageUrl} alt={quickAddCard.name} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{quickAddCard.name}</p>
                  <p className="text-[10px] text-white/35 mt-0.5 font-mono">{quickAddCard.setCode} {quickAddCard.number.split('/')[0]}</p>
                  <p className="text-[10px] text-white/25">{quickAddCard.rarityFR}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-white/35">Prix d&apos;achat</label>
                <div className="relative">
                  <input
                    type="number" step="0.01" min="0"
                    placeholder={quickAddCard.cmTrend || quickAddCard.marketPrice || '0.00'}
                    value={quickPrice}
                    onChange={(e) => setQuickPrice(e.target.value)}
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 pr-8 text-sm text-white placeholder-white/18 focus:outline-none focus:border-white/28 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/28">€</span>
                </div>
                {(quickAddCard.cmTrend || quickAddCard.marketPrice) && (
                  <button type="button"
                    onClick={() => setQuickPrice(quickAddCard.cmTrend || quickAddCard.marketPrice)}
                    className="text-[11px] text-left text-white/28 hover:text-emerald-400 transition-colors"
                  >
                    {quickAddCard.cmTrend ? 'CM Trend : ' : 'Prix marché : '}
                    <span className="text-emerald-400 font-semibold">{quickAddCard.cmTrend || quickAddCard.marketPrice}€</span>
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                {(['CELIAN', 'ROMAIN'] as const).map((loc) => (
                  <button key={loc} type="button" onClick={() => setQuickLocation(loc)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      quickLocation === loc
                        ? 'bg-white/10 border-white/25 text-white'
                        : 'border-white/6 text-white/28 hover:text-white/55'
                    }`}
                  >
                    {loc === 'CELIAN' ? 'Célian' : 'Romain'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 px-4 pb-4 pt-2 shrink-0">
              <button type="button" onClick={() => setQuickAddCard(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/8 text-sm text-white/35 hover:text-white transition-colors"
              >
                Retour
              </button>
              <button type="button" onClick={handleQuickSave}
                disabled={saving || (!quickPrice && !quickAddCard.cmTrend && !quickAddCard.marketPrice)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-white/92 disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
              >
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
