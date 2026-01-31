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
        enableFate: false
    }
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

    socket.on('admin_start_game', (options) => {
        if (gameState.players.length < 1) return;
        
        // 1. 套用設定
        gameState.config.enableTraps = options?.enableTraps || false;
        gameState.config.enableFate = options?.enableFate || false;

        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.rankings = []; 
        gameState.players.forEach(p => p.position = 0);
        globalLastRoll = 0; 

        // 2. 初始化特殊格子
        gameState.players.forEach(p => { 
            p.position = 0;
            p.trapIndex = -1;
            p.fateIndex = -1;

            // 生成陷阱 (排除起點0 與 終點21，範圍 3-20)
            if (gameState.config.enableTraps) {
                p.trapIndex = Math.floor(Math.random() * 18) + 3; 
            }

            // 生成命運問號 (範圍 2-17)
            if (gameState.config.enableFate) {
                let fIdx;
                let attempts = 0;
                do {
                    fIdx = Math.floor(Math.random() * 16) + 2; 
                    attempts++;
                } while (fIdx === p.trapIndex && attempts < 10);
                
                if (fIdx !== p.trapIndex) {
                    p.fateIndex = fIdx;
                }
            }
        });

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
        gameState.players.forEach(p => { 
            p.position = 0; 
            p.trapIndex = -1;
            p.fateIndex = -1;
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
        gameState.config = { enableTraps: false, enableFate: false };
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
            fateIndex: -1,
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

        // 🎲 骰子演算法
        let roll = Math.floor(Math.random() * 6) + 1;
        if (roll === globalLastRoll) {
            if (Math.random() > 0.3) {
                roll = Math.floor(Math.random() * 6) + 1;
            }
        }
        globalLastRoll = roll; 

        // 1. 計算初步落點
        let tempPos = currentPlayer.position + roll;
        if (tempPos >= 21) tempPos = 21; 

        let finalPos = tempPos;
        let triggerType = 'NORMAL'; 
        let fateResult = 0; 

        // 2. 判斷事件
        if (gameState.config.enableTraps && tempPos === currentPlayer.trapIndex) {
            // --- A. 踩到陷阱 ---
            triggerType = 'TRAP';
            finalPos = 0; 
        } 
        else if (gameState.config.enableFate && tempPos === currentPlayer.fateIndex) {
            // --- B. 踩到機會命運 ---
            triggerType = 'FATE';
            const fateOptions = [-3, -2, -1, 1, 2, 3];
            fateResult = fateOptions[Math.floor(Math.random() * fateOptions.length)];
            
            let afterFatePos = tempPos + fateResult;
            if (afterFatePos < 0) afterFatePos = 0;
            if (afterFatePos > 21) afterFatePos = 21;

            // 🔥 C. 連鎖判斷：命運後是否掉進陷阱？
            if (gameState.config.enableTraps && afterFatePos === currentPlayer.trapIndex) {
                triggerType = 'FATE_TRAP';
                finalPos = 0;
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
            trapPos: (triggerType === 'FATE_TRAP') ? currentPlayer.trapIndex : -1 
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