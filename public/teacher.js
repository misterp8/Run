// 請將此處改為你的 Render 網址
const socket = io('https://run-vjk6.onrender.com'); 

// DOM 元素
const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');
const adminPanel = document.getElementById('admin-panel');
const liveMsg = document.getElementById('live-msg');

const initiativeListDiv = document.getElementById('initiative-list');
const initiativeUl = document.getElementById('initiative-ul');

// Modal 相關元素
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const btnConfirm = document.getElementById('modal-btn-confirm');
const btnCancel = document.getElementById('modal-btn-cancel');

// --- 🎭 角色與動畫管理器 (AvatarManager) ---
const CHAR_TYPES = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o']; // 15種角色

const AvatarManager = {
    loopIntervals: {}, // 存儲每個玩家的動畫計時器

    // 根據 ID 計算固定的角色類型 (確保老師跟學生看到的一樣)
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

// --- 🏟️ 觀眾席動畫管理器 (AudienceManager) ---
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
        if(this.topDiv && this.btmDiv) {
            this.topDiv.style.backgroundImage = `url('images/audience_up_${this.toggle}.png')`;
            this.btmDiv.style.backgroundImage = `url('images/audience_down_${this.toggle}.png')`;
        }
    }
};
AudienceManager.start(); // 啟動觀眾動畫

// --- 🎹 SynthEngine (Web Audio API) ---
const SynthEngine = {
    ctx: null, 
    isMuted: false,
    bgmInterval: null,
    
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('mute-btn');
        if (this.isMuted) {
            this.stopBGM();
            btn.innerText = "🔇";
            btn.style.background = "#ffcccc";
        } else {
            // 如果遊戲正在進行中，解除靜音時要恢復音樂
            if (startBtn.disabled && startBtn.innerText.includes("進行中")) {
                this.playBGM();
            }
            btn.innerText = "🔊";
            btn.style.background = "#fff";
        }
    },

    playRoll() {
        if (this.isMuted || !this.ctx) return;
        const t = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, t);
        filter.Q.value = 5;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.8, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(t);
        noise.stop(t + 0.3);
    },

    playStep() {
        if (this.isMuted || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
    },

    playWin() {
        if (this.isMuted || !this.ctx) return;
        this.stopBGM();
        const t = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50]; 
        const duration = 0.1;
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            const time = t + i * duration;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + duration - 0.02);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(time);
            osc.stop(time + duration);
        });
    },

    playBGM() {
        if (this.isMuted || this.bgmInterval || !this.ctx) return;
        const sequence = [261.63, 0, 261.63, 293.66, 329.63, 0, 329.63, 392.00]; 
        let step = 0;
        const noteTime = 0.25; 
        this.bgmInterval = setInterval(() => {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const freq = sequence[step % sequence.length];
            if (freq > 0) {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq / 2;
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.3);
            }
            step++;
        }, noteTime * 1000);
    },

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    }
};
document.getElementById('mute-btn').addEventListener('click', () => SynthEngine.toggleMute());


// --- Modal 控制函式 ---
function showModal(title, text, isConfirm = false, onConfirm = null) {
    modalTitle.innerText = title;
    modalBody.innerHTML = text; 
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

// 連線狀態顯示
const statusDiv = document.createElement('div');
statusDiv.style.padding = "5px";
statusDiv.style.marginBottom = "10px";
statusDiv.style.fontWeight = "bold";
adminPanel.prepend(statusDiv);

// --- Socket 事件監聽 ---

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

// 核心：狀態更新與按鈕控制
socket.on('update_game_state', (gameState) => {
    updateView(gameState.players);
    
    if (gameState.status === 'PLAYING') {
        startBtn.disabled = true;
        startBtn.innerText = "⛔ 遊戲進行中";
        startBtn.style.cursor = "not-allowed";
        startBtn.style.backgroundColor = "#6c757d";

        restartBtn.disabled = true;
        restartBtn.style.cursor = "not-allowed";
        restartBtn.style.opacity = "0.5";
    } else if (gameState.status === 'ENDED') {
        startBtn.disabled = true; 
        startBtn.innerText = "🏁 本局結束";
        startBtn.style.backgroundColor = "#6c757d";

        restartBtn.disabled = false;
        restartBtn.style.cursor = "pointer";
        restartBtn.style.opacity = "1";

        SynthEngine.stopBGM();
    } else {
        // LOBBY
        startBtn.disabled = false;
        startBtn.innerText = "🚀 開始遊戲";
        startBtn.style.cursor = "pointer";
        startBtn.style.backgroundColor = "#27ae60";

        restartBtn.disabled = true;
        restartBtn.style.cursor = "not-allowed";
        restartBtn.style.opacity = "0.5";

        initiativeListDiv.style.display = 'none';
        SynthEngine.stopBGM();
    }
});

socket.on('game_reset_positions', () => {
    closeModal();
    if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
    // 重置所有角色為站立
    document.querySelectorAll('.avatar-img').forEach(img => {
        const id = img.id.replace('img-', '');
        AvatarManager.setState(id, 'idle');
    });
});

socket.on('show_initiative', (sortedPlayers) => {
    initiativeListDiv.style.display = 'block';
    initiativeUl.innerHTML = ''; 
    sortedPlayers.forEach((p, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>第 ${index + 1} 順位</strong>: ${p.name} <span style="color:#ffc107">(擲出 ${p.initRoll} 點)</span>`;
        initiativeUl.appendChild(li);
    });
    if(liveMsg) liveMsg.innerText = "🎲 擲骰決定順序中... (3秒後開始)";
    
    // 老師端初始化音效
    SynthEngine.init(); 
    SynthEngine.playRoll();
});

socket.on('game_start', () => {
    SynthEngine.playBGM();
});

socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    // 當輪到某人時，將其設為 Ready 蹲下狀態
    if (nextPlayerId) AvatarManager.setState(nextPlayerId, 'ready');
});

socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatarContainer = document.getElementById(`avatar-${playerId}`);
    const nameTag = avatarContainer ? avatarContainer.querySelector('.name-tag') : null;
    const playerName = nameTag ? nameTag.innerText : '未知玩家';

    // 播放跑步動畫
    AvatarManager.setState(playerId, 'run');

    if (liveMsg) {
        liveMsg.innerText = `🎲 ${playerName} 擲出了 ${roll} 點！`;
        liveMsg.style.color = "#d63384";
    }

    setTimeout(() => {
        if (avatarContainer) {
            SynthEngine.playStep();
            const percent = (newPos / 22) * 100;
            avatarContainer.style.left = `${percent}%`;
            if (liveMsg) liveMsg.style.color = "#333"; 
        }

        // 移動結束
        setTimeout(() => {
            if (newPos < 21) {
                AvatarManager.setState(playerId, 'idle');
            } else {
                AvatarManager.setState(playerId, 'win'); // 到達終點歡呼
            }
        }, 1000);

    }, 1000);
});

socket.on('player_finished_rank', ({ player, rank }) => {
    setTimeout(() => {
        SynthEngine.playWin(); 
        AvatarManager.setState(player.id, 'win');
        if(liveMsg) {
            liveMsg.innerText = `👏 ${player.name} 抵達終點！ (第 ${rank} 名)`;
            liveMsg.style.color = "#28a745";
        }
    }, 1500);
});

socket.on('game_over', ({ rankings }) => {
    setTimeout(() => {
        const winner = rankings[0];
        liveMsg.innerText = `🏆 冠軍：${winner.name}`;
        SynthEngine.playWin();
        
        // 所有前三名歡呼
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

// --- 按鈕監聽 ---

startBtn.addEventListener('click', () => {
    SynthEngine.init(); 
    startBtn.disabled = true;
    startBtn.innerText = "⏳ 啟動中...";
    socket.emit('admin_start_game');
});

// 重點：回起跑線
restartBtn.addEventListener('click', () => {
    showModal(
        "準備下一局",
        "確定要讓所有學生回到起跑線嗎？\n(排名將會重置，但保留玩家)",
        true, 
        () => {
            socket.emit('admin_restart_game');
        }
    );
});

resetBtn.addEventListener('click', () => {
    showModal(
        "危險操作", 
        "確定要踢除所有玩家並回到首頁嗎？\n(若只是要重玩，請按「回起跑線」)", 
        true, 
        () => {
            socket.emit('admin_reset_game');
            trackContainer.innerHTML = ''; 
            playerCountSpan.innerText = 0;
            if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
            initiativeListDiv.style.display = 'none';
            SynthEngine.stopBGM();
        }
    );
});

// --- 渲染畫面 ---
function updateView(players) {
    if (!players) players = [];
    playerCountSpan.innerText = players.length;
    // 這裡使用與 renderTracks 相同的邏輯重建 DOM，確保資料同步
    renderTracks(players); 
}

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

        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'avatar-container';
        avatarContainer.id = `avatar-${p.id}`;
        
        const percent = (p.position / 22) * 100;
        avatarContainer.style.left = `${percent}%`;

        // 決定角色
        const charType = AvatarManager.getCharType(p.id);

        const img = document.createElement('img');
        img.className = 'avatar-img';
        img.id = `img-${p.id}`;
        img.dataset.char = charType;
        
        // 如果已經完賽，保持 Win 狀態，否則 Idle
        if (p.position >= 21) {
            img.src = `images/avatar_${charType}_5.png`;
            // 注意：這裡如果需要它持續動，可能需要在載入後呼叫 AvatarManager.setState，但靜態圖也無妨
        } else {
            img.src = `images/avatar_${charType}_1.png`;
        }

        const nameTag = document.createElement('div');
        nameTag.className = 'name-tag';
        nameTag.innerText = p.name;

        avatarContainer.appendChild(nameTag);
        avatarContainer.appendChild(img);
        row.appendChild(avatarContainer);
        trackContainer.appendChild(row);

        // 如果該玩家正在終點，啟動歡呼動畫
        if(p.position >= 21) {
            AvatarManager.setState(p.id, 'win');
        }
    });
}