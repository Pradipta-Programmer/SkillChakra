const mongoose = require('mongoose');

const internshipSchema = new mongoose.Schema({
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, unique: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    status: { type: String, enum: ['planned', 'active', 'completed', 'cancelled'], default: 'planned' },
    startDate: { type: Date },
    endDate: { type: Date },
    completedAt: { type: Date },
    mentorName: { type: String, trim: true, maxlength: 120 },
    createdAt: { type: Date, default: Date.now }
});

internshipSchema.index({ student: 1, status: 1 });
internshipSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('Internship', internshipSchema);
