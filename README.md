# Teams 要約アシスタント

Microsoft Teams（ブラウザ版）のメッセージを右クリックで選択して、ローカルAI（Ollama）で要約するEdge拡張機能です。

## 特徴

- Teams のメッセージを**右クリック → 選択 → 要約**するだけ
- **完全ローカル動作**（APIキー不要・通信なし）
- 要約するメッセージをチェックボックスで選べる
- 要約結果はドラッグ移動できるオーバーレイで表示

## 必要なもの

- Microsoft Edge
- [Ollama](https://ollama.com) がインストール済みであること
- Ollama のモデル（例: `gemma3:4b`）

## セットアップ

### 1. Ollama の準備

```powershell
# モデルのダウンロード（初回のみ）
ollama pull gemma3:4b

# OLLAMA_ORIGINS の永続化（初回のみ）
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")
```

### 2. 拡張機能のインストール

1. Edge のアドレスバーに `edge://extensions` と入力
2. 「**開発者モード**」をオンにする
3. 「**展開して読み込む**」をクリック
4. このフォルダを選択

### 3. 起動

`Teams要約アシスタント起動（バックグラウンド）.vbs` をダブルクリック

> PC起動時に自動起動させたい場合は、このファイルのショートカットをスタートアップフォルダに入れてください。

## 使い方

1. Edge で `https://teams.cloud.microsoft/` を開く
2. 要約したいメッセージを**右クリック**
3. 「📋 ここから要約する」を選択
4. 表示された一覧からメッセージを選択
5. 「選択した内容を要約 →」をクリック
6. 右下に要約が表示される

## ファイル構成

```
teamsAddOn/
├── manifest.json                         # 拡張機能の定義
├── background.js                         # 右クリックメニュー + Ollama API
├── content.js                            # Teams DOM 操作 + UI表示
├── popup.html / popup.js                 # モデル設定画面
├── styles.css                            # オーバーレイのスタイル
├── Teams要約アシスタント起動（バックグラウンド）.vbs  # Ollama バックグラウンド起動
└── Teams要約アシスタント停止.vbs            # Ollama 停止
```

## 設定変更

Edge の拡張機能アイコンをクリックすると設定画面が開きます。

| 項目 | デフォルト | 説明 |
|---|---|---|
| モデル名 | `llama3.2` | Ollama のモデル名（`ollama list` で確認） |
| Ollama URL | `http://localhost:11434` | 通常は変更不要 |

## トラブルシューティング

**右クリックメニューが出ない**
→ Teamsのタブを完全に閉じて開き直す

**「Ollamaに接続できません」エラー**
→ `Teams要約アシスタント起動（バックグラウンド）.vbs` を実行してOllamaを起動する

**要約が終わらない**
→ モデルが重い可能性があります。`gemma3:4b` など軽いモデルを使ってください
