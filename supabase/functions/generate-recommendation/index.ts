const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  courseId?: string;
  report?: unknown;
  model?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function buildPrompt(report: unknown) {
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
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "Missing GEMINI_API_KEY Supabase secret" }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.report) {
    return jsonResponse({ error: "Missing report payload" }, 400);
  }

  const model = body.model || Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const geminiResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(body.report) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 3000,
      },
    }),
  });

  if (!geminiResponse.ok) {
    const detail = await geminiResponse.text();
    return jsonResponse({
      error: "Gemini request failed",
      detail,
    }, 502);
  }

  const result = await geminiResponse.json();
  const recommendation =
    result?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();

  if (!recommendation) {
    return jsonResponse({
      error: "Gemini returned an empty recommendation",
      raw: result,
    }, 502);
  }

  return jsonResponse({
    provider: "gemini",
    model,
    recommendation,
  });
});
