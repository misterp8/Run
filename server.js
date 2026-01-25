const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 設定靜態檔案資料夾
app.use(express.static(path.join(__dirname, 'public')));

// 資料結構
let gameState = {
    status: 'LOBBY', // 'LOBBY' | 'PLAYING' | 'ENDED'
    turnIndex: 0,    
    players: []      
};

// 顏色庫
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33', '#FF8C33', '#8C33FF', '#FF338C', '#33FF8C'];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // --- 老師端邏輯 ---
    socket.on('admin_login', () => {
        socket.join('admin');
        socket.emit('update_game_state', gameState);
        socket.emit('update_player_list', gameState.players);
    });

    socket.on('admin_start_game', () => {
        if (gameState.players.length < 1) return;

        // 1. 決定順序 (Initiative)
        gameState.players.forEach(p => {
            p.initRoll = Math.floor(Math.random() * 100) + 1;
        });
        gameState.players.sort((a, b) => b.initRoll - a.initRoll);

        // 2. 設定狀態
        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.players.forEach(p => p.position = 0);

        // 3. 廣播順序動畫
        io.emit('show_initiative', gameState.players);

        // 4. 3秒後正式開始
        setTimeout(() => {
            io.emit('game_start');
            io.emit('update_game_state', gameState);
            notifyNextTurn();
        }, 3000);
    });

    socket.on('admin_reset_game', () => {
        console.log('Admin requested reset.');
        gameState.status = 'LOBBY';
        gameState.turnIndex = 0;
        gameState.players = [];

        // 重點修正：必須廣播新的狀態，老師的按鈕才會變回來
        io.emit('update_player_list', []);
        io.emit('update_game_state', gameState); 
        io.emit('force_reload');
        
        console.log('Game reset complete.');
    });

    // --- 學生端邏輯 ---
    socket.on('player_join', (playerName) => {
        if (gameState.status !== 'LOBBY') {
            socket.emit('error_msg', '遊戲進行中，無法加入');
            return;
        }
        if (gameState.players.length >= 10) {
            socket.emit('error_msg', '房間已滿 (Max 10)');
            return;
        }
        if (!playerName || playerName.trim() === "") {
            socket.emit('error_msg', '請輸入名字！');
            return;
        }
        // 檢查名字重複
        const isNameTaken = gameState.players.some(p => p.name === playerName);
        if (isNameTaken) {
            socket.emit('error_msg', `名字「${playerName}」已有人使用！`);
            return;
        }

        const newPlayer = {
            id: socket.id,
            name: playerName,
            color: COLORS[gameState.players.length % COLORS.length],
            position: 0,
            isReady: true,
            initRoll: 0
        };

        gameState.players.push(newPlayer);
        io.emit('update_player_list', gameState.players);
    });

    // --- 遊戲循環 ---
    socket.on('action_roll', () => {
        const currentPlayer = gameState.players[gameState.turnIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) return;
        if (gameState.status !== 'PLAYING') return;

        const roll = Math.floor(Math.random() * 6) + 1;
        const oldPos = currentPlayer.position;
        let newPos = oldPos + roll;

        if (newPos >= 21) newPos = 21;
        currentPlayer.position = newPos;

        io.emit('player_moved', {
            playerId: currentPlayer.id,
            roll: roll,
            newPos: newPos
        });

        if (newPos === 21) {
            gameState.status = 'ENDED';
            io.emit('game_over', { winner: currentPlayer });
            io.emit('update_game_state', gameState); // 讓老師按鈕解鎖
        } else {
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            notifyNextTurn();
        }
    });

    socket.on('disconnect', () => {
        if (gameState.status === 'LOBBY') {
            gameState.players = gameState.players.filter(p => p.id !== socket.id);
            io.emit('update_player_list', gameState.players);
        }
    });
});

function notifyNextTurn() {
    const nextPlayer = gameState.players[gameState.turnIndex];
    io.emit('update_turn', { 
        turnIndex: gameState.turnIndex, 
        nextPlayerId: nextPlayer.id 
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});