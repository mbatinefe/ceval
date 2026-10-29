import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, ScanLine } from 'lucide-react';
import { demoProducts, formatPrice, type DemoProduct } from '../../shared/demo';
export function StoreScene({ onSelect }: { onSelect: (product: DemoProduct) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const markers = useRef<(HTMLButtonElement | null)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    let frame = 0;
    function positionPins() {
      const element = stage.current;
      if (element) {
        const t = failed ? 0 : (video.current?.currentTime ?? 0);
        const phase = t * Math.PI / 4;
        const zoom = failed ? 1 : 1.08 + 0.02 * Math.sin(phase);
        const x = failed ? 0 : (1 - 1 / zoom) * (0.5 + 0.28 * Math.sin(phase));
        const y = failed ? 0 : (1 - 1 / zoom) * (0.5 + 0.18 * Math.sin(2 * phase));
        const { width, height } = element.getBoundingClientRect();
        const scale = Math.max(width / 720, height / 1280);
        demoProducts.forEach((product, index) => {
          const left = ((product.point.x - x) * zoom * 720 * scale) - (720 * scale - width) / 2;
          const top = ((product.point.y - y) * zoom * 1280 * scale) - (1280 * scale - height) / 2;
          const pin = markers.current[index];
          if (pin) { pin.style.left = `${left}px`; pin.style.top = `${top}px`; pin.style.visibility = left < 20 || left > width - 20 ? 'hidden' : 'visible'; }
        });
      }
      frame = requestAnimationFrame(positionPins);
    }
    frame = requestAnimationFrame(positionPins);
    return () => cancelAnimationFrame(frame);
  }, [failed]);
  async function toggle() {
    if (!video.current) return;
    if (!video.current.paused) video.current.pause();
    else { try { await video.current.play(); } catch { setPlaying(false); } }
  }
  return <div className="scene-wrap"><div className="scan-stage" ref={stage}>
    {failed ? <img className="scan-media" src="/demo/electronics-shelf.png" alt="Simulated electronics shelf"/> : <video ref={video} className="scan-media" src="/demo/electronics-shelf-pan.mp4" poster="/demo/electronics-shelf.png" muted loop playsInline autoPlay={!reducedMotion} preload="auto" aria-label="Animated simulated electronics shelf" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => {setFailed(true);setPlaying(false);}}/>}
    <div className="scan-top"><span className="pill scene-pill"><i/> SIMULATED STORE</span><ScanLine size={21}/></div>
    <div className="scan-pins">{demoProducts.map((product, index) => <button key={product.id} ref={(element) => { markers.current[index] = element; }} className={`product-pin pin-${index}`} onClick={() => onSelect(product)} aria-label={`Inspect ${product.brand} ${product.model}, example shelf price ${formatPrice(product.storePriceMinor)}`}><span className="pin-circle">{index + 1}</span><span className="pin-label"><strong>{product.model}</strong><span>{formatPrice(product.storePriceMinor)} <small>example</small></span></span></button>)}</div>
    <div className="scan-bottom"><span>Tap a product to look closer</span><div><button className="scene-control" aria-label={playing ? 'Pause demo video' : 'Play demo video'} onClick={toggle} disabled={failed}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button><button className="scene-control" aria-label="Restart demo video" disabled={failed} onClick={() => {if(video.current) video.current.currentTime=0;}}><RotateCcw size={16}/></button></div></div>
  </div><span className="scene-disclaimer">Sample labels and prices · This is a simulated scene</span></div>;
}
