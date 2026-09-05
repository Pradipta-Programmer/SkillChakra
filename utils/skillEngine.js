const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const STRONG_LEVELS = new Set(['Intermediate', 'Advanced']);
const PROFICIENCY_WEIGHTS = { Beginner: 0.33, Intermediate: 0.66, Advanced: 1 };
const { normalizeSkillName, getSkillDefinition } = require('./skillTaxonomy');

function buildSkillMap(skills = []) {
    const map = new Map();
    (skills || []).forEach((skill) => {
        if (!skill || !skill.name) return;
        const key = normalizeSkillName(skill.name).toLowerCase();
        const level = SKILL_LEVELS.includes(skill.level) ? skill.level : 'Beginner';
        const previous = map.get(key);
        if (!previous || (PROFICIENCY_WEIGHTS[level] || 0) > (PROFICIENCY_WEIGHTS[previous] || 0)) map.set(key, level);
    });
    return map;
}

function classifyRequiredSkills(skillMap, requiredSkills = []) {
    const matched = [], partial = [], missing = [];
    const seen = new Set();
    (requiredSkills || []).forEach((raw) => {
        const skill = normalizeSkillName(raw);
        const key = skill.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const level = skillMap.get(key);
        if (!level) missing.push(skill);
        else if (STRONG_LEVELS.has(level)) matched.push(skill);
        else partial.push(skill);
    });
    return { matched, partial, missing };
}

function classifyPreferredSkills(skillMap, preferredSkills = []) {
    const seen = new Set();
    return (preferredSkills || []).map(normalizeSkillName).filter((skill) => {
        const key = skill.toLowerCase();
        if (seen.has(key) || !skillMap.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function findCompensatingSkills(skills = [], missingSkills = [], requiredSkills = [], preferredSkills = []) {
    const listed = new Set([...(requiredSkills || []), ...(preferredSkills || [])].map((skill) => normalizeSkillName(skill).toLowerCase()));
    const missing = (missingSkills || []).map((skill) => normalizeSkillName(skill));
    const candidates = [];
    (skills || []).forEach((skill) => {
        if (!skill?.name || !STRONG_LEVELS.has(skill.level)) return;
        const canonical = normalizeSkillName(skill.name);
        if (listed.has(canonical.toLowerCase())) return;
        const definition = getSkillDefinition(canonical);
        if (!definition) return;
        const related = new Set((definition.relatedSkills || []).map(normalizeSkillName).map((name) => name.toLowerCase()));
        const relatedMissing = missing.filter((required) => {
            const missingDef = getSkillDefinition(required);
            return missingDef && (
                related.has(missingDef.canonicalName.toLowerCase()) ||
                (missingDef.relatedSkills || []).map(normalizeSkillName).map((name) => name.toLowerCase()).includes(canonical.toLowerCase())
            );
        });
        if (relatedMissing.length) candidates.push({ skill: canonical, reason: `${canonical} is taxonomically related to ${relatedMissing.join(', ')}` });
    });
    const unique = new Map(candidates.map((item) => [item.skill.toLowerCase(), item]));
    return [...unique.values()];
}

function computeMatchPercent({ matched, partial, missing, preferredMatchedCount, preferredTotal }) {
    const requiredTotal = matched.length + partial.length + missing.length;
    const requiredScore = requiredTotal === 0 ? 1 : (matched.length + partial.length * 0.5) / requiredTotal;
    if (!preferredTotal) return Math.round(requiredScore * 100);
    return Math.round((requiredScore * 0.8 + (preferredMatchedCount / preferredTotal) * 0.2) * 100);
}

function buildNarrative({ matched, partial, missing, compensating, requiredTotal }) {
    if (!requiredTotal) return 'This role has no listed required skills yet.';
    const parts = [`${matched.length}/${requiredTotal} core skill${requiredTotal === 1 ? '' : 's'} matched.`];
    if (missing.length) parts.push(`Missing: ${missing.join(', ')}.`);
    if (partial.length) parts.push(`Beginner-level: ${partial.join(', ')}.`);
    if (compensating.length && (missing.length || partial.length)) parts.push(`Compensating skill detected: ${compensating.map((item) => item.skill).slice(0, 3).join(', ')}.`);
    return parts.join(' ');
}

function computeSkillGap(studentSkills = [], job = {}) {
    const requiredSkills = job.requiredSkills || [];
    const preferredSkills = job.preferredSkills || [];
    const skillMap = buildSkillMap(studentSkills);
    const { matched, partial, missing } = classifyRequiredSkills(skillMap, requiredSkills);
    const preferredMatched = classifyPreferredSkills(skillMap, preferredSkills);
    const compensationMatches = findCompensatingSkills(studentSkills, missing, requiredSkills, preferredSkills);
    const compensating = compensationMatches.map((item) => item.skill);
    const compensationReasons = compensationMatches.map((item) => item.reason);
    const matchScore = computeMatchPercent({ matched, partial, missing, preferredMatchedCount: preferredMatched.length, preferredTotal: preferredSkills.length });
    return { matched, partial, missing, preferredMatched, compensating, compensationReasons, matchScore, narrative: buildNarrative({ matched, partial, missing, compensating: compensationMatches, requiredTotal: requiredSkills.length }) };
}

function rankJobsForStudent(studentSkills = [], jobs = []) {
    return (jobs || []).map((job) => ({ job, gap: computeSkillGap(studentSkills, job) })).sort((a, b) => b.gap.matchScore - a.gap.matchScore);
}

function computeInstitutionSkillMatrix(students = [], jobs = []) {
    const totalJobs = jobs.length, totalStudents = students.length;
    const demand = new Map();
    (jobs || []).forEach((job) => {
        const required = new Set((job.requiredSkills || []).map(normalizeSkillName));
        const preferred = new Set((job.preferredSkills || []).map(normalizeSkillName));
        new Set([...required, ...preferred]).forEach((skill) => {
            const key = skill.toLowerCase();
            const entry = demand.get(key) || { skill, requiredCount: 0, preferredCount: 0 };
            if (required.has(skill)) entry.requiredCount += 1;
            if (preferred.has(skill)) entry.preferredCount += 1;
            demand.set(key, entry);
        });
    });

    const readiness = new Map();
    (students || []).forEach((student) => {
        const seen = new Map();
        (student.profile?.skills || []).forEach((skill) => {
            if (!skill?.name) return;
            const canonical = normalizeSkillName(skill.name);
            const weight = PROFICIENCY_WEIGHTS[skill.level] || PROFICIENCY_WEIGHTS.Beginner;
            const key = canonical.toLowerCase();
            if (!seen.has(key) || weight > seen.get(key).weight) seen.set(key, { skill: canonical, weight });
        });
        seen.forEach(({ skill, weight }, key) => {
            const entry = readiness.get(key) || { skill, coverageCount: 0, weightTotal: 0 };
            entry.coverageCount += 1;
            entry.weightTotal += weight;
            readiness.set(key, entry);
        });
    });

    const allKeys = new Set([...demand.keys(), ...readiness.keys()]);
    const rows = [...allKeys].map((key) => {
        const d = demand.get(key), r = readiness.get(key);
        const requiredDemandPercent = totalJobs ? Math.round(((d?.requiredCount || 0) / totalJobs) * 100) : 0;
        const preferredDemandPercent = totalJobs ? Math.round(((d?.preferredCount || 0) / totalJobs) * 100) : 0;
        const combinedDemandPercent = totalJobs ? Math.round((((d?.requiredCount || 0) + (d?.preferredCount || 0)) / (totalJobs * 2)) * 100) : 0;
        const coveragePercent = totalStudents ? Math.round(((r?.coverageCount || 0) / totalStudents) * 100) : 0;
        const weightedReadiness = totalStudents ? Math.round(((r?.weightTotal || 0) / totalStudents) * 100) : 0;
        return {
            skill: d?.skill || r?.skill,
            requiredDemandPercent,
            preferredDemandPercent,
            combinedDemandPercent,
            demandPercent: requiredDemandPercent, // backwards-compatible field for existing views/API clients
            coveragePercent,
            weightedReadiness,
            readinessPercent: coveragePercent, // backwards-compatible field
            gapPercent: Math.max(0, requiredDemandPercent - weightedReadiness)
        };
    });
    return rows.sort((a, b) => b.gapPercent - a.gapPercent || b.requiredDemandPercent - a.requiredDemandPercent);
}

function aggregateCompetencyFeedback(feedbackList = []) {
    const keys = ['technicalSkills', 'problemSolving', 'communication', 'practicalApplication'];
    const totals = Object.fromEntries(keys.map((key) => [key, 0]));
    const counts = Object.fromEntries(keys.map((key) => [key, 0]));
    (feedbackList || []).forEach((feedback) => keys.forEach((key) => {
        const value = feedback.competencies?.[key];
        if (typeof value === 'number') { totals[key] += value; counts[key] += 1; }
    }));
    return Object.fromEntries(keys.map((key) => [key, counts[key] ? Math.round((totals[key] / counts[key]) * 10) / 10 : null]));
}

module.exports = { SKILL_LEVELS, PROFICIENCY_WEIGHTS, buildSkillMap, computeSkillGap, rankJobsForStudent, computeInstitutionSkillMatrix, aggregateCompetencyFeedback };
