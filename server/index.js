import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { execFile } from 'child_process';
import path from 'path';

// Importação das funções do banco de dados e autenticação
import { getDb, initializeDatabase, seedDatabase } from './db.js';
import { login, authenticateRequest } from './auth.js';

// Configurações iniciais
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

// Inicialização do Banco de Dados
initializeDatabase();
seedDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Configuração do Multer para Upload de Fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/photos'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await login(username, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// --- ROTAS DE UTILIZADORES (USERS) ---

app.get('/api/users', (req, res) => {
  try {
    const user = authenticateRequest(req);
    const db = getDb();
    
    // CORREÇÃO: .prepare().all() em vez de .all()
    const users = db.prepare(`
      SELECT id, username, email, role, photo_url, created_at 
      FROM users 
      ORDER BY created_at DESC
    `).all();
    
    res.json(users);
  } catch (error) {
    console.error('[Users] Get failed:', error);
    res.status(error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
  }
});

app.post('/api/users', upload.single('photo'), async (req, res) => {
  try {
    authenticateRequest(req); // Verifica permissões
    const { username, email, password, role } = req.body;
    const photoUrl = req.file ? `/uploads/photos/${req.file.filename}` : null;
    
    // Hash da senha
    const passwordHash = bcrypt.hashSync(password, 10);
    
    // 🛡️ SANITIZAÇÃO DO PAPEL (ROLE)
    // Converte para minúsculo, tira espaços e verifica se é um dos 3 permitidos. 
    // Caso contrário, força o padrão 'user'.
    const parsedRole = (role || '').toString().trim().toLowerCase();
    const safeRole = ['admin', 'user', 'operator'].includes(parsedRole) ? parsedRole : 'user';
    
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, photo_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, email, passwordHash, safeRole, photoUrl);

    res.status(201).json({ id: result.lastInsertRowid, username, role: safeRole });
  } catch (error) {
    console.error('[Users] Create failed:', error);
    
    // Devolve uma mensagem mais clara caso o erro seja de conflito (ex: usuário já existe)
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Este nome de usuário já está em uso.' });
    }
    
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// --- ROTAS DE CÉLULAS (CELLS) ---

app.get('/api/cells', (req, res) => {
  try {
    authenticateRequest(req);
    const db = getDb();
    const cells = db.prepare('SELECT * FROM cells').all();
    res.json(cells);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar células' });
  }
});

app.post('/api/cells', (req, res) => {
  try {
    authenticateRequest(req);
    // Recebendo TODOS os parâmetros necessários para o Python Snap7
    const { 
      name, description, plc_address, plc_port, 
      plc_rack, plc_slot, plc_database, plc_start_byte 
    } = req.body;
    
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO cells (name, description, plc_address, plc_port, plc_rack, plc_slot, plc_database, plc_start_byte, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offline')
    `).run(
      name, description, plc_address, 
      plc_port || 102, 
      plc_rack || 0, 
      plc_slot || 1, 
      plc_database, 
      plc_start_byte || 0
    );

    res.status(201).json({ id: result.lastInsertRowid, name });
  } catch (error) {
    console.error('[Cells] Create failed:', error);
    res.status(500).json({ error: 'Erro ao criar célula' });
  }
});

// --- ROTAS DE EVENTOS E PRESENÇA ---

app.get('/api/events', (req, res) => {
  try {
    authenticateRequest(req);
    const db = getDb();
    const events = db.prepare(`
      SELECT e.*, u.username, c.name as cell_name 
      FROM access_events e
      JOIN users u ON e.user_id = u.id
      JOIN cells c ON e.cell_id = c.id
      ORDER BY e.timestamp DESC LIMIT 100
    `).all();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter eventos' });
  }
});

// Endpoint para o SDK/Dispositivo Intelbras enviar eventos
app.post('/api/access-events', (req, res) => {
  try {
    const { user_id, cell_id, event_type, source } = req.body;
    const db = getDb();
    
    db.prepare(`
      INSERT INTO access_events (user_id, cell_id, event_type, source)
      VALUES (?, ?, ?, ?)
    `).run(user_id, cell_id, event_type, source || 'intelbras');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar evento de acesso' });
  }
});
// --- ROTAS DE DISPOSITIVOS INTELBRAS ---

app.get('/api/intelbras-devices', (req, res) => {
  try {
    authenticateRequest(req);
    const db = getDb();
    // Faz um JOIN para trazer também o nome da Célula vinculada
    const devices = db.prepare(`
      SELECT d.id, d.name, d.ip_address, d.port, d.status, d.last_sync_time, c.name as cell_name 
      FROM intelbras_devices d
      LEFT JOIN cells c ON d.cell_id = c.id
    `).all();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar dispositivos' });
  }
});

app.post('/api/intelbras-devices', (req, res) => {
  try {
    const user = authenticateRequest(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

    // Agora recebe também o cell_id do frontend
    const { name, ipAddress, port, username, password, cell_id } = req.body;

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO intelbras_devices (name, ip_address, port, username, password, cell_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'offline')
    `).run(name, ipAddress, port || 80, username, password, cell_id || null);

    res.status(201).json({ id: result.lastInsertRowid, name });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar dispositivo' });
  }
});

app.delete('/api/intelbras-devices/:id', (req, res) => {
  try {
    const user = authenticateRequest(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { id } = req.params;
    const db = getDb();
    
    db.prepare('DELETE FROM intelbras_devices WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Devices] Delete failed:', error);
    res.status(500).json({ error: 'Erro ao deletar dispositivo' });
  }
});

// --- INTEGRAÇÃO COM CLP (BRIDGE) ---

/**
 * Função utilitária para invocar o script Python do CLP.
 * @param {Object} cellConfig - Dados da célula provenientes da base de dados.
 * @param {String} action - Ação a executar ('read' ou 'write').
 * @param {Number|null} value - Valor a escrever (se action === 'write').
 */
function runPlcCommand(cellConfig, action, value = null) {
  return new Promise((resolve, reject) => {
    // Aponta para a localização do script na sua nova arquitetura
    const scriptPath = path.join(__dirname, 'API', 'plc_bridge.py');
    
    // Constrói os parâmetros CLI baseados nos dados guardados na BD
    const args = [
      scriptPath,
      '--ip', cellConfig.plc_address,
      '--rack', cellConfig.plc_rack.toString(),
      '--slot', cellConfig.plc_slot.toString(),
      '--db', cellConfig.plc_database.toString(),
      '--start', cellConfig.plc_start_byte.toString(),
      '--action', action
    ];

    if (value !== null && action === 'write') {
      args.push('--value', value.toString());
    }

    // Nota: Em alguns sistemas Windows, pode ser necessário alterar 'python' para 'python3' ou 'py'
    execFile('python', args, (error, stdout, stderr) => {
      if (error) {
        console.error('[PLC Bridge] Erro de execução:', stderr || error.message);
        return reject(stderr || error.message);
      }

      try {
        const result = JSON.parse(stdout);
        if (!result.success) {
          reject(result.error);
        } else {
          resolve(result); // Sucesso! Retorna { success: true, value: X }
        }
      } catch (parseError) {
        console.error('[PLC Bridge] Saída inválida do Python:', stdout);
        reject('Erro ao interpretar a resposta do script Python (Formato JSON inválido).');
      }
    });
  });
}

// Rota de Teste de Conexão com o CLP (Célula)
app.post('/api/cells/:id/test', async (req, res) => {
  try {
    authenticateRequest(req); // Verifica se o utilizador tem sessão iniciada
    const { id } = req.params;
    
    const db = getDb();
    const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(id);
    
    if (!cell) {
      return res.status(404).json({ error: 'Célula não encontrada na base de dados.' });
    }

    if (!cell.plc_database) {
      return res.status(400).json({ error: 'O Data Block (DB) do CLP não está configurado nesta Célula.' });
    }

    // Aciona a ponte Python com a ação de leitura
    const result = await runPlcCommand(cell, 'read');
    
    // Atualiza o estado da Célula para 'online' se a leitura for bem-sucedida
    db.prepare('UPDATE cells SET plc_status = ?, last_plc_check = CURRENT_TIMESTAMP WHERE id = ?')
      .run('online', id);

    res.json({ 
      success: true, 
      message: 'Conexão com CLP bem-sucedida!', 
      data: result 
    });

  } catch (error) {
    // Em caso de erro (CLP desligado, cabo de rede desconectado, IP errado, etc.)
    const db = getDb();
    db.prepare('UPDATE cells SET plc_status = ?, last_plc_check = CURRENT_TIMESTAMP WHERE id = ?')
      .run('error', req.params.id);

    res.status(500).json({ error: error.toString() });
  }
});

// Inicialização do Servidor
app.listen(port, () => {
  console.log(`
  🚀 Servidor Industrial Ativo
  📡 Endereço: http://localhost:${port}
  📂 Base de dados: SQLite Ativo
  `);
});