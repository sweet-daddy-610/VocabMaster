# 📖 VocabMaster

**英语词汇积累工具** — 中英双语词典 + 艾宾浩斯记忆曲线复习 + macOS MenuBar Widget

---

## ✨ 功能特性

- 🔍 **多层词典查询**：支持英文单词、短语、中文输入
  - 英文单词 → Free Dictionary API（主） + Wiktionary（备）
  - 英文短语 → Wiktionary REST API
  - 中文输入 → MyMemory 翻译后自动查询英文释义
- 🧠 **艾宾浩斯复习**：基于遗忘曲线的 7 级间隔复习（1→2→4→7→15→30→60 天）
- 📖 **MenuBar Widget**：macOS 任务栏常驻，有待复习词汇时显示闪卡，无待复习时显示搜索框
- 💾 **数据备份**：支持 JSON 导出/导入，防止数据丢失
- 🎨 **暗色主题**：毛玻璃质感 UI，流畅动画

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18
- **npm** ≥ 9
- **macOS** / Windows / Linux

### 1. 克隆仓库

```bash
git clone https://github.com/sweet-daddy-610/VocabMaster.git
cd VocabMaster
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动应用

#### 桌面应用模式（推荐）

Electron 桌面应用，包含 MenuBar Widget：

```bash
npm run electron:dev
```

启动后 macOS 菜单栏会出现 📖 图标：
- **左键点击** → 弹出 Widget 窗口
- **右键点击** → 菜单：打开主应用 / 退出

#### 纯浏览器模式

不需要 Electron，在浏览器中运行：

```bash
npm run dev
```

打开 http://localhost:5173 即可使用。

---

## 📦 构建安装包

将应用打包为可分发的安装程序：

```bash
# macOS (.dmg)
npm run electron:build

# Windows (.exe)
npm run electron:build:win

# Linux (.AppImage)
npm run electron:build:linux
```

构建产物在 `release/` 目录中。

---

## 📁 项目结构

```
VocabMaster/
├── electron/                # Electron 主进程
│   ├── main.cjs             # 托盘图标 + 窗口管理 + IPC
│   ├── preload.cjs          # 安全 IPC 桥接
│   └── widget.html          # Widget 页面（生产模式用）
├── public/
│   └── widget.html          # Widget 页面（开发模式用，Vite 提供）
├── src/
│   ├── main.js              # 应用入口，事件绑定
│   ├── modules/
│   │   ├── dictionary.js    # 多层词典查询逻辑
│   │   ├── storage.js       # IndexedDB 数据持久化
│   │   ├── ebbinghaus.js    # 艾宾浩斯间隔复习算法
│   │   ├── notification.js  # 浏览器通知
│   │   └── ui.js            # DOM 操作 & 渲染
│   └── styles/
│       ├── index.css         # 全局样式 & 设计系统
│       ├── dictionary.css    # 词典页样式
│       ├── history.css       # 词汇本样式
│       └── review.css        # 复习页样式
├── index.html               # 主页面
├── package.json
└── vite.config.js
```

---

## 🔧 技术栈

| 技术 | 用途 |
|------|------|
| **Vite** | 前端构建工具 |
| **Vanilla JS** | 无框架依赖，原生 JavaScript |
| **Electron** | 桌面应用壳 + MenuBar Widget |
| **IndexedDB** | 浏览器内置数据库，本地持久化 |
| **Free Dictionary API** | 英文单词释义 |
| **Wiktionary REST API** | 英文短语释义 |
| **MyMemory API** | 中英翻译 |

---

## 📝 使用说明

### 查词
在搜索框输入英文单词、英文短语或中文，按回车或点击搜索按钮获取释义。查词结果自动保存到词汇本。

### 词汇本
查看已收录的所有词汇，支持搜索、排序（按时间/字母/熟练度）。提供 **导出备份** 和 **导入备份** 功能。

### 复习
基于艾宾浩斯遗忘曲线，在最佳时间点提示复习。点击闪卡查看释义，选择"记住了"或"忘记了"：
- ✅ 记住 → 等级提升，下次间隔延长
- ❌ 忘记 → 等级重置为 0，重新开始

### MenuBar Widget
macOS 菜单栏常驻图标，有待复习词汇时自动显示闪卡复习界面，无待复习时显示快捷搜索框。

---

## 📄 License

MIT
