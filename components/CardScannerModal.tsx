'use client'

import { useRef, useState, useEffect } from 'react'
import { Camera, X, Scan, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
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
  set?: { name: string }
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

function extractCardNumber(text: string): string | null {
  const patterns = [
    /\bTG\s?\d{1,2}\s?\/\s?TG\s?\d{1,2}\b/i,
    /\bGG\s?\d{1,2}\s?\/\s?GG\s?\d{1,2}\b/i,
    /\bSV\s?\d{1,3}\s?\/\s?SV\s?\d{1,3}\b/i,
    /\b\d{1,3}\s?\/\s?\d{1,3}\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[0].replace(/\s/g, '').toUpperCase()
  }
  return null
}

export default function CardScannerModal({ open, onClose, onResult }: CardScannerModalProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)

  const [status, setStatus]           = useState<ScanStatus>('idle')
  const [message, setMessage]         = useState('')
  const [cameraError, setCameraError] = useState('')
  const [multipleCards, setMultipleCards] = useState<ApiCard[]>([])

  async function startCamera() {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      const e = err as Error
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setCameraError("Accès à la caméra refusé. Autorisez l'accès dans les réglages de votre navigateur.")
      } else if (e.name === 'NotFoundError') {
        setCameraError('Aucune caméra détectée sur cet appareil.')
      } else {
        setCameraError("Impossible d'accéder à la caméra. Vérifiez vos réglages.")
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
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    // Crop bottom 35% where card number lives
    const cropH = Math.floor(canvas.height * 0.35)
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width  = canvas.width
    cropCanvas.height = cropH
    const cropCtx = cropCanvas.getContext('2d')
    if (!cropCtx) return
    cropCtx.drawImage(canvas, 0, canvas.height - cropH, canvas.width, cropH, 0, 0, canvas.width, cropH)

    // Grayscale + contrast boost
    const imgData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.6 + 128))
      d[i] = d[i + 1] = d[i + 2] = enhanced
    }
    cropCtx.putImageData(imgData, 0, 0)

    setStatus('scanning')
    setMessage("Analyse OCR en cours…")
    setMultipleCards([])

    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz- ',
      })
      const { data } = await worker.recognize(cropCanvas)
      await worker.terminate()

      const rawText = data.text
      const cardNumber = extractCardNumber(rawText)

      if (!cardNumber) {
        setStatus('error')
        setMessage("Numéro non détecté. Ajustez la carte ou saisissez les infos manuellement.")
        return
      }

      setStatus('fetching')
      setMessage(`N° détecté : ${cardNumber} — Recherche dans la base…`)

      const numPart = cardNumber.split('/')[0].replace(/[A-Z]/gi, (c) => c)
      const res  = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=number:${encodeURIComponent(numPart)}&pageSize=8`
      )
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json() as { data: ApiCard[] }

      if (!json.data?.length) {
        setStatus('error')
        setMessage(`Numéro ${cardNumber} introuvable dans la base Pokémon TCG.`)
        return
      }

      if (json.data.length === 1) {
        applyCard(json.data[0], cardNumber)
      } else {
        setMultipleCards(json.data)
        setStatus('error')
        setMessage(`${json.data.length} cartes trouvées — sélectionnez la bonne :`)
      }
    } catch (err) {
      setStatus('error')
      setMessage("Erreur lors de l'analyse. Vérifiez votre connexion et réessayez.")
    }
  }

  function applyCard(card: ApiCard, detectedNumber: string) {
    const rarity = RARITY_MAP[card.rarity ?? ''] ?? card.rarity ?? ''
    onResult({
      pokemon_name: card.name,
      card_number: detectedNumber,
      extension: card.set?.name ?? '',
      rarity,
      expected_sale_price: getMarketPrice(card),
    })
    setStatus('success')
    setMessage(`Trouvé : ${card.name} — Formulaire pré-rempli !`)
    setTimeout(() => onClose(), 1400)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-[#111113] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">

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
            /* ── Erreur caméra ─────────────────────── */
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
              {/* ── Flux vidéo ────────────────────────── */}
              <div className="relative rounded-xl overflow-hidden bg-zinc-950 aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Cadre global carte */}
                <div className="absolute inset-4 border border-white/10 rounded-xl pointer-events-none" />

                {/* Zone cible bas de carte */}
                <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-5 pointer-events-none">
                  <div className="w-4/5 h-11 border-2 border-emerald-400/80 rounded-lg shadow-lg shadow-emerald-500/10 relative">
                    <div className="absolute -top-px left-4 right-4 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
                    <div className="absolute -bottom-px left-4 right-4 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
                  </div>
                  <p className="text-[10px] text-emerald-400/80 mt-1.5 font-medium tracking-wide">
                    ALIGNEZ LE BAS DE LA CARTE
                  </p>
                </div>

                {/* Overlay scan actif */}
                {status === 'scanning' && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={28} className="animate-spin text-emerald-400" />
                      <span className="text-xs text-white font-medium">Analyse en cours…</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Message de statut ─────────────────── */}
              {message && (
                <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                  status === 'error'    ? 'bg-red-500/8 border border-red-500/20 text-red-300'
                  : status === 'success' ? 'bg-emerald-500/8 border border-emerald-500/20 text-emerald-300'
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

              {/* ── Sélection multiple ─────────────────── */}
              {multipleCards.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {multipleCards.map((card, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyCard(card, card.number)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-left transition-colors group"
                    >
                      <div>
                        <p className="text-xs font-medium text-white group-hover:text-emerald-400 transition-colors">
                          {card.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {card.set?.name} · #{card.number} · {card.rarity}
                        </p>
                      </div>
                      {getMarketPrice(card) && (
                        <span className="text-xs font-semibold text-emerald-400 shrink-0 ml-2">
                          {getMarketPrice(card)}€
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-zinc-600 text-center px-2">
                Éclairage suffisant · carte à plat · bas dans la zone verte
              </p>
            </>
          )}
        </div>

        {/* ── Actions ──────────────────────────────── */}
        {!cameraError && (
          <div className="flex gap-3 px-4 pb-4">
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
              {(status === 'scanning' || status === 'fetching') ? (
                <><Loader2 size={14} className="animate-spin" /> Analyse…</>
              ) : status === 'success' ? (
                <><CheckCircle2 size={14} /> Rempli !</>
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
