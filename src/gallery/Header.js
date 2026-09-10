/**
 * Wires the header's two interactive bits (from the Figma header design):
 * the Spirale/Grille view switcher and the mute toggle. Both are currently
 * visual-only — there's no "Grille" view or audio in the app yet — so this
 * just tracks pressed/active state; hook the real behavior in here once
 * either exists.
 */
export function initHeader() {
  const tabs = document.querySelectorAll('.header-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((other) => {
        const isSelected = other === tab;
        other.classList.toggle('is-active', isSelected);
        other.setAttribute('aria-selected', String(isSelected));
      });
    });
  });

  const muteButton = document.getElementById('header-mute');
  const unmutedIcon = muteButton?.querySelector('.icon-unmuted');
  const mutedIcon = muteButton?.querySelector('.icon-muted');
  muteButton?.addEventListener('click', () => {
    const nowMuted = muteButton.getAttribute('aria-pressed') !== 'true';
    muteButton.setAttribute('aria-pressed', String(nowMuted));
    muteButton.setAttribute('aria-label', nowMuted ? 'Réactiver le son' : 'Couper le son');
    // Not `.hidden = …`: that IDL property isn't reliably reflected on SVG
    // elements, so it wouldn't actually toggle the `hidden` attribute the
    // CSS rule matches on.
    unmutedIcon.toggleAttribute('hidden', nowMuted);
    mutedIcon.toggleAttribute('hidden', !nowMuted);
  });
}
