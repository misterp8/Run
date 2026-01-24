const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in this demo
  }
});

// Game Constants
const TRACK_LENGTH = 22;

// Server Game State
let gameState = {
  status: 'LOBBY', // 'LOBBY' | 'PLAYING' | 'ENDED'
  turnIndex: 0,
  players: [],     // { id, name, color, position, socketId }
  logs: [],
  winnerName: undefined,
  lastRoll: undefined
};

// Helper: Add Log
function addLog(msg) {
  const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  gameState.logs = [`[${timestamp}] ${msg}`, ...gameState.logs].slice(0, 50);
}

// Broadcast State
function broadcast() {
  // Filter out sensitive data like socketId if needed, but for this simple game sending all is fine
  io.emit('state_update', gameState);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Send initial state
  socket.emit('state_update', gameState);

  // --- EVENTS ---

  // 1. Join Game
  socket.on('join_game', ({ name, color }) => {
    if (gameState.status !== 'LOBBY') {
      socket.emit('error_msg', '遊戲已在進行中，無法加入');
      return;
    }
    if (gameState.players.length >= 10) {
      socket.emit('error_msg', '房間已滿');
      return;
    }

    // Check duplicate names (optional, simplified here)
    const newPlayer = {
      id: socket.id, // Use socket ID as player ID for simplicity
      name: name.substring(0, 8), // Limit name length
      color,
      position: 0
    };

    gameState.players.push(newPlayer);
    addLog(`${newPlayer.name} 加入了遊戲`);
    broadcast();
  });

  // 2. Start Game (Teacher)
  socket.on('start_game', () => {
    // In a real app, verify admin token here. For demo, anyone can start if logic permits.
    if (gameState.players.length === 0) return;
    
    gameState.status = 'PLAYING';
    gameState.turnIndex = 0;
    gameState.winnerName = undefined;
    gameState.lastRoll = undefined;
    
    addLog('遊戲開始！');
    broadcast();
  });

  // 3. Reset Game (Teacher)
  socket.on('reset_game', () => {
    gameState.status = 'LOBBY';
    gameState.turnIndex = 0;
    gameState.players = []; // Kick everyone
    gameState.winnerName = undefined;
    gameState.lastRoll = undefined;
    gameState.logs = ['遊戲已重置，等待新玩家加入...'];
    
    addLog('管理者重置了遊戲');
    broadcast();
  });

  // 4. Roll Dice (Student)
  socket.on('action_roll', () => {
    if (gameState.status !== 'PLAYING') return;

    const currentPlayer = gameState.players[gameState.turnIndex];
    if (!currentPlayer) return;

    // Check if it's actually this player's turn (Security)
    if (currentPlayer.id !== socket.id) {
      // socket.emit('error_msg', '還沒輪到你！');
      return;
    }

    // --- GAME LOGIC ---
    const roll = Math.floor(Math.random() * 6) + 1;
    gameState.lastRoll = roll;

    const oldPos = currentPlayer.position;
    let newPos = oldPos + roll;
    
    if (newPos >= TRACK_LENGTH - 1) {
      newPos = TRACK_LENGTH - 1;
    }

    currentPlayer.position = newPos;
    addLog(`${currentPlayer.name} 擲出了 ${roll} 點，移動到第 ${newPos} 格`);

    // Check Win
    if (newPos === TRACK_LENGTH - 1) {
      gameState.status = 'ENDED';
      gameState.winnerName = currentPlayer.name;
      currentPlayer.isWinner = true;
      addLog(`遊戲結束！${currentPlayer.name} 獲勝！`);
    } else {
      // Next Turn
      gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
    }

    broadcast();
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Note: We don't remove players on disconnect in 'PLAYING' state to avoid breaking turn order.
    // In 'LOBBY', we could remove them.
    if (gameState.status === 'LOBBY') {
        const idx = gameState.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
            addLog(`${gameState.players[idx].name} 離開了遊戲`);
            gameState.players.splice(idx, 1);
            broadcast();
        }
    }
  });
});

// Serve Static Files (Frontend)
// Assuming built files or source files are in root for this simple setup
app.use(express.static(__dirname));

// Fallback for SPA routing (if any)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
