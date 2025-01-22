const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = 3000;

// Logs incoming requests
const morgan = require('morgan');
app.use(morgan('dev'));

//CORRS for Flutter front-end:
const cors = require('cors');
app.use(cors({
    origin: 'http://localhost:3001', // Replace with the Flutter app's URL
    credentials: true, // Allows session cookies to be sent
}));


// PostgreSQL database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, // Enable SSL for production
});

// Test the database connection
(async () => {
    try {
        const client = await pool.connect();
        console.log('Connected to PostgreSQL database');
        client.release(); // Release the client back to the pool
    } catch (err) {
        console.error('Database connection error:', err.stack);
        process.exit(1); // Exit the process if the database connection fails
    }
})();

// Export the pool for use in other parts of the app
module.exports = pool;

// Middleware
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration for Google OAuth
console.log({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
});

// Passport configuration for Google OAuth
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,

}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user exists in the database
        const user = await pool.query(
            'SELECT * FROM users WHERE google_id = $1',
            [profile.id]
        );

        if (user.rows.length > 0) {
            // User exists, return the user
            done(null, user.rows[0]);
        } else {
            // Insert new user into the database
            const newUser = await pool.query(
                'INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING *',
                [profile.id, profile.emails[0].value, profile.displayName]
            );
            done(null, newUser.rows[0]);
        }
    } catch (err) {
        done(err, null);
    }
}));

// Serialize and deserialize user (for session handling)
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        done(null, user.rows[0]);
    } catch (err) {
        done(err, null);
    }
});

// Routes
app.get('/', (req, res) => {
    res.send('Welcome to Family Scheduler Backend!');
});

// Google OAuth routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        res.send('Authentication successful!');
    }
);
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.clearCookie('connect.sid'); // Clear session cookie
        res.send('Logged out successfully!');
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
