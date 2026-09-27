import { Award, Printer } from 'lucide-react';
import { useListCertificates } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, formatDate } from '@/lib/ui';

export function CertificatesPage() {
  const { data, isLoading, isError, refetch } = useListCertificates();
  if (isLoading) return <LoadingState label="Finding your certificates" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const certs = data ?? [];
  return <div className="page-enter"><PageHeader eyebrow="Your learning record" title="Certificates" detail="A SakhiSetu certificate records that you completed SakhiSetu learning and its assessment." action={certs.length > 0 ? <Button variant="outline" onClick={() => window.print()} data-testid="button-print-certificates"><Printer size={15} /> Print</Button> : undefined} />
    {!certs.length ? <EmptyState icon={Award} title="No certificates yet" detail="Complete every lesson in a course and pass its assessment to earn one." action={<Link href="/learning" className="mt-5"><Button data-testid="button-empty-learning">Browse learning</Button></Link>} /> : <div className="grid gap-5 lg:grid-cols-2">{certs.map((c) => <article key={c.id} className="relative overflow-hidden rounded-[1.75rem] border-2 border-primary/50 bg-card p-7 sm:p-9" data-testid={`certificate-${c.courseId}`}>
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border-[18px] border-primary/25" />
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--accent-foreground))]">SakhiSetu learning record</p>
      <h2 className="mt-4 font-display text-3xl leading-tight">{c.courseTitle}</h2>
      <p className="mt-5 text-sm text-muted-foreground">Awarded to</p><p className="font-display text-2xl">{c.holderName}</p>
      <p className="mt-4 text-sm font-semibold" data-testid="text-certificate-wording">{c.wording}</p>
      {c.skills.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Skills verified: {c.skills.join(', ')}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><span>Assessment score {c.score}% · {formatDate(c.issuedAt)}</span><span className="font-mono-ui">{c.code}</span></div>
      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">{c.disclaimer}</p>
    </article>)}</div>}
  </div>;
}
