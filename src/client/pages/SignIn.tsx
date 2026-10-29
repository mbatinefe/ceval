import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Mail, ShieldCheck, LoaderCircle } from 'lucide-react';
import { Brand } from '../components/Brand';
import { api, ApiError } from '../lib/api';
export function SignIn() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function sendCode() {
    setBusy(true); setError('');
    try { await api('/api/auth/email-otp/send-verification-otp', { email: email.trim(), type: 'sign-in' }); setStep('code'); setOtp(''); setCooldown(60); }
    catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t send the code.'); if (err instanceof ApiError && err.retryAfter) setCooldown(err.retryAfter); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === 'email') return sendCode();
    setBusy(true); setError('');
    try { await api('/api/auth/sign-in/email-otp', { email: email.trim(), otp }); window.location.assign('/app'); }
    catch (err) { setError(err instanceof ApiError && err.status < 500 && err.status !== 429 ? 'That code didn’t work. Check the latest email or request a new code.' : err instanceof Error ? err.message : 'Couldn’t sign in.'); setBusy(false); }
  }
  return <div className="auth-page"><header className="site-header wrap"><Brand /><a className="quiet-link" href="/"><ArrowLeft size={16} /> Back to the idea</a></header>
    <main className="auth-layout wrap"><div className="auth-story"><span className="eyebrow">FOLLOW YOUR CURIOSITY</span><h1>Good finds<br />start <em>here.</em></h1><p>A place for the things that make you stop and look twice.</p><div className="auth-image"><img src="/demo/electronics-shelf.png" alt="Products on the simulated Ceval shelf"/><span>YOUR NEXT GOOD FIND ↗</span></div></div>
    <section className="auth-card"><span className="auth-icon"><Mail size={25}/></span><span className="eyebrow">WELCOME TO CEVAL</span><h2>{step === 'email' ? 'Make yourself at home.' : 'Check your inbox.'}</h2><p>{step === 'email' ? 'Sign in or create an account with your email. No password to remember.' : <>We sent a six-digit code to <strong>{email.trim()}</strong>.</>}</p>
      <form onSubmit={submit}>
        {step === 'email' ? <><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required disabled={busy}/></> : <><label htmlFor="otp">Sign-in code</label><input key="otp" id="otp" className="code-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required autoFocus disabled={busy}/><span className="field-hint">Use the latest code. It expires after five minutes.</span></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full" type="submit" disabled={busy || (step === 'email' && cooldown > 0)}>{busy ? <><LoaderCircle className="spin" size={18}/> One moment</> : step === 'email' ? <>Continue with email <ArrowRight size={18}/></> : <>Let’s explore <ArrowRight size={18}/></>}</button>
      </form>
      {step === 'code' ? <div className="auth-actions"><button onClick={sendCode} disabled={busy || cooldown > 0}>{cooldown ? `Resend in ${cooldown}s` : 'Send a new code'}</button><button onClick={() => {setStep('email'); setError('');}} disabled={busy}>Change email</button><small>Can’t find it? Check your spam folder.</small></div> : <div className="auth-footnote"><ShieldCheck size={17}/><span>Your saved finds belong to your account.<br/>This preview doesn’t access your camera.</span></div>}
    </section></main></div>;
}
