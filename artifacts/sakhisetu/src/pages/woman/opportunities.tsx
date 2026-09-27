import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, BookOpen, BriefcaseBusiness, CalendarDays, Check, CheckCircle2, Clock3, Flag, Heart, Loader2, MapPin, RotateCcw, Search, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardQueryKey, getGetMatchExplanationQueryKey, getGetOpportunityQueryKey, getListApplicationsQueryKey, getListMatchesQueryKey, getListOpportunitiesQueryKey,
  useApplyToOpportunity, useGetMatchExplanation, useGetOpportunity, useGetOpportunityFilters, useListOpportunities, useSaveOpportunity, useUnsaveOpportunity,
} from '@workspace/api-client-react';
import type { Opportunity } from '@workspace/api-client-react';
import { Link, useParams } from 'wouter';
import { Badge, Button, EmptyState, ErrorState, InfoLine, LoadingState, Notice, PageHeader, ProgressBar, ReportForm, SafetyNote, StatusBadge, cx, errMsg, formatDate } from '@/lib/ui';

const selectCls = 'h-11 min-w-32 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-4 focus:ring-primary/20';

export function OpportunitiesPage() {
  const [f, setF] = useState({ q: '', location: '', workType: '', category: '', skill: '', maxExperience: '', availability: '', saved: false });
  const params = useMemo(() => ({ q: f.q.trim() || undefined, location: f.location || undefined, workType: f.workType || undefined, category: f.category || undefined, skill: f.skill || undefined, maxExperience: f.maxExperience === '' ? undefined : Number(f.maxExperience), availability: f.availability || undefined, saved: f.saved || undefined }), [f]);
  const { data: filters } = useGetOpportunityFilters();
  const { data, isLoading, isError, refetch } = useListOpportunities(params, { query: { queryKey: getListOpportunitiesQueryKey(params) } });
  const opportunities = data ?? [];
  const set = (k: keyof typeof f, v: string | boolean) => setF((c) => ({ ...c, [k]: v }));
  const clear = () => setF({ q: '', location: '', workType: '', category: '', skill: '', maxExperience: '', availability: '', saved: false });
  const sel = (label: string, key: keyof typeof f, options: string[], testid: string) => <div><label className="sr-only" htmlFor={testid}>{label}</label><select id={testid} value={String(f[key])} onChange={(e) => set(key, e.target.value)} className={selectCls} data-testid={testid}><option value="">{label}</option>{options.map((o) => <option key={o}>{o}</option>)}</select></div>;
  return <div className="page-enter"><PageHeader eyebrow="A better fit, by design" title="Opportunities" detail="Explore roles with a clear view of why they match your skills and what would help you grow." action={<div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground" data-testid="text-match-count"><Heart size={14} /> {opportunities.length} {opportunities.length === 1 ? 'result' : 'results'}</div>} />
    <div className="mb-7 rounded-2xl border border-border bg-card p-3 sm:p-4" role="search">
      <div className="flex flex-col gap-3">
        <div className="relative"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" /><label htmlFor="search-opps" className="sr-only">Search opportunities</label><input id="search-opps" type="search" placeholder="Search by role, employer, or skill" value={f.q} onChange={(e) => set('q', e.target.value)} className="h-11 w-full rounded-xl bg-muted/60 pl-11 pr-4 text-sm outline-none ring-primary/20 focus:ring-4" data-testid="input-search-opportunities" /></div>
        <div className="flex flex-wrap gap-2">
          {sel('All locations', 'location', filters?.locations ?? [], 'select-opportunity-location')}
          {sel('All work types', 'workType', filters?.workTypes ?? [], 'select-opportunity-worktype')}
          {sel('All categories', 'category', filters?.categories ?? [], 'select-opportunity-category')}
          {sel('Any skill', 'skill', filters?.skills ?? [], 'select-opportunity-skill')}
          {sel('Any availability', 'availability', filters?.availability ?? [], 'select-opportunity-availability')}
          <div><label className="sr-only" htmlFor="select-opportunity-experience">Experience</label><select id="select-opportunity-experience" value={f.maxExperience} onChange={(e) => set('maxExperience', e.target.value)} className={selectCls} data-testid="select-opportunity-experience"><option value="">Any experience</option><option value="0">No experience needed</option><option value="1">Up to 1 year</option><option value="2">Up to 2 years</option><option value="5">Up to 5 years</option></select></div>
          <button type="button" aria-pressed={f.saved} onClick={() => set('saved', !f.saved)} className={cx('inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold', f.saved ? 'border-primary bg-primary text-primary-foreground' : 'border-input')} data-testid="button-filter-saved"><Bookmark size={14} /> Saved</button>
          <button type="button" onClick={clear} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-clear-filters"><RotateCcw size={14} /> Clear</button>
        </div>
      </div>
    </div>
    {isLoading ? <LoadingState label="Finding roles that fit" /> : isError ? <ErrorState onRetry={() => refetch()} /> : !opportunities.length ? <EmptyState icon={BriefcaseBusiness} title="No roles match this search" detail="Try a wider search or clear a filter. Your next fit may be one phrase away." action={<Button variant="outline" className="mt-5" onClick={clear} data-testid="button-empty-clear-filters">Clear filters</Button>} /> : <div className="grid gap-4 lg:grid-cols-2">{opportunities.map((o) => <OpportunityCard key={o.id} opportunity={o} />)}</div>}
  </div>;
}

function OpportunityCard({ opportunity: o }: { opportunity: Opportunity }) {
  const gap = new Set(o.skillGap);
  return <Link href={`/opportunities/${o.id}`} className="group rounded-[1.5rem] border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary/70 hover:shadow-[0_12px_30px_hsl(var(--secondary)/.08)]" data-testid={`card-opportunity-list-${o.id}`}>
    <div className="flex items-start justify-between gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--accent)/.18)] text-[hsl(var(--accent-foreground))]"><BriefcaseBusiness size={21} /></div><div className="text-right"><p className="font-mono-ui text-2xl font-bold text-[hsl(var(--chart-3))]" data-testid={`text-match-${o.id}`}>{o.match}%</p><p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">match</p></div></div>
    <h2 className="mt-5 font-display text-2xl tracking-[-.02em]">{o.title}</h2>
    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">{o.employer} {o.verifiedEmployer ? <Badge tone="success"><ShieldCheck size={11} /> Verified employer</Badge> : <Badge>Not verified</Badge>}</p>
    <div className="mt-3 flex flex-wrap gap-2"><Badge><MapPin size={11} /> {o.location}</Badge><Badge>{o.workType}</Badge><Badge>{o.category}</Badge>{o.application && <StatusBadge status={o.application.status} />}{o.saved && <Badge tone="coral"><Bookmark size={11} /> Saved</Badge>}</div>
    <div className="mt-4 flex flex-wrap gap-1.5">{o.requiredSkills.map((s) => <span key={s} className={cx('rounded-full px-2.5 py-1 text-[11px] font-semibold', gap.has(s) ? 'bg-[hsl(var(--accent)/.18)]' : 'bg-[hsl(var(--chart-3)/.13)] text-[hsl(var(--chart-3))]')}>{gap.has(s) ? 'Gap · ' : '✓ '}{s}</span>)}</div>
    <p className="mt-3 text-xs text-muted-foreground">{o.verifiedSkillCount ?? 0} of {o.requiredSkills.length} required skills verified{o.skillGap.length ? ` · Skill gap: ${o.skillGap.join(', ')}` : ''}</p>
    <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span>{o.compensation}</span><span className="inline-flex items-center gap-1 font-bold text-foreground group-hover:text-[hsl(var(--accent-foreground))]">See why it fits <ArrowUpRight size={14} /></span></div>
  </Link>;
}

export function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();
  const { data: o, isLoading, isError, refetch } = useGetOpportunity(id, { query: { enabled: Boolean(id), queryKey: getGetOpportunityQueryKey(id) } });
  const { data: ex } = useGetMatchExplanation(id, { query: { enabled: Boolean(id), queryKey: getGetMatchExplanationQueryKey(id) } });
  const apply = useApplyToOpportunity();
  const save = useSaveOpportunity();
  const unsave = useUnsaveOpportunity();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState<null | 'opportunity' | 'employer'>(null);
  if (isLoading) return <LoadingState label="Opening role details" />;
  if (isError || !o) return <ErrorState onRetry={() => refetch()} label="This opportunity is not available right now." />;
  const refresh = () => { qc.invalidateQueries({ queryKey: getGetOpportunityQueryKey(id) }); qc.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() }); qc.invalidateQueries({ queryKey: getListMatchesQueryKey() }); };
  const gap = new Set(o.skillGap);
  const open = o.status === 'open';
  return <div className="page-enter"><Link href="/opportunities" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-opportunities"><ArrowLeft size={16} /> Back to opportunities</Link>
    <div className="grid gap-6 lg:grid-cols-[1.16fr_.84fr]">
      <div>
        <section className="rounded-[1.75rem] bg-secondary p-6 text-secondary-foreground sm:p-9">
          <div className="flex items-start justify-between gap-5"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-secondary"><BriefcaseBusiness size={25} /></div><div className="rounded-2xl bg-secondary-foreground/10 px-4 py-3 text-right"><p className="font-mono-ui text-3xl font-bold text-primary" data-testid="text-detail-match">{o.match}%</p><p className="text-[10px] uppercase tracking-[.12em] text-secondary-foreground/55">match for this role</p></div></div>
          <div className="mt-9 flex flex-wrap items-center gap-2"><Badge tone="dark">{o.category}</Badge>{o.verifiedEmployer ? <Badge tone="success"><ShieldCheck size={11} /> Verified employer</Badge> : <Badge tone="dark">Employer not verified</Badge>}{!open && <Badge tone="coral">{o.status}</Badge>}</div>
          <h1 className="mt-4 max-w-xl font-display text-4xl leading-[1.02] tracking-[-.04em] sm:text-5xl" data-testid="text-opportunity-title">{o.title}</h1>
          <p className="mt-3 text-base text-secondary-foreground/70">{o.employer}</p>
          <div className="mt-7 flex flex-wrap gap-4 text-xs text-secondary-foreground/65"><span className="flex items-center gap-1.5"><MapPin size={14} /> {o.location}</span><span className="flex items-center gap-1.5"><Clock3 size={14} /> {o.workType}</span><span className="flex items-center gap-1.5"><CalendarDays size={14} /> {o.availability || 'Timing to be agreed'}</span>{o.deadline && <span>Apply by {formatDate(o.deadline)}</span>}</div>
        </section>
        <section className="mt-6 rounded-[1.75rem] border border-border bg-card p-6 sm:p-8">
          <h2 className="font-display text-2xl">About the role</h2>
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">{o.description}</p>
          {o.responsibilities && <><h3 className="mt-6 text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Responsibilities</h3><p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground" data-testid="text-responsibilities">{o.responsibilities}</p></>}
          <div className="mt-7 grid gap-3 sm:grid-cols-2"><InfoLine label="Experience" value={o.experience} /><InfoLine label="Compensation" value={o.compensation || 'Not stated'} /></div>
          <h3 className="mt-8 text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Required skills</h3>
          <div className="mt-3 flex flex-wrap gap-2">{o.requiredSkills.map((s) => <Badge key={s} tone={gap.has(s) ? 'coral' : 'success'}>{gap.has(s) ? 'Build · ' : 'Ready · '}{s}</Badge>)}</div>
          {(o.preferredSkills?.length ?? 0) > 0 && <><h3 className="mt-6 text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Preferred skills</h3><div className="mt-3 flex flex-wrap gap-2">{o.preferredSkills!.map((s) => <Badge key={s}>{s}</Badge>)}</div></>}
        </section>
        <div className="mt-6"><SafetyNote /></div>
      </div>
      <aside className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
        <section className="rounded-[1.75rem] border border-border bg-card p-6 sm:p-7" data-testid="panel-match-explanation">
          <div className="flex items-center gap-2"><Sparkles size={18} className="text-[hsl(var(--accent-foreground))]" /><h2 className="font-display text-2xl">Why this fits</h2></div>
          {ex ? <>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Rule-based and fully visible: each part of the {ex.match}% is explained below.</p>
            <div className="mt-5 space-y-2.5">{ex.reasons.map((r) => <div className="flex gap-3 text-sm leading-6" key={r}><CheckCircle2 size={17} className="mt-1 shrink-0 text-[hsl(var(--chart-3))]" />{r}</div>)}</div>
            <div className="mt-6 space-y-4 border-t border-border pt-5" data-testid="list-match-breakdown">{ex.scoring.map((c) => <div key={c.label}><div className="flex items-center justify-between text-sm"><span className="font-semibold">{c.label}</span><span className="font-mono-ui text-xs text-muted-foreground">{c.earned ?? 0}/{c.value}</span></div><div className="mt-1.5"><ProgressBar value={((c.earned ?? 0) / c.value) * 100} color={c.status === 'full' ? 'green' : c.status === 'partial' ? 'primary' : 'coral'} /></div>{c.detail && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{c.detail}</p>}</div>)}</div>
            {ex.gaps.length > 0 && <div className="mt-6 rounded-xl bg-[hsl(var(--accent)/.12)] p-4" data-testid="panel-skill-gap"><p className="text-xs font-bold text-[hsl(var(--accent-foreground))]">Skill gap</p><p className="mt-1 text-sm leading-6">{ex.gaps.join(' · ')}</p>{(ex.missingSkills?.length ?? 0) > 0 && <p className="mt-1 text-xs text-muted-foreground">Not on your profile yet: {ex.missingSkills!.join(', ')}</p>}</div>}
            <div className="mt-6 border-t border-border pt-5"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Recommended next step</p><p className="mt-2 text-sm font-semibold" data-testid="text-recommended-step">{ex.recommendedNextStep}</p>{ex.recommendedCourse && <Link href={`/learning/${ex.recommendedCourse.id}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground" data-testid="link-learn-required-skill"><BookOpen size={15} /> Learn required skill</Link>}</div>
            {ex.note && <p className="mt-5 text-[11px] leading-5 text-muted-foreground">{ex.note}</p>}
          </> : <div className="mt-4 space-y-3"><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /><div className="h-4 w-5/6 animate-pulse rounded bg-muted" /></div>}
        </section>
        {o.application ? <div className="rounded-2xl border border-border bg-card p-5 text-sm"><p className="font-semibold">You applied <StatusBadge status={o.application.status} /></p><Link href="/applications" className="mt-2 inline-block text-xs font-bold text-[hsl(var(--accent-foreground))]" data-testid="link-view-applications">Track this application →</Link></div> : open ? <div className="space-y-3">
          <TextAreaNote value={note} onChange={setNote} />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="grid grid-cols-[1fr_auto] gap-2"><Button className="w-full" onClick={() => { setError(''); apply.mutate({ id, data: { coverNote: note } }, { onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: getListApplicationsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); }, onError: (e) => setError(errMsg(e)) }); }} disabled={apply.isPending} data-testid="button-apply-opportunity">{apply.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Apply for this role</Button>
            <Button variant="outline" className="h-[46px] w-[48px] px-0" onClick={() => (o.saved ? unsave : save).mutate({ id }, { onSuccess: refresh })} disabled={save.isPending || unsave.isPending} aria-label={o.saved ? 'Remove from saved' : 'Save opportunity'} aria-pressed={o.saved} data-testid="button-save-opportunity"><Bookmark size={17} fill={o.saved ? 'currentColor' : 'none'} /></Button></div>
        </div> : <Notice>This opportunity is not open for applications.</Notice>}
        {o.application && <div className="flex justify-end"><Button variant="outline" className="w-[48px] px-0" onClick={() => (o.saved ? unsave : save).mutate({ id }, { onSuccess: refresh })} aria-label={o.saved ? 'Remove from saved' : 'Save opportunity'} aria-pressed={o.saved} data-testid="button-save-opportunity"><Bookmark size={17} fill={o.saved ? 'currentColor' : 'none'} /></Button></div>}
        <div className="flex flex-wrap gap-3 text-xs"><button type="button" onClick={() => setReporting(reporting === 'opportunity' ? null : 'opportunity')} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-muted-foreground hover:text-foreground" data-testid="button-report-opportunity"><Flag size={14} /> Report this opportunity</button><button type="button" onClick={() => setReporting(reporting === 'employer' ? null : 'employer')} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-muted-foreground hover:text-foreground" data-testid="button-report-employer"><Flag size={14} /> Report the employer</button></div>
        {reporting === 'opportunity' && <ReportForm targetType="opportunity" targetId={id} label="this opportunity" />}
        {reporting === 'employer' && o.employerId && <ReportForm targetType="employer" targetId={o.employerId} label={o.employer} />}
      </aside>
    </div></div>;
}

function TextAreaNote({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div><label htmlFor="cover-note" className="text-xs font-bold uppercase tracking-[.12em]">Add a short note (optional)</label><textarea id="cover-note" rows={2} maxLength={1000} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Anything you would like the employer to know" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/20" data-testid="input-cover-note" /></div>;
}
export { Check, ArrowRight };
