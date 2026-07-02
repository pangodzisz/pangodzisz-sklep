/**
 * Serwer sklepu Pan Godzisz
 * - serwuje stronę (folder /public)
 * - zapisuje data.json na GitHub (dane nie znikają po restarcie)
 * - zdjęcia przechowywane na Cloudinary
 * - obsługuje zamówienia
 * - opcjonalnie wysyła e-mail
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'godzisz123';

const CLOUD_NAME  = process.env.CLOUDINARY_CLOUD_NAME  || 'dbxhhrogd';
const API_KEY     = process.env.CLOUDINARY_API_KEY     || '324791884256448';
const API_SECRET  = process.env.CLOUDINARY_API_SECRET  || 'nfQR1x1bw3Y5LDcgVa6zTUEES_U';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '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';
const GITHUB_USER  = 'pangodzisz';
const GITHUB_REPO  = 'pangodzisz-sklep';
const GITHUB_FILE  = 'data.json';

const ORDERS_FILE = path.join(__dirname, 'orders.json');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer - pamięć
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── GITHUB API ─────────────────────────────────────────────────────────────

function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'pangodzisz-sklep',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function loadDataFromGithub() {
  try {
    const res = await githubRequest('GET', `/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`);
    if (res.status === 200) {
      const content = Buffer.from(res.body.content, 'base64').toString('utf8');
      return { data: JSON.parse(content), sha: res.body.sha };
    }
  } catch(e) {
    console.error('GitHub load error:', e.message);
  }
  return { data: {}, sha: null };
}

async function saveDataToGithub(data, sha) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const body = {
    message: 'Aktualizacja danych sklepu',
    content,
    ...(sha ? { sha } : {})
  };
  const res = await githubRequest('PUT', `/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`, body);
  if (res.status === 200 || res.status === 201) {
    return res.body.content.sha;
  }
  throw new Error('GitHub save error: ' + JSON.stringify(res.body));
}

// ─── CLOUDINARY ──────────────────────────────────────────────────────────────

function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const str = `timestamp=${timestamp}${API_SECRET}`;
    const signature = crypto.createHash('sha1').update(str).digest('hex');
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="timestamp"\r\n\r\n${timestamp}\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="api_key"\r\n\r\n${API_KEY}\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="signature"\r\n\r\n${signature}\r\n`;
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
    body += `Content-Type: application/octet-stream\r\n\r\n`;

    const bodyEnd = `\r\n--${boundary}--\r\n`;
    const fullBody = Buffer.concat([Buffer.from(body), buffer, Buffer.from(bodyEnd)]);

    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUD_NAME}/image/upload`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length
      }
    };

    const req = https.request(options, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (json.secure_url) resolve(json.secure_url);
          else reject(new Error(json.error?.message || 'Cloudinary error'));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

// ─── API ─────────────────────────────────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Błędny login lub hasło' });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const { data } = await loadDataFromGithub();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: 'Błąd odczytu danych' });
  }
});

app.post('/api/data', async (req, res) => {
  try {
    const { sha } = await loadDataFromGithub();
    const newSha = await saveDataToGithub(req.body, sha);
    res.json({ ok: true, sha: newSha });
  } catch(e) {
    console.error('Save error:', e.message);
    res.status(500).json({ error: 'Błąd zapisu: ' + e.message });
  }
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Brak pliku' });
  try {
    const url = await uploadToCloudinary(req.file.buffer, req.file.originalname);
    res.json({ url });
  } catch(e) {
    console.error('Cloudinary error:', e.message);
    res.status(500).json({ error: 'Błąd uploadu: ' + e.message });
  }
});

// ─── ZAMÓWIENIA ──────────────────────────────────────────────────────────────

function loadOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch(e) {}
  return [];
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function createTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: 'smtp.poczta.onet.pl', port: 465, secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

app.get('/api/orders', (req, res) => {
  if (req.headers['x-admin-auth'] !== ADMIN_PASS) return res.status(401).json({ error: 'Brak dostępu' });
  res.json(loadOrders());
});

app.post('/api/orders', async (req, res) => {
  try {
    const orders = loadOrders();
    const order = { id: Date.now(), date: new Date().toLocaleString('pl-PL'), status: 'nowe', ...req.body };
    orders.unshift(order);
    saveOrders(orders);

    const transporter = createTransporter();
    if (transporter) {
      const itemsText = (order.items||[]).map(i => `${i.name} x${i.qty} — ${i.price} zł`).join('\n');
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: 'pangodzisz@op.pl',
          subject: `Nowe zamówienie #${order.id} — ${order.name}`,
          text: `Nowe zamówienie!\n\nKlient: ${order.name}\nTelefon: ${order.phone}\nE-mail: ${order.email}\nAdres: ${order.address||'odbiór osobisty'}\nDostawa: ${order.delivery}\nPłatność: ${order.payment}\n\nProdukty:\n${itemsText}\n\nSuma: ${order.total} zł\n\nUwagi: ${order.notes||'brak'}`
        });
      } catch(e) { console.error('Email error:', e.message); }
    }
    res.json({ ok: true, id: order.id });
  } catch(e) {
    res.status(500).json({ error: 'Błąd zapisu zamówienia' });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  if (req.headers['x-admin-auth'] !== ADMIN_PASS) return res.status(401).json({ error: 'Brak dostępu' });
  let orders = loadOrders();
  orders = orders.filter(o => String(o.id) !== String(req.params.id));
  saveOrders(orders);
  res.json({ ok: true });
});

app.patch('/api/orders/:id', (req, res) => {
  if (req.headers['x-admin-auth'] !== ADMIN_PASS) return res.status(401).json({ error: 'Brak dostępu' });
  const orders = loadOrders();
  const order = orders.find(o => String(o.id) === String(req.params.id));
  if (order) Object.assign(order, req.body);
  saveOrders(orders);
  res.json({ ok: true });
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Sklep Pan Godzisz działa na porcie ${PORT}`);
  console.log(`Otwórz: http://localhost:${PORT}`);
});
