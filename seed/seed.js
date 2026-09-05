require('dotenv').config();
const mongoose = require('mongoose');
const { seedSkills } = require('./skills');

(async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    await mongoose.connect(process.env.MONGODB_URI);
    await seedSkills();
    console.log('SkillChakra taxonomy seed complete.');
    await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
