import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, X, Tag, CircleHelp, ArrowUpRight, LoaderCircle } from 'lucide-react';
import { formatPrice, type DemoProduct, type ScanMode } from '../../shared/demo';
import { api } from '../lib/api';
export function ProductDialog({ product, mode, onClose }: { product: DemoProduct; mode: ScanMode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  async function save() {
    setBusy(true); setError('');
    try { await api('/api/finds', { productId: product.id, mode }); setSaved(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t save this find.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="product-dialog" aria-labelledby="product-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-content"><div className="dialog-head"><span className="pill subtle"><span className="tiny-dot"/> DEMO PRODUCT</span><button className="icon-button" aria-label="Close product details" onClick={onClose}><X size={21}/></button></div>
      <span className="eyebrow">{product.brand}</span><h2 id="product-title">{product.model}</h2><p className="muted">{product.category} · {product.color}</p>
      <div className="shelf-price"><div><Tag size={18}/><span>Example shelf price</span></div><strong>{formatPrice(product.storePriceMinor)}</strong><small>USD · Fictional price in the simulated scene</small></div>
      <div className="offer-empty"><CircleHelp size={22}/><div><h3>{mode === 'buy' ? 'The next step: compare.' : 'The next step: resale context.'}</h3><p>{mode === 'buy' ? 'Live online offers aren’t available in this preview. Save this example to try your finds.' : 'Resale comparisons aren’t available in this preview. Asking prices will be kept separate from verified sales.'}</p></div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" onClick={save} disabled={busy || saved}>{busy ? <LoaderCircle className="spin" size={18}/> : saved ? <Check size={18}/> : <Bookmark size={18}/>} {saved ? 'Saved to your finds' : 'Save this example'}</button>
      {saved && <a className="dialog-saved-link" href="/app/finds">View saved finds <ArrowUpRight size={17}/></a>}
    </div>
  </dialog>;
}
