// Canonical skill relationships used by the matching engine. Keep this file DB-independent so
// the engine remains deterministic/testable; seed/skills.js persists the same taxonomy to MongoDB.
const SKILL_TAXONOMY = [
    { canonicalName: 'Python', category: 'Programming', aliases: ['python'], relatedSkills: ['Machine Learning', 'SQL', 'Data Analysis'] },
    { canonicalName: 'SQL', category: 'Data', aliases: ['sql', 'mysql', 'postgresql'], relatedSkills: ['Python', 'Data Analysis', 'Power BI', 'Tableau'] },
    { canonicalName: 'Power BI', category: 'Data Visualization', aliases: ['power bi', 'powerbi'], relatedSkills: ['Tableau', 'Looker Studio', 'Data Visualization', 'Excel', 'SQL'] },
    { canonicalName: 'Tableau', category: 'Data Visualization', aliases: ['tableau'], relatedSkills: ['Power BI', 'Looker Studio', 'Data Visualization', 'Excel', 'SQL'] },
    { canonicalName: 'Data Visualization', category: 'Data Visualization', aliases: ['data visualization', 'dataviz'], relatedSkills: ['Power BI', 'Tableau', 'Looker Studio', 'Excel'] },
    { canonicalName: 'Excel', category: 'Data', aliases: ['excel', 'microsoft excel'], relatedSkills: ['Power BI', 'Tableau', 'Data Visualization', 'SQL'] },
    { canonicalName: 'AWS', category: 'Cloud', aliases: ['aws', 'amazon web services'], relatedSkills: ['Docker', 'Node.js', 'Python'] },
    { canonicalName: 'Docker', category: 'DevOps', aliases: ['docker'], relatedSkills: ['AWS', 'Node.js', 'Kubernetes'] },
    { canonicalName: 'JavaScript', category: 'Programming', aliases: ['javascript', 'js'], relatedSkills: ['TypeScript', 'React', 'Node.js'] },
    { canonicalName: 'TypeScript', category: 'Programming', aliases: ['typescript', 'ts'], relatedSkills: ['JavaScript', 'React', 'Node.js'] },
    { canonicalName: 'React', category: 'Frontend', aliases: ['react', 'reactjs'], relatedSkills: ['JavaScript', 'TypeScript'] },
    { canonicalName: 'Node.js', category: 'Backend', aliases: ['node', 'node.js', 'nodejs'], relatedSkills: ['JavaScript', 'TypeScript', 'Docker', 'AWS'] },
    { canonicalName: 'Git', category: 'Developer Tools', aliases: ['git', 'github'], relatedSkills: ['GitHub', 'Docker'] },
    { canonicalName: 'Machine Learning', category: 'AI & Data', aliases: ['machine learning', 'ml'], relatedSkills: ['Python', 'Data Analysis'] },
    { canonicalName: 'Communication', category: 'Professional', aliases: ['communication'], relatedSkills: [] },
    { canonicalName: 'Problem Solving', category: 'Professional', aliases: ['problem solving', 'problem-solving'], relatedSkills: [] }
];

let aliasToCanonical = new Map();
let canonicalMap = new Map();

function buildMaps(entries) {
    const aliasMap = new Map();
    const canonMap = new Map();
    entries.forEach((skill) => {
        canonMap.set(skill.canonicalName.toLowerCase(), skill);
        [skill.canonicalName, ...(skill.aliases || [])].forEach((alias) => 
            aliasMap.set(String(alias).trim().toLowerCase(), skill.canonicalName)
        );
    });
    return { aliasMap, canonMap };
}

// Initialize default maps from the static array
({ aliasMap: aliasToCanonical, canonMap: canonicalMap } = buildMaps(SKILL_TAXONOMY));

/**
 * Called once at boot once MongoDB is connected.
 * Merges DB-authored skills on top of the static defaults without deleting either.
 */
async function hydrateTaxonomyFromDb(SkillModel) {
    try {
        const dbSkills = await SkillModel.find().lean();
        if (!dbSkills.length) return;
        
        const merged = new Map(SKILL_TAXONOMY.map((s) => [s.canonicalName.toLowerCase(), s]));
        dbSkills.forEach((s) => merged.set(s.canonicalName.toLowerCase(), s));
        
        const built = buildMaps([...merged.values()]);
        aliasToCanonical = built.aliasMap;
        canonicalMap = built.canonMap;
    } catch (error) {
        console.error('Failed to hydrate taxonomy from DB, using fallback static taxonomy:', error.message);
    }
}

function normalizeSkillName(value) {
    const raw = String(value || '').trim();
    return aliasToCanonical.get(raw.toLowerCase()) || raw;
}

function getSkillDefinition(value) {
    return canonicalMap.get(normalizeSkillName(value).toLowerCase()) || null;
}

module.exports = { 
    SKILL_TAXONOMY, 
    normalizeSkillName, 
    getSkillDefinition, 
    hydrateTaxonomyFromDb 
};