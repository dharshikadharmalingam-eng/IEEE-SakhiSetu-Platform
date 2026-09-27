import { useState } from 'react';
import { Bell, CheckCheck, Flag, Loader2, MessageSquareHeart, Star } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListFeedbackQueryKey, getListNotificationsQueryKey, getListReportsQueryKey, getGetSakhiScoreQueryKey, useCreateFeedback, useListFeedback, useListNotifications, useListReports,
  useMarkAllNotificationsRead, useMarkNotificationRead,
} from '@workspace/api-client-react';
import type { Feedback } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { FEEDBACK_CATEGORIES } from '@/lib/options';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Notice, PageHeader, ReportForm, SafetyNote, StatusBadge, TextArea, cx, errMsg, formatDate, invalidateSakhiScore } from '@/lib/ui';

function Stars({ value, onChange, label }: { value: number; onChange?: (n: number) => void; label: string }) {
  return <div role={onChange ? 'radiogroup' : 'img'} aria-label={`${label}: ${value || 'not rated'} of 5`} className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => onChange ? <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted" data-testid={`star-${label.toLowerCase().replaceAll(' ', '-')}-${n}`}><Star size={20} className={n <= value ? 'fill-primary text-primary' : 'text-muted-foreground'} /></button> : <Star key={n} size={14} className={n <= Math.round(value) ? 'fill-primary text-primary' : 'text-muted-foreground/40'} />)}</div>;
}

function FeedbackForm({ applicationId, direction, onDone }: { applicationId: number; direction: 'employer_to_woman' | 'woman_to_employer'; onDone: () => void }) {
  const create = useCreateFeedback();
  const cats = FEEDBACK_CATEGORIES[direction];
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  return <form className="mt-4 space-y-4 rounded-xl bg-muted/60 p-4" data-testid={`form-feedback-${applicationId}`} onSubmit={(e) => { e.preventDefault(); setError(''); create.mutate({ data: { applicationId, ratings, comment } }, { onSuccess: onDone, onError: (err) => setError(errMsg(err)) }); }}>
    {cats.map((c) => <div key={c.key} className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{c.label}</span><Stars label={c.label} value={ratings[c.key] ?? 0} onChange={(n) => setRatings((r) => ({ ...r, [c.key]: n }))} /></div>)}
    <TextArea label="Written feedback (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Keep it factual and respectful." data-testid="input-feedback-comment" />
    {error && <Notice tone="error">{error}</Notice>}
    <Button type="submit" disabled={create.isPending || Object.keys(ratings).length === 0} data-testid={`button-submit-feedback-${applicationId}`}>{create.isPending && <Loader2 size={15} className="animate-spin" />} Send feedback</Button>
  </form>;
}

function FeedbackCard({ f, reportable }: { f: Feedback; reportable?: boolean }) {
  const [reporting, setReporting] = useState(false);
  return <div className="rounded-2xl border border-border bg-card p-5" data-testid={`feedback-${f.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold">{f.opportunityTitle}</p><p className="text-xs text-muted-foreground">{f.counterpart} · {formatDate(f.createdAt)}</p></div><div className="text-right"><p className="font-mono-ui text-lg font-bold">{f.rating.toFixed(1)}</p><Stars label="Overall" value={f.rating} /></div></div>
    <div className="mt-3 flex flex-wrap gap-2">{Object.entries(f.ratings).map(([k, v]) => <Badge key={k}>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}: {v}/5</Badge>)}</div>
    {f.comment && <p className="mt-3 text-sm leading-6">“{f.comment}”</p>}
    {reportable && <button type="button" onClick={() => setReporting((v) => !v)} className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid={`button-report-feedback-${f.id}`}><Flag size={13} /> Report this feedback</button>}
    {reporting && <div className="mt-3"><ReportForm targetType="feedback" targetId={f.id} label="this feedback" /></div>}
  </div>;
}

export function FeedbackPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useListFeedback();
  const [openId, setOpenId] = useState<number | null>(null);
  if (isLoading) return <LoadingState label="Loading feedback" />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;
  const direction = user?.role === 'employer' ? 'employer_to_woman' : 'woman_to_employer';
  const done = () => { setOpenId(null); qc.invalidateQueries({ queryKey: getListFeedbackQueryKey() }); qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }); invalidateSakhiScore(qc); qc.invalidateQueries({ queryKey: getGetSakhiScoreQueryKey() }); };
  return <div className="page-enter"><PageHeader eyebrow="After the work" title="Feedback" detail={user?.role === 'woman' ? 'Feedback from completed work helps your profile, and your feedback helps other women.' : 'Share fair, factual feedback after completed work.'} />
    <section className="mb-8"><h2 className="font-display text-2xl">Feedback due</h2><div className="mt-4 space-y-3">{data.due.length ? data.due.map((d) => <div key={d.applicationId} className="rounded-2xl border border-primary/40 bg-[hsl(var(--primary)/.07)] p-5" data-testid={`due-${d.applicationId}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold">{d.opportunityTitle}</p><p className="text-xs text-muted-foreground">{d.counterpart} · completed {formatDate(d.completedAt)}</p></div><Button variant="outline" onClick={() => setOpenId(openId === d.applicationId ? null : d.applicationId)} data-testid={`button-give-feedback-${d.applicationId}`}><MessageSquareHeart size={15} /> {openId === d.applicationId ? 'Close' : 'Give feedback'}</Button></div>{openId === d.applicationId && <FeedbackForm applicationId={d.applicationId} direction={direction} onDone={done} />}</div>) : <EmptyState icon={MessageSquareHeart} title="Nothing due" detail="Feedback opens after an employer marks selected work as completed." />}</div></section>
    <div className="grid gap-8 lg:grid-cols-2"><section><h2 className="font-display text-2xl">Received</h2><div className="mt-4 space-y-3">{data.received.length ? data.received.map((f) => <FeedbackCard key={f.id} f={f} reportable />) : <p className="text-sm text-muted-foreground">No feedback received yet.</p>}</div></section><section><h2 className="font-display text-2xl">Given</h2><div className="mt-4 space-y-3">{data.given.length ? data.given.map((f) => <FeedbackCard key={f.id} f={f} />) : <p className="text-sm text-muted-foreground">You have not given feedback yet.</p>}</div></section></div>
    <div className="mt-8 max-w-2xl"><SafetyNote /></div>
  </div>;
}

export function ReportsPage() {
  const { data, isLoading, isError, refetch } = useListReports();
  const [open, setOpen] = useState(false);
  return <div className="page-enter"><PageHeader eyebrow="Trust & safety" title="Reports" detail="Report an employer, an opportunity, feedback, or anything inappropriate. An administrator reviews every report." action={<Button variant="outline" onClick={() => setOpen((v) => !v)} data-testid="button-new-report"><Flag size={15} /> Report other content</Button>} />
    <div className="mb-6 max-w-2xl"><SafetyNote /></div>
    {open && <div className="mb-8 max-w-2xl"><ReportForm targetType="content" targetId={0} label="inappropriate content" onDone={() => setOpen(false)} /></div>}
    {isLoading ? <LoadingState label="Loading your reports" /> : isError ? <ErrorState onRetry={() => refetch()} /> : !data?.length ? <EmptyState icon={Flag} title="No reports filed" detail="Use the Report links on opportunities, employers or feedback whenever something does not feel right." /> : <div className="space-y-3">{data.map((r) => <div key={r.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`report-${r.id}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">{r.targetLabel}</p><StatusBadge status={r.status} /></div><p className="mt-1 text-xs text-muted-foreground">{r.reason} · {formatDate(r.createdAt)}</p>{r.description && <p className="mt-2 text-sm">{r.description}</p>}{r.resolutionNote && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs leading-5"><span className="font-bold">Administrator note:</span> {r.resolutionNote}</p>}</div>)}</div>}
  </div>;
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, refetch } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey() } });
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const refresh = () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  return <div className="page-enter"><PageHeader eyebrow="Stay informed" title="Notifications" detail="Updates about your learning, matches, applications and account." action={<Button variant="outline" onClick={() => markAll.mutate(undefined, { onSuccess: refresh })} disabled={!data?.unreadCount || markAll.isPending} data-testid="button-mark-all-read"><CheckCheck size={15} /> Mark all as read</Button>} />
    {isLoading ? <LoadingState label="Loading notifications" /> : isError ? <ErrorState onRetry={() => refetch()} /> : !data?.items.length ? <EmptyState icon={Bell} title="You are all caught up" detail="New matches, application updates and learning milestones will appear here." /> : <ul className="space-y-2" data-testid="list-notifications">{data.items.map((n) => <li key={n.id}><button type="button" onClick={() => { if (!n.read) markOne.mutate({ id: n.id }, { onSuccess: refresh }); if (n.link) setLocation(n.link); }} className={cx('flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors hover:border-primary/60', n.read ? 'border-border bg-card' : 'border-primary/40 bg-[hsl(var(--primary)/.08)]')} data-testid={`notification-${n.id}`} data-read={n.read}><span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', n.read ? 'bg-muted' : 'bg-accent')} aria-label={n.read ? 'Read' : 'Unread'} /><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{n.title}</span>{n.body && <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{n.body}</span>}<span className="mt-1 block text-[11px] text-muted-foreground">{formatDate(n.createdAt)}</span></span></button></li>)}</ul>}
  </div>;
}
