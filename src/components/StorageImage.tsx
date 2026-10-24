import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { cachedPhotoUrl, signedPhotoUrl } from '../lib/photoUrls'

/**
 * <img> für Fotos aus dem privaten Bucket: tauscht die gespeicherte Adresse
 * gegen einen signierten Link (lib/photoUrls.ts). Vorschauen (blob:, data:)
 * und Logos gehen unverändert durch.
 */
export default function StorageImage({ src: given, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src?: string }) {
  const src = given ?? ''
  const [resolved, setResolved] = useState<{ for: string; url: string } | null>(null)
  const ready = resolved?.for === src ? resolved.url : cachedPhotoUrl(src)

  useEffect(() => {
    if (!src || cachedPhotoUrl(src)) return
    let active = true
    void signedPhotoUrl(src).then((url) => {
      if (active) setResolved({ for: src, url })
    })
    return () => {
      active = false
    }
  }, [src])

  // Bis der Link da ist, ein leerer Platzhalter in derselben Größe.
  if (!ready) return <span aria-hidden className={`${props.className ?? ''} block bg-gray-100`} style={props.style} />
  return <img src={ready} {...props} />
}
