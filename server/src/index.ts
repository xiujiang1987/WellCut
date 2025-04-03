import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { exec } from 'child_process'; // 用於執行 FFmpeg 命令

const app = express();
const port = 3000; // 後端伺服器端口

// 設置上傳目錄和 Multer
const uploadDir = path.join(__dirname, '..', 'uploads');
const outputDir = path.join(__dirname, '..', 'processed');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage: storage });

// 允許跨域請求 (用於開發)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // 允許所有來源
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 上傳端點
app.post('/upload', upload.single('video'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).send('No file uploaded.');
    return;
  }

  const filePath = req.file.path;
  const outputFileName = `processed-${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, outputFileName);
  const audioPath = path.join(uploadDir, `${req.file.filename}.wav`);

  console.log(`接收到檔案: ${filePath}`);
  const silenceThreshold = '-30dB'; // 靜音偵測閾值
  const minSilenceDuration = 0.5; // 最小靜音持續時間 (秒)

  try {
    // 1. 使用 FFmpeg silencedetect 偵測非靜音 (語音) 段落
    console.log('正在偵測語音段落...');
    const speechSegments = await detectSpeechWithFFmpeg(filePath, silenceThreshold, minSilenceDuration);
    console.log(`偵測到語音段落:`, speechSegments);

    if (speechSegments.length === 0) {
      throw new Error('未偵測到任何語音段落');
    }

    // 2. 使用 FFmpeg 根據語音段落剪輯影片
    console.log('正在剪輯影片...');
    await cutVideoBySegments(filePath, outputPath, speechSegments);
    console.log(`影片剪輯完成: ${outputPath}`);

    // 3. 返回處理後的影片路徑或檔案 (實際應用中可能需要提供下載鏈接)
    res.json({
      message: '影片處理成功',
      processedFilePath: outputPath, // 提供相對路徑或 URL
      segments: speechSegments
    });

  } catch (error) {
    console.error('處理影片時發生錯誤:', error);
    res.status(500).send(`處理影片時發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
    // 清理可能產生的臨時檔案
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  } finally {
    // 清理上傳的原始檔案
    fs.unlinkSync(filePath);
    console.log(`已刪除原始檔案: ${filePath}`);
  }
});

// 使用 FFmpeg silencedetect 偵測語音段落
function detectSpeechWithFFmpeg(inputPath: string, threshold: string, minDuration: number): Promise<{ start: number; end: number }[]> {
  return new Promise((resolve, reject) => {
    let ffmpegOutput = '';
    const command = ffmpeg(inputPath)
      .outputOptions([
        '-af', `silencedetect=noise=${threshold}:d=${minDuration}`,
        '-f', 'null', // 不需要輸出文件，只關心控制台輸出
        '-' // 輸出到 stdout/stderr
      ])
      .on('stderr', (stderrLine) => {
        ffmpegOutput += stderrLine + '\n'; // 收集 FFmpeg 的輸出
      })
      .on('error', (err) => {
        console.error('FFmpeg silencedetect 錯誤:', err.message);
        console.error('FFmpeg 完整輸出:', ffmpegOutput);
        reject(new Error(`FFmpeg silencedetect 失敗: ${err.message}`));
      })
      .on('end', () => {
        console.log('FFmpeg silencedetect 輸出:\n', ffmpegOutput);
        const silenceStarts = ffmpegOutput.match(/silence_start: (\d+(\.\d+)?)/g)?.map(s => parseFloat(s.split(' ')[1])) || [];
        const silenceEnds = ffmpegOutput.match(/silence_end: (\d+(\.\d+)?)/g)?.map(s => parseFloat(s.split(' ')[1])) || [];
        const silenceDurations = ffmpegOutput.match(/silence_duration: (\d+(\.\d+)?)/g)?.map(s => parseFloat(s.split(' ')[1])) || [];

        if (silenceStarts.length !== silenceEnds.length || silenceStarts.length !== silenceDurations.length) {
           console.warn('silencedetect 輸出解析不匹配，可能起始或結尾沒有靜音');
           // 嘗試處理不匹配的情況，可能需要更健壯的解析邏輯
        }

        // 獲取影片總時長
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) {
            return reject(new Error(`無法獲取影片時長: ${err.message}`));
          }
          const totalDuration = metadata.format.duration;
          if (totalDuration === undefined) {
            return reject(new Error('無法確定影片總時長'));
          }

          const speechSegments: { start: number; end: number }[] = [];
          let lastEnd = 0;

          for (let i = 0; i < silenceStarts.length; i++) {
            const start = silenceStarts[i];
            const end = silenceEnds[i]; // 靜音結束時間

            // 添加上一個靜音結束到這個靜音開始之間的語音片段
            if (start > lastEnd) {
              speechSegments.push({ start: lastEnd, end: start });
            }
            lastEnd = end; // 更新上一個靜音的結束時間
          }

          // 添加最後一個靜音結束到影片結尾的片段
          if (lastEnd < totalDuration) {
            speechSegments.push({ start: lastEnd, end: totalDuration });
          }

          // 過濾掉非常短的片段 (可選)
          const filteredSegments = speechSegments.filter(seg => seg.end - seg.start > 0.1); // 例如，至少0.1秒

          resolve(filteredSegments);
        });
      });

    command.run();
  });
}


// 根據時間段剪輯影片函數 (使用 FFmpeg complex filter)
function cutVideoBySegments(inputPath: string, outputPath: string, segments: { start: number; end: number }[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (segments.length === 0) {
      return reject(new Error('沒有提供有效的剪輯段落'));
    }

    const complexFilter: string[] = [];
    const outputMap: string[] = [];

    // 為每個片段創建剪輯濾鏡和輸出映射
    segments.forEach((segment, index) => {
      complexFilter.push(`[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}]; [0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}]`);
      outputMap.push(`[v${index}][a${index}]`);
    });

    // 拼接所有片段
    const concatFilter = `${outputMap.join('')}concat=n=${segments.length}:v=1:a=1[outv][outa]`;
    complexFilter.push(concatFilter);

    ffmpeg(inputPath)
      .complexFilter(complexFilter)
      .map('[outv]')
      .map('[outa]')
      .outputOptions('-preset ultrafast') // 加快處理速度
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`剪輯影片失敗: ${err.message}`)))
      .run();
  });
}

// 啟動伺服器
app.listen(port, () => {
  console.log(`後端伺服器運行在 http://localhost:${port}`);
});
