// 右クリックメニューを登録（起動のたびに必ず再登録）
function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'teams-summarize',
      title: '📋 ここから要約する',
      contexts: ['all'],
      documentUrlPatterns: [
        'https://teams.microsoft.com/*',
        'https://teams.cloud.microsoft/*'
      ]
    });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenu);
chrome.runtime.onStartup.addListener(registerContextMenu);
registerContextMenu();

// 右クリックメニューがクリックされたとき
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'teams-summarize') return;

  // content script が動いているか確認、なければ注入する
  const ready = await ensureContentScript(tab.id);
  if (!ready) return;

  // content.js からメッセージを取得
  let extractResult;
  try {
    extractResult = await chrome.tabs.sendMessage(tab.id, { action: 'extractMessages' });
  } catch (e) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'showError',
      error: 'メッセージの取得に失敗しました。ページを再読み込みして再試行してください。'
    });
    return;
  }

  if (extractResult?.error) {
    chrome.tabs.sendMessage(tab.id, { action: 'showError', error: extractResult.error });
    return;
  }

  // 選択 UI を表示（ここで Ollama は呼ばない）
  chrome.tabs.sendMessage(tab.id, { action: 'showSelection', messages: extractResult.messages });
});

// content.js の「要約」ボタンから選択済みメッセージを受け取る
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'summarizeSelected') {
    handleSummarize(sender.tab.id, message.messages);
  }
  return false;
});

async function handleSummarize(tabId, messages) {
  console.log('[Teams要約] handleSummarize 開始 tabId:', tabId);
  chrome.tabs.sendMessage(tabId, { action: 'showLoading' });
  const result = await callOllama(messages);
  console.log('[Teams要約] Ollama 結果:', result.error ? 'エラー: ' + result.error : '成功 文字数:' + result.text?.length);
  if (result.error) {
    chrome.tabs.sendMessage(tabId, { action: 'showError', error: result.error });
  } else {
    console.log('[Teams要約] showSummary 送信中...');
    chrome.tabs.sendMessage(tabId, { action: 'showSummary', summary: result.text })
      .then(() => console.log('[Teams要約] showSummary 送信成功'))
      .catch(e => console.error('[Teams要約] showSummary 送信失敗:', e.message));
  }
}

// content script が動いているか確認し、なければ注入する
async function ensureContentScript(tabId) {
  // ping で確認
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return true;
  } catch (e) {
    // 動いていないので注入する
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
    await new Promise(r => setTimeout(r, 150));
    return true;
  } catch (e) {
    console.error('content script の注入に失敗:', e.message);
    return false;
  }
}

async function callOllama(messages) {
  const { ollamaModel, ollamaUrl } = await chrome.storage.local.get(['ollamaModel', 'ollamaUrl']);

  const model = ollamaModel || 'llama3.2';
  const baseUrl = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');

  // 長すぎる場合は切り詰める（約3000文字）
  const text = messages.join('\n\n').substring(0, 3000);

  const prompt = `以下のTeamsの会話を日本語で簡潔に要約してください。
重要なポイントと決定事項があれば箇条書きで。

${text}`;

  // 180秒でタイムアウト（初回はモデル読み込みに時間がかかるため長めに設定）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { error: `Ollama エラー (${res.status}): ${body || res.statusText}` };
    }

    const data = await res.json();
    const content = data.message?.content;
    if (!content) return { error: 'Ollama からの応答が空でした' };

    return { text: content };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      return { error: `タイムアウトしました（60秒）。\nモデルが重い可能性があります。\n軽いモデルに変えてみてください。\n例: gemma3:1b / qwen2.5:3b` };
    }
    if (e.message.includes('fetch') || e.message.includes('connect')) {
      return {
        error: `Ollama に接続できませんでした。\n以下を確認してください：\n・ollama serve が起動しているか\n・OLLAMA_ORIGINS=* が設定されているか`
      };
    }
    return { error: `エラー: ${e.message}` };
  }
}
