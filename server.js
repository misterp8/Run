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
    // 新增遊戲設定紀錄
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

    // --- 修改：接收遊戲設定參數 (options) ---
    socket.on('admin_start_game', (options) => {
        if (gameState.players.length < 1) return;
        
        // 1. 套用設定
        gameState.config.enableTraps = options?.enableTraps || false;
        gameState.config.enableFate = options?.enableFate || false;
        
        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.rankings = []; 
        globalLastRoll = 0; 

        // 2. 初始化玩家位置與特殊格子
        gameState.players.forEach(p => { 
            p.position = 0;
            p.trapIndex = -1;
            p.fateIndex = -1;

            // 生成陷阱 (排除起點0 與 終點21，範圍 1-20)
            if (gameState.config.enableTraps) {
                // 為了不讓陷阱太靠近起點導致一開始就死，我們設範圍 3-20
                p.trapIndex = Math.floor(Math.random() * 18) + 3; 
            }

            // 生成命運問號 (範圍 2-17，即終點前4格)
            if (gameState.config.enableFate) {
                let fIdx;
                // 防呆：確保命運格不跟陷阱格重疊
                let attempts = 0;
                do {
                    fIdx = Math.floor(Math.random() * 16) + 2; // 2 ~ 17
                    attempts++;
                } while (fIdx === p.trapIndex && attempts < 10);
                
                // 如果運氣太差一直重疊(機率極低)，就優先保留陷阱，取消命運，或者硬蓋過去。
                // 這裡選擇：如果重疊就不設命運，避免邏輯打架
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
        // 重置時清除特殊格子設定，等待下一次 Start 重新生成
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
            trapIndex: -1, // 預設無
            fateIndex: -1, // 預設無
            isReady: true
        };

        gameState.players.push(newPlayer);
        gameState.players.sort((a, b) => a.joinTime - b.joinTime); 

        io.emit('update_player_list', gameState.players);
    });

    // --- 修改：擲骰邏輯與事件觸發 ---
    socket.on('action_roll', () => {
        const currentPlayer = gameState.players[gameState.turnIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) return;
        if (gameState.status !== 'PLAYING') return;

        // 骰子演算法 (防連續)
        let roll = Math.floor(Math.random() * 6) + 1;
        if (roll === globalLastRoll) {
            if (Math.random() > 0.3) {
                roll = Math.floor(Math.random() * 6) + 1;
            }
        }
        globalLastRoll = roll; 

        // 1. 計算「初步落點」
        let tempPos = currentPlayer.position + roll;
        if (tempPos >= 21) tempPos = 21; 

        let finalPos = tempPos;
        let triggerType = 'NORMAL'; // NORMAL, TRAP, FATE
        let fateResult = 0; // 用於儲存命運卡抽到的步數

        // 2. 判斷觸發事件 (優先級：陷阱 > 命運 > 一般)
        // 注意：這裡假設同一格不會同時是陷阱和命運 (在 start_game 已做防呆)
        
        if (gameState.config.enableTraps && tempPos === currentPlayer.trapIndex) {
            // --- 踩到陷阱 ---
            triggerType = 'TRAP';
            finalPos = 0; // 強制回到起點
        } 
        else if (gameState.config.enableFate && tempPos === currentPlayer.fateIndex) {
            // --- 踩到機會命運 ---
            triggerType = 'FATE';
            // 隨機抽取: -3, -2, -1, 1, 2, 3 (排除 0)
            const fateOptions = [-3, -2, -1, 1, 2, 3];
            fateResult = fateOptions[Math.floor(Math.random() * fateOptions.length)];
            
            // 計算命運後的最終位置
            finalPos = tempPos + fateResult;
            
            // 邊界檢查
            if (finalPos < 0) finalPos = 0;
            if (finalPos > 21) finalPos = 21;

            // 策略決定：命運移動後的落點「免疫」陷阱，避免無限迴圈或過於殘忍
        }

        // 3. 更新玩家實際位置
        currentPlayer.position = finalPos;

        // 4. 發送結果給前端
        // 注意：我們會多傳 initialLandPos (tempPos)，讓前端可以先演出「走到陷阱/問號」的動畫
        // 然後再根據 triggerType 演出後續 (掉落 或 抽牌移動)
        io.emit('player_moved', {
            playerId: currentPlayer.id,
            roll: roll,
            newPos: finalPos,       // 最終位置
            initialLandPos: tempPos,// 初步落點 (用於觸發視覺)
            triggerType: triggerType,
            fateResult: fateResult
        });

        // 5. 判斷結束或換人
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