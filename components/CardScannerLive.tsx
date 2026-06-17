'use client'

import { useRef, useState, useEffect } from 'react'
import { Camera, X, Plus, CheckCircle2, AlertCircle, Loader2, Zap, Scan } from 'lucide-react'
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
  uid: string
  apiId: string
  name: string
  number: string
  setName: string
  setCode: string
  rarityFR: string
  imageUrl: string
  marketPrice: string
}

// ── Constants ───────────────────────────────────────────────────────────────
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

const SCAN_INTERVAL_MS = 300
const COOLDOWN_MS      = 20_000 // 20s per card before re-detect

// ── Helpers ─────────────────────────────────────────────────────────────────
function getMarketPrice(card: ApiCard): string {
  const cm = card.cardmarket?.prices?.averageSellPrice
  if (cm) return cm.toFixed(2)
  if (card.tcgplayer?.prices) {
    for (const tier of Object.values(card.tcgplayer.prices)) {
      if (tier?.market) return tier.market.toFixed(2)
    }
  }
  return ''
}

function preprocessCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width  = src.width
  out.height = src.height
  const ctx = out.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d   = img.data
  for (let i = 0; i < d.length; i += 4) {
    const gray     = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.8 + 128))
    d[i] = d[i + 1] = d[i + 2] = enhanced
  }
  ctx.putImageData(img, 0, 0)
  return out
}

function parseCardInfo(rawText: string): { number: string | null; setCode: string | null } {
  const text = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ')
  const patterns = [
    /\b(TG\s?\d{1,2})\s?\/\s?(TG\s?\d{1,2})\b/i,
    /\b(GG\s?\d{1,2})\s?\/\s?(GG\s?\d{1,2})\b/i,
    /\b(\d{1,3})\s?\/\s?(\d{1,3})\b/,
  ]
  let cardNumber: string | null = null
  let numIndex = -1
  for (const re of patterns) {
    const m = text.match(re)
    if (m) { cardNumber = m[0].replace(/\s/g, '').toUpperCase(); numIndex = text.indexOf(m[0]); break }
  }
  if (!cardNumber || numIndex === -1) return { number: null, setCode: null }

  const prefix = text.slice(Math.max(0, numIndex - 70), numIndex)
  const tokens = prefix.trim().split(/\s+/).filter(Boolean)
  let setCode: string | null = null
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^[A-Z]{3,5}$/.test(tokens[i])) { setCode = tokens[i]; break }
  }
  return { number: cardNumber, setCode }
}

async function fetchCard(number: string, setCode: string | null): Promise<ApiCard | null> {
  const numPart = number.split('/')[0]
  const queries = setCode
    ? [`number:${numPart} set.ptcgoCode:${setCode}`, `number:${numPart}`]
    : [`number:${numPart}`]

  for (const q of queries) {
    const res  = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=1`)
    if (!res.ok) continue
    const json = await res.json() as { data: ApiCard[] }
    if (json.data?.length) return json.data[0]
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
  const videoRef       = useRef<HTMLVideoElement>(null)
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const workerRef      = useRef<import('tesseract.js').Worker | null>(null)
  const isProcessingRef= useRef(false)
  const cooldownMapRef = useRef(new Map<string, number>())
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef     = useRef(false)

  const [workerReady, setWorkerReady]   = useState(false)
  const [cameraError, setCameraError]   = useState('')
  const [detectedCards, setDetectedCards] = useState<DetectedCard[]>([])
  const [flashCard, setFlashCard]       = useState<string | null>(null)
  const [quickAddCard, setQuickAddCard] = useState<DetectedCard | null>(null)
  const [quickPrice, setQuickPrice]     = useState('')
  const [quickLocation, setQuickLocation] = useState<'CELIAN' | 'ROMAIN'>('CELIAN')
  const [saving, setSaving]             = useState(false)
  const [savedUids, setSavedUids]       = useState<Set<string>>(new Set())
  const [scanCount, setScanCount]       = useState(0)

  useEffect(() => {
    if (!open) return
    mountedRef.current = true
    setWorkerReady(false)
    setCameraError('')
    setDetectedCards([])
    setFlashCard(null)
    setQuickAddCard(null)
    setSavedUids(new Set())
    setScanCount(0)
    cooldownMapRef.current.clear()

    async function init() {
      // 1. Camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) {
        if (!mountedRef.current) return
        const e = err as Error
        if (e.name === 'NotAllowedError')  setCameraError("Accès caméra refusé. Autorisez-le dans les réglages.")
        else if (e.name === 'NotFoundError') setCameraError('Aucune caméra détectée.')
        else setCameraError("Impossible d'accéder à la caméra.")
        return
      }

      // 2. OCR Worker
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      if (!mountedRef.current) { await worker.terminate(); return }
      workerRef.current = worker
      if (mountedRef.current) setWorkerReady(true)

      // 3. Scan loop
      async function doScan() {
        if (!mountedRef.current || !workerRef.current || isProcessingRef.current) return
        const video = videoRef.current
        if (!video || video.readyState < 2 || video.videoWidth === 0) return

        isProcessingRef.current = true
        try {
          const canvas = canvasRef.current!
          canvas.width  = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d')!.drawImage(video, 0, 0)

          // Crop bottom 30% (number + set code zone)
          const botH = Math.floor(canvas.height * 0.30)
          const bot  = document.createElement('canvas')
          bot.width  = canvas.width
          bot.height = botH
          bot.getContext('2d')!.drawImage(canvas, 0, canvas.height - botH, canvas.width, botH, 0, 0, canvas.width, botH)

          const { data } = await workerRef.current.recognize(preprocessCanvas(bot))
          if (!mountedRef.current) return

          const { number, setCode } = parseCardInfo(data.text)
          if (!number) return

          const key = `${number}-${setCode ?? 'x'}`
          const now = Date.now()
          if ((cooldownMapRef.current.get(key) ?? 0) + COOLDOWN_MS > now) return
          cooldownMapRef.current.set(key, now)

          setScanCount((c) => c + 1)

          const apiCard = await fetchCard(number, setCode)
          if (!apiCard || !mountedRef.current) return

          const card: DetectedCard = {
            uid:        `${apiCard.id}-${now}`,
            apiId:      apiCard.id,
            name:       apiCard.name,
            number,
            setName:    apiCard.set?.name ?? '',
            setCode:    apiCard.set?.ptcgoCode ?? setCode ?? '',
            rarityFR:   RARITY_MAP[apiCard.rarity ?? ''] ?? apiCard.rarity ?? '',
            imageUrl:   apiCard.images?.small ?? '',
            marketPrice: getMarketPrice(apiCard),
          }

          setDetectedCards((prev) => [card, ...prev])
          setFlashCard(card.name)
          setTimeout(() => { if (mountedRef.current) setFlashCard(null) }, 2200)
        } finally {
          isProcessingRef.current = false
        }
      }

      intervalRef.current = setInterval(doScan, SCAN_INTERVAL_MS)
    }

    init()

    return () => {
      mountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
      workerRef.current?.terminate().catch(() => {})
      workerRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      isProcessingRef.current = false
    }
  }, [open])

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
      setSavedUids((prev) => new Set([...prev, quickAddCard.uid]))
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-5 h-14 bg-black/80 backdrop-blur border-b border-zinc-800/60 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <Scan size={12} className="text-emerald-400" />
          </div>
          <span className="text-sm font-bold text-white tracking-wide">Scanner Live</span>
          {workerReady && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-medium">{detectedCards.length} carte{detectedCards.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* ── Video area ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 bg-black overflow-hidden">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8">
            <Camera size={32} className="text-zinc-600" />
            <p className="text-sm text-zinc-400 leading-relaxed">{cameraError}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Vignette */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 65% 85% at 50% 50%, transparent 45%, rgba(0,0,0,0.65) 100%)' }}
            />

            {/* Card frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`relative rounded-xl transition-all duration-500 ${
                  workerReady ? 'border-2 border-emerald-400/75 shadow-lg shadow-emerald-500/20' : 'border-2 border-zinc-700/60'
                }`}
                style={{ width: '55%', aspectRatio: '5/7' }}
              >
                {/* Corner accents */}
                {(['top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl',
                   'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl',
                   'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl',
                   'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl',
                ] as const).map((cls) => (
                  <div
                    key={cls}
                    className={`absolute w-5 h-5 ${workerReady ? 'border-emerald-400' : 'border-zinc-600'} ${cls}`}
                    style={{ margin: '-2px' }}
                  />
                ))}

                {/* Scan progress bar */}
                {workerReady && (
                  <div className="absolute bottom-0 left-0 right-0 h-[16%] bg-emerald-400/8 border-t border-emerald-400/20 rounded-b-xl flex items-center justify-center gap-1.5">
                    <span className="text-[9px] text-emerald-400/70 font-bold tracking-widest uppercase">N° · Code Set</span>
                  </div>
                )}

                {/* Scan line animation */}
                {workerReady && (
                  <div
                    className="absolute left-2 right-2 h-px bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent"
                    style={{ animation: 'scanLine 2.5s ease-in-out infinite', top: '0%' }}
                  />
                )}
              </div>
            </div>

            {/* Init overlay */}
            {!workerReady && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 pointer-events-none">
                <Loader2 size={24} className="text-emerald-400 animate-spin" />
                <p className="text-xs text-zinc-400 font-medium">Initialisation du scanner…</p>
              </div>
            )}

            {/* Detection flash */}
            {flashCard && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500 text-black text-xs font-bold shadow-lg shadow-emerald-500/30 pointer-events-none">
                <Zap size={11} />
                {flashCard}
              </div>
            )}

            {/* Scan counter */}
            {workerReady && scanCount > 0 && (
              <div className="absolute top-4 right-4 text-[10px] text-zinc-600 font-mono pointer-events-none">
                {scanCount} tentatives
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      <div className="shrink-0 h-[268px] bg-[#0c0c0e] border-t border-zinc-800/80 flex flex-col relative">

        {/* Sheet header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">
              {detectedCards.length === 0 ? 'En attente de détection…' : `${detectedCards.length} carte${detectedCards.length > 1 ? 's' : ''} détectée${detectedCards.length > 1 ? 's' : ''}`}
            </span>
          </div>
          {detectedCards.length > 0 && (
            <button
              type="button"
              onClick={() => { setDetectedCards([]); cooldownMapRef.current.clear() }}
              className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Effacer
            </button>
          )}
        </div>

        {/* Cards list */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
          {detectedCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
              <Camera size={20} className="text-zinc-700" />
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                {workerReady
                  ? 'Passez une carte devant l\'objectif'
                  : 'Démarrage en cours…'}
              </p>
            </div>
          ) : (
            detectedCards.map((card) => {
              const isSaved = savedUids.has(card.uid)
              return (
                <div
                  key={card.uid}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${isSaved ? 'bg-emerald-500/5' : 'hover:bg-zinc-800/30'}`}
                >
                  {/* Thumbnail */}
                  <div className="w-9 h-[52px] rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera size={14} className="text-zinc-700" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isSaved ? 'text-emerald-400' : 'text-white'}`}>
                      {card.name}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                      {card.setName} · #{card.number}
                    </p>
                    <p className="text-[10px] text-zinc-600 truncate">{card.rarityFR}</p>
                  </div>

                  {/* Price */}
                  {card.marketPrice && (
                    <span className="text-xs font-bold text-emerald-400 shrink-0">
                      {card.marketPrice}€
                    </span>
                  )}

                  {/* Action */}
                  {isSaved ? (
                    <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/25 shrink-0">
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openQuickAdd(card)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black transition-colors shrink-0"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ── Quick-add panel ──────────────────────────────────────────── */}
        {quickAddCard && (
          <div className="absolute inset-0 bg-[#0c0c0e] border-t border-zinc-700 flex flex-col z-10">
            {/* Mini header */}
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
                  {quickAddCard.imageUrl && (
                    <img src={quickAddCard.imageUrl} alt={quickAddCard.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{quickAddCard.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{quickAddCard.setName} · #{quickAddCard.number}</p>
                  <p className="text-[10px] text-zinc-600">{quickAddCard.rarityFR}</p>
                </div>
              </div>

              {/* Price */}
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
                  <button
                    type="button"
                    onClick={() => setQuickPrice(quickAddCard.marketPrice)}
                    className="text-[11px] text-zinc-500 hover:text-emerald-400 text-left transition-colors"
                  >
                    Utiliser le prix marché : <span className="text-emerald-400 font-semibold">{quickAddCard.marketPrice}€</span>
                  </button>
                )}
              </div>

              {/* Location */}
              <div className="flex gap-2">
                {(['CELIAN', 'ROMAIN'] as const).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setQuickLocation(loc)}
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

            {/* Save button */}
            <div className="flex gap-2 px-4 pb-4 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setQuickAddCard(null)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleQuickSave}
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

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Scan line keyframe */}
      <style>{`
        @keyframes scanLine {
          0%   { top: 5%;  opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 82%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
