require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport = require('passport');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const configurePassport = require('./config/passport');
const authRoutes = require('./routes/auth');
const protectedRoutes = require('./routes/protected');
const pageRoutes = require('./routes/pages');

const app = express();
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI;
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    throw new Error('SESSION_SECRET must be set to a strong secret (32+ characters) in production.');
}
app.locals.databaseReady = false;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

if (!mongoUri) {
    console.warn('MONGODB_URI is not set. Add it to .env before using authentication.');
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }));

if (mongoUri) {
    const sessionOptions = {
        secret: process.env.SESSION_SECRET || 'development-only-change-me',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
    };
    if (process.env.USE_MONGO_SESSION === 'true') sessionOptions.store = MongoStore.create({ mongoUrl: mongoUri });
    app.use(session(sessionOptions));
    configurePassport(passport);
    app.use(passport.initialize());
    app.use(passport.session());
} else {
    app.use(session({ secret: process.env.SESSION_SECRET || 'development-only-change-me', resave: false, saveUninitialized: false }));
    configurePassport(passport);
    app.use(passport.initialize());
    app.use(passport.session());
}

app.use('/api/auth', authRoutes);
app.use('/api', protectedRoutes);
app.use(express.static(path.join(__dirname)));
app.use('/', pageRoutes);
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((error, req, res, next) => {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || 'Something went wrong.' });
});

async function start() {
    app.listen(port, () => console.log(`SkillChakra running at http://localhost:${port}`));
    if (mongoUri) {
        try {
            await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
            app.locals.databaseReady = true;
            console.log('MongoDB connected.');
        } catch (error) {
            console.error('MongoDB connection failed:', error.message);
            console.error('The site is running, but sign in and data actions need a working MONGODB_URI.');
        }
    }
}

start().catch((error) => {
    console.error('Unable to start SkillChakra:', error.message);
    process.exit(1);
});
