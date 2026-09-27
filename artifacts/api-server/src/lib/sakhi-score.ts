import { and, desc, eq } from "drizzle-orm";
import { db, sakhiScoreHistoryTable } from "@workspace/db";
import type { NextStep, SakhiScore, ScoreHistoryItem } from "@workspace/api-zod";

type SkillEvidence = {
  name: string;
  verified: boolean;
};

type CourseEvidence = {
  id: number;
  title: string;
  progress: number;
  status: string;
};

export type SakhiScoreInput = {
  skills: SkillEvidence[];
  courses: CourseEvidence[];
  assessmentsPassed: number;
  profile: {
    availability: string;
    workPreferences: string[];
  };
  experienceEvidence?: string[];
  feedbackCount?: number;
  /** Average employer/work rating (1–5) across received feedback. */
  feedbackAverage?: number | null;
  /** Total recorded years of experience in the woman's listed skills. */
  experienceYears?: number;
  /** Selected applications that the employer marked as completed work. */
  completedWork?: number;
  /** True when at least one open opportunity currently matches her availability. */
  availabilityMatchesOpportunities?: boolean;
  /** Skills that top-matching opportunities need and that a course can close. */
  skillGaps?: Array<{ skill: string; courseId: number; courseTitle: string; forOpportunity: string }>;
};

const DISCLAIMER =
  "Sakhi Score is an indicative, explainable readiness measure. It is not a scientific, psychological, financial, employability, job, income, or safety guarantee.";

const round = (value: number) => Math.round(value);

function recommendationFor(input: SakhiScoreInput, components: SakhiScore["components"]): NextStep {
  const verifiedSkills = input.skills.filter((skill) => skill.verified);
  const inProgress = input.courses.find((course) => course.progress > 0 && course.progress < 100);
  if (inProgress) {
    return {
      title: `Continue ${inProgress.title}`,
      reason: "You have already started this module. Finishing it and passing the assessment adds verified learning to your profile.",
      courseId: inProgress.id,
      action: "continue_learning",
    };
  }
  const gap = input.skillGaps?.find((g) => input.courses.find((c) => c.id === g.courseId)?.status !== "completed");
  if (gap) {
    return {
      title: `Start ${gap.courseTitle}`,
      reason: `${gap.skill} is needed for ${gap.forOpportunity}, one of your best-matching opportunities.`,
      courseId: gap.courseId,
      action: "continue_learning",
    };
  }
  if (verifiedSkills.length < 4) {
    return {
      title: "Verify one more skill",
      reason: "A verified skill adds clearer proof to your readiness story.",
      courseId: null,
      action: "view_skills",
    };
  }

  const activeCourse = input.courses.find((course) => course.progress > 0 && course.progress < 100);
  const nextCourse = activeCourse ?? input.courses.find((course) => course.status !== "completed");
  if (nextCourse) {
    return {
      title: `Complete ${nextCourse.title}`,
      reason: "Finishing a focused learning step can strengthen both your evidence and your next match.",
      courseId: nextCourse.id,
      action: "continue_learning",
    };
  }

  if (!input.experienceEvidence?.length) {
    return {
      title: "Add practical experience",
      reason: "A short note about relevant work, care, community, or project experience will make this part of the score visible.",
      courseId: null,
      action: "update_profile",
    };
  }

  if (!input.profile.availability || !input.profile.workPreferences.length) {
    return {
      title: "Complete your work preferences",
      reason: "Availability and preferences help show which opportunities fit your life right now.",
      courseId: null,
      action: "update_profile",
    };
  }

  if (!input.feedbackCount) {
    return {
      title: "Build your first feedback signal",
      reason: "Feedback from completed work can add a useful, human proof point to your profile.",
      courseId: null,
      action: "view_opportunities",
    };
  }

  const weakest = [...components].sort((left, right) => left.score / left.max - right.score / right.max)[0];
  return {
    title: `Strengthen ${weakest.label.toLowerCase()}`,
    reason: weakest.explanation,
    courseId: null,
    action: "view_score",
  };
}

export function calculateSakhiScore(input: SakhiScoreInput): SakhiScore {
  const verifiedSkills = input.skills.filter((skill) => skill.verified);
  const skillScore = Math.min(30, round((verifiedSkills.length / 4) * 30));

  const completedCourses = input.courses.filter((course) => course.status === "completed" || course.progress >= 100).length;
  const learningUnits = completedCourses * 2 + Math.max(0, input.assessmentsPassed);
  const learningScore = Math.min(25, round((learningUnits / 6) * 25));

  const hasExperience = Boolean(input.experienceEvidence?.length) || (input.experienceYears ?? 0) > 0;
  const experienceScore = hasExperience ? ((input.experienceYears ?? 0) >= 2 || (input.completedWork ?? 0) > 0 ? 20 : 10) : 0;
  const availabilityScore = input.profile.availability && input.profile.workPreferences.length
    ? 15
    : input.profile.availability || input.profile.workPreferences.length
      ? 8
      : 0;
  // Confidence-weighted: one review can add at most ~3 points; it takes 3+ reviews to reach the full 10.
  const feedbackCount = Math.max(0, input.feedbackCount ?? 0);
  const feedbackScore = feedbackCount && input.feedbackAverage ? round(10 * (input.feedbackAverage / 5) * Math.min(1, feedbackCount / 3)) : 0;

  const components = [
    {
      key: "verified_skills",
      label: "Relevant verified skills",
      score: skillScore,
      max: 30,
      explanation: verifiedSkills.length
        ? `${verifiedSkills.length} verified skill${verifiedSkills.length === 1 ? "" : "s"} currently contribute to your score.`
        : "No verified skill evidence is recorded yet, so this area does not add points.",
    },
    {
      key: "learning",
      label: "Completed learning & assessments",
      score: learningScore,
      max: 25,
      explanation: `${completedCourses} course${completedCourses === 1 ? "" : "s"} completed and ${input.assessmentsPassed} assessment${input.assessmentsPassed === 1 ? "" : "s"} passed.`,
    },
    {
      key: "experience",
      label: "Relevant experience",
      score: experienceScore,
      max: 20,
      explanation: experienceScore === 20
        ? "Two or more years of relevant experience, or completed work through SakhiSetu, is recorded."
        : experienceScore
          ? "Some relevant experience is recorded. Two or more years, or completed work through SakhiSetu, would raise this."
          : "No relevant experience evidence is recorded yet, so this area does not add points.",
    },
    {
      key: "availability",
      label: "Availability & preferences",
      score: availabilityScore,
      max: 15,
      explanation: availabilityScore === 15
        ? "Availability and work preferences are both filled in."
        : availabilityScore
          ? "One availability or preference detail is present; completing both would make this clearer."
          : "Availability and work preferences are not recorded yet, so this area does not add points.",
    },
    {
      key: "feedback",
      label: "Employer & work feedback",
      score: feedbackScore,
      max: 10,
      explanation: feedbackScore
        ? `${feedbackCount} feedback signal${feedbackCount === 1 ? "" : "s"} (average ${input.feedbackAverage?.toFixed(1)}/5). Scores are weighted by how many reviews exist, so no single review dominates.`
        : "No employer or work feedback is recorded yet, so this area does not add points.",
    },
  ];

  const score = components.reduce((total, component) => total + component.score, 0);
  const level = score >= 80 ? "Strong Readiness" : score >= 60 ? "Good Readiness" : score >= 40 ? "Developing Readiness" : "Early Readiness";
  const contributingFactors = [
    input.skills.length ? `${input.skills.length} relevant skill${input.skills.length === 1 ? "" : "s"} listed` : null,
    verifiedSkills.length ? `${verifiedSkills.length} verified skill${verifiedSkills.length === 1 ? "" : "s"}` : null,
    completedCourses ? `${completedCourses} relevant course${completedCourses === 1 ? "" : "s"} completed` : null,
    input.profile.availability && input.profile.workPreferences.length
      ? input.availabilityMatchesOpportunities
        ? "Availability matches current opportunities"
        : "Clear availability and preferences"
      : null,
    feedbackCount && (input.feedbackAverage ?? 0) >= 4 ? "Positive feedback from completed work" : null,
  ].filter((factor): factor is string => Boolean(factor));
  const unverified = input.skills.filter((skill) => !skill.verified).slice(0, 2).map((skill) => `${skill.name} not verified`);
  const gapItems = (input.skillGaps ?? []).slice(0, 2).map((g) => `${g.skill} recommended (${g.courseTitle})`);
  const areasToImprove = [
    ...unverified,
    ...gapItems,
    ...components
      .filter((component) => component.score < component.max)
      .sort((left, right) => left.score / left.max - right.score / right.max)
      .map((component) => component.explanation),
  ];
  const recommendedNextStep = recommendationFor(input, components);

  return {
    score,
    level,
    components,
    contributingFactors,
    areasToImprove,
    disclaimer: DISCLAIMER,
    recommendedNextStep,
  };
}

export async function ensureScoreSnapshot(userId: number, score: number): Promise<void> {
  // Records the very first snapshot only; later changes are recorded with a real reason by recordScoreSnapshot.
  const [latest] = await db
    .select({ score: sakhiScoreHistoryTable.score })
    .from(sakhiScoreHistoryTable)
    .where(eq(sakhiScoreHistoryTable.userId, userId))
    .orderBy(desc(sakhiScoreHistoryTable.createdAt), desc(sakhiScoreHistoryTable.id))
    .limit(1);
  if (!latest) {
    await db.insert(sakhiScoreHistoryTable).values({ userId, score, reason: "Initial profile" });
  }
}

/** Appends a history row only when the score actually changed; returns the previous score. */
export async function recordScoreSnapshot(userId: number, score: number, reason: string): Promise<number | null> {
  const [latest] = await db
    .select({ score: sakhiScoreHistoryTable.score })
    .from(sakhiScoreHistoryTable)
    .where(eq(sakhiScoreHistoryTable.userId, userId))
    .orderBy(desc(sakhiScoreHistoryTable.createdAt), desc(sakhiScoreHistoryTable.id))
    .limit(1);
  if (!latest) {
    await db.insert(sakhiScoreHistoryTable).values({ userId, score, reason: "Initial profile" });
    return null;
  }
  if (latest.score !== score) await db.insert(sakhiScoreHistoryTable).values({ userId, score, reason });
  return latest.score;
}

export async function listScoreHistory(userId: number): Promise<ScoreHistoryItem[]> {
  const rows = await db
    .select()
    .from(sakhiScoreHistoryTable)
    .where(and(eq(sakhiScoreHistoryTable.userId, userId)))
    .orderBy(desc(sakhiScoreHistoryTable.createdAt), desc(sakhiScoreHistoryTable.id))
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    score: row.score,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}