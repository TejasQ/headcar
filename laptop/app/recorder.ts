// Session recorder — captures raw EEG packets, accelerometer samples, detector
// events, and user-annotated ground-truth markers to a JSON file. The format is
// chronological-log style: each entry has a wall-clock timestamp (Date.now()),
// so a replay tool can re-stream events at their original rate.

export type RecordingEegPacket = {
  ts: number          // Date.now() when the packet arrived
  electrode: number   // 0 = TP9, 1 = AF7, 2 = AF8, 3 = TP10
  samples: number[]   // 12 samples at 256 Hz from muse-js
}

export type RecordingAccel = {
  ts: number
  x: number
  y: number
  z: number
}

// Event types:
//   calibration_complete — baseline established
//   forward_trigger      — debounce passed, forward driving begins
//   forward_end          — forward hold expired
//   reverse_trigger      — eyebrow detected
//   drive_sent           — drive:X command emitted to car
//   manual_drive         — manual button click on dashboard
//   marker               — user-annotated ground truth ("I just did gesture X")
export type RecordingEvent = {
  ts: number
  type: string
  data?: Record<string, number | string | boolean>
}

export type RecordingMeta = {
  baseline: { afHigh: number; tpHigh: number } | null
  forwardSensitivity: number
  reverseSensitivity: number
  notes?: string
}

// A labeled time-range carved out of the session. Acts as ground truth: during
// a `clench` segment, the user is attempting to clench; the analysis pipeline
// counts how often the detector fires (true positives), how often it doesn't
// (false negatives), and during `rest` segments how often it fires by accident
// (false positives).
export type SegmentLabel = 'clench' | 'eyebrow' | 'tilt' | 'rest'

export type RecordingSegment = {
  label: SegmentLabel
  note?: string             // optional sub-label e.g. 'light', 'medium', 'hard'
  startTs: number
  endTs: number
  durationMs: number
  forwardTriggers: number
  reverseTriggers: number
  eegPackets: number
}

export type Recording = {
  version: 2
  startedAt: string
  endedAt: string
  duration: number          // ms
  meta: RecordingMeta
  segments: RecordingSegment[]
  eegPackets: RecordingEegPacket[]
  accelSamples: RecordingAccel[]
  events: RecordingEvent[]
}

export function downloadRecording(rec: Recording) {
  const json = JSON.stringify(rec)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = rec.startedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  a.download = `headcar-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
