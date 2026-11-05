/**
 * Generates the timer alarm sounds: `assets/sounds/timer-alarm.wav` (長め) and `timer-alarm-short.wav` (短め).
 *
 *   bun scripts/generate-timer-alarm.ts
 *
 * Both are synthesized here from sine waves (no third-party audio, no license issue) from ONE shared pattern:
 * "ピピピピッ、ピピピピッ…" = 4 short 2 kHz beeps, then a pause. 長め repeats it for 20 cycles (~28 s); 短め plays
 * 2 whole cycles (2.8 s, always ending after the pause, never inside a beep) with a shorter fade-in.
 * Format: Linear PCM WAV, 16 bit, 44.1 kHz, mono. iOS replaces a notification sound longer than 30 s with the
 * default sound, so the length stays below that.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

export const SAMPLE_RATE = 44_100;
export const BIT_DEPTH = 16;
export const CHANNELS = 1;
const FREQUENCY_HZ = 2000;
const BEEP_SECONDS = 0.12;
const GAP_SECONDS = 0.08;
const BEEPS_PER_GROUP = 4;
const CYCLE_SECONDS = 1.4;
/** Short ramp at both ends of each beep so it does not click. */
const BEEP_RAMP_SECONDS = 0.006;
/** Fraction of full scale; leaves headroom so nothing clips. */
const PEAK = 0.8;

export type AlarmSpec = {
  file: string;
  /** Whole pattern cycles. */
  cycles: number;
  /** The whole sound fades in over this time, so it does not start at full volume. */
  fadeInSeconds: number;
};

export const LONG_ALARM: AlarmSpec = { file: 'timer-alarm.wav', cycles: 20, fadeInSeconds: 0.5 };
export const SHORT_ALARM: AlarmSpec = { file: 'timer-alarm-short.wav', cycles: 2, fadeInSeconds: 0.05 };
export const ALARM_SPECS: readonly AlarmSpec[] = [LONG_ALARM, SHORT_ALARM];

/** The shared pattern definition (exported for the tests). */
export const PATTERN = {
  cycleSeconds: CYCLE_SECONDS,
  beepSeconds: BEEP_SECONDS,
  gapSeconds: GAP_SECONDS,
  beepsPerGroup: BEEPS_PER_GROUP,
};
export const durationSeconds = (spec: AlarmSpec): number => spec.cycles * CYCLE_SECONDS;

/** Amplitude (0..1) of the beep pattern at `t` seconds, before the overall fade-in. */
function beepEnvelope(t: number): number {
  const inCycle = t % CYCLE_SECONDS;
  const slot = BEEP_SECONDS + GAP_SECONDS;
  const index = Math.floor(inCycle / slot);
  if (index >= BEEPS_PER_GROUP) return 0;
  const inBeep = inCycle - index * slot;
  if (inBeep >= BEEP_SECONDS) return 0;
  return Math.min(1, inBeep / BEEP_RAMP_SECONDS, (BEEP_SECONDS - inBeep) / BEEP_RAMP_SECONDS);
}

/** Builds the complete WAV file (44-byte header + PCM data). Pure and deterministic. */
export function buildTimerAlarmWav(spec: AlarmSpec = LONG_ALARM): Buffer {
  const sampleCount = Math.round(SAMPLE_RATE * durationSeconds(spec));
  const bytesPerSample = BIT_DEPTH / 8;
  const dataSize = sampleCount * CHANNELS * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // Linear PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32); // block align
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / SAMPLE_RATE;
    const fadeIn = Math.min(1, t / spec.fadeInSeconds);
    const value = Math.sin(2 * Math.PI * FREQUENCY_HZ * t) * beepEnvelope(t) * fadeIn * PEAK;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * bytesPerSample);
  }
  return buffer;
}

if (require.main === module) {
  for (const spec of ALARM_SPECS) {
    const out = resolve(__dirname, '../assets/sounds', spec.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buildTimerAlarmWav(spec));
    process.stdout.write(`wrote ${out}\n`);
  }
}
