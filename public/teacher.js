// 請將此處改為你的 Render 網址
const socket = io('https://run-vjk6.onrender.com'); 

const trackContainer = document.getElementById('track-container');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const playerCountSpan = document.getElementById('player-count');
const adminPanel = document.getElementById('admin-panel');
const liveMsg = document.getElementById('live-msg');

const initiativeListDiv = document.getElementById('initiative-list');
const initiativeUl = document.getElementById('initiative-ul');

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const btnConfirm = document.getElementById('modal-btn-confirm');
const btnCancel = document.getElementById('modal-btn-cancel');

// --- 🎹 SynthEngine (老師端) ---
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
            if (startBtn.disabled && startBtn.innerText.includes("進行中")) this.playBGM();
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

function showModal(title, text, isConfirm = false, onConfirm = null) {
    modalTitle.innerText = title;
    modalBody.innerHTML = text; // 改為 innerHTML
    modalOverlay.classList.remove('hidden');

    if (isConfirm) {
        btnConfirm.innerText = "確定執行";
        btnConfirm.classList.add('danger'); 
        btnCancel.classList.remove('hidden');
        btnConfirm.onclick = () => {
            if (onConfirm) onConfirm();
            closeModal();
        };
        btnCancel.onclick = closeModal;
    } else {
        btnConfirm.innerText = "知道了";
        btnConfirm.classList.remove('danger');
        btnCancel.classList.add('hidden');
        btnConfirm.onclick = closeModal;
    }
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}

const statusDiv = document.createElement('div');
statusDiv.style.padding = "5px";
statusDiv.style.marginBottom = "10px";
statusDiv.style.fontWeight = "bold";
adminPanel.prepend(statusDiv);

socket.on('connect', () => {
    statusDiv.innerText = "🟢 伺服器已連線";
    statusDiv.style.color = "#28a745";
    socket.emit('admin_login');
});

socket.on('disconnect', () => {
    statusDiv.innerText = "🔴 與伺服器斷線";
    statusDiv.style.color = "#dc3545";
});

socket.on('update_player_list', (players) => {
    updateView(players);
});

socket.on('update_game_state', (gameState) => {
    updateView(gameState.players);
    if (gameState.status === 'PLAYING') {
        startBtn.disabled = true;
        startBtn.innerText = "⛔ 遊戲進行中";
        startBtn.style.cursor = "not-allowed";
        startBtn.style.backgroundColor = "#6c757d";
    } else {
        startBtn.disabled = false;
        startBtn.innerText = "🚀 開始遊戲";
        startBtn.style.cursor = "pointer";
        startBtn.style.backgroundColor = "#28a745";
        if (gameState.status !== 'PLAYING') SynthEngine.stopBGM();
    }
    if (gameState.status === 'LOBBY') {
        initiativeListDiv.style.display = 'none';
        SynthEngine.stopBGM();
    }
});

socket.on('show_initiative', (sortedPlayers) => {
    initiativeListDiv.style.display = 'block';
    initiativeUl.innerHTML = ''; 
    sortedPlayers.forEach((p, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>第 ${index + 1} 順位</strong>: ${p.name} <span style="color:#ffc107">(擲出 ${p.initRoll} 點)</span>`;
        initiativeUl.appendChild(li);
    });
    if(liveMsg) liveMsg.innerText = "🎲 擲骰決定順序中... (3秒後開始)";
    SynthEngine.init(); 
    SynthEngine.playRoll();
});

socket.on('game_start', () => {
    SynthEngine.playBGM();
});

socket.on('player_moved', ({ playerId, roll, newPos }) => {
    const avatar = document.getElementById(`avatar-${playerId}`);
    const playerName = avatar ? avatar.innerText : '未知玩家';

    if (liveMsg) {
        liveMsg.innerText = `🎲 ${playerName} 擲出了 ${roll} 點！`;
        liveMsg.style.color = "#d63384";
    }

    setTimeout(() => {
        if (avatar) {
            SynthEngine.playStep();
            const percent = (newPos / 22) * 100;
            avatar.style.left = `${percent}%`;
            if (liveMsg) liveMsg.style.color = "#333"; 
        }
    }, 1000);
});

// 新增：顯示中間排名
socket.on('player_finished_rank', ({ player, rank }) => {
    setTimeout(() => {
        SynthEngine.playWin(); 
        if(liveMsg) {
            liveMsg.innerText = `👏 ${player.name} 抵達終點！ (第 ${rank} 名)`;
            liveMsg.style.color = "#28a745";
        }
    }, 1500);
});

// 修改：遊戲完全結束
socket.on('game_over', ({ rankings }) => {
    setTimeout(() => {
        const winner = rankings[0];
        liveMsg.innerText = `🏆 冠軍：${winner.name}`;
        SynthEngine.playWin();
        
        // 製作排行榜 HTML
        let rankHtml = '<ul style="text-align: left; margin-top: 10px;">';
        rankings.forEach(p => {
            let medal = '';
            if (p.rank === 1) medal = '🥇';
            if (p.rank === 2) medal = '🥈';
            if (p.rank === 3) medal = '🥉';
            rankHtml += `<li style="font-size: 1.1rem; margin-bottom: 5px;">${medal} 第 ${p.rank} 名：${p.name}</li>`;
        });
        rankHtml += '</ul>';

        showModal("🏁 比賽結束", `所有贏家已產生！<br>${rankHtml}`);
    }, 1500);
});

startBtn.addEventListener('click', () => {
    SynthEngine.init(); 
    startBtn.disabled = true;
    startBtn.innerText = "⏳ 啟動中...";
    socket.emit('admin_start_game');
});

resetBtn.addEventListener('click', () => {
    showModal(
        "危險操作", 
        "確定要重置遊戲並踢除所有玩家嗎？\n(這將無法復原)", 
        true, 
        () => {
            socket.emit('admin_reset_game');
            trackContainer.innerHTML = ''; 
            playerCountSpan.innerText = 0;
            if(liveMsg) liveMsg.innerText = "等待遊戲開始...";
            initiativeListDiv.style.display = 'none';
            SynthEngine.stopBGM();
        }
    );
});

function updateView(players) {
    if (!players) players = [];
    playerCountSpan.innerText = players.length;
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