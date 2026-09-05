const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
    internship: { type: mongoose.Schema.Types.ObjectId, ref: 'Internship' },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['hiring_decision', 'internship_evaluation'], default: 'hiring_decision' },
    decision: { type: String, enum: ['selected', 'rejected'], required: false },
    reason: { type: String, required: true, trim: true, maxlength: 240 },
    feedback: { type: String, trim: true, maxlength: 2000 },
    // Structured employer evaluation ratings, each out of 5, recorded after internship completion.
    competencies: {
        technicalSkills: { type: Number, min: 1, max: 5 },
        problemSolving: { type: Number, min: 1, max: 5 },
        communication: { type: Number, min: 1, max: 5 },
        practicalApplication: { type: Number, min: 1, max: 5 }
    },
}, { timestamps: true });

feedbackSchema.index({ application: 1, type: 1 });
feedbackSchema.index({ student: 1, type: 1 });
module.exports = mongoose.model('Feedback', feedbackSchema);
