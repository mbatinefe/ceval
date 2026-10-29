import { useEffect, useState } from 'react';
import { ArrowUpRight, Bookmark, Trash2, LoaderCircle } from 'lucide-react';
import { formatPrice, type SavedFind } from '../../shared/demo';
import { api, ApiError } from '../lib/api';
import { ProductDialog } from '../components/ProductDialog';
export function Finds() {
  const [finds, setFinds] = useState<SavedFind[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SavedFind | null>(null);
  useEffect(() => { let active=true; api<{ finds: SavedFind[] }>('/api/finds').then((data) => {if(active)setFinds(data.finds);}).catch((err) => {if(err instanceof ApiError && err.status===401)window.location.assign('/signin'); else if(active)setError('Couldn’t load your finds. Refresh to try again.');}).finally(() => {if(active)setLoading(false);});return()=>{active=false;};}, []);
  async function remove(id: string) {
    setBusy(id); setError('');
    try { await api(`/api/finds/${encodeURIComponent(id)}`, {}, 'DELETE'); setFinds(finds.filter((find) => find.id !== id)); }
    catch { setError('Couldn’t remove this find. Please try again.'); }
    finally { setBusy(null); }
  }
  return <main className="content-page app-wrap"><div className="page-heading"><div><span className="eyebrow">WORTH A SECOND LOOK</span><h1>Your finds<span className="accent">.</span></h1><p>The things that caught your eye, all in one place.</p></div><a className="button dark small" href="/app">Back to the shelf <ArrowUpRight size={16}/></a></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {loading ? <div className="empty-state"><LoaderCircle className="spin"/><p>Gathering your finds…</p></div> : finds.length ? <><p className="finds-summary">{finds.length} saved {finds.length === 1 ? 'example' : 'examples'} · Simulated store</p><div className="finds-grid">{finds.map((find) => <article className="find-card" key={find.id}><div className={`find-art art-${find.product.id}`}><img src="/demo/electronics-shelf.png" alt={`${find.product.brand} ${find.product.model} in the sample scene`}/><span className="pill">DEMO FIND</span></div><div className="find-card-body"><small>{find.product.brand} · {find.mode === 'buy' ? 'Buy cheaper' : 'Resale value'}</small><h2>{find.product.model}</h2><div className="find-price"><strong>{formatPrice(find.product.storePriceMinor)}</strong><span>Example shelf price</span></div><div className="find-actions"><button onClick={() => setSelected(find)}>Look closer <ArrowUpRight size={16}/></button><button className="icon-button" onClick={() => remove(find.id)} disabled={busy!==null} aria-label={`Remove ${find.product.model}`}>{busy===find.id ? <LoaderCircle className="spin" size={17}/> : <Trash2 size={17}/>}</button></div></div></article>)}</div></> : !error && <div className="empty-state"><span className="empty-icon"><Bookmark size={32}/></span><h2>A good find deserves a place.</h2><p>Save an example from the shelf.<br />It’ll be waiting right here when you come back.</p><a href="/app" className="button primary">Find something interesting <ArrowUpRight size={18}/></a></div>}
    {selected && <ProductDialog product={selected.product} mode={selected.mode} onClose={() => setSelected(null)}/>}
  </main>;
}
