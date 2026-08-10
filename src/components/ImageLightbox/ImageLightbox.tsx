import { useEffect } from 'react'
import './ImageLightbox.css'

interface ImageLightboxProps {
  src: string | null
  alt?: string
  onClose: () => void
}

export function ImageLightbox({ src, alt = '', onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [src])

  useEffect(() => {
    if (!src) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [src, onClose])

  if (!src) return null

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Cerrar">✕</button>
      <img src={src} alt={alt} className="lightbox-image" onClick={e => e.stopPropagation()} />
    </div>
  )
}
