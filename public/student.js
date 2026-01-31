const socket = io(); 

// DOM
const loginOverlay = document.getElementById('login-overlay');
const scoreboardHeader = document.getElementById('scoreboard-header');
const stadiumWrapper = document.getElementById('stadium-wrapper');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('join-btn');
const trackContainer = document.getElementById('track-container');
const rollBtn = document.getElementById('roll-btn');
const gameMsg = document.getElementById('game-msg');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalBtn = document.getElementById('modal-btn');
const modalContent = document.querySelector('.modal-content');
const diceResultText = document.getElementById('dice-result-text'); 
const myNameDisplay = document.getElementById('my-name-display'); 

let myId = null;
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

// --- 🎹 SynthEngine (增加6點特效) ---
const SynthEngine = {
    ctx: null, isMuted: false, bgmInterval: null,
    init() { if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;this.ctx=new AC();} if(this.ctx.state==='suspended')this.ctx.resume(); },
    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('mute-btn');
        if(this.isMuted){this.stopBGM(); btn.innerText="🔇"; btn.style.background="#ffcccc";}
        else{ if (startBtn.disabled && !restartBtn.disabled === false) this.playBGM(); btn.innerText="🔊"; btn.style.background="#fff"; }
    },
    playRoll(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(100,t+0.2); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.2); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.2); },
    playStep(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.frequency.setValueAtTime(200,t); o.frequency.linearRampToValueAtTime(50,t+0.05); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.05); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.05); },
    playWin(){ if(this.isMuted||!this.ctx)return; this.stopBGM(); const t=this.ctx.currentTime; const notes=[523,659,784,1046]; notes.forEach((f,i)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(0.1,t+i*0.1);g.gain.linearRampToValueAtTime(0,t+i*0.1+0.1);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*0.1);o.stop(t+i*0.1+0.1);}); },
    
    // 🛠️ 6點特效：Win 3.1 Tada 風格 (C Major Chord)
    playSix(){
        if(this.isMuted||!this.ctx)return;
        const t=this.ctx.currentTime;
        // C4, E4, G4, C5 快速琶音 + 和弦
        const notes = [261.63, 329.63, 392.00, 523.25]; 
        notes.forEach((f, i) => {
            const o=this.ctx.createOscillator(); const g=this.ctx.createGain();
            o.type='triangle'; // 用 Triangle 波比較像
            o.frequency.value = f;
            
            // 每個音稍微延遲一點點，製造 "刷" 下去的感覺
            const startTime = t + (i * 0.05);
            g.gain.setValueAtTime(0, startTime);
            g.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5); // 長尾音
            
            o.connect(g); g.connect(this.ctx.destination);
            o.start(startTime); o.stop(startTime + 1.5);
        });
    },

    playBGM(){ if (this.isMuted || this.bgmInterval || !this.ctx) return; const sequence = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 0, 293.66, 349.23, 440.00, 587.33, 440.00, 349.23, 293.66, 0]; let step = 0; this.bgmInterval = setInterval(() => { if (this.ctx.state === 'suspended') this.ctx.resume(); const freq = sequence[step % sequence.length]; if (freq > 0) { const t = this.ctx.currentTime; const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); osc.type = 'sine'; osc.frequency.value = freq / 2; gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.3); } step++; }, 250); },
    stopBGM(){ if(this.bgmInterval){clearInterval(this.bgmInterval);this.bgmInterval=null;} }
};
document.getElementById('mute-btn').addEventListener('click', () => SynthEngine.toggleMute());

// --- 🎲 3D 骰子 (修正：只掉落反彈，不空轉) ---
const ThreeDice = {
    container: document.getElementById('dice-3d-container'),
    scene: null, camera: null, renderer: null, cube: null,
    isRolling: false,
    
    init() {
        if (!this.container) return;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 4, 10);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(5, 15, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const planeGeometry = new THREE.PlaneGeometry(100, 100);
        const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -2;
        plane.receiveShadow = true;
        this.scene.add(plane);

        const materials = [];
        for (let i = 1; i <= 6; i++) {
            materials.push(new THREE.MeshPhysicalMaterial({ 
                map: this.createDiceTexture(i), color: 0xffffff, roughness: 0.1, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.1
            }));
        }
        this.cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), materials);
        this.cube.castShadow = true;
        this.cube.receiveShadow = true;
        this.scene.add(this.cube);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        this.animate();
    },

    createDiceTexture(number) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8f9fa'; ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = '#dee2e6'; ctx.lineWidth = 20; ctx.strokeRect(0, 0, 512, 512);
        ctx.fillStyle = (number === 1) ? '#e74c3c' : '#2c3e50';
        ctx.shadowColor = "rgba(0,0,0,0.2)"; ctx.shadowBlur = 10; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
        const r = 50, c = 256, o = 120;
        const drawDot = (x, y) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); };
        if (number === 1) drawDot(c, c);
        if (number === 2) { drawDot(c-o, c-o); drawDot(c+o, c+o); }
        if (number === 3) { drawDot(c-o, c-o); drawDot(c, c); drawDot(c+o, c+o); }
        if (number === 4) { drawDot(c-o, c-o); drawDot(c+o, c-o); drawDot(c-o, c+o); drawDot(c+o, c+o); }
        if (number === 5) { drawDot(c-o, c-o); drawDot(c+o, c-o); drawDot(c, c); drawDot(c-o, c+o); drawDot(c+o, c+o); }
        if (number === 6) { drawDot(c-o, c-o); drawDot(c+o, c-o); drawDot(c-o, c); drawDot(c+o, c); drawDot(c-o, c+o); drawDot(c+o, c+o); }
        return new THREE.CanvasTexture(canvas);
    },

    animate() {
        requestAnimationFrame(() => this.animate());
        // 只有不滾動時才慢慢轉展示
        if (!this.isRolling && !this.container.classList.contains('active')) {
            this.cube.rotation.y += 0.005;
        }
        if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    },

    async roll(targetNumber) {
        return new Promise((resolve) => {
            this.container.classList.add('active');
            this.isRolling = true;
            SynthEngine.playRoll();

            let targetRot = { x: 0, y: 0, z: 0 };
            switch(targetNumber) {
                case 1: targetRot = {x: 0, y: -Math.PI/2, z: 0}; break; 
                case 2: targetRot = {x: 0, y: Math.PI/2, z: 0}; break;  
                case 3: targetRot = {x: Math.PI/2, y: 0, z: 0}; break;  
                case 4: targetRot = {x: -Math.PI/2, y: 0, z: 0}; break; 
                case 5: targetRot = {x: 0, y: 0, z: 0}; break;          
                case 6: targetRot = {x: Math.PI, y: 0, z: 0}; break;    
            }

            const startRot = { x: this.cube.rotation.x % (Math.PI*2), y: this.cube.rotation.y % (Math.PI*2), z: this.cube.rotation.z % (Math.PI*2) };
            const endRot = { x: targetRot.x + Math.PI * 4, y: targetRot.y + Math.PI * 4, z: targetRot.z + Math.PI * 2 };
            
            const startTime = Date.now();
            const duration = 1200;
            const startY = 12; // 更高的地方落下
            const floorY = 0;

            const settle = () => {
                const now = Date.now();
                const p = Math.min((now - startTime) / duration, 1);
                
                const easeRot = 1 - Math.pow(1 - p, 4); 
                this.cube.rotation.x = startRot.x + (endRot.x - startRot.x) * easeRot;
                this.cube.rotation.y = startRot.y + (endRot.y - startRot.y) * easeRot;
                this.cube.rotation.z = startRot.z + (endRot.z - startRot.z) * easeRot;

                // 物理彈跳模擬 (兩次反彈)
                let y = floorY;
                if (p < 0.35) { // 落下
                    const t = p / 0.35;
                    y = startY * (1 - t*t);
                } else if (p < 0.7) { // 第一次彈
                    const t = (p - 0.35) / 0.35;
                    y = 3.0 * (1 - (2*t - 1)*(2*t - 1));
                } else if (p < 0.9) { // 第二次彈
                    const t = (p - 0.7) / 0.2;
                    y = 1.0 * (1 - (2*t - 1)*(2*t - 1));
                } else {
                    y = floorY;
                }
                this.cube.position.y = y;

                if (p < 1) {
                    requestAnimationFrame(settle);
                } else {
                    // 結束
                    this.isRolling = false;
                    
                    // 🛠️ 6點特效音效
                    if (targetNumber === 6) SynthEngine.playSix();

                    // 文字特效
                    if(diceResultText) {
                        diceResultText.innerText = `${targetNumber} 點!`;
                        diceResultText.classList.add('show');
                    }
                    
                    // 停留 1.2 秒讓玩家看
                    setTimeout(() => {
                        this.container.classList.remove('active');
                        if(diceResultText) diceResultText.classList.remove('show');
                        resolve();
                    }, 1200);
                }
            };
            settle();
        });
    }
};
ThreeDice.init();

// --- 🎉 派對特效 ---
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

// --- 🎭 角色與動畫管理器 (Smart Render) ---
const AvatarManager = {
    loopIntervals: {}, movingStatus: {}, 
    getCharType(p) { return p.avatarChar || 'a'; },
    setState(playerId, state, charType) {
        if (this.movingStatus[playerId] === true && (state === 'ready' || state === 'idle')) return;
        let img = document.getElementById(`img-${playerId}`);
        if (!charType && img) charType = img.dataset.char;
        if (!charType) charType = 'a';
        if (this.loopIntervals[playerId]) { clearInterval(this.loopIntervals[playerId]); delete this.loopIntervals[playerId]; }
        
        if (img) {
            if (state === 'idle') img.src = `images/avatar_${charType}_1.png`;
            if (state === 'ready') img.src = `images/avatar_${charType}_2.png`;
            if (state === 'run') img.src = `images/avatar_${charType}_3.png`;
            if (state === 'win') img.src = `images/avatar_${charType}_5.png`;
        }

        if (state === 'run') {
            let runToggle = false;
            this.loopIntervals[playerId] = setInterval(() => {
                const currentImg = document.getElementById(`img-${playerId}`);
                if (currentImg) {
                    runToggle = !runToggle;
                    const frame = runToggle ? 4 : 3;
                    currentImg.src = `images/avatar_${charType}_${frame}.png`;
                    if (!currentImg.src.includes(`_${frame}.png`)) currentImg.src = `images/avatar_${charType}_${frame}.png`;
                    SynthEngine.playStep();
                }
            }, 150);
        } else if (state === 'win') {
            let winToggle = false;
            this.loopIntervals[playerId] = setInterval(() => {
                const currentImg = document.getElementById(`img-${playerId}`);
                if (currentImg) {
                    winToggle = !winToggle;
                    const frame = winToggle ? 1 : 5;
                    currentImg.src = `images/avatar_${charType}_${frame}.png`;
                }
            }, 400);
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
        if (myNameDisplay) myNameDisplay.innerText = me.name;
    }
    renderTracks(players);
});

socket.on('show_initiative', (sortedPlayers) => {
    let msg = `🎲 抽籤決定順序：\n`;
    sortedPlayers.forEach((p, i) => { msg += `${i+1}. ${p.name} `; if((i+1)%3 === 0) msg += "\n"; });
    gameMsg.innerText = msg;
    SynthEngine.init(); SynthEngine.playRoll();
});

socket.on('game_start', () => {
    gameMsg.innerText = "🚀 遊戲開始！";
    SynthEngine.playBGM();
    document.querySelectorAll('.avatar-img').forEach(img => {
        const id = img.id.replace('img-', '');
        AvatarManager.setState(id, 'ready', img.dataset.char);
    });
});

socket.on('update_turn', ({ turnIndex, nextPlayerId, playerName }) => {
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

    gameMsg.style.color = "#f1c40f";
    if (nextPlayerId === myId) {
        rollBtn.removeAttribute('disabled');
        rollBtn.disabled = false;
        rollBtn.innerText = "🎲 輪到你了！按此擲骰";
        rollBtn.className = "board-btn btn-green"; 
        rollBtn.style.cursor = "pointer";
        gameMsg.innerText = `👉 輪到你了！`;
    } else {
        rollBtn.setAttribute('disabled', 'true');
        rollBtn.disabled = true;
        rollBtn.innerText = "等待其他玩家...";
        rollBtn.className = "board-btn btn-grey"; 
        rollBtn.style.cursor = "not-allowed";
        gameMsg.innerText = `⏳ 等待 ${playerName} 擲骰...`;
    }
});

rollBtn.addEventListener('click', () => {
    if (rollBtn.disabled) return;
    socket.emit('action_roll');
    rollBtn.disabled = true;
    rollBtn.innerText = "📡 傳送中...";
    rollBtn.className = "board-btn btn-grey";
});

// --- 核心流程：3D骰子(2.4s) -> 移動(1s) -> 判斷 ---
socket.on('player_moved', async ({ playerId, roll, newPos }) => {
    await ThreeDice.roll(roll);

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
                // gameMsg.innerText = "等待對手行動中...";
            }
        }, 1000); 
    }, 1000); 
});

socket.on('player_finished_rank', ({ player, rank }) => {
    // 總延遲 = 骰子(2.4) + 移動(1.0) + 緩衝 = 4.0s
    // 確保跑完才顯示排名訊息
    setTimeout(() => {
        SynthEngine.playWin(); 
        AvatarManager.setState(player.id, 'win', player.avatarChar);
        // 單人暫不噴花
        if(player.id === myId) {
            gameMsg.innerText = `🎉 恭喜！你是第 ${rank} 名！`;
            rollBtn.innerText = "🏆 已完賽";
        } else {
            gameMsg.innerText = `🏁 ${player.name} 奪得第 ${rank} 名！`;
        }
    }, 4000); 
});

socket.on('game_over', ({ rankings }) => {
    // 1. 等待移動完全結束 (4.0s) -> 噴花
    setTimeout(() => {
        ConfettiManager.shoot();
        SynthEngine.playWin();
        rollBtn.classList.add('hidden');
        gameMsg.innerText = `🏆 遊戲結束！`;
        rankings.forEach(r => AvatarManager.setState(r.id, 'win', r.avatarChar));

        // 2. 噴花後再等 3 秒 -> 榜單
        setTimeout(() => {
            let rankHtml = '<ul class="rank-list">';
            rankings.forEach(p => {
                let medal = '';
                if (p.rank === 1) medal = '<span class="rank-medal">🥇</span>';
                if (p.rank === 2) medal = '<span class="rank-medal">🥈</span>';
                if (p.rank === 3) medal = '<span class="rank-medal">🥉</span>';
                const charType = p.avatarChar || 'a';
                const imgHtml = `<img class="rank-avatar" src="images/avatar_${charType}_5.png">`;
                rankHtml += `<li class="rank-item">${medal} ${imgHtml} <span class="rank-name">${p.name}</span></li>`;
            });
            rankHtml += '</ul>';
            modalContent.classList.add('premium-modal');
            showModal("🏆 榮譽榜 🏆", rankHtml);
        }, 3000);
    }, 4000);
});

socket.on('force_reload', () => { location.reload(); });

socket.on('game_reset_positions', () => {
    modalContent.classList.remove('premium-modal');
    AvatarManager.movingStatus = {}; 
    for (let key in PLAYER_POSITIONS) PLAYER_POSITIONS[key] = 0;
    if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
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
    const existingRows = Array.from(trackContainer.children);
    if (existingRows.length !== players.length) {
        trackContainer.innerHTML = '';
        players.forEach(p => createRow(p));
    } else {
        players.forEach((p, index) => {
            const row = existingRows[index];
            updateRow(row, p);
        });
    }
}

function createRow(p) {
    PLAYER_POSITIONS[p.id] = p.position;
    const row = document.createElement('div');
    row.className = 'track-row';
    row.dataset.id = p.id;
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
    img.src = `images/avatar_${charType}_1.png`;
    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.innerText = p.name;
    avatarContainer.appendChild(nameTag);
    avatarContainer.appendChild(img);
    row.appendChild(avatarContainer);
    trackContainer.appendChild(row);
}

function updateRow(row, p) {
    if (row.dataset.id !== p.id) return;
    PLAYER_POSITIONS[p.id] = p.position;
    const avatarContainer = row.querySelector('.avatar-container');
    const percent = (p.position / 22) * 100;
    if (avatarContainer.style.left !== `${percent}%`) {
        avatarContainer.style.left = `${percent}%`;
    }
    const img = row.querySelector('.avatar-img');
    const charType = p.avatarChar || 'a';
    if (AvatarManager.movingStatus[p.id]) {
        if (!img.src.includes('_3.png') && !img.src.includes('_4.png')) {
            img.src = `images/avatar_${charType}_3.png`;
        }
    }
}