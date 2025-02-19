const pool = require('../config/dbConfig');
const { allocateUserUnits } = require('../jobs/updateUnitsJob');

//Create family and for first time update the UnitsDue
exports.createFamily = async (req, res) => {
    const { userId, familyName, role, protagonistName, protagonistType } = req.body;

    if (!userId || !familyName || !role || !protagonistName || !protagonistType) {
        return res.status(400).json({ error: "All fields are required" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ✅ Step 1: Check if the User Exists
        const userCheck = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "Admin user does not exist." });
        }

        // ✅ Step 2: Insert Family (Initially, UnitsDue is 0)
        const familyResult = await client.query(
            'INSERT INTO families (name, admin_id, originalunitsdue, currentunitsdue) VALUES ($1, $2, $3, $3) RETURNING id',
            [familyName, userId, 0] // UnitsDue initially set to 0
        );
        const familyId = familyResult.rows[0].id;

        // ✅ Step 3: Update User Role
        await client.query(
            'UPDATE users SET family_id = $1, role = $2 WHERE id = $3',
            [familyId, role, userId]
        );

        // ✅ Step 4: Insert Protagonist
        const protagonistResult = await client.query(
            'INSERT INTO protagonists (family_id, name, type, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING created_at',
            [familyId, protagonistName, protagonistType]
        );

        const protagonistCreatedAt = new Date(protagonistResult.rows[0].created_at);

        // ✅ Step 5: If Protagonist Type is "Child", Calculate UnitsDue
        let unitsDue = 0;
        if (protagonistType.toLowerCase() === "child") {
            unitsDue = calculateUnitsDue(protagonistCreatedAt);
            console.log(`🔹 UnitsDue for child protagonist: ${unitsDue}`);

            // ✅ Update OriginalUnitsDue and CurrentUnitsDue in the families table
            await client.query(
                'UPDATE families SET originalunitsdue = $1, currentunitsdue = $1 WHERE id = $2',
                [unitsDue, familyId]
            );
        }

        await client.query('COMMIT');
        console.log(`✅ Family "${familyName}" created with ID: ${familyId}, UnitsDue: ${unitsDue}`);

        // ✅ Step 6: Allocate User Units After Family Creation (before sending response)
        if (unitsDue > 0) {
            console.log(`🔹 Allocating units for Family ID: ${familyId}`);
            await allocateUserUnits(familyId);  // ✅ Ensure completion before response
        }

        // ✅ Send response **after everything is completed**
        res.status(201).json({ message: "Family created successfully", familyId, unitsDue });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error creating family:", err);
        res.status(500).json({ error: "Failed to create family" });
    } finally {
        client.release();
    }
};

// Search for a family by ID or name and send it back to front end
exports.searchFamily = async (req, res) => {
    const { familyId, familyName } = req.query;

    if (!familyId && !familyName) {
        return res.status(400).json({ error: "Provide either familyId or familyName to search." });
    }

    try {
        let query;
        let values;

        if (familyId) {
            query = 'SELECT id, name, admin_id FROM families WHERE id = $1';
            values = [familyId];
        } else {
            query = 'SELECT id, name, admin_id FROM families WHERE name ILIKE $1';
            values = [`%${familyName}%`]; // Case-insensitive partial match
        }

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No matching families found." });
        }

        return res.status(200).json({ families: result.rows });

    } catch (err) {
        console.error("❌ Error searching families:", err);
        return res.status(500).json({ error: "Failed to search families" });
    }
};

// Join an existing family
exports.joinFamily = async (req, res) => {
    const { userId, familyId, role } = req.body;

    if (!userId || !familyId || !role) {
        return res.status(400).json({ error: "All fields (userId, familyId, role) are required." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ✅ Step 1: Check if the Family Exists
        const familyCheck = await client.query('SELECT * FROM families WHERE id = $1', [familyId]);

        if (familyCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Family not found." });
        }

        // ✅ Step 2: Check if User Already Belongs to a Family
        const userCheck = await client.query('SELECT family_id FROM users WHERE id = $1', [userId]);

        if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "User does not exist." });
        }

        if (userCheck.rows[0].family_id !== null) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "User is already part of a family." });
        }

        // ✅ Step 3: Assign User to Family with Role
        await client.query(
            'UPDATE users SET family_id = $1, role = $2 WHERE id = $3',
            [familyId, role, userId]
        );

        await client.query('COMMIT');

        console.log(`✅ User ${userId} joined Family ID: ${familyId} as ${role}`);
        res.status(200).json({ message: "User successfully joined the family." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error joining family:", err);
        res.status(500).json({ error: "Failed to join family" });
    } finally {
        client.release();
    }
};

function calculateUnitsDue(startDate) {
    const now = new Date();

    // Ensure we're calculating within the current month
    if (startDate.getMonth() !== now.getMonth() || startDate.getFullYear() !== now.getFullYear()) {
        return 0; // No calculation needed if the month changed
    }

    // Get the last day of the current month
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Calculate remaining hours from `startDate` to `lastDayOfMonth`
    const remainingMilliseconds = lastDayOfMonth - startDate;
    const remainingHours = Math.floor(remainingMilliseconds / (1000 * 60 * 60)); // Convert milliseconds to hours

    console.log(`🔹 Start Date: ${startDate}`);
    console.log(`🔹 Last Day of Month: ${lastDayOfMonth}`);
    console.log(`🔹 Remaining Hours: ${remainingHours}`);

    return remainingHours;
}



