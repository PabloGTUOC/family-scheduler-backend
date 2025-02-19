const pool = require('../config/dbConfig');
const cron = require('node-cron');

function calculateMonthlyUnits() {
    return 24 * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
}

async function updateUnitsDue() {
    console.log("🔹 Running Monthly UnitsDue Update...");

    try {
        const unitsForMonth = calculateMonthlyUnits();

        // ✅ Update `OriginalUnitsDue` and `CurrentUnitsDue`
        const updateQuery = `
            UPDATE families
            SET OriginalUnitsDue = $1, CurrentUnitsDue = $1
            RETURNING id
        `;
        const families = await pool.query(updateQuery, [unitsForMonth]);

        console.log(`✅ Updated OriginalUnitsDue & CurrentUnitsDue for all families to ${unitsForMonth}`);

        // ✅ Automatically allocate units to users
        for (const family of families.rows) {
            console.log(`🔹 Allocating UnitsDue for Family ID: ${family.id}`);
            await allocateUserUnits(family.id);
        }

    } catch (err) {
        console.error("❌ Error updating UnitsDue:", err);
    }
}

// ✅ Ensure `allocateUserUnits` is properly exported
async function allocateUserUnits(familyId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ✅ Step 1: Get `OriginalUnitsDue` for the family
        const familyResult = await client.query(
            'SELECT originalunitsdue FROM families WHERE id = $1',
            [familyId]
        );

        if (familyResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.log(`❌ Family ID ${familyId} not found.`);
            return;
        }

        let originalUnitsDue = familyResult.rows[0].originalunitsdue;
        console.log(`🔹 OriginalUnitsDue for Family ID ${familyId}: ${originalUnitsDue}`);

        if (originalUnitsDue === 0) {
            await client.query('ROLLBACK');
            console.log(`✅ No units to allocate for Family ID ${familyId}`);
            return;
        }

        // ✅ Step 2: Get all users in the family
        const usersResult = await client.query('SELECT id FROM users WHERE family_id = $1', [familyId]);
        const users = usersResult.rows;

        if (users.length === 0) {
            await client.query('ROLLBACK');
            console.log(`❌ No users found for Family ID ${familyId}`);
            return;
        }

        // ✅ Step 3: Split `OriginalUnitsDue` Equally
        const unitsPerUser = Math.floor(originalUnitsDue / users.length);
        const remainder = originalUnitsDue % users.length;

        for (let i = 0; i < users.length; i++) {
            let userUnits = -unitsPerUser; // Opposite sign

            if (i < remainder) {
                userUnits -= 1; // Distribute remainder
            }

            // ✅ Step 4: Set each user's balance to `-OriginalUnitsDue`
            await client.query('UPDATE users SET UserUnitBalance = $1 WHERE id = $2',
                [userUnits, users[i].id]
            );
            console.log(`✅ Assigned ${userUnits} units to User ID ${users[i].id}`);
        }

        await client.query('COMMIT');
        console.log(`✅ Successfully allocated OriginalUnitsDue for Family ID ${familyId}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error allocating user units:", err);
    } finally {
        client.release();
    }
}

// ✅ Correctly export both functions
module.exports = { updateUnitsDue, allocateUserUnits };
