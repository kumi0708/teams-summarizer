const modelInput = document.getElementById('ollamaModel');
const urlInput = document.getElementById('ollamaUrl');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

// 保存済みの設定を読み込む
chrome.storage.local.get(['ollamaModel', 'ollamaUrl'], ({ ollamaModel, ollamaUrl }) => {
  if (ollamaModel) modelInput.value = ollamaModel;
  if (ollamaUrl) urlInput.value = ollamaUrl;
});

// 保存
saveBtn.addEventListener('click', async () => {
  const ollamaModel = modelInput.value.trim() || 'llama3.2';
  const ollamaUrl = urlInput.value.trim() || 'http://localhost:11434';
  await chrome.storage.local.set({ ollamaModel, ollamaUrl });
  showStatus('✓ 保存しました');
});

function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
}
