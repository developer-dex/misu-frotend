import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speech to text with the browser's own recogniser (Chrome, Edge, Safari).
 * Not in TypeScript's DOM types yet, so the small part we use is typed here.
 */
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string };
}

interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Allow the microphone for this site to order by voice',
  'service-not-allowed': 'Allow the microphone for this site to order by voice',
  'no-speech': "Didn't hear anything. Tap the mic and speak",
  'audio-capture': 'No microphone found',
  network: 'Voice orders need an internet connection',
};

/** Listens for one phrase and hands back the recogniser's guesses, best first. */
export function useSpeech(onPhrase: (alternatives: string[]) => void) {
  const supported = recognitionCtor() !== null;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<Recognition | null>(null);
  const handler = useRef(onPhrase);
  handler.current = onPhrase;

  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    rec.current?.abort();
    const r = new Ctor();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.continuous = false;
    r.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          const guesses = Array.from({ length: result.length }, (_, k) => result[k].transcript.trim()).filter(Boolean);
          setInterim(guesses[0] ?? '');
          if (guesses.length) handler.current(guesses);
        } else {
          text += result[0].transcript;
        }
      }
      if (text) setInterim(text);
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'Voice input stopped. Tap the mic to try again');
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setError('');
    setInterim('');
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}

/** Says a short message out loud, for when hands are busy at the stall. */
export function say(message: string): void {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(message);
  u.lang = 'en-IN';
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}
