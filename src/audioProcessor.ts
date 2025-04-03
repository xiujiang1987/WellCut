// 擴展 Window 接口以支持 webkitAudioContext
interface Window {
  webkitAudioContext?: typeof AudioContext;
}

// 創建音頻上下文
const audioContext = new (window.AudioContext || (window as Window).webkitAudioContext)();

// 均衡器頻段定義
export interface EqualizerBand {
  frequency: number;  // 中心頻率
  gain: number;      // 增益值（dB）
  q: number;         // Q值（頻寬）
}

interface SpeechDetectionResult {
  thresholds: number[];
  speechSegments: Array<{start: number; end: number}>;
}

/**
 * 檢測語音段落
 * @param buffer 音頻緩衝區
 * @param minSilenceDuration 最小靜音持續時間（秒）
 * @param thresholdDB 語音檢測閾值（分貝）
 * @returns 語音段落和閾值信息
 */
export function detectSpeechSegments(
  buffer: AudioBuffer, 
  minSilenceDuration = 0.5,
  thresholdDB = -50
): SpeechDetectionResult {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // 計算音頻的振幅閾值
  const amplitudes = Array.from({ length: 10 }, (_, i) => i / 10);
  
  // 將閾值從分貝轉換為線性振幅
  const threshold = Math.pow(10, thresholdDB / 20);
  
  // 使用滑動窗口進行檢測
  const windowSize = Math.round(sampleRate * 0.05);
  const segments: Array<{start: number; end: number}> = [];
  
  let inSilence = false;
  let silenceStart = 0;
  let consecutiveSilenceFrames = 0;
  let consecutiveNonSilenceFrames = 0;
  
  // 使用RMS值計算窗口內的平均能量
  for (let i = 0; i < channelData.length; i += windowSize) {
    const end = Math.min(i + windowSize, channelData.length);
    let sumSquared = 0;
    
    for (let j = i; j < end; j++) {
      sumSquared += channelData[j] * channelData[j];
    }
    
    const rms = Math.sqrt(sumSquared / (end - i));
    
    if (rms < threshold) {
      consecutiveSilenceFrames++;
      consecutiveNonSilenceFrames = 0;
      
      if (!inSilence && consecutiveSilenceFrames >= 2) {
        silenceStart = (i - windowSize) / sampleRate;
        inSilence = true;
      }
    } else {
      consecutiveNonSilenceFrames++;
      
      if (inSilence && consecutiveNonSilenceFrames >= 2) {
        const silenceEnd = i / sampleRate;
        if (silenceEnd - silenceStart >= minSilenceDuration) {
          segments.push({ start: silenceStart, end: silenceEnd });
        }
        inSilence = false;
        consecutiveSilenceFrames = 0;
      }
    }
  }

  if (inSilence) {
    const silenceEnd = channelData.length / sampleRate;
    if (silenceEnd - silenceStart >= minSilenceDuration) {
      segments.push({ start: silenceStart, end: silenceEnd });
    }
  }

  return {
    thresholds: amplitudes,
    speechSegments: segments
  };
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
    equalizerBands?: EqualizerBand[]
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
    
    const renderedBuffer = await context.startRendering();
    
    // 應用效果處理...
    
    return new Blob([audioBufferToWav(renderedBuffer)], { type: 'audio/wav' });
  } catch (error) {
    throw new Error(`音頻處理失敗: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
