const socket = io(); 

// DOM 元素
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

let myId = null;
let isAnimating = false; 

const CHAR_TYPES = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o'];

const AvatarManager = {
    loopIntervals: {},
    getCharType(id) {
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
        return CHAR_TYPES[hash % CHAR_TYPES.length];
    },
    setState(playerId, state) {
        const img = document.getElementById(`img-${playerId}`);
        if (!img) return;
        const charType = img.dataset.char;
        
        // 清除舊的計時器
        if (this.loopIntervals[playerId]) {
            clearInterval(this.loopIntervals[playerId]);
            delete this.loopIntervals[playerId];
        }

        switch (state) {
            case 'idle': 
                img.src = `images/avatar_${charType}_1.png`; 
                break;
            case 'ready': 
                img.src = `images/avatar_${charType}_2.png`; 
                break;
            case 'run': 
                // 🏃‍♂️ 修復：確保 3 和 4 輪替
                let runFrame = 3;
                img.src = `images/avatar_${charType}_3.png`;
                this.loopIntervals[playerId] = setInterval(() => {
                    runFrame = (runFrame === 3) ? 4 : 3;
                    img.src = `images/avatar_${charType}_${runFrame}.png`;
                }, 150);
                break;
            case 'win': 
                // 🎉 修復：確保 5 和 1 (或5單獨) 輪替
                let winFrame = 5;
                img.src = `images/avatar_${charType}_5.png`;
                this.loopIntervals[playerId] = setInterval(() => {
                    // 這裡設為 5 和 1 輪替，或者保持 5
                    winFrame = (winFrame === 5) ? 1 : 5;
                    img.src = `images/avatar_${charType}_${winFrame}.png`;
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
    playStep(){ if(this.isMuted||!this.ctx)return; const t=this.ctx.currentTime; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.frequency.setValueAtTime(150,t); o.frequency.linearRampToValueAtTime(300,t+0.1); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0,t+0.1); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.1); },
    playWin(){ if(this.isMuted||!this.ctx)return; this.stopBGM(); const t=this.ctx.currentTime; const notes=[523,659,784,1046]; notes.forEach((f,i)=>{const o=this.ctx.createOscillator();const g=this.ctx.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(0.1,t+i*0.1);g.gain.linearRampToValueAtTime(0,t+i*0.1+0.1);o.connect(g);g.connect(this.ctx.destination);o.start(t+i*0.1);o.stop(t+i*0.1+0.1);}); },
    playBGM(){ if (this.isMuted || this.bgmInterval || !this.ctx) return; const sequence = [261.63, 0, 261.63, 293.66, 329.63, 0, 329.63, 392.00]; let step = 0; this.bgmInterval = setInterval(() => { if (this.ctx.state === 'suspended') this.ctx.resume(); const freq = sequence[step % sequence.length]; if (freq > 0) { const t = this.ctx.currentTime; const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain(); osc.type = 'sine'; osc.frequency.value = freq / 2; gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.3); } step++; }, 250); },
    stopBGM(){ if(this.bgmInterval){clearInterval(this.bgmInterval);this.bgmInterval=null;} }
};
document.getElementById('mute-btn').addEventListener('click', ()=>SynthEngine.toggleMute());

function showModal(title, text, btnText = "確定", autoCloseMs = 0) {
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
    loginError.innerText = ""; 
    if (!name) { loginError.innerText = "⚠️ 請輸入名字！"; return; }
    socket.emit('player_join', name);
    SynthEngine.playRoll(); 
});

socket.on('error_msg', (msg) => {
    loginError.innerText = `⚠️ ${msg}`;
    showModal("錯誤", msg);
});

socket.on('update_player_list', (players) => {
    const me = players.find(p => p.id === socket.id);
    if (me) {
        myId = socket.id;
        loginOverlay.classList.add('hidden'); // 隱藏登入
        scoreboardHeader.classList.remove('hidden'); // 顯示計分板
        stadiumWrapper.classList.remove('hidden');   // 顯示體育場
        gameMsg.innerText = "✅ 已加入！等待老師開始...";
    }
    renderTracks(players);
});

socket.on('show_initiative', (sortedPlayers) => {
    const myData = sortedPlayers.find(p => p.id === socket.id);
    const myRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
    gameMsg.innerHTML = `🎲 擲骰順序：你擲出 <span style="color:#fff">${myData.initRoll}</span> 點，排第 ${myRank} 位`;
    SynthEngine.playRoll();
});

socket.on('game_start', () => {
    gameMsg.innerText = "🚀 遊戲開始！";
    SynthEngine.playBGM();
});

socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    if (nextPlayerId) AvatarManager.setState(nextPlayerId, 'ready');

    if (nextPlayerId === myId) {
        rollBtn.disabled = false;
        rollBtn.innerText = "🎲 按我擲骰！";
        rollBtn.className = "board-btn btn-green"; // 變綠色
        rollBtn.style.cursor = "pointer";
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "等待對手...";
        rollBtn.className = "board-btn btn-grey"; // 變灰色
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
    SynthEngine.playRoll();
});

socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatarContainer = document.getElementById(`avatar-${playerId}`);
    const isMe = (playerId === myId);
    isAnimating = true; 

    // 🏃‍♂️ 這裡觸發跑步動畫 (循環 3, 4)
    AvatarManager.setState(playerId, 'run');

    if (isMe) {
        gameMsg.innerText = `🎲 你擲出了 ${roll} 點！`;
    } else {
        const nameTag = avatarContainer.querySelector('.name-tag');
        const name = nameTag ? nameTag.innerText : '對手';
        gameMsg.innerText = `👀 ${name} 擲出了 ${roll} 點`;
    }

    setTimeout(() => {
        if (avatarContainer) {
            SynthEngine.playStep();
            const percent = (newPos / 22) * 100; 
            avatarContainer.style.left = `${percent}%`;
        }
        
        setTimeout(() => {
            isAnimating = false;
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

        if(player.id === myId) {
            gameMsg.innerText = `🎉 恭喜！你是第 ${rank} 名！`;
            rollBtn.innerText = "🏆 已完賽";
        } else {
            gameMsg.innerText = `🏁 ${player.name} 奪得第 ${rank} 名！`;
        }
    }, 1500);
});

socket.on('game_over', ({ rankings }) => {
    setTimeout(() => {
        SynthEngine.playWin();
        rollBtn.classList.add('hidden');
        gameMsg.innerText = `🏆 遊戲結束！`;
        rankings.forEach(r => AvatarManager.setState(r.id, 'win'));
        
        let rankHtml = '<ul style="text-align: left; margin-top: 10px; padding:0; list-style:none;">';
        rankings.forEach(p => {
            let medal = '';
            if (p.rank === 1) medal = '🥇';
            if (p.rank === 2) medal = '🥈';
            if (p.rank === 3) medal = '🥉';
            
            // 🖼️ 這裡加入角色勝利圖
            const charType = AvatarManager.getCharType(p.id);
            const imgHtml = `<img src="images/avatar_${charType}_5.png" style="width:32px; height:32px; vertical-align:middle; margin-right:10px;">`;
            
            rankHtml += `<li style="font-size: 1.2rem; margin-bottom: 10px; border-bottom:1px dashed #ccc; padding-bottom:5px; display:flex; align-items:center;">
                <span style="margin-right:10px;">${medal} 第 ${p.rank} 名</span>
                ${imgHtml}
                <strong>${p.name}</strong>
            </li>`;
        });
        rankHtml += '</ul>';
        showModal("🏁 比賽結束", `所有贏家已產生！<br>${rankHtml}`);
    }, 1500);
});

socket.on('force_reload', () => {
    showModal("遊戲重置", "老師已重置遊戲，請重新加入。", "重新整理");
});

socket.on('game_reset_positions', () => {
    document.querySelectorAll('.avatar-img').forEach(img => {
        const id = img.id.replace('img-', '');
        AvatarManager.setState(id, 'idle');
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
        img.src = `images/avatar_${charType}_1.png`; 

        const nameTag = document.createElement('div');
        nameTag.className = 'name-tag';
        nameTag.innerText = p.name;
        avatarContainer.appendChild(nameTag);
        avatarContainer.appendChild(img);
        row.appendChild(avatarContainer);
        trackContainer.appendChild(row);
        if(p.position >= 21) AvatarManager.setState(p.id, 'win');
    });
}