const { connectToDb } = require('./db');
async function check() {
    try {
        const db = await connectToDb();
        const res = await db.request().query("SELECT Max_Tot, Max_Mat, Max_Phy, Max_Che FROM ENGG_RESULT WHERE Test = 'WTM-03' LIMIT 1");
        console.log('WTM-03 Max Marks:', res.recordset);

        const ttRes = await db.request().query("SELECT DISTINCT P1_P2 FROM ENGG_RESULT WHERE P1_P2 IN ('1','2','3','4')");
        console.log('Bad Test Types:', ttRes.recordset);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
