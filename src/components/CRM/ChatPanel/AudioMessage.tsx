import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Loader2 } from 'lucide-react'
import './AudioMessage.css'

interface AudioMessageProps {
  mensajeId: string
  mediaUrl: string
  transcripcion: string | null
  onTranscribed: (mensajeId: string, texto: string) => void
}

function formatDuration(sec: number): string {
  if (!isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AudioMessage({ mensajeId, mediaUrl, transcripcion, onTranscribed }: AudioMessageProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [texto, setTexto] = useState(transcripcion)
  const [error, setError] = useState(false)

  useEffect(() => { setTexto(transcripcion) }, [transcripcion])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play()
  }

  const handleTranscribir = async () => {
    setTranscribing(true)
    setError(false)
    try {
      const res = await fetch('/api/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajeId, mediaUrl }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'No se pudo transcribir')
      setTexto(data.texto)
      onTranscribed(mensajeId, data.texto)
    } catch {
      setError(true)
    } finally {
      setTranscribing(false)
    }
  }

  const progressPct = duration > 0 ? (current / duration) * 100 : 0

  return (
    <div className="audio-msg">
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
      />
      <div className="audio-msg-player">
        <button className="audio-msg-play-btn" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <div className="audio-msg-progress">
          <div className="audio-msg-progress-track">
            <div className="audio-msg-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <span className="audio-msg-time">{formatDuration(playing || current > 0 ? current : duration)}</span>
      </div>

      {texto ? (
        <p className="audio-msg-transcript">{texto}</p>
      ) : (
        <button className="audio-msg-transcribe-btn" onClick={handleTranscribir} disabled={transcribing}>
          {transcribing ? (
            <><Loader2 size={12} className="audio-msg-spin" /> Transcribiendo...</>
          ) : error ? (
            'No se pudo transcribir — reintentar'
          ) : (
            'Transcribir'
          )}
        </button>
      )}
    </div>
  )
}
