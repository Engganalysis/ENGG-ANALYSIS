const { connectToDb } = require('./db');

/**
 * Creates a timestamped backup of the ENGG_RESULT table.
 * Usage: node server/backup_engg_result.js
 */
async function backupTable() {
    try {
        const pool = await connectToDb();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupTableName = `ENGG_RESULT_BACKUP_${timestamp}`;

        console.log(`Creating backup: ${backupTableName}...`);

        // TiDB doesn't support CREATE TABLE ... SELECT directly in some versions,
        // but it definitely supports creating the structure and then inserting.

        // 1. Get Schema
        const columnsRes = await pool.request().query("DESCRIBE ENGG_RESULT");
        const columns = columnsRes.recordset.map(c => {
            let def = `\`${c.Field}\` ${c.Type}`;
            if (c.Null === 'NO') def += ' NOT NULL';
            return def;
        }).join(', ');

        // 2. Create Table
        await pool.request().query(`CREATE TABLE \`${backupTableName}\` (${columns})`);

        // 3. Copy Data
        await pool.request().query(`INSERT INTO \`${backupTableName}\` SELECT * FROM ENGG_RESULT`);

        const countRes = await pool.request().query(`SELECT COUNT(*) as count FROM \`${backupTableName}\``);
        console.log(`✅ Backup created successfully! Table: ${backupTableName} (${countRes.recordset[0].count} rows)`);

    } catch (err) {
        console.error("❌ Backup Failed:", err.message);
    }
    process.exit(0);
}

backupTable();
