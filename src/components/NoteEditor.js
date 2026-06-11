import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { RichTextBlock, ChecklistBlock, ChoreChartBlock } from './Blocks';

const NoteEditor = ({ noteId, workspaceId, folderId, workspaceColor, onClose, onNoteCreated, onNoteUpdated }) => {
    const [title, setTitle] = useState('');
    const [blocks, setBlocks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // NEW: Separating Edit Template vs. Interactive Mode
    const [isEditMode, setIsEditMode] = useState(false); // Default to interactive view

    useEffect(() => {
        setIsLoading(true);
        apiFetch({ path: `/family-notebook/v1/notes/${noteId}` })
            .then((data) => {
                setTitle(data.title);
                setBlocks(Array.isArray(data.content) ? data.content : []);
                // If it's a brand new blank note, start in Edit Mode
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
            // NEW: Tell the parent component the title has been updated!
            if (onNoteUpdated) onNoteUpdated(noteId, title); 
        }).catch(console.error);
    };

    // SILENT AUTO-SAVE (For Interactive Checkboxes)
    const silentAutoSave = (updatedBlocks) => {
        apiFetch({
            path: `/family-notebook/v1/notes/${noteId}`,
            method: 'PUT',
            data: { title: title, content: updatedBlocks }
        }).catch(err => console.error("Auto-save failed", err));
    };

    const handleCloneAndClear = () => {
        // ... (Keep your existing clone logic exactly as it is here) ...
    };

    // Block Management
    const addBlock = (type) => {
        const newBlock = { id: `blk_${Date.now()}`, type: type };
        if (type === 'checklist') newBlock.items = [];
        if (type === 'chore-chart') newBlock.rows = [];
        setBlocks([...blocks, newBlock]);
    };

    // UPDATED: Now accepts a triggerAutoSave flag from the blocks
    const updateBlock = (blockId, updatedData, triggerAutoSave = false) => {
        const newBlocks = blocks.map(block => block.id === blockId ? { ...block, ...updatedData } : block);
        setBlocks(newBlocks);
        
        // If an interactive element was clicked while in View Mode, save to DB instantly
        if (triggerAutoSave && !isEditMode) {
            silentAutoSave(newBlocks);
        }
    };

    const removeBlock = (blockId) => setBlocks(blocks.filter(block => block.id !== blockId));

    if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading note...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* Header / Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #f1f5f9' }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                    &larr; Back
                </button>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Mode Toggles */}
                    {!isEditMode ? (
                        <button onClick={() => setIsEditMode(true)} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            ✏️ Edit Template
                        </button>
                    ) : (
                        <button onClick={handleSave} disabled={isSaving} style={{ backgroundColor: workspaceColor, color: 'white', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {isSaving ? 'Saving...' : 'Save Template'}
                        </button>
                    )}
                </div>
            </div>

            {/* Title (Only editable in Edit Mode) */}
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
                {blocks.map(block => (
                    <div key={block.id} style={{ position: 'relative' }}>
                        {/* We now pass isEditMode down to the blocks so they know how to render */}
                        {block.type === 'rich-text' && <RichTextBlock block={block} updateBlock={updateBlock} isEditMode={isEditMode} />}
                        {block.type === 'checklist' && <ChecklistBlock block={block} updateBlock={updateBlock} isEditMode={isEditMode} />}
                        {block.type === 'chore-chart' && <ChoreChartBlock block={block} updateBlock={updateBlock} isEditMode={isEditMode} />}
                        
                        {isEditMode && (
                            <button 
                                onClick={() => removeBlock(block.id)}
                                style={{ position: 'absolute', top: '5px', right: '5px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '50%', width: '25px', height: '25px', cursor: 'pointer', color: '#ef4444' }}
                                title="Remove Block"
                            >&times;</button>
                        )}
                    </div>
                ))}
            </div>

            {/* Block Adder Menu (Only visible in Edit Mode) */}
            {isEditMode && (
                <div style={{ display: 'flex', gap: '10px', padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '8px', justifyContent: 'center' }}>
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