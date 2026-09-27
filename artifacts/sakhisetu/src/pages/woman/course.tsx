import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Award, BookOpen, Check, CheckCircle2, ClipboardCheck, Clock3, ExternalLink, Loader2, Play, RotateCcw, Send, Sparkles, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCourseQueryKey, getListCertificatesQueryKey, getListCoursesQueryKey, getListSkillsQueryKey, getListAssessmentsQueryKey, getListMatchesQueryKey, getListOpportunitiesQueryKey,
  useEnrollCourse, useGetAiStatus, useGetCourse, useSubmitCourseAssessment, useSubmitSkillCheck, useUpdateCourseProgress,
} from '@workspace/api-client-react';
import type { AssessmentResult, CourseDetail, Lesson, Question } from '@workspace/api-client-react';
import { Link, useParams, useSearch } from 'wouter';
import { Badge, Button, ErrorState, LoadingState, Notice, ProgressBar, cx, errMsg, formatDate, invalidateSakhiScore } from '@/lib/ui';

/** Turn a configured video link into something embeddable. Only http(s) links reach here (validated server-side). */
function VideoPlayer({ url, title }: { url: string; title: string }) {
  let embed: string | null = null;
  let direct = false;
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname) && u.searchParams.get('v')) embed = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.searchParams.get('v')!)}`;
    else if (u.hostname === 'youtu.be') embed = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
    else if (/(^|\.)vimeo\.com$/.test(u.hostname) && /\d+/.test(u.pathname)) embed = `https://player.vimeo.com/video/${u.pathname.match(/\d+/)![0]}`;
    else if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) direct = true;
  } catch { /* invalid url falls through to link */ }
  if (embed) return <div className="aspect-video overflow-hidden rounded-2xl bg-secondary" data-testid="video-lesson"><iframe src={embed} title={title} className="h-full w-full" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>;
  if (direct) return <video src={url} controls preload="metadata" className="aspect-video w-full rounded-2xl bg-secondary" data-testid="video-lesson"><track kind="captions" /></video>;
  return <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:border-primary" data-testid="link-lesson-video"><Play size={15} /> Watch the video lesson <ExternalLink size={13} /></a>;
}

function LessonPanel({ lesson, index, total, onToggle, pending, id }: { lesson: Lesson; index: number; total: number; onToggle: () => void; pending: boolean; id: number }) {
  return <div className="rounded-2xl bg-muted/60 p-5 sm:p-6" data-testid="panel-lesson">
    <p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Lesson {index + 1} of {total} · <Clock3 size={11} className="mb-0.5 inline" /> {lesson.durationMinutes} min</p>
    <h2 className="mt-3 font-display text-2xl" data-testid="text-lesson-title">{lesson.title}</h2>
    {lesson.description && <p className="mt-2 text-sm text-muted-foreground">{lesson.description}</p>}
    {lesson.videoUrl && <div className="mt-5"><VideoPlayer url={lesson.videoUrl} title={lesson.title} /></div>}
    {lesson.content && <div className="mt-5 space-y-3 text-sm leading-7">{lesson.content.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
    {lesson.objectives.length > 0 && <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Learning objectives</p><ul className="mt-2 space-y-1.5 text-sm">{lesson.objectives.map((o) => <li key={o} className="flex gap-2"><CheckCircle2 size={15} className="mt-1 shrink-0 text-[hsl(var(--chart-3))]" />{o}</li>)}</ul></div>}
    {lesson.resources.length > 0 && <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Resources</p><ul className="mt-2 space-y-1.5 text-sm">{lesson.resources.map((r) => <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline">{r.title} <ExternalLink size={12} /></a></li>)}</ul></div>}
    <Button className="mt-6" variant={lesson.completed ? 'outline' : 'primary'} onClick={onToggle} disabled={pending} data-testid="button-complete-lesson" data-lesson-id={lesson.id} aria-describedby={`course-${id}`}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {lesson.completed ? 'Completed — mark as not done' : 'Mark lesson complete'}</Button>
  </div>;
}

function QuestionField({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const name = `q-${q.id}`;
  const options = q.type === 'true_false' ? [{ v: 'true', l: 'True' }, { v: 'false', l: 'False' }] : q.options.map((o, i) => ({ v: String(i), l: o }));
  return <fieldset className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid={`question-${q.id}`}><legend className="px-1 text-sm font-bold">{q.position}. {q.prompt}</legend>
    {q.type === 'short_answer' ? <textarea aria-label={`Answer to question ${q.position}`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} maxLength={1000} placeholder="Write your answer in a sentence or two" className="mt-3 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-primary/20" data-testid={`answer-${q.id}`} /> :
      <div className="mt-3 grid gap-2">{options.map((o) => <label key={o.v} className={cx('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors', value === o.v ? 'border-primary bg-[hsl(var(--primary)/.12)]' : 'border-border hover:border-primary/60')}><input type="radio" name={name} value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid={`answer-${q.id}-${o.v}`} />{o.l}</label>)}</div>}
  </fieldset>;
}

function Result({ result, questions, onRetry }: { result: AssessmentResult; questions: Question[]; onRetry: () => void }) {
  return <div className={cx('rounded-2xl border p-5 sm:p-6', result.passed ? 'border-[hsl(var(--chart-3)/.4)] bg-[hsl(var(--chart-3)/.08)]' : 'border-border bg-card')} data-testid="panel-assessment-result" role="status">
    <div className="flex items-start gap-3">{result.passed ? <CheckCircle2 className="mt-1 shrink-0 text-[hsl(var(--chart-3))]" /> : <XCircle className="mt-1 shrink-0 text-[hsl(var(--accent-foreground))]" />}<div><p className="font-display text-2xl" data-testid="text-assessment-score">{result.passed ? 'Passed' : 'Not passed yet'} · {result.score}%</p><p className="mt-1 text-sm leading-6" data-testid="status-assessment-result">{result.message}</p></div></div>
    {result.passed && <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {result.verifiedSkills.length > 0 && <div className="rounded-xl bg-card p-3 text-sm"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Skill verified</p><p className="mt-1 font-semibold">{result.verifiedSkills.join(', ')}</p></div>}
      {result.certificateGenerated && <Link href="/certificates" className="rounded-xl bg-card p-3 text-sm hover:ring-2 hover:ring-primary/40" data-testid="link-view-certificate"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Certificate</p><p className="mt-1 flex items-center gap-1 font-semibold"><Award size={14} /> View your learning record</p></Link>}
      <Link href="/sakhi-score" className="rounded-xl bg-card p-3 text-sm hover:ring-2 hover:ring-primary/40" data-testid="link-score-updated"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Sakhi Score</p><p className="mt-1 font-mono-ui font-bold" data-testid="text-score-change">{result.sakhiScore.before} → {result.sakhiScore.after}</p></Link>
    </div>}
    <div className="mt-5 space-y-2">{result.results.map((r, i) => <div key={r.questionId} className="flex gap-2 text-sm leading-6">{r.correct ? <Check size={16} className="mt-1 shrink-0 text-[hsl(var(--chart-3))]" /> : <XCircle size={16} className="mt-1 shrink-0 text-[hsl(var(--accent-foreground))]" />}<p><span className="font-semibold">Q{questions[i]?.position ?? i + 1}.</span> {r.feedback}</p></div>)}</div>
    {result.aiFeedback && <div className="mt-5 rounded-xl bg-card p-4" data-testid="panel-ai-feedback"><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.12em] text-muted-foreground"><Sparkles size={13} /> {result.aiFeedback.label}</p><p className="mt-2 text-sm leading-6">{result.aiFeedback.summary}</p>{result.aiFeedback.improvementAreas.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{result.aiFeedback.improvementAreas.map((a) => <li key={a}>{a}</li>)}</ul>}{result.aiFeedback.practiceQuestions.length > 0 && <><p className="mt-3 text-xs font-bold">Practice questions</p><ul className="mt-1 list-disc pl-5 text-sm">{result.aiFeedback.practiceQuestions.map((a) => <li key={a}>{a}</li>)}</ul></>}<p className="mt-3 text-[11px] text-muted-foreground">Feedback on your learning only. It does not affect matching and is not a certification.</p></div>}
    <div className="mt-5 flex flex-wrap gap-2">{!result.passed && <Button onClick={onRetry} data-testid="button-retry-assessment"><RotateCcw size={15} /> Try again</Button>}{result.passed && <><Link href="/opportunities"><Button data-testid="button-see-matches">See matching opportunities <ArrowRight size={15} /></Button></Link><Link href="/learning"><Button variant="outline" data-testid="button-further-upskilling">Keep upskilling</Button></Link></>}</div>
  </div>;
}

function Assessment({ course, id }: { course: CourseDetail; id: number }) {
  const qc = useQueryClient();
  const courseAssessment = useSubmitCourseAssessment();
  const skillCheck = useSubmitSkillCheck();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState('');
  const [skillMode, setSkillMode] = useState(false);
  const useSkillCheck = !course.assessmentReady || skillMode;
  const pending = courseAssessment.isPending || skillCheck.isPending;
  const answered = Object.values(answers).filter((a) => a.trim()).length;
  const submit = () => {
    setError('');
    const payload = course.questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' }));
    const onSuccess = (r: AssessmentResult) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: getGetCourseQueryKey(id) }); qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); qc.invalidateQueries({ queryKey: getListSkillsQueryKey() });
      qc.invalidateQueries({ queryKey: getListAssessmentsQueryKey() }); qc.invalidateQueries({ queryKey: getListCertificatesQueryKey() }); qc.invalidateQueries({ queryKey: getListMatchesQueryKey() }); qc.invalidateQueries({ queryKey: getListOpportunitiesQueryKey() }); invalidateSakhiScore(qc);
    };
    if (useSkillCheck) skillCheck.mutate({ data: { courseId: id, answers: payload } }, { onSuccess, onError: (e) => setError(errMsg(e)) });
    else courseAssessment.mutate({ id, data: { answers: payload } }, { onSuccess, onError: (e) => setError(errMsg(e)) });
  };
  if (!course.questions.length) return <Notice>This course does not have an assessment yet.</Notice>;
  if (result) return <Result result={result} questions={course.questions} onRetry={() => { setResult(null); setAnswers({}); }} />;
  return <div className="space-y-4" data-testid="panel-assessment">
    {useSkillCheck ? <Notice tone="info">{course.assessmentReady ? 'You chose the skill check.' : 'Lessons are not all complete yet.'} A skill check lets you verify a skill you already have without the lessons. Finish the lessons and pass the course assessment to earn a completion certificate.</Notice> : <Notice tone="success">You finished every lesson. Pass with {course.passingScore}% to verify what you learned and earn your certificate.</Notice>}
    {course.assessmentReady && <button type="button" onClick={() => setSkillMode((v) => !v)} className="text-xs font-bold underline" data-testid="button-toggle-skill-check">{skillMode ? 'Take the course assessment instead' : 'Just take the skill check (no certificate)'}</button>}
    {course.questions.map((q) => <QuestionField key={q.id} q={q} value={answers[q.id] ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />)}
    {error && <Notice tone="error">{error}</Notice>}
    <div className="flex flex-wrap items-center gap-3"><Button onClick={submit} disabled={pending || answered === 0} data-testid="button-submit-assessment">{pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Submit {useSkillCheck ? 'skill check' : 'assessment'}</Button><span className="text-xs text-muted-foreground">{answered} of {course.questions.length} answered · pass mark {course.passingScore}%</span></div>
    {course.attempts.length > 0 && <p className="text-xs text-muted-foreground" data-testid="text-attempts">Previous attempts: {course.attempts.map((a) => `#${a.attempt} ${a.score}% ${a.passed ? '✓' : ''}`).join(' · ')}</p>}
  </div>;
}

export function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const tab = new URLSearchParams(useSearch()).get('tab');
  const { data: course, isLoading, isError, refetch } = useGetCourse(id, { query: { enabled: Boolean(id), queryKey: getGetCourseQueryKey(id) } });
  const { data: ai } = useGetAiStatus();
  const enroll = useEnrollCourse();
  const progress = useUpdateCourseProgress();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(0);
  const [showAssessment, setShowAssessment] = useState(tab === 'assessment');
  useEffect(() => { if (course && !showAssessment) { const firstOpen = course.lessons.findIndex((l) => !l.completed); setSelected(firstOpen === -1 ? 0 : firstOpen); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [course?.id]);
  if (isLoading) return <LoadingState label="Opening your module" />;
  if (isError || !course) return <ErrorState onRetry={() => refetch()} label="This learning module is not available right now." />;
  const lesson = course.lessons[selected];
  const toggle = () => { if (!lesson) return; progress.mutate({ id, data: { lessonId: lesson.id, completed: !lesson.completed } }, { onSuccess: (e) => { qc.invalidateQueries({ queryKey: getGetCourseQueryKey(id) }); qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); if (!lesson.completed && selected < course.lessons.length - 1) setSelected(selected + 1); else if (!lesson.completed && e.assessmentReady) setShowAssessment(true); } }); };
  return <div className="page-enter" id={`course-${id}`}><Link href="/learning" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-back-learning"><ArrowLeft size={16} /> Back to learning path</Link>
    <div className="grid gap-6 lg:grid-cols-[.88fr_1.12fr]">
      <aside className="rounded-[1.75rem] bg-secondary p-6 text-secondary-foreground sm:p-8 lg:sticky lg:top-24 lg:h-fit">
        <Badge tone="dark">{course.category} · {course.difficulty}</Badge>
        <h1 className="mt-5 font-display text-4xl leading-[1.02] tracking-[-.04em]" data-testid="text-course-title">{course.title}</h1>
        <p className="mt-4 text-sm leading-6 text-secondary-foreground/65">{course.description}</p>
        <div className="mt-8 flex items-center justify-between text-xs text-secondary-foreground/60"><span className="flex items-center gap-1"><Clock3 size={13} /> {course.duration}</span><span data-testid="text-course-progress">{course.progress}% complete</span></div>
        <div className="mt-2"><ProgressBar value={course.progress} /></div>
        {course.status === 'not_started' && !course.passed && <Button className="mt-7 w-full" onClick={() => enroll.mutate({ id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetCourseQueryKey(id) }); qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); } })} disabled={enroll.isPending} data-testid="button-enroll-course">{enroll.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Start module</Button>}
        {course.certificate && <Link href="/certificates" className="mt-5 flex items-center gap-2 rounded-xl bg-secondary-foreground/10 p-3 text-sm font-semibold" data-testid="link-course-certificate"><Award size={16} className="text-primary" /> Certificate earned · {formatDate(course.certificate.issuedAt)}</Link>}
        <div className="mt-8 border-t border-secondary-foreground/10 pt-6"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-secondary-foreground/50">You will build</p><div className="mt-3 flex flex-wrap gap-2">{course.skillsGained.map((s) => <Badge tone="dark" key={s}>{s}</Badge>)}</div></div>
        {course.verifiesSkills.length > 0 && <div className="mt-5"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-secondary-foreground/50">Passing the assessment verifies</p><div className="mt-3 flex flex-wrap gap-2">{course.verifiesSkills.map((s) => <Badge tone="success" key={s}>{s}</Badge>)}</div></div>}
        <p className="mt-6 text-[11px] leading-5 text-secondary-foreground/50">A SakhiSetu certificate records completion of SakhiSetu learning and assessment. It does not replace a professional licence, a government qualification, or an accredited certification.</p>
      </aside>
      <section className="rounded-[1.75rem] border border-border bg-card p-5 sm:p-8">
        <div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Module outline</p><p className="mt-1 text-sm text-muted-foreground">{course.lessonCount} lessons · learn at your pace</p></div><div className="rounded-xl bg-muted px-3 py-2 font-mono-ui text-xs" data-testid="text-lessons-done">{course.lessons.filter((l) => l.completed).length}/{course.lessonCount}</div></div>
        <div className="space-y-2">{course.lessons.map((item, index) => <button type="button" key={item.id} onClick={() => { setSelected(index); setShowAssessment(false); }} aria-current={!showAssessment && index === selected ? 'step' : undefined} className={cx('flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left transition-colors', !showAssessment && index === selected ? 'bg-[hsl(var(--primary)/.14)]' : 'hover:bg-muted')} data-testid={`button-lesson-${index}`}><span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold', item.completed ? 'bg-[hsl(var(--chart-3)/.15)] text-[hsl(var(--chart-3))]' : index === selected && !showAssessment ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{item.completed ? <Check size={14} /> : index + 1}</span><span className="flex-1 text-sm font-semibold">{item.title}</span>{item.videoUrl && <Play size={13} className="text-muted-foreground" aria-label="Has video" />}<span className="text-[11px] text-muted-foreground">{item.durationMinutes} min</span></button>)}
          <button type="button" onClick={() => setShowAssessment(true)} className={cx('flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left transition-colors', showAssessment ? 'bg-[hsl(var(--primary)/.14)]' : 'hover:bg-muted')} data-testid="button-open-assessment"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><ClipboardCheck size={14} /></span><span className="flex-1 text-sm font-semibold">Assessment</span>{course.passed ? <Badge tone="success">Passed</Badge> : course.assessmentReady ? <Badge tone="coral">Ready</Badge> : <Badge>Skill check available</Badge>}</button></div>
        <div className="my-8 border-t border-border" />
        {showAssessment ? <Assessment key={`${course.id}-${course.attempts.length}`} course={course} id={id} /> : lesson ? <LessonPanel lesson={lesson} index={selected} total={course.lessons.length} onToggle={toggle} pending={progress.isPending} id={id} /> : <Notice>This course has no lessons yet.</Notice>}
        {ai?.enabled && <p className="mt-4 text-[11px] text-muted-foreground">AI-assisted learning feedback is enabled for written answers on this server.</p>}
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><BookOpen size={13} /> Lessons are saved as you complete them.</div>
      </section>
    </div>
  </div>;
}
