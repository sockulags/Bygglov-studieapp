import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LAST_SEEN_VERSION_KEY } from './storage';
import { WhatsNewDialog } from './whats-new-dialog';

beforeEach(() => {
  window.localStorage.clear();
});

describe('WhatsNewDialog', () => {
  it('stays hidden on the first run and remembers the version', async () => {
    const { container } = render(<WhatsNewDialog />);
    await waitFor(() =>
      expect(window.localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(__APP_VERSION__),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows once after an update and is not shown again after closing', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.0.1');
    const { unmount } = render(<WhatsNewDialog />);

    expect(await screen.findByRole('dialog', { name: 'Vad är nytt' })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`version ${__APP_VERSION__}`))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fortsätt plugga' }));
    expect(window.localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(__APP_VERSION__);
    unmount();

    render(<WhatsNewDialog />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
