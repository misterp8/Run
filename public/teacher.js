// 請將此處改為你的 Render 網址
const socket = io('https://run-vjk6.onrender.com'); 

const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');
const adminPanel = document.getElementById('admin-panel');
const liveMsg = document.getElementById('live-msg');

// 新增：排名清單元素
const initiativeListDiv = document.getElementById('initiative-list');
const initiativeUl = document.getElementById('initiative-ul');

// Modal 相關
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const btnConfirm = document.getElementById('modal-btn-confirm');
const btnCancel = document.getElementById('modal-btn-cancel');

function showModal(title, text, isConfirm = false, onConfirm = null) {
    modalTitle.innerText = title;
    modalBody.innerText = text;
    modalOverlay.classList.remove('hidden');

    if (isConfirm) {
        btnConfirm.innerText = "確定執行";
        btnConfirm.classList.add('danger'); 
        btnCancel.classList.remove('hidden');
        btnConfirm.onclick = () => {
            if (onConfirm) onConfirm();
            closeModal();
        };
        btnCancel.onclick = closeModal;
    } else {
        btnConfirm.innerText = "知道了";
        btnConfirm.classList.remove('danger');
        btnCancel.classList.add('hidden');
        btnConfirm.onclick = closeModal;
    }
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}

// 連線狀態
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

socket.on('update_player_list', (players) => {
    updateView(players);
});

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
    
    // 如果重置回 Lobby，隱藏排名清單
    if (gameState.status === 'LOBBY') {
        initiativeListDiv.style.display = 'none';
    }
});

// --- 👇 重點修正：顯示順序清單 (直接顯示在頁面，不彈窗) 👇 ---
socket.on('show_initiative', (sortedPlayers) => {
    // 1. 顯示清單區域
    initiativeListDiv.style.display = 'block';
    initiativeUl.innerHTML = ''; // 清空舊資料
    
    // 2. 填入列表
    sortedPlayers.forEach((p, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>第 ${index + 1} 順位</strong>: ${p.name} <span style="color:#ffc107">(擲出 ${p.initRoll} 點)</span>`;
        initiativeUl.appendChild(li);
    });

    // 3. 更新上方即時訊息
    if(liveMsg) liveMsg.innerText = "🎲 擲骰決定順序中... (3秒後開始)";
});

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
    liveMsg.innerText = `🏆 冠軍：${winner.name}`;
    showModal("🏁 比賽結束", `恭喜 ${winner.name} 獲得冠軍！`);
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    startBtn.innerText = "⏳ 啟動中...";
    socket.emit('admin_start_game');
});

resetBtn.addEventListener('click', () => {
    showModal(
        "危險操作", 
        "確定要重置遊戲並踢除所有玩家嗎？\n(這將無法復原)", 
        true, 
        () => {
            socket.emit('admin_reset_game');
            trackContainer.innerHTML = ''; 
            playerCountSpan.innerText = 0;
            if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
            initiativeListDiv.style.display = 'none'; // 重置時隱藏清單
        }
    );
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