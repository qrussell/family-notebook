import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { RichTextBlock, ChecklistBlock, ChoreChartBlock } from './Blocks';

const NoteEditor = ({ noteId, workspaceId, folderId, workspaceColor, onClose, onNoteCreated, onNoteUpdated, onTemplateSaved, canEdit }) => {
    const [title, setTitle] = useState('');
    const [tabs, setTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false); 

    useEffect(() => {
        setIsLoading(true);
        apiFetch({ path: `/family-notebook/v1/notes/${noteId}` })
            .then((data) => {
                setTitle(data.title);
                let loadedContent = data.content;
                let initialTabs = [];
                
                if (Array.isArray(loadedContent) && loadedContent.length > 0) {
                    initialTabs = [{ id: `tab_${Date.now()}`, title: 'Page 1', blocks: loadedContent }];
                } else if (loadedContent && loadedContent.tabs) {
                    initialTabs = loadedContent.tabs;
                } else {
                    initialTabs = [{ id: `tab_${Date.now()}`, title: 'Page 1', blocks: [] }];
                }
                
                setTabs(initialTabs);
                setActiveTabId(initialTabs[0].id);
                if (!data.content || (Array.isArray(data.content) && data.content.length === 0) || (data.content.tabs && data.content.tabs.length === 0)) {
                    setIsEditMode(true);
                }
                setIsLoading(false);
            })
            .catch(console.error);
    }, [noteId]);

    // --- REAL-TIME POLLING SYNC ---
    useEffect(() => {
        // 1. Only poll if we are NOT in Edit Mode
        if (isEditMode) return;

        const syncInterval = setInterval(() => {
            apiFetch({ path: `/family-notebook/v1/notes/${noteId}` })
                .then((data) => {
                    // 2. Only update if the content has changed 
                    // This prevents React from re-rendering the whole page for no reason
                    if (data.content && data.content.tabs && JSON.stringify(data.content.tabs) !== JSON.stringify(tabs)) {
                        setTabs(data.content.tabs);
                    }
                })
                .catch(err => console.error("Sync failed:", err));
        }, 5000); // 5-second interval

        return () => clearInterval(syncInterval);
    }, [noteId, isEditMode, tabs]);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
    const activeBlocks = activeTab ? (activeTab.blocks || []) : [];

    const silentAutoSave = (currentTabs) => {
        apiFetch({
            path: `/family-notebook/v1/notes/${noteId}`,
            method: 'PUT',
            data: { title: title, content: { tabs: currentTabs } }
        }).catch(err => console.error("Auto-save failed", err));
    };

    const handleSave = () => {
        setIsSaving(true);
        apiFetch({
            path: `/family-notebook/v1/notes/${noteId}`,
            method: 'PUT',
            data: { title: title, content: { tabs: tabs } } 
        }).then(() => {
            setIsSaving(false);
            setIsEditMode(false); 
            if (onNoteUpdated) onNoteUpdated(noteId, title); 
        }).catch(console.error);
    };
    
    const handleSaveToLibrary = () => {
        const templateName = window.prompt("Name this template for the library:", title);
        if (!templateName) return;

        apiFetch({
            path: '/family-notebook/v1/templates',
            method: 'POST',
            data: { 
                title: templateName, 
                content: { tabs: tabs },
                workspace_id: workspaceId // <-- Passes the workspace scope to the backend
            } 
        }).then((response) => {
            alert("Layout saved to your Template Library!");
            if (onTemplateSaved) onTemplateSaved({ id: response.id, title: templateName });
        }).catch((err) => {
            console.error(err);
            alert("Failed to save template.");
        });
    };

    // --- TAB MANAGEMENT FUNCTIONS ---
    const handleAddTab = () => {
        const newTab = { id: `tab_${Date.now()}`, title: `Page ${tabs.length + 1}`, blocks: [] };
        const updatedTabs = [...tabs, newTab];
        setTabs(updatedTabs);
        setActiveTabId(newTab.id);
        if (!isEditMode) silentAutoSave(updatedTabs);
    };

    const handleDuplicateTab = (tabId, e) => {
        e.stopPropagation(); 
        const tabToCopy = tabs.find(t => t.id === tabId);
        if (!tabToCopy) return;

        const deepCloneBlock = (block) => {
            const newBlock = JSON.parse(JSON.stringify(block));
            const uniqueSuffix = Math.random().toString(36).substr(2, 6);
            newBlock.id = `blk_${Date.now()}_${uniqueSuffix}`; 
            
            if (newBlock.type === 'checklist' && newBlock.items) {
                newBlock.items = newBlock.items.map(item => ({ ...item, id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` }));
            }
            if (newBlock.type === 'chore-chart' && newBlock.rows) {
                newBlock.rows = newBlock.rows.map(row => ({ ...row, id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` }));
            }
            return newBlock;
        };

        const clonedBlocks = (tabToCopy.blocks || []).map(block => deepCloneBlock(block));
        
        const newTab = {
            id: `tab_${Date.now()}`,
            title: `${tabToCopy.title} (Copy)`,
            blocks: clonedBlocks
        };

        const updatedTabs = [...tabs, newTab];
        setTabs(updatedTabs);
        setActiveTabId(newTab.id); 
        if (!isEditMode) silentAutoSave(updatedTabs);
    };

    const handleRenameTab = (tabId, newTitle) => {
        setTabs(tabs.map(t => t.id === tabId ? { ...t, title: newTitle } : t));
    };
    
    const handleDeleteTab = (tabId, e) => {
        e.stopPropagation();
        if (tabs.length === 1) return alert("You must have at least one page.");
        if (!window.confirm("Delete this entire page and all its blocks?")) return;
        
        const remainingTabs = tabs.filter(t => t.id !== tabId);
        setTabs(remainingTabs);
        if (activeTabId === tabId) setActiveTabId(remainingTabs[0].id);
        if (!isEditMode) silentAutoSave(remainingTabs);
    };
    
    const handleMoveTab = (tabId, direction, e) => {
        e.stopPropagation();
        
        // Find the current position of the tab
        const currentIndex = tabs.findIndex(t => t.id === tabId);
        if (currentIndex === -1) return;

        const newTabs = [...tabs];

        // Swap with the previous tab
        if (direction === 'left' && currentIndex > 0) {
            [newTabs[currentIndex - 1], newTabs[currentIndex]] = [newTabs[currentIndex], newTabs[currentIndex - 1]];
        } 
        // Swap with the next tab
        else if (direction === 'right' && currentIndex < newTabs.length - 1) {
            [newTabs[currentIndex + 1], newTabs[currentIndex]] = [newTabs[currentIndex], newTabs[currentIndex + 1]];
        } 
        else {
            return; // No change needed
        }

        setTabs(newTabs);
        if (!isEditMode) silentAutoSave(newTabs); // Save automatically if we aren't in layout mode
    };
    
    // --- BLOCK MANAGEMENT ---
    const addBlock = (type) => {
        let newBlock = { id: `blk_${Date.now()}`, type: type };
        const updatedTabs = tabs.map(t => t.id === activeTabId ? { ...t, blocks: [...(t.blocks || []), newBlock] } : t);
        setTabs(updatedTabs);
    };

    const moveBlock = (index, direction) => {
        const newActiveBlocks = [...activeBlocks];
        if (direction === 'up' && index > 0) {
            [newActiveBlocks[index - 1], newActiveBlocks[index]] = [newActiveBlocks[index], newActiveBlocks[index - 1]];
        } else if (direction === 'down' && index < newActiveBlocks.length - 1) {
            [newActiveBlocks[index + 1], newActiveBlocks[index]] = [newActiveBlocks[index], newActiveBlocks[index + 1]];
        }
        
        const updatedTabs = tabs.map(t => t.id === activeTabId ? { ...t, blocks: newActiveBlocks } : t);
        setTabs(updatedTabs);
        silentAutoSave(updatedTabs); 
    };

    const updateBlock = (blockId, updatedBlockData) => {
        const updatedTabs = tabs.map(t => {
            if (t.id === activeTabId) {
                return { 
                    ...t, 
                    blocks: t.blocks.map(b => b.id === blockId ? { ...b, ...updatedBlockData } : b) 
                };
            }
            return t;
        });
        setTabs(updatedTabs);
        if (!isEditMode) silentAutoSave(updatedTabs);
    };

    const removeBlock = (blockId) => {
        const updatedTabs = tabs.map(t => {
            if (t.id === activeTabId) {
                return { ...t, blocks: t.blocks.filter(b => b.id !== blockId) };
            }
            return t;
        });
        setTabs(updatedTabs);
    };

    const allBlocks = tabs.reduce((acc, tab) => acc.concat(tab.blocks || []), []);
    const availableCategories = [...new Set(
        allBlocks.reduce((acc, block) => {
            if (block.type === 'checklist' && block.items) return acc.concat(block.items.map(i => i.category));
            if (block.type === 'chore-chart' && block.rows) return acc.concat(block.rows.map(r => r.category));
            return acc;
        }, []).filter(cat => cat && cat.trim() !== '')
    )].sort();

    if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading note...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            <style>{`
                /* THE SMART PRINT CSS ENGINE */
                @media print {
                    @page { margin: 0.5in; }
                    #wpadminbar, #main-header, #top-header, #main-footer, footer { display: none !important; }
                    .et_pb_section:not(:has(.fn-print-zone)), .et_pb_row:not(:has(.fn-print-zone)), .et_pb_column:not(:has(.fn-print-zone)), .et_pb_module:not(:has(.fn-print-zone)) { display: none !important; }
                    html, body, #page-container, #et-main-area, #main-content, .et_pb_section, .et_pb_row, .et_pb_column, .et_pb_module { padding: 0 !important; margin: 0 !important; min-height: auto !important; }
                    .fn-hide-print, button { display: none !important; }
                }

                /* NATIVE APP MOBILE EDGE-TO-EDGE OVERRIDE */
                @media (max-width: 768px) {
                    /* 1. Nuke all WordPress/Divi margins and paddings */
                    html, body, #page-container, #et-main-area, #main-content, 
                    .et_pb_section, .et_pb_row, .et_pb_column, .et_pb_module, 
                    #family-notebook-root {
                        width: 100% !important;
                        max-width: 100% !important;
                        padding-left: 0 !important;
                        padding-right: 0 !important;
                        margin-left: 0 !important;
                        margin-right: 0 !important;
                    }

                    /* 2. Make the Tab Bar perfectly flush with the edges */
                    .fn-tab-bar { 
                        border-radius: 0 !important; 
                        padding-left: 5px !important; 
                        padding-right: 5px !important; 
                        border-left: none !important;
                        border-right: none !important;
                    }

                    /* 3. Give text 15px of breathing room from the physical glass */
                    .fn-print-zone, .fn-action-bar { 
                        padding-left: 15px !important; 
                        padding-right: 15px !important; 
                    }
                    
                    /* 4. Shrink title fonts to save space */
                    .fn-print-zone h2, .fn-print-zone input[placeholder="Untitled Note"] { 
                        font-size: 24px !important; 
                    }
                }
            `}</style>

            <div className="fn-hide-print fn-action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #f1f5f9' }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>&larr; Back</button>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {!isEditMode && <button onClick={() => window.print()} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🖨️ Print</button>}
                    
                    {/* Hide Edit Layout for Viewers */}
                    {!isEditMode ? (
                        canEdit && <button onClick={() => setIsEditMode(true)} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✏️ Edit Layout</button>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleSaveToLibrary} style={{ backgroundColor: 'white', color: workspaceColor, border: `1px solid ${workspaceColor}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>💾 Save to Library</button>
                            <button onClick={handleSave} disabled={isSaving} style={{ backgroundColor: workspaceColor, color: 'white', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{isSaving ? 'Saving...' : 'Save Changes'}</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="fn-print-zone">
                {isEditMode ? (
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled Note" style={{ fontSize: '28px', fontWeight: 'bold', border: 'none', paddingBottom: '10px', marginBottom: '20px', width: '100%', outline: 'none', color: '#0f172a', borderBottom: '1px dashed #cbd5e1' }} />
                ) : (
                    <h2 style={{ fontSize: '28px', margin: '0 0 20px 0', color: '#0f172a' }}>{title}</h2>
                )}
                
                <div className="fn-hide-print fn-tab-bar" style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '20px', overflowX: 'auto', backgroundColor: '#f8fafc', borderRadius: '8px 8px 0 0' }}>
                    {tabs.map((tab, index) => (
                        <div key={tab.id} onClick={() => setActiveTabId(tab.id)} style={{ padding: '12px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: activeTabId === tab.id ? 'white' : 'transparent', borderTop: activeTabId === tab.id ? `3px solid ${workspaceColor}` : '3px solid transparent', borderRight: '1px solid #e2e8f0', fontWeight: activeTabId === tab.id ? 'bold' : 'normal', color: activeTabId === tab.id ? '#0f172a' : '#64748b' }}>
                            
                            {/* Restricted Tab Renaming */}
                            {canEdit ? (
                                <input 
                                    value={tab.title} 
                                    onChange={(e) => handleRenameTab(tab.id, e.target.value)} 
                                    onBlur={() => { if (!isEditMode) silentAutoSave(tabs); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', width: `${Math.max(tab.title.length, 6)}ch`, color: 'inherit', fontWeight: 'inherit', fontSize: '14px' }} 
                                />
                            ) : (
                                <span style={{ fontSize: '14px' }}>{tab.title}</span>
                            )}
                            
                            {/* Wrap all tab actions in canEdit */}
                            {canEdit && (
                                <>
                                    {activeTabId === tab.id && index > 0 && (
                                        <button onClick={(e) => handleMoveTab(tab.id, 'left', e)} title="Move Left" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: '16px' }}>&larr;</button>
                                    )}
                                    {activeTabId === tab.id && index < tabs.length - 1 && (
                                        <button onClick={(e) => handleMoveTab(tab.id, 'right', e)} title="Move Right" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: '16px' }}>&rarr;</button>
                                    )}

                                    <button onClick={(e) => handleDuplicateTab(tab.id, e)} title="Duplicate Page" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 4px', fontSize: '16px' }}>⎘</button>
                                    {tabs.length > 1 && <button onClick={(e) => handleDeleteTab(tab.id, e)} title="Delete Page" style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0 4px', fontSize: '16px' }}>&times;</button>}
                                </>
                            )}
                        </div>
                    ))}
                    
                    {/* Restricted Add Page Button */}
                    {canEdit && (
                        <button onClick={handleAddTab} style={{ background: 'none', border: 'none', color: workspaceColor, cursor: 'pointer', padding: '0 20px', fontWeight: 'bold', fontSize: '14px' }}>+ Add Page</button>
                    )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '40px' }}>
                    {activeBlocks.map((block, index) => (
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
                                    <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', borderRight: '1px solid #e2e8f0', padding: '4px 10px', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1, color: '#64748b' }} title="Move Up">↑</button>
                                    <button onClick={() => moveBlock(index, 'down')} disabled={index === activeBlocks.length - 1} style={{ background: 'transparent', border: 'none', borderRight: '1px solid #e2e8f0', padding: '4px 10px', cursor: index === activeBlocks.length - 1 ? 'not-allowed' : 'pointer', opacity: index === activeBlocks.length - 1 ? 0.3 : 1, color: '#64748b' }} title="Move Down">↓</button>
                                    <button onClick={() => removeBlock(block.id)} style={{ background: 'transparent', border: 'none', padding: '4px 10px', cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }} title="Delete Block">&times;</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {isEditMode && (
                <div className="fn-hide-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '15px', backgroundColor: '#f1f5f9', borderRadius: '8px', justifyContent: 'center', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontWeight: 'bold', width: '100%', textAlign: 'center', marginBottom: '5px' }}>Add Block:</span>
                    <button onClick={() => addBlock('rich-text')} style={{ flex: '1 1 auto', minWidth: '120px', backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>📝 Text</button>
                    <button onClick={() => addBlock('checklist')} style={{ flex: '1 1 auto', minWidth: '120px', backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>✅ Checklist</button>
                    <button onClick={() => addBlock('chore-chart')} style={{ flex: '1 1 auto', minWidth: '120px', backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>💰 Chore Chart</button>
                </div>
            )}
        </div>
    );
};

export default NoteEditor;