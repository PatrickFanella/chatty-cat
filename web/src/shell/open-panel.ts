// A managed dialog can open non-modally in its saved dock/floating placement.
// Only its explicit workbench owner handles this request; native prototypes stay intact.
export function showPanel(root: HTMLDialogElement): void {
  if (!root.dispatchEvent(new Event('panel-open-request', { cancelable: true }))) return;
  if (!root.open) root.showModal();
}
