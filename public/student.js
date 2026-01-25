const socket = io();

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

let myId = null;

// 1. 加入遊戲
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) return alert('請輸入名字');
    
    socket.emit('player_join', name);
    // UI 切換
    joinBtn.classList.add('hidden');
    usernameInput.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
});

// 接收錯誤訊息
socket.on('error_msg', (msg) => {
    alert(msg);
    location.reload();
});

// 2. 更新大廳玩家列表
socket.on('update_player_list', (players) => {
    playerListUl.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
    // 預先繪製跑道 (雖然還沒開始，但可以看到誰加入了)
    renderTracks(players);
});

// 3. 遊戲開始
socket.on('game_start', () => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    myId = socket.id;
});

// --- 新增：顯示搶先權結果 ---
socket.on('show_initiative', (sortedPlayers) => {
    // 找出自己的資料
    const myData = sortedPlayers.find(p => p.id === socket.id);
    const myRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
    
    let msg = `🎲 決定順序中...\n\n`;
    msg += `你擲出了 ${myData.initRoll} 點！\n`;
    msg += `排序結果：第 ${myRank} 順位\n\n`;
    msg += `(最高點數者將於 3 秒後開始)`;
    
    alert(msg); // 簡單暴力，先用 alert 擋著，之後升級 UI 會改用漂亮動畫
});

// 4. 輪替回合
socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    if (nextPlayerId === myId) {
        rollBtn.disabled = false;
        rollBtn.innerText = "🎲 輪到你了！按此擲骰";
        gameMsg.innerText = "👉 輪到你行動！";
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "等待其他玩家...";
        gameMsg.innerText = "等待對手行動中...";
    }
});

// 5. 執行擲骰 (只發送請求)
rollBtn.addEventListener('click', () => {
    socket.emit('action_roll');
    rollBtn.disabled = true; // 防止連點
});

// 6. 接收移動結果 (優化版：顯示點數 -> 延遲移動)
socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatar = document.getElementById(`avatar-${playerId}`);
    
    // 如果是「自己」移動，先顯示擲出的點數
    if (playerId === myId) {
        gameMsg.innerText = `🎲 骰子滾動中...`;
        gameMsg.style.color = "#d63384"; // 暫時變色強調
        rollBtn.innerText = `🎲 你擲出了 ${roll} 點！`; // 按鈕顯示結果
    } else {
        // 如果是別人，顯示誰擲了幾點
        const playerName = avatar ? avatar.innerText : '對手';
        gameMsg.innerText = `👀 ${playerName} 擲出了 ${roll} 點`;
    }

    // --- 關鍵修改：延遲 1 秒後才移動 ---
    // 這 1 秒鐘的時間，未來我們可以放「骰子滾動動畫」
    setTimeout(() => {
        if (avatar) {
            // 移動動畫
            const percent = (newPos / 22) * 100; 
            avatar.style.left = `${percent}%`;

            // 恢復文字顏色
            if (playerId === myId) {
                 gameMsg.style.color = "black";
            }
        }
    }, 1000); // 1000 毫秒 = 1 秒
});

// 7. 遊戲結束
socket.on('game_over', ({ winner }) => {
    gameMsg.innerText = `🏆 遊戲結束！贏家是：${winner.name}`;
    rollBtn.disabled = true;
    rollBtn.classList.add('hidden');
    alert(`遊戲結束！贏家是：${winner.name}`);
});

// 強制重整
socket.on('force_reload', () => {
    alert('老師已重置遊戲');
    location.reload();
});

// --- 輔助函式：動態繪製跑道 ---
function renderTracks(players) {
    trackContainer.innerHTML = ''; // 清空
    players.forEach(p => {
        // 建立跑道列
        const row = document.createElement('div');
        row.className = 'track-row';
        
        // 建立背景格子 (純視覺)
        for(let i=0; i<22; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            row.appendChild(cell);
        }

        // 建立玩家 Avatar
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.id = `avatar-${p.id}`;
        avatar.innerText = p.name;
        avatar.style.backgroundColor = p.color;
        // 初始化位置
        avatar.style.left = '0%';

        row.appendChild(avatar);
        trackContainer.appendChild(row);
    });
}