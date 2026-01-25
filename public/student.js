// 請將此處改為你的 Render 網址
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

// Modal 元素
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalBtn = document.getElementById('modal-btn');

let myId = null;
let isAnimating = false; 

// --- 🎹 3A級 Web Audio API 合成器引擎 (SynthEngine) ---
const SynthEngine = {
    ctx: null, // AudioContext
    isMuted: false,
    bgmInterval: null,
    
    // 初始化 AudioContext (必須在使用者點擊後呼叫)
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('mute-btn');
        if (this.isMuted) {
            this.stopBGM(); // 靜音時停止 BGM
            btn.innerText = "🔇";
            btn.style.background = "#ffcccc";
        } else {
            // 如果遊戲正在進行，解除靜音時恢復 BGM
            if (!gameScreen.classList.contains('hidden')) {
                this.playBGM();
            }
            btn.innerText = "🔊";
            btn.style.background = "rgba(255,255,255,0.9)";
        }
    },

    // 1. 🎲 擲骰子聲 (噪音 + 濾波器 = 搖晃聲)
    playRoll() {
        if (this.isMuted || !this.ctx) return;
        const t = this.ctx.currentTime;
        
        // 產生白噪音
        const bufferSize = this.ctx.sampleRate * 0.5; // 0.5秒
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // 帶通濾波器 (模擬物體碰撞的頻率)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, t);
        filter.Q.value = 5;

        // 音量包絡 (快速的一連串聲音)
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

    // 2. 🏃‍♂️ 腳步/跳躍聲 (三角波 + 頻率滑動)
    playStep() {
        if (this.isMuted || !this.ctx) return;
        const t = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle'; // 三角波比較像遊戲跳躍聲
        
        // 頻率滑動 (咻!)
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);

        // 音量包絡
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
    },

    // 3. 🏆 勝利聲 (大調琶音 Fanfare)
    playWin() {
        if (this.isMuted || !this.ctx) return;
        this.stopBGM(); // 勝利時停止 BGM

        const t = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50]; // C5, E5, G5, C6...
        const duration = 0.1;

        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square'; // 方波有 8-bit 的感覺
            
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

    // 4. 🎵 背景音樂 (步進序列器)
    playBGM() {
        if (this.isMuted || this.bgmInterval || !this.ctx) return;
        
        // 簡單的 Bassline 節奏
        const sequence = [
            261.63, 0, 261.63, 293.66, 
            329.63, 0, 329.63, 392.00
        ]; // C4, C4, D4, E4, E4, G4
        
        let step = 0;
        const noteTime = 0.25; // 每一拍的時間

        // 使用 setInterval 簡單排程 (在真實專案會用 Web Audio 排程，但這裡用 Interval 較易讀)
        this.bgmInterval = setInterval(() => {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            
            const freq = sequence[step % sequence.length];
            if (freq > 0) {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                
                osc.type = 'sine'; // 貝斯用正弦波比較厚實
                osc.frequency.value = freq / 2; // 降八度當 Bass
                
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

// 綁定靜音按鈕
document.getElementById('mute-btn').addEventListener('click', () => SynthEngine.toggleMute());

// --- 輔助函式 ---
function showModal(title, text, btnText = "確定", autoCloseMs = 0) {
    modalTitle.innerText = title;
    modalBody.innerText = text;
    modalBtn.innerText = btnText;
    modalBtn.onclick = () => { modalOverlay.classList.add('hidden'); }; 
    
    if (title === "遊戲重置") {
        modalBtn.onclick = () => { location.reload(); };
    }

    modalOverlay.classList.remove('hidden');

    if (autoCloseMs > 0) {
        setTimeout(() => {
            modalOverlay.classList.add('hidden');
        }, autoCloseMs);
    }
}

joinBtn.addEventListener('click', () => {
    // 💡 關鍵：瀏覽器規定要使用者互動後才能啟動 AudioContext
    SynthEngine.init(); 

    const name = usernameInput.value.trim();
    loginError.innerText = ""; 
    if (!name) {
        loginError.innerText = "⚠️ 請輸入名字！";
        return;
    }
    socket.emit('player_join', name);
    SynthEngine.playRoll(); // 播放一個測試音效
});

socket.on('error_msg', (msg) => {
    loginError.innerText = `⚠️ ${msg}`;
    if (!lobbyScreen.classList.contains('hidden') === false) { 
        showModal("錯誤", msg);
    }
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
        <p style="color: #666; font-size: 0.9rem;">(遊戲即將開始...)</p>
    `;
    
    SynthEngine.playRoll(); // 播放擲骰音效
});

socket.on('game_start', () => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    
    // 🎵 開始播放程序化 BGM
    SynthEngine.playBGM();
});

socket.on('update_turn', ({ turnIndex, nextPlayerId }) => {
    if (nextPlayerId === myId) {
        rollBtn.disabled = false;
        rollBtn.innerText = "🎲 輪到你了！按此擲骰";
        rollBtn.style.backgroundColor = "#28a745"; 
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "等待其他玩家...";
        rollBtn.style.backgroundColor = "#6c757d"; 
    }

    if (!isAnimating) {
        if (nextPlayerId === myId) {
            gameMsg.innerText = "👉 輪到你行動！請擲骰子";
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
    
    // 🎵 播放擲骰子聲
    SynthEngine.playRoll();
});

socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatar = document.getElementById(`avatar-${playerId}`);
    const isMe = (playerId === myId);
    isAnimating = true; 

    if (isMe) {
        gameMsg.innerText = `🎲 你擲出了 ${roll} 點！`;
        gameMsg.style.color = "#d63384";
        rollBtn.innerText = `🎲 ${roll} 點！`;
    } else {
        const playerName = avatar ? avatar.innerText : '對手';
        gameMsg.innerText = `👀 ${playerName} 擲出了 ${roll} 點`;
        gameMsg.style.color = "#007bff";
    }

    setTimeout(() => {
        if (avatar) {
            // 🎵 播放程序化腳步聲
            SynthEngine.playStep();
            
            const percent = (newPos / 22) * 100; 
            avatar.style.left = `${percent}%`;
        }
        setTimeout(() => {
            isAnimating = false;
            if (rollBtn.disabled) {
                gameMsg.innerText = "等待對手行動中...";
                gameMsg.style.color = "#333";
            } else {
                gameMsg.innerText = "👉 輪到你行動！請擲骰子";
                gameMsg.style.color = "#d63384";
            }
        }, 1000); 
    }, 1000);
});

socket.on('game_over', ({ winner }) => {
    gameMsg.innerText = `🏆 贏家是：${winner.name}`;
    rollBtn.classList.add('hidden');
    
    // 🎵 播放勝利 Fanfare
    SynthEngine.playWin();
    
    showModal("🏆 比賽結束！", `恭喜 ${winner.name} 獲得冠軍！`, "太棒了");
});

socket.on('force_reload', () => {
    showModal("遊戲重置", "老師已重置遊戲，請重新加入。", "重新整理");
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
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.id = `avatar-${p.id}`;
        avatar.innerText = p.name;
        avatar.style.backgroundColor = p.color;
        avatar.style.left = '0%';
        row.appendChild(avatar);
        trackContainer.appendChild(row);
    });
}