// 請將此處改為你的 Render 網址
const socket = io('https://run-vjk6.onrender.com'); 

const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');
const adminPanel = document.getElementById('admin-panel');
const liveMsg = document.getElementById('live-msg');

// 連線狀態顯示
const statusDiv = document.createElement('div');
statusDiv.style.padding = "5px";
statusDiv.style.marginBottom = "10px";
statusDiv.style.fontWeight = "bold";
adminPanel.prepend(statusDiv);

socket.on('connect', () => {
    statusDiv.innerText = "🟢 伺服器已連線";
    statusDiv.style.color = "#28a745";
    socket.emit('admin_login');
});

socket.on('disconnect', () => {
    statusDiv.innerText = "🔴 與伺服器斷線";
    statusDiv.style.color = "#dc3545";
});

// 接收玩家更新
socket.on('update_player_list', (players) => {
    updateView(players);
});

// 接收遊戲狀態 (處理按鈕鎖定)
socket.on('update_game_state', (gameState) => {
    updateView(gameState.players);

    if (gameState.status === 'PLAYING') {
        startBtn.disabled = true;
        startBtn.innerText = "⛔ 遊戲進行中";
        startBtn.style.cursor = "not-allowed";
        startBtn.style.backgroundColor = "#6c757d";
    } else {
        startBtn.disabled = false;
        startBtn.innerText = "🚀 開始遊戲";
        startBtn.style.cursor = "pointer";
        startBtn.style.backgroundColor = "#28a745";
    }
});

socket.on('show_initiative', (sortedPlayers) => {
    let msg = "🎲 初始擲骰順序決定！\n\n";
    sortedPlayers.forEach((p, index) => {
        msg += `第 ${index + 1} 位: ${p.name} (擲出 ${p.initRoll} 點)\n`;
    });
    msg += "\n(遊戲將在 3 秒後自動開始)";
    alert(msg);
});

// 玩家移動 (含延遲顯示)
socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatar = document.getElementById(`avatar-${playerId}`);
    const playerName = avatar ? avatar.innerText : '未知玩家';

    if (liveMsg) {
        liveMsg.innerText = `🎲 ${playerName} 擲出了 ${roll} 點！`;
        liveMsg.style.color = "#d63384";
    }

    setTimeout(() => {
        if (avatar) {
            const percent = (newPos / 22) * 100;
            avatar.style.left = `${percent}%`;
            if (liveMsg) liveMsg.style.color = "#333"; 
        }
    }, 1000);
});

socket.on('game_over', ({ winner }) => {
    alert(`🏁 比賽結束！冠軍是：${winner.name}`);
    liveMsg.innerText = `🏆 冠軍：${winner.name}`;
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    startBtn.innerText = "⏳ 啟動中...";
    socket.emit('admin_start_game');
});

resetBtn.addEventListener('click', () => {
    if(confirm('確定要踢除所有玩家並重置嗎？')) {
        socket.emit('admin_reset_game');
        trackContainer.innerHTML = ''; 
        playerCountSpan.innerText = 0;
        if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
    }
});

function updateView(players) {
    if (!players) players = [];
    playerCountSpan.innerText = players.length;
    trackContainer.innerHTML = ''; 

    players.forEach(p => {
        const row = document.createElement('div');
        row.className = 'track-row';
        for(let i=0; i<22; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            row.appendChild(cell);
        }
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.id = `avatar-${p.id}`;
        avatar.innerText = p.name;
        avatar.style.backgroundColor = p.color;
        
        const percent = (p.position / 22) * 100;
        avatar.style.left = `${percent}%`;

        row.appendChild(avatar);
        trackContainer.appendChild(row);
    });
}