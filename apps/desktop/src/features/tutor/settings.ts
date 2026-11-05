import { z } from 'zod';
import { useSetting, type DataStore } from '@/data';
import {
  DEFAULT_SEK_PER_USD,
  DEFAULT_TUTOR_MODEL,
  TUTOR_MODELS,
  type TutorModelId,
} from './pricing';

/**
 * Tutor settings (Inställningar → Studiehjälp), stored in the settings table. The API key
 * is not among them: it lives in the OS keyring, behind the Rust commands.
 */

export const TUTOR_SETTING_KEYS = {
  model: 'studiehjalp.modell',
  sekPerUsd: 'studiehjalp.vaxelkurs',
  dailyCapSek: 'studiehjalp.dagligt_tak_kr',
} as const;

export const DEFAULT_DAILY_CAP_SEK = 20;

export const tutorModelSchema = z.enum(TUTOR_MODELS);
export const sekPerUsdSchema = z.number().finite().positive().max(1000);
export const dailyCapSchema = z.number().finite().min(0).max(10_000);

export interface TutorSettings {
  model: TutorModelId;
  sekPerUsd: number;
  dailyCapSek: number;
}

export const DEFAULT_TUTOR_SETTINGS: TutorSettings = {
  model: DEFAULT_TUTOR_MODEL,
  sekPerUsd: DEFAULT_SEK_PER_USD,
  dailyCapSek: DEFAULT_DAILY_CAP_SEK,
};

async function read<T>(
  store: DataStore,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  const stored = await store.settings.get(key);
  if (stored === undefined) return fallback;
  const parsed = schema.safeParse(stored);
  return parsed.success ? parsed.data : fallback;
}

/** The settings as stored, with defaults for missing or invalid values. */
export async function loadTutorSettings(store: DataStore): Promise<TutorSettings> {
  const [model, sekPerUsd, dailyCapSek] = await Promise.all([
    read(store, TUTOR_SETTING_KEYS.model, tutorModelSchema, DEFAULT_TUTOR_SETTINGS.model),
    read(store, TUTOR_SETTING_KEYS.sekPerUsd, sekPerUsdSchema, DEFAULT_TUTOR_SETTINGS.sekPerUsd),
    read(store, TUTOR_SETTING_KEYS.dailyCapSek, dailyCapSchema, DEFAULT_TUTOR_SETTINGS.dailyCapSek),
  ]);
  return { model, sekPerUsd, dailyCapSek };
}

export function useTutorModel() {
  return useSetting<TutorModelId>(TUTOR_SETTING_KEYS.model, tutorModelSchema, DEFAULT_TUTOR_MODEL);
}

export function useSekPerUsd() {
  return useSetting<number>(TUTOR_SETTING_KEYS.sekPerUsd, sekPerUsdSchema, DEFAULT_SEK_PER_USD);
}

export function useDailyCapSek() {
  return useSetting<number>(TUTOR_SETTING_KEYS.dailyCapSek, dailyCapSchema, DEFAULT_DAILY_CAP_SEK);
}

/** Parses a number typed with a Swedish decimal comma ("10,5"), or null when it is not one. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** "10,5" for an input field. */
export function formatDecimal(value: number): string {
  return String(value).replace('.', ',');
}
