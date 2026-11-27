此套件屬於 `viral-video-creator` monorepo；建議在根目錄執行 `npm start`。

# Video template · HyperFrames

可重複使用的 9:16 影片模板：**上方產品／分享動畫、中間字幕、下方約 33% 高度的人物錄影**。人物保留原本臉孔與衣服，頭部沿輪廓凸出圓角場景框。

目前範例已套用本機 SAM2 專案的透明人物圖層，20.36 秒、25 fps、509 幀。開啟模板不需要重新下載模型或執行去背。

## 開啟

雙擊 `Launch.command`，或在本專案目錄執行：

```sh
npm start
```

- **素材與位置設定：** http://localhost:3018
- **HyperFrames 時間軸預覽：** http://localhost:3017/#project/editorial-explainer

保持啟動設定頁的 Terminal 開著。設定頁在 3018 埠提供表單與靜態版型；HyperFrames 在 3017 埠提供播放、時間軸與輸出。若只需要開啟時間軸：

```sh
npm run preview
```

初次安裝才需要 npm 網路存取；目前 HyperFrames 0.9.98、GSAP 3.14.2 已安裝並鎖定版本。需要 Node.js 22+、FFmpeg、FFprobe；完整播放與輸出使用 Chrome。

## 每次製作新影片

1. 選取「下半部人物錄影」與「上半部產品／分享動畫」，也可以拖曳檔案到選取框。檔案會複製到本專案的 `assets/inputs/`。
2. 填入品牌、兩行標題、內容標籤、SRT 字幕或替代字幕。
3. 在「關鍵元素的位置」選品牌、標題、影片、標籤、字幕或人物，調整 X、Y、寬、高和字級。右側顯示靜態版型；儲存後套用到 HyperFrames。
4. 如果需要人物凸出背景，按「預覽 SAM2 去背」，檢查五張抽樣圖片，再按「產生完整人物圖層」。原始錄影預覽始終可用。
5. 開啟 HyperFrames 播放完整影片；需要 MP4 時執行 `npm run render`。

人物錄影決定片長與聲音，上方影片保持靜音。上方影片較短時停在最後一幀；較長時截至人物片長。更換人物會清除前一支影片的 SRT 設定，不會沿用前一位講者的字幕或去背圖層。

字幕目前接受 SRT，沒有自動轉錄新影片的按鈕。`persona.cropY` 只調整原始錄影預覽的裁切；SAM2 會依臉部位置自動安排人物大小與位置。改變背景框的下移量、內縮或圓角後，需重新產生 SAM2 圖層。

## SAM2

橋接程式使用既有的 `../../tools/sam2` 環境、模型和 `sam2_person_cutout.py`，不修改該專案。可透過 `SAM2_DIR` 指定其他位置。它適合單人、固定鏡頭、人物大致留在原位的錄影；這個 Core ML 匯出逐幀分割，沒有完整 SAM2 的影片記憶追蹤。

```sh
npm run sam2:test
# 查看 assets/persona/sam2-tests/ 中的抽樣圖，再執行：
npm run sam2:prepare
# 也可匯入已完成、與人物原片同長度的 1080×1920 ProRes 透明輸出：
npm run sam2:import -- "/absolute/path/character_card_prores4444.mov"
```

轉換後的 WebM 保留透明度及完整 9:16 畫布，包含人物與圓角原場景，HyperFrames 只疊一次。原始音訊獨立播放一次。來源和背景框設定不變時會重用已處理圖層。

## 位置與專案檔案

座標原點為左上角，畫布 1080 × 1920。

| 元素 | X | Y | 寬 | 高 |
| --- | ---: | ---: | ---: | ---: |
| 品牌 | 70 | 120 | 940 | 48 |
| 標題 | 60 | 208 | 960 | 170 |
| 上方內容 | 60 | 430 | 960 | 660 |
| 內容標籤 | 60 | 1112 | 960 | 32 |
| 字幕區 | 70 | 1168 | 940 | 100 |
| 人物區 | 0 | 1280 | 1080 | 640 |
| 人物背後的場景框 | 64 | 1420 | 952 | 500 |

- `template.json`：素材、文字、顏色與座標的設定來源。
- `scripts/news-channel.html`：HyperFrames 版型原始碼。
- `index.html`：建置後的 composition；直接改它的內容會在下一次建置時被覆蓋。
- `editor/`、`scripts/template-editor.mjs`：本機設定頁與素材匯入。
- `scripts/sam2-bridge.mjs`：SAM2 抽樣、處理與透明影片轉換。
- `DESIGN.md`、`ARCHITECTURE.md`：風格、圖層、替換與時間軸規格。
- `analysis/keyframes-contact-sheet.jpg`：原始參考片的 12 個關鍵畫面。
- `templates/`：先前的版型概念圖和獨立草稿，與 HyperFrames composition 分開。

## 驗證

```sh
npm run verify
npm run check
```

已通過 HyperFrames lint（0 errors、0 warnings）及素材替換、單一音軌、片長、字幕時間、圖層失效判斷與本機 API／路徑檢查。SAM2 WebM 已實際解碼驗證透明度、509 幀與 20.36 秒片長，並看過抽樣合成畫面。

此代理執行環境不允許啟動本機監聽埠，Chrome 執行檢查也被 SIGABRT 中止，因此尚未完成設定頁的瀏覽器互動檢查或完整 HyperFrames 渲染。請在一般 Terminal 啟動後執行 `npm run check`。

