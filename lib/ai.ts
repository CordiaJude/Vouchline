import "server-only";
import * as z from "zod/v4";

// Shared AI client for Vouchline's AI features (intro writing,
// plain-English search, profile from resume), served by Groq.
//
// Privacy rule for every caller: send only what the signed-in member
// could already see -- public profile fields and their own words. Never
// closeness ratings, private connections, or anyone's contact details.
//
// Uses Groq's OpenAI-compatible chat API with strict structured outputs
// (JSON Schema, constrained decoding), so replies always match the schema.

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const API_KEY = process.env.GROQ_API_KEY;
// Groq's recommended general-purpose model with strict JSON Schema support.
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export const aiConfigured = !!API_KEY;

export class AiError extends Error {
  constructor(public reason: "not_configured" | "rate_limited" | "failed") {
    super(reason);
  }
}

// Groq strict mode needs every property required and every object closed
// (additionalProperties: false); optional values are expressed as
// "type | null". zod's JSON Schema output is adjusted to match, and
// keywords strict mode doesn't need (numeric bounds, $schema) are dropped.
function toStrictSchema(schema: z.ZodType): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "format"].includes(k)) continue;
      out[k] = walk(v);
    }
    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.required = Object.keys(out.properties as object);
      out.additionalProperties = false;
    }
    return out;
  };
  return walk(z.toJSONSchema(schema)) as Record<string, unknown>;
}

// One structured call: returns data validated against `schema`.
export async function askStructured<S extends z.ZodType>({
  system,
  content,
  schema,
  maxTokens = 4000,
  effort = "low",
  name = "result",
}: {
  system: string;
  content: string;
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  name?: string;
}): Promise<z.infer<S>> {
  if (!API_KEY) throw new AiError("not_configured");

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: maxTokens,
        reasoning_effort: effort,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name, strict: true, schema: toStrictSchema(schema) },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error("[ai] request failed", err);
    throw new AiError("failed");
  }

  if (res.status === 429) throw new AiError("rate_limited");
  if (!res.ok) {
    console.error("[ai] groq error", res.status, (await res.text().catch(() => "")).slice(0, 500));
    throw new AiError("failed");
  }

  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new AiError("failed");
  try {
    return schema.parse(JSON.parse(text)) as z.infer<S>;
  } catch (err) {
    console.error("[ai] reply didn't match the schema", err, text.slice(0, 300));
    throw new AiError("failed");
  }
}

export function aiErrorMessage(err: unknown): string {
  const reason = err instanceof AiError ? err.reason : "failed";
  return reason === "not_configured"
    ? "AI isn't set up on this site yet."
    : reason === "rate_limited"
      ? "The AI is busy right now. Try again in a minute."
      : "The AI didn't respond. Try again in a moment.";
}
