(() => {
  'use strict';

  let floatingBtn = null;
  let resultCard = null;
  let isProcessing = false;

  const ACTIONS = [
    { id: 'summarize', label: '📝 总结', desc: '要点总结' },
    { id: 'explain',   label: '💡 解释', desc: '通俗解释' },
    { id: 'translate', label: '🌐 翻译', desc: '翻译中文' },
  ];

  // --- Selection detection ---
  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('keyup', handleSelection);
  // Hide when clicking away
  document.addEventListener('mousedown', (e) => {
    if (floatingBtn && !floatingBtn.contains(e.target)) {
      hideFloatingBtn();
    }
  });

  function handleSelection() {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        hideFloatingBtn();
        return;
      }
      showFloatingBtn(sel);
    }, 100);
  }

  // --- Floating button ---
  function showFloatingBtn(sel) {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (!floatingBtn) {
      floatingBtn = document.createElement('div');
      floatingBtn.id = 'ai-ra-floating-btn';
      floatingBtn.innerHTML = `
        <div class="ai-ra-trigger">✨ AI</div>
        <div class="ai-ra-menu">
          ${ACTIONS.map(a => `<button data-action="${a.id}" title="${a.desc}">${a.label}</button>`).join('')}
        </div>
      `;
      floatingBtn.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => handleAction(e, sel));
      });
      document.body.appendChild(floatingBtn);
    }

    // Position near the end of selection
    const top = rect.bottom + window.scrollY + 8;
    const left = Math.min(rect.right + window.scrollX, window.innerWidth - 180);
    floatingBtn.style.top = `${top}px`;
    floatingBtn.style.left = `${left}px`;
    floatingBtn.classList.add('visible');

    // Show menu on trigger hover/click
    const trigger = floatingBtn.querySelector('.ai-ra-trigger');
    trigger.onclick = () => floatingBtn.classList.toggle('menu-open');
  }

  function hideFloatingBtn() {
    if (floatingBtn) {
      floatingBtn.classList.remove('visible', 'menu-open');
    }
  }

  // --- Action handler ---
  async function handleAction(e, sel) {
    e.preventDefault();
    const btn = e.target.closest('button');
    if (!btn || isProcessing) return;

    const action = btn.dataset.action;
    const text = sel.toString().trim();
    if (!text) return;

    isProcessing = true;
    hideFloatingBtn();

    // Clear previous selection highlight
    sel.removeAllRanges();

    showResultCard(action, 'loading');

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'AI_ACTION',
        payload: { text, action },
      });

      if (res.ok) {
        showResultCard(action, 'result', res.result, text);
      } else {
        showResultCard(action, 'error', res.message);
      }
    } catch (err) {
      showResultCard(action, 'error', err.message || '请求失败，请检查网络或 API Key 设置');
    } finally {
      isProcessing = false;
    }
  }

  // --- Result card ---
  function showResultCard(action, state, content, originalText) {
    removeResultCard();

    resultCard = document.createElement('div');
    resultCard.id = 'ai-ra-result-card';

    const actionLabel = ACTIONS.find(a => a.id === action)?.label || 'AI';

    if (state === 'loading') {
      resultCard.innerHTML = `
        <div class="ai-ra-header">
          <span>${actionLabel} · 思考中...</span>
          <button class="ai-ra-close">&times;</button>
        </div>
        <div class="ai-ra-body loading">
          <div class="ai-ra-spinner"></div>
          <span>AI 正在处理...</span>
        </div>
      `;
    } else if (state === 'error') {
      resultCard.innerHTML = `
        <div class="ai-ra-header error">
          <span>⚠️ 出错了</span>
          <button class="ai-ra-close">&times;</button>
        </div>
        <div class="ai-ra-body"><p>${escapeHtml(content)}</p></div>
        <div class="ai-ra-footer">
          <a href="#" class="ai-ra-setup-link">⚙️ 打开设置</a>
        </div>
      `;
      resultCard.querySelector('.ai-ra-setup-link').onclick = (e) => {
        e.preventDefault();
        chrome.action.openPopup?.() || alert('请点击浏览器右上角的插件图标打开设置');
      };
    } else {
      resultCard.innerHTML = `
        <div class="ai-ra-header">
          <span>${actionLabel}</span>
          <div class="ai-ra-header-actions">
            <button class="ai-ra-copy" title="复制结果">📋</button>
            <button class="ai-ra-close">&times;</button>
          </div>
        </div>
        <div class="ai-ra-body">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
        <div class="ai-ra-footer">
          <span class="ai-ra-original-label">原文:</span>
          <span class="ai-ra-original">"${escapeHtml(originalText).slice(0, 80)}${originalText.length > 80 ? '...' : ''}"</span>
        </div>
      `;
      resultCard.querySelector('.ai-ra-copy').onclick = () => {
        navigator.clipboard.writeText(content);
        const btn = resultCard.querySelector('.ai-ra-copy');
        btn.textContent = '✅';
        setTimeout(() => (btn.textContent = '📋'), 1500);
      };
    }

    resultCard.querySelector('.ai-ra-close').onclick = removeResultCard;
    document.body.appendChild(resultCard);
    resultCard.classList.add('visible');
  }

  function removeResultCard() {
    if (resultCard) {
      resultCard.classList.remove('visible');
      setTimeout(() => {
        if (resultCard) resultCard.remove();
        resultCard = null;
      }, 200);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Handle context menu results (from background.js) ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SHOW_RESULT') {
      const { text, action, result } = msg.payload;
      // Clear any existing selection
      window.getSelection().removeAllRanges();
      showResultCard(action, 'result', result, text);
    }
    if (msg.type === 'SHOW_ERROR') {
      showResultCard('summarize', 'error', msg.payload.message);
    }
  });
})();
