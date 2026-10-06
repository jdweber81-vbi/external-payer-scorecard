const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

const summarySchema = {
  type: "object",
  additionalProperties: false,
  properties: { summary: { type: "string" } },
  required: ["summary"]
};

const bookSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string" },
    exceptional: { type: "string" },
    well: { type: "string" },
    improve: { type: "string" },
    recurring: { type: "string" },
    growth: { type: "string" }
  },
  required: ["overview", "exceptional", "well", "improve", "recurring", "growth"]
};

const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentSummary: { type: "string" },
    identifiedClientIds: { type: "array", items: { type: "integer" } },
    clientIdentificationSummary: { type: "string" },
    replacementCandidateId: { anyOf: [{ type: "string" }, { type: "null" }] },
    replacementConfidence: { type: "string", enum: ["high", "medium", "low", "none"] },
    replacementReason: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          clientId: { type: "integer" },
          categoryId: { type: "string" },
          metricId: { type: "string" },
          proposedScore: { anyOf: [{ type: "integer", minimum: 0, maximum: 100 }, { type: "null" }] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          factStatus: { type: "string", enum: ["confirmed", "potential"] },
          evidence: { type: "string" },
          rationale: { type: "string" }
        },
        required: ["clientId", "categoryId", "metricId", "proposedScore", "confidence", "factStatus", "evidence", "rationale"]
      }
    }
  },
  required: ["documentSummary", "identifiedClientIds", "clientIdentificationSummary", "replacementCandidateId", "replacementConfidence", "replacementReason", "findings"]
};

function instructions(operation, summaryType) {
  const common = `You support an executive External Payer Client Health Index dashboard. Use only facts in the supplied JSON. Do not infer identities, restore de-identified names, invent metrics, or claim certainty that the data does not support. Keep language concise, specific, and professional.`;
  if (operation === "client-summary") {
    if (summaryType === "customer") {
      return `${common}
Create a customer-facing summary of 130 to 180 words. It must be warm, constructive, partnership-oriented, and easy to scan. Do not sound fluffy, promotional, defensive, or harsh. Do not use internal phrases such as fractured trust, insource risk, weakest category, failure, or risk list. Never hide a real concern; translate it into a shared improvement opportunity.

Use exactly this plain-text format inside the summary string, including blank lines:
CURRENT POSITION
Two concise sentences describing current health and context.

WHAT IS WORKING WELL
• Up to two fact-based strengths.

SHARED OPPORTUNITIES
• Up to two improvement opportunities framed collaboratively.

RECOMMENDED NEXT STEPS
1. Two or three specific, customer-appropriate actions.

Do not repeat funding, geography, membership, every LOB, or contract value unless directly relevant. Return JSON only.`;
    }
    return `${common}
Create a direct internal account brief of 160 to 220 words. It must be candid, practical, and easy to scan—not polished marketing language and not a dense paragraph. Do not dump all account metadata. Include numbers only when they help a decision.

Use exactly this plain-text format inside the summary string, including blank lines:
ACCOUNT SNAPSHOT
One sentence with CHI, status, and the central account situation.

STRENGTHS
• Up to two specific strengths.

CONCERNS
• Up to two specific performance concerns.

OPPORTUNITIES
• Up to two supported growth or relationship opportunities.

RISKS
• Up to two concrete retention, operational, financial, or relationship risks.

REQUIRED IMPROVEMENTS
1. Exactly three prioritized, action-oriented improvements.

Avoid filler such as “strongest supported area,” “other lower-scoring areas,” or long parenthetical lists. Do not repeat funding, geography, membership, every LOB, or contract value unless directly relevant. Return JSON only.`;
  }
  if (operation === "document-analysis") {
    return `${common}
First identify every affected client in candidateClients. A report may cover one client, several clients, or the entire book. Select a client only when its de-identified name or its unique profile is explicitly supported by the document. Return all supported IDs in identifiedClientIds and briefly explain the routing in clientIdentificationSummary. When routingMode is manual, restrict findings to manuallySelectedClientIds. When routingMode is ai, examine all candidateClients and do not require prior human selection.

Then analyze the uploaded scorecard evidence and slice it into distinct findings. Map every supported finding only to an identified client, supplied CHI category, and submetric. Separate different facts into separate findings. Quote or tightly paraphrase the specific evidence supporting each mapping.

Compare the new filename, reporting period, document content, and client coverage with existingReferences. If it appears to be a newer edition of an existing recurring report—even when words are reordered or the quarter/year changes—return that reference ID as replacementCandidateId. Use high confidence only when document family and client scope strongly align. Otherwise return null, confidence none, and a short reason. Examples of the same family include Q1_2026_Performance_metrics and Q2_Metrics_Payer_2026.

Propose a 0-100 score only when the evidence directly supports a change. Otherwise return null. Use lower scores for material negative performance and higher scores for demonstrated positive performance, consistent with the supplied methodology. Do not apply changes yourself.

Critical distinction: language such as may, might, could, possible, potential, anticipated, or at risk of must have factStatus "potential". A possible CAP is not an open CAP. Potential findings must always have proposedScore null unless the document separately confirms a current performance issue that independently supports a score.

Do not connect one fact to every metric. Do not create findings for a client outside identifiedClientIds. Keep each evidence and rationale field under 45 words. Return JSON only.`;
  }
  return `${common} Create exactly six portfolio sections. Use actual counts, averages, funding types, and lines of business from the supplied data. Call an area exceptional only if its average is at least 80. Identify recurring weaknesses only when supported by multiple clients. Present growth ideas as hypotheses, not guarantees. Return JSON only.`;
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

async function createResponse(context, body, schema, maxOutputTokens) {
  const documentItem = body.fileMime?.startsWith("image/")
    ? { type: "input_image", image_url: body.fileData, detail: "high" }
    : { type: "input_file", filename: body.fileName, file_data: body.fileData };
  const input = body.operation === "document-analysis" ? [{
    role: "user",
    content: [
      documentItem,
      { type: "input_text", text: JSON.stringify({ routingMode: body.routingMode, manuallySelectedClientIds: body.manuallySelectedClientIds || [], candidateClients: body.candidateClients, methodology: body.methodology, existingReferences: body.existingReferences || [], userContext: body.userContext || "" }) }
    ]
  }] : JSON.stringify(body);
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${context.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: context.env.OPENAI_MODEL || "gpt-5-mini",
      store: false,
      reasoning: { effort: "low" },
      instructions: instructions(body.operation, body.summaryType),
      input,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: body.operation === "client-summary" ? "client_summary" : body.operation === "document-analysis" ? "evidence_review" : "book_overview",
          strict: true,
          schema
        }
      }
    })
  });
  return { upstream, result: await upstream.json() };
}

export async function onRequestPost(context) {
  try {
    if (!context.env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured." }, 503);
    const contentLength = Number(context.request.headers.get("content-length") || 0);
    if (contentLength > 12_000_000) return json({ error: "Request is too large for AI review." }, 413);
    const body = await context.request.json();
    if (!["client-summary", "book-overview", "document-analysis"].includes(body.operation)) return json({ error: "Unsupported operation." }, 400);
    if (body.operation === "document-analysis" && (!body.fileData || !body.fileName || !Array.isArray(body.candidateClients))) return json({ error: "Document analysis input is incomplete." }, 400);

    const schema = body.operation === "client-summary" ? summarySchema : body.operation === "document-analysis" ? evidenceSchema : bookSchema;
    const { upstream, result } = await createResponse(
      context,
      body,
      schema,
      body.operation === "client-summary" ? 1600 : body.operation === "document-analysis" ? 3200 : 3200
    );
    if (!upstream.ok) {
      console.error("OpenAI request failed", upstream.status, result?.error?.type || "unknown");
      return json({ error: "The AI service could not complete the request." }, 502);
    }
    const text = outputText(result);
    if (!text) {
      const reason = result?.incomplete_details?.reason || result?.status || "empty_output";
      console.error("OpenAI returned no output text", reason, JSON.stringify(result?.output || []).slice(0, 1200));
      return json({ error: `The AI response was incomplete (${reason}).` }, 502);
    }
    return json(JSON.parse(text));
  } catch (error) {
    console.error("AI bridge error", error?.message || error);
    return json({ error: "The AI bridge encountered an unexpected error." }, 500);
  }
}

export function onRequestGet() {
  return json({ ok: true, bridge: "External Payer Scorecard AI", apiKeyConfigured: "server-side" });
}
