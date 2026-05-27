// Gesture detector for Muse 2 EEG.
//
// Splits each channel into a low band (blink/EOG, ~0–10 Hz) and a high band
// (jaw clench/EMG, ~20+ Hz) using 2nd-order Butterworth biquads, then classifies
// short windows by band-power RMS plus zero-crossing rate.
//
// Blink band upper edge sits at 10 Hz so the full blink waveform (100–500 ms,
// with sharp rising/falling edges carrying energy up to ~10–15 Hz) is captured;
// the alpha rhythm (8–13 Hz) bleeds in slightly but is small-amplitude vs a
// blink artifact and just contributes to baseline RMS.
//
// See README "Signal processing" section for the rationale.

const FS = 256           // Muse 2 EEG sample rate (Hz)
const WINDOW_SAMPLES = 64 // 250 ms window
const LOW_CUTOFF = 10    // Hz — blink band upper edge
const HIGH_CUTOFF = 20   // Hz — EMG band lower edge

class Biquad {
  private z1 = 0
  private z2 = 0
  constructor(
    private b0: number, private b1: number, private b2: number,
    private a1: number, private a2: number,
  ) {}
  step(x: number): number {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
}

function butterLowpass(fc: number, fs: number): Biquad {
  const w = Math.tan(Math.PI * fc / fs)
  const k = 1 / (1 + Math.SQRT2 * w + w * w)
  const b0 = w * w * k
  return new Biquad(b0, 2 * b0, b0, 2 * (w * w - 1) * k, (1 - Math.SQRT2 * w + w * w) * k)
}

function butterHighpass(fc: number, fs: number): Biquad {
  const w = Math.tan(Math.PI * fc / fs)
  const k = 1 / (1 + Math.SQRT2 * w + w * w)
  return new Biquad(k, -2 * k, k, 2 * (w * w - 1) * k, (1 - Math.SQRT2 * w + w * w) * k)
}

class RingBuffer {
  private buf: Float32Array
  private idx = 0
  private filled = false
  constructor(public readonly size: number) {
    this.buf = new Float32Array(size)
  }
  push(v: number) {
    this.buf[this.idx] = v
    this.idx = (this.idx + 1) % this.size
    if (this.idx === 0) this.filled = true
  }
  rms(): number {
    const n = this.filled ? this.size : this.idx
    if (n === 0) return 0
    let sum = 0
    for (let i = 0; i < n; i++) sum += this.buf[i] * this.buf[i]
    return Math.sqrt(sum / n)
  }
  zeroCrossingRate(): number {
    const n = this.filled ? this.size : this.idx
    if (n < 2) return 0
    let count = 0
    const start = this.filled ? this.idx : 0
    const len = this.filled ? this.size : this.idx
    let prev = this.buf[start]
    for (let i = 1; i < len; i++) {
      const v = this.buf[(start + i) % this.size]
      if ((prev >= 0) !== (v >= 0)) count++
      prev = v
    }
    return count / n
  }
}

export type ChannelFeatures = { lowRms: number; highRms: number; zcr: number; rawRms: number }
export type ContactQuality = 'good' | 'fair' | 'bad'

// Contact quality heuristic on the raw signal RMS over the 250 ms window.
// < ~3 μV  → flatline / disconnected
// > ~250 μV → rail / saturation / heavy drift
// Healthy resting EEG sits roughly 8–80 μV.
function classifyContact(rawRms: number): ContactQuality {
  if (rawRms < 3 || rawRms > 250) return 'bad'
  if (rawRms < 8 || rawRms > 120) return 'fair'
  return 'good'
}

export class GestureDetector {
  private lowFilter: Biquad[]
  private highFilter: Biquad[]
  private lowBuf: RingBuffer[]
  private highBuf: RingBuffer[]
  private rawBuf: RingBuffer[]

  constructor() {
    this.lowFilter  = Array.from({ length: 4 }, () => butterLowpass(LOW_CUTOFF, FS))
    this.highFilter = Array.from({ length: 4 }, () => butterHighpass(HIGH_CUTOFF, FS))
    this.lowBuf     = Array.from({ length: 4 }, () => new RingBuffer(WINDOW_SAMPLES))
    this.highBuf    = Array.from({ length: 4 }, () => new RingBuffer(WINDOW_SAMPLES))
    this.rawBuf     = Array.from({ length: 4 }, () => new RingBuffer(WINDOW_SAMPLES))
  }

  pushSamples(electrode: number, samples: number[]) {
    if (electrode < 0 || electrode > 3) return
    const lpf = this.lowFilter[electrode]
    const hpf = this.highFilter[electrode]
    const lbuf = this.lowBuf[electrode]
    const hbuf = this.highBuf[electrode]
    const rbuf = this.rawBuf[electrode]
    for (const x of samples) {
      lbuf.push(lpf.step(x))
      hbuf.push(hpf.step(x))
      rbuf.push(x)
    }
  }

  features(electrode: number): ChannelFeatures {
    return {
      lowRms: this.lowBuf[electrode].rms(),
      highRms: this.highBuf[electrode].rms(),
      zcr: this.highBuf[electrode].zeroCrossingRate(),
      rawRms: this.rawBuf[electrode].rms(),
    }
  }

  contactQuality(electrode: number): ContactQuality {
    return classifyContact(this.rawBuf[electrode].rms())
  }
}

// Compute the p-th percentile of an array (0 <= p <= 1). Robust to outliers in
// the way mean is not — one bad spike during calibration shouldn't poison the
// baseline. Used for "noise floor" measurement during the calibration window.
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1)
  return sorted[idx]
}
