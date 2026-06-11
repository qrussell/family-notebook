import { useRef, useEffect, useState } from '@wordpress/element';

// -----------------------------
// 1. CHECKLIST BLOCK
// -----------------------------
export const ChecklistBlock = ({ block, updateBlock, isEditMode, availableCategories = [] }) => {
    const items = block.items || [];
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
            
            <h4 className="responsive-center" style={{ margin: '0 0 15px 0', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Checklist</h4>
            
            {/* NEW: Datalist for autocomplete categories */}
            {isEditMode && (
                <datalist id={`cats-${block.id}`}>
                    {availableCategories.map(cat => <option key={cat} value={cat} />)}
                </datalist>
            )}
            
            {isEditMode ? (
                items.map((item, index) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <input type="checkbox" disabled style={{ transform: 'scale(1.2)', flexShrink: 0, opacity: 0.5 }} />
                        <div style={{ display: 'flex', flex: 1, gap: '10px' }}>
                            <input 
                                type="text" 
                                list={`cats-${block.id}`} // Links to datalist
                                placeholder="Category (e.g. Kitchen)"
                                value={item.category || ''} 
                                onChange={(e) => handleUpdateField(item.id, 'category', e.target.value)}
                                style={{ width: '130px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px', outline: 'none' }}
                            />
                            <input 
                                type="text" 
                                ref={el => inputRefs.current[index] = el}
                                value={item.text} 
                                onChange={(e) => handleUpdateField(item.id, 'text', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, index)}
                                placeholder="Task description..."
                                style={{ flex: 1, border: 'none', borderBottom: '1px dashed #cbd5e1', background: 'transparent', outline: 'none', fontSize: '16px' }}
                            />
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
                                    {item.text || "Empty item"}
                                </span>
                            </div>
                        ))}
                    </div>
                ))
            )}
            
            {isEditMode && (
                <button onClick={() => handleAddItem()} style={{ marginTop: '10px', background: 'transparent', border: '1px dashed #cbd5e1', color: '#64748b', padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}>+ Add Item</button>
            )}
        </div>
    );
};


// -----------------------------
// 2. CHORE CHART BLOCK
// -----------------------------
export const ChoreChartBlock = ({ block, updateBlock, isEditMode, availableCategories = [] }) => {
    const rows = block.rows || [];
    const daysOfWeek = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];

    // NEW: Focus tracking for Chore Chart
    const inputRefs = useRef([]);
    const [nextFocusIndex, setNextFocusIndex] = useState(null);

    useEffect(() => {
        if (nextFocusIndex !== null && inputRefs.current[nextFocusIndex]) {
            inputRefs.current[nextFocusIndex].focus();
            setNextFocusIndex(null);
        }
    }, [rows, nextFocusIndex]);

    const handleAddRow = (currentIndex) => {
        let inheritedCategory = '';
        if (currentIndex !== undefined && rows[currentIndex]) {
            inheritedCategory = rows[currentIndex].category || '';
        } else if (rows.length > 0) {
            inheritedCategory = rows[rows.length - 1].category || '';
        }

        const newRow = { id: Date.now(), task: '', category: inheritedCategory, value: 0, days: Array(7).fill(false) };
        const newRows = [...rows];

        if (currentIndex !== undefined) {
            newRows.splice(currentIndex + 1, 0, newRow);
            setNextFocusIndex(currentIndex + 1);
        } else {
            newRows.push(newRow);
            setNextFocusIndex(newRows.length - 1);
        }

        updateBlock(block.id, { rows: newRows });
    };

    const handleUpdateRow = (rowId, field, newValue) => {
        updateBlock(block.id, { rows: rows.map(r => r.id === rowId ? { ...r, [field]: newValue } : r) });
    };

    const handleToggleDay = (rowId, dayIndex) => {
        const updatedRows = rows.map(row => {
            if (row.id === rowId) {
                const newDays = [...row.days];
                newDays[dayIndex] = !newDays[dayIndex];
                return { ...row, days: newDays };
            }
            return row;
        });
        updateBlock(block.id, { rows: updatedRows }, true);
    };

    // NEW: KeyDown handler for Chore Chart
    const handleKeyDown = (e, index) => {
        if (!isEditMode) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddRow(index);
        } else if (e.key === 'Backspace' && rows[index].task === '' && rows[index].category === '') {
            e.preventDefault();
            if (rows.length > 1) {
                const newRows = rows.filter((_, i) => i !== index);
                updateBlock(block.id, { rows: newRows });
                setNextFocusIndex(index > 0 ? index - 1 : 0);
            }
        }
    };

    const calculateRowTotal = (row) => row.days.filter(Boolean).length * (parseFloat(row.value) || 0);
    const grandTotal = rows.reduce((sum, row) => sum + calculateRowTotal(row), 0);

    const groupedRows = rows.reduce((acc, row) => {
        const cat = (row.category || '').trim();
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
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'white', textAlign: 'left' }}>
            <div style={{ backgroundColor: '#f8fafc', padding: '10px 15px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Chore Chart</h4>
                <strong style={{ color: '#0284c7', fontSize: '14px' }}>Total: ${grandTotal.toFixed(2)}</strong>
            </div>

            {/* NEW: Datalist for autocomplete categories */}
            {isEditMode && (
                <datalist id={`cats-${block.id}`}>
                    {availableCategories.map(cat => <option key={cat} value={cat} />)}
                </datalist>
            )}
            
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', fontSize: '12px' }}>
                            <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Task Name</th>
                            <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', width: '80px' }}>Value</th>
                            {daysOfWeek.map(day => <th key={day} style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', width: '40px' }}>{day}</th>)}
                            <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', width: '80px' }}>Total</th>
                            {isEditMode && <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', width: '40px' }}></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {isEditMode ? (
                            rows.map((row, index) => (
                                <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px 10px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <input 
                                                type="text" 
                                                ref={el => inputRefs.current[index] = el}
                                                placeholder="Task..." 
                                                value={row.task} 
                                                onChange={(e) => handleUpdateRow(row.id, 'task', e.target.value)} 
                                                onKeyDown={(e) => handleKeyDown(e, index)}
                                                style={{ width: '100%', border: '1px solid #cbd5e1', padding: '6px', borderRadius: '4px', boxSizing: 'border-box' }} 
                                            />
                                            <input 
                                                type="text" 
                                                list={`cats-${block.id}`}
                                                placeholder="Category (e.g. Yard)" 
                                                value={row.category || ''} 
                                                onChange={(e) => handleUpdateRow(row.id, 'category', e.target.value)} 
                                                style={{ width: '100%', border: '1px solid #cbd5e1', padding: '4px 6px', borderRadius: '4px', fontSize: '12px', backgroundColor: '#f8fafc', boxSizing: 'border-box' }} 
                                            />
                                        </div>
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <input type="number" value={row.value} onChange={(e) => handleUpdateRow(row.id, 'value', e.target.value)} step="0.25" style={{ width: '100%', border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right', borderRadius: '4px', boxSizing: 'border-box' }} />
                                    </td>
                                    {row.days.map((_, i) => (
                                        <td key={i} style={{ padding: '8px 10px', textAlign: 'center' }}>
                                            <input type="checkbox" disabled style={{ transform: 'scale(1.2)', opacity: 0.5 }} />
                                        </td>
                                    ))}
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold' }}>$0.00</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                        <button onClick={() => updateBlock(block.id, { rows: rows.filter(r => r.id !== row.id) })} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            // ... Grouped Interactive Mode (Keep exactly the same) ...
                            sortedCats.map(cat => {
                                const catHeader = cat ? (
                                    <tr key={`cat-${cat}`}>
                                        <td colSpan="10" className="responsive-center" style={{ padding: '10px', backgroundColor: '#e2e8f0', color: '#334155', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                            {cat}
                                        </td>
                                    </tr>
                                ) : null;
                                const itemRows = groupedRows[cat].map(row => (
                                    <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '8px 10px', fontWeight: '500', color: '#1e293b' }}>{row.task || "—"}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>${parseFloat(row.value || 0).toFixed(2)}</td>
                                        {row.days.map((isChecked, i) => (
                                            <td key={i} style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                <input type="checkbox" checked={isChecked} onChange={() => handleToggleDay(row.id, i)} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                                            </td>
                                        ))}
                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold' }}>${calculateRowTotal(row).toFixed(2)}</td>
                                    </tr>
                                ));
                                return catHeader ? [catHeader, ...itemRows] : itemRows;
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {isEditMode && (
                <div style={{ padding: '10px' }}>
                    <button onClick={() => handleAddRow()} style={{ background: 'transparent', border: '1px dashed #cbd5e1', color: '#64748b', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>+ Add Task</button>
                </div>
            )}
        </div>
    );
};

// -----------------------------
// 3. RICH TEXT BLOCK
// -----------------------------
export const RichTextBlock = ({ block, updateBlock, isEditMode }) => {
    return isEditMode ? (
        <textarea 
            value={block.content || ''}
            onChange={(e) => updateBlock(block.id, { content: e.target.value })}
            placeholder="Type your notes here..."
            style={{ width: '100%', minHeight: '100px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '10px', fontSize: '16px', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
        />
    ) : (
        <div style={{ whiteSpace: 'pre-wrap', color: '#334155', fontSize: '16px', lineHeight: '1.6' }}>
            {block.content || "Empty text block"}
        </div>
    );
};