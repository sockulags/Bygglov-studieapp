/**
 * features/command-palette — Kommandopaletten (Ctrl/Cmd+K), the global keyboard shortcuts
 * and the shortcuts dialog (?). Everything is mounted once by the root layout:
 * `<CommandPalette />`, `<ShortcutsHelpDialog />`, `<GlobalTutor />` and
 * `useGlobalShortcuts()`. See docs/tangentbord.md.
 */
export { CommandPalette } from './command-palette';
export { ShortcutsHelpDialog } from './shortcuts-help-dialog';
export { GlobalTutor } from './global-tutor';
export { useGlobalShortcuts, SEARCH_SHORTCUT_SELECTOR } from './use-global-shortcuts';
export {
  usePaletteStore,
  setPaletteOpen,
  setShortcutsHelpOpen,
  requestLookup,
  takeLookupRequest,
} from './palette-store';
export { fold, fuzzyMatch, scoreFields } from './fuzzy';
export {
  buildPaletteItems,
  searchPalette,
  type PaletteItem,
  type PaletteAction,
} from './palette-items';
export { modKey, shortcutSections } from './shortcuts';
