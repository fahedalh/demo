import { env } from '../../config/env';
import { anthropicProvider } from './anthropic.provider';
import { heuristicProvider } from './heuristic.provider';
import type { AIProvider } from './types';

/** Returns the configured AI provider. The heuristic provider needs no credentials. */
export function getAI(): AIProvider {
  return env.ANTHROPIC_API_KEY ? anthropicProvider : heuristicProvider;
}

export * from './types';

/**
 * No-show risk score in [0,1] from a customer's history and booking context. Simple, explainable
 * logistic-style heuristic; swap for a trained model behind the same signature later.
 */
export function noShowRisk(input: { bookings: number; noShows: number; cancelled: number; leadHours: number; paid: boolean; isNew: boolean }) {
  const history = input.bookings > 0 ? (input.noShows * 1.0 + input.cancelled * 0.35) / input.bookings : 0;
  let z = -2.2 + history * 3.2 + (input.isNew ? 0.5 : 0) + (input.leadHours > 24 * 14 ? 0.4 : 0) + (input.leadHours < 3 ? -0.3 : 0) + (input.paid ? -1.2 : 0);
  z = Math.max(-6, Math.min(6, z));
  const score = 1 / (1 + Math.exp(-z));
  const reasons: string[] = [];
  if (input.noShows) reasons.push(`${input.noShows} previous no-show(s)`);
  if (input.cancelled > 1) reasons.push(`${input.cancelled} cancellations`);
  if (input.isNew) reasons.push('first visit');
  if (input.leadHours > 24 * 14) reasons.push('booked far in advance');
  if (input.paid) reasons.push('prepaid (lower risk)');
  return { score: Math.round(score * 100) / 100, level: score > 0.45 ? 'high' : score > 0.2 ? 'medium' : 'low', reasons };
}
