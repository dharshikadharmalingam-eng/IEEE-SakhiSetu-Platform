import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Building2, Check, CheckCheck, Eye, FileCheck2, Loader2, MessageSquareHeart, Pencil, Plus, ShieldCheck, Trophy, Users, XCircle, CalendarClock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetEmployerDashboardQueryKey, getGetEmployerOpportunityQueryKey, getGetEmployerProfileQueryKey, getListEmployerApplicationsQueryKey, getListEmployerOpportunitiesQueryKey,
  useCompleteEmployerApplication, useCreateEmployerOpportunity, useGetEmployerDashboard, useGetEmployerOpportunity, useGetEmployerProfile, useListEmployerApplications,
  useListEmployerOpportunities, useListSkillCatalog, useUpdateEmployerApplicationStatus, useUpdateEmployerOpportunity, useUpdateEmployerProfile,
} from '@workspace/api-client-react';
import type { EmployerApplication, EmployerOpportunity, OpportunityInput } from '@workspace/api-client-react';
import { Link, useLocation, useParams } from 'wouter';
import { BUSINESS_TYPES, CATEGORIES, WORK_TYPES } from '@/lib/options';
import { Badge, Button, EmptyState, ErrorState, InfoLine, LoadingState, Metric, Notice, PageHeader, SafetyNote, SectionHeading, SelectInput, StatusBadge, TagInput, TextArea, TextInput, cx, errMsg, formatDate } from '@/lib/ui';

function VerificationBadge({ status }: { status: string }) {
  // Only verified employers show the Verified badge.
  return status === 'Verified' ? <Badge tone="success"><ShieldCheck size={11} /> Verified</Badge> : <Badge tone={status === 'Rejected' ? 'coral' : 'soft'}>{status === 'Pending' ? 'Verification pending' : 'Verification rejected'}</Badge>;
}

function VerificationBanner({ status, notes }: { status: string; notes?: string | null }) {
  if (status === 'Verified') return null;
  return <div className="mb-6" data-testid="banner-verification"><Notice tone={status === 'Rejected' ? 'error' : 'info'}>{status === 'Pending' ? 'Your verification is pending review. You can post opportunities once an administrator approves it.' : <>Your verification was not approved.{notes ? <> Reviewer note: “{notes}”.</> : null} <Link href="/employer/profile" className="font-bold underline">Update your details</Link> to request another review.</>}</Notice></div>;
}

export function EmployerDashboard() {
  const { data, isLoading, isError, refetch } = useGetEmployerDashboard();
  const { data: profile } = useGetEmployerProfile();
  if (isLoading) return <LoadingState label="Loading your dashboard" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;
  return <div className="page-enter"><PageHeader eyebrow="Employer dashboard" title={profile?.businessName ?? 'Dashboard'} detail="Your opportunities and candidates at a glance." action={<div className="flex items-center gap-2"><VerificationBadge status={data.verificationStatus} /><Link href="/employer/opportunities/new"><Button data-testid="button-new-opportunity"><Plus size={15} /> New opportunity</Button></Link></div>} />
    <VerificationBanner status={data.verificationStatus} notes={profile?.reviewNotes} />
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6"><Metric label="Active opportunities" value={data.activeOpportunities} icon={FileCheck2} /><Metric label="Total applications" value={data.totalApplications} icon={Users} /><Metric label="Shortlisted" value={data.shortlisted} icon={CheckCheck} /><Metric label="Interviews" value={data.interviews} icon={CalendarClock} /><Metric label="Selected" value={data.selected} icon={Trophy} /><Metric label="Profile views" value={data.profileViews} icon={Eye} /></div>
    <div className="mt-10"><SectionHeading title="Recent applicants" linkText="See all" href="/employer/applications" /><div className="mt-4 space-y-3">{data.recentApplications.length ? data.recentApplications.map((a) => <Link key={a.id} href="/employer/applications" className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:border-primary/70" data-testid={`row-recent-${a.id}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{a.applicantLabel}</p><p className="truncate text-xs text-muted-foreground">{a.opportunityTitle} · applied {formatDate(a.appliedAt)}</p></div><StatusBadge status={a.status} /><span className="font-mono-ui text-lg font-bold text-[hsl(var(--chart-3))]">{a.matchPercent}%</span></Link>) : <EmptyState icon={Users} title="No applications yet" detail="When candidates apply to your opportunities they will appear here with a clear match explanation." />}</div></div>
    <div className="mt-8 max-w-3xl"><SafetyNote /></div>
  </div>;
}

export function EmployerOpportunities() {
  const { data, isLoading, isError, refetch } = useListEmployerOpportunities();
  const { data: profile } = useGetEmployerProfile();
  const qc = useQueryClient();
  const update = useUpdateEmployerOpportunity();
  const [error, setError] = useState('');
  const toggle = (o: EmployerOpportunity) => {
    setError('');
    const input: OpportunityInput = { title: o.title, description: o.description, responsibilities: o.responsibilities, category: o.category, location: o.location, workType: o.workType as OpportunityInput['workType'], availability: o.availability, experience: o.experience, experienceYears: o.experienceYears, compensation: o.compensation, deadline: o.deadline, requiredSkills: o.requiredSkills, preferredSkills: o.preferredSkills, status: o.status === 'open' ? 'closed' : 'open' };
    update.mutate({ id: o.id, data: input }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListEmployerOpportunitiesQueryKey() }), onError: (e) => setError(errMsg(e)) });
  };
  const verified = profile?.verificationStatus === 'Verified';
  return <div className="page-enter"><PageHeader eyebrow="Your listings" title="Opportunities" detail="Create, edit and close opportunities. You can only manage your own." action={verified || !profile ? <Link href="/employer/opportunities/new"><Button data-testid="button-new-opportunity"><Plus size={15} /> New opportunity</Button></Link> : <Button disabled data-testid="button-new-opportunity" title="Available once verified"><Plus size={15} /> New opportunity</Button>} />
    {profile && <VerificationBanner status={profile.verificationStatus} notes={profile.reviewNotes} />}
    {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
    {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : !data?.length ? <EmptyState icon={FileCheck2} title="No opportunities yet" detail="Post your first opportunity to start receiving applications." /> : <div className="space-y-3">{data.map((o) => <div key={o.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`employer-opportunity-${o.id}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-lg font-bold">{o.title}</p><p className="mt-1 text-xs text-muted-foreground">{o.category} · {o.location} · {o.workType} · posted {formatDate(o.createdAt)}{o.deadline ? ` · apply by ${formatDate(o.deadline)}` : ''}</p></div><StatusBadge status={o.status} /></div><div className="mt-3 flex flex-wrap gap-1.5">{o.requiredSkills.map((s) => <Badge key={s}>{s}</Badge>)}</div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"><Link href={`/employer/applications?opportunityId=${o.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-xs font-bold text-secondary-foreground" data-testid={`link-applicants-${o.id}`}><Users size={13} /> {o.applicantCount} applicant{o.applicantCount === 1 ? '' : 's'}</Link>{o.status !== 'removed' && <><Link href={`/employer/opportunities/${o.id}/edit`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-bold hover:border-primary" data-testid={`link-edit-${o.id}`}><Pencil size={13} /> Edit</Link><button type="button" onClick={() => toggle(o)} disabled={update.isPending} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-bold hover:border-primary" data-testid={`button-toggle-${o.id}`}>{o.status === 'open' ? 'Close opportunity' : 'Reopen'}</button></>}{o.status === 'removed' && <span className="text-xs text-muted-foreground">Removed by moderation</span>}</div></div>)}</div>}
  </div>;
}

export function OpportunityForm() {
  const params = useParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: existing, isLoading } = useGetEmployerOpportunity(id ?? 0, { query: { enabled: Boolean(id), queryKey: getGetEmployerOpportunityQueryKey(id ?? 0) } });
  const { data: catalog } = useListSkillCatalog();
  const create = useCreateEmployerOpportunity();
  const update = useUpdateEmployerOpportunity();
  const [f, setF] = useState({ title: '', description: '', responsibilities: '', category: CATEGORIES[0]!, location: '', workType: WORK_TYPES[0]!, availability: '', experience: '', experienceYears: '0', compensation: '', deadline: '', status: 'open' });
  const [required, setRequired] = useState<string[]>([]);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { if (existing) { setF({ title: existing.title, description: existing.description, responsibilities: existing.responsibilities ?? '', category: existing.category, location: existing.location, workType: existing.workType, availability: existing.availability, experience: existing.experience, experienceYears: String(existing.experienceYears ?? 0), compensation: existing.compensation, deadline: existing.deadline ?? '', status: existing.status }); setRequired(existing.requiredSkills); setPreferred(existing.preferredSkills); } }, [existing]);
  if (id && isLoading) return <LoadingState />;
  const set = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError('');
    const data: OpportunityInput = { title: f.title, description: f.description, responsibilities: f.responsibilities, category: f.category, location: f.location, workType: f.workType as OpportunityInput['workType'], availability: f.availability, experience: f.experience || undefined, experienceYears: Number(f.experienceYears) || 0, compensation: f.compensation, deadline: f.deadline || null, requiredSkills: required, preferredSkills: preferred, ...(id ? { status: f.status as 'open' | 'closed' } : {}) };
    const done = () => { qc.invalidateQueries({ queryKey: getListEmployerOpportunitiesQueryKey() }); qc.invalidateQueries({ queryKey: getGetEmployerDashboardQueryKey() }); setLocation('/employer/opportunities'); };
    if (id) update.mutate({ id, data }, { onSuccess: done, onError: (err) => setError(errMsg(err)) });
    else create.mutate({ data }, { onSuccess: done, onError: (err) => setError(errMsg(err)) });
  };
  const pending = create.isPending || update.isPending;
  const suggestions = (catalog ?? []).map((c) => c.name);
  return <div className="page-enter"><Link href="/employer/opportunities" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Back to opportunities</Link>
    <PageHeader eyebrow={id ? 'Edit' : 'New'} title={id ? 'Edit opportunity' : 'Post an opportunity'} detail="Clear requirements help candidates see whether they fit. Matching uses your required skills, location, availability, work type and experience." />
    <form onSubmit={submit} className="max-w-3xl space-y-5 rounded-[1.75rem] border border-border bg-card p-6 sm:p-8" data-testid="form-opportunity">
      <TextInput label="Title" required value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={120} data-testid="input-opp-title" />
      <TextArea label="Description" required value={f.description} onChange={(e) => set('description', e.target.value)} rows={4} maxLength={3000} data-testid="input-opp-description" />
      <TextArea label="Responsibilities" value={f.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} rows={3} maxLength={3000} />
      <div className="grid gap-5 sm:grid-cols-2"><SelectInput label="Category" value={f.category} onChange={(e) => set('category', e.target.value)} options={CATEGORIES} data-testid="select-opp-category" /><SelectInput label="Work type" value={f.workType} onChange={(e) => set('workType', e.target.value)} options={WORK_TYPES} data-testid="select-opp-worktype" /><TextInput label="Location" required value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="City, or Remote" data-testid="input-opp-location" /><TextInput label="Availability needed" value={f.availability} onChange={(e) => set('availability', e.target.value)} placeholder="e.g. Evenings, 4–8 PM" data-testid="input-opp-availability" /><TextInput label="Minimum experience (years)" type="number" min={0} max={40} value={f.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} /><TextInput label="Experience note" value={f.experience} onChange={(e) => set('experience', e.target.value)} placeholder="e.g. Home cooking experience" /><TextInput label="Compensation" value={f.compensation} onChange={(e) => set('compensation', e.target.value)} placeholder="e.g. ₹8,000–₹12,000 / month" /><TextInput label="Application deadline" type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></div>
      <TagInput label="Required skills" value={required} onChange={setRequired} placeholder="Type a skill and press Enter" suggestions={suggestions} hint="These drive 50% of the candidate's match." />
      <TagInput label="Preferred skills" value={preferred} onChange={setPreferred} placeholder="Optional" suggestions={suggestions} />
      {id && <SelectInput label="Status" value={f.status} onChange={(e) => set('status', e.target.value)} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />}
      {error && <Notice tone="error"><span data-testid="text-opp-error">{error}</span></Notice>}
      <div className="flex gap-3"><Button type="submit" disabled={pending || !required.length} data-testid="button-save-opportunity">{pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {id ? 'Save changes' : 'Publish opportunity'}</Button><Link href="/employer/opportunities"><Button type="button" variant="outline">Cancel</Button></Link></div>
    </form></div>;
}

const ACTIONS: Array<{ status: 'Under Review' | 'Shortlisted' | 'Interview' | 'Selected' | 'Rejected'; label: string }> = [
  { status: 'Under Review', label: 'Review' }, { status: 'Shortlisted', label: 'Shortlist' }, { status: 'Interview', label: 'Mark interview' }, { status: 'Selected', label: 'Mark selected' }, { status: 'Rejected', label: 'Reject' },
];

function ApplicantCard({ a }: { a: EmployerApplication }) {
  const qc = useQueryClient();
  const setStatus = useUpdateEmployerApplicationStatus();
  const complete = useCompleteEmployerApplication();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: getListEmployerApplicationsQueryKey() }); qc.invalidateQueries({ queryKey: getGetEmployerDashboardQueryKey() }); };
  const locked = a.status === 'Withdrawn' || Boolean(a.completedAt);
  return <article className="rounded-2xl border border-border bg-card p-5" data-testid={`applicant-${a.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-bold">{a.applicantLabel}</p><p className="text-xs text-muted-foreground">For {a.opportunityTitle} · applied {formatDate(a.appliedAt)}</p></div><div className="flex items-center gap-3"><StatusBadge status={a.status} /><div className="text-right"><p className="font-mono-ui text-2xl font-bold text-[hsl(var(--chart-3))]" data-testid={`text-applicant-match-${a.id}`}>{a.matchPercent}%</p><p className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">match</p></div></div></div>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Relevant skills</p><div className="mt-2 flex flex-wrap gap-1.5">{a.relevantSkills.length ? a.relevantSkills.map((s) => <Badge key={s.name} tone={s.verified ? 'success' : 'soft'}>{s.verified && <ShieldCheck size={11} />}{s.name}{s.yearsExperience ? ` · ${s.yearsExperience}y` : ''}</Badge>) : <span className="text-xs text-muted-foreground">None of the listed skills yet</span>}</div>{a.certificates.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Certificates: {a.certificates.map((c) => c.title).join(', ')}</p>}{a.verifiedSkills.length > 0 && <p className="mt-1 text-xs text-muted-foreground">All verified skills: {a.verifiedSkills.join(', ')}</p>}</div>
      <div className="space-y-1 text-xs"><p><span className="font-bold">Availability:</span> {a.availability || 'Not stated'}</p><p><span className="font-bold">Work preference:</span> {a.workPreferences.join(', ') || 'Not stated'}</p><p><span className="font-bold">Feedback:</span> {a.feedbackSummary.count ? `${a.feedbackSummary.average}/5 from ${a.feedbackSummary.count} review${a.feedbackSummary.count === 1 ? '' : 's'}` : 'No feedback yet'}</p>{a.feedbackSummary.comments.map((c) => <p key={c} className="italic text-muted-foreground">“{c}”</p>)}</div>
    </div>
    <div className="mt-4 rounded-xl bg-muted/60 p-4 text-xs leading-5" data-testid={`explain-${a.id}`}><p className="font-bold">Why this match ({a.matchPercent}%)</p><ul className="mt-1.5 space-y-0.5">{a.reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul>{a.gaps.length > 0 && <p className="mt-2 text-muted-foreground">Skill gaps: {a.gaps.join(', ')}</p>}</div>
    {a.coverNote && <p className="mt-3 text-sm"><span className="font-bold">Note from candidate:</span> {a.coverNote}</p>}
    {a.contact && <div className="mt-3 rounded-xl bg-[hsl(var(--chart-3)/.1)] p-3 text-xs" data-testid={`contact-${a.id}`}><p className="font-bold">Contact details (shared at interview stage)</p><p className="mt-1">{a.contact.name} · {a.contact.email}{a.contact.phone ? ` · ${a.contact.phone}` : ''}</p><p className="mt-1 text-muted-foreground">Confirm arrangements and follow appropriate safety practices when meeting.</p></div>}
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    {!locked ? <div className="mt-4 border-t border-border pt-4"><div className="flex flex-wrap items-center gap-2">{ACTIONS.filter((x) => x.status !== a.status).map((x) => <button type="button" key={x.status} disabled={setStatus.isPending} onClick={() => { setError(''); setStatus.mutate({ id: a.id, data: { status: x.status, note: note || undefined } }, { onSuccess: () => { setNote(''); refresh(); }, onError: (e) => setError(errMsg(e)) }); }} className={cx('min-h-10 rounded-full border px-3.5 text-xs font-bold hover:border-primary', x.status === 'Rejected' && 'text-muted-foreground')} data-testid={`button-status-${x.status.toLowerCase().replace(' ', '-')}-${a.id}`}>{x.label}</button>)}</div><label className="sr-only" htmlFor={`note-${a.id}`}>Note to candidate</label><input id={`note-${a.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note shared with the candidate" className="mt-3 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-primary/20" /></div> : null}
    {a.status === 'Selected' && !a.completedAt && <div className="mt-3"><Button variant="secondary" onClick={() => { setError(''); complete.mutate({ id: a.id }, { onSuccess: refresh, onError: (e) => setError(errMsg(e)) }); }} disabled={complete.isPending} data-testid={`button-complete-${a.id}`}>{complete.isPending && <Loader2 size={15} className="animate-spin" />} Mark work completed</Button></div>}
    {a.completedAt && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><Badge tone="success">Work completed {formatDate(a.completedAt)}</Badge>{a.feedbackGiven ? <span className="text-muted-foreground">Feedback shared</span> : <Link href="/feedback" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 font-bold text-primary-foreground" data-testid={`link-give-feedback-${a.id}`}><MessageSquareHeart size={13} /> Add feedback</Link>}</div>}
  </article>;
}

export function EmployerApplications() {
  const [opportunityId, setOpportunityId] = useState(() => new URLSearchParams(window.location.search).get('opportunityId') ?? '');
  const [status, setStatus] = useState('');
  const params = { opportunityId: opportunityId ? Number(opportunityId) : undefined, status: status || undefined };
  const { data, isLoading, isError, refetch } = useListEmployerApplications(params, { query: { queryKey: getListEmployerApplicationsQueryKey(params) } });
  const { data: opps } = useListEmployerOpportunities();
  return <div className="page-enter"><PageHeader eyebrow="Candidates" title="Applications" detail="Candidates are shown with relevant details only. Contact details are shared once you move a candidate to interview." />
    <div className="mb-6 flex flex-wrap gap-2"><div><label className="sr-only" htmlFor="filter-opp">Opportunity</label><select id="filter-opp" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} className="h-11 min-w-48 rounded-xl border border-input bg-background px-3 text-sm" data-testid="select-filter-opportunity"><option value="">All opportunities</option>{(opps ?? []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></div><div><label className="sr-only" htmlFor="filter-status">Status</label><select id="filter-status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 min-w-40 rounded-xl border border-input bg-background px-3 text-sm" data-testid="select-filter-status"><option value="">All statuses</option>{['Applied', 'Under Review', 'Shortlisted', 'Interview', 'Selected', 'Rejected', 'Withdrawn'].map((s) => <option key={s}>{s}</option>)}</select></div></div>
    {isLoading ? <LoadingState label="Loading candidates" /> : isError ? <ErrorState onRetry={() => refetch()} /> : !data?.length ? <EmptyState icon={Users} title="No applications match" detail="Applications for your opportunities will appear here." /> : <div className="space-y-4">{data.map((a) => <ApplicantCard key={a.id} a={a} />)}</div>}
    <div className="mt-8 max-w-3xl"><SafetyNote /></div>
  </div>;
}

export function EmployerProfilePage() {
  const { data, isLoading, isError, refetch } = useGetEmployerProfile();
  const update = useUpdateEmployerProfile();
  const qc = useQueryClient();
  const [f, setF] = useState({ businessName: '', employerName: '', phone: '', location: '', businessType: '', description: '', verificationInfo: '', evidenceUrl: '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => { if (data) setF({ businessName: data.businessName, employerName: data.employerName, phone: data.phone ?? '', location: data.location, businessType: data.businessType, description: data.description, verificationInfo: data.verificationInfo, evidenceUrl: data.evidenceUrl ?? '' }); }, [data]);
  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;
  const set = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));
  const types = BUSINESS_TYPES.includes(f.businessType) ? BUSINESS_TYPES : [f.businessType, ...BUSINESS_TYPES];
  const submit = (e: FormEvent) => { e.preventDefault(); setMsg(null); update.mutate({ data: { ...f, evidenceUrl: f.evidenceUrl.trim() || null } }, { onSuccess: (p) => { qc.setQueryData(getGetEmployerProfileQueryKey(), p); qc.invalidateQueries({ queryKey: getGetEmployerDashboardQueryKey() }); setMsg({ tone: 'success', text: p.verificationStatus === 'Pending' && data.verificationStatus !== 'Pending' ? 'Saved. Because verification details changed, your profile was sent for review again.' : 'Profile saved.' }); }, onError: (err) => setMsg({ tone: 'error', text: errMsg(err) }) }); };
  return <div className="page-enter"><PageHeader eyebrow="Your business" title="Employer profile" detail="Keep your details accurate so candidates and reviewers can trust them." action={<VerificationBadge status={data.verificationStatus} />} />
    <VerificationBanner status={data.verificationStatus} notes={data.reviewNotes} />
    <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <form onSubmit={submit} className="space-y-5 rounded-[1.75rem] border border-border bg-card p-6 sm:p-8" data-testid="form-employer-profile">
        <div className="grid gap-5 sm:grid-cols-2"><TextInput label="Business name" value={f.businessName} onChange={(e) => set('businessName', e.target.value)} required data-testid="input-profile-business" /><TextInput label="Employer name" value={f.employerName} onChange={(e) => set('employerName', e.target.value)} required /><TextInput label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} /><TextInput label="Location" value={f.location} onChange={(e) => set('location', e.target.value)} required /></div>
        <SelectInput label="Business type" value={f.businessType} onChange={(e) => set('businessType', e.target.value)} options={types} />
        <TextArea label="Description" value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
        <TextArea label="Verification information" value={f.verificationInfo} onChange={(e) => set('verificationInfo', e.target.value)} maxLength={2000} hint="Changing this or the evidence link, or your business name, sends your profile back for review." data-testid="input-profile-verification" />
        <TextInput label="Evidence link" type="url" value={f.evidenceUrl} onChange={(e) => set('evidenceUrl', e.target.value)} placeholder="https://…" />
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button type="submit" disabled={update.isPending} data-testid="button-save-employer-profile">{update.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save changes</Button>
      </form>
      <aside className="space-y-4"><div className="rounded-[1.75rem] bg-secondary p-6 text-secondary-foreground"><Building2 size={22} className="text-primary" /><p className="mt-4 text-xs uppercase tracking-[.14em] text-secondary-foreground/55">Verification status</p><p className="mt-1 font-display text-3xl" data-testid="text-verification-status">{data.verificationStatus}</p>{data.submittedAt && <p className="mt-2 text-xs text-secondary-foreground/60">Submitted {formatDate(data.submittedAt)}{data.reviewedAt ? ` · reviewed ${formatDate(data.reviewedAt)}` : ''}</p>}{data.reviewNotes && <p className="mt-4 rounded-xl bg-secondary-foreground/10 p-3 text-xs leading-5">Reviewer note: {data.reviewNotes}</p>}</div><InfoLine label="Email" value={data.email} /><SafetyNote /></aside>
    </div></div>;
}
export { XCircle };
