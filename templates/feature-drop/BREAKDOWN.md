# Feature Drop — style breakdown

A **Feature Drop** is a faceless "breaking news" product tour. It follows this arc:
- "X just killed Y";
- here is the tool, and it's free;
- feature 01…05, each shown as a moving fake UI;
- "but the best part is…";
- proof;
- setup in 3 steps;
- "comment KEYWORD".

**Look:** near-black ember background with an orange radial glow, an orange perspective grid floor and floating dust. Numbers and verbs use an orange gradient, "FREE" and "done" get a green stamp, and labels and code are in mono.

**Captions:** large white text, one phrase at a time, with key words on orange gradient chips.

**Pacing:** every 3–6 seconds the screen changes completely, and within a screen a new element arrives on every phrase.

Source: `ig_ethanhuang01/type2` (45.6 s, 720×1280, Traditional Chinese voice-over).

## Scene by scene (source)

| Time (≈) | Scene | Layout | Voice-over |
| --- | --- | --- | --- |
| 0.0–2.0 | Hook | Small mono pill "● BREAKING · AI", "Claude" in huge white, "剛剛" small orange, "幹掉" in a giant orange gradient. A tilted YouTube logo card is crossed by a glowing orange slash. | Claude 剛剛幹掉了 YouTube |
| 2.0–4.0 | Reveal | "YouTube {Agent Skill}" title, a GitHub repo screenshot card, then the pills "★ 4.3k stars", "MIT · 開源" and "⑂ 1.4k". | 這是 YouTube Agent Skill |
| 4.0–6.4 | Count | A green "免費 FREE" stamp. A giant gradient "11" ticks up next to "個技能", above a grid of mono command chips (`01 /yt-script` … `11 /yt-audit`). | 免費，而且一共有 11 個技能 |
| 6.4–12.5 | Feature 01 寫腳本 `/yt-script` | A "HOOK FORMULAS · 21 個" list scrolls and a highlight lands on one formula; then score bars fill with a badge. | 用 21 個經過驗證的鉤子公式幫你寫腳本，還會在你開拍前先給鉤子打分 |
| 12.5–16.0 | Feature 02 標題+封面 `/yt-package` | An orange thumbnail card ("值得嗎？", chart icon, 12:04 duration), with a title row scored 98/100 underneath and a "最佳組合" tag. | 把你的標題和封面圖當成一組來寫 |
| 16.0–20.9 | Feature 03 剪輯清單 `/yt-edit` | An EDL panel: timecoded transcript rows, with cut rows struck through in red. A waveform underneath shows red cut markers, and a "✂ 14 刀 · 省下 7.7 秒" pill. | 把你的逐字稿變成剪輯清單，每個剪接點都標好時間 |
| 20.9–24.1 | Feature 04 留言回覆 `/yt-comment` | A kanban board (提問 / 糾錯 / 稱讚 / 釣魚): comment cards drop into the columns and the counts tick. A reply types itself into the box below. | 用你的口吻整理留言並回覆 |
| 24.1–27.0 | Feature 05 整週計畫 `/yt-plan` | A Mon–Sun grid with task blocks dropping into days (orange = key tasks), then a "✓ 本週排程完成" pill. | 幫你排好整週視頻計畫 |
| 27.0–30.6 | Teaser | The 01–05 numbers blur away. "但最厲害的是 / 爆款 / 引擎", with a `/yt-viral` tag. | 每個技能都很強，但最厲害的是它的爆款引擎 |
| 30.6–35.6 | Rank | "表現{超越自己頻道}" over a "VIRAL ENGINE · 179 支影片" panel: rows of 4.75x / 4.25x / 2.87x / 2.85x with video titles. The top row is highlighted with a "公式 · 提問式" badge. | 它會找出在你的領域裡表現超越自己頻道的影片，並指出每支影片的公式 |
| 35.6–42.1 | Steps | "設定只要 {3} 步" with step pills (Claude Code, 貼連結, /yt-script) that light up as each is said. A GitHub screenshot, then a Claude Code terminal types the URL, "✓ 已安裝 11 個技能" and `/yt-script …`. Two scored hook cards follow, then a green "✓ 完成" stamp. | 要設定很簡單，打開 Claude Code，貼上 GitHub 連結，然後輸入 /yt-script 就完成了 |
| 42.1–45.6 | CTA | "留言" huge, "“YouTube”" on a tilted orange slab, "我就把完整設定方法傳給你". A comment field types "YouTube", sends, and hearts float up. "完整設定方法 ↓ 私訊給你". | 留言 YouTube，我就把完整設定方法傳給你 |

**Constant across scenes:** an orange progress bar along the top, and captions about 72 % down the frame.

## How the template reproduces it

| Source element | Template |
| --- | --- |
| Breaking hook with struck-out target | `hook` |
| Repo screenshot + stats | `reveal` (`media` image or video) |
| FREE stamp + counting number + command grid | `count` |
| Numbered skill screens | `feature`, numbered automatically. Panels:<br>`list` (hook formulas);<br>`timeline` (EDL + waveform);<br>`board` (comment kanban + typed reply);<br>`week` (weekly plan);<br>`terminal`;<br>`media` (any screenshot, e.g. the thumbnail card). |
| "But the best part" | `teaser` |
| Outlier ranking | `rank` (values can be multipliers, prices or words) |
| Setup in 3 steps | `steps`: pills light up line by line; a terminal types, then a result card and a done stamp. |
| Comment keyword ending | `cta`: the keyword is typed into the comment field and sent. |
| Voice-over, pops, typing, thuds | macOS TTS per line (or your recordings) + synthesised sound effects, mixed into one track. |

**Differences from the source:**
- The score-bar and thumbnail mock-ups are not built in; use `list` with values, or a `media` screenshot.
- The blurred 01–05 row behind the teaser is left out.
