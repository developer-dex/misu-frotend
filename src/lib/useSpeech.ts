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

/** iPhone and iPad, in any browser: they all run Apple's WebKit underneath. */
export const IS_IOS =
  typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const ERRORS: Record<string, string> = {
  'not-allowed': 'Allow the microphone for this site to order by voice',
  'service-not-allowed': 'Allow the microphone and speech recognition for this site',
  'no-speech': "Didn't hear anything. Tap the mic and speak",
  'audio-capture': 'The microphone is busy. Tap the mic again',
  network: 'Voice orders need an internet connection',
};

// Stop listening this long after the words stop changing; iPhone often never ends a phrase by itself
const SILENCE_MS = 1400;
// Give up on a listen that never finishes, so the mic button never stays stuck
const MAX_LISTEN_MS = 12_000;

/** Listens for one phrase and hands back the recogniser's guesses, best first. */
export function useSpeech(onPhrase: (alternatives: string[]) => void) {
  const supported = recognitionCtor() !== null;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<Recognition | null>(null);
  const handler = useRef(onPhrase);
  handler.current = onPhrase;

  const detach = (r: Recognition) => {
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    try {
      r.abort();
    } catch {
      // Already stopped
    }
  };

  useEffect(
    () => () => {
      if (rec.current) detach(rec.current);
    },
    [],
  );

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    // A spoken reply still playing holds the audio and blocks the microphone
    window.speechSynthesis?.cancel();
    // Each tap gets a fresh recogniser; the old one must not report into the new listen
    if (rec.current) detach(rec.current);

    const r = new Ctor();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.continuous = false;
    rec.current = r;

    let delivered = false;
    let failed = false;
    let lastText = '';
    let silence: number | undefined;
    const current = () => rec.current === r;

    const finish = () => {
      window.clearTimeout(silence);
      window.clearTimeout(watchdog);
      if (!current()) return;
      rec.current = null;
      setListening(false);
      // iPhone may end without marking the phrase final: use what it heard
      if (!delivered && !failed) {
        if (lastText) {
          delivered = true;
          handler.current([lastText]);
        } else {
          setError("Didn't catch that. Tap the mic and speak");
        }
      }
    };

    const watchdog = window.setTimeout(() => {
      if (!current()) return;
      detach(r);
      finish();
    }, MAX_LISTEN_MS);

    r.onresult = (e) => {
      if (!current() || delivered) return;
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal && i >= e.resultIndex) {
          const guesses = Array.from({ length: result.length }, (_, k) => result[k].transcript.trim()).filter(Boolean);
          if (guesses.length) {
            delivered = true;
            setInterim(guesses[0]);
            handler.current(guesses);
            try {
              r.stop();
            } catch {
              // Already stopping
            }
            return;
          }
        }
        text += result[0]?.transcript ?? '';
      }
      lastText = text.trim();
      if (lastText) setInterim(lastText);
      window.clearTimeout(silence);
      silence = window.setTimeout(() => {
        if (!current()) return;
        try {
          r.stop();
        } catch {
          finish();
        }
      }, SILENCE_MS);
    };
    r.onerror = (e) => {
      if (!current() || e.error === 'aborted') return;
      // Words already heard still count even if the recogniser complains afterwards
      if (lastText && e.error === 'no-speech') return;
      failed = true;
      setError(ERRORS[e.error] ?? 'Voice input stopped. Tap the mic to try again');
    };
    r.onend = finish;

    setError('');
    setInterim('');
    setListening(true);
    try {
      r.start();
    } catch {
      failed = true;
      setError('The microphone is busy. Tap the mic again');
      finish();
    }
  }, []);

  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return setListening(false);
    try {
      r.stop();
    } catch {
      detach(r);
      rec.current = null;
      setListening(false);
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}

/**
 * Says a short message out loud, for when hands are busy at the stall.
 * Not on iPhone: once a page has spoken there, iOS keeps the audio for the
 * speaker and the microphone stops working until the app is reopened.
 */
export function say(message: string): void {
  if (IS_IOS || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(message);
  u.lang = 'en-IN';
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}
