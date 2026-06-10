import { render } from '@wordpress/element';
import App from './App';

const rootElement = document.getElementById('family-notebook-root');

if (rootElement) {
    // Note: @wordpress/element is a wrapper for React. 
    // We use render() instead of createRoot() for broader WP compatibility right now.
    render(<App />, rootElement);
}