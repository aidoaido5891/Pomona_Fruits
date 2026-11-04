'use server';

import Anthropic from '@anthropic-ai/sdk';
import { headers } from 'next/headers';
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_LENGTH,
  askClaude,
  usageLimitMessage,
  type ChatMessage,
} from '../lib/charlie';
import { getCharlieMessages, getSoldOut, saveCharlieExchange } from '../lib/db';
import { parseBasket, type Basket, type FruitId } from '../lib/shop';

export type CharlieResult =
  | { ok: true; reply: string; basket: Basket; basketChanged: boolean }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const history = raw.slice(-MAX_HISTORY_MESSAGES).flatMap((entry): ChatMessage[] => {
    const { role, text } = (entry ?? {}) as { role?: unknown; text?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string' || !text.trim()) return [];
    return [{ role, text: text.slice(0, 2000) }];
  });
  // A conversation sent to the model has to begin with the customer.
  while (history[0]?.role === 'assistant') history.shift();
  return history;
}

/** The browser only sends text and a basket. Its history can only affect that customer's own chat. */
export async function askCharlie(raw: unknown): Promise<CharlieResult> {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const conversationId = typeof data.conversationId === 'string' ? data.conversationId : '';
  const basket = parseBasket(data.basket);

  if (!message || message.length > MAX_MESSAGE_LENGTH || !basket || !UUID.test(conversationId)) {
    return { ok: false, error: `Please send me a message of up to ${MAX_MESSAGE_LENGTH} characters.` };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Charlie cannot answer because ANTHROPIC_API_KEY is not set');
    return { ok: false, error: "Charlie is having a nap right now. You can still order using the shop page." };
  }

  const visitor = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limit = usageLimitMessage(visitor);
  if (limit) return { ok: false, error: limit };

  // Chat still works if the database is down, just without knowing what has sold out.
  let soldOut: FruitId[] = [];
  try {
    soldOut = await getSoldOut();
  } catch (error) {
    console.error('Charlie could not read sold-out fruit', error);
  }

  try {
    const history = [...parseHistory(data.history), { role: 'user' as const, text: message }];
    const answer = await askClaude(history, basket, soldOut);
    try {
      await saveCharlieExchange(conversationId, message, answer.text);
    } catch (error) {
      console.error('Could not save Charlie chat', error);
    }
    return { ok: true, reply: answer.text, basket: answer.basket, basketChanged: answer.basketChanged };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('The ANTHROPIC_API_KEY was rejected');
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error('Claude API rate limit reached');
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status}`, error.message);
    } else {
      console.error('Charlie failed', error);
    }
    return { ok: false, error: 'Woof, my ears got tangled! Please try again in a moment.' };
  }
}

/** Brings back a saved chat after a page reload. The random id is what keeps a chat private. */
export async function loadCharlieChat(conversationId: unknown): Promise<ChatMessage[]> {
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) return [];
  try {
    const rows = await getCharlieMessages(conversationId, MAX_HISTORY_MESSAGES);
    return rows.map((row) => ({ role: row.role, text: row.content }));
  } catch (error) {
    console.error('Could not load Charlie chat', error);
    return [];
  }
}
