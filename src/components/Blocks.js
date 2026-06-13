import { __ } from '@wordpress/i18n';
import { useRef, useEffect, useState } from '@wordpress/element';

// -----------------------------
// 1. CHECKLIST BLOCK
// -----------------------------
export const ChecklistBlock = ({ block, updateBlock, isEditMode }) => {
    // 1. State to track which item's category dropdown is open
    const [focusedCatId, setFocusedCatId] = useState(null);
    const items = block.items || [];

    // 2. Get categories ONLY from this specific block
    const blockCategories = [...new Set(
        items.map(i => i.category).filter(cat => cat && cat.trim() !== '')
    )].sort();
    const inputRefs = useRef([]);
    const [nextFocusIndex, setNextFocusIndex] = useState(null);

    useEffect(() => {
        if (nextFocusIndex !== null && inputRefs.current[nextFocusIndex]) {
            inputRefs.current[nextFocusIndex].focus();
            setNextFocusIndex(null);
        }
    }, [items, nextFocusIndex]);

    const handleAddItem = (currentIndex) => {
        let inheritedCategory = '';
        if (currentIndex !== undefined && items[currentIndex]) {
            inheritedCategory = items[currentIndex].category || '';
        } else if (items.length > 0) {
            inheritedCategory = items[items.length - 1].category || '';
        }

        const newItem = { id: Date.now(), text: '', category: inheritedCategory, completed: false };
        const newItems = [...items];

        if (currentIndex !== undefined) {
            newItems.splice(currentIndex + 1, 0, newItem);
            setNextFocusIndex(currentIndex + 1);
        } else {
            newItems.push(newItem);
            setNextFocusIndex(newItems.length - 1);
        }

        updateBlock(block.id, { items: newItems });
    };

    const handleToggleItem = (itemId, currentCompleted) => {
        const newItems = items.map(item => item.id === itemId ? { ...item, completed: !currentCompleted } : item);
        updateBlock(block.id, { items: newItems }, true);
    };

    const handleUpdateField = (itemId, field, newValue) => {
        const newItems = items.map(item => item.id === itemId ? { ...item, [field]: newValue } : item);
        updateBlock(block.id, { items: newItems });
    };

    const handleKeyDown = (e, index) => {
        if (!isEditMode) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddItem(index);
        } else if (e.key === 'Backspace' && items[index].text === '' && items[index].category === '') {
            e.preventDefault();
            if (items.length > 1) {
                const newItems = items.filter((_, i) => i !== index);
                updateBlock(block.id, { items: newItems });
                setNextFocusIndex(index > 0 ? index - 1 : 0);
            }
        }
    };

    const groupedItems = items.reduce((acc, item) => {
        const cat = (item.category || '').trim();
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});

    const sortedCats = Object.keys(groupedItems).sort((a, b) => {
        if (a === '') return 1;
        if (b === '') return -1;
        return a.localeCompare(b);
    });

    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '15px', backgroundColor: '#f8fafc', textAlign: 'left' }}>
            <style>{`.responsive-center { text-align: left; } @media (min-width: 768px) { .responsive-center { text-align: center; } }`}</style>
            
            <h4 className="responsive-center" style={{ margin: '0 0 15px 0', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>
                {__('Checklist', 'family-notebook')}
            </h4>
                        
            {isEditMode ? (
                items.map((item, index) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '15px', paddingBottom: '12px', borderBottom: '1px dashed #e2e8f0' }}>
                        
                        <input type="checkbox" disabled style={{ transform: 'scale(1.2)', flexShrink: 0, opacity: 0.5, marginTop: '8px' }} />
                        
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '6px' }}>
                            <input 
                                type="text" 
                                ref={el => inputRefs.current && (inputRefs.current[index] = el)}
                                value={item.text} 
                                onChange={(e) => handleUpdateField(item.id, 'text', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, index)}
                                placeholder={__("Task description...", 'family-notebook')}
                                style={{ width: '100%', border: 'none', borderBottom: '1px dashed #cbd5e1', background: 'transparent', outline: 'none', fontSize: '16px', padding: '4px 0', color: '#0f172a' }}
                            />
                            
                            {/* CUSTOM DROPDOWN CONTAINER */}
                            <div style={{ position: 'relative', width: '100%', maxWidth: '180px' }}>
                                <input 
                                    type="text" 
                                    placeholder={__("+ Add Category (optional)", 'family-notebook')}
                                    value={item.category || ''} 
                                    onChange={(e) => handleUpdateField(item.id, 'category', e.target.value)}
                                    onFocus={() => setFocusedCatId(item.id)}
                                    onBlur={() => setTimeout(() => setFocusedCatId(null), 150)}
                                    style={{ width: '100%', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 8px', outline: 'none', backgroundColor: '#f1f5f9', color: '#64748b', boxSizing: 'border-box' }}
                                />

                                {/* THE FLOATING MENU */}
                                {focusedCatId === item.id && blockCategories.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '4px', zIndex: 100, boxShadow: '0 4px 10px rgba(0,0,0,0.1)', maxHeight: '150px', overflowY: 'auto' }}>
                                        {blockCategories
                                            .filter(cat => cat.toLowerCase().includes((item.category || '').toLowerCase()))
                                            .map(cat => (
                                                <div 
                                                    key={cat} 
                                                    onClick={() => {
                                                        handleUpdateField(item.id, 'category', cat);
                                                        setFocusedCatId(null);
                                                    }}
                                                    style={{ padding: '8px 12px', fontSize: '12px', color: '#334155', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: 'white' }}
                                                >
                                                    {cat}
                                                </div>
                                            ))}
                                        
                                        {blockCategories.filter(cat => cat.toLowerCase().includes((item.category || '').toLowerCase())).length === 0 && (
                                            <div style={{ padding: '8px 12px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                                                {__('New category...', 'family-notebook')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
						</div>
                    </div>
                ))
            ) : (
                sortedCats.map(cat => (
                    <div key={`cat-${cat}`} style={{ marginBottom: '15px' }}>
                        {cat ? (
                            <div className="responsive-center" style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', backgroundColor: '#e2e8f0', padding: '6px', borderRadius: '4px', marginBottom: '10px' }}>
                                {cat}
                            </div>
                        ) : (
                            <div style={{ borderBottom: '1px solid #e2e8f0', marginBottom: '8px' }}></div>
                        )}
                        {groupedItems[cat].map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', opacity: item.completed ? 0.6 : 1 }}>
                                <input type="checkbox" checked={item.completed} onChange={() => handleToggleItem(item.id, item.completed)} style={{ transform: 'scale(1.2)', cursor: 'pointer', flexShrink: 0 }} />
                                <span style={{ flex: 1, textAlign: 'left', fontSize: '16px', textDecoration: item.completed ? 'line-through' : 'none', color: '#334155' }}>
                                    {item.text || __('Empty item', 'family-notebook')}
                                </span>
                            </div>
                        ))}
                    </div>
                ))
            )}
            
            {isEditMode && (
                <button onClick={() => handleAddItem()} style={{ marginTop: '10px', background: 'transparent', border: '1px dashed #cbd5e1', color: '#64748b', padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}>
                    + {__('Add Item', 'family-notebook')}
                </button>
            )}
        </div>
    );
};


// -----------------------------
// 2. CHORE CHART BLOCK
// -----------------------------

export const ChoreChartBlock = ({ block, updateBlock, isEditMode }) => {
    const [focusedCatId, setFocusedCatId] = useState(null);
    const inputRefs = useRef({}); 
    
    const rows = block.rows || [];
    const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const blockCategories = [...new Set(
        rows.map(r => r.category).filter(cat => cat && cat.trim() !== '')
    )].sort();

    // --- DATA MANAGEMENT ---
    const handleAddRow = (inheritedCategory = '') => {
        const newRowId = `row_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const newRow = { id: newRowId, text: '', category: inheritedCategory, days: Array(7).fill(false) };
        updateBlock(block.id, { rows: [...rows, newRow] });
        return newRowId; 
    };

    const handleUpdateRow = (rowId, field, value) => {
        updateBlock(block.id, {
            rows: rows.map(r => r.id === rowId ? { ...r, [field]: value } : r)
        });
    };

    const handleDeleteRow = (rowId) => {
        updateBlock(block.id, { rows: rows.filter(r => r.id !== rowId) });
    };

    const handleToggleDay = (rowId, dayIndex) => {
        updateBlock(block.id, {
            rows: rows.map(r => {
                if (r.id === rowId) {
                    const newDays = [...r.days];
                    newDays[dayIndex] = !newDays[dayIndex];
                    return { ...r, days: newDays };
                }
                return r;
            })
        });
    };

    const handleKeyDown = (e, rowId, currentCategory) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newRowId = handleAddRow(currentCategory);
            setTimeout(() => {
                if (inputRefs.current[newRowId]) {
                    inputRefs.current[newRowId].focus();
                }
            }, 50);
        }
    };

    // --- GROUPING LOGIC (For View Mode Only) ---
    const groupedRows = rows.reduce((acc, row) => {
        const cat = row.category || '';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(row);
        return acc;
    }, {});

    const sortedCats = Object.keys(groupedRows).sort((a, b) => {
        if (a === '') return 1; 
        if (b === '') return -1;
        return a.localeCompare(b);
    });

    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', backgroundColor: '#f8fafc' }}>
            
            {/* NEW RESPONSIVE ENGINE FOR INLINE DESKTOP / STICKY MOBILE */}
            <style>{`
                .fn-chore-row-layout {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .fn-chore-task-title {
                    font-size: 16px;
                    font-weight: bold;
                    color: #334155;
                    text-align: left;
                    position: sticky;
                    top: 0;
                    background-color: white;
                    z-index: 10;
                    padding: 5px 0;
                }
                .fn-chore-days-container {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                    overflow-x: auto;
                    padding-bottom: 8px; /* Safe space for mobile scrollbars */
                }
                .fn-chore-day-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 6px;
                    flex: 0 0 auto;
                    min-width: 45px; /* Ensures circles don't squish on mobile */
                }
                
                @media (min-width: 768px) {
                    .fn-chore-row-layout {
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                    }
                    .fn-chore-task-title {
                        flex: 1;
                        position: static; /* Release sticky on desktop */
                        padding: 0;
                        margin-right: 20px;
                    }
                    .fn-chore-days-container {
                        width: auto;
                        gap: 15px;
                        overflow-x: visible;
                        padding-bottom: 0;
                    }
                    .fn-chore-day-item {
                        min-width: auto;
                    }
                }
            `}</style>

            <h4 style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>
                {__('Chore Chart', 'family-notebook')}
            </h4>

            {isEditMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {rows.map(row => (
                        <div key={row.id} style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                    <input 
                                        type="text" 
                                        ref={el => inputRefs.current[row.id] = el}
                                        value={row.text} 
                                        onChange={(e) => handleUpdateRow(row.id, 'text', e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, row.id, row.category)}
                                        placeholder={__("Task description...", 'family-notebook')}
                                        autoComplete="off"
                                        style={{ flex: 1, border: 'none', borderBottom: '1px dashed #cbd5e1', background: 'transparent', outline: 'none', fontSize: '16px', padding: '4px 0', color: '#0f172a', fontWeight: 'bold' }}
                                    />
                                    <button onClick={() => handleDeleteRow(row.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 5px' }}>&times;</button>
                                </div>
                                
                                <div style={{ position: 'relative', width: '100%', maxWidth: '200px' }}>
                                    <input 
                                        type="text" 
                                        value={row.category || ''} 
                                        onChange={(e) => handleUpdateRow(row.id, 'category', e.target.value)}
                                        onFocus={() => setFocusedCatId(row.id)}
                                        onBlur={() => setTimeout(() => setFocusedCatId(null), 150)}
                                        placeholder={__("+ Add Category", 'family-notebook')}
                                        autoComplete="off"
                                        spellCheck="false"
                                        style={{ width: '100%', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '6px 10px', outline: 'none', backgroundColor: '#f1f5f9', color: '#64748b', boxSizing: 'border-box' }}
                                    />
                                    
                                    {focusedCatId === row.id && blockCategories.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '4px', zIndex: 100, boxShadow: '0 4px 10px rgba(0,0,0,0.1)', maxHeight: '150px', overflowY: 'auto' }}>
                                            {blockCategories
                                                .filter(c => c.toLowerCase().includes((row.category || '').toLowerCase()))
                                                .map(c => (
                                                    <div 
                                                        key={c} 
                                                        onMouseDown={(e) => e.preventDefault()} 
                                                        onClick={() => {
                                                            handleUpdateRow(row.id, 'category', c);
                                                            setFocusedCatId(null);
                                                        }}
                                                        style={{ padding: '8px 12px', fontSize: '12px', color: '#334155', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: 'white' }}
                                                    >
                                                        {c}
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                sortedCats.map(cat => (
                    <div key={`cat-${cat}`} style={{ marginBottom: '25px' }}>
                        {cat ? (
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155', backgroundColor: '#e2e8f0', padding: '6px 12px', borderRadius: '4px', marginBottom: '15px', display: 'inline-block' }}>
                                {cat}
                            </div>
                        ) : (
                            rows.length > 0 && groupedRows['']?.length > 0 && sortedCats.length > 1 && <div style={{ borderBottom: '2px solid #e2e8f0', marginBottom: '15px' }}></div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {groupedRows[cat].map(row => (
                                <div key={row.id} style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    
                                    {/* APPLIED THE NEW RESPONSIVE CLASSES HERE */}
                                    <div className="fn-chore-row-layout">
                                        <div className="fn-chore-task-title">
                                            {row.text || __('Untitled Task', 'family-notebook')}
                                        </div>
                                        
                                        <div className="fn-chore-days-container">
                                            {daysOfWeek.map((day, idx) => {
                                                const isChecked = row.days[idx];
                                                return (
                                                    <div key={idx} className="fn-chore-day-item">
                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>{day}</span>
                                                        <div 
                                                            onClick={() => handleToggleDay(row.id, idx)}
                                                            style={{ 
                                                                width: '32px', 
                                                                height: '32px', 
                                                                borderRadius: '50%',
                                                                backgroundColor: isChecked ? '#10b981' : '#f8fafc',
                                                                border: isChecked ? 'none' : '2px solid #e2e8f0',
                                                                display: 'flex', 
                                                                justifyContent: 'center', 
                                                                alignItems: 'center',
                                                                cursor: 'pointer',
                                                                color: 'white',
                                                                fontSize: '14px',
                                                                fontWeight: 'bold',
                                                                transition: 'all 0.2s ease'
                                                            }}
                                                        >
                                                            {isChecked ? '✓' : ''}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}

            {isEditMode && (
                <button 
                    onClick={() => handleAddRow('')} 
                    style={{ marginTop: '15px', background: 'white', border: '1px dashed #cbd5e1', color: '#475569', padding: '10px', borderRadius: '8px', cursor: 'pointer', width: '100%', fontWeight: 'bold', transition: 'background 0.2s' }}
                >
                    + {__('Add Task', 'family-notebook')}
                </button>
            )}
        </div>
    );
};

// -----------------------------
// 3. RICH TEXT BLOCK
// -----------------------------
export const RichTextBlock = ({ block, updateBlock, isEditMode }) => {
    const editorRef = useRef(null);

    const handleFormat = (command, value = null) => {
        document.execCommand(command, false, value);
        if (editorRef.current) editorRef.current.focus();
    };

    const handleBlur = () => {
        if (editorRef.current) {
            updateBlock(block.id, { content: editorRef.current.innerHTML });
        }
    };

    const btnStyle = {
        backgroundColor: 'white',
        border: '1px solid #cbd5e1',
        borderRadius: '4px',
        padding: '6px 12px',
        cursor: 'pointer',
        color: '#475569',
        fontWeight: 'bold',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    };

    const ToolbarButton = ({ command, value = null, title, children }) => (
        <button 
            onMouseDown={(e) => e.preventDefault()} 
            onClick={() => handleFormat(command, value)} 
            style={btnStyle} 
            title={title}
            type="button"
        >
            {children}
        </button>
    );

    return (
        <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '10px' }}>
            
            {/* RICH TEXT TOOLBAR (Only shown in Edit Mode) */}
            {isEditMode && (
                <div className="fn-hide-print" style={{ backgroundColor: '#f8fafc', padding: '10px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <ToolbarButton command="bold" title={__('Bold', 'family-notebook')}><b>B</b></ToolbarButton>
                    <ToolbarButton command="italic" title={__('Italic', 'family-notebook')}><i>I</i></ToolbarButton>
                    <ToolbarButton command="underline" title={__('Underline', 'family-notebook')}><u>U</u></ToolbarButton>
                    
                    <div style={{ width: '1px', backgroundColor: '#cbd5e1', margin: '0 5px' }}></div>
                    
                    <ToolbarButton command="justifyLeft" title={__('Align Left', 'family-notebook')}>⫷ {__('Left', 'family-notebook')}</ToolbarButton>
                    <ToolbarButton command="justifyCenter" title={__('Align Center', 'family-notebook')}>≡ {__('Center', 'family-notebook')}</ToolbarButton>
                    <ToolbarButton command="justifyRight" title={__('Align Right', 'family-notebook')}>⫸ {__('Right', 'family-notebook')}</ToolbarButton>
                    
                    <div style={{ width: '1px', backgroundColor: '#cbd5e1', margin: '0 5px' }}></div>
                    
                    <ToolbarButton command="formatBlock" value="H2" title={__('Heading 2', 'family-notebook')}>H2</ToolbarButton>
                    <ToolbarButton command="formatBlock" value="H3" title={__('Heading 3', 'family-notebook')}>H3</ToolbarButton>
                    <ToolbarButton command="formatBlock" value="P" title={__('Paragraph', 'family-notebook')}>P</ToolbarButton>
                    
                    <div style={{ width: '1px', backgroundColor: '#cbd5e1', margin: '0 5px' }}></div>
                    
                    <ToolbarButton command="insertUnorderedList" title={__('Bullet List', 'family-notebook')}>• {__('List', 'family-notebook')}</ToolbarButton>
                    <ToolbarButton command="insertOrderedList" title={__('Numbered List', 'family-notebook')}>1. {__('List', 'family-notebook')}</ToolbarButton>

                    <div style={{ width: '1px', backgroundColor: '#cbd5e1', margin: '0 5px' }}></div>
                    
                    <ToolbarButton command="removeFormat" title={__('Clear Formatting', 'family-notebook')}>⌫ {__('Clear', 'family-notebook')}</ToolbarButton>
                </div>
            )}
            
            {/* EDITABLE CONTENT AREA */}
            <div
                ref={editorRef}
                contentEditable={isEditMode} 
                suppressContentEditableWarning={true}
                onBlur={handleBlur}
                dangerouslySetInnerHTML={{ __html: block.content || '<p><br></p>' }}
                style={{ 
                    padding: '20px', 
                    minHeight: '150px', 
                    outline: 'none',
                    color: '#334155',
                    lineHeight: '1.6',
                    fontSize: '16px',
                    cursor: isEditMode ? 'text' : 'default'
                }}
            />
        </div>
    );
};