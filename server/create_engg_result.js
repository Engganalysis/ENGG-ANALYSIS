const { connectToDb } = require('./db');

async function createEnggResultTable() {
    let pool;
    try {
        pool = await connectToDb();
        console.log("Connected to TiDB. Creating ENGG_RESULT table...");

        const createSql = `
            CREATE TABLE ENGG_RESULT (
                Test VARCHAR(255) NOT NULL,
                DATE DATE NOT NULL,
                STUD_ID VARCHAR(255) NOT NULL,
                NAME_OF_THE_STUDENT VARCHAR(255) NOT NULL,
                CAMPUS_NAME VARCHAR(255) NOT NULL,
                Total INT,
                Total_Per INT,
                AIR INT,
                MAT INT,
                MAT_Per INT,
                M_Rank INT,
                PHY INT,
                PHY_Per INT,
                P_Rank INT,
                CHE INT,
                CHE_Per INT,
                C_Rank INT,
                Batch VARCHAR(255),
                Year VARCHAR(255),
                Top_ALL VARCHAR(255),
                P1_P2 VARCHAR(255),
                Best_of_three VARCHAR(255),
                Below_1000_Target VARCHAR(255),
                Jee_Mains_Target VARCHAR(255)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `;

        await pool.request().query(createSql);
        console.log("✅ Table 'ENGG_RESULT' created successfully.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error creating table:", err.message);
        process.exit(1);
    }
}

createEnggResultTable();
