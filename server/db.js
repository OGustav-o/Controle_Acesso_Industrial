import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';  

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/app.db');

// A instância singleton do banco de dados
let db = null;

export function getDb() {
  // 1. Se o 'db' (global) já foi criado, apenas o retorna
  if (db) return db;

  // 2. Criar diretório de dados se não existir
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 3. ATRIBUI a instância à variável 'db' GLOBAL.
  //    (Sem 'const' ou 'let' na frente)
  //    E usa o 'dbPath' correto.
  db = new Database(dbPath);
  
  // 4. (Síncrono)
  db.exec('PRAGMA foreign_keys = ON');
  
  // 5. Retorna a instância criada
  return db;
}

export function initializeDatabase() {
  // 1. (Síncrono) Pega a instância do banco
  const database = getDb();

  // 2. (Síncrono) Executa a criação de tabelas
  //    Removi o 'await'
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'operator')),
      photo_url TEXT,
      intelbras_user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      plc_address TEXT,
      plc_port INTEGER DEFAULT 102,
      plc_rack INTEGER DEFAULT 0,
      plc_slot INTEGER DEFAULT 1,
      plc_database INTEGER,
      plc_start_byte INTEGER,
      plc_status TEXT DEFAULT 'offline' CHECK(plc_status IN ('online', 'offline', 'error')),
      status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'offline')),
      last_plc_check DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS intelbras_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      port INTEGER DEFAULT 80,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'offline')),
      last_sync_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_cell_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      cell_id INTEGER NOT NULL,
      allowed INTEGER DEFAULT 1,
      start_time DATETIME,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (cell_id) REFERENCES cells(id),
      UNIQUE(user_id, cell_id)
    );

    CREATE TABLE IF NOT EXISTS access_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      cell_id INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('entry', 'exit')),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'intelbras' CHECK(source IN ('intelbras', 'manual')),
      status TEXT DEFAULT 'success' CHECK(status IN ('success', 'failed')),
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (cell_id) REFERENCES cells(id)
    );

    CREATE TABLE IF NOT EXISTS cell_presence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      cell_id INTEGER NOT NULL,
      entry_time DATETIME NOT NULL,
      exit_time DATETIME,
      status TEXT DEFAULT 'outside' CHECK(status IN ('inside', 'outside')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (cell_id) REFERENCES cells(id)
    );

    CREATE TABLE IF NOT EXISTS access_control_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      cell_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('unlock', 'lock', 'denied')),
      reason TEXT,
      plc_response TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (cell_id) REFERENCES cells(id)
    );

    CREATE TABLE IF NOT EXISTS plc_command_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cell_id INTEGER NOT NULL,
      user_id INTEGER,
      command TEXT NOT NULL,
      command_data TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'success', 'failed')),
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      response TEXT,
      error_message TEXT,
      executed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cell_id) REFERENCES cells(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cell_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cell_id INTEGER UNIQUE NOT NULL,
      door_open INTEGER DEFAULT 0,
      door_locked INTEGER DEFAULT 1,
      motion_detected INTEGER DEFAULT 0,
      temperature INTEGER,
      humidity INTEGER,
      last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cell_id) REFERENCES cells(id)
    );

    CREATE INDEX IF NOT EXISTS idx_access_events_user_id ON access_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_access_events_cell_id ON access_events(cell_id);
    CREATE INDEX IF NOT EXISTS idx_cell_presence_user_id ON cell_presence(user_id);
    CREATE INDEX IF NOT EXISTS idx_cell_presence_cell_id ON cell_presence(cell_id);
    CREATE INDEX IF NOT EXISTS idx_plc_command_queue_cell_id ON plc_command_queue(cell_id);
    CREATE INDEX IF NOT EXISTS idx_plc_command_queue_status ON plc_command_queue(status);
  `);

  console.log('✅ Banco de dados inicializado');
}

export function seedDatabase() {
  // 1. (Síncrono)
  const database = getDb();

  // 2. (Síncrono) .get() em vez de 'await database.get()'
  const adminUser = database.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  
if (!adminUser) {
  // CRIA UMA HASH REAL PARA A SENHA "admin"
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync("admin", salt); // <--- A senha será "admin"

  database.prepare(
    'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(
    'admin', 
    'admin@localhost', 
    hash, // <--- Usamos a variável hash aqui, e não aquele texto fixo
    'admin'
  );
  console.log('✅ Usuário admin criado com senha: admin');
}

  // 4. (Síncrono)
  const testCell = database.prepare('SELECT * FROM cells WHERE name = ?').get('Célula Teste');
  
  if (!testCell) {
    // 5. (Síncrono)
    database.prepare(
      'INSERT INTO cells (name, description, plc_address, plc_port, plc_database, plc_start_byte) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      'Célula Teste', 
      'Célula de teste para validação', 
      '192.168.1.100', 
      102, 
      1, 
      0
    );
    console.log('✅ Célula de teste criada');
  }
}