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

// Modal 相關
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalBtn = document.getElementById('modal-btn'); 
const modalContent = document.querySelector('.modal-content');

const diceResultText = document.getElementById('dice-result-text'); 
const myNameDisplay = document.getElementById('my-name-display'); 
const fateOverlay = document.getElementById('fate-overlay');
const fateCardBody = document.getElementById('fate-card-body');
const fateIcon = document.getElementById('fate-icon');
const fateTitle = document.getElementById('fate-title');
const fateDesc = document.getElementById('fate-desc');

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

// --- SynthEngine Pro ---
const SynthEngine = {
    ctx: null, isMuted: false, bgmInterval: null,
    init() { if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)this.ctx=new AC();} if(this.ctx && this.ctx.state==='suspended')this.ctx.resume(); },
    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('mute-btn');
        if(this.isMuted){this.stopBGM(); if(btn){btn.innerText="🔇"; btn.style.background="#ffcccc";}}
        else{ if (rollBtn && !rollBtn.disabled) this.playBGM(); if(btn){btn.innerText="🔊"; btn.style.background="#fff";} }
    },
    playImpact(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(50,t+0.08);g.gain.setValueAtTime(0.5,t);g.gain.exponentialRampToValueAtTime(0.01,t+0.08);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+0.08);},
    playRoll(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(400,t);o.frequency.exponentialRampToValueAtTime(100,t+0.2);g.gain.setValueAtTime(0.1,t);g.gain.linearRampToValueAtTime(0,t+0.2);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+0.2);},
    playStep(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.frequency.setValueAtTime(200,t);o.frequency.linearRampToValueAtTime(50,t+0.05);g.gain.setValueAtTime(0.1,t);g.gain.linearRampToValueAtTime(0,t+0.05);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+0.05);},
    playSix(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;[523.25,659.25,783.99,1046.50].forEach((f,i)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='triangle';o.frequency.value=f;const s=t+(i*0.05);g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(0.2,s+0.05);g.gain.exponentialRampToValueAtTime(0.001,s+1.2);o.connect(g);g.connect(this.ctx.destination);o.start(s);o.stop(s+1.2);});},
    playSad(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(400,t);o.frequency.linearRampToValueAtTime(100,t+0.8);g.gain.setValueAtTime(0.3,t);g.gain.linearRampToValueAtTime(0,t+0.8);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+0.8);},
    playHappy(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;[523.25,659.25,783.99,1046.50].forEach((f,i)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0.1,t+i*0.1);g.gain.exponentialRampToValueAtTime(0.001,t+i*0.1+0.3);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*0.1);o.stop(t+i*0.1+0.3);});},
    playVictoryGrand(){if(this.isMuted||!this.ctx)return;this.stopBGM();const t=this.ctx.currentTime;const c=[261.63,329.63,392.00,523.25];const r=[0,0.15,0.3,0.45];const l=[0.1,0.1,0.1,2.0];r.forEach((st,idx)=>{c.forEach((f)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='sawtooth';o.frequency.value=f+(Math.random()*2-1);const s=t+st;const d=l[idx];g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(0.2,s+0.05);g.gain.exponentialRampToValueAtTime(0.001,s+d);o.connect(g);g.connect(this.ctx.destination);o.start(s);o.stop(s+d);});});const k=this.ctx.createOscillator();const kg=this.ctx.createGain();k.frequency.setValueAtTime(150,t);k.frequency.exponentialRampToValueAtTime(0.01,t+0.5);kg.gain.setValueAtTime(0.8,t);kg.gain.exponentialRampToValueAtTime(0.01,t+0.5);k.connect(kg);kg.connect(this.ctx.destination);k.start(t);k.stop(t+0.5);},
    playWhistle(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='sine';o.frequency.setValueAtTime(1000,t);o.frequency.linearRampToValueAtTime(1500,t+0.1);o.frequency.linearRampToValueAtTime(1000,t+0.2);g.gain.setValueAtTime(0.1,t);g.gain.linearRampToValueAtTime(0,t+0.3);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+0.3);},
    playConfettiPop(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;for(let i=0;i<5;i++){const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='square';o.frequency.setValueAtTime(800+Math.random()*500,t+i*0.05);o.frequency.exponentialRampToValueAtTime(100,t+i*0.05+0.2);g.gain.setValueAtTime(0.1,t+i*0.05);g.gain.exponentialRampToValueAtTime(0.01,t+i*0.05+0.1);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*0.05);o.stop(t+i*0.05+0.2);}},
    playPopup(){if(this.isMuted||!this.ctx)return;const t=this.ctx.currentTime;const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(600,t);o.frequency.linearRampToValueAtTime(1200,t+0.1);g.gain.setValueAtTime(0.2,t);g.gain.linearRampToValueAtTime(0,t+0.1);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+0.1);},
    playBGM(){if(this.isMuted||this.bgmInterval||!this.ctx)return;const seq=[261.63,329.63,392.00,523.25,392.00,329.63,261.63,0,293.66,349.23,440.00,587.33,440.00,349.23,293.66,0];let s=0;this.bgmInterval=setInterval(()=>{if(this.ctx.state==='suspended')this.ctx.resume();const f=seq[s%seq.length];if(f>0){const t=this.ctx.currentTime;const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='sine';o.frequency.value=f/2;g.gain.setValueAtTime(0.2,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.3);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+0.3);}s++;},250);},
    stopBGM(){if(this.bgmInterval){clearInterval(this.bgmInterval);this.bgmInterval=null;}}
};
document.getElementById('mute-btn').addEventListener('click', () => SynthEngine.toggleMute());

// --- 3D Dice ---
const ThreeDice={container:document.getElementById('dice-3d-container'),scene:null,camera:null,renderer:null,cube:null,isRolling:false,init(){if(!this.container)return;this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(45,window.innerWidth/window.innerHeight,0.1,100);this.camera.position.set(0,4,10);this.camera.lookAt(0,0,0);this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});this.renderer.setSize(window.innerWidth,window.innerHeight);this.renderer.setPixelRatio(window.devicePixelRatio);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.container.appendChild(this.renderer.domElement);const al=new THREE.AmbientLight(0xffffff,0.6);this.scene.add(al);const dl=new THREE.DirectionalLight(0xffffff,1.2);dl.position.set(5,15,10);dl.castShadow=true;this.scene.add(dl);const pg=new THREE.PlaneGeometry(100,100);const pm=new THREE.ShadowMaterial({opacity:0.3});const p=new THREE.Mesh(pg,pm);p.rotation.x=-Math.PI/2;p.position.y=-2;p.receiveShadow=true;this.scene.add(p);const mats=[];for(let i=1;i<=6;i++){mats.push(new THREE.MeshPhysicalMaterial({map:this.createDiceTexture(i),color:0xffffff,roughness:0.1,metalness:0.0,clearcoat:1.0,clearcoatRoughness:0.1}));}this.cube=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),mats);this.cube.castShadow=true;this.cube.receiveShadow=true;this.scene.add(this.cube);window.addEventListener('resize',()=>{this.camera.aspect=window.innerWidth/window.innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(window.innerWidth,window.innerHeight);});this.animate();},createDiceTexture(n){const c=document.createElement('canvas');c.width=512;c.height=512;const x=c.getContext('2d');x.fillStyle='#f8f9fa';x.fillRect(0,0,512,512);x.strokeStyle='#dee2e6';x.lineWidth=20;x.strokeRect(0,0,512,512);x.fillStyle=(n===1)?'#e74c3c':'#2c3e50';x.shadowColor="rgba(0,0,0,0.2)";x.shadowBlur=10;x.shadowOffsetX=4;x.shadowOffsetY=4;const r=50,cen=256,o=120;const d=(u,v)=>{x.beginPath();x.arc(u,v,r,0,Math.PI*2);x.fill();};if(n===1)d(cen,cen);if(n===2){d(cen-o,cen-o);d(cen+o,cen+o);}if(n===3){d(cen-o,cen-o);d(cen,cen);d(cen+o,cen+o);}if(n===4){d(cen-o,cen-o);d(cen+o,cen-o);d(cen-o,cen+o);d(cen+o,cen+o);}if(n===5){d(cen-o,cen-o);d(cen+o,cen-o);d(cen,cen);d(cen-o,cen+o);d(cen+o,cen+o);}if(n===6){d(cen-o,cen-o);d(cen+o,cen-o);d(cen-o,cen);d(cen+o,cen);d(cen-o,cen+o);d(cen+o,cen+o);}return new THREE.CanvasTexture(c);},animate(){requestAnimationFrame(()=>this.animate());if(!this.isRolling&&!this.container.classList.contains('active')){this.cube.rotation.y+=0.005;}if(this.renderer&&this.scene&&this.camera)this.renderer.render(this.scene,this.camera);},async roll(n){return new Promise((res)=>{this.container.classList.add('active');SynthEngine.playRoll();let tr={x:0,y:0,z:0};switch(n){case 1:tr={x:0,y:-Math.PI/2,z:0};break;case 2:tr={x:0,y:Math.PI/2,z:0};break;case 3:tr={x:Math.PI/2,y:0,z:0};break;case 4:tr={x:-Math.PI/2,y:0,z:0};break;case 5:tr={x:0,y:0,z:0};break;case 6:tr={x:Math.PI,y:0,z:0};break;}const sr={x:this.cube.rotation.x%(Math.PI*2),y:this.cube.rotation.y%(Math.PI*2),z:this.cube.rotation.z%(Math.PI*2)};const er={x:tr.x+Math.PI*4,y:tr.y+Math.PI*4,z:tr.z+Math.PI*2};const st=Date.now();const dur=1200;let hb1=false;let hb2=false;const set=()=>{const now=Date.now();const p=Math.min((now-st)/dur,1);const e=1-Math.pow(1-p,4);this.cube.rotation.x=sr.x+(er.x-sr.x)*e;this.cube.rotation.y=sr.y+(er.y-sr.y)*e;this.cube.rotation.z=sr.z+(er.z-sr.z)*e;let y=0;if(p<0.35){y=12*(1-(p/0.35)*(p/0.35));}else if(p<0.7){if(!hb1){SynthEngine.playImpact();hb1=true;}const t=(p-0.35)/0.35;y=3.0*(1-(2*t-1)*(2*t-1));}else if(p<0.9){if(!hb2){SynthEngine.playImpact();hb2=true;}const t=(p-0.7)/0.2;y=1.0*(1-(2*t-1)*(2*t-1));}this.cube.position.y=y;if(p<1){requestAnimationFrame(set);}else{if(n===6)SynthEngine.playSix();if(diceResultText){diceResultText.innerText=`${n} 點!`;diceResultText.classList.add('show');}setTimeout(()=>{this.container.classList.remove('active');if(diceResultText)diceResultText.classList.remove('show');res();},1200);}};set();});}};
try { ThreeDice.init(); } catch(e) { console.log("Init skipped"); }

const ConfettiManager = {
    shoot() {
        SynthEngine.playConfettiPop();
        const duration = 3000; const end = Date.now() + duration;
        (function frame() {
            if(typeof confetti !== 'undefined') {
                confetti({ particleCount: 5, angle: 60, spread: 150, origin: { x: 0 }, colors: ['#e74c3c', '#f1c40f', '#2ecc71'] });
                confetti({ particleCount: 5, angle: 120, spread: 150, origin: { x: 1 }, colors: ['#3498db', '#9b59b6', '#ecf0f1'] });
            }
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
    if(modalTitle) modalTitle.innerText = title;
    if(modalBody) modalBody.innerHTML = text; 
    if(modalOverlay) modalOverlay.classList.remove('hidden');
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
function closeModal() { if(modalOverlay) modalOverlay.classList.add('hidden'); }

socket.on('connect', () => { myId = socket.id; console.log("Socket connected:", myId); });

if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        console.log("Join Button Clicked");
        SynthEngine.init();
        const name = usernameInput.value.trim();
        if (!name) { alert("⚠️ 請輸入名字！"); return; }
        socket.emit('player_join', name);
    });
}

socket.on('error_msg', (msg) => { alert(msg); });

socket.on('update_player_list', (players) => {
    const me = players.find(p => p.id === socket.id);
    if (me) {
        myId = socket.id;
        if(loginOverlay) loginOverlay.classList.add('hidden');
        if(scoreboardHeader) scoreboardHeader.classList.remove('hidden');
        if(stadiumWrapper) stadiumWrapper.classList.remove('hidden');
        if(gameMsg) gameMsg.innerText = "✅ 已加入！等待老師開始...";
        if (myNameDisplay) myNameDisplay.innerText = me.name;
    }
    renderTracks(players);
});

socket.on('update_game_state', (gameState) => { renderTracks(gameState.players); });
socket.on('show_initiative', (sortedPlayers) => {
    let msg = `🎲 抽籤決定順序：\n`;
    sortedPlayers.forEach((p, i) => { msg += `${i+1}. ${p.name} `; if((i+1)%3 === 0) msg += "\n"; });
    if(gameMsg) gameMsg.innerText = msg;
    SynthEngine.init(); SynthEngine.playRoll();
});

socket.on('game_start', () => {
    if(gameMsg) gameMsg.innerText = "🚀 遊戲開始！";
    SynthEngine.playBGM();
    document.querySelectorAll('.avatar-img').forEach(img => { const id = img.id.replace('img-', ''); AvatarManager.setState(id, 'ready', img.dataset.char); });
    
    // 遊戲開始時，捲動畫面到自己
    if (myId) setTimeout(() => scrollToPlayer(myId), 500);
});

socket.on('game_reset_positions', () => {
    if(modalContent) modalContent.classList.remove('premium-modal');
    AvatarManager.movingStatus = {}; 
    for (let key in PLAYER_POSITIONS) PLAYER_POSITIONS[key] = 0;
    
    if(gameMsg) gameMsg.innerText = "準備開始新的一局...";
    document.querySelectorAll('.avatar-img').forEach(img => { const id = img.id.replace('img-', ''); AvatarManager.setState(id, 'idle', img.dataset.char); img.className = 'avatar-img'; });
    if(modalOverlay) modalOverlay.classList.add('hidden');
    
    const cells = document.querySelectorAll('.grid-cell');
    cells.forEach(c => { if(c.style.backgroundImage.includes('hole') || c.style.backgroundImage.includes('question')) { c.style.backgroundImage = "url('images/map_runway.png')"; } });
    
    if(rollBtn) {
        rollBtn.classList.remove('hidden');
        rollBtn.disabled = true;
        rollBtn.innerText = "等待開始...";
        rollBtn.className = "board-btn btn-grey";
    }
    SynthEngine.stopBGM();
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

    // 智慧導播鏡頭，輪到誰就捲到誰
    scrollToPlayer(nextPlayerId);

    if(gameMsg) gameMsg.style.color = "#f1c40f";
    if (nextPlayerId === myId) {
        rollBtn.setAttribute('disabled', 'true');
        rollBtn.disabled = true;
        rollBtn.innerText = "準備中...";
        rollBtn.className = "board-btn btn-grey";
        gameMsg.innerText = `👉 輪到你了！(請稍候)`;

        setTimeout(() => {
            rollBtn.removeAttribute('disabled');
            rollBtn.disabled = false;
            rollBtn.innerText = "🎲 輪到你了！按此擲骰";
            rollBtn.className = "board-btn btn-green"; 
            rollBtn.style.cursor = "pointer";
            gameMsg.innerText = `👉 輪到你了！`;
        }, 2000); 
    } else {
        rollBtn.setAttribute('disabled', 'true');
        rollBtn.disabled = true;
        rollBtn.innerText = "等待其他玩家...";
        rollBtn.className = "board-btn btn-grey"; 
        rollBtn.style.cursor = "not-allowed";
        gameMsg.innerText = `⏳ 等待 ${playerName} 擲骰...`;
    }
});

if (rollBtn) {
    rollBtn.addEventListener('click', () => {
        if (rollBtn.disabled) return;
        socket.emit('action_roll');
        rollBtn.disabled = true;
        rollBtn.innerText = "📡 傳送中...";
        rollBtn.className = "board-btn btn-grey";
    });
}

socket.on('player_moved', async ({ playerId, roll, newPos, initialLandPos, triggerType, fateResults, trapPos }) => {
    // 移動時鏡頭也跟隨
    scrollToPlayer(playerId);
    
    AvatarManager.movingStatus[playerId] = true;

    await ThreeDice.roll(roll);
    const avatarContainer = document.getElementById(`avatar-${playerId}`);
    const nameTag = avatarContainer ? avatarContainer.querySelector('.name-tag') : null;
    const name = nameTag ? nameTag.innerText : '對手';
    const isMe = (playerId === myId);
    
    if(gameMsg) {
        if (isMe) { gameMsg.innerText = `🎲 你擲出了 ${roll} 點！`; } 
        else { gameMsg.innerText = `👀 ${name} 擲出了 ${roll} 點`; }
    }
    
    const img = document.getElementById(`img-${playerId}`);
    const charType = img ? img.dataset.char : 'a';

    await moveAvatar(playerId, initialLandPos, charType);

    if (triggerType === 'TRAP') {
        if(gameMsg) { if(isMe) gameMsg.innerText = "😱 糟了！踩到陷阱！"; else gameMsg.innerText = "😱 哎呀！他踩到陷阱了！"; }
        await playTrapAnimation(img, playerId, newPos, charType, initialLandPos); 
    
    } else if (triggerType === 'FATE' || triggerType === 'FATE_TRAP') {
        if(gameMsg) { if(isMe) gameMsg.innerText = "❓ 連鎖命運時刻..."; else gameMsg.innerText = "❓ 觸發了連續命運..."; }
        
        let currentStepPos = initialLandPos; 

        if (fateResults && fateResults.length > 0) {
            for (let i = 0; i < fateResults.length; i++) {
                const result = fateResults[i];
                
                AvatarManager.movingStatus[playerId] = false;
                AvatarManager.setState(playerId, 'idle', charType); 
                AvatarManager.movingStatus[playerId] = true; 

                highlightFateTile(playerId, currentStepPos);
                await wait(600);
                
                setTileAsRunway(playerId, currentStepPos);
                showFateCard(result);
                await wait(2000);
                
                if (result > 0) SynthEngine.playHappy(); else SynthEngine.playSad();
                
                const moveText = (result > 0) ? `前進 ${result} 格` : `後退 ${Math.abs(result)} 格`;
                if(gameMsg) gameMsg.innerText = `第 ${i+1} 次命運：${moveText}`;
                
                let nextStepPos = currentStepPos + result;
                if (nextStepPos < 0) nextStepPos = 0;
                if (nextStepPos > 21) nextStepPos = 21;

                await moveAvatar(playerId, nextStepPos, charType);
                currentStepPos = nextStepPos;
                await wait(500);
            }
        }

        if (triggerType === 'FATE_TRAP') {
            if(gameMsg) gameMsg.innerHTML = `<span style="color:#e74c3c">😱 結果掉進洞裡了！</span>`;
            await playTrapAnimation(img, playerId, newPos, charType, trapPos);
        }
    }

    AvatarManager.movingStatus[playerId] = false;
    
    if (newPos >= 21) { 
        SynthEngine.playVictoryGrand();
        AvatarManager.setState(playerId, 'win', charType); 
    } else { 
        AvatarManager.setState(playerId, 'idle', charType); 
    }
});

function highlightFateTile(playerId, tileIndex) {
    if(!trackContainer) return;
    const row = Array.from(trackContainer.children).find(r => r.dataset.id === playerId);
    if (row) {
        const cell = row.querySelectorAll('.grid-cell')[tileIndex];
        if (cell) {
            cell.classList.add('fate-trigger-effect');
            setTimeout(() => {
                cell.classList.remove('fate-trigger-effect');
            }, 600);
        }
    }
}

function setTileAsRunway(playerId, tileIndex) {
    const row = Array.from(trackContainer.children).find(r => r.dataset.id === playerId);
    if (row) {
        const cell = row.querySelectorAll('.grid-cell')[tileIndex];
        if (cell) cell.style.backgroundImage = "url('images/map_runway.png')";
    }
}

function moveAvatar(playerId, targetPos, charType, instant = false) {
    return new Promise(resolve => {
        const currentPos = PLAYER_POSITIONS[playerId] || 0;
        PLAYER_POSITIONS[playerId] = targetPos; 
        
        const avatarContainer = document.getElementById(`avatar-${playerId}`);
        if (!avatarContainer) { resolve(); return; }

        if (instant) {
            avatarContainer.style.transition = 'none'; 
            const percent = (targetPos / 22) * 100; 
            avatarContainer.style.left = `${percent}%`;
            setTimeout(() => { 
                avatarContainer.style.transition = ''; 
                resolve(); 
            }, 50);
        } else {
            AvatarManager.movingStatus[playerId] = true;
            AvatarManager.setState(playerId, 'run', charType);
            
            const distance = Math.abs(targetPos - currentPos);
            const duration = Math.max(distance * 333, 100); 
            
            avatarContainer.style.transition = `left ${duration}ms linear`;
            const percent = (targetPos / 22) * 100; 
            avatarContainer.style.left = `${percent}%`;
            
            setTimeout(() => { 
                avatarContainer.style.transition = ''; 
                resolve(); 
            }, duration); 
        }
    });
}

async function playTrapAnimation(img, playerId, resetPos, charType, trapTileIndex) {
    if(img) img.classList.add('avatar-trap-shake');
    SynthEngine.playSad(); 
    await wait(500);
    
    if(img) {
        img.classList.remove('avatar-trap-shake');
        img.classList.add('avatar-trap-fall');
    }
    await wait(800);
    await wait(500);
    
    setTileAsRunway(playerId, trapTileIndex);
    await moveAvatar(playerId, resetPos, charType, true); 
    
    if(img) {
        img.classList.remove('avatar-trap-fall');
        img.style.opacity = '1';
        img.style.transform = 'none';
        
        img.classList.add('avatar-respawn');
        await wait(1500); 
        img.classList.remove('avatar-respawn');
    }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function showFateCard(amount) {
    SynthEngine.playPopup();
    if(!fateOverlay) return;
    if (amount > 0) { fateCardBody.className = "fate-card fate-positive"; fateIcon.innerText = "🚀"; fateTitle.innerText = "好運降臨"; fateDesc.innerText = `前進 ${Math.abs(amount)} 格！`; } 
    else { fateCardBody.className = "fate-card fate-negative"; fateIcon.innerText = "🌪️"; fateTitle.innerText = "厄運纏身"; fateDesc.innerText = `後退 ${Math.abs(amount)} 格...`; }
    fateOverlay.classList.add('show'); setTimeout(() => { fateOverlay.classList.remove('show'); }, 2000);
}

socket.on('player_finished_rank', ({ player, rank }) => {
    setTimeout(() => {
        if(gameMsg) gameMsg.innerHTML = `👏 <span style="color:#2ecc71">${player.name}</span> 獲得第 ${rank} 名！`;
    }, 100); 
});

socket.on('game_over', ({ rankings }) => {
    if(rollBtn) rollBtn.classList.add('hidden');
    
    setTimeout(() => {
        ConfettiManager.shoot();
        SynthEngine.playWhistle();
        
        if(gameMsg) gameMsg.innerText = `🏆 遊戲結束！`;
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
            SynthEngine.playPopup();
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
        }, 2000);
    }, 500); 
});
socket.on('force_reload', () => { location.reload(); });

function renderTracks(players) {
    if(!trackContainer) return;
    
    // 🔥 修正：強制將收到的玩家列表依照「加入順序 (joinOrder)」排序
    // 這樣即使 server 洗牌了 (改變 turn 順序)，前端跑道永遠固定
    const displayPlayers = [...players].sort((a, b) => (a.joinOrder || 0) - (b.joinOrder || 0));

    const existingRows = Array.from(trackContainer.children);
    let needRebuild = false;
    
    if (existingRows.length !== displayPlayers.length) {
        needRebuild = true;
    } else {
        for (let i = 0; i < displayPlayers.length; i++) {
            if (existingRows[i].dataset.id !== displayPlayers[i].id) {
                needRebuild = true;
                break;
            }
        }
    }

    if (needRebuild) {
        trackContainer.innerHTML = '';
        displayPlayers.forEach(p => createRow(p));
    } else {
        displayPlayers.forEach((p, index) => {
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
        if (p.trapIndex !== -1 && i === p.trapIndex) cell.style.backgroundImage = "url('images/map_hole.png')";
        else if (p.fateIndices && p.fateIndices.includes(i)) cell.style.backgroundImage = "url('images/map_question.png')";
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
    
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (p.trapIndex !== -1 && i === p.trapIndex) {
            if (!cell.style.backgroundImage.includes('hole')) cell.style.backgroundImage = "url('images/map_hole.png')";
        } 
        else if (p.fateIndices && p.fateIndices.includes(i)) {
            if (!cell.style.backgroundImage.includes('question')) cell.style.backgroundImage = "url('images/map_question.png')";
        } 
        else {
            if (cell.style.backgroundImage.includes('hole') || cell.style.backgroundImage.includes('question')) {
                cell.style.backgroundImage = "url('images/map_runway.png')";
            }
        }
    }

    const avatarContainer = row.querySelector('.avatar-container');
    const currentLeft = parseFloat(avatarContainer.style.left) || 0;
    const targetLeft = (p.position / 22) * 100;
    if (Math.abs(currentLeft - targetLeft) > 5 && !AvatarManager.movingStatus[p.id]) { avatarContainer.style.left = `${targetLeft}%`; }
}

function scrollToPlayer(playerId) {
    const scrollArea = document.getElementById('game-scroll-area');
    if (!scrollArea || !trackContainer) return;
    
    // 找出對應 playerId 的跑道列
    const rows = Array.from(document.querySelectorAll('.track-row'));
    const targetRow = rows.find(r => r.dataset.id === playerId);

    if (targetRow) {
        // 計算位置：將目標跑道置中
        const scrollTop = targetRow.offsetTop - (scrollArea.clientHeight / 2) + (targetRow.clientHeight / 2);
        
        // 執行平滑捲動
        scrollArea.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
        });
    }
}