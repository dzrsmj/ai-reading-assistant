// --- Context Menu Setup ---
const MENU_ITEMS = [
  { id: 'summarize', title: 'AI 阅读助手: 总结要点', icon: '📝' },
  { id: 'explain',   title: 'AI 阅读助手: 通俗解释', icon: '💡' },
  { id: 'translate', title: 'AI 阅读助手: 翻译成中文', icon: '🌐' },
];

chrome.runtime.onInstalled.addListener(() => {
  MENU_ITEMS.forEach(({ id, title }) => {
    chrome.contextMenus.create({ id, title, contexts: ['selection'] });
  });
});

// --- Context Menu Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = MENU_ITEMS.find(m => m.id === info.menuItemId);
  if (!action || !info.selectionText) return;

  const text = info.selectionText.trim();
  if (!text) return;

  try {
    const result = await handleAiAction(text, action.id);
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_RESULT',
      payload: { text, action: action.id, result },
    });
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_ERROR',
      payload: { message: err.message },
    });
  }
});

// --- Message Handler (floating button flow from content.js) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AI_ACTION') {
    const { text, action } = msg.payload;
    handleAiAction(text, action)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err => sendResponse({ ok: false, message: err.message }));
    return true; // keep channel open for async
  }
  if (msg.type === 'CHECK_USAGE') {
    checkDailyUsage().then(sendResponse);
    return true;
  }
  if (msg.type === 'INCREMENT_USAGE') {
    incrementUsage().then(sendResponse);
    return true;
  }
});

// --- AI API Calls ---
async function handleAiAction(text, action) {
  const settings = await getSettings();

  if (!settings.apiKey) {
    throw new Error('请先点击插件图标设置 API Key（OpenAI 或 Claude）');
  }

  const usageLeft = await checkDailyUsage();
  if (usageLeft.used >= 10 && !settings.isOwnKey) {
    throw new Error('今日免费次数已用完（10次/天），请在设置中填入你自己的 API Key 解锁无限使用');
  }

  const prompt = buildPrompt(text, action, settings.language);
  let result;

  if (settings.provider === 'claude') {
    result = await callClaude(settings.apiKey, prompt);
  } else {
    result = await callOpenAI(settings.apiKey, prompt);
  }

  await incrementUsage();
  return result;
}

function buildPrompt(text, action, language) {
  const lang = language || 'zh-CN';
  const prompts = {
    summarize: `请用简洁的要点总结以下文本的核心内容。用${lang === 'zh-CN' ? '中文' : 'English'}回答：\n\n${text}`,
    explain: `请用通俗易懂的语言解释以下文本，就像在给一个完全不了解的人讲解。用${lang === 'zh-CN' ? '中文' : 'English'}回答：\n\n${text}`,
    translate: `请将以下文本翻译成${lang === 'zh-CN' ? '中文' : 'English'}：\n\n${text}`,
  };
  return prompts[action] || prompts.summarize;
}

async function callOpenAI(apiKey, prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '你是一个阅读助手。回答简洁、清晰、有条理。' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API 错误: ${res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API 错误: ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// --- Settings ---
const DEFAULT_SETTINGS = {
  provider: 'openai',
  apiKey: '',
  language: 'zh-CN',
  isOwnKey: false,
};

async function getSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

// --- Daily Usage Tracking ---
async function checkDailyUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const stored = await chrome.storage.local.get('usage');
  const usage = stored.usage || {};
  if (usage.date !== today) {
    await chrome.storage.local.set({ usage: { date: today, count: 0 } });
    return { used: 0, limit: 10 };
  }
  return { used: usage.count, limit: 10 };
}

async function incrementUsage() {
  const stored = await chrome.storage.local.get('usage');
  const usage = stored.usage || { date: '', count: 0 };
  usage.count += 1;
  await chrome.storage.local.set({ usage });
}
