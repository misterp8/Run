// 請將此處改為你的 Render 網址，若在本地測試則留空或用 http://localhost:3000
const socket = io('https://run-vjk6.onrender.com'); 

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('join-btn');
const waitingMsg = document.getElementById('waiting-msg');
const playerListUl = document.getElementById('player-list-ul');
const trackContainer = document.getElementById('track-container');
const rollBtn = document.getElementById('roll-btn');
const gameMsg = document.getElementById('game-msg');

let myId = null;

// 加入遊戲
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) return alert('請輸入名字');
    socket.emit('player_join', name);
});

socket.on('error_msg', (msg) => {
    alert(msg);
});

socket.on('update_player_list', (players) => {
    // 如果我已經加入，就顯示等待畫面
    const me = players.find(p => p.id === socket.id);
    if (me) {
        myId = socket.id;
        joinBtn.classList.add('hidden');
        usernameInput.classList.add('hidden');
        waitingMsg.classList.remove('hidden');
    }
    
    playerListUl.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
    renderTracks(players);
});

// 顯示搶先權
socket.on('show_initiative', (sortedPlayers) => {
    const myData = sortedPlayers.find(p => p.id === socket.id);
    const myRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
    let msg = `🎲 決定順序中...\n你擲出了 ${myData.initRoll} 點！\n排序：第 ${myRank} 順位`;
    alert(msg);
});

socket.on('game_start', () => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});

socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    if (nextPlayerId === myId) {
        rollBtn.disabled = false;
        rollBtn.innerText = "🎲 輪到你了！按此擲骰";
        rollBtn.style.backgroundColor = "#28a745"; // 綠色
        gameMsg.innerText = "👉 輪到你行動！請擲骰子";
        gameMsg.style.color = "#d63384";
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "等待其他玩家...";
        rollBtn.style.backgroundColor = "#6c757d"; // 灰色
        gameMsg.innerText = "等待對手行動中...";
        gameMsg.style.color = "#333";
    }
});

rollBtn.addEventListener('click', () => {
    socket.emit('action_roll');
    rollBtn.disabled = true;
});

// 核心：移動邏輯 (含延遲與文字顯示)
socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatar = document.getElementById(`avatar-${playerId}`);
    const isMe = (playerId === myId);

    // 1. 先顯示文字結果
    if (isMe) {
        gameMsg.innerText = `🎲 你擲出了 ${roll} 點！`;
        rollBtn.innerText = `🎲 ${roll} 點！`;
    } else {
        const playerName = avatar ? avatar.innerText : '對手';
        gameMsg.innerText = `👀 ${playerName} 擲出了 ${roll} 點`;
    }

    // 2. 延遲 1 秒後再移動
    setTimeout(() => {
        if (avatar) {
            const percent = (newPos / 22) * 100; 
            avatar.style.left = `${percent}%`;
        }
        // 如果是自己，移動完恢復提示文字
        if (isMe) {
             // 這裡不需急著變回 "輪到你"，因為會等下一個 update_turn
        }
    }, 1000);
});

socket.on('game_over', ({ winner }) => {
    gameMsg.innerText = `🏆 贏家是：${winner.name}`;
    rollBtn.classList.add('hidden');
    alert(`遊戲結束！贏家是：${winner.name}`);
});

socket.on('force_reload', () => {
    alert('老師已重置遊戲');
    location.reload();
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