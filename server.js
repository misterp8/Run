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
    rankings: [], 
    config: {
        enableTraps: false,
        fateCount: 0 
    }
};

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

    socket.on('admin_start_game', (options) => {
        if (gameState.players.length < 1) return;
        
        gameState.config.enableTraps = options?.enableTraps || false;
        gameState.config.fateCount = parseInt(options?.fateCount || 0);

        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.rankings = []; 
        globalLastRoll = 0; 

        // 🔥 核心修正：直接對 gameState.players 進行亂數排序 (洗牌)
        gameState.players.sort(() => 0.5 - Math.random());

        // 初始化玩家狀態
        gameState.players.forEach(p => { 
            p.position = 0;
            p.trapIndex = -1;
            p.fateIndices = []; 

            if (gameState.config.enableTraps) {
                p.trapIndex = Math.floor(Math.random() * 9) + 2; 
            }

            if (gameState.config.fateCount > 0) {
                let attempts = 0;
                while (p.fateIndices.length < gameState.config.fateCount && attempts < 50) {
                    attempts++;
                    let fIdx = Math.floor(Math.random() * 16) + 2;
                    if (fIdx !== p.trapIndex && !p.fateIndices.includes(fIdx)) {
                        p.fateIndices.push(fIdx);
                    }
                }
            }
        });

        // 🔥 重要：洗牌後，要告訴前端「最新的玩家順序」(更新跑道順序)
        io.emit('update_player_list', gameState.players);

        // 顯示抽籤動畫 (這時候順序已經同步了)
        io.emit('show_initiative', gameState.players);

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
        gameState.players.forEach(p => { 
            p.position = 0; 
            p.trapIndex = -1;
            p.fateIndices = [];
        });
        io.emit('game_reset_positions');
        io.emit('update_game_state', gameState);
        io.emit('update_player_list', gameState.players);
    });

    socket.on('admin_reset_game', () => {
        gameState.status = 'LOBBY';
        gameState.turnIndex = 0;
        gameState.players = [];
        gameState.rankings = [];
        gameState.config = { enableTraps: false, fateCount: 0 };
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
            trapIndex: -1,
            fateIndices: [], 
            isReady: true
        };

        gameState.players.push(newPlayer);
        // 大廳期間保持加入順序，開始遊戲時才會洗牌
        // gameState.players.sort((a, b) => a.joinTime - b.joinTime); 

        io.emit('update_player_list', gameState.players);
    });

    socket.on('action_roll', () => {
        const currentPlayer = gameState.players[gameState.turnIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) return;
        if (gameState.status !== 'PLAYING') return;

        let roll = Math.floor(Math.random() * 6) + 1;
        if (roll === globalLastRoll) {
            if (Math.random() > 0.3) {
                roll = Math.floor(Math.random() * 6) + 1;
            }
        }
        globalLastRoll = roll; 

        let tempPos = currentPlayer.position + roll;
        if (tempPos >= 21) tempPos = 21; 

        let finalPos = tempPos;
        let triggerType = 'NORMAL'; 
        let fateResult = 0; 
        
        const triggeredTrapPos = currentPlayer.trapIndex; 

        if (gameState.config.enableTraps && tempPos === currentPlayer.trapIndex) {
            triggerType = 'TRAP';
            finalPos = 1; 
            currentPlayer.trapIndex = -1; 
        } 
        else if (currentPlayer.fateIndices.includes(tempPos)) {
            triggerType = 'FATE';
            const fateOptions = [-3, -2, -1, 1, 2, 3];
            fateResult = fateOptions[Math.floor(Math.random() * fateOptions.length)];
            
            currentPlayer.fateIndices = currentPlayer.fateIndices.filter(idx => idx !== tempPos);

            let afterFatePos = tempPos + fateResult;
            if (afterFatePos < 0) afterFatePos = 0;
            if (afterFatePos > 21) afterFatePos = 21;

            if (gameState.config.enableTraps && afterFatePos === currentPlayer.trapIndex) {
                triggerType = 'FATE_TRAP';
                finalPos = 1; 
                currentPlayer.trapIndex = -1; 
            } else {
                finalPos = afterFatePos;
            }
        }

        currentPlayer.position = finalPos;

        io.emit('player_moved', {
            playerId: currentPlayer.id,
            roll: roll,
            newPos: finalPos,
            initialLandPos: tempPos,
            triggerType: triggerType,
            fateResult: fateResult,
            trapPos: (triggerType === 'FATE_TRAP') ? triggeredTrapPos : -1 
        });

        if (finalPos === 21) {
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