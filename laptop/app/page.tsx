'use client'

import { useEffect, useRef, useState } from 'react'
import { MuseClient } from 'muse-js'
import { GestureDetector, ContactQuality, percentile } from './detector'
import {
  Recording, RecordingEegPacket, RecordingAccel, RecordingEvent, RecordingSegment,
  SegmentLabel, downloadRecording,
} from './recorder'
import { replayRecording, ReplayResult } from './replayer'

const DEAD_ZONE = 0.1
// Steering: amplify head tilt → steer (raw accel tilt is small; scale it up past the
// dead zone toward ±1). Slider-tunable live (HEA-18); DEFAULT bumped 3.0 → 5.0 for
// more sensitivity out of the box.
const DEFAULT_STEER_GAIN = 4.0   // finalized 2026-06-17 on the live car (HEA-18)
const STEER_GAIN_MIN = 1.0
const STEER_GAIN_MAX = 12.0
// Steering axis. Despite the original "accelerometer X" design note, empirical
// validation (thesis 2026-05-29) showed left/right head roll lands on accel-Y
// for this Muse mounting — X barely moves across tilts while Y separates them
// cleanly and opposite-signed. Steering reads this axis.
const STEER_AXIS = 'y' as const

// Detection rule constants.
const CLENCH_MIN_ZCR = 0.20         // both gestures are EMG — high ZCR required
const FORWARD_HOLD_MS = 200         // grace period after rule stops being satisfied
const REVERSE_PULSE_MS = 800        // reverse duration for a one-shot/simulated trigger
const REVERSE_HOLD_MS = 250         // grace while the eyebrow is held: reverse stays on as
                                    // long as the rule keeps firing, with no burst/cooldown gap
const MANUAL_HOLD_MS = 2500         // manual Forward/Reverse button drive duration
const ENDURANCE_DRIVE = 0.6         // steady "typical load" for the HEA-17 battery-drain test

// AF/TP RATIO DISCRIMINATOR.
// Empirically measured on this user/hardware (thesis 2026-05-29 extended-2):
//   Clench ratio: 0.21–0.59 (TP-dominant — masseter EMG lands on TP9/TP10, not
//     AF, the same TP-primary effect found on 2026-05-27).
//   Eyebrow ratio: ~1.5–1.9 (AF-dominant, but the ear/auricularis co-fires
//     enough to keep TP non-trivial, so the ratio is well below the textbook 2–3).
// The cutoff was originally 1.6, which clipped the bottom of the eyebrow band and
// missed ~40% of raises.
// Re-measured 2026-06-15 (HEA-21, final headset fit, all 4 dots green): eyebrow
// ~1.2, clench ~0.43. Replaced the single 0.8 cutoff with a DEAD BAND for clearer
// separation: forward needs ratio < 0.6 (clearly TP-dominant), reverse needs
// ratio > 1.0 (clearly AF-dominant); 0.6–1.0 is no-man's-land where neither fires,
// so a clench and an eyebrow raise can't bleed into each other. The gate reads the
// extra-smoothed ratio, and each gesture is debounced + mutually exclusive.
const CLENCH_MAX_AFTP_RATIO   = 0.6   // forward: ratio must be BELOW this (TP-dominant)
const EYEBROW_MIN_AFTP_RATIO  = 1.0   // reverse: ratio must be ABOVE this (AF-dominant)

// Guided-test protocol. Scripted sequence of messages and segments with auto
// timing — the dashboard walks the user through "do light clenches now",
// "rest", etc., so a recording session has consistent structure across runs.
type ProtocolStep =
  | { type: 'message'; text: string; durationMs: number }
  | { type: 'segment'; label: 'clench' | 'eyebrow' | 'tilt' | 'rest';
      note?: string; instruction: string; durationMs: number }

const INTENSITY_PROTOCOL: ProtocolStep[] = [
  { type: 'message', text: 'Get ready — sit comfortably, hands relaxed. Starting in a few seconds…', durationMs: 5000 },
  { type: 'segment', label: 'rest', note: 'baseline', instruction: 'Sit still — establishing baseline', durationMs: 10000 },
  { type: 'message', text: 'Next: 5 LIGHT clenches. Hold each ~1.5 s, rest ~2.5 s between.', durationMs: 5000 },
  { type: 'segment', label: 'clench', note: 'light', instruction: 'LIGHT clenches × 5 — gentle effort', durationMs: 20000 },
  { type: 'segment', label: 'rest', note: 'between', instruction: 'Rest', durationMs: 7000 },
  { type: 'message', text: 'Next: 5 MEDIUM clenches.', durationMs: 5000 },
  { type: 'segment', label: 'clench', note: 'medium', instruction: 'MEDIUM clenches × 5 — moderate effort', durationMs: 20000 },
  { type: 'segment', label: 'rest', note: 'between', instruction: 'Rest', durationMs: 7000 },
  { type: 'message', text: 'Next: 5 HARD clenches.', durationMs: 5000 },
  { type: 'segment', label: 'clench', note: 'hard', instruction: 'HARD clenches × 5 — full effort', durationMs: 20000 },
  { type: 'segment', label: 'rest', note: 'final', instruction: 'Final rest', durationMs: 5000 },
  { type: 'message', text: 'Done. Click Save .json to download the recording.', durationMs: 3000 },
]

// Second protocol: exercises eyebrow-raise (reverse) and head-tilt (steer), the
// two controls the intensity protocol doesn't cover. Tilt segments carry a
// 'left' / 'right' note as ground-truth intended direction for the replay's
// tilt-scoring metric. Keep "head centered" cues in rest/baseline segments so
// the replayer can derive a neutral accel-X offset from the rest mean.
const EYEBROW_TILT_PROTOCOL: ProtocolStep[] = [
  { type: 'message', text: 'Get ready — sit comfortably, head centered, hands relaxed. Starting soon…', durationMs: 5000 },
  { type: 'segment', label: 'rest', note: 'baseline', instruction: 'Sit still, head centered — establishing baseline', durationMs: 10000 },
  { type: 'message', text: 'Next: 5 EYEBROW raises. Raise hard, hold ~1 s, relax ~3 s between.', durationMs: 5000 },
  { type: 'segment', label: 'eyebrow', note: 'raises', instruction: 'EYEBROW raises × 5', durationMs: 20000 },
  { type: 'segment', label: 'rest', note: 'between', instruction: 'Rest — head centered', durationMs: 7000 },
  { type: 'message', text: 'Next: tilt head LEFT and hold ~2 s, then center. Repeat 5×.', durationMs: 5000 },
  { type: 'segment', label: 'tilt', note: 'left', instruction: 'Tilt LEFT × 5 — hold, then center', durationMs: 20000 },
  { type: 'segment', label: 'rest', note: 'between', instruction: 'Rest — head centered', durationMs: 7000 },
  { type: 'message', text: 'Next: tilt head RIGHT and hold ~2 s, then center. Repeat 5×.', durationMs: 5000 },
  { type: 'segment', label: 'tilt', note: 'right', instruction: 'Tilt RIGHT × 5 — hold, then center', durationMs: 20000 },
  { type: 'segment', label: 'rest', note: 'final', instruction: 'Final rest — head centered', durationMs: 5000 },
  { type: 'message', text: 'Done. Click Save .json to download the recording.', durationMs: 3000 },
]

// Anti-jitter (see ReactEMG, PMC6679304 — EMG real-time gesture lit).
//   EMA: smooths the feature signal before rules run; ~50 ms added latency,
//        much cleaner input.
//   DEBOUNCE: forward must be satisfied for N consecutive evaluation ticks
//        (rule eval is throttled to 20 Hz) before going active — prevents a
//        single noisy tick from firing a forward burst.
const EMA_ALPHA = 0.3
const RATIO_EMA_ALPHA = 0.2         // extra smoothing for the displayed AF/TP ratio (HEA-21)
const FORWARD_DEBOUNCE_TICKS = 5    // 5 × 50 ms = 250 ms sustained signal required (raised
                                    // from 3 — HEA-21: brief noise spikes no longer trip forward)
const REVERSE_DEBOUNCE_TICKS = 3    // eyebrow must hold ~150 ms before reverse engages —
                                    // rejects brief AF spikes (reverse is held, not pulsed)

// Speed mapping. Forward intensity is tpHigh / tpThrFwd, where 1.0 = at threshold,
// 2.0 = saturation. We map [1.0, 2.0] → [MIN_FWD, MAX_FWD] for the drive value.
// Saturation lowered 3.0 → 2.0 (HEA-21): at 3.0 you needed ~6× baseline TP to hit
// full speed (unreachable), so speed felt flat. 2.0 ramps over a real clench range.
const MIN_FORWARD = 0.30  // minimum drive when barely clenching (overcome motor stiction)
const MAX_FORWARD = 1.00
const INTENSITY_SATURATION = 2.0   // tpHigh / tpThrFwd at which we hit MAX_FORWARD
const REVERSE_SPEED = 0.7

// Calibration window.
const CALIBRATION_MS = 5000
const CALIBRATION_PERCENTILE = 0.90

// Default sensitivities are gesture-specific now (forward and reverse have
// very different signal scales on this hardware — see thesis 2026-05-27 entry).
// Forward lowered 2 → 1.2 (HEA-21, 2026-06-15): at 2× a comfortable clench only
// reached 62% of the threshold (never triggered); 1.2× makes a comfortable clench
// the start-of-motion point. localStorage key bumped to .v7 so a stale slider value
// from before this retune is ignored on next load.
const DEFAULT_FORWARD_SENSITIVITY = 1.2
// Lowered from 4 → 3 after the 2026-05-29 eyebrow validation: 4× missed most
// raises (2/5); 3× recovers one more (3/5) with still zero false positives.
const DEFAULT_REVERSE_SENSITIVITY = 3
const SENSITIVITY_MIN = 1.0
const SENSITIVITY_MAX = 8

type Baseline = { afHigh: number; tpHigh: number }

export default function Home() {
  const [museStatus, setMuseStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [museError, setMuseError] = useState<string | null>(null)
  const [carStatus, setCarStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [carUrl, setCarUrl] = useState('ws://172.20.10.2:81')
  const [forwardActive, setForwardActive] = useState(false)
  const [forwardSpeed, setForwardSpeed] = useState(0)
  const [reverseActive, setReverseActive] = useState(false)
  const [accel, setAccel] = useState({ x: 0, y: 0, z: 0 })
  const [simulating, setSimulating] = useState(false)
  const [armed, setArmed] = useState(false)   // "listening": when false the car ignores the Muse
  const [enduranceOn, setEnduranceOn] = useState(false)  // HEA-17 endurance / battery-drain test running
  const [enduranceElapsed, setEnduranceElapsed] = useState(0)  // seconds (live while running, frozen at cutoff)
  const [log, setLog] = useState<string[]>([])
  const [accelOffset, setAccelOffset] = useState(0)

  const [forwardSensitivity, setForwardSensitivity] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_FORWARD_SENSITIVITY
    const v = Number(localStorage.getItem('forwardSensitivity.v7'))
    return v || DEFAULT_FORWARD_SENSITIVITY
  })
  const [reverseSensitivity, setReverseSensitivity] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_REVERSE_SENSITIVITY
    const v = Number(localStorage.getItem('reverseSensitivity.v6'))
    return v || DEFAULT_REVERSE_SENSITIVITY
  })
  const [steerGain, setSteerGain] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_STEER_GAIN
    const v = Number(localStorage.getItem('steerGain.v1'))
    return v || DEFAULT_STEER_GAIN
  })

  const [baseline, setBaseline] = useState<Baseline | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrationLeft, setCalibrationLeft] = useState(0)

  const [meters, setMeters] = useState([
    { lowRms: 0, highRms: 0, zcr: 0, rawRms: 0 },
    { lowRms: 0, highRms: 0, zcr: 0, rawRms: 0 },
    { lowRms: 0, highRms: 0, zcr: 0, rawRms: 0 },
    { lowRms: 0, highRms: 0, zcr: 0, rawRms: 0 },
  ])
  // Live EMA-smoothed group means, surfaced from refs so Forward/Reverse cards
  // can show a "live preview" bar even before a trigger fires.
  const [liveSignal, setLiveSignal] = useState({ afEma: 0, tpEma: 0, ratio: 0 })

  // Replay state. Loaded file + most recent replay result.
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null)
  const [replayFilename, setReplayFilename] = useState<string | null>(null)
  const [loadedRecording, setLoadedRecording] = useState<Recording | null>(null)
  const [contacts, setContacts] = useState<ContactQuality[]>(['bad', 'bad', 'bad', 'bad'])

  const wsRef = useRef<WebSocket | null>(null)
  const museClientRef = useRef<MuseClient | null>(null)
  const simTimers = useRef<ReturnType<typeof setInterval>[]>([])
  const accelRef = useRef({ x: 0, y: 0, z: 0 })
  const accelOffsetRef = useRef(0)

  // Detection state — derived from calibration baseline × sensitivity.
  // AF forward threshold removed — see thesis 2026-05-27: AF doesn't track
  // masseter EMG on this hardware, forward rule is TP-primary.
  const tpThrFwdRef = useRef(Infinity)
  const afThrRevRef = useRef(Infinity)

  // EMA-smoothed feature values, updated each meter tick.
  const afSmoothedRef = useRef(0)
  const tpSmoothedRef = useRef(0)
  const ratioSmoothedRef = useRef(0)

  // Consecutive-tick counter for the forward debounce. Counts ticks where the
  // forward rule conditions hold; resets to 0 the moment a tick fails. Forward
  // goes active when this hits FORWARD_DEBOUNCE_TICKS.
  const forwardConsecutiveRef = useRef(0)

  // Session recorder. While `recordingRef.current` is true, EEG packets, accel
  // samples, detector events, and drive commands are appended to ref-buffers.
  // Within a recording, the user explicitly opens and closes labeled segments
  // (clench / eyebrow / tilt / rest) so each gesture attempt has a ground-truth
  // time-range. Saved as JSON on demand. See `recorder.ts` for the format.
  const [recording, setRecording] = useState(false)
  const [recordingTickStats, setRecordingTickStats] = useState({ eeg: 0, accel: 0, events: 0, seconds: 0 })
  const [hasUnsavedRecording, setHasUnsavedRecording] = useState(false)
  const [segments, setSegments] = useState<RecordingSegment[]>([])
  type ActiveSegment = {
    label: SegmentLabel; note?: string; startTs: number; eegStart: number;
    fwdStart: number; revStart: number;
  }
  const [activeSegment, setActiveSegment] = useState<ActiveSegment | null>(null)
  // Mirror of activeSegment used by setTimeout callbacks. React state is async,
  // so a callback scheduled inside beginSegmentInternal would see a stale
  // activeSegment value when it later tries to end the segment.
  const activeSegmentRef = useRef<ActiveSegment | null>(null)

  // Guided-protocol runner state.
  const [protocolRunning, setProtocolRunning] = useState(false)
  const [protocolStepIdx, setProtocolStepIdx] = useState(0)
  const [protocolStepLeft, setProtocolStepLeft] = useState(0)
  // The protocol currently being run. State drives the live banner; the ref is
  // read inside the setTimeout step chain (closures would otherwise capture a
  // stale value).
  const [activeProtocol, setActiveProtocol] = useState<ProtocolStep[]>(INTENSITY_PROTOCOL)
  const activeProtocolRef = useRef<ProtocolStep[]>(INTENSITY_PROTOCOL)
  const protocolTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const protocolStepEndsAtRef = useRef(0)
  const [lastSegmentSummary, setLastSegmentSummary] = useState<string | null>(null)

  const recordingRef = useRef(false)
  const eegBufRef = useRef<RecordingEegPacket[]>([])
  const accelBufRef = useRef<RecordingAccel[]>([])
  const eventBufRef = useRef<RecordingEvent[]>([])
  const recordingStartRef = useRef(0)
  // Forward state-edge tracker so we can emit forward_trigger / forward_end events.
  const forwardWasActiveRef = useRef(false)
  // Mirrors of trigger counts used to compute per-segment summary stats.
  const forwardTriggerCountRef = useRef(0)
  const reverseTriggerCountRef = useRef(0)

  // Gesture state used by the drive streamer.
  const forwardActiveUntilRef = useRef(0)
  const forwardSpeedRef = useRef(0)
  const reverseUntilRef = useRef(0)
  const reverseOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reverseConsecutiveRef = useRef(0)
  const armedRef = useRef(false)
  const steerGainRef = useRef(DEFAULT_STEER_GAIN)
  const drivingFlagRef = useRef(false)

  const detectorRef = useRef(new GestureDetector())
  const meterLastUpdate = useRef(0)

  const calibrationAfHigh = useRef<number[]>([])
  const calibrationTpHigh = useRef<number[]>([])
  const calibratingRef = useRef(false)
  const calibrationCountdown = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derive thresholds whenever baseline or sensitivities change.
  useEffect(() => {
    if (!baseline) {
      tpThrFwdRef.current = Infinity
      afThrRevRef.current = Infinity
      return
    }
    tpThrFwdRef.current = baseline.tpHigh * forwardSensitivity
    afThrRevRef.current = baseline.afHigh * reverseSensitivity
  }, [baseline, forwardSensitivity, reverseSensitivity])

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLog(prev => [`${time}  ${msg}`, ...prev].slice(0, 10))
  }

  function recordEvent(type: string, data?: Record<string, number | string | boolean>) {
    if (!recordingRef.current) return
    eventBufRef.current.push({ ts: Date.now(), type, data })
  }

  // Confirm before discarding an unsaved recording. Returns true if the caller
  // should proceed (user agreed to discard, or saved first), false to abort.
  function confirmDiscardUnsaved(): boolean {
    if (!hasUnsavedRecording) return true
    const choice = window.confirm(
      'You have an unsaved recording from your previous session.\n\n' +
      'Click OK to discard it and start fresh.\n' +
      'Click Cancel to keep it (save it first using the Save .json button).'
    )
    if (choice) setHasUnsavedRecording(false)
    return choice
  }

  function startRecording() {
    if (hasUnsavedRecording && !confirmDiscardUnsaved()) return
    eegBufRef.current = []
    accelBufRef.current = []
    eventBufRef.current = []
    forwardTriggerCountRef.current = 0
    reverseTriggerCountRef.current = 0
    recordingStartRef.current = Date.now()
    setSegments([])
    activeSegmentRef.current = null
    setActiveSegment(null)
    setLastSegmentSummary(null)
    setRecordingTickStats({ eeg: 0, accel: 0, events: 0, seconds: 0 })
    setHasUnsavedRecording(false)
    setRecording(true)
    recordingRef.current = true
    addLog('● recording started')
    if (baseline) {
      recordEvent('session_config', {
        baselineAfHigh: baseline.afHigh,
        baselineTpHigh: baseline.tpHigh,
        forwardSensitivity,
        reverseSensitivity,
      })
    }
  }

  function endSegmentInternal(now: number): RecordingSegment | null {
    const cur = activeSegmentRef.current
    if (!cur) return null
    const seg: RecordingSegment = {
      label: cur.label,
      note: cur.note,
      startTs: cur.startTs,
      endTs: now,
      durationMs: now - cur.startTs,
      forwardTriggers: forwardTriggerCountRef.current - cur.fwdStart,
      reverseTriggers: reverseTriggerCountRef.current - cur.revStart,
      eegPackets: eegBufRef.current.length - cur.eegStart,
    }
    setSegments(prev => [...prev, seg])
    activeSegmentRef.current = null
    setActiveSegment(null)
    recordEvent('segment_end', { label: seg.label, note: seg.note ?? '' })
    const noteSuffix = seg.note ? ` (${seg.note})` : ''
    const summary = `✓ ${seg.label}${noteSuffix} — ${(seg.durationMs / 1000).toFixed(1)}s, ${seg.eegPackets} EEG, ${seg.forwardTriggers} fwd, ${seg.reverseTriggers} rev`
    setLastSegmentSummary(summary)
    addLog(summary)
    return seg
  }

  function beginSegmentInternal(label: SegmentLabel, note: string | undefined, now: number) {
    const seg = {
      label,
      note,
      startTs: now,
      eegStart: eegBufRef.current.length,
      fwdStart: forwardTriggerCountRef.current,
      revStart: reverseTriggerCountRef.current,
    }
    activeSegmentRef.current = seg
    setActiveSegment(seg)
    setLastSegmentSummary(null)
    recordEvent('segment_start', { label, note: note ?? '' })
    addLog(`▸ ${label}${note ? ` (${note})` : ''} segment started`)
  }

  function toggleSegment(label: SegmentLabel) {
    if (!recordingRef.current) {
      addLog('⚠ start a recording first')
      return
    }
    const now = Date.now()
    if (activeSegment?.label === label) {
      endSegmentInternal(now)
      return
    }
    if (activeSegment) {
      endSegmentInternal(now)
    }
    beginSegmentInternal(label, undefined, now)
  }

  function stopRecording() {
    if (!recordingRef.current) return
    const now = Date.now()
    if (activeSegmentRef.current) endSegmentInternal(now)
    recordingRef.current = false
    setRecording(false)
    setHasUnsavedRecording(eegBufRef.current.length > 0 || accelBufRef.current.length > 0 || eventBufRef.current.length > 0)
    const dur = ((now - recordingStartRef.current) / 1000).toFixed(1)
    addLog(`■ recording stopped — ${dur}s, ${eegBufRef.current.length} EEG packets`)
  }

  function saveRecording() {
    if (eegBufRef.current.length === 0 && accelBufRef.current.length === 0 && eventBufRef.current.length === 0) {
      addLog('⚠ nothing to save')
      return
    }
    const now = Date.now()
    const startedAt = new Date(recordingStartRef.current).toISOString()
    const rec: Recording = {
      version: 2,
      startedAt,
      endedAt: new Date(now).toISOString(),
      duration: now - recordingStartRef.current,
      meta: {
        baseline,
        forwardSensitivity,
        reverseSensitivity,
      },
      segments,
      eegPackets: eegBufRef.current,
      accelSamples: accelBufRef.current,
      events: eventBufRef.current,
    }
    downloadRecording(rec)
    setHasUnsavedRecording(false)
    addLog(`saved recording (${(rec.duration / 1000).toFixed(1)}s, ${segments.length} segments)`)
  }

  // ── Replay (offline tuning against a saved recording) ──────────────
  async function handleReplayFile(file: File) {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Recording
      if (parsed.version !== 2) {
        addLog(`⚠ unsupported recording version: ${parsed.version}`)
        return
      }
      setLoadedRecording(parsed)
      setReplayFilename(file.name)
      addLog(`loaded ${file.name} (${parsed.eegPackets.length} EEG packets, ${parsed.segments.length} segments)`)
      runReplay(parsed)
    } catch (e) {
      addLog(`⚠ failed to load: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  function runReplay(rec: Recording) {
    const result = replayRecording(rec, { forwardSensitivity, reverseSensitivity })
    setReplayResult(result)
    const dt = (result.totalReplayedForward !== 0 || result.totalReplayedReverse !== 0)
      ? `${result.totalReplayedForward} fwd, ${result.totalReplayedReverse} rev`
      : 'no triggers — try lower sensitivity'
    addLog(`replay done @ fwd ${forwardSensitivity}× / rev ${reverseSensitivity}× → ${dt}`)
  }

  // ── Guided-protocol runner ─────────────────────────────────────────
  function startProtocol(protocol: ProtocolStep[]) {
    if (museStatus !== 'connected' && !simulating) {
      addLog('⚠ guided test needs a connected Muse')
      return
    }
    if (!baseline && !simulating) {
      addLog('⚠ no baseline — click Recalibrate first, then start the test')
      return
    }
    if (recordingRef.current) {
      addLog('⚠ stop the current recording first')
      return
    }
    if (hasUnsavedRecording && !confirmDiscardUnsaved()) return
    activeProtocolRef.current = protocol
    setActiveProtocol(protocol)
    startRecording()
    setProtocolRunning(true)
    setProtocolStepIdx(0)
    runProtocolStep(0)
  }

  function runProtocolStep(idx: number) {
    const protocol = activeProtocolRef.current
    if (idx >= protocol.length) {
      finishProtocol(false)
      return
    }
    const step = protocol[idx]
    const now = Date.now()
    setProtocolStepIdx(idx)
    protocolStepEndsAtRef.current = now + step.durationMs
    setProtocolStepLeft(Math.ceil(step.durationMs / 1000))

    if (step.type === 'segment') {
      beginSegmentInternal(step.label, step.note, now)
    }

    if (protocolTimer.current) clearTimeout(protocolTimer.current)
    protocolTimer.current = setTimeout(() => {
      if (step.type === 'segment') endSegmentInternal(Date.now())
      runProtocolStep(idx + 1)
    }, step.durationMs)
  }

  function cancelProtocol() {
    if (protocolTimer.current) clearTimeout(protocolTimer.current)
    protocolTimer.current = null
    setProtocolRunning(false)
    if (activeSegmentRef.current) endSegmentInternal(Date.now())
    stopRecording()
    addLog('guided test cancelled')
  }

  function finishProtocol(cancelled: boolean) {
    if (protocolTimer.current) clearTimeout(protocolTimer.current)
    protocolTimer.current = null
    setProtocolRunning(false)
    stopRecording()
    if (!cancelled) addLog('✓ guided test complete — click Save .json')
  }

  // Drive the countdown display while a protocol step is active.
  useEffect(() => {
    if (!protocolRunning) return
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((protocolStepEndsAtRef.current - Date.now()) / 1000))
      setProtocolStepLeft(remaining)
    }, 200)
    return () => clearInterval(id)
  }, [protocolRunning, protocolStepIdx])

  function discardRecording() {
    eegBufRef.current = []
    accelBufRef.current = []
    eventBufRef.current = []
    setSegments([])
    activeSegmentRef.current = null
    setActiveSegment(null)
    setLastSegmentSummary(null)
    setHasUnsavedRecording(false)
    addLog('recording discarded')
  }

  const manualTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const manualStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Endurance / battery-drain test (HEA-17): its own resend interval + an
  // active-flag the streaming loop checks so Muse control yields while it runs.
  const enduranceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const enduranceOnRef = useRef(false)
  const enduranceStartRef = useRef(0)                                          // ms timestamp the test started
  const enduranceTickRef = useRef<ReturnType<typeof setInterval> | null>(null) // 1 Hz on-screen timer

  function sendRaw(cmd: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd)
    }
  }

  // Cancel any in-flight manual-drive hold (its resend interval + auto-stop timer).
  function clearManualHold() {
    if (manualTimerRef.current) { clearInterval(manualTimerRef.current); manualTimerRef.current = null }
    if (manualStopRef.current) { clearTimeout(manualStopRef.current); manualStopRef.current = null }
  }

  // Manual button drive. The car's 500 ms watchdog stops a single command almost
  // immediately, so to get a clearly visible ~MANUAL_HOLD_MS of motion we resend
  // the value every 200 ms (before the watchdog expires), then send drive:0.
  // value 0 = immediate stop, and cancels any active hold.
  function manualDrive(value: number, label: string) {
    clearManualHold()
    if (value === 0) {
      sendRaw('drive:0')
      addLog(`→ drive:0 (${label})`)
      recordEvent('manual_drive', { value, label })
      return
    }
    sendRaw(`drive:${value.toFixed(2)}`)
    manualTimerRef.current = setInterval(() => sendRaw(`drive:${value.toFixed(2)}`), 200)
    manualStopRef.current = setTimeout(() => {
      clearManualHold()
      sendRaw('drive:0')
    }, MANUAL_HOLD_MS)
    addLog(`→ drive:${value.toFixed(2)} (${label}, ${(MANUAL_HOLD_MS / 1000).toFixed(1)}s hold)`)
    recordEvent('manual_drive', { value, label })
  }

  // Endurance / battery-drain test (HEA-17). Drives a steady "typical load" value,
  // resending every 200 ms to beat the car's 500 ms watchdog, with NO auto-stop —
  // it runs until you stop it OR the car drops off the network (battery cutoff).
  // An on-screen timer counts up the whole time and freezes at the final runtime;
  // the value is logged and saved into any active recording, so nothing needs
  // noting by hand. Disarms Muse control and the streaming loop yields to it so
  // nothing fights the steady command.
  function finishEndurance(reason: 'manual' | 'cutoff') {
    if (enduranceTimerRef.current) { clearInterval(enduranceTimerRef.current); enduranceTimerRef.current = null }
    if (enduranceTickRef.current) { clearInterval(enduranceTickRef.current); enduranceTickRef.current = null }
    if (!enduranceOnRef.current) return
    enduranceOnRef.current = false
    const seconds = Math.round((Date.now() - enduranceStartRef.current) / 1000)
    setEnduranceElapsed(seconds)    // freeze the on-screen timer at the final runtime
    setEnduranceOn(false)
    sendRaw('drive:0')              // harmless no-op if the link already dropped
    const mmss = `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
    addLog(reason === 'cutoff'
      ? `■ car lost power (battery cutoff) after ${mmss}`
      : `■ endurance test stopped at ${mmss}`)
    recordEvent('endurance_test', { state: reason, seconds })
  }

  function toggleEndurance() {
    if (enduranceOnRef.current) { finishEndurance('manual'); return }
    clearManualHold()
    setArmed(false)                 // gate off Muse-driven control during the test
    drivingFlagRef.current = false  // suppress the loop's transition drive:0
    enduranceOnRef.current = true
    enduranceStartRef.current = Date.now()
    setEnduranceElapsed(0)
    setEnduranceOn(true)
    sendRaw(`drive:${ENDURANCE_DRIVE.toFixed(2)}`)
    // Resend to beat the watchdog; if the socket has dropped, the car lost power
    // → that's the cutoff, so finalize and freeze the timer.
    enduranceTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(`drive:${ENDURANCE_DRIVE.toFixed(2)}`)
      } else {
        finishEndurance('cutoff')
      }
    }, 200)
    enduranceTickRef.current = setInterval(() => {
      setEnduranceElapsed(Math.round((Date.now() - enduranceStartRef.current) / 1000))
    }, 1000)
    addLog(`▶ endurance test started (drive ${ENDURANCE_DRIVE}) — timing until cutoff`)
    recordEvent('endurance_test', { state: 'start', value: ENDURANCE_DRIVE })
  }

  function updateAccel(val: { x: number; y: number; z: number }) {
    setAccel(val)
    accelRef.current = val
  }

  function calibrateTilt() {
    const offset = accelRef.current[STEER_AXIS]
    setAccelOffset(offset)
    accelOffsetRef.current = offset
    addLog(`tilt calibrated — offset ${offset.toFixed(3)}`)
  }

  function startCalibration() {
    if (museStatus !== 'connected') {
      addLog('⚠ calibration needs a connected Muse')
      return
    }
    calibrationAfHigh.current = []
    calibrationTpHigh.current = []
    setCalibrating(true)
    calibratingRef.current = true
    setCalibrationLeft(Math.round(CALIBRATION_MS / 1000))
    addLog('calibrating — sit still, don\'t clench or raise eyebrows')

    if (calibrationCountdown.current) clearInterval(calibrationCountdown.current)
    calibrationCountdown.current = setInterval(() => {
      setCalibrationLeft(prev => Math.max(0, prev - 1))
    }, 1000)

    setTimeout(() => {
      if (calibrationCountdown.current) clearInterval(calibrationCountdown.current)
      calibratingRef.current = false
      setCalibrating(false)

      const afHigh = percentile(calibrationAfHigh.current, CALIBRATION_PERCENTILE)
      const tpHigh = percentile(calibrationTpHigh.current, CALIBRATION_PERCENTILE)
      if (afHigh < 1 || tpHigh < 1) {
        addLog('⚠ calibration failed — check contact and retry')
        return
      }
      setBaseline({ afHigh, tpHigh })
      addLog(`baseline afHigh=${afHigh.toFixed(1)} tpHigh=${tpHigh.toFixed(1)}`)
      recordEvent('calibration_complete', { afHigh, tpHigh })
    }, CALIBRATION_MS)
  }

  // Held reverse: called every tick the eyebrow rule is satisfied. Each call extends
  // the reverse window by holdMs, so a sustained eyebrow raise = continuous reverse
  // (no 800 ms pulse + cooldown bursting). The off-timer is re-armed every call and
  // only fires holdMs after the LAST call — i.e. once the eyebrow drops.
  function triggerReverse(holdMs = REVERSE_HOLD_MS) {
    const now = Date.now()
    const wasLive = now < reverseUntilRef.current
    reverseUntilRef.current = now + holdMs
    if (!wasLive) {                       // rising edge = a new reverse session
      setReverseActive(true)
      addLog('eyebrow → reverse')
      reverseTriggerCountRef.current++
      recordEvent('reverse_trigger')
    }
    if (reverseOffTimerRef.current) clearTimeout(reverseOffTimerRef.current)
    reverseOffTimerRef.current = setTimeout(() => setReverseActive(false), holdMs)
  }

  function connectCar() {
    wsRef.current?.close()
    setCarStatus('connecting')
    const ws = new WebSocket(carUrl)
    wsRef.current = ws
    ws.onopen = () => { setCarStatus('connected'); addLog('car connected') }
    ws.onclose = () => { setCarStatus('disconnected'); addLog('car disconnected') }
    ws.onerror = () => setCarStatus('error')
  }

  // Closing the socket fires ws.onclose above, which sets the status + logs.
  function disconnectCar() {
    wsRef.current?.close()
  }

  async function disconnectMuse() {
    try { await museClientRef.current?.disconnect() } catch { /* already gone */ }
    museClientRef.current = null
    setMuseStatus('idle')
    addLog('muse disconnected')
  }

  async function connectMuse() {
    setMuseStatus('connecting')
    setMuseError(null)
    try {
      const client = new MuseClient()
      museClientRef.current = client
      await client.connect()
      await client.start()
      setMuseStatus('connected')

      client.accelerometerData.subscribe(data => {
        const s = data.samples[0]
        updateAccel({ x: s.x, y: s.y, z: s.z })
        if (recordingRef.current) {
          accelBufRef.current.push({ ts: Date.now(), x: s.x, y: s.y, z: s.z })
        }
      })

      client.eegReadings.subscribe(reading => {
        const e = reading.electrode
        if (e < 0 || e > 3) return

        detectorRef.current.pushSamples(e, reading.samples)
        const now = Date.now()

        if (recordingRef.current) {
          eegBufRef.current.push({ ts: now, electrode: e, samples: Array.from(reading.samples) })
        }

        // All gesture rules + meter UI + calibration sampling run on a single
        // 20 Hz tick. Doing this at the throttle boundary means the debounce
        // counter ticks at a stable rate regardless of EEG packet timing.
        if (now - meterLastUpdate.current <= 50) return
        meterLastUpdate.current = now

        const f0 = detectorRef.current.features(0)
        const f1 = detectorRef.current.features(1)
        const f2 = detectorRef.current.features(2)
        const f3 = detectorRef.current.features(3)
        setMeters([f0, f1, f2, f3])
        setContacts([
          detectorRef.current.contactQuality(0),
          detectorRef.current.contactQuality(1),
          detectorRef.current.contactQuality(2),
          detectorRef.current.contactQuality(3),
        ])

        // Raw group means this tick — averaged across the symmetric pair.
        const afHighRaw = (f1.highRms + f2.highRms) / 2
        const tpHighRaw = (f0.highRms + f3.highRms) / 2

        // EMA smoothing — α=0.3 gives ~3-tick effective window (~150 ms).
        afSmoothedRef.current = EMA_ALPHA * afHighRaw + (1 - EMA_ALPHA) * afSmoothedRef.current
        tpSmoothedRef.current = EMA_ALPHA * tpHighRaw + (1 - EMA_ALPHA) * tpSmoothedRef.current
        const afHigh = afSmoothedRef.current
        const tpHigh = tpSmoothedRef.current

        if (calibratingRef.current) {
          calibrationAfHigh.current.push(afHighRaw)
          calibrationTpHigh.current.push(tpHighRaw)
        }

        // Rule evaluation is gated on the threshold refs being finite. We
        // DO NOT read `baseline` (React state) here — the subscription closure
        // captures `baseline` at connect time, which is null, and the closure
        // never sees the post-calibration update. The refs are updated
        // imperatively by the threshold-derivation useEffect, so reading them
        // here is the only correct path.
        if (!calibratingRef.current && Number.isFinite(tpThrFwdRef.current)) {
          // EMG-ness check (any channel with high ZCR confirms muscle activity).
          const emgPresent = f0.zcr > CLENCH_MIN_ZCR || f1.zcr > CLENCH_MIN_ZCR ||
                             f2.zcr > CLENCH_MIN_ZCR || f3.zcr > CLENCH_MIN_ZCR

          // AF/TP ratio — guard div-by-zero against a flatline TP signal.
          const ratio = afHigh / Math.max(tpHigh, 1)
          // Extra-smoothed copy used for BOTH the UI readout AND the gate decisions —
          // the raw ratio is jumpy, and smoothing it stops forward/reverse from
          // flickering into each other near the boundary.
          ratioSmoothedRef.current = RATIO_EMA_ALPHA * ratio + (1 - RATIO_EMA_ALPHA) * ratioSmoothedRef.current
          const ratioStable = ratioSmoothedRef.current

          // Mutual exclusion: whichever gesture is currently live locks out the other
          // until it releases, so a clench and an eyebrow raise can't bleed across.
          const reverseLive = now < reverseUntilRef.current

          // FORWARD (jaw clench): TP-primary. On this user/hardware the masseter EMG
          // lands almost entirely on TP9/TP10 with AF7/AF8 barely moving (thesis
          // 2026-05-27). Requires a clearly TP-dominant ratio (< CLENCH_MAX_AFTP_RATIO),
          // TP above threshold, and FORWARD_DEBOUNCE_TICKS sustained ticks. Blocked
          // while reverse is live.
          const forwardRuleNow =
            !reverseLive &&
            emgPresent &&
            tpHigh > tpThrFwdRef.current &&
            ratioStable < CLENCH_MAX_AFTP_RATIO
          if (forwardRuleNow) {
            forwardConsecutiveRef.current++
            if (forwardConsecutiveRef.current >= FORWARD_DEBOUNCE_TICKS) {
              const intensity = tpHigh / tpThrFwdRef.current
              const norm = Math.min(1, Math.max(0, (intensity - 1) / (INTENSITY_SATURATION - 1)))
              forwardSpeedRef.current = MIN_FORWARD + norm * (MAX_FORWARD - MIN_FORWARD)
              forwardActiveUntilRef.current = now + FORWARD_HOLD_MS
            }
          } else {
            forwardConsecutiveRef.current = 0
          }

          // REVERSE (eyebrow raise): AF elevated AND clearly AF-dominant
          // (ratio > EYEBROW_MIN_AFTP_RATIO). Held gesture, debounced like forward so a
          // brief AF spike can't trip it. forwardLive is read AFTER the forward block so
          // a clench that just fired this tick wins the tie.
          const forwardLive = now < forwardActiveUntilRef.current
          const reverseRuleNow =
            !forwardLive &&
            emgPresent &&
            afHigh > afThrRevRef.current &&
            ratioStable > EYEBROW_MIN_AFTP_RATIO
          if (reverseRuleNow) {
            reverseConsecutiveRef.current++
            if (reverseConsecutiveRef.current >= REVERSE_DEBOUNCE_TICKS) {
              triggerReverse()
            }
          } else {
            reverseConsecutiveRef.current = 0
          }
        }

        // Mirror gesture state into React state for UI.
        const fwdLive = now < forwardActiveUntilRef.current
        setForwardActive(fwdLive)
        setForwardSpeed(fwdLive ? forwardSpeedRef.current : 0)
        setLiveSignal({ afEma: afSmoothedRef.current, tpEma: tpSmoothedRef.current, ratio: ratioSmoothedRef.current })

        // Edge-trigger event logging for the recording.
        if (fwdLive && !forwardWasActiveRef.current) {
          forwardTriggerCountRef.current++
          recordEvent('forward_trigger', { speed: forwardSpeedRef.current })
          forwardWasActiveRef.current = true
        } else if (!fwdLive && forwardWasActiveRef.current) {
          recordEvent('forward_end')
          forwardWasActiveRef.current = false
        }

        // Throttle the recorder UI counter update to once per second to keep the
        // re-render rate low while a recording is active.
        if (recordingRef.current && now - recordingStartRef.current >= 0) {
          if (Math.floor((now - recordingStartRef.current) / 1000) !==
              Math.floor((now - 50 - recordingStartRef.current) / 1000)) {
            setRecordingTickStats({
              eeg: eegBufRef.current.length,
              accel: accelBufRef.current.length,
              events: eventBufRef.current.length,
              seconds: Math.floor((now - recordingStartRef.current) / 1000),
            })
          }
        }
      })

      setTimeout(() => startCalibration(), 500)
    } catch (e) {
      setMuseStatus('error')
      setMuseError(e instanceof Error ? e.message : 'Connection failed')
    }
  }

  function startSimulate() {
    setSimulating(true)
    const start = Date.now()
    simTimers.current = [
      // Pretend forward gesture every 4s for 1.5s with varying intensity
      setInterval(() => {
        const intensity = 0.4 + Math.random() * 0.5
        forwardSpeedRef.current = intensity
        forwardActiveUntilRef.current = Date.now() + 1500
      }, 4000),
      setInterval(() => triggerReverse(REVERSE_PULSE_MS), 9000),
      setInterval(() => {
        const t = (Date.now() - start) / 1000
        updateAccel({
          x: Math.sin(t * 0.5) * 0.3,
          y: Math.cos(t * 0.3) * 0.2,
          z: 1 + Math.sin(t * 0.8) * 0.05,
        })
        const fwdLive = Date.now() < forwardActiveUntilRef.current
        setForwardActive(fwdLive)
        setForwardSpeed(fwdLive ? forwardSpeedRef.current : 0)
      }, 100),
    ]
    addLog('simulate started')
  }

  function stopSimulate() {
    simTimers.current.forEach(clearInterval)
    simTimers.current = []
    setSimulating(false)
    forwardActiveUntilRef.current = 0
    reverseUntilRef.current = 0
    if (reverseOffTimerRef.current) clearTimeout(reverseOffTimerRef.current)
    setReverseActive(false)
    setForwardActive(false)
    setForwardSpeed(0)
    addLog('simulate stopped')
  }

  // Streaming loop: send steer always, drive only when gesture-active.
  // When transitioning out of any drive state, send drive:0 once so the car
  // stops immediately instead of waiting on the watchdog.
  useEffect(() => { armedRef.current = armed }, [armed])
  useEffect(() => { steerGainRef.current = steerGain }, [steerGain])
  useEffect(() => {
    if (carStatus !== 'connected') return
    const id = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return
      // HEA-17 endurance test drives on its own steady interval — yield the whole
      // Muse/steer loop to it so the two don't fight over `drive:`.
      if (enduranceOnRef.current) return
      const now = Date.now()

      // "Listening" gate: while disarmed the car ignores ALL Muse-driven control
      // (steer + gesture drive). Manual buttons still work; the Muse stays connected.
      if (!armedRef.current) {
        if (drivingFlagRef.current) { wsRef.current.send('drive:0'); drivingFlagRef.current = false }
        return
      }

      const raw = accelRef.current[STEER_AXIS] - accelOffsetRef.current
      // Subtract the dead zone, then apply the (slider-tunable) steering gain and clamp
      // to [-1, 1]. The gain makes a modest head tilt reach a strong steer command.
      const past = Math.abs(raw) < DEAD_ZONE ? 0 : raw - Math.sign(raw) * DEAD_ZONE
      const steer = Math.max(-1, Math.min(1, past * steerGainRef.current))
      wsRef.current.send(`steer:${steer.toFixed(3)}`)

      const reverseLive = now < reverseUntilRef.current
      const forwardLive = !reverseLive && now < forwardActiveUntilRef.current

      if (reverseLive) {
        wsRef.current.send(`drive:${(-REVERSE_SPEED).toFixed(2)}`)
        drivingFlagRef.current = true
        if (recordingRef.current) recordEvent('drive_sent', { value: -REVERSE_SPEED })
      } else if (forwardLive) {
        wsRef.current.send(`drive:${forwardSpeedRef.current.toFixed(2)}`)
        drivingFlagRef.current = true
        if (recordingRef.current) recordEvent('drive_sent', { value: forwardSpeedRef.current })
      } else if (drivingFlagRef.current) {
        wsRef.current.send('drive:0')
        drivingFlagRef.current = false
        if (recordingRef.current) recordEvent('drive_sent', { value: 0 })
      }
    }, 100)
    return () => clearInterval(id)
  }, [carStatus])

  useEffect(() => () => {
    simTimers.current.forEach(clearInterval)
    if (manualTimerRef.current) clearInterval(manualTimerRef.current)
    if (manualStopRef.current) clearTimeout(manualStopRef.current)
    if (enduranceTimerRef.current) clearInterval(enduranceTimerRef.current)
    if (enduranceTickRef.current) clearInterval(enduranceTickRef.current)
    if (reverseOffTimerRef.current) clearTimeout(reverseOffTimerRef.current)
    if (calibrationCountdown.current) clearInterval(calibrationCountdown.current)
    if (protocolTimer.current) clearTimeout(protocolTimer.current)
    wsRef.current?.close()
  }, [])

  // Keyboard shortcuts for segment toggling while recording.
  //   1 → clench    2 → eyebrow    3 → tilt    0 → rest
  // Same key toggles the segment on/off; switching directly between labels
  // closes the current segment and opens the new one.
  // Ignored while typing in input fields.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
      if (protocolRunning) return    // protocol drives segments automatically
      if (e.key === '1') toggleSegment('clench')
      else if (e.key === '2') toggleSegment('eyebrow')
      else if (e.key === '3') toggleSegment('tilt')
      else if (e.key === '0') toggleSegment('rest')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // toggleSegment reads refs and stable state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment, protocolRunning])

  const museLabel =
    museStatus === 'connecting' ? 'Connecting…' :
    museStatus === 'connected'  ? '✓ Muse connected' :
    museStatus === 'error'      ? 'Retry Muse' :
    'Connect Muse'

  const carLabel =
    carStatus === 'connecting'  ? 'Connecting…' :
    carStatus === 'connected'   ? '✓ Car connected' :
    carStatus === 'error'       ? 'Car error — retry' :
    'Connect car'

  const carConnected = carStatus === 'connected'
  const channelLabels = ['TP9', 'AF7', 'AF8', 'TP10'] as const
  const contactColor = (q: ContactQuality) =>
    q === 'good' ? 'bg-emerald-500' : q === 'fair' ? 'bg-yellow-500' : 'bg-red-500'

  const tpThrFwd = baseline ? baseline.tpHigh * forwardSensitivity : 0
  const afThrRev = baseline ? baseline.afHigh * reverseSensitivity : 0

  // Live AF/TP ratio for the dashboard — useful for diagnosing whether the
  // discriminator can tell clench from eyebrow. Uses the extra-smoothed ratio
  // (ratioSmoothedRef, mirrored into liveSignal) so the readout isn't jumpy.
  const liveRatio = liveSignal.ratio
  // Steering command preview (mirrors the drive-loop math) for the Head Tilt card.
  const steerIn = accel[STEER_AXIS] - accelOffset
  const steerOut = Math.abs(steerIn) < DEAD_ZONE ? 0
    : Math.max(-1, Math.min(1, (steerIn - Math.sign(steerIn) * DEAD_ZONE) * steerGain))

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-1">Brain Car Dashboard</h1>
      <p className="text-gray-400 mb-8 text-sm">Clench → forward (variable speed) · eyebrow → reverse · tilt → steer</p>

      {calibrating && (
        <div className="mb-6 p-4 rounded-lg bg-blue-900/40 border border-blue-700 max-w-3xl">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-mono">{calibrationLeft}s</div>
            <div>
              <p className="font-semibold">Calibrating noise floor…</p>
              <p className="text-sm text-blue-200">Sit still — no clenching, no eyebrow raises. Contact dots must be green.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={connectMuse}
          disabled={museStatus === 'connecting' || museStatus === 'connected'}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {museLabel}
        </button>
        {museStatus === 'connected' && (
          <button
            onClick={disconnectMuse}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg font-medium transition-colors"
          >
            Disconnect Muse
          </button>
        )}

        <button
          onClick={startCalibration}
          disabled={museStatus !== 'connected' || calibrating}
          className="bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Recalibrate
        </button>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={carUrl}
            onChange={e => setCarUrl(e.target.value)}
            disabled={carStatus === 'connecting' || carStatus === 'connected'}
            className="bg-gray-800 border border-gray-600 disabled:opacity-50 text-sm px-3 py-3 rounded-lg font-mono w-52 focus:outline-none focus:border-gray-400"
            placeholder="ws://ip:81"
          />
          <button
            onClick={connectCar}
            disabled={carStatus === 'connecting' || carStatus === 'connected'}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {carLabel}
          </button>
          {carStatus === 'connected' && (
            <button
              onClick={disconnectCar}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg font-medium transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>

        {carStatus === 'connected' && (
          <button
            onClick={() => setArmed(a => { const next = !a; if (!next) sendRaw('drive:0'); return next })}
            className={armed
              ? 'bg-green-600 hover:bg-green-500 px-6 py-3 rounded-lg font-bold transition-colors'
              : 'bg-amber-600 hover:bg-amber-500 px-6 py-3 rounded-lg font-bold transition-colors'}
          >
            {armed ? '● Listening — STOP' : '▶ Start listening'}
          </button>
        )}

        <button
          onClick={simulating ? stopSimulate : startSimulate}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            simulating ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {simulating ? 'Stop simulate' : 'Simulate'}
        </button>

        {museError && <p className="text-red-400 text-sm">{museError}</p>}
      </div>

      <div className="max-w-3xl mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Manual control (~2.5 s hold, then auto-stop)</p>
        <div className="flex gap-3">
          <button
            onClick={() => manualDrive(0.7, 'manual forward')}
            disabled={!carConnected}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Forward
          </button>
          <button
            onClick={() => manualDrive(-0.7, 'manual reverse')}
            disabled={!carConnected}
            className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Reverse
          </button>
          <button
            onClick={() => manualDrive(0, 'stop')}
            disabled={!carConnected}
            className="bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="max-w-3xl mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Endurance test (HEA-17 battery drain — drives {ENDURANCE_DRIVE} until cutoff)</p>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleEndurance}
            disabled={!carConnected}
            className={enduranceOn
              ? 'bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-bold transition-colors'
              : 'bg-violet-700 hover:bg-violet-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-bold transition-colors'}
          >
            {enduranceOn ? '■ Stop endurance test' : `▶ Run endlessly (drive ${ENDURANCE_DRIVE})`}
          </button>
          {(enduranceOn || enduranceElapsed > 0) && (
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-3xl tabular-nums ${enduranceOn ? 'text-violet-300' : 'text-gray-300'}`}>
                {Math.floor(enduranceElapsed / 60)}:{String(enduranceElapsed % 60).padStart(2, '0')}
              </span>
              <span className="text-xs text-gray-500">{enduranceOn ? 'elapsed' : 'runtime to cutoff'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Replay saved recording</p>
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="bg-indigo-700 hover:bg-indigo-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer">
              Load .json
              <input
                type="file"
                accept=".json,application/json"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleReplayFile(f)
                  e.target.value = ''
                }}
                className="hidden"
              />
            </label>
            <button
              onClick={() => loadedRecording && runReplay(loadedRecording)}
              disabled={!loadedRecording}
              className="bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              title="Re-run with current sensitivity sliders"
            >
              Re-run with current settings
            </button>
            {replayFilename && (
              <span className="text-xs text-gray-400 font-mono">{replayFilename}</span>
            )}
          </div>

          {replayResult && (
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-2">
                Replayed with: forward {replayResult.config.forwardSensitivity}× / reverse {replayResult.config.reverseSensitivity}×
                {replayResult.config.baselineTpHigh != null && (
                  <span> · baseline tpHigh={replayResult.config.baselineTpHigh.toFixed(1)} afHigh={replayResult.config.baselineAfHigh?.toFixed(1)}</span>
                )}
              </div>
              <div className="space-y-1 text-sm font-mono">
                <div className="grid grid-cols-5 gap-2 text-xs text-gray-500 pb-1 border-b border-gray-700">
                  <span>#</span>
                  <span>segment</span>
                  <span className="text-right">orig fwd/rev</span>
                  <span className="text-right">replay fwd/rev</span>
                  <span className="text-right">change</span>
                </div>
                {replayResult.segments.map((s, i) => {
                  const fwdDelta = s.replayedForward - s.originalForward
                  const revDelta = s.replayedReverse - s.originalReverse
                  const fmt = (n: number) => n > 0 ? `+${n}` : `${n}`
                  return (
                    <div key={i} className="grid grid-cols-5 gap-2">
                      <span className="text-gray-500">{i + 1}.</span>
                      <span className={
                        s.label === 'clench'  ? 'text-yellow-400' :
                        s.label === 'eyebrow' ? 'text-red-400' :
                        s.label === 'tilt'    ? 'text-blue-400' :
                                                'text-gray-300'
                      }>{s.label}{s.note ? ` (${s.note})` : ''}</span>
                      <span className="text-right text-gray-400">{s.originalForward}/{s.originalReverse}</span>
                      <span className="text-right text-gray-200">{s.replayedForward}/{s.replayedReverse}</span>
                      <span className="text-right text-gray-500">{fmt(fwdDelta)}/{fmt(revDelta)}</span>
                    </div>
                  )
                })}
                <div className="grid grid-cols-5 gap-2 pt-2 border-t border-gray-700 text-gray-300">
                  <span></span>
                  <span className="text-gray-500">total replay</span>
                  <span></span>
                  <span className="text-right">{replayResult.totalReplayedForward}/{replayResult.totalReplayedReverse}</span>
                  <span></span>
                </div>
              </div>

              {/* Validation metrics block */}
              {(() => {
                const m = replayResult.metrics
                const pct = (x: number) => `${(x * 100).toFixed(0)}%`
                const ms = (x: number | null) => x === null ? '—' : `${x.toFixed(0)} ms`
                return (
                  <div className="mt-5 pt-4 border-t border-gray-700">
                    <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">
                      Validation metrics · expected {m.expectedRepsPerSegment} reps per gesture segment
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-gray-500">Clench hit rate</span>
                        <span className="float-right font-mono">
                          <span className="text-yellow-300">{pct(m.clenchHitRate)}</span>
                          <span className="text-gray-500 ml-2 text-xs">
                            ({m.clenchTriggers}/{m.clenchSegments * m.expectedRepsPerSegment})
                          </span>
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Eyebrow hit rate</span>
                        <span className="float-right font-mono">
                          <span className="text-red-300">{pct(m.eyebrowHitRate)}</span>
                          <span className="text-gray-500 ml-2 text-xs">
                            ({m.eyebrowTriggers}/{m.eyebrowSegments * m.expectedRepsPerSegment})
                          </span>
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">False positives (rest)</span>
                        <span className="float-right font-mono">
                          <span className={m.restFalsePositives > 0 ? 'text-orange-300' : 'text-emerald-400'}>
                            {m.restFalsePositives}
                          </span>
                          <span className="text-gray-500 ml-2 text-xs">
                            ({m.falsePositivesPerMinute.toFixed(1)}/min over {m.restDurationSec.toFixed(1)}s rest)
                          </span>
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Mean first-trigger latency</span>
                        <span className="float-right font-mono text-gray-200">{ms(m.meanFirstTriggerLatencyMs)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Mean inter-trigger interval</span>
                        <span className="float-right font-mono text-gray-200">{ms(m.meanInterTriggerIntervalMs)}</span>
                      </div>
                    </div>
                    {m.tiltSegments > 0 && (() => {
                      const steer = (x: number | null) => x === null ? '—' : x.toFixed(3)
                      return (
                        <div className="mt-4 pt-3 border-t border-gray-700/60">
                          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tilt (steering)</p>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div>
                              <span className="text-gray-500">Segments engaged</span>
                              <span className="float-right font-mono">
                                <span className={m.tiltEngagementRate >= 1 ? 'text-emerald-400' : 'text-blue-300'}>
                                  {pct(m.tiltEngagementRate)}
                                </span>
                                <span className="text-gray-500 ml-2 text-xs">({m.tiltEngagedSegments}/{m.tiltSegments})</span>
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Directions distinct</span>
                              <span className={`float-right font-mono ${m.tiltDirectionsDistinct ? 'text-emerald-400' : 'text-orange-300'}`}>
                                {m.tiltDirectionsDistinct ? 'yes' : 'no'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Left peak steer</span>
                              <span className="float-right font-mono text-gray-200">{steer(m.tiltLeftMeanSteer)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Right peak steer</span>
                              <span className="float-right font-mono text-gray-200">{steer(m.tiltRightMeanSteer)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Neutral offset</span>
                              <span className="float-right font-mono text-gray-200">{steer(m.tiltNeutralOffset)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                      Hit rate = triggers ÷ (segments × expected reps). Can exceed 100% if the detector double-fires per gesture.
                      First-trigger latency = time from segment start to first detection (lower = quicker pickup, but depends on how soon you started the gesture after the segment opened).
                      Inter-trigger interval = average gap between consecutive triggers within a clench segment (close to your intended ~3 s rest between reps = good).
                      Tilt is scored differently (it&apos;s continuous steering, not a discrete trigger): a segment is &quot;engaged&quot; if peak steer crossed the ±0.1 dead zone, and &quot;directions distinct&quot; confirms left and right tilts produced opposite-signed steering.
                    </p>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Load any saved <span className="font-mono">.json</span> recording, then change the sensitivity sliders below and click <em>Re-run</em> to see how the rule would have performed with the new settings. No headset required.
        </p>
      </div>

      <div className="max-w-3xl mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Recording</p>
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            {!recording ? (
              <>
                <button
                  onClick={startRecording}
                  disabled={museStatus !== 'connected' && !simulating}
                  className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg font-medium transition-colors"
                >
                  ● Start recording
                </button>
                <button
                  onClick={() => startProtocol(INTENSITY_PROTOCOL)}
                  disabled={(museStatus !== 'connected' && !simulating) || (!baseline && !simulating)}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg font-medium transition-colors"
                  title={!baseline ? 'Recalibrate first — no baseline' : 'Scripted clench-intensity test (~1m45s)'}
                >
                  ▶ Clench test{!baseline && museStatus === 'connected' ? ' (calibrate first)' : ''}
                </button>
                <button
                  onClick={() => startProtocol(EYEBROW_TILT_PROTOCOL)}
                  disabled={(museStatus !== 'connected' && !simulating) || (!baseline && !simulating)}
                  className="bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg font-medium transition-colors"
                  title={!baseline ? 'Recalibrate first — no baseline' : 'Scripted eyebrow + head-tilt test (~1m45s)'}
                >
                  ▶ Eyebrow/Tilt test{!baseline && museStatus === 'connected' ? ' (calibrate first)' : ''}
                </button>
              </>
            ) : protocolRunning ? (
              <button
                onClick={cancelProtocol}
                className="bg-orange-700 hover:bg-orange-600 px-5 py-2.5 rounded-lg font-medium transition-colors"
              >
                ✕ Cancel guided test
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-gray-700 hover:bg-gray-600 px-5 py-2.5 rounded-lg font-medium transition-colors"
              >
                ■ Stop session
              </button>
            )}
            {(hasUnsavedRecording || recording) && (
              <>
                <button
                  onClick={saveRecording}
                  disabled={recording}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Save .json
                </button>
                <button
                  onClick={discardRecording}
                  disabled={recording}
                  className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Discard
                </button>
              </>
            )}
            {recording && (
              <div className="flex items-center gap-3 text-sm text-gray-400 ml-auto">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono">{recordingTickStats.seconds}s</span>
                <span className="font-mono text-xs text-gray-500">
                  {recordingTickStats.eeg} EEG · {recordingTickStats.accel} accel · {recordingTickStats.events} events
                </span>
              </div>
            )}
          </div>

          {/* Guided-test live banner */}
          {protocolRunning && (() => {
            const step = activeProtocol[protocolStepIdx]
            const totalSec = Math.ceil(step.durationMs / 1000)
            const pct = Math.max(0, Math.min(100, (1 - protocolStepLeft / totalSec) * 100))
            return (
              <div className="mt-4 p-4 rounded-lg bg-indigo-900/40 border border-indigo-700">
                <div className="flex items-baseline gap-4 mb-2">
                  <div className="text-3xl font-mono">{protocolStepLeft}s</div>
                  <div className="text-xs text-indigo-300 uppercase tracking-widest">
                    Step {protocolStepIdx + 1} of {activeProtocol.length}
                    {step.type === 'segment' && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-700/60 text-indigo-100 normal-case tracking-normal">
                        {step.label}{step.note ? ` · ${step.note}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-lg font-semibold">
                  {step.type === 'segment' ? step.instruction : step.text}
                </p>
                <div className="h-1.5 w-full bg-indigo-950/60 rounded mt-3 overflow-hidden">
                  <div className="h-full bg-indigo-400 transition-all duration-200" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })()}

          {/* Segment buttons — hidden while a guided protocol is running */}
          {recording && !protocolRunning && (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {(['clench', 'eyebrow', 'tilt', 'rest'] as SegmentLabel[]).map((label, idx) => {
                  const isActive = activeSegment?.label === label
                  const baseStyle = {
                    clench:  'bg-yellow-700 hover:bg-yellow-600',
                    eyebrow: 'bg-red-800 hover:bg-red-700',
                    tilt:    'bg-blue-800 hover:bg-blue-700',
                    rest:    'bg-gray-600 hover:bg-gray-500',
                  }[label]
                  const activeStyle = {
                    clench:  'bg-yellow-500 ring-2 ring-yellow-300',
                    eyebrow: 'bg-red-500 ring-2 ring-red-300',
                    tilt:    'bg-blue-500 ring-2 ring-blue-300',
                    rest:    'bg-gray-400 ring-2 ring-gray-200',
                  }[label]
                  const key = label === 'rest' ? 0 : idx + 1
                  return (
                    <button
                      key={label}
                      onClick={() => toggleSegment(label)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? activeStyle : baseStyle}`}
                    >
                      {isActive ? `■ End ${label} (${key})` : `▸ Start ${label} (${key})`}
                    </button>
                  )
                })}
              </div>

              {activeSegment && (
                <div className="mt-3 px-3 py-2 rounded bg-gray-900/60 border border-gray-700 text-sm text-gray-300 inline-block">
                  <span className="font-mono mr-2">●</span>
                  Recording <span className="font-mono text-white">{activeSegment.label}</span> segment —
                  press the same button (or key) again to end
                </div>
              )}

              {lastSegmentSummary && !activeSegment && (
                <div className="mt-3 px-3 py-2 rounded bg-emerald-900/30 border border-emerald-700 text-sm text-emerald-200 inline-block">
                  {lastSegmentSummary}
                </div>
              )}
            </>
          )}

          {/* Captured segments list */}
          {segments.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Captured segments ({segments.length})</p>
              <div className="space-y-1 text-sm">
                {segments.map((s, i) => (
                  <div key={i} className="flex items-baseline gap-3 font-mono text-gray-400">
                    <span className="text-gray-500 w-6 text-right">{i + 1}.</span>
                    <span className={
                      s.label === 'clench'  ? 'text-yellow-400 w-20' :
                      s.label === 'eyebrow' ? 'text-red-400 w-20' :
                      s.label === 'tilt'    ? 'text-blue-400 w-20' :
                                              'text-gray-300 w-20'
                    }>{s.label}</span>
                    <span className="text-gray-300">{(s.durationMs / 1000).toFixed(1)}s</span>
                    <span className="text-gray-500 text-xs">
                      {s.eegPackets} EEG · {s.forwardTriggers} fwd · {s.reverseTriggers} rev
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Workflow: start session → click a segment button to begin (or press <span className="font-mono">1</span>/<span className="font-mono">2</span>/<span className="font-mono">3</span>/<span className="font-mono">0</span>) → perform the gesture → click again to end → review summary → next segment or stop.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 max-w-3xl mb-8">
        {/* Forward card: always-on bar. Height = liveTpEma / tpThr_fwd (0–150%).
            A 100% threshold marker shows where the rule would fire. When
            forwardActive (debounce passed), the card background flashes yellow. */}
        {(() => {
          const haveBaseline = baseline !== null
          // Gate each card by its gesture's eligibility (ratio in the right zone AND the
          // other gesture not active) so doing ONE gesture doesn't light up the OTHER's
          // meter. On this user an eyebrow raise also drives TP high, so without gating
          // the Forward bar would misleadingly peg at 150% during a reverse.
          const fwdEligible = liveSignal.ratio < CLENCH_MAX_AFTP_RATIO && !reverseActive
          const revEligible = liveSignal.ratio > EYEBROW_MIN_AFTP_RATIO && !forwardActive
          // Show progress from the resting baseline (0 %) up to the trigger (100 %), not
          // from zero signal — otherwise the bar hovers at the resting noise floor (~50 %)
          // instead of sitting at 0 when the face is relaxed.
          const baseTp = baseline ? baseline.tpHigh : 0
          const baseAf = baseline ? baseline.afHigh : 0
          const liveTpPct = haveBaseline && (forwardActive || fwdEligible)
            ? Math.min(150, Math.max(0, (liveSignal.tpEma - baseTp) / Math.max(tpThrFwd - baseTp, 1) * 100)) : 0
          const liveAfPct = haveBaseline && (reverseActive || revEligible)
            ? Math.min(150, Math.max(0, (liveSignal.afEma - baseAf) / Math.max(afThrRev - baseAf, 1) * 100)) : 0
          return (
            <>
              <div className={`p-6 rounded-xl transition-colors duration-100 ${forwardActive ? 'bg-yellow-500' : 'bg-gray-800'}`}>
                <h2 className="text-lg font-semibold">Forward</h2>
                <p className="text-5xl font-mono mt-3 mb-1">
                  {forwardActive ? `${Math.round(forwardSpeed * 100)}%`
                    : haveBaseline ? `${Math.round(liveTpPct)}%` : '—'}
                </p>
                <div className="relative h-4 w-full bg-gray-900/70 ring-1 ring-gray-700 rounded mt-2 mb-3 overflow-hidden">
                  <div className="h-full bg-yellow-400 transition-all duration-75"
                       style={{ width: haveBaseline ? `${Math.min(100, liveTpPct / 1.5 * 100)}%` : '0%' }} />
                  {haveBaseline && (
                    <div className="absolute top-0 bottom-0 border-l-2 border-yellow-200/90"
                         style={{ left: '66.6%' }} title="threshold (100%)" />
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {haveBaseline ? 'jaw clench · TP · ▸ marker = threshold' : 'calibrate to enable'}
                </p>
              </div>

              <div className={`p-6 rounded-xl transition-colors duration-100 ${reverseActive ? 'bg-red-500' : 'bg-gray-800'}`}>
                <h2 className="text-lg font-semibold">Reverse</h2>
                <p className="text-5xl font-mono mt-3 mb-1">
                  {reverseActive ? 'YES'
                    : haveBaseline ? `${Math.round(liveAfPct)}%` : '—'}
                </p>
                <div className="relative h-4 w-full bg-gray-900/70 ring-1 ring-gray-700 rounded mt-2 mb-3 overflow-hidden">
                  <div className="h-full bg-red-400 transition-all duration-75"
                       style={{ width: haveBaseline ? `${Math.min(100, liveAfPct / 1.5 * 100)}%` : '0%' }} />
                  {haveBaseline && (
                    <div className="absolute top-0 bottom-0 border-l-2 border-red-200/90"
                         style={{ left: '66.6%' }} title="threshold (100%)" />
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {haveBaseline ? 'eyebrow raise · AF · ▸ marker = threshold' : 'calibrate to enable'}
                </p>
              </div>
            </>
          )
        })()}

        <div className={`p-6 rounded-xl bg-gray-800 ${carConnected ? 'ring-1 ring-emerald-600' : ''}`}>
          <h2 className="text-lg font-semibold">Head Tilt</h2>
          <div className="font-mono mt-3 mb-2 space-y-1 text-sm">
            <p>steer cmd: <span className={steerOut !== 0 ? 'text-emerald-400' : ''}>{steerOut.toFixed(2)}</span> <span className="text-gray-500">(in {steerIn.toFixed(3)})</span></p>
            <p className="text-gray-500 text-xs">raw  x {accel.x.toFixed(3)}  ·  y {accel.y.toFixed(3)}  ·  z {accel.z.toFixed(3)}</p>
          </div>
          <p className="text-xs text-gray-500 mb-3">dead zone ±{DEAD_ZONE}</p>
          <label className="text-sm text-gray-300 mb-1 block">
            Steering sensitivity — {steerGain.toFixed(1)}×
          </label>
          <input
            type="range"
            min={STEER_GAIN_MIN} max={STEER_GAIN_MAX} step={0.5}
            value={steerGain}
            onChange={e => {
              const v = Number(e.target.value)
              setSteerGain(v)
              localStorage.setItem('steerGain.v1', String(v))
            }}
            className="w-full accent-blue-500 mb-3"
          />
          <div className="flex justify-between text-xs text-gray-600 -mt-2 mb-3">
            <span>{STEER_GAIN_MIN}× (gentle)</span><span>{STEER_GAIN_MAX}× (twitchy)</span>
          </div>
          <button
            onClick={calibrateTilt}
            disabled={museStatus !== 'connected' && !simulating}
            className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded font-medium transition-colors"
          >
            Calibrate tilt
          </button>
        </div>
      </div>

      <div className="max-w-3xl mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Sensitivity</p>
        <div className="grid grid-cols-2 gap-6 bg-gray-800 rounded-xl p-4">
          <div>
            <label className="text-sm text-gray-300 mb-2 block">
              Forward (clench) — {forwardSensitivity.toFixed(1)}×
              {baseline && (
                <span className="text-gray-500"> (TP threshold {tpThrFwd.toFixed(0)})</span>
              )}
            </label>
            <input
              type="range"
              min={SENSITIVITY_MIN} max={SENSITIVITY_MAX} step={0.1}
              value={forwardSensitivity}
              onChange={e => {
                const v = Number(e.target.value)
                setForwardSensitivity(v)
                localStorage.setItem('forwardSensitivity.v7', String(v))
              }}
              className="w-full accent-yellow-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>{SENSITIVITY_MIN}× (loose)</span><span>{SENSITIVITY_MAX}× (strict)</span>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-2 block">
              Reverse (eyebrow) — {reverseSensitivity.toFixed(1)}×
              {baseline && (
                <span className="text-gray-500"> (AF {afThrRev.toFixed(0)}, ratio &gt; {EYEBROW_MIN_AFTP_RATIO})</span>
              )}
            </label>
            <input
              type="range"
              min={SENSITIVITY_MIN} max={SENSITIVITY_MAX} step={0.5}
              value={reverseSensitivity}
              onChange={e => {
                const v = Number(e.target.value)
                setReverseSensitivity(v)
                localStorage.setItem('reverseSensitivity.v6', String(v))
              }}
              className="w-full accent-red-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>{SENSITIVITY_MIN}× (loose)</span><span>{SENSITIVITY_MAX}× (strict)</span>
            </div>
          </div>
        </div>
        {!baseline && museStatus === 'connected' && (
          <p className="text-xs text-yellow-500 mt-2">Detection disabled — run calibration first.</p>
        )}
      </div>

      <div className="max-w-3xl mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">High-band per channel (clench/eyebrow signal) · contact dots: green/yellow/red</p>
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex gap-6 items-end justify-around">
            {channelLabels.map((label, i) => {
              const MAX = Math.max(50, tpThrFwd * 1.8, afThrRev * 1.8)
              const f = meters[i]
              const highPct = Math.min(f.highRms / MAX * 100, 100)
              const isAf = i === 1 || i === 2
              // Threshold lines reflect what each channel actually contributes
              // to detection on this hardware:
              //  • AF channels: reverse gate (red) — eyebrow firing line
              //  • TP channels: forward gate (yellow) — clench firing line
              // Forward is TP-primary; AF doesn't track masseter strongly on
              // this user, so showing a forward line on AF would be misleading.
              const yellowThr = isAf ? 0 : tpThrFwd
              const redThr    = isAf ? afThrRev : 0
              const yellowPct = Math.min(yellowThr / MAX * 100, 100)
              const redPct    = Math.min(redThr / MAX * 100, 100)
              return (
                <div key={label} className="flex flex-col items-center gap-2 flex-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${contactColor(contacts[i])}`} title={`raw RMS ${f.rawRms.toFixed(1)} μV — ${contacts[i]}`} />
                  <span className="text-xs font-mono text-gray-400">H{Math.round(f.highRms)}</span>
                  <div className="relative w-full h-36 bg-gray-700 rounded overflow-hidden">
                    <div
                      className="absolute bottom-0 w-full bg-red-500 transition-all duration-75"
                      style={{ height: `${highPct}%` }}
                    />
                    {baseline && (
                      <>
                        {yellowThr > 0 && (
                          <div
                            className="absolute w-full border-t border-yellow-400 border-dashed"
                            style={{ bottom: `${yellowPct}%` }}
                            title="forward gate (TP)"
                          />
                        )}
                        {redThr > 0 && (
                          <div
                            className="absolute w-full border-t border-red-300 border-dashed"
                            style={{ bottom: `${redPct}%` }}
                            title="reverse gate (AF)"
                          />
                        )}
                      </>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className="text-[10px] font-mono text-gray-500">zcr {f.zcr.toFixed(2)}</span>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
            <span>H = EMA-smoothed high-band RMS (20+ Hz)</span>
            <span><span className="text-yellow-400">─</span> forward gate — TP must clear (clench)</span>
            <span><span className="text-red-300">─</span> reverse gate — AF must clear (eyebrow)</span>
            {baseline && (
              <span className="text-gray-400">
                live AF/TP ratio: <span className="font-mono">{liveRatio.toFixed(2)}</span>
                {' '}<span className="text-gray-600">(&lt;{CLENCH_MAX_AFTP_RATIO}=clench, &gt;{EYEBROW_MIN_AFTP_RATIO}=eyebrow)</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Command log</p>
        <div className="bg-gray-800 rounded-xl p-4 font-mono text-sm min-h-20">
          {log.length === 0
            ? <p className="text-gray-600">No commands sent yet</p>
            : log.map((entry, i) => (
                <p key={i} className={i === 0 ? 'text-white' : 'text-gray-500'}>{entry}</p>
              ))
          }
        </div>
      </div>
    </main>
  )
}
