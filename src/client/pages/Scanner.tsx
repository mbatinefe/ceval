import { useState } from 'react';
import { ArrowUpRight, Tag, TrendingUp, ArrowRight } from 'lucide-react';
import { demoProducts, formatPrice, type DemoProduct, type ScanMode } from '../../shared/demo';
import { StoreScene } from '../components/StoreScene';
import { ProductDialog } from '../components/ProductDialog';
export function Scanner() {
  const [mode, setMode] = useState<ScanMode>('buy');
  const [selected, setSelected] = useState<DemoProduct | null>(null);
  return <main className="scanner-page app-wrap"><div className="scan-copy"><span className="eyebrow">YOUR CURIOSITY, IN FOCUS</span><h1>Let’s see<br />what’s <em>here.</em></h1><p>Take a look around our example shelf. Tap a product, explore its details, and save your next find.</p>
    <div className="mode-switch" role="group" aria-label="Comparison mode"><button aria-pressed={mode==='buy'} onClick={() => setMode('buy')}><Tag size={17}/> Buy cheaper</button><button aria-pressed={mode==='resale'} onClick={() => setMode('resale')}><TrendingUp size={17}/> Resale value</button></div>
    <div className="mode-description" aria-live="polite">{mode === 'buy' ? 'A place to compare what you see with prices elsewhere.' : 'A place to explore what a find could be worth to someone else.'}</div>
    <div className="preview-note"><span className="tiny-dot"/><p><strong>You’re exploring a demo.</strong> Product labels are examples. Live recognition and price comparisons are coming next.</p></div>
  </div><StoreScene onSelect={setSelected}/><aside className="shelf-list"><div className="shelf-list-heading"><span className="eyebrow">ON THIS SHELF</span><span>03</span></div>{demoProducts.map((product,index) => <button className="shelf-item" key={product.id} onClick={() => setSelected(product)}><span className="item-number">0{index+1}</span><div><small>{product.brand}</small><strong>{product.model}</strong><span>{formatPrice(product.storePriceMinor)} <small>example</small></span></div><ArrowUpRight size={17}/></button>)}<a className="shelf-link" href="/app/finds">Your saved finds <ArrowRight size={16}/></a></aside>
    {selected && <ProductDialog key={`${selected.id}-${mode}`} product={selected} mode={mode} onClose={() => setSelected(null)}/>}
  </main>;
}
