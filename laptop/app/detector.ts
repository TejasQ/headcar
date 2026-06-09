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

// Tuning constants. FS comes from the hardware; the rest are design choices.
// At 256 Hz, 64 samples = 64/256 s = 0.25 s, hence "250 ms window".
const FS = 256           // Muse 2 EEG sample rate (Hz)
const WINDOW_SAMPLES = 64 // 250 ms window
const LOW_CUTOFF = 10    // Hz — blink band upper edge
const HIGH_CUTOFF = 20   // Hz — EMG band lower edge

// A "biquad" is one stage of a digital filter — it takes a stream of samples and
// lets some frequencies through while attenuating others. step() processes ONE
// sample at a time and remembers a little history (z1, z2) between calls; that
// memory is what makes it a filter rather than a plain formula. You don't need
// the math to read the program: think of it as a black box "frequency sieve"
// configured by the 5 coefficients (b0,b1,b2,a1,a2). The butter* functions below
// compute those coefficients; this class just applies them.
class Biquad {
  private z1 = 0   // internal state ("delay line") carried between samples
  private z2 = 0
  // The `private x` parameter syntax is TypeScript shorthand for "store this
  // constructor argument as a field" — saves writing this.b0 = b0, etc.
  constructor(
    private b0: number, private b1: number, private b2: number,
    private a1: number, private a2: number,
  ) {}
  // Standard Direct-Form-II Transposed difference equation. In: one raw sample x.
  // Out: one filtered sample y. Called once per EEG sample.
  step(x: number): number {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
}

// Factory functions: given a cutoff frequency, return a Biquad configured as a
// 2nd-order Butterworth filter. "Lowpass" keeps frequencies BELOW the cutoff
// (used to isolate slow blink energy); "highpass" keeps frequencies ABOVE it
// (used to isolate fast jaw-clench EMG). The trig/algebra is the standard
// bilinear-transform recipe — treat it as the formula that fills in the 5
// coefficients, not something you need to re-derive to follow the code.
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

// A fixed-size "sliding window" of the most recent samples. New samples overwrite
// the oldest, so it always holds the last `size` values (here, the last 250 ms)
// without ever growing or allocating — important when this runs hundreds of times
// a second. `idx` is the write position; it wraps back to 0 (that's the "ring"),
// and `filled` tracks whether we've wrapped at least once (i.e. the window is full).
class RingBuffer {
  private buf: Float32Array  // typed array = faster numeric storage than a normal []
  private idx = 0            // where the NEXT push() will write
  private filled = false     // true once the buffer has wrapped (is fully populated)
  constructor(public readonly size: number) {
    this.buf = new Float32Array(size)
  }
  push(v: number) {
    this.buf[this.idx] = v                  // overwrite the slot at idx
    this.idx = (this.idx + 1) % this.size   // advance, wrapping to 0 at the end (modulo %)
    if (this.idx === 0) this.filled = true  // we just wrapped → window now full
  }
  // RMS = root-mean-square: square every sample, average, square-root. It's a
  // measure of signal "energy"/amplitude in the window — a clench makes the
  // high-band RMS jump. n handles the not-yet-full case so early readings are valid.
  rms(): number {
    const n = this.filled ? this.size : this.idx
    if (n === 0) return 0
    let sum = 0
    for (let i = 0; i < n; i++) sum += this.buf[i] * this.buf[i]
    return Math.sqrt(sum / n)
  }
  // How often the signal crosses zero (changes sign) — a rough "how fast is it
  // wiggling" measure. EMG (muscle) is high-frequency, so a high ZCR helps
  // distinguish a real clench from a slow drift. Note it must read samples in
  // chronological order, hence the `start`/modulo bookkeeping below.
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

// Ties everything together. The Muse has 4 EEG electrodes (AF7, AF8, TP9, TP10),
// so every array below has length 4 — one filter/buffer PER electrode, kept
// independent. For each electrode we keep three views of the signal: low-band,
// high-band, and raw (unfiltered, used only for contact-quality checks).
//
// Usage pattern: call pushSamples() continuously as data streams in, then call
// features() whenever you want the current RMS/ZCR numbers to threshold against.
export class GestureDetector {
  private lowFilter: Biquad[]    // [4] one low-pass per electrode
  private highFilter: Biquad[]   // [4] one high-pass per electrode
  private lowBuf: RingBuffer[]   // [4] sliding window of low-band output
  private highBuf: RingBuffer[]  // [4] sliding window of high-band output
  private rawBuf: RingBuffer[]   // [4] sliding window of the raw signal

  constructor() {
    // Array.from({length:4}, factory) builds a 4-element array by calling the
    // factory 4 times — giving each electrode its OWN filter/buffer instance
    // (they must not share state). This is just "make 4 of these".
    this.lowFilter  = Array.from({ length: 4 }, () => butterLowpass(LOW_CUTOFF, FS))
    this.highFilter = Array.from({ length: 4 }, () => butterHighpass(HIGH_CUTOFF, FS))
    this.lowBuf     = Array.from({ length: 4 }, () => new RingBuffer(WINDOW_SAMPLES))
    this.highBuf    = Array.from({ length: 4 }, () => new RingBuffer(WINDOW_SAMPLES))
    this.rawBuf     = Array.from({ length: 4 }, () => new RingBuffer(WINDOW_SAMPLES))
  }

  // Feed new samples for ONE electrode through the pipeline. For each raw sample:
  // run it through both filters and store the filtered + raw values in their
  // windows. After this returns, features() reflects the updated windows.
  pushSamples(electrode: number, samples: number[]) {
    if (electrode < 0 || electrode > 3) return  // guard: only 4 valid electrodes (0–3)
    // Grab this electrode's own filters/buffers once (local aliases for speed/clarity).
    const lpf = this.lowFilter[electrode]
    const hpf = this.highFilter[electrode]
    const lbuf = this.lowBuf[electrode]
    const hbuf = this.highBuf[electrode]
    const rbuf = this.rawBuf[electrode]
    for (const x of samples) {
      lbuf.push(lpf.step(x))   // raw → low-pass filter → low-band window
      hbuf.push(hpf.step(x))   // raw → high-pass filter → high-band window
      rbuf.push(x)             // raw, unfiltered → raw window
    }
  }

  // Return the current summary numbers for one electrode. The detection rules
  // (in page.tsx / replayer.ts) compare these against calibrated thresholds —
  // e.g. "highRms above threshold AND zcr high → jaw clench".
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
