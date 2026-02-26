# VocabMaster 缺陷修复记录

> 记录时间：2026-02-26  
> 涉及版本：v1.0.0  
> 平台：macOS (Electron)

---

## 缺陷 1：生产版本主窗口空白

### 缺陷描述

通过 DMG 安装 VocabMaster 后，任务栏点击弹出的小组件窗口（Widget）能正常显示和使用，但点击"打开 VocabMaster"打开主程序窗口时，窗口仅显示深色背景 (`#0f0f23`)，无任何 UI 内容。

### 复现方式

1. 执行 `npm run electron:build` 生成 DMG
2. 安装 DMG 并启动应用
3. 点击任务栏图标，弹出 Widget（正常显示）
4. 点击 Widget 中的"打开 VocabMaster"按钮
5. 主窗口弹出，但内容完全空白

### 问题根源分析

**根本原因：`electron-builder` 未将 Vite 构建产物 `dist/` 目录打包进应用。**

通过 `npx asar list` 检查 `app.asar` 发现其内容仅包含：

```
/electron/main.cjs
/electron/preload.cjs
/electron/widget.html
/package.json
```

完全不包含 `dist/` 目录（Vite 构建的 `index.html` 和 `assets/`）。

原因链条：
1. `.gitignore` 中包含 `dist/`（作为构建输出不纳入版本控制）
2. `electron-builder` 在打包时**遵循 `.gitignore` 进行文件过滤**
3. 尽管 `package.json` 的 `build.files` 数组中已列出 `"dist/**/*"`，但由于 `.gitignore` 的优先级更高，`dist/` 仍被排除
4. 主窗口尝试加载 `dist/index.html` 时文件不存在，导致空白

**辅助因素**：Vite 构建产物中的 `<script>` 标签包含了 `crossorigin` 和 `type="module"` 属性——即使文件正常打包，这些属性也会在 `file://` 协议下因 CORS 限制导致 JS 加载失败。

### 解决方案

#### 方案 1：使用 `extraResources` 替代 asar 内嵌（主要修复）

在 `package.json` 中添加 `extraResources` 配置，将 `dist/` 目录复制到应用包的 `Resources/` 目录下（位于 asar 之外）：

```json
"extraResources": [{
  "from": "dist",
  "to": "dist",
  "filter": ["**/*"]
}]
```

同时更新 `electron/main.cjs` 中的路径解析：

```diff
- mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
+ mainWindow.loadFile(path.join(process.resourcesPath, 'dist', 'index.html'));
```

#### 方案 2：Vite 自定义插件去除不兼容属性（辅助修复）

在 `vite.config.js` 中添加自定义插件，移除构建产物中的 `crossorigin` 和 `type="module"` 属性：

```js
plugins: [{
  name: 'remove-crossorigin',
  enforce: 'post',
  transformIndexHtml(html) {
    return html
      .replace(/ crossorigin/g, '')
      .replace(/ type="module"/g, '');
  },
}]
```

同时将输出格式从 ES Module 改为 IIFE，避免模块加载问题：

```js
build: {
  rollupOptions: { output: { format: 'iife' } },
  modulePreload: { polyfill: false },
}
```

### 涉及文件

| 文件 | 修改类型 |
|------|----------|
| `package.json` | 添加 `extraResources` 配置 |
| `electron/main.cjs` | 更新生产环境文件加载路径 |
| `vite.config.js` | 添加自定义插件和 IIFE 输出 |
| `.gitignore` | 移除 `dist/`，添加 `release/` |

### 相关 Commit

- `93e9163` fix: production build main window blank - strip crossorigin/module attrs for file:// protocol
- `d31a777` fix: include dist/ in packaged app via extraResources, update production file path

---

## 缺陷 2：Release 大文件导致 Git Push 失败

### 缺陷描述

执行 `git push` 时失败，报错 `HTTP 400`，因为 `release/` 目录中包含完整的 Electron 应用包（~278MB），超出 GitHub 的推送限制。

### 复现方式

1. 执行 `npm run electron:build`，生成 `release/` 目录
2. `git add -A && git commit` （将 release/ 纳入版本控制）
3. `git push` → 失败：`error: RPC failed; HTTP 400`

### 问题根源分析

`.gitignore` 中未包含 `release/` 目录，导致 electron-builder 的构建产物（DMG、unpacked app 等约 278MB 的二进制文件）被纳入 Git 版本控制。

### 解决方案

1. 将 `release/` 添加到 `.gitignore`
2. 使用 `git rm -r --cached release/` 移除已追踪的文件
3. 使用 `git filter-branch` 清理历史中的大文件
4. 执行 `git push --force` 推送清理后的仓库

### 涉及文件

| 文件 | 修改类型 |
|------|----------|
| `.gitignore` | 添加 `release/` |

### 相关 Commit

- `fbfa997` chore: add release/ to gitignore, remove large binaries from tracking

---

## 缺陷 3：英语发音质量差（声音嘶哑）

### 缺陷描述

点击发音按钮播放英语单词发音时，声音听起来"嘶哑"、机械感强，发音质量低。

### 复现方式

1. 在查词页面搜索任意英文单词
2. 点击发音按钮 🔊
3. 听到的发音质量低、声音嘶哑
4. 在复习模式的闪卡中点击发音按钮，效果更差

### 问题根源分析

1. **TTS 回退策略不足**：原代码仅有 2 层发音策略——Free Dictionary API 的真人音频（很多单词没有）和浏览器内置 Web Speech API。Web Speech API 在 Electron 中的默认语音质量较低，导致嘶哑效果。

2. **Web Speech API 未做声音选择**：未尝试选择高质量声音，直接使用系统默认的低质量语音。

3. **复习闪卡发音按钮未传递 `audioUrl`**：即使单词在数据库中存储了 Free Dictionary API 的真人音频 URL，闪卡的发音按钮也不会使用它，永远回退到低质量 TTS：

   ```js
   // 修复前：无 audioUrl 参数
   if (word) playPronunciation(word);
   
   // 修复后：传递存储的 audioUrl
   const audioUrl = document.getElementById('flashcardSoundBtn').dataset.audioUrl || null;
   playPronunciation(word, 'en-US', audioUrl);
   ```

### 解决方案

#### 升级为 3 层发音策略

| 优先级 | 发音源 | 说明 |
|--------|--------|------|
| 1 | Free Dictionary API | 真人录音，最高质量 |
| 2 | Google Translate TTS | 高质量神经网络语音（新增） |
| 3 | Web Speech API | 浏览器内置 TTS，优先选择高质量声音 |

新增 Google Translate TTS 中间层：

```js
function playWithGoogleTTS(word, lang) {
    const ttsLang = lang === 'zh-CN' ? 'zh-CN' : 'en';
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${ttsLang}&client=tw-ob&q=${encodeURIComponent(word)}`;
    const audio = new Audio(url);
    audio.play().catch(() => playWithTTS(word, lang)); // 失败则回退
}
```

#### 改进 Web Speech API 声音选择

优先选择名称中包含 "Premium"、"Enhanced"、"Natural" 的高质量声音：

```js
const preferred = voices.find(v => 
    v.lang.startsWith(langPrefix) && 
    (v.name.includes('Premium') || v.name.includes('Enhanced') || v.name.includes('Natural'))
) || voices.find(v => v.lang.startsWith(langPrefix) && v.localService);
```

#### 修复复习闪卡发音

在闪卡渲染时将 `audioUrl` 存储到按钮的 `dataset` 中，发音时读取并传递：

```js
document.getElementById('flashcardSoundBtn').dataset.audioUrl = reviewQueue[index].audioUrl || '';
```

### 涉及文件

| 文件 | 修改类型 |
|------|----------|
| `src/modules/dictionary.js` | 重写发音函数，新增 Google TTS |
| `src/main.js` | 闪卡发音按钮传递 audioUrl |

### 相关 Commit

- `610e73e` feat: improve pronunciation quality - add Google TTS fallback, better voice selection, fix flashcard audio
