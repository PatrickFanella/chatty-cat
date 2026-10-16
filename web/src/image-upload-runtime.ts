import { parseUploadConfig, type UploadConfig, type Context } from './image-upload-model';
import { privacyEnabled } from './privacy';
export class ImageUploadRuntime {
  config: UploadConfig | undefined;
  private stopped = false;
  readonly ready: Promise<void>;
  private controller = new AbortController();
  private input: HTMLTextAreaElement | null;
  constructor(
    private context: () => Context,
    private readonlyView: boolean,
    private mounted: () => boolean,
    private request: (files: File[]) => void,
  ) {
    this.input = document.querySelector<HTMLTextAreaElement>('#message');
    this.input?.addEventListener('paste', this.paste);
    this.input?.addEventListener('drop', this.drop);
    this.input?.addEventListener('dragover', this.dragover);
    this.ready = this.load();
  }
  get enabled(): boolean {
    const context = this.context();
    return (
      !this.stopped &&
      !!this.config?.enabled &&
      !!context.auth?.authenticated &&
      context.canInsert &&
      !privacyEnabled() &&
      !this.readonlyView
    );
  }
  private async load(): Promise<void> {
    try {
      const response = await fetch('/api/uploads/config', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]),
      });
      if (response.ok) {
        const config = parseUploadConfig(await response.json());
        if (!this.stopped) this.config = config;
      }
    } catch {
      /* Upload remains unavailable. */
    }
    if (!this.stopped) document.dispatchEvent(new Event('panelstatechange'));
  }
  private paste = (event: ClipboardEvent): void => {
    if (this.mounted() || !this.enabled || !event.clipboardData?.files.length) return;
    const files = Array.from(event.clipboardData.files);
    event.preventDefault();
    this.request(files);
  };
  private drop = (event: DragEvent): void => {
    if (this.mounted() || !this.enabled || !event.dataTransfer?.files.length) return;
    const files = Array.from(event.dataTransfer.files);
    event.preventDefault();
    this.request(files);
  };
  private dragover = (event: DragEvent): void => {
    if (!this.mounted() && this.enabled && event.dataTransfer?.types.includes('Files')) event.preventDefault();
  };
  stop(): void {
    this.stopped = true;
    this.controller.abort();
    this.input?.removeEventListener('paste', this.paste);
    this.input?.removeEventListener('drop', this.drop);
    this.input?.removeEventListener('dragover', this.dragover);
  }
}
