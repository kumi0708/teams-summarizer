// 二重注入を防ぐガード
if (window.__teamsSummarizerLoaded) {
  // 既に読み込み済みの場合は何もしない
} else {
window.__teamsSummarizerLoaded = true;

// 右クリックされた要素を保持
let lastRightClickedEl = null;

// capture: true で Teams のイベント横取りより先に実行する
document.addEventListener('contextmenu', (e) => {
  lastRightClickedEl = e.target;
}, true);

// background.js からのメッセージを受け取る
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'ping':
      sendResponse({ ok: true });
      return false;

    case 'extractMessages':
      sendResponse(extractMessagesFromPoint(lastRightClickedEl));
      return false;

    case 'showSelection':
      showSelectionOverlay(message.messages);
      return false;

    case 'showLoading':
      showLoadingOverlay();
      return false;

    case 'showSummary':
      showSummaryOverlay(message.summary);
      return false;

    case 'showError':
      showErrorOverlay(message.error);
      return false;
  }
});

// ============================================================
// メッセージ抽出ロジック
// ============================================================

const MESSAGE_SELECTORS = [
  '[data-tid^="message-"]',
  '[data-scroll-id]',
  'div[class*="messageListItem"]',
  'div[class*="message-list-item"]',
  '[class*="MessageThread"]',
  '[class*="messageThread"]',
  '[role="listitem"]',
  '[role="article"]',
  '[role="group"]',
  '.ts-message-list-item',
];

const CONTAINER_SELECTORS = [
  '[data-tid="message-list"]',
  '[class*="messageList"]',
  '[class*="MessageList"]',
  '[class*="message-list"]',
  '[class*="chatList"]',
  '[class*="ChatList"]',
  '[role="list"]',
  '[role="main"]',
  'main',
];

function findMessageElement(target) {
  for (const sel of MESSAGE_SELECTORS) {
    const el = target?.closest(sel);
    if (el) return el;
  }
  return null;
}

function extractMessagesFromPoint(target) {
  if (!target) return { error: 'クリック位置が取得できませんでした' };

  const startEl = findMessageElement(target);
  if (startEl) {
    const messages = getMessagesFrom(startEl);
    if (messages.length > 0) return { messages };
  }

  const container = findConversationContainer(target);
  if (container) {
    const text = extractText(container);
    if (text.length > 20) return { messages: [text] };
  }

  const main = document.querySelector('main, [role="main"], #app-mount, #root');
  if (main) {
    const text = extractText(main);
    if (text.length > 20) return { messages: [text] };
  }

  return { error: 'テキストが取得できませんでした。チャット画面上のメッセージを右クリックしてください。' };
}

function findConversationContainer(target) {
  for (const sel of CONTAINER_SELECTORS) {
    const el = target?.closest(sel);
    if (el) return el;
  }
  for (const sel of CONTAINER_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function getMessagesFrom(startEl) {
  const container = startEl.parentElement;
  if (!container) return [extractText(startEl)].filter(Boolean);

  for (const sel of MESSAGE_SELECTORS) {
    const all = Array.from(container.querySelectorAll(sel));
    if (all.length === 0) continue;

    const idx = all.findIndex(el => el === startEl || el.contains(startEl) || startEl.contains(el));
    if (idx === -1) continue;

    return all.slice(idx).map(el => extractText(el)).filter(Boolean);
  }

  return [extractText(startEl)].filter(Boolean);
}

function extractText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll([
    'button', 'svg', 'img',
    '[aria-hidden="true"]',
    '[class*="reactions"]',
    '[class*="avatar"]',
    '[class*="timestamp"]',
    '[class*="edited"]',
  ].join(',')).forEach(e => e.remove());

  const text = clone.innerText?.trim().replace(/\s+/g, ' ') || '';
  return text.length > 10 ? text : '';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// UI（オーバーレイ表示）
// ============================================================

let overlayEl = null;

function removeOverlay() {
  overlayEl?.remove();
  overlayEl = null;
}

// メッセージ選択 UI
function showSelectionOverlay(messages) {
  removeOverlay();
  overlayEl = document.createElement('div');
  overlayEl.id = 'teams-summarizer-overlay';

  const itemsHtml = messages.map((text, i) => {
    const preview = escapeHtml(text.length > 72 ? text.substring(0, 72) + '…' : text);
    return `
      <label class="ts-msg-item">
        <input type="checkbox" class="ts-msg-check" data-index="${i}" checked>
        <span class="ts-msg-text">${preview}</span>
      </label>`;
  }).join('');

  overlayEl.innerHTML = `
    <div class="ts-inner">
      <div class="ts-header">
        <span>📋 要約するメッセージを選択</span>
        <button class="ts-close" title="閉じる">✕</button>
      </div>
      <div class="ts-sel-toolbar">
        <button class="ts-btn-sm ts-select-all">全選択</button>
        <button class="ts-btn-sm ts-deselect-all">全解除</button>
        <span class="ts-count">${messages.length}件</span>
      </div>
      <div class="ts-body ts-msg-list">${itemsHtml}</div>
      <div class="ts-footer">
        <button class="ts-summarize-btn">選択した内容を要約 →</button>
      </div>
    </div>
  `;

  overlayEl.querySelector('.ts-close').addEventListener('click', removeOverlay);
  makeDraggable(overlayEl, overlayEl.querySelector('.ts-header'));

  overlayEl.querySelector('.ts-select-all').addEventListener('click', () => {
    overlayEl.querySelectorAll('.ts-msg-check').forEach(cb => cb.checked = true);
  });

  overlayEl.querySelector('.ts-deselect-all').addEventListener('click', () => {
    overlayEl.querySelectorAll('.ts-msg-check').forEach(cb => cb.checked = false);
  });

  overlayEl.querySelector('.ts-summarize-btn').addEventListener('click', () => {
    const selected = [];
    overlayEl.querySelectorAll('.ts-msg-check:checked').forEach(cb => {
      selected.push(messages[parseInt(cb.dataset.index)]);
    });
    if (selected.length === 0) {
      showErrorOverlay('メッセージを1件以上選択してください');
      return;
    }
    showLoadingOverlay();
    chrome.runtime.sendMessage({ action: 'summarizeSelected', messages: selected });
  });

  document.body.appendChild(overlayEl);
}

function createOverlay(headerText, bodyHtml, footerHtml = '') {
  removeOverlay();
  overlayEl = document.createElement('div');
  overlayEl.id = 'teams-summarizer-overlay';
  overlayEl.innerHTML = `
    <div class="ts-inner">
      <div class="ts-header">
        <span>${headerText}</span>
        <button class="ts-close" title="閉じる">✕</button>
      </div>
      <div class="ts-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="ts-footer">${footerHtml}</div>` : ''}
    </div>
  `;
  overlayEl.querySelector('.ts-close').addEventListener('click', removeOverlay);
  makeDraggable(overlayEl, overlayEl.querySelector('.ts-header'));
  document.body.appendChild(overlayEl);
}

function showLoadingOverlay() {
  createOverlay(
    '📋 Teams 要約アシスタント',
    `<div class="ts-loading"><div class="ts-spinner"></div><span>要約しています...<br><small style="color:#999">初回は1〜2分かかる場合があります</small></span></div>`
  );
}

function showSummaryOverlay(summary) {
  const html = summary
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');

  if (overlayEl) {
    overlayEl.querySelector('.ts-header span').textContent = '📋 要約';
    overlayEl.querySelector('.ts-body').className = 'ts-body';
    overlayEl.querySelector('.ts-body').innerHTML = `<div class="ts-summary">${html}</div>`;
    overlayEl.querySelector('.ts-footer')?.remove();
  } else {
    createOverlay('📋 要約', `<div class="ts-summary">${html}</div>`);
  }
}

function showErrorOverlay(error) {
  const html = escapeHtml(error).replace(/\n/g, '<br>');
  createOverlay('⚠️ エラー', `<div class="ts-error">${html}</div>`);
}

// ドラッグ移動
function makeDraggable(el, handle) {
  let startX, startY, origLeft, origTop;
  handle.style.cursor = 'grab';

  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = origLeft + 'px';
    el.style.top = origTop + 'px';
    handle.style.cursor = 'grabbing';

    const onMove = (e) => {
      el.style.left = (origLeft + e.clientX - startX) + 'px';
      el.style.top = (origTop + e.clientY - startY) + 'px';
    };
    const onUp = () => {
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

} // end of __teamsSummarizerLoaded guard
