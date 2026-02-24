const { connectToDb } = require('./db');

async function fixCampusName() {
    let pool;
    try {
        pool = await connectToDb();

        // Use the wrapper's query method
        const res = await pool.request().query("SELECT COUNT(*) as count FROM ENGG_RESULT WHERE CAMPUS_NAME LIKE '%MARTHAHALLY%'");
        const count = res.recordset[0].count;
        console.log(`Found ${count} records with "MARTHAHALLY"`);

        if (count > 0) {
            console.log("Updating records to MARTHAHALLI...");
            // Run the update
            await pool.request().query("UPDATE ENGG_RESULT SET CAMPUS_NAME = REPLACE(CAMPUS_NAME, 'MARTHAHALLY', 'MARTHAHALLI') WHERE CAMPUS_NAME LIKE '%MARTHAHALLY%'");
            console.log(`Update complete.`);
        }

    } catch (err) {
        console.error("Error updating database:", err);
    }
    // No .end() because it's a shared pool in the app usually, but we don't have it exported easily.
    // However, for this script, we can just let it exit.
}

fixCampusName();
