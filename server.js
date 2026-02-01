const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public4')));

let gameState = {
    status: 'LOBBY',
    turnIndex: 0,    
    players: [],
    rankings: [], 
    config: {
        enableTraps: true,
        fateCount: 1 
    }
};

let globalLastRoll = 0;

const CHAR_POOL = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];

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
        socket.emit('update_player_list', gameState.players);
        socket.emit('update_game_state', gameState);
    });

    socket.on('player_join', (name) => {
        if (gameState.status !== 'LOBBY') {
            socket.emit('error_msg', '遊戲進行中，無法加入');
            return;
        }
        if (gameState.players.find(p => p.name === name)) {
            socket.emit('error_msg', '名字已被使用');
            return;
        }

        const newPlayer = {
            id: socket.id,
            name: name,
            position: 0,
            avatarChar: assignAvatar(gameState.players),
            trapIndex: -1,
            fateIndices: [] 
        };
        gameState.players.push(newPlayer);
        
        io.emit('update_player_list', gameState.players);
        io.emit('update_game_state', gameState);
    });

    socket.on('admin_start_game', (config) => {
        if (gameState.players.length === 0) return;
        
        gameState.status = 'PLAYING';
        gameState.rankings = [];
        gameState.turnIndex = 0;
        
        // 1. 儲存設定
        gameState.config.enableTraps = config.enableTraps;
        gameState.config.fateCount = config.fateCount;

        // 2. 亂數洗牌
        for (let i = gameState.players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gameState.players[i], gameState.players[j]] = [gameState.players[j], gameState.players[i]];
        }

        // 3. 生成陷阱與命運
        gameState.players.forEach(p => {
            p.position = 0;
            p.trapIndex = -1;
            p.fateIndices = [];

            // 生成陷阱 (2~10格)
            if (gameState.config.enableTraps) {
                p.trapIndex = Math.floor(Math.random() * 9) + 2; 
            }

            // 生成命運 (排除起點、終點、陷阱格)
            if (gameState.config.fateCount > 0) {
                const availableSlots = [];
                for (let i = 1; i < 21; i++) {
                    if (i !== p.trapIndex) availableSlots.push(i);
                }
                
                // 隨機抽取指定數量的命運格
                for (let k = 0; k < gameState.config.fateCount; k++) {
                    if (availableSlots.length === 0) break;
                    const rIdx = Math.floor(Math.random() * availableSlots.length);
                    p.fateIndices.push(availableSlots[rIdx]);
                    availableSlots.splice(rIdx, 1); // 避免重複
                }
            }
        });

        io.emit('game_start');
        io.emit('update_game_state', gameState);
        io.emit('show_initiative', gameState.players);

        setTimeout(() => {
            const firstPlayer = gameState.players[0];
            io.emit('update_turn', { 
                turnIndex: 0, 
                nextPlayerId: firstPlayer.id, 
                playerName: firstPlayer.name 
            });
        }, 3000);
    });

    socket.on('action_roll', () => {
        if (gameState.status !== 'PLAYING') return;

        const currentPlayer = gameState.players[gameState.turnIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) return;

        // 擲骰 1~6
        const roll = Math.floor(Math.random() * 6) + 1;
        globalLastRoll = roll;

        let tempPos = currentPlayer.position + roll;
        if (tempPos >= 21) tempPos = 21; 

        let finalPos = tempPos;
        let triggerType = 'NORMAL'; 
        let fateResults = []; // 🔥 改成陣列，支援連續觸發
        let triggeredTrapPos = -1;

        // 1. 優先判斷是否踩到陷阱
        if (gameState.config.enableTraps && tempPos === currentPlayer.trapIndex) {
            triggerType = 'TRAP';
            finalPos = 1; // 掉回第 2 格 (Index 1)
            currentPlayer.trapIndex = -1; // 消耗掉
        } 
        else {
            // 2. 命運連鎖判定 (While 迴圈)
            // 限制最多連鎖 5 次，避免極端狀況
            let chainCount = 0;
            const MAX_CHAIN = 5; 

            // 只要當前位置還有命運問號，就繼續抽
            while (currentPlayer.fateIndices.includes(finalPos) && chainCount < MAX_CHAIN) {
                triggerType = 'FATE'; // 標記為命運觸發
                
                // 命運卡牌效果：-3 ~ +3
                const fateOptions = [-3, -2, -1, 1, 2, 3]; 
                const result = fateOptions[Math.floor(Math.random() * fateOptions.length)];
                
                fateResults.push(result); // 紀錄這次結果
                
                // 消耗掉這個問號 (從陣列移除)
                currentPlayer.fateIndices = currentPlayer.fateIndices.filter(idx => idx !== finalPos);

                // 計算移動後的新位置
                let nextPos = finalPos + result;
                if (nextPos < 0) nextPos = 0;
                if (nextPos > 21) nextPos = 21;
                
                finalPos = nextPos; // 更新位置，準備下一次迴圈檢查
                chainCount++;

                // 如果連鎖過程中踩到陷阱，強制中斷並觸發陷阱
                if (gameState.config.enableTraps && finalPos === currentPlayer.trapIndex) {
                    triggerType = 'FATE_TRAP';
                    triggeredTrapPos = finalPos; // 記住在哪裡掉下去的
                    finalPos = 1; 
                    currentPlayer.trapIndex = -1; 
                    break; // 跳出迴圈，不再繼續連鎖
                }
            }
        }

        currentPlayer.position = finalPos;

        // 傳送結果給前端 (注意 fateResults 是陣列)
        io.emit('player_moved', {
            playerId: currentPlayer.id,
            roll: roll,
            newPos: finalPos,
            initialLandPos: tempPos,
            triggerType: triggerType,
            fateResults: fateResults, 
            trapPos: (triggerType === 'FATE_TRAP') ? triggeredTrapPos : -1 
        });

        // 判斷是否到達終點 (第21格)
        if (finalPos >= 21) {
            const rank = gameState.rankings.length + 1;
            gameState.rankings.push({ ...currentPlayer, rank });
            io.emit('player_finished_rank', { player: currentPlayer, rank });
        }

        setTimeout(() => notifyNextTurn(), (triggerType === 'NORMAL' ? 2500 : (triggerType === 'TRAP' ? 4000 : 4000 + (fateResults.length * 3500))));
    });

    socket.on('admin_restart_game', () => {
        gameState.status = 'LOBBY';
        gameState.rankings = [];
        gameState.turnIndex = 0;
        // 保留 players 但重置位置
        gameState.players.forEach(p => { 
            p.position = 0; 
            p.trapIndex = -1;
            p.fateIndices = [];
        });
        io.emit('game_reset_positions');
        io.emit('update_game_state', gameState);
    });

    socket.on('admin_reset_game', () => {
        gameState = {
            status: 'LOBBY',
            turnIndex: 0,
            players: [],
            rankings: [],
            config: { enableTraps: false, fateCount: 0 }
        };
        io.emit('force_reload'); 
    });

    socket.on('disconnect', () => {
        const pIndex = gameState.players.findIndex(p => p.id === socket.id);
        if (pIndex !== -1) {
            gameState.players.splice(pIndex, 1);
            io.emit('update_player_list', gameState.players);
            
            if (gameState.players.length === 0) {
                gameState.status = 'LOBBY';
                io.emit('admin_reset_game');
                return;
            }

            if (gameState.status === 'PLAYING') {
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
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));