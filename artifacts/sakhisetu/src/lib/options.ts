export const WORK_TYPES = ['Local', 'Remote', 'Part-time', 'Full-time', 'Flexible'];
export const AVAILABILITY = ['Mornings', 'Afternoons', 'Evenings', 'Weekdays', 'Weekends', 'Flexible'];
export const EDUCATION = ['Below 10th standard', '10th standard', '12th standard', 'Diploma / ITI', 'B.Sc', 'B.Com', 'B.A.', 'B.E. / B.Tech', 'Postgraduate', 'Other'];
export const EMPLOYMENT = ['Homemaker', 'Seeking first job', 'Currently working', 'Self-employed', 'Between jobs', 'Student'];
export const CATEGORIES = ['Childcare', 'Elderly Care', 'Cooking', 'Tailoring', 'Housekeeping', 'Digital Work', 'Virtual Assistance', 'Software Testing', 'Web Development', 'Data Analytics', 'Canva Design', 'Other'];
export const BUSINESS_TYPES = ['Home care agency', 'Community organisation', 'Small shop or store', 'Restaurant or catering', 'Tailoring or crafts', 'Software or IT services', 'Business support services', 'Individual / family employer', 'Other'];
export const SKILL_LEVELS = ['Learning', 'Comfortable', 'Strong'];
export const APPLICATION_STATUSES = ['Applied', 'Under Review', 'Shortlisted', 'Interview', 'Selected', 'Rejected', 'Withdrawn'];
export const FEEDBACK_CATEGORIES: Record<'employer_to_woman' | 'woman_to_employer', Array<{ key: string; label: string }>> = {
  employer_to_woman: [{ key: 'communication', label: 'Communication' }, { key: 'reliability', label: 'Reliability' }, { key: 'skillPerformance', label: 'Skill performance' }],
  woman_to_employer: [{ key: 'communication', label: 'Communication' }, { key: 'reliability', label: 'Reliability' }, { key: 'workEnvironment', label: 'Work environment' }],
};
export const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
