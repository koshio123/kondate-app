/**
 * Candidate models and list prices (USD per 1M tokens), checked 2026-10-12:
 * https://platform.claude.com/docs/en/about-claude/pricing
 */
export interface ModelCandidate {
  key: string;
  id: string;
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
}

export const MODELS: ModelCandidate[] = [
  {
    key: "sonnet",
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    inputPerMTok: 2,
    outputPerMTok: 10,
  },
  {
    key: "haiku",
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
  },
  {
    key: "opus",
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    inputPerMTok: 4,
    outputPerMTok: 20,
  },
];

export const JPY_PER_USD = 150;

/** Haiku 5.5 is priced higher above 100K-token prompts; plan prompts are far below that. */
export function costUsd(model: ModelCandidate, inputTokens: number, outputTokens: number): number {
  return (inputTokens * model.inputPerMTok + outputTokens * model.outputPerMTok) / 1_000_000;
}
