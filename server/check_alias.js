const { connectToDb } = require('./db');

async function checkAlias() {
    try {
        const pool = await connectToDb();
        const res = await pool.request().query('SELECT DISTINCT TRIM(Branch) as Result FROM ERP_REPORT_ENGG LIMIT 1');
        console.log("Recordset with alias:", res.recordset);

        process.exit(0);
    } catch (err) {
        console.error("Error checking alias:", err);
        process.exit(1);
    }
}

checkAlias();
