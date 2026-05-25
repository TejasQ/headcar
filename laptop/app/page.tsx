'use client'

import { useEffect, useRef, useState } from 'react'
import { MuseClient } from 'muse-js'

const DEAD_ZONE = 0.1

export default function Home() {
  const [museStatus, setMuseStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [museError, setMuseError] = useState<string | null>(null)
  const [carStatus, setCarStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [carUrl, setCarUrl] = useState('ws://172.20.10.2:81')
  const [blink, setBlink] = useState(false)
  const [jawClench, setJawClench] = useState(false)
  const [accel, setAccel] = useState({ x: 0, y: 0, z: 0 })
  const [simulating, setSimulating] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [blinkThreshold, setBlinkThreshold] = useState(100)
  const [clenchThreshold, setClenchThreshold] = useState(150)
  const [accelOffset, setAccelOffset] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const simTimers = useRef<ReturnType<typeof setInterval>[]>([])
  const accelRef = useRef({ x: 0, y: 0, z: 0 })
  const accelOffsetRef = useRef(0)
  const blinkThresholdRef = useRef(100)
  const clenchThresholdRef = useRef(150)

  // Load persisted thresholds on mount
  useEffect(() => {
    const b = Number(localStorage.getItem('blinkThreshold'))
    const c = Number(localStorage.getItem('clenchThreshold'))
    if (b) { setBlinkThreshold(b); blinkThresholdRef.current = b }
    if (c) { setClenchThreshold(c); clenchThresholdRef.current = c }
  }, [])

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLog(prev => [`${time}  ${msg}`, ...prev].slice(0, 10))
  }

  function sendCommand(cmd: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd)
      addLog(`→ ${cmd}`)
    } else {
      addLog(`⚠ ${cmd}  (car not connected)`)
    }
  }

  function updateAccel(val: { x: number; y: number; z: number }) {
    setAccel(val)
    accelRef.current = val
  }

  function calibrate() {
    const offset = accelRef.current.x
    setAccelOffset(offset)
    accelOffsetRef.current = offset
    addLog(`calibrated — offset ${offset.toFixed(3)}`)
  }

  function triggerBlink() {
    setBlink(true)
    setTimeout(() => setBlink(false), 300)
    sendCommand('blink')
  }

  function triggerClench() {
    setJawClench(true)
    setTimeout(() => setJawClench(false), 500)
    sendCommand('clench')
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

  async function connectMuse() {
    setMuseStatus('connecting')
    setMuseError(null)
    try {
      const client = new MuseClient()
      await client.connect()
      await client.start()
      setMuseStatus('connected')

      client.accelerometerData.subscribe(data => {
        const s = data.samples[0]
        updateAccel({ x: s.x, y: s.y, z: s.z })
      })

      client.eegReadings.subscribe(reading => {
        const peak = Math.max(...reading.samples.map(Math.abs))
        if ((reading.electrode === 1 || reading.electrode === 2) && peak > blinkThresholdRef.current) {
          triggerBlink()
        }
        if (peak > clenchThresholdRef.current) {
          triggerClench()
        }
      })
    } catch (e) {
      setMuseStatus('error')
      setMuseError(e instanceof Error ? e.message : 'Connection failed')
    }
  }

  function startSimulate() {
    setSimulating(true)
    const start = Date.now()
    simTimers.current = [
      setInterval(() => triggerBlink(), 3000),
      setInterval(() => triggerClench(), 7000),
      setInterval(() => {
        const t = (Date.now() - start) / 1000
        updateAccel({
          x: Math.sin(t * 0.5) * 0.3,
          y: Math.cos(t * 0.3) * 0.2,
          z: 1 + Math.sin(t * 0.8) * 0.05,
        })
      }, 100),
    ]
    addLog('simulate started')
  }

  function stopSimulate() {
    simTimers.current.forEach(clearInterval)
    simTimers.current = []
    setSimulating(false)
    addLog('simulate stopped')
  }

  // Stream steering to car every 100ms when connected.
  // Subtracts calibration offset and applies dead zone before sending.
  useEffect(() => {
    if (carStatus !== 'connected') return
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const raw = accelRef.current.x - accelOffsetRef.current
        const steer = Math.abs(raw) < DEAD_ZONE ? 0 : raw
        wsRef.current.send(`steer:${steer.toFixed(3)}`)
      }
    }, 100)
    return () => clearInterval(id)
  }, [carStatus])

  useEffect(() => () => {
    simTimers.current.forEach(clearInterval)
    wsRef.current?.close()
  }, [])

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

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-1">Brain Car Dashboard</h1>
      <p className="text-gray-400 mb-8 text-sm">Phases 1–4 complete · Adafruit TB6612 pending</p>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={connectMuse}
          disabled={museStatus === 'connecting' || museStatus === 'connected'}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {museLabel}
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
        </div>

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

      {/* Manual controls */}
      <div className="max-w-3xl mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Manual control</p>
        <div className="flex gap-3">
          <button
            onClick={() => sendCommand('blink')}
            disabled={!carConnected}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Forward
          </button>
          <button
            onClick={() => sendCommand('clench')}
            disabled={!carConnected}
            className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Reverse
          </button>
          <button
            onClick={() => sendCommand('stop')}
            disabled={!carConnected}
            className="bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Stop
          </button>
        </div>
      </div>

      {/* Sensor cards */}
      <div className="grid grid-cols-3 gap-6 max-w-3xl mb-8">
        <div className={`p-6 rounded-xl transition-colors duration-100 ${blink ? 'bg-yellow-500' : 'bg-gray-800'}`}>
          <h2 className="text-lg font-semibold">Blink</h2>
          <p className="text-5xl font-mono mt-3 mb-4">{blink ? 'YES' : '—'}</p>
          <p className="text-xs text-gray-400">AF7 / AF8 · {`>`}{blinkThreshold} μV</p>
        </div>

        <div className={`p-6 rounded-xl transition-colors duration-100 ${jawClench ? 'bg-red-500' : 'bg-gray-800'}`}>
          <h2 className="text-lg font-semibold">Jaw Clench</h2>
          <p className="text-5xl font-mono mt-3 mb-4">{jawClench ? 'YES' : '—'}</p>
          <p className="text-xs text-gray-400">All channels · {`>`}{clenchThreshold} μV</p>
        </div>

        <div className={`p-6 rounded-xl bg-gray-800 ${carConnected ? 'ring-1 ring-emerald-600' : ''}`}>
          <h2 className="text-lg font-semibold">Head Tilt</h2>
          <div className="font-mono mt-3 mb-2 space-y-1 text-sm">
            <p>X: {accel.x.toFixed(3)}</p>
            <p>Y: {accel.y.toFixed(3)}</p>
            <p>Z: {accel.z.toFixed(3)}</p>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            offset {accelOffset.toFixed(3)} · dead zone ±{DEAD_ZONE}
          </p>
          <button
            onClick={calibrate}
            disabled={museStatus !== 'connected' && !simulating}
            className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded font-medium transition-colors"
          >
            Calibrate
          </button>
        </div>
      </div>

      {/* Threshold sliders */}
      <div className="max-w-3xl mb-8">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Thresholds</p>
        <div className="grid grid-cols-2 gap-6 bg-gray-800 rounded-xl p-4">
          <div>
            <label className="text-sm text-gray-300 mb-2 block">
              Blink — {blinkThreshold} μV
            </label>
            <input
              type="range" min={50} max={300} value={blinkThreshold}
              onChange={e => {
                const v = Number(e.target.value)
                setBlinkThreshold(v)
                blinkThresholdRef.current = v
                localStorage.setItem('blinkThreshold', String(v))
              }}
              className="w-full accent-yellow-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>50</span><span>300</span>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-300 mb-2 block">
              Jaw clench — {clenchThreshold} μV
            </label>
            <input
              type="range" min={100} max={400} value={clenchThreshold}
              onChange={e => {
                const v = Number(e.target.value)
                setClenchThreshold(v)
                clenchThresholdRef.current = v
                localStorage.setItem('clenchThreshold', String(v))
              }}
              className="w-full accent-red-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>100</span><span>400</span>
            </div>
          </div>
        </div>
      </div>

      {/* Command log */}
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
