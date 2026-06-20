const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    host: process.env.DB_SERVER || process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 4000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: true // TiDB / Cloud MySQL usually requires SSL
    }
};

let poolRaw;
let poolWrapper;

async function connectToDb() {
    if (!poolRaw) {
        try {
            console.log(`Connecting to TiDB at ${config.host}:${config.port}...`);
            poolRaw = mysql.createPool(config);

            // Test connection
            const connection = await poolRaw.getConnection();
            console.log("Connected to TiDB (MySQL) Successfully!");
            connection.release();

            // Create a wrapper to mimic strict MSSQL interface used in index.js
            poolWrapper = {
                request: () => ({
                    query: async (sqlQuery) => {
                        try {
                            // Ensure query ends with semicolon? Not strictly needed but good practice
                            const [rows] = await poolRaw.query(sqlQuery);
                            return { recordset: rows };
                        } catch (err) {
                            console.error("SQL Error:", err.message);
                            throw err;
                        }
                    },
                    input: () => {/* No-op for now as we don't use input parameters in current index.js */ },
                    execute: async (proc) => { /* No-op */ }
                })
            };

            // Automatically sync custom heading if passed via environment variable in bat file
            if (process.env.CUSTOM_HEADING) {
                const headingVal = process.env.CUSTOM_HEADING.trim();
                console.log(`[Custom Heading Sync] Detected: "${headingVal}". Syncing to database...`);
                try {
                    // Create table if not exists
                    await poolRaw.query(`
                        CREATE TABLE IF NOT EXISTS ENGG_SETTINGS (
                            setting_key VARCHAR(255) PRIMARY KEY,
                            setting_value TEXT
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                    `);
                    
                    // Insert or update
                    await poolRaw.query(`
                        INSERT INTO ENGG_SETTINGS (setting_key, setting_value) 
                        VALUES ('custom_heading', ?) 
                        ON DUPLICATE KEY UPDATE setting_value = ?
                    `, [headingVal, headingVal]);
                    console.log("[Custom Heading Sync] Successfully synced to database!");
                } catch (err) {
                    console.error("[Custom Heading Sync] Failed to sync custom heading to database:", err.message);
                }
            }

        } catch (err) {
            console.error("Database Connection Failed! Config:", { ...config, password: '***' });
            console.error(err);
            poolRaw = null;
            throw err;
        }
    }
    return poolWrapper;
}

module.exports = {
    connectToDb,
    sql: null // Deprecated mssql object
};
