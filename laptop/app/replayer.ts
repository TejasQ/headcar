// Offline replay of a saved recording through the current detector.
//
// Loads a .json recording, re-runs the same Butterworth + RMS + ZCR pipeline
// the live system uses, and applies the configured rules with the user's
// current sensitivity settings. Produces a per-segment report: how many
// forward / reverse triggers the rules WOULD have produced if those settings
// had been in effect during the original recording.
//
// Uses recording's baseline (captured at recording time) so per-session
// noise-floor effects are preserved; varies only the sensitivity multipliers,
// which is what the user is tuning.

import { GestureDetector, percentile as _p } from './detector'
import type { Recording, RecordingSegment } from './recorder'

export type ReplayResult = {
  segments: Array<{
    label: string
    note: string | undefined
    startTs: number
    durationMs: number
    originalForward: number
    originalReverse: number
    replayedForward: number
    replayedReverse: number
    // Trigger timestamps relative to segment start (ms). Used for latency
    // and inter-trigger-interval metrics in the validation panel.
    forwardTriggerOffsets: number[]
    reverseTriggerOffsets: number[]
  }>
  totalReplayedForward: number
  totalReplayedReverse: number
  metrics: ReplayMetrics
  config: {
    baselineAfHigh: number | null
    baselineTpHigh: number | null
    forwardSensitivity: number
    reverseSensitivity: number
  }
}

export type ReplayMetrics = {
  // Detection performance. Hit rate = triggers / expected_reps_per_segment,
  // aggregated across all clench (or eyebrow) segments. Can exceed 1.0 if the
  // detector fires more than once per intended gesture.
  expectedRepsPerSegment: number
  clenchSegments: number
  clenchTriggers: number
  clenchHitRate: number          // clenchTriggers / (clenchSegments * expectedReps)
  eyebrowSegments: number
  eyebrowTriggers: number
  eyebrowHitRate: number
  // False-positive rate: any trigger that fires during a rest segment.
  restSegments: number
  restDurationSec: number
  restFalsePositives: number      // forward + reverse triggers during rest
  falsePositivesPerMinute: number
  // Latency metrics, computed across clench segments that produced ≥1 trigger.
  // First-trigger latency = ms from segment start to first forward trigger.
  // Mean ITI = average gap between consecutive forward triggers within a
  // segment (only meaningful when a segment produces ≥2 triggers).
  meanFirstTriggerLatencyMs: number | null
  meanInterTriggerIntervalMs: number | null
}

type ReplayParams = {
  forwardSensitivity: number
  reverseSensitivity: number
  // Expected gesture repetitions per clench/eyebrow segment for hit-rate
  // computation. Matches the guided protocol's "5 clenches per segment".
  expectedRepsPerSegment?: number
  // Detection-rule constants kept aligned with page.tsx.
  emaAlpha?: number
  clenchMaxRatio?: number
  eyebrowMinRatio?: number
  clenchMinZcr?: number
  forwardDebounceTicks?: number
  forwardHoldMs?: number
  reversePulseMs?: number
  reverseCooldownMs?: number
}

export function replayRecording(rec: Recording, params: ReplayParams): ReplayResult {
  const EMA_ALPHA = params.emaAlpha ?? 0.3
  const CLENCH_MAX_RATIO = params.clenchMaxRatio ?? 1.6
  const EYEBROW_MIN_RATIO = params.eyebrowMinRatio ?? 1.6
  const CLENCH_MIN_ZCR = params.clenchMinZcr ?? 0.20
  const FORWARD_DEBOUNCE_TICKS = params.forwardDebounceTicks ?? 3
  const FORWARD_HOLD_MS = params.forwardHoldMs ?? 200
  const REVERSE_COOLDOWN_MS = params.reverseCooldownMs ?? 1500
  const EXPECTED_REPS = params.expectedRepsPerSegment ?? 5
  void params.reversePulseMs  // accepted for parity with live config; unused offline

  // Replay only makes sense if a baseline exists in the file.
  const baseline = rec.meta.baseline
  const emptyMetrics: ReplayMetrics = {
    expectedRepsPerSegment: EXPECTED_REPS,
    clenchSegments: 0, clenchTriggers: 0, clenchHitRate: 0,
    eyebrowSegments: 0, eyebrowTriggers: 0, eyebrowHitRate: 0,
    restSegments: 0, restDurationSec: 0, restFalsePositives: 0,
    falsePositivesPerMinute: 0,
    meanFirstTriggerLatencyMs: null, meanInterTriggerIntervalMs: null,
  }

  if (!baseline) {
    return {
      segments: rec.segments.map(s => ({
        label: s.label, note: s.note, startTs: s.startTs, durationMs: s.durationMs,
        originalForward: s.forwardTriggers, originalReverse: s.reverseTriggers,
        replayedForward: 0, replayedReverse: 0,
        forwardTriggerOffsets: [], reverseTriggerOffsets: [],
      })),
      totalReplayedForward: 0, totalReplayedReverse: 0,
      metrics: emptyMetrics,
      config: { baselineAfHigh: null, baselineTpHigh: null,
                forwardSensitivity: params.forwardSensitivity,
                reverseSensitivity: params.reverseSensitivity },
    }
  }

  const tpThrFwd = baseline.tpHigh * params.forwardSensitivity
  const afThrRev = baseline.afHigh * params.reverseSensitivity

  const detector = new GestureDetector()
  const packets = [...rec.eegPackets].sort((a, b) => a.ts - b.ts)
  if (packets.length === 0) {
    return {
      segments: [], totalReplayedForward: 0, totalReplayedReverse: 0,
      metrics: emptyMetrics,
      config: { baselineAfHigh: baseline.afHigh, baselineTpHigh: baseline.tpHigh,
                forwardSensitivity: params.forwardSensitivity,
                reverseSensitivity: params.reverseSensitivity },
    }
  }

  // Per-segment trigger counts and timestamps (absolute ts).
  const segTriggers: Array<{ fwd: number; rev: number; fwdTs: number[]; revTs: number[] }> =
    rec.segments.map(() => ({ fwd: 0, rev: 0, fwdTs: [], revTs: [] }))
  const findSegment = (ts: number): number =>
    rec.segments.findIndex(s => ts >= s.startTs && ts <= s.endTs)

  // Replay state — mirrors the live detector's ref-tracked state.
  let emaAf = 0, emaTp = 0
  let forwardConsec = 0
  let forwardActiveUntil = 0
  let lastReverse = -Infinity
  let forwardWasActive = false
  let nextTick = packets[0].ts  // simulate 20 Hz tick boundaries
  const TICK_MS = 50

  for (const pkt of packets) {
    detector.pushSamples(pkt.electrode, pkt.samples)
    // Run a tick when packet ts crosses the next tick boundary.
    while (pkt.ts >= nextTick) {
      const now = nextTick
      const f0 = detector.features(0), f1 = detector.features(1)
      const f2 = detector.features(2), f3 = detector.features(3)
      const afRaw = (f1.highRms + f2.highRms) / 2
      const tpRaw = (f0.highRms + f3.highRms) / 2
      emaAf = EMA_ALPHA * afRaw + (1 - EMA_ALPHA) * emaAf
      emaTp = EMA_ALPHA * tpRaw + (1 - EMA_ALPHA) * emaTp
      const ratio = emaAf / Math.max(emaTp, 1)
      const emg = f0.zcr > CLENCH_MIN_ZCR || f1.zcr > CLENCH_MIN_ZCR ||
                  f2.zcr > CLENCH_MIN_ZCR || f3.zcr > CLENCH_MIN_ZCR

      // FORWARD rule
      const fwdRule = emg && emaTp > tpThrFwd && ratio < CLENCH_MAX_RATIO
      if (fwdRule) {
        forwardConsec++
        if (forwardConsec >= FORWARD_DEBOUNCE_TICKS) {
          forwardActiveUntil = now + FORWARD_HOLD_MS
        }
      } else {
        forwardConsec = 0
      }

      // REVERSE rule (only if not currently forward-live)
      const forwardLive = now < forwardActiveUntil
      if (!forwardLive && emg && emaAf > afThrRev && ratio > EYEBROW_MIN_RATIO) {
        if (now - lastReverse >= REVERSE_COOLDOWN_MS) {
          lastReverse = now
          const segIdx = findSegment(now)
          if (segIdx >= 0) {
            segTriggers[segIdx].rev++
            segTriggers[segIdx].revTs.push(now)
          }
        }
      }

      // Forward edge-trigger detection (same as live).
      const fwdLive = now < forwardActiveUntil
      if (fwdLive && !forwardWasActive) {
        const segIdx = findSegment(now)
        if (segIdx >= 0) {
          segTriggers[segIdx].fwd++
          segTriggers[segIdx].fwdTs.push(now)
        }
        forwardWasActive = true
      } else if (!fwdLive && forwardWasActive) {
        forwardWasActive = false
      }

      nextTick += TICK_MS
    }
  }

  const segments = rec.segments.map((s: RecordingSegment, i) => ({
    label: s.label,
    note: s.note,
    startTs: s.startTs,
    durationMs: s.durationMs,
    originalForward: s.forwardTriggers,
    originalReverse: s.reverseTriggers,
    replayedForward: segTriggers[i].fwd,
    replayedReverse: segTriggers[i].rev,
    forwardTriggerOffsets: segTriggers[i].fwdTs.map(t => t - s.startTs),
    reverseTriggerOffsets: segTriggers[i].revTs.map(t => t - s.startTs),
  }))

  // ── Validation metrics ────────────────────────────────────────────
  const clenchSegs = segments.filter(s => s.label === 'clench')
  const eyebrowSegs = segments.filter(s => s.label === 'eyebrow')
  const restSegs = segments.filter(s => s.label === 'rest')

  const clenchTriggers = clenchSegs.reduce((sum, s) => sum + s.replayedForward, 0)
  const eyebrowTriggers = eyebrowSegs.reduce((sum, s) => sum + s.replayedReverse, 0)

  const restDurationMs = restSegs.reduce((sum, s) => sum + s.durationMs, 0)
  const restFalsePositives = restSegs.reduce((sum, s) =>
    sum + s.replayedForward + s.replayedReverse, 0)
  const restDurationSec = restDurationMs / 1000

  // First-trigger latency: only meaningful for clench segments that fired.
  const firstTriggerLatencies = clenchSegs
    .filter(s => s.forwardTriggerOffsets.length > 0)
    .map(s => s.forwardTriggerOffsets[0])
  const meanFirstTriggerLatencyMs = firstTriggerLatencies.length > 0
    ? firstTriggerLatencies.reduce((a, b) => a + b, 0) / firstTriggerLatencies.length
    : null

  // Inter-trigger interval: average gap between consecutive triggers within
  // each clench segment, averaged across segments that produced ≥2 triggers.
  const itiMeans: number[] = []
  for (const s of clenchSegs) {
    if (s.forwardTriggerOffsets.length < 2) continue
    const gaps: number[] = []
    for (let j = 1; j < s.forwardTriggerOffsets.length; j++) {
      gaps.push(s.forwardTriggerOffsets[j] - s.forwardTriggerOffsets[j - 1])
    }
    itiMeans.push(gaps.reduce((a, b) => a + b, 0) / gaps.length)
  }
  const meanInterTriggerIntervalMs = itiMeans.length > 0
    ? itiMeans.reduce((a, b) => a + b, 0) / itiMeans.length
    : null

  const metrics: ReplayMetrics = {
    expectedRepsPerSegment: EXPECTED_REPS,
    clenchSegments: clenchSegs.length,
    clenchTriggers,
    clenchHitRate: clenchSegs.length > 0
      ? clenchTriggers / (clenchSegs.length * EXPECTED_REPS) : 0,
    eyebrowSegments: eyebrowSegs.length,
    eyebrowTriggers,
    eyebrowHitRate: eyebrowSegs.length > 0
      ? eyebrowTriggers / (eyebrowSegs.length * EXPECTED_REPS) : 0,
    restSegments: restSegs.length,
    restDurationSec,
    restFalsePositives,
    falsePositivesPerMinute: restDurationSec > 0
      ? (restFalsePositives / restDurationSec) * 60 : 0,
    meanFirstTriggerLatencyMs,
    meanInterTriggerIntervalMs,
  }

  return {
    segments,
    totalReplayedForward: segments.reduce((s, x) => s + x.replayedForward, 0),
    totalReplayedReverse: segments.reduce((s, x) => s + x.replayedReverse, 0),
    metrics,
    config: {
      baselineAfHigh: baseline.afHigh,
      baselineTpHigh: baseline.tpHigh,
      forwardSensitivity: params.forwardSensitivity,
      reverseSensitivity: params.reverseSensitivity,
    },
  }
}

// Silence unused-import warning while keeping the type-safe import.
void _p
