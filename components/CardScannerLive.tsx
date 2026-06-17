'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Plus, CheckCircle2, Loader2, Scan, Camera, Minus, Search } from 'lucide-react'
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
    }
  }
  tcgplayer?: { prices?: Record<string, { market?: number }> }
}

export interface DetectedCard {
  uid: string
  apiId: string
  name: string
  nameFR: string
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

// ── TCGdex search (French names + card data) ──────────────────────────────────
interface TCGdexCard {
  id: string
  localId: string
  name: string        // French name
  image?: string
  set?: { id: string; name: string }
}

async function searchTCGdex(query: string): Promise<TCGdexCard[]> {
  if (!query.trim()) return []
  try {
    // Search by name in French
    const url = `https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(query.trim())}&pageSize=20`
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json() as TCGdexCard[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function fetchFrenchName(tcgId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/fr/cards/${tcgId}`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return ''
    const json = await res.json() as { name?: string }
    return json.name ?? ''
  } catch {
    return ''
  }
}

// ── pokemontcg.io lookup ──────────────────────────────────────────────────────
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

async function fetchByNumber(number: string, setCode?: string): Promise<ApiCard | null> {
  const numPart = number.split('/')[0]
  const queries = setCode
    ? [`number:"${numPart}" set.ptcgoCode:${setCode}`, `number:"${numPart}"`]
    : [`number:"${numPart}"`]
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=5`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (!res.ok) continue
      const json = await res.json() as { data: ApiCard[] }
      if (json.data?.length) {
        if (setCode) {
          const exact = json.data.find((c) => c.set?.ptcgoCode === setCode)
          if (exact) return exact
        }
        return json.data[0]
      }
    } catch { continue }
  }
  return null
}

async function fetchByName(nameFR: string, localId?: string): Promise<ApiCard | null> {
  // Try to find the English card via pokemontcg.io using the TCGdex card ID
  // TCGdex IDs and pokemontcg.io IDs share the same format (e.g. swsh3-79)
  if (localId) {
    try {
      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards/${localId}`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (res.ok) {
        const json = await res.json() as { data: ApiCard }
        if (json.data) return json.data
      }
    } catch {}
  }
  // Fallback: search by name (English won't work, but try set+number if available)
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
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const mountedRef  = useRef(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedUidsRef = useRef<Set<string>>(new Set())

  const [cameraReady, setCameraReady]     = useState(false)
  const [cameraError, setCameraError]     = useState('')
  const [zoom, setZoom]                   = useState(ZOOM_DEFAULT)
  const [nativeZoom, setNativeZoom]       = useState(false)

  // Search
  const [query, setQuery]                 = useState('')
  const [searching, setSearching]         = useState(false)
  const [searchResults, setSearchResults] = useState<TCGdexCard[]>([])
  const [loadingCard, setLoadingCard]     = useState<string | null>(null)  // TCGdex card id being loaded

  // Detected cards list
  const [detectedCards, setDetectedCards] = useState<DetectedCard[]>([])

  // Quick-add
  const [quickAddCard, setQuickAddCard]   = useState<DetectedCard | null>(null)
  const [quickPrice, setQuickPrice]       = useState('')
  const [quickLocation, setQuickLocation] = useState<'CELIAN' | 'ROMAIN'>('CELIAN')
  const [saving, setSaving]               = useState(false)
  const [savedUids, setSavedUids]         = useState<Set<string>>(new Set())

  // ── Camera ────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (!open) return
    mountedRef.current = true
    setCameraReady(false); setCameraError(''); setQuery(''); setSearchResults([])
    setDetectedCards([]); setQuickAddCard(null); setSavedUids(new Set())
    savedUidsRef.current = new Set(); setZoom(ZOOM_DEFAULT)

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    }).then((stream) => {
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      const track = stream.getVideoTracks()[0]
      const cap   = (track as any).getCapabilities?.() ?? {}
      if (cap.zoom) {
        setNativeZoom(true)
        track.applyConstraints({ advanced: [{ zoom: ZOOM_DEFAULT }] } as any).catch(() => {})
      }
      setCameraReady(true)
    }).catch((err) => {
      if (!mountedRef.current) return
      const n = (err as Error).name
      setCameraError(
        n === 'NotAllowedError' ? "Accès caméra refusé." :
        n === 'NotFoundError'  ? "Aucune caméra détectée." :
        "Impossible d'accéder à la caméra."
      )
    })

    return () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [open])

  // ── Search ────────────────────────────────────────────────────────────────
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); setSearching(false); return }

    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const results = await searchTCGdex(q)
      if (mountedRef.current) {
        setSearchResults(results)
        setSearching(false)
      }
    }, 350)
  }, [])

  // Select a card from search results → fetch pokemontcg.io data → add to list
  async function selectResult(tcgCard: TCGdexCard) {
    if (loadingCard === tcgCard.id) return
    setLoadingCard(tcgCard.id)

    try {
      const now = Date.now()
      // Try to get pokemontcg.io data (prices + images)
      let apiCard = await fetchByName(tcgCard.name, tcgCard.id)

      // If ID lookup failed, try by number + set
      if (!apiCard && tcgCard.localId && tcgCard.set?.id) {
        apiCard = await fetchByNumber(tcgCard.localId, tcgCard.set.id.toUpperCase())
      }

      const card: DetectedCard = {
        uid:         `${tcgCard.id}-${now}`,
        apiId:       tcgCard.id,
        name:        apiCard?.name ?? tcgCard.name,
        nameFR:      tcgCard.name,
        number:      tcgCard.localId,
        setName:     tcgCard.set?.name ?? apiCard?.set?.name ?? '',
        setCode:     apiCard?.set?.ptcgoCode ?? tcgCard.set?.id?.toUpperCase() ?? '',
        rarityFR:    RARITY_MAP[apiCard?.rarity ?? ''] ?? apiCard?.rarity ?? '',
        imageUrl:    apiCard?.images?.small ?? (tcgCard.image ? `${tcgCard.image}/low.webp` : ''),
        marketPrice: apiCard ? getMarketPrice(apiCard) : '',
        cmTrend:     apiCard ? getCMTrend(apiCard) : '',
      }

      if (mountedRef.current) {
        setDetectedCards((prev) => {
          if (prev.some((c) => c.apiId === card.apiId)) return prev
          return [card, ...prev]
        })
        setQuery('')
        setSearchResults([])
      }
    } finally {
      if (mountedRef.current) setLoadingCard(null)
    }
  }

  // ── Quick-add ─────────────────────────────────────────────────────────────
  async function handleQuickSave() {
    if (!quickAddCard) return
    setSaving(true)
    const price     = quickPrice || quickAddCard.cmTrend || quickAddCard.marketPrice
    const salePrice = quickAddCard.cmTrend || quickAddCard.marketPrice
    const displayName = quickAddCard.nameFR || quickAddCard.name
    const formData: ItemFormData = {
      item_name: displayName, purchase_price: price,
      vinted_fees: String(defaultVintedFees), expected_sale_price: salePrice,
      location: quickLocation === 'CELIAN' ? 'Chez Célian' : 'Chez Romain',
      notes: '', pokemon_name: displayName, card_number: quickAddCard.number,
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
    setQuickAddCard(card)
    setQuickPrice(card.cmTrend || card.marketPrice)
    setQuickLocation('CELIAN')
  }

  function removeCard(uid: string) {
    setDetectedCards((prev) => prev.filter((c) => c.uid !== uid))
  }

  if (!open) return null

  const cssZoomStyle = !nativeZoom && zoom > 1
    ? { transform: `scale(${zoom})`, transformOrigin: 'center center' } as React.CSSProperties
    : {}

  const zoomDots = Array.from(
    { length: Math.round((ZOOM_MAX - ZOOM_MIN) / ZOOM_STEP) + 1 },
    (_, i) => ZOOM_MAX - i * ZOOM_STEP
  )

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black select-none">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-5 h-12 bg-black/90 backdrop-blur border-b border-white/5 z-10">
        <div className="flex items-center gap-2">
          <Scan size={13} className="text-white/50" />
          <span className="text-sm font-bold text-white tracking-wide">Scanner</span>
          {detectedCards.length > 0 && (
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

      {/* ── Camera ──────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 bg-black overflow-hidden">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <Camera size={28} className="text-white/15" />
            <p className="text-sm text-white/40">{cameraError}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef} autoPlay playsInline muted
              className="w-full h-full object-cover transition-transform duration-300"
              style={cssZoomStyle}
            />

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 60% 72% at 50% 44%, transparent 28%, rgba(0,0,0,0.6) 100%)' }}
            />

            {/* Card frame */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative" style={{ width: '70%', aspectRatio: '5/7' }}>
                <div className={`absolute inset-0 rounded-2xl border-2 border-dashed transition-colors duration-500 ${
                  cameraReady ? 'border-white/55' : 'border-white/18'
                }`} />
                {[
                  'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl',
                  'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl',
                  'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl',
                  'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl',
                ].map((cls) => (
                  <div key={cls}
                    className={`absolute w-7 h-7 transition-colors duration-500 ${cameraReady ? 'border-white' : 'border-white/25'} ${cls}`}
                    style={{ margin: '-2px' }}
                  />
                ))}
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-white/40 text-xs font-medium text-center px-6">
                    Référence visuelle{'\n'}— recherche manuelle ci-dessous
                  </p>
                </div>
              </div>
            </div>

            {/* Zoom controls */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 z-10">
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

            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 size={24} className="text-white animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#080809] border-t border-white/6 flex flex-col relative" style={{ height: 320 }}>

        {/* ── Search bar ── */}
        <div className="px-4 pt-3 pb-2 border-b border-white/5 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Nom de la carte (ex: Spododo, Pikachu ex…)"
              className="w-full bg-white/6 border border-white/10 rounded-xl pl-8 pr-8 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/28 transition-colors"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setSearchResults([]) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {(searching || searchResults.length > 0) && (
            <div className="mt-2 bg-[#0d0d10] border border-white/8 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center py-4 gap-2">
                  <Loader2 size={13} className="animate-spin text-white/40" />
                  <span className="text-xs text-white/35">Recherche…</span>
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-4">Aucune carte trouvée</p>
              ) : (
                <div className="divide-y divide-white/4">
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectResult(c)}
                      disabled={loadingCard === c.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/6 text-left transition-colors active:scale-[0.99]"
                    >
                      {/* Thumbnail */}
                      <div className="w-7 h-10 rounded-md overflow-hidden bg-zinc-900 border border-white/6 shrink-0">
                        {c.image
                          ? <img src={`${c.image}/low.webp`} alt={c.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Camera size={10} className="text-white/20" /></div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">{c.name}</p>
                        <p className="text-[10px] text-white/35 font-mono mt-0.5">
                          {c.set?.id?.toUpperCase()} {c.localId}
                          {c.set?.name && <span className="text-white/20 ml-1">· {c.set.name}</span>}
                        </p>
                      </div>
                      {loadingCard === c.id
                        ? <Loader2 size={13} className="animate-spin text-white/40 shrink-0" />
                        : <Plus size={13} className="text-white/40 shrink-0" />
                      }
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Card list ── */}
        <div className="flex-1 overflow-y-auto">
          {detectedCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
              <Search size={16} className="text-white/12" />
              <p className="text-[11px] text-white/25 leading-relaxed">
                Tapez le nom d&apos;une carte pour la trouver,{'\n'}puis appuyez sur <span className="text-white/45">+</span> pour l&apos;ajouter
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/4">
              {detectedCards.map((card) => {
                const isSaved   = savedUids.has(card.uid)
                const price     = card.cmTrend || card.marketPrice
                const codeLabel = `${card.setCode} ${card.number}`

                return (
                  <div key={card.uid}
                    className={`flex items-center gap-3 px-4 py-2.5 ${isSaved ? 'bg-emerald-500/4' : ''}`}
                  >
                    <div className="w-9 h-[52px] rounded-lg overflow-hidden bg-zinc-900/80 border border-white/6 shrink-0">
                      {card.imageUrl
                        ? <img src={card.imageUrl} alt={card.nameFR || card.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Camera size={12} className="text-white/15" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate leading-tight ${isSaved ? 'text-emerald-400' : 'text-white'}`}>
                        {card.nameFR || card.name}
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

        {/* ── Quick-add panel ── */}
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
                  {quickAddCard.imageUrl && <img src={quickAddCard.imageUrl} alt={quickAddCard.nameFR || quickAddCard.name} className="w-full h-full object-cover" />}
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
    </div>
  )
}
