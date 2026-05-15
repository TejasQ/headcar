'use client'

import { useEffect, useRef, useState } from 'react'
import { MuseClient } from 'muse-js'

const BLINK_THRESHOLD = 100   // μV on AF7/AF8
const CLENCH_THRESHOLD = 150  // μV across any channel
const CAR_WS = 'ws://car.local:81'

export default function Home() {
  const [museStatus, setMuseStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [museError, setMuseError] = useState<string | null>(null)
  const [carStatus, setCarStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [blink, setBlink] = useState(false)
  const [jawClench, setJawClench] = useState(false)
  const [accel, setAccel] = useState({ x: 0, y: 0, z: 0 })
  const [simulating, setSimulating] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const simTimers = useRef<ReturnType<typeof setInterval>[]>([])

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
    const ws = new WebSocket(CAR_WS)
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
        setAccel({ x: s.x, y: s.y, z: s.z })
      })

      client.eegReadings.subscribe(reading => {
        const peak = Math.max(...reading.samples.map(Math.abs))
        if ((reading.electrode === 1 || reading.electrode === 2) && peak > BLINK_THRESHOLD) {
          triggerBlink()
        }
        if (peak > CLENCH_THRESHOLD) {
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
        setAccel({
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

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-1">Brain Car Dashboard</h1>
      <p className="text-gray-400 mb-8 text-sm">Phase 1 — Muse sensor readings</p>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-10">
        <button
          onClick={connectMuse}
          disabled={museStatus === 'connecting' || museStatus === 'connected'}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {museLabel}
        </button>

        <button
          onClick={connectCar}
          disabled={carStatus === 'connecting' || carStatus === 'connected'}
          className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {carLabel}
        </button>

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

      {/* Sensor cards */}
      <div className="grid grid-cols-3 gap-6 max-w-3xl mb-8">
        <div className={`p-6 rounded-xl transition-colors duration-100 ${blink ? 'bg-yellow-500' : 'bg-gray-800'}`}>
          <h2 className="text-lg font-semibold">Blink</h2>
          <p className="text-5xl font-mono mt-3 mb-4">{blink ? 'YES' : '—'}</p>
          <p className="text-xs text-gray-400">AF7 / AF8 · {`>`}{BLINK_THRESHOLD} μV</p>
        </div>

        <div className={`p-6 rounded-xl transition-colors duration-100 ${jawClench ? 'bg-red-500' : 'bg-gray-800'}`}>
          <h2 className="text-lg font-semibold">Jaw Clench</h2>
          <p className="text-5xl font-mono mt-3 mb-4">{jawClench ? 'YES' : '—'}</p>
          <p className="text-xs text-gray-400">All channels · {`>`}{CLENCH_THRESHOLD} μV</p>
        </div>

        <div className="p-6 rounded-xl bg-gray-800">
          <h2 className="text-lg font-semibold">Head Tilt</h2>
          <div className="font-mono mt-3 mb-4 space-y-1 text-sm">
            <p>X: {accel.x.toFixed(3)}</p>
            <p>Y: {accel.y.toFixed(3)}</p>
            <p>Z: {accel.z.toFixed(3)}</p>
          </div>
          <p className="text-xs text-gray-400">Accelerometer</p>
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
