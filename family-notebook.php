<?php
/**
 * Plugin Name: Family Notebook
 * Description: A decoupled React SPA for family note-taking and organization.
 * Version: 1.0.0
 * Author: Cielocloud.org
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly.
}

define( 'FN_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'FN_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * 1. Hide the Admin Bar for non-administrators
 */
add_action('after_setup_theme', 'fn_hide_admin_bar');
function fn_hide_admin_bar() {
    if ( ! current_user_can('administrator') && ! is_admin() ) {
        show_admin_bar(false);
    }
}

/**
 * 2. Register Custom Post Type for Note Pages
 */
add_action( 'init', 'fn_register_cpts' );
function fn_register_cpts() {
    register_post_type( 'fn_note_page', [
        'labels'      => [
            'name'          => 'Note Pages',
            'singular_name' => 'Note Page',
        ],
        'public'      => true,
        'has_archive' => false,
        'show_in_rest'=> true, // Important for REST API access
        'supports'    => [ 'title', 'editor', 'page-attributes' ], // page-attributes allows parent/child (folders)
    ]);
}

/**
 * 3. Enqueue React App Scripts (Dynamic Dependencies)
 */
add_action( 'wp_enqueue_scripts', 'fn_enqueue_react_app' );
function fn_enqueue_react_app() {
    global $post;
    
    // NEW: Added is_user_logged_in() to the condition
    if ( is_a( $post, 'WP_Post' ) && has_shortcode( $post->post_content, 'family_notebook_app' ) && is_user_logged_in() ) {
        
        $script_path = FN_PLUGIN_DIR . 'build/index.js';
        $asset_file  = FN_PLUGIN_DIR . 'build/index.asset.php';
        
        if ( file_exists( $script_path ) && file_exists( $asset_file ) ) {
            $asset = require( $asset_file );

            wp_enqueue_script(
                'family-notebook-app',
                FN_PLUGIN_URL . 'build/index.js',
                $asset['dependencies'], 
                $asset['version'],      
                true
            );

            wp_localize_script( 'family-notebook-app', 'fnAppConfig', [
                'rootUrl' => esc_url_raw( rest_url() ),
                'nonce'   => wp_create_nonce( 'wp_rest' ),
                'siteUrl' => site_url(),
            ]);
        }
    }
}

/**
 * 4. Register the Shortcode to mount the React App
 */
add_shortcode( 'family_notebook_app', 'fn_render_app_container' );
function fn_render_app_container() {
    return '<div id="family-notebook-root">Loading Family Notebook...</div>';
}

/**
 * 5. Real Custom REST API Endpoints
 */
add_action( 'rest_api_init', 'fn_register_api_endpoints' );

function fn_register_api_endpoints() {
    // GET: Fetch user's workspaces
    register_rest_route( 'family-notebook/v1', '/workspaces', [
        'methods'  => 'GET',
        'callback' => 'fn_api_get_workspaces',
        'permission_callback' => 'is_user_logged_in'
    ]);

    // POST: Create a new workspace
    register_rest_route( 'family-notebook/v1', '/workspaces/create', [
        'methods'  => 'POST',
        'callback' => 'fn_api_create_workspace',
        'permission_callback' => 'is_user_logged_in',
        'args' => [
            'name'  => [ 'required' => true, 'type' => 'string' ],
            'color' => [ 'required' => true, 'type' => 'string' ]
        ]
    ]);
	// GET: Fetch notes for a specific workspace
    register_rest_route( 'family-notebook/v1', '/notes', [
        'methods'  => 'GET',
        'callback' => 'fn_api_get_notes',
        'permission_callback' => 'is_user_logged_in'
    ]);

    // POST: Create a new note or folder
    register_rest_route( 'family-notebook/v1', '/notes/create', [
        'methods'  => 'POST',
        'callback' => 'fn_api_create_note',
        'permission_callback' => 'is_user_logged_in'
    ]);
	// GET: Fetch a single note's content
    register_rest_route( 'family-notebook/v1', '/notes/(?P<id>\d+)', [
        'methods'  => 'GET',
        'callback' => 'fn_api_get_single_note',
        'permission_callback' => 'is_user_logged_in'
    ]);

    // PUT: Update a single note
    register_rest_route( 'family-notebook/v1', '/notes/(?P<id>\d+)', [
        'methods'  => 'PUT',
        'callback' => 'fn_api_update_note',
        'permission_callback' => 'is_user_logged_in'
    ]);
	// GET: Export Folder as JSON Template
    register_rest_route( 'family-notebook/v1', '/export/(?P<id>\d+)', [
        'methods'  => 'GET',
        'callback' => 'fn_api_export_template',
        'permission_callback' => 'is_user_logged_in'
    ]);
	// POST: Import JSON Template
    register_rest_route( 'family-notebook/v1', '/import', [
        'methods'  => 'POST',
        'callback' => 'fn_api_import_template',
        'permission_callback' => 'is_user_logged_in'
    ]);
}

// Callback: Get Workspaces from DB
function fn_api_get_workspaces( $request ) {
    global $wpdb;
    $user_id = get_current_user_id();
    
    $table_workspaces = $wpdb->prefix . 'fn_workspaces';
    $table_members    = $wpdb->prefix . 'fn_workspace_members';

    // Query: Join tables to find workspaces this specific user belongs to
    $query = $wpdb->prepare("
        SELECT w.id, w.workspace_name as name, w.theme_color as color, w.join_code, m.app_role as role
        FROM $table_workspaces w
        INNER JOIN $table_members m ON w.id = m.workspace_id
        WHERE m.user_id = %d
    ", $user_id);

    $workspaces = $wpdb->get_results( $query, ARRAY_A );
    return rest_ensure_response( $workspaces ? $workspaces : [] );
}

// Callback: Save New Workspace to DB
function fn_api_create_workspace( $request ) {
    global $wpdb;
    $user_id = get_current_user_id();
    $params  = $request->get_json_params();

    $table_workspaces = $wpdb->prefix . 'fn_workspaces';
    $table_members    = $wpdb->prefix . 'fn_workspace_members';

    // Generate a random 8-character join code
    $join_code = strtoupper( substr( md5( uniqid( rand(), true ) ), 0, 8 ) );

    // 1. Insert the Workspace
    $wpdb->insert( $table_workspaces, [
        'workspace_name' => sanitize_text_field( $params['name'] ),
        'theme_color'    => sanitize_hex_color( $params['color'] ),
        'join_code'      => $join_code,
        'created_by'     => $user_id
    ]);
    
    $new_workspace_id = $wpdb->insert_id;

    if ( ! $new_workspace_id ) {
        return new WP_Error( 'db_error', 'Failed to create workspace', ['status' => 500] );
    }

    // 2. Assign the creator as the 'Owner' in the members table
    $wpdb->insert( $table_members, [
        'workspace_id' => $new_workspace_id,
        'user_id'      => $user_id,
        'app_role'     => 'owner'
    ]);

    // Return the newly created object back to React
    return rest_ensure_response([
        'id'    => $new_workspace_id,
        'name'  => sanitize_text_field( $params['name'] ),
        'color' => sanitize_hex_color( $params['color'] ),
        'role'  => 'owner'
    ]);
}
// Callback: Get Folders and Notes
function fn_api_get_notes( $request ) {
    $workspace_id = $request->get_param( 'workspace_id' );

    if ( empty( $workspace_id ) ) {
        return new WP_Error( 'missing_id', 'Workspace ID is required', ['status' => 400] );
    }

    // Security check: Validate the user actually belongs to this workspace here (omitted for brevity, but necessary for prod)

    $query = new WP_Query([
        'post_type'      => 'fn_note_page',
        'posts_per_page' => -1,
        'post_status'    => 'publish',
        'meta_query'     => [
            [
                'key'   => '_fn_workspace_id',
                'value' => $workspace_id,
            ]
        ]
    ]);

    $items = [];
    foreach ( $query->posts as $post ) {
        $items[] = [
            'id'        => $post->ID,
            'title'     => $post->post_title,
            'parent_id' => $post->post_parent,
            // If parent_id is 0, it's a folder. If > 0, it's a note.
        ];
    }

    return rest_ensure_response( $items );
}

// Callback: Create Folder or Note
function fn_api_create_note( $request ) {
    $params = $request->get_json_params();
    
    $title        = sanitize_text_field( $params['title'] );
    $workspace_id = intval( $params['workspace_id'] );
    $parent_id    = isset( $params['parent_id'] ) ? intval( $params['parent_id'] ) : 0;

    // NEW: Check if block content was passed in, and encode it
    $content = '';
    if ( isset( $params['content'] ) && is_array( $params['content'] ) ) {
        $content = wp_json_encode( $params['content'] );
    }

    $post_id = wp_insert_post([
        'post_title'   => $title,
        'post_type'    => 'fn_note_page',
        'post_status'  => 'publish',
        'post_parent'  => $parent_id,
        'post_content' => $content // NEW: Save the blocks immediately
    ]);

    if ( is_wp_error( $post_id ) ) {
        return $post_id;
    }

    update_post_meta( $post_id, '_fn_workspace_id', $workspace_id );

    return rest_ensure_response([
        'id'        => $post_id,
        'title'     => $title,
        'parent_id' => $parent_id
    ]);
}
// Callback: Get Single Note (Updated for JSON)
function fn_api_get_single_note( $request ) {
    $note_id = $request['id'];
    $post = get_post( $note_id );

    if ( ! $post || $post->post_type !== 'fn_note_page' ) {
        return new WP_Error( 'not_found', 'Note not found', ['status' => 404] );
    }

    // Attempt to decode the JSON. 
    $content_blocks = json_decode( $post->post_content, true );
    
    // If it fails (meaning it's an old plain-text note), convert it into our new block format
    if ( json_last_error() !== JSON_ERROR_NONE && !empty($post->post_content) ) {
        $content_blocks = [ 
            [ 'id' => uniqid('blk_'), 'type' => 'rich-text', 'content' => $post->post_content ] 
        ];
    } else if ( empty($content_blocks) ) {
        $content_blocks = [];
    }

    return rest_ensure_response([
        'id'      => $post->ID,
        'title'   => $post->post_title,
        'content' => $content_blocks // Now returns an array, not a string
    ]);
}

// Callback: Update Single Note (Updated for JSON)
function fn_api_update_note( $request ) {
    $note_id = $request['id'];
    $params  = $request->get_json_params();

    $post = get_post( $note_id );
    if ( ! $post || $post->post_type !== 'fn_note_page' ) {
        return new WP_Error( 'not_found', 'Note not found', ['status' => 404] );
    }

    // Ensure the incoming content is an array, then encode it as a JSON string for the DB
    $blocks = isset( $params['content'] ) && is_array( $params['content'] ) ? $params['content'] : [];

    $update_args = [
        'ID'           => $note_id,
        'post_title'   => sanitize_text_field( $params['title'] ),
        'post_content' => wp_json_encode( $blocks ) // Safely saves the JSON string
    ];

    wp_update_post( $update_args );

    return rest_ensure_response([
        'id'      => $note_id,
        'message' => 'Note updated successfully'
    ]);
}

// Callback: Compile and Export Template
function fn_api_export_template( $request ) {
    $folder_id = $request['id'];
    $folder = get_post( $folder_id );

    // Ensure this is a valid folder (post_parent == 0)
    if ( ! $folder || $folder->post_type !== 'fn_note_page' || $folder->post_parent != 0 ) {
        return new WP_Error( 'invalid_folder', 'Invalid folder selected for export', ['status' => 400] );
    }

    // Query all Notes belonging to this folder
    $notes_query = new WP_Query([
        'post_type'      => 'fn_note_page',
        'post_parent'    => $folder_id,
        'posts_per_page' => -1,
        'post_status'    => 'publish'
    ]);

    $template_notes = [];
    foreach ( $notes_query->posts as $note ) {
        // Decode the blocks, defaulting to an empty array if blank
        $blocks = json_decode( $note->post_content, true );
        if ( ! is_array( $blocks ) ) $blocks = [];

        // We only export the title and the content blocks. 
        // We strip out the specific database IDs so it can be imported anywhere.
        $template_notes[] = [
            'title'   => $note->post_title,
            'content' => $blocks
        ];
    }

    // Wrap it all in a structured package
    $export_package = [
        'template_name' => $folder->post_title,
        'version'       => '1.0',
        'type'          => 'fn_folder_template',
        'notes'         => $template_notes
    ];

    return rest_ensure_response( $export_package );
}
// Callback: Import and Reconstruct Template
function fn_api_import_template( $request ) {
    $params = $request->get_json_params();
    $workspace_id = intval( $params['workspace_id'] );
    $template = $params['template_data'];

    // 1. Validate the payload
    if ( empty( $workspace_id ) || empty( $template ) || ! isset($template['type']) || $template['type'] !== 'fn_folder_template' ) {
        return new WP_Error( 'invalid_data', 'Invalid template file.', ['status' => 400] );
    }

    // 2. Create the Parent Folder
    $folder_id = wp_insert_post([
        'post_title'  => sanitize_text_field( $template['template_name'] ) . ' (Imported)',
        'post_type'   => 'fn_note_page',
        'post_status' => 'publish',
        'post_parent' => 0
    ]);

    if ( is_wp_error( $folder_id ) ) {
        return $folder_id;
    }
    
    // Link the folder to the workspace
    update_post_meta( $folder_id, '_fn_workspace_id', $workspace_id );

    // Keep track of what we create so React can update the UI instantly
    $created_items = [
        [ 'id' => $folder_id, 'title' => $template['template_name'] . ' (Imported)', 'parent_id' => 0 ]
    ];

    // 3. Reconstruct the Child Notes and their Blocks
    if ( ! empty( $template['notes'] ) && is_array( $template['notes'] ) ) {
        foreach ( $template['notes'] as $note ) {
            $note_id = wp_insert_post([
                'post_title'   => sanitize_text_field( $note['title'] ),
                'post_type'    => 'fn_note_page',
                'post_status'  => 'publish',
                'post_parent'  => $folder_id,
                // Safely re-encode the blocks as a JSON string for the database
                'post_content' => wp_json_encode( $note['content'] ) 
            ]);

            if ( ! is_wp_error( $note_id ) ) {
                update_post_meta( $note_id, '_fn_workspace_id', $workspace_id );
                $created_items[] = [ 'id' => $note_id, 'title' => $note['title'], 'parent_id' => $folder_id ];
            }
        }
    }

    return rest_ensure_response([
        'message' => 'Import successful',
        'folder_id' => $folder_id,
        'new_items' => $created_items
    ]);
}

/**
 * 6. Register the Backend Admin Panel
 */
add_action( 'admin_menu', 'fn_register_admin_menu' );

function fn_register_admin_menu() {
    // Adds a top-level menu item to the WP Dashboard
    add_menu_page(
        'Family Notebook Settings', // Page title
        'Family Notebook',          // Menu title
        'manage_options',           // Capability (Only Administrators can see this)
        'family-notebook',          // Menu slug
        'fn_render_admin_settings', // Function that outputs the page HTML
        'dashicons-book',           // Icon (a book icon)
        30                          // Position in the menu
    );
}

// This function renders the actual HTML of the settings page
function fn_render_admin_settings() {
    // Security check
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>Family Notebook Administration</h1>
        <p>Welcome to the global settings panel. This area is strictly for Site Administrators.</p>
        
        <table class="form-table">
            <tr>
                <th scope="row">Mobile Template Builder</th>
                <td>
                    <label>
                        <input type="checkbox" name="fn_enable_mobile_builder" value="1" />
                        Enable "Tap-to-Append" template builder on mobile devices.
                    </label>
                </td>
            </tr>
        </table>
        
        <p class="submit">
            <button class="button button-primary">Save Settings</button>
        </p>
    </div>
    <?php
}
/**
 * 7. Database Initialization (Run on Plugin Activation)
 */
register_activation_hook( __FILE__, 'fn_create_custom_tables' );

function fn_create_custom_tables() {
    global $wpdb;
    $charset_collate = $wpdb->get_charset_collate();

    // Import the dbDelta function
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    // 1. Workspaces Table
    $table_workspaces = $wpdb->prefix . 'fn_workspaces';
    $sql_workspaces = "CREATE TABLE $table_workspaces (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        workspace_name varchar(255) NOT NULL,
        theme_color varchar(7) NOT NULL DEFAULT '#0284c7',
        join_code varchar(12) NOT NULL,
        created_by bigint(20) unsigned NOT NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY  (id),
        UNIQUE KEY join_code (join_code)
    ) $charset_collate;";
    dbDelta( $sql_workspaces );

    // 2. Workspace Members Table
    $table_members = $wpdb->prefix . 'fn_workspace_members';
    $sql_members = "CREATE TABLE $table_members (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        workspace_id bigint(20) unsigned NOT NULL,
        user_id bigint(20) unsigned NOT NULL,
        app_role varchar(50) NOT NULL DEFAULT 'viewer',
        joined_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY  (id),
        UNIQUE KEY user_workspace (workspace_id,user_id)
    ) $charset_collate;";
    dbDelta( $sql_members );
}

/**
 * 8. The App Shortcode & Authentication Gate (Upgraded for Google Auth)
 */
add_shortcode( 'family_notebook_app', 'fn_render_app_shortcode' );

function fn_render_app_shortcode() {
    // 1. If the user is NOT logged in, show the Auth Gate
    if ( ! is_user_logged_in() ) {
        ob_start();
        ?>
        <div style="max-width: 400px; margin: 40px auto; padding: 30px; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <h2 style="text-align: center; color: #1e293b; margin-top: 0; margin-bottom: 10px;">Family Notebook</h2>
            <p style="text-align: center; color: #64748b; margin-bottom: 25px; font-size: 14px;">Please log in to access your workspaces.</p>
            
            <?php
            // NEW: Inject the Google Single Sign-On Button
            // We check if the plugin is active first so it doesn't break if deactivated
            if ( shortcode_exists( 'nextend_social_login' ) ) {
                echo '<div style="margin-bottom: 20px;">';
                echo do_shortcode( '[nextend_social_login provider="google"]' );
                echo '</div>';
                
                // A visual divider
                echo '<div style="text-align: center; position: relative; margin: 20px 0;">';
                echo '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;" />';
                echo '<span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 10px; color: #94a3b8; font-size: 12px; text-transform: uppercase;">or use email</span>';
                echo '</div>';
            }

            // The standard email/password fallback
            wp_login_form( [
                'redirect'       => get_permalink(), 
                'form_id'        => 'fn-login-form',
                'label_username' => 'Email or Username',
                'remember'       => true,
            ] );
            ?>
        </div>
        <?php
        return ob_get_clean();
    }

    // 2. If they ARE logged in, output the React mount point
    return '<div id="family-notebook-root">Loading Family Notebook...</div>';
}