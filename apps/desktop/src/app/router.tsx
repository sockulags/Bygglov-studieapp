import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router';
import { RootLayout } from '@/app/root-layout';
import { NotFoundPage } from '@/app/not-found';
import { HomePage } from '@/features/home/home-page';
import { StudyPage } from '@/features/study/study-page';
import { StudySessionPage } from '@/features/study/session-page';
import { isPracticeMode, type PracticeMode } from '@/features/study/modes';
import { CasesPage } from '@/features/cases/cases-page';
import { LookupPage } from '@/features/lookup/lookup-page';
import { SettingsPage } from '@/features/settings/settings-page';

/*
 * Code-based routing. Routes are declared here (not generated from files) so that
 * typecheck never depends on a generated route tree. Add a route by creating a
 * page component under src/features/<feature>/ and registering it below.
 */

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

export interface StudySearch {
  /** Selected study mode tab, e.g. `?mode=review`. */
  mode?: PracticeMode;
}

export const studyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/study',
  validateSearch: (search: Record<string, unknown>): StudySearch =>
    isPracticeMode(search.mode) ? { mode: search.mode } : {},
  component: StudyPage,
});

export const studySessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/study/session',
  component: StudySessionPage,
});

export const casesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cases',
  component: CasesPage,
});

/**
 * One case (ärendevyn), e.g. /cases/A002. Loaded on demand, so the Markdown renderer and
 * the case view stay out of the start bundle.
 */
export const caseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cases/$caseId',
  component: lazyRouteComponent(() => import('@/features/cases/case-page'), 'CasePage'),
});

export const lookupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lookup',
  component: LookupPage,
});

export const resultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/results',
  // Lazy: the results page carries the decision export (Markdown rendering for the report).
  component: lazyRouteComponent(() => import('@/features/results/results-page'), 'ResultsPage'),
});

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  studyRoute,
  studySessionRoute,
  casesRoute,
  caseRoute,
  lookupRoute,
  resultsRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
