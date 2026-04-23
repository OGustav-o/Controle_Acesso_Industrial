import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';

// Configuração de caminhos para garantir que o banco seja criado no local correto
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/app.db');

// Instância singleton do banco de dados para evitar múltiplas conexões
let db = null;

/**
 * Função para obter a instância do banco de dados.
 * Garante que a conexão e o diretório existam antes do uso.
 */
export function getDb() {
  if (db) return db; // Retorna a instância se já estiver inicializada

  // Cria o diretório 'data' caso ele não exista 
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Inicializa a conexão com o SQLite usando better-sqlite3 
  db = new Database(dbPath);
  
  // Ativa o suporte a chaves estrangeiras para manter a integridade dos dados 
  db.exec('PRAGMA foreign_keys = ON');
  
  return db;
}

/**
 * Cria as tabelas necessárias no banco de dados caso elas não existam.
 */
export function initializeDatabase() {
  const database = getDb(); // Obtém a conexão inicializada 

  // Executa o script de criação de tabelas 
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
      cell_id INTEGER, -- 👈 NOVA COLUNA: Relacionamento com o CLP
      status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'offline')),
      last_sync_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cell_id) REFERENCES cells(id)
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

    CREATE INDEX IF NOT EXISTS idx_access_events_user_id ON access_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_cell_presence_user_id ON cell_presence(user_id);
  `);

  console.log('✅ Banco de dados e tabelas inicializados com sucesso');
}

/**
 * Popula o banco com dados iniciais obrigatórios (Seed).
 * Resolve o problema de referência ao garantir que o admin seja buscado após a conexão. 
 */
export function seedDatabase() {
  const database = getDb(); // Garante que a conexão existe antes da consulta 

  // Verifica se o usuário administrador já existe 
  const adminUser = database.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  
  if (!adminUser) {
    // Gera o hash da senha padrão "admin123" de forma segura 
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync("admin123", salt);

    // Insere o usuário administrador inicial 
    database.prepare(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(
      'admin', 
      'admin@localhost', 
      hash, 
      'admin'
    );
    console.log('✅ Usuário administrador padrão criado (admin / admin123)');
  }
}
