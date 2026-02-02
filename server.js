const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 🔥 確保路徑為 public
app.use(express.static(path.join(__dirname, 'public')));

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
        
        gameState.config.enableTraps = config.enableTraps;
        gameState.config.fateCount = config.fateCount;

        // 亂數洗牌
        for (let i = gameState.players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gameState.players[i], gameState.players[j]] = [gameState.players[j], gameState.players[i]];
        }

        // 生成陷阱與命運
        gameState.players.forEach(p => {
            p.position = 0;
            p.trapIndex = -1;
            p.fateIndices = [];

            if (gameState.config.enableTraps) {
                p.trapIndex = Math.floor(Math.random() * 9) + 2; 
            }

            if (gameState.config.fateCount > 0) {
                const availableSlots = [];
                // 從 2 開始，確保 index 1 (第2格) 也就是重生點不會有問號
                for (let i = 2; i < 21; i++) {
                    if (i !== p.trapIndex) availableSlots.push(i);
                }
                for (let k = 0; k < gameState.config.fateCount; k++) {
                    if (availableSlots.length === 0) break;
                    const rIdx = Math.floor(Math.random() * availableSlots.length);
                    p.fateIndices.push(availableSlots[rIdx]);
                    availableSlots.splice(rIdx, 1);
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

        const roll = Math.floor(Math.random() * 6) + 1;
        globalLastRoll = roll;

        let tempPos = currentPlayer.position + roll;
        if (tempPos >= 21) tempPos = 21; 

        let finalPos = tempPos;
        let triggerType = 'NORMAL'; 
        let fateResults = [];
        let triggeredTrapPos = -1;

        if (gameState.config.enableTraps && tempPos === currentPlayer.trapIndex) {
            triggerType = 'TRAP';
            finalPos = 1; 
            currentPlayer.trapIndex = -1; 
        } 
        else {
            let chainCount = 0;
            const MAX_CHAIN = 5; 

            while (currentPlayer.fateIndices.includes(finalPos) && chainCount < MAX_CHAIN) {
                triggerType = 'FATE'; 
                const fateOptions = [-3, -2, -1, 1, 2, 3]; 
                const result = fateOptions[Math.floor(Math.random() * fateOptions.length)];
                fateResults.push(result); 
                
                currentPlayer.fateIndices = currentPlayer.fateIndices.filter(idx => idx !== finalPos);

                let nextPos = finalPos + result;
                if (nextPos < 0) nextPos = 0;
                if (nextPos > 21) nextPos = 21;
                finalPos = nextPos; 
                chainCount++;

                if (gameState.config.enableTraps && finalPos === currentPlayer.trapIndex) {
                    triggerType = 'FATE_TRAP';
                    triggeredTrapPos = finalPos; 
                    finalPos = 1; 
                    currentPlayer.trapIndex = -1; 
                    break; 
                }
            }
        }

        currentPlayer.position = finalPos;

        io.emit('player_moved', {
            playerId: currentPlayer.id,
            roll: roll,
            newPos: finalPos,
            initialLandPos: tempPos,
            triggerType: triggerType,
            fateResults: fateResults, 
            trapPos: (triggerType === 'FATE_TRAP') ? triggeredTrapPos : -1 
        });

        if (finalPos >= 21) {
            const rank = gameState.rankings.length + 1;
            gameState.rankings.push({ ...currentPlayer, rank });
            io.emit('player_finished_rank', { player: currentPlayer, rank });
        }

        // 計算動畫等待時間
        const delayTime = (triggerType === 'NORMAL' ? 2500 : (triggerType === 'TRAP' ? 4000 : 4000 + (fateResults.length * 3500)));

        setTimeout(() => {
            // 🔥🔥🔥 關鍵修正：動作結束後，強制將 TurnIndex + 1 指向下一個人
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            notifyNextTurn();
        }, delayTime);
    });

    socket.on('admin_restart_game', () => {
        gameState.status = 'LOBBY';
        gameState.rankings = [];
        gameState.turnIndex = 0;
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
    
    // 確保 index 在範圍內
    if (gameState.turnIndex >= gameState.players.length) gameState.turnIndex = 0;

    let attempts = 0;
    const maxAttempts = gameState.players.length + 1;

    // 尋找下一個還沒抵達終點的玩家
    while (attempts < maxAttempts) {
        const currentPlayer = gameState.players[gameState.turnIndex];
        
        // 如果該玩家不存在 (可能斷線)，跳過
        if (!currentPlayer) { 
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length; 
            attempts++; 
            continue; 
        }

        // 如果該玩家已經到終點，跳過
        if (currentPlayer.position >= 21) {
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            attempts++;
        } else {
            // 找到可以移動的玩家了，發送通知
            io.emit('update_turn', { 
                turnIndex: gameState.turnIndex, 
                nextPlayerId: currentPlayer.id, 
                playerName: currentPlayer.name 
            });
            return;
        }
    }
    
    // 如果找了一圈都沒人可以動 (大家都到終點了)，遊戲結束
    if (gameState.rankings.length > 0) {
        gameState.status = 'ENDED';
        io.emit('game_over', { rankings: gameState.rankings });
        io.emit('update_game_state', gameState); 
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));