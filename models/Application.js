const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['applied', 'review', 'interview', 'selected', 'rejected'], default: 'applied' },
    matchScore: { type: Number, min: 0, max: 100, default: 0 },
    matchScoreAtApplication: { type: Number, min: 0, max: 100 },
    // Snapshot of the skill-gap breakdown produced by utils/skillEngine.js at the moment the
    // student applied. Stored rather than recomputed on every view, so a company sees the gap as
    // it was when the candidate applied even if the student edits their profile afterward.
    skillGap: {
        matched: [{ type: String }],
        partial: [{ type: String }],
        missing: [{ type: String }],
        preferredMatched: [{ type: String }],
        compensating: [{ type: String }],
        compensationReasons: [{ type: String }],
        narrative: { type: String, maxlength: 500 }
    },
    createdAt: { type: Date, default: Date.now }
});

applicationSchema.index({ job: 1, student: 1 }, { unique: true });
module.exports = mongoose.model('Application', applicationSchema);
