import React, { useState } from 'react';
import styles from './AudioEditor.module.css';

const AudioEditor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0); // 進度狀態，暫時未使用
  const [processedFilePath, setProcessedFilePath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setProcessedFilePath(null);
      setErrorMessage(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setProcessedFilePath(null);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('video', file); // 後端需要 'video' 這個 key

    try {
      const response = await fetch('http://localhost:3000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`伺服器錯誤 (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log('處理結果:', result);
      setProcessedFilePath(result.processedFilePath);
      setProgress(100); // 標記完成

    } catch (error) {
      console.error('處理失敗:', error);
      setErrorMessage(error instanceof Error ? error.message : '發生未知錯誤');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={styles.audioEditor}>
      <h1>WellCut 影片自動剪輯</h1>

      <div className={styles.fileInput}>
        <input
          type="file"
          accept="video/*" // 只接受影片檔案
          onChange={handleFileChange}
          disabled={isProcessing}
        />
      </div>

      {errorMessage && (
        <div className={styles.errorMessage} style={{ color: 'red', marginTop: '10px' }}>
          錯誤: {errorMessage}
        </div>
      )}

      {file && (
        <div className={styles.controls}>
          <p>已選擇檔案: {file.name}</p>
          <button
            onClick={handleProcess}
            disabled={isProcessing}
            className={styles.processButton}
          >
            {isProcessing ? '處理中...' : '開始剪輯'}
          </button>

          {isProcessing && (
            <div className={styles.progressBar}>
              <div
                className={styles.progress}
                // 實際進度需要後端支持，暫時顯示為處理中
                style={{ width: isProcessing ? '50%' : `${progress}%`, transition: 'none' }}
              ></div>
              <span>處理中，請稍候...</span>
            </div>
          )}
        </div>
      )}

      {processedFilePath && !isProcessing && (
        <div className={styles.result} style={{ marginTop: '20px' }}>
          <h3>處理完成！</h3>
          <p>剪輯後的影片已保存至伺服器路徑: {processedFilePath}</p>
          {/* 實際應用中，這裡應該提供下載鏈接或預覽 */}
          {/* <a href={`http://localhost:3000/download/${encodeURIComponent(path.basename(processedFilePath))}`} download>下載檔案</a> */}
        </div>
      )}
    </div>
  );
};

export default AudioEditor;
