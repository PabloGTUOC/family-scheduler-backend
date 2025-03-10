const pool = require('../config/dbConfig');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');


exports.createActivity = async (req, res) => {
    try {
        console.log("Received request to /create_activity");
        console.log("Request body:", req.body);

        const { userId, familyId, title, description, activityType, startTime, duration } = req.body;

        // ✅ Step 1: Validate input fields
        if (!userId || !title || !activityType || !startTime || !duration) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        // ✅ Step 2: Validate activity type
        if (!['personal', 'family'].includes(activityType)) {
            return res.status(400).json({ error: "Invalid activity type. Use 'personal' or 'family'." });
        }

        // ✅ Step 3: Enforce start time rules (must be at full hour or half-hour)
        const startDateTime = new Date(startTime);
        const minutes = startDateTime.getMinutes();
        if (minutes !== 0 && minutes !== 30) {
            return res.status(400).json({ error: "Start time must be at full hour (e.g., 16:00) or half-hour (e.g., 16:30)." });
        }

        // ✅ Step 4: Ensure minimum duration of 1 hour
        const units = Math.max(1, Math.ceil(duration));
        const endDateTime = new Date(startDateTime.getTime() + units * 60 * 60 * 1000); // Add duration in hours

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // ✅ Step 5: Check for overlapping activities
            const overlapCheck = await client.query(
                `SELECT id FROM activities 
                 WHERE user_id = $1 
                 AND ((start_time < $3 AND end_time > $2))`,
                [userId, startDateTime, endDateTime]
            );

            if (overlapCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                console.log(`❌ Activity overlap detected for User ID ${userId} from ${startDateTime} to ${endDateTime}`);
                return res.status(400).json({ error: "You already have an activity in this time slot." });
            }

            // ✅ Step 6: Insert the activity into the database
            const activityResult = await client.query(
                `INSERT INTO activities (user_id, family_id, title, description, activity_type, start_time, end_time, units) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [userId, familyId || null, title, description, activityType, startDateTime, endDateTime, units]
            );

            const activityId = activityResult.rows[0].id;
            console.log(`✅ Activity created: ID ${activityId}`);

            // ✅ Step 7: If it's a family activity, adjust the unit balance
            if (activityType === 'family') {
                await client.query(
                    `UPDATE users SET UserUnitBalance = UserUnitBalance + $1 WHERE id = $2`,
                    [units, userId]
                );
                console.log(`🔹 Reduced User ID ${userId}'s balance by ${units} units`);

                if (familyId) {
                    await client.query(
                        `UPDATE families SET CurrentUnitsDue = CurrentUnitsDue - $1 WHERE id = $2`,
                        [units, familyId]
                    );
                    console.log(`🔹 Updated Family ID ${familyId}, decreasing CurrentUnitsDue by ${units}`);
                }
            }

            await client.query('COMMIT');
            return res.status(201).json({ message: "Activity created successfully", activityId });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error("❌ Error creating activity:", err);
            return res.status(500).json({ error: "Failed to create activity" });
        } finally {
            client.release();
        }

    } catch (err) {
        console.error("❌ Error processing request:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

exports.deleteActivity = async (req, res) => {
    try {
        console.log("Received request to /delete_activity");
        console.log("Request params:", req.params);

        // Extract the activity ID from request parameters
        const { activityId } = req.params;

        // Validate input
        if (!activityId) {
            console.error("❌ Missing activity ID.");
            return res.status(400).json({ error: "Missing activity ID" });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // ✅ Step 1: Check if the activity exists
            const activityCheck = await client.query(
                `SELECT id, user_id, family_id, activity_type, units FROM activities WHERE id = $1`,
                [activityId]
            );

            if (activityCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                console.error(`❌ No activity found with ID ${activityId}`);
                return res.status(404).json({ error: "Activity not found" });
            }

            const activity = activityCheck.rows[0];

            // ✅ Step 2: Delete the activity
            await client.query(`DELETE FROM activities WHERE id = $1`, [activityId]);
            console.log(`✅ Deleted activity with ID ${activityId}`);

            // ✅ Step 3: Adjust balances if it's a family activity
            if (activity.activity_type === 'family') {
                const { user_id: userId, family_id: familyId, units } = activity;

                // Adjust user's unit balance
                await client.query(
                    `UPDATE users SET UserUnitBalance = UserUnitBalance - $1 WHERE id = $2`,
                    [units, userId]
                );
                console.log(`🔹 Adjusted User ID ${userId}'s balance by -${units} units`);

                // Adjust family unit balance (if applicable)
                if (familyId) {
                    await client.query(
                        `UPDATE families SET CurrentUnitsDue = CurrentUnitsDue + $1 WHERE id = $2`,
                        [units, familyId]
                    );
                    console.log(`🔹 Adjusted Family ID ${familyId}, increasing CurrentUnitsDue by ${units}`);
                }
            }

            await client.query('COMMIT');
            return res.status(200).json({ message: "Activity deleted successfully" });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error("❌ Error deleting activity:", err);
            return res.status(500).json({ error: "Failed to delete activity" });
        } finally {
            client.release();
        }

    } catch (err) {
        console.error("❌ Error processing request:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
