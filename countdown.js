(() => {
'use strict';
// Release: 19. November 2026, 00:00 Uhr deutscher Zeit (MEZ = UTC+1)
const TARGET = Date.parse('2026-11-19T00:00:00+01:00');

const root  = document.getElementById('countdown');
const count = document.getElementById('count');
const done  = document.getElementById('done');
const nums  = {};
document.querySelectorAll('.num').forEach(n => nums[n.dataset.unit] = n);
const pad = (n, len = 2) => String(n).padStart(len, '0');
let launched = false, lastMinute = -1;

function setNum(el, value, animate) {
  const str = pad(value);
  while (el.children.length < str.length) { const s = document.createElement('span'); s.className = 'd'; el.appendChild(s); }
  while (el.children.length > str.length) el.lastChild.remove();
  [...str].forEach((ch, i) => {
    const d = el.children[i];
    if (d.textContent === ch) return;
    d.textContent = ch;
    if (animate) { d.classList.remove('tick'); void d.offsetWidth; d.classList.add('tick'); }
  });
}

let first = true;
function tick() {
  let diff = Math.max(0, TARGET - Date.now());
  const secTotal = Math.floor(diff / 1000);
  const days = Math.floor(secTotal / 86400), hours = Math.floor(secTotal % 86400 / 3600),
        minutes = Math.floor(secTotal % 3600 / 60), seconds = secTotal % 60;

  setNum(nums.days, days, !first); setNum(nums.hours, hours, !first);
  setNum(nums.minutes, minutes, !first); setNum(nums.seconds, seconds, !first);
  first = false;

  const m = Math.floor(secTotal / 60);
  if (m !== lastMinute) {   // Screenreader nur einmal pro Minute informieren
    lastMinute = m;
    count.setAttribute('aria-label', `Noch ${days} Tage, ${hours} Stunden und ${minutes} Minuten`);
  }

  if (diff === 0 && !launched) {
    launched = true; root.classList.add('done'); done.hidden = false;
    dispatchEvent(new Event('vi:launch'));
  }
  if (!launched) setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && !launched) tick(); });
tick();
})();
