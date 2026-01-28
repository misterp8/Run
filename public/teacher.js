const socket = io(); 

// --- DOM 元素 ---
const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');
const liveMsg = document.getElementById('live-msg');
const connectionStatus = document.getElementById('connection-status');

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const btnConfirm = document.getElementById('modal-btn-confirm');
const btnCancel = document.getElementById('modal-btn-cancel');

// --- 🖼️ 預載圖片 ---
const CHAR_TYPES = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];
const PRELOADED_IMGS = {};
function preloadImages() {
    CHAR_TYPES.forEach(char => {
        for(let i=1; i<=5; i++) {
            const img = new Image();
            img.src = `images/avatar_${char}_${i}.png`;
            PRELOADED_IMGS[`${char}_${i}`] = img;
        }
    });
}
preloadImages();

// --- 🎭 角色與動畫管理器 ---
const AvatarManager = {
    loopIntervals: {},
    movingStatus: {}, // 新增

    getCharType(id) {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
        return CHAR_TYPES[hash % CHAR_TYPES.length];
    },

    setState(playerId, state) {
        // 保護機制：若正在移動，忽略 ready 指令
        if (this.movingStatus[playerId] === true && state === 'ready') {
            return;
        }

        const img = document.getElementById(`img-${playerId}`);
        if (!img) return;

        const charType = img.dataset.char;
        
        if (this.loopIntervals[playerId]) {
            clearInterval(this.loopIntervals[playerId]);
            delete this.loopIntervals[playerId];
        }

        switch (state) {
            case 'idle': img.src = `images/avatar_${charType}_1.png`; break;
            case 'ready': img.src = `images/avatar_${charType}_2.png`; break;
            case 'run': 
                img.src = `images/avatar_${charType}_3.png`; // 立即切換
                let runToggle = false;
                this.loopIntervals[playerId] = setInterval(() => {
                    runToggle = !runToggle;
                    const frame = runToggle ? 4 : 3;
                    img.src = `images/avatar_${charType}_${frame}.png`;
                }, 150);
                break;
            case 'win': 
                img.src = `images/avatar_${charType}_5.png`;
                let winToggle = false;
                this.loopIntervals[playerId] = setInterval(() => {
                    winToggle = !winToggle;
                    const frame = winToggle ? 1 : 5;
                    img.src = `images/avatar_${charType}_${frame}.png`;
                }, 400);
                break;
        }
    }
};

// --- 🏟️ 觀眾席動畫 ---
const AudienceManager = {
    interval: null, toggle: 1,
    topDiv: document.getElementById('audience-top'),
    btmDiv: document.getElementById('audience-bottom'),
    start() {
        if (this.interval) return;
        this.updateBg();
        this.interval = setInterval(() => { this.toggle = (this.toggle === 1) ? 2 : 1; this.updateBg(); }, 800);
    },
    updateBg() {
        if(this.topDiv) this.topDiv.style.backgroundImage = `url('images/audience_up_${this.toggle}.png')`;
        if(this.btmDiv) this.btmDiv.style.backgroundImage = `url('images/audience_down_${this.toggle}.png')`;
    }
};
AudienceManager.start();

const SynthEngine = {
    ctx: null, isMuted: false, bgmInterval: null,
    init() { if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;this.ctx=new AC();} if(this.ctx.state==='suspended')this.ctx.resume(); },
    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('mute-btn');
        if(this.isMuted){this.stopBGM(); btn.innerText="🔇"; btn.style.background="#ffcccc";}
        else{ 
            if (startBtn.disabled && !restartBtn.disabled === false) this.playBGM();
            btn.innerText="🔊"; btn.style.background="#fff";
        }
    },
    playRoll(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(100,t+0.2); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.2); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.2); },
    playStep(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.frequency.setValueAtTime(150,t); o.frequency.linearRampToValueAtTime(300,t+0.1); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.1); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.1); },
    playWin(){ if(this.isMuted||!this.ctx)return; this.stopBGM(); const t=this.ctx.currentTime; const notes=[523,659,784,1046]; notes.forEach((f,i)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(0.1,t+i*0.1);g.gain.linearRampToValueAtTime(0,t+i*0.1+0.1);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*0.1);o.stop(t+i*0.1+0.1);}); },
    playBGM(){ if (this.isMuted || this.bgmInterval || !this.ctx) return; const sequence = [261.63, 0, 261.63, 293.66, 329.63, 0, 329.63, 392.00]; let step = 0; this.bgmInterval = setInterval(() => { if (this.ctx.state === 'suspended') this.ctx.resume(); const freq = sequence[step % sequence.length]; if (freq > 0) { const t = this.ctx.currentTime; const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); osc.type = 'sine'; osc.frequency.value = freq / 2; gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.3); } step++; }, 250); },
    stopBGM(){ if(this.bgmInterval){clearInterval(this.bgmInterval);this.bgmInterval=null;} }
};
document.getElementById('mute-btn').addEventListener('click', () => SynthEngine.toggleMute());

function showModal(title, text, isConfirm = false, onConfirm = null) {
    modalTitle.innerText = title;
    modalBody.innerHTML = text; 
    modalOverlay.classList.remove('hidden');
    if (isConfirm) {
        btnConfirm.innerText = "確定執行"; btnConfirm.className = "board-btn btn-green"; btnCancel.classList.remove('hidden');
        btnConfirm.onclick = () => { if (onConfirm) onConfirm(); closeModal(); };
        btnCancel.onclick = closeModal;
    } else {
        btnConfirm.innerText = "知道了"; btnConfirm.className = "board-btn btn-green"; btnCancel.classList.add('hidden');
        btnConfirm.onclick = closeModal;
    }
}
function closeModal() { modalOverlay.classList.add('hidden'); }

socket.on('connect', () => { connectionStatus.innerText = "🟢 伺服器已連線"; connectionStatus.style.color = "#2ecc71"; socket.emit('admin_login'); });
socket.on('disconnect', () => { connectionStatus.innerText = "🔴 與伺服器斷線"; connectionStatus.style.color = "#e74c3c"; });
socket.on('update_player_list', (players) => { updateView(players); });

socket.on('update_game_state', (gameState) => {
    updateView(gameState.players);
    if (gameState.status === 'PLAYING') {
        startBtn.disabled = true; startBtn.innerText = "遊戲進行中"; startBtn.className = "board-btn btn-grey";
        restartBtn.disabled = true; restartBtn.className = "board-btn btn-grey";
    } else if (gameState.status === 'ENDED') {
        startBtn.disabled = true; startBtn.innerText = "本局結束"; startBtn.className = "board-btn btn-grey";
        restartBtn.disabled = false; restartBtn.className = "board-btn btn-orange";
        SynthEngine.stopBGM();
    } else {
        startBtn.disabled = false; startBtn.innerText = "開始遊戲"; startBtn.className = "board-btn btn-green";
        restartBtn.disabled = true; restartBtn.className = "board-btn btn-grey";
        SynthEngine.stopBGM();
    }
});

socket.on('game_reset_positions', () => {
    closeModal();
    AvatarManager.movingStatus = {}; // 重置
    if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
    document.querySelectorAll('.avatar-img').forEach(img => {
        const id = img.id.replace('img-', '');
        AvatarManager.setState(id, 'idle');
    });
});

socket.on('show_initiative', (sortedPlayers) => {
    let msg = `🎲 順序：`;
    sortedPlayers.slice(0, 3).forEach((p, i) => { msg += `${i+1}.${p.name}(${p.initRoll}) `; });
    if(sortedPlayers.length > 3) msg += "...";
    liveMsg.innerText = msg;
    SynthEngine.init(); SynthEngine.playRoll();
});

socket.on('game_start', () => { liveMsg.innerText = "🚀 比賽開始！"; SynthEngine.playBGM(); });

// --- 🛠️ 修正點：避免大家一起蹲下 ---
socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    const allAvatars = document.querySelectorAll('.avatar-img');
    allAvatars.forEach(img => {
        const id = img.id.replace('img-', '');
        if (id === nextPlayerId) {
            AvatarManager.setState(id, 'ready');
        } else {
            // 如果某人是蹲下狀態，但現在不輪到他，叫他站起來
            if (img.src.includes('_2.png')) {
                AvatarManager.setState(id, 'idle');
            }
        }
    });
});

socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatarContainer = document.getElementById(`avatar-${playerId}`);
    const nameTag = avatarContainer ? avatarContainer.querySelector('.name-tag') : null;
    const playerName = nameTag ? nameTag.innerText : '未知玩家';

    // 🔒 鎖定並開始跑步
    AvatarManager.movingStatus[playerId] = true;
    AvatarManager.setState(playerId, 'run');

    if (liveMsg) liveMsg.innerHTML = `<span style="color:#f1c40f">${playerName}</span> 擲出了 ${roll} 點`;

    setTimeout(() => {
        if (avatarContainer) {
            SynthEngine.playStep();
            const percent = (newPos / 22) * 100;
            avatarContainer.style.left = `${percent}%`;
        }
        setTimeout(() => {
            // 🔓 解鎖並恢復站立
            AvatarManager.movingStatus[playerId] = false;
            if (newPos < 21) {
                AvatarManager.setState(playerId, 'idle');
            } else {
                AvatarManager.setState(playerId, 'win');
            }
        }, 1000);
    }, 1000);
});

socket.on('player_finished_rank', ({ player, rank }) => {
    setTimeout(() => {
        SynthEngine.playWin(); 
        AvatarManager.setState(player.id, 'win');
        if(liveMsg) liveMsg.innerHTML = `👏 <span style="color:#2ecc71">${player.name}</span> 獲得第 ${rank} 名！`;
    }, 1500);
});

socket.on('game_over', ({ rankings }) => {
    setTimeout(() => {
        const winner = rankings[0];
        liveMsg.innerText = `🏆 冠軍：${winner.name}`;
        SynthEngine.playWin();
        rankings.forEach(r => AvatarManager.setState(r.id, 'win'));
        let rankHtml = '<ul style="text-align: left; margin-top: 10px; padding:0; list-style:none;">';
        rankings.forEach(p => {
            let medal = '';
            if (p.rank === 1) medal = '🥇'; if (p.rank === 2) medal = '🥈'; if (p.rank === 3) medal = '🥉';
            const charType = AvatarManager.getCharType(p.id);
            const imgHtml = `<img src="images/avatar_${charType}_5.png" style="width:32px; height:32px; vertical-align:middle; margin-right:10px;">`;
            rankHtml += `<li style="font-size: 1.1rem; margin-bottom: 8px; border-bottom:1px dashed #ccc; padding-bottom:5px; display:flex; align-items:center;">
                <span style="margin-right:10px;">${medal} 第 ${p.rank} 名</span> ${imgHtml} <strong>${p.name}</strong></li>`;
        });
        rankHtml += '</ul>';
        showModal("🏁 比賽結束", `所有贏家已產生！<br>${rankHtml}`);
    }, 1500);
});

startBtn.addEventListener('click', () => {
    SynthEngine.init(); 
    startBtn.disabled = true; startBtn.innerText = "啟動中...";
    socket.emit('admin_start_game');
});

restartBtn.addEventListener('click', () => {
    showModal("準備下一局", "確定要讓所有學生回到起跑線嗎？\n(排名將會重置，但保留玩家)", true, () => {
        socket.emit('admin_restart_game');
    });
});

resetBtn.addEventListener('click', () => {
    showModal("危險操作", "確定要踢除所有玩家並回到首頁嗎？\n(若只是要重玩，請按「下一局」)", true, () => {
        socket.emit('admin_reset_game');
        trackContainer.innerHTML = ''; playerCountSpan.innerText = 0; liveMsg.innerText = "等待學生加入...";
        SynthEngine.stopBGM();
    });
});

function updateView(players) {
    if (!players) players = [];
    playerCountSpan.innerText = players.length;
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
        const charType = AvatarManager.getCharType(p.id);
        const img = document.createElement('img');
        img.className = 'avatar-img';
        img.id = `img-${p.id}`;
        img.dataset.char = charType;
        if (p.position >= 21) { img.src = `images/avatar_${charType}_5.png`; } else { img.src = `images/avatar_${charType}_1.png`; }
        const nameTag = document.createElement('div');
        nameTag.className = 'name-tag';
        nameTag.innerText = p.name;
        avatarContainer.appendChild(nameTag);
        avatarContainer.appendChild(img);
        row.appendChild(avatarContainer);
        trackContainer.appendChild(row);
        if(p.position >= 21) { AvatarManager.setState(p.id, 'win'); }
    });
}