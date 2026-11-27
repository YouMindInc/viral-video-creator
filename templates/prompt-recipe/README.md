此套件屬於 `viral-video-creator` monorepo。

# Prompt Recipe · HyperFrames

「提示詞配方」：把 **Prompt 卡片 + 參考圖 → 模型名稱 → AI 生成影片** 排成一張 9:16 靜態海報，生成影片在其中播放。適合展示 AI 生圖／生影片的成果。風格拆解見 [BREAKDOWN.md](BREAKDOWN.md)。

## 需要的素材

| 素材 | 說明 |
| --- | --- |
| AI 生成影片 | 直式自動用「tall」版型（左欄配方、右欄影片），橫式用「wide」版型（影片在上、配方在下）。成片長度與聲音取自這支影片。 |
| Prompt 文字 | 空一行即分段；文字會自動縮放填滿卡片。 |
| 參考圖 | 產品照、人物照或場景圖；wide 版型會顯示標題（例如「Product」）。 |
| 模型名稱 | 預設為 YouMind 標誌＋「YouMind」；可換成其他工具名稱與圖示。 |

把素材放進 `assets/inputs/`（不納入 Git），再改 `template.json` 的路徑。

## 指令（在 monorepo 根目錄執行）

```sh
pnpm build:prompt-recipe      # 依 template.json 產生 index.html
pnpm preview:prompt-recipe    # 建置並開啟 http://localhost:3019
pnpm render:prompt-recipe     # 輸出 templates/prompt-recipe/renders/prompt-recipe.mp4
pnpm check:prompt-recipe      # lint + 瀏覽器版面檢查
```

橫式範例：`node templates/prompt-recipe/scripts/build.mjs --config templates/prompt-recipe/examples/wide.json`。

## template.json

| 欄位 | 用途 |
| --- | --- |
| `result` | AI 生成影片 |
| `layout` | `auto`（依影片方向）、`tall` 或 `wide` |
| `prompt.title`、`prompt.text` | 卡片標題與內容 |
| `reference.media`、`reference.title`、`reference.fit` | 參考圖（或影片）、wide 版型標題、`cover`／`contain` |
| `model.name`、`model.icon` | 模型名稱（預設 `YouMind`）與圖示（預設 `assets/brand/youmind-mark.png`；可填其他圖片路徑，或 `sparkle` 改用四角星芒） |
| `model.colors` | `sparkle` 圖示的漸層兩色 |
| `cta` | 留言引導文字，`{}` 內為關鍵字膠囊，例如 `Comment {skill} to get the Giant Kitten generation prompt in one click`；tall 版型顯示在配方下方、wide 版型在模型名稱上方；空字串不顯示 |
| `audio` | `result`（影片原聲）、`none` 或音樂檔路徑 |
| `duration` | `0` 為整支影片長度，或指定秒數截短 |
| `motion` | `static`（與原風格相同，完全靜止）或 `pop`（元素依序彈入） |
| `colors` | 背景漸層 `top`／`mid`／`bottom`、卡片 `card`／`cardInk`、文字 `ink` |

字型為 Poppins（SIL Open Font License，見 `assets/fonts/Poppins-OFL.txt`）。預設範例：小貓照片（參考圖）＋「巨型小貓佔領洛杉磯」AI 影片（結果）；橫式範例素材取自本 repo 的 editorial-explainer 範例。
