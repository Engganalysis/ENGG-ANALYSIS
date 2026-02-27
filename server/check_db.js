const { connectToDb } = require('./db');

async function checkData() {
    try {
        const pool = await connectToDb();
        console.log("Checking ERP_REPORT_ENGG table structure and data...");

        // Check columns
        const colsResult = await pool.request().query("SHOW COLUMNS FROM ERP_REPORT_ENGG");
        console.log("Columns:", colsResult.recordset.map(c => c.Field).join(', '));

        // Count rows
        const countResult = await pool.request().query("SELECT COUNT(*) as total FROM ERP_REPORT_ENGG");
        console.log("Total Rows:", countResult.recordset[0].total);

        // Check distinct branches
        const branchesResult = await pool.request().query("SELECT DISTINCT Branch FROM ERP_REPORT_ENGG");
        console.log("Distinct Branches:", branchesResult.recordset);

        process.exit(0);
    } catch (err) {
        console.error("Error checking data:", err);
        process.exit(1);
    }
}

checkData();
