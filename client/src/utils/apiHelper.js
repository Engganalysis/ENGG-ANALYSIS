export const API_URL = import.meta.env.VITE_API_URL || 'https://engg-analysis-9op1.onrender.com';


export const ADMIN_WHATSAPP = '9281425210';

export const buildQueryParams = (filters) => {
    const params = new URLSearchParams();

    Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value && value.length > 0) {
            if (Array.isArray(value)) {
                // If it's our special "Select All" marker, don't append anything
                // The backend will treat absence of parameter as "All"
                if (value.length === 1 && value[0] === "__ALL__") return;

                value.forEach(v => params.append(key, v));
            } else {
                if (value !== 'All') {
                    params.append(key, value);
                }
            }
        }
    });

    return params;
};

/**
 * Format a date string or object
 * @param {string|Date} dateStr 
 * @param {string} format 'dd/mm/yyyy' or 'dd-mmm-yy'
 * @returns {string} Formatted date
 */
export const formatDate = (dateStr, format = 'dd/mm/yyyy') => {
    if (!dateStr) return '';

    // Handle DD-MM-YYYY or DD/MM/YYYY or DD-MM-YY manually
    // Regex matches starts with 1 or 2 digits, separator, 1 or 2 digits, separator, 2 to 4 digits
    const dmyPattern = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/;
    const match = String(dateStr).match(dmyPattern);

    let date;
    if (match) {
        let yearStr = match[3];
        if (yearStr.length === 2) {
            // Assume 20xx for 2-digit years
            yearStr = '20' + yearStr;
        }
        // match[1] = day, match[2] = month, match[3] = year
        // Month is 0-indexed in JS Date
        date = new Date(parseInt(yearStr, 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10));
    } else {
        date = new Date(dateStr);
    }

    if (isNaN(date.getTime())) return dateStr;

    const day = String(date.getDate()).padStart(2, '0');
    const monthIndex = date.getMonth();
    const year = date.getFullYear();

    if (format === 'dd-mmm-yy') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const shortYear = String(year).slice(-2);
        return `${day}-${months[monthIndex]}-${shortYear}`;
    }

    const month = String(monthIndex + 1).padStart(2, '0');
    return `${day}/${month}/${year}`;
};
