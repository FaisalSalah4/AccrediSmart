import http from 'node:http'

const PORT = Number(process.env.AI_DEV_PORT || 8787)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    ...corsHeaders,
    'Content-Type': 'application/json',
  })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > 2_000_000) {
        req.destroy()
        reject(new Error('Request body too large'))
      }
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

function buildPrompt(report) {
  return `
You are an accreditation and FCAR course assessment analyst for a Saudi higher education accreditation system.

Analyze the provided FCAR attainment report data and generate a comprehensive instructor-facing recommendation report.

Rules:
- Use only the provided report data.
- Do not invent CLOs, percentages, student counts, domains, assessment items, or causes.
- If evidence is missing, say that the report data does not provide enough evidence.
- Be formal, specific, and actionable.
- Mention strengths as well as weaknesses.
- Explain why each recommendation follows from the data.
- Do not include student names or student IDs.
- Do not write a memo header. Do not include "To", "From", "Date", or "Subject" lines.
- Do not use placeholders such as "[Current Date]" or "[Instructor Name]".
- Do not use Markdown tables.
- Keep the output focused on what the instructor should understand and do next.
- Use numbered actions when giving an action plan.
- For each weak CLO, mention the actual %, target %, gap, passed/total count, and mapped assessment items if provided.
- If all CLOs are achieved, focus on sustaining strengths, checking assessment rigor, and continuous improvement.

Required sections:
1. Instructor Review Notice
2. Executive Summary
3. Key Strengths
4. Areas for Improvement
5. Likely Causes to Investigate
6. Recommended Actions for the Next Offering
7. Continuous Improvement Plan
8. Data Quality Notes

Style:
- Write directly as a report, not as a letter.
- Use concise paragraphs and bullets.
- Avoid generic advice like "teach better" or "students need more practice" unless connected to a specific CLO or data point.
- Recommendations should be concrete, for example: add a diagnostic quiz, add a targeted workshop, revise item alignment, add formative feedback, or review prerequisite concepts.

FCAR report JSON:
${JSON.stringify(report, null, 2)}
`
}

async function handleRecommendation(req, res) {
  if (!GEMINI_API_KEY) {
    return sendJson(res, 500, {
      error: 'Missing GEMINI_API_KEY. Set it in this PowerShell session before running the dev AI server.',
    })
  }

  let payload
  try {
    payload = JSON.parse(await readBody(req))
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' })
  }

  if (!payload?.report) {
    return sendJson(res, 400, { error: 'Missing report payload' })
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
  const aiRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(payload.report) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 3000,
      },
    }),
  })

  if (!aiRes.ok) {
    return sendJson(res, 502, {
      error: 'Gemini request failed',
      detail: await aiRes.text(),
    })
  }

  const result = await aiRes.json()
  const recommendation = result?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim()

  if (!recommendation) {
    return sendJson(res, 502, {
      error: 'Gemini returned an empty recommendation',
      raw: result,
    })
  }

  return sendJson(res, 200, {
    provider: 'gemini-local-dev',
    model: GEMINI_MODEL,
    recommendation,
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders)
    return res.end()
  }

  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true, model: GEMINI_MODEL })
  }

  if (req.method === 'POST' && req.url === '/generate-recommendation') {
    try {
      return await handleRecommendation(req, res)
    } catch (error) {
      return sendJson(res, 500, {
        error: error?.message || 'Unexpected local AI server error',
      })
    }
  }

  return sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`Local AI proxy running at http://localhost:${PORT}`)
  console.log('Keep this terminal open while testing AI recommendations.')
})
