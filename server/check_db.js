const { connectToDb } = require('./db');
async function check() {
    try {
        const pool = await connectToDb();
        const res = await pool.request().query("SELECT CAMPUS_NAME, Batch, Test, COUNT(*) as count FROM ENGG_RESULT WHERE Batch LIKE '%Adv%' GROUP BY CAMPUS_NAME, Batch, Test ORDER BY count DESC");
        console.log(JSON.stringify(res.recordset, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
