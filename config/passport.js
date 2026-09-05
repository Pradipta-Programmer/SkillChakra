const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');

module.exports = function configurePassport(passport) {
    passport.use(new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async (email, password, done) => {
        try {
            const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
            if (!user || !(await bcrypt.compare(password, user.passwordHash))) return done(null, false, { message: 'Invalid email or password.' });
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }));
    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser((id, done) => User.findById(id).then((user) => done(null, user)).catch(done));
};
