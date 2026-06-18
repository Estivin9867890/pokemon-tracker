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
    'This is a photo of a French Pokémon TCG card.',
    'Read the card and extract:',
    '1. The Pokémon name in French — it is the large bold text near the top of the card (examples: "Sorboul", "Dracaufeu ex", "Pikachu", "Chipie").',
    '2. The card number — small text at the bottom of the card (examples: "045/195", "106/189").',
    'Reply ONLY with valid JSON: {"name": "...", "number": "..."}',
    'If unreadable, reply: {"name": "", "number": ""}',
  ].join('\n')

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          ]}],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 200,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: `Gemini ${res.status}`, detail: err.slice(0, 200) }, { status: res.status })
    }

    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
      promptFeedback?: { blockReason?: string }
    }

    if (data.promptFeedback?.blockReason) {
      return Response.json({ error: `Blocked: ${data.promptFeedback.blockReason}` }, { status: 422 })
    }

    const candidate = data.candidates?.[0]
    if (!candidate?.content?.parts?.length) {
      return Response.json({ error: `No response (finishReason: ${candidate?.finishReason ?? 'unknown'})` }, { status: 422 })
    }

    const parts = candidate.content.parts
    const answerPart = parts.find((p) => !p.thought) ?? parts[parts.length - 1]
    const raw = answerPart?.text ?? ''
    const clean = raw.replace(/```json\n?|\n?```/g, '').trim()

    try {
      const parsed = JSON.parse(clean) as { name?: string; number?: string }
      return Response.json({ name: parsed.name ?? '', number: parsed.number ?? '' })
    } catch {
      const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/)
      const numMatch = raw.match(/"number"\s*:\s*"([^"]+)"/)
      return Response.json({ name: nameMatch?.[1] ?? '', number: numMatch?.[1] ?? '' })
    }
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
