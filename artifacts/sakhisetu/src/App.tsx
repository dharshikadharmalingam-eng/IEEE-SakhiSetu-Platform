import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, RequireRole, useAuth } from '@/lib/auth';
import { Shell } from '@/lib/shell';
import { Compass } from 'lucide-react';
import { Link } from 'wouter';

import { Landing } from '@/pages/landing';
import { LoginPage, RegisterPage } from '@/pages/auth';
import { DashboardPage, SakhiScorePage } from '@/pages/woman/home';
import { ProfilePage } from '@/pages/woman/profile';
import { SkillsPage } from '@/pages/woman/skills';
import { LearningPage } from '@/pages/woman/learning-list';
import { CourseDetailPage } from '@/pages/woman/course';
import { CertificatesPage } from '@/pages/woman/certificates';
import { OpportunitiesPage, OpportunityDetailPage } from '@/pages/woman/opportunities';
import { ApplicationsPage } from '@/pages/woman/applications';
import { FeedbackPage, NotificationsPage, ReportsPage } from '@/pages/shared';
import { EmployerApplications, EmployerDashboard, EmployerOpportunities, EmployerProfilePage, OpportunityForm } from '@/pages/employer';
import { AdminCourseEditor, AdminCourses, AdminDashboard, AdminEmployers, AdminOpportunities, AdminReports, AdminUsers } from '@/pages/admin';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

function NotFound() {
  return <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center px-6"><div className="mb-5 rounded-2xl bg-[hsl(var(--primary)/.16)] p-4 text-[hsl(var(--accent-foreground))]"><Compass size={28} /></div><h1 className="font-display text-4xl">This path is not here</h1><p className="mt-3 max-w-sm text-sm text-muted-foreground">The page you are looking for may have moved. Let's get you back on track.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground" data-testid="link-home">Go home</Link></div>;
}

function AppRoutes() {
  const [location] = useLocation();
  const { user, isLoading } = useAuth();
  const publicPaths = ['/', '/login', '/register'];
  if (isLoading && !publicPaths.includes(location)) return <div className="flex min-h-[100dvh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return <ErrorBoundary resetKey={location}>
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      <Route path="/dashboard">{() => <RequireRole roles={['woman']}><Shell><DashboardPage /></Shell></RequireRole>}</Route>
      <Route path="/profile">{() => <RequireRole roles={['woman']}><Shell><ProfilePage /></Shell></RequireRole>}</Route>
      <Route path="/sakhi-score">{() => <RequireRole roles={['woman']}><Shell><SakhiScorePage /></Shell></RequireRole>}</Route>
      <Route path="/skills">{() => <RequireRole roles={['woman']}><Shell><SkillsPage /></Shell></RequireRole>}</Route>
      <Route path="/learning">{() => <RequireRole roles={['woman']}><Shell><LearningPage /></Shell></RequireRole>}</Route>
      <Route path="/learning/:id">{() => <RequireRole roles={['woman']}><Shell><CourseDetailPage /></Shell></RequireRole>}</Route>
      <Route path="/certificates">{() => <RequireRole roles={['woman']}><Shell><CertificatesPage /></Shell></RequireRole>}</Route>
      <Route path="/opportunities">{() => <RequireRole roles={['woman']}><Shell><OpportunitiesPage /></Shell></RequireRole>}</Route>
      <Route path="/opportunities/:id">{() => <RequireRole roles={['woman']}><Shell><OpportunityDetailPage /></Shell></RequireRole>}</Route>
      <Route path="/applications">{() => <RequireRole roles={['woman']}><Shell><ApplicationsPage /></Shell></RequireRole>}</Route>

      <Route path="/employer/dashboard">{() => <RequireRole roles={['employer']}><Shell><EmployerDashboard /></Shell></RequireRole>}</Route>
      <Route path="/employer/opportunities">{() => <RequireRole roles={['employer']}><Shell><EmployerOpportunities /></Shell></RequireRole>}</Route>
      <Route path="/employer/opportunities/new">{() => <RequireRole roles={['employer']}><Shell><OpportunityForm /></Shell></RequireRole>}</Route>
      <Route path="/employer/opportunities/:id/edit">{() => <RequireRole roles={['employer']}><Shell><OpportunityForm /></Shell></RequireRole>}</Route>
      <Route path="/employer/applications">{() => <RequireRole roles={['employer']}><Shell><EmployerApplications /></Shell></RequireRole>}</Route>
      <Route path="/employer/profile">{() => <RequireRole roles={['employer']}><Shell><EmployerProfilePage /></Shell></RequireRole>}</Route>

      <Route path="/admin/dashboard">{() => <RequireRole roles={['admin']}><Shell><AdminDashboard /></Shell></RequireRole>}</Route>
      <Route path="/admin/users">{() => <RequireRole roles={['admin']}><Shell><AdminUsers /></Shell></RequireRole>}</Route>
      <Route path="/admin/employers">{() => <RequireRole roles={['admin']}><Shell><AdminEmployers /></Shell></RequireRole>}</Route>
      <Route path="/admin/opportunities">{() => <RequireRole roles={['admin']}><Shell><AdminOpportunities /></Shell></RequireRole>}</Route>
      <Route path="/admin/courses">{() => <RequireRole roles={['admin']}><Shell><AdminCourses /></Shell></RequireRole>}</Route>
      <Route path="/admin/courses/:id">{() => <RequireRole roles={['admin']}><Shell><AdminCourseEditor /></Shell></RequireRole>}</Route>
      <Route path="/admin/reports">{() => <RequireRole roles={['admin']}><Shell><AdminReports /></Shell></RequireRole>}</Route>

      <Route path="/feedback">{() => <RequireRole roles={['woman', 'employer']}><Shell><FeedbackPage /></Shell></RequireRole>}</Route>
      <Route path="/reports">{() => <RequireRole roles={['woman', 'employer']}><Shell><ReportsPage /></Shell></RequireRole>}</Route>
      <Route path="/notifications">{() => <RequireRole roles={['woman', 'employer', 'admin']}><Shell><NotificationsPage /></Shell></RequireRole>}</Route>

      <Route component={NotFound} />
    </Switch>
  </ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AuthProvider><AppRoutes /></AuthProvider></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
