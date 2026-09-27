import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, BriefcaseBusiness, Check, ClipboardList, ExternalLink, FileCheck2, Flag, Loader2, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminDashboardQueryKey, getListAdminCoursesQueryKey, getListAdminEmployersQueryKey, getListAdminOpportunitiesQueryKey, getListAdminReportsQueryKey, getListAdminUsersQueryKey, getListSkillEvidenceQueryKey,
  useCreateAdminCourse, useCreateAdminLesson, useCreateAdminQuestion, useDeleteAdminLesson, useDeleteAdminQuestion, useGetAdminDashboard, useGetAdminUser, useListAdminCourses,
  useListAdminEmployers, useListAdminOpportunities, useListAdminReports, useListAdminUsers, useListSkillEvidence, useReviewReport, useReviewSkillEvidence, useUpdateAdminCourse,
  useUpdateAdminLesson, useUpdateAdminOpportunityStatus, useUpdateAdminQuestion, useUpdateAdminUserStatus, useVerifyEmployer,
} from '@workspace/api-client-react';
import type { AdminCourse, AdminEmployer, LessonInput, QuestionInput, Report } from '@workspace/api-client-react';
import { Link, useLocation, useParams } from 'wouter';
import { Badge, Button, EmptyState, ErrorState, LinkCard, LoadingState, Metric, Notice, PageHeader, StatusBadge, SelectInput, TagInput, TextArea, TextInput, cx, errMsg, formatDate } from '@/lib/ui';

const tabCls = (on: boolean) => cx('min-h-11 rounded-full px-4 text-sm font-bold', on ? 'bg-secondary text-secondary-foreground' : 'border border-border hover:border-primary');

export function AdminDashboard() {
  const { data, isLoading, isError, refetch } = useGetAdminDashboard();
  if (isLoading) return <LoadingState label="Loading dashboard" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;
  return <div className="page-enter"><PageHeader eyebrow="Administration" title="Dashboard" detail="Platform overview and items that need review." />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Metric label="Total women" value={data.totalWomen} icon={Users} /><Metric label="Verified employers" value={data.verifiedEmployers} icon={ShieldCheck} /><Metric label="Active opportunities" value={data.activeOpportunities} icon={BriefcaseBusiness} /><Metric label="Applications" value={data.applications} icon={FileCheck2} /><Metric label="Courses" value={data.courses} icon={BookOpen} /><Metric label="Open reports" value={data.openReports} icon={Flag} /></div>
    <h2 className="mb-4 mt-10 font-display text-2xl">Needs attention</h2>
    <div className="grid gap-4 md:grid-cols-3"><LinkCard href="/admin/employers" title={`${data.pendingEmployers} employer${data.pendingEmployers === 1 ? '' : 's'} awaiting verification`} detail="Review business details and approve or reject." icon={ShieldCheck} /><LinkCard href="/admin/reports" title={`${data.openReports} open report${data.openReports === 1 ? '' : 's'}`} detail="Review safety and content reports." icon={Flag} /><LinkCard href="/admin/users" title={`${data.pendingSkillEvidence} skill evidence item${data.pendingSkillEvidence === 1 ? '' : 's'}`} detail="Review evidence submitted by learners." icon={ClipboardList} /></div>
  </div>;
}

function SkillEvidencePanel() {
  const { data, isLoading } = useListSkillEvidence();
  const review = useReviewSkillEvidence();
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  if (isLoading) return <LoadingState />;
  if (!data?.length) return <EmptyState icon={ClipboardList} title="No evidence waiting" detail="Skill evidence submitted by learners appears here for review." />;
  const act = (id: number, status: 'Verified' | 'Rejected') => { setError(''); review.mutate({ id, data: { status, notes: notes[id] || undefined } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSkillEvidenceQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); }, onError: (e) => setError(errMsg(e)) }); };
  return <div className="space-y-3" data-testid="list-skill-evidence">{error && <Notice tone="error">{error}</Notice>}{data.map((e) => <div key={e.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`evidence-${e.id}`}><p className="text-sm font-bold">{e.skillName} <span className="font-normal text-muted-foreground">· {e.userName}</span></p><p className="mt-1 text-xs text-muted-foreground">{e.evidenceType}{e.evidenceUrl && <> · <a href={e.evidenceUrl} target="_blank" rel="noreferrer noopener" className="underline">open link <ExternalLink size={11} className="inline" /></a></>}</p>{e.evidenceNote && <p className="mt-2 text-sm">{e.evidenceNote}</p>}<input aria-label="Review note" value={notes[e.id] ?? ''} onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))} placeholder="Review note (required to reject)" className="mt-3 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm" /><div className="mt-3 flex gap-2"><Button onClick={() => act(e.id, 'Verified')} disabled={review.isPending} data-testid={`button-verify-skill-${e.id}`}><Check size={15} /> Verify skill</Button><Button variant="outline" onClick={() => act(e.id, 'Rejected')} disabled={review.isPending} data-testid={`button-reject-skill-${e.id}`}>Reject</Button></div></div>)}</div>;
}

function UserDetail({ id }: { id: number }) {
  const { data, isLoading } = useGetAdminUser(id);
  if (isLoading) return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  if (!data) return null;
  const p = data.profile;
  return <div className="grid gap-3 border-t border-border bg-muted/40 p-4 text-xs sm:grid-cols-2" data-testid={`user-detail-${id}`}><div><p><span className="font-bold">Applications:</span> {data.applications}</p><p><span className="font-bold">Reports involving this user:</span> {data.reportsAgainst}</p><p><span className="font-bold">Joined:</span> {formatDate(data.user.createdAt)}</p></div>{p && <div><p><span className="font-bold">Profile:</span> {p.city}{p.area ? `, ${p.area}` : ''} · {p.education} · {p.employmentStatus}</p><p><span className="font-bold">Goal:</span> {p.goal}</p><p><span className="font-bold">Skills:</span> {p.skills.map((s) => `${s.name} (${s.verificationStatus})`).join(', ') || 'None'}</p><p><span className="font-bold">Sakhi Score:</span> {p.readiness}/100 · {p.readinessLevel}</p></div>}</div>;
}

export function AdminUsers() {
  const [tab, setTab] = useState<'users' | 'evidence'>('users');
  const [role, setRole] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState('');
  const params = { role: role || undefined };
  const { data, isLoading, isError, refetch } = useListAdminUsers(params, { query: { queryKey: getListAdminUsersQueryKey(params) } });
  const setStatus = useUpdateAdminUserStatus();
  const qc = useQueryClient();
  return <div className="page-enter"><PageHeader eyebrow="People" title="Users" detail="View accounts and profiles, and manage inappropriate accounts where necessary." />
    <div className="mb-6 flex flex-wrap gap-2"><button type="button" className={tabCls(tab === 'users')} onClick={() => setTab('users')} data-testid="tab-users">Accounts</button><button type="button" className={tabCls(tab === 'evidence')} onClick={() => setTab('evidence')} data-testid="tab-skill-evidence">Skill evidence</button>{tab === 'users' && <><label className="sr-only" htmlFor="role-filter">Role</label><select id="role-filter" value={role} onChange={(e) => setRole(e.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm" data-testid="select-user-role"><option value="">All roles</option><option value="woman">Women</option><option value="employer">Employers</option><option value="admin">Admins</option></select></>}</div>
    {tab === 'evidence' ? <SkillEvidencePanel /> : isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card">{error && <div className="p-4"><Notice tone="error">{error}</Notice></div>}<div className="divide-y divide-border">{(data ?? []).map((u) => <div key={u.id} data-testid={`user-row-${u.id}`}><div className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{u.name}</p><p className="truncate text-xs text-muted-foreground">{u.email} · {u.role}{u.city ? ` · ${u.city}` : ''}{u.sakhiScore != null ? ` · Sakhi ${u.sakhiScore}` : ''}</p></div><StatusBadge status={u.status} /><button type="button" onClick={() => setOpen(open === u.id ? null : u.id)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-bold hover:border-primary" data-testid={`button-view-user-${u.id}`}>{open === u.id ? 'Hide' : 'View'}</button>{u.role !== 'admin' && <button type="button" disabled={setStatus.isPending} onClick={() => { setError(''); setStatus.mutate({ id: u.id, data: { status: u.status === 'active' ? 'suspended' : 'active' } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }), onError: (e) => setError(errMsg(e)) }); }} className="min-h-10 rounded-full px-3.5 text-xs font-bold text-muted-foreground hover:bg-muted" data-testid={`button-toggle-user-${u.id}`}>{u.status === 'active' ? 'Suspend' : 'Reactivate'}</button>}</div>{open === u.id && <UserDetail id={u.id} />}</div>)}</div></div>}
  </div>;
}

function EmployerCard({ e }: { e: AdminEmployer }) {
  const verify = useVerifyEmployer();
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const act = (status: 'Verified' | 'Rejected') => { setError(''); verify.mutate({ id: e.id, data: { status, notes: notes || undefined } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAdminEmployersQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); }, onError: (err) => setError(errMsg(err)) }); };
  return <article className="rounded-2xl border border-border bg-card p-5" data-testid={`employer-${e.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-bold">{e.businessName}</p><p className="text-xs text-muted-foreground">{e.employerName} · {e.email}{e.phone ? ` · ${e.phone}` : ''}</p></div><StatusBadge status={e.verificationStatus} /></div>
    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><p><span className="font-bold">Location:</span> {e.location}</p><p><span className="font-bold">Business type:</span> {e.businessType}</p><p><span className="font-bold">Opportunities:</span> {e.opportunityCount}</p><p><span className="font-bold">Submitted:</span> {formatDate(e.submittedAt ?? undefined)}</p></div>
    {e.description && <p className="mt-3 text-sm">{e.description}</p>}
    <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs leading-5"><p className="font-bold">Verification information</p><p className="mt-1">{e.verificationInfo || 'None provided'}</p>{e.evidenceUrl && <a href={e.evidenceUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 underline" data-testid={`link-evidence-${e.id}`}>Submitted evidence <ExternalLink size={11} /></a>}{e.reviewNotes && <p className="mt-2 text-muted-foreground">Previous review note: {e.reviewNotes}</p>}</div>
    <label className="sr-only" htmlFor={`review-${e.id}`}>Review notes</label><input id={`review-${e.id}`} value={notes} onChange={(ev) => setNotes(ev.target.value)} maxLength={1000} placeholder="Review notes (required to reject)" className="mt-3 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm" data-testid={`input-review-notes-${e.id}`} />
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    <div className="mt-3 flex flex-wrap gap-2">{e.verificationStatus !== 'Verified' && <Button onClick={() => act('Verified')} disabled={verify.isPending} data-testid={`button-approve-${e.id}`}>{verify.isPending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Approve</Button>}{e.verificationStatus !== 'Rejected' && <Button variant="outline" onClick={() => act('Rejected')} disabled={verify.isPending} data-testid={`button-reject-${e.id}`}>{e.verificationStatus === 'Verified' ? 'Revoke verification' : 'Reject'}</Button>}</div>
  </article>;
}

export function AdminEmployers() {
  const [status, setStatus] = useState('Pending');
  const params = { status: status || undefined };
  const { data, isLoading, isError, refetch } = useListAdminEmployers(params, { query: { queryKey: getListAdminEmployersQueryKey(params) } });
  return <div className="page-enter"><PageHeader eyebrow="Trust" title="Employers" detail="Review verification. Verification improves trust but does not guarantee safety." />
    <div className="mb-6 flex flex-wrap gap-2">{['Pending', 'Verified', 'Rejected', ''].map((s) => <button type="button" key={s || 'all'} onClick={() => setStatus(s)} className={tabCls(status === s)} data-testid={`filter-employers-${(s || 'all').toLowerCase()}`}>{s || 'All'}</button>)}</div>
    {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : !data?.length ? <EmptyState icon={ShieldCheck} title="Nothing here" detail="No employers with this status." /> : <div className="space-y-4">{data.map((e) => <EmployerCard key={e.id} e={e} />)}</div>}
  </div>;
}

export function AdminOpportunities() {
  const { data, isLoading, isError, refetch } = useListAdminOpportunities();
  const setStatus = useUpdateAdminOpportunityStatus();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<number | null>(null);
  const [error, setError] = useState('');
  const act = (id: number, status: string) => { setError(''); setStatus.mutate({ id, data: { status } }, { onSuccess: () => { setConfirm(null); qc.invalidateQueries({ queryKey: getListAdminOpportunitiesQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); }, onError: (e) => setError(errMsg(e)) }); };
  return <div className="page-enter"><PageHeader eyebrow="Moderation" title="Opportunities" detail="View listings, close them, or remove inappropriate opportunities." />
    {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
    {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card"><div className="divide-y divide-border">{(data ?? []).map((o) => <div key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-4" data-testid={`admin-opp-${o.id}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{o.title}</p><p className="truncate text-xs text-muted-foreground">{o.businessName} {o.employerVerified ? '(verified)' : '(not verified)'} · {o.category} · {o.location} · {o.applicantCount} applicants</p></div><StatusBadge status={o.status} />{o.status === 'open' && <button type="button" onClick={() => act(o.id, 'closed')} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-bold hover:border-primary" data-testid={`button-close-opp-${o.id}`}>Close</button>}{o.status !== 'open' && <button type="button" onClick={() => act(o.id, 'open')} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-bold hover:border-primary" data-testid={`button-reopen-opp-${o.id}`}>Reopen</button>}{o.status !== 'removed' && (confirm === o.id ? <span className="flex items-center gap-2 text-xs"><span>Remove?</span><button type="button" className="min-h-10 rounded-lg bg-[hsl(var(--accent)/.2)] px-3 font-bold" onClick={() => act(o.id, 'removed')} data-testid={`button-confirm-remove-opp-${o.id}`}>Yes</button><button type="button" className="min-h-10 px-2" onClick={() => setConfirm(null)}>No</button></span> : <button type="button" onClick={() => setConfirm(o.id)} className="min-h-10 rounded-full px-3.5 text-xs font-bold text-muted-foreground hover:bg-muted" data-testid={`button-remove-opp-${o.id}`}>Remove</button>)}</div>)}</div></div>}
  </div>;
}

function ReportCard({ r }: { r: Report }) {
  const review = useReviewReport();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [action, setAction] = useState<'none' | 'remove_opportunity' | 'suspend_user'>('none');
  const [error, setError] = useState('');
  const act = (status: 'Under Review' | 'Resolved' | 'Rejected') => { setError(''); review.mutate({ id: r.id, data: { status, resolutionNote: note || undefined, action: status === 'Resolved' ? action : 'none' } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAdminReportsQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getListAdminOpportunitiesQueryKey() }); }, onError: (e) => setError(errMsg(e)) }); };
  const closed = r.status === 'Resolved' || r.status === 'Rejected';
  return <article className="rounded-2xl border border-border bg-card p-5" data-testid={`admin-report-${r.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold">{r.targetLabel}</p><p className="text-xs text-muted-foreground">Reported by {r.reporterName} · {formatDate(r.createdAt)}</p></div><StatusBadge status={r.status} /></div>
    <p className="mt-3 text-sm font-semibold">{r.reason}</p>{r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
    {r.resolutionNote && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs">Resolution note: {r.resolutionNote}</p>}
    {!closed && <div className="mt-4 space-y-3 border-t border-border pt-4"><input aria-label="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Note for the reporter (required to resolve or reject)" className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm" data-testid={`input-report-note-${r.id}`} />
      {(r.targetType === 'opportunity' || r.targetType === 'employer') && <SelectInput label="Administrative action when resolving" value={action} onChange={(e) => setAction(e.target.value as typeof action)} options={[{ value: 'none', label: 'No further action' }, ...(r.targetType === 'opportunity' ? [{ value: 'remove_opportunity', label: 'Remove the opportunity' }] : [{ value: 'suspend_user', label: 'Suspend the employer account' }])]} data-testid={`select-report-action-${r.id}`} />}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">{r.status === 'Open' && <Button variant="outline" onClick={() => act('Under Review')} disabled={review.isPending} data-testid={`button-review-${r.id}`}>Mark under review</Button>}<Button onClick={() => act('Resolved')} disabled={review.isPending} data-testid={`button-resolve-${r.id}`}><Check size={15} /> Resolve</Button><Button variant="outline" onClick={() => act('Rejected')} disabled={review.isPending} data-testid={`button-reject-report-${r.id}`}>Reject report</Button></div></div>}
  </article>;
}

export function AdminReports() {
  const [status, setStatus] = useState('');
  const params = { status: status || undefined };
  const { data, isLoading, isError, refetch } = useListAdminReports(params, { query: { queryKey: getListAdminReportsQueryKey(params) } });
  return <div className="page-enter"><PageHeader eyebrow="Trust & safety" title="Reports" detail="Review, resolve or reject reports. Removing an opportunity or suspending an account is recorded against the report." />
    <div className="mb-6 flex flex-wrap gap-2">{['', 'Open', 'Under Review', 'Resolved', 'Rejected'].map((s) => <button type="button" key={s || 'all'} onClick={() => setStatus(s)} className={tabCls(status === s)} data-testid={`filter-reports-${(s || 'all').toLowerCase().replace(' ', '-')}`}>{s || 'All'}</button>)}</div>
    {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : !data?.length ? <EmptyState icon={Flag} title="No reports" detail="Nothing to review with this status." /> : <div className="space-y-4">{data.map((r) => <ReportCard key={r.id} r={r} />)}</div>}
  </div>;
}

// ---- courses ---------------------------------------------------------------------------
export function AdminCourses() {
  const { data, isLoading, isError, refetch } = useListAdminCourses();
  const create = useCreateAdminCourse();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Practical skills');
  const [error, setError] = useState('');
  return <div className="page-enter"><PageHeader eyebrow="Learning" title="Courses" detail="Create courses, manage lessons and assessments." action={<Button onClick={() => setShow((v) => !v)} data-testid="button-new-course"><Plus size={15} /> New course</Button>} />
    {show && <form className="mb-6 grid gap-3 rounded-2xl border border-primary/40 bg-[hsl(var(--primary)/.08)] p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="form-new-course" onSubmit={(e) => { e.preventDefault(); setError(''); create.mutate({ data: { title, category, published: false } }, { onSuccess: (c) => { qc.invalidateQueries({ queryKey: getListAdminCoursesQueryKey() }); setLocation(`/admin/courses/${c.id}`); }, onError: (err) => setError(errMsg(err)) }); }}><TextInput label="Course title" value={title} onChange={(e) => setTitle(e.target.value)} required data-testid="input-new-course-title" /><TextInput label="Category" value={category} onChange={(e) => setCategory(e.target.value)} required /><Button type="submit" disabled={create.isPending} data-testid="button-create-course">Create draft</Button>{error && <div className="sm:col-span-3"><Notice tone="error">{error}</Notice></div>}</form>}
    {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : <div className="grid gap-3 md:grid-cols-2">{(data ?? []).map((c) => <Link key={c.id} href={`/admin/courses/${c.id}`} className="rounded-2xl border border-border bg-card p-5 hover:border-primary/70" data-testid={`admin-course-${c.id}`}><div className="flex items-start justify-between gap-2"><p className="font-bold">{c.title}</p><Badge tone={c.published ? 'success' : 'soft'}>{c.published ? 'Published' : 'Draft'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{c.category} · {c.difficulty} · {c.lessons.length} lessons · {c.questions.length} questions · pass {c.passingScore}%</p><p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[hsl(var(--accent-foreground))]"><Pencil size={12} /> Manage</p></Link>)}</div>}
  </div>;
}

const emptyLesson = { title: '', description: '', videoUrl: '', durationMinutes: '10', content: '', objectives: [] as string[], resources: '' };
const emptyQ = { type: 'multiple_choice' as QuestionInput['type'], prompt: '', options: [] as string[], correctAnswer: '0', keywords: [] as string[], minKeywords: '1', explanation: '', skillName: '' };

export function AdminCourseEditor() {
  const id = Number(useParams<{ id: string }>().id);
  const { data: all, isLoading, isError, refetch } = useListAdminCourses();
  const qc = useQueryClient();
  const course = all?.find((c) => c.id === id);
  const refresh = () => qc.invalidateQueries({ queryKey: getListAdminCoursesQueryKey() });
  const updateCourse = useUpdateAdminCourse();
  const createLesson = useCreateAdminLesson(); const updateLesson = useUpdateAdminLesson(); const deleteLesson = useDeleteAdminLesson();
  const createQ = useCreateAdminQuestion(); const updateQ = useUpdateAdminQuestion(); const deleteQ = useDeleteAdminQuestion();
  const [cf, setCf] = useState({ title: '', category: '', difficulty: '', duration: '', description: '', passingScore: '70', published: false, skillsGained: [] as string[], verifiesSkills: [] as string[] });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [lesson, setLesson] = useState<{ id: number | null; f: typeof emptyLesson } | null>(null);
  const [q, setQ] = useState<{ id: number | null; f: typeof emptyQ } | null>(null);
  useEffect(() => { if (course) setCf({ title: course.title, category: course.category, difficulty: course.difficulty, duration: course.duration, description: course.description, passingScore: String(course.passingScore), published: course.published, skillsGained: course.skillsGained, verifiesSkills: course.verifiesSkills }); }, [course]);
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!course) return <ErrorState label="Course not found." />;
  const fail = (e: unknown) => setMsg({ tone: 'error', text: errMsg(e) });
  const saveCourse = () => { setMsg(null); updateCourse.mutate({ id, data: { ...cf, passingScore: Number(cf.passingScore) || 70 } }, { onSuccess: () => { refresh(); setMsg({ tone: 'success', text: 'Course saved.' }); }, onError: fail }); };
  const saveLesson = () => {
    if (!lesson) return; setMsg(null);
    const resources = lesson.f.resources.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [t, u] = l.includes('|') ? l.split('|').map((x) => x.trim()) : [l, l]; return { title: t!, url: u! }; });
    const data: LessonInput = { title: lesson.f.title, description: lesson.f.description, videoUrl: lesson.f.videoUrl.trim() || null, durationMinutes: Number(lesson.f.durationMinutes) || 10, content: lesson.f.content, objectives: lesson.f.objectives, resources };
    const opts = { onSuccess: () => { refresh(); setLesson(null); }, onError: fail };
    if (lesson.id) updateLesson.mutate({ id: lesson.id, data }, opts); else createLesson.mutate({ id, data }, opts);
  };
  const saveQuestion = () => {
    if (!q) return; setMsg(null);
    const data: QuestionInput = { type: q.f.type, prompt: q.f.prompt, options: q.f.options, correctAnswer: q.f.correctAnswer, keywords: q.f.keywords, minKeywords: Number(q.f.minKeywords) || 1, explanation: q.f.explanation, skillName: q.f.skillName || null };
    const opts = { onSuccess: () => { refresh(); setQ(null); }, onError: fail };
    if (q.id) updateQ.mutate({ id: q.id, data }, opts); else createQ.mutate({ id, data }, opts);
  };
  const setL = (k: keyof typeof emptyLesson, v: string | string[]) => setLesson((c) => c && { ...c, f: { ...c.f, [k]: v } });
  const setQf = (k: keyof typeof emptyQ, v: string | string[]) => setQ((c) => c && { ...c, f: { ...c.f, [k]: v } });
  return <div className="page-enter"><Link href="/admin/courses" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Back to courses</Link>
    <PageHeader eyebrow="Edit course" title={course.title} />
    {msg && <div className="mb-5"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    <section className="rounded-[1.5rem] border border-border bg-card p-6 sm:p-8" data-testid="form-course-details"><h2 className="font-display text-2xl">Course details</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2"><TextInput label="Title" value={cf.title} onChange={(e) => setCf({ ...cf, title: e.target.value })} data-testid="input-course-title" /><TextInput label="Category" value={cf.category} onChange={(e) => setCf({ ...cf, category: e.target.value })} /><TextInput label="Difficulty" value={cf.difficulty} onChange={(e) => setCf({ ...cf, difficulty: e.target.value })} /><TextInput label="Duration" value={cf.duration} onChange={(e) => setCf({ ...cf, duration: e.target.value })} placeholder="e.g. 2 hours" /><TextInput label="Passing score (%)" type="number" min={1} max={100} value={cf.passingScore} onChange={(e) => setCf({ ...cf, passingScore: e.target.value })} /></div>
      <div className="mt-5 space-y-5"><TextArea label="Description" value={cf.description} onChange={(e) => setCf({ ...cf, description: e.target.value })} /><TagInput label="Skills gained (display)" value={cf.skillsGained} onChange={(v) => setCf({ ...cf, skillsGained: v })} /><TagInput label="Skills verified by passing the assessment" value={cf.verifiesSkills} onChange={(v) => setCf({ ...cf, verifiesSkills: v })} hint="Must match skill names used in opportunities." /></div>
      <label className="mt-5 flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={cf.published} onChange={(e) => setCf({ ...cf, published: e.target.checked })} className="h-5 w-5 accent-[hsl(var(--primary))]" data-testid="checkbox-published" /> Published (visible to learners)</label>
      <Button className="mt-5" onClick={saveCourse} disabled={updateCourse.isPending} data-testid="button-save-course">{updateCourse.isPending && <Loader2 size={15} className="animate-spin" />} Save course</Button></section>

    <section className="mt-6 rounded-[1.5rem] border border-border bg-card p-6 sm:p-8" data-testid="section-lessons"><div className="flex items-center justify-between"><h2 className="font-display text-2xl">Lessons</h2><Button variant="outline" onClick={() => setLesson({ id: null, f: emptyLesson })} data-testid="button-add-lesson"><Plus size={15} /> Add lesson</Button></div>
      <div className="mt-4 divide-y divide-border">{course.lessons.map((l) => <div key={l.id} className="flex items-center gap-3 py-3" data-testid={`lesson-row-${l.id}`}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">{l.position}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.title}</p><p className="text-xs text-muted-foreground">{l.durationMinutes} min{l.videoUrl ? ' · has video' : ' · text only'}</p></div><button type="button" className="min-h-10 rounded-full border border-border px-3 text-xs font-bold" onClick={() => setLesson({ id: l.id, f: { title: l.title, description: l.description, videoUrl: l.videoUrl ?? '', durationMinutes: String(l.durationMinutes), content: l.content, objectives: l.objectives, resources: l.resources.map((r) => `${r.title} | ${r.url}`).join('\n') } })} data-testid={`button-edit-lesson-${l.id}`}>Edit</button><button type="button" aria-label={`Delete ${l.title}`} className="min-h-10 rounded-full px-3 text-muted-foreground hover:bg-muted" onClick={() => deleteLesson.mutate({ id: l.id }, { onSuccess: refresh })} data-testid={`button-delete-lesson-${l.id}`}><Trash2 size={14} /></button></div>)}{!course.lessons.length && <p className="py-3 text-sm text-muted-foreground">No lessons yet.</p>}</div>
      {lesson && <div className="mt-5 space-y-4 rounded-2xl bg-muted/60 p-5" data-testid="form-lesson"><TextInput label="Lesson title" value={lesson.f.title} onChange={(e) => setL('title', e.target.value)} data-testid="input-lesson-title" /><TextInput label="Short description" value={lesson.f.description} onChange={(e) => setL('description', e.target.value)} /><div className="grid gap-4 sm:grid-cols-2"><TextInput label="Video URL (optional)" type="url" value={lesson.f.videoUrl} onChange={(e) => setL('videoUrl', e.target.value)} placeholder="https://…" hint="YouTube, Vimeo, or a direct .mp4 link. Leave empty for a text-only lesson." data-testid="input-lesson-video" /><TextInput label="Duration (minutes)" type="number" min={1} value={lesson.f.durationMinutes} onChange={(e) => setL('durationMinutes', e.target.value)} /></div><TextArea label="Lesson text" rows={6} value={lesson.f.content} onChange={(e) => setL('content', e.target.value)} hint="Separate paragraphs with a blank line." data-testid="input-lesson-content" /><TagInput label="Learning objectives" value={lesson.f.objectives} onChange={(v) => setL('objectives', v)} /><TextArea label="Resources (one per line: Title | https://link)" rows={2} value={lesson.f.resources} onChange={(e) => setL('resources', e.target.value)} /><div className="flex gap-2"><Button onClick={saveLesson} disabled={createLesson.isPending || updateLesson.isPending} data-testid="button-save-lesson"><Check size={15} /> Save lesson</Button><Button variant="outline" onClick={() => setLesson(null)}>Cancel</Button></div></div>}
    </section>

    <section className="mt-6 rounded-[1.5rem] border border-border bg-card p-6 sm:p-8" data-testid="section-questions"><div className="flex items-center justify-between"><h2 className="font-display text-2xl">Assessment questions</h2><Button variant="outline" onClick={() => setQ({ id: null, f: emptyQ })} data-testid="button-add-question"><Plus size={15} /> Add question</Button></div>
      <div className="mt-4 divide-y divide-border">{course.questions.map((x) => <div key={x.id} className="flex items-center gap-3 py-3" data-testid={`question-row-${x.id}`}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">{x.position}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{x.prompt}</p><p className="text-xs text-muted-foreground">{x.type.replace('_', ' ')}</p></div><button type="button" className="min-h-10 rounded-full border border-border px-3 text-xs font-bold" onClick={() => setQ({ id: x.id, f: { type: x.type as QuestionInput['type'], prompt: x.prompt, options: x.options, correctAnswer: x.correctAnswer, keywords: x.keywords, minKeywords: String(x.minKeywords), explanation: x.explanation, skillName: x.skillName ?? '' } })} data-testid={`button-edit-question-${x.id}`}>Edit</button><button type="button" aria-label="Delete question" className="min-h-10 rounded-full px-3 text-muted-foreground hover:bg-muted" onClick={() => deleteQ.mutate({ id: x.id }, { onSuccess: refresh })} data-testid={`button-delete-question-${x.id}`}><Trash2 size={14} /></button></div>)}{!course.questions.length && <p className="py-3 text-sm text-muted-foreground">No questions yet. Learners can only be assessed once questions exist.</p>}</div>
      {q && <div className="mt-5 space-y-4 rounded-2xl bg-muted/60 p-5" data-testid="form-question"><SelectInput label="Type" value={q.f.type} onChange={(e) => { const t = e.target.value as QuestionInput['type']; setQ((c) => c && { ...c, f: { ...c.f, type: t, correctAnswer: t === 'true_false' ? 'true' : '0' } }); }} options={[{ value: 'multiple_choice', label: 'Multiple choice' }, { value: 'true_false', label: 'True / false' }, { value: 'short_answer', label: 'Short answer (keyword check)' }]} data-testid="select-question-type" /><TextArea label="Question" value={q.f.prompt} onChange={(e) => setQf('prompt', e.target.value)} data-testid="input-question-prompt" />
        {q.f.type === 'multiple_choice' && <><TagInput label="Options" value={q.f.options} onChange={(v) => setQf('options', v)} hint="Type each option and press Enter, then choose the correct one below." /><SelectInput label="Correct option" value={q.f.correctAnswer} onChange={(e) => setQf('correctAnswer', e.target.value)} options={q.f.options.length ? q.f.options.map((o, i) => ({ value: String(i), label: `${i + 1}. ${o}` })) : [{ value: '0', label: 'Add options first' }]} data-testid="select-correct-option" /></>}
        {q.f.type === 'true_false' && <SelectInput label="Correct answer" value={q.f.correctAnswer} onChange={(e) => setQf('correctAnswer', e.target.value)} options={[{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }]} />}
        {q.f.type === 'short_answer' && <><TagInput label="Accepted keywords" value={q.f.keywords} onChange={(v) => setQf('keywords', v)} hint="A response is accepted when it mentions enough of these words." /><TextInput label="Keywords needed" type="number" min={1} value={q.f.minKeywords} onChange={(e) => setQf('minKeywords', e.target.value)} /></>}
        <TextArea label="Explanation shown after answering" value={q.f.explanation} onChange={(e) => setQf('explanation', e.target.value)} /><TextInput label="Skill tested (optional)" value={q.f.skillName} onChange={(e) => setQf('skillName', e.target.value)} />
        <div className="flex gap-2"><Button onClick={saveQuestion} disabled={createQ.isPending || updateQ.isPending} data-testid="button-save-question"><Check size={15} /> Save question</Button><Button variant="outline" onClick={() => setQ(null)}>Cancel</Button></div></div>}
    </section></div>;
}
