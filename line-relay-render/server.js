const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 10000);
const CHANNEL_SECRET = String(process.env.LINE_CHANNEL_SECRET || '');
const RELAY_KEY = String(process.env.RELAY_KEY || '');
const STORE = process.env.STORE_FILE || path.join(__dirname, 'latest.json');
const IMAGE_DIR = process.env.IMAGE_DIR || path.join('/tmp', 'stpho-line-images');
try { fs.mkdirSync(IMAGE_DIR, {recursive:true}); } catch (_) {}
function relayKeyHeader(req) { return String(req.headers['x-relay-key'] || ''); }
function imageId() { return crypto.randomBytes(18).toString('hex'); }

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


  if (req.method === 'POST' && url.pathname === '/image-upload') {
    if (RELAY_KEY && relayKeyHeader(req) !== RELAY_KEY) return json(res, 403, {ok:false, error:'invalid relay key'});
    const mime = String(req.headers['content-type'] || 'image/jpeg').split(';')[0].toLowerCase();
    if (!['image/jpeg','image/png'].includes(mime)) return json(res, 400, {ok:false, error:'only JPEG/PNG supported'});
    const len = Number(req.headers['content-length'] || 0);
    if (len > 10 * 1024 * 1024) return json(res, 413, {ok:false, error:'image too large'});
    const id = imageId();
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const file = path.join(IMAGE_DIR, id + '.' + ext);
    const out = fs.createWriteStream(file, {flags:'wx'});
    let total = 0; let failed = false;
    req.on('data', chunk => { total += chunk.length; if (total > 10*1024*1024) { failed=true; req.destroy(); try{fs.unlinkSync(file);}catch(_){} } });
    req.on('error', () => { try{out.destroy();fs.unlinkSync(file);}catch(_){} });
    out.on('error', () => { if (!failed) { try{fs.unlinkSync(file);}catch(_){} } });
    out.on('finish', () => {
      if (failed) return;
      const proto = (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0].trim();
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      return json(res, 200, {ok:true, url:`${proto}://${host}/line-image/${id}.${ext}`});
    });
    req.pipe(out);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/line-image/')) {
    const name = path.basename(url.pathname);
    if (!/^[a-f0-9]{36}\.(jpg|png)$/.test(name)) return json(res, 404, {ok:false, error:'not found'});
    const file = path.join(IMAGE_DIR, name);
    if (!fs.existsSync(file)) return json(res, 404, {ok:false, error:'image expired'});
    const stat = fs.statSync(file);
    res.writeHead(200, {'content-type': name.endsWith('.png') ? 'image/png' : 'image/jpeg','content-length':stat.size,'cache-control':'public, max-age=86400','content-disposition':'inline'});
    fs.createReadStream(file).pipe(res);
    return;
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
