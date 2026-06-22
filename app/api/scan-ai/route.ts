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
    'Photo of a French Pokémon TCG card. Extract:',
    '1. name: the Pokémon name in French (large bold text at top, e.g. "Sorboul", "Dracaufeu ex", "Pikachu", "Skitty")',
    '2. number: card number at bottom (e.g. "045/195", "106/189")',
    'Reply JSON: {"name":"...","number":"..."}',
  ].join('\n')

  const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash']

  let lastError = ''
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            ]}],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 256,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(12000),
        },
      )

      if (!res.ok) {
        lastError = `Gemini ${res.status} (${model}): ${(await res.text()).slice(0, 200)}`
        continue
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
      lastError = `${model}: ${(err as Error).message}`
      continue
    }
  }

  return Response.json({ error: lastError || 'Tous les modèles ont échoué' }, { status: 502 })
}
