import { __ } from '@wordpress/i18n';
import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import WorkspaceList from './components/WorkspaceList';
import WorkspaceView from './components/WorkspaceView';

// Helper function to safely format ANY database color string
const formatColorForPicker = (hexColor) => {
    if (!hexColor || typeof hexColor !== 'string') return '#1e293b';
    let cleanHex = hexColor.replace(/[^0-9a-fA-F]/g, '');
    if (cleanHex.length === 3) cleanHex = cleanHex.split('').map(char => char + char).join('');
    if (cleanHex.length !== 6) return '#1e293b';
    return '#' + cleanHex;
};

// Helper function to calculate accessibility contrast dynamically
const getContrastTextColor = (hexColor) => {
    const safeHex = formatColorForPicker(hexColor);
    const r = parseInt(safeHex.slice(1, 3), 16);
    const g = parseInt(safeHex.slice(3, 5), 16);
    const b = parseInt(safeHex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#0f172a' : '#ffffff';
};

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

    const handleCreateWorkspace = (name, color) => {
        return apiFetch({
            path: '/family-notebook/v1/workspaces/create',
            method: 'POST',
            data: { name: name, color: color }
        }).then((newWorkspace) => {
            setWorkspaces([...workspaces, newWorkspace]);
        }).catch((error) => {
            console.error("Failed to create workspace:", error);
            alert(__("Error creating workspace. Check console.", 'family-notebook'));
        });
    };

    return (
        <div className="fn-app-container">
            {/* RESPONSIVE CSS ENGINE */}
            <style>{`
                .fn-app-container {
                    font-family: sans-serif;
                    padding: 20px;
                    max-width: 1000px;
                    margin: 0 auto;
                    background-color: #f8fafc;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .fn-app-header-padding { padding: 0; }
                .fn-app-list-padding { padding: 0; }
                
                /* EDGE-TO-EDGE MOBILE OVERRIDE */
                @media (max-width: 768px) {
                    .fn-app-container {
                        padding: 0 !important;
                        margin: 0 !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        background-color: transparent !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    /* Add slight padding back ONLY to the Home Dashboard list so it doesn't touch the exact pixel edge */
                    .fn-app-header-padding { padding: 15px 15px 0 15px !important; }
                    .fn-app-list-padding { padding: 0 15px 15px 15px !important; }
                }
            `}</style>

            {!activeWorkspace && (
                <div className="fn-app-header-padding">
                    <h1 style={{ color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
                        {__('Family Notebook', 'family-notebook')}
                    </h1>
                </div>
            )}
            
            {loading ? (
                <p className="fn-app-list-padding">{__('Loading workspaces...', 'family-notebook')}</p>
            ) : (
                activeWorkspace ? (
                    <WorkspaceView 
                        workspace={activeWorkspace} 
                        onBack={() => setActiveWorkspace(null)} 
                    />
                ) : (
                    <div className="fn-app-list-padding">
                        <WorkspaceList 
                            workspaces={workspaces} 
                            onSelect={(workspace) => setActiveWorkspace(workspace)} 
                            onCreateWorkspace={handleCreateWorkspace}
                        />
                    </div>
                )
            )}
        </div>
    );
};

export default App;