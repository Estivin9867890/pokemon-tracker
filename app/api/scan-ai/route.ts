export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return Response.json({ error: 'GEMINI_API_KEY manquant dans .env.local' }, { status: 503 })
  }

  let imageBase64: string
  try {
    const body = await req.json() as { imageBase64?: string }
    imageBase64 = body.imageBase64 ?? ''
    if (!imageBase64) return Response.json({ error: 'imageBase64 requis' }, { status: 400 })
  } catch {
    return Response.json({ error: 'Body invalide' }, { status: 400 })
  }

  const prompt = [
    'This is a French Pokémon TCG card.',
    'Extract ONLY:',
    '1. The Pokémon name in French (large bold text at the top of the card, e.g. "Chipie", "Dracaufeu", "Pikachu ex")',
    '2. The card number (bottom of card, e.g. "106/189")',
    'Reply ONLY with valid JSON, nothing else: {"name": "...", "number": "..."}',
    'If you cannot read the card, reply: {"name": "", "number": ""}',
  ].join(' ')

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          ]}],
          generationConfig: { temperature: 0, maxOutputTokens: 60 },
        }),
        signal: AbortSignal.timeout(12000),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: `Gemini ${res.status}`, detail: err.slice(0, 200) }, { status: res.status })
    }

    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const clean = raw.replace(/```json\n?|\n?```/g, '').trim()

    try {
      const parsed = JSON.parse(clean) as { name?: string; number?: string }
      return Response.json({ name: parsed.name ?? '', number: parsed.number ?? '' })
    } catch {
      // Gemini didn't return JSON — try to extract name from raw text
      const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/)
      return Response.json({ name: nameMatch?.[1] ?? '', number: '' })
    }
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
