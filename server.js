/**
 * Serwer sklepu Pan Godzisz
 * - serwuje stronę (folder /public)
 * - przechowuje treść strony w pliku data.json
 * - przechowuje zdjęcia w folderze /uploads
 * - obsługuje zamówienia (plik orders.json)
 * - opcjonalnie wysyła e-mail na pangodzisz@op.pl
 */
 
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
// Dane logowania admina (z zmiennych środowiskowych lub domyślne)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'godzisz123';
 
// Pliki danych
const DATA_FILE = path.join(__dirname, 'data.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
 
// Upewnij się że folder uploads istnieje
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
 
// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));
 
// Multer - upload zdjęć
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
 
// Nodemailer - konfiguracja e-mail
function createTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: 'smtp.poczta.onet.pl',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}
 
// ─── API ────────────────────────────────────────────────────────────────────
 
// Logowanie admina
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Błędny login lub hasło' });
  }
});
 
// Pobierz dane strony
app.get('/api/data', (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      res.json(data);
    } else {
      res.json({});
    }
  } catch (e) {
    res.status(500).json({ error: 'Błąd odczytu danych' });
  }
});
 
// Zapisz dane strony
app.post('/api/data', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Błąd zapisu danych' });
  }
});
 
// Upload zdjęcia
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Brak pliku' });
  res.json({ url: '/uploads/' + req.file.filename });
});
 
// ─── ZAMÓWIENIA ─────────────────────────────────────────────────────────────
 
function loadOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}
 
function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}
 
// Pobierz zamówienia (tylko admin)
app.get('/api/orders', (req, res) => {
  const auth = req.headers['x-admin-auth'];
  if (auth !== ADMIN_PASS) return res.status(401).json({ error: 'Brak dostępu' });
  res.json(loadOrders());
});
 
// Złóż zamówienie
app.post('/api/orders', async (req, res) => {
  try {
    const orders = loadOrders();
    const order = {
      id: Date.now(),
      date: new Date().toLocaleString('pl-PL'),
      status: 'nowe',
      ...req.body
    };
    orders.unshift(order);
    saveOrders(orders);
 
    // Wyślij e-mail jeśli skonfigurowany
    const transporter = createTransporter();
    if (transporter) {
      const itemsText = (order.items || [])
        .map(i => `${i.name} x${i.qty} — ${i.price} zł`)
        .join('\n');
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: 'pangodzisz@op.pl',
          subject: `Nowe zamówienie #${order.id} — ${order.name}`,
          text: `Nowe zamówienie!\n\nKlient: ${order.name}\nTelefon: ${order.phone}\nE-mail: ${order.email}\nAdres: ${order.address || 'odbiór osobisty'}\nDostawa: ${order.delivery}\nPłatność: ${order.payment}\n\nProdukty:\n${itemsText}\n\nSuma: ${order.total} zł\n\nUwagi: ${order.notes || 'brak'}`
        });
      } catch (mailErr) {
        console.error('Błąd wysyłki e-mail:', mailErr.message);
      }
    }
 
    res.json({ ok: true, id: order.id });
  } catch (e) {
    res.status(500).json({ error: 'Błąd zapisu zamówienia' });
  }
});
 
// Usuń zamówienie
app.delete('/api/orders/:id', (req, res) => {
  const auth = req.headers['x-admin-auth'];
  if (auth !== ADMIN_PASS) return res.status(401).json({ error: 'Brak dostępu' });
  let orders = loadOrders();
  orders = orders.filter(o => String(o.id) !== String(req.params.id));
  saveOrders(orders);
  res.json({ ok: true });
});
 
// Zmień status zamówienia
app.patch('/api/orders/:id', (req, res) => {
  const auth = req.headers['x-admin-auth'];
  if (auth !== ADMIN_PASS) return res.status(401).json({ error: 'Brak dostępu' });
  const orders = loadOrders();
  const order = orders.find(o => String(o.id) === String(req.params.id));
  if (order) Object.assign(order, req.body);
  saveOrders(orders);
  res.json({ ok: true });
});
 
// ─── START ───────────────────────────────────────────────────────────────────
 
app.listen(PORT, () => {
  console.log(`Sklep Pan Godzisz działa na porcie ${PORT}`);
  console.log(`Otwórz: http://localhost:${PORT}`);
});
