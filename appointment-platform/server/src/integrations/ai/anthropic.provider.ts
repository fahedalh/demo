import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { heuristicProvider } from './heuristic.provider';
import type { AIProvider, SearchIntent } from './types';

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 }));

const SEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string', description: 'Free-text keywords for the service or business, without location/date/price words' },
    category: { type: 'string', description: 'One of the provided category slugs, if clearly implied' },
    city: { type: 'string' },
    maxPrice: { type: 'number' },
    minRating: { type: 'number' },
    date: { type: 'string', description: 'YYYY-MM-DD' },
    partOfDay: { type: 'string', enum: ['morning', 'afternoon', 'evening'] },
  },
  required: [],
} as const;

/** Sends one request; returns the text of the response, or null on refusal. */
async function complete(system: string, user: string, json = false): Promise<string | null> {
  // Server-side refusal fallback: if the model declines, the API retries on a fallback model in the same call.
  const params = {
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    model: env.AI_MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user' as const, content: user }],
    output_config: { effort: 'low' as const, ...(json ? { format: { type: 'json_schema' as const, schema: SEARCH_SCHEMA } } : {}) },
  };
  const response = await anthropic().beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
  if (response.stop_reason === 'refusal') return null;
  return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim() || null;
}

/** LLM-backed provider. Every call falls back to the heuristic provider on any error. */
export const anthropicProvider: AIProvider = {
  key: 'anthropic',
  async parseSearch(text, today, categories) {
    try {
      const out = await complete(
        `You convert a booking search query into filters for an appointment marketplace. Today is ${today}. Category slugs: ${categories.join(', ')}. Only include fields the query clearly implies.`,
        text,
        true,
      );
      if (!out) return heuristicProvider.parseSearch(text, today, categories);
      const parsed = JSON.parse(out) as SearchIntent;
      if (parsed.category && !categories.includes(parsed.category)) delete parsed.category;
      return parsed;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'AI parseSearch failed, using heuristic');
      return heuristicProvider.parseSearch(text, today, categories);
    }
  },
  async describeBusiness(i) {
    try {
      const out = await complete(
        'You write concise, warm business descriptions for public booking pages. 2–3 sentences, no more than 70 words, no emojis, no invented facts (awards, years, prices). Reply with the description only.',
        `Language: ${i.locale === 'ar' ? 'Arabic' : 'English'}\nTone: ${i.tone ?? 'professional'}\nBusiness: ${i.name}\nCategory: ${i.category}\nCity: ${i.city ?? 'n/a'}\nServices: ${i.services.join(', ') || 'n/a'}`,
      );
      return out ?? heuristicProvider.describeBusiness(i);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'AI describeBusiness failed, using heuristic');
      return heuristicProvider.describeBusiness(i);
    }
  },
};
