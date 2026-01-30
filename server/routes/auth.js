const express = require('express');
const jwt = require('jsonwebtoken');
const userStore = require('../models/userStore');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'gacha-fight-secret-key-change-in-production';

const createToken = (userId) => {
  return jwt.sign({ id: String(userId) }, JWT_SECRET, { expiresIn: '7d' });
};

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await userStore.findUserByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    const user = await userStore.createUser({
      username: username.trim(),
      password,
      spins: 10,
      ownedCharacters: [{ characterId: 'yuki', shards: 0, stars: 1 }],
      selectedCharacter: 'yuki',
    });
    const token = createToken(user._id || user.id);
    res.json({
      token,
      user: userStore.toSafeUser(user),
    });
  } catch (err) {
    console.error('Register error:', err.name, err.message);
    const msg = (err && err.message) ? String(err.message) : 'Registration failed';
    res.status(err.message === 'Username already taken' ? 400 : 500).json({ error: msg });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const user = await userStore.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await userStore.comparePassword(user, password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = createToken(user._id || user.id);
    res.json({
      token,
      user: userStore.toSafeUser(user),
    });
  } catch (err) {
    console.error('Login error:', err.name, err.message);
    const msg = (err && err.message) ? String(err.message) : 'Login failed';
    res.status(500).json({ error: msg });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await userStore.findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    res.json(userStore.toSafeUser(user));
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = { router, JWT_SECRET };
