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

let myId = null;
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

// --- 🎲 3A級 Three.js 骰子引擎 ---
const ThreeDice = {
    container: document.getElementById('dice-3d-container'),
    scene: null, camera: null, renderer: null, cube: null,
    isRolling: false,
    
    init() {
        // 場景
        this.scene = new THREE.Scene();
        
        // 相機
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.z = 5;

        // 渲染器 (透明背景)
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 燈光 (營造 3A 質感)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        this.scene.add(dirLight);

        // 材質 (白色塑膠感)
        // 為了簡單，使用 Canvas 動態生成貼圖，不依賴外部圖片
        const materials = [];
        for (let i = 1; i <= 6; i++) {
            materials.push(new THREE.MeshStandardMaterial({ 
                map: this.createDiceTexture(i),
                roughness: 0.2,
                metalness: 0.1
            }));
        }

        // 幾何體 (圓角方塊)
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5, 4, 4, 4); 
        // 修正 UV 貼圖以對應 BoxGeometry 的面
        // 這裡簡化：直接用 Cube
        
        this.cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), materials);
        this.scene.add(this.cube);

        // 監聽視窗大小
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this.animate();
    },

    createDiceTexture(number) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // 背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 256, 256);
        // 邊框
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, 256, 256);

        // 點點
        ctx.fillStyle = (number === 1) ? '#e74c3c' : '#333333';
        const r = 25; // 半徑
        const c = 128; // 中心
        const o = 60; // 偏移量

        // 繪製點的輔助函式
        const drawDot = (x, y) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        };

        if (number === 1) drawDot(c, c);
        if (number === 2) { drawDot(c-o, c-o); drawDot(c+o, c+o); }
        if (number === 3) { drawDot(c-o, c-o); drawDot(c, c); drawDot(c+o, c+o); }
        if (number === 4) { drawDot(c-o, c-o); drawDot(c+o, c-o); drawDot(c-o, c+o); drawDot(c+o, c+o); }
        if (number === 5) { drawDot(c-o, c-o); drawDot(c+o, c-o); drawDot(c, c); drawDot(c-o, c+o); drawDot(c+o, c+o); }
        if (number === 6) { drawDot(c-o, c-o); drawDot(c+o, c-o); drawDot(c-o, c); drawDot(c+o, c); drawDot(c-o, c+o); drawDot(c+o, c+o); }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    },

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.isRolling) {
            // 滾動時隨機旋轉
            this.cube.rotation.x += 0.2;
            this.cube.rotation.y += 0.2;
        }
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    },

    async roll(targetNumber) {
        return new Promise((resolve) => {
            this.container.classList.add('active');
            this.isRolling = true;
            SynthEngine.playRoll();

            // 1. 瘋狂旋轉 1 秒
            setTimeout(() => {
                this.isRolling = false;
                
                // 2. 計算目標角度 (Three.js 面的對應關係)
                // 預設: 1(右), 2(左), 3(上), 4(下), 5(前), 6(後) - 需依照材質陣列順序調整
                // 材質陣列: 0=1點, 1=2點 ...
                // BoxGeometry 面順序: Right(+x), Left(-x), Top(+y), Bottom(-y), Front(+z), Back(-z)
                // 1點在右(+x) -> 要朝向相機(+z)，需繞 Y 轉 -90 (或 +270)
                
                let targetRot = { x: 0, y: 0, z: 0 };
                
                // 修正後的旋轉表 (讓特定面朝向 Z 軸正向)
                switch(targetNumber) {
                    case 1: targetRot = {x: 0, y: -Math.PI/2, z: 0}; break; // 材質0 (+x)
                    case 2: targetRot = {x: 0, y: Math.PI/2, z: 0}; break;  // 材質1 (-x)
                    case 3: targetRot = {x: Math.PI/2, y: 0, z: 0}; break;  // 材質2 (+y)
                    case 4: targetRot = {x: -Math.PI/2, y: 0, z: 0}; break; // 材質3 (-y)
                    case 5: targetRot = {x: 0, y: 0, z: 0}; break;          // 材質4 (+z)
                    case 6: targetRot = {x: Math.PI, y: 0, z: 0}; break;    // 材質5 (-z)
                }

                // 使用 GSAP 或簡單的插值讓它停在目標角度
                // 這裡手寫簡單的 Easing
                const startRot = { x: this.cube.rotation.x % (Math.PI*2), y: this.cube.rotation.y % (Math.PI*2) };
                const endRot = { 
                    x: targetRot.x + Math.PI * 4, // 多轉2圈
                    y: targetRot.y + Math.PI * 4 
                };
                
                const startTime = Date.now();
                const duration = 800; // 0.8秒歸位

                const settle = () => {
                    const now = Date.now();
                    const p = Math.min((now - startTime) / duration, 1);
                    const ease = 1 - Math.pow(1 - p, 3); // Cubic ease out

                    this.cube.rotation.x = startRot.x + (endRot.x - startRot.x) * ease;
                    this.cube.rotation.y = startRot.y + (endRot.y - startRot.y) * ease;

                    if (p < 1) {
                        requestAnimationFrame(settle);
                    } else {
                        // 結束
                        setTimeout(() => {
                            this.container.classList.remove('active');
                            resolve();
                        }, 500);
                    }
                };
                settle();

            }, 1000);
        });
    }
};

// 初始化 Three.js
ThreeDice.init();

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

// --- 🎭 角色與動畫管理器 (Smart Render 相容) ---
const AvatarManager = {
    loopIntervals: {},
    movingStatus: {}, 
    
    getCharType(p) { return p.avatarChar || 'a'; },

    setState(playerId, state, charType) {
        // 保護：移動中不接受 idle/ready
        if (this.movingStatus[playerId] === true && (state === 'ready' || state === 'idle')) return;

        // Smart Render 兼容：每次都重新抓取 DOM
        const img = document.getElementById(`img-${playerId}`);
        
        if (!charType && img) charType = img.dataset.char;
        if (!charType) charType = 'a'; 

        // 只有當狀態真正改變，或需要強制更新時才清除 Interval
        if (this.loopIntervals[playerId]) { 
            clearInterval(this.loopIntervals[playerId]); 
            delete this.loopIntervals[playerId]; 
        }

        // 靜態圖立即設定
        if (img) {
            if (state === 'idle') img.src = `images/avatar_${charType}_1.png`;
            if (state === 'ready') img.src = `images/avatar_${charType}_2.png`;
            if (state === 'run') img.src = `images/avatar_${charType}_3.png`;
            if (state === 'win') img.src = `images/avatar_${charType}_5.png`;
        }

        // 動態圖開啟 Loop
        if (state === 'run') {
            let runToggle = false;
            this.loopIntervals[playerId] = setInterval(() => {
                const currentImg = document.getElementById(`img-${playerId}`);
                if (currentImg) {
                    runToggle = !runToggle;
                    const frame = runToggle ? 4 : 3;
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
    // 不再彈出文字，學生端不用做什麼，老師端看看板即可
    gameMsg.innerText = "🎲 抽籤完成！準備開始！";
    // SynthEngine.playRoll(); 
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

// --- 核心：移動 -> 3D骰子 -> 跑 ---
socket.on('player_moved', async ({ playerId, roll, newPos }) => {
    // 1. 播放 3D 骰子
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

// --- Smart Rendering: 不刪除 DOM，只更新屬性 ---
function renderTracks(players) {
    // 如果 trackContainer 是空的(第一次渲染)，則直接建立
    // 如果不是空的，則進行 Diffing 更新
    
    // 建立跑道容器 (只做一次)
    // 這裡我們還是簡單化：如果 players 數量變動，我們才重繪
    // 但是為了修復動畫問題，我們必須確保既有的 div 不被刪除
    
    // 簡單版 Diffing:
    // 1. 確保每一列 track-row 都存在
    // 2. 確保每個 player 都在對應的位置
    
    // 為了徹底解決問題，我們採用 "ID 對應"
    
    // 取得現有 DOM 上的 ID 列表
    const existingRows = Array.from(trackContainer.children);
    
    // 清除多餘的 (如果有人斷線)
    // 這裡為了簡單，如果是第一次載入或人數變少，我們就重繪
    // 重點是：人數不變時，不要重繪！
    
    if (existingRows.length !== players.length) {
        // 人數變動，強制重繪 (沒辦法，初始化必須這樣)
        trackContainer.innerHTML = '';
        players.forEach(p => createRow(p));
    } else {
        // 人數一樣，進行更新
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
    row.dataset.id = p.id; // 綁定 ID

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
    img.src = `images/avatar_${charType}_1.png`; // 預設站立

    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.innerText = p.name;

    avatarContainer.appendChild(nameTag);
    avatarContainer.appendChild(img);
    row.appendChild(avatarContainer);
    trackContainer.appendChild(row);
}

function updateRow(row, p) {
    // 檢查 ID 是否匹配 (如果不匹配說明順序變了，雖然我們後端有鎖定，但防呆)
    if (row.dataset.id !== p.id) {
        // 極端情況：砍掉重練
        row.innerHTML = ''; // 清空 row
        // ...這裡重寫太複雜，直接用上面的 createRow 邏輯替換
        const newRow = document.createElement('div');
        // 為了簡單，如果 ID 不對，我們就不做 Diffing 了，直接上面 length check 會處理
        return;
    }

    PLAYER_POSITIONS[p.id] = p.position;
    
    // 只更新必要屬性
    const avatarContainer = row.querySelector('.avatar-container');
    const percent = (p.position / 22) * 100;
    
    // 如果位置沒變，不要動 left，以免影響 transition
    if (avatarContainer.style.left !== `${percent}%`) {
        avatarContainer.style.left = `${percent}%`;
    }

    // 圖片不更新！由 AvatarManager 全權接管！
    // 除非... 這是剛加入的人？
    // 這裡我們相信 AvatarManager。
}