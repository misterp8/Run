// 請將此處改為你的 Render 網址
const socket = io('https://run-vjk6.onrender.com'); 

// DOM 元素
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('join-btn');
const waitingMsg = document.getElementById('waiting-msg');
const lobbyStatusText = document.getElementById('lobby-status-text'); // 新增
const playerListUl = document.getElementById('player-list-ul');
const trackContainer = document.getElementById('track-container');
const rollBtn = document.getElementById('roll-btn');
const gameMsg = document.getElementById('game-msg');
const loginError = document.getElementById('login-error');

// Modal 元素
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalBtn = document.getElementById('modal-btn');

let myId = null;
let isAnimating = false; 

function showModal(title, text, btnText = "確定", autoCloseMs = 0) {
    modalTitle.innerText = title;
    modalBody.innerText = text;
    modalBtn.innerText = btnText;
    modalBtn.onclick = () => { modalOverlay.classList.add('hidden'); }; 
    
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

joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    loginError.innerText = ""; 
    if (!name) {
        loginError.innerText = "⚠️ 請輸入名字！";
        return;
    }
    socket.emit('player_join', name);
});

socket.on('error_msg', (msg) => {
    loginError.innerText = `⚠️ ${msg}`;
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
        loginError.innerText = "";
    }
    playerListUl.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
    renderTracks(players);
});

// --- 👇 重點修正：直接在大廳顯示擲骰結果 (不彈窗) 👇 ---
socket.on('show_initiative', (sortedPlayers) => {
    const myData = sortedPlayers.find(p => p.id === socket.id);
    const myRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
    
    // 直接修改大廳的文字，字體放大強調
    lobbyStatusText.innerHTML = `
        <h2 style="color: #28a745; margin-bottom:5px;">🎲 擲骰順序決定！</h2>
        <p style="font-size: 1.2rem; margin: 5px 0;">你擲出了 <b style="color:#d63384; font-size: 1.5rem;">${myData.initRoll}</b> 點</p>
        <p style="font-size: 1.2rem; margin: 5px 0;">排在第 <b style="color:#007bff; font-size: 1.5rem;">${myRank}</b> 順位</p>
        <p style="color: #666; font-size: 0.9rem;">(遊戲即將開始...)</p>
    `;
});

socket.on('game_start', () => {
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

socket.on('game_over', ({ winner }) => {
    gameMsg.innerText = `🏆 贏家是：${winner.name}`;
    rollBtn.classList.add('hidden');
    showModal("🏆 比賽結束！", `恭喜 ${winner.name} 獲得冠軍！`, "太棒了");
});

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