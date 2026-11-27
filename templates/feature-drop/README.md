此套件屬於 `viral-video-creator` monorepo。

# Feature Drop · HyperFrames

「功能爆料」：深色余燼風格的無人臉短片，結構如下：
- 「BREAKING：X 剛剛幹掉了 Y」開場；
- 產品亮相、功能數量；
- 逐一編號的功能面板，每一格都是動態的假介面；
- 「但最厲害的是…」轉折與排行榜；
- 三步設定；
- 留言關鍵字收尾。

一樣只需要文字和截圖：旁白自動產生，字幕、面板動畫和音效都跟著旁白對時。風格拆解見 [BREAKDOWN.md](BREAKDOWN.md)。

## 需要的素材

| 素材 | 說明 |
| --- | --- |
| 腳本（必備） | 依序列出場景，每個場景一到數句旁白；`{大括號}` 內的字會變成橘色字幕標籤。 |
| 產品截圖或影片（建議） | 亮相畫面、功能面板、設定步驟都可以放圖片或影片。 |
| 功能內容（必備） | 每個功能的標題、指令／標籤、面板內容（清單、剪輯清單、看板、週計畫、終端機或截圖）。 |
| 留言關鍵字（必備） | 結尾「留言 “關鍵字”」。 |
| 錄音 / 配樂（可選） | 每句旁白可指定 `audio`；`music.file` 放背景音樂。 |

把自己的檔案放進 `assets/inputs/`（不納入 Git），再修改 `template.json` 的 `scenes`。

## 指令（在 monorepo 根目錄執行）

```sh
pnpm build:feature-drop      # 產生旁白、混音並輸出 index.html
pnpm preview:feature-drop    # 建置並開啟 http://localhost:3023
pnpm render:feature-drop     # 輸出 templates/feature-drop/renders/feature-drop.mp4
pnpm check:feature-drop      # lint + 瀏覽器版面檢查
```

## 場景類型（`scenes[].type`）

| 類型 | 畫面 | 欄位 |
| --- | --- | --- |
| `hook` | `● BREAKING · AI` 標籤、主角大字、小字副詞、橘色漸層大動詞、被發光斜線劃掉的目標卡 | `tag`、`subject`、`kicker`、`verb`、`target` |
| `reveal` | 標題（`{}` 內變橘色）、大截圖或影片、數據膠囊 | `title`、`media`、`stats` |
| `count` | 綠色「FREE」印章、數字從 0 跳到 N、指令小卡格 | `stamp`、`number`、`label`、`chips`（`"01 /yt-script"` 開頭數字會變橘色） |
| `feature` | 自動編號（01、02…）＋標題＋標籤，下面一個面板 | `title`、`tag`、`panel` |
| `teaser` | 「但最厲害的是」＋一到兩行超大字 | `kicker`、`lines`、`tag` |
| `rank` | 標題＋最多 4 列「大數值｜標題｜說明｜徽章」，第一列高亮 | `title`、`meta`、`rows` |
| `steps` | 「設定只要 3 步」步驟膠囊依旁白逐一亮起、可選截圖、終端機逐行打字、結果卡、完成印章 | `title`、`steps`、`media`、`terminal`、`done` |
| `cta` | 「Comment」、傾斜的橘色關鍵字、說明、留言框打出關鍵字並送出、愛心 | `comment`、`keyword`、`line`、`note`、`placeholder` |

## 面板（`panel.kind`）

| 種類 | 內容 |
| --- | --- |
| `media` | 截圖或影片（`src`、`fit`）；影片會自動成為獨立片段。 |
| `list` | 2–6 列清單，逐列滑入，`highlight` 那列最後亮起；可加右側數值。 |
| `timeline` | 剪輯清單：時間碼＋內容，`cut: true` 的列會被紅線劃掉，下方有波形。 |
| `board` | 2–4 欄看板，卡片依序掉落、欄位計數，`reply` 會打字出現回覆。 |
| `week` | 一週七欄，區塊依時間掉進格子（`day` 0–6、`row` 0–3、`hot` 橘色），最後出現完成膠囊。 |
| `terminal` | 終端機：`lines`（`cmd`、`ok`、`dim`、`out`）逐行打字，`cards` 結果卡（`best` 綠框）。 |

旁白格式、語音與快取規則和 Swap List 相同：每句可以是字串，或 `{ "text", "speak", "audio" }`；`voice.speaker` 用 macOS 語音（繁中可用 `Meijia`）；快取在 `assets/voice/`。

範例腳本介紹的是這個 repo 本身（6 個模板、代理人工作流程、三步設定），截圖取自其他模板的實際畫面。
