const pool = require('../config/dbConfig');

exports.handleUserAuthentication = async (req, res) => {
    try {
        console.log("Received request to /auth_user");
        console.log("Request body:", req.body);

        const { googleId, email, name } = req.body;

        if (!googleId || !email || !name) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        // ✅ Step 1: Check if the user exists
        const userExists = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

        if (userExists.rows.length > 0) {
            const userId = userExists.rows[0].id;
            console.log(`✅ Existing user detected: ID ${userId}`);

            // ✅ Step 2: Log the user's login and fetch family & units
            const userData = await exports.loginExistingUser(userId);
            return res.status(200).json(userData);

        } else {
            // ✅ Step 3: Register new user
            const newUserId = await exports.registerNewUser(googleId, email, name);
            return res.status(201).json({
                message: "User created",
                isNewUser: true,
                userId: newUserId.toString()
            });
        }

    } catch (err) {
        console.error("❌ Error in handleUserAuthentication:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

// ✅ Step 4: Register a new user
exports.registerNewUser = async (googleId, email, name) => {
    try {
        const newUser = await pool.query(
            'INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING id',
            [googleId, email, name]
        );

        const userId = newUser.rows[0].id;
        console.log(`🆕 User created: ID ${userId}`);

        // ✅ Insert Login History Entry
        await pool.query(
            'INSERT INTO user_login_history (user_id, login_time) VALUES ($1, CURRENT_TIMESTAMP)',
            [userId]
        );

        return userId;

    } catch (err) {
        console.error("❌ Error registering user:", err);
        throw new Error("Failed to register user");
    }
};

// ✅ Step 5: Log user login and fetch family & unit status
exports.loginExistingUser = async (userId) => {
    try {
        // ✅ Log login history
        await pool.query(
            'INSERT INTO user_login_history (user_id, login_time) VALUES ($1, CURRENT_TIMESTAMP)',
            [userId]
        );
        console.log(`🔹 Login recorded for User ID ${userId}`);

        // ✅ Fetch user's personal unit balance
        const userBalanceResult = await pool.query(
            `SELECT UserUnitBalance, family_id FROM users WHERE id = $1`,
            [userId]
        );

        if (userBalanceResult.rows.length === 0) {
            console.log(`🔹 User ID ${userId} not found`);
            return {
                message: "User logged in",
                isNewUser: false,
                userId: userId.toString(),
                family: null,
                userUnitBalance: 0
            };
        }

        const userBalanceData = userBalanceResult.rows[0];
        const userUnitBalance = userBalanceData.userunitbalance || 0;
        const familyId = userBalanceData.family_id;

        // ✅ If user is not in a family, return only the user balance
        if (!familyId) {
            console.log(`🔹 User ID ${userId} is not part of any family`);
            return {
                message: "User logged in",
                isNewUser: false,
                userId: userId.toString(),
                family: null,
                userUnitBalance: userUnitBalance
            };
        }

        // ✅ Fetch family details separately
        const familyResult = await pool.query(
            `SELECT id, name, originalunitsdue, currentunitsdue FROM families WHERE id = $1`,
            [familyId]
        );

        if (familyResult.rows.length === 0) {
            console.log(`🔹 No family found for Family ID ${familyId}`);
            return {
                message: "User logged in",
                isNewUser: false,
                userId: userId.toString(),
                family: null,
                userUnitBalance: userUnitBalance
            };
        }

        const familyData = familyResult.rows[0];

        return {
            message: "User logged in",
            isNewUser: false,
            userId: userId.toString(),
            family: {
                familyId: familyData.id,
                familyName: familyData.name,
                originalUnitsDue: familyData.originalunitsdue,
                currentUnitsDue: familyData.currentunitsdue
            },
            userUnitBalance: userUnitBalance
        };

    } catch (err) {
        console.error("❌ Error logging user login:", err);
        throw new Error("Failed to log user login and fetch data");
    }
};
