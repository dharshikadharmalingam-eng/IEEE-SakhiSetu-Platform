/**
 * SakhiSetu opportunity matching — transparent, rule-based, explainable.
 * MATCH % = suitability for ONE opportunity. It is deliberately independent of the Sakhi Score
 * (overall readiness). No machine learning is involved: every point below is traceable to a rule.
 */
export const WEIGHTS = { skills: 50, availability: 20, workPreference: 15, experience: 10, feedback: 5 } as const;

export type MatchSkill = { name: string; verified: boolean; years: number };
export type MatchProfile = {
  city: string;
  workPreferences: string[];
  availability: string;
  skills: MatchSkill[];
  /** The woman's own track record from completed work: average rating (1–5) and how many reviews it rests on. */
  feedbackAverage?: number | null;
  feedbackCount?: number;
};
export type MatchOpportunity = {
  location: string;
  workType: string;
  availability: string;
  experienceYears: number;
  requiredSkills: string[];
  preferredSkills: string[];
};
export type CourseRef = { id: number; title: string };
export type CourseBySkill = Map<string, CourseRef>;

export type MatchComponent = {
  key: keyof typeof WEIGHTS;
  label: string;
  value: number; // weight
  earned: number;
  status: "full" | "partial" | "none";
  detail: string;
};

export type MatchResult = {
  match: number;
  components: MatchComponent[];
  reasons: string[];
  matchingSkills: string[];
  missingSkills: string[]; // required skills the woman has not listed at all
  unverifiedSkills: string[]; // required skills listed but not yet verified
  skillGap: string[]; // missing + unverified — the things learning/assessment can close
  gapCourses: Array<{ skill: string; courseId: number | null; courseTitle: string | null }>;
  recommendedNextStep: string;
  recommendedCourse: CourseRef | null;
};

const norm = (s: string) => s.trim().toLowerCase();
const DECLARED_CREDIT = 0.6; // a self-declared (unverified) skill earns 60% of a verified one

export function availabilityTags(text: string): Set<string> {
  const t = text.toLowerCase();
  const tags = new Set<string>();
  if (/morning/.test(t)) tags.add("morning");
  if (/afternoon/.test(t)) tags.add("afternoon");
  if (/evening|night/.test(t)) tags.add("evening");
  if (/weekday/.test(t)) tags.add("weekday");
  if (/weekend/.test(t)) tags.add("weekend");
  if (/flexible|anytime|any time/.test(t)) tags.add("flexible");
  return tags;
}

const status = (earned: number, weight: number): MatchComponent["status"] => (earned >= weight ? "full" : earned > 0 ? "partial" : "none");

export function computeMatch(profile: MatchProfile, opp: MatchOpportunity, courseBySkill: CourseBySkill): MatchResult {
  const mine = new Map(profile.skills.map((s) => [norm(s.name), s]));
  const required = opp.requiredSkills;
  const reasons: string[] = [];

  // 1. Skills (50)
  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];
  const unverifiedSkills: string[] = [];
  let skillCredit = 0;
  for (const name of required) {
    const have = mine.get(norm(name));
    if (!have) missingSkills.push(name);
    else if (have.verified) {
      matchingSkills.push(name);
      skillCredit += 1;
      reasons.push(`Verified skill: ${name}`);
    } else {
      matchingSkills.push(name);
      unverifiedSkills.push(name);
      skillCredit += DECLARED_CREDIT;
      reasons.push(`You listed ${name} (not yet verified)`);
    }
  }
  const skillEarned = required.length ? (skillCredit / required.length) * WEIGHTS.skills : WEIGHTS.skills;
  const skillDetail = required.length
    ? `${matchingSkills.length} of ${required.length} required skills listed; ${matchingSkills.length - unverifiedSkills.length} verified. Verified skills count fully, listed-but-unverified skills count ${Math.round(DECLARED_CREDIT * 100)}%.`
    : "No specific skills are required.";

  // 2. Availability (20)
  const mineTags = availabilityTags(profile.availability);
  const oppTags = availabilityTags(opp.availability);
  let avEarned = 0;
  let avDetail: string;
  if (!oppTags.size || oppTags.has("flexible")) {
    avEarned = WEIGHTS.availability;
    avDetail = "The opportunity has flexible or project-based timing.";
  } else if (!mineTags.size) {
    avDetail = "Add your availability to see how it fits.";
  } else if (mineTags.has("flexible") || [...oppTags].some((t) => mineTags.has(t))) {
    avEarned = WEIGHTS.availability;
    avDetail = `Your availability (${profile.availability}) overlaps with ${opp.availability}.`;
    reasons.push(`Availability fits (${opp.availability})`);
  } else {
    avDetail = `The role needs ${opp.availability}; you listed ${profile.availability}.`;
  }

  // 3. Work preference (15) — includes whether the role's location/remote-or-local nature fits your preferences.
  const prefs = profile.workPreferences.map(norm);
  const remote = /remote/i.test(opp.location) || /remote/i.test(opp.workType);
  const sameCity = Boolean(profile.city) && !remote && norm(opp.location) === norm(profile.city);
  let wpEarned = 0;
  let wpDetail: string;
  if (prefs.includes(norm(opp.workType))) {
    wpEarned = WEIGHTS.workPreference;
    wpDetail = `${opp.workType} is one of your preferred work types.`;
    reasons.push(`${opp.workType} preference`);
  } else if (remote && prefs.includes("remote")) {
    wpEarned = WEIGHTS.workPreference;
    wpDetail = "Remote work matches your preference.";
    reasons.push("Remote work fits your preference");
  } else if (sameCity && prefs.includes("local")) {
    wpEarned = WEIGHTS.workPreference;
    wpDetail = `Located in ${opp.location}, the same city as you, and matches your Local preference.`;
    reasons.push(`Nearby opportunity (${opp.location})`);
  } else if (sameCity) {
    wpEarned = WEIGHTS.workPreference * 0.6;
    wpDetail = `Located in ${opp.location}, the same city as you.`;
    reasons.push(`Nearby opportunity (${opp.location})`);
  } else if (prefs.includes("flexible") || norm(opp.workType) === "flexible") {
    wpEarned = WEIGHTS.workPreference * 0.5;
    wpDetail = "Flexible arrangements can usually be discussed, so this earns partial credit.";
  } else {
    wpDetail = `${opp.workType} in ${opp.location} is not among your preferred work types or your city.`;
  }

  // 4. Experience (10)
  const relevant = [...required, ...opp.preferredSkills].map(norm);
  const years = Math.max(0, ...profile.skills.filter((s) => relevant.includes(norm(s.name))).map((s) => s.years));
  let exEarned: number;
  let exDetail: string;
  if (opp.experienceYears <= 0) {
    exEarned = WEIGHTS.experience;
    exDetail = "No minimum experience is required.";
  } else {
    exEarned = Math.min(1, years / opp.experienceYears) * WEIGHTS.experience;
    exDetail = `Role asks for ${opp.experienceYears}+ year(s); you recorded ${years} year(s) in relevant skills.`;
    if (years >= opp.experienceYears) reasons.push(`${years}+ year(s) relevant experience`);
  }

  // 5. Feedback (5) — your own track record from completed work, confidence-weighted so one review
  // never dominates (mirrors the Sakhi Score treatment of feedback).
  const feedbackCount = Math.max(0, profile.feedbackCount ?? 0);
  const feedbackAverage = profile.feedbackAverage ?? null;
  let fbEarned = 0;
  let fbDetail: string;
  if (feedbackCount && feedbackAverage) {
    fbEarned = WEIGHTS.feedback * (feedbackAverage / 5) * Math.min(1, feedbackCount / 3);
    fbDetail = `${feedbackCount} previous review${feedbackCount === 1 ? "" : "s"}, averaging ${feedbackAverage.toFixed(1)}/5.`;
    if (feedbackAverage >= 4) reasons.push("Positive feedback from previous work");
  } else {
    fbDetail = "No feedback from previous work yet — this does not count against you.";
  }

  const components: MatchComponent[] = [
    { key: "skills", label: "Skill match", value: WEIGHTS.skills, earned: round1(skillEarned), status: status(skillEarned, WEIGHTS.skills), detail: skillDetail },
    { key: "availability", label: "Availability", value: WEIGHTS.availability, earned: round1(avEarned), status: status(avEarned, WEIGHTS.availability), detail: avDetail },
    { key: "workPreference", label: "Work preference", value: WEIGHTS.workPreference, earned: round1(wpEarned), status: status(wpEarned, WEIGHTS.workPreference), detail: wpDetail },
    { key: "experience", label: "Experience", value: WEIGHTS.experience, earned: round1(exEarned), status: status(exEarned, WEIGHTS.experience), detail: exDetail },
    { key: "feedback", label: "Feedback", value: WEIGHTS.feedback, earned: round1(fbEarned), status: status(fbEarned, WEIGHTS.feedback), detail: fbDetail },
  ];
  const match = Math.round(components.reduce((t, c) => t + c.earned, 0));

  const skillGap = [...missingSkills, ...unverifiedSkills];
  const gapCourses = skillGap.map((skill) => {
    const c = courseBySkill.get(norm(skill));
    return { skill, courseId: c?.id ?? null, courseTitle: c?.title ?? null };
  });
  const firstWithCourse = gapCourses.find((g) => g.courseId !== null);
  const recommendedCourse = firstWithCourse ? { id: firstWithCourse.courseId!, title: firstWithCourse.courseTitle! } : null;
  const recommendedNextStep = recommendedCourse
    ? `Start ${recommendedCourse.title}`
    : skillGap.length
      ? `Build ${skillGap[0]} and add evidence to your profile`
      : "Apply with confidence";

  return { match, components, reasons, matchingSkills, missingSkills, unverifiedSkills, skillGap, gapCourses, recommendedNextStep, recommendedCourse };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
