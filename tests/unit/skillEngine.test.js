const assert = require('assert');
const { computeSkillGap, computeInstitutionSkillMatrix } = require('../../utils/skillEngine');

const gap = computeSkillGap(
    [{ name: 'SQL', level: 'Advanced' }, { name: 'Tableau', level: 'Advanced' }],
    { requiredSkills: ['SQL', 'Power BI'], preferredSkills: ['AWS'] }
);
assert.deepStrictEqual(gap.matched, ['SQL']);
assert.deepStrictEqual(gap.missing, ['Power BI']);
assert.deepStrictEqual(gap.compensating, ['Tableau']);
assert.ok(gap.compensationReasons[0].includes('related to Power BI'));
assert.strictEqual(gap.matchScore, 40);

const matrix = computeInstitutionSkillMatrix(
    [{ profile: { skills: [{ name: 'Python', level: 'Beginner' }] } }, { profile: { skills: [{ name: 'Python', level: 'Advanced' }] } }],
    [{ requiredSkills: ['Python'], preferredSkills: ['AWS'] }, { requiredSkills: ['Python'], preferredSkills: [] }]
);
const python = matrix.find((row) => row.skill === 'Python');
assert.strictEqual(python.requiredDemandPercent, 100);
assert.strictEqual(python.coveragePercent, 100);
assert.strictEqual(python.weightedReadiness, 67);
assert.strictEqual(python.gapPercent, 33);
console.log('skillEngine tests passed');
