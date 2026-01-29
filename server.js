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

// 角色池 (確保不重複)
const CHAR_POOL = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33', '#FF8C33', '#8C33FF'];

// 分配角色的輔助函式
function assignAvatar(existingPlayers) {
    const usedChars = existingPlayers.map(p => p.avatarChar);
    return CHAR_POOL.find(c => !usedChars.includes(c)) || 'a';
}

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

        // 初始化遊戲狀態
        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.rankings = []; 
        gameState.players.forEach(p => p.position = 0);

        // 廣播抽籤結果 (這裡僅供顯示，實際順序依照加入順序)
        const displayOrder = [...gameState.players].sort((a, b) => b.initRoll - a.initRoll);
        io.emit('show_initiative', displayOrder);

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
        gameState.players.forEach(p => { p.position = 0; p.initRoll = 0; });

        io.emit('game_reset_positions');
        io.emit('update_game_state', gameState);
        io.emit('update_player_list', gameState.players);
    });

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
            isReady: true,
            initRoll: Math.floor(Math.random() * 100) + 1 // 預先骰好
        };

        gameState.players.push(newPlayer);
        // 確保依照加入時間排序 (避免順序跳動)
        gameState.players.sort((a, b) => a.joinTime - b.joinTime);

        io.emit('update_player_list', gameState.players);
    });

    socket.on('action_roll', () => {
        const currentPlayer = gameState.players[gameState.turnIndex];
        
        // 安全檢查：如果玩家不存在 (可能剛斷線)，重新計算回合
        if (!currentPlayer) {
            notifyNextTurn();
            return;
        }
        if (currentPlayer.id !== socket.id) return;
        if (gameState.status !== 'PLAYING') return;

        const roll = Math.floor(Math.random() * 6) + 1;
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

    // --- 🛠️ 關鍵修正：斷線處理邏輯 ---
    socket.on('disconnect', () => {
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
            const player = gameState.players[playerIndex];
            console.log(`Player disconnected: ${player.name}`);

            if (gameState.status === 'LOBBY') {
                // 大廳狀態：直接移除
                gameState.players.splice(playerIndex, 1);
                io.emit('update_player_list', gameState.players);
            } 
            else if (gameState.status === 'PLAYING') {
                // 遊戲中狀態：
                const isCurrentTurn = (playerIndex === gameState.turnIndex);
                
                // 1. 移除玩家
                gameState.players.splice(playerIndex, 1);

                // 2. 修正 turnIndex
                // 如果斷線的人在當前操作者之前，當前操作者的 index 會往前移，所以 turnIndex 要 -1
                if (playerIndex < gameState.turnIndex) {
                    gameState.turnIndex--;
                }
                
                // 防止 index 破表
                if (gameState.turnIndex >= gameState.players.length) {
                    gameState.turnIndex = 0;
                }

                // 3. 更新前端畫面 (移除該角色)
                io.emit('update_player_list', gameState.players);

                // 4. 如果人數歸零，重置
                if (gameState.players.length === 0) {
                    gameState.status = 'LOBBY';
                    gameState.turnIndex = 0;
                    gameState.rankings = [];
                    io.emit('admin_reset_game'); // 或回到初始狀態
                    io.emit('update_game_state', gameState);
                    return;
                }

                // 5. 如果斷線的人正好是「當前操作者」，必須強制切換到下一位
                if (isCurrentTurn) {
                    // 稍微延遲一下，避免前端渲染衝突
                    setTimeout(() => {
                        notifyNextTurn();
                    }, 500);
                }
            }
        }
    });
});

function notifyNextTurn() {
    if (gameState.status === 'ENDED') return;
    if (gameState.players.length === 0) return;

    // 確保 Index 在範圍內
    if (gameState.turnIndex >= gameState.players.length) {
        gameState.turnIndex = 0;
    }

    let attempts = 0;
    const maxAttempts = gameState.players.length + 1;

    // 尋找下一位還沒跑完的玩家
    while (attempts < maxAttempts) {
        const currentPlayer = gameState.players[gameState.turnIndex];
        
        // 防呆：如果取不到玩家
        if (!currentPlayer) {
            gameState.turnIndex = 0;
            attempts++;
            continue;
        }

        if (currentPlayer.position >= 21) {
            // 這位跑完了，換下一位
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            attempts++;
        } else {
            // 找到可以行動的玩家了
            io.emit('update_turn', { 
                turnIndex: gameState.turnIndex, 
                nextPlayerId: currentPlayer.id 
            });
            return;
        }
    }

    // 如果所有人都跑完了 (attempts 超過人數)
    // 雖然理論上 action_roll 會處理結束，但這裡做個保險
    if (gameState.rankings.length > 0) {
        gameState.status = 'ENDED';
        io.emit('game_over', { rankings: gameState.rankings });
        io.emit('update_game_state', gameState);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});const express = require('express');
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

// 角色池 (確保不重複)
const CHAR_POOL = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33', '#FF8C33', '#8C33FF'];

// 分配角色的輔助函式
function assignAvatar(existingPlayers) {
    const usedChars = existingPlayers.map(p => p.avatarChar);
    return CHAR_POOL.find(c => !usedChars.includes(c)) || 'a';
}

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

        // 初始化遊戲狀態
        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.rankings = []; 
        gameState.players.forEach(p => p.position = 0);

        // 廣播抽籤結果 (這裡僅供顯示，實際順序依照加入順序)
        const displayOrder = [...gameState.players].sort((a, b) => b.initRoll - a.initRoll);
        io.emit('show_initiative', displayOrder);

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
        gameState.players.forEach(p => { p.position = 0; p.initRoll = 0; });

        io.emit('game_reset_positions');
        io.emit('update_game_state', gameState);
        io.emit('update_player_list', gameState.players);
    });

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
            isReady: true,
            initRoll: Math.floor(Math.random() * 100) + 1 // 預先骰好
        };

        gameState.players.push(newPlayer);
        // 確保依照加入時間排序 (避免順序跳動)
        gameState.players.sort((a, b) => a.joinTime - b.joinTime);

        io.emit('update_player_list', gameState.players);
    });

    socket.on('action_roll', () => {
        const currentPlayer = gameState.players[gameState.turnIndex];
        
        // 安全檢查：如果玩家不存在 (可能剛斷線)，重新計算回合
        if (!currentPlayer) {
            notifyNextTurn();
            return;
        }
        if (currentPlayer.id !== socket.id) return;
        if (gameState.status !== 'PLAYING') return;

        const roll = Math.floor(Math.random() * 6) + 1;
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

    // --- 🛠️ 關鍵修正：斷線處理邏輯 ---
    socket.on('disconnect', () => {
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
            const player = gameState.players[playerIndex];
            console.log(`Player disconnected: ${player.name}`);

            if (gameState.status === 'LOBBY') {
                // 大廳狀態：直接移除
                gameState.players.splice(playerIndex, 1);
                io.emit('update_player_list', gameState.players);
            } 
            else if (gameState.status === 'PLAYING') {
                // 遊戲中狀態：
                const isCurrentTurn = (playerIndex === gameState.turnIndex);
                
                // 1. 移除玩家
                gameState.players.splice(playerIndex, 1);

                // 2. 修正 turnIndex
                // 如果斷線的人在當前操作者之前，當前操作者的 index 會往前移，所以 turnIndex 要 -1
                if (playerIndex < gameState.turnIndex) {
                    gameState.turnIndex--;
                }
                
                // 防止 index 破表
                if (gameState.turnIndex >= gameState.players.length) {
                    gameState.turnIndex = 0;
                }

                // 3. 更新前端畫面 (移除該角色)
                io.emit('update_player_list', gameState.players);

                // 4. 如果人數歸零，重置
                if (gameState.players.length === 0) {
                    gameState.status = 'LOBBY';
                    gameState.turnIndex = 0;
                    gameState.rankings = [];
                    io.emit('admin_reset_game'); // 或回到初始狀態
                    io.emit('update_game_state', gameState);
                    return;
                }

                // 5. 如果斷線的人正好是「當前操作者」，必須強制切換到下一位
                if (isCurrentTurn) {
                    // 稍微延遲一下，避免前端渲染衝突
                    setTimeout(() => {
                        notifyNextTurn();
                    }, 500);
                }
            }
        }
    });
});

function notifyNextTurn() {
    if (gameState.status === 'ENDED') return;
    if (gameState.players.length === 0) return;

    // 確保 Index 在範圍內
    if (gameState.turnIndex >= gameState.players.length) {
        gameState.turnIndex = 0;
    }

    let attempts = 0;
    const maxAttempts = gameState.players.length + 1;

    // 尋找下一位還沒跑完的玩家
    while (attempts < maxAttempts) {
        const currentPlayer = gameState.players[gameState.turnIndex];
        
        // 防呆：如果取不到玩家
        if (!currentPlayer) {
            gameState.turnIndex = 0;
            attempts++;
            continue;
        }

        if (currentPlayer.position >= 21) {
            // 這位跑完了，換下一位
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            attempts++;
        } else {
            // 找到可以行動的玩家了
            io.emit('update_turn', { 
                turnIndex: gameState.turnIndex, 
                nextPlayerId: currentPlayer.id 
            });
            return;
        }
    }

    // 如果所有人都跑完了 (attempts 超過人數)
    // 雖然理論上 action_roll 會處理結束，但這裡做個保險
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