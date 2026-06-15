import { __, sprintf } from '@wordpress/i18n';
import { useState, useEffect, useRef } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import NoteEditor from './NoteEditor';

// Helper function to safely format ANY database color string into a valid HTML5 picker color
const formatColorForPicker = (hexColor) => {
    if (!hexColor || typeof hexColor !== 'string') return '#1e293b'; // Default to dark slate if missing
    
    // Aggressively strip out everything except valid hex characters (fixes missing #, spaces, etc.)
    let cleanHex = hexColor.replace(/[^0-9a-fA-F]/g, '');
    
    // Convert 3-digit shorthand to 6-digit (e.g. FFF -> FFFFFF)
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
    }
    
    // If it's corrupted beyond repair, return default
    if (cleanHex.length !== 6) return '#1e293b';
    
    return '#' + cleanHex;
};

// Helper function to calculate accessibility contrast dynamically
const getContrastTextColor = (hexColor) => {
    const safeHex = formatColorForPicker(hexColor);
    
    const r = parseInt(safeHex.slice(1, 3), 16);
    const g = parseInt(safeHex.slice(3, 5), 16);
    const b = parseInt(safeHex.slice(5, 7), 16);

    // Standard Relative Luminance Calculation
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return Dark Slate for light backgrounds, White for dark backgrounds
    return luminance > 0.5 ? '#0f172a' : '#ffffff';
};

const WorkspaceView = ({ workspace, onBack }) => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // UI States
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [isCreatingNote, setIsCreatingNote] = useState(false);
    const [newNoteTitle, setNewNoteTitle] = useState('');
    
    // Template Library State
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    
    // Editor State
    const [activeNoteId, setActiveNoteId] = useState(null);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [quickAddType, setQuickAddType] = useState('note');
    const [quickAddTargetFolder, setQuickAddTargetFolder] = useState('');
    const [actionNote, setActionNote] = useState(null);
    
    // Mobile & PWA
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);
    const [installPrompt, setInstallPrompt] = useState(null);
    
    // Import
    const fileInputRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    
    // User Management State
    const [isManagingUsers, setIsManagingUsers] = useState(false);
    const [workspaceUsers, setWorkspaceUsers] = useState([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    
    // ROLE & PERMISSIONS LOGIC
    const role = workspace.role || 'viewer';
    const isOwner = role === 'owner';
    const canManageUsers = ['owner', 'organizer'].includes(role);
    const canEdit = ['owner', 'organizer', 'user'].includes(role);
    
    // EDIT WORKSPACE STATE
    const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);
    const [editWorkspaceName, setEditWorkspaceName] = useState(workspace.name);
    // Initialize color picker safely
    const [editWorkspaceColor, setEditWorkspaceColor] = useState(formatColorForPicker(workspace.color));
    
    // --- LIVE PREVIEW LOGIC ---
    const displayColor = isEditingWorkspace ? editWorkspaceColor : formatColorForPicker(workspace.color);
    const headerTextColor = getContrastTextColor(displayColor);
    
    useEffect(() => {
        apiFetch({ path: `/family-notebook/v1/templates?workspace_id=${workspace.id}` })
            .then(data => setTemplates(data))
            .catch(err => console.error("Failed to load templates", err));
    }, [workspace.id]); 
    
    useEffect(() => {
        setIsLoading(true);
        apiFetch({ path: `/family-notebook/v1/notes?workspace_id=${workspace.id}` })
            .then((data) => {
                setItems(data);
                setIsLoading(false);
            })
            .catch(console.error);
    }, [workspace.id]);

    useEffect(() => {
        if (isManagingUsers) {
            apiFetch({ path: `/family-notebook/v1/workspaces/${workspace.id}/users` })
                .then(setWorkspaceUsers)
                .catch(err => console.error("Failed to load users", err));
        }
    }, [isManagingUsers, workspace.id]);
    
    useEffect(() => {
        if (!document.querySelector('link[rel="manifest"]')) {
            const manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            manifestLink.href = '/fn-manifest.json';
            document.head.appendChild(manifestLink);
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/fn-sw.js').catch(err => console.log('SW Reg Failed:', err));
        }

        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);
    
    const handleInviteUser = (e) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        setIsInviting(true);

        apiFetch({
            path: `/family-notebook/v1/workspaces/${workspace.id}/users`,
            method: 'POST',
            data: { email: inviteEmail }
        }).then(() => {
            return apiFetch({ path: `/family-notebook/v1/workspaces/${workspace.id}/users` });
        }).then((updatedUsers) => {
            setWorkspaceUsers(updatedUsers);
            setInviteEmail('');
            setIsInviting(false);
            alert(__("User added successfully!", 'family-notebook'));
        }).catch((err) => {
            setIsInviting(false);
            alert(err.message || __("Failed to add user.", 'family-notebook'));
        });
    };
    
    const handleSaveWorkspaceEdit = (e) => {
        e.preventDefault();
        if (!editWorkspaceName.trim()) return;

        apiFetch({
            path: `/family-notebook/v1/workspaces/${workspace.id}`,
            method: 'PUT',
            data: { name: editWorkspaceName, color: editWorkspaceColor }
        }).then(() => {
            window.location.reload(); 
        }).catch(err => {
            console.error(err);
            alert(__('Failed to update workspace.', 'family-notebook'));
        });
    };

    const handleUpdateUserRole = (userId, newRole) => {
        setWorkspaceUsers(workspaceUsers.map(user => 
            user.id === userId ? { ...user, role: newRole, is_owner: newRole === 'owner' } : user
        ));

        apiFetch({
            path: `/family-notebook/v1/workspaces/${workspace.id}/users/${userId}`,
            method: 'PUT',
            data: { role: newRole }
        }).catch((err) => {
            alert(err.message || __('Failed to update role.', 'family-notebook'));
            apiFetch({ path: `/family-notebook/v1/workspaces/${workspace.id}/users` }).then(setWorkspaceUsers);
        });
    };

    const handleRemoveUser = (userId, userName) => {
        if (!window.confirm(sprintf(__('Remove %s from this workspace?', 'family-notebook'), userName))) return;

        apiFetch({
            path: `/family-notebook/v1/workspaces/${workspace.id}/users/${userId}`,
            method: 'DELETE'
        }).then(() => {
            setWorkspaceUsers(workspaceUsers.filter(u => u.id !== userId));
        }).catch((err) => {
            alert(err.message || __('Failed to remove user.', 'family-notebook'));
        });
    };
    
    const handleCreateItem = (e, isFolder) => {
        e.preventDefault();
        const title = isFolder ? newFolderName : newNoteTitle;
        if (!title.trim()) return;

        apiFetch({
            path: '/family-notebook/v1/notes/create',
            method: 'POST',
            data: { 
                title: title, 
                workspace_id: workspace.id,
                parent_id: isFolder ? 0 : selectedFolder.id,
                template_id: !isFolder ? selectedTemplateId : ''
            }
        }).then((newItem) => {
            setItems([...items, newItem]);
            if (isFolder) {
                setNewFolderName('');
                setIsCreatingFolder(false);
            } else {
                setNewNoteTitle('');
                setSelectedTemplateId(''); 
                setIsCreatingNote(false);
                setActiveNoteId(newItem.id);
            }
        }).catch(console.error);
    };

    const handleQuickAddSubmit = (e) => {
        e.preventDefault();
        
        if (quickAddType === 'folder') {
            if (!newFolderName.trim()) return;
            apiFetch({
                path: '/family-notebook/v1/notes/create',
                method: 'POST',
                data: { title: newFolderName, workspace_id: workspace.id, parent_id: 0, template_id: '' }
            }).then((newItem) => {
                setItems([...items, newItem]);
                setNewFolderName('');
                setIsQuickAddOpen(false);
                setSelectedFolder(newItem);
            }).catch(console.error);
        } else {
            if (!newNoteTitle.trim() || !quickAddTargetFolder) return alert(__("Please provide a title and select a folder.", 'family-notebook'));
            apiFetch({
                path: '/family-notebook/v1/notes/create',
                method: 'POST',
                data: { title: newNoteTitle, workspace_id: workspace.id, parent_id: quickAddTargetFolder, template_id: selectedTemplateId }
            }).then((newItem) => {
                setItems([...items, newItem]);
                setNewNoteTitle('');
                setSelectedTemplateId('');
                setIsQuickAddOpen(false);
                setSelectedFolder(folders.find(f => f.id === parseInt(quickAddTargetFolder)));
                setActiveNoteId(newItem.id);
            }).catch(console.error);
        }
    };

    const submitNoteAction = (newFolderId) => {
        if (!newFolderId || !actionNote) return;
        
        if (actionNote.type === 'move') {
            apiFetch({
                path: `/family-notebook/v1/notes/${actionNote.id}`,
                method: 'PUT',
                data: { parent_id: newFolderId } 
            }).then(() => {
                setItems(items.map(item => item.id === actionNote.id ? { ...item, parent_id: newFolderId } : item));
                setActionNote(null);
            }).catch(err => { console.error(err); alert(__("Failed to move note.", 'family-notebook')); });
        } 
        else if (actionNote.type === 'copy') {
            apiFetch({
                path: `/family-notebook/v1/notes/${actionNote.id}/copy`,
                method: 'POST',
                data: { parent_id: newFolderId } 
            }).then((newNote) => {
                setItems([...items, newNote]);
                setActionNote(null);
            }).catch(err => { console.error(err); alert(__("Failed to copy note.", 'family-notebook')); });
        }
    };
    
    const handleInstallApp = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
            setInstallPrompt(null);
        }
    };
    
    const handleDeleteFolder = () => {
        if (!selectedFolder) return;
        if (!window.confirm(sprintf(__('Are you sure you want to delete the folder "%s" and ALL notes inside it?', 'family-notebook'), selectedFolder.title))) return;

        apiFetch({ path: `/family-notebook/v1/notes/${selectedFolder.id}`, method: 'DELETE' })
            .then(() => {
                setItems(items.filter(item => Number(item.id) !== Number(selectedFolder.id) && Number(item.parent_id) !== Number(selectedFolder.id)));
                setSelectedFolder(null);
            })
            .catch((err) => alert(__("Server rejected deletion.", 'family-notebook')));
    };

    const handleRenameFolder = () => {
        if (!selectedFolder) return;
        const newTitle = window.prompt(__("Enter new folder name:", 'family-notebook'), selectedFolder.title);
        if (!newTitle || newTitle.trim() === '' || newTitle === selectedFolder.title) return;

        apiFetch({
            path: `/family-notebook/v1/notes/${selectedFolder.id}`,
            method: 'PUT',
            data: { title: newTitle, content: [] }
        }).then(() => {
            setItems(items.map(item => item.id === selectedFolder.id ? { ...item, title: newTitle } : item));
            setSelectedFolder({ ...selectedFolder, title: newTitle });
        }).catch(console.error);
    };

    const handleDeleteNote = (e, noteId, noteTitle) => {
        e.stopPropagation(); 
        if (!window.confirm(sprintf(__('Delete the note "%s"?', 'family-notebook'), noteTitle))) return;

        apiFetch({ path: `/family-notebook/v1/notes/${noteId}`, method: 'DELETE' })
            .then(() => setItems(items.filter(item => Number(item.id) !== Number(noteId))))
            .catch((err) => alert(__("Server rejected deletion.", 'family-notebook')));
    };
    
    const handleExportFolder = () => {
        if (!selectedFolder) return;
        
        apiFetch({ path: `/family-notebook/v1/export/${selectedFolder.id}` })
            .then((exportData) => {
                const jsonString = JSON.stringify(exportData, null, 2);
                const blob = new Blob([jsonString], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = url;
                const safeName = selectedFolder.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                link.download = `${safeName}_template.json`;
                
                document.body.appendChild(link);
                link.click();
                
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            })
            .catch((error) => alert(__("Failed to export template.", 'family-notebook')));
    };
    
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const parsedJSON = JSON.parse(e.target.result);
                apiFetch({
                    path: '/family-notebook/v1/import',
                    method: 'POST',
                    data: { workspace_id: workspace.id, template_data: parsedJSON }
                }).then((response) => {
                    setItems([...items, ...response.new_items]);
                    setIsImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    alert(__("Template imported successfully!", 'family-notebook'));
                }).catch((error) => {
                    alert(__("Failed to import template to the database.", 'family-notebook'));
                    setIsImporting(false);
                });

            } catch (error) {
                alert(__("This file is not a valid Family Notebook template.", 'family-notebook'));
                setIsImporting(false);
            }
        };
        
        reader.readAsText(file);
    };
    
    const folders = items.filter(item => item.parent_id === 0);
    const activeNotes = selectedFolder ? items.filter(item => item.parent_id === selectedFolder.id) : [];

    // Shared Styles
    const headerStyle = { 
        backgroundColor: displayColor, 
        padding: '20px', 
        borderRadius: isMobile ? '0' : '8px',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: isMobile ? '0' : '20px',
        transition: 'background-color 0.3s ease'
    };
    
    const sidebarItemStyle = (isActive) => ({
        padding: '10px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
        backgroundColor: isActive ? 'white' : 'transparent', fontWeight: isActive ? 'bold' : 'normal', borderRadius: isActive ? '4px' : '0'
    });
    
    const sidebarStyle = isMobile ? {
        position: 'absolute', top: 0, left: 0, bottom: 0, height: '100%', width: '280px',
        backgroundColor: '#f1f5f9', padding: '20px', zIndex: 999999,
        boxShadow: '4px 0 15px rgba(0,0,0,0.2)',
        transform: showMobileSidebar ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s ease-in-out',
        overflowY: 'auto'
    } : {
        width: '250px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', display: 'flex', flexDirection: 'column'
    };
    const noteCardStyle = { border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', backgroundColor: '#f8fafc' };

    return (
        <div style={{ position: 'relative', overflowX: 'hidden', minHeight: '100vh' }}>
            {/* QUICK ADD FAB */}
            {canEdit && !activeNoteId && (
                <>
                    <button 
                        className="fn-hide-print"
                        onClick={() => setIsQuickAddOpen(true)}
                        style={{
                            position: 'fixed', bottom: '30px', right: '30px', width: '60px', height: '60px',
                            backgroundColor: displayColor, color: headerTextColor, borderRadius: '50%',
                            border: 'none', fontSize: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            cursor: 'pointer', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center',
                            transition: 'transform 0.2s, background-color 0.3s ease, color 0.3s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        +
                    </button>

                    {/* QUICK ADD MODAL */}
                    {isQuickAddOpen && (
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999998, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3 style={{ margin: 0, color: '#1e293b' }}>{__('Quick Add', 'family-notebook')}</h3>
                                    <button onClick={() => setIsQuickAddOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                    <button 
                                        onClick={() => setQuickAddType('note')} 
                                        style={{ flex: 1, padding: '10px', borderRadius: '4px', cursor: 'pointer', border: quickAddType === 'note' ? `2px solid ${displayColor}` : '1px solid #cbd5e1', backgroundColor: quickAddType === 'note' ? '#f8fafc' : 'white', fontWeight: quickAddType === 'note' ? 'bold' : 'normal', color: '#334155' }}
                                    >📝 {__('New Note', 'family-notebook')}</button>
                                    <button 
                                        onClick={() => setQuickAddType('folder')} 
                                        style={{ flex: 1, padding: '10px', borderRadius: '4px', cursor: 'pointer', border: quickAddType === 'folder' ? `2px solid ${displayColor}` : '1px solid #cbd5e1', backgroundColor: quickAddType === 'folder' ? '#f8fafc' : 'white', fontWeight: quickAddType === 'folder' ? 'bold' : 'normal', color: '#334155' }}
                                    >📁 {__('New Folder', 'family-notebook')}</button>
                                </div>

                                <form onSubmit={handleQuickAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {quickAddType === 'folder' ? (
                                        <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder={__("Folder Name...", 'family-notebook')} required autoFocus style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
                                    ) : (
                                        <>
                                            <input type="text" value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} placeholder={__("Note Title...", 'family-notebook')} required autoFocus style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }} />
                                            
                                            <select value={quickAddTargetFolder} onChange={(e) => setQuickAddTargetFolder(e.target.value)} required style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: 'white' }}>
                                                <option value="" disabled>{__('-- Select Destination Folder --', 'family-notebook')}</option>
                                                {folders.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                                            </select>

                                            <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: 'white' }}>
                                                <option value="">{__('(Optional) Start from Template', 'family-notebook')}</option>
                                                {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.title}</option>)}
                                            </select>
                                        </>
                                    )}
                                    <button type="submit" style={{ backgroundColor: displayColor, color: headerTextColor, border: 'none', padding: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
                                        {quickAddType === 'note' ? __('Create Note', 'family-notebook') : __('Create Folder', 'family-notebook')}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </>
            )}
            
            {isMobile && showMobileSidebar && (
                <div 
                    onClick={() => setShowMobileSidebar(false)} 
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999998 }} 
                />
            )}
            
           {/* MANAGE ACCESS MODAL */}
            {isManagingUsers && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999998, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '80px', paddingLeft: '20px', paddingRight: '20px', paddingBottom: '20px' }}>
                    <div style={{ backgroundColor: 'white', padding: isMobile ? '20px' : '30px', borderRadius: '8px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, color: '#1e293b' }}>{__('Workspace Access', 'family-notebook')}</h2>
                            <button onClick={() => setIsManagingUsers(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                        </div>

                        <form onSubmit={handleInviteUser} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginBottom: '30px' }}>
                            <input 
                                type="email" 
                                placeholder={__("Enter user's WordPress email...", 'family-notebook')}
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                style={{ flex: 1, padding: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', boxSizing: 'border-box', width: '100%' }}
                                required
                            />
                            <button disabled={isInviting} style={{ backgroundColor: displayColor, color: headerTextColor, border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: isMobile ? '100%' : 'auto' }}>
                                {isInviting ? __('Sending...', 'family-notebook') : __('Invite', 'family-notebook')}
                            </button>
                        </form>

                        <h4 style={{ margin: '0 0 15px 0', color: '#64748b', textTransform: 'uppercase', fontSize: '12px' }}>{__('Current Members', 'family-notebook')}</h4>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '300px', overflowY: 'auto' }}>
                            {workspaceUsers.map(user => (
                                <li key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', color: '#334155' }}>
                                            {user.name} 
                                            {user.is_owner && <span style={{ fontSize: '11px', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '10px', marginLeft: '8px' }}>{__('Owner', 'family-notebook')}</span>}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>{user.email}</div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        {canManageUsers ? (
                                            <select 
                                                value={user.role || (user.is_owner ? 'owner' : 'viewer')} 
                                                onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                                                style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', marginRight: '10px', outline: 'none', backgroundColor: '#f8fafc' }}
                                            >
                                                <option value="owner">{__('Owner', 'family-notebook')}</option>
                                                <option value="organizer">{__('Organizer', 'family-notebook')}</option>
                                                <option value="user">{__('User', 'family-notebook')}</option>
                                                <option value="viewer">{__('Viewer', 'family-notebook')}</option>
                                            </select>
                                        ) : (
                                            <span style={{ fontSize: '11px', backgroundColor: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', marginRight: '10px', textTransform: 'capitalize', color: '#64748b' }}>
                                                {user.role}
                                            </span>
                                        )}

                                        {canManageUsers && !user.is_owner && (
                                            <button onClick={() => handleRemoveUser(user.id, user.name)} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>{__('Remove', 'family-notebook')}</button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            
            {/* MOVE/COPY NOTE MODAL */}
            {actionNote && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999998, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '80px', paddingLeft: '20px', paddingRight: '20px', paddingBottom: '20px' }}>
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 20px 0', color: '#1e293b', textTransform: 'capitalize' }}>
                            {actionNote.type === 'copy' ? __('Copy Note', 'family-notebook') : __('Move Note', 'family-notebook')}
                        </h3>
                        <p style={{ marginBottom: '15px', color: '#64748b', fontSize: '14px' }}>{__('Select destination folder:', 'family-notebook')}</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                            {folders.filter(f => actionNote.type === 'copy' || f.id !== selectedFolder?.id).map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => submitNoteAction(f.id)}
                                    style={{ padding: '12px', textAlign: 'left', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white', cursor: 'pointer', color: '#334155', fontWeight: 'bold', transition: 'background 0.2s' }}
                                >
                                    📁 {f.title}
                                </button>
                            ))}
                            {folders.filter(f => actionNote.type === 'copy' || f.id !== selectedFolder?.id).length === 0 && (
                                <p style={{ color: '#ef4444', fontSize: '14px', textAlign: 'center', padding: '10px 0' }}>{__('No other folders available.', 'family-notebook')}</p>
                            )}
                        </div>
                        
                        <button onClick={() => setActionNote(null)} style={{ marginTop: '20px', width: '100%', padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#475569', fontWeight: 'bold' }}>{__('Cancel', 'family-notebook')}</button>
                    </div>
                </div>
            )}
            
            {/* HEADER */}
            <div style={headerStyle} className="fn-hide-print">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {isMobile && (
                        <button 
                            onClick={() => setShowMobileSidebar(true)} 
                            style={{ background: 'transparent', border: 'none', color: headerTextColor, fontSize: '24px', cursor: 'pointer', padding: 0 }}
                        >
                            &#9776;
                        </button>
                    )}
                    {/* EXPLICITLY APPLYING THE CALCULATED CONTRAST COLOR HERE TO AVOID CSS OVERRIDES */}
                    <h2 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', color: headerTextColor, transition: 'color 0.3s ease' }}>{workspace.name}</h2>
                    
                    {isOwner && !isMobile && (
                        <div style={{ display: 'flex', gap: '15px', marginLeft: '10px' }}>
                            <button 
                                onClick={() => setIsEditingWorkspace(true)} 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: 0 }} 
                                title={__('Edit Workspace', 'family-notebook')}
                            >
                                ✏️
                            </button>

                            <button 
                                onClick={() => {
                                    if(window.confirm(__("Are you sure you want to delete this workspace and ALL notes? This cannot be undone.", 'family-notebook'))) {
                                        apiFetch({ path: `/family-notebook/v1/workspaces/${workspace.id}`, method: 'DELETE' })
                                            .then(() => window.location.reload())
                                            .catch(err => alert("Failed to delete"));
                                    }
                                }} 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: 0 }} 
                                title={__('Delete Workspace', 'family-notebook')}
                            >
                                🗑️
                            </button>
                        </div>
                    )}
                </div>
                <button 
                    style={{ backgroundColor: headerTextColor === '#ffffff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)', color: headerTextColor, border: 'none', padding: isMobile ? '6px 10px' : '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '12px' : '14px', transition: 'all 0.3s ease' }} 
                    onClick={onBack}
                >
                    &larr; {isMobile ? __('Back', 'family-notebook') : __('Switch Workspace', 'family-notebook')}
                </button>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', padding: '0 20px' }}>
                {installPrompt && (
                    <button 
                        style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: isMobile ? '6px 10px' : '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '12px' : '14px', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.4)' }} 
                        onClick={handleInstallApp}
                    >
                        📱 {__('Install App', 'family-notebook')}
                    </button>
                )}

                {canManageUsers && (
                    <button 
                        style={{ backgroundColor: 'white', color: displayColor, border: `1px solid ${displayColor}`, padding: isMobile ? '6px 10px' : '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '12px' : '14px' }} 
                        onClick={() => setIsManagingUsers(true)}
                    >
                        ⚙️ {__('Manage Access', 'family-notebook')}
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', gap: '20px', minHeight: '500px', padding: '0 20px' }}>
                {/* SIDEBAR: FOLDERS */}
                <div style={sidebarStyle} className="fn-hide-print">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3 style={{ fontSize: '14px', color: '#64748b', textTransform: 'uppercase', margin: 0 }}>{__('Folders', 'family-notebook')}</h3>
                        {isMobile && (
                            <button onClick={() => setShowMobileSidebar(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                        )}
                        {!isMobile && canEdit && (
                            <button onClick={() => setIsCreatingFolder(!isCreatingFolder)} style={{ background: 'none', border: 'none', color: displayColor, cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>+</button>
                        )}
                    </div>

                    {canEdit && (
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexDirection: 'column' }}>
                            {isMobile && (
                                <button onClick={() => setIsCreatingFolder(!isCreatingFolder)} style={{ width: '100%', backgroundColor: 'transparent', border: `1px dashed ${displayColor}`, color: displayColor, padding: '8px', borderRadius: '4px' }}>+ {__('New Folder', 'family-notebook')}</button>
                            )}
                            
                            <input 
                                type="file" 
                                accept=".json" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }} 
                                onChange={handleFileChange} 
                            />
                            <button 
                                onClick={() => fileInputRef.current && fileInputRef.current.click()} 
                                disabled={isImporting}
                                style={{ width: '100%', backgroundColor: 'white', border: '1px solid #cbd5e1', color: '#64748b', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                            >
                                {isImporting ? __('Importing...', 'family-notebook') : __('↑ Upload Template', 'family-notebook')}
                            </button>
                        </div>
                    )}

                    {isCreatingFolder && (
                        <form onSubmit={(e) => handleCreateItem(e, true)} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                            <input 
                                type="text" 
                                value={newFolderName} 
                                onChange={(e) => setNewFolderName(e.target.value)} 
                                placeholder={__("Folder name...", 'family-notebook')}
                                autoFocus 
                                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }} 
                            />
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button type="submit" style={{ flex: 1, backgroundColor: displayColor, color: headerTextColor, border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{__('Save', 'family-notebook')}</button>
                                <button type="button" onClick={() => setIsCreatingFolder(false)} style={{ flex: 1, backgroundColor: 'transparent', border: '1px solid #cbd5e1', color: '#64748b', padding: '8px', borderRadius: '4px', cursor: 'pointer' }}>{__('Cancel', 'family-notebook')}</button>
                            </div>
                        </form>
                    )}

                    {isLoading ? <p style={{ color: '#64748b', fontSize: '14px' }}>{__('Loading folders...', 'family-notebook')}</p> : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#334155' }}>
                            {folders.map(folder => (
                                <li 
                                    key={folder.id} 
                                    style={sidebarItemStyle(selectedFolder?.id === folder.id)} 
                                    onClick={() => { 
                                        setSelectedFolder(folder); 
                                        setActiveNoteId(null);
                                        setShowMobileSidebar(false); 
                                    }}
                                >
                                    <span style={{ fontSize: '20px' }}>&#128193;</span> <span style={{ fontSize: '16px' }}>{folder.title}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* MAIN CANVAS */}
                <div style={{ 
                    flex: 1, 
                    backgroundColor: 'white', 
                    padding: isMobile ? '15px' : '30px', 
                    borderRadius: isMobile ? '0' : '8px',  
                    border: isMobile ? 'none' : '1px solid #e2e8f0',
                    minHeight: '500px', 
                    width: '100%' 
                }}>
                    
                    {activeNoteId ? (
                        <NoteEditor 
                            noteId={activeNoteId} 
                            workspaceId={workspace.id}
                            folderId={selectedFolder.id}
                            workspaceColor={displayColor} 
                            onClose={() => setActiveNoteId(null)} 
                            canEdit={canEdit}
                            onNoteCreated={(newNote) => {
                                setItems([...items, newNote]);
                                setActiveNoteId(newNote.id);
                            }}
                            onNoteUpdated={(id, newTitle) => {
                                setItems(items.map(item => item.id === id ? { ...item, title: newTitle } : item));
                            }}
                            onTemplateSaved={(newTemplate) => {
                                setTemplates([...templates, newTemplate]);
                            }}
                        />
                    ) : (
                        !selectedFolder ? (
                            <div>
                                <div style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '30px', marginTop: '20px' }}>
                                    <span style={{ fontSize: '40px', display: 'block', marginBottom: '10px' }}>&#128194;</span>
                                    <h3 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>{__('Select a Folder', 'family-notebook')}</h3>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
                                    {folders.map(folder => (
                                        <div 
                                            key={folder.id} 
                                            onClick={() => { 
                                                setSelectedFolder(folder); 
                                                setActiveNoteId(null); 
                                                setShowMobileSidebar(false); 
                                            }}
                                            style={{ 
                                                backgroundColor: '#f8fafc', 
                                                border: '1px solid #e2e8f0', 
                                                borderRadius: '8px', 
                                                padding: '20px 10px', 
                                                textAlign: 'center', 
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                            }}
                                        >
                                            <span style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }}>📁</span>
                                            <span style={{ fontWeight: 'bold', color: '#334155', fontSize: '14px', wordWrap: 'break-word' }}>{folder.title}</span>
                                        </div>
                                    ))}
                                </div>

                                {folders.length === 0 && canEdit && (
                                    <div style={{ textAlign: 'center', marginTop: '30px' }}>
                                        <button 
                                            onClick={() => isMobile ? setShowMobileSidebar(true) : setIsCreatingFolder(true)} 
                                            style={{ backgroundColor: displayColor, color: headerTextColor, border: 'none', padding: '12px 24px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            + {__('Create Your First Folder', 'family-notebook')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '15px', marginBottom: '20px', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <h3 style={{ margin: 0, fontSize: '24px', color: '#1e293b' }}>{selectedFolder.title}</h3>
                                        
                                        {canEdit && (
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <button onClick={handleRenameFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94a3b8' }} title={__('Rename Folder', 'family-notebook')}>✎</button>
                                                <button onClick={handleDeleteFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#ef4444' }} title={__('Delete Folder', 'family-notebook')}>✖</button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '10px', width: isMobile ? '100%' : 'auto', flexDirection: isMobile ? 'column' : 'row' }}>
                                        <button onClick={handleExportFolder} style={{ backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: isMobile ? '100%' : 'auto' }}>
                                            ↓ {__('Export Template', 'family-notebook')}
                                        </button>
                                        
                                        {canEdit && (
                                            <button onClick={() => setIsCreatingNote(!isCreatingNote)} style={{ backgroundColor: displayColor, color: headerTextColor, border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: isMobile ? '100%' : 'auto' }}>
                                                + {__('New Note', 'family-notebook')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                    
                                {isCreatingNote && (
                                    <form onSubmit={(e) => handleCreateItem(e, false)} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: 0, color: '#334155' }}>{__('Create a New Note', 'family-notebook')}</h4>
                                        
                                        <input type="text" value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} placeholder={__("Note Title (e.g. Costco Trip)", 'family-notebook')} autoFocus style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '16px', boxSizing: 'border-box' }} />
                                        
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '5px' }}>{__('Start From Template', 'family-notebook')}</label>
                                            <select 
                                                value={selectedTemplateId} 
                                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                                style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '16px', backgroundColor: 'white' }}
                                            >
                                                <option value="">{__('Blank Note', 'family-notebook')}</option>
                                                {templates.map(tpl => (
                                                    <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                            <button type="submit" style={{ backgroundColor: displayColor, color: headerTextColor, border: 'none', padding: '12px 20px', borderRadius: '4px', cursor: 'pointer', flex: 1, fontWeight: 'bold' }}>{__('Create Note', 'family-notebook')}</button>
                                            <button type="button" onClick={() => setIsCreatingNote(false)} style={{ backgroundColor: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', padding: '12px 20px', borderRadius: '4px', cursor: 'pointer', flex: 1 }}>{__('Cancel', 'family-notebook')}</button>
                                        </div>
                                    </form>
                                )}

                                {activeNotes.length === 0 && !isCreatingNote ? (
                                    <p style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>{__('This folder is empty.', 'family-notebook')}</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {activeNotes.map(note => (
                                            <div 
                                                key={note.id} 
                                                style={noteCardStyle} 
                                                onClick={() => setActiveNoteId(note.id)}
                                            >
                                                <div>
                                                    <h4 style={{ margin: '0 0 5px 0', color: '#0f172a', fontSize: '18px' }}>{note.title}</h4>
                                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{__('Tap to view', 'family-notebook')}</span>
                                                </div>
                                                
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {canEdit && (
                                                        <>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setActionNote({ id: note.id, type: 'copy' }); }} 
                                                                style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', color: '#10b981' }}
                                                                title={__('Copy Note', 'family-notebook')}
                                                            >⎘ {__('Copy', 'family-notebook')}</button>

                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setActionNote({ id: note.id, type: 'move' }); }} 
                                                                style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', color: '#0284c7' }}
                                                                title={__('Move Note', 'family-notebook')}
                                                            >➡️ {__('Move', 'family-notebook')}</button>

                                                            <button 
                                                                onClick={(e) => handleDeleteNote(e, note.id, note.title)} 
                                                                style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', color: '#ef4444' }}
                                                                title={__('Delete Note', 'family-notebook')}
                                                            >✖</button>
                                                        </>
                                                    )}
                                                    <span style={{ color: displayColor, fontWeight: 'bold', fontSize: '20px', marginLeft: '5px' }}>&rarr;</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* EDIT WORKSPACE MODAL */}
            {isEditingWorkspace && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999998, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '80px', paddingLeft: '20px', paddingRight: '20px', paddingBottom: '20px' }}>
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, color: '#1e293b' }}>{__('Edit Workspace', 'family-notebook')}</h3>
                            <button onClick={() => setIsEditingWorkspace(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                        </div>

                        <form onSubmit={handleSaveWorkspaceEdit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '5px' }}>
                                    {__('Workspace Name', 'family-notebook')}
                                </label>
                                <input 
                                    type="text" 
                                    value={editWorkspaceName} 
                                    onChange={(e) => setEditWorkspaceName(e.target.value)} 
                                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
                                    required
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '5px' }}>
                                    {__('Theme Color', 'family-notebook')}
                                </label>
                                <input 
                                    type="color" 
                                    value={editWorkspaceColor} 
                                    onChange={(e) => setEditWorkspaceColor(e.target.value)} 
                                    style={{ width: '100%', height: '40px', padding: '0', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button type="submit" style={{ flex: 1, backgroundColor: editWorkspaceColor, color: getContrastTextColor(editWorkspaceColor), border: 'none', padding: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.3s ease, color 0.3s ease' }}>
                                    {__('Save Changes', 'family-notebook')}
                                </button>
                                <button type="button" onClick={() => setIsEditingWorkspace(false)} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#475569', border: 'none', padding: '12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    {__('Cancel', 'family-notebook')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkspaceView;