此套件屬於 `viral-video-creator` monorepo。

# Prompt Recipe Advanced · HyperFrames

在 [Prompt Recipe](../prompt-recipe/README.md) 的配方海報之上，加入：

- **結尾卡**：AI 影片播完後淡入，大尺寸 YouMind 圖示、名稱與留言引導文字（關鍵字膠囊會在旁白說到時跳動一下）。
- **結尾旁白**：例如「Leave a comment, skill, to get the Giant Kitten generation prompt in one click.」。預設用 macOS 內建語音離線產生，也可換成自己的錄音。
- **參考圖圓角**：預設 5 px。

成片長度＝AI 影片＋結尾卡（至少 2.8 秒，旁白較長時自動延長）。版面拆解見 [Prompt Recipe 的 BREAKDOWN.md](../prompt-recipe/BREAKDOWN.md)。

## 需要的素材

與 Prompt Recipe 相同（AI 影片、Prompt 文字、參考圖），再加上：

| 素材 | 說明 |
| --- | --- |
| 留言關鍵字與引導句 | `cta`，`{}` 內為關鍵字，例如 `Comment {skill} to get the Giant Kitten generation prompt in one click`。 |
| 旁白文字或錄音 | `voice.text`（自動合成）或 `voice.file`（自己的錄音，放在 `assets/inputs/`）。 |

## 指令（在 monorepo 根目錄執行）

```sh
pnpm build:prompt-recipe-advanced      # 依 template.json 產生 index.html（含合成旁白）
pnpm preview:prompt-recipe-advanced    # 建置並開啟 http://localhost:3021
pnpm render:prompt-recipe-advanced     # 輸出 templates/prompt-recipe-advanced/renders/prompt-recipe-advanced.mp4
pnpm check:prompt-recipe-advanced      # lint + 瀏覽器版面檢查
```

## 新增的 template.json 欄位

其餘欄位與 Prompt Recipe 相同（`result`、`prompt`、`reference`、`model`、`cta`、`audio`、`duration`、`motion`、`colors`）。

| 欄位 | 用途 |
| --- | --- |
| `reference.radius` | 參考圖圓角（px，預設 5） |
| `endCard.enabled` | `true` 在影片後加結尾卡；`false` 不加，旁白改在 AI 影片最後幾秒播放 |
| `endCard.icon`、`endCard.name` | 結尾卡大圖示（預設 `assets/brand/youmind-app-icon.png`）與名稱（預設 `YouMind`） |
| `endCard.text` | 結尾卡文字；空白時沿用 `cta` |
| `endCard.minDuration` | 結尾卡最短秒數（預設 2.8） |
| `voice.text` | 旁白文字；空白且沒有 `voice.file` 時不加旁白 |
| `voice.speaker`、`voice.rate` | macOS 語音名稱（例如 `Samantha`、`Daniel`、`Karen`、`Flo (English (US))`）與語速（每分鐘字數，預設 175） |
| `voice.file` | 改用自己的錄音檔（優先於 `voice.text`） |
| `voice.volume` | 旁白音量（1 為原音量） |

合成的旁白快取在 `assets/voice/`、結尾淡出用的最後一幀快取在 `assets/stills/`，兩者都不納入 Git，建置時會自動重新產生。macOS 以外的系統沒有 `say` 指令，請改用 `voice.file`。
