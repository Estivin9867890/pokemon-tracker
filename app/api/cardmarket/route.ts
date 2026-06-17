import crypto from 'crypto'

// ── OAuth 1.0a signer ────────────────────────────────────────────────────────
function pct(s: string): string {
  return encodeURIComponent(s)
}

function buildOAuthHeader(
  method: string,
  baseUrl: string,
  queryParams: Record<string, string>,
  creds: { appToken: string; appSecret: string; accessToken: string; accessSecret: string },
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce     = crypto.randomBytes(12).toString('hex')

  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     creds.appToken,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_token:            creds.accessToken,
    oauth_version:          '1.0',
  }

  // Combine query + oauth params, sort, percent-encode
  const allParams   = { ...queryParams, ...oauthParams }
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join('&')

  const baseString = [method.toUpperCase(), pct(baseUrl), pct(paramString)].join('&')
  const signingKey = `${pct(creds.appSecret)}&${pct(creds.accessSecret)}`
  const signature  = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')

  oauthParams.oauth_signature = signature

  return (
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`)
      .join(', ')
  )
}

// ── In-process cache (resets on deploy — good enough for prices) ─────────────
const cache = new Map<string, { data: PriceResult; at: number }>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// ── Types ────────────────────────────────────────────────────────────────────
interface CMProduct {
  idProduct: number
  enName?: string
  locName?: string
  number?: string
  expansion?: { idExpansion?: number; abbreviation?: string; enName?: string }
  priceGuide?: Record<string, number | null>
}

export interface PriceResult {
  trend:  number | null
  avg30:  number | null
  avg7:   number | null
  low:    number | null
  sell:   number | null
  source: 'cardmarket'
  idProduct?: number
  setName?: string
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name    = searchParams.get('name')    ?? ''
  const number  = searchParams.get('number')  ?? ''  // card number, e.g. "250"
  const setCode = searchParams.get('setCode') ?? ''  // e.g. "PAR"

  // Credentials from env
  const appToken    = process.env.CARDMARKET_APP_TOKEN    ?? ''
  const appSecret   = process.env.CARDMARKET_APP_SECRET   ?? ''
  const accessToken = process.env.CARDMARKET_ACCESS_TOKEN ?? ''
  const accessSecret= process.env.CARDMARKET_ACCESS_SECRET ?? ''

  if (!appToken || !appSecret || !accessToken || !accessSecret) {
    return Response.json({ error: 'Cardmarket API non configurée' }, { status: 503 })
  }

  if (!name) {
    return Response.json({ error: 'Paramètre name requis' }, { status: 400 })
  }

  // Cache lookup
  const cacheKey = `${name.toLowerCase()}|${number}|${setCode}`
  const hit      = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Response.json({ ...hit.data, cached: true })
  }

  const creds = { appToken, appSecret, accessToken, accessSecret }
  const BASE  = 'https://apiv2.cardmarket.com/ws/v2.0'

  try {
    // ── Step 1: Search product by English name ────────────────────────────
    const searchUrl    = `${BASE}/products/find`
    const searchParams2: Record<string, string> = {
      search:       name,
      idGame:       '1',    // 1 = Pokémon TCG
      idLanguage:   '1',    // 1 = English
      maxResults:   '20',
      exact:        '0',
    }

    const qs      = new URLSearchParams(searchParams2).toString()
    const authHdr = buildOAuthHeader('GET', searchUrl, searchParams2, creds)

    const searchRes = await fetch(`${searchUrl}?${qs}`, {
      headers: { Authorization: authHdr, Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    })

    if (!searchRes.ok) {
      const body = await searchRes.text()
      return Response.json(
        { error: `Cardmarket ${searchRes.status}`, detail: body.slice(0, 200) },
        { status: searchRes.status },
      )
    }

    const searchJson = await searchRes.json() as { product?: CMProduct[] }
    const products   = searchJson.product ?? []

    if (!products.length) {
      return Response.json({ prices: null, reason: 'not_found' })
    }

    // ── Step 2: Pick the best product match ──────────────────────────────
    // Priority: matching set code + number → matching number → first result
    const numPart = number.split('/')[0]

    const bySetAndNum = products.find(
      (p) => p.number === numPart && p.expansion?.abbreviation === setCode,
    )
    const byNum = products.find((p) => p.number === numPart)
    const best  = bySetAndNum ?? byNum ?? products[0]

    const pg = best.priceGuide

    const result: PriceResult = {
      trend:     pg?.['TREND']  ?? null,
      avg30:     pg?.['AVG30']  ?? null,
      avg7:      pg?.['AVG7']   ?? null,
      low:       pg?.['LOW']    ?? null,
      sell:      pg?.['SELL']   ?? null,
      source:    'cardmarket',
      idProduct: best.idProduct,
      setName:   best.expansion?.enName,
    }

    cache.set(cacheKey, { data: result, at: Date.now() })
    return Response.json(result)

  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
