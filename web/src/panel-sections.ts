export function panelSection(title: string, ...content: Node[]): HTMLFieldSetElement {
  const section = document.createElement('fieldset');
  section.className = 'panel-section';
  const legend = document.createElement('legend');
  legend.textContent = title;
  section.append(legend, ...content);
  return section;
}

export function panelDetails(title: string, ...content: Node[]): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'panel-details';
  const summary = document.createElement('summary');
  summary.textContent = title;
  details.append(summary, ...content);
  return details;
}

export function panelActions(...buttons: HTMLElement[]): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  actions.append(...buttons);
  return actions;
}
