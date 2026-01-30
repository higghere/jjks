const express = require('express');
const userStore = require('../models/userStore');
const { authMiddleware } = require('./user');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const RARITIES = ['Common', 'Rare', 'SR', 'SSR', 'UR'];
const WEIGHTS = [60, 25, 10, 4, 1];
const PITY_THRESHOLD = 50;

function loadCharacters() {
  const filePath = path.join(__dirname, '../config/characters.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.characters;
}

function rollRarity(pityCounter) {
  if (pityCounter >= PITY_THRESHOLD) {
    return Math.random() < 0.5 ? 'SSR' : 'UR';
  }
  const roll = Math.random() * 100;
  let acc = 0;
  for (let i = 0; i < WEIGHTS.length; i++) {
    acc += WEIGHTS[i];
    if (roll < acc) return RARITIES[i];
  }
  return 'Common';
}

function pickCharacterByRarity(characters, rarity) {
  const pool = characters.filter((c) => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

router.post('/roll', authMiddleware, async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.body.count) || 1, 1), 10);
    const user = await userStore.findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if ((user.spins || 0) < count) {
      return res.status(400).json({ error: 'Not enough spins', spins: user.spins || 0 });
    }
    const characters = loadCharacters();
    const results = [];
    let newPity = user.pityCounter ?? 0;
    const ownedCharacters = (user.ownedCharacters || []).map((o) => ({ ...o }));

    for (let i = 0; i < count; i++) {
      const rarity = rollRarity(newPity);
      if (rarity === 'SSR' || rarity === 'UR') newPity = 0;
      else newPity++;
      const char = pickCharacterByRarity(characters, rarity);
      const owned = ownedCharacters.find((o) => o.characterId === char.id);
      if (owned) {
        const shardsPerDuplicate = { Common: 5, Rare: 10, SR: 25, SSR: 50, UR: 100 };
        const add = shardsPerDuplicate[char.rarity] || 5;
        owned.shards = (owned.shards || 0) + add;
        results.push({ character: char, duplicate: true, shards: add });
      } else {
        ownedCharacters.push({ characterId: char.id, shards: 0, stars: 1 });
        results.push({ character: char, duplicate: false });
      }
    }

    const newSpins = (user.spins || 0) - count;
    await userStore.updateUser(req.userId, { spins: newSpins, pityCounter: newPity, ownedCharacters });

    res.json({
      results,
      spinsLeft: newSpins,
      pityCounter: newPity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upgrade', authMiddleware, async (req, res) => {
  try {
    const { characterId } = req.body;
    const user = await userStore.findUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ownedCharacters = (user.ownedCharacters || []).map((o) => ({ ...o }));
    const owned = ownedCharacters.find((o) => o.characterId === characterId);
    if (!owned) return res.status(400).json({ error: 'Character not owned' });
    const shardsNeeded = (owned.stars || 1) * 30;
    if ((owned.shards || 0) < shardsNeeded) {
      return res.status(400).json({ error: 'Not enough shards', needed: shardsNeeded });
    }
    owned.shards = (owned.shards || 0) - shardsNeeded;
    owned.stars = Math.min((owned.stars || 1) + 1, 6);
    await userStore.updateUser(req.userId, { ownedCharacters });
    res.json({ characterId, stars: owned.stars, shardsLeft: owned.shards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
