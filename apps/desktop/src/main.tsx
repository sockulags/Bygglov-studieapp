import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';

// Fonts are bundled so the app works offline (no CDN).
import '@fontsource-variable/inter';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/source-serif-4/600.css';
import '@/styles/globals.css';

import { Providers } from '@/app/providers';
import { router } from '@/app/router';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root saknas i index.html');
}

createRoot(container).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
