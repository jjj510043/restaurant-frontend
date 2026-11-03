# TENDER'S BAR — Cloudflare Pages 前台 v1.1.0

本版供「GitHub 原始碼 → Cloudflare Pages 綁定 repo → commit 後自動部署」使用。不是 GitHub Pages，也不需要 Netlify。

前台功能與 v1.0.0 相同，改用 Cloudflare Pages Functions 轉送 API。沒有 node_modules，沒有第三方執行依賴。正式後端仍為 https://posserver-sigma.vercel.app，沿用既有 SQL 資料庫及管理後台。

## 1. 放進 GitHub

1. 解壓縮 POS_front_CloudflarePages_v1.1.0.zip。
2. 在 GitHub 建立新的 repository，例如 pos-front。可設為 Private；網站公開與 repository 私有是不同設定。
3. 把解壓縮資料夾「裡面的內容」上傳到 repo 根目錄並 commit。
4. 根目錄應直接看到 public、scripts、tests、package.json、README.md。不要只上傳 ZIP，GitHub 不會替你解壓縮，也不要只上傳 public/index.html。
5. 所有 public/img 圖片都要一起上傳。GitHub 網頁可使用 Add file → Upload files；也可以用 GitHub Desktop 或 Git。

若使用 Git 指令：

    git init
    git add .
    git commit -m "Add Cloudflare Pages POS frontend"
    git branch -M main
    git remote add origin https://github.com/你的帳號/pos-front.git
    git push -u origin main

上面只是操作範例，本交付沒有建立 repository 或代替你推送。

## 2. 在 Cloudflare Pages 綁定 GitHub

1. 登入 https://dash.cloudflare.com/ 。
2. Workers & Pages → Create application → Pages → Import an existing Git repository。
3. 依畫面授權 Cloudflare 讀取所選 GitHub repository；只選要部署的 repo 即可。
4. 選擇新建的 pos-front repository，進入設定。
5. 請使用以下值：

| 欄位 | 值 |
|---|---|
| Project name | 自訂，例如 tenders-pos |
| Production branch | main，或你實際使用的正式分支 |
| Framework preset | None |
| Build command | exit 0 |
| Build output directory | public |
| Root directory | 留空（本資料夾內容已放在 repo 根目錄時） |
| 必填環境變數 | 無 |
| 資料庫綁定 | 無 |

6. Save and Deploy，等待部署完成。
7. 開啟 Cloudflare 提供的 https://專案名稱.pages.dev 網址。

注意要選 Pages。若畫面要你填 npx wrangler deploy 等「Deploy command」，通常是在建立 Workers 專案；請返回 Pages 的 Git 匯入流程。本包是 Pages 的 public/_worker.js advanced mode，不是 Workers Static Assets 專案。

如果你把整個 POS_front_CloudflarePages_v1.1.0 資料夾上傳成 repo 內的子資料夾，Root directory 必須填 POS_front_CloudflarePages_v1.1.0，Build output directory 仍填 public。推薦直接把內容放 repo 根目錄，較不易填錯。

## 3. 初次驗收

先用不會建立正式訂單的模式：

    https://專案名稱.pages.dev/?demo=1&SEAT_ID=1

頁面上方會顯示示範模式；菜單與送出都在本機模擬，沒有向正式後端新增訂單。示範訂單只保留在本次頁面記憶體。

正式模式：

    https://專案名稱.pages.dev/?SEAT_ID=5

5 必須是原資料庫中實際存在的 SEAT_ID，不是顯示桌名。網址沒有有效桌號時只能瀏覽／加入購物車，不能送單。為每個桌號建立各自的 QR Code。確認使用正確桌號後，再由店員配合測試正式送單及原管理後台接單。

連線檢查：

    https://專案名稱.pages.dev/api/ITEM?is_active=1
    https://專案名稱.pages.dev/api/SEAT

正常應傳回 JSON 陣列。若 /api 顯示 HTML、404 或 worker 錯誤，先檢查 public/_worker.js、public/_routes.json 是否在 GitHub 中，及輸出目錄是否填 public。

## 4. 日後更新

在 GitHub 更新檔案並 commit 到 main，Cloudflare Pages 會觸發新的正式部署。可在 Pages 專案查看部署狀態與對應 commit。GitHub 分支與 Pull Request 可能產生 Preview 部署；請用 demo=1 測試，不要無意建立正式訂單。

若希望所有 Preview 都禁止正式下單，可在 Pages 的 Preview 環境設定文字變數 ORDER_WRITES_ENABLED=false 並重新部署。Production 不設定此變數即可維持正式下單。這個選項不會關閉菜單或示範模式。

## 5. 架構與檔案

顧客瀏覽器 → Cloudflare Pages 網站 → /api → Pages Function (_worker.js) → 原 Vercel 後端 → 原 SQL 資料庫。

GitHub 保存程式碼，Cloudflare Pages 執行部署與網站服務，訂單資料仍由原資料庫保存。沒有將資料庫資料寫回 GitHub。

| 路徑 | 用途 |
|---|---|
| public/index.html | 顧客前台入口與對話框 |
| public/assets/app.mjs | 菜單、桌號、購物車、下單與歷史 |
| public/assets/core.mjs | 價格、桌號、商品整理與 HTTP 請求 |
| public/assets/demo.mjs | 明確示範模式資料 |
| public/assets/style.css | 手機與桌面版面 |
| public/config.js | 可公開的品牌與前台設定 |
| public/img | 原附商品圖片 |
| public/_worker.js | Pages Functions API 轉送與基本驗證 |
| public/_routes.json | 只有 /api/* 執行 Function，其餘走靜態資產 |
| public/_redirects | /classic、/special、/spirits 等舊前台路徑 |
| public/_headers | 靜態資產標頭；API 標頭由 Worker 自行設定 |
| tests | 使用 Node.js 的模擬測試 |
| scripts/serve.mjs | 選用的本機開發伺服器 |

Cloudflare Pages 不使用 Netlify 的外部 200 代理規則。本版已移除 Netlify 設定，API 由 Pages Function 依允許清單轉送。靜態檔案和 API 的責任分開。

## 6. 設定

公開前台選項：public/config.js

- brand / subtitle：品牌文字。
- apiBase：維持 /api。
- allowSeatSelection：預設 false，只接受網址桌號；true 才開放選桌。
- seatTTLHours：桌號記憶時數，預設 12。
- catalogCacheMinutes：離線菜單快取時間，預設 15。
- historyRefreshSeconds：已點品項視窗更新時間，預設 30。

Pages Function 的選用環境變數：

| 名稱 | 預設 | 作用 |
|---|---|---|
| POS_API_BASE | https://posserver-sigma.vercel.app | 原後端 HTTPS origin，只接受網域，不加路徑 |
| ORDER_WRITES_ENABLED | 未設定時允許 | 設 false 時拒絕正式 POST 下單 |

不必填 Cloudflare API token、GitHub token、資料庫帳密或 SQL 連線字串。環境變數修改後需重新部署才能驗證生效。前台不會自行讀取 Pages 環境變數；只有 _worker.js 使用上表的值。

## 7. 保留的前台改善

分類與搜尋、上架過濾、容量分組、本站商品圖片、依桌位保存購物車、不同需求分列、單項及整單備註、送出前核對最新商品和桌號、調價與下架需重新確認、整數分金額、兩階段確認、送出中防連點、逾時不自動重送、結果不明時暫停重送、未結帳品項查詢、活動有效日期過濾、純文字顯示動態資料。

本版 API 轉送另有：路徑／方法白名單、有效桌號、JSON 格式、數量／價格範圍與內容長度驗證、上游逾時、隱藏 SQL 等上游錯誤內容，不轉送瀏覽器 cookies、任意 URL 或認證標頭。這些措施不是管理登入或伺服器級防重複保證。

## 8. 邊界

- 這次搬的是前台與 API 轉送，不是整個 POS。原 Vercel 後端及 SQL 資料庫必須正常運作。
- 原後端仍接受客戶端成交價，本版價格重查不會修補原後端公開端點。後續應由原後端以商品 ID 查價並驗證。
- 原後端沒有 idempotency key；前台防重送無法保證跨裝置、清除瀏覽器資料後不重複。
- 原管理權限、已結帳鎖定、營收公式與稽核歷史問題沒有在此修補。
- 原資料模型沒有桌次，換客前應結清該桌舊單。
- 已點品項 API 不提供可靠的折後總額與出餐狀態，前台不會自行猜測。
- 網域從 Netlify／Vercel 換到 pages.dev 後，原網域的購物車及桌號不會自動搬到新網域；正式訂單仍保留在原資料庫。
- 網站不包含線上刷卡、發票、庫存與金流功能。

## 9. 本機測試（選用）

需 Node.js 20 以上；不需要 npm install。

    npm test
    npm run check
    npm run dev

開啟本機網址並加 ?demo=1&SEAT_ID=1。開發伺服器只模擬 Pages 的靜態檔案與 Worker 請求，不代表已在 Cloudflare 平台驗證。非示範模式會轉接原正式後端，請勿任意測試正式下單。

## 10. 驗證狀態

核心與 Worker mock 測試共 28 項通過；語法及資產檢查通過。沒有代建 GitHub repository、連接 Cloudflare 帳號或實際發布，也沒有向正式後端送單。瀏覽器視覺／手機觸控與正式 Cloudflare edge 行為仍需部署後驗收。

## 官方參考

- Git integration：https://developers.cloudflare.com/pages/configuration/git-integration/
- Static HTML：https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- Advanced mode：https://developers.cloudflare.com/pages/functions/advanced-mode/
- Function routing：https://developers.cloudflare.com/pages/functions/routing/
