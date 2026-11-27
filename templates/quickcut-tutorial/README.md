此套件屬於 `viral-video-creator` monorepo。

# Quick-Cut Tutorial · HyperFrames

「快剪教學」：以一支自拍講解影片為主軸，每 1.5–4 秒切換到畫面錄影、手機錄影、AI 成果、人物小窗或大字標題，配上逐字跳出的兩行字幕，最後以「COMMENT "關鍵字"」與個人檔案卡收尾。風格拆解見 [BREAKDOWN.md](BREAKDOWN.md)。

## 需要的素材

| 素材 | 說明 |
| --- | --- |
| 人物講解影片（必備） | 直式、有收音；成片長度與聲音取自這支影片。 |
| 畫面素材（必備） | 螢幕錄影、手機錄影、AI 生成成果、B-roll 影片或圖片。 |
| 留言關鍵字 | 結尾「COMMENT "關鍵字"」。 |
| 個人檔案（可選） | 頭像、名稱、帳號、一句簡介。 |
| 字幕（可選） | 逐字 SRT；沒有的話用 `pnpm transcribe:quickcut-tutorial` 由本機 Whisper 產生。 |

把素材放進 `assets/inputs/`（不納入 Git），再在 `template.json` 的 `scenes` 依時間安排畫面。

## 指令（在 monorepo 根目錄執行）

```sh
pnpm transcribe:quickcut-tutorial assets/inputs/talk.mp4   # 產生 assets/inputs/talk.words.srt
pnpm build:quickcut-tutorial      # 依 template.json 產生 index.html
pnpm preview:quickcut-tutorial    # 建置並開啟 http://localhost:3020
pnpm render:quickcut-tutorial     # 輸出 templates/quickcut-tutorial/renders/quickcut-tutorial.mp4
pnpm check:quickcut-tutorial      # lint + 瀏覽器版面檢查
```

## 場景類型

`scenes` 依秒數排列；沒有被場景覆蓋的時間自動顯示全螢幕人物（連續人物鏡頭會交替放大，模擬跳剪）。

| `type` | 畫面 | 需要 |
| --- | --- | --- |
| `face` | 全螢幕人物 | — |
| `split` | 上方素材、黃色分隔線、下方人物 | `media` |
| `broll` | 全螢幕素材 | `media` |
| `phone` | 手機外框內播放錄影 | `media`、`background`（`blur` 或色碼） |
| `card` | 圓角卡片內播放直式成果 | `media`、`background` |
| `inset` | 全螢幕素材＋底部圓角人物窗（開場） | `media` |
| `bubble` | 全螢幕素材＋上方圓形人物泡泡 | `media` |
| `title` | 大字標題／數據卡 | `lines`（`text`、`color`、`size: s/m/l`、`at` 秒）、`over: face/blur` |
| `cta` | 「COMMENT "關鍵字"」＋個人檔案卡 | `keyword` |

每個場景還可設定 `mediaStart`（素材起點）、`fit`（`cover`／`contain`）、`transition`（`cut`／`flash`）、`captionStyle`（`kinetic`／`italic`／`none`）與 `captionY`。

字幕：每 2–4 個字一組（`captionWords`），在人物畫面用兩行跳字（第二行黃色），在素材畫面用斜體白字。SRT 內 `*字*` 標成黃色、`|` 強制換組；`highlight` 可列出要標黃的字。

其他欄位：`music`／`musicVolume`（背景音樂）、`punchIn`（跳剪放大倍率）、`faceFocus`（人物臉部垂直位置 %）、`splitAt`（分割線位置）、`colors`（`accent`、`divider`、`green`、`red`、`pink`、`orange`、`white`、`phone`）。

字型為 Poppins 與 Anton（SIL Open Font License，見 `assets/fonts/*-OFL.txt`）。範例素材取自本 repo 的 editorial-explainer 範例。
