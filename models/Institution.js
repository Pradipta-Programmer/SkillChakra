const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 180 },
    shortName: { type: String, trim: true, maxlength: 80 },
    domain: { type: String, trim: true, lowercase: true, maxlength: 180 },
    location: { type: String, trim: true, maxlength: 180 },
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

institutionSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Institution', institutionSchema);
