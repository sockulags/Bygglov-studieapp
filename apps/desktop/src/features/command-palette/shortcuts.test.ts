import { describe, expect, it } from 'vitest';
import { navTargetForKey } from '@/app/navigation';
import { createSequenceTracker, modKey, shortcutSections } from './shortcuts';

describe('navTargetForKey', () => {
  it('maps the second key of g-sequences to views', () => {
    expect(navTargetForKey('h')?.to).toBe('/');
    expect(navTargetForKey('p')?.to).toBe('/study');
    expect(navTargetForKey('ä')?.to).toBe('/cases');
    expect(navTargetForKey('Ä')?.to).toBe('/cases');
    expect(navTargetForKey('a')?.to).toBe('/cases');
    expect(navTargetForKey('u')?.to).toBe('/lookup');
    expect(navTargetForKey('r')?.to).toBe('/results');
    expect(navTargetForKey('i')?.to).toBe('/settings');
    expect(navTargetForKey('m')).toBeUndefined();
    expect(navTargetForKey('1')).toBeUndefined();
  });
});

describe('createSequenceTracker', () => {
  it('navigates on g followed by a view key', () => {
    const tracker = createSequenceTracker(1000);
    expect(tracker.press('g', 0)).toEqual({ kind: 'waiting' });
    const result = tracker.press('u', 300);
    expect(result.kind === 'navigate' && result.item.to).toBe('/lookup');
    expect(tracker.waiting).toBe(false);
  });

  it('ignores a view key without g, and after the timeout', () => {
    const tracker = createSequenceTracker(1000);
    expect(tracker.press('h', 0)).toEqual({ kind: 'idle' });
    tracker.press('g', 0);
    expect(tracker.press('h', 1500)).toEqual({ kind: 'idle' });
  });

  it('lets other keys through and ends the sequence', () => {
    const tracker = createSequenceTracker(1000);
    tracker.press('g', 0);
    // A quiz answer after a stray g is not swallowed.
    expect(tracker.press('1', 100)).toEqual({ kind: 'idle' });
    expect(tracker.press('h', 200)).toEqual({ kind: 'idle' });
  });

  it('restarts on g g and can be reset', () => {
    const tracker = createSequenceTracker(1000);
    tracker.press('g', 0);
    expect(tracker.press('g', 900)).toEqual({ kind: 'waiting' });
    expect(tracker.press('r', 1800).kind).toBe('navigate');
    tracker.press('g', 2000);
    tracker.reset();
    expect(tracker.press('r', 2100)).toEqual({ kind: 'idle' });
  });
});

describe('shortcut list', () => {
  it('uses ⌘ on Mac and Ctrl elsewhere', () => {
    expect(modKey('MacIntel')).toBe('⌘');
    expect(modKey('macOS')).toBe('⌘');
    expect(modKey('Win32')).toBe('Ctrl');
    expect(shortcutSections('Ctrl')[0]?.rows[0]?.keys).toEqual(['Ctrl', 'K']);
  });

  it('lists every view sequence once and has no duplicate global keys', () => {
    const global = shortcutSections('Ctrl')[0]!.rows;
    const keys = global.map((row) => row.keys.join(' '));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['g h', 'g p', 'g ä', 'g u', 'g r', 'g i']));
  });
});
