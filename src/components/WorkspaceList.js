import { useState } from '@wordpress/element';

const WorkspaceList = ({ workspaces, onSelect, onCreateWorkspace }) => {
    // Local state to manage the creation form
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#0284c7'); // Default theme blue
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        
        setIsSubmitting(true);
        // Call the parent function to save it, then reset the form
        onCreateWorkspace(newName, newColor).then(() => {
            setIsSubmitting(false);
            setIsCreating(false);
            setNewName('');
            setNewColor('#0284c7');
        });
    };

    const tileStyle = (color) => ({
        backgroundColor: color,
        color: 'white',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '10px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '18px',
        transition: 'transform 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100px',
        width: '200px'
    });

    const newTileStyle = {
        ...tileStyle('#f1f5f9'),
        color: '#64748b',
        border: '2px dashed #cbd5e1',
        boxShadow: 'none'
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ color: '#475569', fontSize: '16px', margin: 0 }}>Your Workspaces</h2>
            </div>

            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                {/* Render Existing Workspaces */}
                {workspaces && workspaces.map((workspace) => (
                    <div 
                        key={workspace.id} 
                        style={tileStyle(workspace.color)}
                        onClick={() => onSelect(workspace)}
                    >
                        {workspace.name}
                    </div>
                ))}

                {/* The "Create New" Button Tile */}
                {!isCreating && (
                    <div style={newTileStyle} onClick={() => setIsCreating(true)}>
                        + New Workspace
                    </div>
                )}
            </div>

            {/* The Creation Form */}
            {isCreating && (
                <div style={{ marginTop: '20px', padding: '20px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', maxWidth: '400px' }}>
                    <h3 style={{ marginTop: 0, fontSize: '16px' }}>Create New Workspace</h3>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px' }}>Workspace Name</label>
                            <input 
                                type="text" 
                                value={newName} 
                                onChange={(e) => setNewName(e.target.value)} 
                                placeholder="e.g. The Smith Family"
                                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px' }}>Theme Color</label>
                            <input 
                                type="color" 
                                value={newColor} 
                                onChange={(e) => setNewColor(e.target.value)} 
                                style={{ width: '100%', height: '40px', padding: '2px', cursor: 'pointer' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                style={{ backgroundColor: '#0284c7', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                {isSubmitting ? 'Saving...' : 'Create Workspace'}
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setIsCreating(false)}
                                style={{ backgroundColor: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default WorkspaceList;