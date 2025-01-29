const express = require('express');
const { Pool } = require('pg');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser'); // Add body-parser
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware: Logging
app.use(morgan('dev'));

// Middleware: CORS for API requests
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
}));

// Middleware: Handle preflight CORS requests
app.options('*', cors());

// Middleware: Use body-parser to parse urlencoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

// PostgreSQL Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test Database Connection
(async () => {
    try {
        const client = await pool.connect();
        console.log('Connected to PostgreSQL database');
        client.release();
    } catch (err) {
        console.error('Database connection error:', err.stack);
        process.exit(1); // Exit with error code 1 if database connection fails
    }
})();

// Function to record user login
async function recordUserLogin(userId) {
    let client = null;
    try {
        client = await pool.connect(); // Get a connection from the pool
        await client.query('BEGIN'); // Start a transaction

        // Update last_login in the users table
        await client.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userId]);

        // Insert a new entry into user_login_history
        await client.query('INSERT INTO user_login_history (user_id, login_time) VALUES ($1, CURRENT_TIMESTAMP)', [userId]);

        await client.query('COMMIT'); // Commit the transaction
        console.log('User login recorded for user ID:', userId);
    } catch (err) {
        await client.query('ROLLBACK'); // Rollback in case of error
        console.error('Error recording user login:', err);
    } finally {
        if (client) {
            client.release(); // Release the connection back to the pool
        }
    }
}

// Routes
app.get('/', (req, res) => {
    res.send('Welcome to Family Scheduler Backend!');
});

// Route to register or update user info after Google Sign-In from Flutter
app.post('/register_user', async (req, res) => {
    console.log('Request body:', req.body); // Log the entire request body

    // Destructure directly from req.body
    const { googleId, email, name } = req.body;

    console.log('Extracted data:', { googleId, email, name }); // Log extracted data

    try {
        // Check if the user already exists
        const userExists = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

        if (userExists.rows.length > 0) {
            // User exists, update last login
            const userId = userExists.rows[0].id;
            await recordUserLogin(userId);
            console.log("User logged:", userId);
            res.status(200).json({ message: 'User logged in', userId: userId });
        } else {
            // Create a new user
            const newUser = await pool.query(
                'INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING *',
                [googleId, email, name]
            );
            const userId = newUser.rows[0].id;
            await recordUserLogin(userId);
            console.log("User created and logged:", userId);
            res.status(201).json({ message: 'User created and logged in', userId: userId });
        }
    } catch (err) {
        console.error('Error registering user:', err);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// Logout Route (Simplified - only to update the logout time in DB)
app.get('/logout', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        console.log('User ID not provided for logout.');
        return res.status(400).send('User ID is required for logout.');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            'SELECT id FROM user_login_history WHERE user_id = $1 ORDER BY login_time DESC LIMIT 1',
            [userId]
        );

        if (result.rows.length > 0) {
            const loginEntryId = result.rows[0].id;

            await client.query(
                'UPDATE user_login_history SET logout_time = CURRENT_TIMESTAMP WHERE id = $1',
                [loginEntryId]
            );

            await client.query(
                `UPDATE user_login_history
         SET session_duration = logout_time - login_time
         WHERE id = $1`,
                [loginEntryId]
            );

            console.log('Logout time and session duration updated successfully.');
        } else {
            console.log('No login entry found for user.');
        }

        await client.query('COMMIT');
        res.status(200).send('Logout information updated successfully.');
    } catch (updateErr) {
        await client.query('ROLLBACK');
        console.error('Error updating logout information:', updateErr);
        return res.status(500).send('Error updating logout information');
    } finally {
        client.release();
    }
});

// Start the Server
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Backend running on http://0.0.0.0:${port}`);
});

// Handle server shutdown gracefully
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server shut down.');
        pool.end(() => {
            console.log('Database pool closed.');
            process.exit(0);
        });
    });
});