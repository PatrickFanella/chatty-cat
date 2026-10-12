# Keyboard actions

Open **Actions** or press **Alt+K** to search actions and quick-switch destinations. Select a result with Up/Down and Enter, or click it. Workspace destinations open a preview; Apply confirms the switch. Actions never send chat messages.

Open **Shortcuts** to record or edit bindings. Save applies only conflict-free bindings. Leave a binding blank to disable it. Restore default shortcuts resets only bindings. Workspace exports include these public preferences.

Bindings use physical key codes: `KeyM` means the M key; `Mod` means Command or Control. IME composition and existing dialogs suppress shortcuts. Chat/splits shortcuts leave text fields and editable content alone. Action search can open from the composer. Privacy mode suppresses every action; Alt+Shift+P remains reserved for panic hide. Browser editing/navigation shortcuts cannot be rebound.

| Action | Context | Default binding |
| --- | --- | --- |
| Search actions and quick switch | global | `Alt+KeyK` |
| Focus composer | chat | `Alt+KeyM` |
| Next send channel | chat | `Alt+BracketRight` |
| Previous send channel | chat | `Alt+BracketLeft` |
| Next pane | splits | `Alt+ArrowRight` |
| Previous pane | splits | `Alt+ArrowLeft` |
| Next chat tab | splits | `Alt+ArrowDown` |
| Previous chat tab | splits | `Alt+ArrowUp` |
| Move pane right | splits | `Alt+Shift+ArrowRight` |
| Move pane left | splits | `Alt+Shift+ArrowLeft` |
| Move tab right | splits | `Alt+Shift+ArrowDown` |
| Move tab left | splits | `Alt+Shift+ArrowUp` |
| Manage workspaces | chat | `Alt+KeyW` |
| Reconnect public chat | chat | `Alt+KeyR` |
| Increase chat text size | chat | `Alt+Equal` |
| Decrease chat text size | chat | `Alt+Minus` |
| Hold active reader | chat | `Alt+KeyS` |
| Jump active reader to live | chat | `Alt+KeyL` |
| Search saved history | chat | `Alt+KeyH` |
| Toggle emote picker | chat | `Alt+KeyE` |
| Toggle video | chat | `Alt+KeyV` |
| Open statistics | chat | `Alt+KeyT` |
| Open display settings | chat | `Alt+KeyD` |
| Open conversation inbox | chat | `Alt+KeyI` |
| Open custom commands | chat | `Alt+KeyC` |
| Edit keyboard shortcuts | chat | `Alt+KeyB` |

The splits context requires independent panes. Quick-switch destinations include joined send channels, saved workspaces and current tabs/panes. A pane popout stays within its saved channel group; workspace edits belong in the main view.
