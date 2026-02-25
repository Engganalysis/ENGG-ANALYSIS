const { connectToDb } = require('./db');
async function patch() {
    try {
        const db = await connectToDb();
        console.log("Starting DB Patch...");

        // 1. Fix Test_Type (P1_P2)
        const fixTT = await db.request().query("UPDATE ENGG_RESULT SET P1_P2 = SUBSTRING_INDEX(Test, '-', 1) WHERE P1_P2 IN ('1','2','3','4')");
        console.log(`Fixed Test Types: ${fixTT.rowsAffected || 'done'}`);

        // 2. Fill missing Max Marks for WTM (Mains)
        const fixWTM = await db.request().query("UPDATE ENGG_RESULT SET Max_Tot = 300, Max_Mat = 100, Max_Phy = 100, Max_Che = 100 WHERE Max_Tot IS NULL AND Test LIKE 'WTM%'");
        console.log(`Patched WTM Max Marks: ${fixWTM.rowsAffected || 'done'}`);

        // 3. Fill missing Max Marks for WTA (Adv)
        const fixWTA = await db.request().query("UPDATE ENGG_RESULT SET Max_Tot = 180, Max_Mat = 60, Max_Phy = 60, Max_Che = 60 WHERE Max_Tot IS NULL AND Test LIKE 'WTA%'");
        console.log(`Patched WTA Max Marks: ${fixWTA.rowsAffected || 'done'}`);

        process.exit(0);
    } catch (e) {
        console.error("Patch Error:", e);
        process.exit(1);
    }
}
patch();
