此套件屬於 `viral-video-creator` monorepo。

# Swap List · HyperFrames

「免費替代清單」：用旁白倒數 N 個付費 App，並把每一個換成 GitHub 上的免費版。不需要拍攝，只要文字：旁白由 macOS 語音自動產生（也可以換成你自己的錄音），字幕逐字跳出，卡片、音效和表情都會跟著旁白對時。風格拆解見 [BREAKDOWN.md](BREAKDOWN.md)。

## 需要的素材

| 素材 | 說明 |
| --- | --- |
| App 清單（必備） | 2–12 組「付費 App → 免費替代」，分成 1–4 個章節。每組需要免費版名稱、GitHub 網址、圖示（內建 16 個線條圖示可選）、最多 4 個功能標籤。 |
| 旁白文字（必備） | 開場、每一章、每一組 App、結尾各一到數句。`{大括號}` 內的字會變成螢光字幕標籤。 |
| 留言互動（可選） | 結尾最想換的 App、「收藏」按鈕文字、示範留言。 |
| 頭像（可選） | 預設是內建的線條吉祥物（四種表情）；也可以放自己的去背 PNG，或依表情放多張。 |
| App 圖示（可選） | 預設是字母方塊；可以放官方圖示（請確認你有使用權）。 |
| 錄音 / 配樂（可選） | 每句旁白可指定 `audio` 錄音檔；`music.file` 放背景音樂。 |

把自己的檔案放進 `assets/inputs/`（不納入 Git），再修改 `template.json`。

## 指令（在 monorepo 根目錄執行）

```sh
pnpm build:swap-list      # 產生旁白、混音並輸出 index.html
pnpm preview:swap-list    # 建置並開啟 http://localhost:3022
pnpm render:swap-list     # 輸出 templates/swap-list/renders/swap-list.mp4
pnpm check:swap-list      # lint + 瀏覽器版面檢查
```

## 自動產生的場景

| 場景 | 畫面 | 對應設定 |
| --- | --- | --- |
| 開場（深色） | 三行大標逐行出現，下方一整片「PAID」App 方塊 | `hook.title`（`%n` 會換成 App 數量）、`hook.say` |
| 全部免費（淺色） | 大標＋每個方塊的 PAID 依序翻成 FREE，最後蓋上斜貼紙 | `grid.title`、`grid.sticker`、`grid.say` |
| 章節卡（深色） | 綠色大編號、章節名、`CHAPTER 01 / 03 · 3 apps`、本章 App 圖示 | `chapters[].name`、`chapters[].say`（只有一章且沒有旁白時省略） |
| 替代卡（淺色） | 進度格＋章節膠囊；付費列被劃掉、價格變成 `$$$ → $0`；免費卡打字出現名稱、網址、OPEN SOURCE、功能標籤，最後蓋上 FREE | `apps[].paid`、`apps[].free`、`apps[].chips`、`apps[].say` |
| 結尾（淺色） | 「你最想換掉哪一個？」＋全部替代的小方塊、選中一格、收藏按鈕、留言框打字並送出、愛心 | `outro.*` |

每組 App 的旁白建議三句：第一句念付費 App（付費列出現），第二句說換成什麼（劃掉＋免費卡打字），之後的句子會依序帶出功能標籤。

## 旁白與字幕

- 每一句可以是字串，或 `{ "text": "顯示的字幕", "speak": "實際念的內容", "audio": "assets/inputs/line.m4a", "mood": "wow" }`。
- `voice.speaker` 用 macOS 語音名稱：英文 `Samantha`、`Daniel`，繁中 `Meijia`。中文字會逐字跳出。
- 表情 `mood`：`neutral`、`happy`、`wow`、`think`。
- 語音、音效與混音都快取在 `assets/voice/`（不納入 Git）；改了文字才會重新產生。

範例內容是六組真實的開源替代（Loom → Cap、Figma → Penpot、Notion → AppFlowy、Calendly → Cal.com、Intercom → Chatwoot、Zoom → Jitsi Meet），圖示用字母方塊，沒有使用任何品牌標誌。
