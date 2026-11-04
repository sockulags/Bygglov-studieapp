import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadEvent } from '@tauri-apps/plugin-updater';
import { UpdatePrompt } from './update-prompt';
import {
  CHECK_INTERVAL_MS,
  STARTUP_CHECK_DELAY_MS,
  checkForUpdates,
  checkForUpdatesManually,
  installNow,
  later,
  resetUpdaterForTests,
  startAutoCheck,
  useUpdaterStore,
} from './updater';
import { PENDING_NOTES_KEY } from './storage';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));

interface FakeUpdate {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
  downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
  close: () => Promise<void>;
}

function fakeUpdate(overrides: Partial<FakeUpdate> = {}): FakeUpdate {
  return {
    version: '0.2.0',
    currentVersion: '0.1.0',
    body: '### Nytt\n\n- 40 nya frågor om tillsyn.',
    date: '2026-11-20T10:00:00Z',
    downloadAndInstall: vi.fn(async (onEvent?: (event: DownloadEvent) => void) => {
      onEvent?.({ event: 'Started', data: { contentLength: 200 } });
      onEvent?.({ event: 'Progress', data: { chunkLength: 50 } });
      onEvent?.({ event: 'Progress', data: { chunkLength: 150 } });
      onEvent?.({ event: 'Finished' });
    }),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}

function enableTauri(): void {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
}

function disableTauri(): void {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
}

beforeEach(() => {
  resetUpdaterForTests();
  mocks.check.mockReset();
  mocks.relaunch.mockReset();
  window.localStorage.clear();
  enableTauri();
});

afterEach(() => {
  disableTauri();
  vi.useRealTimers();
});

describe('updater outside Tauri', () => {
  it('does nothing in a plain browser', async () => {
    disableTauri();
    await expect(checkForUpdates()).resolves.toEqual({ status: 'unsupported' });
    await installNow();
    expect(startAutoCheck()).toBeTypeOf('function');
    expect(mocks.check).not.toHaveBeenCalled();
    expect(useUpdaterStore.getState().status).toBe('idle');
  });
});

describe('checkForUpdates', () => {
  it('reports an available update with its notes', async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await expect(checkForUpdates()).resolves.toMatchObject({
      status: 'available',
      version: '0.2.0',
    });
    const state = useUpdaterStore.getState();
    expect(state.status).toBe('available');
    expect(state.update).toMatchObject({ version: '0.2.0', currentVersion: '0.1.0' });
    expect(state.update?.notes).toContain('tillsyn');
  });

  it('returns to idle when there is no update', async () => {
    mocks.check.mockResolvedValue(null);
    await expect(checkForUpdates()).resolves.toEqual({ status: 'up-to-date' });
    expect(useUpdaterStore.getState().status).toBe('idle');
  });

  it('shares one request between concurrent checks', async () => {
    mocks.check.mockResolvedValue(null);
    await Promise.all([checkForUpdates(), checkForUpdates(), checkForUpdatesManually()]);
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it('records a failed check without losing a found update', async () => {
    mocks.check.mockRejectedValueOnce(new Error('offline'));
    await expect(checkForUpdates()).resolves.toEqual({ status: 'error', message: 'offline' });
    expect(useUpdaterStore.getState().error).toEqual({ phase: 'check', message: 'offline' });

    mocks.check.mockResolvedValueOnce(fakeUpdate());
    await checkForUpdates();
    mocks.check.mockRejectedValueOnce(new Error('offline'));
    await checkForUpdates();
    expect(useUpdaterStore.getState().status).toBe('available');
  });

  it('un-hides the banner on a manual check', async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdates();
    later();
    expect(useUpdaterStore.getState().dismissed).toBe(true);
    await checkForUpdatesManually();
    expect(useUpdaterStore.getState().dismissed).toBe(false);
  });
});

describe('installNow', () => {
  it('downloads with progress, saves the notes and relaunches', async () => {
    const update = fakeUpdate();
    mocks.check.mockResolvedValue(update);
    await checkForUpdates();

    const percents: (number | undefined)[] = [];
    const unsubscribe = useUpdaterStore.subscribe((s) => percents.push(s.progress?.percent));
    await installNow();
    unsubscribe();

    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(percents).toContain(25);
    expect(percents).toContain(100);
    expect(useUpdaterStore.getState().status).toBe('installing');
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(PENDING_NOTES_KEY) ?? '{}')).toMatchObject({
      version: '0.2.0',
    });
  });

  it('checks first when no update has been found yet', async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await installNow();
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });

  it('reports an install error', async () => {
    mocks.check.mockResolvedValue(
      fakeUpdate({ downloadAndInstall: vi.fn(async () => Promise.reject(new Error('signatur'))) }),
    );
    await checkForUpdates();
    await installNow();
    expect(useUpdaterStore.getState()).toMatchObject({
      status: 'error',
      error: { phase: 'install', message: 'signatur' },
    });
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});

describe('startAutoCheck', () => {
  it('checks after start and then every six hours, once for several users', async () => {
    vi.useFakeTimers();
    mocks.check.mockResolvedValue(null);
    const stopA = startAutoCheck();
    const stopB = startAutoCheck();

    await vi.advanceTimersByTimeAsync(STARTUP_CHECK_DELAY_MS);
    expect(mocks.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(mocks.check).toHaveBeenCalledTimes(2);

    stopA();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(mocks.check).toHaveBeenCalledTimes(3);

    stopB();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(mocks.check).toHaveBeenCalledTimes(3);
  });
});

describe('UpdatePrompt', () => {
  it('renders nothing when there is no update', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the update in Swedish with release notes, and hides on Senare', async () => {
    const user = userEvent.setup();
    mocks.check.mockResolvedValue(fakeUpdate());
    await act(async () => {
      await checkForUpdates();
    });
    render(<UpdatePrompt />);

    expect(screen.getByText('En ny version finns.')).toBeInTheDocument();
    expect(screen.getByText(/Uppdatera nu\?/)).toBeInTheDocument();
    expect(screen.getByText('Vad är nytt i version 0.2.0')).toBeInTheDocument();
    expect(screen.getByText('40 nya frågor om tillsyn.')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Senare' })[0]!);
    expect(screen.queryByText('En ny version finns.')).not.toBeInTheDocument();
  });

  it('shows an error banner with retry when installing fails', async () => {
    mocks.check.mockResolvedValue(
      fakeUpdate({ downloadAndInstall: vi.fn(async () => Promise.reject(new Error('nät'))) }),
    );
    await act(async () => {
      await checkForUpdates();
      await installNow();
    });
    render(<UpdatePrompt />);
    expect(screen.getByText('Uppdateringen gick inte att hämta.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeInTheDocument();
  });
});
