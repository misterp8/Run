// 請將此處改為你的 Render 網址
const socket = io('https://run-vjk6.onrender.com'); 

const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');
const adminPanel = document.getElementById('admin-panel');
const liveMsg = document.getElementById('live-msg');

// Modal 相關
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const btnConfirm = document.getElementById('modal-btn-confirm');
const btnCancel = document.getElementById('modal-btn-cancel');

// --- 老師端專用 Modal 函式 (支援 確認/取消) ---
function showModal(title, text, isConfirm = false, onConfirm = null) {
    modalTitle.innerText = title;
    modalBody.innerText = text;
    modalOverlay.classList.remove('hidden');

    if (isConfirm) {
        // 顯示取消按鈕，並設定危險顏色
        btnConfirm.innerText = "確定執行";
        btnConfirm.classList.add('danger'); 
        btnCancel.classList.remove('hidden');
        
        // 綁定事件
        btnConfirm.onclick = () => {
            if (onConfirm) onConfirm();
            closeModal();
        };
        btnCancel.onclick = closeModal;
    } else {
        // 一般訊息模式
        btnConfirm.innerText = "知道了";
        btnConfirm.classList.remove('danger');
        btnCancel.classList.add('hidden');
        btnConfirm.onclick = closeModal;
    }
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}


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
});

// 顯示順序清單 (使用 Modal)
socket.on('show_initiative', (sortedPlayers) => {
    let msg = "";
    sortedPlayers.forEach((p, index) => {
        msg += `第 ${index + 1} 位: ${p.name} (擲出 ${p.initRoll} 點)\n`;
    });
    msg += "\n(遊戲將在 3 秒後自動開始)";
    
    // 這裡我們不需傳入 callback，只顯示資訊
    showModal("🎲 擲骰順序結果", msg);
    
    // 3秒後自動關閉，避免擋住跑道
    setTimeout(closeModal, 3000);
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

// 重置按鈕改為使用自訂 Modal，不再用瀏覽器原生 confirm
resetBtn.addEventListener('click', () => {
    showModal(
        "危險操作", 
        "確定要重置遊戲並踢除所有玩家嗎？\n(這將無法復原)", 
        true, // 是確認框
        () => { // 按下確定的 callback
            socket.emit('admin_reset_game');
            trackContainer.innerHTML = ''; 
            playerCountSpan.innerText = 0;
            if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
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