// 強制連線到你的 Render 網址 (確保網址無誤)
const socket = io('https://run-vjk6.onrender.com'); 

const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');
const adminPanel = document.getElementById('admin-panel');

// --- 新增：連線狀態顯示 (方便除錯) ---
const statusDiv = document.createElement('div');
statusDiv.style.padding = "5px";
statusDiv.style.marginBottom = "10px";
statusDiv.style.fontWeight = "bold";
adminPanel.prepend(statusDiv); // 插在面板最上方

// 1. 監聽連線狀態 (修正：確保連上才登入)
socket.on('connect', () => {
    statusDiv.innerText = "🟢 伺服器已連線";
    statusDiv.style.color = "#28a745"; // 綠色
    console.log('Connected! Sending admin_login...');
    
    // 連線成功後，主動告訴 Server 我是老師，請給我最新資料
    socket.emit('admin_login');
});

socket.on('disconnect', () => {
    statusDiv.innerText = "🔴 與伺服器斷線 (嘗試重連中...)";
    statusDiv.style.color = "#dc3545"; // 紅色
});

// 2. 接收資料更新
socket.on('update_player_list', (players) => {
    console.log('收到玩家列表更新:', players); // 除錯用
    updateView(players);
});

socket.on('update_game_state', (gameState) => {
    console.log('收到遊戲狀態:', gameState); // 除錯用
    updateView(gameState.players);
});

// 3. 遊戲邏輯監聽
socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatar = document.getElementById(`avatar-${playerId}`);
    if (avatar) {
        const percent = (newPos / 22) * 100;
        avatar.style.left = `${percent}%`;
    }
});

socket.on('game_over', ({ winner }) => {
    alert(`🏁 比賽結束！冠軍是：${winner.name}`);
});

// 4. 按鈕指令
startBtn.addEventListener('click', () => {
    socket.emit('admin_start_game');
});

resetBtn.addEventListener('click', () => {
    if(confirm('確定要踢除所有玩家並重置嗎？')) {
        console.log('Sending reset command...');
        socket.emit('admin_reset_game');
        // 前端自己先清空，等待 Server 確認
        trackContainer.innerHTML = ''; 
        playerCountSpan.innerText = 0;
    }
});

// 輔助函式
function updateView(players) {
    // 防呆：如果 players 是 undefined，給它空陣列
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