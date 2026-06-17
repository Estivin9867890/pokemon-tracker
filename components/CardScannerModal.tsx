'use client'

import { useRef, useState, useEffect } from 'react'
import { Camera, X, Scan, AlertCircle, CheckCircle2, Loader2, RefreshCw, Info } from 'lucide-react'
import { ItemFormData } from '@/types'

export type ScanData = Pick<ItemFormData, 'pokemon_name' | 'card_number' | 'extension' | 'rarity' | 'expected_sale_price'>

interface CardScannerModalProps {
  open: boolean
  onClose: () => void
  onResult: (data: Partial<ScanData>) => void
}

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

type ScanStatus = 'idle' | 'scanning' | 'fetching' | 'success' | 'error'

interface ApiCard {
  name: string
  number: string
  set?: { name: string; ptcgoCode?: string }
  rarity?: string
  cardmarket?: { prices?: { averageSellPrice?: number } }
  tcgplayer?: { prices?: Record<string, { market?: number }> }
}

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

// ── Image preprocessing ────────────────────────────────────────────────────
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
    // Sharpen contrast
    const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.8 + 128))
    d[i] = d[i + 1] = d[i + 2] = enhanced
  }
  ctx.putImageData(img, 0, 0)
  return out
}

// ── Card info extraction ───────────────────────────────────────────────────
interface CardInfo {
  number: string | null
  setCode: string | null
}

function parseCardInfo(rawText: string): CardInfo {
  const text = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ')

  // Find card number (support XXX/XXX, TGxx/TGxx, GGxx/GGxx)
  const numberPatterns = [
    /\b(TG\s?\d{1,2})\s?\/\s?(TG\s?\d{1,2})\b/i,
    /\b(GG\s?\d{1,2})\s?\/\s?(GG\s?\d{1,2})\b/i,
    /\b(\d{1,3})\s?\/\s?(\d{1,3})\b/,
  ]

  let cardNumber: string | null = null
  let numIndex = -1

  for (const re of numberPatterns) {
    const m = text.match(re)
    if (m) {
      cardNumber = m[0].replace(/\s/g, '').toUpperCase()
      numIndex   = text.indexOf(m[0])
      break
    }
  }

  if (!cardNumber || numIndex === -1) return { number: null, setCode: null }

  // Set code is in the ~60 chars before the number
  // Format on cards: "[Regulation] [SETCODE] [LANG] [NUM]/[TOTAL]"
  // e.g. "G PAR FR 250/182" → setCode = "PAR"
  const prefix = text.slice(Math.max(0, numIndex - 70), numIndex).trim()
  const tokens = prefix.split(/\s+/).filter(Boolean)

  let setCode: string | null = null
  // Walk backwards: skip 2-letter language codes, grab first 3-5 letter uppercase word
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (/^[A-Z]{3,5}$/.test(t)) {
      setCode = t
      break
    }
    // 2-letter = likely language code (FR, EN, DE…), keep looking
  }

  return { number: cardNumber, setCode }
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CardScannerModal({ open, onClose, onResult }: CardScannerModalProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [status, setStatus]               = useState<ScanStatus>('idle')
  const [message, setMessage]             = useState('')
  const [debugInfo, setDebugInfo]         = useState('')
  const [cameraError, setCameraError]     = useState('')
  const [multipleCards, setMultipleCards] = useState<ApiCard[]>([])

  async function startCamera() {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch (err) {
      const e = err as Error
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setCameraError("Accès à la caméra refusé. Autorisez l'accès dans les réglages de votre navigateur.")
      } else if (e.name === 'NotFoundError') {
        setCameraError('Aucune caméra détectée sur cet appareil.')
      } else {
        setCameraError("Impossible d'accéder à la caméra.")
      }
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    if (open) {
      setStatus('idle')
      setMessage('')
      setDebugInfo('')
      setCameraError('')
      setMultipleCards([])
      startCamera()
    } else {
      stopCamera()
    }
    return stopCamera
  }, [open])

  async function handleCapture() {
    if (!videoRef.current || !canvasRef.current) return

    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth  || 1920
    canvas.height = video.videoHeight || 1080

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)

    setStatus('scanning')
    setMessage('Lecture de la carte en cours…')
    setDebugInfo('')
    setMultipleCards([])

    try {
      const { createWorker } = await import('tesseract.js')

      // ── Pass 1 : scan full card for set code + number ──────────────────
      const fullCanvas = preprocessCanvas(canvas)
      const worker = await createWorker('eng')
      const { data: fullData } = await worker.recognize(fullCanvas)
      await worker.terminate()

      const { number: cardNumber, setCode } = parseCardInfo(fullData.text)

      // ── Pass 2 : if number not found, retry on bottom 40% only ─────────
      let finalNumber = cardNumber
      let finalSetCode = setCode

      if (!finalNumber) {
        const botH = Math.floor(canvas.height * 0.40)
        const botCanvas = document.createElement('canvas')
        botCanvas.width  = canvas.width
        botCanvas.height = botH
        const botCtx = botCanvas.getContext('2d')!
        botCtx.drawImage(canvas, 0, canvas.height - botH, canvas.width, botH, 0, 0, canvas.width, botH)
        const preprocessed = preprocessCanvas(botCanvas)

        const worker2 = await createWorker('eng')
        const { data: botData } = await worker2.recognize(preprocessed)
        await worker2.terminate()

        const parsed = parseCardInfo(botData.text)
        finalNumber  = parsed.number
        finalSetCode = parsed.setCode
      }

      if (!finalNumber) {
        setStatus('error')
        setMessage('Numéro non détecté. Placez la carte entière dans le cadre, bien éclairée.')
        return
      }

      setDebugInfo(`N° ${finalNumber}${finalSetCode ? ` · Set ${finalSetCode}` : ''}`)
      setStatus('fetching')
      setMessage('Recherche dans la base Pokémon TCG…')

      // ── Build precise API query ────────────────────────────────────────
      const numPart = finalNumber.split('/')[0]

      // Primary: number + set code (very precise, should return 1 result)
      // Fallback: number only
      const queries = finalSetCode
        ? [
            `number:${numPart} set.ptcgoCode:${finalSetCode}`,
            `number:${numPart}`,
          ]
        : [`number:${numPart}`]

      let cards: ApiCard[] = []
      for (const q of queries) {
        const res = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=10`
        )
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json() as { data: ApiCard[] }
        if (json.data?.length) {
          cards = json.data
          break
        }
      }

      if (!cards.length) {
        setStatus('error')
        setMessage(`Aucune carte trouvée pour le n° ${finalNumber}${finalSetCode ? ` (${finalSetCode})` : ''}. Vérifiez l'alignement.`)
        return
      }

      if (cards.length === 1) {
        applyCard(cards[0], finalNumber)
      } else {
        setMultipleCards(cards)
        setStatus('error')
        setMessage(`${cards.length} cartes trouvées — sélectionnez la bonne :`)
      }
    } catch {
      setStatus('error')
      setMessage("Erreur lors de l'analyse. Vérifiez votre connexion et réessayez.")
    }
  }

  function applyCard(card: ApiCard, detectedNumber: string) {
    const rarity = RARITY_MAP[card.rarity ?? ''] ?? card.rarity ?? ''
    onResult({
      pokemon_name:        card.name,
      card_number:         detectedNumber,
      extension:           card.set?.name ?? '',
      rarity,
      expected_sale_price: getMarketPrice(card),
    })
    setStatus('success')
    setMessage(`${card.name} détecté ! Vérifiez les infos puis cliquez "Ajouter au stock".`)
    setTimeout(() => onClose(), 1800)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#111113] border border-zinc-800 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Camera size={15} className="text-emerald-400" />
            <span className="text-sm font-semibold text-white">Scanner une carte</span>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {cameraError ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Camera size={24} className="text-red-400" />
              </div>
              <p className="text-sm text-zinc-300 max-w-xs leading-relaxed">{cameraError}</p>
              <button
                type="button"
                onClick={startCamera}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition-colors"
              >
                <RefreshCw size={13} />
                Réessayer
              </button>
            </div>
          ) : (
            <>
              {/* ── Viewfinder ────────────────────────────────────────── */}
              <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Dark vignette sides */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse 60% 90% at 50% 50%, transparent 60%, rgba(0,0,0,0.55) 100%)' }}
                />

                {/* Full card frame (portrait, centered) */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="relative border-2 border-emerald-400/70 rounded-lg"
                    style={{ width: '52%', aspectRatio: '5/7' }}
                  >
                    {/* Corner markers */}
                    {[
                      'top-0 left-0 border-t-2 border-l-2 rounded-tl',
                      'top-0 right-0 border-t-2 border-r-2 rounded-tr',
                      'bottom-0 left-0 border-b-2 border-l-2 rounded-bl',
                      'bottom-0 right-0 border-b-2 border-r-2 rounded-br',
                    ].map((cls) => (
                      <div
                        key={cls}
                        className={`absolute w-4 h-4 border-emerald-400 ${cls}`}
                        style={{ margin: '-2px' }}
                      />
                    ))}

                    {/* Bottom band: number zone indicator */}
                    <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-emerald-400/10 border-t border-emerald-400/30 rounded-b flex items-center justify-center">
                      <span className="text-[8px] text-emerald-400/70 font-semibold tracking-widest uppercase">
                        N° + Code set
                      </span>
                    </div>
                  </div>
                </div>

                {/* Scanning animation */}
                {(status === 'scanning' || status === 'fetching') && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={30} className="animate-spin text-emerald-400" />
                    <span className="text-xs text-white font-medium">
                      {status === 'scanning' ? 'Lecture OCR…' : 'Recherche…'}
                    </span>
                  </div>
                )}
              </div>

              {/* ── Tip ───────────────────────────────────────────────── */}
              <div className="flex items-start gap-2 rounded-xl px-3 py-2 bg-zinc-900/60 border border-zinc-800/60">
                <Info size={11} className="text-zinc-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Placez la <strong className="text-zinc-400">carte entière</strong> dans le cadre, bien éclairée et à plat. Le bas de la carte (numéro + code set) doit être visible dans la zone verte.
                </p>
              </div>

              {/* ── Status message ────────────────────────────────────── */}
              {message && (
                <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                  status === 'error'
                    ? 'bg-red-500/8 border border-red-500/20 text-red-300'
                    : status === 'success'
                    ? 'bg-emerald-500/8 border border-emerald-500/20 text-emerald-300'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
                }`}>
                  {status === 'scanning' || status === 'fetching'
                    ? <Loader2 size={12} className="animate-spin shrink-0 mt-0.5" />
                    : status === 'error'
                    ? <AlertCircle size={12} className="shrink-0 mt-0.5 text-red-400" />
                    : <CheckCircle2 size={12} className="shrink-0 mt-0.5 text-emerald-400" />
                  }
                  <span>{message}</span>
                </div>
              )}

              {debugInfo && status !== 'idle' && (
                <p className="text-[10px] text-zinc-600 text-center font-mono">{debugInfo}</p>
              )}

              {/* ── Multiple results selector ─────────────────────────── */}
              {multipleCards.length > 0 && (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {multipleCards.map((card, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyCard(card, card.number)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/30 text-left transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white group-hover:text-emerald-400 transition-colors truncate">
                          {card.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                          {card.set?.name} · #{card.number} · {card.rarity}
                        </p>
                      </div>
                      {getMarketPrice(card) && (
                        <span className="text-xs font-bold text-emerald-400 shrink-0 ml-3">
                          {getMarketPrice(card)}€
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        {!cameraError && (
          <div className="flex gap-3 px-4 pb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCapture}
              disabled={status === 'scanning' || status === 'fetching' || status === 'success'}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors"
            >
              {status === 'scanning' || status === 'fetching' ? (
                <><Loader2 size={14} className="animate-spin" /> Analyse…</>
              ) : status === 'success' ? (
                <><CheckCircle2 size={14} /> Formulaire rempli !</>
              ) : (
                <><Scan size={14} /> Détecter</>
              )}
            </button>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}
