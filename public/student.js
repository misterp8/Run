// 請將此處改為你的 Render 網址
const socket = io('https://run-vjk6.onrender.com'); 

// DOM 元素
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('join-btn');
const waitingMsg = document.getElementById('waiting-msg');
const playerListUl = document.getElementById('player-list-ul');
const trackContainer = document.getElementById('track-container');
const rollBtn = document.getElementById('roll-btn');
const gameMsg = document.getElementById('game-msg');
const loginError = document.getElementById('login-error'); // 錯誤訊息區

// Modal 元素
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalBtn = document.getElementById('modal-btn');

let myId = null;
let isAnimating = false; 

// --- 輔助函式：顯示 Modal ---
function showModal(title, text, btnText = "確定", autoCloseMs = 0) {
    modalTitle.innerText = title;
    modalBody.innerText = text;
    modalBtn.innerText = btnText;
    modalBtn.onclick = () => { modalOverlay.classList.add('hidden'); }; // 點擊關閉
    
    // 如果是「老師重置」，按鈕點擊後要重新整理頁面
    if (title === "遊戲重置") {
        modalBtn.onclick = () => { location.reload(); };
    }

    modalOverlay.classList.remove('hidden');

    if (autoCloseMs > 0) {
        setTimeout(() => {
            modalOverlay.classList.add('hidden');
        }, autoCloseMs);
    }
}

// 加入遊戲
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    loginError.innerText = ""; // 清空舊錯誤
    if (!name) {
        loginError.innerText = "⚠️ 請輸入名字！";
        return;
    }
    socket.emit('player_join', name);
});

// 接收錯誤訊息 (改用紅字顯示)
socket.on('error_msg', (msg) => {
    loginError.innerText = `⚠️ ${msg}`;
    // 如果是在遊戲中遇到錯誤，還是稍微跳個 Modal 比較明顯
    if (!lobbyScreen.classList.contains('hidden') === false) { 
        showModal("錯誤", msg);
    }
});

socket.on('update_player_list', (players) => {
    const me = players.find(p => p.id === socket.id);
    if (me) {
        myId = socket.id;
        joinBtn.classList.add('hidden');
        usernameInput.classList.add('hidden');
        waitingMsg.classList.remove('hidden');
        loginError.innerText = ""; // 清空錯誤
    }
    playerListUl.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
    renderTracks(players);
});

// 顯示搶先權 (改用自動關閉的 Modal)
socket.on('show_initiative', (sortedPlayers) => {
    const myData = sortedPlayers.find(p => p.id === socket.id);
    const myRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
    
    let msg = `你擲出了 ${myData.initRoll} 點\n排在第 ${myRank} 順位`;
    showModal("🎲 擲骰順序決定！", msg, "準備開始", 3000); // 3秒後自動關閉
});

socket.on('game_start', () => {
    modalOverlay.classList.add('hidden'); // 確保 Modal 關閉
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});

socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    if (nextPlayerId === myId) {
        rollBtn.disabled = false;
        rollBtn.innerText = "🎲 輪到你了！按此擲骰";
        rollBtn.style.backgroundColor = "#28a745"; 
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "等待其他玩家...";
        rollBtn.style.backgroundColor = "#6c757d"; 
    }

    if (!isAnimating) {
        if (nextPlayerId === myId) {
            gameMsg.innerText = "👉 輪到你行動！請擲骰子";
            gameMsg.style.color = "#d63384";
        } else {
            gameMsg.innerText = "等待對手行動中...";
            gameMsg.style.color = "#333";
        }
    }
});

rollBtn.addEventListener('click', () => {
    socket.emit('action_roll');
    rollBtn.disabled = true;
});

socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatar = document.getElementById(`avatar-${playerId}`);
    const isMe = (playerId === myId);

    isAnimating = true; 

    if (isMe) {
        gameMsg.innerText = `🎲 你擲出了 ${roll} 點！`;
        gameMsg.style.color = "#d63384";
        rollBtn.innerText = `🎲 ${roll} 點！`;
    } else {
        const playerName = avatar ? avatar.innerText : '對手';
        gameMsg.innerText = `👀 ${playerName} 擲出了 ${roll} 點`;
        gameMsg.style.color = "#007bff";
    }

    setTimeout(() => {
        if (avatar) {
            const percent = (newPos / 22) * 100; 
            avatar.style.left = `${percent}%`;
        }
        
        setTimeout(() => {
            isAnimating = false;
            if (rollBtn.disabled) {
                gameMsg.innerText = "等待對手行動中...";
                gameMsg.style.color = "#333";
            } else {
                gameMsg.innerText = "👉 輪到你行動！請擲骰子";
                gameMsg.style.color = "#d63384";
            }
        }, 1000); 

    }, 1000);
});

// 遊戲結束 (Modal)
socket.on('game_over', ({ winner }) => {
    gameMsg.innerText = `🏆 贏家是：${winner.name}`;
    rollBtn.classList.add('hidden');
    showModal("🏆 比賽結束！", `恭喜 ${winner.name} 獲得冠軍！`, "太棒了");
});

// 強制重整 (Modal)
socket.on('force_reload', () => {
    showModal("遊戲重置", "老師已重置遊戲，請重新加入。", "重新整理");
});

function renderTracks(players) {
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
        avatar.style.left = '0%';
        row.appendChild(avatar);
        trackContainer.appendChild(row);
    });
}