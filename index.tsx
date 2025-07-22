
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const { useState, useEffect, useMemo, useCallback, useRef } = React;

declare global {
    interface Window {
        csCalcAppInitialized: boolean;
    }
}

// --- CONSTANTS ---
const DATA_VERSION = 2; // Increment this when data structure changes
const CURRENCY_ITEMS = {
    juhwa: '주화',
    quartz: '쿼츠',
    relicBinary: '렐릭 바이너리 (렐바)',
    setBinary: '세트 바이너리 (셋바)',
    tuningBinary: '튜닝 바이너리 (튜바)',
    simTicket: '기채권',
    recruitCoupon: '채용권',
    specialCore: '특수융합핵 (특융핵)',
    fusionCore: '융합핵'
};

const PRICE_CURRENCIES = {
    KRW: '현금 (KRW)',
    juhwa: '주화',
    quartz: '쿼츠'
};

const DEFAULT_RATES = {
    krwPerJuhwa: 15,
    quartzPerJuhwa: 2,
    relicBinaryInJuhwa: 26.4,
    setBinaryInJuhwa: 15,
    tuningBinaryInJuhwa: 3.1,
    simTicketInJuhwa: 10,
    recruitCouponInJuhwa: 75, // 150 쿼츠
    specialCoreInJuhwa: 300,
    fusionCoreInJuhwa: 59,
};

// --- HELPER FUNCTIONS ---
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

function formatEfficiency(efficiency) {
    if (efficiency === Infinity) return 'MAX';
    return `${formatNumber(efficiency)}%`;
}

function resizeImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target || typeof event.target.result !== 'string') {
                return reject(new Error('Failed to read file as data URL'));
            }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const getSortableDate = (dateString) => {
    if (dateString === '상시') return Number.MAX_SAFE_INTEGER;
    if (dateString === '준상시') return Number.MAX_SAFE_INTEGER - 1;
    const date = new Date(dateString).getTime();
    return isNaN(date) ? -Infinity : date;
};

function filterAndSortPackages({ packages, filters, comprehensive, sortMethod }) {
    const activeFilters = Object.keys(filters).filter(key => filters[key]);

    const filtered = packages.filter(pkg => {
        if (activeFilters.length === 0) return true;

        const pkgItemTypes = new Set(pkg.items.map(item => item.type));
        
        if (comprehensive) {
            // Inclusive search: package must contain all selected filters
            return activeFilters.every(filterType => pkgItemTypes.has(filterType));
        } else {
            // Exact match: package items must be identical to selected filters
            if (pkgItemTypes.size !== activeFilters.length) return false;
            return activeFilters.every(filterType => pkgItemTypes.has(filterType));
        }
    });

    // Use spread to create a shallow copy before sorting to avoid mutating the original array
    return [...filtered].sort((a, b) => {
        if (sortMethod === 'efficiency') {
            return b.efficiency - a.efficiency;
        }
        // Default to 'date' sort
        const dateA = getSortableDate(a.saleDate);
        const dateB = getSortableDate(b.saleDate);
        return dateB - dateA;
    });
}


// --- CUSTOM HOOK for LocalStorage ---
function useLocalStorage(key, initialValue) {
    const [storedValue, setStoredValue] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(error);
            return initialValue;
        }
    });

    const setValue = (value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
            console.error(error);
            // Re-throw the error so calling components can handle it (e.g., QuotaExceededError)
            throw error;
        }
    };

    return [storedValue, setValue];
}

// --- CALCULATION LOGIC ---
function calculateJuhwaValue(item, rates) {
    let totalJuhwaValue = 0;
    if(item.priceCurrency) { // It's a price item
        switch(item.priceCurrency) {
            case 'KRW':
                totalJuhwaValue = rates.krwPerJuhwa > 0 ? item.priceAmount / rates.krwPerJuhwa : 0;
                break;
            case 'juhwa':
                totalJuhwaValue = item.priceAmount;
                break;
            case 'quartz':
                totalJuhwaValue = rates.quartzPerJuhwa > 0 ? item.priceAmount / rates.quartzPerJuhwa : 0;
                break;
        }
    } else { // It's a package content item
        switch (item.type) {
            case 'juhwa': totalJuhwaValue = item.quantity; break;
            case 'quartz': totalJuhwaValue = rates.quartzPerJuhwa > 0 ? item.quantity / rates.quartzPerJuhwa : 0; break;
            case 'relicBinary': totalJuhwaValue = item.quantity * rates.relicBinaryInJuhwa; break;
            case 'setBinary': totalJuhwaValue = item.quantity * rates.setBinaryInJuhwa; break;
            case 'tuningBinary': totalJuhwaValue = item.quantity * rates.tuningBinaryInJuhwa; break;
            case 'simTicket': totalJuhwaValue = item.quantity * rates.simTicketInJuhwa; break;
            case 'recruitCoupon': totalJuhwaValue = item.quantity * rates.recruitCouponInJuhwa; break;
            case 'specialCore': totalJuhwaValue = item.quantity * rates.specialCoreInJuhwa; break;
            case 'fusionCore': totalJuhwaValue = item.quantity * rates.fusionCoreInJuhwa; break;
        }
    }
    return totalJuhwaValue;
}

// --- UI COMPONENTS ---

const PackageContents = ({ items, nonQuantifiableItems }) => {
    const children = [];
    const quantifiableItems = items.filter(i => i && typeof i.quantity === 'number' && i.quantity > 0);

    if (quantifiableItems.length > 0) {
        quantifiableItems.forEach((item, index) => {
            children.push(`${CURRENCY_ITEMS[item.type]} ${formatNumber(item.quantity)}개`);
            if (index < quantifiableItems.length - 1) {
                children.push(', ');
            }
        });
    }

    if (nonQuantifiableItems && nonQuantifiableItems.trim()) {
        if (children.length > 0) {
            children.push(', ');
        }
        const spanProps = { key: 'nq-item', className: 'non-quantifiable-item-text' };
        children.push(React.createElement('span', spanProps, nonQuantifiableItems));
    }

    if (children.length === 0) {
        return '-';
    }

    return React.createElement('span', null, ...children);
};


const ToastContainer = ({ toast, onDismiss }) => {
    if (!toast) return null;
    return React.createElement('div', { className: `toast-container ${toast ? 'visible' : ''}` },
        React.createElement('div', { className: `toast ${toast.type}` },
            toast.message,
            React.createElement('button', { className: 'toast-dismiss', onClick: onDismiss }, '×')
        )
    );
};

const ConfirmModal = ({ isOpen, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    return React.createElement('div', { className: 'modal-backdrop' },
        React.createElement('div', { className: 'modal-content' },
            React.createElement('p', { className: 'modal-message' }, message),
            React.createElement('div', { className: 'modal-actions' },
                React.createElement('button', { className: 'button button-outline', onClick: onCancel }, '취소'),
                React.createElement('button', { className: 'button button-danger', onClick: onConfirm }, '삭제')
            )
        )
    );
};

const ImportConfirmModal = ({ isOpen, onMerge, onReplace, onCancel }) => {
    if (!isOpen) return null;

    return React.createElement('div', { className: 'modal-backdrop' },
        React.createElement('div', { className: 'modal-content' },
            React.createElement('h3', { className: 'modal-title' }, '데이터 가져오기'),
            React.createElement('p', { className: 'modal-message' }, '선택한 파일의 데이터를 현재 데이터베이스와 병합하거나, 완전히 교체할 수 있습니다.'),
            React.createElement('p', { className: 'modal-warning' }, '주의: "교체"는 현재 저장된 모든 데이터를 삭제합니다.'),
            React.createElement('div', { className: 'modal-actions' },
                React.createElement('button', { className: 'button', onClick: onMerge }, '병합'),
                React.createElement('button', { className: 'button button-danger', onClick: onReplace }, '교체'),
                React.createElement('button', { className: 'button button-outline', onClick: onCancel }, '취소')
            )
        )
    );
};


const Header = ({ currentView, setCurrentView }) => {
    return React.createElement('header', { className: 'header' },
        React.createElement('div', { className: 'version-info' },
            React.createElement('span', null, 'Version: 1.0.1'),
            React.createElement('span', null, 'Last Updated: 2025.7.7')
        ),
        React.createElement('h1', null, '편의점 아포칼립스 영업비밀 계산기'),
        React.createElement('nav', { className: 'nav-tabs' },
            React.createElement('button', {
                className: `tab-button ${currentView === 'calculator' ? 'active' : ''}`,
                onClick: () => setCurrentView('calculator')
            }, '계산기'),
            React.createElement('button', {
                className: `tab-button ${currentView === 'database' ? 'active' : ''}`,
                onClick: () => setCurrentView('database')
            }, '데이터베이스'),
            React.createElement('button', {
                className: `tab-button ${currentView === 'settings' ? 'active' : ''}`,
                onClick: () => setCurrentView('settings')
            }, '설정')
        )
    );
};

const SettingsView = ({ rates, onSave, isUpdatingDb }) => {
    const [localRates, setLocalRates] = useState(() => 
        Object.entries(rates).reduce((acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
        }, {})
    );

    const handleChange = (key, value) => {
        setLocalRates(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        const parsedRates = {};
        for (const key in localRates) {
            parsedRates[key] = parseFloat(localRates[key]) || 0;
        }
        onSave(parsedRates);
    };

    const getLabelText = (key) => {
        if (key === 'krwPerJuhwa') return '1 주화의 현금(KRW) 가치';
        if (key === 'quartzPerJuhwa') return '1 주화 당 쿼츠 개수';
        const itemKey = key.replace('InJuhwa', '');
        return `1 ${CURRENCY_ITEMS[itemKey]} 의 주화 가치`;
    };

    return React.createElement('div', { className: 'card' },
        React.createElement('h2', null, '재화 가치 설정 (정가 기준)'),
        React.createElement('div', { className: 'settings-view' },
            Object.keys(DEFAULT_RATES).map(key => React.createElement('div', { key, className: 'form-group' },
                React.createElement('label', null, getLabelText(key)),
                React.createElement('input', {
                    type: 'text',
                    inputMode: 'decimal',
                    className: 'input',
                    value: localRates[key],
                    onChange: (evt) => handleChange(key, evt.target.value)
                })
            ))
        ),
        React.createElement('button', { 
            className: 'button button-primary', 
            style: {marginTop: '1.5rem'}, 
            onClick: handleSave,
            disabled: isUpdatingDb
        }, isUpdatingDb ? '업데이트 중...' : '설정 저장'),
        React.createElement('div', { className: 'settings-footer' },
            React.createElement('p', null, 'Made by 이하늘'),
            React.createElement('p', null, 'Special Thanks: Gemini')
        )
    );
};

const FilterControls = ({
    filters,
    onFilterChange,
    comprehensiveSearch,
    onComprehensiveSearchChange
}) => {
    return React.createElement('div', null,
        React.createElement('div', { className: 'filter-header' },
            React.createElement('label', null, '구성품 필터'),
            React.createElement('label', { className: 'filter-checkbox comprehensive-search-label' },
                React.createElement('input', { type: 'checkbox', checked: comprehensiveSearch, onChange: onComprehensiveSearchChange }),
                ' 포괄 검색'
            )
        ),
        React.createElement('p', { className: 'filter-description' }, '기본: 선택한 재화와 정확히 일치하는 구성의 패키지만 표시합니다.'),
        React.createElement('p', { className: 'filter-description sub-description' }, '우측 포괄 검색 체크 시: 선택한 재화를 포함하는 모든 패키지를 검색합니다.'),
        React.createElement('div', { className: 'related-filters' },
            Object.keys(CURRENCY_ITEMS).map(type => React.createElement('label', { key: `filter-${type}`, className: 'filter-checkbox' },
                React.createElement('input', { type: 'checkbox', checked: !!filters[type], onChange: () => onFilterChange(type) }),
                ` ${CURRENCY_ITEMS[type]}`
            ))
        )
    );
};

const SortControls = ({ sortMethod, setSortMethod }) => {
    return React.createElement('div', { className: 'sort-buttons' },
        React.createElement('button', { className: `button ${sortMethod === 'efficiency' ? 'active' : ''}`, onClick: () => setSortMethod('efficiency') }, '효율순'),
        React.createElement('button', { className: `button ${sortMethod === 'date' ? 'active' : ''}`, onClick: () => setSortMethod('date') }, '최신순')
    );
};

const DatabaseView = ({ database, setDatabase, showToast }) => {
    const [filters, setFilters] = useState({});
    const [comprehensiveSearch, setComprehensiveSearch] = useState(false);
    const [sortMethod, setSortMethod] = useState('date');
    const [modalState, setModalState] = useState({ isOpen: false, itemToDelete: null });
    const [importModalState, setImportModalState] = useState({ isOpen: false, importedData: null });
    const importFileRef = useRef(null);

    const handleFilterChange = useCallback((type) => {
        setFilters(prev => ({ ...prev, [type]: !prev[type] }));
    }, []);
    
    const handleComprehensiveSearchChange = useCallback(() => {
        setComprehensiveSearch(prev => !prev);
    }, []);

    const handleDeleteClick = (id) => {
        setModalState({ isOpen: true, itemToDelete: id });
    };

    const handleConfirmDelete = () => {
        if (modalState.itemToDelete) {
            setDatabase(db => db.filter(item => item.id !== modalState.itemToDelete));
        }
        setModalState({ isOpen: false, itemToDelete: null });
    };

    const handleCancelDelete = () => {
        setModalState({ isOpen: false, itemToDelete: null });
    };

    const handleExport = useCallback(() => {
        if (database.length === 0) {
            showToast('내보낼 데이터가 없습니다.', 'error');
            return;
        }
        try {
            const jsonString = JSON.stringify(database, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const today = new Date().toISOString().slice(0, 10);
            link.href = url;
            link.download = `cs-calc-database-${today}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showToast('데이터베이스를 파일로 내보냈습니다.');
        } catch (error) {
            showToast('데이터 내보내기에 실패했습니다.', 'error');
            console.error('Export failed:', error);
        }
    }, [database, showToast]);

    const handleImportClick = () => {
        importFileRef.current?.click();
    };
    
    const handleFileSelected = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                if (typeof text !== 'string') {
                    showToast('파일을 읽는 중 오류가 발생했습니다.', 'error');
                    return;
                }
                const data = JSON.parse(text);
                // Basic validation
                if (Array.isArray(data) && (data.length === 0 || (data[0].id && data[0].efficiency !== undefined))) {
                     setImportModalState({ isOpen: true, importedData: data });
                } else {
                    showToast('유효하지 않은 파일 형식입니다.', 'error');
                }
            } catch (error) {
                showToast('파일을 읽는 중 오류가 발생했습니다.', 'error');
                console.error('Import file read error:', error);
            } finally {
                // Reset file input value to allow re-importing the same file
                if(event.target) event.target.value = null;
            }
        };
        reader.readAsText(file);
    };

    const handleImportConfirm = (mode) => { // mode is 'merge' or 'replace'
        const { importedData } = importModalState;
        if (!importedData) return;

        if (mode === 'merge') {
            const existingIds = new Set(database.map(p => p.id));
            const newPackages = importedData.filter(p => !existingIds.has(p.id));
            const mergedDb = [...database, ...newPackages];
            setDatabase(mergedDb);
            showToast(`${newPackages.length}개의 새 항목을 병합했습니다.`, 'success');
        } else if (mode === 'replace') {
            setDatabase(importedData);
            showToast(`데이터베이스를 교체했습니다. (${importedData.length}개 항목)`, 'success');
        }
        setImportModalState({ isOpen: false, importedData: null });
    };
    
    const handleImportCancel = () => {
        setImportModalState({ isOpen: false, importedData: null });
    };
    
    const filteredAndSortedDatabase = useMemo(() => {
        return filterAndSortPackages({
            packages: database,
            filters,
            comprehensive: comprehensiveSearch,
            sortMethod
        });
    }, [database, filters, comprehensiveSearch, sortMethod]);

    const renderContent = () => {
        const placeholderProps = { className: 'placeholder' };
        if (database.length === 0) {
            return React.createElement('div', placeholderProps, '데이터베이스가 비어 있습니다. 첫 패키지를 계산하고 저장해보세요!');
        }
        if (filteredAndSortedDatabase.length === 0) {
            return React.createElement('div', placeholderProps, '조건에 맞는 데이터가 없습니다.');
        }
        return React.createElement('div', { className: 'table-container'}, React.createElement('table', { className: 'db-table' },
            React.createElement('thead', null, React.createElement('tr', null,
                React.createElement('th', null, '이미지'),
                React.createElement('th', null, '패키지명'),
                React.createElement('th', null, '가격'),
                React.createElement('th', null, '판매일'),
                React.createElement('th', null, '구성품'),
                React.createElement('th', null, '총 주화 환산 가치'),
                React.createElement('th', null, '효율'),
                React.createElement('th', null, '작업'),
            )),
            React.createElement('tbody', null, filteredAndSortedDatabase.map(pkg => {
                const efficiencyText = formatEfficiency(pkg.efficiency);
                let efficiencyClass = '';
                if (pkg.efficiency === Infinity) {
                    efficiencyClass = 'efficiency-max';
                } else if (pkg.efficiency >= 100) {
                    efficiencyClass = 'efficiency-good';
                } else if (pkg.efficiency < 100) {
                    efficiencyClass = 'efficiency-bad';
                }
                
                const tdProps = { className: 'items-cell' };

                return React.createElement('tr', { key: pkg.id },
                    React.createElement('td', null, pkg.image 
                        ? React.createElement('img', {src: pkg.image, alt: pkg.name, className: 'db-image'}) 
                        : 'N/A'
                    ),
                    React.createElement('td', null, pkg.name || '-'),
                    React.createElement('td', null, `${formatNumber(pkg.priceAmount)} ${PRICE_CURRENCIES[pkg.priceCurrency]}`),
                    React.createElement('td', null, pkg.saleDate),
                    React.createElement('td', tdProps, React.createElement(PackageContents, { items: pkg.items, nonQuantifiableItems: pkg.nonQuantifiableItems })),
                    React.createElement('td', null, formatNumber(pkg.totalJuhwaValue)),
                    React.createElement('td', { className: efficiencyClass }, efficiencyText),
                    React.createElement('td', null, React.createElement('button', { className: 'button button-danger', onClick: () => handleDeleteClick(pkg.id) }, '삭제'))
                )
            }))
        ));
    }

    return React.createElement('div', { className: 'card' },
        React.createElement(ConfirmModal, {
            isOpen: modalState.isOpen,
            message: '정말로 이 항목을 삭제하시겠습니까?',
            onConfirm: handleConfirmDelete,
            onCancel: handleCancelDelete
        }),
        React.createElement(ImportConfirmModal, {
            isOpen: importModalState.isOpen,
            onMerge: () => handleImportConfirm('merge'),
            onReplace: () => handleImportConfirm('replace'),
            onCancel: handleImportCancel
        }),
        React.createElement('input', {
            type: 'file',
            ref: importFileRef,
            onChange: handleFileSelected,
            style: { display: 'none' },
            accept: '.json,application/json'
        }),
        React.createElement('div', { className: 'db-header' },
            React.createElement('h2', null, '패키지 데이터베이스'),
            React.createElement('div', { className: 'db-actions' },
                React.createElement('button', { className: 'button button-outline', onClick: handleImportClick }, '가져오기'),
                React.createElement('button', { className: 'button button-outline', onClick: handleExport }, '내보내기'),
                React.createElement(SortControls, { sortMethod, setSortMethod })
            )
        ),
        React.createElement('div', { className: 'form-group filter-controls-container' },
            React.createElement(FilterControls, {
                filters,
                onFilterChange: handleFilterChange,
                comprehensiveSearch,
                onComprehensiveSearchChange: handleComprehensiveSearchChange
            })
        ),
        renderContent()
    );
};

const PackageInputCard = ({ 
    name, setName, priceAmount, setPriceAmount, priceCurrency, setPriceCurrency, 
    saleDate, setSaleDate, saleDateType, setSaleDateType,
    items, handleAddItem, handleRemoveItem, handleItemChange, 
    nonQuantifiableItems, setNonQuantifiableItems, handleCalculate,
    image, onImageSelect, imageInputRef, itemsListRef
}) => {
    const handleSaleDateTypeClick = (type) => {
        setSaleDateType(prev => (prev === type ? 'date' : type));
    };

    const cardProps = { className: 'card' };
    return React.createElement('div', cardProps,
        React.createElement('h2', null, '패키지 정보 입력'),
        React.createElement('div', { className: 'form-grid' },
            // --- 필수 항목 ---
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, '가격'),
                 React.createElement('div', { className: 'item-row' },
                    React.createElement('input', { type: 'number', className: 'input', value: priceAmount, onChange: e => setPriceAmount(e.target.value), placeholder: '예: 1000' }),
                    (() => {
                        const selectProps = { className: 'select', value: priceCurrency, onChange: e => setPriceCurrency(e.target.value) };
                        return React.createElement('select', selectProps,
                            Object.entries(PRICE_CURRENCIES).map(([key, text]) => React.createElement('option', { key, value: key }, text))
                        );
                    })()
                 )
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, '가치 계산 가능 구성품'),
                React.createElement('div', { className: 'item-list', ref: itemsListRef },
                    items.map((item) => {
                        const isInvalid = item.quantity !== '' && parseFloat(item.quantity) <= 0;
                        return React.createElement('div', { key: item.id, className: 'item-row', 'data-item-id': item.id },
                            React.createElement('select', { className: 'select', value: item.type, onChange: e => handleItemChange(item.id, 'type', e.target.value) },
                                Object.entries(CURRENCY_ITEMS).map(([key, text]) => React.createElement('option', { key, value: key }, text))
                            ),
                            React.createElement('input', { 
                                type: 'number', 
                                className: `input ${isInvalid ? 'input-invalid' : ''}`, 
                                value: item.quantity, 
                                onChange: e => handleItemChange(item.id, 'quantity', e.target.value), 
                                placeholder: '수량'
                            }),
                            items.length > 1 ? React.createElement('button', { className: 'button button-danger', onClick: () => handleRemoveItem(item.id) }, 'X') : null
                        );
                    }),
                    React.createElement('button', { className: 'button', onClick: handleAddItem, style:{marginTop:'0.5rem'} }, '+ 구성품 추가')
                )
            ),

            React.createElement('div', { className: 'section-divider', role: 'separator' }),

            // --- 선택 항목 ---
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, '계산 불가능 구성물 (선택)'),
                React.createElement('input', { type: 'text', className: 'input', value: nonQuantifiableItems, onChange: e => setNonQuantifiableItems(e.target.value), placeholder: '예: 각성 선택권 등' })
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, '패키지 이름 (선택)'),
                React.createElement('input', { type: 'text', className: 'input', value: name, onChange: e => setName(e.target.value), placeholder: '예: 월간 주화 패키지' })
            ),
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, '판매 날짜 (선택)'),
                React.createElement('div', { className: 'input-with-buttons' },
                    saleDateType === 'date' && React.createElement('input', {
                        type: 'date',
                        className: 'input',
                        value: saleDate,
                        onChange: e => setSaleDate(e.target.value)
                    }),
                    React.createElement('button', {
                        className: `button button-outline ${saleDateType === 'permanent' ? 'active' : ''}`,
                        onClick: () => handleSaleDateTypeClick('permanent')
                    }, '상시'),
                    React.createElement('button', {
                        className: `button button-outline ${saleDateType === 'semi-permanent' ? 'active' : ''}`,
                        onClick: () => handleSaleDateTypeClick('semi-permanent')
                    }, '준상시')
                )
            ),
             React.createElement('div', { className: 'form-group' },
                React.createElement('label', null, '패키지 이미지 (선택)'),
                React.createElement('input', {
                    type: 'file',
                    className: 'input',
                    accept: 'image/*',
                    onChange: onImageSelect,
                    ref: imageInputRef
                }),
                image && React.createElement('img', {
                    src: image,
                    alt: 'Package Preview',
                    className: 'image-preview'
                })
            )
        ),
        React.createElement('button', { className: 'button button-primary', style: {marginTop: '1.5rem'}, onClick: handleCalculate }, '효율 계산하기')
    );
};

const AnalysisResultCard = ({ result, dirty, nonQuantifiableItems, handleSaveToDb, isSaving }) => {
    if (!result) {
        return React.createElement('div', { className: 'card' },
            React.createElement('h2', null, '분석 결과'),
            React.createElement('div', { className: 'placeholder' }, '패키지 정보를 입력하고 "효율 계산하기"를 눌러주세요.')
        );
    }
    
    if (dirty) {
        return React.createElement('div', { className: 'card' },
            React.createElement('h2', null, '분석 결과'),
            React.createElement('div', { className: 'placeholder' }, '입력값이 변경되었습니다. 다시 계산해주세요.')
        );
    }

    let efficiencyText, efficiencyClass = '';
    efficiencyText = formatEfficiency(result.efficiency);
    if (result.efficiency === Infinity) {
         efficiencyClass = 'efficiency-max';
    } else if (result.efficiency >= 100) {
        efficiencyClass = 'efficiency-good';
    } else {
        efficiencyClass = 'efficiency-bad';
    }

    return React.createElement('div', { className: 'card' },
        React.createElement('h2', null, '분석 결과'),
        React.createElement('div', { className: 'results-card' },
            React.createElement('div', { className: 'result-item' },
                React.createElement('span', null, '총 주화 환산 가치'),
                React.createElement('span', null, `${formatNumber(result.totalItemValueInJuhwa)} 주화`)
            ),
            React.createElement('div', { className: 'result-item' },
                React.createElement('span', null, '정가 대비 효율'),
                React.createElement('span', { className: efficiencyClass }, efficiencyText)
            ),
            nonQuantifiableItems.trim() && React.createElement('div', { className: 'result-item' },
                React.createElement('span', null, ...[
                    '\'',
                    React.createElement('span', { key: 'nq-text', className: 'non-quantifiable-item-text' }, nonQuantifiableItems),
                    '\'의 실 구매가'
                ]),
                React.createElement('span', null, `${formatNumber(result.nonQuantifiableValue)} 주화`)
            ),
            React.createElement('button', { 
                className: 'button', 
                style: {marginTop: '1.5rem'}, 
                onClick: handleSaveToDb,
                disabled: isSaving
            }, isSaving ? '저장 중...' : 'DB에 저장')
        )
    );
};

const RelatedPackagesCard = ({ 
    result, dirty, relatedPackages, 
    relatedFilters, handleFilterChange, 
    comprehensiveSearch, handleComprehensiveSearchChange,
    sortMethod, setSortMethod
}) => {
    const itemContainerStyle = { marginTop: '1rem' };
    const headerStyle = { border: 'none', marginBottom: 0 };
    const placeholderWithPaddingStyle = { padding: '1rem' };

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'related-package-header' },
            React.createElement('h2', { style: headerStyle }, '연관 패키지 분석'),
            React.createElement(SortControls, { sortMethod, setSortMethod })
        ),
        (!result || dirty)
            ? React.createElement('div', { className: 'placeholder' }, '계산 후 여기에 유사한 패키지가 표시됩니다.')
            : React.createElement('div', null,
                 React.createElement('div', { className: 'form-group filter-controls-container', style: itemContainerStyle },
                    React.createElement(FilterControls, {
                        filters: relatedFilters,
                        onFilterChange: handleFilterChange,
                        comprehensiveSearch,
                        onComprehensiveSearchChange: handleComprehensiveSearchChange
                    })
                ),
                React.createElement('div', { className: 'item-list', style: itemContainerStyle },
                    relatedPackages.length > 0
                        ? relatedPackages.map(pkg => {
                            let efficiencyComparisonEl = null;
                            if (result !== null) {
                                if (pkg.efficiency > result.efficiency) {
                                    efficiencyComparisonEl = React.createElement('span', { className: 'efficiency-higher' }, '(효율 높음)');
                                } else if (pkg.efficiency < result.efficiency) {
                                    efficiencyComparisonEl = React.createElement('span', { className: 'efficiency-lower' }, '(효율 낮음)');
                                }
                            }
                            
                            let efficiencyBadgeClass = '';
                            if (pkg.efficiency === Infinity) {
                                efficiencyBadgeClass = 'efficiency-max';
                            } else if (pkg.efficiency >= 100) {
                                efficiencyBadgeClass = 'efficiency-good';
                            } else if (pkg.efficiency < 100) {
                                efficiencyBadgeClass = 'efficiency-bad';
                            }
                            
                            const spanProps = { className: efficiencyBadgeClass };
                            const pProps = { className: 'items-cell' };

                            return React.createElement('div', { key: pkg.id, className: 'related-package-item' },
                                pkg.image && React.createElement('img', { src: pkg.image, alt: pkg.name, className: 'related-package-image' }),
                                React.createElement('div', { className: 'related-package-content' },
                                    React.createElement('div', { className: 'result-item' },
                                        React.createElement('h4', null,
                                            pkg.name,
                                            efficiencyComparisonEl ? ' ' : null,
                                            efficiencyComparisonEl
                                        ),
                                        React.createElement('span', spanProps, formatEfficiency(pkg.efficiency))
                                    ),
                                    React.createElement('p', pProps,
                                        `${pkg.saleDate} | `,
                                        React.createElement(PackageContents, { key: 'contents', items: pkg.items, nonQuantifiableItems: pkg.nonQuantifiableItems })
                                    )
                                )
                            );
                        })
                        : React.createElement('p', { className: 'placeholder', style: placeholderWithPaddingStyle }, '일치하는 패키지가 없습니다.')
                )
            )
    );
};


const CalculatorView = ({ rates, database, addPackageToDb, showToast }) => {
    // Input state
    const [name, setName] = useState('');
    const [priceAmount, setPriceAmount] = useState('');
    const [priceCurrency, setPriceCurrency] = useState('juhwa');
    const [items, setItems] = useState([{ id: generateId(), type: 'juhwa', quantity: '' }]);
    const [nonQuantifiableItems, setNonQuantifiableItems] = useState('');
    const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
    const [saleDateType, setSaleDateType] = useState('date'); // 'date', 'permanent', 'semi-permanent'
    const [image, setImage] = useState(null);
    const imageInputRef = useRef(null);
    const itemsListRef = useRef(null);
    
    // Result and related packages state
    const [result, setResult] = useState(null);
    const [dirty, setDirty] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [relatedPackages, setRelatedPackages] = useState([]);
    const [relatedFilters, setRelatedFilters] = useState({});
    const [comprehensiveSearch, setComprehensiveSearch] = useState(false);
    const [sortMethod, setSortMethod] = useState('efficiency');
    
    useEffect(() => {
        setDirty(true);
    }, [name, priceAmount, priceCurrency, items, nonQuantifiableItems, saleDate, saleDateType, image]);

    const handleAddItem = useCallback(() => {
        const lastItem = items[items.length - 1];
        const newItemType = lastItem ? lastItem.type : 'juhwa';
        const newItemId = generateId();
        
        const newItem = { id: newItemId, type: newItemType, quantity: '' };
        setItems(prevItems => [...prevItems, newItem]);

        // Wait for the DOM to update, then scroll and focus
        setTimeout(() => {
            if (itemsListRef.current) {
                const newItemElement = itemsListRef.current.querySelector(`[data-item-id="${newItemId}"]`);
                if (newItemElement) {
                    newItemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    const input = newItemElement.querySelector('input[type="number"]');
                    if (input) {
                        input.focus();
                    }
                }
            }
        }, 0);
    }, [items]);

    const handleRemoveItem = (id) => {
        setItems(items.filter(item => item.id !== id));
    };
    const handleItemChange = (id, field, value) => {
        setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const handleImageSelect = async (evt) => {
        const file = evt.target.files[0];
        if (file) {
            try {
                if (!name.trim()) {
                    const fileName = file.name;
                    const lastDot = fileName.lastIndexOf('.');
                    const fileNameWithoutExt = (lastDot === -1) ? fileName : fileName.substring(0, lastDot);
                    setName(fileNameWithoutExt);
                }
                const resizedImage = await resizeImage(file, 150, 300, 0.7);
                setImage(resizedImage);
            } catch (error) {
                console.error("Image resize error:", error);
                showToast("이미지를 처리하는 중 오류가 발생했습니다.", "error");
            }
        }
    };

    const handleCalculate = () => {
        const parsedItems = items
            .map(i => ({...i, quantity: parseFloat(i.quantity)}))
            .filter(i => !isNaN(i.quantity) && i.quantity > 0);
            
        if (parsedItems.length === 0 && !nonQuantifiableItems.trim()) {
            showToast('계산할 구성품을 하나 이상 입력해주세요.', 'error');
            return;
        }

        const price = { priceAmount: parseFloat(priceAmount) || 0, priceCurrency };
        
        if (price.priceAmount < 0) {
            showToast('가격은 0 이상이어야 합니다.', 'error');
            return;
        }
        
        const priceInJuhwa = calculateJuhwaValue(price, rates);
        const totalItemValueInJuhwa = parsedItems.reduce((sum, item) => sum + calculateJuhwaValue(item, rates), 0);
        
        const efficiency = priceInJuhwa > 0 
            ? (totalItemValueInJuhwa / priceInJuhwa) * 100 
            : (totalItemValueInJuhwa > 0 ? Infinity : 0);
        
        const nonQuantifiableValue = Math.max(0, priceInJuhwa - totalItemValueInJuhwa);

        setResult({
            parsedItems,
            totalItemValueInJuhwa,
            efficiency,
            nonQuantifiableValue,
            priceInJuhwa,
        });

        const itemsInPackage = new Set(parsedItems.map(item => item.type));
        const initialFilters = Object.keys(CURRENCY_ITEMS).reduce((acc, type) => {
            acc[type] = itemsInPackage.has(type);
            return acc;
        }, {});
        setRelatedFilters(initialFilters);
        setDirty(false);
    };
    
    const handleSaveToDb = () => {
        if (!result || dirty || isSaving) {
            if (!result) showToast('먼저 계산을 실행해주세요.', 'error');
            if (dirty) showToast('입력값이 변경되었습니다. 다시 계산 후 저장해주세요.', 'error');
            return;
        }
        
        setIsSaving(true);

        try {
            const finalSaleDate = saleDateType === 'date'
                ? saleDate
                : (saleDateType === 'permanent' ? '상시' : '준상시');

            const newPackage = {
                id: generateId(),
                name,
                priceAmount: parseFloat(priceAmount) || 0,
                priceCurrency,
                saleDate: finalSaleDate,
                items: result.parsedItems,
                nonQuantifiableItems,
                totalJuhwaValue: result.totalItemValueInJuhwa,
                efficiency: result.efficiency,
                image,
            };
            addPackageToDb(newPackage);
            showToast('패키지가 데이터베이스에 저장되었습니다.');

            // Reset form for next entry
            setName('');
            setPriceAmount('');
            setPriceCurrency('juhwa');
            setItems([{ id: generateId(), type: 'juhwa', quantity: '' }]);
            setNonQuantifiableItems('');
            setSaleDate(new Date().toISOString().slice(0, 10));
            setSaleDateType('date');
            setImage(null);
            if (imageInputRef.current) {
                imageInputRef.current.value = null;
            }
            setResult(null);
            setRelatedPackages([]);
            setRelatedFilters({});
            setComprehensiveSearch(false);
            setDirty(true);
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                 showToast('저장 공간이 가득 찼습니다. 데이터베이스에서 오래된 항목을 삭제해주세요.', 'error');
            } else {
                showToast('데이터 저장에 실패했습니다. 콘솔을 확인해주세요.', 'error');
                console.error("Failed to save to DB:", error);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleFilterChange = useCallback((type) => {
        setRelatedFilters(prev => ({...prev, [type]: !prev[type]}));
    }, []);

    const handleComprehensiveSearchChange = useCallback(() => {
        setComprehensiveSearch(prev => !prev);
    }, []);

    useEffect(() => {
        if (!result || dirty) {
            if(relatedPackages.length > 0) setRelatedPackages([]);
            return;
        };
        
        const sorted = filterAndSortPackages({
            packages: database,
            filters: relatedFilters,
            comprehensive: comprehensiveSearch,
            sortMethod
        });
        setRelatedPackages(sorted);

    }, [result, dirty, relatedFilters, database, sortMethod, comprehensiveSearch]);
    
    return React.createElement('div', { className: 'calculator-view' },
        React.createElement(PackageInputCard, {
            name, setName, priceAmount, setPriceAmount, priceCurrency, setPriceCurrency,
            saleDate, setSaleDate, saleDateType, setSaleDateType,
            items, handleAddItem, handleRemoveItem, handleItemChange,
            nonQuantifiableItems, setNonQuantifiableItems, handleCalculate,
            image, onImageSelect: handleImageSelect, imageInputRef, itemsListRef
        }),
        React.createElement(AnalysisResultCard, { result, dirty, nonQuantifiableItems, handleSaveToDb, isSaving }),
        React.createElement(RelatedPackagesCard, { 
            result, dirty, relatedPackages, 
            relatedFilters, handleFilterChange, 
            comprehensiveSearch, handleComprehensiveSearchChange, 
            sortMethod, setSortMethod
        })
    );
};


// --- Main App Component ---
function App() {
    const [currentView, setCurrentView] = useState('calculator');
    const [rates, setRates] = useLocalStorage('cs-calc-rates', DEFAULT_RATES);
    const [database, setDatabase] = useLocalStorage('cs-calc-db', []);
    const [isInitializing, setIsInitializing] = useState(true);
    const [toast, setToast] = useState(null);
    const [isUpdatingDb, setIsUpdatingDb] = useState(false);
    const toastTimerRef = useRef(null);
    
    const showToast = useCallback((message, type = 'success', duration = 3000) => {
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
        }
        setToast({ message, type });
        if (duration !== null) {
            toastTimerRef.current = setTimeout(() => {
                setToast(null);
                toastTimerRef.current = null;
            }, duration);
        }
    }, []);

    // Initial database loading
    useEffect(() => {
        const initializeDatabase = async () => {
            const localDbRaw = window.localStorage.getItem('cs-calc-db');
            if (localDbRaw === null) { // Key doesn't exist, it's a first-time visit
                showToast('초기 데이터베이스를 불러옵니다...', 'info', null);
                try {
                    const response = await fetch('./database.json'); // Fetches from the public folder
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const initialData = await response.json();
                    setDatabase(initialData);
                    // Manually dismiss the loading toast before showing the success one
                    dismissToast();
                    showToast('초기 데이터베이스를 성공적으로 불러왔습니다.', 'success');
                } catch (error) {
                    console.error("Failed to fetch initial database:", error);
                    // Manually dismiss the loading toast before showing the error one
                    dismissToast();
                    showToast('초기 데이터베이스를 불러오는데 실패했습니다.', 'error');
                    setDatabase([]); // Fallback to an empty array
                }
            }
            setIsInitializing(false);
        };
        initializeDatabase();
    }, []); // Empty dependency array, runs only once on mount

    const dismissToast = () => {
        if (toastTimerRef.current) {
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
        }
        setToast(null);
    };

    const addPackageToDb = useCallback((newPackage) => {
        setDatabase(prevDb => {
            const newDb = [newPackage, ...prevDb];
            return newDb.sort((a, b) => getSortableDate(b.saleDate) - getSortableDate(a.saleDate));
        });
    }, [setDatabase]);

    const handleRatesUpdate = useCallback((newRates) => {
        if (newRates.krwPerJuhwa <= 0 || newRates.quartzPerJuhwa <= 0) {
            showToast('주요 환율(KRW, 쿼츠) 값은 0보다 커야 합니다.', 'error');
            return;
        }
        
        setIsUpdatingDb(true);
        showToast('데이터베이스를 업데이트하는 중...', 'info', null);

        setTimeout(() => {
            try {
                setRates(newRates);
                setDatabase(prevDb => {
                    return prevDb.map(pkg => {
                        const priceInJuhwa = calculateJuhwaValue(
                            { priceAmount: pkg.priceAmount, priceCurrency: pkg.priceCurrency },
                            newRates
                        );
                        const totalItemValueInJuhwa = pkg.items.reduce(
                            (sum, item) => sum + calculateJuhwaValue(item, newRates), 0
                        );
                        
                        const efficiency = priceInJuhwa > 0 
                            ? (totalItemValueInJuhwa / priceInJuhwa) * 100 
                            : (totalItemValueInJuhwa > 0 ? Infinity : 0);

                        return {
                            ...pkg,
                            totalJuhwaValue: totalItemValueInJuhwa,
                            efficiency: efficiency,
                        };
                    });
                });
                dismissToast();
                showToast('설정이 저장되었으며, 데이터베이스가 새로운 환율로 업데이트되었습니다.');
            } catch(error) {
                if (error.name === 'QuotaExceededError') {
                     showToast('저장 공간 부족으로 설정을 업데이트할 수 없습니다.', 'error');
                } else {
                    showToast('설정 업데이트에 실패했습니다. 콘솔을 확인해주세요.', 'error');
                    console.error("Failed to update settings:", error);
                }
            } finally {
                setIsUpdatingDb(false);
                if (toast && toast.type === 'info') {
                    dismissToast();
                }
            }
        }, 50);
    }, [rates, setRates, setDatabase, showToast, toast]);

    const renderView = () => {
        switch (currentView) {
            case 'calculator':
                return React.createElement(CalculatorView, { rates, database, addPackageToDb, showToast });
            case 'database':
                return React.createElement(DatabaseView, { database, setDatabase, showToast });
            case 'settings':
                return React.createElement(SettingsView, { rates, onSave: handleRatesUpdate, isUpdatingDb });
            default:
                return React.createElement(CalculatorView, { rates, database, addPackageToDb, showToast });
        }
    };
    
    if (isInitializing) {
        return React.createElement('div', {
            className: 'placeholder',
            style: {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: 'calc(100vh - 2rem)',
                fontSize: '1.2rem'
            }
        }, '데이터베이스를 불러오는 중입니다...');
    }


    return React.createElement('div', { className: 'app-container' },
        React.createElement(Header, { currentView, setCurrentView }),
        React.createElement('main', null, renderView()),
        React.createElement(ToastContainer, { toast, onDismiss: dismissToast })
    );
}

// Ensure we don't try to render to a container that already has a root.
if (typeof window.csCalcAppInitialized === 'undefined') {
    window.csCalcAppInitialized = true;
    const container = document.getElementById('root');
    if (container) {
        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(App));
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').then(registration => {
            console.log('SW registered: ', registration);
        }).catch(registrationError => {
            console.log('SW registration failed: ', registrationError);
        });
    });
}

export {};
