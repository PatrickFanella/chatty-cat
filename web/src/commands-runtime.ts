import { CommandStore, parseCommandList, type CommandTemplate } from './commands';
import type { Composer } from './composer';
import { registerSettings } from './settings-bundle';
export class CommandRuntime extends EventTarget {
  readonly store = new CommandStore();
  error = '';
  private stopSettings: () => void;
  constructor(
    private composer: Composer,
    private preview: (command: CommandTemplate, invocation: string) => void,
    workspaceCommands?: unknown,
  ) {
    super();
    const restore = (value: unknown): void => {
      try {
        this.store.save(parseCommandList(value));
        this.error = '';
        this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Invalid saved commands';
        this.dispatchEvent(new Event('change'));
      }
    };
    this.stopSettings = registerSettings('commands', () => this.store.all(), restore);
    if (workspaceCommands !== undefined) restore(workspaceCommands);
    this.refresh();
  }
  refresh(): void {
    this.composer.configureCommands(
      this.store.all().map((command) => command.trigger),
      (text) => {
        const command = this.store.match(text);
        if (!command) return false;
        this.preview(command, text);
        return true;
      },
    );
    this.dispatchEvent(new Event('change'));
  }
  stop(): void {
    this.stopSettings();
  }
}
