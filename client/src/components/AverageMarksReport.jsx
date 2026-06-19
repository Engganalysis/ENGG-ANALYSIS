
import React, { useState, useEffect } from 'react';
import { buildQueryParams, formatDate, API_URL } from '../utils/apiHelper';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import { useAuth } from './auth/AuthProvider';
import { logActivity } from '../utils/activityLogger';
import autoTable from 'jspdf-autotable';
import { Trophy, AlertCircle, FileSpreadsheet, FileText } from 'lucide-react';


const AverageMarksReport = ({ filters }) => {
    const { userData, currentHeading } = useAuth();
    const [data, setData] = useState([]);
    const [examMeta, setExamMeta] = useState([]);
    const [totalConducted, setTotalConducted] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedRange, setSelectedRange] = useState(null);


    const ranges = [
        { label: '>=280', min: 280 }, { label: '>=260', min: 260 },
        { label: '>=240', min: 240 }, { label: '>=220', min: 220 },
        { label: '>=200', min: 200 }, { label: '>=180', min: 180 },
        { label: '>=160', min: 160 }, { label: '>=140', min: 140 },
        { label: '>=120', min: 120 }, { label: '>=100', min: 100 },
        { label: '>=80', min: 80 }, { label: '>=60', min: 60 },
    ];

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const queryParams = buildQueryParams(filters).toString();
                const response = await fetch(`${API_URL}/api/analysis-report?${queryParams}`);
                const result = await response.json();
                setData(result.students || []);
                setExamMeta(result.exams || []);
                setTotalConducted(result.t_cnt || 0);
            } catch (error) {
                console.error("Failed to fetch average report:", error);
                setData([]);
                setExamMeta([]);
                setTotalConducted(0);
            } finally {
                setLoading(false);
                if (result?.students?.length > 0) {
                    logActivity(userData, 'Generated Estimated Avg Report', {
                        studentCount: result.students.length
                    });
                }
            }
        };
        const timeoutId = setTimeout(() => { fetchData(); }, 500);
        return () => clearTimeout(timeoutId);
    }, [filters]);

    const getRankedData = (students) => {
        if (!students || students.length === 0) return [];
        // Sort by tot descending to ensure correct ranking
        const sorted = [...students].sort((a, b) => b.tot - a.tot);
        let currentRank = 1;
        return sorted.map((s, idx) => {
            if (idx > 0 && Math.round(s.tot) < Math.round(sorted[idx - 1].tot)) {
                currentRank = idx + 1;
            }
            return { ...s, calculatedRank: currentRank };
        });
    };

    const getFilteredData = () => {
        const baseData = selectedRange
            ? data.filter(s => s.tot >= selectedRange.min)
            : data;
        return getRankedData(baseData);
    };

    const getRangeCount = (min) => {
        return data.filter(s => s.tot >= min).length;
    };

    const stats = {
        highest: data.length > 0 ? Math.max(...data.map(s => s.tot)) : 0,
        lowest: data.length > 0 ? Math.min(...data.map(s => s.tot)) : 0,
    };

    const rankedStudents = getFilteredData();

    const calculateFooterAverages = () => {
        if (rankedStudents.length === 0) return null;
        const count = rankedStudents.length;
        const sum = (key) => rankedStudents.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);
        return {
            tot: (sum('tot') / count).toFixed(1),
            mat: (sum('mat') / count).toFixed(1),
            phy: (sum('phy') / count).toFixed(1),
            che: (sum('che') / count).toFixed(1),
            air: Math.round(sum('air') / count)
        };
    };

    const footerAvg = calculateFooterAverages();

    const getStreamLabel = () => {
        const selectedStreams = Array.isArray(filters.stream) ? filters.stream : [];
        if (selectedStreams.length === 0) return "ALL";
        const srEliteMatches = ["SR ELITE", "SR_ELITE_SET_01", "SET-02"];
        const jrEliteMatches = ["JR ELITE"];
        const isSrElite = selectedStreams.every(s => srEliteMatches.includes(s));
        if (isSrElite) return "SR ELITE";
        const isJrElite = selectedStreams.every(s => jrEliteMatches.includes(s));
        if (isJrElite) return "JR ELITE";
        return selectedStreams.join(', ');
    };

    const getExamDatesString = (formatType = 'pdf') => {
        if (formatType === 'excel_wrap') {
            return examMeta.map((ex, idx) => `${idx + 1}.(${formatDate(ex.DATE, 'dd-mmm-yy')})`).join('  ');
        }
        return examMeta.map((ex, idx) => `${idx + 1}.(${formatDate(ex.DATE, 'dd/mm/yyyy')})`).join(' ');
    };

    const getDynamicFileName = () => {
        const stream = getStreamLabel();
        return `2025-26_${stream}_ENGG_Estimated Avg's`.replace(/[^a-z0-9\-_]/gi, '_');
    };

    const downloadExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Estimated Avg');
        const stream = getStreamLabel();
        const datesStrWrap = getExamDatesString('excel_wrap');

        worksheet.columns = [
            { width: 12 }, { width: 35 }, { width: 25 },
            { width: 10 }, { width: 8 }, // MAT
            { width: 10 }, { width: 8 }, // PHY
            { width: 10 }, { width: 8 }, // CHE
            { width: 10 }, { width: 12 }, // TOT, Rank
            { width: 10 }, { width: 10 }  // T_App, T_Cnt
        ];

        const borderStyle = {
            top: { style: 'thin', color: { argb: 'FF00B0F0' } },
            left: { style: 'thin', color: { argb: 'FF00B0F0' } },
            bottom: { style: 'thin', color: { argb: 'FF00B0F0' } },
            right: { style: 'thin', color: { argb: 'FF00B0F0' } }
        };

        const getHeaderBaseStyle = (bgColor, fgColor = 'FF0000FF') => ({
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } },
            font: { color: { argb: fgColor }, bold: true },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: borderStyle
        });

        // ROW 1: Logo + Header (Merged A1:M1)
        worksheet.mergeCells('A1:M1');
        const row1 = worksheet.getCell('A1');
        row1.value = currentHeading.toUpperCase();
        row1.font = { name: 'Impact', size: 28, bold: true, color: { argb: 'FF00B0F0' } };
        row1.alignment = { horizontal: 'center', vertical: 'middle' };
        row1.border = borderStyle;
        worksheet.getRow(1).height = 50;

        // Add Logo centered in B column (index 1)
        try {
            const response = await fetch('/logo.png');
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const imageId = workbook.addImage({
                buffer: arrayBuffer,
                extension: 'png',
            });
            worksheet.addImage(imageId, {
                tl: { col: 1.1, row: 0.1 },
                ext: { width: 65, height: 60 },
                editAs: 'oneCell'
            });
        } catch (e) {
            console.error("Failed to add logo to excel:", e);
        }

        // ROW 2: Left Header Block (A2:C2) 
        worksheet.mergeCells('A2:C2');
        const cellA2 = worksheet.getCell('A2');
        const headerTextStr = `2025-26_${stream}_ENGG_Estimated Avg's`;
        const parts = headerTextStr.split(stream);
        cellA2.value = {
            richText: [
                { text: parts[0] || '', font: { name: 'MS Gothic', size: 16, color: { argb: 'FFCCCCFF' }, bold: true } },
                { text: stream, font: { name: 'MS Gothic', size: 16, color: { argb: 'FFFFFF00' }, bold: true } },
                { text: parts[1] || '', font: { name: 'MS Gothic', size: 16, color: { argb: 'FFCCCCFF' }, bold: true } },
            ]
        };
        cellA2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF31869B' } };
        cellA2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cellA2.border = borderStyle;

        // ROW 2: Right Header Block (D2:M2) - Wrap text
        worksheet.mergeCells('D2:M2');
        const cellD2 = worksheet.getCell('D2');
        cellD2.value = {
            richText: [
                { text: `Over All ENGG INCOMMING ${stream} Avg's : \n`, font: { color: { argb: 'FF0066CC' }, name: 'Arial', size: 10, bold: true } },
                { text: datesStrWrap, font: { color: { argb: 'FF000000' }, name: 'Arial', size: 10 } }
            ]
        };
        cellD2.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        cellD2.border = borderStyle;
        worksheet.getRow(2).height = 60;

        // ROW 3: Column Headers
        const headerLabels = ["STUD_ID", "Name", "Campus", "MAT\n100", "M_R", "PHY\n100", "P_R", "CHE\n100", "C_R", "TOT\n300", "Rank", "T_App", "T_Cnt"];
        const row3 = worksheet.addRow(headerLabels);
        row3.height = 35;
        row3.eachCell((cell, colNumber) => {
            if (colNumber >= 1 && colNumber <= 5) cell.style = getHeaderBaseStyle('FFFFFFCC');
            else if (colNumber >= 6 && colNumber <= 7) cell.style = getHeaderBaseStyle('FFE4DFEC');
            else if (colNumber >= 8 && colNumber <= 9) cell.style = getHeaderBaseStyle('FFDDD9C4');
            else if (colNumber === 10) cell.style = getHeaderBaseStyle('FF002060', 'FFFFFF00');
            else if (colNumber === 11) cell.style = getHeaderBaseStyle('FFFFFF00', 'FF0000FF');
            else if (colNumber === 12) cell.style = getHeaderBaseStyle('FFFCD5B4');
            else if (colNumber === 13) cell.style = getHeaderBaseStyle('FFD9D9D9');

            // Enable wrap text for headers with \n
            cell.alignment = { ...cell.alignment, wrapText: true };
        });

        // Data Rows
        rankedStudents.forEach((s) => {
            const rowData = [
                s.STUD_ID || '', s.name || '', s.campus || '',
                Number(s.mat || 0), Math.round(s.m_rank || 0),
                Number(s.phy || 0), Math.round(s.p_rank || 0),
                Number(s.che || 0), Math.round(s.c_rank || 0),
                Number(s.tot || 0), s.calculatedRank,
                s.t_app || 0, totalConducted
            ];
            const dataRow = worksheet.addRow(rowData);
            dataRow.eachCell((cell, colNumber) => {
                cell.border = borderStyle;
                cell.alignment = { vertical: 'middle' };

                // Format numbers with 1 decimal point for BOT, ZOO, PHY, CHE, TOT
                if ([4, 6, 8, 10].includes(colNumber)) {
                    cell.numFmt = '0.0';
                }

                if (colNumber <= 3) {
                    cell.font = { name: 'Arial', size: 9, color: { argb: 'FF000000' } };
                } else if ([4, 6, 8].includes(colNumber)) {
                    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF7030A0' } };
                    cell.alignment.horizontal = 'center';
                } else if ([5, 7, 9].includes(colNumber)) {
                    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFF0000' } };
                    cell.alignment.horizontal = 'center';
                } else if (colNumber === 10) {
                    cell.font = { name: 'Arial Black', size: 10, bold: true, color: { argb: 'FF0070C0' } };
                    cell.alignment.horizontal = 'center';
                } else if (colNumber === 11) {
                    cell.font = { name: 'Arial', size: 12, bold: true, italic: true, color: { argb: 'FF0000FF' } };
                    cell.alignment.horizontal = 'center';
                } else {
                    cell.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
                    cell.alignment.horizontal = 'center';
                }
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `${getDynamicFileName()}.xlsx`);
        logActivity(userData, 'Exported Estimated Avg Excel', { filename: getDynamicFileName() });
    };


    return (
        <div className="average-marks-container">
            <div className="avg-summary-row" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div className="avg-stat-card highest">
                        <div className="stat-label">Highest</div>
                        <div className="stat-value">{stats.highest > 0 ? Math.round(stats.highest) : '--'}</div>
                    </div>
                    <div className="avg-stat-card lowest">
                        <div className="stat-label">Lowest</div>
                        <div className="stat-value">{stats.lowest > 0 ? Math.round(stats.lowest) : '--'}</div>
                    </div>
                </div>
                <div className="report-actions">
                    <button className="btn-secondary" onClick={downloadExcel} style={{ backgroundColor: '#2563eb', color: 'white', padding: '8px 15px' }}><FileSpreadsheet size={16} /> Export Excel</button>
                </div>
            </div>
            <div className="avg-main-layout">
                <div className="avg-table-section">
                    <div className="table-header-title">Estimated Average's Report - {getStreamLabel()}</div>
                    <div className="table-container">
                        <table className="analysis-table merit-style">
                            <thead>
                                <tr className="table-main-header">
                                    <th>NAME_OF_THE_STUDENT</th>
                                    <th>CAMPUS_NAME</th>
                                    <th className="col-yellow">TOT</th>
                                    <th className="col-green">MAT</th>
                                    <th className="col-green-pale">PHY</th>
                                    <th className="col-pink-pale">CHE</th>
                                    <th>RANK</th>
                                    <th>T_APP</th>
                                    <th>T_CNT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (<tr><td colSpan={10} align="center">Loading data...</td></tr>) : rankedStudents.length === 0 ? (<tr><td colSpan={10} align="center">No data matching criteria</td></tr>) : (
                                    <>
                                        {rankedStudents.map((s, idx) => (
                                            <tr key={idx}>
                                                <td className="text-left font-bold" style={{ color: '#101828' }}>
                                                    {s.name}
                                                </td>

                                                <td style={{ color: '#101828' }}>{s.campus}</td>
                                                <td className="col-yellow font-bold" style={{ color: '#000000' }}>{Number(s.tot || 0).toFixed(1)}</td>
                                                <td className="col-green" style={{ color: '#000000' }}>{Number(s.mat || 0).toFixed(1)}</td>
                                                <td className="col-green-pale" style={{ color: '#000000' }}>{Number(s.phy || 0).toFixed(1)}</td>
                                                <td className="col-pink-pale" style={{ color: '#000000' }}>{Number(s.che || 0).toFixed(1)}</td>
                                                <td className="font-bold" style={{ color: '#0000ff', fontStyle: 'italic' }}>{s.calculatedRank}</td>
                                                <td className="font-bold" style={{ color: '#000000' }}>{s.t_app}</td>
                                                <td className="font-bold" style={{ color: '#000000' }}>{totalConducted}</td>
                                            </tr>
                                        ))}
                                        {footerAvg && (
                                            <tr className="total-row">
                                                <td colSpan={2} className="text-right font-bold" style={{ backgroundColor: '#f1f5f9', color: '#000000' }}>Average Marks</td>
                                                <td className="col-yellow font-bold" style={{ color: '#000000' }}>{footerAvg.tot}</td>
                                                <td className="col-green font-bold" style={{ color: '#000000' }}>{footerAvg.mat}</td>
                                                <td className="col-green-pale font-bold" style={{ color: '#000000' }}>{footerAvg.phy}</td>
                                                <td className="col-pink-pale font-bold" style={{ color: '#000000' }}>{footerAvg.che}</td>
                                                <td colSpan={3} style={{ backgroundColor: '#f1f5f9' }}></td>
                                            </tr>
                                        )}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="avg-range-column">{ranges.map((r, i) => { const count = getRangeCount(r.min); const isActive = selectedRange?.min === r.min; return (<button key={i} className={`range-card ${isActive ? 'active' : ''}`} onClick={() => setSelectedRange(isActive ? null : r)}><div className="range-label">{r.label}</div><div className="range-count">{count || '--'}</div></button>); })}</div>
            </div>
            <style>{`
                .average-marks-container { padding: 0; }
                .avg-summary-row { display: flex; gap: 15px; margin-bottom: 20px; align-items: center; }
                .avg-stat-card { background: white; padding: 6px 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; flex-direction: column; min-width: 120px; }
                .avg-stat-card.highest { border-left: 4px solid #eab308; }
                .avg-stat-card.lowest { border-left: 4px solid #ef4444; }
                .stat-label { font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.025em; }
                .stat-value { font-size: 1.5rem; font-weight: 800; color: #1e293b; margin-top: 2px; }
                .stat-icon { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); opacity: 0.1; }
                .avg-main-layout { display: grid; grid-template-columns: 1fr 200px; gap: 20px; }
                .table-header-title { background: #1e293b; color: white; padding: 10px 15px; border-radius: 8px 8px 0 0; font-weight: 600; font-size: 0.95rem; text-align: center; }
                .table-container { overflow-x: auto; background: white; border-radius: 0 0 8px 8px; }
                .analysis-table.merit-style { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #00b0f0; }
                .analysis-table.merit-style th { font-size: 0.7rem; padding: 8px 4px; border: 1px solid #00b0f0; color: #000000; }
                .analysis-table.merit-style td { font-size: 0.75rem; padding: 6px 4px; border: 1px solid #00b0f0; text-align: center; color: #000000; }
                .col-yellow { background-color: #fffbeb !important; }
                .col-green { background-color: #f0fdf4 !important; }
                .col-blue-light { background-color: #eff6ff !important; }
                .col-green-pale { background-color: #f7fee7 !important; }
                .col-pink-pale { background-color: #fdf2f8 !important; }
                .sub-th.bot { background: #ffffcc; color: #000000; }
                .sub-th.zoo { background: #fde9d9; color: #000000; }
                .sub-th.phy { background: #e4dfec; color: #000000; }
                .sub-th.che { background: #ddd9c4; color: #000000; }
                .col-tot { background: #002060 !important; color: #ffffff !important; }
                .col-rank { background: #ffff00 !important; color: #000000 !important; }
                
                .avg-range-column { display: flex; flex-direction: column; gap: 6px; }
                .range-card { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    background: white; 
                    border: 1px solid #e2e8f0; 
                    border-radius: 8px; 
                    padding: 8px 12px; 
                    cursor: pointer; 
                    transition: all 0.2s;
                    width: 100%;
                }
                .range-card:hover { border-color: #C4D79B; transform: translateX(-2px); }
                .range-card.active { background: #C4D79B; border-color: #C4D79B; }
                .range-label { font-weight: 700; font-size: 0.85rem; color: #475569; }
                .range-card.active .range-label { color: #000066; } /* Dark Blue for contrast on light green */
                .range-count { 
                    background: #f1f5f9; 
                    color: #000066; /* Requested Color */
                    padding: 2px 8px; 
                    border-radius: 6px; 
                    font-size: 0.8rem; 
                    font-weight: bold; /* Requested Bold */
                    min-width: 40px; 
                    text-align: center; 
                }
                .range-card.active .range-count { background: rgba(255,255,255,0.4); color: #000066; }
            `}</style>

        </div>

    );
};

export default AverageMarksReport;
