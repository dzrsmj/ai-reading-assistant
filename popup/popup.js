(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const providerSel = $('#provider');
  const apiKeyInput = $('#apiKey');
  const toggleKeyBtn = $('#toggleKey');
  const languageSel = $('#language');
  const demoModeChk = $('#demoMode');
  const saveBtn = $('#saveBtn');
  const saveStatus = $('#saveStatus');
  const statusDot = $('#statusDot');
  const statusText = $('#statusText');
  const usageBarFill = $('#usageBarFill');
  const usageText = $('#usageText');
  const guideBox = $('#guideBox');

  // --- Load settings ---
  async function loadSettings() {
    const stored = await chrome.storage.local.get('settings');
    const settings = stored.settings || {};

    providerSel.value = settings.provider || 'openai';
    apiKeyInput.value = settings.apiKey || '';
    languageSel.value = settings.language || 'zh-CN';
    demoModeChk.checked = settings.demoMode || false;

    updateStatus(!!settings.apiKey || !!settings.demoMode);
    updateGuide(!!settings.apiKey);
    await updateUsage();
  }

  function updateStatus(hasKey) {
    const demoMode = demoModeChk.checked;
    if (hasKey) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'API Key 已配置 ✅';
    } else if (demoMode) {
      statusDot.className = 'status-dot demo';
      statusText.textContent = '演示模式（模拟结果）';
    } else {
      statusDot.className = 'status-dot inactive';
      statusText.textContent = '请配置 API Key 或开启演示';
    }
  }

  function updateGuide(hasKey) {
    const demoMode = demoModeChk.checked;
    guideBox.style.display = (hasKey || demoMode) ? 'none' : 'block';
  }

  async function updateUsage() {
    const res = await chrome.runtime.sendMessage({ type: 'CHECK_USAGE' });
    if (!res) return;
    const { used, limit } = res;
    const pct = Math.min((used / limit) * 100, 100);

    usageBarFill.style.width = `${pct}%`;
    usageText.textContent = `${used} / ${limit}`;
    usageText.className = 'usage-text' + (used >= limit ? ' warning' : '');
  }

  // --- Save settings ---
  saveBtn.addEventListener('click', async () => {
    const settings = {
      provider: providerSel.value,
      apiKey: apiKeyInput.value.trim(),
      language: languageSel.value,
      demoMode: demoModeChk.checked,
    };

    await chrome.storage.local.set({ settings });
    saveStatus.textContent = '✅ 设置已保存';
    saveStatus.className = 'save-status';
    updateStatus(!!settings.apiKey || !!settings.demoMode);
    updateGuide(!!settings.apiKey);
    updateUsage();

    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2000);
  });

  // --- Toggle demo mode ---
  demoModeChk.addEventListener('change', () => {
    const demoMode = demoModeChk.checked;
    const hasKey = !!apiKeyInput.value.trim();
    updateStatus(hasKey || demoMode);
    updateGuide(hasKey);
  });

  // --- Toggle key visibility ---
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? '🙈' : '👁️';
  });

  // --- Load on open ---
  loadSettings();
})();
