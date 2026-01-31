const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
    status: 'LOBBY',
    turnIndex: 0,    
    players: [],
    rankings: [] 
};

// 記錄上一次骰出的點數，用於防重複
let globalLastRoll = 0;

const CHAR_POOL = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33', '#FF8C33', '#8C33FF'];

function assignAvatar(existingPlayers) {
    const usedChars = existingPlayers.map(p => p.avatarChar);
    const available = CHAR_POOL.filter(c => !usedChars.includes(c));
    if (available.length === 0) return 'a'; 
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('admin_login', () => {
        socket.join('admin');
        socket.emit('update_game_state', gameState);
        socket.emit('update_player_list', gameState.players);
    });

    socket.on('admin_start_game', () => {
        if (gameState.players.length < 1) return;
        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.rankings = []; 
        gameState.players.forEach(p => p.position = 0);
        globalLastRoll = 0; // 重置骰子歷史

        const shuffledPlayers = [...gameState.players].sort(() => 0.5 - Math.random());
        io.emit('show_initiative', shuffledPlayers);

        setTimeout(() => {
            io.emit('game_start');
            io.emit('update_game_state', gameState);
            notifyNextTurn();
        }, 3000);
    });

    socket.on('admin_restart_game', () => {
        if (gameState.status !== 'ENDED') return;
        gameState.status = 'LOBBY';
        gameState.turnIndex = 0;
        gameState.rankings = [];
        globalLastRoll = 0;
        gameState.players.forEach(p => { p.position = 0; });
        io.emit('game_reset_positions');
        io.emit('update_game_state', gameState);
        io.emit('update_player_list', gameState.players);
    });

    socket.on('admin_reset_game', () => {
        gameState.status = 'LOBBY';
        gameState.turnIndex = 0;
        gameState.players = [];
        gameState.rankings = [];
        globalLastRoll = 0;
        io.emit('update_player_list', []);
        io.emit('update_game_state', gameState); 
        io.emit('force_reload');
    });

    socket.on('player_join', (playerName) => {
        if (gameState.status !== 'LOBBY') {
            socket.emit('error_msg', '遊戲進行中，無法加入');
            return;
        }
        if (gameState.players.length >= 8) {
            socket.emit('error_msg', '房間已滿 (最多 8 人)');
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

        const assignedChar = assignAvatar(gameState.players);

        const newPlayer = {
            id: socket.id,
            name: playerName,
            color: COLORS[gameState.players.length % COLORS.length],
            avatarChar: assignedChar,
            joinTime: Date.now(),
            position: 0,
            isReady: true
        };

        gameState.players.push(newPlayer);
        gameState.players.sort((a, b) => a.joinTime - b.joinTime); 

        io.emit('update_player_list', gameState.players);
    });

    socket.on('action_roll', () => {
        const currentPlayer = gameState.players[gameState.turnIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) return;
        if (gameState.status !== 'PLAYING') return;

        // 🎲 骰子演算法優化 (防連續)
        let roll = Math.floor(Math.random() * 6) + 1;
        
        // 如果跟上次一樣，有 70% 機率重骰
        if (roll === globalLastRoll) {
            if (Math.random() > 0.3) {
                roll = Math.floor(Math.random() * 6) + 1;
            }
        }
        globalLastRoll = roll; // 更新紀錄

        let newPos = currentPlayer.position + roll;
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
                    rank: rank,
                    avatarChar: currentPlayer.avatarChar 
                });

                const totalPlayers = gameState.players.length;
                let shouldEnd = false;
                if (totalPlayers === 1 && gameState.rankings.length === 1) shouldEnd = true;
                else if (totalPlayers <= 3 && gameState.rankings.length >= 1) shouldEnd = true;
                else if (gameState.rankings.length >= 3 || gameState.rankings.length === totalPlayers) shouldEnd = true;

                if (shouldEnd) {
                    gameState.status = 'ENDED';
                    io.emit('game_over', { rankings: gameState.rankings });
                    io.emit('update_game_state', gameState);
                } else {
                    io.emit('player_finished_rank', { player: currentPlayer, rank: rank });
                    notifyNextTurn();
                }
            }
        } else {
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            notifyNextTurn();
        }
    });

    socket.on('disconnect', () => {
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const isCurrentTurn = (playerIndex === gameState.turnIndex);
            gameState.players.splice(playerIndex, 1);
            
            if (playerIndex < gameState.turnIndex) gameState.turnIndex--;
            if (gameState.turnIndex >= gameState.players.length) gameState.turnIndex = 0;

            io.emit('update_player_list', gameState.players);

            if (gameState.players.length === 0) {
                gameState.status = 'LOBBY';
                io.emit('admin_reset_game');
                return;
            }

            if (gameState.status === 'PLAYING' && isCurrentTurn) {
                setTimeout(() => notifyNextTurn(), 500);
            }
        }
    });
});

function notifyNextTurn() {
    if (gameState.status === 'ENDED') return;
    if (gameState.players.length === 0) return;
    if (gameState.turnIndex >= gameState.players.length) gameState.turnIndex = 0;

    let attempts = 0;
    const maxAttempts = gameState.players.length + 1;

    while (attempts < maxAttempts) {
        const currentPlayer = gameState.players[gameState.turnIndex];
        if (!currentPlayer) { gameState.turnIndex = 0; attempts++; continue; }

        if (currentPlayer.position >= 21) {
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            attempts++;
        } else {
            io.emit('update_turn', { 
                turnIndex: gameState.turnIndex, 
                nextPlayerId: currentPlayer.id,
                playerName: currentPlayer.name 
            });
            return;
        }
    }
    if (gameState.rankings.length > 0) {
        gameState.status = 'ENDED';
        io.emit('game_over', { rankings: gameState.rankings });
        io.emit('update_game_state', gameState);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});