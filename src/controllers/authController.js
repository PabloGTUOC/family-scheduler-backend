const pool = require('../config/dbConfig');

exports.registerUser = async (req, res) => {
    try {
        console.log("Received request to /register_user");
        console.log("Request body:", req.body);

        const { googleId, email, name } = req.body;

        if (!googleId || !email || !name) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        const userExists = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

        let isNewUser = false;
        let userId;

        if (userExists.rows.length > 0) {
            // ✅ Existing user, update last login
            userId = userExists.rows[0].id;
            await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
            console.log(`✅ User logged in: ID ${userId}`);
        } else {
            // ✅ New user, insert into DB
            const newUser = await pool.query(
                'INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING id',
                [googleId, email, name]
            );
            userId = newUser.rows[0].id;
            isNewUser = true;
            console.log(`🆕 User created: ID ${userId}`);
        }

        // ✅ Insert Login History Entry
        await pool.query(
            'INSERT INTO user_login_history (user_id, login_time) VALUES ($1, CURRENT_TIMESTAMP)',
            [userId]
        );

        return res.status(201).json({
            message: isNewUser ? "User created" : "User logged in",
            isNewUser,
            userId: userId.toString()
        });

    } catch (err) {
        console.error("❌ Error in registerUser:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
