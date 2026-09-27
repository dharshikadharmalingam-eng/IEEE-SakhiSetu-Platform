import { useState } from 'react';
import { ArrowRight, ChevronRight, FileCheck2, Loader2, MessageSquareHeart, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetApplicationQueryKey, getGetDashboardQueryKey, getListApplicationsQueryKey, getListOpportunitiesQueryKey, useGetApplication, useListApplications, useWithdrawApplication } from '@workspace/api-client-react';
import type { Application } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Button, EmptyState, ErrorState, LoadingState, Notice, PageHeader, StatusBadge, errMsg, formatDate } from '@/lib/ui';

const WITHDRAWABLE = ['Applied', 'Under Review', 'Shortlisted', 'Interview'];

function History({ id }: { id: number }) {
  const { data, isLoading } = useGetApplication(id, { query: { queryKey: getGetApplicationQueryKey(id) } });
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading history…</p>;
  return <ol className="space-y-2 border-l-2 border-border pl-4" data-testid={`history-${id}`}>{(data?.history ?? []).map((h, i) => <li key={i} className="text-xs"><span className="font-bold">{h.status}</span> <span className="text-muted-foreground">· {formatDate(h.createdAt)}</span>{h.note && <span className="block text-muted-foreground">{h.note}</span>}</li>)}</ol>;
}

function Row({ a }: { a: Application }) {
  const qc = useQueryClient();
  const withdraw = useWithdrawApplication();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  return <div className="px-5 py-5" data-testid={`application-${a.id}`}>
    <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_.7fr_1.1fr] md:items-center md:gap-4">
      <div><Link href={`/opportunities/${a.opportunityId}`} className="text-sm font-bold hover:underline">{a.opportunity}</Link><p className="mt-1 text-xs text-muted-foreground">{a.employer}{a.matchPercent ? ` · ${a.matchPercent}% match at application` : ''}</p></div>
      <p className="text-xs text-muted-foreground"><span className="mr-2 md:hidden">Applied</span>{formatDate(a.dateApplied)}</p>
      <div data-testid={`status-application-${a.id}`}><StatusBadge status={a.status} /></div>
      <p className="flex items-start gap-1 text-xs font-semibold"><ChevronRight size={13} className="mt-0.5 shrink-0 text-[hsl(var(--accent-foreground))]" />{a.nextStep}</p>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="min-h-10 rounded-full border border-border px-3.5 text-xs font-bold hover:border-primary" aria-expanded={open} data-testid={`button-history-${a.id}`}>{open ? 'Hide history' : 'View history'}</button>
      {a.feedbackDue && <Link href="/feedback" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-bold text-primary-foreground" data-testid={`link-feedback-${a.id}`}><MessageSquareHeart size={13} /> Share feedback</Link>}
      {WITHDRAWABLE.includes(a.status) && (confirm ? <span className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Withdraw this application?</span><button type="button" className="min-h-10 rounded-lg bg-[hsl(var(--accent)/.2)] px-3 font-bold" onClick={() => withdraw.mutate({ id: a.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListApplicationsQueryKey() }); qc.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); }, onError: (e) => setError(errMsg(e)) })} disabled={withdraw.isPending} data-testid={`button-confirm-withdraw-${a.id}`}>{withdraw.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Yes, withdraw'}</button><button type="button" className="min-h-10 px-2" onClick={() => setConfirm(false)}>Keep</button></span> : <button type="button" onClick={() => setConfirm(true)} className="min-h-10 rounded-full px-3.5 text-xs font-bold text-muted-foreground hover:bg-muted" data-testid={`button-withdraw-${a.id}`}>Withdraw</button>)}
    </div>
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    {open && <div className="mt-4"><History id={a.id} /></div>}
  </div>;
}

export function ApplicationsPage() {
  const { data, isLoading, isError, refetch } = useListApplications();
  const applications = data ?? [];
  return <div className="page-enter"><PageHeader eyebrow="Keep moving" title="Applications" detail="A calm place to see what is happening now and what to do next." action={<Link href="/opportunities"><Button data-testid="button-find-more-roles"><Plus size={15} /> Find another role</Button></Link>} />
    {isLoading ? <LoadingState label="Gathering your applications" /> : isError ? <ErrorState onRetry={() => refetch()} /> : !applications.length ? <EmptyState icon={FileCheck2} title="Your application story starts here" detail="When a role feels right, apply with confidence. We will keep the next step visible." action={<Link href="/opportunities" className="mt-5"><Button data-testid="button-empty-find-role">Explore opportunities <ArrowRight size={15} /></Button></Link>} /> : <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card"><div className="hidden grid-cols-[1.4fr_1fr_.7fr_1.1fr] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground md:grid"><span>Opportunity</span><span>Applied</span><span>Status</span><span>Next step</span></div><div className="divide-y divide-border">{applications.map((a) => <Row key={a.id} a={a} />)}</div></div>}
  </div>;
}
