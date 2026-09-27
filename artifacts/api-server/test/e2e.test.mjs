// End-to-end API tests. Requires a running API (default http://localhost:5000) seeded with demo data
// and DEMO_MODE=true (for the demo accounts). Run:  pnpm --filter @workspace/api-server run test:e2e
import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.API_URL || "http://localhost:5000/api";
const PW = process.env.DEMO_PASSWORD || "SakhiDemo2026";
const run = Date.now().toString(36);

class Client {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0].includes("=;") || set.includes("Expires=Thu, 01 Jan 1970") ? "" : set.split(";")[0];
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    assert.ok(!/passwordHash|password_hash|scrypt\$/.test(text), `${method} ${path} leaked a password hash`);
    return { status: res.status, data };
  }
  get = (p) => this.call("GET", p);
  post = (p, b) => this.call("POST", p, b ?? {});
  put = (p, b) => this.call("PUT", p, b ?? {});
  del = (p) => this.call("DELETE", p);
  async login(email, password = PW) { const r = await this.post("/auth/login", { email, password }); assert.equal(r.status, 200, `login ${email}`); return r.data; }
}

const admin = new Client(), woman = new Client(), employer = new Client(), anon = new Client();
const womanEmail = `test.woman.${run}@example.org`, employerEmail = `test.employer.${run}@example.org`;
let oppId, appId, courseAdmin;

test("health + anonymous access is blocked", async () => {
  assert.equal((await anon.get("/healthz")).data.status, "ok");
  for (const p of ["/dashboard", "/profile", "/employer/profile", "/admin/users", "/notifications", "/opportunities"]) assert.equal((await anon.get(p)).status, 401, p);
});

test("registration validation, no admin self-registration, login/logout/session", async () => {
  const base = { role: "woman", name: "Test Woman", email: womanEmail, phone: "+91 90000 33333", password: "Passw0rdOK", city: "Chennai", area: "Adyar", education: "B.Com", employmentStatus: "Homemaker", skills: [{ name: "Childcare", level: "Intermediate", yearsExperience: 2 }], interests: ["Childcare"], workPreferences: ["Local", "Part-time"], availability: "Evenings", goal: "Part-time work" };
  assert.equal((await anon.post("/auth/register", { ...base, password: "short" })).status, 400);
  assert.equal((await anon.post("/auth/register", { ...base, password: "onlyletters" })).status, 400);
  assert.equal((await anon.post("/auth/register", { ...base, email: "not-an-email" })).status, 400);
  assert.equal((await anon.post("/auth/register", { ...base, role: "admin" })).status, 400, "admin must not be registerable");
  const ok = await woman.post("/auth/register", base);
  assert.equal(ok.status, 201); assert.equal(ok.data.role, "woman");
  assert.equal((await anon.post("/auth/register", base)).status, 409, "duplicate email");
  assert.equal((await woman.get("/auth/me")).data.email, womanEmail);
  assert.equal((await woman.post("/auth/logout")).status, 200);
  assert.equal((await woman.get("/auth/me")).status, 401, "session ended");
  assert.equal((await anon.post("/auth/login", { email: womanEmail, password: "WrongPass1" })).status, 401);
  await woman.login(womanEmail, "Passw0rdOK");
});

test("role-based authorization", async () => {
  await admin.login("admin@demo.sakhisetu.example");
  await employer.login("care@demo.sakhisetu.example");
  for (const p of ["/admin/users", "/admin/dashboard", "/employer/profile"]) assert.equal((await woman.get(p)).status, 403, `woman ${p}`);
  for (const p of ["/dashboard", "/admin/users", "/opportunities", "/courses"]) assert.equal((await employer.get(p)).status, 403, `employer ${p}`);
  for (const p of ["/dashboard", "/employer/dashboard", "/courses"]) assert.equal((await admin.get(p)).status, 403, `admin ${p}`);
  assert.equal((await admin.get("/admin/dashboard")).status, 200);
});

test("woman profile, skills, score, evidence -> admin review", async () => {
  const p = (await woman.get("/profile")).data;
  assert.equal(p.city, "Chennai"); assert.ok(p.skills.length === 1);
  assert.equal((await woman.put("/profile", { goal: "Local part-time work", experienceNotes: "Cared for two children for 2 years." })).status, 200);
  assert.equal((await woman.post("/skills", { name: "Cooking", level: "Strong", yearsExperience: 4 })).status, 201);
  assert.equal((await woman.post("/skills", { name: "cooking", level: "Strong" })).status, 409, "case-insensitive duplicate");
  const skills = (await woman.get("/skills")).data;
  const cooking = skills.find((s) => s.name === "Cooking");
  assert.equal(cooking.verificationStatus, "Not Verified");
  assert.equal((await woman.post(`/skills/${cooking.id}/evidence`, { type: "Portfolio" })).status, 400, "needs link or note");
  const ev = await woman.post(`/skills/${cooking.id}/evidence`, { type: "Work sample", note: "Cooked for a 40-person event.", url: "https://example.org/sample" });
  assert.equal(ev.data.verificationStatus, "Pending Review", "evidence never auto-verifies");
  assert.ok((await admin.get("/admin/skill-evidence")).data.some((e) => e.id === cooking.id));
  assert.equal((await admin.put(`/admin/skill-evidence/${cooking.id}`, { status: "Rejected" })).status, 400, "reject needs a note");
  assert.equal((await admin.put(`/admin/skill-evidence/${cooking.id}`, { status: "Verified", notes: "Checked." })).status, 200);
  assert.equal((await woman.get("/skills")).data.find((s) => s.id === cooking.id).verificationStatus, "Verified");
  const score = (await woman.get("/sakhi-score")).data;
  assert.ok(score.score >= 0 && score.score <= 100); assert.equal(score.components.length, 5);
  assert.equal(score.components.reduce((t, c) => t + c.max, 0), 100);
  assert.match(score.disclaimer, /not a scientific/i);
  const hist = (await woman.get("/sakhi-score/history")).data;
  assert.ok(hist.length >= 2 && hist[0].reason.includes("Skill verified"), "history records real events");
});

test("learning: lessons gate assessment; grading; retry; certificate; verification; score up", async () => {
  courseAdmin = (await admin.get("/admin/courses")).data;
  const cs = courseAdmin.find((c) => c.title === "Child Safety Basics");
  const detail = (await woman.get(`/courses/${cs.id}`)).data;
  assert.ok(detail.questions.length >= 5); assert.ok(!JSON.stringify(detail).includes("correctAnswer"), "answers never sent to learners");
  const correct = cs.questions.map((q) => ({ questionId: q.id, answer: q.type === "short_answer" ? q.keywords.join(" ") : q.correctAnswer }));
  const wrong = cs.questions.map((q) => ({ questionId: q.id, answer: q.type === "true_false" ? (q.correctAnswer === "true" ? "false" : "true") : q.type === "multiple_choice" ? String((Number(q.correctAnswer) + 1) % q.options.length) : "nothing" }));
  assert.equal((await woman.post(`/courses/${cs.id}/assessment`, { answers: correct })).status, 409, "lessons must be completed first");
  const before = (await woman.get("/sakhi-score")).data.score;
  for (const [i, l] of detail.lessons.entries()) {
    const r = await woman.put(`/courses/${cs.id}/progress`, { lessonId: l.id, completed: true });
    assert.equal(r.data.progress, Math.round(((i + 1) / detail.lessons.length) * 100));
  }
  assert.equal((await woman.put(`/courses/${cs.id}/progress`, { lessonId: 999999 })).status, 404);
  const fail = (await woman.post(`/courses/${cs.id}/assessment`, { answers: wrong })).data;
  assert.equal(fail.passed, false); assert.equal(fail.attempt, 1); assert.equal(fail.certificateGenerated, false);
  const pass = (await woman.post(`/courses/${cs.id}/assessment`, { answers: correct })).data;
  assert.equal(pass.passed, true); assert.equal(pass.attempt, 2); assert.equal(pass.certificateGenerated, true);
  assert.ok(pass.verifiedSkills.includes("Child Safety")); assert.ok(pass.sakhiScore.after > before, "score recalculated upward");
  const certs = (await woman.get("/certificates")).data;
  assert.equal(certs.length, 1); assert.match(certs[0].wording, /Completion of SakhiSetu learning and assessment/); assert.match(certs[0].disclaimer, /does not replace/i);
  assert.equal((await woman.get("/skills")).data.find((s) => s.name === "Child Safety").verified, true);
  const again = (await woman.post(`/courses/${cs.id}/assessment`, { answers: correct })).data;
  assert.equal((await woman.get("/certificates")).data.length, 1, "no duplicate certificates"); assert.equal(again.passed, true);
  assert.ok((await woman.get("/notifications")).data.items.some((n) => n.type === "course_completed"));
});

test("skill check: verifies without lessons, no certificate", async () => {
  const eld = courseAdmin.find((c) => c.title === "Elderly Care Foundations");
  const answers = eld.questions.map((q) => ({ questionId: q.id, answer: q.type === "short_answer" ? q.keywords.join(" ") : q.correctAnswer }));
  const r = (await woman.post("/assessments", { courseId: eld.id, answers })).data;
  assert.equal(r.passed, true); assert.equal(r.certificateGenerated, false);
  assert.ok((await woman.get("/assessments")).data.some((a) => a.skillName === "Elderly Care" && a.attempts === 1));
});

test("employer registration -> pending -> admin verification -> create/manage opportunities", async () => {
  const reg = await employer.post("/auth/register", { role: "employer", businessName: `Test Biz ${run}`, employerName: "Test Owner", email: employerEmail, phone: "+91 90000 44444", location: "Chennai", businessType: "Cafe", description: "Small cafe", verificationInfo: "Shop licence number 123", password: "Passw0rdOK" });
  assert.equal(reg.status, 201); assert.equal(reg.data.employerVerificationStatus, "Pending");
  const oppBody = { title: "Cafe Cook", description: "Cook simple meals", category: "Cooking", location: "Chennai", workType: "Part-time", availability: "Evenings", experienceYears: 1, compensation: "₹500/day", requiredSkills: ["Cooking", "Child Safety"], preferredSkills: ["Time Management"] };
  assert.equal((await employer.post("/employer/opportunities", oppBody)).status, 403, "pending employers cannot post");
  const emp = (await admin.get("/admin/employers?status=Pending")).data.find((e) => e.businessName === `Test Biz ${run}`);
  assert.ok(emp && emp.verificationInfo.includes("licence"));
  assert.equal((await admin.put(`/admin/employers/${emp.id}/verify`, { status: "Rejected" })).status, 400, "reject requires notes");
  await admin.put(`/admin/employers/${emp.id}/verify`, { status: "Rejected", notes: "Please share a licence link." });
  assert.equal((await employer.get("/employer/profile")).data.verificationStatus, "Rejected");
  assert.ok((await employer.get("/notifications")).data.items.some((n) => n.type === "employer_verification"));
  assert.equal((await employer.put("/employer/profile", { verificationInfo: "Shop licence 123, link shared", evidenceUrl: "https://example.org/licence" })).data.verificationStatus, "Pending", "resubmission re-queues review");
  await admin.put(`/admin/employers/${emp.id}/verify`, { status: "Verified", notes: "OK" });
  assert.equal((await employer.get("/employer/profile")).data.verificationStatus, "Verified");
  assert.equal((await employer.post("/employer/opportunities", { ...oppBody, workType: "Sometimes" })).status, 400);
  assert.equal((await employer.post("/employer/opportunities", { ...oppBody, requiredSkills: [] })).status, 400);
  const created = await employer.post("/employer/opportunities", oppBody);
  assert.equal(created.status, 201); oppId = created.data.id;
  assert.equal((await employer.put(`/employer/opportunities/${oppId}`, { ...oppBody, title: "Cafe Cook (evenings)" })).data.title, "Cafe Cook (evenings)");
  const other = new Client(); await other.login("care@demo.sakhisetu.example");
  assert.equal((await other.get(`/employer/opportunities/${oppId}`)).status, 404, "employers only manage their own");
  assert.equal((await other.put(`/employer/opportunities/${oppId}`, oppBody)).status, 404);
});

test("opportunity search + transparent match explanation (rule-based)", async () => {
  const list = (await woman.get("/opportunities")).data;
  assert.ok(list.some((o) => o.id === oppId) && list.every((o) => o.verifiedEmployer));
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].match >= list[i].match);
  assert.ok((await woman.get("/opportunities?workType=Remote")).data.every((o) => o.workType === "Remote"));
  assert.ok((await woman.get("/opportunities?q=cafe")).data.some((o) => o.id === oppId));
  assert.ok((await woman.get("/opportunities?skill=Canva")).data.every((o) => [...o.requiredSkills, ...o.preferredSkills].includes("Canva")));
  const ex = (await woman.get(`/opportunities/${oppId}/match-explanation`)).data;
  assert.deepEqual(ex.scoring.map((s) => s.key), ['skills', 'availability', 'workPreference', 'experience', 'feedback']);
  assert.deepEqual(ex.scoring.map((s) => s.value), [50, 20, 15, 10, 5], 'skills 50 / availability 20 / work preference 15 / experience 10 / feedback 5');
  assert.equal(Math.round(ex.scoring.reduce((t, s) => t + s.earned, 0)), ex.match);
  assert.equal(ex.scoring.find((s) => s.key === 'feedback').earned, 0, 'no track record yet -> feedback component earns 0, not penalized');
  assert.ok(ex.matchingSkills.includes("Cooking") && ex.matchingSkills.includes("Child Safety")); assert.match(ex.note, /separate from your Sakhi Score/);
  const f = (await woman.get("/opportunities/filters")).data; assert.ok(f.locations.includes("Chennai") && f.workTypes.length === 5);
  assert.equal((await woman.post(`/opportunities/${oppId}/save`)).data.saved, true);
  assert.ok((await woman.get("/opportunities?saved=true")).data.some((o) => o.id === oppId));
  assert.equal((await woman.del(`/opportunities/${oppId}/save`)).data.saved, false);
});

test("apply -> employer review -> shortlist -> interview -> selected -> complete -> feedback -> score", async () => {
  const ap = await woman.post(`/opportunities/${oppId}/apply`, { coverNote: "Happy to start soon." });
  assert.equal(ap.status, 201); appId = ap.data.id; assert.equal(ap.data.status, "Applied");
  assert.equal((await woman.post(`/opportunities/${oppId}/apply`, {})).status, 409, "no duplicate applications");
  let apps = (await employer.get("/employer/applications")).data;
  const a = apps.find((x) => x.id === appId);
  assert.ok(a.applicantLabel.startsWith("Test") && !a.applicantLabel.includes("Woman"), "first name only");
  assert.equal(a.contact, null, "contact hidden before interview");
  assert.ok(a.relevantSkills.some((s) => s.name === "Cooking" && s.verified)); assert.ok(a.reasons.length > 0);
  assert.ok(!("email" in a) && !JSON.stringify(a).includes(womanEmail));
  assert.equal((await employer.post(`/employer/applications/${appId}/complete`)).status, 409, "only selected candidates");
  assert.equal((await woman.post("/feedback", { applicationId: appId, ratings: { communication: 5 } })).status, 409, "feedback needs completed work");
  for (const s of ["Under Review", "Shortlisted", "Interview"]) assert.equal((await employer.put(`/employer/applications/${appId}/status`, { status: s })).data.status, s);
  const iv = (await employer.get("/employer/applications")).data.find((x) => x.id === appId);
  assert.equal(iv.contact.email, womanEmail, "contact revealed at interview");
  assert.equal((await employer.put(`/employer/applications/${appId}/status`, { status: "Selected" })).data.status, "Selected");
  const notes = (await woman.get("/notifications")).data; assert.ok(notes.items.filter((n) => n.type === "application_status").length >= 4);
  const detail = (await woman.get(`/applications/${appId}`)).data;
  assert.deepEqual(detail.history.map((h) => h.status), ["Applied", "Under Review", "Shortlisted", "Interview", "Selected"]);
  assert.equal((await woman.post(`/applications/${appId}/withdraw`)).status, 409, "selected cannot be withdrawn");
  assert.equal((await employer.post(`/employer/applications/${appId}/complete`)).status, 200);
  const before = (await woman.get("/sakhi-score")).data;
  assert.equal((await employer.post("/feedback", { applicationId: appId, ratings: { workEnvironment: 5 } })).status, 400, "category not valid for this direction");
  const fb = await employer.post("/feedback", { applicationId: appId, ratings: { communication: 5, reliability: 4, skillPerformance: 5 }, comment: "Dependable and skilled." });
  assert.equal(fb.status, 201); assert.equal(fb.data.rating, 4.7);
  assert.equal((await employer.post("/feedback", { applicationId: appId, ratings: { communication: 5 } })).status, 409, "one feedback per direction");
  const after = (await woman.get("/sakhi-score")).data;
  const fbc = after.components.find((c) => c.key === "feedback");
  assert.ok(fbc.score > 0 && fbc.score <= 4, `single review must not dominate (got ${fbc.score}/10)`);
  // The woman's new feedback track record also lifts the feedback component of MATCH % on other opportunities
  // (still capped, one review must not dominate there either).
  const otherOpp = (await woman.get("/opportunities")).data.find((o) => o.id !== oppId);
  const matchEx = (await woman.get(`/opportunities/${otherOpp.id}/match-explanation`)).data;
  const matchFb = matchEx.scoring.find((s) => s.key === "feedback");
  assert.ok(matchFb.earned > 0 && matchFb.earned <= 3, `match feedback component must not dominate either (got ${matchFb.earned}/5)`);
  assert.ok(after.score >= before.score); assert.ok((await woman.get("/notifications")).data.items.some((n) => n.type === "feedback_received"));
  assert.equal((await woman.get("/feedback")).data.received.length, 1);
  assert.equal((await woman.post("/feedback", { applicationId: appId, ratings: { workEnvironment: 4, communication: 5 }, comment: "Good place." })).status, 201);
  assert.equal((await employer.get("/feedback")).data.received.length, 1);
  assert.equal((await woman.post("/feedback", { applicationId: 99999, ratings: { communication: 5 } })).status, 404);
  assert.ok((await woman.get("/sakhi-score/history")).data.some((h) => /feedback/i.test(h.reason)));
});

test("withdraw and re-apply; another woman cannot see my application", async () => {
  const other = (await woman.get("/opportunities")).data.find((o) => o.id !== oppId && !o.application);
  const ap = (await woman.post(`/opportunities/${other.id}/apply`, {})).data;
  assert.equal((await woman.post(`/applications/${ap.id}/withdraw`)).data.status, "Withdrawn");
  assert.equal((await woman.post(`/opportunities/${other.id}/apply`, {})).status, 201, "re-apply after withdrawing");
  const p = new Client(); await p.login("priya@demo.sakhisetu.example");
  assert.equal((await p.get(`/applications/${ap.id}`)).status, 404);
  assert.equal((await p.post(`/applications/${ap.id}/withdraw`)).status, 404);
});

test("reports -> admin review -> remove opportunity; suspension", async () => {
  const rep = await woman.post("/reports", { targetType: "opportunity", targetId: oppId, reason: "Suspicious payment request", description: "Asked me to pay a fee." });
  assert.equal(rep.status, 201); assert.equal(rep.data.status, "Open");
  assert.equal((await woman.post("/reports", { targetType: "opportunity", targetId: 999999, reason: "x" })).status, 404);
  assert.equal((await woman.post("/reports", { targetType: "content", targetId: 0, reason: "Rude language" })).status, 400, "content reports need a description");
  assert.ok((await woman.get("/reports")).data.length >= 1);
  assert.equal((await woman.get("/admin/reports")).status, 403);
  assert.equal((await admin.put(`/admin/reports/${rep.data.id}`, { status: "Resolved" })).status, 400, "needs a note");
  assert.equal((await admin.put(`/admin/reports/${rep.data.id}`, { status: "Under Review", resolutionNote: "Looking." })).data.status, "Under Review");
  const done = await admin.put(`/admin/reports/${rep.data.id}`, { status: "Resolved", resolutionNote: "Removed the listing.", action: "remove_opportunity" });
  assert.equal(done.data.status, "Resolved");
  assert.ok(!(await woman.get("/opportunities")).data.some((o) => o.id === oppId), "removed opportunity is hidden");
  assert.equal((await employer.put(`/employer/opportunities/${oppId}`, { title: "x", description: "y", category: "Other", location: "Chennai", workType: "Local", requiredSkills: ["Cooking"] })).status, 403, "removed cannot be edited");
  assert.ok((await woman.get("/notifications")).data.items.some((n) => n.type === "report_update"));
  const users = (await admin.get("/admin/users?role=woman")).data; const me = users.find((u) => u.email === womanEmail);
  assert.equal((await admin.put(`/admin/users/${me.id}/status`, { status: "suspended" })).data.status, "suspended");
  assert.equal((await woman.get("/profile")).status, 401, "suspended user's sessions are revoked");
  assert.equal((await anon.post("/auth/login", { email: womanEmail, password: "Passw0rdOK" })).status, 403);
  const adm = (await admin.get("/admin/users?role=admin")).data[0];
  assert.equal((await admin.put(`/admin/users/${adm.id}/status`, { status: "suspended" })).status, 403);
});

test("admin course management + notifications read state", async () => {
  const c = await admin.post("/admin/courses", { title: `Test Course ${run}`, category: "Practical skills", verifiesSkills: ["Tailoring"], passingScore: 60 });
  assert.equal(c.status, 201);
  assert.equal((await admin.post(`/admin/courses/${c.data.id}/lessons`, { title: "L1", videoUrl: "javascript:alert(1)" })).status, 400, "video links must be http(s)");
  const l = await admin.post(`/admin/courses/${c.data.id}/lessons`, { title: "L1", content: "Text", videoUrl: "https://example.org/video.mp4", objectives: ["a"] });
  assert.equal(l.data.lessons.length, 1);
  assert.equal((await admin.post(`/admin/courses/${c.data.id}/questions`, { type: "multiple_choice", prompt: "Q", options: ["a"], correctAnswer: "0" })).status, 400);
  const q = await admin.post(`/admin/courses/${c.data.id}/questions`, { type: "true_false", prompt: "Needles are sharp", correctAnswer: "true" });
  assert.equal(q.data.questions.length, 1);
  assert.equal((await admin.put(`/admin/courses/${c.data.id}`, { title: `Test Course ${run}`, category: "Practical skills", published: false })).data.published, false);
  const p = new Client(); await p.login("priya@demo.sakhisetu.example");
  assert.ok(!(await p.get("/courses")).data.some((x) => x.id === c.data.id), "drafts hidden from learners");
  const n = (await p.get("/notifications")).data; assert.ok(n.unreadCount > 0);
  await p.put(`/notifications/${n.items[0].id}/read`); assert.equal((await p.get("/notifications")).data.unreadCount, n.unreadCount - 1);
  await p.put("/notifications/read-all"); assert.equal((await p.get("/notifications")).data.unreadCount, 0);
  const dash = (await admin.get("/admin/dashboard")).data; assert.ok(dash.totalWomen >= 3 && dash.verifiedEmployers >= 5);
  assert.equal((await p.get("/ai/status")).data.enabled, false, "AI feedback safely disabled without credentials");
});
