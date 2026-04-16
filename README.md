# 🧬 Prefab Cloner — Cocos Creator Extension

> 一鍵克隆 Prefab 到另一個 Bundle，自動複製資源、重新產生 UUID，零跨 Bundle 依賴。
>
> Clone a prefab into another bundle with one click. Automatically copies assets, regenerates UUIDs, and eliminates cross-bundle dependencies.

---

## 📦 安裝 Installation

### 方法一：專案級安裝（推薦）

把 `prefab-cloner` 資料夾整個放到你的專案的 `extensions/` 目錄下：

```
your-project/
├── assets/
├── extensions/
│   └── prefab-cloner/    ← 放在這裡
│       ├── package.json
│       ├── dist/
│       │   ├── main.js
│       │   └── clone-prefab.js
│       └── ...
```

### 方法二：全域安裝

把 `prefab-cloner` 資料夾放到全域擴充目錄：

- **Windows**: `%USERPROFILE%\.CocosCreator\extensions\prefab-cloner\`
- **macOS**: `~/.CocosCreator/extensions/prefab-cloner/`

### 啟用 Enable

1. 開啟（或重開）Cocos Creator
2. 上方選單 → **Extension** → **Extension Manager**
3. 切換到 **Project** 頁籤（專案級安裝的話）
4. 找到 **prefab-cloner**，把開關打開
5. 完成！選單列會出現新的選項

> ⚠️ 如果看不到擴充，請完全關閉 Cocos Creator 再重開。

---

## 🚀 使用方式 Usage

### 從選單啟動

上方選單 → **Extension** → **Prefab Cloner** → **Clone Prefab to Folder**

會依序跳出 **3 個對話框**：

| 步驟 | 對話框 | 說明 |
|:---:|---|---|
| ① | 選擇來源 Prefab | 選一個 `.prefab` 檔案 |
| ② | 選擇來源 Bundle 資料夾 | 這是「黑名單資料夾」— 裡面的資源會被**複製**並產生新 UUID |
| ③ | 選擇目標資料夾 | 克隆後的 prefab 和資源會放到這裡 |

### 從命令列執行（不需要開 Cocos）

```bash
cd your-project
node clone_prefab.js <source.prefab> <blacklist_folder> <target_dir>
```

範例：
```bash
node clone_prefab.js \
  "assets/games/chinadragon2/Prefab/LosePanel.prefab" \
  "assets/games/chinadragon2" \
  "assets/games/newbiePractice/prefab/myClone"
```

---

## 🎯 黑名單資料夾是什麼？ What is the Blacklist Folder?

這是整個工具最重要的概念：

```
                    ┌─────────────────────────────┐
                    │   Prefab 引用的所有資源       │
                    └──────────┬──────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
     ┌─────────▼─────────┐          ┌──────────▼──────────┐
     │  在黑名單資料夾內   │          │  在黑名單資料夾外    │
     │  (來源 Bundle)     │          │  (共用資源)          │
     ├────────────────────┤          ├─────────────────────┤
     │  📋 複製一份        │          │  ♻️ 直接沿用         │
     │  🆔 產生新 UUID     │          │  🔗 保持原本 UUID    │
     │  → 放到目標資料夾   │          │  → 不用複製          │
     └────────────────────┘          └─────────────────────┘
```

**舉例**：你要從 `games/chinadragon2` 克隆一個 prefab 到 `games/newbiePractice`

- `黑名單資料夾` = `assets/games/chinadragon2`
- chinadragon2 裡的圖片、字型 → **複製**到 newbiePractice（新 UUID）
- `assets/platform/` 裡的共用按鈕圖片 → **沿用**（不複製、不改 UUID）
- `assets/main/` 裡的共用資源 → **沿用**

這樣做的好處：
- ✅ 不會產生跨 Bundle 依賴
- ✅ 共用資源不會被重複複製
- ✅ Bundle 體積最小化

---

## 📁 自動分類 Auto-categorization

克隆的資源會自動依照檔案類型放到對應子資料夾：

| 檔案類型 | 目標子資料夾 |
|---|---|
| `.png` `.jpg` `.jpeg` `.webp` `.gif` | `image/` |
| `.anim` `.clip` | `anim/` |
| `.fnt` `.ttf` `.otf` | `fnt/` |
| `.mtl` `.pmtl` `.effect` | `material/` |
| `.mp3` `.ogg` `.wav` | `sound/` |
| 其他 | 直接放在目標資料夾 |

---

## 🔧 開發者 Development

如果你修改了 `src/` 下的 TypeScript 原始碼，需要重新編譯：

```bash
cd extensions/prefab-cloner
npm install        # 第一次需要
npm run build      # 編譯 TypeScript → dist/
```

或者開啟即時編譯：
```bash
npm run watch
```

編譯完成後在 Cocos Creator 裡重新載入擴充：
**Extension** → **Extension Manager** → 找到 prefab-cloner → 點 **重新載入（Reload）** 按鈕

---

## ❓ 常見問題 Troubleshooting

### 擴充沒有出現在 Extension Manager

- 確認 `package.json` 檔案存在於 `extensions/prefab-cloner/` 根目錄
- 確認 `dist/main.js` 和 `dist/clone-prefab.js` 存在
- 完全關閉 Cocos Creator 再重開

### 選單點了沒反應

- 打開 Cocos Creator 開發者工具：**Developer** → **Developer Tools**（或 `Ctrl+Shift+I`）
- 看 Console 裡有沒有紅色錯誤訊息
- 貼給開發者

### 克隆後圖片顯示遺失

- 在 Cocos Creator 裡對新 prefab 右鍵 → **Check Dependencies** 檢查依賴
- 如果有 Script 腳本元件，需要手動複製對應的 `.ts` 檔案
- 讓 Cocos Creator 重新 import：在 Assets 面板隨便點一下再回來

---

## 📋 檔案結構 File Structure

```
extensions/prefab-cloner/
├── package.json          # 擴充設定（選單、版本、進入點）
├── tsconfig.json         # TypeScript 編譯設定
├── src/                  # TypeScript 原始碼
│   ├── main.ts           # 擴充進入點（對話框流程 + Editor API）
│   └── clone-prefab.ts   # 核心克隆邏輯
├── dist/                 # 編譯後的 JavaScript（Cocos 讀這裡）
│   ├── main.js
│   └── clone-prefab.js
└── @types/               # Editor API 型別定義
```

根目錄也有獨立的 CLI 版本：
```
clone_prefab.js           # 命令列版（不需要 Cocos Creator）
```
