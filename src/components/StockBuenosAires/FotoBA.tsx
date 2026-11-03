// Foto del modelo en un recuadro cuadrado. Los botines vienen con fotos de todas
// las formas (apaisadas, cuadradas, con fondo negro): se muestran enteras y lo
// que sobra del recuadro se rellena con la misma foto desenfocada, así no se
// corta nada ni quedan franjas blancas.
export function FotoBA({ src, alt, onClick }: { src: string | null; alt: string; onClick?: () => void }) {
  return (
    <div className={`sba-foto${onClick && src ? ' clickeable' : ''}`} onClick={src ? onClick : undefined}>
      {src ? (
        <>
          <img className="sba-foto-fondo" src={src} alt="" aria-hidden loading="lazy" />
          <img className="sba-foto-img" src={src} alt={alt} loading="lazy" />
        </>
      ) : (
        <span>Sin foto</span>
      )}
    </div>
  )
}
