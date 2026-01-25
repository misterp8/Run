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
// --- 新增：按鈕防呆邏輯 ---
    // 檢查伺服器回傳的狀態，如果是 'PLAYING' (遊戲中)，就鎖住按鈕
    if (gameState.status === 'PLAYING') {
        startBtn.disabled = true;
        startBtn.innerText = "⛔ 遊戲進行中";
        startBtn.style.cursor = "not-allowed";
        startBtn.style.backgroundColor = "#6c757d"; // 變灰色
    } else {
        // 如果是 'LOBBY' 或 'ENDED'，解鎖按鈕
        startBtn.disabled = false;
        startBtn.innerText = "🚀 開始遊戲";
        startBtn.style.cursor = "pointer";
        startBtn.style.backgroundColor = "#28a745"; // 變回綠色
    }
});

// 3. 遊戲邏輯監聽
// 取得訊息元素
const liveMsg = document.getElementById('live-msg');

socket.on('player_moved', ({ playerId, roll, newPos }) => {
    // 1. 先找出是誰 (從畫面上的 Avatar 抓名字最快)
    const avatar = document.getElementById(`avatar-${playerId}`);
    const playerName = avatar ? avatar.innerText : '未知玩家';

    // 2. 立刻顯示擲骰結果
    if (liveMsg) {
        liveMsg.innerText = `🎲 ${playerName} 擲出了 ${roll} 點！`;
        liveMsg.style.color = "#d63384"; // 用亮色強調一下
    }

    // 3. 延遲 1 秒後再移動 (製造緊張感)
    setTimeout(() => {
        if (avatar) {
            const percent = (newPos / 22) * 100;
            avatar.style.left = `${percent}%`;
            
            // 移動完把顏色變回來 (選擇性)
            if (liveMsg) liveMsg.style.color = "#333"; 
        }
    }, 1000);
});

socket.on('game_over', ({ winner }) => {
    alert(`🏁 比賽結束！冠軍是：${winner.name}`);
    
    // 遊戲結束，讓老師可以重新開始下一局
    startBtn.disabled = false;
    startBtn.innerText = "🚀 開始新的一局";
    startBtn.style.backgroundColor = "#28a745";
});

// --- 新增：顯示搶先權結果 (老師端版本) ---
socket.on('show_initiative', (sortedPlayers) => {
    let msg = "🎲 初始擲骰順序決定！\n\n";
    
    // 把所有玩家的點數列出來
    sortedPlayers.forEach((p, index) => {
        msg += `第 ${index + 1} 位: ${p.name} (擲出 ${p.initRoll} 點)\n`;
    });
    
    msg += "\n(遊戲將在 3 秒後自動開始)";
    
    alert(msg); // 老師會看到完整的排名清單
});

// 4. 按鈕指令
startBtn.addEventListener('click', () => {
    // 按下瞬間立刻鎖住，給使用者回饋
    startBtn.disabled = true;
    startBtn.innerText = "⏳ 啟動中...";
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