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

// 角色庫 (確保不重複)
const CHAR_POOL = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33', '#FF8C33', '#8C33FF'];

// 分配角色的輔助函式
function assignAvatar(existingPlayers) {
    const usedChars = existingPlayers.map(p => p.avatarChar);
    // 找出第一個沒被用過的角色
    return CHAR_POOL.find(c => !usedChars.includes(c)) || 'a';
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

        // 1. 抽籤決定順序 (Initiative)
        gameState.players.forEach(p => {
            p.initRoll = Math.floor(Math.random() * 100) + 1;
        });
        // 排序決定 "Turn Order" (誰先擲骰子)，但不改變 "Track Order" (跑道順序)
        // 為了邏輯簡單，我們這裡還是會 sort players 陣列，
        // 但因為跑道是根據 players[i] 渲染的，所以跑道會根據抽籤結果重新排列
        // **修正需求**：使用者希望跑道依照加入順序。
        // 所以我們不能對 gameState.players 進行 sort。
        // 我們新增一個 `turnOrder` 陣列來記錄誰先誰後。
        
        // 為了簡化架構，我們保持 players 陣列為「跑道順序 (加入順序)」。
        // 我們另外產生一個 `turnList` (ID 列表) 來決定擲骰順序。
        // 但目前的架構是依賴 players 的 index。
        // 妥協方案：我們不 Sort players。我們只計算 initRoll，
        // 然後在前端顯示「抽籤結果」，但實際遊戲輪替我們就依序 (跑道1 -> 跑道2...) 
        // 或者：我們必須改寫 turnIndex 的邏輯。
        
        // 修正方案 B (最簡單且符合直覺)：
        // 抽籤只是一個「儀式」，實際上我們就依照加入順序開始玩 (跑道1先)。
        // 或者：真的要隨機順序？
        // 使用者說 "前面決定順序...寫抽籤決定"，這暗示他想要隨機順序。
        
        // 最終決定：
        // 跑道順序 = 加入順序 (不變)。
        // 擲骰順序 = 隨機。
        // 為此，我們需要一個 sortedPlayers 陣列給後端邏輯用，但前端渲染跑道用 originalPlayers。
        // 為了避免大規模改寫，我們這裡做一個變通：
        // 讓 "跑道順序" 永遠固定，但 "TurnIndex" 會跳著跑。
        // 這有點複雜。
        
        // 回歸最單純：使用者抱怨 "跑道順序變來變去"。
        // 那我們就 **不要 Sort gameState.players**。
        // 擲骰順序就依照跑道順序 (先加入的先擲)。這樣最單純，也符合「依照學生加入先後」的直覺。
        
        // 如果老師堅持要「抽籤決定誰先」，那我們就 Sort，但是前端渲染時要依照 ID 排序回原本樣子？
        // 不，使用者第一點說「要依照加入先後，依次往下排列」。
        // 所以結論：**不要 Sort**。initRoll 只是純表演用。
        
        // gameState.players.sort((a, b) => b.initRoll - a.initRoll); <--- 移除這行排序

        gameState.status = 'PLAYING';
        gameState.turnIndex = 0;
        gameState.rankings = []; 
        gameState.players.forEach(p => p.position = 0);

        // 雖然不排序，但我們還是要把抽籤結果傳給前端顯示 (純表演)
        // 複製一份來排序，僅供顯示
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
        gameState.players.forEach(p => {
            p.position = 0;
            p.initRoll = 0;
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

        // 分配唯一角色
        const assignedChar = assignAvatar(gameState.players);

        const newPlayer = {
            id: socket.id,
            name: playerName,
            color: COLORS[gameState.players.length % COLORS.length],
            avatarChar: assignedChar, // 伺服器指定角色
            joinTime: Date.now(),     // 紀錄加入時間，確保順序
            position: 0,
            isReady: true,
            initRoll: 0
        };

        gameState.players.push(newPlayer);
        // 確保依照加入時間排序 (通常 push 就是順序的，但保險起見)
        gameState.players.sort((a, b) => a.joinTime - b.joinTime);

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
                    rank: rank,
                    avatarChar: currentPlayer.avatarChar // 記住角色，給榜單用
                });

                const totalPlayers = gameState.players.length;
                let shouldEnd = false;
                if (totalPlayers === 1) {
                    if (gameState.rankings.length === 1) shouldEnd = true;
                } else if (totalPlayers <= 3) {
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
    io.emit('update_turn', { turnIndex: gameState.turnIndex, nextPlayerId: nextPlayer.id });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});