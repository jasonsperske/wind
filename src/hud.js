import { GUSTS, gustIndex } from './config.js';

export function createHud() {
  const veil = document.getElementById('veil');
  const hud = document.getElementById('hud');
  const petalsEl = document.getElementById('petals');
  const gustEl = document.getElementById('gust');
  let lastGust = -1;

  return {
    show() {
      veil.classList.add('gone');
      hud.classList.add('on');
      gustEl.classList.add('on');
    },
    update(petals, force) {
      petalsEl.textContent = petals;
      const gi = gustIndex(force);
      if (gi !== lastGust) {
        lastGust = gi;
        gustEl.textContent = GUSTS[gi];
      }
    },
    note(html) {
      veil.insertAdjacentHTML('beforeend', '<p class="sub">' + html + '</p>');
    },
  };
}
