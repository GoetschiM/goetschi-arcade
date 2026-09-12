/**
 * Goetschi Arcade - Client-Side Neural AI Pilot
 * Runs PyTorch PPO policies directly inside the browser at 60 FPS without server delay.
 */
(function() {
  'use strict';

  let currentModel = null;
  let isAiActive = false;
  let aiInterval = null;
  let currentDriver = null;

  // Pure JS Matrix Multiplication Forward Pass
  function predictAction(obs, model) {
    if (!model || !model.layers) return 0;
    let x = obs.slice();
    for (let l = 0; l < model.layers.length; l++) {
      const layer = model.layers[l];
      const W = layer.w;
      const b = layer.b;
      const isTanh = (layer.act === 'tanh');
      const nextX = new Float32Array(W.length);
      for (let i = 0; i < W.length; i++) {
        const row = W[i];
        let sum = b[i];
        for (let j = 0; j < x.length; j++) {
          sum += row[j] * x[j];
        }
        nextX[i] = isTanh ? Math.tanh(sum) : sum;
      }
      x = nextX;
    }
    // Argmax over action logits
    let maxVal = -Infinity;
    let maxIdx = 0;
    for (let i = 0; i < x.length; i++) {
      if (x[i] > maxVal) {
        maxVal = x[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  // Load Model from Server or LocalStorage
  async function loadModel(url = './ai_model.json') {
    try {
      const res = await fetch(url + '?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data.layers && data.layers.length > 0) {
          currentModel = data;
          updateUI(true);
          console.log('[Goetschi AI Pilot] Model loaded successfully:', data.game);
          return true;
        }
      }
    } catch (e) {
      console.log('[Goetschi AI Pilot] No default server model found, waiting for manual upload.');
    }
    updateUI(false);
    return false;
  }

  function toggleAi() {
    if (!currentModel) {
      document.getElementById('ai-file-input')?.click();
      return;
    }
    isAiActive = !isAiActive;
    const btn = document.getElementById('goetschi-ai-toggle');
    if (btn) {
      if (isAiActive) {
        btn.classList.add('active');
        btn.innerHTML = '🤖 KI-PILOT: <span style="color:#00ffcc;font-weight:bold;">AKTIV</span>';
        startAiLoop();
      } else {
        btn.classList.remove('active');
        btn.innerHTML = '🤖 KI-PILOT: <span style="color:#888;">AUS</span>';
        stopAiLoop();
      }
    }
  }

  function startAiLoop() {
    stopAiLoop();
    if (!currentDriver) return;
    aiInterval = setInterval(() => {
      if (!isAiActive || !currentModel || !currentDriver) return;
      try {
        const obs = currentDriver.getObs();
        if (obs && obs.length === currentModel.obs_dim) {
          const act = predictAction(obs, currentModel);
          currentDriver.applyAction(act);
        }
      } catch (err) {
        console.error('[Goetschi AI Pilot] Error in step:', err);
      }
    }, currentDriver.interval || 60);
  }

  function stopAiLoop() {
    if (aiInterval) {
      clearInterval(aiInterval);
      aiInterval = null;
    }
    if (currentDriver && currentDriver.onStop) {
      currentDriver.onStop();
    }
  }

  function updateUI(hasModel) {
    let btn = document.getElementById('goetschi-ai-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'goetschi-ai-toggle';
      btn.className = 'goetschi-ai-btn';
      btn.title = 'Klicke hier, um der trainierten KI das Spielen zu überlassen!';
      document.body.appendChild(btn);

      const uploadBtn = document.createElement('button');
      uploadBtn.id = 'goetschi-ai-upload';
      uploadBtn.className = 'goetschi-ai-upload-btn';
      uploadBtn.title = 'Eigenes trainiertes Modell (.json) hochladen';
      uploadBtn.innerHTML = '🧠 Modell laden';
      document.body.appendChild(uploadBtn);

      const fileInput = document.createElement('input');
      fileInput.id = 'ai-file-input';
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
          try {
            const data = JSON.parse(evt.target.result);
            if (data.layers) {
              currentModel = data;
              updateUI(true);
              if (!isAiActive) toggleAi();
              alert('KI-Modell "' + (data.game || 'Custom') + '" erfolgreich geladen!');
            }
          } catch(err) {
            alert('Fehler beim Laden der Modell-Datei: ' + err.message);
          }
        };
        reader.readAsText(file);
      });

      uploadBtn.addEventListener('click', () => fileInput.click());
      btn.addEventListener('click', toggleAi);
    }

    if (hasModel) {
      btn.innerHTML = isAiActive 
        ? '🤖 KI-PILOT: <span style="color:#00ffcc;font-weight:bold;">AKTIV</span>'
        : '🤖 KI-PILOT: <span style="color:#888;">BEREIT</span>';
      btn.style.borderColor = '#00ffcc';
    } else {
      btn.innerHTML = '🤖 KI: <span style="color:#ffbe0b;">MODELL WÄHLEN</span>';
      btn.style.borderColor = '#ffbe0b';
    }
  }

  // Inject CSS Styles for Floating Badges
  const style = document.createElement('style');
  style.textContent = `
    .goetschi-ai-btn {
      position: fixed;
      top: 8px;
      right: 8px;
      z-index: 2147483640;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 99px;
      background: rgba(8, 20, 26, 0.88);
      border: 1px solid rgba(0, 255, 204, 0.4);
      color: #e0f8f4;
      font: 700 12px/1 system-ui, -apple-system, sans-serif;
      letter-spacing: 0.08em;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(8px);
      transition: all 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .goetschi-ai-btn:hover {
      transform: scale(1.04);
      background: rgba(12, 32, 42, 0.95);
      border-color: #00ffcc;
      box-shadow: 0 0 20px rgba(0, 255, 204, 0.4);
    }
    .goetschi-ai-btn.active {
      background: rgba(0, 45, 36, 0.92);
      border-color: #00ffcc;
      box-shadow: 0 0 22px rgba(0, 255, 204, 0.6);
      animation: aiPulse 2s infinite alternate;
    }
    .goetschi-ai-upload-btn {
      position: fixed;
      top: 8px;
      right: 185px;
      z-index: 2147483640;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 7px 12px;
      border-radius: 99px;
      background: rgba(14, 18, 28, 0.8);
      border: 1px solid rgba(160, 180, 220, 0.3);
      color: #9ab4d0;
      font: 600 11px/1 system-ui, -apple-system, sans-serif;
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: all 0.2s ease;
    }
    .goetschi-ai-upload-btn:hover {
      background: rgba(20, 28, 44, 0.95);
      color: #fff;
      border-color: #7b9fe0;
    }
    @keyframes aiPulse {
      0% { box-shadow: 0 0 10px rgba(0, 255, 204, 0.3); }
      100% { box-shadow: 0 0 24px rgba(0, 255, 204, 0.8); }
    }
    @media (max-width: 600px) {
      .goetschi-ai-upload-btn { display: none; }
      .goetschi-ai-btn { padding: 6px 10px; font-size: 10px; top: 6px; right: 6px; }
    }
  `;
  document.head.appendChild(style);

  // Global Registration Hook for Games
  window.GoetschiAIPilot = {
    register: function(driver) {
      currentDriver = driver;
      loadModel();
    },
    predict: predictAction,
    toggle: toggleAi,
    isActive: () => isAiActive
  };
})();