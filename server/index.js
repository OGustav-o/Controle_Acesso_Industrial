import express from 'express';
import path from 'path';    
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { execFile } from 'child_process';
import fs from 'fs';

// Importação das funções do banco de dados e autenticação
import { getDb, initializeDatabase, seedDatabase } from './db.js';
import { login, authenticateRequest } from './auth.js';

// Configurações iniciais
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
const upload = multer();
const uploadFace = multer({ dest: 'uploads/' });

// Inicialização do Banco de Dados
initializeDatabase();
seedDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// RADAR DE TRÁFEGO - Imprime qualquer tentativa de comunicação com o servidor
app.use((req, res, next) => {
  console.log(`[TRÁFEGO REDE] IP: ${req.ip} tentou aceder -> ${req.method} ${req.url}`);
  next();
});

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

// Rota configurada para receber os eventos da Intelbras
app.post('/notification', 
  // 1. O INTERCETOR: Engana o Multer mudando o nome do Content-Type
  (req, res, next) => {
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/mixed')) {
      req.headers['content-type'] = req.headers['content-type'].replace('multipart/mixed', 'multipart/form-data');
    }
    next();
  }, 
  // 2. O MULTER: Agora ele vai aceitar e processar o pacote
  upload.any(), 
  
  // 3. A SUA LÓGICA PRINCIPAL
  async (req, res) => {
    try {
      // Verifica se o campo info existe (onde a Intelbras manda o JSON)
      if (!req.body || !req.body.info) {
        return res.status(200).send(); // Responde 200 para não travar o dispositivo
      }

      const payload = JSON.parse(req.body.info);
      const deviceIp = req.ip.replace('::ffff:', '');

      if (!payload.Events || payload.Events.length === 0) return res.status(200).send();
      
      const event = payload.Events[0];
      if (event.Code !== 'AccessControl') return res.status(200).send();

      const data = event.Data;
      const userId = data.UserID || data.CardNo;
      const isAuthorized = data.Status === 1; // 1 = Liberado

      if (userId && isAuthorized) {
        console.log(`\n[INTELBRAS] 👤 Usuário ID: ${userId} reconhecido pelo IP: ${deviceIp}`);
        
        const db = getDb();
        const device = db.prepare('SELECT * FROM intelbras_devices WHERE ip_address = ?').get(deviceIp);

        if (device) {
          // 4. Salva o evento no banco de dados
          db.prepare(`
            INSERT INTO access_events (user_id, cell_id, event_type, source, status)
            VALUES (?, ?, 'entry', 'intelbras', 'success')
          `).run(userId, device.cell_id);

          // 5. Envia o comando para abrir o CLP
          const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(device.cell_id);
          if (cell && cell.plc_database) {
            console.log(`[Automação] ⚙️ Enviando comando de abertura para CLP: ${cell.name}...`);
            await runPlcCommand(cell, 'write', 1);

            setTimeout(() => {
              runPlcCommand(cell, 'write', 0).catch(() => {});
            }, 2000);
          }
        }
      }

      // 6. Confirmação obrigatória para a Intelbras
      res.status(200).send();

    } catch (error) {
      console.error('[Erro] Falha ao processar evento:', error);
      res.status(200).send(); // Mantemos 200 para a Intelbras não achar que o servidor caiu
    }
});
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

app.post('/api/users/register', uploadFace.single('photo'), async (req, res) => {
  try {
    const name = req.body.name || req.body.username;

    if (!name || name === 'undefined') {
      // Limpa a foto caso o cadastro aborte
      if (req.file) fs.unlink(req.file.path, () => {}); 
      return res.status(400).json({ error: 'Nome do utilizador em falta no formulário.' });
    }

    // Transforma a string recebida de volta num Array de IDs
    const targetDevices = JSON.parse(req.body.devices); 
    const photoFile = req.file;

    const db = getDb();
    const imagePath = path.resolve(photoFile.path);

    // 1. Cria o utilizador no BD (Já não tem cell_id fixo aqui)
    const defaultPassword = bcrypt.hashSync('123456', 10);
    const stmt = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    const info = stmt.run(name, defaultPassword);
    const newUserId = info.lastInsertRowid;

    console.log(`[Cadastro] Sincronizando usuário ${name} com ${targetDevices.length} dispositivos...`);

    // 2. Prepara as "Tarefas" para sincronizar com cada leitor facial
    const syncTasks = targetDevices.map(deviceId => {
      return new Promise((resolve, reject) => {
        const device = db.prepare('SELECT * FROM intelbras_devices WHERE id = ?').get(deviceId);
        if (!device) return reject(`Dispositivo ${deviceId} não encontrado.`);

        // 2.1 Regista a permissão no Banco de Dados (Tabela de Junção)
        db.prepare('INSERT OR IGNORE INTO user_access (user_id, cell_id) VALUES (?, ?)').run(newUserId, device.cell_id);

        const scriptPath = path.join(__dirname, 'API', 'register_face.py');
        const args = [
          scriptPath,
          '--ip', device.ip_address,
          '--user', device.username,
          '--password', device.password,
          '--userid', newUserId.toString(),
          '--name', name,
          '--image', imagePath
        ];

        // 2.2 Dispara o Python para este dispositivo específico
        execFile('python', args, (error, stdout, stderr) => {
          if (error) {
            // Extrai o erro real devolvido pelo script Python
            let erroReal = stderr || error.message;
            if (stdout) {
               try {
                  const pythonLog = JSON.parse(stdout);
                  if (pythonLog.error) erroReal = pythonLog.error;
               } catch(e) {
                  erroReal = stdout.trim();
               }
            }
            return reject(`[Python/Intelbras] ${erroReal}`);
          }
          resolve(`Sucesso no dispositivo ${device.name}`);
        });
      });
    });

    // 3. Executa todas as sincronizações ao mesmo tempo
    const results = await Promise.allSettled(syncTasks);

    // 4. Limpa a foto temporária do servidor
    fs.unlink(imagePath, () => {});

    // 5. Analisa os resultados
    const falhas = results.filter(r => r.status === 'rejected');
    
    if (falhas.length === 0) {
      res.json({ success: true, message: 'Usuário cadastrado em todas as máquinas com sucesso!' });
    } else {
      // ESTA LINHA VAI MOSTRAR O ERRO REAL NO TERMINAL:
      console.error('\n[🚨 FALHAS NA SINCRONIZAÇÃO]:', falhas.map(f => f.reason));
      
      res.json({ 
        success: true, 
        message: `Cadastrado, mas falhou em ${falhas.length} dispositivos. Verifique a conexão das máquinas.` 
      });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao processar cadastro múltiplo.' });
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

app.delete('/api/users/:id', (req, res) => {
  try {
    const db = getDb();
    // Removemos os rastos do utilizador noutras tabelas para evitar erros de Foreign Key
    db.prepare('DELETE FROM user_access WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM access_events WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM cell_presence WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Usuário deletado do painel com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar usuário.' });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const db = getDb();
    const { username, role } = req.body; // Atualizamos apenas dados textuais
    db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?')
      .run(username, role || 'operator', req.params.id);
    res.json({ success: true, message: 'Usuário atualizado!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar usuário.' });
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

app.delete('/api/cells/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM user_access WHERE cell_id = ?').run(req.params.id);
    db.prepare('DELETE FROM cells WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Célula deletada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro: Remova os dispositivos desta célula primeiro.' });
  }
});

app.put('/api/cells/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, description, plc_address, plc_port, plc_rack, plc_slot, plc_database, plc_start_byte } = req.body;
    db.prepare(`UPDATE cells SET name=?, description=?, plc_address=?, plc_port=?, plc_rack=?, plc_slot=?, plc_database=?, plc_start_byte=? WHERE id=?`)
      .run(name, description, plc_address, plc_port, plc_rack, plc_slot, plc_database, plc_start_byte, req.params.id);
    res.json({ success: true, message: 'Célula atualizada!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar célula.' });
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

// Endpoint acionado pelo Leitor Facial Intelbras quando reconhece um rosto

// --- ROTA PARA RECEBER EVENTOS DIRETOS DA INTELBRAS (MODO PUSH) ---
// --- SERVIDOR DE EVENTOS PADRÃO INTELBRAS (MODO PUSH / AUTO CGI) ---
app.post('/api/access-events', async (req, res) => {
  const deviceIp = req.ip.replace('::ffff:', '');
  const payload = req.body;

  // 1. Tratamento de Heartbeat (Manter Conexão Viva)
  // O equipamento envia "Code": "Heartbeat" periodicamente.
  if (payload.Code === 'Heartbeat') {
    return res.status(200).json({ status: "ok" });
  }

  // 2. Verificação do Código de Evento
  // A Intelbras identifica acesso facial como "AccessControl"
  if (payload.Code !== 'AccessControl') {
    console.log(`[Rede] Notificação ignorada (Código: ${payload.Code}) de ${deviceIp}`);
    return res.status(200).send(); 
  }

  try {
    const db = getDb();
    
    // 3. Extração de Dados do Padrão Intelbras
    // No padrão oficial, os detalhes ficam dentro do objeto "Data"
    const eventData = payload.Data || {};
    const userId = eventData.UserID || eventData.CardNo;
    const eventType = eventData.Method === 1 ? 'entry' : 'exit'; // Exemplo: 1 para entrada

    // 4. Localização do Dispositivo no Banco
    const device = db.prepare('SELECT * FROM intelbras_devices WHERE ip_address = ?').get(deviceIp);

    if (!device) {
      console.warn(`[Acesso] Dispositivo não reconhecido. IP: ${deviceIp}`);
      return res.status(404).send();
    }

    if (userId) {
      console.log(`\n[INTELBRAS] 👤 Identificado: UserID ${userId} em ${device.name}`);
      
      // 5. Registo de Log
      db.prepare(`
        INSERT INTO access_events (user_id, cell_id, event_type, source, status)
        VALUES (?, ?, ?, 'intelbras', 'success')
      `).run(userId, device.cell_id, eventType);

      // 6. Comando para o CLP Siemens
      const cell = db.prepare('SELECT * FROM cells WHERE id = ?').get(device.cell_id);
      if (cell && cell.plc_database) {
        console.log(`[Automação] ⚙️ Enviando comando de abertura para CLP: ${cell.name}`);
        await runPlcCommand(cell, 'write', 1);

        setTimeout(() => {
          runPlcCommand(cell, 'write', 0).catch(() => {});
        }, 2000);
      }
    }

    // Resposta padrão 200 OK exigida pelo hardware para confirmar receção
    res.status(200).send();

  } catch (error) {
    console.error('[Intelbras Event Error]:', error);
    res.status(500).send();
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
    getDb().prepare('DELETE FROM intelbras_devices WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Dispositivo deletado com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar dispositivo.' });
  }
});

app.put('/api/intelbras-devices/:id', (req, res) => {
  try {
    const db = getDb();
    // Mapeia os dados recebidos do frontend para as colunas do SQLite
    const { name, ipAddress, port, username, password, cell_id } = req.body;
    db.prepare(`UPDATE intelbras_devices SET name=?, ip_address=?, port=?, username=?, password=?, cell_id=? WHERE id=?`)
      .run(name, ipAddress, port, username, password, cell_id, req.params.id);
    res.json({ success: true, message: 'Dispositivo atualizado!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar dispositivo.' });
  }
});

// DELETE: Remover itens
app.delete('/api/users/:id', (req, res) => {
    getDb().prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Usuário removido' });
});

app.delete('/api/cells/:id', (req, res) => {
    getDb().prepare('DELETE FROM cells WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Célula removida' });
});

app.delete('/api/intelbras-devices/:id', (req, res) => {
    getDb().prepare('DELETE FROM intelbras_devices WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Dispositivo removido' });
});

// PUT: Atualizar itens (Exemplo para Células)
app.put('/api/cells/:id', (req, res) => {
    const { name, description, plc_address, plc_port, plc_rack, plc_slot, plc_database, plc_start_byte } = req.body;
    getDb().prepare(`UPDATE cells SET name=?, description=?, plc_address=?, plc_port=?, plc_rack=?, plc_slot=?, plc_database=?, plc_start_byte=? WHERE id=?`)
      .run(name, description, plc_address, plc_port, plc_rack, plc_slot, plc_database, plc_start_byte, req.params.id);
    res.json({ success: true, message: 'Célula atualizada!' });
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

/**
 * Função utilitária para invocar o script Python da Intelbras.
 * @param {Object} deviceConfig - Dados do dispositivo (IP, user, pass)
 * @param {String} action - Ação a executar ('test' ou 'open')
 */
function runIntelbrasCommand(deviceConfig, action) {
  return new Promise((resolve, reject) => {
    // Certifique-se que o nome do ficheiro aqui está igual ao que salvou
    const scriptPath = path.join(__dirname, 'API', 'intelbras_bridge.py');
    
    const args = [
      scriptPath,
      '--ip', deviceConfig.ip_address,
      '--user', deviceConfig.username,
      '--password', deviceConfig.password,
      '--action', action
    ];

    execFile('python', args, (error, stdout, stderr) => {
      if (stdout) {
        try {
          const result = JSON.parse(stdout);
          if (!result.success) {
            console.error(`[Intelbras Bridge] Erro (${deviceConfig.name}):`, result.error);
            return reject(result.error);
          }
          return resolve(result);
        } catch (e) {
          // Ignora erros de parse
        }
      }

      if (error) {
        const trueError = stderr || stdout || error.message;
        console.error('[Intelbras Bridge] Falha crítica:', trueError);
        return reject(trueError);
      }
    });
  });
}

// --- Rota para testar a comunicação com a Intelbras ---
app.post('/api/intelbras-devices/:id/test', async (req, res) => {
  try {
    authenticateRequest(req);
    const { id } = req.params;
    
    const db = getDb();
    const device = db.prepare('SELECT * FROM intelbras_devices WHERE id = ?').get(id);
    
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado' });

    // Executa o Python mandando fazer um 'test'
    const result = await runIntelbrasCommand(device, 'test');

    // Se passou, atualiza o status no banco de dados para online
    db.prepare("UPDATE intelbras_devices SET status = 'online', last_sync_time = CURRENT_TIMESTAMP WHERE id = ?")
      .run(id);

    res.json({ success: true, message: 'Dispositivo Online e Respondendo!' });

  } catch (error) {
    // Se falhou, atualiza o status para offline
    const db = getDb();
    db.prepare("UPDATE intelbras_devices SET status = 'offline' WHERE id = ?").run(req.params.id);
    
    res.status(500).json({ error: error.toString() });
  }
});

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

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor aberto para a rede na porta ${PORT}`);
});
/*app.listen(port, () => {
  console.log(`
  🚀 Servidor Industrial Ativo
  📡 Endereço: http://localhost:${port}
  📂 Base de dados: SQLite Ativo
  `);
});*/