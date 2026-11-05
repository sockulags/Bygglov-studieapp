import {
  isTauri,
  tutorAsk,
  tutorClearKey,
  tutorHasKey,
  tutorSetKey,
  tutorTestKey,
} from '@/lib/tauri';
import { MockTransport } from './mock-transport';
import type { TutorEvent, TutorKeyTestResult, TutorRequest, TutorUsage } from './types';

/**
 * How the tutor reaches the model. Inside the desktop app the Rust side holds the API key
 * (OS keyring) and makes the HTTPS call; JavaScript only sends the prompt and receives the
 * streamed text. In a plain browser (`pnpm --filter desktop dev`) a mock streams a recorded
 * answer so the panel can be developed without a key or network.
 */
export interface TutorTransport {
  /** "tauri" calls the API through Rust; "mock" never makes an AI call (Testläge). */
  readonly kind: 'tauri' | 'mock';
  hasKey(): Promise<boolean>;
  /** Hands the key to the keyring. Rejects with a Swedish message when it is not accepted. */
  setKey(key: string): Promise<void>;
  clearKey(): Promise<void>;
  testKey(model: string): Promise<TutorKeyTestResult>;
  /**
   * Streams an answer through `onEvent` and resolves with the usage when the stream ends.
   * Rejects with a Swedish message when the request fails before streaming.
   */
  ask(request: TutorRequest, onEvent: (event: TutorEvent) => void): Promise<TutorUsage>;
}

/** The Tauri commands of the IPC contract (lib/tauri.ts). */
export class TauriTransport implements TutorTransport {
  readonly kind = 'tauri' as const;
  hasKey(): Promise<boolean> {
    return tutorHasKey();
  }
  setKey(key: string): Promise<void> {
    return tutorSetKey(key);
  }
  clearKey(): Promise<void> {
    return tutorClearKey();
  }
  testKey(model: string): Promise<TutorKeyTestResult> {
    return tutorTestKey(model);
  }
  ask(request: TutorRequest, onEvent: (event: TutorEvent) => void): Promise<TutorUsage> {
    return tutorAsk(request, onEvent);
  }
}

let current: TutorTransport | null = null;

/** The app's transport: Tauri inside the desktop app, the mock in a browser. */
export function getTutorTransport(): TutorTransport {
  current ??= isTauri() ? new TauriTransport() : new MockTransport();
  return current;
}

/** Replaces the transport (tests). Pass null to go back to the default. */
export function setTutorTransport(transport: TutorTransport | null): void {
  current = transport;
}
