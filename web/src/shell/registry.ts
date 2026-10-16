// Explicit command metadata shared by the top bar and palette.
export type CommandGroup = 'chat' | 'view' | 'account' | 'moderation' | 'providers' | 'tools' | 'help';
export const GROUP_ORDER: readonly CommandGroup[] = [
  'chat',
  'view',
  'account',
  'moderation',
  'providers',
  'tools',
  'help',
];
export const GROUP_LABELS: Record<CommandGroup, string> = {
  chat: 'Chat',
  view: 'View',
  account: 'Account',
  moderation: 'Moderation',
  providers: 'Providers',
  tools: 'Integrations',
  help: 'Help',
};
export interface Command {
  id: string;
  label: string;
  group: CommandGroup;
  keywords?: string | undefined;
  hint?: string | undefined;
  run: () => void;
  available?: () => boolean;
  /** The trigger element when the command proxies a header button; used for state such as aria-pressed and disabled. */
  trigger?: HTMLButtonElement;
  /** Panel root the command opens, when known statically. */
  panel?: string | undefined;
}
export class CommandRegistry extends EventTarget {
  private commands = new Map<string, Command>();
  register(command: Command): () => void {
    this.commands.set(command.id, command);
    this.changed();
    return () => {
      if (this.commands.get(command.id) === command) {
        this.commands.delete(command.id);
        this.changed();
      }
    };
  }
  get(id: string): Command | undefined {
    return this.commands.get(id);
  }
  all(): Command[] {
    return [...this.commands.values()];
  }
  byGroup(): Map<CommandGroup, Command[]> {
    const map = new Map<CommandGroup, Command[]>();
    for (const group of GROUP_ORDER) map.set(group, []);
    for (const command of this.commands.values()) map.get(command.group)!.push(command);
    return map;
  }
  private changed(): void {
    this.dispatchEvent(new Event('change'));
  }
  stop(): void {
    this.commands.clear();
  }
}
