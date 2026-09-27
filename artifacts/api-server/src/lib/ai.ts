import { logger } from "./logger";

/**
 * Optional "AI-assisted learning feedback". Only active when ANTHROPIC_API_KEY is configured.
 * It is used ONLY to comment on written learning answers. It never scores candidates, never affects
 * opportunity matching, and never makes employment, income, psychological, or certification claims.
 */
export const AI_LABEL = "AI-assisted learning feedback";

export const aiEnabled = (): boolean => Boolean(process.env["ANTHROPIC_API_KEY"]);

export type AiFeedback = { label: string; summary: string; improvementAreas: string[]; practiceQuestions: string[] };

export async function learningFeedback(input: {
  course: string;
  items: Array<{ question: string; answer: string; correct: boolean }>;
}): Promise<AiFeedback | null> {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) return null;
  const written = input.items.filter((i) => i.answer.trim());
  if (!written.length) return null;
  const prompt = [
    `A learner just took the assessment for the course "${input.course}". Below are her questions, answers and whether each was marked correct by a rule-based check.`,
    "Write short, encouraging LEARNING feedback only: what she understood, what to review, and 2-3 practice questions.",
    "Do not judge personality or ability, do not comment on employability, income, or job prospects, and do not mention certification.",
    'Reply with JSON only: {"summary": string, "improvementAreas": string[], "practiceQuestions": string[]}.',
    "",
    JSON.stringify(written.slice(0, 8)),
  ].join("\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env["AI_MODEL"] || "claude-sonnet-5", max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) as Partial<AiFeedback>;
    return {
      label: AI_LABEL,
      summary: String(parsed.summary ?? "").slice(0, 800),
      improvementAreas: (parsed.improvementAreas ?? []).map(String).slice(0, 5),
      practiceQuestions: (parsed.practiceQuestions ?? []).map(String).slice(0, 5),
    };
  } catch (err) {
    logger.warn({ err }, "AI-assisted feedback unavailable; continuing without it");
    return null;
  }
}
