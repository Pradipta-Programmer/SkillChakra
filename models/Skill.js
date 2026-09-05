const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
    canonicalName: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    aliases: [{ type: String, trim: true, lowercase: true }],
    category: { type: String, trim: true, maxlength: 100 },
    relatedSkills: [{ type: String, trim: true }],
    createdAt: { type: Date, default: Date.now }
});

skillSchema.index({ aliases: 1 });
module.exports = mongoose.model('Skill', skillSchema);
