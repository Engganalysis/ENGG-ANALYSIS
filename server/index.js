const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { connectToDb, sql } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const fs = require('fs');

const logQuery = (query, params) => {
    const logPath = path.join(__dirname, 'query_debug.log');
    const logEntry = `[${new Date().toISOString()}]\nQUERY: ${query}\nPARAMS: ${JSON.stringify(params)}\n---\n`;
    fs.appendFileSync(logPath, logEntry);
};

app.use(cors());
app.use(express.json());

// SERVE FRONTEND STATIC FILES
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Simple In-Memory Cache
const cache = {
    store: new Map(),
    get(key) {
        const item = this.store.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.store.delete(key);
            return null;
        }
        return item.data;
    },
    set(key, data, ttlSeconds = 600) { // Default 10 mins
        this.store.set(key, {
            data,
            expiry: Date.now() + (ttlSeconds * 1000)
        });
    }
};

// Request logging middleware
app.use((req, res, next) => {
    const logLine = `[${new Date().toISOString()}] ${req.method} ${req.url}\n`;
    fs.appendFileSync(path.join(__dirname, 'access.log'), logLine);
    console.log(`[${new Date().toISOString()}] Incoming ${req.method} request to ${req.url}`);
    next();
});



// Helper to build WHERE clause
// Helper to build WHERE clause
const buildWhereClause = (req, options = {}) => {
    const { campus, stream, test, testType, topAll, studentSearch, quickSearch } = req.query;
    let clauses = [];

    const addClause = (field, value) => {
        if (!value || value === 'All' || value === '__ALL__') return;
        const valArray = Array.isArray(value) ? value : [value];
        const cleanValues = valArray
            .map(v => v ? v.toString().trim().toUpperCase() : '')
            .filter(v => v !== '' && v !== '__ALL__')
            .map(v => v.replace(/'/g, "''"));
        if (cleanValues.length === 0) return;
        const list = cleanValues.map(v => `'${v}'`).join(',');
        clauses.push(`UPPER(TRIM(${field})) IN (${list})`);
    };

    if (!options.ignoreCampus) addClause('CAMPUS_NAME', campus);
    // Engineering: Stream is Batch
    if (!options.ignoreStream) addClause('Batch', stream);
    if (!options.ignoreTest) addClause('Test', test);
    // Engineering: testType maps to P1_P2
    if (!options.ignoreTestType) addClause('P1_P2', testType);
    // Engineering: topAll is Top_ALL
    if (!options.ignoreTopAll) addClause('Top_ALL', topAll);

    // If specific student IDs are selected, use them exclusively
    const sSearch = Array.isArray(studentSearch) ? studentSearch : (studentSearch ? [studentSearch] : []);
    const cleanIds = sSearch
        .filter(id => id && id !== 'null' && id !== 'undefined')
        .map(id => id.toString().trim().toUpperCase().replace(/'/g, "''"))
        .filter(v => v !== '');

    if (cleanIds.length > 0) {
        const list = cleanIds.map(v => `'${v}'`).join(',');
        clauses.push(`UPPER(TRIM(STUD_ID)) IN (${list})`);
    } else if (quickSearch && typeof quickSearch === 'string' && quickSearch.trim() !== '') {
        // Only use quickSearch LIKE if no specific student is selected
        const safeSearch = quickSearch.trim().replace(/'/g, "''").toUpperCase();
        clauses.push(`(UPPER(TRIM(NAME_OF_THE_STUDENT)) LIKE '%${safeSearch}%' OR UPPER(TRIM(STUD_ID)) LIKE '%${safeSearch}%')`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return where;
};

// Get Filter Options
app.get('/api/filters', async (req, res) => {
    try {
        const pool = await connectToDb();
        const { campus, stream, testType, test } = req.query;
        console.log(`[Filters] Request: campus=${campus}, stream=${stream}, testType=${testType}, test=${test}`);

        const buildOptionClause = (column, values) => {
            if (!values || values === 'All' || values === '__ALL__') return null;
            const valArray = Array.isArray(values) ? values : [values];
            const cleanValues = valArray
                .map(v => v ? v.toString().trim() : '')
                .filter(v => v !== '' && v !== '__ALL__')
                .map(v => v.replace(/'/g, "''"));

            if (cleanValues.length === 0) return null;
            const list = cleanValues.map(v => `'${v}'`).join(',');
            return `${column} IN (${list})`;
        };

        const campusClause = buildOptionClause('UPPER(TRIM(CAMPUS_NAME))', campus);
        const streamClause = buildOptionClause('UPPER(TRIM(Batch))', stream);
        const testTypeClause = buildOptionClause('UPPER(TRIM(P1_P2))', testType);
        const testClause = buildOptionClause('UPPER(TRIM(Test))', test);

        const campusesQuery = 'SELECT DISTINCT TRIM(CAMPUS_NAME) as Result FROM ENGG_RESULT WHERE CAMPUS_NAME IS NOT NULL AND CAMPUS_NAME != \'\' ORDER BY Result';

        const sWhere = campusClause ? `WHERE ${campusClause}` : 'WHERE 1=1';
        const streamsQuery = `SELECT DISTINCT TRIM(Batch) as Result FROM ENGG_RESULT ${sWhere} AND Batch IS NOT NULL AND Batch != '' ORDER BY Result`;

        let ttClauses = [];
        if (campusClause) ttClauses.push(campusClause);
        if (streamClause) ttClauses.push(streamClause);
        const ttWhere = ttClauses.length > 0 ? `WHERE ${ttClauses.join(' AND ')}` : 'WHERE 1=1';
        const testTypesQuery = `SELECT DISTINCT TRIM(P1_P2) as Result FROM ENGG_RESULT ${ttWhere} AND P1_P2 IS NOT NULL AND P1_P2 != '' ORDER BY Result`;

        let tClauses = [...ttClauses];
        if (testTypeClause) tClauses.push(testTypeClause);
        const tWhere = tClauses.length > 0 ? `WHERE ${tClauses.join(' AND ')}` : 'WHERE 1=1';
        const testsQuery = `SELECT DISTINCT TRIM(Test) as Result FROM ENGG_RESULT ${tWhere} AND Test IS NOT NULL AND Test != '' ORDER BY Result`;

        let topClauses = [...tClauses];
        if (testClause) topClauses.push(testClause);
        const topWhere = topClauses.length > 0 ? `WHERE ${topClauses.join(' AND ')}` : 'WHERE 1=1';
        const topQuery = `SELECT DISTINCT TRIM(Top_ALL) as Result FROM ENGG_RESULT ${topWhere} AND Top_ALL IS NOT NULL AND Top_ALL != '' ORDER BY Result`;

        const cacheKey = `filters_${JSON.stringify(req.query)}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log("[Filters] Cache Hit");
            return res.json(cachedData);
        }

        const start = Date.now();
        console.log("[Filters] Executing DB Queries...");
        const [campusesRes, streamsRes, testTypesRes, testsRes, topRes] = await Promise.all([
            pool.request().query(campusesQuery),
            pool.request().query(streamsQuery),
            pool.request().query(testTypesQuery),
            pool.request().query(testsQuery),
            pool.request().query(topQuery)
        ]);

        const responseData = {
            campuses: (campusesRes.recordset || []).map(r => r.Result).filter(Boolean),
            streams: (streamsRes.recordset || []).map(r => r.Result).filter(Boolean),
            testTypes: (testTypesRes.recordset || []).map(r => r.Result).filter(Boolean),
            tests: (testsRes.recordset || []).map(r => r.Result).filter(Boolean),
            topAll: (topRes.recordset || []).map(r => r.Result).filter(Boolean)
        };

        console.log(`[Filters] Success (${Date.now() - start}ms): ${responseData.campuses.length} campuses, ${responseData.streams.length} streams`);

        // Cache Disabled for debug
        // cache.set(cacheKey, responseData, 60);
        res.json(responseData);
    } catch (err) {
        console.error("[Filters] CRITICAL ERROR:", err);
        res.status(500).json({ error: "Server Error", details: err.message });
    }
});

// Debug Row Count
app.get('/api/debug-count', async (req, res) => {
    try {
        const pool = await connectToDb();
        const result = await pool.request().query('SELECT COUNT(*) as count FROM ENGG_RESULT');
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        const pool = await connectToDb();
        await pool.request().query('SELECT 1');
        res.json({
            status: 'ok',
            message: 'Database connected',
            version: '1.0.2 - Filter Mapping Fixed',
            timestamp: '2026-02-11 17:35'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Test Route
app.get('/', (req, res) => {
    res.send('Student Analysis API is running');
});

// Get All Students with Name, ID, Total Marks, and Rank
app.get('/api/students', async (req, res) => {
    try {
        console.log("Attempting to connect to DB for /api/students...");
        const pool = await connectToDb();
        console.log("Connected. Querying ENGG_RESULT...");

        const whereClause = buildWhereClause(req);
        console.log(`[students] Generated WHERE clause: "${whereClause}"`);
        // We will select Top 100 to avoid overwhelming the frontend if DB is huge
        const result = await pool.request().query(`
            SELECT 
                STUD_ID as id, 
                NAME_OF_THE_STUDENT as name, 
                Total as score, 
                PHY as physics,
                CHE as chemistry,
                MAT as mathematics,
                CAMPUS_NAME as grade
            FROM ENGG_RESULT 
            ${whereClause}
            ORDER BY Total DESC
            LIMIT 100
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Get Top 10 Students
app.get('/api/top10', async (req, res) => {
    try {
        const pool = await connectToDb();
        const whereClause = buildWhereClause(req);
        console.log(`[top10] Generated WHERE clause: "${whereClause}"`);

        const result = await pool.request().query(`
            SELECT 
                NAME_OF_THE_STUDENT as name, 
                Total as score 
            FROM ENGG_RESULT 
            ${whereClause}
            ORDER BY Total DESC
            LIMIT 10
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Get Performance Stats
app.get('/api/performance', async (req, res) => {
    try {
        const pool = await connectToDb();
        const whereClause = buildWhereClause(req);
        console.log(`[Performance] Generated WHERE clause: "${whereClause}"`);

        // Calculate Pass/Fail (Assuming 50% of 720 which is 360 is pass, or generic 50%)
        // Let's assume total mark is 720 for NEET.
        console.log("[Performance] Running Pass/Fail/Avg Query...");
        const passFailResult = await pool.request().query(`
            SELECT 
                SUM(CASE WHEN Total >= 150 THEN 1 ELSE 0 END) as passed,
                SUM(CASE WHEN Total < 150 THEN 1 ELSE 0 END) as failed,
                AVG(Total) as average
            FROM ENGG_RESULT
            ${whereClause}
        `);
        console.log("[Performance] Pass/Fail Query Done.");

        // Class Performance (Average by Campus)
        const campusResult = await pool.request().query(`
            SELECT CAMPUS_NAME as label, AVG(Total) as value
            FROM ENGG_RESULT
            ${whereClause}
            GROUP BY CAMPUS_NAME
            ORDER BY value DESC
            LIMIT 5
        `);

        res.json({
            pass: passFailResult.recordset[0].passed || 0,
            fail: passFailResult.recordset[0].failed || 0,
            average: passFailResult.recordset[0].average || 0,
            campusPerformance: campusResult.recordset
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Get Student History (Average Report)
app.get('/api/history', async (req, res) => {
    try {
        const pool = await connectToDb();
        const { id, name, campus } = req.query; // Search params

        let whereClause = '';
        if (id) whereClause = `WHERE STUD_ID = ${id}`;
        else if (name) whereClause = `WHERE NAME_OF_THE_STUDENT = '${name}'`;

        // If we have filters, apply them too
        // For History/Progress Report, we respect all filters 
        // but can ignore if user wants "All" - handled by buildWhereClause logic
        const baseWhere = buildWhereClause(req, { ignoreTest: false, ignoreTestType: false });
        if (baseWhere && !whereClause) whereClause = baseWhere;
        else if (baseWhere && whereClause) whereClause += ` AND ` + baseWhere.replace('WHERE ', '');

        // If specific ID not provided, default to top 1 student history to show something
        if (!whereClause) {
            const top = await pool.request().query('SELECT STUD_ID FROM ENGG_RESULT ORDER BY Total DESC LIMIT 1');
            if (top.recordset.length > 0) whereClause = `WHERE STUD_ID = ${top.recordset[0].STUD_ID}`;
        }
        console.log(`[history] Generated WHERE clause: "${whereClause}"`);

        const query = `
            SELECT 
                Test, 
                DATE, 
                Total as Total, 
                AIR,
                MAT as MAT, 
                PHY as PHY, 
                CHE as CHE,
                NAME_OF_THE_STUDENT,
                CAMPUS_NAME,
                STUD_ID
            FROM ENGG_RESULT 
            ${whereClause}
            ORDER BY STR_TO_DATE(DATE, '%Y-%m-%d') ASC
        `;

        logQuery(query, req.query);
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// New endpoint: fetch student list based on current filters (cascading)
app.get('/api/studentsByCampus', async (req, res) => {
    try {
        const pool = await connectToDb();
        // Allow filters to apply (especially Campus for security context)
        // If frontend sends specific filters (like restricted campus), we must respect them.
        const where = buildWhereClause(req);
        console.log(`[studentsByCampus] Generated WHERE: "${where}"`);
        console.log(`[studentsByCampus] Global Search - Generated WHERE: "${where}"`);

        const query = `
            SELECT 
                TRIM(STUD_ID) as id, 
                MAX(TRIM(NAME_OF_THE_STUDENT)) as name,
                MAX(TRIM(CAMPUS_NAME)) as campus,
                MAX(TRIM(Stream)) as stream
            FROM ENGG_RESULT 
            ${where} 
            GROUP BY STUD_ID
            ORDER BY name
            LIMIT 100`;

        const students = await pool.request().query(query);
        console.log(`[studentsByCampus] Found ${students.recordset.length} students. First result:`, students.recordset[0]);

        logQuery(query, req.query);
        // cache.set(cacheKey, students.recordset, 30); // Disabled for debug
        res.json(students.recordset);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Endpoint for Table 1: Statistics of current selected exam(s)
app.get('/api/exam-stats', async (req, res) => {
    try {
        const pool = await connectToDb();
        const where = buildWhereClause(req);
        const query = `
            SELECT 
                DATE(DATE) as DATE,
                TRIM(Test) as Test, 
                COUNT(STUD_ID) as Attn,
                MAX(CAST(Total AS DECIMAL(10,2))) as Max_T,
                SUM(CASE WHEN CAST(Total AS DECIMAL(10,2)) >= 250 THEN 1 ELSE 0 END) as T_250,
                SUM(CASE WHEN CAST(Total AS DECIMAL(10,2)) >= 200 THEN 1 ELSE 0 END) as T_200,
                SUM(CASE WHEN CAST(Total AS DECIMAL(10,2)) >= 180 THEN 1 ELSE 0 END) as T_180,
                SUM(CASE WHEN CAST(Total AS DECIMAL(10,2)) >= 150 THEN 1 ELSE 0 END) as T_150,
                SUM(CASE WHEN CAST(Total AS DECIMAL(10,2)) >= 120 THEN 1 ELSE 0 END) as T_120,
                SUM(CASE WHEN CAST(Total AS DECIMAL(10,2)) >= 100 THEN 1 ELSE 0 END) as T_100,
                SUM(CASE WHEN CAST(Total AS DECIMAL(10,2)) >= 80 THEN 1 ELSE 0 END) as T_80,
                MAX(CAST(MAT AS DECIMAL(10,2))) as Max_M,
                SUM(CASE WHEN CAST(MAT AS DECIMAL(10,2)) >= 80 THEN 1 ELSE 0 END) as M_80,
                SUM(CASE WHEN CAST(MAT AS DECIMAL(10,2)) >= 70 THEN 1 ELSE 0 END) as M_70,
                MAX(CAST(PHY AS DECIMAL(10,2))) as Max_P,
                SUM(CASE WHEN CAST(PHY AS DECIMAL(10,2)) >= 80 THEN 1 ELSE 0 END) as P_80,
                SUM(CASE WHEN CAST(PHY AS DECIMAL(10,2)) >= 70 THEN 1 ELSE 0 END) as P_70,
                MAX(CAST(CHE AS DECIMAL(10,2))) as Max_C,
                SUM(CASE WHEN CAST(CHE AS DECIMAL(10,2)) >= 80 THEN 1 ELSE 0 END) as C_80,
                SUM(CASE WHEN CAST(CHE AS DECIMAL(10,2)) >= 70 THEN 1 ELSE 0 END) as C_70
            FROM ENGG_RESULT
            ${where}
            GROUP BY TRIM(Test), DATE(DATE)
            ORDER BY DATE DESC, Test ASC
        `;

        logQuery(query, req.query);
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Endpoint for Table 2: Student marks of selected exam(s) with Averaging
app.get('/api/analysis-report', async (req, res) => {
    try {
        const pool = await connectToDb();
        const where = buildWhereClause(req);

        // 1. Get Student Data
        const studentQuery = `
            SELECT 
                STUD_ID,
                MAX(NAME_OF_THE_STUDENT) as name,
                MAX(CAMPUS_NAME) as campus,
                AVG(CAST(Total as DECIMAL(10,2))) as tot,
                AVG(CAST(AIR as DECIMAL(10,2))) as air,
                AVG(CAST(MAT as DECIMAL(10,2))) as mat,
                AVG(CAST(M_Rank as DECIMAL(10,2))) as m_rank,
                AVG(CAST(PHY as DECIMAL(10,2))) as phy,
                AVG(CAST(P_Rank as DECIMAL(10,2))) as p_rank,
                AVG(CAST(CHE as DECIMAL(10,2))) as che,
                AVG(CAST(C_Rank as DECIMAL(10,2))) as c_rank,
                COUNT(Test) as t_app
            FROM ENGG_RESULT
            ${where}
            GROUP BY STUD_ID
            ORDER BY tot DESC
        `;

        // 2. Get Metadata (Test Names, Dates, Total Count)
        const metaQuery = `
            SELECT DISTINCT Test, DATE(DATE) as DATE 
            FROM ENGG_RESULT
            ${where}
            ORDER BY DATE ASC
        `;

        logQuery(studentQuery, req.query);
        const [studentRes, metaRes] = await Promise.all([
            pool.request().query(studentQuery),
            pool.request().query(metaQuery)
        ]);

        res.json({
            students: studentRes.recordset,
            exams: metaRes.recordset,
            t_cnt: metaRes.recordset.length
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// --- ERP REPORT API ENDPOINTS ---

// Get ERP Filter Options
app.get('/api/erp/filters', async (req, res) => {
    try {
        const pool = await connectToDb();
        const { branch, stream, testType, test } = req.query;
        console.log(`[ERP Filters] Request: branch=${branch}, stream=${stream}, testType=${testType}, test=${test}`);

        const buildOptionClause = (column, values) => {
            if (!values || values === 'All' || values === '__ALL__') return null;
            const valArray = Array.isArray(values) ? values : [values];
            const cleanValues = valArray
                .map(v => v ? v.toString().trim() : '')
                .filter(v => v !== '' && v !== '__ALL__')
                .map(v => v.replace(/'/g, "''"));

            if (cleanValues.length === 0) return null;
            const list = cleanValues.map(v => `'${v}'`).join(',');
            return `${column} IN (${list})`;
        };

        // Note: Frontend sends 'branch' (mapped to campus filter), we query 'Branch' column
        const branchClause = buildOptionClause('UPPER(TRIM(Branch))', branch);
        const streamClause = buildOptionClause('UPPER(TRIM(Stream))', stream);
        const testTypeClause = buildOptionClause('UPPER(TRIM(Test_Type))', testType);
        const testClause = buildOptionClause('UPPER(TRIM(Test))', test);

        const branchesQuery = 'SELECT DISTINCT TRIM(Branch) as Result FROM ERP_REPORT_ENGG WHERE Branch IS NOT NULL AND Branch != \'\' ORDER BY Result';

        const sWhere = branchClause ? `WHERE ${branchClause}` : 'WHERE 1=1';
        const streamsQuery = `SELECT DISTINCT TRIM(Stream) as Result FROM ERP_REPORT_ENGG ${sWhere} AND Stream IS NOT NULL AND Stream != '' ORDER BY Result`;

        let ttClauses = [];
        if (branchClause) ttClauses.push(branchClause);
        if (streamClause) ttClauses.push(streamClause);
        const ttWhere = ttClauses.length > 0 ? `WHERE ${ttClauses.join(' AND ')}` : 'WHERE 1=1';
        const testTypesQuery = `SELECT DISTINCT TRIM(Test_Type) as Result FROM ERP_REPORT_ENGG ${ttWhere} AND Test_Type IS NOT NULL AND Test_Type != '' ORDER BY Result`;

        let tClauses = [...ttClauses];
        if (testTypeClause) tClauses.push(testTypeClause);
        const tWhere = tClauses.length > 0 ? `WHERE ${tClauses.join(' AND ')}` : 'WHERE 1=1';
        const testsQuery = `SELECT DISTINCT TRIM(Test) as Result FROM ERP_REPORT_ENGG ${tWhere} AND Test IS NOT NULL AND Test != '' ORDER BY Result`;

        let topClauses = [...tClauses];
        if (testClause) topClauses.push(testClause);
        const topWhere = topClauses.length > 0 ? `WHERE ${topClauses.join(' AND ')}` : 'WHERE 1=1';
        const topQuery = `SELECT DISTINCT TRIM(Top_ALL) as Result FROM ERP_REPORT_ENGG ${topWhere} AND Top_ALL IS NOT NULL AND Top_ALL != '' ORDER BY Result`;

        const [branchesRes, streamsRes, testTypesRes, testsRes, topRes] = await Promise.all([
            pool.request().query(branchesQuery),
            pool.request().query(streamsQuery),
            pool.request().query(testTypesQuery),
            pool.request().query(testsQuery),
            pool.request().query(topQuery)
        ]);

        res.json({
            campuses: (branchesRes.recordset || []).map(r => r.Result).filter(Boolean),
            streams: (streamsRes.recordset || []).map(r => r.Result).filter(Boolean),
            testTypes: (testTypesRes.recordset || []).map(r => r.Result).filter(Boolean),
            tests: (testsRes.recordset || []).map(r => r.Result).filter(Boolean),
            topAll: (topRes.recordset || []).map(r => r.Result).filter(Boolean)
        });
    } catch (err) {
        console.error("[ERP Filters] ERROR:", err);
        res.status(500).json({ error: "Server Error", details: err.message });
    }
});

// Get ERP Data Report
app.get('/api/erp/report', async (req, res) => {
    try {
        const pool = await connectToDb();
        const { campus, stream, test, testType, topAll, studentSearch, quickSearch } = req.query;

        let clauses = [];
        const addClause = (field, value) => {
            if (!value || value === 'All' || value === '__ALL__') return;
            const valArray = Array.isArray(value) ? value : [value];
            const cleanValues = valArray.map(v => v ? v.toString().trim().toUpperCase().replace(/'/g, "''") : '').filter(Boolean);
            if (cleanValues.length === 0) return;
            clauses.push(`UPPER(TRIM(${field})) IN (${cleanValues.map(v => `'${v}'`).join(',')})`);
        };

        // Map filters to ERP columns
        addClause('Branch', campus);
        addClause('Stream', stream);
        addClause('Test', test);
        addClause('Test_Type', testType);
        addClause('Top_ALL', topAll);

        const sSearch = Array.isArray(studentSearch) ? studentSearch : (studentSearch ? [studentSearch] : []);
        const cleanIds = sSearch.map(id => id ? id.toString().trim().toUpperCase().replace(/'/g, "''") : '').filter(Boolean);

        const sNames = Array.isArray(req.query.studentNames) ? req.query.studentNames : [];
        const cleanNames = sNames.map(n => n ? n.toString().trim().toUpperCase().replace(/'/g, "''") : '').filter(Boolean);

        if (cleanIds.length > 0) {
            clauses.push(`UPPER(TRIM(STUD_ID)) IN (${cleanIds.map(v => `'${v}'`).join(',')})`);
        } else if (cleanNames.length > 0) {
            clauses.push(`UPPER(TRIM(Student_Name)) IN (${cleanNames.map(v => `'${v}'`).join(',')})`);
        } else if (quickSearch && quickSearch.trim() !== '') {
            const safeSearch = quickSearch.trim().replace(/'/g, "''").toUpperCase();
            clauses.push(`(UPPER(TRIM(Student_Name)) LIKE '%${safeSearch}%' OR UPPER(TRIM(STUD_ID)) LIKE '%${safeSearch}%')`);
        }

        // Filter for W and U only
        clauses.push(`(UPPER(TRIM(W_U)) = 'W' OR UPPER(TRIM(W_U)) = 'U')`);

        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

        const query = `
            SELECT * FROM ERP_REPORT_ENGG 
            ${where}
            ORDER BY 
                Student_Name, 
                STR_TO_DATE(Exam_Date, '%d-%m-%Y') DESC,
                Subject, 
                Q_No ASC
        `;

        logQuery(query, req.query);
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error("[ERP Report] ERROR:", err);
        res.status(500).send(err.message);
    }
});


app.get('/api/erp/participants', async (req, res) => {
    try {
        const pool = await connectToDb();
        const { test, studentNames } = req.query;

        const sNames = Array.isArray(studentNames) ? studentNames : [];
        if (sNames.length === 0 || !test) return res.json({});

        const cleanNames = sNames.map(n => `'${n.toString().trim().toUpperCase().replace(/'/g, "''")}'`).join(',');
        const testList = (Array.isArray(test) ? test : [test]).map(t => `'${t.toString().trim().toUpperCase().replace(/'/g, "''")}'`).join(',');

        // Query ENGG_RESULT to see who actually took these tests
        const query = `
            SELECT Test, COUNT(DISTINCT NAME_OF_THE_STUDENT) as count
            FROM ENGG_RESULT
            WHERE UPPER(TRIM(NAME_OF_THE_STUDENT)) IN (${cleanNames})
            AND UPPER(TRIM(Test)) IN (${testList})
            GROUP BY Test
        `;

        const result = await pool.request().query(query);
        const counts = {};
        result.recordset.forEach(r => {
            counts[r.Test] = r.count;
        });
        res.json(counts);
    } catch (err) {
        console.error("[ERP Participants] ERROR:", err);
        res.status(500).send(err.message);
    }
});


// --- ADMIN NOTIFICATION SYSTEM ---
const nodemailer = require('nodemailer');

app.post('/api/notify-registration', async (req, res) => {
    const { name, email, campus, phone, role } = req.body;
    console.log(`[Email] Sending registration notification via Brevo API for ${name}...`);

    const API_KEY = process.env.BREVO_API_KEY;
    const ADMIN_EMAIL = process.env.EMAIL_USER; // Use your Gmail as the receiver

    if (!API_KEY) {
        console.error("[Email] Missing BREVO_API_KEY in environment");
        return res.status(500).json({ error: "Email API Key missing" });
    }

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: "NEET Analysis System", email: ADMIN_EMAIL },
                to: [{ email: ADMIN_EMAIL, name: "Admin" }],
                subject: `⚡ New Principal Registration: ${name}`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 600px;">
                        <h2 style="color: #1e40af; margin-top: 0;">New User Pending Approval</h2>
                        <p style="color: #475569;">A new principal has registered on the NEET Analysis Dashboard and is awaiting approval.</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 30%;">Name:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${name}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Campus:</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #0284c7; font-weight: 600;">${campus}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Phone:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${phone || 'N/A'}</td></tr>
                        </table>

                        <div style="margin-top: 25px; text-align: center;">
                            <a href="https://neet-analysis.web.app/admin" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Go to Admin Dashboard to Approve</a>
                        </div>
                    </div>
                `
            })
        });

        const result = await response.json();
        if (response.ok) {
            console.log(`[Email] Notification sent via Brevo! ID: ${result.messageId}`);
            res.json({ success: true, message: "Admin notified" });
        } else {
            throw new Error(result.message || "Failed to send via Brevo");
        }

    } catch (error) {
        console.error("[Email] Brevo API Error:", error.message);
        res.status(500).json({ error: "Failed to send email", details: error.message });
    }
});

// Get ERP Students for Search with Cascading Filters
app.get('/api/erp/students', async (req, res) => {
    try {
        const pool = await connectToDb();
        const { quickSearch, campus, stream, test, testType, topAll, TOP_ALL } = req.query;

        // Helper to add clauses
        let clauses = [];
        const addClause = (field, value) => {
            if (!value || value === 'All' || value === '__ALL__') return;
            const valArray = Array.isArray(value) ? value : [value];
            const cleanValues = valArray.map(v => v ? v.toString().trim().toUpperCase().replace(/'/g, "''") : '').filter(Boolean);
            if (cleanValues.length === 0) return;
            clauses.push(`UPPER(TRIM(${field})) IN (${cleanValues.map(v => `'${v}'`).join(',')})`);
        };

        // Apply Filters
        addClause('Branch', campus);
        addClause('Stream', stream);
        addClause('Test', test);
        addClause('Test_Type', testType);

        // Handle Top_ALL (check both parameter names just in case)
        const finalTopAll = topAll || TOP_ALL;
        addClause('Top_ALL', finalTopAll);

        if (quickSearch && quickSearch.trim() !== '') {
            const safeSearch = quickSearch.trim().replace(/'/g, "''").toUpperCase();
            clauses.push(`(UPPER(TRIM(Student_Name)) LIKE '%${safeSearch}%' OR UPPER(TRIM(STUD_ID)) LIKE '%${safeSearch}%')`);
        }

        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : "WHERE 1=1";

        console.log(`[ERP Students] Filtering with: ${whereClause}`);

        const query = `
            SELECT 
                TRIM(STUD_ID) as id, 
                MAX(TRIM(Student_Name)) as name,
                MAX(TRIM(Branch)) as campus,
                MAX(TRIM(Stream)) as stream
            FROM ERP_REPORT_ENGG 
            ${whereClause} 
            GROUP BY STUD_ID
            ORDER BY name
            LIMIT 100`;

        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error("[ERP Students] ERROR:", err);
        res.status(500).send(err.message);
    }
});

// SERVE REACT APP FOR ANY OTHER ROUTE
// app.get('*', (req, res) => {
//     res.sendFile(path.join(__dirname, '../client/dist/index.html'));
// });

// One-Time Startup DB Connection Test
(async () => {
    try {
        console.log("----------------------------------------");
        console.log("STARTUP: Testing Database Connection...");
        const pool = await connectToDb();
        await pool.request().query('SELECT 1');
        console.log("STARTUP: Database Connection Verified! ✅");
        console.log("----------------------------------------");
    } catch (err) {
        console.error("STARTUP: Database Connection FAILED! ❌");
        console.error(err);
    }
})();

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Auto-open browser
    // require('child_process').exec('start http://localhost:5000');
});

server.on('error', (err) => {
    console.error("SERVER ERROR:", err);
    fs.appendFileSync('crash.log', `[${new Date().toISOString()}] SERVER ERROR: ${err.stack}\n`);
});

process.on('uncaughtException', (err) => {
    console.error("UNCAUGHT EXCEPTION:", err);
    fs.appendFileSync('crash.log', `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err.stack}\n`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error("UNHANDLED REJECTION:", reason);
    fs.appendFileSync('crash.log', `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n`);
});
