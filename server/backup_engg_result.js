const { connectToDb } = require('./db');

/**
 * Creates a timestamped backup of the ENGG_RESULT table.
 * Usage: node server/backup_engg_result.js
 */
async function manageBackup() {
    let pool;
    try {
        const actionArg = process.argv.find(a => a.startsWith('--action='))?.split('=')[1] || 'backup';
        pool = await connectToDb();
        const backupTableName = `ENGG_RESULT_BACKUP`;

        if (actionArg === 'backup') {
            console.log(`Refreshing backup: ${backupTableName}...`);
            await pool.request().query(`DROP TABLE IF EXISTS \`${backupTableName}\``);
            await pool.request().query(`CREATE TABLE \`${backupTableName}\` AS SELECT * FROM ENGG_RESULT`);
            const countRes = await pool.request().query(`SELECT COUNT(*) as count FROM \`${backupTableName}\``);
            console.log(`✅ Latest backup created successfully! (${countRes.recordset[0].count} rows)`);
        } else if (actionArg === 'cleanup') {
            console.log(`Deleting backup table: ${backupTableName}...`);
            await pool.request().query(`DROP TABLE IF EXISTS \`${backupTableName}\``);
            console.log(`✅ Backup table deleted from database.`);
        }

    } catch (err) {
        console.error("❌ Database Operation Failed:", err.message);
    } finally {
        if (pool) await pool.end();
        process.exit(0);
    }
}

manageBackup();
