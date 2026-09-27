import { useEffect, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Compass, Lightbulb, Loader2, MapPin, Pencil, Target } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardQueryKey, getGetProfileQueryKey, useGetProfile, useUpdateProfile } from '@workspace/api-client-react';
import { Link, useSearch } from 'wouter';
import { AVAILABILITY, EDUCATION, EMPLOYMENT, WORK_TYPES } from '@/lib/options';
import { Badge, Button, ChipGroup, ErrorState, InfoLine, LoadingState, Notice, PageHeader, ProgressBar, SelectInput, TagInput, TextArea, TextInput, cx, errMsg, initials, invalidateSakhiScore } from '@/lib/ui';

function ProfileList({ title, detail, items, icon: Icon, tone }: { title: string; detail: string; items: string[]; icon: typeof CheckCircle2; tone: 'green' | 'coral' }) {
  return <section className="rounded-[1.5rem] border border-border bg-card p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div><div className={cx('rounded-xl p-2.5', tone === 'green' ? 'bg-[hsl(var(--chart-3)/.13)] text-[hsl(var(--chart-3))]' : 'bg-[hsl(var(--accent)/.18)] text-[hsl(var(--accent-foreground))]')}><Icon size={19} /></div></div><div className="mt-5 space-y-2">{items.length ? items.map((item) => <div key={item} className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-3 text-sm font-medium"><Check size={15} className={tone === 'green' ? 'text-[hsl(var(--chart-3))]' : 'text-[hsl(var(--accent-foreground))]'} />{item}</div>) : <p className="text-sm text-muted-foreground">Nothing listed yet. Add a few details to shape this view.</p>}</div></section>;
}

export function ProfilePage() {
  const { data, isLoading, isError, refetch } = useGetProfile();
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const wantsEdit = new URLSearchParams(useSearch()).get('edit') === '1';
  const [editing, setEditing] = useState(wantsEdit);
  const [f, setF] = useState({ name: '', phone: '', city: '', area: '', education: '', employmentStatus: '', interests: [] as string[], workPreferences: [] as string[], availability: '', goal: '', experienceNotes: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setF({ name: data.name, phone: data.phone ?? '', city: data.city, area: data.area ?? '', education: data.education ?? '', employmentStatus: data.employmentStatus ?? '', interests: data.interests ?? [], workPreferences: data.workPreferences, availability: data.availability, goal: data.goal, experienceNotes: data.experienceNotes ?? '' }); }, [data]);
  if (isLoading) return <LoadingState label="Reading your profile" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;
  const profile = data;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((c) => ({ ...c, [k]: v }));
  const save = (event: FormEvent) => {
    event.preventDefault(); setError(''); setSaved(false);
    update.mutate({ data: f }, { onSuccess: (updated) => { qc.setQueryData(getGetProfileQueryKey(), updated); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); invalidateSakhiScore(qc); setEditing(false); setSaved(true); }, onError: (e) => setError(errMsg(e)) });
  };
  const eduOptions = EDUCATION.includes(f.education) || !f.education ? EDUCATION : [f.education, ...EDUCATION];
  const empOptions = EMPLOYMENT.includes(f.employmentStatus) || !f.employmentStatus ? EMPLOYMENT : [f.employmentStatus, ...EMPLOYMENT];
  return <div className="page-enter"><PageHeader eyebrow="Your foundation" title="Opportunity Readiness Profile" detail="A living picture of your strengths, preferences, and the work you are ready to explore." action={<Button variant="outline" onClick={() => setEditing((v) => !v)} data-testid="button-edit-profile"><Pencil size={15} /> {editing ? 'Close editor' : 'Edit profile'}</Button>} />
    {saved && <div className="mb-5"><Notice tone="success">Profile saved. Your Sakhi Score and matches were recalculated.</Notice></div>}
    <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
      <section className="rounded-[1.75rem] bg-secondary p-6 text-secondary-foreground sm:p-8">
        <div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">{initials(profile.name)}</div><div className="min-w-0"><p className="truncate font-display text-2xl">{profile.name}</p><p className="mt-1 flex items-center gap-1 text-sm text-secondary-foreground/60"><MapPin size={14} /> {[profile.area, profile.city].filter(Boolean).join(', ')}</p></div></div>
        <div className="mt-10 flex items-end justify-between"><div><p className="text-xs uppercase tracking-[.14em] text-secondary-foreground/55">Sakhi Score</p><p className="mt-2 font-mono-ui text-5xl font-bold text-primary" data-testid="text-profile-score">{profile.readiness}<span className="text-xl">/100</span></p></div><div className="rounded-xl bg-secondary-foreground/10 p-3 text-primary"><Compass size={22} /></div></div>
        <div className="mt-3"><ProgressBar value={profile.readiness} /></div>
        <p className="mt-4 text-sm font-semibold">{profile.readinessLevel}</p>
        <p className="mt-1 text-xs leading-5 text-secondary-foreground/60">An indicative readiness indicator, not a guarantee of work or income.</p>
        <Link href="/sakhi-score" className="mt-4 inline-block text-xs font-bold text-primary hover:underline" data-testid="link-profile-score">See why →</Link>
      </section>
      <section className="rounded-[1.75rem] border border-border bg-card p-6 sm:p-8">
        {editing ? <form onSubmit={save} className="space-y-5" data-testid="form-edit-profile">
          <div className="grid gap-5 sm:grid-cols-2"><TextInput label="Full name" value={f.name} onChange={(e) => set('name', e.target.value)} required /><TextInput label="Phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} /><TextInput label="City" value={f.city} onChange={(e) => set('city', e.target.value)} required data-testid="input-profile-city" /><TextInput label="Area" value={f.area} onChange={(e) => set('area', e.target.value)} /><SelectInput label="Education" value={f.education} onChange={(e) => set('education', e.target.value)} options={eduOptions} /><SelectInput label="Employment status" value={f.employmentStatus} onChange={(e) => set('employmentStatus', e.target.value)} options={empOptions} /></div>
          <TagInput label="Interests" value={f.interests} onChange={(v) => set('interests', v)} placeholder="Type and press Enter" />
          <ChipGroup label="Preferred work type" options={WORK_TYPES} value={f.workPreferences} onChange={(v) => set('workPreferences', v)} />
          <TextInput label="Availability" value={f.availability} onChange={(e) => set('availability', e.target.value)} placeholder="e.g. Evenings & weekends" hint={`Matching looks for: ${AVAILABILITY.join(', ').toLowerCase()}.`} data-testid="input-profile-availability" />
          <TextArea label="What are you working towards?" value={f.goal} onChange={(e) => set('goal', e.target.value)} maxLength={500} data-testid="input-profile-goal" />
          <TextArea label="Relevant experience" value={f.experienceNotes} onChange={(e) => set('experienceNotes', e.target.value)} maxLength={2000} hint="Care, community, home business or project experience. It counts towards the experience part of your Sakhi Score." />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={update.isPending} data-testid="button-save-profile">{update.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save changes</Button>
        </form> : <>
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Profile completion</p><p className="mt-2 font-display text-4xl" data-testid="text-profile-completion">{profile.completion}<span className="text-base text-muted-foreground">%</span></p></div><div className="rounded-xl bg-[hsl(var(--primary)/.16)] p-3 text-[hsl(var(--accent-foreground))]"><Target size={20} /></div></div>
          <ProgressBar value={profile.completion} />
          <div className="mt-7 grid gap-4 sm:grid-cols-2"><InfoLine label="Goal" value={profile.goal || 'Not set'} /><InfoLine label="Availability" value={profile.availability || 'Not set'} /><InfoLine label="Work preferences" value={profile.workPreferences.join(' · ') || 'Not set'} /><InfoLine label="Education" value={profile.education || 'Not set'} /><InfoLine label="Employment status" value={profile.employmentStatus || 'Not set'} /><InfoLine label="Interests" value={(profile.interests ?? []).join(' · ') || 'Not set'} /></div>
          {profile.experienceNotes && <div className="mt-4"><InfoLine label="Relevant experience" value={profile.experienceNotes} /></div>}
        </>}
      </section>
    </div>
    <section className="mt-5 rounded-[1.5rem] border border-border bg-card p-6"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl">Skills</h2><Link href="/skills" className="text-xs font-bold text-[hsl(var(--accent-foreground))]" data-testid="link-profile-skills">Manage skills →</Link></div><div className="mt-4 flex flex-wrap gap-2">{profile.skills.length ? profile.skills.map((s) => <Badge key={s.id} tone={s.verified ? 'success' : s.verificationStatus === 'Pending Review' ? 'coral' : 'soft'}>{s.verified && <CheckCircle2 size={11} />}{s.name} · {s.verificationStatus}</Badge>) : <p className="text-sm text-muted-foreground">No skills added yet.</p>}</div></section>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><ProfileList title="Ready for now" detail="Opportunities where you currently match 70% or more." items={profile.readyFor} icon={CheckCircle2} tone="green" /><ProfileList title="Develop next" detail="Small, focused steps that can widen your choices." items={profile.developNext} icon={Lightbulb} tone="coral" /></div>
  </div>;
}
