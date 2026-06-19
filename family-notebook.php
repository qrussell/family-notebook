<?php
/**
 * Plugin Name: Family Notebook
 * Description: A decoupled React SPA for family note-taking and organization.
 * Version: 1.1.0
 * Author: Cielocloud.org
 * Text Domain: family-notebook
 * Domain Path: /languages
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
            'name'          => __('Note Pages', 'family-notebook'),
            'singular_name' => __('Note Page', 'family-notebook'),
        ],
        'public'      => true,
        'has_archive' => false,
        'show_in_rest'=> true,
        'supports'    => [ 'title', 'editor', 'page-attributes' ],
    ]);
    // Register the Global Template Library Post Type
    register_post_type( 'fn_template', [
        'public'      => false,
        'show_ui'     => true,
        'label'       => __('Templates', 'family-notebook'),
        'supports'    => [ 'title', 'editor' ]
    ]);
}

/**
 * 3. Security Helper
 */
function fn_is_user_authorized_for_workspace( $workspace_id ) {
    global $wpdb;
    $current_user_id = get_current_user_id();
    if ( ! $current_user_id ) return false;

    $table_members = $wpdb->prefix . 'fn_workspace_members';
    $is_member = $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(*) FROM $table_members WHERE workspace_id = %d AND user_id = %d",
        $workspace_id,
        $current_user_id
    ));
    return (int)$is_member > 0;
}

/**
 * 4. Enqueue React App Scripts
 */
add_action( 'wp_enqueue_scripts', 'fn_enqueue_react_app' );
function fn_enqueue_react_app() {
    global $post;
    if ( is_a( $post, 'WP_Post' ) && has_shortcode( $post->post_content, 'family_notebook_app' ) && is_user_logged_in() ) {
        $script_path = FN_PLUGIN_DIR . 'build/index.js';
        $asset_file  = FN_PLUGIN_DIR . 'build/index.asset.php';
        if ( file_exists( $script_path ) && file_exists( $asset_file ) ) {
            $asset = require( $asset_file );
            wp_enqueue_script( 'family-notebook-app', FN_PLUGIN_URL . 'build/index.js', $asset['dependencies'], $asset['version'], true );
            wp_set_script_translations( 'family-notebook-app', 'family-notebook', FN_PLUGIN_DIR . 'languages' );
            wp_localize_script( 'family-notebook-app', 'fnAppConfig', [
                'rootUrl'   => esc_url_raw( rest_url() ),
                'nonce'     => wp_create_nonce( 'wp_rest' ),
                'siteUrl'   => site_url(),
                // NEW: Pass the plugin directory URL to React
                'pluginUrl' => FN_PLUGIN_URL, 
            ]);
        }
    }
}

/**
 * 5. Register REST API Endpoints
 */
add_action( 'rest_api_init', 'fn_register_api_endpoints' );
function fn_register_api_endpoints() {
    register_rest_route( 'family-notebook/v1', '/workspaces', ['methods' => 'GET', 'callback' => 'fn_api_get_workspaces', 'permission_callback' => 'is_user_logged_in']);
    register_rest_route( 'family-notebook/v1', '/workspaces/create', ['methods' => 'POST', 'callback' => 'fn_api_create_workspace', 'permission_callback' => 'is_user_logged_in']);
    register_rest_route( 'family-notebook/v1', '/notes', ['methods' => 'GET', 'callback' => 'fn_api_get_notes', 'permission_callback' => 'is_user_logged_in']);
    register_rest_route( 'family-notebook/v1', '/notes/create', ['methods' => 'POST', 'callback' => 'fn_api_create_note', 'permission_callback' => 'is_user_logged_in']);
    register_rest_route( 'family-notebook/v1', '/notes/(?P<id>\d+)', [
        ['methods' => 'GET', 'callback' => 'fn_api_get_single_note', 'permission_callback' => 'is_user_logged_in'],
        ['methods' => 'PUT', 'callback' => 'fn_api_update_note', 'permission_callback' => 'is_user_logged_in'],
        ['methods' => 'DELETE', 'callback' => 'fn_api_delete_note', 'permission_callback' => 'is_user_logged_in']
    ]);
    register_rest_route( 'family-notebook/v1', '/export/(?P<id>\d+)', ['methods' => 'GET', 'callback' => 'fn_api_export_template', 'permission_callback' => 'is_user_logged_in']);
    register_rest_route( 'family-notebook/v1', '/import', ['methods' => 'POST', 'callback' => 'fn_api_import_template', 'permission_callback' => 'is_user_logged_in']);
    register_rest_route( 'family-notebook/v1', '/templates', [['methods' => 'GET', 'callback' => 'fn_api_get_templates', 'permission_callback' => 'is_user_logged_in'], ['methods' => 'POST', 'callback' => 'fn_api_save_template', 'permission_callback' => 'is_user_logged_in']]);
    register_rest_route( 'family-notebook/v1', '/templates/(?P<id>\d+)', ['methods' => 'DELETE', 'callback' => 'fn_api_delete_template', 'permission_callback' => 'is_user_logged_in']);
    register_rest_route( 'family-notebook/v1', '/workspaces/(?P<id>\d+)/users', [['methods' => 'GET', 'callback' => 'fn_api_get_workspace_users', 'permission_callback' => 'is_user_logged_in'], ['methods' => 'POST', 'callback' => 'fn_api_add_workspace_user', 'permission_callback' => 'is_user_logged_in']]);
    register_rest_route( 'family-notebook/v1', '/workspaces/(?P<id>\d+)/users/(?P<user_id>\d+)', [
        ['methods' => 'DELETE', 'callback' => 'fn_api_remove_workspace_user', 'permission_callback' => 'is_user_logged_in'],
        ['methods' => 'PUT', 'callback' => 'fn_api_update_workspace_user_role', 'permission_callback' => 'is_user_logged_in'] // NEW: Update Role
    ]);
	register_rest_route( 'family-notebook/v1', '/workspaces/(?P<id>\d+)', [
		['methods' => 'PUT', 'callback' => 'fn_api_update_workspace', 'permission_callback' => 'is_user_logged_in'],
		['methods' => 'DELETE', 'callback' => 'fn_api_delete_workspace', 'permission_callback' => 'is_user_logged_in']
	]);
    
    // NEW: Copy Note Route
    register_rest_route( 'family-notebook/v1', '/notes/(?P<id>\d+)/copy', [
        'methods' => 'POST', 
        'callback' => 'fn_api_copy_note', 
        'permission_callback' => 'is_user_logged_in'
    ]);
}

// 6. Callback Functions
function fn_api_get_workspaces() {
    global $wpdb;
    $user_id = get_current_user_id();
    return rest_ensure_response($wpdb->get_results($wpdb->prepare("SELECT w.id, w.workspace_name as name, w.theme_color as color, w.join_code, m.app_role as role FROM {$wpdb->prefix}fn_workspaces w INNER JOIN {$wpdb->prefix}fn_workspace_members m ON w.id = m.workspace_id WHERE m.user_id = %d", $user_id), ARRAY_A) ?: []);
}

function fn_api_create_workspace($request) {
    global $wpdb;
    $user_id = get_current_user_id();
    $params = $request->get_json_params();
    
    // 1. Create the New Workspace
    $wpdb->insert($wpdb->prefix . 'fn_workspaces', [
        'workspace_name' => sanitize_text_field($params['name']), 
        'theme_color'    => sanitize_hex_color($params['color']), 
        'join_code'      => strtoupper(substr(md5(uniqid(rand(), true)), 0, 8)), 
        'created_by'     => $user_id
    ]);
    $workspace_id = $wpdb->insert_id;
    
    // 2. Add the creator as the Owner
    $wpdb->insert($wpdb->prefix . 'fn_workspace_members', [
        'workspace_id' => $workspace_id, 
        'user_id'      => $user_id, 
        'app_role'     => 'owner'
    ]);

    // 3. AUTO-PROVISION FROM MASTER WORKSPACE
    $starter_id = intval(get_option('fn_starter_workspace_id', 0));
    
    if ($starter_id > 0 && $starter_id !== $workspace_id) {
        
        // Find all root Folders in the starter workspace
        $folders = get_posts([
            'post_type'      => 'fn_note_page',
            'post_parent'    => 0,
            'posts_per_page' => -1,
            'meta_query'     => [
                ['key' => '_fn_workspace_id', 'value' => $starter_id, 'compare' => '=']
            ]
        ]);

        foreach ($folders as $folder) {
            // Duplicate the Folder
            $new_folder_id = wp_insert_post([
                'post_title'   => $folder->post_title,
                'post_content' => $folder->post_content,
                'post_type'    => 'fn_note_page',
                'post_status'  => 'publish'
            ]);
            update_post_meta($new_folder_id, '_fn_workspace_id', $workspace_id);

            // Find all Notes inside this specific folder
            $notes = get_posts([
                'post_type'      => 'fn_note_page',
                'post_parent'    => $folder->ID,
                'posts_per_page' => -1
            ]);

            foreach ($notes as $note) {
                // Duplicate the Note and assign it to the new folder
                $new_note_id = wp_insert_post([
                    'post_title'   => $note->post_title,
                    'post_content' => $note->post_content,
                    'post_type'    => 'fn_note_page',
                    'post_parent'  => $new_folder_id,
                    'post_status'  => 'publish'
                ]);
                update_post_meta($new_note_id, '_fn_workspace_id', $workspace_id);
            }
        }
    }

    return rest_ensure_response([
        'id' => $workspace_id, 
        'name' => $params['name'], 
        'color' => $params['color'], 
        'role' => 'owner'
    ]);
}

function fn_api_remove_workspace_user($request) {
    global $wpdb;
    $ws = intval($request['id']);
    $target_user_id = intval($request['user_id']);
    $current_user_id = get_current_user_id();
    
    // Verify CURRENT user is an owner or organizer (or they are leaving the workspace themselves)
    $table_members = $wpdb->prefix . 'fn_workspace_members';
    $current_user_role = $wpdb->get_var($wpdb->prepare("SELECT app_role FROM $table_members WHERE workspace_id = %d AND user_id = %d", $ws, $current_user_id));

    if (!in_array($current_user_role, ['owner', 'organizer']) && $current_user_id !== $target_user_id) {
        return new WP_Error('forbidden', __('You do not have permission to remove users.', 'family-notebook'), ['status' => 403]);
    }

    $wpdb->delete($table_members, ['workspace_id' => $ws, 'user_id' => $target_user_id]);
    return rest_ensure_response(['success' => true]);
}

function fn_api_get_notes($request) {
    $ws = intval($request->get_param('workspace_id'));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );
    $query = new WP_Query(['post_type' => 'fn_note_page', 'posts_per_page' => -1, 'post_status' => 'publish', 'meta_query' => [['key' => '_fn_workspace_id', 'value' => $ws]]]);
    $items = [];
    foreach($query->posts as $p) $items[] = ['id' => $p->ID, 'title' => $p->post_title, 'parent_id' => $p->post_parent];
    return rest_ensure_response($items);
}

function fn_api_create_note($request) {
    $params = $request->get_json_params();
    $ws = intval($params['workspace_id']);
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );
    $content = [];
    if (!empty($params['template_id'])) {
        $tpl = get_post(intval($params['template_id']));
        if ($tpl) $content = json_decode($tpl->post_content, true) ?: [];
    }
    
    // ADDED: wp_slash() wraps the wp_json_encode string
    $id = wp_insert_post([
        'post_title' => sanitize_text_field($params['title']), 
        'post_type' => 'fn_note_page', 
        'post_status' => 'publish', 
        'post_parent' => intval($params['parent_id'] ?? 0), 
        'post_content' => wp_slash(wp_json_encode($content))
    ]);
    
    update_post_meta($id, '_fn_workspace_id', $ws);
    return rest_ensure_response(['id' => $id, 'title' => $params['title'], 'parent_id' => $params['parent_id'] ?? 0, 'content' => $content]);
}

function fn_api_update_note($request) {
    $id = intval($request['id']);
    $ws = intval(get_post_meta($id, '_fn_workspace_id', true));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );
    $p = $request->get_json_params();

    $update_data = ['ID' => $id];
    
    if ( isset($p['title']) ) {
        $update_data['post_title'] = sanitize_text_field($p['title']);
    }
    if ( isset($p['content']) ) {
        // ADDED: wp_slash() wrapper
        $update_data['post_content'] = wp_slash(wp_json_encode($p['content']));
    }
    if ( isset($p['parent_id']) ) {
        $update_data['post_parent'] = intval($p['parent_id']);
    }

    wp_update_post($update_data);
    return rest_ensure_response(['message' => __('Success', 'family-notebook')]);
}

function fn_api_copy_note($request) {
    $original_id = intval($request['id']);
    $ws = intval(get_post_meta($original_id, '_fn_workspace_id', true));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );
    
    $p = $request->get_json_params();
    $new_parent_id = isset($p['parent_id']) ? intval($p['parent_id']) : 0;
    
    $original_post = get_post($original_id);
    if (!$original_post) return new WP_Error('404', __('Note not found', 'family-notebook'));
    
    $new_post_id = wp_insert_post([
        'post_title'   => $original_post->post_title . ' ' . __('(Copy)', 'family-notebook'),
        // ADDED: wp_slash() wrapper for copied content
        'post_content' => wp_slash($original_post->post_content),
        'post_status'  => 'publish',
        'post_type'    => 'fn_note_page',
        'post_parent'  => $new_parent_id,
    ]);
    
    update_post_meta($new_post_id, '_fn_workspace_id', $ws);
    
    $content = json_decode($original_post->post_content, true) ?: [];
    
    return rest_ensure_response([
        'id' => $new_post_id, 
        'title' => $original_post->post_title . ' ' . __('(Copy)', 'family-notebook'), 
        'parent_id' => $new_parent_id, 
        'content' => $content
    ]);
}

function fn_api_get_single_note($request) {
    $id = intval($request['id']);
    $ws = intval(get_post_meta($id, '_fn_workspace_id', true));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );
    $p = get_post($id);
    $content = json_decode($p->post_content, true);
    if (json_last_error() !== JSON_ERROR_NONE) $content = [[ 'id' => uniqid('blk_'), 'type' => 'rich-text', 'content' => $p->post_content ]];
    return rest_ensure_response(['id' => $p->ID, 'title' => $p->post_title, 'content' => $content ?: []]);
}

function fn_api_delete_note($request) {
    $id = intval($request['id']);
    $ws = intval(get_post_meta($id, '_fn_workspace_id', true));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );
    foreach(get_posts(['post_parent' => $id, 'post_status' => 'any']) as $c) wp_delete_post($c->ID, true);
    wp_delete_post($id, true);
    return rest_ensure_response(['deleted' => true]);
}

function fn_api_get_templates($request) {
    $ws_id = intval($request->get_param('workspace_id'));
    
    $args = [
        'post_type'      => 'fn_template',
        'posts_per_page' => -1,
        'meta_query'     => [
            'relation' => 'OR',
            // Get Global templates (meta is 0 or doesn't exist)
            [ 'key' => '_fn_workspace_id', 'value' => [0, ''], 'compare' => 'IN' ],
            [ 'key' => '_fn_workspace_id', 'compare' => 'NOT EXISTS' ]
        ]
    ];

    // If a workspace is provided, also include templates specific to this workspace
    if ($ws_id > 0) {
        $args['meta_query'][] = [
            'key'     => '_fn_workspace_id',
            'value'   => $ws_id,
            'compare' => '='
        ];
    }

    $posts = get_posts($args);
    return rest_ensure_response(array_map(fn($p) => ['id' => $p->ID, 'title' => $p->post_title, 'content' => json_decode($p->post_content, true)], $posts));
}

function fn_api_save_template( $request ) {
    $params = $request->get_json_params();
    $clean_content = $params['content'];
    $ws_id = isset($params['workspace_id']) ? intval($params['workspace_id']) : 0; // NEW: Default to 0 (Global) if none provided

    // Helper function to deep-clean blocks
    $clean_blocks = function(&$blocks) {
        foreach ($blocks as &$block) {
            if (isset($block['items'])) {
                foreach ($block['items'] as &$item) $item['completed'] = false;
            }
            if (isset($block['rows'])) {
                foreach ($block['rows'] as &$row) $row['days'] = array_fill(0, 7, false);
            }
        }
    };

    if ( isset($clean_content['tabs']) && is_array($clean_content['tabs']) ) {
        foreach ( $clean_content['tabs'] as &$tab ) {
            if ( isset($tab['blocks']) && is_array($tab['blocks']) ) $clean_blocks($tab['blocks']);
        }
    } else if ( is_array($clean_content) ) {
        $clean_blocks($clean_content); 
    }

    $id = wp_insert_post([
        'post_title'   => sanitize_text_field( $params['title'] ),
        'post_content' => wp_json_encode( $clean_content ),
        'post_type'    => 'fn_template',
        'post_status'  => 'publish'
    ]);
    
    // NEW: Save the template's workspace scope
    update_post_meta($id, '_fn_workspace_id', $ws_id);
    
    return rest_ensure_response([ 'id' => $id, 'message' => __('Template saved.', 'family-notebook') ]);
}

function fn_api_delete_template($request) { wp_delete_post(intval($request['id']), true); return rest_ensure_response(['deleted' => true]); }

function fn_api_export_template($request) {
    $f_id = intval($request['id']);
    
    // ADDED: Verify user has access to the workspace where this folder exists
    $ws = intval(get_post_meta($f_id, '_fn_workspace_id', true));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );

    $notes = get_posts(['post_type' => 'fn_note_page', 'post_parent' => $f_id, 'posts_per_page' => -1]);
    $data = ['template_name' => get_the_title($f_id), 'type' => 'fn_folder_template', 'notes' => []];
    foreach($notes as $n) $data['notes'][] = ['title' => $n->post_title, 'content' => json_decode($n->post_content, true)];
    return rest_ensure_response($data);
}

function fn_api_import_template($request) {
    $p = $request->get_json_params();
    $ws = intval($p['workspace_id']);
    
    // ADDED: Verify user has access to the target workspace
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );
    
    $tpl = $p['template_data'];
    $f_id = wp_insert_post(['post_title' => sanitize_text_field($tpl['template_name']).' ' . __('(Imported)', 'family-notebook'), 'post_type' => 'fn_note_page', 'post_status' => 'publish']);
    update_post_meta($f_id, '_fn_workspace_id', $ws);
    $items = [['id' => $f_id, 'title' => $tpl['template_name'].' ' . __('(Imported)', 'family-notebook'), 'parent_id' => 0]];
    foreach($tpl['notes'] as $n) {
        $nid = wp_insert_post(['post_title' => sanitize_text_field($n['title']), 'post_type' => 'fn_note_page', 'post_status' => 'publish', 'post_parent' => $f_id, 'post_content' => wp_slash(wp_json_encode($n['content']))]); // Added wp_slash here just in case!
        update_post_meta($nid, '_fn_workspace_id', $ws);
        $items[] = ['id' => $nid, 'title' => $n['title'], 'parent_id' => $f_id];
    }
    return rest_ensure_response(['new_items' => $items]);
}

function fn_api_get_workspace_users($request) {
    global $wpdb;
    $ws = intval($request['id']);
    
    // ADDED: Verify user is a member before viewing users
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );

    $query = $wpdb->prepare("
        SELECT u.ID as id, u.display_name as name, u.user_email as email, m.app_role
        FROM {$wpdb->prefix}fn_workspace_members m
        INNER JOIN {$wpdb->users} u ON m.user_id = u.ID
        WHERE m.workspace_id = %d
    ", $ws);

    $results = $wpdb->get_results($query, ARRAY_A);
    $data = [];

    if ($results) {
        foreach ($results as $row) {
            $data[] = [
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'email' => $row['email'],
                'is_owner' => ($row['app_role'] === 'owner'),
                'role' => $row['app_role'] // <-- Make sure this line exists so React knows what role to display!
            ];
        }
    }
    
    return rest_ensure_response($data);
}

function fn_api_add_workspace_user($request) {
    global $wpdb;
    $ws = intval($request['id']);
    
    // ADDED: Verify user is authorized to invite others (ideally an owner, but this prevents random scraping)
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', __('Unauthorized', 'family-notebook') );
    
    $email = sanitize_email($request->get_json_params()['email']);
    $u = get_user_by('email', $email);
    
    $workspace = $wpdb->get_row($wpdb->prepare("SELECT workspace_name, join_code FROM {$wpdb->prefix}fn_workspaces WHERE id = %d", $ws));
    if (!$workspace) return new WP_Error('404', __('Workspace not found.', 'family-notebook'));
    
    $workspace_name = $workspace->workspace_name;
    $login_url = get_option('fn_app_login_url', site_url());

    add_filter( 'wp_mail_content_type', function() { return 'text/html'; } );

    if (!$u) {
        $invite_link = add_query_arg('fn_join', $workspace->join_code, $login_url);
        
        $message = "
            <html>
            <body style='font-family: sans-serif; color: #334155;'>
                <h2>" . esc_html__("You've been invited to Family Notebook!", 'family-notebook') . "</h2>
                <p>" . sprintf(esc_html__("Someone has invited you to join the workspace %s.", 'family-notebook'), "<strong>" . esc_html($workspace_name) . "</strong>") . "</p>
                <p>" . esc_html__("To accept this invitation, please create a free account by clicking the link below:", 'family-notebook') . "</p>
                <p><br><a href='" . esc_url($invite_link) . "' style='background:#10b981; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px; display:inline-block;'>" . esc_html__("Create Account & Join", 'family-notebook') . "</a><br><br></p>
                <p>" . esc_html__("Best regards,", 'family-notebook') . "<br>" . esc_html__("The Family Notebook Team", 'family-notebook') . "</p>
            </body>
            </html>
        ";
        wp_mail($email, sprintf(__("Invitation: Join %s", 'family-notebook'), $workspace_name), $message);
        remove_filter( 'wp_mail_content_type', function() { return 'text/html'; } );
        
        return rest_ensure_response(['success' => true, 'status' => 'invite_sent_to_new_user']);
    }

    // SCENARIO 2: User ALREADY exists
    $table_members = $wpdb->prefix . 'fn_workspace_members';
    $existing = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $table_members WHERE workspace_id = %d AND user_id = %d", $ws, $u->ID));

    if ($existing == 0) {
        // ADDED: Look for a role in the request, default to viewer if none provided
        $params = $request->get_json_params();
        $requested_role = isset($params['role']) ? sanitize_text_field($params['role']) : 'viewer';

        $wpdb->insert($table_members, [
            'workspace_id' => $ws,
            'user_id'      => $u->ID,
            'app_role'     => $requested_role // CHANGED: Replaced hardcoded 'viewer' string
        ]);
        
        $message = "
            <html>
            <body style='font-family: sans-serif; color: #334155;'>
                <h2>" . esc_html__("You've been added to a new workspace!", 'family-notebook') . "</h2>
                <p>" . sprintf(esc_html__("Hi %s,", 'family-notebook'), esc_html($u->display_name)) . "</p>
                <p>" . sprintf(esc_html__("You have been granted access to the workspace %s.", 'family-notebook'), "<strong>" . esc_html($workspace_name) . "</strong>") . "</p>
                <p><br><a href='" . esc_url($login_url) . "' style='background:#0284c7; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px; display:inline-block;'>" . esc_html__("Access Your Workspace", 'family-notebook') . "</a><br><br></p>
            </body>
            </html>
        ";
        wp_mail($email, sprintf(__("Update: Access granted to %s", 'family-notebook'), $workspace_name), $message);
    }
    remove_filter( 'wp_mail_content_type', function() { return 'text/html'; } );

    return rest_ensure_response(['success' => true, 'status' => 'added_existing_user']);
}

function fn_api_update_workspace_user_role($request) {
    global $wpdb;
    $ws = intval($request['id']);
    $target_user_id = intval($request['user_id']);
    $current_user_id = get_current_user_id();
    
    $params = $request->get_json_params();
    $new_role = sanitize_text_field($params['role']);

    // 1. Validate the role
    $allowed_roles = ['owner', 'organizer', 'user', 'viewer'];
    if (!in_array($new_role, $allowed_roles)) return new WP_Error('invalid', __('Invalid role', 'family-notebook'), ['status' => 400]);

    // 2. Verify the CURRENT user is an owner or organizer
    $table_members = $wpdb->prefix . 'fn_workspace_members';
    $current_user_role = $wpdb->get_var($wpdb->prepare("SELECT app_role FROM $table_members WHERE workspace_id = %d AND user_id = %d", $ws, $current_user_id));

    if (!in_array($current_user_role, ['owner', 'organizer'])) {
        return new WP_Error('forbidden', __('You do not have permission to change roles.', 'family-notebook'), ['status' => 403]);
    }

    // 3. Update the role in the database
    $wpdb->update(
        $table_members,
        ['app_role' => $new_role],
        ['workspace_id' => $ws, 'user_id' => $target_user_id]
    );

    return rest_ensure_response(['success' => true]);
}
function fn_api_update_workspace($request) {
    global $wpdb;
    $ws = intval($request['id']);
    $params = $request->get_json_params();
    
    // Validate Ownership
    $current_user_id = get_current_user_id();
    $role = $wpdb->get_var($wpdb->prepare("SELECT app_role FROM {$wpdb->prefix}fn_workspace_members WHERE workspace_id = %d AND user_id = %d", $ws, $current_user_id));
    if ($role !== 'owner') return new WP_Error( '403', __('Only owners can edit workspaces.', 'family-notebook') );

    $update = [];
    if(isset($params['name'])) $update['workspace_name'] = sanitize_text_field($params['name']);
    if(isset($params['color'])) $update['theme_color'] = sanitize_hex_color($params['color']);

    if(!empty($update)) {
        $wpdb->update($wpdb->prefix . 'fn_workspaces', $update, ['id' => $ws]);
    }
    return rest_ensure_response(['success' => true]);
}

function fn_api_delete_workspace($request) {
    global $wpdb;
    $ws = intval($request['id']);
    
    $current_user_id = get_current_user_id();
    $role = $wpdb->get_var($wpdb->prepare("SELECT app_role FROM {$wpdb->prefix}fn_workspace_members WHERE workspace_id = %d AND user_id = %d", $ws, $current_user_id));
    if ($role !== 'owner') return new WP_Error( '403', __('Only owners can delete workspaces.', 'family-notebook') );

    $wpdb->delete($wpdb->prefix . 'fn_workspaces', ['id' => $ws]);
    $wpdb->delete($wpdb->prefix . 'fn_workspace_members', ['workspace_id' => $ws]);
    
    $notes = get_posts(['post_type' => 'fn_note_page', 'meta_key' => '_fn_workspace_id', 'meta_value' => $ws, 'posts_per_page' => -1]);
    foreach($notes as $n) wp_delete_post($n->ID, true);

    return rest_ensure_response(['deleted' => true]);
}
// 7. Admin Panel
add_action( 'admin_menu', 'fn_register_admin_menu' );
function fn_register_admin_menu() {
    add_menu_page(__('Family Notebook Settings', 'family-notebook'), __('Family Notebook', 'family-notebook'), 'manage_options', 'family-notebook', 'fn_render_admin_settings', 'dashicons-book', 30);
}
// Register the setting in the database
// Register the settings in the database
add_action( 'admin_init', 'fn_register_plugin_settings' );
function fn_register_plugin_settings() {
    register_setting( 'fn_settings_group', 'fn_app_login_url' );
    register_setting( 'fn_settings_group', 'fn_starter_workspace_id' ); // NEW: Register starter workspace
}

function fn_render_admin_settings() {
    if ( ! current_user_can( 'manage_options' ) ) return;
    
    global $wpdb;
    $workspaces = $wpdb->get_results("SELECT id, workspace_name FROM {$wpdb->prefix}fn_workspaces ORDER BY workspace_name ASC");
    $starter_ws = get_option('fn_starter_workspace_id', 0);
    ?>
    <div class="wrap">
        <h1><?php esc_html_e('Family Notebook Administration', 'family-notebook'); ?></h1>
        <p><?php esc_html_e('Global settings management for the Family Notebook application.', 'family-notebook'); ?></p>
        
        <form method="post" action="options.php">
            <?php 
                settings_fields( 'fn_settings_group' ); 
                do_settings_sections( 'fn_settings_group' ); 
            ?>
            <table class="form-table">
                <tr valign="top">
                    <th scope="row"><?php esc_html_e('App Login URL', 'family-notebook'); ?></th>
                    <td>
                        <input type="url" name="fn_app_login_url" value="<?php echo esc_attr( get_option('fn_app_login_url', site_url()) ); ?>" style="width: 100%; max-width: 400px;" />
                        <p class="description"><?php echo sprintf(esc_html__('The URL where your %s shortcode is located.', 'family-notebook'), '<code>[family_notebook_app]</code>'); ?></p>
                    </td>
                </tr>
                <tr valign="top">
                    <th scope="row"><?php esc_html_e('Starter Kit Workspace', 'family-notebook'); ?></th>
                    <td>
                        <select name="fn_starter_workspace_id" style="width: 100%; max-width: 400px;">
                            <option value="0"><?php esc_html_e('-- None (Start Empty) --', 'family-notebook'); ?></option>
                            <?php foreach($workspaces as $ws): ?>
                                <option value="<?php echo esc_attr($ws->id); ?>" <?php selected($starter_ws, $ws->id); ?>>
                                    <?php echo esc_html($ws->workspace_name); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description"><?php esc_html_e('Select a master workspace. Whenever a new workspace is created, it will automatically clone all folders and notes from this workspace as a starter kit.', 'family-notebook'); ?></p>
                    </td>
                </tr>
            </table>
            
            <?php submit_button(); ?>
        </form>

        <hr style="margin: 40px 0;">

        <h2><?php esc_html_e('Data Management & Backups', 'family-notebook'); ?></h2>
        <p><?php echo sprintf(esc_html__('Use these tools to backup your Family Notebook data or migrate it to a completely different WordPress website. %s', 'family-notebook'), '<em>' . esc_html__('Note: Standard WordPress migration plugins (like UpdraftPlus) will already include this data automatically.', 'family-notebook') . '</em>'); ?></p>
        
        <?php if (isset($_GET['import']) && $_GET['import'] === 'success'): ?>
            <div class="notice notice-success is-dismissible"><p><strong><?php esc_html_e('Success!', 'family-notebook'); ?></strong> <?php esc_html_e('App data successfully imported. You are now the Owner of all imported workspaces.', 'family-notebook'); ?></p></div>
        <?php endif; ?>

        <table class="form-table">
            <tr valign="top">
                <th scope="row"><?php esc_html_e('Export Full Backup', 'family-notebook'); ?></th>
                <td>
                    <a href="<?php echo esc_url(admin_url('admin-post.php?action=fn_export_app_data')); ?>" class="button button-primary" style="background: #10b981; border-color: #059669;">
                        <?php esc_html_e('Download App Backup (.json)', 'family-notebook'); ?>
                    </a>
                    <p class="description"><?php esc_html_e('Downloads a complete backup of all Workspaces, Folders, Notes, and Templates.', 'family-notebook'); ?></p>
                </td>
            </tr>
            <tr valign="top">
                <th scope="row"><?php esc_html_e('Import Data', 'family-notebook'); ?></th>
                <td>
                    <form action="<?php echo esc_url(admin_url('admin-post.php')); ?>" method="post" enctype="multipart/form-data" onsubmit="return confirm('<?php echo esc_js(__('WARNING: Are you sure you want to import this data? It will add new workspaces to your database.', 'family-notebook')); ?>');">
                        <input type="hidden" name="action" value="fn_import_app_data">
                        <?php wp_nonce_field('fn_import_nonce'); ?>
                        
                        <input type="file" name="fn_import_file" accept=".json" required />
                        <button type="submit" class="button button-secondary"><?php esc_html_e('Upload & Import', 'family-notebook'); ?></button>
                        <p class="description"><?php echo sprintf(esc_html__('Select a .json file previously generated by the Export tool. %s Because user accounts cannot be safely migrated between different websites, you (the current Administrator) will be assigned as the Owner of all imported workspaces. You will need to re-invite your members.', 'family-notebook'), '<strong>' . esc_html__('Important:', 'family-notebook') . '</strong>'); ?></p>
                    </form>
                </td>
            </tr>
        </table>
        <hr style="margin: 40px 0;">
		<h2><?php esc_html_e('Emergency Workspace Reassignment', 'family-notebook'); ?></h2>
		<p><?php esc_html_e('If an owner is deleted from your WordPress site, use this tool to assign a workspace to a new user account.', 'family-notebook'); ?></p>
		<form action="<?php echo esc_url(admin_url('admin-post.php')); ?>" method="post">
			<input type="hidden" name="action" value="fn_reassign_workspace">
			<?php wp_nonce_field('fn_reassign_nonce'); ?>
			<table class="form-table">
				<tr valign="top">
					<th scope="row"><?php esc_html_e('Select Workspace', 'family-notebook'); ?></th>
					<td>
						<select name="fn_workspace_id" style="width: 100%; max-width: 400px;" required>
							<?php foreach($workspaces as $ws): ?>
								<option value="<?php echo esc_attr($ws->id); ?>"><?php echo esc_html($ws->workspace_name); ?></option>
							<?php endforeach; ?>
						</select>
					</td>
				</tr>
				<tr valign="top">
					<th scope="row"><?php esc_html_e('New Owner Email', 'family-notebook'); ?></th>
					<td>
						<input type="email" name="fn_new_owner_email" required style="width: 100%; max-width: 400px;" placeholder="user@domain.com" />
					</td>
				</tr>
			</table>
			<?php submit_button(__('Assign New Owner', 'family-notebook'), 'secondary'); ?>
		</form>
    </div>
    <?php
}
/**
 * Catch the join link and set a cookie before any HTML loads
 */
add_action('init', 'fn_capture_join_code');
function fn_capture_join_code() {
    if (isset($_GET['fn_join']) && !empty($_GET['fn_join'])) {
        // Set a cookie that lasts for 1 hour to remember what workspace they are trying to join
        setcookie('fn_pending_join_code', sanitize_text_field($_GET['fn_join']), time() + 3600, COOKIEPATH, COOKIE_DOMAIN);
    }
}

/**
 * Process the join code immediately after a user successfully logs in or registers
 */
add_action('wp_login', 'fn_process_pending_join_code', 10, 2);
function fn_process_pending_join_code($user_login, $user) {
    if (isset($_COOKIE['fn_pending_join_code'])) {
        global $wpdb;
        $join_code = sanitize_text_field($_COOKIE['fn_pending_join_code']);
        
        // Find the workspace by its join code
        $workspace_id = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$wpdb->prefix}fn_workspaces WHERE join_code = %s", $join_code));
        
        if ($workspace_id) {
            // Check if they are already a member just in case
            $table_members = $wpdb->prefix . 'fn_workspace_members';
            $existing = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $table_members WHERE workspace_id = %d AND user_id = %d", $workspace_id, $user->ID));
            
            if ($existing == 0) {
                // Add them to the workspace as a viewer
                $wpdb->insert($table_members, [
                    'workspace_id' => $workspace_id,
                    'user_id'      => $user->ID,
                    'app_role'     => 'viewer'
                ]);
            }
        }
        
        // Clear the cookie so it doesn't process again
        setcookie('fn_pending_join_code', '', time() - 3600, COOKIEPATH, COOKIE_DOMAIN);
    }
}
// ==========================================
// PWA ENGINE: Manifest & Service Worker
// ==========================================
add_action('parse_request', 'fn_serve_pwa_assets');
function fn_serve_pwa_assets() {
    $request_uri = $_SERVER['REQUEST_URI'] ?? '';

    // 1. Serve the Manifest
    if (strpos($request_uri, 'fn-manifest.json') !== false) {
        header('Content-Type: application/json');
        
        // Grab the exact URL where your app lives from your settings
        $app_url = get_option('fn_app_login_url', site_url());
        // Extract just the path (e.g., "/family-notebook/") to define the scope
        $app_path = parse_url($app_url, PHP_URL_PATH);
        if (!$app_path) $app_path = '/';

        echo wp_json_encode([
            "id" => "family-notebook-app-v1", // <-- NEW: Explicitly separates this from the Chore Chart
            "name" => "Family Notebook",
            "short_name" => "Notebook",
            "start_url" => $app_url,         // <-- NEW: Forces the app to open on the correct page
            "scope" => $app_path,             // <-- NEW: Restricts the PWA so it doesn't overlap with other apps
            "display" => "standalone",
            "background_color" => "#f1f5f9",
            "theme_color" => "#0f172a",
            "icons" => [
                [
                    "src" => FN_PLUGIN_URL . "assets/icon-192.png", 
                    "sizes" => "192x192",
                    "type" => "image/png"
                ],
                [
                    "src" => FN_PLUGIN_URL . "assets/icon-512.png", 
                    "sizes" => "512x512",
                    "type" => "image/png"
                ]
            ]
        ]);
        exit;
    }

    // 2. Serve the Service Worker
    if (strpos($request_uri, 'fn-sw.js') !== false) {
        header('Content-Type: application/javascript');
        // Critical: Allows the SW to control the WordPress page even if served from a weird path
        header('Service-Worker-Allowed: /'); 
        echo "
            self.addEventListener('install', (e) => { self.skipWaiting(); });
            self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
            self.addEventListener('fetch', (e) => { 
                // Basic pass-through fetch. Advanced offline caching can be added here later.
            });
        ";
        exit;
    }
}
add_action('admin_post_fn_reassign_workspace', 'fn_reassign_workspace');
function fn_reassign_workspace() {
    if (!current_user_can('manage_options')) wp_die(__('Unauthorized', 'family-notebook'));
    check_admin_referer('fn_reassign_nonce');

    global $wpdb;
    $ws_id = intval($_POST['fn_workspace_id']);
    $email = sanitize_email($_POST['fn_new_owner_email']);
    $user = get_user_by('email', $email);

    if (!$user) wp_die(__('User not found with that email.', 'family-notebook'));

    // Check if they are already a member, if so upgrade them. If not, insert them.
    $table = $wpdb->prefix . 'fn_workspace_members';
    $existing = $wpdb->get_var($wpdb->prepare("SELECT id FROM $table WHERE workspace_id = %d AND user_id = %d", $ws_id, $user->ID));

    if ($existing) {
        $wpdb->update($table, ['app_role' => 'owner'], ['id' => $existing]);
    } else {
        $wpdb->insert($table, ['workspace_id' => $ws_id, 'user_id' => $user->ID, 'app_role' => 'owner']);
    }

    wp_redirect(admin_url('admin.php?page=family-notebook&message=reassigned')); exit;
}
/**
 * 9. Inject iOS PWA Meta Tags (Apple Touch Icon)
 */
add_action('wp_head', 'fn_inject_pwa_meta_tags');
function fn_inject_pwa_meta_tags() {
    global $post;
    // Only inject on pages rendering the app
    if ( is_a( $post, 'WP_Post' ) && has_shortcode( $post->post_content, 'family_notebook_app' ) ) {
        $icon_url = FN_PLUGIN_URL . 'assets/icon-192.png';
        
        echo "\n";
        // Force iOS to use your specific app icon
        echo '<link rel="apple-touch-icon" href="' . esc_url($icon_url) . '">' . "\n";
        // Tell iOS this is a capable web app
        echo '<meta name="apple-mobile-web-app-capable" content="yes">' . "\n";
        // Make the status bar blend in with the app
        echo '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' . "\n";
        echo '<meta name="apple-mobile-web-app-title" content="Notebook">' . "\n";
    }
}
// 8. Auth Gate & Shortcode
add_shortcode( 'family_notebook_app', 'fn_render_app_shortcode' );
function fn_render_app_shortcode() {
    
    // NATIVE APP CSS: This ONLY activates when opened via the Home Screen Icon
    // NATIVE APP CSS: This ONLY activates when opened via the Home Screen Icon
    $standalone_css = '
    <style>
        /* Hidden by default on the standard website */
        .fn-native-app-header { display: none; }

        @media (display-mode: standalone) {
            header, footer, #main-header, #top-header, #main-footer, 
            .et-l-header, .et-l-footer, .site-header, .site-footer {
                display: none !important;
            }
            html, body, #page-container, #et-main-area, #main-content, 
            .et_pb_section, .et_pb_row, .et_pb_column, .entry-content {
                padding: 0 !important; margin: 0 !important; max-width: 100% !important; width: 100% !important; background-color: #f1f5f9 !important;
            }
            .fn-native-app-header {
                display: flex !important; align-items: center; justify-content: center; background-color: #0f172a; color: #ffffff;
                padding: 15px 20px; padding-top: max(15px, env(safe-area-inset-top)); box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                position: sticky; top: 0; z-index: 999999;
            }
        }

        /* NEW: iOS JavaScript Fallback Targeting */
        body.fn-is-standalone header, body.fn-is-standalone footer, 
        body.fn-is-standalone #main-header, body.fn-is-standalone #top-header, 
        body.fn-is-standalone #main-footer, body.fn-is-standalone .et-l-header, 
        body.fn-is-standalone .et-l-footer, body.fn-is-standalone .site-header, 
        body.fn-is-standalone .site-footer {
            display: none !important;
        }
        
        body.fn-is-standalone #page-container, body.fn-is-standalone #et-main-area, 
        body.fn-is-standalone #main-content, body.fn-is-standalone .et_pb_section, 
        body.fn-is-standalone .et_pb_row, body.fn-is-standalone .et_pb_column, 
        body.fn-is-standalone .entry-content {
            padding: 0 !important; margin: 0 !important; max-width: 100% !important; width: 100% !important; background-color: #f1f5f9 !important;
        }

        body.fn-is-standalone .fn-native-app-header {
            display: flex !important; align-items: center; justify-content: center; background-color: #0f172a; color: #ffffff;
            padding: 15px 20px; padding-top: max(15px, env(safe-area-inset-top)); box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            position: sticky; top: 0; z-index: 999999;
        }
        
        .fn-native-app-header h1 {
            margin: 0 !important; font-size: 20px !important; font-weight: bold !important; color: #ffffff !important; letter-spacing: 0.5px; padding: 0 !important; line-height: 1 !important;
        }
    </style>';

    if ( ! is_user_logged_in() ) {
        ob_start();
        echo $standalone_css; // Inject CSS into the login screen too
        ?>
        <div style="max-width: 400px; margin: 40px auto; padding: 30px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); font-family: sans-serif;">
            <h2 style="text-align: center; color: #1e293b; margin-top: 0; margin-bottom: 25px;"><?php esc_html_e('Family Notebook', 'family-notebook'); ?></h2>
            
            <?php 
            if ( shortcode_exists( 'nextend_social_login' ) ) {
                echo '<div style="display: flex; justify-content: center; margin-bottom: 25px;">' . do_shortcode( '[nextend_social_login provider="google"]' ) . '</div>';
                echo '<div style="display: flex; align-items: center; text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 20px;">
                        <div style="flex: 1; border-bottom: 1px solid #e2e8f0;"></div>
                        <span style="padding: 0 10px;">' . esc_html__('or login with email', 'family-notebook') . '</span>
                        <div style="flex: 1; border-bottom: 1px solid #e2e8f0;"></div>
                      </div>';
            }
            ?>

            <form name="loginform" id="loginform" action="<?php echo esc_url( site_url( 'wp-login.php', 'login_post' ) ); ?>" method="post">
                <p style="margin-bottom: 15px;">
                    <label for="user_login" style="display: block; font-size: 14px; color: #475569; margin-bottom: 5px; font-weight: bold;"><?php esc_html_e('Email or Username', 'family-notebook'); ?></label>
                    <input type="text" name="log" id="user_login" value="" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 16px;" required />
                </p>
                <p style="margin-bottom: 20px;">
                    <label for="user_pass" style="display: block; font-size: 14px; color: #475569; margin-bottom: 5px; font-weight: bold;"><?php esc_html_e('Password', 'family-notebook'); ?></label>
                    <input type="password" name="pwd" id="user_pass" value="" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 16px;" required />
                </p>
                <p style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <label style="font-size: 14px; color: #475569; cursor: pointer;">
                        <input name="rememberme" type="checkbox" id="rememberme" value="forever" style="margin-right: 5px;" /> <?php esc_html_e('Remember Me', 'family-notebook'); ?>
                    </label>
                    <a href="<?php echo esc_url( wp_lostpassword_url() ); ?>" style="font-size: 14px; color: #0284c7; text-decoration: none;"><?php esc_html_e('Forgot Password?', 'family-notebook'); ?></a>
                </p>
                <p style="margin: 0;">
                    <input type="submit" name="wp-submit" id="wp-submit" value="<?php esc_attr_e('Log In', 'family-notebook'); ?>" style="width: 100%; background-color: #0f172a; color: white; border: none; padding: 12px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 16px;" />
                    <input type="hidden" name="redirect_to" value="<?php echo esc_url( get_permalink() ); ?>" />
                </p>
            </form>
        </div>
        <?php
        return ob_get_clean();
    }
    
    // Inject CSS and the Custom App Header into the main app experience
    return $standalone_css . '
        <div class="fn-native-app-header">
            <h1>' . esc_html__('Family Notebook', 'family-notebook') . '</h1>
        </div>
        <div id="family-notebook-root">' . esc_html__('Loading...', 'family-notebook') . '</div>
    ';
}

register_activation_hook( __FILE__, 'fn_create_custom_tables' );
function fn_create_custom_tables() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    
    // ADDED: Get the site's default charset and collation
    $charset_collate = $wpdb->get_charset_collate();

    // ADDED: Append $charset_collate to the end of the SQL statements
    dbDelta("CREATE TABLE {$wpdb->prefix}fn_workspaces (id bigint(20) NOT NULL AUTO_INCREMENT, workspace_name varchar(255) NOT NULL, theme_color varchar(7) NOT NULL, join_code varchar(12) NOT NULL, created_by bigint(20) NOT NULL, PRIMARY KEY (id)) $charset_collate;");
    dbDelta("CREATE TABLE {$wpdb->prefix}fn_workspace_members (id bigint(20) NOT NULL AUTO_INCREMENT, workspace_id bigint(20) NOT NULL, user_id bigint(20) NOT NULL, app_role varchar(50) NOT NULL, PRIMARY KEY (id)) $charset_collate;");
}
// ==========================================
// GLOBAL BACKUP & RESTORE
// ==========================================

add_action('admin_post_fn_export_app_data', 'fn_export_app_data');
function fn_export_app_data() {
    if (!current_user_can('manage_options')) wp_die(__('Unauthorized', 'family-notebook'));
    global $wpdb;

    $data = [
        'version' => '1.0.0',
        'export_date' => current_time('mysql'),
        'workspaces' => $wpdb->get_results("SELECT id, workspace_name, theme_color, join_code FROM {$wpdb->prefix}fn_workspaces", ARRAY_A),
        // NEW: Grab members with their emails
        'members' => $wpdb->get_results("SELECT m.workspace_id, m.app_role, u.user_email FROM {$wpdb->prefix}fn_workspace_members m INNER JOIN {$wpdb->users} u ON m.user_id = u.ID", ARRAY_A),
        'notes' => [],
        'templates' => []
    ];

    $notes = get_posts(['post_type' => 'fn_note_page', 'posts_per_page' => -1, 'post_status' => 'any']);
    foreach($notes as $n) {
        $data['notes'][] = ['old_id' => $n->ID, 'title' => $n->post_title, 'content' => $n->post_content, 'parent_id' => $n->post_parent, 'workspace_id' => get_post_meta($n->ID, '_fn_workspace_id', true)];
    }

    $templates = get_posts(['post_type' => 'fn_template', 'posts_per_page' => -1, 'post_status' => 'any']);
    foreach($templates as $t) {
        $data['templates'][] = ['title' => $t->post_title, 'content' => $t->post_content, 'workspace_id' => get_post_meta($t->ID, '_fn_workspace_id', true)];
    }

    header('Content-Type: application/json');
    header('Content-Disposition: attachment; filename="family-notebook-full-backup-' . date('Y-m-d') . '.json"');
    echo wp_json_encode($data);
    exit;
}

add_action('admin_post_fn_import_app_data', 'fn_import_app_data');
function fn_import_app_data() {
    if (!current_user_can('manage_options')) wp_die(__('Unauthorized', 'family-notebook'));
    check_admin_referer('fn_import_nonce');

    if (empty($_FILES['fn_import_file']['tmp_name'])) wp_die(__('No file uploaded.', 'family-notebook'));
    $json_data = file_get_contents($_FILES['fn_import_file']['tmp_name']);
    $data = json_decode($json_data, true);

    if (!$data || !isset($data['version']) || !isset($data['workspaces'])) wp_die(__('Invalid Backup File.', 'family-notebook'));

    global $wpdb;
    $current_user_id = get_current_user_id();
    $workspace_map = []; $note_map = []; $notes_to_relink = [];

    // Phase 1: Import Workspaces
    if (!empty($data['workspaces'])) {
        foreach ($data['workspaces'] as $ws) {
            $wpdb->insert($wpdb->prefix . 'fn_workspaces', [
                'workspace_name' => sanitize_text_field($ws['workspace_name']),
                'theme_color'    => sanitize_text_field($ws['theme_color']),
                'join_code'      => strtoupper(substr(md5(uniqid(rand(), true)), 0, 8)),
                'created_by'     => $current_user_id
            ]);
            $workspace_map[$ws['id']] = $wpdb->insert_id;
        }
    }

    // Phase 1.5: Relink Members by Email
    if (!empty($data['members'])) {
        foreach ($data['members'] as $mem) {
            if(!isset($workspace_map[$mem['workspace_id']])) continue;
            
            $user = get_user_by('email', sanitize_email($mem['user_email']));
            if($user) {
                $wpdb->insert($wpdb->prefix . 'fn_workspace_members', [
                    'workspace_id' => $workspace_map[$mem['workspace_id']],
                    'user_id'      => $user->ID,
                    'app_role'     => sanitize_text_field($mem['app_role'])
                ]);
            }
        }
    }

    // Fallback: Ensure every workspace has an owner (assign importing admin if original owner missing)
    foreach($workspace_map as $old_id => $new_id) {
        $has_owner = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}fn_workspace_members WHERE workspace_id = %d AND app_role = 'owner'", $new_id));
        if ($has_owner == 0) {
            $wpdb->insert($wpdb->prefix . 'fn_workspace_members', ['workspace_id' => $new_id, 'user_id' => $current_user_id, 'app_role' => 'owner']);
        }
    }

    // Phase 2: Import Templates
    if (!empty($data['templates'])) {
        foreach ($data['templates'] as $t) {
            $new_template_id = wp_insert_post(['post_title' => sanitize_text_field($t['title']), 'post_content' => wp_slash($t['content']), 'post_type' => 'fn_template', 'post_status' => 'publish']);
            $new_ws_id = isset($workspace_map[$t['workspace_id']]) ? $workspace_map[$t['workspace_id']] : 0;
            update_post_meta($new_template_id, '_fn_workspace_id', $new_ws_id);
        }
    }

    // Phase 3 & 4: Import Notes & Hierarchies
    if (!empty($data['notes'])) {
        foreach ($data['notes'] as $n) {
            $new_note_id = wp_insert_post(['post_title' => sanitize_text_field($n['title']), 'post_content' => wp_slash($n['content']), 'post_type' => 'fn_note_page', 'post_status' => 'publish', 'post_parent' => 0]);
            $note_map[$n['old_id']] = $new_note_id;
            $new_ws_id = isset($workspace_map[$n['workspace_id']]) ? $workspace_map[$n['workspace_id']] : 0;
            update_post_meta($new_note_id, '_fn_workspace_id', $new_ws_id);
            if ($n['parent_id'] > 0) $notes_to_relink[$new_note_id] = $n['parent_id'];
        }
    }
    foreach ($notes_to_relink as $new_child_id => $old_parent_id) {
        if (isset($note_map[$old_parent_id])) wp_update_post(['ID' => $new_child_id, 'post_parent' => $note_map[$old_parent_id]]);
    }

    wp_redirect(admin_url('admin.php?page=family-notebook&import=success')); exit;
}

// ==========================================
// ADMIN UI: TEMPLATE SCOPE MANAGEMENT
// ==========================================

// 1. Add Meta Box to the Template Editor
add_action('add_meta_boxes', 'fn_template_meta_box');
function fn_template_meta_box() {
    add_meta_box('fn_template_workspace', __('Template Scope', 'family-notebook'), 'fn_template_meta_box_html', 'fn_template', 'side', 'default');
}

function fn_template_meta_box_html($post) {
    global $wpdb;
    $current_ws = get_post_meta($post->ID, '_fn_workspace_id', true);
    if ($current_ws === '') $current_ws = 0; // Default to Global
    
    $workspaces = $wpdb->get_results("SELECT id, workspace_name FROM {$wpdb->prefix}fn_workspaces ORDER BY workspace_name ASC");

    echo '<label for="fn_workspace_id" style="font-weight:bold;">' . esc_html__('Assign to Workspace:', 'family-notebook') . '</label>';
    echo '<select name="fn_workspace_id" id="fn_workspace_id" style="width:100%; margin-top:10px;">';
    echo '<option value="0" ' . selected($current_ws, 0, false) . '>🌎 ' . esc_html__('Global (All Workspaces)', 'family-notebook') . '</option>';
    
    foreach($workspaces as $ws) {
        echo '<option value="' . esc_attr($ws->id) . '" ' . selected($current_ws, $ws->id, false) . '>📁 ' . esc_html($ws->workspace_name) . '</option>';
    }
    echo '</select>';
    echo '<p class="description">' . esc_html__('Global templates are available to everyone. Workspace templates are only visible inside the selected family/group.', 'family-notebook') . '</p>';
    wp_nonce_field('fn_save_template_scope', 'fn_template_scope_nonce');
}

// 2. Save the Meta Box Value
add_action('save_post_fn_template', 'fn_save_template_meta');
function fn_save_template_meta($post_id) {
    if (!isset($_POST['fn_template_scope_nonce']) || !wp_verify_nonce($_POST['fn_template_scope_nonce'], 'fn_save_template_scope')) return;
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (!current_user_can('edit_post', $post_id)) return;

    if (isset($_POST['fn_workspace_id'])) {
        update_post_meta($post_id, '_fn_workspace_id', intval($_POST['fn_workspace_id']));
    }
}

// 3. Add Custom Column to Template List Table for easy viewing
add_filter('manage_fn_template_posts_columns', 'fn_template_columns');
function fn_template_columns($columns) {
    $columns['workspace_scope'] = __('Workspace Scope', 'family-notebook');
    return $columns;
}

add_action('manage_fn_template_posts_custom_column', 'fn_template_column_content', 10, 2);
function fn_template_column_content($column, $post_id) {
    if ($column === 'workspace_scope') {
        $ws_id = get_post_meta($post_id, '_fn_workspace_id', true);
        if (!$ws_id || $ws_id == 0) {
            echo '<span style="color:#0284c7; font-weight:bold;">🌎 ' . esc_html__('Global', 'family-notebook') . '</span>';
        } else {
            global $wpdb;
            $name = $wpdb->get_var($wpdb->prepare("SELECT workspace_name FROM {$wpdb->prefix}fn_workspaces WHERE id = %d", $ws_id));
            echo esc_html($name ? "📁 " . $name : __('Unknown Workspace', 'family-notebook'));
        }
    }
}