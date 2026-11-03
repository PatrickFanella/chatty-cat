import type { DisplayRuntime } from '../display';
import type { PresentationRuntime } from '../presentation-runtime';

/** What settings sources need from the app shell. */
export interface SettingsHost {
  display: DisplayRuntime;
  presentation: PresentationRuntime;
  /** main's scheduleRender, after presentation-affecting changes. */
  rerender(): void;
  /** main's provider callback (activity, cosmetics, events, metadata, render). */
  providersChanged(): void;
  /** main's reloadProviderMetadata. */
  reloadProviders(): boolean;
  /** Events and cosmetics notices joined with " · ". */
  providerStatus(): string;
  attention: { permission(): Promise<unknown>; test(): Promise<string> };
  /** lazyPanels.open */
  openPanel(id: string): void;
  overlay: boolean;
  /** Pane popout, ephemeral popout or overlay. */
  readonlyView: boolean;
  /** privacyEnabled */
  privacy(): boolean;
}
