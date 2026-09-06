const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');
const { findOrCreateInstitution } = require('../utils/institutions');

const router = express.Router();

function requireDatabase(req, res, next) {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: 'Authentication is temporarily unavailable. Configure MongoDB in .env and restart the server.' });
    next();
}

function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email, role: user.role, profile: user.profile };
}

router.post('/signup', requireDatabase, async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !['student', 'college', 'company'].includes(role)) return res.status(400).json({ error: 'Name, email, password, and a valid role are required.' });
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        const normalizedEmail = email.toLowerCase().trim();
        if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: 'An account with this email already exists.' });
        let profile = {};
        if (role === 'college') {
            const institutionName = String(req.body.institutionName || '').trim();
            if (!institutionName) return res.status(400).json({ error: 'institutionName is required for college accounts.' });
            const institution = await findOrCreateInstitution(institutionName);
            profile.institutionId = institution.id;
            profile.college = institution.name;
        }
        if (role === 'student') {
            const collegeName = String(req.body.college || '').trim();
            if (collegeName) {
                const institution = await findOrCreateInstitution(collegeName);
                profile.institutionId = institution.id;
                profile.college = institution.name;
            }
        }
        const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12), role, profile });
        req.login(user, (error) => {
            if (error) return next(error);
            return res.status(201).json({ user: publicUser(user) });
        });
    } catch (error) {
        next(error);
    }
});

router.post('/login', requireDatabase, (req, res, next) => {
    passport.authenticate('local', (error, user, info) => {
        if (error) return next(error);
        if (!user) return res.status(401).json({ error: info?.message || 'Invalid email or password.' });
        if (req.body.role && req.body.role !== user.role) return res.status(403).json({ error: `This account is registered as a ${user.role}.` });
        req.logIn(user, (loginError) => loginError ? next(loginError) : res.json({ user: publicUser(user) }));
    })(req, res, next);
});

router.get('/session', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
router.post('/logout', (req, res, next) => req.logout((error) => error ? next(error) : req.session.destroy(() => res.status(204).end())));

module.exports = router;
