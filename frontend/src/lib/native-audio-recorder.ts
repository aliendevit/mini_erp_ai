'use client';

export type NativeRecordingResult = {
  blob: Blob;
  durationMs: number;
  peak: number | null;
  mimeType: string;
  fileName: string;
};

export type NativeAudioRecordingSession = {
  stop: () => Promise<NativeRecordingResult>;
  cancel: () => Promise<void>;
};

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function getSupportedMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  for (const mimeType of MIME_CANDIDATES) {
    if (typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return null;
}

function fileNameForMimeType(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ai-intake.ogg";
  if (mimeType.includes("mp4")) return "ai-intake.m4a";
  return "ai-intake.webm";
}

export function isNativeAudioRecordingSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!getSupportedMimeType();
}

export async function startNativeAudioRecording(): Promise<NativeAudioRecordingSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("UNSUPPORTED");
  const mimeType = getSupportedMimeType();
  if (!mimeType) throw new Error("UNSUPPORTED");

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let dataArray: Uint8Array | null = null;
  let rafId: number | null = null;
  let peak = 0;

  try {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtor) {
      audioContext = new AudioCtor();
      await audioContext.resume();
      source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      dataArray = new Uint8Array(analyser.fftSize);
      source.connect(analyser);

      const updatePeak = () => {
        if (!analyser || !dataArray) return;
        analyser.getByteTimeDomainData(dataArray);
        for (let i = 0; i < dataArray.length; i += 1) {
          const sample = Math.abs((dataArray[i] - 128) / 128);
          if (sample > peak) peak = sample;
        }
        rafId = window.requestAnimationFrame(updatePeak);
      };
      rafId = window.requestAnimationFrame(updatePeak);
    }
  } catch {
    audioContext = null;
    analyser = null;
    source = null;
    dataArray = null;
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  const startedAt = Date.now();
  let canceled = false;
  let stopPromise: Promise<NativeRecordingResult> | null = null;

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const cleanup = async () => {
    if (rafId != null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (source) {
      try {
        source.disconnect();
      } catch {}
      source = null;
    }
    stream.getTracks().forEach((track) => track.stop());
    if (audioContext) {
      try {
        await audioContext.close();
      } catch {}
      audioContext = null;
    }
  };

  const waitForStop = () => {
    if (!stopPromise) {
      stopPromise = new Promise<NativeRecordingResult>((resolve, reject) => {
        recorder.onstop = () => {
          void cleanup().then(() => {
            if (canceled) {
              resolve({
                blob: new Blob([], { type: mimeType }),
                durationMs: 0,
                peak,
                mimeType,
                fileName: fileNameForMimeType(mimeType),
              });
              return;
            }
            const blob = new Blob(chunks, { type: mimeType });
            resolve({
              blob,
              durationMs: Math.max(0, Date.now() - startedAt),
              peak,
              mimeType,
              fileName: fileNameForMimeType(mimeType),
            });
          }).catch(reject);
        };
        recorder.onerror = () => {
          void cleanup().finally(() => reject(new Error("Failed to record audio.")));
        };
      });
    }
    return stopPromise;
  };

  recorder.start();

  return {
    stop: async () => {
      const resultPromise = waitForStop();
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      return resultPromise;
    },
    cancel: async () => {
      canceled = true;
      const resultPromise = waitForStop();
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      await resultPromise;
    },
  };
}
