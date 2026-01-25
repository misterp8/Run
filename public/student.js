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

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalBtn = document.getElementById('modal-btn');

let myId = null;
let isAnimating = false; 

// --- 🎹 SynthEngine (保持不變) ---
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
            if (!gameScreen.classList.contains('hidden')) this.playBGM();
            btn.innerText = "🔊";
            btn.style.background = "rgba(255,255,255,0.9)";
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

function showModal(title, text, btnText = "確定", autoCloseMs = 0) {
    modalTitle.innerText = title;
    modalBody.innerHTML = text; 
    modalBtn.innerText = btnText;
    modalBtn.onclick = () => { modalOverlay.classList.add('hidden'); }; 
    if (title === "遊戲重置") modalBtn.onclick = () => { location.reload(); };
    modalOverlay.classList.remove('hidden');
    if (autoCloseMs > 0) setTimeout(() => { modalOverlay.classList.add('hidden'); }, autoCloseMs);
}

joinBtn.addEventListener('click', () => {
    SynthEngine.init(); 
    const name = usernameInput.value.trim();
    loginError.innerText = ""; 
    if (!name) {
        loginError.innerText = "⚠️ 請輸入名字！";
        return;
    }
    socket.emit('player_join', name);
    SynthEngine.playRoll(); 
});

socket.on('error_msg', (msg) => {
    loginError.innerText = `⚠️ ${msg}`;
    if (!lobbyScreen.classList.contains('hidden') === false) showModal("錯誤", msg);
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

// 👇 新增：當老師按「回起跑線」時，重置 UI
socket.on('game_reset_positions', () => {
    // 1. 關閉任何開啟的視窗
    modalOverlay.classList.add('hidden');
    
    // 2. 重置大廳文字 (雖然可能不會顯示大廳，但以防萬一)
    lobbyStatusText.innerHTML = `
        <p>✅ 已加入！等待老師開始遊戲...</p>
    `;

    // 3. 重置遊戲訊息
    gameMsg.innerText = "準備開始新的一局...";
    gameMsg.style.color = "#333";
    
    // 4. 隱藏並禁用骰子
    rollBtn.classList.remove('hidden'); // 確保按鈕顯示出來
    rollBtn.disabled = true;
    rollBtn.innerText = "等待開始...";
    rollBtn.style.backgroundColor = "#6c757d";
    
    // 5. 停止音樂
    SynthEngine.stopBGM();
});

socket.on('show_initiative', (sortedPlayers) => {
    const myData = sortedPlayers.find(p => p.id === socket.id);
    const myRank = sortedPlayers.findIndex(p => p.id === socket.id) + 1;
    
    // 為了讓學生知道重新開始了，這裡切回大廳畫面一下下，或者直接跳出 Modal
    // 根據現有邏輯，game_start 後會切到 gameScreen，所以這裡我們直接用 Modal 提示
    // 或者是直接開始遊戲流程
    
    // 如果目前在遊戲畫面，我們可以切換回大廳顯示這個大大的結果，或者用 Modal
    // 這裡維持原本邏輯：
    // 如果我們還在 gameScreen，我們用 Modal 顯示擲骰結果比較好，不然畫面會跳來跳去
    
    // 但為了簡單，我們統一用大廳畫面顯示結果，因為 3 秒後會自動 game_start 切換到跑道
    gameScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    lobbyStatusText.innerHTML = `
        <h2 style="color: #28a745; margin-bottom:5px;">🎲 新回合：擲骰順序！</h2>
        <p style="font-size: 1.2rem; margin: 5px 0;">你擲出了 <b style="color:#d63384; font-size: 1.5rem;">${myData.initRoll}</b> 點</p>
        <p style="font-size: 1.2rem; margin: 5px 0;">排在第 <b style="color:#007bff; font-size: 1.5rem;">${myRank}</b> 順位</p>
        <p style="color: #666; font-size: 0.9rem;">(遊戲即將開始...)</p>
    `;
    SynthEngine.playRoll();
});

socket.on('game_start', () => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
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
            SynthEngine.playStep();
            const percent = (newPos / 22) * 100; 
            avatar.style.left = `${percent}%`;
        }
        setTimeout(() => {
            isAnimating = false;
            // 如果遊戲還沒結束，才恢復文字
            if (rollBtn.classList.contains('hidden') === false) {
                if (rollBtn.disabled) {
                    gameMsg.innerText = "等待對手行動中...";
                    gameMsg.style.color = "#333";
                } else {
                    gameMsg.innerText = "👉 輪到你行動！請擲骰子";
                    gameMsg.style.color = "#d63384";
                }
            }
        }, 1000); 
    }, 1000);
});

socket.on('player_finished_rank', ({ player, rank }) => {
    setTimeout(() => {
        SynthEngine.playWin(); 
        if(player.id === myId) {
            gameMsg.innerText = `🎉 恭喜！你是第 ${rank} 名！`;
            gameMsg.style.color = "#28a745";
            rollBtn.disabled = true;
            rollBtn.innerText = "🏆 已完賽，等待其他玩家...";
        } else {
            gameMsg.innerText = `🏁 ${player.name} 奪得第 ${rank} 名！`;
            gameMsg.style.color = "#007bff";
        }
    }, 1500);
});

socket.on('game_over', ({ rankings }) => {
    const winner = rankings[0]; 
    setTimeout(() => {
        SynthEngine.playWin();
        rollBtn.classList.add('hidden');
        gameMsg.innerText = `🏆 遊戲結束！`;
        
        let rankHtml = '<ul style="text-align: left; margin-top: 10px;">';
        rankings.forEach(p => {
            let medal = '';
            if (p.rank === 1) medal = '🥇';
            if (p.rank === 2) medal = '🥈';
            if (p.rank === 3) medal = '🥉';
            rankHtml += `<li style="font-size: 1.2rem; margin-bottom: 5px;">${medal} 第 ${p.rank} 名：${p.name}</li>`;
        });
        rankHtml += '</ul>';

        showModal("🏁 比賽結束！", `恭喜前三名選手誕生！<br>${rankHtml}`, "太棒了");
    }, 1500);
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
        const percent = (p.position / 22) * 100;
        avatar.style.left = `${percent}%`;
        row.appendChild(avatar);
        trackContainer.appendChild(row);
    });
}