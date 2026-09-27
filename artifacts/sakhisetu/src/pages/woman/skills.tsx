import { useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, BookOpen, Check, ClipboardCheck, Layers3, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListAssessmentsQueryKey, getListSkillsQueryKey, useAddSkill, useDeleteSkill, useListAssessments, useListMatches, useListSkillCatalog, useListSkills, useSubmitSkillEvidence, useUpdateSkill,
} from '@workspace/api-client-react';
import type { Skill } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { SKILL_LEVELS } from '@/lib/options';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, PageHeader, SelectInput, TextArea, TextInput, cx, errMsg, invalidateSakhiScore } from '@/lib/ui';

const EVIDENCE_TYPES = ['Certificate', 'Portfolio', 'Work sample', 'Experience document'] as const;

function StatusPill({ skill }: { skill: Skill }) {
  if (skill.verificationStatus === 'Verified') return <Badge tone="success"><ShieldCheck size={11} /> Verified</Badge>;
  if (skill.verificationStatus === 'Pending Review') return <Badge tone="coral">Pending Review</Badge>;
  if (skill.verificationStatus === 'Rejected') return <Badge tone="coral">Rejected</Badge>;
  return <Badge>Not Verified</Badge>;
}

function SkillCard({ skill, attempts, best }: { skill: Skill; attempts: number; best: number | null }) {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: getListSkillsQueryKey() }); qc.invalidateQueries({ queryKey: getListAssessmentsQueryKey() }); invalidateSakhiScore(qc); };
  const evidence = useSubmitSkillEvidence();
  const update = useUpdateSkill();
  const remove = useDeleteSkill();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof EVIDENCE_TYPES)[number]>('Work sample');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); evidence.mutate({ id: skill.id, data: { type, url: url || undefined, note: note || undefined } }, { onSuccess: () => { setOpen(false); setUrl(''); setNote(''); refresh(); }, onError: (err) => setError(errMsg(err)) }); };
  return <div className="rounded-2xl border border-border bg-card p-5" data-testid={`card-skill-${skill.id}`}>
    <div className="flex items-start justify-between gap-3"><div className="rounded-xl bg-[hsl(var(--primary)/.14)] p-2.5 text-[hsl(var(--accent-foreground))]"><Layers3 size={18} /></div><StatusPill skill={skill} /></div>
    <h3 className="mt-5 font-display text-xl">{skill.name}</h3>
    <p className="mt-1 text-xs text-muted-foreground">{skill.category} · {skill.level}{skill.yearsExperience ? ` · ${skill.yearsExperience} yr` : ''}</p>
    {skill.verificationStatus === 'Rejected' && skill.reviewNotes && <p className="mt-3 rounded-lg bg-[hsl(var(--accent)/.14)] p-3 text-xs leading-5">Reviewer note: {skill.reviewNotes}</p>}
    {skill.evidenceType && <p className="mt-3 text-xs text-muted-foreground">Evidence: {skill.evidenceType}{skill.evidenceUrl ? <> · <a href={skill.evidenceUrl} target="_blank" rel="noreferrer noopener" className="underline">link</a></> : null}</p>}
    <p className="mt-4 border-t border-border pt-4 text-xs font-semibold">{skill.improvement}</p>
    {attempts > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{attempts} assessment attempt{attempts === 1 ? '' : 's'} · best {best}%</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {skill.assessmentCourseId && !skill.verified && <Link href={`/learning/${skill.assessmentCourseId}?tab=assessment`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground" data-testid={`link-assess-${skill.id}`}><ClipboardCheck size={14} /> Take skill assessment</Link>}
      {skill.recommendedCourse && !skill.verified && <Link href={`/learning/${skill.recommendedCourse.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-bold hover:border-primary" data-testid={`link-learn-${skill.id}`}><BookOpen size={14} /> Learn</Link>}
      {!skill.verified && skill.verificationStatus !== 'Pending Review' && <button type="button" onClick={() => setOpen((v) => !v)} className="min-h-11 rounded-full border border-border px-3.5 text-xs font-bold hover:border-primary" data-testid={`button-evidence-${skill.id}`}>Add evidence</button>}
    </div>
    {open && <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-muted/60 p-4" data-testid={`form-evidence-${skill.id}`}>
      <SelectInput label="Evidence type" value={type} onChange={(e) => setType(e.target.value as typeof type)} options={[...EVIDENCE_TYPES]} />
      <TextInput label="Link (optional)" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      <TextArea label="Describe your evidence" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      <p className="text-xs leading-5 text-muted-foreground">A reviewer looks at this. Submitting evidence does not verify a skill by itself.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={evidence.isPending} data-testid={`button-submit-evidence-${skill.id}`}>{evidence.isPending && <Loader2 size={15} className="animate-spin" />} Send for review</Button>
    </form>}
    <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs">
      <label className="sr-only" htmlFor={`lvl-${skill.id}`}>Level for {skill.name}</label>
      <select id={`lvl-${skill.id}`} value={SKILL_LEVELS.includes(skill.level) ? skill.level : ''} onChange={(e) => update.mutate({ id: skill.id, data: { level: e.target.value } }, { onSuccess: refresh })} className="min-h-10 rounded-lg border border-input bg-background px-2 text-xs" data-testid={`select-level-${skill.id}`}>{!SKILL_LEVELS.includes(skill.level) && <option value="">{skill.level}</option>}{SKILL_LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
      {confirmRemove ? <span className="ml-auto flex items-center gap-2"><span className="text-muted-foreground">Remove?</span><button type="button" className="min-h-10 rounded-lg bg-[hsl(var(--accent)/.2)] px-3 font-bold" onClick={() => remove.mutate({ id: skill.id }, { onSuccess: refresh })} data-testid={`button-confirm-remove-${skill.id}`}>Yes</button><button type="button" className="min-h-10 px-2" onClick={() => setConfirmRemove(false)}>No</button></span> : <button type="button" onClick={() => setConfirmRemove(true)} className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-muted-foreground hover:text-foreground" aria-label={`Remove ${skill.name}`} data-testid={`button-remove-${skill.id}`}><Trash2 size={14} /></button>}
    </div>
  </div>;
}

export function SkillsPage() {
  const { data, isLoading, isError, refetch } = useListSkills();
  const { data: assessments } = useListAssessments();
  const { data: matches } = useListMatches();
  const { data: catalog } = useListSkillCatalog();
  const addSkill = useAddSkill();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('Comfortable');
  const [years, setYears] = useState('0');
  const [error, setError] = useState('');
  const skills = data ?? [];
  const gaps = useMemo(() => {
    const seen = new Map<string, { skill: string; courseId: number | null; courseTitle: string | null; forRole: string }>();
    for (const o of (matches ?? []).slice(0, 5)) for (const g of o.gapCourses ?? []) if (!seen.has(g.skill)) seen.set(g.skill, { ...g, forRole: o.title });
    return [...seen.values()].slice(0, 6);
  }, [matches]);
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!name.trim()) return;
    addSkill.mutate({ data: { name: name.trim(), level, yearsExperience: Number(years) || 0 } }, { onSuccess: () => { setName(''); setYears('0'); setShowForm(false); qc.invalidateQueries({ queryKey: getListSkillsQueryKey() }); qc.invalidateQueries({ queryKey: getListAssessmentsQueryKey() }); invalidateSakhiScore(qc); }, onError: (e) => setError(errMsg(e)) });
  };
  if (isLoading) return <LoadingState label="Gathering your skills" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const verified = skills.filter((s) => s.verified).length;
  return <div className="page-enter"><PageHeader eyebrow="What you bring" title="Skills & proof" detail="Name the things you know. Then turn the most useful ones into evidence employers can trust." action={<Button onClick={() => setShowForm((v) => !v)} data-testid="button-add-skill"><Plus size={16} /> Add a skill</Button>} />
    {showForm && <form onSubmit={submit} className="mb-6 rounded-2xl border border-primary/40 bg-[hsl(var(--primary)/.08)] p-5" data-testid="form-add-skill"><div className="grid gap-3 sm:grid-cols-[1fr_11rem_8rem_auto] sm:items-end">
      <TextInput label="Skill name" placeholder="e.g. Customer communication" list="skill-catalog" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-skill-name" /><datalist id="skill-catalog">{(catalog ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <SelectInput label="Level" value={level} onChange={(e) => setLevel(e.target.value)} options={SKILL_LEVELS} data-testid="select-skill-level" />
      <TextInput label="Years" type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} data-testid="input-skill-years" />
      <Button type="submit" disabled={addSkill.isPending || !name.trim()} data-testid="button-save-skill">{addSkill.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save skill</Button></div>{error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}</form>}
    <div className="mb-7 grid gap-4 md:grid-cols-3"><div className="rounded-2xl bg-secondary p-5 text-secondary-foreground"><p className="text-xs uppercase tracking-[.14em] text-secondary-foreground/55">Skills named</p><p className="mt-2 font-mono-ui text-4xl font-bold text-primary">{skills.length}</p><p className="mt-2 text-xs text-secondary-foreground/60">Your starting point</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[.14em] text-muted-foreground">Verified</p><p className="mt-2 font-mono-ui text-4xl font-bold text-[hsl(var(--chart-3))]" data-testid="text-verified-count">{verified}</p><p className="mt-2 text-xs text-muted-foreground">Platform-verified by assessment or review</p></div><div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs uppercase tracking-[.14em] text-muted-foreground">Awaiting review</p><p className="mt-2 font-mono-ui text-4xl font-bold">{skills.filter((s) => s.verificationStatus === 'Pending Review').length}</p><p className="mt-2 text-xs text-muted-foreground">Evidence with a reviewer</p></div></div>
    {!skills.length ? <EmptyState icon={BadgeCheck} title="Your skill story starts here" detail="Add a skill from work, home, volunteering, or life experience. Every strength is a useful signal." action={<Button className="mt-5" onClick={() => setShowForm(true)} data-testid="button-empty-add-skill"><Plus size={15} /> Add first skill</Button>} /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{skills.map((skill) => { const a = assessments?.find((x) => x.skillId === skill.skillId); return <SkillCard key={skill.id} skill={skill} attempts={a?.attempts ?? 0} best={a?.bestScore ?? null} />; })}</div>}
    {gaps.length > 0 && <section className="mt-10" data-testid="section-skill-gaps"><h2 className="font-display text-2xl">Skill gaps from your best matches</h2><p className="mt-1 text-sm text-muted-foreground">Closing these can raise your match for the roles listed.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{gaps.map((g) => <div key={g.skill} className="rounded-2xl border border-border bg-card p-4"><p className="text-sm font-bold">{g.skill}</p><p className="mt-1 text-xs text-muted-foreground">Needed for {g.forRole}</p>{g.courseId ? <Link href={`/learning/${g.courseId}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-xs font-bold text-[hsl(var(--accent-foreground))]">Start {g.courseTitle} →</Link> : <p className="mt-3 text-xs text-muted-foreground">No course yet. Add evidence to your skill instead.</p>}</div>)}</div></section>}
  </div>;
}
