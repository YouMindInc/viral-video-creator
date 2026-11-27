# Viral video creator

影片製作 monorepo。`editorial-explainer` 是第一個可重複使用的 HyperFrames 模板，搭配 Apple Core ML SAM2 人物去背工具。

```text
viral-video-creator/
├── templates/editorial-explainer/       HyperFrames composition、素材設定頁、範例影片
├── tools/sam2/                SAM2 程式、固定依賴、模型說明與本機環境
├── scripts/verify-monorepo.mjs
├── package.json              pnpm workspace 與統一指令
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── Launch.command
```

## 一個指令產生影片

```sh
cd ~/code/viral-video-creator
pnpm generate:editorial-explainer
```

依提示提供下半部人物錄影、上半部產品／分享內容動畫、品牌、兩行標題、內容標籤與字幕。可以將 Finder 裡的檔案直接拖進 Terminal；按 Enter 沿用畫面上的預設值，文字欄輸入 `-` 清空。最後選 `sam2`（人物輪廓加圓角場景）或 `original`（原片裁切）。位置與配色沿用目前模板，可先在素材設定頁調整。

字幕可提供 `.srt`，輸入 `auto` 用本機 Whisper 辨識，或輸入 `none` 不顯示字幕。同一支人物影片可用 `keep` 沿用字幕；換人物後不會帶入上一支影片的字幕。自動辨識需要已安裝的 `whisper-cli` 和 `~/.cache/whisper-cpp-models/ggml-large-v3-turbo.bin`，也可用 `WHISPER_MODEL` 指向其他既有的多語言模型；指令不會自動下載模型。

新人物先產生五張 SAM2 抽樣圖，請查看人物輪廓與背景框，在 Terminal 輸入 `yes` 後就會接著完整去背、檢查版面、輸出 MP4。相同人物與背景框設定直接重用已完成的去背。片長跟隨人物錄影，聲音只取人物原片；上方影片較短時停在最後一幀，較長時截至人物片長。

每次的輸出都保存在 `renders/editorial-explainer/<時間>/`：

- `video.mp4`：驗證尺寸、長度與音軌後的成片（1080×1920、30 fps），完成後自動開啟。
- `project/`：本次 HyperFrames composition 與所需素材的獨立副本。
- `template.json`、`previous-template.json`：本次設定與原設定備份。
- `render.log`、`job.json`：處理紀錄與成功／失敗狀態。

素材來源保留原檔，新素材匯入模板的 `assets/inputs/`。目前模板會更新成最新設定，之後可直接用 `pnpm preview:editorial-explainer` 預覽。停止或失敗時會保留設定與紀錄，不會把未完成的檔案命名為 `video.mp4`。

```sh
# 使用目前設定與已處理人物，直接輸出
pnpm generate:editorial-explainer --current

# 只詢問、匯入與建置，先不執行去背或渲染
pnpm generate:editorial-explainer --prepare-only

# 快速試片，不自動開啟輸出
pnpm generate:editorial-explainer --current --quality draft --no-open
```

`--current` 如遇到尚未去背的新人物，會提示改用互動模式查看抽樣圖。Ctrl+C 可停止處理。產生影片時請等這次作業完成再從素材設定頁更換素材。

## 清理暫存與已處理內容

```sh
# 先列出清理範圍與大小，不刪除檔案
pnpm clean:editorial-explainer --dry-run

# 清除 SAM2 中間檔、影片預覽快取、檢查截圖與未完成的暫存檔
pnpm clean:editorial-explainer

# 另外清除已處理的人物圖層、抽樣圖、產生的海報與 composition
pnpm clean:editorial-explainer --prepared

# 另外清除這個模板的輸出紀錄、MP4、composition 副本與設定備份
pnpm clean:editorial-explainer --renders
```

預設保留原始／匯入素材、字幕、`template.json`、已完成的去背與輸出影片。所有選項都保留模型、Python／Node 環境、HyperFrames 編輯狀態及其他模板；`template.json` 直接引用的素材也會保留，即使放在暫存或輸出目錄裡。清理只限這個 repo，不會清除電腦上的共用快取。

可以合併選項，例如 `pnpm clean:editorial-explainer --prepared --renders --dry-run`。清理前先停止預覽、渲染及獨立 SAM2 指令；產生器執行中會阻止清理。

使用 `--prepared` 後執行 `pnpm preview:editorial-explainer`，就會重新建置 composition。此時人物先顯示原片裁切；要恢復輪廓效果，重新執行 `pnpm generate:editorial-explainer` 並完成 SAM2 去背。

## 直接開啟 HyperFrames

```sh
cd ~/code/viral-video-creator
pnpm preview:editorial-explainer
```

這會建置模板、執行 lint，然後開啟 http://localhost:3017/#project/editorial-explainer。此指令不會執行 SAM2 去背。

## 在這台 Mac 開啟素材設定

雙擊根目錄的 `Launch.command`，或執行：

```sh
cd ~/code/viral-video-creator
pnpm dev:editorial-explainer
```

- 素材與位置設定：http://localhost:3018
- HyperFrames 播放與時間軸：http://localhost:3017/#project/editorial-explainer

保留啟動設定頁的 Terminal。選取上下兩支影片，填入標題與 SRT 字幕，調整各元素 X/Y、寬高及字級，然後儲存套用。預設人物區為底部三分之一，頭部凸出圓角原場景。

本機打包版本已攜帶現有 `node_modules`、SAM2 `.venv` 與三個 Core ML 模型，可直接重用，不必再下載。SAM2 來自同一個 repo 的 `tools/sam2`，不依賴原本 `~/code/sam2` 的程式或模型路徑。複製的 Python 環境仍使用這台 Mac 既有的 uv Python 3.12 直譯器；換電腦請依下節重新建立。

## 從 Git clone 後設定

支援 Apple Silicon macOS。需要 Node.js 22+、pnpm 10.14+、FFmpeg、FFprobe，以及 SAM2 所需的 uv/Python 3.12。

```sh
pnpm install --frozen-lockfile
pnpm setup:sam2
pnpm dev:editorial-explainer
```

`setup:sam2` 只會建立缺少的 Python 環境並安裝固定版本依賴；模型缺少時才下載 `apple/coreml-sam2-small`。已下載模型的內容雜湊列於 `tools/sam2/model-files.sha256.json`。虛擬環境、模型權重、Node 依賴及大型中間輸出保留本機並被 Git 忽略；程式、說明、鎖定檔、模型來源／雜湊及範例素材則納入版本控制。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `pnpm generate:editorial-explainer` | 詢問素材、自動處理與輸出 MP4 |
| `pnpm clean:editorial-explainer` | 清除暫存；可加 `--prepared`、`--renders` 或 `--dry-run` |
| `pnpm dev:editorial-explainer` | 開啟素材設定頁與 HyperFrames |
| `pnpm preview:editorial-explainer` | 只開啟 HyperFrames 預覽 |
| `pnpm build:editorial-explainer` | 依設定重新產生 composition |
| `pnpm sam2:test` | 先產生五張人物去背抽樣圖 |
| `pnpm sam2:prepare` | 看過抽樣後產生完整透明人物圖層 |
| `pnpm render:editorial-explainer` | 輸出 MP4 到 app 的 renders 目錄 |
| `pnpm verify` | 檢查 workspace、模板、模型與 Python 環境 |
| `pnpm check:editorial-explainer` | 執行 HyperFrames 瀏覽器／版面檢查 |

素材設定在 `templates/editorial-explainer/template.json`；長期版型修改在 `templates/editorial-explainer/scripts/news-channel.html`。新匯入的素材位於 app 的 `assets/inputs/`，不會自動納入 Git。需要版本控制該素材時，可明確調整忽略規則。

## SAM2 流程

先按「預覽 SAM2 去背」檢查五張抽樣，再產生完整人物圖層。輸出由 ProRes 4444 轉為帶 alpha 的 WebM，包含人物及圓角背景卡片，HyperFrames 只疊一次；聲音取自原始人物錄影並播放一次。

範例目前有已驗證的 SAM2 圖層：1080×1920、20.36 秒、509 幀。更換人物或調整背景框時，舊圖層會自動失效；開啟預覽時可先使用原始錄影，無需等待模型處理。

此 Core ML 匯出逐幀分割，適合單人、固定鏡頭、人物留在原位的影片。完整操作見 [SAM2 README](tools/sam2/README.md) 與 [操作指南](tools/sam2/AGENT.md)。可用 `SAM2_DIR` 明確指定另一個相容工具目錄。

## 檢查與交付狀態

模板已通過靜態／功能檢查，SAM2 透明度、幀數、片長及抽樣輪廓已驗證。產生器的九項自動測試、八步互動輸入與範例建置已通過，HyperFrames lint 為零錯誤、零警告。實際試片在 HyperFrames 瀏覽器檢查時遇到 Chrome `SIGABRT`，此代理環境也無法寫入 HyperFrames 的全域 history 快取；這次沒有產生 MP4，也尚未完成設定頁的瀏覽器操作驗證。請在自己的 Terminal 執行上述產生指令，紀錄保存在各次輸出資料夾的 `render.log`。

目前專案位於 `~/code/viral-video-creator`。
