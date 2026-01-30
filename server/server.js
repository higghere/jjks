const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const { router: authRouter } = require('./routes/auth');
const { router: userRouter } = require('./routes/user');
const gachaRouter = require('./routes/gacha');
const gameHandler = require('./socket/gameHandler');
const fs = require('fs');

connectDB();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/gacha', gachaRouter);

app.get('/api/characters', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'characters.json'), 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load characters' });
  }
});

app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

gameHandler(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
