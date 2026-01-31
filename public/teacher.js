const socket = io(); 

// --- DOM 元素 ---
const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');
const liveMsg = document.getElementById('live-msg');
const connectionStatus = document.getElementById('connection-status');
const orderList = document.getElementById('order-list'); 

// 開關與新元素
const chkTrap = document.getElementById('chk-trap');
const chkFate = document.getElementById('chk-fate');
const fateOverlay = document.getElementById('fate-overlay');
const fateCardBody = document.getElementById('fate-card-body');
const fateIcon = document.getElementById('fate-icon');
const fateTitle = document.getElementById('fate-title');
const fateDesc = document.getElementById('fate-desc');

// Modal
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const btnConfirm = document.getElementById('modal-btn-confirm');
const btnCancel = document.getElementById('modal-btn-cancel');
const modalContent = document.querySelector('.modal-content');

// 骰子結果
let diceResultText = document.getElementById('dice-result-text'); 
if (!diceResultText) {
    const container = document.getElementById('dice-3d-container');
    if (container) {
        diceResultText = document.createElement('div');
        diceResultText.id = 'dice-result-text';
        container.appendChild(diceResultText);
    }
}

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

// --- 🎹 SynthEngine Pro ---
const SynthEngine = {
    ctx: null, isMuted: false, bgmInterval: null,
    init() { if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;this.ctx=new AC();} if(this.ctx.state==='suspended')this.ctx.resume(); },
    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('mute-btn');
        if(this.isMuted){this.stopBGM(); btn.innerText="🔇"; btn.style.background="#ffcccc";}
        else{ if (startBtn && !startBtn.disabled === false) this.playBGM(); btn.innerText="🔊"; btn.style.background="#fff"; }
    },
    
    playImpact() {
        if(this.isMuted||!this.ctx)return;
        const t=this.ctx.currentTime;
        const o=this.ctx.createOscillator(); const g=this.ctx.createGain();
        o.type='triangle'; 
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(50, t+0.08);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.01, t+0.08);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t+0.08);
    },
    playRoll(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(100,t+0.2); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.2); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.2); },
    playStep(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.frequency.setValueAtTime(200,t); o.frequency.linearRampToValueAtTime(50,t+0.05); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.05); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.05); },
    playSix(){
        if(this.isMuted||!this.ctx)return;
        const t=this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((f,i) => { 
            const o=this.ctx.createOscillator(); const g=this.ctx.createGain();
            o.type='triangle'; o.frequency.value = f;
            const startTime = t + (i * 0.05);
            g.gain.setValueAtTime(0, startTime);
            g.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2); 
            o.connect(g); g.connect(this.ctx.destination);
            o.start(startTime); o.stop(startTime + 1.2);
        });
    },
    playSad() {
        if(this.isMuted||!this.ctx)return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(400, t);
        o.frequency.linearRampToValueAtTime(100, t + 0.8); 
        g.gain.setValueAtTime(0.3, t);
        g.gain.linearRampToValueAtTime(0, t + 0.8);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + 0.8);
    },
    playHappy() {
        if(this.isMuted||!this.ctx)return;
        const t = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => { 
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0.1, t + i*0.1);
            g.gain.exponentialRampToValueAtTime(0.001, t + i*0.1 + 0.3);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(t + i*0.1); o.stop(t + i*0.1 + 0.3);
        });
    },
    // 🔥 震撼銅管
    playVictoryGrand() {
        if(this.isMuted||!this.ctx)return;
        this.stopBGM();
        const t = this.ctx.currentTime;
        const chord = [261.63, 329.63, 392.00, 523.25];
        const rhythm = [0, 0.15, 0.3, 0.45]; 
        const lengths = [0.1, 0.1, 0.1, 2.0];
        rhythm.forEach((startTime, idx) => {
            chord.forEach((freq) => {
                const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
                o.type = 'sawtooth'; o.frequency.value = freq + (Math.random()*2-1); 
                const st = t + startTime; const dur = lengths[idx];
                g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.2, st + 0.05); g.gain.exponentialRampToValueAtTime(0.001, st + dur);
                o.connect(g); g.connect(this.ctx.destination); o.start(st); o.stop(st + dur);
            });
        });
        const kick = this.ctx.createOscillator(); const kGain = this.ctx.createGain();
        kick.frequency.setValueAtTime(150, t); kick.frequency.exponentialRampToValueAtTime(0.01, t+0.5);
        kGain.gain.setValueAtTime(0.8, t); kGain.gain.exponentialRampToValueAtTime(0.01, t+0.5);
        kick.connect(kGain); kGain.connect(this.ctx.destination); kick.start(t); kick.stop(t+0.5);
    },
    // 🔥 彩帶音效
    playConfettiPop() {
        if(this.isMuted||!this.ctx)return;
        const t = this.ctx.currentTime;
        for(let i=0; i<5; i++) {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'square';
            const startFreq = 800 + Math.random() * 500;
            o.frequency.setValueAtTime(startFreq, t + i*0.05); o.frequency.exponentialRampToValueAtTime(100, t + i*0.05 + 0.2);
            g.gain.setValueAtTime(0.1, t + i*0.05); g.gain.exponentialRampToValueAtTime(0.01, t + i*0.05 + 0.1);
            o.connect(g); g.connect(this.ctx.destination); o.start(t + i*0.05); o.stop(t + i*0.05 + 0.2);
        }
    },
    playBGM(){ if (this.isMuted || this.bgmInterval || !this.ctx) return; const sequence = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 0, 293.66, 349.23, 440.00, 587.33, 440.00, 349.23, 293.66, 0]; let step = 0; this.bgmInterval = setInterval(() => { if (this.ctx.state === 'suspended') this.ctx.resume(); const freq = sequence[step % sequence.length]; if (freq > 0) { const t = this.ctx.currentTime; const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); osc.type = 'sine'; osc.frequency.value = freq / 2; gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.3); } step++; }, 250); },
    stopBGM(){ if(this.bgmInterval){clearInterval(this.bgmInterval);this.bgmInterval=null;} }
};
document.getElementById('mute-btn').addEventListener('click', () => SynthEngine.toggleMute());

// --- 3D Dice ---
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
            materials.push(new THREE.MeshPhysicalMaterial({ map: this.createDiceTexture(i), color: 0xffffff, roughness: 0.1, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.1 }));
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
        if (!this.isRolling && !this.container.classList.contains('active')) { this.cube.rotation.y += 0.005; }
        if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    },
    async roll(targetNumber) {
        return new Promise((resolve) => {
            this.container.classList.add('active');
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
            const startY = 12; const floorY = 0;
            let hasBounced1 = false; let hasBounced2 = false;
            const settle = () => {
                const now = Date.now();
                const p = Math.min((now - startTime) / duration, 1);
                const easeRot = 1 - Math.pow(1 - p, 4); 
                this.cube.rotation.x = startRot.x + (endRot.x - startRot.x) * easeRot;
                this.cube.rotation.y = startRot.y + (endRot.y - startRot.y) * easeRot;
                this.cube.rotation.z = startRot.z + (endRot.z - startRot.z) * easeRot;
                let y = floorY;
                if (p < 0.35) { y = startY * (1 - (p/0.35)*(p/0.35)); } 
                else if (p < 0.7) { 
                    if(!hasBounced1) { SynthEngine.playImpact(); hasBounced1 = true; }
                    const t = (p - 0.35) / 0.35; y = 3.0 * (1 - (2*t - 1)*(2*t - 1)); 
                } 
                else if (p < 0.9) { 
                    if(!hasBounced2) { SynthEngine.playImpact(); hasBounced2 = true; }
                    const t = (p - 0.7) / 0.2; y = 1.0 * (1 - (2*t - 1)*(2*t - 1)); 
                } else { y = floorY; }
                this.cube.position.y = y;
                if (p < 1) { requestAnimationFrame(settle); } else {
                    if (targetNumber === 6) SynthEngine.playSix();
                    if(diceResultText) { diceResultText.innerText = `${targetNumber} 點!`; diceResultText.classList.add('show'); }
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

const ConfettiManager = {
    shoot() {
        // 🔥 播放彩帶音效
        SynthEngine.playConfettiPop();
        
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
                    const currentSrc = currentImg.getAttribute('src');
                    const frame = currentSrc.includes('_3.png') ? 4 : 3;
                    currentImg.src = `images/avatar_${charType}_${frame}.png`;
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
    start() { if (this.interval) return; this.updateBg(); this.interval = setInterval(() => { this.toggle = (this.toggle === 1) ? 2 : 1; this.updateBg(); }, 800); },
    updateBg() {
        if(this.topDiv) this.topDiv.style.backgroundImage = `url('images/audience_up_${this.toggle}.png')`;
        if(this.btmDiv) this.btmDiv.style.backgroundImage = `url('images/audience_down_${this.toggle}.png')`;
    }
};
AudienceManager.start();

function showModal(title, text, isConfirm = false, onConfirm = null) {
    if (!modalContent) return; 
    modalContent.className = "modal-content"; 
    modalTitle.innerText = title;
    modalBody.innerHTML = text; 
    modalOverlay.classList.remove('hidden');
    if (isConfirm) {
        if(btnConfirm) {
            btnConfirm.innerText = "確定執行"; 
            btnConfirm.className = "board-btn btn-green"; 
            btnConfirm.onclick = () => { if (onConfirm) onConfirm(); closeModal(); };
        }
        if(btnCancel) { btnCancel.classList.remove('hidden'); btnCancel.onclick = closeModal; }
    } else {
        if(btnConfirm) { btnConfirm.innerText = "知道了"; btnConfirm.className = "board-btn btn-green"; btnConfirm.onclick = closeModal; }
        if(btnCancel) btnCancel.classList.add('hidden');
    }
}
function closeModal() { modalOverlay.classList.add('hidden'); }
function clearAllSpecialTiles() { const cells = document.querySelectorAll('.grid-cell'); cells.forEach(cell => { if (cell.style.backgroundImage) cell.style.backgroundImage = ''; }); }
function restoreTile(playerId, tileIndex) {
    if (tileIndex < 0) return;
    const row = Array.from(trackContainer.children).find(r => r.dataset.id === playerId);
    if (!row) return;
    const cells = row.querySelectorAll('.grid-cell');
    if (cells[tileIndex]) { cells[tileIndex].style.backgroundImage = "url('images/map_runway.png')"; }
}

socket.on('connect', () => { connectionStatus.innerText = "🟢 伺服器已連線"; connectionStatus.style.color = "#2ecc71"; socket.emit('admin_login'); });
socket.on('disconnect', () => { connectionStatus.innerText = "🔴 與伺服器斷線"; connectionStatus.style.color = "#e74c3c"; });
socket.on('update_player_list', (players) => { updateView(players); });
socket.on('update_game_state', (gameState) => {
    updateView(gameState.players);
    if (gameState.status === 'PLAYING') {
        startBtn.disabled = true; startBtn.innerText = "遊戲進行中"; startBtn.className = "board-btn btn-grey";
        restartBtn.disabled = true; restartBtn.className = "board-btn btn-grey";
        chkTrap.disabled = true; chkFate.disabled = true; 
    } else if (gameState.status === 'ENDED') {
        startBtn.disabled = true; startBtn.innerText = "本局結束"; startBtn.className = "board-btn btn-grey";
        restartBtn.disabled = false; restartBtn.className = "board-btn btn-orange";
        SynthEngine.stopBGM();
    } else {
        startBtn.disabled = false; startBtn.innerText = "開始遊戲"; startBtn.className = "board-btn btn-green"; 
        restartBtn.disabled = true; restartBtn.className = "board-btn btn-grey";
        chkTrap.disabled = false; chkFate.disabled = false; 
        SynthEngine.stopBGM();
    }
});
socket.on('game_reset_positions', () => {
    closeModal();
    if(modalContent) modalContent.classList.remove('premium-modal');
    AvatarManager.movingStatus = {}; 
    for (let key in PLAYER_POSITIONS) PLAYER_POSITIONS[key] = 0;
    clearAllSpecialTiles();
    if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
    orderList.innerHTML = "等待抽籤...";
    document.querySelectorAll('.avatar-img').forEach(img => { const id = img.id.replace('img-', ''); AvatarManager.setState(id, 'idle', img.dataset.char); img.className = 'avatar-img'; });
    modalOverlay.classList.add('hidden');
    const cells = document.querySelectorAll('.grid-cell');
    cells.forEach(c => { if(c.style.backgroundImage.includes('hole') || c.style.backgroundImage.includes('question')) { c.style.backgroundImage = "url('images/map_runway.png')"; } });
    startBtn.innerText = "開始遊戲"; startBtn.disabled = false; startBtn.className = "board-btn btn-green";
    SynthEngine.stopBGM();
});
socket.on('show_initiative', (sortedPlayers) => {
    let html = '';
    sortedPlayers.forEach((p, i) => { html += `<div style="margin-bottom:5px; border-bottom:1px solid #444; padding:2px;"><span style="color:#aaa;">#${i+1}</span> <span style="font-weight:bold; color:#fff;">${p.name}</span></div>`; });
    if(orderList) orderList.innerHTML = html;
    SynthEngine.playRoll();
});
socket.on('game_start', () => {
    liveMsg.innerText = "🚀 比賽開始！";
    SynthEngine.playBGM();
    clearAllSpecialTiles();
    document.querySelectorAll('.avatar-img').forEach(img => { const id = img.id.replace('img-', ''); AvatarManager.setState(id, 'ready', img.dataset.char); });
});
socket.on('update_turn', ({ turnIndex, nextPlayerId, playerName }) => {
    if(orderList) { const rows = orderList.querySelectorAll('div'); rows.forEach(r => r.classList.remove('order-active')); if(rows[turnIndex]) rows[turnIndex].classList.add('order-active'); }
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
    if(liveMsg) { liveMsg.innerText = `👉 輪到 ${playerName}`; liveMsg.style.color = "#f1c40f"; }
});

socket.on('player_moved', async ({ playerId, roll, newPos, initialLandPos, triggerType, fateResult, trapPos }) => {
    await ThreeDice.roll(roll);
    const avatarContainer = document.getElementById(`avatar-${playerId}`);
    const nameTag = avatarContainer ? avatarContainer.querySelector('.name-tag') : null;
    const playerName = nameTag ? nameTag.innerText : '未知玩家';
    const img = document.getElementById(`img-${playerId}`);
    const charType = img ? img.dataset.char : 'a';
    if (liveMsg && playerName) liveMsg.innerText = `${playerName} 擲出了 ${roll} 點!`;

    await moveAvatar(playerId, initialLandPos, charType);

    if (triggerType === 'TRAP') {
        if(liveMsg) liveMsg.innerHTML = `<span style="color:#e74c3c">😱 ${playerName} 踩到了陷阱！</span>`;
        // ❌ 移除這行的 restoreTile (移動到動畫函式內)
        await playTrapAnimation(img, playerId, newPos, charType, initialLandPos); // 傳入 initialLandPos
    
    } else if (triggerType === 'FATE') {
        if(liveMsg) liveMsg.innerHTML = `<span style="color:#3498db">❓ ${playerName} 觸發了命運機會！</span>`;
        restoreTile(playerId, initialLandPos);
        showFateCard(fateResult);
        await wait(2500); 
        if (fateResult > 0) SynthEngine.playHappy(); else SynthEngine.playSad();
        if (liveMsg) liveMsg.innerText = `移動 ${fateResult} 格！`;
        await moveAvatar(playerId, newPos, charType);

    } else if (triggerType === 'FATE_TRAP') {
        if(liveMsg) liveMsg.innerHTML = `<span style="color:#3498db">❓ ${playerName} 觸發了命運機會...</span>`;
        restoreTile(playerId, initialLandPos);
        showFateCard(fateResult);
        await wait(2500);
        if (fateResult > 0) SynthEngine.playHappy(); else SynthEngine.playSad();
        if (liveMsg) liveMsg.innerText = `移動 ${fateResult} 格...`;
        await moveAvatar(playerId, trapPos, charType);
        await wait(500);
        if(liveMsg) liveMsg.innerHTML = `<span style="color:#e74c3c">😱 結果掉進洞裡了！</span>`;
        await playTrapAnimation(img, playerId, newPos, charType, trapPos);
    }
    AvatarManager.movingStatus[playerId] = false;
    if (newPos >= 21) { AvatarManager.setState(playerId, 'win', charType); } 
    else { AvatarManager.setState(playerId, 'idle', charType); }
});

function moveAvatar(playerId, targetPos, charType, instant = false) {
    return new Promise(resolve => {
        PLAYER_POSITIONS[playerId] = targetPos;
        const avatarContainer = document.getElementById(`avatar-${playerId}`);
        if (instant) {
            if (avatarContainer) {
                avatarContainer.style.transition = 'none'; 
                const percent = (targetPos / 22) * 100; 
                avatarContainer.style.left = `${percent}%`;
                setTimeout(() => { avatarContainer.style.transition = 'left 1s linear'; resolve(); }, 50);
            } else resolve();
        } else {
            AvatarManager.movingStatus[playerId] = true;
            AvatarManager.setState(playerId, 'run', charType);
            if (avatarContainer) {
                const percent = (targetPos / 22) * 100; 
                avatarContainer.style.left = `${percent}%`;
            }
            setTimeout(() => { resolve(); }, 1000); 
        }
    });
}

// 🔥 修正：陷阱動畫，加入 restoreTile 參數
async function playTrapAnimation(img, playerId, resetPos, charType, trapTileIndex) {
    if(img) img.classList.add('avatar-trap-shake');
    SynthEngine.playSad(); 
    await wait(500);
    
    if(img) {
        img.classList.remove('avatar-trap-shake');
        img.classList.add('avatar-trap-fall');
    }
    await wait(800);

    // 🔥 核心修正：這時候才把地板變回跑道
    restoreTile(playerId, trapTileIndex);

    // 重置回起點
    await moveAvatar(playerId, resetPos, charType, true); 
    
    if(img) {
        img.classList.remove('avatar-trap-fall');
        img.style.opacity = '1';
        img.style.transform = 'none';
    }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function showFateCard(amount) {
    if(!fateOverlay) return;
    if (amount > 0) { fateCardBody.className = "fate-card fate-positive"; fateIcon.innerText = "🚀"; fateTitle.innerText = "好運降臨"; fateDesc.innerText = `前進 ${Math.abs(amount)} 格！`; } 
    else { fateCardBody.className = "fate-card fate-negative"; fateIcon.innerText = "🌪️"; fateTitle.innerText = "厄運纏身"; fateDesc.innerText = `後退 ${Math.abs(amount)} 格...`; }
    fateOverlay.classList.add('show'); setTimeout(() => { fateOverlay.classList.remove('show'); }, 2000);
}
socket.on('player_finished_rank', ({ player, rank }) => {
    setTimeout(() => {
        // 🔥 使用新版震撼音效
        SynthEngine.playVictoryGrand(); 
        AvatarManager.setState(player.id, 'win', player.avatarChar);
        if(liveMsg) liveMsg.innerHTML = `👏 <span style="color:#2ecc71">${player.name}</span> 獲得第 ${rank} 名！`;
    }, 100); 
});
socket.on('game_over', ({ rankings }) => {
    setTimeout(() => {
        ConfettiManager.shoot();
        // 🔥 使用新版震撼音效
        SynthEngine.playVictoryGrand();
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
                const imgHtml = `<img class="rank-avatar" data-char="${charType}" src="images/avatar_${charType}_5.png">`;
                rankHtml += `<li class="rank-item">${medal} ${imgHtml} <span class="rank-name">${p.name}</span></li>`;
            });
            rankHtml += '</ul>';
            showModal("🏆 榮譽榜 🏆", rankHtml);
            if(modalContent) modalContent.classList.add('premium-modal'); 
            let toggle = false;
            setInterval(() => {
                toggle = !toggle;
                const avatars = document.querySelectorAll('.rank-avatar');
                avatars.forEach(img => {
                    const c = img.dataset.char || 'a';
                    img.src = `images/avatar_${c}_${toggle ? 1 : 5}.png`;
                });
            }, 400);
        }, 3000);
    }, 100); 
});
socket.on('force_reload', () => { location.reload(); });
startBtn.addEventListener('click', () => {
    SynthEngine.init(); 
    startBtn.disabled = true; startBtn.innerText = "啟動中...";
    const options = { enableTraps: chkTrap.checked, enableFate: chkFate.checked };
    socket.emit('admin_start_game', options);
});
restartBtn.addEventListener('click', () => { showModal("準備下一局", "確定要讓所有學生回到起跑線嗎？\n(排名將會重置，但保留玩家)", true, () => { socket.emit('admin_restart_game'); }); });
resetBtn.addEventListener('click', () => { showModal("危險操作", "確定要踢除所有玩家並回到首頁嗎？\n(若只是要重玩，請按「下一局」)", true, () => { socket.emit('admin_reset_game'); trackContainer.innerHTML = ''; playerCountSpan.innerText = 0; liveMsg.innerText = "等待學生加入..."; SynthEngine.stopBGM(); }); });
function updateView(players) { if (!players) players = []; playerCountSpan.innerText = players.length; renderTracks(players); }
function renderTracks(players) {
    const existingRows = Array.from(trackContainer.children);
    if (existingRows.length !== players.length) { trackContainer.innerHTML = ''; players.forEach(p => createRow(p)); } 
    else { players.forEach((p, index) => { const row = existingRows[index]; updateRow(row, p); }); }
}
function createRow(p) {
    PLAYER_POSITIONS[p.id] = p.position;
    const row = document.createElement('div');
    row.className = 'track-row';
    row.dataset.id = p.id;
    for(let i=0; i<22; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        if (p.trapIndex !== -1 && i === p.trapIndex) cell.style.backgroundImage = "url('images/map_hole.png')";
        else if (p.fateIndex !== -1 && i === p.fateIndex) cell.style.backgroundImage = "url('images/map_question.png')";
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
    const cells = row.querySelectorAll('.grid-cell');
    if (p.trapIndex !== -1) { const cell = cells[p.trapIndex]; if (cell && !cell.style.backgroundImage.includes('hole')) cell.style.backgroundImage = "url('images/map_hole.png')"; }
    if (p.fateIndex !== -1) { const cell = cells[p.fateIndex]; if (cell && !cell.style.backgroundImage.includes('question')) cell.style.backgroundImage = "url('images/map_question.png')"; }
    const avatarContainer = row.querySelector('.avatar-container');
    const currentLeft = parseFloat(avatarContainer.style.left) || 0;
    const targetLeft = (p.position / 22) * 100;
    if (Math.abs(currentLeft - targetLeft) > 5 && !AvatarManager.movingStatus[p.id]) { avatarContainer.style.left = `${targetLeft}%`; }
}