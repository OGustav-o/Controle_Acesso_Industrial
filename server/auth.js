import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key-change-in-production';

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
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
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  const cookies = req.headers.cookie;
  if (cookies) {
    const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('token='));
    if (tokenCookie) {
      return tokenCookie.split('=')[1];
    }
  }

  return null;
}

export function authenticateRequest(req) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    throw new Error('Unauthorized');
  }

  const user = verifyToken(token);
  if (!user) {
    throw new Error('Unauthorized');
  }
  
  return user;
}

export function login(username, password) {
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    throw new Error('Invalid username or password');
  }

  const passwordMatch = verifyPassword(password, user.password_hash);

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

export function createUser(username, email, password, role = 'user') {
  const db = getDb();

  const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (existingUser) {
    throw new Error('Username already exists');
  }

  const passwordHash = hashPassword(password);

  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(username, email, passwordHash, role);

  return {
    id: result.lastInsertRowid,
    username,
    email,
    role,
  };
}