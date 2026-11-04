import { readFileSync } from 'fs';
import { resolve } from 'path';

import { BIT_DEPTH, buildTimerAlarmWav, CHANNELS, SAMPLE_RATE } from './generate-timer-alarm';

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

  it('the committed asset matches the generator', () => {
    const file = readFileSync(resolve(__dirname, '../assets/sounds/timer-alarm.wav'));
    expect(file.equals(wav)).toBe(true);
  });
});
