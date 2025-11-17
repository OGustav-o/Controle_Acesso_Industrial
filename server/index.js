import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import { getDb, initializeDatabase, seedDatabase } from './db.js';
import { login, createUser, authenticateRequest, createToken } from './auth.js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Configurar multer para upload de fotos
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads/photos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || 10485760) } });

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadDir));

// ============ ROTAS DE AUTENTICAÇÃO ============

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await login(username, password);
    res.json(result);
  } catch (error) {
    console.error('[Auth] Login failed:', error);
    res.status(401).json({ error: error.message || 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json(user);
  } catch (error) {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ============ ROTAS DE USUÁRIOS ============

app.get('/api/users', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const db = await getDb();
    const users = await db.all('SELECT id, username, email, role, photo_url, created_at FROM users');
    res.json(users);
  } catch (error) {
    console.error('[Users] Get failed:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

app.post('/api/users', upload.single('photo'), async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { username, email, password, role } = req.body;
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = await getDb();
    const passwordHash = await require('bcryptjs').hash(password, 10);

    const result = await db.run(
      'INSERT INTO users (username, email, password_hash, role, photo_url) VALUES (?, ?, ?, ?, ?)',
      [username, email || null, passwordHash, role || 'user', photoUrl]
    );

    res.json({
      id: result.lastID,
      username,
      email,
      role: role || 'user',
      photo_url: photoUrl,
    });
  } catch (error) {
    console.error('[Users] Create failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

// ============ ROTAS DE CÉLULAS ============

app.get('/api/cells', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const db = await getDb();
    const cells = await db.all('SELECT * FROM cells ORDER BY name');
    res.json(cells);
  } catch (error) {
    console.error('[Cells] Get failed:', error);
    res.status(500).json({ error: 'Failed to get cells' });
  }
});

app.post('/api/cells', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { name, description, plcAddress, plcPort, plcRack, plcSlot, plcDatabase, plcStartByte } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Cell name is required' });
    }

    const db = await getDb();
    const result = await db.run(
      'INSERT INTO cells (name, description, plc_address, plc_port, plc_rack, plc_slot, plc_database, plc_start_byte) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description || null, plcAddress || null, plcPort || 102, plcRack || 0, plcSlot || 1, plcDatabase || null, plcStartByte || null]
    );

    res.json({
      id: result.lastID,
      name,
      description,
      plcAddress,
      plcPort: plcPort || 102,
      plcRack: plcRack || 0,
      plcSlot: plcSlot || 1,
      plcDatabase,
      plcStartByte,
    });
  } catch (error) {
    console.error('[Cells] Create failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create cell' });
  }
});

// ============ ROTAS DE EVENTOS DE ACESSO ============

app.get('/api/access-events', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const db = await getDb();
    const events = await db.all(`
      SELECT ae.*, u.username, c.name as cell_name
      FROM access_events ae
      LEFT JOIN users u ON ae.user_id = u.id
      LEFT JOIN cells c ON ae.cell_id = c.id
      ORDER BY ae.timestamp DESC
      LIMIT 100
    `);
    res.json(events);
  } catch (error) {
    console.error('[Access Events] Get failed:', error);
    res.status(500).json({ error: 'Failed to get access events' });
  }
});

app.post('/api/access-events', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { userId, cellId, eventType, source, status, details } = req.body;

    if (!userId || !cellId || !eventType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const db = await getDb();
    const result = await db.run(
      'INSERT INTO access_events (user_id, cell_id, event_type, source, status, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, cellId, eventType, source || 'manual', status || 'success', details || null]
    );

    res.json({ id: result.lastID, success: true });
  } catch (error) {
    console.error('[Access Events] Create failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create access event' });
  }
});

// ============ ROTAS DE PRESENÇA ============

app.get('/api/cell-presence', async (req, res) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const db = await getDb();
    const presence = await db.all(`
      SELECT cp.*, u.username, c.name as cell_name
      FROM cell_presence cp
      LEFT JOIN users u ON cp.user_id = u.id
      LEFT JOIN cells c ON cp.cell_id = c.id
      WHERE cp.status = 'inside'
      ORDER BY cp.entry_time DESC
    `);
    res.json(presence);
  } catch (error) {
    console.error('[Cell Presence] Get failed:', error);
    res.status(500).json({ error: 'Failed to get cell presence' });
  }
});

// ============ ROTA DE INICIALIZAÇÃO ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// ============ INICIALIZAR SERVIDOR ============

async function startServer() {
  try {
    console.log('🔄 Inicializando banco de dados...');
    await initializeDatabase();
    await seedDatabase();

    app.listen(PORT, () => {
      console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
      console.log(`📊 Banco de dados: ${process.env.DATABASE_PATH || './data/app.db'}`);
      console.log('\n🔐 Credenciais padrão:');
      console.log('   Usuário: admin');
      console.log('   Senha: admin123\n');
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();
