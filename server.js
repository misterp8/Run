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

// 角色池 (15種) 與 顏色池
const CHAR_POOL = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33', '#FF8C33', '#8C33FF'];

// 分配沒被用過的角色
function assignAvatar(existingPlayers) {
    const usedChars = existingPlayers.map(p => p.avatarChar);
    return CHAR_POOL.find(c => !usedChars.includes(c)) || 'a';
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 老師端
    socket.on('admin_login', () => {
        socket.join('admin');
        socket.emit('update_game_state', gameState);
        socket.emit('update_player_list', gameState.players);
    });

    socket.on('admin_start_game', () => {
        if (gameState.players.length < 1) return;

        // 設定初始狀態
        gameState.status = 'PLAYING';
        gameState.turnIndex = 0; // 從第 0 位 (跑道1) 開始
        gameState.rankings = []; 
        gameState.players.forEach(p => p.position = 0);

        // 廣播開始 (前端顯示動畫)
        io.emit('show_initiative', gameState.players);

        // 3秒後正式解鎖操作
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
        io.emit('update_player_list', []);
        io.emit('update_game_state', gameState); 
        io.emit('force_reload');
    });

    // 學生端
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

        // 核心修正：由 Server 分配唯一角色
        const assignedChar = assignAvatar(gameState.players);

        const newPlayer = {
            id: socket.id,
            name: playerName,
            color: COLORS[gameState.players.length % COLORS.length],
            avatarChar: assignedChar, // 綁定角色
            position: 0,
            isReady: true
        };

        gameState.players.push(newPlayer);
        // 不做額外排序，依照加入順序就是跑道順序
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

        // 廣播移動
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

                // 判斷結束條件
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
                    // 這裡不直接結束，讓前端動畫跑完
                    io.emit('game_over', { rankings: gameState.rankings });
                    io.emit('update_game_state', gameState);
                } else {
                    io.emit('player_finished_rank', { player: currentPlayer, rank: rank });
                    notifyNextTurn();
                }
            }
        } else {
            // 下一位
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
    // 尋找下一位還沒到終點的人
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
    if (nextPlayer.position >= 21) return; // 大家都跑完了
    io.emit('update_turn', { turnIndex: gameState.turnIndex, nextPlayerId: nextPlayer.id });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});