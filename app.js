/**
 * Web-KTV-Cast 核心邏輯 (v3.0 函數完全提升置頂 ＋ 防未定義報錯版)
 */

// ==========================================
// 1. 全域變數定義
// ==========================================
let playlistQueue = [];
let currentPlaying = null;
let ctrlIsPlaying = true;
let ctrlActiveConn = null;
let ctrlPeer = null;

// ==========================================
// 2. 核心輔助函數定義 (置於最頂部，確保完全提升，徹底防範「is not defined」錯誤)
// ==========================================

// KTV 霓虹狀態提示框 (Toast)
function showToast(message, type = 'success') {
  const existingToasts = document.querySelectorAll('.ktv-toast');
  existingToasts.forEach(t => t.remove());

  const toast = document.createElement('div');
  const bgClass = type === 'success' ? 'bg-emerald-600 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-rose-950 border-rose-800 shadow-[0_0_15px_rgba(244,63,94,0.3)]';
  toast.className = `ktv-toast fixed bottom-8 left-1/2 -translate-x-1/2 ${bgClass} border text-white px-5 py-3 rounded-2xl text-xs font-bold z-50 transition-all duration-300 transform translate-y-10 opacity-0 max-w-[85vw] text-center`;
  
  const icon = type === 'success' ? '<i class="fa-solid fa-circle-check text-emerald-200"></i>' : '<i class="fa-solid fa-triangle-exclamation text-rose-300"></i>';
  toast.innerHTML = `<span class="flex items-center justify-center gap-1.5">${icon} ${message}</span>`;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 50);
  
  setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2500);
}

// 萬能 YouTube 11位元 ID 提取器
function extractYouTubeVideoId(url) {
  if (!url) return null;
  url = url.trim();
  
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }
  
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,             // watch?v=ID or &v=ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,        // youtu.be/ID
    /embed\/([a-zA-Z0-9_-]{11})/,          // embed/ID
    /shorts\/([a-zA-Z0-9_-]{11})/,         // shorts/ID
    /live\/([a-zA-Z0-9_-]{11})/            // live/ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// 手機端點歌佇列渲染模組 (寫在此處確保 initController 執行時它已經 100% 存在！)
function renderControllerQueue() {
  const queueCountEl = document.getElementById('queue-count');
  const curTitleEl = document.getElementById('ctrl-current-title');
  const queueContainer = document.getElementById('controller-queue-list');
  
  if (queueCountEl) queueCountEl.textContent = `${playlistQueue.length} 首`;
  if (curTitleEl) curTitleEl.textContent = currentPlaying ? currentPlaying.title : '目前無歌曲播放中';
  if (!queueContainer) return;
  
  if (playlistQueue.length === 0) {
    queueContainer.innerHTML = '<div class="text-center py-10 text-slate-600 text-xs">歌單目前是空的，快去貼上伴奏吧！</div>';
    return;
  }
  
  queueContainer.innerHTML = '';
  playlistQueue.forEach((song, idx) => {
    const div = document.createElement('div');
    div.className = 'p-3 bg-slate-950 rounded-xl border border-slate-900/80 flex items-center justify-between text-sm';
    div.innerHTML = `
      <div class="truncate pr-2 flex-grow">
        <span class="text-xs text-slate-500 font-bold mr-1">${idx + 1}</span>
        <span class="font-medium text-slate-300">${song.title}</span>
      </div>
      <div class="flex items-center gap-2.5 shrink-0">
        <button onclick="moveSongUp(${idx})" class="p-1 hover:text-indigo-400 text-slate-400 transition" title="上移">
          <i class="fa-solid fa-arrow-up"></i>
        </button>
        <button onclick="moveSongDown(${idx})" class="p-1 hover:text-indigo-400 text-slate-400 transition" title="下移">
          <i class="fa-solid fa-arrow-down"></i>
        </button>
        <button onclick="insertSongNext(${idx})" class="p-1 hover:text-amber-400 text-slate-400 transition" title="插播">
          <i class="fa-solid fa-star"></i>
        </button>
        <button onclick="deleteSong(${idx})" class="p-1 hover:text-rose-500 text-slate-400 transition" title="刪除">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    queueContainer.appendChild(div);
  });
}

// 狀態機同步協定 (State-Sync)
function syncStateWithTV(command = "NONE") {
  if (ctrlActiveConn) {
    ctrlActiveConn.send({
      type: 'SYNC_STATE',
      currentPlaying: currentPlaying,
      queue: playlistQueue,
      command: command
    });
  }
}

// 取得 YouTube 繁體中文影片標題 (oEmbed 免費無限制協定)
async function getYouTubeVideoTitle(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.title) {
        return data.title;
      }
    }
  } catch (err) {
    console.warn('oEmbed 忙碌，切換備份解析...', err);
  }
  
  try {
    const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.title) {
        return data.title;
      }
    }
  } catch (err) {
    console.warn('備份解析失敗，採用預設標籤', err);
  }
  
  return `KTV 伴唱影片 (${videoId})`;
}

// 點歌、插播處理器
async function addSongFromUrl(url, isNext = false) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    alert('未能在輸入內容中識別出 YouTube 影片網址或 ID。\n請確認您貼上的是正確的伴奏影片網址。');
    return;
  }
  
  showToast("🔍 正在線上擷取 YouTube 伴奏歌名...", "success");
  
  const title = await getYouTubeVideoTitle(videoId);
  const song = { id: Date.now().toString(), videoId, title };
  
  if (!currentPlaying) {
    currentPlaying = song;
    localStorage.setItem('ktv_current', JSON.stringify(currentPlaying));
    
    syncStateWithTV("PLAY");
    
    if (ctrlActiveConn) {
      showToast(`🎵 正在電視端為您播放：\n${title}`);
    } else {
      showToast(`📝 電視未連線，已暫存為正在播放：\n${title}`);
    }
  } else {
    if (isNext) {
      playlistQueue.unshift(song);
      showToast(`⭐ 已成功「插播」下一首播放：\n${title}`);
    } else {
      playlistQueue.push(song);
      showToast(`📝 已成功加入點歌佇列：\n${title}`);
    }
    localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
    syncStateWithTV("NONE");
  }
  
  renderControllerQueue();
  
  const urlInput = document.getElementById('youtube-url-input');
  if (urlInput) urlInput.value = '';
}

// 自動切歌下一首
function playNextSong() {
  if (playlistQueue.length > 0) {
    currentPlaying = playlistQueue.shift();
    localStorage.setItem('ktv_current', JSON.stringify(currentPlaying));
    localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
    
    syncStateWithTV("PLAY");
    showToast(`⏭ 已切換播放：${currentPlaying.title}`);
  } else {
    currentPlaying = null;
    localStorage.setItem('ktv_current', 'null');
    
    syncStateWithTV("STOP");
    showToast(`⏹ 已無排隊歌曲，停止播放`);
  }
  renderControllerQueue();
}

// 重建連線握手
function connectToTV(roomCodeVal) {
  const badge = document.getElementById('conn-status-badge');
  if (badge) {
    badge.className = 'px-2.5 py-1 text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800 rounded-full flex items-center gap-1.5';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span> 連線中...`;
  }
  
  if (ctrlPeer) {
    try {
      ctrlPeer.destroy();
    } catch(e) {}
  }
  
  ctrlPeer = new Peer(PEER_CONFIG);
  
  ctrlPeer.on('open', () => {
    const conn = ctrlPeer.connect('web-ktv-' + roomCodeVal);
    setupControllerEvents(conn, roomCodeVal);
  });
  
  ctrlPeer.on('error', (err) => {
    console.error('[手機端 Peer 錯誤日誌]:', err);
    if (badge) {
      badge.className = 'px-2.5 py-1 text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 rounded-full flex items-center gap-1.5';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span> 連線錯誤`;
    }
  });
}

function setupControllerEvents(conn, roomCodeVal) {
  const badge = document.getElementById('conn-status-badge');

  conn.on('open', () => {
    ctrlActiveConn = conn;
    localStorage.setItem('ktv_last_room', roomCodeVal);
    
    if (badge) {
      badge.className = 'px-2.5 py-1 text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full flex items-center gap-1.5';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> 已連線電視：${roomCodeVal}`;
    }
    
    syncStateWithTV("NONE");
  });
  
  conn.on('data', (data) => {
    if (data.type === 'ENDED') {
      playNextSong();
    }
  });
  
  conn.on('close', () => {
    ctrlActiveConn = null;
    if (badge) {
      badge.className = 'px-2.5 py-1 text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 rounded-full flex items-center gap-1.5';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> 未連線`;
    }
  });
  
  conn.on('error', (err) => {
    console.error('[手機端連線通道錯誤日誌]:', err);
    if (badge) {
      badge.className = 'px-2.5 py-1 text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 rounded-full flex items-center gap-1.5';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span> 連線失敗`;
    }
  });
}

function setupSpeechRecognition(btn, input) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.style.display = 'none';
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-TW';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  
  let isListening = false;
  
  btn.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
  
  recognition.onstart = () => {
    isListening = true;
    btn.innerHTML = '<i class="fa-solid fa-microphone text-lg text-pink-500 animate-ping"></i>';
    input.placeholder = '語音辨識中，請開始說話...';
  };
  
  recognition.onend = () => {
    isListening = false;
    btn.innerHTML = '<i class="fa-solid fa-microphone text-lg"></i>';
    input.placeholder = '貼上 YouTube 影片網址、Shorts 或直播連結...';
  };
  
  recognition.onresult = (event) => {
    const resultText = event.results[0][0].transcript;
    input.value = resultText;
  };
}

function saveAndReloadQueue() {
  localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
  renderControllerQueue();
  syncStateWithTV("NONE");
}

// ==========================================
// 3. 遙控端與電視端初始化主函數
// ==========================================
function initController() {
  const safeBindClick = (id, callback) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', callback);
    }
  };

  playlistQueue = JSON.parse(localStorage.getItem('ktv_queue') || '[]');
  currentPlaying = JSON.parse(localStorage.getItem('ktv_current') || 'null');
  
  // 呼叫佇列渲染，此時由於函數宣告在最頂部，編譯時 100% 絕對存在！
  renderControllerQueue();
  
  const searchInput = document.getElementById('search-input');
  const btnSpeech = document.getElementById('btn-speech');
  const youtubeUrlInput = document.getElementById('youtube-url-input');
  const roomCodeInput = document.getElementById('room-code-input');
  
  const lastRoom = localStorage.getItem('ktv_last_room');
  if (lastRoom && roomCodeInput) {
    roomCodeInput.value = lastRoom;
    setTimeout(() => {
      connectToTV(lastRoom);
    }, 500);
  }
  
  safeBindClick('btn-connect', () => {
    if (!roomCodeInput) return;
    const room = roomCodeInput.value.trim();
    if (room.length === 6 && /^\d+$/.test(room)) {
      connectToTV(room);
    } else {
      alert('請輸入正確的 6 位數房間配對碼！');
    }
  });
  
  safeBindClick('btn-manual-add', () => {
    if (!youtubeUrlInput) return;
    const urlVal = youtubeUrlInput.value.trim();
    if (!urlVal) {
      alert('請在框內貼入影片網址！');
      return;
    }
    addSongFromUrl(urlVal, false);
  });

  safeBindClick('btn-manual-add-next', () => {
    if (!youtubeUrlInput) return;
    const urlVal = youtubeUrlInput.value.trim();
    if (!urlVal) {
      alert('請在框內貼入影片網址！');
      return;
    }
    addSongFromUrl(urlVal, true);
  });
  
  if (btnSpeech && searchInput) {
    setupSpeechRecognition(btnSpeech, searchInput);
  }
  
  safeBindClick('btn-search-yt', () => {
    if (!searchInput) return;
    const query = searchInput.value.trim();
    const searchUrl = query 
      ? `https://m.youtube.com/results?search_query=${encodeURIComponent(query + ' KTV 伴奏')}`
      : `https://m.youtube.com`;
    
    const popupWin = window.open(searchUrl, 'ytSearchPopup', 'width=450,height=650,scrollbars=yes,status=yes');
    if (!popupWin || popupWin.closed || typeof popupWin.closed === 'undefined') {
      alert('⚠️ 彈出視窗已被手機瀏覽器阻擋！請允許瀏覽器彈出視窗功能。');
    } else {
      showToast("🔍 已開啟 YouTube，複製網址後回到這貼上點歌！");
    }
  });

  safeBindClick('btn-popup-yt', () => {
    const searchUrl = `https://m.youtube.com`;
    const popupWin = window.open(searchUrl, 'ytSearchPopup', 'width=450,height=650,scrollbars=yes,status=yes');
    
    if (!popupWin || popupWin.closed || typeof popupWin.closed === 'undefined') {
      alert('⚠️ 彈出視窗已被手機瀏覽器阻擋！\n請前往瀏覽器設定中「允許彈出視窗」。');
    } else {
      showToast("💡 已開啟 YouTube 小視窗，請複製網址並回來貼上點歌！");
    }
  });

  safeBindClick('btn-clipboard-quick', async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        alert('您的行動瀏覽器目前不支援自動讀取剪貼簿。\n\n💡 解決方式：請直接在上方輸入框中「長按」並貼上，然後點按點歌即可！');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (text) {
        if (youtubeUrlInput) youtubeUrlInput.value = text;
        addSongFromUrl(text, false);
      } else {
        alert('剪貼簿中目前無任何內容。');
      }
    } catch (err) {
      console.warn(err);
      alert('⚠️ 因瀏覽器安全限制，不允許網頁直接讀取剪貼簿。\n\n💡 解決方式：請直接在上方輸入框中「長按」並貼上，然後點按「自動抓取歌名並點歌」即可！');
    }
  });

  safeBindClick('btn-replay', () => {
    syncStateWithTV("REPLAY");
  });
  
  const btnPlayPause = document.getElementById('btn-play-pause');
  safeBindClick('btn-play-pause', () => {
    ctrlIsPlaying = !ctrlIsPlaying;
    const icon = document.getElementById('play-pause-icon');
    const label = btnPlayPause ? (btnPlayPause.querySelector('span') || btnPlayPause) : null;
    if (ctrlIsPlaying) {
      if (icon) icon.className = 'fa-solid fa-pause text-lg text-pink-400';
      if (label) label.textContent = '暫停';
      syncStateWithTV("RESUME");
    } else {
      if (icon) icon.className = 'fa-solid fa-play text-lg text-emerald-400';
      if (label) label.textContent = '播放';
      syncStateWithTV("PAUSE");
    }
  });
  
  safeBindClick('btn-next', () => {
    playNextSong();
  });
}

function initTV() {
  const activateBtn = document.getElementById('btn-activate');
  const splashScreen = document.getElementById('splash-screen');
  
  if (activateBtn) {
    activateBtn.addEventListener('click', () => {
      if (splashScreen) splashScreen.classList.add('hidden');
      setupYouTubePlayer();
      setupTVPeer();
    });
  }

  const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
  const playerContainer = document.getElementById('player-container');
  const queueSidebar = document.getElementById('queue-sidebar');
  let isFullVideo = false;

  if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', () => {
      isFullVideo = !isFullVideo;
      if (isFullVideo) {
        if (playerContainer) {
          playerContainer.classList.remove('col-span-9');
          playerContainer.classList.add('col-span-12');
        }
        if (queueSidebar) queueSidebar.classList.add('hidden');
        btnToggleFullscreen.innerHTML = '<i class="fa-solid fa-compress"></i>';
      } else {
        if (playerContainer) {
          playerContainer.classList.remove('col-span-12');
          playerContainer.classList.add('col-span-9');
        }
        if (queueSidebar) queueSidebar.classList.remove('hidden');
        btnToggleFullscreen.innerHTML = '<i class="fa-solid fa-expand"></i>';
      }
    });
  }
}

// ==========================================
// 4. 全域 window 作用域物件綁定 (動態 DOM onClick)
// ==========================================
window.moveSongUp = function(idx) {
  if (idx > 0) {
    const temp = playlistQueue[idx];
    playlistQueue[idx] = playlistQueue[idx - 1];
    playlistQueue[idx - 1] = temp;
    saveAndReloadQueue();
  }
};

window.moveSongDown = function(idx) {
  if (idx < playlistQueue.length - 1) {
    const temp = playlistQueue[idx];
    playlistQueue[idx] = playlistQueue[idx + 1];
    playlistQueue[idx + 1] = temp;
    saveAndReloadQueue();
  }
};

window.insertSongNext = function(idx) {
  const song = playlistQueue.splice(idx, 1)[0];
  playlistQueue.unshift(song);
  saveAndReloadQueue();
  showToast("⭐ 已將排隊歌曲改為優先「插播」！");
};

window.deleteSong = function(idx) {
  const title = playlistQueue[idx].title;
  playlistQueue.splice(idx, 1);
  saveAndReloadQueue();
  showToast(`❌ 已將歌曲移除：${title}`, "error");
};

window.toggleIframeFallback = function() {
  const fallback = document.getElementById('iframe-fallback');
  if (fallback) fallback.classList.toggle('hidden');
};

window.toggleTheaterMode = function() {
  const wrapper = document.getElementById('iframe-wrapper');
  if (wrapper) {
    if (wrapper.classList.contains('h-[450px]')) {
      wrapper.classList.remove('h-[450px]');
      wrapper.classList.add('h-[700px]');
    } else {
      wrapper.classList.remove('h-[700px]');
      wrapper.classList.add('h-[450px]');
    }
  }
};