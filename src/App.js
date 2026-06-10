import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import WorkspaceList from './components/WorkspaceList';
import WorkspaceView from './components/WorkspaceView';

const App = () => {
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeWorkspace, setActiveWorkspace] = useState(null);

    apiFetch.use(apiFetch.createNonceMiddleware(fnAppConfig.nonce));

    // Fetch existing data on load
    useEffect(() => {
        apiFetch({ path: '/family-notebook/v1/workspaces' })
            .then((data) => {
                setWorkspaces(data);
                setLoading(false);
            })
            .catch((error) => {
                console.error("Error fetching workspaces:", error);
                setLoading(false);
            });
    }, []);

    // NEW: Handle the creation of a workspace
    const handleCreateWorkspace = (name, color) => {
        return apiFetch({
            path: '/family-notebook/v1/workspaces/create',
            method: 'POST',
            data: { name: name, color: color }
        }).then((newWorkspace) => {
            // Success! Add the new workspace to our local state array
            // This instantly updates the UI without a page reload
            setWorkspaces([...workspaces, newWorkspace]);
        }).catch((error) => {
            console.error("Failed to create workspace:", error);
            alert("Error creating workspace. Check console.");
        });
    };

    const appStyle = {
        fontFamily: 'sans-serif',
        padding: '20px',
        maxWidth: '1000px',
        margin: '0 auto',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
    };

    return (
        <div style={appStyle}>
            {!activeWorkspace && (
                <h1 style={{ color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
                    Family Notebook
                </h1>
            )}
            
            {loading ? (
                <p>Loading workspaces...</p>
            ) : (
                activeWorkspace ? (
                    <WorkspaceView 
                        workspace={activeWorkspace} 
                        onBack={() => setActiveWorkspace(null)} 
                    />
                ) : (
                    <WorkspaceList 
                        workspaces={workspaces} 
                        onSelect={(workspace) => setActiveWorkspace(workspace)} 
                        onCreateWorkspace={handleCreateWorkspace} // Pass the save function down
                    />
                )
            )}
        </div>
    );
};

export default App;