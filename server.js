const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 資料結構
let gameState = {
    status: 'LOBBY',
    turnIndex: 0,    
    players: [],
    rankings: [] 
};

const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33', '#FF8C33', '#8C33FF', '#FF338C', '#33FF8C'];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // --- 老師端 ---
    socket.on('admin_login', () => {
        socket.join('admin');
        socket.emit('update_game_state', gameState);
        socket.emit('update_player_list', gameState.players);
    });

    socket.on('admin_start_game', () => {
        if (gameState.players.length < 1) return;

        // 1. 決定順序
        gameState.players.forEach(p => {
            p.initRoll = Math.floor(Math.random() * 100) + 1;
        });
        gameState.players.sort((a, b) => b.initRoll - a.initRoll);

        // 2. 初始化狀態
        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.rankings = []; 
        gameState.players.forEach(p => p.position = 0);

        io.emit('show_initiative', gameState.players);

        setTimeout(() => {
            io.emit('game_start');
            io.emit('update_game_state', gameState);
            notifyNextTurn();
        }, 3000);
    });

    // --- 👇 新增：回起跑線 (下一局) 👇 ---
    socket.on('admin_restart_game', () => {
        // 只有在遊戲結束後才能按 (雙重驗證)
        if (gameState.status !== 'ENDED') return;

        gameState.status = 'LOBBY';
        gameState.turnIndex = 0;
        gameState.rankings = [];
        
        // 重置位置，但保留玩家
        gameState.players.forEach(p => {
            p.position = 0;
            p.initRoll = 0;
        });

        // 通知所有人畫面重置
        io.emit('game_reset_positions'); // 用這個新事件來清理前端 UI
        io.emit('update_game_state', gameState);
        io.emit('update_player_list', gameState.players);
    });
    // --- 👆 新增結束 👆 ---

    // 這是原本的「踢除所有人」
    socket.on('admin_reset_game', () => {
        gameState.status = 'LOBBY';
        gameState.turnIndex = 0;
        gameState.players = [];
        gameState.rankings = [];

        io.emit('update_player_list', []);
        io.emit('update_game_state', gameState); 
        io.emit('force_reload');
    });

    // --- 學生端 ---
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
            const alreadyFinished = gameState.rankings.find(r => r.id === currentPlayer.id);
            
            if (!alreadyFinished) {
                const rank = gameState.rankings.length + 1;
                gameState.rankings.push({ 
                    id: currentPlayer.id, 
                    name: currentPlayer.name, 
                    rank: rank 
                });

                const totalPlayers = gameState.players.length;
                let shouldEnd = false;

                if (totalPlayers <= 3) {
                    if (gameState.rankings.length >= 1) shouldEnd = true;
                } else {
                    if (gameState.rankings.length >= 3 || gameState.rankings.length === totalPlayers) {
                        shouldEnd = true;
                    }
                }

                if (shouldEnd) {
                    gameState.status = 'ENDED';
                    io.emit('game_over', { rankings: gameState.rankings });
                    io.emit('update_game_state', gameState);
                } else {
                    io.emit('player_finished_rank', { 
                        player: currentPlayer, 
                        rank: rank 
                    });
                    notifyNextTurn();
                }
            }
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
    if (gameState.status === 'ENDED') return;
    if (gameState.players.length === 0) return;

    let attempts = 0;
    while (attempts < gameState.players.length) {
        const currentPlayer = gameState.players[gameState.turnIndex];
        
        if (currentPlayer.position >= 21) {
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            attempts++;
        } else {
            break;
        }
    }
    const nextPlayer = gameState.players[gameState.turnIndex];
    if (nextPlayer.position >= 21) return; 

    io.emit('update_turn', { 
        turnIndex: gameState.turnIndex, 
        nextPlayerId: nextPlayer.id 
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});