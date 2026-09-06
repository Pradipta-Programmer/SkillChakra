const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Feedback = require('../models/Feedback');
const Internship = require('../models/Internship');
const Institution = require('../models/Institution');
const { SKILL_LEVELS, computeSkillGap, rankJobsForStudent, computeInstitutionSkillMatrix, aggregateCompetencyFeedback } = require('../utils/skillEngine');
const { escapeRegExp, findOrCreateInstitution } = require('../utils/institutions');

const router = express.Router();
const roles = { student: 'Student', college: 'College admin', company: 'Company' };
const requireDatabase = (req, res, next) => req.app.locals.databaseReady ? next() : res.redirect('/login?message=' + encodeURIComponent('Database is unavailable. Check your MongoDB Atlas IP access and connection string.'));
const requirePageAuth = (req, res, next) => req.isAuthenticated() ? next() : res.redirect('/login?message=Please sign in to continue.');
const requirePageRole = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).render('pages/error', { title: 'Access denied', message: 'This workspace is not available for your account.' });
const page = (view, data = {}) => (req, res) => res.render(view, { user: req.user, roleLabel: roles[req.user?.role], notice: req.query.message, ...data });

router.get('/', (req, res) => req.user ? res.redirect(`/${req.user.role}/dashboard`) : res.redirect('/login'));
router.get('/login', (req, res) => req.user ? res.redirect(`/${req.user.role}/dashboard`) : res.render('auth/login', { title: 'Sign in', message: req.query.message }));
router.get('/signup', (req, res) => req.user ? res.redirect(`/${req.user.role}/dashboard`) : res.render('auth/signup', { title: 'Create account', selectedRole: req.query.role || 'student', message: req.query.message }));
router.post('/logout', (req, res, next) => req.logout((error) => error ? next(error) : req.session.destroy(() => res.redirect('/login?message=You have been signed out.'))));
router.post('/login', requireDatabase, (req, res, next) => {
    passport.authenticate('local', (error, user, info) => {
        if (error) return next(error);
        if (!user) return res.redirect(`/login?message=${encodeURIComponent(info?.message || 'Invalid email or password.')}`);
        if (req.body.role !== user.role) return res.redirect(`/login?message=${encodeURIComponent(`This account is registered as a ${user.role}.`)}`);
        req.logIn(user, (loginError) => loginError ? next(loginError) : res.redirect(`/${user.role}/dashboard`));
    })(req, res, next);
});
router.post('/signup', requireDatabase, async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !['student', 'college', 'company'].includes(role)) return res.redirect(`/signup?role=${role || 'student'}&message=${encodeURIComponent('Complete every field and choose a valid account type.')}`);
        if (password.length < 8) return res.redirect(`/signup?role=${role}&message=${encodeURIComponent('Password must be at least 8 characters.')}`);
        const normalizedEmail = email.toLowerCase().trim();
        if (await User.exists({ email: normalizedEmail })) return res.redirect(`/login?message=${encodeURIComponent('An account with this email already exists.')}`);
        let profile = {};
        if (role === 'college') {
            // A dedicated field, not the admin's own name, is what identifies the institution —
            // otherwise two different fields (personal name vs. institution name) collapse into one
            // and there's no separate record of which college this admin actually represents.
            const institutionName = String(req.body.institutionName || '').trim();
            if (!institutionName) return res.redirect(`/signup?role=college&message=${encodeURIComponent('Enter the name of the college or institution you administer.')}`);
            const institution = await findOrCreateInstitution(institutionName);
            profile.institutionId = institution.id;
            profile.college = institution.name;
        }
        if (role === 'student') {
            // Optional at signup — students can still set or change this later from their profile page.
            const collegeName = String(req.body.college || '').trim();
            if (collegeName) {
                const institution = await findOrCreateInstitution(collegeName);
                profile.institutionId = institution.id;
                profile.college = institution.name;
            }
        }
        const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12), role, profile });
        req.logIn(user, (error) => error ? next(error) : res.redirect(`/${role}/dashboard`));
    } catch (error) { next(error); }
});

router.get('/student/dashboard', requirePageAuth, requirePageRole('student'), async (req, res, next) => {
    try {
        const [allApplications, jobs, latestFeedback] = await Promise.all([
            Application.find({ student: req.user.id }).populate('job').sort('-createdAt'),
            Job.find({ status: 'open' }).sort('-createdAt').limit(6),
            Feedback.findOne({ student: req.user.id }).sort('-createdAt').populate({ path: 'application', populate: { path: 'job', select: 'title' } })
        ]);
        const applications = allApplications.slice(0, 5);
        const ranked = rankJobsForStudent(req.user.profile?.skills, jobs);
        const averageMatch = ranked.length ? Math.round(ranked.reduce((sum, item) => sum + item.gap.matchScore, 0) / ranked.length) : 0;

        // Tally how often each missing skill shows up across this student's currently open, ranked
        // opportunities — the most frequent one is the highest-leverage skill to learn next.
        const missingSkillCounts = new Map();
        ranked.forEach(({ gap }) => gap.missing.forEach((skill) => missingSkillCounts.set(skill, (missingSkillCounts.get(skill) || 0) + 1)));
        const topSkillGap = [...missingSkillCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;

        const statusCounts = {
            applied: allApplications.filter((application) => application.status === 'applied').length,
            inReview: allApplications.filter((application) => ['review', 'interview'].includes(application.status)).length,
            selected: allApplications.filter((application) => application.status === 'selected').length
        };

        res.render('student/dashboard', { user: req.user, roleLabel: roles.student, applications, jobs, averageMatch, bestMatch: ranked[0] || null, topSkillGap, statusCounts, latestFeedback, notice: req.query.message });
    } catch (error) { next(error); }
});
router.get('/student/profile', requirePageAuth, requirePageRole('student'), async (req, res, next) => {
    try {
        const [institutions, validatedFeedback] = await Promise.all([
            Institution.find({}).sort('name').limit(500),
            Feedback.find({ student: req.user.id, $or: [{ type: 'internship_evaluation' }, { type: { $exists: false }, 'competencies.technicalSkills': { $exists: true } }] })
        ]);
        const validatedCompetencies = aggregateCompetencyFeedback(validatedFeedback);
        res.render('student/profile', { user: req.user, roleLabel: roles.student, skillLevels: SKILL_LEVELS, institutions, validatedCompetencies, notice: req.query.message });
    } catch (error) { next(error); }
});
router.post('/student/profile', requirePageAuth, requirePageRole('student'), async (req, res, next) => {
    try {
        let institutionId = req.body.institutionId || undefined;
        let collegeName = String(req.body.college || '').trim();
        if (institutionId) {
            const institution = await Institution.findById(institutionId);
            if (!institution) institutionId = undefined;
            else collegeName = institution.name;
        }
        if (!institutionId && collegeName) {
            const institution = await findOrCreateInstitution(collegeName);
            institutionId = institution.id;
            collegeName = institution.name;
        }
        await User.findByIdAndUpdate(req.user.id, { $set: {
            'profile.education': req.body.education,
            'profile.college': collegeName,
            'profile.institutionId': institutionId,
            'profile.cgpa': req.body.cgpa === '' ? undefined : req.body.cgpa,
            'profile.bio': req.body.bio,
            'profile.resumeSummary': req.body.resumeSummary,
            'profile.skills': parseSkillsFromForm(req.body),
            'profile.projects': parseProjects(req.body.projects),
            'profile.certifications': parseCertifications(req.body.certifications)
        } }, { runValidators: true });
        res.redirect('/student/profile?message=Profile updated.');
    } catch (error) { next(error); }
});
router.get('/student/opportunities', requirePageAuth, requirePageRole('student'), async (req, res, next) => {
    try {
        const jobs = await Job.find({ status: 'open' }).populate('company', 'name profile.companyDescription').sort('-createdAt');
        const applied = await Application.find({ student: req.user.id }).select('job');
        const ranked = rankJobsForStudent(req.user.profile?.skills, jobs);
        res.render('student/opportunities', { user: req.user, roleLabel: roles.student, ranked, applied: new Set(applied.map((item) => String(item.job))), notice: req.query.message });
    } catch (error) { next(error); }
});
router.post('/student/opportunities/:jobId/apply', requirePageAuth, requirePageRole('student'), async (req, res, next) => {
    try {
        const job = await Job.findOne({ _id: req.params.jobId, status: 'open' });
        if (!job) return res.redirect('/student/opportunities?message=That opportunity is no longer open.');
        const studentCgpa = Number(req.user.profile?.cgpa);
        if (job.minimumCgpa > 0 && (!Number.isFinite(studentCgpa) || studentCgpa < job.minimumCgpa)) {
            return res.redirect(`/student/opportunities?message=${encodeURIComponent(`CGPA requirement not met. This role requires ${job.minimumCgpa}.`)}`);
        }
        const gap = computeSkillGap(req.user.profile?.skills, job);
        await Application.create({
            job: job.id,
            student: req.user.id,
            matchScore: gap.matchScore,
            matchScoreAtApplication: gap.matchScore,
            skillGap: { matched: gap.matched, partial: gap.partial, missing: gap.missing, preferredMatched: gap.preferredMatched, compensating: gap.compensating, compensationReasons: gap.compensationReasons, narrative: gap.narrative }
        });
        res.redirect('/student/opportunities?message=Application submitted.');
    } catch (error) {
        if (error.code === 11000) return res.redirect('/student/opportunities?message=You already applied for this role.');
        next(error);
    }
});
router.get('/student/feedback', requirePageAuth, requirePageRole('student'), async (req, res, next) => { try { const feedback = await Feedback.find({ student: req.user.id }).populate({ path: 'application', populate: { path: 'job', select: 'title' } }).populate('company', 'name').sort('-createdAt'); res.render('student/feedback', { user: req.user, roleLabel: roles.student, feedback }); } catch (error) { next(error); } });

router.get('/company/dashboard', requirePageAuth, requirePageRole('company'), async (req, res, next) => {
    try {
        const jobs = await Job.find({ company: req.user.id }).sort('-createdAt');
        const jobIds = jobs.map((job) => job.id);
        const [totalApplicants, selectedCount] = await Promise.all([
            Application.countDocuments({ job: { $in: jobIds } }),
            Application.countDocuments({ job: { $in: jobIds }, status: 'selected' })
        ]);
        const topSkill = topSkillAcrossJobs(jobs.filter((job) => job.status === 'open'));
        res.render('company/dashboard', { user: req.user, roleLabel: roles.company, jobs, totalApplicants, selectedCount, topSkill, notice: req.query.message });
    } catch (error) { next(error); }
});
router.get('/company/jobs/new', requirePageAuth, requirePageRole('company'), page('company/new-job'));
router.post('/company/jobs', requirePageAuth, requirePageRole('company'), async (req, res, next) => {
    try {
        await Job.create({
            company: req.user.id,
            title: req.body.title,
            description: req.body.description,
            location: req.body.location,
            employmentType: req.body.employmentType,
            requiredSkills: parseList(req.body.requiredSkills),
            preferredSkills: parseList(req.body.preferredSkills),
            minimumCgpa: req.body.minimumCgpa || 0
        });
        res.redirect('/company/dashboard?message=Opportunity published.');
    } catch (error) { next(error); }
});
router.get('/company/candidates', requirePageAuth, requirePageRole('company'), async (req, res, next) => {
    try {
        const jobs = await Job.find({ company: req.user.id }).select('_id');
        const applications = await Application.find({ job: { $in: jobs.map((job) => job.id) } }).populate('student job').sort('-createdAt');
        const feedbackDocs = await Feedback.find({ application: { $in: applications.map((application) => application.id) } });
        const feedbackByApplication = new Map(feedbackDocs.map((doc) => [String(doc.application), doc]));
        // Recomputed live (rather than read from the stored apply-time snapshot) so a company always
        // screens against the candidate's current profile and the job's current preferred skills.
        const internships = await Internship.find({ application: { $in: applications.map((application) => application.id) } });
        const internshipByApplication = new Map(internships.map((internship) => [String(internship.application), internship]));
        const candidates = applications.map((application) => ({
            application,
            gap: computeSkillGap(application.student?.profile?.skills, application.job),
            feedback: feedbackByApplication.get(String(application.id)) || null,
            internship: internshipByApplication.get(String(application.id)) || null
        })).sort((a, b) => b.gap.matchScore - a.gap.matchScore);
        res.render('company/candidates', { user: req.user, roleLabel: roles.company, candidates, notice: req.query.message });
    } catch (error) { next(error); }
});
router.post('/company/applications/:applicationId/decision', requirePageAuth, requirePageRole('company'), async (req, res, next) => {
    try {
        const application = await Application.findById(req.params.applicationId).populate('job');
        if (!application || !application.job || String(application.job.company) !== req.user.id) return res.redirect('/company/candidates?message=Application not found.');
        if (!['selected', 'rejected'].includes(req.body.decision)) return res.redirect('/company/candidates?message=Choose a valid hiring decision.');
        const decision = req.body.decision;
        application.status = decision;
        await application.save();
        await Feedback.findOneAndUpdate(
            { application: application.id, type: 'hiring_decision' },
            { $set: { application: application.id, company: req.user.id, student: application.student, type: 'hiring_decision', decision, reason: String(req.body.reason || '').trim(), feedback: String(req.body.feedback || '').trim() } },
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );
        if (decision === 'selected') {
            await Internship.findOneAndUpdate(
                { application: application.id },
                { $setOnInsert: { application: application.id, student: application.student, company: req.user.id, job: application.job.id, status: 'active', startDate: new Date() } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }
        res.redirect('/company/candidates?message=Decision recorded. Selected candidates now have an active internship.');
    } catch (error) { next(error); }
});
// Structured employer evaluation is available only after the explicit Internship lifecycle reaches
// completed. Hiring-decision feedback remains a separate Feedback document.
router.post('/company/internships/:internshipId/complete', requirePageAuth, requirePageRole('company'), async (req, res, next) => {
    try {
        const internship = await Internship.findById(req.params.internshipId).populate('job');
        if (!internship || String(internship.company) !== req.user.id) return res.redirect('/company/candidates?message=Internship not found.');
        if (internship.status !== 'active') return res.redirect('/company/candidates?message=Only active internships can be completed.');
        internship.status = 'completed';
        internship.completedAt = new Date();
        internship.endDate = new Date();
        await internship.save();
        res.redirect('/company/candidates?message=Internship marked completed. Employer competency feedback is now unlocked.');
    } catch (error) { next(error); }
});
router.post('/company/applications/:applicationId/feedback', requirePageAuth, requirePageRole('company'), async (req, res, next) => {
    try {
        const application = await Application.findById(req.params.applicationId).populate('job');
        if (!application || String(application.job.company) !== req.user.id) return res.redirect('/company/candidates?message=Application not found.');
        if (application.status !== 'selected') return res.redirect('/company/candidates?message=Post-internship feedback is only available for hired candidates.');
        const internship = await Internship.findOne({ application: application.id });
        if (!internship || internship.status !== 'completed') return res.redirect('/company/candidates?message=Complete the internship before submitting competency feedback.');
        const competencies = {
            technicalSkills: clampRating(req.body.technicalSkills),
            problemSolving: clampRating(req.body.problemSolving),
            communication: clampRating(req.body.communication),
            practicalApplication: clampRating(req.body.practicalApplication)
        };
        const updated = await Feedback.findOneAndUpdate(
            { application: application.id, type: 'internship_evaluation' },
            { $set: { application: application.id, internship: internship.id, company: req.user.id, student: application.student, type: 'internship_evaluation', decision: 'selected', reason: 'Internship completed', competencies, ...(req.body.notes ? { feedback: req.body.notes } : {}) } },
            { new: true }
        );
        if (!updated) return res.redirect('/company/candidates?message=No feedback record found for this candidate yet.');
        res.redirect('/company/candidates?message=Post-internship feedback saved.');
    } catch (error) { next(error); }
});

router.get('/college/dashboard', requirePageAuth, requirePageRole('college'), async (req, res, next) => {
    try {
        const students = await findInstitutionStudents(req.user);
        const studentIds = students.map((student) => student.id);
        // Industry demand is measured against the whole open marketplace, not just roles this
        // college's students have applied to — that's what makes it a useful external signal.
        const jobs = await Job.find({ status: 'open' });
        const skillMatrix = computeInstitutionSkillMatrix(students, jobs).map((row) => ({ ...row, insight: gapInsightLabel(row.gapPercent) }));
        const [feedbackForCollege, activePlacements] = await Promise.all([
            Feedback.find({ student: { $in: studentIds }, $or: [{ type: 'internship_evaluation' }, { type: { $exists: false }, 'competencies.technicalSkills': { $exists: true } }] }),
            Internship.countDocuments({ student: { $in: studentIds }, status: { $in: ['planned', 'active'] } })
        ]);
        const competencyAverages = aggregateCompetencyFeedback(feedbackForCollege);
        res.render('college/dashboard', { user: req.user, roleLabel: roles.college, students, jobs, skillMatrix, competencyAverages, feedbackCount: feedbackForCollege.length, activePlacements, notice: req.query.message });
    } catch (error) { next(error); }
});
router.get('/college/students', requirePageAuth, requirePageRole('college'), async (req, res, next) => {
    try {
        const students = await findInstitutionStudents(req.user);
        const studentIds = students.map((student) => student.id);
        const [jobs, applications] = await Promise.all([
            Job.find({ status: 'open' }),
            Application.find({ student: { $in: studentIds } }).populate('job').sort('-createdAt')
        ]);
        const applicationsByStudent = new Map();
        applications.forEach((application) => {
            const key = String(application.student);
            if (!applicationsByStudent.has(key)) applicationsByStudent.set(key, []);
            applicationsByStudent.get(key).push(application);
        });
        // Rank of "how far along" a status is, used to surface the single most advanced
        // application per student as their current status.
        const statusRank = { selected: 3, interview: 2, review: 2, applied: 1, rejected: 0 };
        // Neither User nor Application track an explicit "target role" — this reuses the same
        // skillEngine.rankJobsForStudent already relied on by the student dashboard/opportunities
        // pages, so "target role" here means "the open role this student is currently best
        // positioned for", and its gap.missing is the student's target skill gap for that role.
        const roster = students.map((student) => {
            const ranked = rankJobsForStudent(student.profile?.skills, jobs);
            const studentApplications = applicationsByStudent.get(String(student.id)) || [];
            const currentStatus = studentApplications.reduce((best, application) => ((statusRank[application.status] ?? -1) > (statusRank[best?.status] ?? -1) ? application : best), null);
            return { student, bestMatch: ranked[0] || null, applicationCount: studentApplications.length, currentStatus };
        });
        res.render('college/students', { user: req.user, roleLabel: roles.college, roster, notice: req.query.message });
    } catch (error) { next(error); }
});

async function findInstitutionStudents(collegeUser) {
    let institutionId = collegeUser.profile?.institutionId;
    if (!institutionId) {
        const institution = await Institution.findOne({ name: new RegExp(`^${escapeRegExp(collegeUser.name)}$`, 'i') });
        institutionId = institution?.id;
    }
    const conditions = [{ 'profile.college': collegeUser.name }];
    if (institutionId) conditions.unshift({ 'profile.institutionId': institutionId });
    return User.find({ role: 'student', $or: conditions }).sort('name');
}

function parseList(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }

// Turns a raw institutional gap % into the actionable label shown on the college dashboard.
// Presentation-only classification, so it lives here rather than in skillEngine.js.
function gapInsightLabel(gapPercent) {
    if (gapPercent > 30) return 'Critical gap';
    if (gapPercent > 0) return 'Moderate gap';
    return 'Optimal alignment';
}

// Most frequently listed skill (required or preferred) across a set of a company's own jobs.
// Deliberately simple and company-scoped, unlike skillEngine's institution-wide demand matrix.
function topSkillAcrossJobs(jobs = []) {
    const counts = new Map();
    jobs.forEach((job) => [...(job.requiredSkills || []), ...(job.preferredSkills || [])].forEach((skill) => counts.set(skill, (counts.get(skill) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
}

// Clamps a 1-5 competency rating from a <select>; returns undefined (not stored) if invalid.
function clampRating(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return undefined;
    return Math.min(5, Math.max(1, Math.round(num)));
}

// Skill rows arrive as parallel arrays: skillName=Python&skillName=SQL&skillLevel=Advanced&skillLevel=Intermediate.
// express.urlencoded({ extended: false }) uses Node's querystring parser, which turns repeated
// same-name fields into arrays automatically — no [] suffix needed on the input names.
function parseSkillsFromForm(body) {
    const names = [].concat(body.skillName || []);
    const levels = [].concat(body.skillLevel || []);
    const seen = new Set();
    const skills = [];
    names.forEach((rawName, index) => {
        const name = String(rawName || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        skills.push({ name, level: SKILL_LEVELS.includes(levels[index]) ? levels[index] : 'Beginner' });
    });
    return skills;
}

// One project per line: "Title | What you built | skill1, skill2"
function parseProjects(value) {
    return String(value || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [title, description, skills] = line.split('|').map((part) => (part || '').trim());
        return { title: title || 'Untitled project', description: description || '', skills: skills ? skills.split(',').map((skill) => skill.trim()).filter(Boolean) : [] };
    });
}

// One certification per line: "Name | Issuer | Year"
function parseCertifications(value) {
    return String(value || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [name, issuer, year] = line.split('|').map((part) => (part || '').trim());
        return { name: name || 'Untitled certification', issuer: issuer || '', year: year ? Number(year) : undefined };
    });
}

module.exports = router;
