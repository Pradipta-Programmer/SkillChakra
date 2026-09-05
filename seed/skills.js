const Skill = require('../models/Skill');
const { SKILL_TAXONOMY } = require('../utils/skillTaxonomy');

async function seedSkills() {
    await Promise.all(SKILL_TAXONOMY.map((skill) => Skill.updateOne(
        { canonicalName: skill.canonicalName },
        { $set: skill },
        { upsert: true }
    )));
}

module.exports = { seedSkills };
