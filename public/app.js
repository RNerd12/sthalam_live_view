'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEX_SIZE    = 48;
const HEX_SPACING = 1.1;
const SQRT3 = Math.sqrt(3);

// ── Hex math (axial coordinates, flat-top orientation) ────────────────────

function axialToPixel(q, r) {
  return {
    x: HEX_SIZE * HEX_SPACING * (3 / 2 * q),
    y: HEX_SIZE * HEX_SPACING * (SQRT3 / 2 * q + SQRT3 * r),
  };
}

function hexPoints(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i);
    pts.push(`${(cx + HEX_SIZE * Math.cos(a)).toFixed(2)},${(cy + HEX_SIZE * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// Pick legible text color for a given hex background
function textColorFor(bgHex) {
  try {
    const r = parseInt(bgHex.slice(1, 3), 16) / 255;
    const g = parseInt(bgHex.slice(3, 5), 16) / 255;
    const b = parseInt(bgHex.slice(5, 7), 16) / 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5 ? '#1e293b' : '#f1f5f9';
  } catch {
    return '#f1f5f9';
  }
}

// ── DOM refs ──────────────────────────────────────────────────────────────

const mapSvg    = document.getElementById('map');
const tooltip   = document.getElementById('tooltip');
const statusDot = document.getElementById('status-dot');
const statusTxt = document.getElementById('status-text');

// Root group that receives the pan/zoom transform
const rootG = document.createElementNS(SVG_NS, 'g');
rootG.id = 'root';
mapSvg.appendChild(rootG);

// ── Pan & Zoom ────────────────────────────────────────────────────────────

const view = { x: 0, y: 0, scale: 1 };
let dragging = false;
let dragOrigin = { x: 0, y: 0 };
let initialBounds = null;

function applyTransform() {
  rootG.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.scale})`);
}

function centerOnBounds(minX, maxX, minY, maxY) {
  const rect = mapSvg.getBoundingClientRect();
  const pad = HEX_SIZE * 2;
  const scaleX = rect.width  / (maxX - minX + pad * 2);
  const scaleY = rect.height / (maxY - minY + pad * 2);
  view.scale = Math.min(scaleX, scaleY, 2);
  view.x = rect.width  / 2 - view.scale * (minX + maxX) / 2;
  view.y = rect.height / 2 - view.scale * (minY + maxY) / 2;
  applyTransform();
}

// Mouse drag
mapSvg.addEventListener('mousedown', e => {
  dragging = true;
  dragOrigin = { x: e.clientX - view.x, y: e.clientY - view.y };
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  view.x = e.clientX - dragOrigin.x;
  view.y = e.clientY - dragOrigin.y;
  applyTransform();
});
window.addEventListener('mouseup', () => { dragging = false; });

// Scroll / pinch zoom
mapSvg.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = mapSvg.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  view.scale = Math.max(0.1, Math.min(view.scale * factor, 12));
  view.x = mx - factor * (mx - view.x);
  view.y = my - factor * (my - view.y);
  applyTransform();
}, { passive: false });

// Touch pan
let lastTouch = null;
mapSvg.addEventListener('touchstart', e => {
  if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
mapSvg.addEventListener('touchmove', e => {
  if (e.touches.length !== 1 || !lastTouch) return;
  view.x += e.touches[0].clientX - lastTouch.x;
  view.y += e.touches[0].clientY - lastTouch.y;
  lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  applyTransform();
}, { passive: true });
mapSvg.addEventListener('touchend', () => { lastTouch = null; }, { passive: true });

// Control buttons
function zoomAround(factor) {
  const rect = mapSvg.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  view.scale = Math.max(0.1, Math.min(view.scale * factor, 12));
  view.x = cx - factor * (cx - view.x);
  view.y = cy - factor * (cy - view.y);
  applyTransform();
}
document.getElementById('btn-zoom-in').addEventListener('click',  () => zoomAround(1.2));
document.getElementById('btn-zoom-out').addEventListener('click', () => zoomAround(1 / 1.2));
document.getElementById('btn-reset').addEventListener('click', () => {
  if (initialBounds) centerOnBounds(...initialBounds);
});

// ── Hex rendering ─────────────────────────────────────────────────────────

function buildHexLabel(x, y, hex, tc) {
  const lines = [hex.name || hex.terrain, `${hex.q},${hex.r}`].filter(Boolean);
  const fontSize   = HEX_SIZE * 0.22;
  const lineHeight = HEX_SIZE * 0.27;
  const startY     = y - lineHeight * (lines.length - 1) / 2;
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', tc);
  text.setAttribute('font-size', `${fontSize}px`);
  text.setAttribute('font-family', 'system-ui, sans-serif');
  text.setAttribute('pointer-events', 'none');
  text.setAttribute('user-select', 'none');
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(SVG_NS, 'tspan');
    tspan.setAttribute('x', x);
    tspan.setAttribute('y', startY + i * lineHeight);
    const isCoord = i === lines.length - 1;
    tspan.setAttribute('font-weight', i === 0 ? '700' : '400');
    if (isCoord) tspan.setAttribute('font-size', `${HEX_SIZE * 0.18}px`);
    tspan.setAttribute('opacity', isCoord ? '0.65' : '1');
    tspan.textContent = line;
    text.appendChild(tspan);
  });
  return text;
}


const hexEls = new Map(); // Notion page id → <g> element

function renderHexes(data) {
  if (data.length === 0) {
    rootG.innerHTML = '';
    hexEls.clear();
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '0');
    text.setAttribute('class', 'empty-label');
    text.textContent = 'No hexes found in the Notion database.';
    rootG.appendChild(text);
    const rect = mapSvg.getBoundingClientRect();
    Object.assign(view, { x: rect.width / 2, y: rect.height / 2, scale: 1 });
    applyTransform();
    return;
  }

  // Compute pixel bounds for auto-centering
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  data.forEach(h => {
    const { x, y } = axialToPixel(h.q, h.r);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  });

  // Auto-center only on first load
  if (!initialBounds) {
    initialBounds = [minX, maxX, minY, maxY];
    centerOnBounds(minX, maxX, minY, maxY);
  }

  const seen = new Set();

  data.forEach(hex => {
    seen.add(hex.id);
    const { x, y } = axialToPixel(hex.q, hex.r);
    const tc = textColorFor(hex.color);

    if (hexEls.has(hex.id)) {
      const g = hexEls.get(hex.id);
      const poly = g.querySelector('polygon.terrain-fill');
      poly.setAttribute('fill', hex.color);
      poly.setAttribute('stroke', hex.factionColor ?? '#0f172a');
      poly.setAttribute('stroke-width', hex.factionColor ? '3' : '2');
      const oldLbl = g.querySelector('text');
      if (oldLbl) oldLbl.remove();
      const newLbl = buildHexLabel(x, y, hex, tc);
      if (newLbl) g.appendChild(newLbl);
    } else {
      const g = document.createElementNS(SVG_NS, 'g');
      g.classList.add('hex-cell');
      if (hex.notionUrl) g.style.cursor = 'pointer';

      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', hexPoints(x, y));
      poly.setAttribute('fill', hex.color);
      poly.setAttribute('stroke', hex.factionColor ?? '#0f172a');
      poly.setAttribute('stroke-width', hex.factionColor ? '3' : '2');
      poly.classList.add('terrain-fill');
      g.appendChild(poly);

      const lbl = buildHexLabel(x, y, hex, tc);
      if (lbl) g.appendChild(lbl);

      g.addEventListener('mouseenter', e => showTooltip(e, hex));
      g.addEventListener('mouseleave', hideTooltip);
      if (hex.notionUrl) {
        g.addEventListener('click', () => window.open(hex.notionUrl, '_blank'));
      }

      rootG.appendChild(g);
      hexEls.set(hex.id, g);
    }
  });

  // Remove hexes deleted from Notion
  hexEls.forEach((g, id) => {
    if (!seen.has(id)) {
      g.remove();
      hexEls.delete(id);
    }
  });
}

// ── Tooltip ───────────────────────────────────────────────────────────────

function showTooltip(e, hex) {
  let html = `<div class="tooltip-title">${escHtml(hex.name || 'hex #' + hex.tileId || '(untitled)')}</div>`;
  if (hex.logNumber)  html += row('Log #',   escHtml(hex.logNumber));
  (hex.cartographers ?? []).forEach((c, i) => {
    html += row(`Cartographer ${i + 1}`, escHtml(c));
  });
  if (hex.faction)    html += row('Faction', escHtml(hex.faction));
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  placeTooltip(e.clientX, e.clientY);
}

function hideTooltip() { tooltip.hidden = true; }

document.addEventListener('mousemove', e => {
  if (!tooltip.hidden) placeTooltip(e.clientX, e.clientY);
});

function placeTooltip(mx, my) {
  const pad = 14;
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  const left = mx + pad + tw > window.innerWidth  ? mx - tw - pad : mx + pad;
  const top  = my + pad + th > window.innerHeight ? my - th - pad : my + pad;
  tooltip.style.left = `${left}px`;
  tooltip.style.top  = `${top}px`;
}

function row(key, val) {
  return `<div class="tooltip-row"><span class="key">${key}</span><span>${val}</span></div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── SSE connection ────────────────────────────────────────────────────────

function connect() {
  const es = new EventSource('/events');

  es.onopen = () => {
    statusDot.className = 'dot connected';
    statusTxt.textContent = 'Live';
  };

  es.onmessage = e => {
    const data = JSON.parse(e.data);
    renderHexes(data);
    statusTxt.textContent = `Synced ${new Date().toLocaleTimeString()}`;
  };

  es.onerror = () => {
    statusDot.className = 'dot disconnected';
    statusTxt.textContent = 'Reconnecting…';
    es.close();
    setTimeout(connect, 3000);
  };
}

connect();
