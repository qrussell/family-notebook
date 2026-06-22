import { __ } from '@wordpress/i18n';
import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { RichTextBlock, ChecklistBlock, ChoreChartBlock } from './Blocks';

// --- DEEP MERGE HELPER FUNCTION ---
function mergeArrayById(baseArray, localArray, serverArray) {
    const mergedArray = [];
    const conflicts = [];

    const allIds = new Set([
        ...(baseArray || []).map(item => item.id),
        ...(localArray || []).map(item => item.id),
        ...(serverArray || []).map(item => item.id)
    ]);

    allIds.forEach(id => {
        const base = (baseArray || []).find(item => item.id === id);
        const local = (localArray || []).find(item => item.id === id);
        const server = (serverArray || []).find(item => item.id === id);

        const strBase = JSON.stringify(base || null);
        const strLocal = JSON.stringify(local || null);
        const strServer = JSON.stringify(server || null);

        // No changes, or both deleted cleanly
        if (strLocal === strBase && strServer === strBase) {
            if (base) mergedArray.push(base);
            return;
        }

        // Only Local (User 1) changed/added/deleted
        if (strServer === strBase && strLocal !== strBase) {
            if (local) mergedArray.push(local);
            return;
        }

        // Only Server (User 2) changed/added/deleted
        if (strLocal === strBase && strServer !== strBase) {
            if (server) mergedArray.push(server);
            return;
        }

        // Both changed it to the exact same thing
        if (strLocal === strServer) {
            if (local) mergedArray.push(local);
            return;
        }

        // HARD CONFLICT on this specific item
        conflicts.push({ id, localItem: local, serverItem: server, baseItem: base });
    });

    return { mergedArray: mergedArray.filter(Boolean), conflicts };
}

const NoteEditor = ({ noteId, workspaceId, folderId, workspaceColor, onClose, onNoteCreated, onNoteUpdated, onTemplateSaved }) => {
    const [title, setTitle] = useState('');
    const [tabs, setTabs] = useState([]);
    
    // NEW STATES FOR VERSION CONTROL
    const [baseTabs, setBaseTabs] = useState([]);
    const [lastModified, setLastModified] = useState(null);
    const [isMergeMode, setIsMergeMode] = useState(false);
    const [serverTabsState, setServerTabsState] = useState(null);

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
                    initialTabs = [{ id: `tab_${Date.now()}`, title: __('Page 1', 'family-notebook'), blocks: loadedContent }];
                } else if (loadedContent && loadedContent.tabs) {
                    initialTabs = loadedContent.tabs;
                } else {
                    initialTabs = [{ id: `tab_${Date.now()}`, title: __('Page 1', 'family-notebook'), blocks: [] }];
                }
                
                setTabs(initialTabs);
                setBaseTabs(initialTabs); // Save pristine state for merging
                setLastModified(data.last_modified); // Save database timestamp
                setActiveTabId(initialTabs[0].id);

                if (!data.content || (Array.isArray(data.content) && data.content.length === 0) || (data.content.tabs && data.content.tabs.length === 0)) {
                    setIsEditMode(true);
                }
                setIsLoading(false);
            })
            .catch(console.error);
    }, [noteId]);

    // --- SMART POLLING SYNC ---
    useEffect(() => {
        if (isEditMode || isMergeMode) return;

        const fetchUpdates = () => {
            if (document.visibilityState !== 'visible') return;

            apiFetch({ path: `/family-notebook/v1/notes/${noteId}` })
                .then((data) => {
                    if (data.content && data.content.tabs && JSON.stringify(data.content.tabs) !== JSON.stringify(tabs)) {
                        setTabs(data.content.tabs);
                        setBaseTabs(data.content.tabs); // Update pristine state
                        setLastModified(data.last_modified); // Keep up to date
                    }
                })
                .catch(err => console.error("Sync failed:", err));
        };

        const syncInterval = setInterval(fetchUpdates, 15000); 
        document.addEventListener("visibilitychange", fetchUpdates);

        return () => {
            clearInterval(syncInterval);
            document.removeEventListener("visibilitychange", fetchUpdates);
        };
    }, [noteId, isEditMode, isMergeMode, tabs]);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
    const activeBlocks = activeTab ? (activeTab.blocks || []) : [];

    // --- CONFLICT RESOLUTION BRAIN ---
    const handleConflictResponse = (errData) => {
        const serverTabs = errData.server_blocks?.tabs || [];
        const dbModified = errData.db_modified;

        const tabMergeResult = mergeArrayById(baseTabs, tabs, serverTabs);
        const finalMergedTabs = [];
        const finalConflicts = [];

        // Push easily merged tabs
        tabMergeResult.mergedArray.forEach(t => finalMergedTabs.push(t));

        // Dig into tab conflicts to see if we can deep merge the blocks inside them
        tabMergeResult.conflicts.forEach(tabConflict => {
            const { localItem: localTab, serverItem: serverTab, baseItem: baseTab } = tabConflict;

            if (localTab && serverTab && localTab.blocks && serverTab.blocks) {
                const blockMergeResult = mergeArrayById(baseTab?.blocks || [], localTab.blocks, serverTab.blocks);
                const finalMergedBlocks = [...blockMergeResult.mergedArray];

                // Dig into block conflicts to see if we can deep merge the lists/items inside them
                blockMergeResult.conflicts.forEach(blockConflict => {
                    const { localItem: localBlock, serverItem: serverBlock, baseItem: baseBlock } = blockConflict;

                    if (localBlock?.type === 'checklist' && serverBlock?.type === 'checklist') {
                        const itemMergeResult = mergeArrayById(baseBlock?.items || [], localBlock.items || [], serverBlock.items || []);
                        if (itemMergeResult.conflicts.length === 0) {
                            finalMergedBlocks.push({ ...serverBlock, items: itemMergeResult.mergedArray });
                            return; // Conflict resolved!
                        }
                    }

                    if (localBlock?.type === 'chore-chart' && serverBlock?.type === 'chore-chart') {
                        const rowMergeResult = mergeArrayById(baseBlock?.rows || [], localBlock.rows || [], serverBlock.rows || []);
                        if (rowMergeResult.conflicts.length === 0) {
                            finalMergedBlocks.push({ ...serverBlock, rows: rowMergeResult.mergedArray });
                            return; // Conflict resolved!
                        }
                    }
                    
                    finalConflicts.push({ type: 'block', conflict: blockConflict });
                });

                if (finalConflicts.length === 0) {
                    finalMergedTabs.push({ ...serverTab, blocks: finalMergedBlocks });
                    return; // Tab Conflict resolved!
                }
            }

            finalConflicts.push({ type: 'tab', conflict: tabConflict });
        });

        if (finalConflicts.length === 0) {
            // SUCCESS! No hard conflicts. Auto-Save the magically merged result!
            alert(__('Changes from another user were automatically merged safely!', 'family-notebook'));
            setTabs(finalMergedTabs);
            setBaseTabs(finalMergedTabs);
            
            // Force save the new merged data to the server to solidify it
            apiFetch({
                path: `/family-notebook/v1/notes/${noteId}`,
                method: 'PUT',
                data: { title: title, content: { tabs: finalMergedTabs } } // null last_modified = overwrite
            }).then(res => setLastModified(res.last_modified)).catch(console.error);
        } else {
            // HARD CONFLICT DETECTED - Show UI
            setServerTabsState(serverTabs);
            setIsMergeMode(true);
        }
    };

    const silentAutoSave = (currentTabs) => {
        apiFetch({
            path: `/family-notebook/v1/notes/${noteId}`,
            method: 'PUT',
            data: { title: title, content: { tabs: currentTabs }, last_modified: lastModified }
        })
        .then(res => {
            setLastModified(res.last_modified);
            setBaseTabs(currentTabs);
        })
        .catch(err => {
            if (err.code === 'conflict' || err.status === 409) {
                setIsEditMode(true);
                handleConflictResponse(err.data);
            }
        });
    };

    const handleSave = (forceOverwrite = false) => {
        setIsSaving(true);
        apiFetch({
            path: `/family-notebook/v1/notes/${noteId}`,
            method: 'PUT',
            data: { 
                title: title, 
                content: { tabs: tabs },
                last_modified: forceOverwrite ? null : lastModified 
            } 
        }).then((response) => {
            setIsSaving(false);
            setIsEditMode(false); 
            setLastModified(response.last_modified);
            setBaseTabs(tabs);
            if (onNoteUpdated) onNoteUpdated(noteId, title); 
        }).catch(err => {
            setIsSaving(false);
            if (err.code === 'conflict' || err.status === 409) {
                handleConflictResponse(err.data);
            } else {
                console.error(err);
                alert(__('An error occurred while saving.', 'family-notebook'));
            }
        });
    };
    
    const handleSaveToLibrary = () => {
        const templateName = window.prompt(__('Name this template for the library:', 'family-notebook'), title);
        if (!templateName) return;

        apiFetch({
            path: '/family-notebook/v1/templates',
            method: 'POST',
            data: { 
                title: templateName, 
                content: { tabs: tabs },
                workspace_id: workspaceId
            } 
        }).then((response) => {
            alert(__('Layout saved to your Template Library!', 'family-notebook'));
            if (onTemplateSaved) onTemplateSaved({ id: response.id, title: templateName });
        }).catch((err) => {
            console.error(err);
            alert(__('Failed to save template.', 'family-notebook'));
        });
    };

    // --- TAB MANAGEMENT FUNCTIONS ---
    const handleAddTab = () => {
        const newTab = { id: `tab_${Date.now()}`, title: `${__('Page', 'family-notebook')} ${tabs.length + 1}`, blocks: [] };
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
            title: `${tabToCopy.title} ${__('(Copy)', 'family-notebook')}`,
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
        if (tabs.length === 1) return alert(__('You must have at least one page.', 'family-notebook'));
        if (!window.confirm(__('Delete this entire page and all its blocks?', 'family-notebook'))) return;
        
        const remainingTabs = tabs.filter(t => t.id !== tabId);
        setTabs(remainingTabs);
        if (activeTabId === tabId) setActiveTabId(remainingTabs[0].id);
        if (!isEditMode) silentAutoSave(remainingTabs);
    };
    
    const handleMoveTab = (tabId, direction, e) => {
        e.stopPropagation();
        
        const currentIndex = tabs.findIndex(t => t.id === tabId);
        if (currentIndex === -1) return;

        const newTabs = [...tabs];

        if (direction === 'left' && currentIndex > 0) {
            [newTabs[currentIndex - 1], newTabs[currentIndex]] = [newTabs[currentIndex], newTabs[currentIndex - 1]];
        } else if (direction === 'right' && currentIndex < newTabs.length - 1) {
            [newTabs[currentIndex + 1], newTabs[currentIndex]] = [newTabs[currentIndex], newTabs[currentIndex + 1]];
        } else {
            return; 
        }

        setTabs(newTabs);
        if (!isEditMode) silentAutoSave(newTabs); 
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

    if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>{__('Loading note...', 'family-notebook')}</div>;

    // --- HARD CONFLICT UI ---
    if (isMergeMode) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px', backgroundColor: '#fff1f2', borderRadius: '8px' }}>
                <h2 style={{ color: '#e11d48', marginTop: 0 }}>{__('⚠️ Edit Conflict Detected!', 'family-notebook')}</h2>
                <p style={{ color: '#881337', marginBottom: '20px' }}>
                    {__('Someone else made complex changes to this note while you were editing, and the app could not automatically combine them safely. Please review the server version below.', 'family-notebook')}
                </p>

                <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', border: '1px solid #fecdd3', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ backgroundColor: '#ffe4e6', padding: '10px 15px', fontWeight: 'bold', color: '#be123c', borderBottom: '1px solid #fecdd3' }}>
                            {__('Currently on Server (Other User)', 'family-notebook')}
                        </div>
                        <div style={{ padding: '15px', overflowY: 'auto', flex: 1, fontSize: '12px', color: '#475569' }}>
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(serverTabsState, null, 2)}</pre>
                        </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white', border: `1px solid ${workspaceColor}`, borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ backgroundColor: `${workspaceColor}20`, padding: '10px 15px', fontWeight: 'bold', color: workspaceColor, borderBottom: `1px solid ${workspaceColor}` }}>
                            {__('Your Version', 'family-notebook')}
                        </div>
                        <div style={{ padding: '15px', overflowY: 'auto', flex: 1, fontSize: '12px', color: '#475569' }}>
                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(tabs, null, 2)}</pre>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                    <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', background: 'white', border: '1px solid #cbd5e1', color: '#475569', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
                        {__('Discard My Changes & Reload', 'family-notebook')}
                    </button>
                    <button onClick={() => { setIsMergeMode(false); handleSave(true); }} style={{ padding: '10px 20px', background: '#e11d48', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
                        {__('Force Save (Overwrite Server)', 'family-notebook')}
                    </button>
                    <button onClick={() => setIsMergeMode(false)} style={{ padding: '10px 20px', background: 'white', border: '1px solid #cbd5e1', color: '#475569', cursor: 'pointer', borderRadius: '4px' }}>
                        {__('Cancel (Keep Editing)', 'family-notebook')}
                    </button>
                </div>
            </div>
        );
    }

    // --- STANDARD EDITOR UI ---
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
                    .fn-tab-bar { 
                        border-radius: 0 !important; 
                        padding-left: 5px !important; 
                        padding-right: 5px !important; 
                        border-left: none !important;
                        border-right: none !important;
                    }
                    .fn-print-zone, .fn-action-bar { 
                        padding-left: 15px !important; 
                        padding-right: 15px !important; 
                    }
                    .fn-print-zone h2, .fn-print-zone input[placeholder="Untitled Note"] { 
                        font-size: 24px !important; 
                    }
                }
            `}</style>

            <div className="fn-hide-print fn-action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #f1f5f9' }}>
                <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>&larr; {__('Back', 'family-notebook')}</button>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {!isEditMode && <button onClick={() => window.print()} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🖨️ {__('Print', 'family-notebook')}</button>}
                    {!isEditMode ? (
                        <button onClick={() => setIsEditMode(true)} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✏️ {__('Edit Layout', 'family-notebook')}</button>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleSaveToLibrary} style={{ backgroundColor: 'white', color: workspaceColor, border: `1px solid ${workspaceColor}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>💾 {__('Save to Library', 'family-notebook')}</button>
                            <button onClick={() => handleSave(false)} disabled={isSaving} style={{ backgroundColor: workspaceColor, color: 'white', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{isSaving ? __('Saving...', 'family-notebook') : __('Save Changes', 'family-notebook')}</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="fn-print-zone">
                {isEditMode ? (
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={__("Untitled Note", 'family-notebook')} style={{ fontSize: '28px', fontWeight: 'bold', border: 'none', paddingBottom: '10px', marginBottom: '20px', width: '100%', outline: 'none', color: '#0f172a', borderBottom: '1px dashed #cbd5e1' }} />
                ) : (
                    <h2 style={{ fontSize: '28px', margin: '0 0 20px 0', color: '#0f172a' }}>{title}</h2>
                )}
                
                <div className="fn-hide-print fn-tab-bar" style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '20px', overflowX: 'auto', backgroundColor: '#f8fafc', borderRadius: '8px 8px 0 0' }}>
                    {tabs.map((tab, index) => (
                        <div key={tab.id} onClick={() => setActiveTabId(tab.id)} style={{ padding: '12px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: activeTabId === tab.id ? 'white' : 'transparent', borderTop: activeTabId === tab.id ? `3px solid ${workspaceColor}` : '3px solid transparent', borderRight: '1px solid #e2e8f0', fontWeight: activeTabId === tab.id ? 'bold' : 'normal', color: activeTabId === tab.id ? '#0f172a' : '#64748b' }}>
                            <input 
                                value={tab.title} 
                                onChange={(e) => handleRenameTab(tab.id, e.target.value)} 
                                onBlur={() => { if (!isEditMode) silentAutoSave(tabs); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                style={{ border: 'none', background: 'transparent', outline: 'none', width: `${Math.max(tab.title.length, 6)}ch`, color: 'inherit', fontWeight: 'inherit', fontSize: '14px' }} 
                            />
                            
                            {activeTabId === tab.id && index > 0 && (
                                <button onClick={(e) => handleMoveTab(tab.id, 'left', e)} title={__("Move Left", 'family-notebook')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: '16px' }}>&larr;</button>
                            )}
                            {activeTabId === tab.id && index < tabs.length - 1 && (
                                <button onClick={(e) => handleMoveTab(tab.id, 'right', e)} title={__("Move Right", 'family-notebook')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', fontSize: '16px' }}>&rarr;</button>
                            )}

                            <button onClick={(e) => handleDuplicateTab(tab.id, e)} title={__("Duplicate Page", 'family-notebook')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 4px', fontSize: '16px' }}>⎘</button>
                            {tabs.length > 1 && <button onClick={(e) => handleDeleteTab(tab.id, e)} title={__("Delete Page", 'family-notebook')} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0 4px', fontSize: '16px' }}>&times;</button>}
                        </div>
                    ))}
                    <button onClick={handleAddTab} style={{ background: 'none', border: 'none', color: workspaceColor, cursor: 'pointer', padding: '0 20px', fontWeight: 'bold', fontSize: '14px' }}>+ {__('Add Page', 'family-notebook')}</button>
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
                                    <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', borderRight: '1px solid #e2e8f0', padding: '4px 10px', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1, color: '#64748b' }} title={__("Move Up", 'family-notebook')}>↑</button>
                                    <button onClick={() => moveBlock(index, 'down')} disabled={index === activeBlocks.length - 1} style={{ background: 'transparent', border: 'none', borderRight: '1px solid #e2e8f0', padding: '4px 10px', cursor: index === activeBlocks.length - 1 ? 'not-allowed' : 'pointer', opacity: index === activeBlocks.length - 1 ? 0.3 : 1, color: '#64748b' }} title={__("Move Down", 'family-notebook')}>↓</button>
                                    <button onClick={() => removeBlock(block.id)} style={{ background: 'transparent', border: 'none', padding: '4px 10px', cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }} title={__("Delete Block", 'family-notebook')}>&times;</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {isEditMode && (
                <div className="fn-hide-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '15px', backgroundColor: '#f1f5f9', borderRadius: '8px', justifyContent: 'center', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontWeight: 'bold', width: '100%', textAlign: 'center', marginBottom: '5px' }}>{__('Add Block:', 'family-notebook')}</span>
                    <button onClick={() => addBlock('rich-text')} style={{ flex: '1 1 auto', minWidth: '120px', backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>📝 {__('Text', 'family-notebook')}</button>
                    <button onClick={() => addBlock('checklist')} style={{ flex: '1 1 auto', minWidth: '120px', backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>✅ {__('Checklist', 'family-notebook')}</button>
                    <button onClick={() => addBlock('chore-chart')} style={{ flex: '1 1 auto', minWidth: '120px', backgroundColor: 'white', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>💰 {__('Chore Chart', 'family-notebook')}</button>
                </div>
            )}
        </div>
    );
};

export default NoteEditor;