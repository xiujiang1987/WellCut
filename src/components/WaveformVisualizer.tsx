import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface Props {
  audioUrl: string;
  onSelection: (start: number, end: number) => void;
  silenceSegments?: Array<{start: number, end: number}>;
}

export const WaveformVisualizer: React.FC<Props> = ({ audioUrl, onSelection, silenceSegments }) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopActive, setLoopActive] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<any>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);

  // 繪製自定義時間線
  const drawTimeline = () => {
    if (!timelineCanvasRef.current || !wavesurfer.current || duration === 0) return;
    
    const canvas = timelineCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 清除畫布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 設置樣式
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    // 計算間隔 (根據縮放級別調整)
    const majorInterval = 60; // 每分鐘
    const minorInterval = 10; // 每10秒
    
    // 總寬度和每秒的寬度
    const totalWidth = canvas.width;
    const pixelsPerSecond = totalWidth / duration;
    
    // 繪製主要時間標記（分鐘）
    for (let i = 0; i <= duration; i += majorInterval) {
      const x = i * pixelsPerSecond;
      if (x <= totalWidth) {
        // 繪製長線
        ctx.fillRect(x, 0, 1, 10);
        
        // 顯示時間文字 (分:秒)
        const minutes = Math.floor(i / 60);
        const seconds = i % 60;
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        ctx.fillText(timeText, x, 20);
      }
    }
    
    // 繪製次要時間標記（10秒）
    for (let i = 0; i <= duration; i += minorInterval) {
      if (i % majorInterval !== 0) { // 避免與主要標記重疊
        const x = i * pixelsPerSecond;
        if (x <= totalWidth) {
          // 繪製短線
          ctx.fillRect(x, 0, 1, 5);
        }
      }
    }
  };

  useEffect(() => {
    if (waveformRef.current) {
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4F46E5',
        progressColor: '#6366F1',
        cursorColor: '#1E40AF',
        height: 120,
        responsive: true,
        normalize: true,
        interact: true,
        minPxPerSec: 50 * zoomLevel, // 控制縮放級別
      });

      wavesurfer.current.load(audioUrl);

      wavesurfer.current.on('ready', () => {
        if (wavesurfer.current) {
          wavesurfer.current.enableDragSelection({
            color: 'rgba(79, 70, 229, 0.1)'
          });
          setDuration(wavesurfer.current.getDuration());
          
          // 繪製時間線
          drawTimeline();
        }
      });

      wavesurfer.current.on('region-created', (region) => {
        // 清除之前的區域
        if (currentRegion) {
          currentRegion.remove();
        }
        
        // 設置新區域
        setCurrentRegion(region);
        onSelection(region.start, region.end);
        
        region.on('update-end', () => {
          onSelection(region.start, region.end);
        });
      });
      
      wavesurfer.current.on('region-click', (region) => {
        if (loopActive) {
          region.play();
        }
      });

      wavesurfer.current.on('play', () => {
        setIsPlaying(true);
      });

      wavesurfer.current.on('pause', () => {
        setIsPlaying(false);
      });

      wavesurfer.current.on('audioprocess', () => {
        if (wavesurfer.current) {
          setCurrentTime(wavesurfer.current.getCurrentTime());
          
          // 如果循環模式啟用且有選中區域，檢查是否需要循環
          if (loopActive && currentRegion && wavesurfer.current.getCurrentTime() >= currentRegion.end) {
            wavesurfer.current.setCurrentTime(currentRegion.start);
          }
        }
      });

      wavesurfer.current.on('seek', () => {
        if (wavesurfer.current) {
          setCurrentTime(wavesurfer.current.getCurrentTime());
        }
      });
    }

    return () => {
      wavesurfer.current?.destroy();
    };
  }, [audioUrl, onSelection, loopActive]);

  // 當縮放級別變更時重新繪製時間線
  useEffect(() => {
    if (wavesurfer.current && duration > 0) {
      // 繪製時間線
      drawTimeline();
      
      // 縮放波形
      wavesurfer.current.zoom(50 * zoomLevel);
    }
  }, [zoomLevel, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wavesurfer.current || !silenceSegments) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 等待波形準備好後繪製
    const drawSilences = () => {
      if (!wavesurfer.current || !silenceSegments) return;
      
      const totalDuration = wavesurfer.current.getDuration();
      if (!totalDuration) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      
      silenceSegments.forEach(segment => {
        const x = (segment.start / totalDuration) * canvas.width;
        const width = ((segment.end - segment.start) / totalDuration) * canvas.width;
        ctx.fillRect(x, 0, width, canvas.height);
      });
    };
    
    // 波形繪製函數
    const drawWaveform = () => {
      if (!wavesurfer.current) return;
      
      wavesurfer.current.on('ready', () => {
        drawSilences();
      });
      
      wavesurfer.current.on('seek', () => {
        drawSilences();
      });

      // 當縮放級別改變時重繪靜音區域
      wavesurfer.current.on('zoom', () => {
        drawSilences();
      });
    };
    
    drawWaveform();
    
    return () => {
      if (wavesurfer.current) {
        wavesurfer.current.un('ready');
        wavesurfer.current.un('seek');
        wavesurfer.current.un('zoom');
      }
    };
  }, [silenceSegments, zoomLevel]);

  useEffect(() => {
    if (wavesurfer.current) {
      wavesurfer.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  const handlePlayPause = () => {
    if (wavesurfer.current) {
      wavesurfer.current.playPause();
    }
  };

  const handleStop = () => {
    if (wavesurfer.current) {
      wavesurfer.current.stop();
    }
  };

  const toggleLoop = () => {
    setLoopActive(!loopActive);
  };

  const handlePlayRegion = () => {
    if (currentRegion) {
      currentRegion.play();
    }
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.5, 1));
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // 鍵盤事件處理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只有當波形已載入時才處理鍵盤事件
      if (!wavesurfer.current) return;

      switch(e.code) {
        case 'Space': // 空格鍵切換播放/暫停
          e.preventDefault();
          handlePlayPause();
          break;
        case 'KeyL': // L 鍵切換循環
          toggleLoop();
          break;
        case 'ArrowRight': // 右箭頭快進 5 秒
          if (wavesurfer.current) {
            const newTime = Math.min(currentTime + 5, duration);
            wavesurfer.current.setCurrentTime(newTime);
          }
          break;
        case 'ArrowLeft': // 左箭頭倒退 5 秒
          if (wavesurfer.current) {
            const newTime = Math.max(currentTime - 5, 0);
            wavesurfer.current.setCurrentTime(newTime);
          }
          break;
        case 'Equal': // "=" 鍵放大 (通常與 "+" 相同的按鍵)
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomIn();
          }
          break;
        case 'Minus': // "-" 鍵縮小
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomOut();
          }
          break;
        case 'Digit0': // "0" 鍵重置縮放
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomReset();
          }
          break;
        case 'KeyS': // "S" 鍵停止播放
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleStop();
          } else {
            handleStop();
          }
          break;
        case 'KeyP': // "P" 鍵播放選中區域
          if (currentRegion) {
            handlePlayRegion();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentTime, duration, currentRegion, wavesurfer.current]);

  return (
    <div className="waveform-container" style={{ position: 'relative' }}>
      {/* 波形顯示容器 */}
      <div ref={waveformRef} style={{ width: '100%' }} />
      
      {/* 自定義時間線 */}
      <canvas 
        ref={timelineCanvasRef} 
        width={waveformRef.current?.clientWidth || 800}
        height={30}
        style={{ 
          width: '100%', 
          height: '30px', 
          marginTop: '5px'
        }}
      />
      
      {/* 靜音片段視覺標記 */}
      {silenceSegments && silenceSegments.length > 0 && (
        <canvas 
          ref={canvasRef} 
          className="silence-overlay"
          width={waveformRef.current?.clientWidth || 800}
          height={120}
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            pointerEvents: 'none' 
          }}
        />
      )}
      
      {/* 播放控制面板 */}
      <div className="playback-controls" style={{ 
        marginTop: '10px', 
        display: 'flex', 
        flexDirection: 'column',
        gap: '10px'
      }}>
        {/* 播放控制 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={handlePlayPause}
            style={{
              padding: '5px 15px',
              backgroundColor: '#4F46E5',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '80px'
            }}
            title="空格鍵切換播放/暫停"
          >
            <span>{isPlaying ? '暫停' : '播放'}</span>
          </button>
          <button 
            onClick={handleStop}
            style={{
              padding: '5px 15px',
              backgroundColor: '#6B7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '80px'
            }}
            title="S 鍵停止播放"
          >
            停止
          </button>
          {currentRegion && (
            <button 
              onClick={handlePlayRegion}
              style={{
                padding: '5px 15px',
                backgroundColor: '#10B981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '80px'
              }}
              title="P 鍵播放選區"
            >
              播放選區
            </button>
          )}
          <button 
            onClick={toggleLoop}
            style={{
              padding: '5px 15px',
              backgroundColor: loopActive ? '#8B5CF6' : '#D1D5DB',
              color: loopActive ? 'white' : 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '80px'
            }}
            title="L 鍵切換循環模式"
          >
            循環: {loopActive ? '開' : '關'}
          </button>
          <div className="time-display" style={{ marginLeft: '10px', minWidth: '120px' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        
        {/* 播放速度和縮放控制 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}>播放速度: {playbackRate.toFixed(1)}x</div>
          <div style={{ display: 'flex', gap: '5px' }}>
            {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(rate => (
              <button
                key={rate}
                onClick={() => handlePlaybackRateChange(rate)}
                style={{
                  padding: '4px 8px',
                  backgroundColor: playbackRate === rate ? '#8B5CF6' : '#E5E7EB',
                  color: playbackRate === rate ? 'white' : 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                {rate.toFixed(1)}x
              </button>
            ))}
          </div>
          
          {/* 縮放控制 */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem' }}>縮放:</span>
            <button
              onClick={handleZoomOut}
              style={{
                padding: '4px 8px',
                backgroundColor: '#E5E7EB',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
              title="Ctrl + - 縮小"
            >
              −
            </button>
            <span style={{ fontSize: '0.9rem' }}>{zoomLevel.toFixed(1)}x</span>
            <button
              onClick={handleZoomIn}
              style={{
                padding: '4px 8px',
                backgroundColor: '#E5E7EB',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
              title="Ctrl + + 放大"
            >
              +
            </button>
            <button
              onClick={handleZoomReset}
              style={{
                padding: '4px 8px',
                backgroundColor: '#E5E7EB',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
              title="Ctrl + 0 重置縮放"
            >
              重置
            </button>
          </div>
        </div>
        
        {/* 鍵盤快捷鍵提示 */}
        <div style={{ 
          marginTop: '5px',
          padding: '5px 10px',
          backgroundColor: '#F3F4F6',
          borderRadius: '4px',
          fontSize: '0.8rem',
          color: '#6B7280'
        }}>
          <span>鍵盤快捷鍵: </span>
          <span title="空格鍵">播放/暫停</span> | 
          <span title="S 鍵"> 停止</span> | 
          <span title="L 鍵"> 循環</span> | 
          <span title="P 鍵"> 播放選區</span> | 
          <span title="左右箭頭"> 前進/後退 5秒</span> | 
          <span title="Ctrl + +/-"> 縮放</span> | 
          <span title="Ctrl + 0"> 重置縮放</span>
        </div>
        
        {currentRegion && (
          <div style={{ fontSize: '0.9rem', marginTop: '5px' }}>
            已選擇區間: {formatTime(currentRegion.start)} - {formatTime(currentRegion.end)} 
            ({((currentRegion.end - currentRegion.start)).toFixed(1)}秒)
          </div>
        )}
      </div>
    </div>
  );
};