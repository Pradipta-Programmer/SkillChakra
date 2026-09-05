const mongoose = require('mongoose');
const { SKILL_LEVELS } = require('../utils/skillEngine');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['student', 'college', 'company'], required: true },
    profile: {
        // Skill proficiency is now a real, student-set level rather than an unused numeric score.
        // This is the primary input to utils/skillEngine.js.
        skills: [{
            name: { type: String, trim: true },
            level: { type: String, enum: SKILL_LEVELS, default: 'Beginner' }
        }],
        education: { type: String, trim: true },
        college: { type: String, trim: true },
        institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', index: true },
        cgpa: { type: Number, min: 0, max: 10 },
        bio: { type: String, maxlength: 1000 },
        companyDescription: { type: String, maxlength: 1000 },
        // This prototype has no file-upload pipeline yet, so "resume" is a text summary rather
        // than an uploaded file for now.
        resumeSummary: { type: String, maxlength: 1500 },
        projects: [{
            title: { type: String, trim: true, maxlength: 160 },
            description: { type: String, trim: true, maxlength: 600 },
            skills: [{ type: String, trim: true }]
        }],
        certifications: [{
            name: { type: String, trim: true, maxlength: 160 },
            issuer: { type: String, trim: true, maxlength: 160 },
            year: { type: Number }
        }],
        // TODO(Phase 4): collegeScore is the legacy manual "trust score" flow, which is being
        // fully replaced by the skill-demand/readiness/gap dashboard per the approved direction.
        // It's declared here now only to fix a pre-existing bug: routes/views already read and
        // wrote this field, but it was missing from the schema, so Mongoose's strict mode was
        // silently dropping every write. Remove this field entirely once Phase 4 ships.
        // Legacy trust score retained only for backwards-compatible API clients; new dashboards
        // should use skill readiness and employer-validated competencies instead.
        collegeScore: { type: Number, min: 0, max: 100, default: 0 }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
