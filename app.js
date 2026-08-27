/**
 * Web-KTV-Cast 核心邏輯 (v2.6 智慧直連與全格式相容版)
 */

document.addEventListener('DOMContentLoaded', () => {
  const isTVMode = document.getElementById('tv-player') !== null;
  
  if (isTVMode) {
    initTV();
  } else {
    initController();
  }
});

// ==========================================
// 電視端 (TV) 邏輯變數
// ==========================================
let tvPlayer = null;
let tvActiveConn = null;
let tvRoomCode = '';
let tvPlayerReady = false;
let tvPendingPlay = null;

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

function setupYouTubePlayer() {
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  
  window.onYouTubeIframeAPIReady = function() {
    tvPlayer = new YT.Player('tv-player', {
      height: '100%',
      width: '100%',
      videoId: '',
      playerVars: {
        'autoplay': 1,
        'controls': 1,
        'rel': 0,
        'showinfo': 0,
        'modestbranding': 1,
        'iv_load_policy': 3
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange,
        'onError': onPlayerError
      }
    });
  };
}

function onPlayerReady() {
  tvPlayerReady = true;
  console.log('YouTube API 就緒。');
  if (tvPendingPlay) {
    playVideo(tvPendingPlay.videoId, tvPendingPlay.title);
    tvPendingPlay = null;
  }
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    if (tvActiveConn) {
      tvActiveConn.send({ type: 'ENDED' });
    }
  }
}

function onPlayerError(event) {
  console.error('YouTube 播放異常:', event.data);
  setTimeout(() => {
    if (tvActiveConn) {
      tvActiveConn.send({ type: 'ENDED' });
    }
  }, 3000);
}

function setupTVPeer() {
  tvRoomCode = localStorage.getItem('ktv_room_code');
  if (!tvRoomCode || tvRoomCode.length !== 6) {
    tvRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('ktv_room_code', tvRoomCode);
  }
  
  const codeDisplay = document.getElementById('room-code-display');
  const hudRoom = document.getElementById('hud-room');
  if (codeDisplay) codeDisplay.textContent = tvRoomCode;
  if (hudRoom) hudRoom.textContent = tvRoomCode;
  
  const peer = new Peer('web-ktv-' + tvRoomCode);
  
  peer.on('open', () => {
    const status = document.getElementById('tv-status');
    if (status) {
      status.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> 雲端通訊就緒，等待遙控端連線...
      `;
    }
  });
  
  peer.on('connection', (conn) => {
    tvActiveConn = conn;
    const status = document.getElementById('tv-status');
    if (status) {
      status.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-500"></span> 遙控端手機已連線 🟢
      `;
    }
    
    conn.on('data', (data) => {
      handleTVMessage(data);
    });
    
    conn.on('close', () => {
      if (status) {
        status.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> 遙控端已斷開，等待重新連線...
        `;
      }
      tvActiveConn = null;
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      tvRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
      localStorage.setItem('ktv_room_code', tvRoomCode);
      location.reload();
    } else {
      const status = document.getElementById('tv-status');
      if (status) {
        status.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-rose-500"></span> 連線故障，請重新啟動頁面
        `;
      }
    }
  });
}

function handleTVMessage(data) {
  switch (data.type) {
    case 'PLAY':
      playVideo(data.videoId, data.title);
      break;
    case 'PAUSE':
      if (tvPlayer && tvPlayer.pauseVideo) tvPlayer.pauseVideo();
      break;
    case 'RESUME':
      if (tvPlayer && tvPlayer.playVideo) tvPlayer.playVideo();
      break;
    case 'REPLAY':
      if (tvPlayer && tvPlayer.seekTo) {
        tvPlayer.seekTo(0);
        tvPlayer.playVideo();
      }
      break;
    case 'SYNC_QUEUE':
      updateTVQueueUI(data.queue, data.currentPlaying);
      break;
    default:
      break;
  }
}

function playVideo(videoId, title) {
  if (!tvPlayerReady) {
    tvPendingPlay = { videoId, title };
    return;
  }
  
  const idle = document.getElementById('idle-overlay');
  const hud = document.getElementById('hud-overlay');
  const curTitle = document.getElementById('current-song-title');
  const hudTitle = document.getElementById('hud-title');
  
  if (idle) idle.classList.add('hidden');
  if (hud) hud.classList.add('opacity-100');
  if (curTitle) curTitle.textContent = title;
  if (hudTitle) hudTitle.textContent = title;
  
  if (tvPlayer && tvPlayer.loadVideoById) {
    tvPlayer.loadVideoById({
      videoId: videoId,
      startSeconds: 0
    });
  }
}

function updateTVQueueUI(queue, currentPlaying) {
  const tvQueueList = document.getElementById('tv-queue-list');
  if (!tvQueueList) return;
  tvQueueList.innerHTML = '';
  
  const idle = document.getElementById('idle-overlay');
  const hud = document.getElementById('hud-overlay');
  const curTitle = document.getElementById('current-song-title');
  const hudTitle = document.getElementById('hud-title');
  
  if (currentPlaying) {
    if (idle) idle.classList.add('hidden');
    if (hud) hud.classList.add('opacity-100');
    if (curTitle) curTitle.textContent = currentPlaying.title;
    if (hudTitle) hudTitle.textContent = currentPlaying.title;
  } else {
    if (idle) idle.classList.remove('hidden');
    if (hud) hud.classList.remove('opacity-100');
    if (curTitle) curTitle.textContent = "目前無歌曲播放";
    if (tvPlayer && tvPlayer.stopVideo) tvPlayer.stopVideo();
  }
  
  if (queue.length === 0) {
    tvQueueList.innerHTML = '<li class="text-slate-600 text-xs text-center py-12">佇列中目前無其他排隊歌曲</li>';
    return;
  }
  
  queue.forEach((song, idx) => {
    const li = document.createElement('li');
    li.className = 'py-2 px-3 bg-slate-900/40 rounded-xl border border-slate-850/60 text-slate-300 flex justify-between text-xs items-center';
    li.innerHTML = `
      <span class="truncate pr-2 font-medium">${idx + 1}. ${song.title}</span>
      <span class="text-[9px] bg-indigo-950 text-indigo-400 font-bold px-1.5 py-0.5 rounded uppercase shrink-0 border border-indigo-900/30">NEXT</span>
    `;
    tvQueueList.appendChild(li);
  });
}


// ==========================================
// 控制器端 (Controller) 邏輯與相容性優化
// ==========================================
let ctrlPeer = null;
let ctrlActiveConn = null;
let playlistQueue = [];
let currentPlaying = null;
let ctrlIsPlaying = true;

function initController() {
  // 安全元素事件綁定輔助函數 (核心防崩潰防線)
  const safeBindClick = (id, callback) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', callback);
    } else {
      console.warn(`[安全容錯] 未能在網頁中找到 ID 為 "${id}" 的按鈕，已自動忽略綁定，防止程式集體中斷。`);
    }
  };

  playlistQueue = JSON.parse(localStorage.getItem('ktv_queue') || '[]');
  currentPlaying = JSON.parse(localStorage.getItem('ktv_current') || 'null');
  
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
  
  // 連線電視
  safeBindClick('btn-connect', () => {
    if (!roomCodeInput) return;
    const room = roomCodeInput.value.trim();
    if (room.length === 6 && /^\d+$/.test(room)) {
      connectToTV(room);
    } else {
      alert('請輸入正確的 6 位數房間配對碼！');
    }
  });
  
  // 100% 官方+備用解析網址點歌
  safeBindClick('btn-manual-add', () => {
    if (!youtubeUrlInput) return;
    const urlVal = youtubeUrlInput.value.trim();
    if (!urlVal) {
      alert('請在框內貼入影片網址！');
      return;
    }
    addSongFromUrl(urlVal, false);
  });

  // 100% 官方+備用解析網址插播
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
  
  // 語音輸入框關聯：點擊「開始搜尋」會直接開啟 YouTube 視窗並帶入搜尋詞，方便一鍵查歌
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

  // 彈出式 YouTube 找歌小視窗
  safeBindClick('btn-popup-yt', () => {
    const searchUrl = `https://m.youtube.com`;
    const popupWin = window.open(searchUrl, 'ytSearchPopup', 'width=450,height=650,scrollbars=yes,status=yes');
    
    if (!popupWin || popupWin.closed || typeof popupWin.closed === 'undefined') {
      alert('⚠️ 彈出視窗已被手機瀏覽器阻擋！\n請前往瀏覽器設定中「允許彈出視窗」，複製連結後返回此網頁貼上。');
    } else {
      showToast("💡 已開啟 YouTube 小視窗，請複製伴唱網址，返回此處貼上點歌！");
    }
  });

  // 安全綁定：一鍵貼上並點播 (100% 高相容、防崩潰版)
  safeBindClick('btn-clipboard-quick', async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        alert('您的行動瀏覽器目前不支援自動讀取剪貼簿。\n\n💡 解決方式：請直接在上方輸入框中「長按」並點擊「貼上」，然後點按點歌即可！');
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
      alert('⚠️ 因瀏覽器安全限制，不允許網頁直接讀取剪貼簿。\n\n💡 解決方式：請直接在上方輸入框中「長按」並點擊「貼上」，然後點按「自動抓取歌名並點歌」即可！');
    }
  });

  safeBindClick('btn-replay', () => {
    if (ctrlActiveConn) ctrlActiveConn.send({ type: 'REPLAY' });
  });
  
  const btnPlayPause = document.getElementById('btn-play-pause');
  safeBindClick('btn-play-pause', () => {
    ctrlIsPlaying = !ctrlIsPlaying;
    const icon = document.getElementById('play-pause-icon');
    const label = btnPlayPause ? (btnPlayPause.querySelector('span') || btnPlayPause) : null;
    if (ctrlIsPlaying) {
      if (icon) icon.className = 'fa-solid fa-pause text-lg text-pink-400';
      if (label) label.textContent = '暫停';
      if (ctrlActiveConn) ctrlActiveConn.send({ type: 'RESUME' });
    } else {
      if (icon) icon.className = 'fa-solid fa-play text-lg text-emerald-400';
      if (label) label.textContent = '播放';
      if (ctrlActiveConn) ctrlActiveConn.send({ type: 'PAUSE' });
    }
  });
  
  safeBindClick('btn-next', () => {
    playNextSong();
  });
}

// 萬能 YouTube 11位元 ID 提取器 (全面相容 Shorts, Live, 原始 ID, 分享短址)
function extractYouTubeVideoId(url) {
  if (!url) return null;
  url = url.trim();
  
  // 如果已經是乾淨的 11 位元 ID
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

// 雲端直連 oEmbed 與 Noembed 音樂標題獲取器 (100% 繁體中文、高可用、支援 CORS)
async function getYouTubeVideoTitle(videoId) {
  // 優先調用 YouTube 官方 oEmbed API
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.title) {
        return data.title;
      }
    }
  } catch (err) {
    console.warn('YouTube 官方 oEmbed 忙碌，轉用備份解析...', err);
  }
  
  // 備用調用 Noembed 解析器
  try {
    const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.title) {
        return data.title;
      }
    }
  } catch (err) {
    console.warn('Noembed 解析失敗，使用最終預設值', err);
  }
  
  return `KTV 伴唱影片 (${videoId})`;
}

// 核心整合：網址解析、線上歌名提取與電視推送
async function addSongFromUrl(url, isNext = false) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    alert('未能在輸入內容中識別出 YouTube 影片網址或 ID。\n請確認您貼上的是正確的伴奏影片網址。');
    return;
  }
  
  showToast("🔍 正在線上擷取 YouTube 伴奏歌名...", "success");
  
  // 線上極速同步中文歌名，告別亂碼 ID
  const title = await getYouTubeVideoTitle(videoId);
  const song = { id: Date.now().toString(), videoId, title };
  
  if (!currentPlaying) {
    currentPlaying = song;
    localStorage.setItem('ktv_current', JSON.stringify(currentPlaying));
    if (ctrlActiveConn) {
      ctrlActiveConn.send({ type: 'PLAY', videoId: song.videoId, title: song.title });
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
  }
  
  renderControllerQueue();
  syncQueueWithTV();
  
  // 清空輸入框
  const urlInput = document.getElementById('youtube-url-input');
  if (urlInput) urlInput.value = '';
}

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

function connectToTV(roomCodeVal) {
  const badge = document.getElementById('conn-status-badge');
  if (badge) {
    badge.className = 'px-2.5 py-1 text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800 rounded-full flex items-center gap-1.5';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span> 連線中...`;
  }
  
  const initiateConnect = () => {
    if (ctrlActiveConn) {
      ctrlActiveConn.close();
    }
    const conn = ctrlPeer.connect('web-ktv-' + roomCodeVal);
    setupControllerEvents(conn, roomCodeVal);
  };

  if (ctrlPeer && !ctrlPeer.destroyed) {
    initiateConnect();
  } else {
    if (typeof Peer === 'undefined') {
      console.warn('PeerJS CDN 尚未載入完成，稍後重新嘗試連線。');
      return;
    }
    ctrlPeer = new Peer();
    ctrlPeer.on('open', () => {
      initiateConnect();
    });
    ctrlPeer.on('error', (err) => {
      console.error('PeerJS Controller Error:', err);
      if (badge) {
        badge.className = 'px-2.5 py-1 text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 rounded-full flex items-center gap-1.5';
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span> 連線錯誤`;
      }
    });
  }
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
    
    syncQueueWithTV();
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
    console.error(err);
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

function playNextSong() {
  if (playlistQueue.length > 0) {
    currentPlaying = playlistQueue.shift();
    localStorage.setItem('ktv_current', JSON.stringify(currentPlaying));
    localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
    if (ctrlActiveConn) {
      ctrlActiveConn.send({ type: 'PLAY', videoId: currentPlaying.videoId, title: currentPlaying.title });
      showToast(`⏭ 已切換播放：${currentPlaying.title}`);
    }
  } else {
    currentPlaying = null;
    localStorage.setItem('ktv_current', 'null');
    showToast(`⏹ 已無排隊歌曲，停止播放`);
  }
  renderControllerQueue();
  syncQueueWithTV();
}

function syncQueueWithTV() {
  if (ctrlActiveConn) {
    ctrlActiveConn.send({
      type: 'SYNC_QUEUE',
      queue: playlistQueue,
      currentPlaying: currentPlaying
    });
  }
}

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

function saveAndReloadQueue() {
  localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
  renderControllerQueue();
  syncQueueWithTV();
}

// ==========================================
// 全域函式綁定
// ==========================================
window.addSongNext = function(videoId, title) {
  const song = { id: Date.now().toString(), videoId, title };
  if (!currentPlaying) {
    currentPlaying = song;
    localStorage.setItem('ktv_current', JSON.stringify(currentPlaying));
    if (ctrlActiveConn) {
      ctrlActiveConn.send({ type: 'PLAY', videoId: song.videoId, title: song.title });
      showToast(`🎵 正在電視端播放：${title}`);
    } else {
      showToast(`📝 暫存為「正在播放」：${title}`);
    }
  } else {
    playlistQueue.unshift(song);
    localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
    showToast(`⭐ 已成功「插播」至下一首播放！`);
  }
  renderControllerQueue();
  syncQueueWithTV();
};

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
  showToast(`⭐ 已將排隊歌曲改為優先「插播」！`);
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