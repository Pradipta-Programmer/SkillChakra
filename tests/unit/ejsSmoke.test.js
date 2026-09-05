const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const root = path.join(__dirname, '../../views');
const files = [
    'student/dashboard.ejs', 'student/profile.ejs', 'student/opportunities.ejs',
    'student/feedback.ejs', 'company/candidates.ejs', 'college/dashboard.ejs'
];
files.forEach((file) => ejs.compile(fs.readFileSync(path.join(root, file), 'utf8')));
console.log('EJS smoke tests passed');
