/**
 * Serwer sklepu Pan Godzisz
 * -------------------------------------------------
 * Co robi ten serwer:
 *  - serwuje stronę (folder /public)
 *  - przechowuje treść strony (tytuły, opisy, produkty) w pliku data.json
 *  - przechowuje przesłane zdjęcia (logo, produkty) w folderze /uploads
 *  - obsługuje logowanie zarządcy (login + hasło z .env / zmiennych poniżej)
 *  - zmiany zapisane przez zarządcę są widoczne dla WSZYSTKICH odwiedzających,
 *    bo są przechowywane na serwerze, a nie w przeglądarce klienta.
 *
 * UWAGA BEZPIECZEŃSTWA:
 *  To proste rozwiązanie do małego sklepu jednoosobowego. Token sesji jest
 *  przechowywany w pamięci serwera (resetuje się po restarcie serwera).
 *  Hasło zmień poniżej (ADMIN_USER / ADMIN_PASS) przed wystawieniem strony
 *  do internetu, najlepiej przez zmienne środowiskowe.
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "godzisz123";

const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

/* ===================== AUTORYZACJA (proste tokeny w pamięci) ===================== */
const validTokens = new Set();

function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token && validTokens.has(token)) {
    return next();
  }
  return res.status(401).json({ error: 'Brak autoryzacji. Zaloguj się ponownie.' });
}

app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    const token = crypto.randomBytes(24).toString('hex');
    validTokens.add(token);
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  validTokens.delete(token);
  res.json({ ok: true });
});

/* ===================== DANE STRONY ===================== */
function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/data', (req, res) => {
  res.json(readData());
});

app.post('/api/save', requireAuth, (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Nieprawidłowe dane.' });
  }
  writeData(incoming);
  res.json({ ok: true });
});

/* ===================== UPLOAD ZDJĘĆ ===================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const name = crypto.randomBytes(12).toString('hex') + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Tylko pliki graficzne są dozwolone.'));
    }
    cb(null, true);
  }
});

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Brak pliku.' });
  res.json({ url: '/uploads/' + req.file.filename });
});

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`Sklep Pan Godzisz działa na porcie ${PORT}`);
  console.log(`Otwórz: http://localhost:${PORT}`);
});
