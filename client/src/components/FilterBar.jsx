import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { buildQueryParams, API_URL } from '../utils/apiHelper';

const FilterBar = ({ filters, setFilters, restrictedCampus, apiEndpoints = {} }) => {
    // Normalize restriction to array for uniform handling
    const allowedCampuses = Array.isArray(restrictedCampus) ? restrictedCampus : (restrictedCampus ? [restrictedCampus] : []);
    const isRestricted = allowedCampuses.length > 0;
    const [options, setOptions] = useState({
        campuses: [],
        streams: [],
        testTypes: [],
        tests: [],
        topAll: []
    });
    const [students, setStudents] = useState([]);
    const [loadingFilters, setLoadingFilters] = useState(false);
    const [loadingStudents, setLoadingStudents] = useState(false);

    // Default Endpoints
    const endpoints = {
        filters: apiEndpoints.filters || '/api/filters',
        students: apiEndpoints.students || '/api/studentsByCampus'
    };

    // Transform string array to { value, label } for React Select
    const toOptions = (arr) => {
        if (arr.length === 1 && arr[0] === "__ALL__") return []; // Should not happen in options list
        return arr.map(item => ({ value: item, label: item }));
    };

    // Helper to get current value for React Select from simple array in state
    const getValue = (field, currentOptions) => {
        const val = filters[field];
        if (!val || val.length === 0) return [];

        if (val.length === 1 && val[0] === "__ALL__") {
            return [{ value: "SELECT_ALL", label: "ALL SELECTED" }];
        }

        // For studentSearch, map IDs back to labels using the students list
        if (field === 'studentSearch') {
            return val.map(v => {
                const s = students.find(st => st.id.toString() === v.toString());
                return s ? { value: s.id, label: s.name } : { value: v, label: v };
            });
        }
        return val.map(v => ({ value: v, label: v }));
    };

    // Generic handler for React Select changes with "Select All" support
    const handleSelectChange = (field, selectedOptions, actionMeta) => {
        if (actionMeta.action === "select-option" && selectedOptions.some(opt => opt.value === "SELECT_ALL")) {
            // Select All clicked -> Use a special "ALL" marker or just clear to signify all in some contexts
            // For simplicity and backend compatibility, we'll keep the full list but only if it's reasonably small.
            // Actually, BETTER: Set it to a special "ALL" value that the API helper understands.
            setFilters(prev => ({ ...prev, [field]: ["__ALL__"] }));
        } else if (actionMeta.action === "deselect-option" && actionMeta.option && actionMeta.option.value === "SELECT_ALL") {
            // Deselect All clicked -> Clear all
            setFilters(prev => ({ ...prev, [field]: [] }));
        } else {
            // Normal selection
            const values = selectedOptions ? selectedOptions.map(opt => opt.value).filter(v => v !== 'SELECT_ALL') : [];
            // If the user manually selects everything, we could also convert to __ALL__ but let's keep it explicit for now
            setFilters(prev => ({ ...prev, [field]: values }));
        }
    };

    useEffect(() => {
        const fetchFilters = async () => {
            const paramsOptions = buildQueryParams({
                campus: filters.campus,
                stream: filters.stream,
                testType: filters.testType,
                test: filters.test
            });
            const urlOptions = `${API_URL}${endpoints.filters}?${paramsOptions.toString()}`;

            setLoadingFilters(true);
            try {
                const res = await fetch(urlOptions);
                const data = await res.json();

                setOptions({
                    campuses: data.campuses
                        ? (isRestricted ? data.campuses.filter(c => allowedCampuses.includes(c)) : data.campuses)
                        : [],
                    streams: data.streams || [],
                    testTypes: data.testTypes || [],
                    tests: data.tests || [],
                    topAll: data.topAll || []
                });

                // CASCADING RESET LOGIC: 
                setFilters(prev => {
                    const next = { ...prev };
                    let changed = false;

                    const validateField = (key, available) => {
                        const currentValues = prev[key];
                        if (!currentValues || currentValues.length === 0 || currentValues[0] === "__ALL__") return;

                        const filtered = currentValues.filter(v => available.includes(v));
                        if (filtered.length !== currentValues.length) {
                            next[key] = filtered;
                            changed = true;
                        }
                    };

                    validateField('stream', data.streams || []);
                    validateField('testType', data.testTypes || []);
                    validateField('test', data.tests || []);
                    validateField('topAll', data.topAll || []);

                    return changed ? next : prev;
                });
            } catch (err) {
                console.error("[FilterBar] Options Fetch Error:", err);
            } finally {
                setLoadingFilters(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchFilters();
        }, 300); // 300ms debounce

        return () => clearTimeout(timeoutId);
    }, [filters.campus, filters.stream, filters.testType, filters.test]);

    useEffect(() => {
        const fetchStudents = async () => {
            const filtersForStudents = { ...filters };
            delete filtersForStudents.studentSearch;

            // Ensure TOP_ALL is sent as TOP_ALL for backend compatibility
            if (filtersForStudents.topAll && filtersForStudents.topAll.length > 0) {
                filtersForStudents.TOP_ALL = filtersForStudents.topAll;
            }

            const paramsStudents = buildQueryParams(filtersForStudents);
            const urlStudents = `${API_URL}${endpoints.students}?${paramsStudents.toString()}`;

            setLoadingStudents(true);
            try {
                const res = await fetch(urlStudents);
                const data = await res.json();
                setStudents(data);
            } catch (err) {
                console.error("[FilterBar] Students Fetch Error:", err);
            } finally {
                setLoadingStudents(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchStudents();
        }, 400); // slightly longer debounce for students list

        return () => clearTimeout(timeoutId);
    }, [filters.campus, filters.stream, filters.testType, filters.test, filters.topAll]);

    // Helper to wrap options with Select All
    const withSelectAll = (arr, labelPrefix = "Options") => [
        { value: "SELECT_ALL", label: `Select All ${labelPrefix}` },
        ...toOptions(arr)
    ];

    // prepared initial student options for the normal dropdown
    const studentOptions = [
        { value: "SELECT_ALL", label: "Select All Students" },
        ...(students || [])
            .filter(s => s && s.name && s.id && String(s.name).trim() !== '' && String(s.id).trim() !== '')
            .map(s => ({ value: s.id, label: `${s.name} (${s.id})` }))
    ];

    // Load options for the Async Global Search
    const loadStudentOptions = async (inputValue) => {
        if (!inputValue || inputValue.length < 1) return []; // Search from 1 character

        try {
            let url = `${API_URL}${endpoints.students}?quickSearch=${encodeURIComponent(inputValue)}`;
            // Enforce restricted campus in search
            if (isRestricted) {
                // If strictly one campus, send as single param (backend optimization)
                if (allowedCampuses.length === 1) {
                    url += `&campus=${encodeURIComponent(allowedCampuses[0])}`;
                } else {
                    // Send ALL allowed campuses as filters so backend restricts search results
                    allowedCampuses.forEach(c => {
                        url += `&campus=${encodeURIComponent(c)}`;
                    });
                }
            }

            const res = await fetch(url);
            const data = await res.json();
            console.log("[loadStudentOptions] Data received:", data);
            return data.map(s => ({
                value: s.id,
                label: `${s.name} (${s.id})`,
                campus: s.campus,
                stream: s.stream
            }));
        } catch (err) {
            console.error("Async Search Error:", err);
            return [];
        }
    };

    // Check if "Select All" is active for a field
    const isSelectAllActive = (field) => {
        return filters[field] && filters[field].length === 1 && filters[field][0] === "__ALL__";
    };

    // Custom styles for React Select
    const customStyles = {
        control: (base, state) => ({
            ...base,
            background: 'white',
            borderColor: state.isFocused ? '#6366f1' : '#e2e8f0',
            minHeight: '38px',
            height: '38px', // Fixed height to prevent enlarging
            borderRadius: '8px',
            boxShadow: 'none',
            '&:hover': {
                borderColor: '#6366f1'
            },
            overflow: 'hidden'
        }),
        menu: (base) => ({
            ...base,
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }),
        valueContainer: (base) => ({
            ...base,
            maxHeight: '38px',
            overflowX: 'auto',
            overflowY: 'hidden',
            flexWrap: 'nowrap',
            padding: '0 8px',
            scrollbarWidth: 'none', // Firefox
            '&::-webkit-scrollbar': { display: 'none' }, // Chrome/Safari
            maskImage: 'linear-gradient(to right, black 90%, transparent 100%)',
        }),

        placeholder: (base) => ({
            ...base,
            fontSize: '0.82rem',
            color: '#94a3b8',
            whiteSpace: 'nowrap'
        }),
        multiValue: (base, state) => {
            const isAll = state.data.value === 'SELECT_ALL';
            return {
                ...base,
                backgroundColor: isAll ? '#172554' : '#eff6ff',
                borderRadius: '4px',
                margin: '2px',
                minWidth: isAll ? '100px' : 'auto'
            };
        },
        multiValueLabel: (base, state) => ({
            ...base,
            color: state.data.value === 'SELECT_ALL' ? 'white' : '#1e40af',
            fontSize: '0.7rem',
            fontWeight: '700',
            padding: '2px 6px'
        }),
        multiValueRemove: (base) => ({
            ...base,
            display: 'flex',
            color: '#ef4444',
            ':hover': {
                backgroundColor: '#ef4444',
                color: 'white',
            },
        })
    };

    // Compact styles for the row filters
    const compactStyles = {
        ...customStyles,
        control: (base, state) => ({
            ...customStyles.control(base, state),
            minHeight: '32px',
            height: '32px',
            fontSize: '0.75rem',
        }),
        valueContainer: (base) => ({
            ...customStyles.valueContainer(base),
            maxHeight: '32px',
        }),
        placeholder: (base) => ({
            ...customStyles.placeholder(base),
            fontSize: '0.75rem',
        }),
        multiValue: (base, state) => ({
            ...customStyles.multiValue(base, state),
            margin: '1px',
        }),
        multiValueLabel: (base, state) => ({
            ...customStyles.multiValueLabel(base, state),
            fontSize: '0.65rem',
            padding: '1px 4px',
        })
    };

    const resetFilters = () => {
        setFilters({
            campus: isRestricted && allowedCampuses.length === 1 ? [allowedCampuses[0]] : (isRestricted ? allowedCampuses : []),
            stream: [],
            testType: [],
            test: [],
            topAll: [],
            studentSearch: [],
            quickSearch: ''
        });
    };

    return (
        <div className="filter-bar-container compact-view">
            {/* 0. Global Student Search - Autocomplete */}
            <div className="global-search-wrapper">
                <div className="search-box-autocomplete">
                    <div className="search-icon">🔍</div>
                    <AsyncSelect
                        cacheOptions
                        loadOptions={loadStudentOptions}
                        defaultOptions={[]}
                        placeholder="Search Student Name or ID..."
                        onChange={(opt) => {
                            console.log("Global Search Selection:", opt);
                            if (opt) {
                                setFilters(prev => ({
                                    ...prev,
                                    studentSearch: [opt.value],
                                    quickSearch: opt.label, // Keep the label for display
                                    // Auto-select Campus and Stream IF NOT RESTRICTED
                                    studentSearch: [opt.value],
                                    quickSearch: opt.label, // Keep the label for display
                                    // Auto-select Campus and Stream IF NOT RESTRICTED
                                    campus: isRestricted && allowedCampuses.length === 1 ? [allowedCampuses[0]] : (opt.campus ? [opt.campus] : []),
                                    stream: opt.stream ? [opt.stream] : [],
                                    testType: [], test: [], topAll: []
                                }));
                            } else {
                                // Cleared
                                setFilters(prev => ({
                                    ...prev,
                                    studentSearch: [],
                                    quickSearch: ''
                                }));
                            }
                        }}
                        styles={{
                            ...customStyles,
                            container: (base) => ({ ...base, flex: 1 }),
                            control: (base, state) => ({
                                ...customStyles.control(base, state),
                                border: 'none',
                                height: '42px',
                                background: 'transparent'
                            })
                        }}
                        className="global-search-select"
                        noOptionsMessage={({ inputValue }) => !inputValue || inputValue.length < 1 ? "Start typing to search..." : "No students found"}
                        filterOption={() => true}
                        isClearable
                        value={filters.studentSearch && filters.studentSearch.length > 0 ? { value: filters.studentSearch[0], label: filters.quickSearch } : null}
                    />
                </div>
                <button
                    onClick={resetFilters}
                    className="btn-primary reset-btn"
                    style={{ marginLeft: '10px', height: '42px', whiteSpace: 'nowrap' }}
                >
                    Clear All
                </button>
            </div>

            <div className="filter-bar">
                <div className={`filter-group campus-filter ${isRestricted && allowedCampuses.length === 1 ? 'disabled' : ''}`}>
                    <label>Campus {isRestricted && <span style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>(Restricted)</span>}</label>
                    <Select
                        isMulti
                        name="campus"
                        options={withSelectAll(options.campuses, "Campuses")}
                        value={getValue('campus')}
                        onChange={(opts, meta) => handleSelectChange('campus', opts, meta)}
                        className="react-select-container"
                        isLoading={loadingFilters}
                        classNamePrefix="react-select"
                        placeholder={isRestricted ? (allowedCampuses.length === 1 ? allowedCampuses[0] : "Select from allowed...") : "Select Campus..."}
                        styles={customStyles}
                        isDisabled={isRestricted && allowedCampuses.length === 1}
                    />
                </div>

                {/* Batch Select */}
                <div className={`filter-group ${loadingFilters || (filters.campus.length === 0 && !isRestricted) ? 'disabled-logic' : ''}`}>
                    <label>Batch</label>
                    <Select
                        isMulti
                        name="stream"
                        options={withSelectAll(options.streams, "Batch")}
                        value={getValue('stream')}
                        onChange={(opts, meta) => handleSelectChange('stream', opts, meta)}
                        className="react-select-container"
                        isLoading={loadingFilters}
                        classNamePrefix="react-select"
                        placeholder="Select Batch..."
                        styles={customStyles}
                        isDisabled={loadingFilters || (filters.campus.length === 0 && !isRestricted)}
                    />
                </div>

                {/* Test_Type Select */}
                <div className={`filter-group ${loadingFilters || filters.stream.length === 0 ? 'disabled-logic' : ''}`}>
                    <label>Test_Type</label>
                    <Select
                        isMulti
                        name="testType"
                        options={withSelectAll(options.testTypes, "Test_Type")}
                        value={getValue('testType')}
                        onChange={(opts, meta) => handleSelectChange('testType', opts, meta)}
                        className="react-select-container"
                        isLoading={loadingFilters}
                        classNamePrefix="react-select"
                        placeholder="Select Test_Type..."
                        styles={customStyles}
                        isDisabled={loadingFilters || filters.stream.length === 0}
                    />
                </div>

                {/* Test Select */}
                <div className={`filter-group ${loadingFilters || filters.testType.length === 0 ? 'disabled-logic' : ''}`}>
                    <label>Test</label>
                    <Select
                        isMulti
                        name="test"
                        options={withSelectAll(options.tests, "Tests")}
                        value={getValue('test')}
                        onChange={(opts, meta) => handleSelectChange('test', opts, meta)}
                        className="react-select-container"
                        isLoading={loadingFilters}
                        classNamePrefix="react-select"
                        placeholder="Select Test..."
                        styles={customStyles}
                        isDisabled={loadingFilters || filters.testType.length === 0}
                    />
                </div>

                {/* Top_ALL Select */}
                <div className={`filter-group ${loadingFilters || filters.test.length === 0 ? 'disabled-logic' : ''}`}>
                    <label>Top_ALL</label>
                    <Select
                        isMulti
                        name="topAll"
                        options={withSelectAll(options.topAll || [], "Top_ALL")}
                        value={getValue('topAll')}
                        onChange={(opts, meta) => handleSelectChange('topAll', opts, meta)}
                        className="react-select-container"
                        isLoading={loadingFilters}
                        classNamePrefix="react-select"
                        placeholder="Select Top_ALL..."
                        styles={customStyles}
                        isDisabled={loadingFilters || filters.test.length === 0}
                    />
                </div>

                {/* Student Name Select */}
                <div className={`filter-group wide-filter ${loadingStudents || filters.test.length === 0 ? 'disabled-logic' : ''}`}>
                    <label>Student Name</label>
                    <Select
                        isMulti
                        name="studentSearch"
                        options={studentOptions}
                        value={getValue('studentSearch')}
                        onChange={(opts, meta) => handleSelectChange('studentSearch', opts, meta)}
                        className="react-select-container"
                        isLoading={loadingStudents}
                        classNamePrefix="react-select"
                        placeholder="Select Students..."
                        styles={compactStyles}
                        isDisabled={loadingStudents || filters.test.length === 0}
                    />
                </div>

            </div>
        </div>
    );
};

export default FilterBar;
