import { useState, useEffect, useRef } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import NoteEditor from './NoteEditor';

// Helper function to calculate accessibility contrast
const getContrastTextColor = (hexColor) => {
    // If no color or invalid color, default to white
    if (!hexColor || hexColor.length !== 7) return '#ffffff';

    // Convert Hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Calculate Perceived Brightness (ITU-R BT.709 formula)
    const brightness = (r * 0.299) + (g * 0.587) + (b * 0.114);

    // If brightness is high (light background), return dark text.
    // Otherwise, return white text.
    return brightness > 128 ? '#0f172a' : '#ffffff';
};

const WorkspaceView = ({ workspace, onBack }) => {
	console.log("Workspace Data received:", workspace);
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
	// Move/Copy Note State
    // Format: { id: 123, type: 'move' | 'copy' }
    const [actionNote, setActionNote] = useState(null);
	// Mobile Responsiveness State
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);
	
	// Import State
    const fileInputRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
	
	// User Management State
    const [isManagingUsers, setIsManagingUsers] = useState(false);
    const [workspaceUsers, setWorkspaceUsers] = useState([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
	
	useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    // Calculate the best text color for the current workspace header
    const headerTextColor = getContrastTextColor(workspace.color);
    
	useEffect(() => {
        // Fetch Templates from the Library
        apiFetch({ path: '/family-notebook/v1/templates' })
            .then(data => setTemplates(data))
            .catch(err => console.error("Failed to load templates", err));
    }, []);
    
	useEffect(() => {
        setIsLoading(true);
        apiFetch({ path: `/family-notebook/v1/notes?workspace_id=${workspace.id}` })
            .then((data) => {
                setItems(data);
                setIsLoading(false);
            })
            .catch(console.error);
    }, [workspace.id]);

	// Fetch users when the modal opens
    useEffect(() => {
        if (isManagingUsers) {
            apiFetch({ path: `/family-notebook/v1/workspaces/${workspace.id}/users` })
                .then(setWorkspaceUsers)
                .catch(err => console.error("Failed to load users", err));
        }
    }, [isManagingUsers, workspace.id]);

    const handleInviteUser = (e) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        setIsInviting(true);

        apiFetch({
            path: `/family-notebook/v1/workspaces/${workspace.id}/users`,
            method: 'POST',
            data: { email: inviteEmail }
        }).then(() => {
            // Refresh the user list
            return apiFetch({ path: `/family-notebook/v1/workspaces/${workspace.id}/users` });
        }).then((updatedUsers) => {
            setWorkspaceUsers(updatedUsers);
            setInviteEmail('');
            setIsInviting(false);
            alert("User added successfully!");
        }).catch((err) => {
            setIsInviting(false);
            alert(err.message || "Failed to add user. Are you sure they have a WordPress account?");
        });
    };

    const handleRemoveUser = (userId, userName) => {
        if (!window.confirm(`Remove ${userName} from this workspace?`)) return;

        apiFetch({
            path: `/family-notebook/v1/workspaces/${workspace.id}/users/${userId}`,
            method: 'DELETE'
        }).then(() => {
            setWorkspaceUsers(workspaceUsers.filter(u => u.id !== userId));
        }).catch((err) => {
            alert(err.message || "Failed to remove user.");
        });
    };
	
    // Handle Creating Both Folders AND Notes
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
                template_id: !isFolder ? selectedTemplateId : '' // NEW: Pass the template ID
            }
        }).then((newItem) => {
            setItems([...items, newItem]);
            if (isFolder) {
                setNewFolderName('');
                setIsCreatingFolder(false);
            } else {
                setNewNoteTitle('');
                setSelectedTemplateId(''); // Reset selection
                setIsCreatingNote(false);
                setActiveNoteId(newItem.id); // Instantly open the newly created note!
            }
        }).catch(console.error);
    };
	// Execute Move or Copy
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
            }).catch(err => { console.error(err); alert("Failed to move note."); });
        } 
        else if (actionNote.type === 'copy') {
            apiFetch({
                path: `/family-notebook/v1/notes/${actionNote.id}/copy`,
                method: 'POST',
                data: { parent_id: newFolderId } 
            }).then((newNote) => {
                setItems([...items, newNote]); // Add the duplicated note to local state
                setActionNote(null);
            }).catch(err => { console.error(err); alert("Failed to copy note."); });
        }
    };
	// 1. Delete a Folder
    const handleDeleteFolder = () => {
        if (!selectedFolder) return;
        if (!window.confirm(`Are you sure you want to delete the folder "${selectedFolder.title}" and ALL notes inside it?`)) return;

        apiFetch({ path: `/family-notebook/v1/notes/${selectedFolder.id}`, method: 'DELETE' })
            .then(() => {
                // Forcing Number() casting guarantees the filter works
                setItems(items.filter(item => Number(item.id) !== Number(selectedFolder.id) && Number(item.parent_id) !== Number(selectedFolder.id)));
                setSelectedFolder(null);
            })
            .catch((err) => {
                console.error("Delete failed:", err);
                alert("Server rejected deletion. Check the console.");
            });
    };

    // 2. Rename a Folder
    const handleRenameFolder = () => {
        if (!selectedFolder) return;
        const newTitle = window.prompt("Enter new folder name:", selectedFolder.title);
        if (!newTitle || newTitle.trim() === '' || newTitle === selectedFolder.title) return;

        apiFetch({
            path: `/family-notebook/v1/notes/${selectedFolder.id}`,
            method: 'PUT',
            data: { title: newTitle, content: [] } // Content is empty because it's just a folder
        }).then(() => {
            setItems(items.map(item => item.id === selectedFolder.id ? { ...item, title: newTitle } : item));
            setSelectedFolder({ ...selectedFolder, title: newTitle });
        }).catch(console.error);
    };

    // 3. Delete a Note
    const handleDeleteNote = (e, noteId, noteTitle) => {
        e.stopPropagation(); 
        if (!window.confirm(`Delete the note "${noteTitle}"?`)) return;

        apiFetch({ path: `/family-notebook/v1/notes/${noteId}`, method: 'DELETE' })
            .then(() => {
                // Forcing Number() casting guarantees the filter works
                setItems(items.filter(item => Number(item.id) !== Number(noteId)));
            })
            .catch((err) => {
                console.error("Delete failed:", err);
                alert("Server rejected deletion. Check the console.");
            });
    };
	// Handle Exporting a Folder as a JSON File
    const handleExportFolder = () => {
        if (!selectedFolder) return;
        
        apiFetch({ path: `/family-notebook/v1/export/${selectedFolder.id}` })
            .then((exportData) => {
                // Convert the JSON object into a formatted string
                const jsonString = JSON.stringify(exportData, null, 2);
                
                // Create a temporary Blob and URL
                const blob = new Blob([jsonString], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                
                // Create an invisible anchor tag to trigger the browser download
                const link = document.createElement('a');
                link.href = url;
                // Clean the folder name for the file name (e.g. "Vacation Plans" -> "vacation_plans_template.json")
                const safeName = selectedFolder.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                link.download = `${safeName}_template.json`;
                
                document.body.appendChild(link);
                link.click();
                
                // Clean up
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            })
            .catch((error) => {
                console.error("Export failed", error);
                alert("Failed to export template.");
            });
    };
	// Handle Importing a JSON Template
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const parsedJSON = JSON.parse(e.target.result);
                
                // Send the parsed JSON to our new PHP endpoint
                apiFetch({
                    path: '/family-notebook/v1/import',
                    method: 'POST',
                    data: { workspace_id: workspace.id, template_data: parsedJSON }
                }).then((response) => {
                    // Instantly add the newly created folder and notes to our UI state
                    setItems([...items, ...response.new_items]);
                    setIsImporting(false);
                    // Reset the file input so it can be used again
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    alert("Template imported successfully!");
                }).catch((error) => {
                    console.error("Import API failed", error);
                    alert("Failed to import template to the database.");
                    setIsImporting(false);
                });

            } catch (error) {
                console.error("Invalid JSON", error);
                alert("This file is not a valid Family Notebook template.");
                setIsImporting(false);
            }
        };
        
        reader.readAsText(file);
    };
    // Filter our flat array into hierarchy
    const folders = items.filter(item => item.parent_id === 0);
    const activeNotes = selectedFolder ? items.filter(item => item.parent_id === selectedFolder.id) : [];

    // Shared Styles
    const headerStyle = { 
        backgroundColor: workspace.color, 
        color: headerTextColor, // Automatically selected based on brightness
        padding: '20px', 
        borderRadius: '8px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
    };
    
    const sidebarItemStyle = (isActive) => ({
        padding: '10px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
        backgroundColor: isActive ? 'white' : 'transparent', fontWeight: isActive ? 'bold' : 'normal', borderRadius: isActive ? '4px' : '0'
    });
    // Dynamic Sidebar Styling (Transforms into a slide-out drawer on mobile)
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
            {/* MOBILE BACKDROP SHADOW */}
            {isMobile && showMobileSidebar && (
                <div 
                    onClick={() => setShowMobileSidebar(false)} 
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999998 }} 
                />
            )}
            {/* MANAGE ACCESS MODAL */}
            {isManagingUsers && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, color: '#1e293b' }}>Workspace Access</h2>
                            <button onClick={() => setIsManagingUsers(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                        </div>

                        {/* Invite Form */}
                        <form onSubmit={handleInviteUser} style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
                            <input 
                                type="email" 
                                placeholder="Enter user's WordPress email..." 
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                style={{ flex: 1, padding: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
                                required
                            />
                            <button disabled={isInviting} style={{ backgroundColor: workspace.color, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                {isInviting ? 'Sending...' : 'Invite'}
                            </button>
                        </form>

                        {/* Current Users List */}
                        <h4 style={{ margin: '0 0 15px 0', color: '#64748b', textTransform: 'uppercase', fontSize: '12px' }}>Current Members</h4>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '300px', overflowY: 'auto' }}>
                            {workspaceUsers.map(user => (
                                <li key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', color: '#334155' }}>{user.name} {user.is_owner && <span style={{ fontSize: '11px', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '10px', marginLeft: '8px' }}>Owner</span>}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>{user.email}</div>
                                    </div>
                                    {!user.is_owner && (
                                        <button onClick={() => handleRemoveUser(user.id, user.name)} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
			
			{/* MOVE/COPY NOTE MODAL */}
            {actionNote && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 20px 0', color: '#1e293b', textTransform: 'capitalize' }}>
                            {actionNote.type} Note
                        </h3>
                        <p style={{ marginBottom: '15px', color: '#64748b', fontSize: '14px' }}>Select destination folder:</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                            {/* We filter out the current folder IF it's a move action. For copy, they might want to duplicate in the same folder */}
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
                                <p style={{ color: '#ef4444', fontSize: '14px', textAlign: 'center', padding: '10px 0' }}>No other folders available.</p>
                            )}
                        </div>
                        
                        <button onClick={() => setActionNote(null)} style={{ marginTop: '20px', width: '100%', padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#475569', fontWeight: 'bold' }}>Cancel</button>
                    </div>
                </div>
            )}
			
            {/* HEADER */}
            {/* UPDATED: Added className="fn-hide-print" */}
            <div style={headerStyle} className="fn-hide-print">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {/* HAMBURGER MENU (Only shows on Mobile) */}
                    {isMobile && (
                        <button 
                            onClick={() => setShowMobileSidebar(true)} 
                            style={{ background: 'transparent', border: 'none', color: headerTextColor, fontSize: '24px', cursor: 'pointer', padding: 0 }}
                        >
                            &#9776;
                        </button>
                    )}
                    <h2 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px' }}>{workspace.name}</h2>
                </div>
                <button 
                    style={{ backgroundColor: headerTextColor === '#ffffff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)', color: headerTextColor, border: 'none', padding: isMobile ? '6px 10px' : '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '12px' : '14px' }} 
                    onClick={onBack}
                >
                    &larr; {isMobile ? 'Back' : 'Switch Workspace'}
                </button>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
				{/* NEW: Manage Users Button */}
				<button 
					style={{ backgroundColor: 'white', color: workspace.color, border: 'none', padding: isMobile ? '6px 10px' : '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '12px' : '14px' }} 
					onClick={() => setIsManagingUsers(true)}
				>
					⚙️ Manage Access
				</button>

				{/* Existing Back Button */}
				<button 
					style={{ backgroundColor: headerTextColor === '#ffffff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)', color: headerTextColor, border: 'none', padding: isMobile ? '6px 10px' : '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '12px' : '14px' }} 
					onClick={onBack}
				>
					&larr; {isMobile ? 'Back' : 'Switch Workspace'}
				</button>
			</div>
            <div style={{ display: 'flex', gap: '20px', minHeight: '500px' }}>
                
                {/* SIDEBAR: FOLDERS */}
                {/* We apply our new dynamic 'sidebarStyle' here */}
                {/* UPDATED: Added className="fn-hide-print" */}
                <div style={sidebarStyle} className="fn-hide-print">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3 style={{ fontSize: '14px', color: '#64748b', textTransform: 'uppercase', margin: 0 }}>Folders</h3>
                        {/* Close button for mobile inside the drawer */}
                        {isMobile && (
                            <button onClick={() => setShowMobileSidebar(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                        )}
                        {!isMobile && (
                            <button onClick={() => setIsCreatingFolder(!isCreatingFolder)} style={{ background: 'none', border: 'none', color: workspace.color, cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>+</button>
                        )}
                    </div>

                    {/* Folder Actions */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexDirection: 'column' }}>
                        {isMobile && (
                            <button onClick={() => setIsCreatingFolder(!isCreatingFolder)} style={{ width: '100%', backgroundColor: 'transparent', border: `1px dashed ${workspace.color}`, color: workspace.color, padding: '8px', borderRadius: '4px' }}>+ New Folder</button>
                        )}
                        
                        {/* THE IMPORT BUTTON */}
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
                            {isImporting ? 'Importing...' : '↑ Upload Template'}
                        </button>
                    </div>

                    {isCreatingFolder && (
                        <form onSubmit={(e) => handleCreateItem(e, true)} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                            <input 
                                type="text" 
                                value={newFolderName} 
                                onChange={(e) => setNewFolderName(e.target.value)} 
                                placeholder="Folder name..." 
                                autoFocus 
                                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box' }} 
                            />
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button type="submit" style={{ flex: 1, backgroundColor: workspace.color, color: 'white', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                                <button type="button" onClick={() => setIsCreatingFolder(false)} style={{ flex: 1, backgroundColor: 'transparent', border: '1px solid #cbd5e1', color: '#64748b', padding: '8px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                            </div>
                        </form>
                    )}

                    {isLoading ? <p style={{ color: '#64748b', fontSize: '14px' }}>Loading folders...</p> : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#334155' }}>
                            {folders.map(folder => (
                                <li 
                                    key={folder.id} 
                                    style={sidebarItemStyle(selectedFolder?.id === folder.id)} 
                                    onClick={() => { 
                                        setSelectedFolder(folder); 
                                        setActiveNoteId(null);
                                        setShowMobileSidebar(false); // CRITICAL: Auto-close drawer when folder is tapped
                                    }}
                                >
                                    <span style={{ fontSize: '20px' }}>&#128193;</span> <span style={{ fontSize: '16px' }}>{folder.title}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* MAIN CANVAS: NOTES or EDITOR */}
                {/* On mobile, this takes 100% width since the sidebar is now floating */}
                <div style={{ flex: 1, backgroundColor: 'white', padding: isMobile ? '15px' : '30px', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '500px', width: '100%' }}>
                    
                    {activeNoteId ? (
                        <NoteEditor 
                            noteId={activeNoteId} 
                            workspaceId={workspace.id}
                            folderId={selectedFolder.id}
                            workspaceColor={workspace.color} 
                            onClose={() => setActiveNoteId(null)} 
                            onNoteCreated={(newNote) => {
                                setItems([...items, newNote]);
                                setActiveNoteId(newNote.id);
                            }}
                            onNoteUpdated={(id, newTitle) => {
                                setItems(items.map(item => item.id === id ? { ...item, title: newTitle } : item));
                            }}
                            // NEW: Catch the new template and add it to the dropdown state
                            onTemplateSaved={(newTemplate) => {
                                setTemplates([...templates, newTemplate]);
                            }}
                        />
                    ) : (
                        !selectedFolder ? (
                            <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '50px' }}>
                                <span style={{ fontSize: '40px', display: 'block', marginBottom: '10px' }}>&#128194;</span>
                                {isMobile ? "Tap the menu to select a folder." : "Select a folder to view its notes."}
                            </div>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '15px', marginBottom: '20px', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <h3 style={{ margin: 0, fontSize: '24px', color: '#1e293b' }}>{selectedFolder.title}</h3>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button onClick={handleRenameFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94a3b8' }} title="Rename Folder">✏️</button>
                                            <button onClick={handleDeleteFolder} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#ef4444' }} title="Delete Folder">🗑️</button>
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '10px', width: isMobile ? '100%' : 'auto', flexDirection: isMobile ? 'column' : 'row' }}>
                                        <button onClick={handleExportFolder} style={{ backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: isMobile ? '100%' : 'auto' }}>
                                            ↓ Export Template
                                        </button>
                                        <button onClick={() => setIsCreatingNote(!isCreatingNote)} style={{ backgroundColor: workspace.color, color: headerTextColor, border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: isMobile ? '100%' : 'auto' }}>
                                            + New Note
                                        </button>
                                    </div>
                                </div>
					
                                {isCreatingNote && (
                                    <form onSubmit={(e) => handleCreateItem(e, false)} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: 0, color: '#334155' }}>Create a New Note</h4>
                                        
                                        <input type="text" value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} placeholder="Note Title (e.g. Costco Trip)" autoFocus style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '16px', boxSizing: 'border-box' }} />
                                        
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '5px' }}>Start From Template</label>
                                            <select 
                                                value={selectedTemplateId} 
                                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                                style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '16px', backgroundColor: 'white' }}
                                            >
                                                <option value="">Blank Note</option>
                                                {templates.map(tpl => (
                                                    <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                            <button type="submit" style={{ backgroundColor: workspace.color, color: 'white', border: 'none', padding: '12px 20px', borderRadius: '4px', cursor: 'pointer', flex: 1, fontWeight: 'bold' }}>Create Note</button>
                                            <button type="button" onClick={() => setIsCreatingNote(false)} style={{ backgroundColor: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', padding: '12px 20px', borderRadius: '4px', cursor: 'pointer', flex: 1 }}>Cancel</button>
                                        </div>
                                    </form>
                                )}

                                {activeNotes.length === 0 && !isCreatingNote ? (
                                    <p style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>This folder is empty.</p>
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
                                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>Tap to view</span>
                                                </div>
                                                
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setActionNote({ id: note.id, type: 'copy' }); }} 
                                                        style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', color: '#10b981' }}
                                                        title="Copy Note"
                                                    >⎘ Copy</button>

                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setActionNote({ id: note.id, type: 'move' }); }} 
                                                        style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', color: '#0284c7' }}
                                                        title="Move Note"
                                                    >➡️ Move</button>

                                                    <button 
                                                        onClick={(e) => handleDeleteNote(e, note.id, note.title)} 
                                                        style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', color: '#ef4444' }}
                                                        title="Delete Note"
                                                    >🗑️</button>
                                                    <span style={{ color: workspace.color, fontWeight: 'bold', fontSize: '20px', marginLeft: '5px' }}>&rarr;</span>
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
        </div>
    );
};

export default WorkspaceView;