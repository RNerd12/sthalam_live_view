require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');
const path = require('path');

const PORT = parseInt(process.env.PORT) || 3000;
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS) || 5000;

if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
  console.error('ERROR: Set NOTION_TOKEN and NOTION_DATABASE_ID in .env');
  process.exit(1);
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const PUBLISHED_SITE = 'https://exultant-harmony-6dd.notion.site';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

let latestData = [];
const sseClients = new Set();

const NOTION_COLORS = {
  default: '#e2e8f0',
  gray:    '#94a3b8',
  brown:   '#a16207',
  orange:  '#ea580c',
  yellow:  '#ca8a04',
  green:   '#16a34a',
  blue:    '#2563eb',
  purple:  '#9333ea',
  pink:    '#db2777',
  red:     '#dc2626',
};

const TERRAIN_COLORS = {
  plains:     '#a8d85a',
  forest:     '#2e8b57',
  jungle:     '#005c2e',
  city:       '#7b3fb5',
  coast:      '#00b4cc',
  scrublands: '#c4652d',
  swamp:      '#6b7c3a',
  desert:     '#f2c94c',
  hills:      '#c8956a',
  mountains:  '#8a9aaa',
  lake:       '#1a3a8f',
};

function getPropText(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':        return prop.title?.map(t => t.plain_text).join('') ?? '';
    case 'rich_text':    return prop.rich_text?.map(t => t.plain_text).join('') ?? '';
    case 'number':       return prop.number?.toString() ?? '';
    case 'select':       return prop.select?.name ?? '';
    case 'multi_select': return prop.multi_select?.map(s => s.name).join(', ') ?? '';
    case 'checkbox':     return prop.checkbox ? 'Yes' : 'No';
    case 'date':         return prop.date?.start ?? '';
    case 'url':          return prop.url ?? '';
    case 'files':        return prop.files?.map(f => f.name ?? '').filter(Boolean).join(', ') ?? '';
    case 'people':       return prop.people?.map(p => p.name ?? '').filter(Boolean).join(', ') ?? '';
    default:             return '';
  }
}

function extractHex(page) {
  const props = page.properties;

  const q = props.x_coordinate?.number ?? 0;
  const r = props.y_coordinate?.number ?? 0;

  const terrain        = getPropText(props['terrain']);
  const color = TERRAIN_COLORS[terrain.toLowerCase()];

  const faction      = getPropText(props['faction']);
  const factionColor = getPropText(props['faction_colour']);

  const tileId         = getPropText(props['tile_id']);
  const name           = getPropText(props['name']);
  const description    = getPropText(props['description']);
  const logNumber      = getPropText(props['log_number']);
  const carto1         = getPropText(props['cartogropher_name_1']);
  const carto2         = getPropText(props['cartogropher_name_2']);
  const carto3         = getPropText(props['cartogropher_name_3']);
  const tileFront      = getPropText(props['tile_front']);
  const tileBack       = getPropText(props['tile_back']);
  const recipe         = getPropText(props['recipe']);
  const hexFlowerState = getPropText(props['hex_flower_state']);

  return {
    id: page.id,
    q, r,
    label: tileId,
    color,
    terrain,
    faction,
    factionColor,
    tileId,
    name,
    description,
    logNumber,
    coords: `(${q}, ${r})`,
    cartographers: [carto1, carto2, carto3].filter(Boolean),
    tileFront,
    tileBack,
    recipe,
    hexFlowerState,
    notionUrl: page.url.replace('https://www.notion.so', PUBLISHED_SITE),
  };
}

async function fetchNotionData() {
  try {
    const results = [];
    let cursor;
    do {
      const res = await notion.databases.query({
        database_id: DATABASE_ID,
        start_cursor: cursor,
        page_size: 100,
      });
      results.push(...res.results);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return results.map(extractHex);
  } catch (err) {
    console.error('Notion fetch failed:', err.message);
    return null;
  }
}

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(payload));
}

async function poll() {
  const data = await fetchNotionData();
  if (!data) return;
  if (JSON.stringify(data) !== JSON.stringify(latestData)) {
    latestData = data;
    broadcast(latestData);
    console.log(`[${new Date().toLocaleTimeString()}] Updated: ${latestData.length} hexes`);
  }
}

app.get('/api/hexes', (_req, res) => res.json(latestData));

app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type':    'text/event-stream',
    'Cache-Control':   'no-cache',
    'Connection':      'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify(latestData)}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

(async () => {
  console.log('Fetching initial data from Notion…');
  const data = await fetchNotionData();
  if (data) latestData = data;
  console.log(`Loaded ${latestData.length} hexes`);

  setInterval(poll, POLL_MS);

  app.listen(PORT, () => {
    console.log(`Hex map → http://localhost:${PORT}`);
    console.log(`Polling every ${POLL_MS / 1000}s`);
  });
})();
