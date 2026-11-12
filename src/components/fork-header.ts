// Fork-only. Rearranges the dashboard header of the AI Chip Monitor into one
// balanced bar: brand and workspace tabs on the left, the live clock in the
// centre, controls on the right. It moves existing nodes rather than rebuilding
// them, so every upstream listener and id keeps working. Desktop widths only;
// the phone layout is left as upstream ships it.
const MIN_WIDTH = 1024;

export function arrangeForkHeader(root: HTMLElement): void {
  if (window.innerWidth < MIN_WIDTH) return;
  const header = root.querySelector<HTMLElement>('.header');
  const left = header?.querySelector<HTMLElement>('.header-left');
  const right = header?.querySelector<HTMLElement>('.header-right');
  if (!header || !left || !right || header.classList.contains('fk-hd')) return;

  const logo = left.querySelector<HTMLElement>('.logo');
  if (logo) {
    logo.textContent = '';
    const mark = document.createElement('i');
    mark.className = 'fk-hd-mark';
    mark.setAttribute('aria-hidden', 'true');
    const word = document.createElement('span');
    word.textContent = 'AI Chip Monitor';
    logo.append(mark, word);
  }

  // Workspace tabs join the bar, which removes the second row.
  const tabs = root.querySelector<HTMLElement>('.dashboard-tabs-bar');
  if (tabs) {
    const divider = document.createElement('span');
    divider.className = 'fk-hd-rule';
    left.append(divider, tabs);
  }

  // Centre: live state and the UTC clock that used to sit over the map.
  const centre = document.createElement('div');
  centre.className = 'fk-hd-centre';
  const status = left.querySelector<HTMLElement>('.status-indicator');
  const clock = root.querySelector<HTMLElement>('#headerClock');
  if (status) centre.appendChild(status);
  if (clock) centre.appendChild(clock);
  header.insertBefore(centre, right);

  // Right: the region picker leads the control group.
  const region = left.querySelector<HTMLElement>('.region-selector');
  if (region) right.prepend(region);

  // The row the tabs came from is empty now; fold it so the map moves up.
  const row = root.querySelector<HTMLElement>('.dashboard-navigation-row');
  if (row && !row.querySelector('.dashboard-tabs-bar')) row.hidden = true;

  header.classList.add('fk-hd');
}
