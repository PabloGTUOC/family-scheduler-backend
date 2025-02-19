const { Pool } = require('pg');

const pool = new Pool({
    user: 'family_scheduler_user',
    host: 'localhost',
    database: 'family_scheduler_db',
    password: 'GMgm0301',
    port: 5432,
});

pool.connect()
    .then(() => console.log('Connected to PostgreSQL database'))
    .catch(err => {
        console.error('Database connection error:', err.stack);
        process.exit(1);
    });

module.exports = pool;
