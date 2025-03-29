import { useState, useRef, useEffect, useCallback } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { AudioProcessingReport, analyzeAudioFeatures, batchProcessAudioClips, detectVoiceThreshold, processAudioClip, createPreviewBuffer, EqualizerBand, DEFAULT_EQUALIZER_BANDS } from './audioProcessor';
import { WaveformVisualizer } from './components/WaveformVisualizer';

// 支持的音頻格式
const EXPORT_FORMATS = [
  { value: 'wav', label: 'WAV (無損音質)' },
  { value: 'mp3', label: 'MP3 (較小體積)' },
  { value: 'ogg', label: 'OGG (Vorbis 編碼)' },
  { value: 'flac', label: 'FLAC (無損壓縮)' },
  { value: 'm4a', label: 'M4A (AAC 編碼)' }
];

// 預設分析模式
const ANALYSIS_PRESETS = [
  { name: '語音模式', threshold: -40, minDuration: 0.5 },
  { name: '音樂模式', threshold: -60, minDuration: 1.0 },
  { name: '精確模式', threshold: -30, minDuration: 0.2 },
  { name: '自定義', threshold: -50, minDuration: 0.5 }
];

// 添加處理配置類型定義
interface ProcessingPreset {
  name: string;
  silenceThreshold: number;
  minSilenceDuration: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  noiseReduction: boolean;
  normalizeVolume: boolean;
}

// 快捷鍵指南組件
const KeyboardShortcutsGuide = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: '空格', description: '播放/暫停' },
    { key: 'S', description: '停止播放' },
    { key: 'L', description: '切換循環模式' },
    { key: 'P', description: '播放選中區域' },
    { key: '←/→', description: '後退/前進 5 秒' },
    { key: 'Ctrl + +', description: '放大波形' },
    { key: 'Ctrl + -', description: '縮小波形' },
    { key: 'Ctrl + 0', description: '重置波形縮放' },
  ];

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h3>鍵盤快捷鍵</h3>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        <div className="shortcuts-content">
          <table className="shortcuts-table">
            <thead>
              <tr>
                <th>按鍵</th>
                <th>功能</th>
              </tr>
            </thead>
            <tbody>
              {shortcuts.map((shortcut, index) => (
                <tr key={index}>
                  <td><kbd>{shortcut.key}</kbd></td>
                  <td>{shortcut.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// 進度顯示組件
const ProgressIndicator = ({ 
  current, 
  total, 
  isOpen, 
  onClose,
  processingStatus
}: { 
  current: number, 
  total: number,
  isOpen: boolean, 
  onClose: () => void,
  processingStatus: string
}) => {
  if (!isOpen) return null;
  
  const progressPercent = Math.round((current / total) * 100);
  
  return (
    <div className="progress-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="progress-modal">
        <div className="progress-header">
          <h3>批次處理進度</h3>
        </div>
        <div className="progress-content">
          <div className="progress-status">
            <span>{processingStatus}</span>
            <span>{current} / {total} ({progressPercent}%)</span>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <p className="progress-message">請勿關閉視窗，處理完成後將自動下載所有檔案</p>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [count, setCount] = useState(0)
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<{start: number, end: number} | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [exportFormat, setExportFormat] = useState('wav');
  const [silenceThreshold, setSilenceThreshold] = useState(-50);
  const [minSilenceDuration, setMinSilenceDuration] = useState(0.5);
  const [selectedSilence, setSelectedSilence] = useState<number | null>(null);
  const [fadeInDuration, setFadeInDuration] = useState(0.2);
  const [fadeOutDuration, setFadeOutDuration] = useState(0.2);
  const [enableFadeEffects, setEnableFadeEffects] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<string>(ANALYSIS_PRESETS[3].name);
  const [enableNoiseReduction, setEnableNoiseReduction] = useState(false);
  const [noiseReductionAmount, setNoiseReductionAmount] = useState(0.3);
  const [enableNormalization, setEnableNormalization] = useState(false);
  const [normalizationTarget, setNormalizationTarget] = useState(-3);
  const [showShortcutsGuide, setShowShortcutsGuide] = useState(false);
  const [showProgressIndicator, setShowProgressIndicator] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [processingStatus, setProcessingStatus] = useState('準備中...');
  const [processingReport, setProcessingReport] = useState<AudioProcessingReport | null>(null);
  const [showProcessingReport, setShowProcessingReport] = useState(false);
  const [presets, setPresets] = useState<ProcessingPreset[]>(() => {
    const savedPresets = localStorage.getItem('wellcut-presets');
    return savedPresets ? JSON.parse(savedPresets) : [
      {
        name: '默認設置',
        silenceThreshold: -45,
        minSilenceDuration: 0.5,
        fadeInDuration: 0.1,
        fadeOutDuration: 0.1,
        noiseReduction: false,
        normalizeVolume: false
      }
    ];
  });
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [batchUploadModalOpen, setBatchUploadModalOpen] = useState<boolean>(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [exportQuality, setExportQuality] = useState<number>(0.8); // 默認音質設置為 0.8（高音質）
  const [previewAudioBuffer, setPreviewAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [isPreviewProcessing, setIsPreviewProcessing] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState<number>(0);
  const [equalizerBands, setEqualizerBands] = useState<EqualizerBand[]>(DEFAULT_EQUALIZER_BANDS);
  const [showEqualizer, setShowEqualizer] = useState(false);

  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setAudioFile(file);
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      
      audioContext.decodeAudioData(arrayBuffer, (buffer) => {
        setAudioBuffer(buffer);
        const features = analyzeAudioFeatures(buffer, silenceThreshold);
        const thresholdResult = detectVoiceThreshold(buffer, minSilenceDuration, silenceThreshold);
        
        setAnalysisResult({
          duration: buffer.duration,
          sampleRate: buffer.sampleRate,
          ...features,
          thresholds: thresholdResult.thresholds,
          silenceSegments: thresholdResult.silenceSegments
        });

        // 提取波形数据用于可视化
        const channelData = buffer.getChannelData(0);
        setWaveformData(Array.from(channelData));
      });
    } catch (error) {
      setErrorMessage(`文件處理失敗: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    if (!audioBuffer || !previewAudioRef.current) return;

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      const startTime = previewAudioRef.current.currentTime;
      const endTime = startTime + (previewAudioRef.current.duration - startTime);

      const audioBlob = await processAudioClip(
        startTime,
        endTime,
        audioBuffer,
        exportFormat,
        {
          fadeIn: fadeInDuration,
          fadeOut: fadeOutDuration,
          noiseReduction: enableNoiseReduction ? noiseReductionAmount : 0,
          normalize: enableNormalization,
          normalizeTarget: normalizationTarget,
          quality: exportQuality,
          equalizerBands: equalizerBands
        }
      );

      const url = URL.createObjectURL(audioBlob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `clip_${Date.now()}.${exportFormat}`;
      a.click();
    } catch (error) {
      console.error('導出失敗:', error);
      setErrorMessage('導出失敗，請重試');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReanalyze = async () => {
    if (!audioBuffer) return;
    
    try {
      setIsProcessing(true);
      
      // 重新分析音頻文件
      const features = analyzeAudioFeatures(audioBuffer, silenceThreshold);
      const thresholdResult = detectVoiceThreshold(audioBuffer, minSilenceDuration, silenceThreshold);
      
      setAnalysisResult({
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        ...features,
        thresholds: thresholdResult.thresholds,
        silenceSegments: thresholdResult.silenceSegments
      });
    } catch (error) {
      setErrorMessage(`分析失敗: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 批次處理進度回調
  const handleProcessingProgress = (current: number, total: number) => {
    setProcessingProgress({ current, total });
    setProcessingStatus(`處理片段 ${current + 1}/${total}`);
  };

  // 從檢測到的靜音部分擷取有聲音的片段
  const handleExtractContentClips = async () => {
    if (!audioBuffer || !analysisResult || !analysisResult.silenceSegments || analysisResult.silenceSegments.length === 0) {
      setErrorMessage('沒有檢測到靜音片段，無法生成內容剪輯');
      return;
    }
    
    try {
      const totalDuration = audioBuffer.duration;
      const silences = analysisResult.silenceSegments;
      const contentClips: { start: number; end: number }[] = [];
      
      // 如果第一個靜音不從0開始，添加開始到第一個靜音的片段
      if (silences[0].start > 0) {
        contentClips.push({ start: 0, end: silences[0].start });
      }
      
      // 添加靜音之間的內容片段
      for (let i = 0; i < silences.length - 1; i++) {
        contentClips.push({
          start: silences[i].end,
          end: silences[i + 1].start
        });
      }
      
      // 如果最後一個靜音不到結尾，添加最後一個片段
      if (silences[silences.length - 1].end < totalDuration) {
        contentClips.push({
          start: silences[silences.length - 1].end,
          end: totalDuration
        });
      }
      
      // 移除太短的片段（小於1秒的片段）
      const filteredClips = contentClips.filter(clip => (clip.end - clip.start) >= 1);
      
      if (filteredClips.length === 0) {
        setErrorMessage('沒有找到有效的音頻片段 (長度 >= 1秒)');
        return;
      }
      
      // 顯示進度條
      setProcessingProgress({ current: 0, total: filteredClips.length });
      setProcessingStatus('準備中...');
      setShowProgressIndicator(true);
      setIsProcessing(true);
      
      // 設置音頻處理選項
      const processingOptions = {
        // 淡入淡出
        fadeIn: enableFadeEffects ? fadeInDuration : 0,
        fadeOut: enableFadeEffects ? fadeOutDuration : 0,
        
        // 降噪
        noiseReduction: enableNoiseReduction ? noiseReductionAmount : 0,
        
        // 標準化
        normalize: enableNormalization,
        normalizeTarget: normalizationTarget,
        
        // 音質設置
        quality: exportQuality
      };
      
      // 使用批次處理接口
      const { blobs, report } = await batchProcessAudioClips(
        filteredClips,
        audioBuffer,
        exportFormat,
        processingOptions,
        handleProcessingProgress
      );
      
      // 保存處理報告
      setProcessingReport(report);
      
      // 更新狀態為「完成」，並準備下載
      setProcessingStatus('批次處理完成，準備下載...');
      setProcessingProgress({ current: filteredClips.length, total: filteredClips.length });
      
      // 延遲一下，讓用戶看到100%的進度
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 下載所有處理好的文件
      for (let i = 0; i < blobs.length; i++) {
        const url = URL.createObjectURL(blobs[i]);
        const a = document.createElement('a');
        a.href = url;
        a.download = `content_clip_${i + 1}.${exportFormat}`;
        a.click();
        
        // 每次下載之間加入短暫延遲
        if (i < blobs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // 釋放 URL 對象
        URL.revokeObjectURL(url);
      }
      
      // 顯示處理報告（可選，後面實現）
      if (report.totalClips > 0) {
        setShowProcessingReport(true);
      }
      
      setErrorMessage(`成功處理並下載 ${filteredClips.length} 個內容片段`);
    } catch (error) {
      setErrorMessage(`批次處理失敗: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setShowProgressIndicator(false);
    }
  };

  const handleSilenceClick = (index: number) => {
    if (!analysisResult || !analysisResult.silenceSegments) return;
    const silence = analysisResult.silenceSegments[index];
    if (silence) {
      setSelectedRegion(silence);
      setSelectedSilence(index);
    }
  };

  const handlePresetChange = (presetIndex: number) => {
    const preset = ANALYSIS_PRESETS[presetIndex];
    // 清除舊的自定義預設選擇
    const existingPresetNames = presets.map(p => p.name);
    if (!existingPresetNames.includes(preset.name)) {
      setSelectedPreset(ANALYSIS_PRESETS[3].name); // 切換到自定義模式
    } else {
      setSelectedPreset(preset.name);
    }
    setSilenceThreshold(preset.threshold);
    setMinSilenceDuration(preset.minDuration);
  };

  // 確保在預設變更時更新設置
  useEffect(() => {
    if (selectedPreset) {
      loadPreset(selectedPreset);
    }
  }, [selectedPreset]);
  
  // 刪除預設設置
  const deletePreset = (presetName: string) => {
    if (presets.length <= 1) {
      alert('至少保留一個預設設置');
      return;
    }
    
    const updatedPresets = presets.filter(p => p.name !== presetName);
    setPresets(updatedPresets);
    
    if (selectedPreset === presetName) {
      setSelectedPreset(ANALYSIS_PRESETS[0].name);
    }
    
    // 更新本地存儲
    localStorage.setItem('wellcut-presets', JSON.stringify(updatedPresets));
  };
  
  const saveCurrentAsPreset = () => {
    if (!newPresetName.trim()) return;
    
    // 檢查名稱是否已存在
    if (presets.some(p => p.name === newPresetName) || 
        ANALYSIS_PRESETS.some(p => p.name === newPresetName)) {
      alert('預設名稱已存在，請使用不同的名稱');
      return;
    }
    
    const newPreset: ProcessingPreset = {
      name: newPresetName,
      silenceThreshold,
      minSilenceDuration,
      fadeInDuration,
      fadeOutDuration,
      noiseReduction: enableNoiseReduction,
      normalizeVolume: enableNormalization
    };
    
    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    setSelectedPreset(newPresetName);
    setNewPresetName('');
    setPresetModalOpen(false);
    
    // 保存到本地存儲
    localStorage.setItem('wellcut-presets', JSON.stringify(updatedPresets));
  };

  // 加載預設設置時的額外處理
  const loadPreset = (presetName: string) => {
    // 檢查是否是內置預設
    const builtInPreset = ANALYSIS_PRESETS.find(p => p.name === presetName);
    if (builtInPreset) {
      setSilenceThreshold(builtInPreset.threshold);
      setMinSilenceDuration(builtInPreset.minDuration);
      return;
    }
    
    // 自定義用戶預設
    const preset = presets.find(p => p.name === presetName);
    if (!preset) return;
    
    setSilenceThreshold(preset.silenceThreshold);
    setMinSilenceDuration(preset.minSilenceDuration);
    setFadeInDuration(preset.fadeInDuration);
    setFadeOutDuration(preset.fadeOutDuration);
    setEnableNoiseReduction(preset.noiseReduction);
    setEnableNormalization(preset.normalizeVolume);
  };

  // 處理音頻效果預覽
  const handlePreviewWithEffects = async () => {
    if (!audioBuffer || !previewAudioRef.current) return;

    try {
      setIsPreviewProcessing(true);
      const startTime = previewAudioRef.current.currentTime;
      const endTime = startTime + (previewAudioRef.current.duration - startTime);

      const previewBuffer = await createPreviewBuffer(
        audioBuffer,
        startTime,
        endTime,
        {
          fadeIn: fadeInDuration,
          fadeOut: fadeOutDuration,
          noiseReduction: enableNoiseReduction ? noiseReductionAmount : 0,
          normalize: enableNormalization,
          normalizeTarget: normalizationTarget,
          equalizerBands: equalizerBands
        }
      );

      // 保存預覽音頻緩衝區
      setPreviewAudioBuffer(previewBuffer);
      
      // 將AudioBuffer轉換為可播放的blob URL
      const audioContext = new AudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = previewBuffer;
      
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      
      // 創建MediaRecorder來捕獲音頻流
      const mediaRecorder = new MediaRecorder(destination.stream);
      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        
        // 清理之前的URL
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        
        if (previewAudioRef.current) {
          previewAudioRef.current.src = url;
          previewAudioRef.current.play()
            .then(() => setIsPreviewPlaying(true))
            .catch(error => setErrorMessage(`播放預覽失敗: ${error.message}`));
        }
        
        setIsPreviewProcessing(false);
      };
      
      // 開始錄製
      mediaRecorder.start();
      
      // 播放音頻
      source.start(0);
      
      // 在音頻持續時間後停止錄製
      setTimeout(() => {
        mediaRecorder.stop();
        source.stop();
      }, previewBuffer.duration * 1000);
      
    } catch (error) {
      console.error('預覽失敗:', error);
      setErrorMessage('預覽失敗，請重試');
      setIsPreviewProcessing(false);
    }
  };
  
  // 停止預覽播放
  const stopPreviewPlayback = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setIsPreviewPlaying(false);
    }
  };
  
  // 當組件卸載時清理資源
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // 處理預覽音頻的時間更新
  const handlePreviewTimeUpdate = () => {
    if (previewAudioRef.current) {
      const progress = previewAudioRef.current.currentTime / previewAudioRef.current.duration;
      setPreviewProgress(progress);
    }
  };

  const handleEqualizerBandChange = (index: number, value: number) => {
    const newBands = [...equalizerBands];
    newBands[index] = { ...newBands[index], gain: value };
    setEqualizerBands(newBands);
  };

  const resetEqualizer = () => {
    setEqualizerBands(DEFAULT_EQUALIZER_BANDS);
  };

  const renderEqualizerPanel = () => (
    <div className="equalizer-panel">
      <div className="equalizer-header">
        <h3>均衡器</h3>
        <button onClick={resetEqualizer} className="reset-btn">
          重置
        </button>
      </div>
      <div className="equalizer-bands">
        {equalizerBands.map((band, index) => (
          <div key={band.frequency} className="equalizer-band">
            <div className="band-label">
              {band.frequency < 1000 ? `${band.frequency}Hz` : `${band.frequency/1000}kHz`}
            </div>
            <input
              type="range"
              min="-12"
              max="12"
              step="0.1"
              value={band.gain}
              onChange={(e) => handleEqualizerBandChange(index, parseFloat(e.target.value))}
              className="band-slider"
            />
            <div className="band-value">{band.gain.toFixed(1)}dB</div>
          </div>
        ))}
      </div>
    </div>
  );

  // 處理報告組件
  const ProcessingReportModal = ({ isOpen, onClose, report }: { 
    isOpen: boolean, 
    onClose: () => void, 
    report: AudioProcessingReport | null 
  }) => {
    if (!isOpen || !report) return null;
    
    // 計算統計數據
    const totalDurationFormatted = formatTime(report.totalDuration);
    const processingTimeSeconds = (report.processingTimeMs / 1000).toFixed(2);
    const averageDbValues = report.clips.map(clip => clip.avgDb);
    const avgDb = averageDbValues.reduce((sum, db) => sum + db, 0) / averageDbValues.length;
    
    return (
      <div className="report-overlay" onClick={onClose}>
        <div className="report-modal" onClick={e => e.stopPropagation()}>
          <div className="report-header">
            <h3>處理報告</h3>
            <button onClick={onClose} className="close-button">×</button>
          </div>
          <div className="report-content">
            <div className="report-summary">
              <div className="report-stat">
                <span className="report-label">處理片段數</span>
                <span className="report-value">{report.totalClips}</span>
              </div>
              <div className="report-stat">
                <span className="report-label">總處理時長</span>
                <span className="report-value">{totalDurationFormatted}</span>
              </div>
              <div className="report-stat">
                <span className="report-label">處理耗時</span>
                <span className="report-value">{processingTimeSeconds}秒</span>
              </div>
              <div className="report-stat">
                <span className="report-label">平均音量</span>
                <span className="report-value">{avgDb.toFixed(2)} dBFS</span>
              </div>
            </div>
            
            <h4>片段詳情</h4>
            <div className="report-clips-table">
              <table>
                <thead>
                  <tr>
                    <th>編號</th>
                    <th>開始時間</th>
                    <th>結束時間</th>
                    <th>時長</th>
                    <th>平均音量</th>
                    <th>峰值</th>
                  </tr>
                </thead>
                <tbody>
                  {report.clips.map((clip, index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>{formatTime(clip.startTime)}</td>
                      <td>{formatTime(clip.endTime)}</td>
                      <td>{clip.duration.toFixed(1)}秒</td>
                      <td>{clip.avgDb.toFixed(1)} dB</td>
                      <td>{clip.peakDb.toFixed(1)} dB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 處理多個檔案上傳
  const handleBatchFileUpload = (files: File[]) => {
    if (files.length === 0) return;
    
    // 如果是直接上傳單個檔案，則立即處理
    if (files.length === 1) {
      handleFileUpload(files[0]);
      return;
    }
    
    // 否則，顯示批量上傳確認對話框
    setPendingFiles(files);
    setBatchUploadModalOpen(true);
  };
  
  // 確認批量上傳
  const confirmBatchUpload = () => {
    if (pendingFiles.length === 0) return;
    
    setAudioFiles(pendingFiles);
    setCurrentFileIndex(0);
    handleFileUpload(pendingFiles[0]);
    setBatchUploadModalOpen(false);
  };
  
  // 切換到下一個檔案
  const switchToNextFile = () => {
    if (currentFileIndex < audioFiles.length - 1) {
      const nextIndex = currentFileIndex + 1;
      setCurrentFileIndex(nextIndex);
      handleFileUpload(audioFiles[nextIndex]);
    }
  };
  
  // 切換到上一個檔案
  const switchToPrevFile = () => {
    if (currentFileIndex > 0) {
      const prevIndex = currentFileIndex - 1;
      setCurrentFileIndex(prevIndex);
      handleFileUpload(audioFiles[prevIndex]);
    }
  };

  // 批量上傳確認對話框
  const BatchUploadModal = () => {
    if (!batchUploadModalOpen) return null;
    
    return (
      <div className="modal-overlay">
        <div className="batch-upload-modal">
          <h3>批量導入音頻</h3>
          <p>您選擇了 {pendingFiles.length} 個音頻檔案：</p>
          <ul className="file-list">
            {pendingFiles.map((file, index) => (
              <li key={index}>{file.name}</li>
            ))}
          </ul>
          <div className="modal-buttons">
            <button onClick={() => setBatchUploadModalOpen(false)}>取消</button>
            <button onClick={confirmBatchUpload}>確認導入</button>
          </div>
        </div>
      </div>
    );
  };

  // 處理拖放功能
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(file => 
        file.type.startsWith('audio/') || file.type.startsWith('video/')
      );
      
      if (files.length === 0) {
        setErrorMessage('請上傳音頻或視頻文件');
        return;
      }
      
      handleBatchFileUpload(files);
    }
  };

  return (
    <div className="app-container">
      {isProcessing && !showProgressIndicator && (
        <div className="processing-overlay">
          <div className="spinner"></div>
          <p>音頻分析中...</p>
        </div>
      )}
      {errorMessage && (
        <div className="error-alert">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)}>×</button>
        </div>
      )}
      
      <header className="app-header">
        <div className="header-main">
          <h1>WellCut 音頻處理工具</h1>
          <button 
            onClick={() => setShowShortcutsGuide(true)}
            className="shortcuts-button"
          >
            <span>⌨</span> 鍵盤快捷鍵
          </button>
        </div>
        
        <div className="file-navigation">
          {audioFiles.length > 1 && (
            <>
              <div className="file-nav-controls">
                <button 
                  onClick={switchToPrevFile} 
                  disabled={currentFileIndex === 0}
                  title="上一個檔案"
                >
                  ❮ 上一個
                </button>
                <span className="file-indicator">
                  {currentFileIndex + 1} / {audioFiles.length}
                </span>
                <button 
                  onClick={switchToNextFile} 
                  disabled={currentFileIndex === audioFiles.length - 1}
                  title="下一個檔案"
                >
                  下一個 ❯
                </button>
              </div>
              <div className="current-file-name">
                {audioFiles[currentFileIndex]?.name || '未選擇檔案'}
              </div>
            </>
          )}
        </div>
      </header>
      
      <div className="control-panel">
        <div 
          className={`upload-section ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label htmlFor="audio-file" className="upload-label">選擇音頻檔案</label>
        <input
          type="file"
            id="audio-file"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              handleBatchFileUpload(files);
              e.target.value = ''; // 清空輸入，允許再次選擇相同文件
            }}
          accept="audio/*,video/*"
            multiple // 允許多選
          />
          <div className="upload-hint">
            {isDragging ? 
              '釋放以上傳檔案' : 
              '支持批量選擇多個音頻檔案，或拖放檔案到此處'
            }
          </div>
        </div>
        
        {analysisResult && (
          <div className="settings" style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* 預設模式選擇 */}
            <div className="preset-selection" style={{ marginBottom: '10px' }}>
              <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>分析模式：</div>
              <div className="preset-buttons" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {ANALYSIS_PRESETS.map((preset, index) => (
                  <button
                    key={index}
                    onClick={() => handlePresetChange(index)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: selectedPreset === preset.name ? '#4F46E5' : '#E5E7EB',
                      color: selectedPreset === preset.name ? 'white' : 'black',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
            
            {/* 改進格式選擇界面 */}
            <div className="format-selection-container" style={{ marginTop: '15px', padding: '15px', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#1F2937' }}>導出格式選項</h3>
            
              <div className="format-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                {EXPORT_FORMATS.map(format => (
                  <div 
                    key={format.value}
                    className={`format-option ${exportFormat === format.value ? 'selected' : ''}`}
                    style={{
                      padding: '12px',
                      backgroundColor: exportFormat === format.value ? '#EEF2FF' : 'white',
                      border: `1px solid ${exportFormat === format.value ? '#4F46E5' : '#E5E7EB'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      position: 'relative'
                    }}
                    onClick={() => setExportFormat(format.value)}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '5px', color: exportFormat === format.value ? '#4F46E5' : '#1F2937' }}>
                      {format.value.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                      {format.label}
                    </div>
                    {exportFormat === format.value && (
                      <div style={{ position: 'absolute', top: '8px', right: '8px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#4F46E5' }}></div>
                    )}
                  </div>
                ))}
              </div>

              <div className="format-description" style={{ marginTop: '12px', fontSize: '0.85rem', color: '#4B5563' }}>
                {exportFormat === 'wav' && '無損格式，保持最高音質，適合進一步處理，但檔案較大。'}
                {exportFormat === 'mp3' && '常見的壓縮格式，適合大多數播放器，檔案較小但輕微損失音質。'}
                {exportFormat === 'ogg' && 'Vorbis 編碼的開源格式，良好的壓縮比，適合網絡傳輸。'}
                {exportFormat === 'flac' && '無損壓縮格式，完全保持音質但比 WAV 檔案更小，不受所有設備支持。'}
                {exportFormat === 'm4a' && 'AAC 編碼格式，蘋果設備原生支持，良好的音質與檔案大小平衡。'}
              </div>
              
              {/* 添加音質設置選項 */}
              {(exportFormat === 'mp3' || exportFormat === 'ogg' || exportFormat === 'm4a') && (
                <div className="quality-settings" style={{ marginTop: '15px' }}>
                  <label htmlFor="export-quality" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
                    音質設置: {getQualityLabel(exportQuality)}
                  </label>
                  <input 
                    type="range" 
                    id="export-quality" 
                    min="0.1" 
                    max="1" 
                    step="0.1"
                    value={exportQuality}
                    onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6B7280', marginTop: '5px' }}>
                    <span>檔案較小</span>
                    <span>音質較好</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="silence-settings" style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
              <label htmlFor="silence-threshold">
                靜音閾值: {silenceThreshold} dB
              </label>
              <input 
                type="range" 
                id="silence-threshold" 
                min="-80" 
                max="-20" 
                step="1"
                value={silenceThreshold}
                onChange={(e) => {
                  setSilenceThreshold(parseInt(e.target.value));
                  setSelectedPreset(ANALYSIS_PRESETS[3].name); // 切換到自定義模式
                }}
                style={{ width: '100%' }}
              />
              
              <label htmlFor="min-silence-duration">
                最小靜音持續時間: {minSilenceDuration.toFixed(1)} 秒
              </label>
              <input 
                type="range" 
                id="min-silence-duration" 
                min="0.1" 
                max="2.0" 
                step="0.1"
                value={minSilenceDuration}
                onChange={(e) => {
                  setMinSilenceDuration(parseFloat(e.target.value));
                  setSelectedPreset(ANALYSIS_PRESETS[3].name); // 切換到自定義模式
                }}
                style={{ width: '100%' }}
              />
              
              <button 
                onClick={handleReanalyze}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#4F46E5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginTop: '5px'
                }}
              >
                重新分析
              </button>
            </div>
            
            {/* 淡入淡出設置 */}
            <div className="fade-settings" style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '5px', 
              marginTop: '10px',
              padding: '10px',
              border: '1px solid #E5E7EB',
              borderRadius: '4px',
              backgroundColor: '#F9FAFB'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'bold' }}>淡入淡出效果</span>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '24px' }}>
                  <input 
                    type="checkbox" 
                    checked={enableFadeEffects}
                    onChange={(e) => setEnableFadeEffects(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span 
                    style={{ 
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: enableFadeEffects ? '#4F46E5' : '#ccc',
                      borderRadius: '24px',
                      transition: '0.4s',
                    }}
                  >
                    <span
                      style={{ 
                        position: 'absolute',
                        content: '""',
                        height: '16px',
                        width: '16px',
                        left: enableFadeEffects ? '30px' : '4px',
                        bottom: '4px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: '0.4s'
                      }}
                    />
                  </span>
                </label>
              </div>
              
              {enableFadeEffects && (
                <>
                  <label htmlFor="fade-in">
                    淡入時間: {fadeInDuration.toFixed(1)} 秒
                  </label>
                  <input 
                    type="range" 
                    id="fade-in" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={fadeInDuration}
                    onChange={(e) => setFadeInDuration(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  
                  <label htmlFor="fade-out">
                    淡出時間: {fadeOutDuration.toFixed(1)} 秒
                  </label>
                  <input 
                    type="range" 
                    id="fade-out" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={fadeOutDuration}
                    onChange={(e) => setFadeOutDuration(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </>
              )}
            </div>
            
            {/* 音頻處理選項 */}
            {renderAudioProcessingPanel()}
            
            <div className="export-actions" style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
              <button 
                onClick={handleExport}
                disabled={!selectedRegion}
                className="export-btn"
                style={{
                  padding: '8px 15px',
                  backgroundColor: !selectedRegion ? '#9CA3AF' : '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: !selectedRegion ? 'not-allowed' : 'pointer',
                  flex: 1
                }}
              >
                導出選中區域
              </button>
              
              <button 
                onClick={handleExtractContentClips}
                disabled={!analysisResult?.silenceSegments || analysisResult.silenceSegments.length === 0}
                style={{
                  padding: '8px 15px',
                  backgroundColor: (!analysisResult?.silenceSegments || analysisResult.silenceSegments.length === 0) ? '#9CA3AF' : '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (!analysisResult?.silenceSegments || analysisResult.silenceSegments.length === 0) ? 'not-allowed' : 'pointer',
                  flex: 1
                }}
              >
                批量導出有聲片段
              </button>
            </div>
          </div>
        )}
        
        <div className="section preset-section">
          <h3>用戶預設</h3>
          <div className="preset-controls">
            <select 
              value={selectedPreset} 
              onChange={(e) => setSelectedPreset(e.target.value)}
              disabled={!audioBuffer}
            >
              {ANALYSIS_PRESETS.map(preset => (
                <option key={preset.name} value={preset.name}>{preset.name}</option>
              ))}
              {presets.filter(p => !ANALYSIS_PRESETS.some(ap => ap.name === p.name)).map(preset => (
                <option key={preset.name} value={preset.name}>{preset.name}</option>
              ))}
            </select>
            <button 
              onClick={() => setPresetModalOpen(true)}
              disabled={!audioBuffer}
              title="保存當前設置為新預設"
            >
              保存為新預設
            </button>
            {presets.length > 0 && !ANALYSIS_PRESETS.some(p => p.name === selectedPreset) && (
              <button 
                onClick={() => deletePreset(selectedPreset)}
                disabled={!audioBuffer}
                title="刪除當前預設"
                className="delete-preset-btn"
              >
                刪除
              </button>
            )}
          </div>
        </div>
      </div>
      
      {audioFile && (
        <div style={{ marginTop: '20px' }}>
        <WaveformVisualizer
          audioUrl={URL.createObjectURL(audioFile)}
            onSelection={(start, end) => {
              setSelectedRegion({start, end});
              setSelectedSilence(null);
            }}
          silenceSegments={analysisResult?.silenceSegments}
        />
          
          {analysisResult && (
            <div className="audio-info" style={{ marginTop: '10px', fontSize: '0.9rem', color: '#4B5563' }}>
              <p>音頻時長: {formatTime(analysisResult.duration)}</p>
              <p>靜音段落數: {analysisResult.silenceSegments?.length || 0}</p>
              <p>採樣率: {analysisResult.sampleRate} Hz</p>
              {analysisResult.stats && (
                <>
                  <p>平均音量: {analysisResult.stats.dbFS.toFixed(2)} dBFS</p>
                  <p>峰值因子: {analysisResult.stats.crest.toFixed(2)}</p>
                </>
              )}
            </div>
          )}
          
          {analysisResult && analysisResult.silenceSegments && analysisResult.silenceSegments.length > 0 && (
            <div className="silence-list" style={{ marginTop: '20px' }}>
              <h3>檢測到的靜音段落</h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>編號</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>開始時間</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>結束時間</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>持續時間</th>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>動作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisResult.silenceSegments.map((silence: any, index: number) => (
                      <tr 
                        key={index}
                        style={{
                          backgroundColor: selectedSilence === index ? '#EFF6FF' : 'transparent',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleSilenceClick(index)}
                      >
                        <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB' }}>{index + 1}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB' }}>{formatTime(silence.start)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB' }}>{formatTime(silence.end)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB' }}>{(silence.end - silence.start).toFixed(1)}秒</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRegion(silence);
                              setSelectedSilence(index);
                            }}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#3B82F6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '0.75rem'
                            }}
                          >
                            選擇
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      
      <KeyboardShortcutsGuide 
        isOpen={showShortcutsGuide} 
        onClose={() => setShowShortcutsGuide(false)} 
      />
      
      <ProgressIndicator
        current={processingProgress.current}
        total={processingProgress.total}
        isOpen={showProgressIndicator}
        onClose={() => setShowProgressIndicator(false)}
        processingStatus={processingStatus}
      />
      
      <ProcessingReportModal
        isOpen={showProcessingReport}
        onClose={() => setShowProcessingReport(false)}
        report={processingReport}
      />
      
      {/* 預設保存模態窗 */}
      {presetModalOpen && (
        <div className="modal-overlay">
          <div className="preset-modal">
            <h3>保存為新預設</h3>
            <input
              type="text"
              placeholder="預設名稱"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
            />
            <div className="modal-buttons">
              <button onClick={() => setPresetModalOpen(false)}>取消</button>
              <button 
                onClick={saveCurrentAsPreset}
                disabled={!newPresetName.trim()}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 添加批量導入確認對話框 */}
      <BatchUploadModal />
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// 根據音質值返回描述標籤
function getQualityLabel(quality: number): string {
  if (quality >= 0.9) return '最高品質 (320kbps)';
  if (quality >= 0.7) return '高品質 (256kbps)';
  if (quality >= 0.5) return '中等品質 (192kbps)';
  if (quality >= 0.3) return '標準品質 (128kbps)';
  return '低品質 (96kbps)';
}

export default App;
