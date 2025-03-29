# WellCut - 智能影音剪輯工具

WellCut 是一個基於 Web 技術的智能音頻處理工具，專為內容創作者、播客製作人和音頻編輯人員設計。它提供了直觀的用戶界面和強大的音頻處理功能，幫助用戶快速處理音頻文件。

## 主要功能

### 音頻分析與視覺化
- 直觀的波形顯示，支持音頻選擇和區域標記
- 音頻波形縮放功能，便於精確選擇
- 時間標記，快速定位音頻位置
- 自動檢測靜音段落，輕鬆識別需要剪輯的部分
- 音頻參數分析，包括音量、峰值因子等

### 音頻處理
- 支持多種預設分析模式：語音模式、音樂模式、精確模式和自定義模式
- 音頻剪輯與導出，支持多種專業格式 (WAV, MP3, OGG, FLAC, M4A)
- 可調節音質設置，平衡音質與檔案大小
- 音頻效果預覽功能，實時聆聽效果後的音頻
- 淡入淡出效果，減少音頻剪輯中的爆音和突兀感
- 專業級降噪處理，有效去除背景噪音
- 音量標準化處理，使音頻保持一致的音量水平
- 用戶處理預設保存功能，保存常用參數設置

### 文件管理與批量處理
- 批量導入多個音頻檔案，快速切換處理
- 支持拖放操作，方便用戶快速上傳文件
- 自動提取有聲片段功能，一鍵生成多個音頻片段
- 批量處理進度實時顯示
- 詳細的處理報告，包含每個片段的音頻特性

### 互動控制
- 音頻播放/暫停/停止控制
- 區域循環播放功能
- 可調節的播放速度 (0.5x - 2.0x)
- 豐富的鍵盤快捷鍵（空格鍵播放/暫停、箭頭鍵快進/快退、縮放等）

## 技術特點
- 使用 React 和 TypeScript 開發的現代化 Web 應用
- 基於 WaveSurfer.js 的高效音頻視覺化
- 運用 Web Audio API 進行複雜的音頻處理和分析
- 響應式設計，適應不同設備和屏幕尺寸

## 開始使用

### 安裝依賴
```bash
npm install
```

### 開發模式
```bash
npm run dev
```

### 構建項目
```bash
npm run build
```

### 預覽構建結果
```bash
npm run preview
```

## 使用指南

1. **上傳音頻文件**：點擊上傳按鈕或拖放檔案到上傳區域，支持批量選擇多個音頻檔案
2. **管理多個檔案**：使用檔案導航控制切換不同的音頻檔案進行處理
3. **調整分析參數**：選擇預設模式或自定義靜音閾值和最小靜音持續時間
4. **選擇音頻段落**：通過波形直接選擇，或點擊已檢測到的靜音段落
5. **使用縮放功能**：使用縮放控制或鍵盤快捷鍵（Ctrl + +/-）放大和縮小波形，以便更精確地選擇
6. **應用處理效果**：根據需要開啟淡入淡出、降噪和音量標準化效果
7. **預覽處理效果**：使用預覽功能聆聽應用效果後的音頻，確保處理效果符合預期
8. **設置導出格式**：選擇適合的音頻格式 (WAV, MP3, OGG, FLAC, M4A) 和音質設置
9. **保存處理預設**：將常用的處理參數保存為個人預設，方便下次使用
10. **批量處理音頻**：使用批量導出功能處理多個片段，實時監控處理進度
11. **查看處理報告**：處理完成後，可查看詳細的處理報告，了解音頻特性

## 鍵盤快捷鍵

| 按鍵 | 功能 |
| --- | --- |
| 空格 | 播放/暫停 |
| S | 停止播放 |
| L | 切換循環模式 |
| P | 播放選中區域 |
| ←/→ | 後退/前進 5 秒 |
| Ctrl + + | 放大波形 |
| Ctrl + - | 縮小波形 |
| Ctrl + 0 | 重置波形縮放 |

## 版本歷史

### v1.6.0 (2024-03-29)
- 新增音頻效果預覽功能，實時聆聽處理後音頻
- 改進用戶界面和操作體驗
- 優化效果處理與預覽性能
- 修復音頻處理中的細節問題

### v1.5.0 (2024-03-28)
- 新增多種音頻導出格式 (OGG, FLAC, M4A)
- 添加音質設置控制，可根據需要調節音質
- 優化導出格式選擇界面
- 改進音頻處理流程

### v1.4.0 (2024-03-27)
- 新增批量導入音頻檔案功能
- 添加檔案拖放上傳支援
- 優化多檔案處理流程
- 改進用戶界面

### v1.3.0 (2024-03-26)
- 新增處理預設保存功能
- 優化預設載入與選擇界面
- 改進用戶交互體驗
- 修復若干小錯誤

### v1.2.0 (2024-03-25)
- 新增批次處理進度實時顯示
- 添加詳細處理報告功能
- 優化大量音頻片段處理的穩定性
- 改進用戶提示與反饋

### v1.1.0 (2024-03-24)
- 添加波形縮放功能
- 添加鍵盤快捷鍵支持
- 添加時間標記

### v1.0.0 (2024-03-24)
- 初始版本發布
- 基本音頻分析和處理功能
- 靜音檢測和區域選擇
- 音頻導出功能

## 技術依賴
- React 19.0.0
- WaveSurfer.js 7.9.1
- Web Audio API
- Vite 6.2.0
- TypeScript 5.7.2

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
