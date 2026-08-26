/**
 * Web-KTV-Cast 核心邏輯 (v2.3 聯合 API 極速無縫點歌版)
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
  
  activateBtn.addEventListener('click', () => {
    splashScreen.classList.add('hidden');
    setupYouTubePlayer();
    setupTVPeer();
  });

  const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
  const playerContainer = document.getElementById('player-container');
  const queueSidebar = document.getElementById('queue-sidebar');
  let isFullVideo = false;

  btnToggleFullscreen.addEventListener('click', () => {
    isFullVideo = !isFullVideo;
    if (isFullVideo) {
      playerContainer.classList.remove('col-span-9');
      playerContainer.classList.add('col-span-12');
      queueSidebar.classList.add('hidden');
      btnToggleFullscreen.innerHTML = '<i class="fa-solid fa-compress"></i>';
    } else {
      playerContainer.classList.remove('col-span-12');
      playerContainer.classList.add('col-span-9');
      queueSidebar.classList.remove('hidden');
      btnToggleFullscreen.innerHTML = '<i class="fa-solid fa-expand"></i>';
    }
  });
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
  
  document.getElementById('room-code-display').textContent = tvRoomCode;
  document.getElementById('hud-room').textContent = tvRoomCode;
  
  const peer = new Peer('web-ktv-' + tvRoomCode);
  
  peer.on('open', () => {
    document.getElementById('tv-status').innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> 雲端通訊就緒，等待遙控端連線...
    `;
  });
  
  peer.on('connection', (conn) => {
    tvActiveConn = conn;
    document.getElementById('tv-status').innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span> 遙控端手機已連線 🟢
    `;
    
    conn.on('data', (data) => {
      handleTVMessage(data);
    });
    
    conn.on('close', () => {
      document.getElementById('tv-status').innerHTML = `
        <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> 遙控端已斷開，等待重新連線...
      `;
      tvActiveConn = null;
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      tvRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
      localStorage.setItem('ktv_room_code', tvRoomCode);
      location.reload();
    } else {
      document.getElementById('tv-status').innerHTML = `
        <span class="w-2 h-2 rounded-full bg-rose-500"></span> 連線故障，請重新啟動頁面
      `;
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
  
  document.getElementById('idle-overlay').classList.add('hidden');
  document.getElementById('hud-overlay').classList.add('opacity-100');
  
  document.getElementById('current-song-title').textContent = title;
  document.getElementById('hud-title').textContent = title;
  
  if (tvPlayer && tvPlayer.loadVideoById) {
    tvPlayer.loadVideoById({
      videoId: videoId,
      startSeconds: 0
    });
  }
}

function updateTVQueueUI(queue, currentPlaying) {
  const tvQueueList = document.getElementById('tv-queue-list');
  tvQueueList.innerHTML = '';
  
  if (currentPlaying) {
    document.getElementById('idle-overlay').classList.add('hidden');
    document.getElementById('hud-overlay').classList.add('opacity-100');
    document.getElementById('current-song-title').textContent = currentPlaying.title;
    document.getElementById('hud-title').textContent = currentPlaying.title;
  } else {
    document.getElementById('idle-overlay').classList.remove('hidden');
    document.getElementById('hud-overlay').classList.remove('opacity-100');
    document.getElementById('current-song-title').textContent = "目前無歌曲播放";
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
// 控制器端 (Controller) 邏輯變數
// ==========================================
let ctrlPeer = null;
let ctrlActiveConn = null;
let playlistQueue = [];
let currentPlaying = null;
let ctrlIsPlaying = true;

function initController() {
  playlistQueue = JSON.parse(localStorage.getItem('ktv_queue') || '[]');
  currentPlaying = JSON.parse(localStorage.getItem('ktv_current') || 'null');
  
  renderControllerQueue();
  
  const searchInput = document.getElementById('search-input');
  const btnSpeech = document.getElementById('btn-speech');
  const btnSearchYT = document.getElementById('btn-search-yt');
  const btnSearchYTFallback = document.getElementById('btn-search-yt-fallback');
  const youtubeUrlInput = document.getElementById('youtube-url-input');
  const youtubeTitleInput = document.getElementById('youtube-title-input');
  const btnClipboardAdd = document.getElementById('btn-clipboard-add');
  const btnManualAdd = document.getElementById('btn-manual-add');
  const roomCodeInput = document.getElementById('room-code-input');
  const btnConnect = document.getElementById('btn-connect');
  const btnCloseResults = document.getElementById('btn-close-results');
  
  const btnReplay = document.getElementById('btn-replay');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnNext = document.getElementById('btn-next');
  
  const lastRoom = localStorage.getItem('ktv_last_room');
  if (lastRoom) {
    roomCodeInput.value = lastRoom;
    connectToTV(lastRoom);
  }
  
  btnConnect.addEventListener('click', () => {
    const room = roomCodeInput.value.trim();
    if (room.length === 6 && /^\d+$/.test(room)) {
      connectToTV(room);
    } else {
      alert('請輸入正確的 6 位數房間配對碼！');
    }
  });
  
  btnManualAdd.addEventListener('click', () => {
    const urlVal = youtubeUrlInput.value.trim();
    const titleVal = youtubeTitleInput.value.trim();
    if (!urlVal) {
      alert('請填入 YouTube 連結或影片 ID！');
      return;
    }
    const videoId = extractYouTubeVideoId(urlVal) || (urlVal.length === 11 ? urlVal : null);
    if (!videoId) {
      alert('未能在輸入內容中識別出 YouTube Video ID。');
      return;
    }
    const finalTitle = titleVal || `歌曲 - ${videoId}`;
    addSong(videoId, finalTitle);
    
    youtubeUrlInput.value = '';
    youtubeTitleInput.value = '';
  });
  
  setupSpeechRecognition(btnSpeech, searchInput);
  
  // 內建 KTV 伴奏極速搜尋 (無外連)
  btnSearchYT.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      searchYouTubeKTV(query);
    } else {
      alert('請先輸入歌手或歌名關鍵字！');
    }
  });

  // 備用外連搜尋按鈕
  btnSearchYTFallback.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' KTV 伴奏')}`;
      window.open(searchUrl, '_blank');
    } else {
      alert('請先輸入關鍵字！');
    }
  });

  btnCloseResults.addEventListener('click', () => {
    document.getElementById('search-results-box').classList.add('hidden');
    document.getElementById('search-results-list').innerHTML = '';
  });

  btnClipboardAdd.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const videoId = extractYouTubeVideoId(text) || (text.trim().length === 11 ? text.trim() : null);
        if (videoId) {
          const songName = prompt('已從剪貼簿擷取 YouTube 連結！請確認或命名這首歌：', '新歌曲伴奏');
          if (songName !== null) {
            addSong(videoId, songName || `剪貼簿歌曲 - ${videoId}`);
          }
        } else {
          alert('剪貼簿中未偵測到有效的 YouTube 連結。');
        }
      } else {
        alert('無法讀取剪貼簿，請確定剪貼簿中已有複製的連結。');
      }
    } catch (err) {
      console.error(err);
      alert('因瀏覽器授權政策限制，無法自動存取剪貼簿，請直接在上方手動貼上網址。');
    }
  });
  
  btnReplay.addEventListener('click', () => {
    if (ctrlActiveConn) ctrlActiveConn.send({ type: 'REPLAY' });
  });
  
  btnPlayPause.addEventListener('click', () => {
    ctrlIsPlaying = !ctrlIsPlaying;
    const icon = document.getElementById('play-pause-icon');
    const label = btnPlayPause.querySelector('span');
    if (ctrlIsPlaying) {
      icon.className = 'fa-solid fa-pause text-lg text-pink-400';
      label.textContent = '暫停';
      if (ctrlActiveConn) ctrlActiveConn.send({ type: 'RESUME' });
    } else {
      icon.className = 'fa-solid fa-play text-lg text-emerald-400';
      label.textContent = '播放';
      if (ctrlActiveConn) ctrlActiveConn.send({ type: 'PAUSE' });
    }
  });
  
  btnNext.addEventListener('click', () => {
    playNextSong();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker 註冊完成', reg.scope))
      .catch(err => console.error('Service Worker 註冊失敗', err));
  }
}

function connectToTV(roomCodeVal) {
  const badge = document.getElementById('conn-status-badge');
  badge.className = 'px-2.5 py-1 text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800 rounded-full flex items-center gap-1.5';
  badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span> 連線中...`;
  
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
    ctrlPeer = new Peer();
    ctrlPeer.on('open', () => {
      initiateConnect();
    });
    ctrlPeer.on('error', (err) => {
      console.error('PeerJS Controller Error:', err);
      badge.className = 'px-2.5 py-1 text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 rounded-full flex items-center gap-1.5';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span> 連線錯誤`;
    });
  }
}

function setupControllerEvents(conn, roomCodeVal) {
  const badge = document.getElementById('conn-status-badge');

  conn.on('open', () => {
    ctrlActiveConn = conn;
    localStorage.setItem('ktv_last_room', roomCodeVal);
    
    badge.className = 'px-2.5 py-1 text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full flex items-center gap-1.5';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> 已連線電視：${roomCodeVal}`;
    
    syncQueueWithTV();
  });
  
  conn.on('data', (data) => {
    if (data.type === 'ENDED') {
      playNextSong();
    }
  });
  
  conn.on('close', () => {
    ctrlActiveConn = null;
    badge.className = 'px-2.5 py-1 text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 rounded-full flex items-center gap-1.5';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> 未連線`;
  });
  
  conn.on('error', (err) => {
    console.error(err);
    badge.className = 'px-2.5 py-1 text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 rounded-full flex items-center gap-1.5';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span> 連線失敗`;
  });
}

function extractYouTubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
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
    input.placeholder = '輸入歌名、歌手或關鍵字...';
  };
  
  recognition.onresult = (event) => {
    const resultText = event.results[0][0].transcript;
    input.value = resultText;
  };
}

// 核心搜尋演算法（v2.3 升級版：去中心化聯合影音 API 鏈）
async function searchYouTubeKTV(query) {
  const resultsBox = document.getElementById('search-results-box');
  const resultsList = document.getElementById('search-results-list');
  
  if (!resultsBox || !resultsList) return;
  
  resultsBox.classList.remove('hidden');
  resultsList.innerHTML = `
    <div class="text-center py-8 text-slate-500 text-xs">
      <i class="fa-solid fa-circle-notch animate-spin text-indigo-500 text-xl mb-2.5 block"></i>
      正在透過雲端 API 檢索伴奏中...
    </div>
  `;
  
  const keyword = encodeURIComponent(query + ' KTV 伴奏');
  
  // Piped 公用 API 伺服器清單（免 HTML 代理，自帶 CORS 授權，速度極快）
  const pipedApis = [
    'https://api.piped.yt',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.syncpundit.io',
    'https://pipedapi.kavin.rocks'
  ];
  
  let data = null;
  let successApi = null;
  
  for (const api of pipedApis) {
    try {
      const searchUrl = `${api}/search?q=${keyword}&filter=videos`;
      console.log('嘗試從 Piped API 取得資料:', searchUrl);
      const response = await fetch(searchUrl);
      if (response.ok) {
        data = await response.json();
        if (Array.isArray(data) || (data && Array.isArray(data.items))) {
          successApi = api;
          break;
        }
      }
    } catch (err) {
      console.warn('該 Piped API 忙碌，自動嘗試下一個備用通道...', err);
    }
  }
  
  // 若 Piped 均連線失敗，自動轉移至備用的 Invidious JSON API
  if (!data) {
    const invidiousApis = [
      'https://invidious.projectsegfau.lt/api/v1/search',
      'https://yewtu.be/api/v1/search'
    ];
    for (const api of invidiousApis) {
      try {
        const searchUrl = `${api}?q=${keyword}&type=video`;
        const response = await fetch(searchUrl);
        if (response.ok) {
          data = await response.json();
          successApi = api;
          break;
        }
      } catch (err) {
        console.warn('Invidious API 忙碌...', err);
      }
    }
  }
  
  if (!data) {
    renderSearchError(resultsList, query);
    return;
  }
  
  try {
    const items = Array.isArray(data) ? data : (data.items || []);
    
    if (items.length === 0) {
      resultsList.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">找不到對應的 KTV 影片，請換個關鍵字搜尋。</div>`;
      return;
    }
    
    resultsList.innerHTML = '';
    
    items.slice(0, 8).forEach(item => {
      let videoId = item.videoId;
      if (!videoId && item.url) {
        const parts = item.url.split('v=');
        if (parts.length > 1) {
          videoId = parts[1];
        }
      }
      
      if (!videoId) return;
      
      const title = item.title || '未知歌曲';
      
      // 處理時長格式
      let duration = '長度未知';
      const secVal = item.duration || item.lengthSeconds;
      if (secVal) {
        if (typeof secVal === 'number') {
          const mins = Math.floor(secVal / 60);
          const secs = secVal % 60;
          duration = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
          duration = secVal;
        }
      }
      
      const author = item.uploaderName || item.author || 'YouTube';
      const thumbnail = item.thumbnail || (item.videoThumbnails && item.videoThumbnails[0]?.url) || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      
      const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      
      const div = document.createElement('div');
      div.className = 'flex gap-3.5 p-2 bg-slate-900/50 hover:bg-slate-900 rounded-xl transition items-center text-xs border border-slate-850';
      div.innerHTML = `
        <img src="${thumbnail}" class="w-20 h-12 object-cover rounded-lg shrink-0 border border-slate-800 shadow" onerror="this.src='https://img.youtube.com/vi/${videoId}/hqdefault.jpg'">
        <div class="flex-grow min-w-0 pr-1">
          <div class="font-semibold text-slate-200 line-clamp-2 leading-tight">${title}</div>
          <div class="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5">
            <span class="truncate max-w-[90px]">${author}</span>
            <span>•</span>
            <span>${duration}</span>
          </div>
        </div>
        <div class="flex shrink-0 gap-1">
          <button onclick="addSong('${videoId}', '${safeTitle}')" class="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[10px] transition">
            點歌
          </button>
          <button onclick="addSongNext('${videoId}', '${safeTitle}')" class="px-2.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[10px] transition">
            插播
          </button>
        </div>
      `;
      resultsList.appendChild(div);
    });
    
  } catch (error) {
    console.error('API 解析失敗:', error);
    renderSearchError(resultsList, query);
  }
}

function renderSearchError(container, query) {
  container.innerHTML = `
    <div class="text-center py-8 text-slate-400 text-xs space-y-2">
      <p>⚠️ 內建雲端搜尋暫時連線忙碌中。</p>
      <button id="btn-search-yt-retry" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[10px] transition">
        點此改用「新分頁搜尋」 <i class="fa-solid fa-arrow-up-right-from-square ml-0.5"></i>
      </button>
    </div>
  `;
  
  document.getElementById('btn-search-yt-retry')?.addEventListener('click', () => {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' KTV 伴奏')}`, '_blank');
  });
}

function addSong(videoId, title) {
  const song = { id: Date.now().toString(), videoId, title };
  if (!currentPlaying) {
    currentPlaying = song;
    localStorage.setItem('ktv_current', JSON.stringify(currentPlaying));
    if (ctrlActiveConn) {
      ctrlActiveConn.send({ type: 'PLAY', videoId: song.videoId, title: song.title });
    }
  } else {
    playlistQueue.push(song);
    localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
  }
  renderControllerQueue();
  syncQueueWithTV();
}

function playNextSong() {
  if (playlistQueue.length > 0) {
    currentPlaying = playlistQueue.shift();
    localStorage.setItem('ktv_current', JSON.stringify(currentPlaying));
    localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
    if (ctrlActiveConn) {
      ctrlActiveConn.send({ type: 'PLAY', videoId: currentPlaying.videoId, title: currentPlaying.title });
    }
  } else {
    currentPlaying = null;
    localStorage.setItem('ktv_current', 'null');
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
    queueContainer.innerHTML = '<div class="text-center py-10 text-slate-600 text-xs">歌單目前是空的，快去搜尋伴奏吧！</div>';
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
// 全域函式綁定 (用於動態 HTML onClick 事件)
// ==========================================
window.addSong = addSong;

window.addSongNext = function(videoId, title) {
  const song = { id: Date.now().toString(), videoId, title };
  if (!currentPlaying) {
    currentPlaying = song;
    localStorage.setItem('ktv_current', JSON.stringify(currentPlaying));
    if (ctrlActiveConn) {
      ctrlActiveConn.send({ type: 'PLAY', videoId: song.videoId, title: song.title });
    }
  } else {
    playlistQueue.unshift(song); // 插播至排隊歌單首位
    localStorage.setItem('ktv_queue', JSON.stringify(playlistQueue));
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
};

window.deleteSong = function(idx) {
  playlistQueue.splice(idx, 1);
  saveAndReloadQueue();
};

window.toggleIframeFallback = function() {
  const fallback = document.getElementById('iframe-fallback');
  if (fallback) fallback.classList.toggle('hidden');
};

window.toggleTheaterMode = function() {
  const wrapper = document.getElementById('iframe-wrapper');
  if (wrapper) {
    if (wrapper.classList.contains('h-[500px]')) {
      wrapper.classList.remove('h-[500px]');
      wrapper.classList.add('h-[750px]');
    } else {
      wrapper.classList.remove('h-[750px]');
      wrapper.classList.add('h-[500px]');
    }
  }
};