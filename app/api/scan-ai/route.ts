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

  const models = ['gemini-2.5-flash-lite', 'gemini-3.5-flash']
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
            },
          }),
          signal: AbortSignal.timeout(15000),
        },
      )

      if (!res.ok) {
        lastError = `Gemini ${res.status} (${model}): ${(await res.text()).slice(0, 200)}`
        continue
      }

      const data = await res.json() as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean; thoughtSignature?: string }[] }; finishReason?: string }[]
        promptFeedback?: { blockReason?: string }
      }

      if (data.promptFeedback?.blockReason) {
        lastError = `Blocked: ${data.promptFeedback.blockReason}`
        continue
      }

      const candidate = data.candidates?.[0]
      if (!candidate?.content?.parts?.length) {
        lastError = `No response (${model}, finishReason: ${candidate?.finishReason ?? 'unknown'})`
        continue
      }

      const parts = candidate.content.parts
      const answerPart = parts.find((p) => !p.thought && !p.thoughtSignature && p.text) ?? parts.filter((p) => p.text).pop()
      const raw = answerPart?.text ?? ''
      const clean = raw.replace(/```json\n?|\n?```/g, '').trim()

      try {
        const parsed = JSON.parse(clean) as { name?: string; number?: string }
        if (parsed.name) return Response.json({ name: parsed.name, number: parsed.number ?? '' })
      } catch { /* fallthrough to regex */ }

      const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/)
      const numMatch = raw.match(/"number"\s*:\s*"([^"]+)"/)
      if (nameMatch?.[1]) return Response.json({ name: nameMatch[1], number: numMatch?.[1] ?? '' })

      lastError = `Empty result from ${model}`
    } catch (err) {
      lastError = `${model}: ${(err as Error).message}`
    }
  }

  return Response.json({ error: lastError || 'Scan échoué', detail: lastError }, { status: 502 })
}
