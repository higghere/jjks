const express = require('express');
const jwt = require('jsonwebtoken');
const userStore = require('../models/userStore');
const { JWT_SECRET } = require('./auth');
const router = express.Router();

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await userStore.findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(userStore.toSafeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/select-character', authMiddleware, async (req, res) => {
  try {
    const { characterId } = req.body;
    const user = await userStore.findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const owned = (user.ownedCharacters || []).find((c) => c.characterId === characterId);
    if (!owned) {
      return res.status(400).json({ error: 'Character not owned' });
    }
    await userStore.updateUser(req.userId, { selectedCharacter: characterId });
    res.json({ selectedCharacter: characterId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, authMiddleware };
