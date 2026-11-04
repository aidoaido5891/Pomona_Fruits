'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Basket } from '../lib/shop';
import { askCharlie, loadCharlieChat } from './charlie-actions';

type Message = { role: 'user' | 'assistant'; text: string };

const STORAGE_KEY = 'pomona-charlie-conversation';
const MAX_LENGTH = 500;
const SUGGESTIONS = [
  "What's in the Magic Fruit Box?",
  'When would my order arrive?',
  'Add 1 kg of strawberries',
];

/** An original drawing of a Blenheim King Charles Cavalier. */
function CharlieFace({ size }: { size: number }) {
  return (
    <svg className="charlie-face" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#fde7c2" />
      <ellipse cx="19" cy="58" rx="15" ry="28" fill="#8f4417" transform="rotate(8 19 58)" />
      <ellipse cx="81" cy="58" rx="15" ry="28" fill="#8f4417" transform="rotate(-8 81 58)" />
      <path d="M11 74q4 5 2 11M20 78q3 5 1 10M89 74q-4 5-2 11M80 78q-3 5-1 10" stroke="#6e3210" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="50" rx="28" ry="30" fill="#fffaf2" />
      <ellipse cx="35" cy="40" rx="13" ry="15" fill="#a9561f" />
      <ellipse cx="65" cy="40" rx="13" ry="15" fill="#a9561f" />
      <circle cx="50" cy="29" r="3.2" fill="#a9561f" />
      <ellipse cx="50" cy="66" rx="17" ry="14" fill="#ffffff" />
      <circle cx="37" cy="44" r="6" fill="#24150d" />
      <circle cx="63" cy="44" r="6" fill="#24150d" />
      <circle cx="39" cy="42" r="2" fill="#ffffff" />
      <circle cx="65" cy="42" r="2" fill="#ffffff" />
      <ellipse cx="50" cy="58" rx="6" ry="4.5" fill="#24150d" />
      <path d="M50 62v5M41 67q9 7 18 0" stroke="#24150d" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M46 70q4 10 8 0z" fill="#ef7f8c" />
    </svg>
  );
}

export default function Charlie({
  basket,
  onBasketChange,
}: {
  basket: Basket;
  onBasketChange: (basket: Basket) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const conversationId = useRef('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A chat is identified by a random id kept in this browser, and its messages live in the database.
  useEffect(() => {
    let id = '';
    try {
      id = localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {}
    if (id) {
      conversationId.current = id;
      loadCharlieChat(id).then(setMessages);
    } else {
      id = crypto.randomUUID();
      conversationId.current = id;
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (open) {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
      inputRef.current?.focus();
    }
  }, [open, messages, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    const history = messages;
    setMessages([...history, { role: 'user', text: message }]);
    setInput('');
    setError('');
    setSending(true);
    try {
      const result = await askCharlie({ conversationId: conversationId.current, message, history, basket });
      if (result.ok) {
        setMessages((current) => [...current, { role: 'assistant', text: result.reply }]);
        if (result.basketChanged) onBasketChange(result.basket);
      } else {
        setMessages(history);
        setInput(message);
        setError(result.error);
      }
    } catch {
      setMessages(history);
      setInput(message);
      setError('I could not reach the shop. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(input);
  }

  if (!open) {
    return (
      <button type="button" className="charlie-launcher" onClick={() => setOpen(true)}>
        <CharlieFace size={44} />
        <span>Ask Charlie</span>
      </button>
    );
  }

  return (
    <aside className="charlie-panel" aria-label="Chat with Charlie">
      <header>
        <CharlieFace size={52} />
        <div>
          <h2>Charlie</h2>
          <p>Your King Charles Cavalier helper</p>
        </div>
        <button type="button" className="charlie-close" onClick={() => setOpen(false)} aria-label="Close chat">
          ×
        </button>
      </header>

      <div className="charlie-log" ref={logRef} role="log" aria-live="polite">
        <p className="bubble bubble-charlie">
          Woof, hello! I&apos;m Charlie. I can answer questions about our fruit and delivery, and fill your basket for
          you. What can I fetch?
        </p>
        {messages.map((message, index) => (
          <p key={index} className={`bubble ${message.role === 'user' ? 'bubble-user' : 'bubble-charlie'}`}>
            {message.text}
          </p>
        ))}
        {sending && <p className="bubble bubble-charlie charlie-typing">Charlie is sniffing out an answer…</p>}
        {messages.length === 0 && !sending && (
          <div className="charlie-suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => send(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>

      <form className="charlie-form" onSubmit={submit}>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={MAX_LENGTH}
          placeholder="Ask Charlie…"
          aria-label="Your message to Charlie"
        />
        <button type="submit" className="button" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
      <p className="charlie-note">
        Charlie is an AI helper and can make mistakes. Chats are saved, so please keep personal details for the checkout
        form.
      </p>
    </aside>
  );
}
