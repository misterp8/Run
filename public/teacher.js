const socket = io();

const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');

 1. 登入為管理員
socket.emit('admin_login');

 2. 監聽狀態更新 (同步畫面)
 老師端不需要 Join，直接接收 update_game_state 或 update_player_list 即可
socket.on('update_player_list', (players) = {
    updateView(players);
});

socket.on('update_game_state', (gameState) = {
    updateView(gameState.players);
});

 3. 監聽移動 (與學生端邏輯相同，純觀戰)
socket.on('player_moved', ({ playerId, roll, newPos }) = {
    const avatar = document.getElementById(`avatar-${playerId}`);
    if (avatar) {
        const percent = (newPos  22)  100;
        avatar.style.left = `${percent}%`;
    }
});

socket.on('game_over', ({ winner }) = {
    alert(`🏁 比賽結束！冠軍是：${winner.name}`);
});

 4. 按鈕控制指令
startBtn.addEventListener('click', () = {
    socket.emit('admin_start_game');
});

resetBtn.addEventListener('click', () = {
    if(confirm('確定要重置遊戲並踢除所有玩家嗎？')) {
        socket.emit('admin_reset_game');
        trackContainer.innerHTML = '';  清空畫面
        playerCountSpan.innerText = 0;
    }
});

 --- 輔助函式 (與 student.js 類似，但多了更新人數) ---
function updateView(players) {
    playerCountSpan.innerText = players.length;
    
     這裡我們採用簡易策略：每次列表更新都重繪 (適合原型)
     若要優化效能，應該只新增差異的 DOM，但在 10 人規模下重繪是沒問題的
    trackContainer.innerHTML = ''; 

    players.forEach(p = {
        const row = document.createElement('div');
        row.className = 'track-row';
        
        for(let i=0; i22; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            row.appendChild(cell);
        }

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.id = `avatar-${p.id}`;
        avatar.innerText = p.name;
        avatar.style.backgroundColor = p.color;
        
         若中途登入或重整，需恢復正確位置
        const percent = (p.position  22)  100;
        avatar.style.left = `${percent}%`;

        row.appendChild(avatar);
        trackContainer.appendChild(row);
    });
}