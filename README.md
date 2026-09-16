# Markdown 本機去識別化工作台

在自己的電腦上打開 Markdown（.md）文件，由本機的中文 AI 模型找出人名、電話、電子郵件、統一編號、身分證字號、地址等疑似個人資料，你一個一個點選要遮掉的地方，再下載去識別化後的檔案。**整個過程都在你的電腦裡完成，文件不會上傳到任何地方，也不需要註冊帳號或申請金鑰。** 專案以 MIT 授權釋出（見 `LICENSE`）。

## 給第一次使用的人：從零開始的完整步驟

你不需要會用 GitHub；除了建議安裝的 Git 之外，也不需要先安裝任何程式。照下面做，大約 15 到 30 分鐘（大部分是等待下載）。

### 你需要準備的

| | Mac | Windows |
| --- | --- | --- |
| 電腦 | Apple Silicon 晶片（M1、M2、M3、M4…），macOS 14 以上 | 64 位元 Windows 10 或 11 |
| 磁碟空間 | 約 5 GB | 約 5 GB |
| 網路 | 第一次要，之後可以離線使用 | 第一次要，之後可以離線使用 |

Intel 晶片的 Mac、Windows ARM 與 Linux 目前不支援。不確定自己的 Mac 是哪種晶片：點左上角  → 「關於這台 Mac」，看「晶片」那一行是不是 Apple 開頭。

### 第 1 步：下載專案

有兩種方法，選一種就好。

#### 方法 A：用 Git 下載（建議，之後更新只要一行指令）

Git 是一個免費的小工具，`git clone` 這個指令會把整個專案複製到你的電腦，並且記住它是從哪裡來的。這個專案會持續更新，用 Git 下載的話，之後只要打一行 `git pull` 就能拿到新版本，不用重新下載、也不用搬檔案。

**先確認電腦有沒有 Git**

- **Mac**：一律用 Homebrew 安裝 Git，不用 Apple 內建的版本。分成三小步：確認目前狀態 → 裝 Homebrew 再裝 Git → 設定 PATH 讓終端機用 Homebrew 的 Git。照順序做，每一步都有確認方法。

  **Mac 步驟 1：確認目前的狀態**

  打開「終端機」app（Launchpad 搜尋「終端機」，或到「應用程式 → 工具程式」裡），輸入下面這行，按 Enter：

  ```bash
  git --version
  ```

  - 跳出視窗問你要不要安裝「命令列開發者工具」：按 **取消**，不用理它，直接做步驟 2（Homebrew 會用自己的方式處理這件事）。
  - 看到 `git version 2.x.x`：電腦裡已經有一個 Git，但可能是 Apple 內建的舊版本。一樣做步驟 2 和 3，之後就會換成 Homebrew 的版本。
  - 出現 `command not found`：做步驟 2。

  **Mac 步驟 2：安裝 Homebrew，再用它安裝 Git**

  Homebrew 是 Mac 上最常用的「軟體安裝工具」，裝好之後之後要裝任何開發工具都是一行指令。在終端機貼上下面這整行，按 Enter：

  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```

  過程中會發生這些事，都是正常的：

  1. 它會列出要安裝的東西，問你「Press RETURN/ENTER to continue or any other key to abort」，按 Enter。
  2. 要求輸入 Mac 的登入密碼。**打字時畫面不會顯示任何字元**，打完直接按 Enter。
  3. 如果電腦還沒有「命令列開發者工具」，它會順便下載安裝，這一段最久，可能十幾分鐘，畫面不動是正常的。
  4. 最後會印出一段 **Next steps**，裡面有兩三行以 `echo` 和 `eval` 開頭的指令，要你複製貼上執行。**這一步不能跳過**，它就是在設定 PATH（步驟 3 會再說明）。Apple 晶片的 Mac 那幾行是：

  ```bash
  echo >> ~/.zprofile && echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile && eval "$(/opt/homebrew/bin/brew shellenv)"
  ```

  貼上執行後輸入 `brew --version`，看到 `Homebrew 4.x.x` 就表示 Homebrew 裝好了。接著安裝 Git：

  ```bash
  brew install git
  ```

  **Mac 步驟 3：設定 PATH，讓終端機用 Homebrew 的 Git**

  PATH 是終端機找程式的順序清單。Mac 內建的 Git 在 `/usr/bin`，Homebrew 裝的在 `/opt/homebrew/bin`；如果 PATH 沒有把 Homebrew 的位置排在前面，你打 `git` 用到的還是舊的內建版本。步驟 2 最後那幾行已經把 Homebrew 排在前面了，這裡再固定住，確保之後每個新視窗都用 Homebrew 的 Git。輸入：

  ```bash
  echo 'export PATH="$(brew --prefix git)/bin:$PATH"' >> ~/.zshrc
  ```

  然後**關掉終端機視窗，重新開一個**（設定只在新視窗生效），輸入下面兩行確認：

  ```bash
  which git
  ```

  ```bash
  git --version
  ```

  `which git` 應該顯示 `/opt/homebrew/bin/git`（或 `/opt/homebrew/opt/git/bin/git`），`git --version` 顯示版本號，就完成了。

  **Mac 常見狀況**

  - 打 `brew` 出現 `command not found: brew`：步驟 2 的 Next steps 那幾行沒執行到，回去貼上執行，然後開新的終端機視窗。
  - `which git` 還是顯示 `/usr/bin/git`：代表 PATH 沒生效，確認 `~/.zshrc` 那行有寫進去（輸入 `cat ~/.zshrc` 看最後一行），然後一定要開**新的**終端機視窗。
  - Homebrew 安裝到一半斷線失敗：重新貼上同一行安裝指令再跑一次，它會接著做。
  - 之後要更新 Git，輸入 `brew upgrade git` 就好。
- **Windows**：到 <https://git-scm.com/download/win> 下載 Git for Windows，執行安裝程式，全部用預設值一路按 **Next** 到完成。安裝完，打開一個**新的** PowerShell 視窗（按開始鍵，輸入 `PowerShell`，按 Enter），輸入 `git --version`，看到 `git version 2.x.x` 就對了。

**下載專案**

1. 在終端機（Mac）或 PowerShell（Windows）裡，先移到你想放專案的地方。這裡用「文件」資料夾：

   Mac：

   ```bash
   cd ~/Documents
   ```

   Windows：

   ```bash
   cd $HOME\Documents
   ```

2. 輸入下面這行，按 Enter：

   ```bash
   git clone https://github.com/taiwanlinshangche/tw-presidio-deid.git
   ```

3. 會跑幾行字，幾秒到一分鐘就好。「文件」裡會多出一個 `tw-presidio-deid` 資料夾，這就是專案。

#### 方法 B：直接下載 ZIP（不想裝 Git 的話）

1. 用瀏覽器打開 <https://github.com/taiwanlinshangche/tw-presidio-deid>。
2. 找到綠色的 **Code** 按鈕（在檔案清單右上方），點一下。
3. 選單最下面按 **Download ZIP**，會下載一個 `tw-presidio-deid-main.zip`。

用 ZIP 的話，之後要更新到新版本就得重新下載一次，再自己把 `.runtime` 資料夾搬到新資料夾裡（見下面的常見問題）。

### 第 2 步：放到固定位置

- **用方法 A 的人**：專案已經在「文件」裡的 `tw-presidio-deid` 資料夾，不用解壓縮，直接跳到第 3 步。
- **用方法 B 的人，Mac**：到「下載項目」資料夾，對 zip 檔按兩下，會出現 `tw-presidio-deid-main` 資料夾。把這個資料夾拖到「文件」裡。
- **用方法 B 的人，Windows**：到「下載」資料夾，在 zip 檔上按右鍵 → **全部解壓縮** → 解壓縮。把解出來的 `tw-presidio-deid-main` 資料夾移到「文件」裡。

放哪裡都可以，但之後不要再移動或改名。下面步驟寫的 `tw-presidio-deid-main`，用方法 A 的人就是 `tw-presidio-deid`，其他都一樣。

### 第 3 步：啟動

**Mac**

1. 打開 `tw-presidio-deid-main` 資料夾，找到 `start.command`。
2. 在它上面按**右鍵**（或按住 control 再點）→ 選 **打開** → 跳出視窗時再按一次 **打開**。第一次一定要用右鍵，直接按兩下會被 macOS 擋下來，說「來自未識別的開發者」。之後就可以直接按兩下。
3. 會跳出一個黑底或白底的「終端機」視窗開始跑字，這是正常的。**這個視窗要一直開著**，關掉它工作台就會停。

如果按右鍵打開後出現「沒有權限」或直接用文字編輯器打開了：打開「終端機」app（在「應用程式 → 工具程式」裡），輸入 `chmod +x `（注意後面有一個空格），再把 `start.command` 這個檔案拖進終端機視窗，按 Enter；然後回到資料夾重做第 2 點。

**Windows**

1. 打開 `tw-presidio-deid-main` 資料夾，找到 `start.bat`，按兩下。
2. 如果跳出藍色的「Windows 已保護您的電腦」：點 **其他資訊**，再按 **仍要執行**。
3. 會出現一個黑色視窗開始跑字，這是正常的。**這個視窗要一直開著**，關掉它工作台就會停。

### 第 4 步：第一次啟動會自動安裝（只有這一次）

1. 視窗會先下載執行環境（Node.js），顯示進度。
2. 接著瀏覽器會自動打開工作台首頁，十張檢查卡片會一張一張跑完。第一次大部分會是紅色的「缺少或損壞」，跑完後卡片下方會出現 **安裝全部**，按下去。
3. 等它跑完。這一步會下載 Python、辨識套件和中文模型，總共幾 GB，依網路速度大約 10 到 20 分鐘。畫面會顯示每個項目的進度，不用一直盯著。
4. 十張卡片都變成綠色的「✓ 可用」後，背景會變模糊，中間出現「開始」。

如果中途斷線或失敗，卡片下方會出現「重試安裝」，按一下就從沒完成的地方繼續，已經下載好的不會重來。

### 第 5 步：開始使用

1. 首頁會有十張卡片一張一張變綠，全部變綠後背景變模糊，中間出現 **開始**，按下去。
2. 畫面變成「把 .md 拖進來」。把你的 .md 文件從資料夾拖進瀏覽器視窗裡放開；手邊沒有檔案的話，按下面那行 **模擬測試**，會載入一份範例提案讓你試玩。
3. 等它辨識（會有語音和進度條），完成後文件會顯示出來，疑似個資會有淡黃色底線標記。
4. 點一下標記，那個字就會變成 `〔姓名 1〕` 這種遮罩；再點一次就還原。預設開著的「閃電模式」會讓整份文件相同的字一起遮。右上角的標籤圖示可以整類一起遮。
5. 想改內容可以直接在文件上改：預覽畫面點任一段文字就能編輯，或切到「原始碼」整份改。
6. 遮好後按右上角的下載圖示，會得到一個 `[去識別] 原檔名.md`，這就是可以拿去用的版本。

### 第 6 步：關閉與下次使用

- 用完把瀏覽器分頁關掉，再回到那個黑色或終端機視窗，同時按 `Control` 和 `C`（Mac 也是 Control，不是 Command），或直接關掉視窗。
- 下次要用，一樣按兩下 `start.command`（Mac）或 `start.bat`（Windows），這次不會再安裝，幾秒到一分鐘內就會進到首頁。

### 常見問題

- **瀏覽器沒有自動打開**：自己打開瀏覽器，在網址列輸入視窗裡顯示的網址，通常是 `http://127.0.0.1:4173`。
- **視窗說「另一個初始化程序正在執行」**：上一次的視窗還開著，找到它關掉再試。
- **視窗說「工作台已開啟」**：表示已經在跑了，直接打開瀏覽器用就好。
- **想更新到新版本（用方法 A、Git 下載的人）**：先關掉工作台。打開終端機（Mac）或 PowerShell（Windows），移到專案資料夾（例如 `cd ~/Documents/tw-presidio-deid`，Windows 是 `cd $HOME\Documents\tw-presidio-deid`），輸入 `git pull`，按 Enter，等它跑完幾行字。然後照平常的方式按兩下 `start.command` 或 `start.bat` 啟動就好。`.runtime` 資料夾（模型、Python）都會留著，不用重新下載；如果這次更新有改到網頁，第一次啟動會自動重新建置，多等一下就好。 如果 `git pull` 說有「本機變更會被覆蓋」之類的訊息，先執行下面這行再重新 `git pull`：

  ```bash
  git checkout -- .
  ```

- **想更新到新版本（用方法 B、ZIP 下載的人）**：重新做第 1 步方法 B 和第 2 步，把新的資料夾放到舊資料夾旁邊，再把舊資料夾裡的 `.runtime` 資料夾（隱藏的，Mac 按 `Command + Shift + .` 可以顯示）整個拖到新資料夾裡，就不用重新下載模型。懶得搬的話，直接用新資料夾重新安裝也可以。
- **Git 下載和 ZIP 下載有什麼差別**：拿到的檔案完全一樣，用起來也完全一樣，文件一樣只留在你的電腦、不會上傳。唯一的差別是 Git 會記住專案是從哪裡來的，所以之後更新只要打一行 `git pull`；ZIP 沒有這個連結，每次更新都要重新下載、自己搬 `.runtime`。所以我們建議用 Git。
- **想移除**：把整個資料夾刪掉就好。它不會在系統其他地方留下東西，也沒有改任何系統設定。
- **我的文件會被傳出去嗎**：不會。辨識在你的電腦上跑，網頁只連自己電腦的 `127.0.0.1`，關掉網路一樣能用。

---

## 功能說明

1. 每次啟動先顯示十項檢查；全部可用後才啟用「開始」。點下去立即播放開場配音，並切換成「把 .md 拖進來」；也可再點提示選檔。
2. 拖曳進入時顯示「放開即可開啟」，放開後在本機辨識。手邊沒有檔案時，按入口下方的「模擬測試」會載入內建的範例提案（`frontend/public/examples/範例提案.md`，虛構機關與合成資料）。
3. 預設顯示預覽；上方中央可切換「原始碼／預覽」，一次只顯示一種。
4. 疑似個資以淡色標記，滑鼠移上去時文字變色，**不顯示浮出的原文**。
5. 點擊該處後變成 `〔姓名 1〕`、`〔組織 1〕` 等遮罩；這時 hover 或鍵盤焦點才顯示原文。再點一次可還原。
6. 預設開啟「閃電模式」：相同文字在整份文件一起遮罩／還原，原始碼與預覽同步。關閉閃電模式後，點一處只處理該處。系統會從已辨識文字補找重複位置；不同的較長完整標籤不會被拆開。
7. 左上「關閉」會先確認，取消保留內容與閱讀位置；確認後回到空白入口。

閱讀中再次拖檔，不會取代目前文件。原始碼視圖可處理預覽中不顯示的連結目的地等文字。

## 編輯內容

兩個視圖都可以直接改，不必切換模式：

- 原始碼視圖本身就是文字編輯框，可以直接打字、新增或刪除；停止輸入 0.8 秒或離開編輯框就套用。
- 預覽視圖點任一段文字（不是辨識標記），那一段就地換成它的 Markdown 編輯框；失焦或 Cmd/Ctrl+Enter 套用，Escape 取消。點辨識標記仍然是遮罩／還原。這是逐段改 Markdown 而不是直接改排版後的文字，因為排版後的內容無法可靠地寫回原始 Markdown。

套用時先用已經辨識過的文字立刻重排（相同文字全部找出來，之前遮罩過的文字不論整組或部分都再次遮罩），再在背景重新辨識一次補上新出現的個資；`〔組織 N〕` 的編號依新內容的出現順序重新計算。編輯過的文件下載時一律產生新檔（有遮罩為 `[去識別] 原檔名`，沒有遮罩則按鈕變成「下載編輯版 .md」、用原檔名）。

## 分類快速遮罩

右上角的標籤圖示會開啟分類面板，依姓名、組織、電話等分類列出文字標籤與出現次數。

- 點分類名稱：整類一起遮罩；若已全部遮罩則整類還原。部分選取時，點擊會補齊該類全部遮罩。
- 點標籤：整份文件相同文字一起遮罩／還原，不受閃電模式影響；部分遮罩時標籤與分類顯示混合狀態。
- Escape、點面板外或再點標籤圖示可關閉面板。
- 旁邊下載圖示會下載目前版本；滑鼠提示可查看已遮罩數量。

## 閃電模式

工具列上的閃電開關（預設開啟）決定點擊文中標記時的範圍：

- 開啟：點一處，整份文件相同文字一起遮罩或還原；若同組有任一處未遮罩，會先補齊整組。
- 關閉：只遮罩或還原被點的那一處（同一處在原始碼與預覽仍同步）。
- 分類面板的分類與標籤永遠整組切換。開關狀態不儲存，每次開啟頁面回到開啟。

## 配音

七個原始 WAV 放在 `frontend/public/audio/`，由林上哲本人錄製，隨專案以 MIT 授權釋出。

- 點擊「開始」時直接播放「把檔案拖進來」，不等 1 秒。音檔會預載，開始前不播放。
- 拖曳尚未放下時：版本一 → 第 2 秒版本二 → 第 4 秒版本一；放下或離開視窗即停止。
- 開始辨識：「讓我幫你看看」→ 第一個「嗯」；播放結束 2 秒後再播同一個「嗯」，再結束 3 秒後若仍在處理，才播第二版本的「嗯」。
- 辨識完成時立刻打斷還在播的「嗯」，「好了」與畫面上的「好了！」同時出現。不疊加配音。
- 取消、失敗、確認關閉時停止聲音與排程。回到空白入口不重新播啟動配音。
- 不顯示「開啟音效」按鈕。點擊「開始」直接觸發播放；若仍被瀏覽器阻擋，會在正常滑鼠、鍵盤或觸控操作時自動重試當下配音，不補播已取消的舊流程。
- 「開始」使用正常的點擊或鍵盤操作觸發聲音，不修改瀏覽器設定。音效是否獲准不影響文件處理。

未提供額外背景音樂，因此開始處理與思考開頭共用第 4 個配音，不重複播放兩次。

## 匯出

- 沒有選取任何遮罩：下載圖示（「下載原文 .md」），下載原始位元組。
- 有選取遮罩：下載圖示（「下載遮罩版 .md」），檔名為原檔名加上「[去識別] 」前綴（例如 `[去識別] 提案.md`），只替換選中的文字範圍，保留原有 Markdown、UTF-8 BOM 與換行。
- 匯出從原始 Markdown 產生，不會包含畫面的按鈕、tooltip、原文對照表或內部標記。

**疑似個資偵測可能誤判或漏判。未點擊的標記仍是原文，也會被匯出；遮罩版不代表已完整去識別化。**

## 開發者：從原始碼啟動

已安裝 Git 的人可以直接 clone：

```bash
git clone https://github.com/taiwanlinshangche/tw-presidio-deid.git
cd tw-presidio-deid
./start.command        # macOS；Windows 用 .\start.bat
```

不需要先安裝 Node.js、Python、Presidio 或模型；啟動器會處理。**一般使用一律用 `start.command`／`start.bat`。** `npm run dev` 是開發模式，需要 `node_modules` 裡的 Vite，全新 clone 沒有，要先 `npm ci`；否則會在模型載入完成後才報「找不到 vite」。首次啟動若缺少相容 Node.js，啟動視窗會先顯示下載進度；網頁出現後，其餘步驟都在網頁顯示。保留啟動視窗，結束時按 `Control + C`。每次啟動都直接進工作台首頁：十張檢查卡片逐張揭露，全部檢查完若有缺項，卡片下方出現「安裝全部」，安裝進度直接寫在卡片上；只有網頁建置過期時會自動重建。

建置好的工作台（`dist/`）與建置紀錄（`frontend-build.json`）隨 repo 一起發布，所以下載 ZIP 的人不需要 npm 套件就能直接使用。改過 `frontend/`、`package.json`、`package-lock.json` 或 `vite.config.js` 之後，發布前要執行 `npm run build:release` 重新產生這兩者，`npm run test:setup` 會檢查它們是否與原始碼一致。

### 安裝與重試

- Node.js 與 uv 從固定官方版本下載，核對 SHA-256 後才解壓縮。
- Python 3.12、套件、模型與快取放在專案的 `.runtime/`；前端依賴放在 `node_modules/`，建置放在 `dist/`。不更改全域 Python、系統 PATH 或 Windows 登錄。
- 缺少元件時才安裝；已完成步驟會重新檢查並沿用。之後仍使用同一個啟動檔，不用再次輸入安裝指令。
- 有可用下載大小時顯示百分比；模型顯示實際完成檔案數；套件安裝與模型載入顯示動態進度條。
- 第一次需要網路與數 GB 可用磁碟空間；速度依網路與電腦而定。完成後可離線辨識，啟動不會自動更新模型或套件。
- 更新原始碼後，啟動器會比對前端來源與建置結果，只有網頁建置過期時自動重建（需要 npm 套件，會先 `npm ci`）；其他缺項由卡片下方的「安裝全部」處理。
- 同一個專案重複啟動會重新檢查並開啟既有工作台，不會自動安裝缺項；預設 4173 已被其他程式使用時，會選擇另一個可用埠，不停止其他程式。

第一版目標是 macOS 14+ Apple Silicon 與 Windows x64；Intel Mac、Windows ARM、Linux 暫不承諾支援。Windows 入口尚未在真實 Windows 機器上做完整端到端驗收，不能把本機 Mac 測試當成 Windows 驗收。

### 啟動清單與元件說明

十項檢查包含 Node.js／npm、Python、Presidio、PyTorch、Transformers、Hugging Face Hub、CKIP 中文模型、中文分詞器、網頁元件與真實辨識測試。缺少某項時，其餘可獨立檢查的項目仍會完成；相依項目顯示「尚無法檢查」。

首頁把十項顯示為卡片，逐張揭露（每張至少 1 秒），通過的卡片轉綠；十張全綠後背景模糊、中央浮出「開始」。安裝後重新檢查，只有十項全部通過才能開始。

### 開發模式

執行 `npm run dev` 使用同一套逐項檢查與專案專用 Python 環境；通過後以 Vite 提供介面熱更新。前端為 React + Tailwind + Motion，但為了維持 CSP `script-src 'self'` 不使用 `@vitejs/plugin-react`，因此 `.tsx` 修改會整頁重載而非 Fast Refresh。一般模式與開發模式共用啟動器；切換模式前先停止舊啟動視窗。

`npm run dev:ui` 僅供靜態介面開發與受控測試。它不提供完整環境檢查 API，因此不作為一般工作台的啟動入口。一般使用直接執行啟動檔或 `npm start`。


## 範例提案

`frontend/public/examples/範例提案.md` 是努法有限公司向「青嶼市青年發展局」提出的青年 AI 實作培力計畫提案書，按下入口下方的「模擬測試」即可載入。青嶼市青年發展局為虛構機關；人名、電話、電子郵件、統一編號、身分證字號、地址與數字均為合成資料，不代表正式提案、報價或合作。明確標示「統一編號」等欄位的數字也會列為疑似資料，並非檢核其登記有效性。

可先點擊一處「努法有限公司」，觀察整份同名文字一起遮罩，再切換原始碼、直接修改內容、匯出、重新拖入檔案，觀察哪些位置有改變。

## 資料如何流動

```text
本機 .md
  → 瀏覽器記憶體
  → 同一台電腦的 Python 辨識器
  → 疑似個資的位置與類型
  → 點擊選擇遮罩
  → 從原始 Markdown 產生下載檔案
```

- 僅處理單一 UTF-8 `.md` 檔案，最大 2 MiB；本階段單次辨識最多 30,000 Unicode 字元、1,200 個候選區間，超出時拒絕而不截斷。
- 文件只傳到同一台電腦的 Python 服務，不傳至雲端。
- 不存入 localStorage、資料庫或應用程式日誌；服務沒有文件儲存 API。
- 清除／關閉／重新整理後，前端不保留文件。取消辨識會停止前端等待；已送出的本機模型運算可能仍完成，但不會回填已關閉的文件。
- 伺服器僅綁定 127.0.0.1；一般模式透過本機 Node.js 啟動器轉送 API（開發模式使用 Vite），檢查 Host、Origin、JSON 與自訂標頭，不開放 CORS。
- 預覽不執行原始 HTML、不自動載入圖片，也不提供外部連結跳轉。
- 原文與 tooltip 仍存在本機分頁記憶體；畫面遮罩不是加密。匯出只帶出選定的文字版本。

## 辨識範圍與限制

- CKIP 中文 NER：人名、組織與地點。預設不標記日期。只採用模型完整閉合（B…E 或 S）的實體，避免「新北青年」被截成「新北青」之類的片段。
- 台灣直轄市／縣市名稱清單：補上模型漏掉的地名（例如「新北青年」裡的「新北」），與模型結果重疊時以模型為準。
- Presidio 自訂規則：臺灣手機／市話、身分證、統編與電子郵件。
- 明確欄位補充：例如提案窗口、姓名、公司名稱與統編；能補充模型不熟悉的測試人名。
- 固定大小重疊分塊避免長段落超出模型上限；標記位置統一轉成 UTF-16，與瀏覽器字串對齊。
- 公司簡稱、罕見姓名、跨 Markdown 格式的名稱與其他語言可能漏判或誤判。一般日期、預算與所有個資種類不在完整覆蓋承諾內。
- 自動辨識是人工覆核的輔助。請在分享前檢查全文及未選取的候選項目。

## 檔案結構

```text
frontend/
  index.html             React 掛載點與 CSP
  tokens.css             設計 token（色彩、圓角、陰影、緩動、時長）
  style.css              全域樣式、閱讀版面、標記與遮罩、動效 keyframes
  runtime-status.js      isReady 判定與狀態文字
  document.js            檔案驗證與安全 Markdown 渲染
  deid.js                API、區間驗證、單處／全文遮罩切換
  entity-matches.js      從已辨識文字補找相同標籤
  soundtrack.js          配音時序與取消
  src/main.tsx           React 進入點、配音播放器、MotionConfig
  src/App.tsx            畫面組裝
  src/hooks/useWorkbench.ts   狀態機：啟動檢查輪詢、開檔、拖曳、關閉、匯出
  src/hooks/usePiiMarks.ts    標記點擊與原文提示（事件委派）
  src/components/        StartScreen、BootChecklist、Reader、CategoryPanel、LightningToggle、CloseDialog 等
  src/components/ui/     shadcn（Base UI）：alert、tooltip
  src/components/smoothui/    Smooth UI：animated-toggle、stagger-from-edges、animated-file-upload（改寫）；AI Loader 改為 style.css 手寫
  src/styles/app.css     Tailwind 進入點與 token 對映
  public/audio/          七個原始 WAV
  public/examples/       範例提案（模擬測試載入）
backend/
  server.py              本機 HTTP API
  analyzer.py            組合辨識器
  ckip.py                本機中文模型與重疊分塊
  entities.py            BIES 序列、重疊區間、UTF-16 位置
  fields.py              明確欄位補充
  tw_recognizers.py       既有臺灣格式規則
  requirements.txt       Python 主要依賴版本
  tests/                 不需模型的後端單元與 HTTP 測試
scripts/                 首次安裝、跨平台啟動、開發啟動器與模型下載
start.command            Mac 入口
start.bat                Windows 入口
tests/                  瀏覽器回歸與真實模型驗收
```

## 驗證

```sh
npm test
npm run test:setup
npm run test:backend
npm run build
npm run test:live
npm audit
.venv/bin/python -m pip check
```

瀏覽器測試需要已安裝 Google Chrome（一般使用不強制 Chrome）。`npm run test:backend` 使用 PATH 中的 Python；若只透過一鍵安裝準備環境，Mac 改用 `.runtime/venv/bin/python -m unittest discover -s backend/tests -v`，Windows 改用 `.runtime\venv\Scripts\python.exe -m unittest discover -s backend/tests -v`。

- `npm run test:setup`：Node.js 安裝流程、校驗、重試、啟動鎖與 API 邊界測試。
- `npm test`：使用可控制的 API 回應，測試介面與遮罩邏輯，包括錯誤、BOM／CRLF、emoji、鍵盤、取消、安全預覽及受控時鐘配音排程。
- `npm run test:backend`：測試 BIES 合併、區間、欄位補充、請求驗證與服務忙碌情境，不載入模型。
- `npm run test:live`：**真實 Python 模型**與打包後網頁，完整檢查政府提案辨識、hover、點擊、下載及重新開檔；另驗證七個 WAV 在瀏覽器解碼與真實播放流程。會啟動或沿用 4173 的本機服務，不使用模擬 API。

## 模型與技術來源

- [Microsoft Presidio](https://microsoft.github.io/presidio/)
- [CKIP 中文 NER 模型](https://huggingface.co/ckiplab/bert-base-chinese-ner)：模型卡標示 GPL-3.0。本專案不包含也不散布模型權重，由使用者第一次啟動時自行從 Hugging Face 下載到本機；若你要把模型權重連同程式打包再散布，須依 GPL-3.0 處理。
- [markdown-it](https://github.com/markdown-it/markdown-it)
- [DOMPurify](https://github.com/cure53/DOMPurify)

第三方元件與模型來源見 `THIRD_PARTY_NOTICES.md`。
