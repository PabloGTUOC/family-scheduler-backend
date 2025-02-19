const pool = require('../config/dbConfig');

async function logoutUser(req, res) {
    const userId = req.query.userId;

    if (!userId) {
        console.log('❌ User ID not provided for logout.');
        return res.status(400).json({ error: 'User ID is required for logout.' });
    }

    try {
        const result = await pool.query(
            'SELECT id FROM user_login_history WHERE user_id = $1 ORDER BY login_time DESC LIMIT 1',
            [userId]
        );

        if (result.rows.length > 0) {
            const loginEntryId = result.rows[0].id;

            // ✅ Step 1: Update `logout_time`
            await pool.query(
                'UPDATE user_login_history SET logout_time = CURRENT_TIMESTAMP WHERE id = $1',
                [loginEntryId]
            );

            // ✅ Step 2: Correctly store `session_duration` as INTERVAL
            await pool.query(
                `UPDATE user_login_history 
                 SET session_duration = (logout_time - login_time)
                 WHERE id = $1`,
                [loginEntryId]
            );

            console.log(`✅ Logout updated for user: ${userId}, session duration calculated.`);
        } else {
            console.log('⚠️ No login entry found for user.');
        }

        res.status(200).json({ message: 'Logout information updated successfully.' });
    } catch (err) {
        console.error('❌ Error updating logout information:', err);
        res.status(500).json({ error: 'Error updating logout information' });
    }
}

module.exports = { logoutUser };
