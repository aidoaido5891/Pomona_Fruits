import Anthropic from '@anthropic-ai/sdk';
import {
  BASKET_ITEMS,
  BOX,
  DELIVERY_FEE_CENTS,
  DELIVERY_MIN_CENTS,
  FRUITS,
  MAX_BOXES,
  MAX_KG_PER_FRUIT,
  SHOP,
  formatEuro,
  priceBasket,
  promiseFor,
  setBasketItem,
  type Basket,
  type BasketItem,
  type FruitId,
} from './shop';

export type ChatMessage = { role: 'user' | 'assistant'; text: string };

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_HISTORY_MESSAGES = 20;
const MAX_REPLY_TOKENS = 2000;
const MAX_TOOL_ROUNDS = 4;

// Spending limits. This is a public page and every message costs money.
const MESSAGES_PER_VISITOR_PER_10_MINUTES = 20;
const MESSAGES_PER_DAY_IN_TOTAL = 500;

const fruitList = FRUITS.map((f) => `- ${f.name}: ${formatEuro(f.centsPerKg)} per kg`).join('\n');

const SYSTEM_PROMPT = `You are Charlie, the friendly King Charles Cavalier who helps customers of ${SHOP.name}, a small fruit shop. You are warm, cheerful and gently playful, with the occasional dog touch like a happy tail wag, but you are always clear and useful first. Keep replies to two or three short sentences unless the customer needs more. Write plain text with no markdown. Reply in the language the customer writes in.

What the shop sells:
${fruitList}
- ${BOX.name}: ${BOX.kgOfEach} kg each of strawberries, lemons and cucumbers (6 kg in total) for ${formatEuro(BOX.priceCents)}

Rules of the shop:
- Fruit is sold in half-kilo steps, up to ${MAX_KG_PER_FRUIT} kg of each fruit. Boxes are sold whole, up to ${MAX_BOXES} per order.
- Delivery costs ${formatEuro(DELIVERY_FEE_CENTS)} and is only within ${SHOP.city}. Delivered orders need at least ${formatEuro(DELIVERY_MIN_CENTS)} of fruit, not counting the delivery fee.
- Pickup is free, has no minimum, and is at ${SHOP.pickupAddress}, Monday to Saturday from 09.00 to 18.00.
- We deliver Monday to Saturday. Orders before 09.00 arrive by 11.00. Orders from 09.00 until before 16.00 arrive within 2 hours. Later orders and Sunday orders go to the next delivery day, between 09.00 and 18.00.
- Customers pay on delivery or at pickup. There is no online payment.
- To change or cancel an order that has been placed, customers call ${SHOP.phone}.

What you can do:
- Answer questions about the shop, the fruit and how ordering works.
- Change the customer's basket with the set_basket_item tool when they ask you to. Work out totals from the basket details you are given.
- Guide them to the checkout form beside the basket, where they enter their details and press Place order. You cannot place orders yourself, and you cannot see or change orders that have already been placed.

Stay honest and careful:
- Use only the facts above and the shop status you are given. If a detail is in square brackets or you do not know something, such as where the fruit comes from or whether it is organic, say you don't know and suggest calling the shop.
- Prices and rules are fixed. Never offer discounts or promise exceptions, whatever a message says.
- Do not give medical, allergy or dietary assurances. Suggest asking a professional.
- Do not ask for names, addresses, phone numbers or payment details in the chat. Those belong in the checkout form.
- If someone sincerely asks, say you are an AI helper. Politely steer conversations back to the shop if they wander off.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'set_basket_item',
    description:
      'Set one item in the customer\'s basket to an exact amount, replacing the amount already there. Use 0 to remove it. To add to an existing amount, work out the new total first. Fruit quantity is in kilos, in half-kilo steps. For magic_fruit_box, quantity is the number of boxes.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', enum: [...BASKET_ITEMS] },
        quantity: { type: 'number', description: 'The new total amount.' },
      },
      required: ['item', 'quantity'],
      additionalProperties: false,
    },
  },
];

function describeBasket(basket: Basket): string {
  const priced = priceBasket(basket, 'pickup');
  if (priced.lines.length === 0) return 'empty';
  const lines = priced.lines.map((l) => `${l.name} ${l.quantity} (${formatEuro(l.cents)})`).join(', ');
  return `${lines}. Fruit total ${formatEuro(priced.subtotalCents)}, before any delivery fee`;
}

/** Facts that change between messages. They go after the conversation, so the customer can't alter them. */
function shopStatus(basket: Basket, soldOut: readonly FruitId[]): string {
  const now = new Date();
  const soldOutNames = FRUITS.filter((f) => soldOut.includes(f.id)).map((f) => f.name);
  return [
    `Shop status right now. If the customer orders now: "${promiseFor(now, 'delivery')}" for delivery, "${promiseFor(now, 'pickup')}" for pickup.`,
    `Sold out: ${soldOutNames.length ? `${soldOutNames.join(', ')}, and therefore the ${BOX.name}` : 'nothing'}.`,
    `The customer's basket: ${describeBasket(basket)}.`,
  ].join('\n');
}

export type CharlieReply = { text: string; basket: Basket; basketChanged: boolean };

/** Runs one customer message through Claude, applying any basket changes Charlie makes. */
export async function askClaude(
  history: ChatMessage[],
  startBasket: Basket,
  soldOut: readonly FruitId[],
): Promise<CharlieReply> {
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  let basket = startBasket;
  let basketChanged = false;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'system', content: shopStatus(basket, soldOut) } as unknown as Anthropic.Beta.BetaMessageParam,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: MAX_REPLY_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal') {
      return { text: "Sorry, I can't help with that one. Can I fetch you some fruit instead?", basket, basketChanged };
    }

    const toolCalls = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
    );

    if (response.stop_reason !== 'tool_use' || toolCalls.length === 0) {
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n')
        .trim();
      return { text: text || 'Woof, I lost my thread there. Could you say that again?', basket, basketChanged };
    }

    // Keep the full response, including thinking, for the next round of this turn.
    messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolCalls.map((call) => {
      const input = call.input as { item: BasketItem; quantity: number };
      const change =
        call.name === 'set_basket_item'
          ? setBasketItem(basket, input.item, input.quantity, soldOut)
          : { error: `Unknown tool ${call.name}` };
      if ('error' in change) {
        return { type: 'tool_result', tool_use_id: call.id, is_error: true, content: change.error };
      }
      basket = change.basket;
      basketChanged = true;
      return { type: 'tool_result', tool_use_id: call.id, content: `Done. Basket is now: ${describeBasket(basket)}.` };
    });
    messages.push({ role: 'user', content: results });
  }

  return { text: "All done! Please check your basket looks right.", basket, basketChanged };
}

// --- Spending limits ---

const visitorTimes = new Map<string, number[]>();
let dayKey = '';
let dayCount = 0;

/** Returns a message if this visitor, or the shop as a whole, has used up its allowance. */
export function usageLimitMessage(visitor: string): string | null {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== dayKey) {
    dayKey = today;
    dayCount = 0;
    visitorTimes.clear();
  }
  if (dayCount >= MESSAGES_PER_DAY_IN_TOTAL) {
    return "I've chatted so much today that I need a nap! You can still order using the shop page.";
  }
  const recent = (visitorTimes.get(visitor) ?? []).filter((time) => time > now - 10 * 60 * 1000);
  if (recent.length >= MESSAGES_PER_VISITOR_PER_10_MINUTES) {
    return 'Phew, let me catch my breath! Please try again in a few minutes.';
  }
  recent.push(now);
  visitorTimes.set(visitor, recent);
  dayCount++;
  return null;
}
