const Institution = require('../models/Institution');

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Case-insensitive find-or-create so "Stanford", "stanford", and "Stanford " all resolve to the
// same Institution record instead of creating near-duplicates.
async function findOrCreateInstitution(rawName) {
    const trimmed = String(rawName).trim();
    let institution = await Institution.findOne({ name: new RegExp(`^${escapeRegExp(trimmed)}$`, 'i') });
    if (!institution) institution = await Institution.create({ name: trimmed, shortName: trimmed, verified: false });
    return institution;
}

module.exports = { escapeRegExp, findOrCreateInstitution };
