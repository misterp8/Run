const socket = io(); 

// --- DOM 元素 ---
const loginOverlay = document.getElementById('login-overlay');
const scoreboardHeader = document.getElementById('scoreboard-header');
const stadiumWrapper = document.getElementById('stadium-wrapper');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('join-btn');
const trackContainer = document.getElementById('track-container');
const rollBtn = document.getElementById('roll-btn');
const gameMsg = document.getElementById('game-msg');
const loginError = document.getElementById('login-error');

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalBtn = document.getElementById('modal-btn');
const modalContent = document.querySelector('.modal-content');

let myId = null;
let isAnimating = false; 
const PLAYER_POSITIONS = {}; 

// 圖片預載
const CHAR_TYPES = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];
function preloadImages() {
    CHAR_TYPES.forEach(char => {
        for(let i=1; i<=5; i++) {
            const img = new Image();
            img.src = `images/avatar_${char}_${i}.png`;
        }
    });
}
preloadImages();

// --- 🎲 3D 骰子 ---
const DiceManager = {
    overlay: document.getElementById('dice-overlay'),
    cube: document.getElementById('dice-cube'),
    currentX: 0, currentY: 0, 
    
    async roll(targetNumber) {
        return new Promise((resolve) => {
            this.overlay.classList.add('active');
            SynthEngine.playRoll();

            const targetRotations = {
                1: {x:0, y:0}, 2: {x:0, y:-90}, 3: {x:0, y:180},
                4: {x:0, y:90}, 5: {x:-90, y:0}, 6: {x:90, y:0}
            };
            const target = targetRotations[targetNumber];
            
            const extraX = 360 * (Math.floor(Math.random() * 3) + 2);
            const extraY = 360 * (Math.floor(Math.random() * 3) + 2);

            this.currentX += extraX;
            this.currentY += extraY;

            const remainderX = this.currentX % 360;
            const remainderY = this.currentY % 360;
            
            this.currentX += (target.x - remainderX);
            this.currentY += (target.y - remainderY);

            this.cube.style.transition = 'transform 1.5s cubic-bezier(0.1, 0.9, 0.2, 1)';
            this.cube.style.transform = `rotateX(${this.currentX}deg) rotateY(${this.currentY}deg)`;

            setTimeout(() => {
                setTimeout(() => {
                    this.overlay.classList.remove('active');
                    resolve(); 
                }, 800);
            }, 1500);
        });
    }
};

// --- 🎉 勝利紙花 ---
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

// --- 🎭 角色與動畫管理器 (關鍵修復) ---
const AvatarManager = {
    loopIntervals: {},
    movingStatus: {}, 
    
    // 雖然 Server 已經分配，但這裡保留 Helper 函式
    getCharType(p) {
        return p.avatarChar || 'a'; 
    },

    setState(playerId, state, charType) {
        // 如果正在移動中，忽略 idle 或 ready 指令，確保跑步不被中斷
        if (this.movingStatus[playerId] === true && (state === 'ready' || state === 'idle')) return;

        let img = document.getElementById(`img-${playerId}`);
        
        // 嘗試補救 charType
        if (!charType && img) charType = img.dataset.char;
        if (!charType) charType = 'a'; 

        // 清除舊計時器
        if (this.loopIntervals[playerId]) { 
            clearInterval(this.loopIntervals[playerId]); 
            delete this.loopIntervals[playerId]; 
        }

        switch (state) {
            case 'idle': 
                if(img) img.src = `images/avatar_${charType}_1.png`; 
                break;
            case 'ready': 
                if(img) img.src = `images/avatar_${charType}_2.png`; 
                break;
            case 'run': 
                // 立即設定第一張跑圖
                if(img) img.src = `images/avatar_${charType}_3.png`; 
                
                let runToggle = false;
                this.loopIntervals[playerId] = setInterval(() => {
                    // 🛠️ 關鍵修正：每次都重新抓 DOM，如果抓不到(正在重繪)就跳過，絕對不要清除計時器
                    const currentImg = document.getElementById(`img-${playerId}`);
                    
                    if (currentImg) {
                        runToggle = !runToggle;
                        const frame = runToggle ? 4 : 3;
                        currentImg.src = `images/avatar_${charType}_${frame}.png`;
                        
                        // 確保移動時如果因為重繪導致 src 變回 1，這裡會強制刷成 3 或 4
                        if (!currentImg.src.includes(`_${frame}.png`)) {
                            currentImg.src = `images/avatar_${charType}_${frame}.png`;
                        }
                        
                        SynthEngine.playStep();
                    }
                }, 150);
                break;
            case 'win': 
                if(img) img.src = `images/avatar_${charType}_5.png`;
                
                let winToggle = false;
                this.loopIntervals[playerId] = setInterval(() => {
                    const currentImg = document.getElementById(`img-${playerId}`);
                    if (currentImg) {
                        winToggle = !winToggle;
                        const frame = winToggle ? 1 : 5;
                        currentImg.src = `images/avatar_${charType}_${frame}.png`;
                    }
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
        else{ this.playBGM(); btn.innerText="🔊"; btn.style.background="#fff";}
    },
    playRoll(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(100,t+0.2); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.2); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.2); },
    playStep(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.frequency.setValueAtTime(200,t); o.frequency.linearRampToValueAtTime(50,t+0.05); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.05); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.05); },
    playWin(){ if(this.isMuted||!this.ctx)return; this.stopBGM(); const t=this.ctx.currentTime; const notes=[523,659,784,1046]; notes.forEach((f,i)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(0.1,t+i*0.1);g.gain.linearRampToValueAtTime(0,t+i*0.1+0.1);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*0.1);o.stop(t+i*0.1+0.1);}); },
    playBGM(){ if (this.isMuted || this.bgmInterval || !this.ctx) return; const sequence = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 0, 293.66, 349.23, 440.00, 587.33, 440.00, 349.23, 293.66, 0]; let step = 0; this.bgmInterval = setInterval(() => { if (this.ctx.state === 'suspended') this.ctx.resume(); const freq = sequence[step % sequence.length]; if (freq > 0) { const t = this.ctx.currentTime; const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); osc.type = 'sine'; osc.frequency.value = freq / 2; gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.3); } step++; }, 250); },
    stopBGM(){ if(this.bgmInterval){clearInterval(this.bgmInterval);this.bgmInterval=null;} }
};
document.getElementById('mute-btn').addEventListener('click', ()=>SynthEngine.toggleMute());

function showModal(title, text, btnText = "確定", autoCloseMs = 0) {
    modalContent.className = "modal-content"; 
    modalTitle.innerText = title;
    modalBody.innerHTML = text;
    modalBtn.innerText = btnText;
    modalBtn.onclick = () => { modalOverlay.classList.add('hidden'); }; 
    if (title === "遊戲重置") modalBtn.onclick = () => { location.reload(); };
    modalOverlay.classList.remove('hidden');
    if (autoCloseMs > 0) setTimeout(() => { modalOverlay.classList.add('hidden'); }, autoCloseMs);
}

socket.on('connect', () => { myId = socket.id; });

joinBtn.addEventListener('click', () => {
    SynthEngine.init(); 
    const name = usernameInput.value.trim();
    if (!name) { alert("⚠️ 請輸入名字！"); return; }
    socket.emit('player_join', name);
});

socket.on('error_msg', (msg) => { alert(msg); });

socket.on('update_player_list', (players) => {
    const me = players.find(p => p.id === socket.id);
    if (me) {
        myId = socket.id;
        loginOverlay.classList.add('hidden');
        scoreboardHeader.classList.remove('hidden');
        stadiumWrapper.classList.remove('hidden');
        gameMsg.innerText = "✅ 已加入！等待老師開始...";
    }
    renderTracks(players);
});

socket.on('show_initiative', (sortedPlayers) => {
    let msg = "🎲 抽籤決定順序：\n";
    sortedPlayers.forEach((p, i) => {
        msg += `${i+1}. ${p.name} `;
        if((i+1)%3 === 0) msg += "\n";
    });
    gameMsg.innerText = msg;
});

socket.on('game_start', () => {
    gameMsg.innerText = "🚀 遊戲開始！";
    SynthEngine.playBGM();
    document.querySelectorAll('.avatar-img').forEach(img => {
        const id = img.id.replace('img-', '');
        AvatarManager.setState(id, 'ready', img.dataset.char);
    });
});

socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    const allAvatars = document.querySelectorAll('.avatar-img');
    allAvatars.forEach(img => {
        const id = img.id.replace('img-', '');
        const currentPos = PLAYER_POSITIONS[id] || 0;
        if (id === nextPlayerId) {
            if (currentPos === 0) AvatarManager.setState(id, 'ready', img.dataset.char); 
            else AvatarManager.setState(id, 'idle', img.dataset.char);
        } else {
            if (!img.src.includes('_5.png')) AvatarManager.setState(id, 'idle', img.dataset.char);
        }
    });

    if (nextPlayerId === myId) {
        rollBtn.removeAttribute('disabled');
        rollBtn.disabled = false;
        rollBtn.innerText = "🎲 輪到你了！按此擲骰";
        rollBtn.className = "board-btn btn-green"; 
        rollBtn.style.cursor = "pointer";
    } else {
        rollBtn.setAttribute('disabled', 'true');
        rollBtn.disabled = true;
        rollBtn.innerText = "等待其他玩家...";
        rollBtn.className = "board-btn btn-grey"; 
        rollBtn.style.cursor = "not-allowed";
    }

    if (!isAnimating) {
        if (nextPlayerId === myId) {
            gameMsg.innerText = "👉 輪到你了！請擲骰子";
            gameMsg.style.color = "#f1c40f";
        } else {
            gameMsg.innerText = "等待對手行動中...";
            gameMsg.style.color = "#f1c40f";
        }
    }
});

rollBtn.addEventListener('click', () => {
    if (rollBtn.disabled) return;
    socket.emit('action_roll');
    rollBtn.disabled = true;
    rollBtn.innerText = "📡 傳送中...";
    rollBtn.className = "board-btn btn-grey";
});

socket.on('player_moved', async ({ playerId, roll, newPos }) => {
    await DiceManager.roll(roll);

    const avatarContainer = document.getElementById(`avatar-${playerId}`);
    const isMe = (playerId === myId);
    isAnimating = true; 

    PLAYER_POSITIONS[playerId] = newPos;
    AvatarManager.movingStatus[playerId] = true;
    
    const img = document.getElementById(`img-${playerId}`);
    const charType = img ? img.dataset.char : 'a';

    AvatarManager.setState(playerId, 'run', charType);

    if (isMe) {
        gameMsg.innerText = `🎲 你擲出了 ${roll} 點！`;
    } else {
        const nameTag = avatarContainer.querySelector('.name-tag');
        const name = nameTag ? nameTag.innerText : '對手';
        gameMsg.innerText = `👀 ${name} 擲出了 ${roll} 點`;
    }

    setTimeout(() => {
        if (avatarContainer) {
            const percent = (newPos / 22) * 100; 
            avatarContainer.style.left = `${percent}%`;
        }
        
        setTimeout(() => {
            isAnimating = false;
            AvatarManager.movingStatus[playerId] = false;

            if (newPos < 21) {
                AvatarManager.setState(playerId, 'idle', charType);
            } else {
                AvatarManager.setState(playerId, 'win', charType);
            }
            
            if (rollBtn.disabled && !rollBtn.classList.contains('hidden')) {
                gameMsg.innerText = "等待對手行動中...";
                gameMsg.style.color = "#fff";
            }
        }, 1000); 
    }, 1000);
});

socket.on('player_finished_rank', ({ player, rank }) => {
    setTimeout(() => {
        SynthEngine.playWin(); 
        AvatarManager.setState(player.id, 'win', player.avatarChar);
        ConfettiManager.shoot();

        if(player.id === myId) {
            gameMsg.innerText = `🎉 恭喜！你是第 ${rank} 名！`;
            rollBtn.innerText = "🏆 已完賽";
        } else {
            gameMsg.innerText = `🏁 ${player.name} 奪得第 ${rank} 名！`;
        }
    }, 2500); 
});

socket.on('game_over', ({ rankings }) => {
    setTimeout(() => {
        ConfettiManager.shoot();
        SynthEngine.playWin();
        rollBtn.classList.add('hidden');
        gameMsg.innerText = `🏆 遊戲結束！`;
        rankings.forEach(r => AvatarManager.setState(r.id, 'win', r.avatarChar));

        setTimeout(() => {
            let rankHtml = '<ul class="rank-list">';
            rankings.forEach(p => {
                let medal = '';
                if (p.rank === 1) medal = '<span class="rank-medal">🥇</span>';
                if (p.rank === 2) medal = '<span class="rank-medal">🥈</span>';
                if (p.rank === 3) medal = '<span class="rank-medal">🥉</span>';
                
                const charType = p.avatarChar || 'a';
                const imgHtml = `<img class="rank-avatar" src="images/avatar_${charType}_5.png">`;
                
                rankHtml += `<li class="rank-item">
                    ${medal} ${imgHtml} <span class="rank-name">${p.name}</span>
                </li>`;
            });
            rankHtml += '</ul>';

            modalContent.classList.add('premium-modal');
            showModal("🏆 榮譽榜 🏆", rankHtml);
        }, 3000);
    }, 2500);
});

socket.on('force_reload', () => { location.reload(); });

socket.on('game_reset_positions', () => {
    modalContent.classList.remove('premium-modal');
    AvatarManager.movingStatus = {};
    for (let key in PLAYER_POSITIONS) PLAYER_POSITIONS[key] = 0;
    
    document.querySelectorAll('.avatar-img').forEach(img => {
        const id = img.id.replace('img-', '');
        AvatarManager.setState(id, 'idle', img.dataset.char);
    });
    modalOverlay.classList.add('hidden');
    gameMsg.innerText = "準備開始新的一局...";
    rollBtn.classList.remove('hidden');
    rollBtn.disabled = true;
    rollBtn.innerText = "等待開始...";
    rollBtn.className = "board-btn btn-grey";
    SynthEngine.stopBGM();
});

function renderTracks(players) {
    trackContainer.innerHTML = ''; 
    
    // 渲染時，如果該玩家正在跑步，我們必須讓圖片維持在 "Run" 的狀態，而不是被重置成 "Idle"
    players.forEach(p => {
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

        const charType = p.avatarChar || 'a';

        const img = document.createElement('img');
        img.className = 'avatar-img';
        img.id = `img-${p.id}`;
        img.dataset.char = charType; 
        
        // 🛠️ 關鍵修正：檢查是否正在移動，如果是，初始化為跑步圖 (_3)，否則依位置決定
        if (AvatarManager.movingStatus[p.id]) {
            img.src = `images/avatar_${charType}_3.png`;
        } else if (p.position >= 21) {
            img.src = `images/avatar_${charType}_5.png`;
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
        
        if(p.position >= 21) AvatarManager.setState(p.id, 'win', charType);
    });
}