import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Briefcase, Check, Loader2, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';
import { useGetDemoAccounts, useLogin, useRegister } from '@workspace/api-client-react';
import type { RegisterInput } from '@workspace/api-client-react';
import { Link, useLocation, useSearch } from 'wouter';
import { homeFor, useAuth } from '@/lib/auth';
import { AVAILABILITY, BUSINESS_TYPES, EDUCATION, EMPLOYMENT, WORK_TYPES } from '@/lib/options';
import { Badge, Button, ChipGroup, Logo, Notice, SafetyNote, SelectInput, TagInput, TextArea, TextInput, cx, errMsg } from '@/lib/ui';

function AuthLayout({ children, title, detail }: { children: ReactNode; title: string; detail: string }) {
  return <div className="grain grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]"><div className="hidden bg-secondary p-12 text-secondary-foreground lg:flex lg:flex-col lg:justify-between"><Logo light /><div><Badge tone="dark"><Sparkles size={12} /> A calmer way forward</Badge><h1 className="mt-6 max-w-md font-display text-6xl leading-[.95] tracking-[-.06em]">Start with the strengths you already have.</h1><p className="mt-6 max-w-sm text-sm leading-6 text-secondary-foreground/65">A guided space to turn lived experience into a confident next step.</p></div><p className="text-xs text-secondary-foreground/45">SakhiSetu · Bridging Women’s Existing Skills to Real Income Opportunities</p></div><div className="flex flex-col px-5 py-6 sm:px-10 lg:px-20"><div className="lg:hidden"><Logo /></div><div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 page-enter"><div className="mb-8"><p className="mb-3 text-[11px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent-foreground))]">Welcome to SakhiSetu</p><h1 className="font-display text-4xl tracking-[-.04em]">{title}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p></div>{children}</div></div></div>;
}

export function LoginPage() {
  const [, setLocation] = useLocation();
  const next = new URLSearchParams(useSearch()).get('next');
  const { signIn } = useAuth();
  const login = useLogin();
  const { data: demo } = useGetDemoAccounts();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    login.mutate({ data: { email, password } }, { onSuccess: (user) => { signIn(user); setLocation(next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(user.role)); }, onError: (e) => setError(errMsg(e)) });
  };
  return <AuthLayout title="Good to see you again." detail="Sign in to pick up exactly where you left off.">
    <form onSubmit={submit} className="space-y-5" data-testid="form-login" noValidate>
      <div><label htmlFor="login-email" className="text-xs font-bold uppercase tracking-[.12em]">Email</label><div className="relative mt-2"><Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" /><input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-sm outline-none focus:ring-4 focus:ring-primary/20" data-testid="input-login-email" /></div></div>
      <div><label htmlFor="login-password" className="text-xs font-bold uppercase tracking-[.12em]">Password</label><div className="relative mt-2"><LockKeyhole size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" /><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-sm outline-none focus:ring-4 focus:ring-primary/20" data-testid="input-login-password" /></div></div>
      {error && <Notice tone="error"><span data-testid="text-login-error">{error}</span></Notice>}
      <Button type="submit" className="w-full py-3.5" disabled={login.isPending || !email || !password} data-testid="button-login">{login.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Continue to my path <ArrowRight size={15} /></Button>
    </form>
    {demo?.enabled && demo.accounts.length > 0 && <div className="mt-8 rounded-2xl border border-dashed border-border p-4" data-testid="panel-demo-accounts"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Demo accounts (this server is in demo mode)</p><div className="mt-3 flex flex-wrap gap-2">{demo.accounts.map((a) => <button type="button" key={a.email} onClick={() => { setEmail(a.email); setPassword(a.password ?? ''); }} className="min-h-11 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:border-primary" data-testid={`button-demo-${a.role}-${a.label.split(' ')[0]!.toLowerCase()}`}>{a.label} · {a.role}</button>)}</div></div>}
    <p className="mt-8 text-center text-sm text-muted-foreground">New to SakhiSetu? <Link href="/register" className="font-bold text-[hsl(var(--accent-foreground))]" data-testid="link-login-register">Create your account</Link></p>
  </AuthLayout>;
}

type WomanForm = { name: string; email: string; phone: string; password: string; city: string; area: string; education: string; employmentStatus: string; skills: string[]; interests: string[]; workPreferences: string[]; availability: string[]; goal: string };
const emptyWoman: WomanForm = { name: '', email: '', phone: '', password: '', city: '', area: '', education: EDUCATION[2]!, employmentStatus: EMPLOYMENT[0]!, skills: [], interests: [], workPreferences: [], availability: [], goal: '' };

export function RegisterPage() {
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();
  const register = useRegister();
  const [role, setRole] = useState<'woman' | 'employer'>('woman');
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [w, setW] = useState<WomanForm>(emptyWoman);
  const [e, setE] = useState({ businessName: '', employerName: '', email: '', phone: '', location: '', businessType: BUSINESS_TYPES[0]!, description: '', verificationInfo: '', evidenceUrl: '', password: '' });
  const setWf = <K extends keyof WomanForm>(k: K, v: WomanForm[K]) => setW((cur) => ({ ...cur, [k]: v }));

  const stepValid = step === 0 ? Boolean(w.name.trim() && /^\S+@\S+\.\S+$/.test(w.email) && w.phone.trim().length >= 7 && w.password.length >= 8 && /[A-Za-z]/.test(w.password) && /\d/.test(w.password)) : step === 1 ? Boolean(w.city.trim()) : true;
  const done = (user: Parameters<typeof signIn>[0]) => { signIn(user); setLocation(homeFor(user.role)); };
  const fail = (err: unknown) => setError(errMsg(err));

  const submitWoman = () => {
    setError('');
    const data: RegisterInput = { role: 'woman', name: w.name.trim(), email: w.email.trim(), phone: w.phone.trim(), password: w.password, city: w.city.trim(), area: w.area.trim(), education: w.education, employmentStatus: w.employmentStatus, skills: w.skills.map((name) => ({ name, level: 'Comfortable', yearsExperience: 0 })), interests: w.interests, workPreferences: w.workPreferences, availability: w.availability.join(', '), goal: w.goal.trim() };
    register.mutate({ data }, { onSuccess: done, onError: fail });
  };
  const submitEmployer = (ev: FormEvent) => {
    ev.preventDefault(); setError('');
    register.mutate({ data: { role: 'employer', ...e, evidenceUrl: e.evidenceUrl.trim() || undefined } }, { onSuccess: done, onError: fail });
  };

  return <AuthLayout title="Make space for what is next." detail="Tell us how you would like to use SakhiSetu.">
    <div className="mb-6 grid grid-cols-2 gap-2" role="group" aria-label="Account type">
      {([['woman', UserRound, 'I am looking for work', 'Build my readiness'], ['employer', Briefcase, 'I am hiring', 'Post opportunities']] as const).map(([r, Icon, t, s]) => <button type="button" key={r} aria-pressed={role === r} onClick={() => { setRole(r); setError(''); setStep(0); }} className={cx('rounded-2xl border p-4 text-left transition-colors', role === r ? 'border-primary bg-[hsl(var(--primary)/.12)]' : 'border-border bg-card')} data-testid={`button-role-${r}`}><Icon size={18} className="text-[hsl(var(--accent-foreground))]" /><p className="mt-3 text-sm font-bold">{t}</p><p className="mt-1 text-xs text-muted-foreground">{s}</p></button>)}
    </div>

    {role === 'woman' ? <div className="space-y-5" data-testid="form-register-woman">
      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} />)}<span>{step + 1}/3</span></div>
      {step === 0 && <><TextInput label="Full name" value={w.name} onChange={(x) => setWf('name', x.target.value)} autoComplete="name" data-testid="input-register-name" /><TextInput label="Email" type="email" value={w.email} onChange={(x) => setWf('email', x.target.value)} autoComplete="email" data-testid="input-register-email" /><TextInput label="Phone" type="tel" value={w.phone} onChange={(x) => setWf('phone', x.target.value)} autoComplete="tel" placeholder="+91 …" data-testid="input-register-phone" /><TextInput label="Password" type="password" value={w.password} onChange={(x) => setWf('password', x.target.value)} autoComplete="new-password" hint="At least 8 characters, with a letter and a number." data-testid="input-register-password" /></>}
      {step === 1 && <><TextInput label="City or town" value={w.city} onChange={(x) => setWf('city', x.target.value)} placeholder="e.g. Chennai" data-testid="input-register-city" /><TextInput label="Area" value={w.area} onChange={(x) => setWf('area', x.target.value)} placeholder="e.g. Anna Nagar" data-testid="input-register-area" /><SelectInput label="Education" value={w.education} onChange={(x) => setWf('education', x.target.value)} options={EDUCATION} /><SelectInput label="Employment status" value={w.employmentStatus} onChange={(x) => setWf('employmentStatus', x.target.value)} options={EMPLOYMENT} /></>}
      {step === 2 && <><TagInput label="Skills you already have" value={w.skills} onChange={(v) => setWf('skills', v)} placeholder="e.g. Childcare, Cooking — press Enter" hint="You can verify them later through short assessments." suggestions={['Childcare', 'Cooking', 'Elderly Care', 'Housekeeping', 'Tailoring', 'Basic Digital Skills', 'Communication']} /><TagInput label="Interests" value={w.interests} onChange={(v) => setWf('interests', v)} placeholder="e.g. Working near home" /><ChipGroup label="Preferred work type" options={WORK_TYPES} value={w.workPreferences} onChange={(v) => setWf('workPreferences', v)} /><ChipGroup label="Availability" options={AVAILABILITY} value={w.availability} onChange={(v) => setWf('availability', v)} /><TextArea label="Career or income goal" value={w.goal} onChange={(x) => setWf('goal', x.target.value)} maxLength={500} placeholder="e.g. Local part-time work" data-testid="input-register-goal" /></>}
      {error && <Notice tone="error"><span data-testid="text-register-error">{error}</span></Notice>}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} className={cx('inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted-foreground hover:bg-muted', step === 0 && 'invisible')} data-testid="button-register-back"><ArrowLeft size={15} /> Back</button>
        {step < 2 ? <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid} data-testid="button-register-next">Continue <ArrowRight size={15} /></Button> : <Button onClick={submitWoman} disabled={register.isPending} data-testid="button-register">{register.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Create my account</Button>}
      </div>
    </div> : <form onSubmit={submitEmployer} className="space-y-5" data-testid="form-register-employer">
      <TextInput label="Business name" required value={e.businessName} onChange={(x) => setE({ ...e, businessName: x.target.value })} data-testid="input-employer-business" />
      <TextInput label="Your name" required value={e.employerName} onChange={(x) => setE({ ...e, employerName: x.target.value })} />
      <TextInput label="Email" type="email" required value={e.email} onChange={(x) => setE({ ...e, email: x.target.value })} data-testid="input-employer-email" />
      <TextInput label="Phone" type="tel" required value={e.phone} onChange={(x) => setE({ ...e, phone: x.target.value })} />
      <TextInput label="Location" required value={e.location} onChange={(x) => setE({ ...e, location: x.target.value })} placeholder="e.g. Chennai" />
      <SelectInput label="Business type" value={e.businessType} onChange={(x) => setE({ ...e, businessType: x.target.value })} options={BUSINESS_TYPES} />
      <TextArea label="About your business" value={e.description} onChange={(x) => setE({ ...e, description: x.target.value })} maxLength={2000} />
      <TextArea label="Verification information" required value={e.verificationInfo} onChange={(x) => setE({ ...e, verificationInfo: x.target.value })} maxLength={2000} hint="Registration or licence details a reviewer can check." data-testid="input-employer-verification" />
      <TextInput label="Evidence link (optional)" type="url" value={e.evidenceUrl} onChange={(x) => setE({ ...e, evidenceUrl: x.target.value })} placeholder="https://…" hint="A link to a registration document, website or business page." />
      <TextInput label="Password" type="password" required minLength={8} value={e.password} onChange={(x) => setE({ ...e, password: x.target.value })} autoComplete="new-password" hint="At least 8 characters, with a letter and a number." data-testid="input-employer-password" />
      <SafetyNote />
      {error && <Notice tone="error"><span data-testid="text-register-error">{error}</span></Notice>}
      <Button type="submit" className="w-full py-3.5" disabled={register.isPending} data-testid="button-register-employer">{register.isPending && <Loader2 size={15} className="animate-spin" />} Submit for verification</Button>
    </form>}
    <p className="mt-8 text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-bold text-[hsl(var(--accent-foreground))]" data-testid="link-register-login">Sign in</Link></p>
  </AuthLayout>;
}
