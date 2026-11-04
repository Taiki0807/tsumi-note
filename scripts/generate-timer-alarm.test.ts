import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  ALARM_SPECS,
  BIT_DEPTH,
  buildTimerAlarmWav,
  CHANNELS,
  LONG_ALARM,
  PATTERN,
  SAMPLE_RATE,
  SHORT_ALARM,
} from './generate-timer-alarm';

describe('timer alarm wav', () => {
  const wav = buildTimerAlarmWav();

  it('is 16 bit / 44.1 kHz / mono Linear PCM', () => {
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(CHANNELS);
    expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE);
    expect(wav.readUInt16LE(34)).toBe(BIT_DEPTH);
    expect([CHANNELS, SAMPLE_RATE, BIT_DEPTH]).toEqual([1, 44100, 16]);
  });

  it('is shorter than 30 s (iOS limit) and about 28 s', () => {
    const dataSize = wav.readUInt32LE(40);
    expect(wav.length).toBe(44 + dataSize);
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    const seconds = dataSize / (SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8));
    expect(seconds).toBeLessThan(30);
    expect(seconds).toBeGreaterThan(27);
  });

  it('fades in, does not clip and contains silence between beeps', () => {
    const sample = (i: number) => wav.readInt16LE(44 + i * 2);
    const peakIn = (from: number, to: number) => {
      let max = 0;
      for (let i = from; i < to; i++) max = Math.max(max, Math.abs(sample(i)));
      return max;
    };
    const total = (wav.length - 44) / 2;
    expect(peakIn(0, 2000)).toBeLessThan(peakIn(SAMPLE_RATE * 5, SAMPLE_RATE * 6));
    expect(peakIn(0, total)).toBeLessThanOrEqual(32767 * 0.8 + 1);
    // 1.0 s .. 1.3 s of the first cycle is the pause after the 4 beeps.
    expect(peakIn(Math.round(SAMPLE_RATE * 1.0), Math.round(SAMPLE_RATE * 1.3))).toBe(0);
  });

  it('the committed assets match the generator byte for byte', () => {
    for (const spec of ALARM_SPECS) {
      const file = readFileSync(resolve(__dirname, '../assets/sounds', spec.file));
      expect(file.equals(buildTimerAlarmWav(spec))).toBe(true);
    }
  });
});

describe('short timer alarm wav', () => {
  const wav = buildTimerAlarmWav(SHORT_ALARM);
  const sample = (i: number) => wav.readInt16LE(44 + i * 2);
  const total = (wav.length - 44) / 2;

  it('has the same format and shared pattern as the long one', () => {
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(44100);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    // Same tone: once both are past their fade-in, the 4th beep of the first cycle (0.6 s..0.72 s) is identical.
    const long = buildTimerAlarmWav(LONG_ALARM);
    for (let i = Math.round(SAMPLE_RATE * 0.6); i < Math.round(SAMPLE_RATE * 0.72); i++) {
      expect(long.readInt16LE(44 + i * 2)).toBe(sample(i));
    }
  });

  it('is 2 whole cycles (2.8 s, under 30 s) and ends in silence, not inside a beep', () => {
    expect(SHORT_ALARM.cycles).toBe(2);
    expect(total / SAMPLE_RATE).toBeCloseTo(2 * PATTERN.cycleSeconds, 5);
    expect(total / SAMPLE_RATE).toBeLessThan(30);
    // The last beep ends before the final pause; the last 0.3 s are silent and the last sample is 0.
    const lastBeepEnd =
      PATTERN.cycleSeconds + (PATTERN.beepsPerGroup - 1) * (PATTERN.beepSeconds + PATTERN.gapSeconds) + PATTERN.beepSeconds;
    expect(lastBeepEnd).toBeLessThan(total / SAMPLE_RATE);
    for (let i = Math.ceil(lastBeepEnd * SAMPLE_RATE) + 1; i < total; i++) expect(sample(i)).toBe(0);
    expect(sample(total - 1)).toBe(0);
  });

  it('fades in quickly so the first beep is not too quiet, and does not clip', () => {
    let first = 0;
    for (let i = 0; i < Math.round(SAMPLE_RATE * PATTERN.beepSeconds); i++) first = Math.max(first, Math.abs(sample(i)));
    expect(first).toBeGreaterThan(32767 * 0.5);
    let max = 0;
    for (let i = 0; i < total; i++) max = Math.max(max, Math.abs(sample(i)));
    expect(max).toBeLessThanOrEqual(32767 * 0.8 + 1);
  });
});
