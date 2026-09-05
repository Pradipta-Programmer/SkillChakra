const express = require('express');
const User = require('../models/User');
const Application = require('../models/Application');
const Feedback = require('../models/Feedback');
const Internship = require('../models/Internship');

const router = express.Router();
const requireAuth = (req, res, next) => req.isAuthenticated() ? next() : res.status(401).json({ error: 'Please sign in first.' });
const requireRole = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'This action is not available for your role.' });

router.get('/me', requireAuth, (req, res) => res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, profile: req.user.profile } }));
router.patch('/profile', requireAuth, async (req, res, next) => {
    try {
        const allowed = ['skills', 'education', 'college', 'institutionId', 'cgpa', 'bio', 'companyDescription', 'resumeSummary', 'projects', 'certifications'];
        const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
        const user = await User.findByIdAndUpdate(req.user.id, { $set: Object.fromEntries(Object.entries(updates).map(([key, value]) => [`profile.${key}`, value])) }, { new: true, runValidators: true });
        res.json({ user });
    } catch (error) { next(error); }
});

router.get('/students', requireAuth, requireRole('college', 'company'), async (req, res, next) => {
    try {
        const query = { role: 'student' };
        if (req.user.role === 'college') {
            const conditions = [{ 'profile.college': req.user.name }];
            if (req.user.profile?.institutionId) conditions.unshift({ 'profile.institutionId': req.user.profile.institutionId });
            query.$or = conditions;
        }
        const students = await User.find(query).select('name email profile role');
        res.json({ students });
    } catch (error) { next(error); }
});

async function persistFeedback(req, res) {
    const { applicationId, studentId, status, reason, feedback } = req.body;
    const resolvedApplicationId = applicationId || req.params.applicationId;
    if (!resolvedApplicationId && !studentId) return res.status(400).json({ error: 'Application or student is required.' });

    let application;
    if (resolvedApplicationId) application = await Application.findById(resolvedApplicationId).populate('job');
    else application = await Application.findOne({ student: studentId }).sort('-createdAt').populate('job');
    if (!application || !application.job || String(application.job.company) !== req.user.id) return res.status(404).json({ error: 'Application not found for this company.' });

    if (!['selected', 'rejected'].includes(status) || !reason) return res.status(400).json({ error: 'Decision and reason are required.' });
    application.status = status;
    await application.save();
    const document = await Feedback.findOneAndUpdate(
        { application: application.id, type: 'hiring_decision' },
        { $set: { application: application.id, company: req.user.id, student: application.student, type: 'hiring_decision', decision: status, reason: String(reason).trim(), feedback: String(feedback || '').trim() } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    let internship = null;
    if (status === 'selected') {
        internship = await Internship.findOneAndUpdate(
            { application: application.id },
            { $setOnInsert: { application: application.id, student: application.student, company: req.user.id, job: application.job.id, status: 'active', startDate: new Date() } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    }
    return res.status(201).json({ message: 'Decision and feedback persisted.', feedback: document, internship });
}

router.post('/applications/:applicationId/feedback', requireAuth, requireRole('company'), async (req, res, next) => {
    try { await persistFeedback(req, res); } catch (error) { next(error); }
});

// Legacy compatibility endpoint: existing API clients can continue sending studentId/status/reason.
router.post('/feedback', requireAuth, requireRole('company'), async (req, res, next) => {
    try { await persistFeedback(req, res); } catch (error) { next(error); }
});

router.post('/internships/:internshipId/complete', requireAuth, requireRole('company'), async (req, res, next) => {
    try {
        const internship = await Internship.findById(req.params.internshipId);
        if (!internship || String(internship.company) !== req.user.id) return res.status(404).json({ error: 'Internship not found.' });
        if (internship.status !== 'active') return res.status(400).json({ error: 'Only active internships can be completed.' });
        internship.status = 'completed';
        internship.completedAt = new Date();
        internship.endDate = new Date();
        await internship.save();
        res.json({ message: 'Internship completed.', internship });
    } catch (error) { next(error); }
});

router.post('/verify-student', requireAuth, requireRole('college'), async (req, res, next) => {
    try {
        const { studentId, score } = req.body;
        const conditions = [{ _id: studentId, role: 'student', 'profile.college': req.user.name }];
        if (req.user.profile?.institutionId) conditions.unshift({ _id: studentId, role: 'student', 'profile.institutionId': req.user.profile.institutionId });
        const student = await User.findOneAndUpdate({ $or: conditions }, { $set: { 'profile.collegeScore': Math.max(0, Math.min(100, Number(score))) } }, { new: true });
        if (!student) return res.status(404).json({ error: 'Student was not found in your institution.' });
        res.json({ message: 'Student verification score updated.', student });
    } catch (error) { next(error); }
});

module.exports = router;
