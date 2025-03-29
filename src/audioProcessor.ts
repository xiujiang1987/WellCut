// 創建一個音頻上下文用於音頻處理
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

/**
 * 檢測音頻的音量閾值並返回靜音段落
 * @param buffer 音頻緩衝區
 * @param minSilenceDuration 最小靜音持續時間（秒）
 * @param thresholdDB 靜音檢測閾值（分貝）
 * @returns 靜音段落和閾值信息
 */
export const detectVoiceThreshold = (
  buffer: AudioBuffer, 
  minSilenceDuration = 0.5,
  thresholdDB = -50
): { thresholds: number[], silenceSegments: Array<{start: number; end: number}> } => {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // 計算音頻的振幅閾值
  const amplitudes = Array.from({ length: 10 }, (_, i) => i / 10); // 生成一系列可能的振幅閾值
  
  // 檢測靜音段落 - 將閾值從分貝轉換為線性振幅
  const threshold = Math.pow(10, thresholdDB / 20);
  
  // 使用滑動窗口進行檢測以減少噪音影響
  const windowSize = Math.round(sampleRate * 0.05); // 50ms 窗口
  const segments: Array<{start: number; end: number}> = [];
  
  let inSilence = false;
  let silenceStart = 0;
  let consecutiveSilenceFrames = 0;
  let consecutiveNonSilenceFrames = 0;
  
  // 使用RMS（均方根）值來計算窗口內的平均能量
  for (let i = 0; i < channelData.length; i += windowSize) {
    const end = Math.min(i + windowSize, channelData.length);
    let sumSquared = 0;
    
    for (let j = i; j < end; j++) {
      sumSquared += channelData[j] * channelData[j];
    }
    
    const rms = Math.sqrt(sumSquared / (end - i));
    
    if (rms < threshold) {
      // 處於靜音狀態
      consecutiveSilenceFrames++;
      consecutiveNonSilenceFrames = 0;
      
      if (!inSilence && consecutiveSilenceFrames >= 2) { // 至少2個連續靜音窗口才算進入靜音
        silenceStart = (i - windowSize) / sampleRate; // 從上一個窗口開始計算靜音起點
        inSilence = true;
      }
    } else {
      // 非靜音狀態
      consecutiveNonSilenceFrames++;
      
      if (inSilence && consecutiveNonSilenceFrames >= 2) { // 至少2個連續非靜音窗口才算退出靜音
        const silenceEnd = i / sampleRate;
        if (silenceEnd - silenceStart >= minSilenceDuration) {
          segments.push({ start: silenceStart, end: silenceEnd });
        }
        inSilence = false;
        consecutiveSilenceFrames = 0;
      }
    }
  }

  // 如果檔案結束時仍在靜音中
  if (inSilence) {
    const silenceEnd = channelData.length / sampleRate;
    if (silenceEnd - silenceStart >= minSilenceDuration) {
      segments.push({ start: silenceStart, end: silenceEnd });
    }
  }

  return {
    thresholds: amplitudes,
    silenceSegments: segments
  };
};

/**
 * 分析音頻特徵
 * @param buffer 音頻緩衝區
 * @param silenceThresholdDB 靜音閾值（分貝）
 * @returns 音頻特徵數據
 */
export const analyzeAudioFeatures = (buffer: AudioBuffer, silenceThresholdDB = -50) => {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // 檢測靜音段落
  const silences = detectSilences(channelData, sampleRate, silenceThresholdDB);
  
  // 計算音頻統計信息
  const stats = calculateAudioStats(channelData);
  
  return {
    peaks: findPeaks(channelData),
    silences,
    stats
  };
};

/**
 * 計算音頻統計信息
 * @param data 音頻數據
 * @returns 音頻統計信息
 */
const calculateAudioStats = (data: Float32Array) => {
  let sum = 0;
  let sumSquared = 0;
  let max = -Infinity;
  let min = Infinity;
  
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    sum += value;
    sumSquared += value * value;
    max = Math.max(max, value);
    min = Math.min(min, value);
  }
  
  const mean = sum / data.length;
  const rms = Math.sqrt(sumSquared / data.length);
  
  // 計算分貝值
  const dbFS = 20 * Math.log10(rms);
  
  return {
    max,
    min, 
    mean,
    rms,
    dbFS,
    crest: max / rms // 峰值因子
  };
};

/**
 * 檢測音頻中的靜音段落
 * @param data 音頻數據
 * @param sampleRate 採樣率
 * @param thresholdDB 靜音閾值（分貝）
 * @returns 靜音段落的時間戳數組
 */
const detectSilences = (data: Float32Array, sampleRate: number, thresholdDB: number) => {
  const threshold = Math.pow(10, thresholdDB / 20);
  const minSilenceDuration = 0.5; // 最小靜音持續時間（秒）
  const windowSize = Math.round(sampleRate * 0.1); // 100ms窗口
  
  let currentSilenceStart = -1;
  const silences: Array<[number, number]> = [];

  for (let i = 0; i < data.length; i += windowSize) {
    const end = Math.min(i + windowSize, data.length);
    let sum = 0;
    
    for (let j = i; j < end; j++) {
      sum += data[j] * data[j]; // RMS計算
    }
    const rms = Math.sqrt(sum / (end - i));

    if (rms < threshold) {
      if (currentSilenceStart === -1) {
        currentSilenceStart = i / sampleRate;
      }
    } else {
      if (currentSilenceStart !== -1) {
        const duration = (i / sampleRate) - currentSilenceStart;
        if (duration >= minSilenceDuration) {
          silences.push([currentSilenceStart, i / sampleRate]);
        }
        currentSilenceStart = -1;
      }
    }
  }
  
  // 處理文件結尾的靜音
  if (currentSilenceStart !== -1) {
    const duration = (data.length / sampleRate) - currentSilenceStart;
    if (duration >= minSilenceDuration) {
      silences.push([currentSilenceStart, data.length / sampleRate]);
    }
  }
  
  return silences;
};

/**
 * 在音頻數據中尋找峰值
 * @param data 音頻數據
 * @returns 峰值位置的數組
 */
const findPeaks = (data: Float32Array) => {
  const minPeakHeight = 0.3;
  const minPeakDistance = 4410; // 0.1秒@44.1kHz
  const peaks: number[] = [];
  
  let lastPeakPos = -Infinity;
  
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] > data[i - 1] && 
        data[i] > data[i + 1] && 
        data[i] > minPeakHeight) {
      if (i - lastPeakPos > minPeakDistance) {
        peaks.push(i);
        lastPeakPos = i;
      }
    }
  }
  return peaks;
};

/**
 * 為音頻數據添加淡入效果
 * @param buffer 音頻緩衝區
 * @param fadeDuration 淡入持續時間（秒）
 */
const applyFadeIn = (buffer: AudioBuffer, fadeDuration: number) => {
  const sampleRate = buffer.sampleRate;
  const fadeInSamples = Math.min(Math.floor(fadeDuration * sampleRate), buffer.length);
  
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < fadeInSamples; i++) {
      // 使用線性淡入
      const gain = i / fadeInSamples;
      channelData[i] = channelData[i] * gain;
    }
  }
};

/**
 * 為音頻數據添加淡出效果
 * @param buffer 音頻緩衝區
 * @param fadeDuration 淡出持續時間（秒）
 */
const applyFadeOut = (buffer: AudioBuffer, fadeDuration: number) => {
  const sampleRate = buffer.sampleRate;
  const fadeOutSamples = Math.min(Math.floor(fadeDuration * sampleRate), buffer.length);
  const startIndex = buffer.length - fadeOutSamples;
  
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < fadeOutSamples; i++) {
      // 使用線性淡出
      const gain = 1 - (i / fadeOutSamples);
      channelData[startIndex + i] = channelData[startIndex + i] * gain;
    }
  }
};

/**
 * 應用基本的降噪處理
 * @param buffer 音頻緩衝區
 * @param noiseReductionAmount 降噪強度 (0-1之間)
 * @returns 處理後的音頻緩衝區
 */
const applyNoiseReduction = (buffer: AudioBuffer, noiseReductionAmount: number = 0.3): AudioBuffer => {
  // 創建一個新的 AudioBuffer 存放處理結果
  const processedBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  
  // 對每個聲道進行處理
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = processedBuffer.getChannelData(channel);
    
    // 計算靜音部分的噪音特性
    // 假設前0.5秒是噪音樣本（如果文件長度允許）
    const noiseSampleLength = Math.min(Math.floor(buffer.sampleRate * 0.5), buffer.length);
    let noiseSum = 0;
    for (let i = 0; i < noiseSampleLength; i++) {
      noiseSum += Math.abs(inputData[i]);
    }
    const noiseAvg = noiseSum / noiseSampleLength;
    
    // 設置門限值，低於此值的信號被視為噪音
    const threshold = noiseAvg * (1 + noiseReductionAmount * 5);
    
    // 應用閾值門限降噪
    for (let i = 0; i < inputData.length; i++) {
      const absValue = Math.abs(inputData[i]);
      if (absValue < threshold) {
        // 降低噪音，但不完全移除，以避免聲音不自然
        outputData[i] = inputData[i] * (1 - noiseReductionAmount);
      } else {
        // 保留信號，但略微平滑過渡
        const attenuationFactor = 1 - (noiseReductionAmount * 0.5);
        outputData[i] = inputData[i] * attenuationFactor;
      }
    }
  }
  
  return processedBuffer;
};

/**
 * 應用音量標準化處理
 * @param buffer 音頻緩衝區
 * @param targetDb 目標音量級別 (dBFS)
 * @returns 處理後的音頻緩衝區
 */
const applyNormalization = (buffer: AudioBuffer, targetDb: number = -3): AudioBuffer => {
  // 創建一個新的 AudioBuffer 存放處理結果
  const processedBuffer = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  
  // 找出當前音頻的最大振幅
  let maxAmplitude = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < channelData.length; i++) {
      const absValue = Math.abs(channelData[i]);
      if (absValue > maxAmplitude) {
        maxAmplitude = absValue;
      }
    }
  }
  
  // 計算當前dBFS
  const currentDbFs = 20 * Math.log10(maxAmplitude);
  
  // 計算需要的增益
  const dbGain = targetDb - currentDbFs;
  const linearGain = Math.pow(10, dbGain / 20);
  
  // 應用增益到每個樣本
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = processedBuffer.getChannelData(channel);
    
    for (let i = 0; i < inputData.length; i++) {
      outputData[i] = inputData[i] * linearGain;
      
      // 確保不會超過[-1, 1]範圍
      if (outputData[i] > 1) outputData[i] = 1;
      if (outputData[i] < -1) outputData[i] = -1;
    }
  }
  
  return processedBuffer;
};

/**
 * 均衡器頻段定義
 */
export interface EqualizerBand {
  frequency: number;  // 中心頻率
  gain: number;      // 增益值（dB）
  q: number;         // Q值（頻寬）
}

/**
 * 創建均衡器節點
 * @param context 音頻上下文
 * @param bands 均衡器頻段設置
 * @returns 均衡器節點
 */
const createEqualizer = (context: AudioContext, bands: EqualizerBand[]) => {
  const filters = bands.map(band => {
    const filter = context.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = band.frequency;
    filter.gain.value = band.gain;
    filter.Q.value = band.q;
    return filter;
  });

  // 串聯連接所有濾波器
  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }

  return {
    input: filters[0],
    output: filters[filters.length - 1],
    filters
  };
};

/**
 * 應用均衡器效果
 * @param buffer 音頻緩衝區
 * @param bands 均衡器頻段設置
 * @returns 處理後的音頻緩衝區
 */
const applyEqualizer = (buffer: AudioBuffer, bands: EqualizerBand[]): AudioBuffer => {
  const context = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const source = context.createBufferSource();
  source.buffer = buffer;

  // 創建均衡器
  const equalizer = createEqualizer(context, bands);

  // 連接音頻節點
  source.connect(equalizer.input);
  equalizer.output.connect(context.destination);

  // 開始渲染
  source.start(0);
  return context.startRendering();
};

/**
 * 預設均衡器頻段設置
 */
export const DEFAULT_EQUALIZER_BANDS: EqualizerBand[] = [
  { frequency: 60, gain: 0, q: 1 },    // 低音
  { frequency: 170, gain: 0, q: 1 },   // 低中音
  { frequency: 310, gain: 0, q: 1 },   // 中音
  { frequency: 600, gain: 0, q: 1 },   // 中高音
  { frequency: 1000, gain: 0, q: 1 },  // 高音
  { frequency: 3000, gain: 0, q: 1 },  // 超高音
  { frequency: 6000, gain: 0, q: 1 },  // 極高音
  { frequency: 12000, gain: 0, q: 1 }, // 空氣音
  { frequency: 14000, gain: 0, q: 1 }, // 亮度
  { frequency: 16000, gain: 0, q: 1 }  // 空氣感
];

/**
 * 處理音頻裁剪並返回選定格式的Blob
 * @param startTime 裁剪開始時間（秒）
 * @param endTime 裁剪結束時間（秒）
 * @param originalBuffer 原始音頻緩衝區
 * @param format 導出格式 ('wav', 'mp3', 'ogg', 'flac', 'm4a')
 * @param options 額外處理選項
 * @returns 裁剪後的音頻Blob
 */
export const processAudioClip = async (
  startTime: number, 
  endTime: number, 
  originalBuffer: AudioBuffer,
  format: string = 'wav',
  options: {
    fadeIn?: number,
    fadeOut?: number,
    noiseReduction?: number,
    normalize?: boolean,
    normalizeTarget?: number,
    quality?: number,
    equalizerBands?: EqualizerBand[] // 新增均衡器選項
  } = {}
): Promise<Blob> => {
  try {
    const context = new OfflineAudioContext(
      originalBuffer.numberOfChannels,
      Math.ceil((endTime - startTime) * originalBuffer.sampleRate),
      originalBuffer.sampleRate
    );

    const source = context.createBufferSource();
    source.buffer = originalBuffer;
    
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(1.0, 0);
    
    source.connect(gainNode);
    gainNode.connect(context.destination);
    
    source.start(0, startTime, endTime - startTime);
    
    let renderedBuffer = await context.startRendering();
    
    // 應用淡入淡出效果
    if (options.fadeIn && options.fadeIn > 0) {
      applyFadeIn(renderedBuffer, Math.min(options.fadeIn, renderedBuffer.duration / 2));
    }
    
    if (options.fadeOut && options.fadeOut > 0) {
      applyFadeOut(renderedBuffer, Math.min(options.fadeOut, renderedBuffer.duration / 2));
    }
    
    // 應用降噪處理
    if (options.noiseReduction && options.noiseReduction > 0) {
      renderedBuffer = applyNoiseReduction(renderedBuffer, options.noiseReduction);
    }
    
    // 應用均衡器
    if (options.equalizerBands && options.equalizerBands.length > 0) {
      renderedBuffer = await applyEqualizer(renderedBuffer, options.equalizerBands);
    }
    
    // 應用音量標準化
    if (options.normalize) {
      const targetDb = options.normalizeTarget || -3;
      renderedBuffer = applyNormalization(renderedBuffer, targetDb);
    }
    
    // 根據選擇的格式導出
    format = format.toLowerCase();
    let mimeType = 'audio/wav';
    let audioBlob;
    
    // 設置默認音質
    const quality = options.quality !== undefined ? options.quality : 0.8;
    
    switch (format) {
      case 'mp3':
        // 注意：在實際應用中需要使用 MP3 編碼庫
        console.warn('MP3 編碼尚未完全實現，使用基本轉換');
        audioBlob = audioBufferToWav(renderedBuffer);
        mimeType = 'audio/mp3';
        console.log(`使用音質設置: ${quality} (相當於 ${getKbpsFromQuality(quality, 'mp3')} kbps)`);
        break;
      case 'ogg':
        console.warn('OGG 編碼尚未完全實現，使用基本轉換');
        audioBlob = audioBufferToWav(renderedBuffer);
        mimeType = 'audio/ogg';
        console.log(`使用音質設置: ${quality} (相當於 ${getKbpsFromQuality(quality, 'ogg')} kbps)`);
        break;
      case 'flac':
        console.warn('FLAC 編碼尚未完全實現，使用基本轉換');
        audioBlob = audioBufferToWav(renderedBuffer);
        mimeType = 'audio/flac';
        break;
      case 'm4a':
        console.warn('M4A 編碼尚未完全實現，使用基本轉換');
        audioBlob = audioBufferToWav(renderedBuffer);
        mimeType = 'audio/m4a';
        console.log(`使用音質設置: ${quality} (相當於 ${getKbpsFromQuality(quality, 'm4a')} kbps)`);
        break;
      case 'wav':
      default:
        audioBlob = audioBufferToWav(renderedBuffer);
        mimeType = 'audio/wav';
        break;
    }
    
    return new Blob([audioBlob], { type: mimeType });
  } catch (error) {
    throw new Error(`音頻處理失敗: ${error.message}`);
  }
};

/**
 * 將音質值轉換為相應的 kbps
 * @param quality 音質值 (0.1 - 1.0)
 * @param format 音頻格式
 * @returns kbps 值
 */
function getKbpsFromQuality(quality: number, format: string): number {
  const qualityMap: {[key: string]: number[]} = {
    mp3: [96, 128, 160, 192, 224, 256, 320],
    ogg: [80, 112, 128, 160, 192, 224, 256],
    m4a: [96, 128, 160, 192, 224, 256, 320]
  };
  
  const formatRates = qualityMap[format] || qualityMap.mp3;
  // 將 0.1-1.0 的質量轉換為陣列索引
  const index = Math.min(Math.floor(quality * 10) - 1, formatRates.length - 1);
  return formatRates[Math.max(0, index)];
}

/**
 * 將AudioBuffer轉換為WAV格式的ArrayBuffer
 * @param buffer 音頻緩衝區
 * @returns WAV格式的ArrayBuffer
 */
const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
  const numOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numOfChannels * 2 + 44;
  const sampleRate = buffer.sampleRate;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  
  // 寫入WAV文件頭
  writeString(view, 0, 'RIFF');
  view.setUint32(4, length - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChannels * 2, true);
  view.setUint16(32, numOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length - 44, true);
  
  // 寫入音頻數據
  if (numOfChannels === 1) {
    const data = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < data.length; i++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }
  } else {
    const dataL = buffer.getChannelData(0);
    const dataR = buffer.getChannelData(1);
    let offset = 44;
    for (let i = 0; i < dataL.length; i++) {
      const sampleL = Math.max(-1, Math.min(1, dataL[i]));
      view.setInt16(offset, sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7FFF, true);
      offset += 2;
      
      const sampleR = Math.max(-1, Math.min(1, dataR[i]));
      view.setInt16(offset, sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return arrayBuffer;
};

/**
 * 將字符串寫入DataView
 */
const writeString = (view: DataView, offset: number, string: string): void => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * 包含處理的音頻片段信息的輸出報告
 */
export interface AudioProcessingReport {
  totalClips: number;
  totalDuration: number;
  processedDuration: number;
  processingTimeMs: number;
  clips: {
    startTime: number;
    endTime: number;
    duration: number;
    peakDb: number;
    avgDb: number;
  }[];
}

/**
 * 批次處理多個音頻片段
 * @param clips 剪輯片段的起始和結束時間數組
 * @param originalBuffer 原始音頻緩衝區
 * @param format 導出格式 ('wav', 'mp3', 'ogg', 'flac', 'm4a')
 * @param options 處理選項
 * @param progressCallback 進度回調函數
 * @returns 處理後的音頻Blob數組和處理報告
 */
export const batchProcessAudioClips = async (
  clips: Array<{start: number, end: number}>,
  originalBuffer: AudioBuffer,
  format: string = 'wav',
  options: {
    fadeIn?: number,
    fadeOut?: number,
    noiseReduction?: number,
    normalize?: boolean,
    normalizeTarget?: number,
    quality?: number // 導出音質設置 (0.1 - 1.0)
  } = {},
  progressCallback?: (current: number, total: number) => void
): Promise<{blobs: Blob[], report: AudioProcessingReport}> => {
  const startTime = performance.now();
  const totalClips = clips.length;
  const blobs: Blob[] = [];
  const clipReports: AudioProcessingReport['clips'] = [];
  let totalDuration = 0;
  let processedDuration = 0;
  
  // 計算所有片段的總持續時間
  for (const clip of clips) {
    totalDuration += (clip.end - clip.start);
  }

  try {
    // 處理每個片段
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const clipDuration = clip.end - clip.start;
      
      // 調用進度回調
      if (progressCallback) {
        progressCallback(i, totalClips);
      }
      
      const audioBlob = await processAudioClip(
        clip.start,
        clip.end,
        originalBuffer,
        format,
        options
      );
      
      blobs.push(audioBlob);
      processedDuration += clipDuration;
      
      // 計算片段的音頻統計數據
      const statistics = calculateClipStatistics(originalBuffer, clip.start, clip.end);
      
      clipReports.push({
        startTime: clip.start,
        endTime: clip.end,
        duration: clipDuration,
        peakDb: statistics.peakDb,
        avgDb: statistics.avgDb
      });
    }
    
    // 最後一次調用進度回調，表示完成
    if (progressCallback) {
      progressCallback(totalClips, totalClips);
    }
    
    // 返回處理後的blob數組和處理報告
    return {
      blobs,
      report: {
        totalClips,
        totalDuration,
        processedDuration,
        processingTimeMs: performance.now() - startTime,
        clips: clipReports
      }
    };
  } catch (error) {
    throw new Error(`批次處理失敗: ${error.message}`);
  }
};

/**
 * 計算音頻片段的統計數據
 * @param buffer 音頻緩衝區
 * @param startTime 開始時間（秒）
 * @param endTime 結束時間（秒）
 * @returns 音頻統計數據
 */
const calculateClipStatistics = (
  buffer: AudioBuffer,
  startTime: number,
  endTime: number
) => {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const channelData = buffer.getChannelData(0);
  
  let sum = 0;
  let sumSquared = 0;
  let max = -Infinity;
  
  // 計算統計數據
  for (let i = startSample; i < endSample; i++) {
    const value = channelData[i];
    const absValue = Math.abs(value);
    sum += absValue;
    sumSquared += value * value;
    max = Math.max(max, absValue);
  }
  
  const length = endSample - startSample;
  const avg = sum / length;
  const rms = Math.sqrt(sumSquared / length);
  
  // 計算分貝值
  const avgDb = 20 * Math.log10(avg || 0.00001);
  const peakDb = 20 * Math.log10(max || 0.00001);
  
  return {
    avg,
    rms,
    max,
    avgDb,
    peakDb
  };
};

/**
 * 創建帶有效果的預覽音頻緩衝區
 * @param originalBuffer 原始音頻緩衝區
 * @param startTime 開始時間（秒）
 * @param endTime 結束時間（秒）
 * @param options 效果選項
 * @returns 處理後的音頻緩衝區
 */
export const createPreviewBuffer = async (
  originalBuffer: AudioBuffer,
  startTime: number,
  endTime: number,
  options: {
    fadeIn?: number,
    fadeOut?: number,
    noiseReduction?: number,
    normalize?: boolean,
    normalizeTarget?: number
  } = {}
): Promise<AudioBuffer> => {
  try {
    const context = new OfflineAudioContext(
      originalBuffer.numberOfChannels,
      Math.ceil((endTime - startTime) * originalBuffer.sampleRate),
      originalBuffer.sampleRate
    );

  const source = context.createBufferSource();
  source.buffer = originalBuffer;
  
  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(1.0, 0);
  
  source.connect(gainNode);
  gainNode.connect(context.destination);
  
    // 設置播放區間
  source.start(0, startTime, endTime - startTime);
  
    let renderedBuffer = await context.startRendering();
    
    // 應用淡入淡出效果
    if (options.fadeIn && options.fadeIn > 0) {
      applyFadeIn(renderedBuffer, Math.min(options.fadeIn, renderedBuffer.duration / 2));
    }
    
    if (options.fadeOut && options.fadeOut > 0) {
      applyFadeOut(renderedBuffer, Math.min(options.fadeOut, renderedBuffer.duration / 2));
    }
    
    // 應用降噪處理
    if (options.noiseReduction && options.noiseReduction > 0) {
      renderedBuffer = applyNoiseReduction(renderedBuffer, options.noiseReduction);
    }
    
    // 應用音量標準化
    if (options.normalize) {
      const targetDb = options.normalizeTarget || -3; // 默認標準化到-3dBFS
      renderedBuffer = applyNormalization(renderedBuffer, targetDb);
    }
    
    return renderedBuffer;
  } catch (error) {
    throw new Error(`創建預覽音頻失敗: ${error.message}`);
  }
};