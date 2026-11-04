import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { RootLayout } from '@/app/root-layout';
import { NotFoundPage } from '@/app/not-found';
import { HomePage } from '@/features/home/home-page';
import { StudyPage } from '@/features/study/study-page';
import { CasesPage } from '@/features/cases/cases-page';
import { LookupPage } from '@/features/lookup/lookup-page';
import { ResultsPage } from '@/features/results/results-page';
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

export const studyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/study',
  component: StudyPage,
});

export const casesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cases',
  component: CasesPage,
});

export const lookupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lookup',
  component: LookupPage,
});

export const resultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/results',
  component: ResultsPage,
});

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  studyRoute,
  casesRoute,
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
