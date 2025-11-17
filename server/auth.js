import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key-change-in-production';

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function extractTokenFromRequest(req) {
  // Tentar obter do header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Tentar obter do cookie
  const cookies = req.headers.cookie;
  if (cookies) {
    const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('token='));
    if (tokenCookie) {
      return tokenCookie.split('=')[1];
    }
  }

  return null;
}

export async function authenticateRequest(req) {
  const token = extractTokenFromRequest(req);
  if (!token) return null;

  const user = verifyToken(token);
  return user || null;
}

export async function login(username, password) {
  const db = await getDb();

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    throw new Error('Invalid username or password');
  }

  const passwordMatch = await verifyPassword(password, user.password_hash);

  if (!passwordMatch) {
    throw new Error('Invalid username or password');
  }

  const token = createToken(user);

  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    token,
  };
}

export async function createUser(username, email, password, role = 'user') {
  const db = await getDb();

  const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);

  if (existingUser) {
    throw new Error('Username already exists');
  }

  const passwordHash = await hashPassword(password);

  const result = await db.run(
    'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [username, email, passwordHash, role]
  );

  return {
    id: result.lastID,
    username,
    email,
    role,
  };
}
