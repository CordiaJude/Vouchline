import "server-only";
import * as z from "zod/v4";
import { askStructured } from "@/lib/ai";

// Deliberately narrow: only public profile fields, names, and the
// requester's own words. Never connection types, years, or strength --
// the model must not see or influence relationship data.

const Draft = z.object({
  message: z.string().describe("The message body only: 2-4 sentences, plain text, no subject line, no markdown."),
});

export async function draftIntroText(params: {
  requesterName: string;
  requesterHeadline?: string | null;
  targetName: string;
  targetHeadline?: string | null;
  brokerName: string;
  goal: string;
}): Promise<string> {
  const out = await askStructured({
    schema: Draft,
    maxTokens: 1500,
    system:
      "You draft short, warm, specific introduction requests for a professional networking app. " +
      "The requester is asking a mutual connection (the broker) to introduce them to someone else " +
      "(the target). Write ONLY the message the requester sends to the broker: a natural greeting, " +
      "who they want to meet and exactly why, and an easy out for the broker. Be specific about the " +
      "stated goal; never invent details you weren't given.",
    content: [
      `Requester: ${params.requesterName}${params.requesterHeadline ? ` (${params.requesterHeadline})` : ""}`,
      `Target: ${params.targetName}${params.targetHeadline ? ` (${params.targetHeadline})` : ""}`,
      `Broker: ${params.brokerName}`,
      `Requester's goal, in their own words: ${params.goal}`,
    ].join("\n"),
  });
  return out.message.trim();
}

// The broker's note when passing an intro along -- shared with both sides.
export async function draftBrokerNote(params: {
  brokerName: string;
  requesterName: string;
  requesterHeadline?: string | null;
  targetName: string;
  targetHeadline?: string | null;
  ask: string;
}): Promise<string> {
  const out = await askStructured({
    schema: Draft,
    maxTokens: 1500,
    system:
      "You write the short note a person (the broker) adds when introducing two people they know " +
      "on a networking app. Both people read it. 2-3 sentences: say who each person is in a phrase, " +
      "why they should talk (based only on the request), and hand off warmly. Under 450 characters. " +
      "Write as the broker, first person. Never invent facts.",
    content: [
      `Broker (you): ${params.brokerName}`,
      `Person asking: ${params.requesterName}${params.requesterHeadline ? ` (${params.requesterHeadline})` : ""}`,
      `Person being introduced: ${params.targetName}${params.targetHeadline ? ` (${params.targetHeadline})` : ""}`,
      `Their request, in their words: ${params.ask}`,
    ].join("\n"),
  });
  return out.message.trim().slice(0, 500);
}
