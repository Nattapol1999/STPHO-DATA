const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 10000);
const CHANNEL_SECRET = String(process.env.LINE_CHANNEL_SECRET || '');
const RELAY_KEY = String(process.env.RELAY_KEY || '');
const STORE = process.env.STORE_FILE || path.join(__dirname, 'latest.json');

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body)});
  res.end(body);
}
function readLatest() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (_) { return {}; }
}
function writeLatest(data) {
  try { fs.writeFileSync(STORE, JSON.stringify(data, null, 2)); } catch (_) {}
}
function validKey(url) {
  if (!RELAY_KEY) return true;
  return (url.searchParams.get('key') || '') === RELAY_KEY;
}
function verifySignature(raw, signature) {
  if (!CHANNEL_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', CHANNEL_SECRET).update(raw).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (_) { return false; }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    return json(res, 200, {ok:true, service:'stpho-line-relay', now:new Date().toISOString(), hasSecret:!!CHANNEL_SECRET});
  }

  if (req.method === 'GET' && url.pathname === '/latest') {
    if (!validKey(url)) return json(res, 403, {ok:false, error:'invalid relay key'});
    const latest = readLatest();
    return json(res, 200, {ok:true, ...latest});
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const signature = String(req.headers['x-line-signature'] || '');
      if (!verifySignature(raw, signature)) return json(res, 400, {ok:false, error:'invalid signature'});
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); }
      catch (_) { return json(res, 400, {ok:false, error:'invalid json'}); }

      let latest = readLatest();
      for (const event of (payload.events || [])) {
        const source = event.source || {};
        let destinationId = '';
        if (source.type === 'group') destinationId = source.groupId || '';
        else if (source.type === 'room') destinationId = source.roomId || '';
        if (destinationId) {
          latest = {
            destinationId,
            groupId: source.type === 'group' ? destinationId : undefined,
            roomId: source.type === 'room' ? destinationId : undefined,
            sourceType: source.type || '',
            eventType: event.type || '',
            receivedAt: new Date().toISOString()
          };
          writeLatest(latest);
        }
      }
      return json(res, 200, {ok:true, events:(payload.events || []).length});
    });
    return;
  }

  return json(res, 404, {ok:false, error:'not found'});
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`STPHO LINE relay listening on ${PORT}\n`);
});
