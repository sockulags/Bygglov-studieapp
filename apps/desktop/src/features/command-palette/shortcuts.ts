import { allNav, navTargetForKey, type NavItem } from '@/app/navigation';

/** How long the second key of a "g …" sequence may wait. */
export const SEQUENCE_TIMEOUT_MS = 1500;

/** One row in the shortcuts dialog; `keys` are shown as <kbd>. */
export interface ShortcutRow {
  keys: readonly string[];
  /** Held together (default), pressed one after the other ("g", then "h") or any of them. */
  mode?: 'together' | 'sequence' | 'either';
  description: string;
}

export interface ShortcutSection {
  title: string;
  rows: readonly ShortcutRow[];
}

/** "Ctrl" or "⌘" for the palette shortcut. */
export function modKey(platform: string = currentPlatform()): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl';
}

function currentPlatform(): string {
  if (typeof navigator === 'undefined') return '';
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return data?.platform ?? navigator.platform ?? '';
}

/** Everything in the shortcuts dialog, in the same order as docs/tangentbord.md. */
export function shortcutSections(mod: string = modKey()): ShortcutSection[] {
  return [
    {
      title: 'Överallt',
      rows: [
        {
          keys: [mod, 'K'],
          description: 'Öppna kommandopaletten: sök vyer, ärenden, begrepp och lagrum',
        },
        ...allNav.map((item): ShortcutRow => ({
          keys: item.shortcut,
          mode: 'sequence',
          description: `Gå till ${item.label}`,
        })),
        {
          keys: ['/'],
          description: 'Sök: fokuserar sökfältet där det finns ett, annars kommandopaletten',
        },
        { keys: ['?'], description: 'Visa kortkommandon (i quizen och ärendet visas vyns egna)' },
        { keys: ['Esc'], description: 'Stäng dialogen, panelen eller handlingen som är öppen' },
        { keys: ['Tab'], description: 'Nästa knapp eller fält; Skift+Tab går bakåt' },
      ],
    },
    {
      title: 'I kommandopaletten',
      rows: [
        { keys: ['↑', '↓'], mode: 'either', description: 'Flytta mellan träffarna' },
        { keys: ['Enter'], description: 'Öppna eller kör den markerade träffen' },
        { keys: ['Esc'], description: 'Stäng paletten' },
      ],
    },
    {
      title: 'I quizen',
      rows: [
        { keys: ['1–9'], description: 'Välj svarsalternativ' },
        { keys: ['S', 'F'], mode: 'either', description: 'Svara sant eller falskt' },
        { keys: ['Enter'], description: 'Svara, eller gå till nästa fråga efter förklaringen' },
        { keys: ['?'], description: 'Visa quizens genvägar' },
      ],
    },
    {
      title: 'I ärendet',
      rows: [
        { keys: ['1–9'], description: 'Välj alternativ, bocka i checklistan eller välj beslut' },
        { keys: ['Enter'], description: 'Lämna in steget eller gå vidare efter återkopplingen' },
        { keys: [mod, 'Enter'], description: 'Lämna in en text' },
        { keys: ['M'], description: 'Mät i ritningen' },
        { keys: ['Esc'], description: 'Stäng handlingen eller helskärmsvyn' },
        { keys: ['?'], description: 'Visa ärendets genvägar' },
      ],
    },
  ];
}

export type SequenceResult =
  { kind: 'idle' } | { kind: 'waiting' } | { kind: 'navigate'; item: NavItem };

/**
 * State machine for "g …" sequences. `press` takes a key and the time it was pressed and
 * says what to do: wait for the second key, go to a view, or nothing.
 */
export function createSequenceTracker(timeoutMs: number = SEQUENCE_TIMEOUT_MS) {
  let pendingSince: number | null = null;
  return {
    press(key: string, now: number): SequenceResult {
      const waiting = pendingSince !== null && now - pendingSince <= timeoutMs;
      pendingSince = null;
      if (waiting) {
        const item = navTargetForKey(key);
        if (item) return { kind: 'navigate', item };
        // "g g" starts over; anything else just ends the sequence.
        if (key.toLowerCase() === 'g') {
          pendingSince = now;
          return { kind: 'waiting' };
        }
        return { kind: 'idle' };
      }
      if (key === 'g' || key === 'G') {
        pendingSince = now;
        return { kind: 'waiting' };
      }
      return { kind: 'idle' };
    },
    reset(): void {
      pendingSince = null;
    },
    get waiting(): boolean {
      return pendingSince !== null;
    },
  };
}
