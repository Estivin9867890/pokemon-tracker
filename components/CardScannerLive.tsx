'use client'

import { useRef, useState, useEffect } from 'react'
import { X, Plus, CheckCircle2, Loader2, Zap, Scan, Camera } from 'lucide-react'
import { ItemFormData } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────
interface ApiCard {
  id: string
  name: string
  number: string
  set?: { name: string; ptcgoCode?: string }
  rarity?: string
  images?: { small: string; large: string }
  cardmarket?: { prices?: { averageSellPrice?: number } }
  tcgplayer?: { prices?: Record<string, { market?: number }> }
}

export interface DetectedCard {
  uid: string        // unique per detection event
  apiId: string      // card ID from API (for dedup)
  name: string
  number: string
  setName: string
  setCode: string
  rarityFR: string
  imageUrl: string
  marketPrice: string
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

const SCAN_INTERVAL_MS = 350
// Debounce: ignore same card within 2s to avoid scanning 50× the same card
const SAME_CARD_DEBOUNCE_MS = 2_000
// After a card is in the list, block re-adding it for 30s
const LIST_COOLDOWN_MS = 30_000

// ── Image preprocessing ─────────────────────────────────────────────────────
/**
 * Crops the bottom `heightRatio` of the source canvas,
 * scales it up by `scale` factor (larger pixels → better OCR),
 * and applies grayscale + strong contrast boost.
 */
function cropScalePreprocess(
  src: HTMLCanvasElement,
  cropFromTop = 0.70,
  scale = 3,
): HTMLCanvasElement {
  const srcH   = src.height
  const cropY  = Math.floor(srcH * cropFromTop)
  const cropH  = srcH - cropY

  const out    = document.createElement('canvas')
  out.width    = src.width * scale
  out.height   = cropH * scale

  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Draw cropped region scaled up
  ctx.drawImage(src, 0, cropY, src.width, cropH, 0, 0, out.width, out.height)

  // Grayscale + heavy contrast (×2.2) for better binarisation on shiny cards
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
interface CardInfo {
  number: string | null
  setCode: string | null
}

function parseCardInfo(rawText: string): CardInfo {
  // 1. Flatten newlines
  let text = rawText.replace(/\n/g, ' ')

  // 2. Collapse spaces between adjacent digit groups (OCR splits "226" → "2 26")
  //    Repeat twice to handle "2 2 6"
  text = text.replace(/(\d)\s+(\d)/g, '$1$2')
  text = text.replace(/(\d)\s+(\d)/g, '$1$2')
  text = text.replace(/\s+/g, ' ')

  // 3. Match card number patterns (secret rares: numerator > denominator is OK)
  const patterns: RegExp[] = [
    /\b(TG\d{1,2})\/(TG\d{1,2})\b/i,
    /\b(GG\d{1,2})\/(GG\d{1,2})\b/i,
    /\b([A-Z]{0,3}\d{1,4})\/(\d{1,4})\b/i, // covers 226/214, 250/182, SV001/SV069
  ]

  let cardNumber: string | null = null
  let numIndex = -1

  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      // Filter out false positives like "1/2" or year fragments
      const [a, b] = m[0].split('/').map((s) => parseInt(s, 10) || 0)
      if (a < 1 || b < 1 || b > 800 || a > 800) continue
      cardNumber = m[0].toUpperCase()
      numIndex   = text.indexOf(m[0])
      break
    }
  }

  if (!cardNumber || numIndex === -1) return { number: null, setCode: null }

  // 4. Extract set code from the ~80 chars BEFORE the number
  //    Card bottom format: "[RegMark] [SETCODE] [LANG] [NUM]/[TOTAL]"
  //    e.g. "G PAR FR 250/182"  →  setCode = "PAR"
  const prefix = text.slice(Math.max(0, numIndex - 80), numIndex)
  const tokens = prefix.trim().split(/\s+/).filter(Boolean)
  let setCode: string | null = null
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    // 3-5 uppercase letters = set code (skip 2-letter language codes like FR/EN/DE)
    if (/^[A-Z]{3,5}$/.test(t)) { setCode = t; break }
  }

  return { number: cardNumber, setCode }
}

// ── pokemontcg.io API ───────────────────────────────────────────────────────
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

async function fetchCard(number: string, setCode: string | null): Promise<ApiCard | null> {
  // Number part only (before "/")
  const numPart = number.split('/')[0]

  // Quote the number → forces exact match (prevents "26" matching "226")
  const queries: string[] = setCode
    ? [
        `number:"${numPart}" set.ptcgoCode:${setCode}`,
        `number:"${numPart}"`,
      ]
    : [`number:"${numPart}"`]

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=5`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (!res.ok) continue
      const json = await res.json() as { data: ApiCard[] }
      if (!json.data?.length) continue

      // If we have a set code, prefer the matching set
      if (setCode && json.data.length > 1) {
        const exact = json.data.find((c) => c.set?.ptcgoCode === setCode)
        if (exact) return exact
      }
      return json.data[0]
    } catch {
      continue
    }
  }
  return null
}

// ── Component ───────────────────────────────────────────────────────────────
interface Props {
  open: boolean
  onClose: () => void
  onQuickAdd: (data: ItemFormData) => Promise<void>
  defaultVintedFees?: number
}

export default function CardScannerLive({ open, onClose, onQuickAdd, defaultVintedFees = 0 }: Props) {
  // DOM / stream refs
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const workerRef   = useRef<import('tesseract.js').Worker | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef  = useRef(false)

  // State machine lock
  const isProcessingRef = useRef(false)

  // Deduplication refs (avoid stale closures in setInterval)
  const lastDetectionRef  = useRef<{ apiId: string; time: number } | null>(null)
  const listCooldownRef   = useRef(new Map<string, number>()) // apiId → timestamp when added to list
  const detectedCardsRef  = useRef<DetectedCard[]>([])
  const savedUidsRef      = useRef<Set<string>>(new Set())

  // UI state
  const [workerReady, setWorkerReady]     = useState(false)
  const [cameraError, setCameraError]     = useState('')
  const [detectedCards, setDetectedCards] = useState<DetectedCard[]>([])
  const [flashName, setFlashName]         = useState<string | null>(null)
  const [ocrDebug, setOcrDebug]           = useState('')   // visible debug line
  const [quickAddCard, setQuickAddCard]   = useState<DetectedCard | null>(null)
  const [quickPrice, setQuickPrice]       = useState('')
  const [quickLocation, setQuickLocation] = useState<'CELIAN' | 'ROMAIN'>('CELIAN')
  const [saving, setSaving]               = useState(false)
  const [savedUids, setSavedUids]         = useState<Set<string>>(new Set())

  // ── Lifecycle ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    mountedRef.current = true

    // Reset all state
    setWorkerReady(false)
    setCameraError('')
    setDetectedCards([])
    detectedCardsRef.current = []
    setFlashName(null)
    setOcrDebug('')
    setQuickAddCard(null)
    setSavedUids(new Set())
    savedUidsRef.current = new Set()
    listCooldownRef.current.clear()
    lastDetectionRef.current = null
    isProcessingRef.current  = false

    async function init() {
      // ── 1. Camera ───────────────────────────────────────────────────────
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })
        if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) {
        if (!mountedRef.current) return
        const name = (err as Error).name
        if (name === 'NotAllowedError')  setCameraError("Accès caméra refusé. Autorisez-le dans les réglages du navigateur.")
        else if (name === 'NotFoundError') setCameraError('Aucune caméra détectée sur cet appareil.')
        else setCameraError("Impossible d'accéder à la caméra.")
        return
      }

      // ── 2. Tesseract worker (created once, kept alive) ──────────────────
      try {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker('eng')
        if (!mountedRef.current) { await worker.terminate(); return }
        workerRef.current = worker
        setWorkerReady(true)
      } catch {
        if (mountedRef.current) setCameraError('Échec initialisation OCR. Rechargez la page.')
        return
      }

      // ── 3. Continuous scan loop ─────────────────────────────────────────
      async function doScan() {
        // State machine: never overlap frames
        if (!mountedRef.current || !workerRef.current || isProcessingRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2 || video.videoWidth === 0) return

        isProcessingRef.current = true
        try {
          // ── Capture frame ──────────────────────────────────────────────
          const canvas = canvasRef.current!
          canvas.width  = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d')!.drawImage(video, 0, 0)

          // ── ROI: bottom 30%, scaled 3× ─────────────────────────────────
          const ocrCanvas = cropScalePreprocess(canvas, 0.70, 3)

          // ── OCR ────────────────────────────────────────────────────────
          const { data } = await workerRef.current.recognize(ocrCanvas)
          if (!mountedRef.current) return

          const { number, setCode } = parseCardInfo(data.text)
          if (!number) return

          // ── Debounce: ignore same card for 2s ──────────────────────────
          const now  = Date.now()
          const last = lastDetectionRef.current

          // Show debug info regardless
          if (mountedRef.current) setOcrDebug(`${number}${setCode ? ` · ${setCode}` : ''}`)

          // Skip if the API query for this number is already "pending"
          // (last detection was the same number within 2s)
          if (last && last.apiId === `${number}-${setCode ?? ''}` && now - last.time < SAME_CARD_DEBOUNCE_MS) return

          lastDetectionRef.current = { apiId: `${number}-${setCode ?? ''}`, time: now }

          // ── Skip if card already in list (30s cooldown) ─────────────────
          // We'll check by number+setCode key, then by apiId after fetch
          const listKey = `${number}-${setCode ?? ''}`
          const addedAt = listCooldownRef.current.get(listKey) ?? 0
          if (now - addedAt < LIST_COOLDOWN_MS) return

          // ── API fetch ──────────────────────────────────────────────────
          const apiCard = await fetchCard(number, setCode)
          if (!mountedRef.current || !apiCard) return

          // Also dedup by API card ID
          const alreadyInList = detectedCardsRef.current.some(
            (c) => c.apiId === apiCard.id && !savedUidsRef.current.has(c.uid),
          )
          if (alreadyInList) return

          // ── Add to list ────────────────────────────────────────────────
          const card: DetectedCard = {
            uid:         `${apiCard.id}-${now}`,
            apiId:       apiCard.id,
            name:        apiCard.name,
            number,
            setName:     apiCard.set?.name ?? '',
            setCode:     apiCard.set?.ptcgoCode ?? setCode ?? '',
            rarityFR:    RARITY_MAP[apiCard.rarity ?? ''] ?? apiCard.rarity ?? '',
            imageUrl:    apiCard.images?.small ?? '',
            marketPrice: getMarketPrice(apiCard),
          }

          listCooldownRef.current.set(listKey, now)

          setDetectedCards((prev) => {
            const next = [card, ...prev]
            detectedCardsRef.current = next
            return next
          })
          setFlashName(card.name)
          setTimeout(() => { if (mountedRef.current) setFlashName(null) }, 2000)

        } catch {
          // Silently ignore scan errors — loop continues regardless
        } finally {
          // ALWAYS release the lock so the loop never stalls
          isProcessingRef.current = false
        }
      }

      // 300ms interval — doScan itself guards against overlap with isProcessingRef
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

  // ── Quick-add save ───────────────────────────────────────────────────────
  async function handleQuickSave() {
    if (!quickAddCard) return
    setSaving(true)
    const price = quickPrice || quickAddCard.marketPrice

    const formData: ItemFormData = {
      item_name:           quickAddCard.name,
      purchase_price:      price,
      vinted_fees:         String(defaultVintedFees),
      expected_sale_price: quickAddCard.marketPrice,
      location:            quickLocation === 'CELIAN' ? 'Chez Célian' : 'Chez Romain',
      notes:               '',
      pokemon_name:        quickAddCard.name,
      card_number:         quickAddCard.number,
      extension:           quickAddCard.setName,
      rarity:              quickAddCard.rarityFR,
      pokemon_category:    'SINGLE',
      poke_location:       quickLocation,
      is_graded:           false,
      grading_company:     '',
      grading_note:        '',
      is_lot:              false,
      lot_total_cost:      '',
      nb_articles:         '',
      funded_by:           null,
      hits:                [],
    }

    try {
      await onQuickAdd(formData)
      const uid = quickAddCard.uid
      setSavedUids((prev) => {
        const next = new Set([...prev, uid])
        savedUidsRef.current = next
        return next
      })
      setQuickAddCard(null)
      setQuickPrice('')
    } finally {
      setSaving(false)
    }
  }

  function openQuickAdd(card: DetectedCard) {
    setQuickAddCard(card)
    setQuickPrice(card.marketPrice)
    setQuickLocation('CELIAN')
  }

  function removeCard(uid: string) {
    setDetectedCards((prev) => {
      const next = prev.filter((c) => c.uid !== uid)
      detectedCardsRef.current = next
      return next
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-5 h-14 bg-black/80 backdrop-blur border-b border-zinc-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <Scan size={12} className="text-emerald-400" />
          </div>
          <span className="text-sm font-bold text-white tracking-wide">Scanner Live</span>
          {workerReady && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-medium">
                {detectedCards.length} détectée{detectedCards.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
        <button type="button" onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Video ──────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 bg-black overflow-hidden">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8">
            <Camera size={32} className="text-zinc-600" />
            <p className="text-sm text-zinc-400 leading-relaxed">{cameraError}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 60% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)' }}
            />

            {/* Card frame */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`relative rounded-xl transition-all duration-500 ${
                  workerReady
                    ? 'border-2 border-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.15)]'
                    : 'border-2 border-zinc-700/60'
                }`}
                style={{ width: '52%', aspectRatio: '5/7' }}
              >
                {/* Corner accents */}
                {[
                  'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl',
                  'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl',
                  'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl',
                  'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl',
                ].map((cls) => (
                  <div key={cls} className={`absolute w-5 h-5 border-emerald-400 ${cls}`} style={{ margin: '-2px' }} />
                ))}

                {/* Bottom zone label */}
                <div className="absolute bottom-0 left-0 right-0 h-[15%] bg-emerald-400/6 border-t border-emerald-400/20 rounded-b-xl flex items-center justify-center">
                  <span className="text-[8px] text-emerald-400/60 font-bold tracking-widest uppercase">N° · Set</span>
                </div>

                {/* Scan line */}
                {workerReady && (
                  <div
                    className="absolute left-2 right-2 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent pointer-events-none"
                    style={{ animation: 'scanLine 2.5s ease-in-out infinite' }}
                  />
                )}
              </div>
            </div>

            {/* Init overlay */}
            {!workerReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 pointer-events-none">
                <Loader2 size={24} className="text-emerald-400 animate-spin" />
                <p className="text-xs text-zinc-400 font-medium">Initialisation OCR…</p>
              </div>
            )}

            {/* Detection flash */}
            {flashName && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500 text-black text-xs font-bold shadow-lg pointer-events-none whitespace-nowrap">
                <Zap size={11} />
                {flashName}
              </div>
            )}

            {/* OCR debug (bottom-right of video) */}
            {ocrDebug && workerReady && (
              <div className="absolute bottom-3 right-3 text-[9px] text-zinc-600 font-mono pointer-events-none bg-black/50 px-1.5 py-0.5 rounded">
                {ocrDebug}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bottom sheet ───────────────────────────────────────────────── */}
      <div
        className="shrink-0 bg-[#0c0c0e] border-t border-zinc-800/80 flex flex-col relative"
        style={{ height: 272 }}
      >
        {/* Sheet header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/50 shrink-0">
          <span className="text-xs font-bold text-white">
            {detectedCards.length === 0 ? 'Passez une carte devant l\'objectif…' : `${detectedCards.length} carte${detectedCards.length > 1 ? 's' : ''} détectée${detectedCards.length > 1 ? 's' : ''}`}
          </span>
          {detectedCards.length > 0 && (
            <button type="button" onClick={() => { setDetectedCards([]); detectedCardsRef.current = []; listCooldownRef.current.clear() }}
              className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Tout effacer
            </button>
          )}
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto">
          {detectedCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
              <Camera size={18} className="text-zinc-700" />
              <p className="text-[11px] text-zinc-600">
                {workerReady ? 'Scanner actif — alignez la carte dans le cadre' : 'Démarrage…'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {detectedCards.map((card) => {
                const isSaved = savedUids.has(card.uid)
                return (
                  <div key={card.uid}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isSaved ? 'bg-emerald-500/5' : ''}`}
                  >
                    {/* Thumbnail */}
                    <div className="w-9 h-[52px] rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                      {card.imageUrl
                        ? <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Camera size={14} className="text-zinc-700" /></div>
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate leading-tight ${isSaved ? 'text-emerald-400' : 'text-white'}`}>
                        {card.name}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                        {card.setName}{card.setCode ? ` (${card.setCode})` : ''} · #{card.number}
                      </p>
                      <p className="text-[10px] text-zinc-600 truncate">{card.rarityFR}</p>
                    </div>

                    {/* Cardmarket price */}
                    {card.marketPrice && (
                      <span className="text-xs font-bold text-emerald-400 shrink-0">{card.marketPrice}€</span>
                    )}

                    {/* Action */}
                    {isSaved ? (
                      <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/25 shrink-0">
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button type="button" onClick={() => openQuickAdd(card)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                        <button type="button" onClick={() => removeCard(card.uid)}
                          className="w-8 h-4 flex items-center justify-center text-zinc-700 hover:text-zinc-500 transition-colors text-[9px]"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Quick-add panel (slides over bottom sheet) ──────────────── */}
        {quickAddCard && (
          <div className="absolute inset-0 bg-[#0d0d0f] border-t border-zinc-700 flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 shrink-0">
              <span className="text-xs font-bold text-white">Ajouter au stock</span>
              <button type="button" onClick={() => setQuickAddCard(null)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Card preview */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-[56px] rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                  {quickAddCard.imageUrl && <img src={quickAddCard.imageUrl} alt={quickAddCard.name} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{quickAddCard.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{quickAddCard.setName} · #{quickAddCard.number}</p>
                  <p className="text-[10px] text-zinc-600">{quickAddCard.rarityFR}</p>
                </div>
              </div>

              {/* Price input */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-zinc-400">Prix d&apos;achat</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={quickAddCard.marketPrice || '0.00'}
                    value={quickPrice}
                    onChange={(e) => setQuickPrice(e.target.value)}
                    autoFocus
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 pr-8 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">€</span>
                </div>
                {quickAddCard.marketPrice && (
                  <button type="button" onClick={() => setQuickPrice(quickAddCard.marketPrice)}
                    className="text-[11px] text-left text-zinc-500 hover:text-emerald-400 transition-colors"
                  >
                    Utiliser le prix marché Cardmarket :{' '}
                    <span className="text-emerald-400 font-semibold">{quickAddCard.marketPrice}€</span>
                  </button>
                )}
              </div>

              {/* Location */}
              <div className="flex gap-2">
                {(['CELIAN', 'ROMAIN'] as const).map((loc) => (
                  <button key={loc} type="button" onClick={() => setQuickLocation(loc)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      quickLocation === loc
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                        : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    📍 {loc === 'CELIAN' ? 'Célian' : 'Romain'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 px-4 pb-4 pt-2 shrink-0">
              <button type="button" onClick={() => setQuickAddCard(null)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Retour
              </button>
              <button type="button" onClick={handleQuickSave}
                disabled={saving || (!quickPrice && !quickAddCard.marketPrice)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Ajouter au stock
              </button>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <style>{`
        @keyframes scanLine {
          0%   { top: 4%;  opacity: 0; }
          8%   { opacity: 1; }
          85%  { opacity: 1; }
          100% { top: 80%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
