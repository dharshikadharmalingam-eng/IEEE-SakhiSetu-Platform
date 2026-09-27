import { useState } from 'react';
import { ArrowUpRight, BookOpen, Clock3, GraduationCap } from 'lucide-react';
import { useListCourses } from '@workspace/api-client-react';
import type { Course } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Badge, Button, EmptyState, ErrorState, LoadingState, PageHeader, ProgressBar, cx } from '@/lib/ui';

export function LearningPage() {
  const { data, isLoading, isError, refetch } = useListCourses();
  const courses = data || [];
  const [filter, setFilter] = useState('All');
  const categories = ['All', ...new Set(courses.map((course) => course.category))];
  const visible = filter === 'All' ? courses : courses.filter((course) => course.category === filter);
  if (isLoading) return <LoadingState label="Curating your learning path" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return <div className="page-enter"><PageHeader eyebrow="Learn with purpose" title="Your learning path" detail="Short, practical modules selected to move your readiness forward — one lesson at a time." action={<div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><BookOpen size={14} /> {courses.length} modules</div>} /><div className="mb-6 flex flex-wrap gap-2">{categories.map((category) => <button type="button" key={category} onClick={() => setFilter(category)} className={cx('rounded-full px-4 py-2 text-xs font-bold transition-colors', filter === category ? 'bg-secondary text-secondary-foreground' : 'border border-border bg-card text-muted-foreground hover:border-primary')} data-testid={`button-filter-course-${category.toLowerCase().replaceAll(' ', '-')}`}>{category}</button>)}</div>{!visible.length ? <EmptyState icon={BookOpen} title="No modules in this view" detail="Try another category, or check back soon for a new next step." /> : <div className="grid gap-4 lg:grid-cols-2">{visible.map((course, index) => <CourseCard course={course} key={course.id} index={index} />)}</div>}</div>;
}

function CourseCard({ course, index }: { course: Course; index: number }) {
  return <Link href={`/learning/${course.id}`} className={cx('group flex flex-col justify-between rounded-[1.5rem] border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary/70 hover:shadow-[0_12px_28px_hsl(var(--secondary)/.08)] rise-in', `delay-${Math.min(index + 1, 4)}`)} data-testid={`card-course-${course.id}`}><div><div className="flex items-start justify-between gap-4"><div className={cx('flex h-12 w-12 items-center justify-center rounded-2xl', index % 2 ? 'bg-[hsl(var(--accent)/.18)] text-[hsl(var(--accent-foreground))]' : 'bg-[hsl(var(--primary)/.18)] text-[hsl(var(--accent-foreground))]')}><GraduationCap size={22} /></div><Badge tone={course.status === 'completed' ? 'success' : course.status === 'in_progress' ? 'coral' : 'soft'}>{course.status === 'not_started' ? (course.passed ? 'Skill verified' : 'Not started') : course.status === 'in_progress' ? 'In progress' : 'Completed'}</Badge></div><h3 className="mt-6 font-display text-2xl tracking-[-.02em]">{course.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{course.description}</p></div><div className="mt-8"><div className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock3 size={13} /> {course.duration} · {course.lessonCount} lessons</span><span className="font-semibold">{course.progress}%</span></div><ProgressBar value={course.progress} color={course.status === 'completed' ? 'green' : course.status === 'in_progress' ? 'coral' : 'primary'} /><div className="mt-4 flex items-center justify-between text-xs font-bold"><span>{course.skillsGained.slice(0, 2).join(' · ')}</span><ArrowUpRight size={15} className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" /></div></div></Link>;
}
