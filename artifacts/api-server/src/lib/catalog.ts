import { sql } from "drizzle-orm";
import { db, skillsTable } from "@workspace/db";
import { HttpError } from "./http";

export const cleanSkillName = (raw: string): string => {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 60) throw new HttpError(400, "Skill name must be 1–60 characters.");
  return name;
};

/** Case-insensitive find-or-create in the shared skill catalog. */
export async function ensureSkill(raw: string, category = "Added by you"): Promise<{ id: number; name: string; category: string }> {
  const name = cleanSkillName(raw);
  const [found] = await db.select().from(skillsTable).where(sql`lower(${skillsTable.name}) = ${name.toLowerCase()}`).limit(1);
  if (found) return found;
  const [created] = await db.insert(skillsTable).values({ name, category }).returning();
  return created!;
}
