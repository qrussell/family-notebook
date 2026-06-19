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

// NEW: iOS Detection Helpers
const isIos = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
};
const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

const App = () => {
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeWorkspace, setActiveWorkspace] = useState(null);
    
    // NEW: iOS Install Modal State
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [needsIosInstallPrompt, setNeedsIosInstallPrompt] = useState(false);

    apiFetch.use(apiFetch.createNonceMiddleware(fnAppConfig.nonce));

    // Fetch existing data on load
    // Fetch existing data on load
    useEffect(() => {
        // NEW: Force-apply a standalone class to the body for iOS
        if (isInStandaloneMode() || window.matchMedia('(display-mode: standalone)').matches) {
            document.body.classList.add('fn-is-standalone');
        }

        // Check if user is on iOS and NOT currently in the installed app
        if (isIos() && !isInStandaloneMode()) {
            setNeedsIosInstallPrompt(true);
        }

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

                /* NEW: iOS Install Button and Modal Styles */
                .fn-ios-install-btn {
                    background-color: #e2e8f0;
                    color: #0f172a;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 20px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: bold;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                .fn-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.6);
                    display: flex;
                    align-items: flex-end; /* Pin to bottom for mobile */
                    justify-content: center;
                    z-index: 999999;
                    padding: 15px;
                }
                .fn-modal-content {
                    background: white;
                    padding: 25px;
                    border-radius: 16px;
                    max-width: 400px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                    animation: slideUp 0.3s ease-out forwards;
                }
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>

            {!activeWorkspace && (
                <div className="fn-app-header-padding" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>
                    <h1 style={{ color: '#1e293b', margin: 0, fontSize: '24px' }}>
                        {__('Family Notebook', 'family-notebook')}
                    </h1>
                    
                    {/* NEW: iOS Install Button renders in the top right corner */}
                    {needsIosInstallPrompt && (
                        <button className="fn-ios-install-btn" onClick={() => setShowInstallModal(true)}>
                            📱 {__('Install App', 'family-notebook')}
                        </button>
                    )}
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

            {/* NEW: iOS Install Modal Overlay */}
            {showInstallModal && (
                <div className="fn-modal-overlay" onClick={() => setShowInstallModal(false)}>
                    <div className="fn-modal-content" onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginTop: 0, color: '#0f172a' }}>{__('Install Family Notebook', 'family-notebook')}</h3>
                        <p style={{ fontSize: '15px', lineHeight: '1.5', color: '#475569' }}>
                            {__('Install this application on your home screen for a full-screen, native app experience.', 'family-notebook')}
                        </p>
                        
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '8px', textAlign: 'left', marginBottom: '20px' }}>
                            <p style={{ margin: '0 0 12px 0', display: 'flex', alignItems: 'center', fontSize: '15px' }}>
                                <strong style={{ marginRight: '8px' }}>1.</strong> {__('Tap the ', 'family-notebook')} 
                                {/* iOS Safari Share Icon SVG */}
                                <svg style={{ margin: '0 6px' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                                    <polyline points="16 6 12 2 8 6"></polyline>
                                    <line x1="12" y1="2" x2="12" y2="15"></line>
                                </svg>
                                {__('Share button at the bottom of Safari.', 'family-notebook')}
                            </p>
                            <p style={{ margin: 0, display: 'flex', alignItems: 'center', fontSize: '15px' }}>
                                <strong style={{ marginRight: '8px' }}>2.</strong> {__('Scroll down and tap ', 'family-notebook')} 
                                <strong style={{ margin: '0 6px' }}>{__('Add to Home Screen', 'family-notebook')}</strong> 
                                <span style={{fontSize: '18px'}}>➕</span>
                            </p>
                        </div>
                        
                        <button 
                            onClick={() => setShowInstallModal(false)}
                            style={{ width: '100%', padding: '12px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}
                        >
                            {__('Got it', 'family-notebook')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;