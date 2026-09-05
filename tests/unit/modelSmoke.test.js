const assert = require('assert');
const User = require('../../models/User');
const Institution = require('../../models/Institution');
const Internship = require('../../models/Internship');
const Skill = require('../../models/Skill');
const Feedback = require('../../models/Feedback');

assert.strictEqual(User.schema.path('profile.institutionId').options.ref, 'Institution');
assert.deepStrictEqual(Internship.schema.path('status').enumValues, ['planned', 'active', 'completed', 'cancelled']);
assert.strictEqual(Skill.schema.path('canonicalName').options.unique, true);
assert.ok(Feedback.schema.path('internship'));
assert.deepStrictEqual(Feedback.schema.path('type').enumValues, ['hiring_decision', 'internship_evaluation']);
console.log('model smoke tests passed');
