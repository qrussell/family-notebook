import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { RichTextBlock, ChecklistBlock, ChoreChartBlock } from './Blocks';

const NoteEditor = ({ noteId, workspaceId, folderId, workspaceColor, onClose, onNoteCreated, onNoteUpdated, onTemplateSaved }) => {
    const [title, setTitle] = useState('');
    const [blocks, setBlocks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Separating Edit Template vs. Interactive Mode
    const [isEditMode, setIsEditMode] = useState(false); 

    useEffect(() => {
        setIsLoading(true);
        apiFetch({ path: `/family-notebook/v1/notes/${noteId}` })
            .then((data) => {
                setTitle(data.title);
                setBlocks(Array.isArray(data.content) ? data.content : []);
                if (!data.content || data.content.length === 0) setIsEditMode(true);
                setIsLoading(false);
            })
            .catch(console.error);
    }, [noteId]);

    // EXPLICIT SAVE (For Edit Mode)
    const handleSave = () => {
        setIsSaving(true);
        apiFetch({
            path: `/family-notebook/v1/notes/${noteId}`,
            method: 'PUT',
            data: { title: title, content: blocks }
        }).then(() => {
            setIsSaving(false);
            setIsEditMode(false); 
            if (onNoteUpdated) onNoteUpdated(noteId, title); 
        }).catch(console.error);
    };
    
    // Save current layout to the Global Template Library
    const handleSaveToLibrary = () => {
        const templateName = window.prompt("Name this template for the library:", title);
        if (!templateName) return;

        apiFetch({
            path: '/family-notebook/v1/templates',
            method: 'POST',
            data: { title: templateName, content: blocks }
        }).then((response) => {
            alert("Layout saved to your Template Library!");
            if (onTemplateSaved) {
                onTemplateSaved({ id: response.id, title: templateName });
            }
        }).catch((err) => {
            console.error(err);
            alert("Failed to save template.");
        });
    };

    // SILENT AUTO-SAVE (For Interactive Checkboxes)
    const silentAutoSave = (updatedBlocks) => {
        apiFetch({
            path: `/family-notebook/v1/notes/${noteId}`,
            method: 'PUT',
            data: { title: title, content: updatedBlocks }
        }).catch(err => console.error("Auto-save failed", err));
    };

    // Block Management
    const addBlock = (type) => {
        const newBlock = { id: `blk_${Date.now()}`, type: type };
        if (type === 'checklist') newBlock.items = [];
        if (type === 'chore-chart') newBlock.rows = [];
        setBlocks([...blocks, newBlock]);
    };

    // Reorder Block Function
    const moveBlock = (index, direction) => {
        const newBlocks = [...blocks];
        if (direction === 'up' && index > 0) {
            [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
        } else if (direction === 'down' && index < newBlocks.length - 1) {
            [newBlocks[index + 1], newBlocks[index]] = [newBlocks[index], newBlocks[index + 1]];
        }
        setBlocks(newBlocks);
        silentAutoSave(newBlocks); 
    };

    const updateBlock = (blockId, updatedData, triggerAutoSave = false) => {
        const newBlocks = blocks.map(block => block.id === blockId ? { ...block, ...updatedData } : block);
        setBlocks(newBlocks);
        if (triggerAutoSave && !isEditMode) {
            silentAutoSave(newBlocks);
        }
    };

    const removeBlock = (blockId) => setBlocks(blocks.filter(block => block.id !== blockId));

    // Extract all unique categories used anywhere on this page (Babel-Safe syntax)
    const availableCategories = [...new Set(
        blocks.reduce((acc, block) => {
            if (block.type === 'checklist' && block.items) {
                return acc.concat(block.items.map(i => i.category));
            }
            if (block.type === 'chore-chart' && block.rows) {
                return acc.concat(block.rows.map(r => r.category));
            }
            return acc;
        }, []).filter(cat => cat && cat.trim() !== '')
    )].sort();

    if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading note...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* THE SMART PRINT CSS ENGINE */}
            <style>{`
                @media print {
                    /* 1. Set standard physical paper margins */
                    @page { margin: 0.5in; }

                    /* 2. Hide global site headers, footers, and the admin bar */
                    #wpadminbar, #main-header, #top-header, #main-footer, footer { 
                        display: none !important; 
                    }

                    /* 3. Hide any Divi container that DOES NOT hold our app */
                    .et_pb_section:not(:has(.fn-print-zone)), 
                    .et_pb_row:not(:has(.fn-print-zone)),
                    .et_pb_column:not(:has(.fn-print-zone)),
                    .et_pb_module:not(:has(.fn-print-zone)) {
                        display: none !important;
                    }

                    /* 4. Strip all padding/margins from the containers that DO hold our app so it shifts to the top */
                    html, body, #page-container, #et-main-area, #main-content, .et_pb_section, .et_pb_row, .et_pb_column, .et_pb_module {
                        padding: 0 !important;
                        margin: 0 !important;
                        min-height: auto !important;
                    }

                    /* 5. Hide our own app UI buttons (Back, Print, Edit) */
                    .fn-hide-print, button { display: none !important; }
                }
            `}</style>

            {/* Header / Action Bar (Hidden from Print) */}
            <div className="fn-hide-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #f1f5f9' }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                    &larr; Back
                </button>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                    {!isEditMode && (
                        <button onClick={() => window.print()} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            🖨️ Print
                        </button>
                    )}

                    {!isEditMode ? (
                        <button onClick={() => setIsEditMode(true)} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            ✏️ Edit Layout
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleSaveToLibrary} style={{ backgroundColor: 'white', color: workspaceColor, border: `1px solid ${workspaceColor}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                💾 Save to Library
                            </button>
                            <button onClick={handleSave} disabled={isSaving} style={{ backgroundColor: workspaceColor, color: 'white', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* RESTORED: The Print Zone Wrapper */}
            <div className="fn-print-zone">
                {/* Title */}
                {isEditMode ? (
                    <input 
                        type="text" 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Untitled Note"
                        style={{ fontSize: '28px', fontWeight: 'bold', border: 'none', paddingBottom: '10px', marginBottom: '20px', width: '100%', outline: 'none', color: '#0f172a', borderBottom: '1px dashed #cbd5e1' }}
                    />
                ) : (
                    <h2 style={{ fontSize: '28px', margin: '0 0 20px 0', color: '#0f172a' }}>{title}</h2>
                )}

                {/* The Dynamic Canvas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '40px' }}>
                    {blocks.map((block, index) => (
                        <div key={block.id} style={{ position: 'relative' }}>
                            
                            {block.type === 'rich-text' && <RichTextBlock block={block} updateBlock={updateBlock} isEditMode={isEditMode} />}
                            {block.type === 'checklist' && <ChecklistBlock block={block} updateBlock={updateBlock} isEditMode={isEditMode} availableCategories={availableCategories} />}
                            {block.type === 'chore-chart' && <ChoreChartBlock block={block} updateBlock={updateBlock} isEditMode={isEditMode} availableCategories={availableCategories} />}
                            
                            {isEditMode && (
                                <div 
                                    className="fn-hide-print"
                                    style={{ 
                                        position: 'absolute', 
                                        top: '-10px', 
                                        right: '15px', 
                                        display: 'flex', 
                                        background: 'white', 
                                        border: '1px solid #cbd5e1', 
                                        borderRadius: '20px', 
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                        overflow: 'hidden',
                                        zIndex: 10
                                    }}
                                >
                                    <button 
                                        onClick={() => moveBlock(index, 'up')} 
                                        disabled={index === 0}
                                        style={{ background: 'transparent', border: 'none', borderRight: '1px solid #e2e8f0', padding: '4px 10px', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1, color: '#64748b' }}
                                        title="Move Up"
                                    >↑</button>
                                    <button 
                                        onClick={() => moveBlock(index, 'down')} 
                                        disabled={index === blocks.length - 1}
                                        style={{ background: 'transparent', border: 'none', borderRight: '1px solid #e2e8f0', padding: '4px 10px', cursor: index === blocks.length - 1 ? 'not-allowed' : 'pointer', opacity: index === blocks.length - 1 ? 0.3 : 1, color: '#64748b' }}
                                        title="Move Down"
                                    >↓</button>
                                    <button 
                                        onClick={() => removeBlock(block.id)}
                                        style={{ background: 'transparent', border: 'none', padding: '4px 10px', cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }}
                                        title="Delete Block"
                                    >&times;</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Block Adder Menu (Hidden from Print) */}
            {isEditMode && (
                <div className="fn-hide-print" style={{ display: 'flex', gap: '10px', padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '8px', justifyContent: 'center' }}>
                    <span style={{ alignSelf: 'center', color: '#64748b', fontWeight: 'bold', marginRight: '10px' }}>Add Block:</span>
                    <button onClick={() => addBlock('rich-text')} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>📝 Text</button>
                    <button onClick={() => addBlock('checklist')} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>✅ Checklist</button>
                    <button onClick={() => addBlock('chore-chart')} style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>💰 Chore Chart</button>
                </div>
            )}
        </div>
    );
};

export default NoteEditor;