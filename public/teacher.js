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
const modalContent = document.querySelector('.modal-content');

const PLAYER_POSITIONS = {}; 

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

// --- 🎲 3D 骰子管理器 (Teacher) ---
const DiceManager = {
    overlay: document.getElementById('dice-overlay'),
    cube: document.getElementById('dice-cube'),
    rotations: {
        1: [0, 0], 2: [0, -90], 3: [0, -180], 4: [0, 90], 5: [-90, 0], 6: [90, 0]
    },
    async roll(targetNumber) {
        return new Promise((resolve) => {
            this.overlay.classList.add('active');
            const randX = Math.floor(Math.random() * 4) * 360; 
            const randY = Math.floor(Math.random() * 4) * 360;
            this.cube.style.transition = 'none';
            this.cube.style.transform = `rotateX(${randX}deg) rotateY(${randY}deg)`;
            void this.cube.offsetWidth;
            SynthEngine.playRoll();
            const [targetX, targetY] = this.rotations[targetNumber];
            const extraSpins = 1080; 
            this.cube.style.transition = 'transform 1.5s cubic-bezier(0.1, 0.9, 0.2, 1)';
            this.cube.style.transform = `rotateX(${targetX + extraSpins}deg) rotateY(${targetY + extraSpins}deg) translateZ(0)`;
            setTimeout(() => {
                setTimeout(() => {
                    this.overlay.classList.remove('active');
                    resolve(); 
                }, 500);
            }, 1500);
        });
    }
};

const ConfettiManager = {
    shoot() {
        const duration = 3000;
        const end = Date.now() + duration;
        (function frame() {
            confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#e74c3c', '#f1c40f', '#2ecc71'] });
            confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#3498db', '#9b59b6', '#ecf0f1'] });
            if (Date.now() < end) { requestAnimationFrame(frame); }
        }());
    }
};

const AvatarManager = {
    loopIntervals: {},
    movingStatus: {}, 
    getCharType(id) {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
        return CHAR_TYPES[hash % CHAR_TYPES.length];
    },
    setState(playerId, state) {
        if (this.movingStatus[playerId] === true && (state === 'ready' || state === 'idle')) return;
        const img = document.getElementById(`img-${playerId}`);
        if (!img) return;
        const charType = img.dataset.char;
        if (this.loopIntervals[playerId]) { clearInterval(this.loopIntervals[playerId]); delete this.loopIntervals[playerId]; }
        switch (state) {
            case 'idle': img.src = `images/avatar_${charType}_1.png`; break;
            case 'ready': img.src = `images/avatar_${charType}_2.png`; break;
            case 'run': 
                img.src = `images/avatar_${charType}_3.png`; 
                let runToggle = false;
                this.loopIntervals[playerId] = setInterval(() => {
                    runToggle = !runToggle;
                    const frame = runToggle ? 4 : 3;
                    img.src = `images/avatar_${charType}_${frame}.png`;
                    SynthEngine.playStep();
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
    playStep(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.frequency.setValueAtTime(200,t); o.frequency.linearRampToValueAtTime(50,t+0.05); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.05); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.05); },
    playWin(){ if(this.isMuted||!this.ctx)return; this.stopBGM(); const t=this.ctx.currentTime; const notes=[523,659,784,1046]; notes.forEach((f,i)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(0.1,t+i*0.1);g.gain.linearRampToValueAtTime(0,t+i*0.1+0.1);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*0.1);o.stop(t+i*0.1+0.1);}); },
    playBGM(){ if (this.isMuted || this.bgmInterval || !this.ctx) return; const sequence = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 0, 293.66, 349.23, 440.00, 587.33, 440.00, 349.23, 293.66, 0]; let step = 0; this.bgmInterval = setInterval(() => { if (this.ctx.state === 'suspended') this.ctx.resume(); const freq = sequence[step % sequence.length]; if (freq > 0) { const t = this.ctx.currentTime; const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); osc.type = 'sine'; osc.frequency.value = freq / 2; gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.3); } step++; }, 250); },
    stopBGM(){ if(this.bgmInterval){clearInterval(this.bgmInterval);this.bgmInterval=null;} }
};
document.getElementById('mute-btn').addEventListener('click', () => SynthEngine.toggleMute());

function showModal(title, text, isConfirm = false, onConfirm = null) {
    modalContent.className = "modal-content"; // 重置
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
    modalContent.classList.remove('premium-modal');
    AvatarManager.movingStatus = {}; 
    for (let key in PLAYER_POSITIONS) PLAYER_POSITIONS[key] = 0;
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

socket.on('game_start', () => {
    liveMsg.innerText = "🚀 比賽開始！";
    SynthEngine.playBGM();
    document.querySelectorAll('.avatar-img').forEach(img => {
        const id = img.id.replace('img-', '');
        AvatarManager.setState(id, 'ready');
    });
});

socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    const allAvatars = document.querySelectorAll('.avatar-img');
    allAvatars.forEach(img => {
        const id = img.id.replace('img-', '');
        const currentPos = PLAYER_POSITIONS[id] || 0;
        if (id === nextPlayerId) {
            if (currentPos === 0) AvatarManager.setState(id, 'ready'); else AvatarManager.setState(id, 'idle');
        } else {
            if (!img.src.includes('_5.png')) AvatarManager.setState(id, 'idle');
        }
    });
});

socket.on('player_moved', async ({ playerId, roll, newPos }) => {
    await DiceManager.roll(roll); // 老師端也看骰子

    const avatarContainer = document.getElementById(`avatar-${playerId}`);
    const nameTag = avatarContainer ? avatarContainer.querySelector('.name-tag') : null;
    const playerName = nameTag ? nameTag.innerText : '未知玩家';

    PLAYER_POSITIONS[playerId] = newPos;
    AvatarManager.movingStatus[playerId] = true;
    AvatarManager.setState(playerId, 'run');

    if (liveMsg) liveMsg.innerHTML = `<span style="color:#f1c40f">${playerName}</span> 擲出了 ${roll} 點`;

    setTimeout(() => {
        if (avatarContainer) {
            const percent = (newPos / 22) * 100;
            avatarContainer.style.left = `${percent}%`;
        }
        setTimeout(() => {
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
        ConfettiManager.shoot(); // 噴紙花
        if(liveMsg) liveMsg.innerHTML = `👏 <span style="color:#2ecc71">${player.name}</span> 獲得第 ${rank} 名！`;
    }, 1500);
});

socket.on('game_over', ({ rankings }) => {
    // 延遲流程
    setTimeout(() => {
        ConfettiManager.shoot();
        SynthEngine.playWin();
        rankings.forEach(r => AvatarManager.setState(r.id, 'win'));

        setTimeout(() => {
            let rankHtml = '<ul class="rank-list">';
            rankings.forEach(p => {
                let medal = '';
                if (p.rank === 1) medal = '<span class="rank-medal">🥇</span>';
                if (p.rank === 2) medal = '<span class="rank-medal">🥈</span>';
                if (p.rank === 3) medal = '<span class="rank-medal">🥉</span>';
                
                const charType = AvatarManager.getCharType(p.id);
                const imgHtml = `<img class="rank-avatar" src="images/avatar_${charType}_5.png">`;
                
                rankHtml += `<li class="rank-item">
                    ${medal} ${imgHtml} <span class="rank-name">${p.name}</span>
                </li>`;
            });
            rankHtml += '</ul>';

            modalContent.classList.add('premium-modal');
            showModal("🏆 榮譽榜 🏆", rankHtml);
        }, 3000); // 3秒後顯示榜單
    }, 2500); // 2.5秒後噴紙花
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
    // 強制排序
    const sortedPlayers = [...players].sort((a, b) => a.id.localeCompare(b.id));

    sortedPlayers.forEach(p => {
        PLAYER_POSITIONS[p.id] = p.position;

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