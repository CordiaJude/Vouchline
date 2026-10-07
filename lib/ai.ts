import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

// Shared Claude client for Vouchline's AI features (intro writing,
// plain-English search, profile from resume).
//
// Privacy rule for every caller: send only what the signed-in member
// could already see -- public profile fields and their own words. Never
// closeness ratings, private connections, or anyone's contact details.
//
// Requests opt into server-side fallbacks ("default"): if Claude Opus 5.5
// declines a request on policy grounds, the API retries it on Anthropic's
// recommended fallback model within the same call.

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const aiConfigured = !!client;

const MODEL = "claude-opus-5-5";

export class AiError extends Error {
  constructor(public reason: "not_configured" | "refused" | "failed") {
    super(reason);
  }
}

type Content = string | Anthropic.Beta.BetaContentBlockParam[];

// One structured call: returns data validated against `schema`.
export async function askStructured<S extends z.ZodType>({
  system,
  content,
  schema,
  maxTokens = 4000,
  effort = "low",
}: {
  system: string;
  content: Content;
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<S>> {
  if (!client) throw new AiError("not_configured");
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") throw new AiError("refused");
    if (response.parsed_output == null) throw new AiError("failed");
    return response.parsed_output as z.infer<S>;
  } catch (err) {
    if (err instanceof AiError) throw err;
    console.error("[ai] request failed", err);
    throw new AiError("failed");
  }
}

export function aiErrorMessage(err: unknown): string {
  const reason = err instanceof AiError ? err.reason : "failed";
  return reason === "not_configured"
    ? "AI isn't set up on this site yet."
    : reason === "refused"
      ? "The AI couldn't help with that one. Try rewording it."
      : "The AI didn't respond. Try again in a moment.";
}
