'use client';

type AudioContextCtor = typeof AudioContext;

type RecordingResult = {
  blob: Blob;
  durationMs: number;
  peak: number | null;
  mimeType: string;
  fileName: string;
};

export type TranscodedWavResult = RecordingResult & {
  appliedGain: number;
  originalMimeType: string;
  originalPeak: number | null;
};

export type WavRecordingSession = {
  stop: () => Promise<RecordingResult>;
  cancel: () => Promise<void>;
};

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function resampleBuffer(source: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (!source.length || sourceRate === targetRate) return source;
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.round(source.length / ratio));
  const result = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, source.length - 1);
    const weight = position - left;
    result[i] = source[left] * (1 - weight) + source[right] * weight;
  }
  return result;
}

function calculatePeak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return peak;
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels <= 1) {
    return new Float32Array(buffer.getChannelData(0));
  }

  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    for (let index = 0; index < channelData.length; index += 1) {
      mono[index] += channelData[index] / buffer.numberOfChannels;
    }
  }
  return mono;
}

function applyGain(samples: Float32Array, gain: number): Float32Array {
  if (gain <= 1.001) return samples;
  const amplified = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    amplified[i] = Math.max(-1, Math.min(1, samples[i] * gain));
  }
  return amplified;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function isWavRecordingSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!getAudioContextCtor();
}

export async function transcodeBlobToMonoWav(blob: Blob, targetSampleRate = 16_000): Promise<TranscodedWavResult> {
  const AudioCtor = getAudioContextCtor();
  if (!AudioCtor) throw new Error('UNSUPPORTED');
  const audioContext = new AudioCtor();
  await audioContext.resume();

  try {
    const encoded = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(encoded.slice(0));
    const mono = mixToMono(decoded);
    const originalPeak = calculatePeak(mono);
    const appliedGain = originalPeak > 0 ? Math.min(16, Math.max(1, 0.72 / originalPeak)) : 1;
    const normalized = applyGain(mono, appliedGain);
    const samples = resampleBuffer(normalized, decoded.sampleRate, targetSampleRate);
    return {
      blob: encodeWav(samples, targetSampleRate),
      durationMs: samples.length ? Math.round((samples.length / targetSampleRate) * 1000) : 0,
      peak: calculatePeak(normalized),
      mimeType: 'audio/wav',
      fileName: 'ai-intake.wav',
      appliedGain,
      originalMimeType: blob.type || 'application/octet-stream',
      originalPeak,
    };
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export async function startMonoWavRecording(targetSampleRate = 16_000): Promise<WavRecordingSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('UNSUPPORTED');
  const AudioCtor = getAudioContextCtor();
  if (!AudioCtor) throw new Error('UNSUPPORTED');

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const audioContext = new AudioCtor();
  await audioContext.resume();

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const sink = audioContext.createGain();
  sink.gain.value = 0;

  const chunks: Float32Array[] = [];
  let peak = 0;
  let active = true;

  processor.onaudioprocess = (event) => {
    if (!active) return;
    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    peak = Math.max(peak, calculatePeak(copy));
    chunks.push(copy);
  };

  source.connect(processor);
  processor.connect(sink);
  sink.connect(audioContext.destination);

  const cleanup = async () => {
    if (!active) return;
    active = false;
    processor.disconnect();
    source.disconnect();
    sink.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  };

  return {
    stop: async () => {
      await cleanup();
      const merged = mergeChunks(chunks);
      const samples = resampleBuffer(merged, audioContext.sampleRate, targetSampleRate);
      return {
        blob: encodeWav(samples, targetSampleRate),
        durationMs: samples.length ? Math.round((samples.length / targetSampleRate) * 1000) : 0,
        peak,
        mimeType: 'audio/wav',
        fileName: 'ai-intake.wav',
      };
    },
    cancel: async () => {
      await cleanup();
    },
  };
}
