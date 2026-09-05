# SkillChakra

SkillChakra is an Express, MongoDB, and Passport.js prototype connecting students, colleges, and companies.



## SkillChakra architecture notes

SkillChakra is organized around a closed skill-intelligence loop across Student, Company, and College workspaces. The matching engine is taxonomy-aware and separates required/preferred demand, student coverage, and weighted proficiency readiness.

### Demo lifecycle

1. Student completes profile and links an institution.
2. Open roles are ranked by live skill compatibility; missing and compensating competencies are shown.
3. Application is blocked when the role's minimum CGPA is not met.
4. Company reviews candidates ranked by the same live skill-fit percentage shown to the candidate.
5. Selecting a candidate creates an active `Internship` record while hiring feedback is stored separately.
6. Company marks the internship completed, then submits structured competency evaluation.
7. Student profile surfaces employer-validated competencies.
8. College dashboard aggregates completed-internship feedback and reports required/preferred demand, skill coverage, weighted readiness, and institutional gaps.

### Environment

Copy `.env.example` to `.env` and set a real MongoDB connection string and a strong session secret. `.env` and `node_modules/` are intentionally ignored and must not be included in source archives.

Seed the canonical skill taxonomy with:

```bash
node seed/seed.js
```
