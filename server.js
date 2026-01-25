const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 設定靜態檔案資料夾 (public)
app.use(express.static(path.join(__dirname, 'public')));

// 4. 資料結構 (Data Models)
let gameState = {
    status: 'LOBBY', // 'LOBBY' | 'PLAYING' | 'ENDED'
    turnIndex: 0,    // 當前輪到的玩家索引
    players: []      // 玩家陣列
};

// 顏色庫，自動分配給玩家
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33', '#FF8C33', '#8C33FF', '#FF338C', '#33FF8C'];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // --- 老師端邏輯 (Admin) ---
    socket.on('admin_login', () => {
        socket.join('admin'); // 加入管理員群組
        // 傳送當前狀態給老師
        socket.emit('update_game_state', gameState); 
    });

    socket.on('admin_start_game', () => {
        if (gameState.players.length < 1) return; 
        
        // --- 新增邏輯：決定先後順序 ---
        // 1. 幫每位玩家擲骰子 (1-100，避免太容易平手)
        gameState.players.forEach(p => {
            p.initRoll = Math.floor(Math.random() * 100) + 1;
        });

        // 2. 依照點數由大到小排序 (點數大的排前面)
        gameState.players.sort((a, b) => b.initRoll - a.initRoll);

        // 3. 重置遊戲狀態
        gameState.status = 'PLAYING';
        gameState.turnIndex = 0; // 排序後的第一個人 (Index 0) 先開始
        gameState.players.forEach(p => p.position = 0);

        // 4. 廣播順序結果 (讓前端顯示動畫或訊息)
        io.emit('show_initiative', gameState.players);

        // 5. 延遲一下下再正式開始 (讓大家看清楚順序)
        setTimeout(() => {
            io.emit('game_start');
            io.emit('update_game_state', gameState); // 更新排序後的列表
            io.emit('system_message', '遊戲開始！由點數最高者先行！');
            notifyNextTurn();
        }, 3000); // 3秒後正式開始
    });

socket.on('admin_reset_game', () => {
        console.log('Admin requested reset.'); // 讓你在 Render Logs 看到紀錄
        
        gameState.status = 'LOBBY';
        gameState.turnIndex = 0;
        gameState.players = []; // 清空陣列
        
        // 重要：這兩行順序很重要
        io.emit('update_player_list', []); // 先告訴老師清空列表
        io.emit('force_reload');           // 再叫學生重整
        
        console.log('Game reset complete.');
    });

    // --- 學生端邏輯 (Player) ---
    socket.on('player_join', (playerName) => {
        // 基本狀態檢查
        if (gameState.status !== 'LOBBY') {
            socket.emit('error_msg', '遊戲進行中，無法加入');
            return;
        }
        if (gameState.players.length >= 10) {
            socket.emit('error_msg', '房間已滿 (Max 10)');
            return;
        }
        
        // --- 新增：防呆檢查 (名字必填) ---
        if (!playerName || playerName.trim() === "") {
            socket.emit('error_msg', '請輸入名字！');
            return;
        }

        // --- 新增：檢查名字是否重複 ---
        const isNameTaken = gameState.players.some(p => p.name === playerName);
        if (isNameTaken) {
            socket.emit('error_msg', `名字「${playerName}」已經有人用了，請換一個！`);
            return;
        }

        // 建立新玩家物件
        const newPlayer = {
            id: socket.id,
            name: playerName, // 已經確認不重複
            color: COLORS[gameState.players.length % COLORS.length],
            position: 0,
            isReady: true,
            initRoll: 0 // 初始化一下
        };

        gameState.players.push(newPlayer);
        io.emit('update_player_list', gameState.players);
    });

    // --- 遊戲核心循環 (Game Loop) ---
    socket.on('action_roll', () => {
        // 1. 驗證是否為該玩家的回合
        const currentPlayer = gameState.players[gameState.turnIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) return;
        if (gameState.status !== 'PLAYING') return;

        // 2. Server 計算骰子 (1~6)
        const roll = Math.floor(Math.random() * 6) + 1;
        const oldPos = currentPlayer.position;
        let newPos = oldPos + roll;

        // 3. 邊界檢查 (終點是 Index 21)
        if (newPos >= 21) {
            newPos = 21;
        }

        currentPlayer.position = newPos;

        // 4. 廣播移動結果
        io.emit('player_moved', {
            playerId: currentPlayer.id,
            roll: roll,
            newPos: newPos
        });

        // 5. 判斷勝負 或 換下一位
        if (newPos === 21) {
            gameState.status = 'ENDED';
            io.emit('game_over', { winner: currentPlayer });
        } else {
            // 換下一位
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            notifyNextTurn();
        }
    });

    // 斷線處理
    socket.on('disconnect', () => {
        // 若在 LOBBY 階段有人離開，移除該玩家
        if (gameState.status === 'LOBBY') {
            gameState.players = gameState.players.filter(p => p.id !== socket.id);
            io.emit('update_player_list', gameState.players);
        }
        // 若在遊戲中斷線，暫時保留 Ghost 或略過 (原型先不做複雜處理)
    });
});

// 輔助函式：通知下一位玩家
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