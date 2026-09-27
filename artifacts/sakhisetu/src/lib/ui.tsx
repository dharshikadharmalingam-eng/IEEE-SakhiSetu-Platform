import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, CheckCircle2, Compass, Info, Loader2, RotateCcw, ShieldCheck, X } from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetNextStepRecommendationQueryKey, getGetSakhiScoreExplanationQueryKey, getGetSakhiScoreHistoryQueryKey, getGetSakhiScoreQueryKey,
  getListReportsQueryKey, useCreateReport,
} from '@workspace/api-client-react';
import { Link } from 'wouter';
import type { Layers3 } from 'lucide-react';

/** Human-readable message from an API error (server sends { error, details }). */
export function errMsg(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const data = (error as { data?: { error?: string; details?: string[] } } | null)?.data;
  if (data?.error) return data.details?.length ? `${data.error} ${data.details.join(' · ')}` : data.error;
  return fallback;
}

export const SAFETY_MESSAGE = 'Verification improves trust but does not guarantee safety. Users should confirm arrangements and follow appropriate safety practices.';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function initials(name?: string) {
  return (name || 'Asha').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function formatDate(value?: string) {
  if (!value) return 'Recently';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function LoadingState({ label = 'Loading your path' }: { label?: string }) {
  return (
    <div className="space-y-5 page-enter" data-testid="state-loading">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 md:grid-cols-3"><div className="h-28 animate-pulse rounded-2xl bg-muted" /><div className="h-28 animate-pulse rounded-2xl bg-muted" /><div className="h-28 animate-pulse rounded-2xl bg-muted" /></div>
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <p className="text-sm text-muted-foreground" data-testid="text-loading-label">{label}</p>
    </div>
  );
}

export function ErrorState({ onRetry, label = 'We could not load this yet.' }: { onRetry?: () => void; label?: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center page-enter" data-testid="state-error">
      <div className="mb-3 rounded-full bg-[hsl(var(--accent)/.18)] p-3 text-[hsl(var(--accent-foreground))]"><AlertCircle size={22} /></div>
      <p className="font-medium" data-testid="text-error-message">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">Your work is safe. Try once more when you are ready.</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-transform hover:-translate-y-0.5" data-testid="button-retry"><RotateCcw size={15} /> Try again</button>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Compass, title, detail, action }: { icon?: typeof Compass; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center" data-testid="state-empty">
      <div className="mb-4 rounded-2xl bg-[hsl(var(--primary)/.16)] p-3 text-secondary"><Icon size={22} /></div>
      <h3 className="font-display text-xl">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{detail}</p>
      {action}
    </div>
  );
}

export function Button({ children, variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'outline'; children: ReactNode }) {
  return <button {...props} className={cx('inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0', variant === 'primary' && 'bg-primary text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/.18)] hover:shadow-[0_12px_24px_hsl(var(--primary)/.25)]', variant === 'secondary' && 'bg-secondary text-secondary-foreground', variant === 'quiet' && 'text-muted-foreground hover:bg-muted hover:text-foreground', variant === 'outline' && 'border border-border bg-card text-foreground hover:border-primary/70 hover:bg-muted', className)}>{children}</button>;
}

export function Badge({ children, tone = 'soft' }: { children: ReactNode; tone?: 'soft' | 'dark' | 'success' | 'coral' }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide', tone === 'soft' && 'bg-muted text-muted-foreground', tone === 'dark' && 'bg-secondary text-secondary-foreground', tone === 'success' && 'bg-[hsl(var(--chart-3)/.13)] text-[hsl(var(--chart-3))]', tone === 'coral' && 'bg-[hsl(var(--accent)/.18)] text-[hsl(var(--accent-foreground))]')}>{children}</span>;
}

export function ProgressBar({ value, color = 'primary' }: { value: number; color?: 'primary' | 'coral' | 'green' }) {
  return <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`${value}% complete`}><div className={cx('h-full rounded-full transition-all duration-700', color === 'primary' && 'bg-primary', color === 'coral' && 'bg-accent', color === 'green' && 'bg-[hsl(var(--chart-3))]')} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function invalidateSakhiScore(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: getGetSakhiScoreQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetSakhiScoreExplanationQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetSakhiScoreHistoryQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetNextStepRecommendationQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
}

export function Logo({ light = false }: { light?: boolean }) {
  return <Link href="/" className="group flex items-center gap-2" data-testid="link-logo"><span className={cx('flex h-9 w-9 items-center justify-center rounded-[12px] text-base font-bold transition-transform group-hover:rotate-[-7deg]', light ? 'bg-primary text-primary-foreground' : 'bg-primary text-primary-foreground')}>S</span><span className={cx('font-display text-[21px] tracking-[-.03em]', light ? 'text-sidebar-foreground' : 'text-foreground')}>Sakhi<span className={light ? 'text-primary' : 'text-[hsl(var(--accent-foreground))]'}>Setu</span></span></Link>;
}

export function PageHeader({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent-foreground))]">{eyebrow && <><span className="h-1.5 w-1.5 rounded-full bg-accent" />{eyebrow}</>}</div><h1 className="font-display text-4xl tracking-[-.035em] text-balance sm:text-[46px]" data-testid="text-page-title">{title}</h1>{detail && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

export function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Layers3 }) {
  return <div className="rounded-2xl border border-border bg-card p-4 transition-transform hover:-translate-y-1" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-center justify-between"><span className="rounded-lg bg-muted p-2 text-muted-foreground"><Icon size={16} /></span><span className="font-mono-ui text-xl font-bold">{value}</span></div><p className="mt-4 text-xs text-muted-foreground">{label}</p></div>;
}

export function SectionHeading({ title, linkText, href }: { title: string; linkText?: string; href?: string }) {
  return <div className="flex items-center justify-between"><h2 className="font-display text-2xl tracking-[-.025em]">{title}</h2>{href && <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-[hsl(var(--accent-foreground))]" data-testid={`link-section-${title.toLowerCase().replaceAll(' ', '-')}`}>{linkText} <ArrowUpRight size={13} /></Link>}</div>;
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/60 p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium leading-5">{value}</p></div>;
}


const STATUS_TONE: Record<string, 'soft' | 'dark' | 'success' | 'coral'> = {
  Applied: 'soft', 'Under Review': 'soft', Shortlisted: 'coral', Interview: 'coral', Selected: 'success', Rejected: 'soft', Withdrawn: 'soft',
  Pending: 'coral', Verified: 'success', 'Pending Review': 'coral', 'Not Verified': 'soft', Open: 'coral', 'Under review': 'coral', Resolved: 'success',
  open: 'success', closed: 'soft', removed: 'coral', active: 'success', suspended: 'coral',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'soft'}>{status}</Badge>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error'; children: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : Info;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-xl px-4 py-3 text-sm leading-6', tone === 'success' && 'bg-[hsl(var(--chart-3)/.13)] text-[hsl(var(--chart-3))]', tone === 'error' && 'bg-[hsl(var(--accent)/.18)] text-[hsl(var(--accent-foreground))]', tone === 'info' && 'bg-muted text-muted-foreground')}>
      <Icon size={17} className="mt-1 shrink-0" /> <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SafetyNote() {
  return <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-4 py-3 text-xs leading-5 text-muted-foreground" data-testid="text-safety-note"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[hsl(var(--chart-3))]" />{SAFETY_MESSAGE}</p>;
}

const inputCls = 'w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-60';
export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return <div><label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-[.12em]">{label}</label><div className="mt-2">{children}</div>{hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}</div>;
}
export function TextInput({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return <Field label={label} hint={hint} htmlFor={id}><input id={id} {...props} className={inputCls} /></Field>;
}
export function TextArea({ label, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  return <Field label={label} hint={hint} htmlFor={id}><textarea id={id} rows={3} {...props} className={cx(inputCls, 'resize-y')} /></Field>;
}
export function SelectInput({ label, hint, options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; options: Array<string | { value: string; label: string }> }) {
  const id = useId();
  return <Field label={label} hint={hint} htmlFor={id}><select id={id} {...props} className={inputCls}>{options.map((o) => { const v = typeof o === 'string' ? { value: o, label: o } : o; return <option key={v.value} value={v.value}>{v.label}</option>; })}</select></Field>;
}

/** Multi-select pill group (keyboard accessible: each pill is a toggle button). */
export function ChipGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-xs font-bold uppercase tracking-[.12em]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((item) => {
          const on = value.includes(item);
          return <button type="button" key={item} aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== item) : [...value, item])} className={cx('min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary')} data-testid={`chip-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>;
        })}
      </div>
    </div>
  );
}

/** Free-text tag entry: type a value and press Enter or comma. */
export function TagInput({ label, value, onChange, placeholder, hint, suggestions }: { label: string; value: string[]; onChange: (next: string[]) => void; placeholder?: string; hint?: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = (raw: string) => { const t = raw.trim(); if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]); setDraft(''); };
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex flex-wrap gap-2 rounded-xl border border-input bg-card p-2 focus-within:ring-4 focus-within:ring-primary/20">
        {value.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-background"><X size={12} /></button></span>)}
        <input id={id} list={suggestions ? `${id}-list` : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={value.length ? '' : placeholder} onBlur={() => add(draft)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)); }}
          className="min-w-32 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none" />
        {suggestions && <datalist id={`${id}-list`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      </div>
    </Field>
  );
}

export const REPORT_REASONS = ['Suspicious payment or fee request', 'Misleading or false information', 'Harassment or unsafe behaviour', 'Inappropriate content', 'Other'];

export function ReportForm({ targetType, targetId, label, onDone }: { targetType: 'employer' | 'opportunity' | 'feedback' | 'content'; targetId: number; label: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const create = useCreateReport();
  const [reason, setReason] = useState(REPORT_REASONS[0]!);
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  if (sent) return <Notice tone="success">Thank you. Your report was sent to a SakhiSetu administrator, and you can follow its status under Reports.</Notice>;
  return (
    <form className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="form-report" onSubmit={(e) => { e.preventDefault(); setError(''); create.mutate({ data: { targetType, targetId, reason, description } }, { onSuccess: () => { setSent(true); qc.invalidateQueries({ queryKey: getListReportsQueryKey() }); onDone?.(); }, onError: (err) => setError(errMsg(err)) }); }}>
      <p className="font-display text-xl">Report {label}</p>
      <SelectInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REPORT_REASONS} data-testid="select-report-reason" />
      <TextArea label="What happened?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="Share the details that would help an administrator review this." data-testid="input-report-description" />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex items-center gap-3"><Button type="submit" disabled={create.isPending} data-testid="button-submit-report">{create.isPending && <Loader2 size={15} className="animate-spin" />} Send report</Button></div>
    </form>
  );
}

export function LinkCard({ href, title, detail, icon: Icon }: { href: string; title: string; detail: string; icon: typeof Layers3 }) {
  return <Link href={href} className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/70"><span className="rounded-xl bg-[hsl(var(--primary)/.16)] p-2.5 text-[hsl(var(--accent-foreground))]"><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block font-bold">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{detail}</span></span><ArrowUpRight size={16} className="text-muted-foreground" /></Link>;
}

export { Compass, RotateCcw };
