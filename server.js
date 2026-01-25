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
    rankings: [] // 新增：用來存儲完賽排名的陣列 [{name, id, rank}, ...]
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
        gameState.rankings = []; // 清空排名
        gameState.players.forEach(p => p.position = 0);

        io.emit('show_initiative', gameState.players);

        setTimeout(() => {
            io.emit('game_start');
            io.emit('update_game_state', gameState);
            notifyNextTurn();
        }, 3000);
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

    // --- 核心遊戲循環 (更新版) ---
    socket.on('action_roll', () => {
        const currentPlayer = gameState.players[gameState.turnIndex];
        
        // 基本驗證
        if (!currentPlayer || currentPlayer.id !== socket.id) return;
        if (gameState.status !== 'PLAYING') return;

        // 運算
        const roll = Math.floor(Math.random() * 6) + 1;
        const oldPos = currentPlayer.position;
        let newPos = oldPos + roll;

        if (newPos >= 21) newPos = 21; // 終點
        currentPlayer.position = newPos;

        // 1. 廣播移動 (先讓大家看到動畫)
        io.emit('player_moved', {
            playerId: currentPlayer.id,
            roll: roll,
            newPos: newPos
        });

        // 2. 判斷是否抵達終點
        if (newPos === 21) {
            // 檢查是否已經在排名裡 (防止重複)
            const alreadyFinished = gameState.rankings.find(r => r.id === currentPlayer.id);
            
            if (!alreadyFinished) {
                // 加入排名
                const rank = gameState.rankings.length + 1;
                gameState.rankings.push({ 
                    id: currentPlayer.id, 
                    name: currentPlayer.name, 
                    rank: rank 
                });

                // 判斷遊戲結束條件
                const totalPlayers = gameState.players.length;
                let shouldEnd = false;

                if (totalPlayers <= 3) {
                    // 3人以下，第一名出現就結束
                    if (gameState.rankings.length >= 1) shouldEnd = true;
                } else {
                    // 超過3人，取前3名才結束
                    // (但也可能發生所有人都跑完了，避免卡死)
                    if (gameState.rankings.length >= 3 || gameState.rankings.length === totalPlayers) {
                        shouldEnd = true;
                    }
                }

                if (shouldEnd) {
                    gameState.status = 'ENDED';
                    // 這裡不直接 emit game_over，留給前端一點時間跑動畫
                    // 我們將 rankings 傳給前端，前端會自己決定何時跳窗
                    io.emit('game_over', { rankings: gameState.rankings });
                    io.emit('update_game_state', gameState);
                } else {
                    // 遊戲繼續，但這位玩家完成了
                    io.emit('player_finished_rank', { 
                        player: currentPlayer, 
                        rank: rank 
                    });
                    
                    // 換下一位
                    notifyNextTurn();
                }
            }
        } else {
            // 沒到終點，正常換下一位
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

// 智慧型換位：跳過已經抵達終點的人
function notifyNextTurn() {
    // 防止無窮迴圈 (如果大家都跑完了)
    if (gameState.status === 'ENDED') return;
    if (gameState.players.length === 0) return;

    let attempts = 0;
    // 尋找下一個 position < 21 的玩家
    while (attempts < gameState.players.length) {
        // 先將 index + 1 (因為上一輪剛結束)
        // 注意：如果是 action_roll 呼叫的，那邊已經+1了，但這裡為了保險起見，我們重新檢查
        // 為了邏輯簡單，我們假設 server.js 的 action_roll 裡的 turnIndex 已經指到「原本的下一位」
        // 我們要從那位開始檢查，如果那位已經完賽，就再 +1
        
        // 修正：action_roll 裡面有兩條路，一條是沒完賽(index已+1)，一條是完賽(需要找下一位)
        // 為了統一，我們在這裡做檢查比較好。
        // 但 action_roll 裡如果是「完賽且遊戲未結束」，它沒有執行 index + 1
        // 所以如果完賽了，我們要在這裡讓 index + 1
        
        const currentPlayer = gameState.players[gameState.turnIndex];
        
        if (currentPlayer.position >= 21) {
            // 這位已經完了，找下一位
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            attempts++;
        } else {
            // 這位還沒完，就是他了
            break;
        }
    }

    const nextPlayer = gameState.players[gameState.turnIndex];
    
    // 如果找了一圈大家都完了 (理論上會被 shouldEnd 擋下，但防呆)
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