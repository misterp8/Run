const socket = io('https://run-vjk6.onrender.com'); 

// DOM 元素
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('join-btn');
const waitingMsg = document.getElementById('waiting-msg');
const lobbyStatusText = document.getElementById('lobby-status-text');
const playerListUl = document.getElementById('player-list-ul');
const trackContainer = document.getElementById('track-container');
const rollBtn = document.getElementById('roll-btn');
const gameMsg = document.getElementById('game-msg');
const loginError = document.getElementById('login-error');

// Modal
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalBtn = document.getElementById('modal-btn');

let myId = null;
let isAnimating = false; 

// --- 🎭 角色與動畫管理器 ---
const CHAR_TYPES = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o']; // 15種角色

const AvatarManager = {
    loopIntervals: {}, // 存儲每個玩家的動畫計時器

    // 根據 ID 計算固定的角色類型
    getCharType(id) {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
        return CHAR_TYPES[hash % CHAR_TYPES.length];
    },

    // 設定狀態: 'idle' | 'ready' | 'run' | 'win'
    setState(playerId, state) {
        const img = document.getElementById(`img-${playerId}`);
        if (!img) return;

        const charType = img.dataset.char;
        
        // 清除舊的循環
        if (this.loopIntervals[playerId]) {
            clearInterval(this.loopIntervals[playerId]);
            delete this.loopIntervals[playerId];
        }

        switch (state) {
            case 'idle': // 站立 _1
                img.src = `images/avatar_${charType}_1.png`;
                break;
            case 'ready': // 蹲下 _2
                img.src = `images/avatar_${charType}_2.png`;
                break;
            case 'run': // 跑步 _3, _4 循環
                let runFrame = 3;
                img.src = `images/avatar_${charType}_3.png`;
                this.loopIntervals[playerId] = setInterval(() => {
                    runFrame = (runFrame === 3) ? 4 : 3;
                    img.src = `images/avatar_${charType}_${runFrame}.png`;
                }, 150); // 每 150ms 換圖
                break;
            case 'win': // 歡呼 _1, _5 循環
                let winFrame = 5;
                img.src = `images/avatar_${charType}_5.png`;
                this.loopIntervals[playerId] = setInterval(() => {
                    winFrame = (winFrame === 5) ? 1 : 5;
                    img.src = `images/avatar_${charType}_${winFrame}.png`;
                }, 400); // 每 400ms 換圖
                break;
        }
    }
};

// --- 🏟️ 觀眾席動畫管理器 ---
const AudienceManager = {
    interval: null,
    toggle: 1,
    topDiv: document.getElementById('audience-top'),
    btmDiv: document.getElementById('audience-bottom'),

    start() {
        if (this.interval) return;
        this.updateBg();
        this.interval = setInterval(() => {
            this.toggle = (this.toggle === 1) ? 2 : 1;
            this.updateBg();
        }, 800); // 每 0.8 秒換一次
    },

    updateBg() {
        // 使用 background-image 切換
        this.topDiv.style.backgroundImage = `url('images/audience_up_${this.toggle}.png')`;
        this.btmDiv.style.backgroundImage = `url('images/audience_down_${this.toggle}.png')`;
    }
};
AudienceManager.start(); // 啟動觀眾動畫

// --- 🎹 SynthEngine (保持不變，篇幅省略，請直接用上面那個版本) ---
// (請在此處貼上之前的 SynthEngine 代碼)
const SynthEngine = {
    ctx: null, isMuted: false, bgmInterval: null,
    init() { if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;this.ctx=new AC();} if(this.ctx.state==='suspended')this.ctx.resume(); },
    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('mute-btn');
        if(this.isMuted){this.stopBGM(); btn.innerText="🔇"; btn.style.background="#ffcccc";}
        else{ if(!gameScreen.classList.contains('hidden'))this.playBGM(); btn.innerText="🔊"; btn.style.background="#fff";}
    },
    playRoll(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(100,t+0.2); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.2); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.2); }, // 簡化版示意
    playStep(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.frequency.setValueAtTime(150,t); o.frequency.linearRampToValueAtTime(300,t+0.1); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.1); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.1); },
    playWin(){ if(this.isMuted||!this.ctx)return; this.stopBGM(); const t=this.ctx.currentTime; const notes=[523,659,784,1046]; notes.forEach((f,i)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(0.1,t+i*0.1);g.gain.linearRampToValueAtTime(0,t+i*0.1+0.1);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*0.1);o.stop(t+i*0.1+0.1);}); },
    playBGM(){ /* 請使用之前完整的 BGM 代碼 */ },
    stopBGM(){ if(this.bgmInterval){clearInterval(this.bgmInterval);this.bgmInterval=null;} }
};
document.getElementById('mute-btn').addEventListener('click', ()=>SynthEngine.toggleMute());


// --- 邏輯部分 ---

function showModal(title, text, btnText = "確定", autoCloseMs = 0) {
    modalTitle.innerText = title;
    modalBody.innerHTML = text;
    modalBtn.innerText = btnText;
    modalBtn.onclick = () => { modalOverlay.classList.add('hidden'); }; 
    if (title === "遊戲重置") modalBtn.onclick = () => { location.reload(); };
    modalOverlay.classList.remove('hidden');
    if (autoCloseMs > 0) setTimeout(() => { modalOverlay.classList.add('hidden'); }, autoCloseMs);
}

joinBtn.addEventListener('click', () => {
    SynthEngine.init(); 
    const name = usernameInput.value.trim();
    loginError.innerText = ""; 
    if (!name) { loginError.innerText = "⚠️ 請輸入名字！"; return; }
    socket.emit('player_join', name);
    SynthEngine.playRoll(); 
});

socket.on('error_msg', (msg) => {
    loginError.innerText = `⚠️ ${msg}`;
    if (!lobbyScreen.classList.contains('hidden') === false) showModal("錯誤", msg);
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

socket.on('show_initiative', (sortedPlayers) => {
    const myData = sortedPlayers.find(p => p.id === socket.id);
    const myRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
    lobbyStatusText.innerHTML = `
        <h2 style="color: #28a745; margin-bottom:5px;">🎲 擲骰順序決定！</h2>
        <p style="font-size: 1.2rem; margin: 5px 0;">你擲出了 <b style="color:#d63384; font-size: 1.5rem;">${myData.initRoll}</b> 點</p>
        <p style="font-size: 1.2rem; margin: 5px 0;">排在第 <b style="color:#007bff; font-size: 1.5rem;">${myRank}</b> 順位</p>
    `;
    SynthEngine.playRoll();
});

socket.on('game_start', () => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    SynthEngine.playBGM();
});

socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    // 1. 如果是輪到的人，將其狀態設為 Ready (蹲下)
    if (nextPlayerId) AvatarManager.setState(nextPlayerId, 'ready');

    if (nextPlayerId === myId) {
        rollBtn.disabled = false;
        rollBtn.innerText = "🎲 輪到你了！";
        rollBtn.style.backgroundColor = "#27ae60"; 
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "等待其他玩家...";
        rollBtn.style.backgroundColor = "#95a5a6"; 
    }

    if (!isAnimating) {
        if (nextPlayerId === myId) {
            gameMsg.innerText = "👉 輪到你行動！";
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
    SynthEngine.playRoll();
});

socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatarContainer = document.getElementById(`avatar-${playerId}`);
    const isMe = (playerId === myId);
    isAnimating = true; 

    // 切換為跑步狀態
    AvatarManager.setState(playerId, 'run');

    if (isMe) {
        gameMsg.innerText = `🎲 你擲出了 ${roll} 點！`;
        gameMsg.style.color = "#d63384";
        rollBtn.innerText = `🎲 ${roll} 點！`;
    } else {
        // 取得名字
        const nameTag = avatarContainer.querySelector('.name-tag');
        const name = nameTag ? nameTag.innerText : '對手';
        gameMsg.innerText = `👀 ${name} 擲出了 ${roll} 點`;
        gameMsg.style.color = "#2980b9";
    }

    setTimeout(() => {
        if (avatarContainer) {
            SynthEngine.playStep();
            const percent = (newPos / 22) * 100; 
            avatarContainer.style.left = `${percent}%`;
        }
        
        // 移動結束後，恢復站立 (如果還沒贏)
        setTimeout(() => {
            isAnimating = false;
            // 檢查是否已經到達終點，如果到了就保持 win 狀態，否則 idle
            if (newPos < 21) {
                AvatarManager.setState(playerId, 'idle');
            } else {
                AvatarManager.setState(playerId, 'win'); // 暫時慶祝
            }
            
            if (rollBtn.disabled && !rollBtn.classList.contains('hidden')) {
                gameMsg.innerText = "等待對手行動中...";
                gameMsg.style.color = "#333";
            }
        }, 1000); 
    }, 1000);
});

socket.on('player_finished_rank', ({ player, rank }) => {
    setTimeout(() => {
        SynthEngine.playWin(); 
        AvatarManager.setState(player.id, 'win'); // 設定為持續歡呼

        if(player.id === myId) {
            gameMsg.innerText = `🎉 恭喜！你是第 ${rank} 名！`;
            gameMsg.style.color = "#27ae60";
            rollBtn.disabled = true;
            rollBtn.innerText = "🏆 已完賽";
        } else {
            gameMsg.innerText = `🏁 ${player.name} 奪得第 ${rank} 名！`;
            gameMsg.style.color = "#2980b9";
        }
    }, 1500);
});

socket.on('game_over', ({ rankings }) => {
    setTimeout(() => {
        SynthEngine.playWin();
        rollBtn.classList.add('hidden');
        gameMsg.innerText = `🏆 遊戲結束！`;
        
        // 前三名都保持歡呼
        rankings.forEach(r => AvatarManager.setState(r.id, 'win'));

        let rankHtml = '<ul style="text-align: left; margin-top: 10px; padding:0; list-style:none;">';
        rankings.forEach(p => {
            let medal = '';
            if (p.rank === 1) medal = '🥇';
            if (p.rank === 2) medal = '🥈';
            if (p.rank === 3) medal = '🥉';
            rankHtml += `<li style="font-size: 1rem; margin-bottom: 8px; border-bottom:1px dashed #ccc; padding-bottom:5px;">${medal} 第 ${p.rank} 名：${p.name}</li>`;
        });
        rankHtml += '</ul>';
        showModal("🏁 比賽結束", `所有贏家已產生！<br>${rankHtml}`);
    }, 1500);
});

socket.on('force_reload', () => {
    showModal("遊戲重置", "老師已重置遊戲，請重新加入。", "重新整理");
});

socket.on('game_reset_positions', () => {
    // 讓所有人回到站立狀態
    document.querySelectorAll('.avatar-img').forEach(img => {
        const id = img.id.replace('img-', '');
        AvatarManager.setState(id, 'idle');
    });
    // ... 其他重置邏輯 (同之前) ...
    modalOverlay.classList.add('hidden');
    lobbyStatusText.innerHTML = `<p>✅ 已加入！等待老師開始遊戲...</p>`;
    gameMsg.innerText = "準備開始新的一局...";
    rollBtn.classList.remove('hidden');
    rollBtn.disabled = true;
    rollBtn.innerText = "等待開始...";
    rollBtn.style.backgroundColor = "#95a5a6";
    SynthEngine.stopBGM();
});

// --- 渲染跑道 (重頭戲) ---
function renderTracks(players) {
    trackContainer.innerHTML = ''; 
    players.forEach(p => {
        const row = document.createElement('div');
        row.className = 'track-row';
        
        // 建立 22 個格子
        for(let i=0; i<22; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            row.appendChild(cell);
        }

        // 建立角色容器
        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'avatar-container';
        avatarContainer.id = `avatar-${p.id}`;
        
        // 初始位置
        const percent = (p.position / 22) * 100;
        avatarContainer.style.left = `${percent}%`;

        // 決定角色圖案 (根據 ID 固定)
        const charType = AvatarManager.getCharType(p.id);

        // 角色圖片
        const img = document.createElement('img');
        img.className = 'avatar-img';
        img.id = `img-${p.id}`;
        img.dataset.char = charType; // 存起來供狀態機使用
        img.src = `images/avatar_${charType}_1.png`; // 預設站立

        // 名字標籤
        const nameTag = document.createElement('div');
        nameTag.className = 'name-tag';
        nameTag.innerText = p.name;

        avatarContainer.appendChild(nameTag);
        avatarContainer.appendChild(img);
        row.appendChild(avatarContainer);
        trackContainer.appendChild(row);
        
        // 如果這個玩家已經在終點，設定為歡呼
        if(p.position >= 21) AvatarManager.setState(p.id, 'win');
    });
}