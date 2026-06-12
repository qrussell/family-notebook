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
        'show_in_rest'=> true,
        'supports'    => [ 'title', 'editor', 'page-attributes' ],
    ]);
    // Register the Global Template Library Post Type
    register_post_type( 'fn_template', [
        'public'      => false,
        'show_ui'     => true,
        'label'       => 'Templates',
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
            wp_localize_script( 'family-notebook-app', 'fnAppConfig', [
                'rootUrl' => esc_url_raw( rest_url() ),
                'nonce'   => wp_create_nonce( 'wp_rest' ),
                'siteUrl' => site_url(),
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
    register_rest_route( 'family-notebook/v1', '/workspaces/(?P<id>\d+)/users/(?P<user_id>\d+)', ['methods' => 'DELETE', 'callback' => 'fn_api_remove_workspace_user', 'permission_callback' => 'is_user_logged_in']);
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
    $wpdb->insert($wpdb->prefix . 'fn_workspaces', ['workspace_name' => sanitize_text_field($params['name']), 'theme_color' => sanitize_hex_color($params['color']), 'join_code' => strtoupper(substr(md5(uniqid(rand(), true)), 0, 8)), 'created_by' => $user_id]);
    $id = $wpdb->insert_id;
    $wpdb->insert($wpdb->prefix . 'fn_workspace_members', ['workspace_id' => $id, 'user_id' => $user_id, 'app_role' => 'owner']);
    return rest_ensure_response(['id' => $id, 'name' => $params['name'], 'color' => $params['color'], 'role' => 'owner']);
}

function fn_api_get_notes($request) {
    $ws = intval($request->get_param('workspace_id'));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', 'Unauthorized' );
    $query = new WP_Query(['post_type' => 'fn_note_page', 'posts_per_page' => -1, 'post_status' => 'publish', 'meta_query' => [['key' => '_fn_workspace_id', 'value' => $ws]]]);
    $items = [];
    foreach($query->posts as $p) $items[] = ['id' => $p->ID, 'title' => $p->post_title, 'parent_id' => $p->post_parent];
    return rest_ensure_response($items);
}

function fn_api_create_note($request) {
    $params = $request->get_json_params();
    $ws = intval($params['workspace_id']);
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', 'Unauthorized' );
    $content = [];
    if (!empty($params['template_id'])) {
        $tpl = get_post(intval($params['template_id']));
        if ($tpl) $content = json_decode($tpl->post_content, true) ?: [];
    }
    $id = wp_insert_post(['post_title' => sanitize_text_field($params['title']), 'post_type' => 'fn_note_page', 'post_status' => 'publish', 'post_parent' => intval($params['parent_id'] ?? 0), 'post_content' => wp_json_encode($content)]);
    update_post_meta($id, '_fn_workspace_id', $ws);
    return rest_ensure_response(['id' => $id, 'title' => $params['title'], 'parent_id' => $params['parent_id'] ?? 0, 'content' => $content]);
}

function fn_api_get_single_note($request) {
    $id = intval($request['id']);
    $ws = intval(get_post_meta($id, '_fn_workspace_id', true));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', 'Unauthorized' );
    $p = get_post($id);
    $content = json_decode($p->post_content, true);
    if (json_last_error() !== JSON_ERROR_NONE) $content = [[ 'id' => uniqid('blk_'), 'type' => 'rich-text', 'content' => $p->post_content ]];
    return rest_ensure_response(['id' => $p->ID, 'title' => $p->post_title, 'content' => $content ?: []]);
}

function fn_api_update_note($request) {
    $id = intval($request['id']);
    $ws = intval(get_post_meta($id, '_fn_workspace_id', true));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', 'Unauthorized' );
    $p = $request->get_json_params();
    wp_update_post(['ID' => $id, 'post_title' => sanitize_text_field($p['title']), 'post_content' => wp_json_encode($p['content'])]);
    return rest_ensure_response(['message' => 'Success']);
}

function fn_api_delete_note($request) {
    $id = intval($request['id']);
    $ws = intval(get_post_meta($id, '_fn_workspace_id', true));
    if ( ! fn_is_user_authorized_for_workspace( $ws ) ) return new WP_Error( '403', 'Unauthorized' );
    foreach(get_posts(['post_parent' => $id, 'post_status' => 'any']) as $c) wp_delete_post($c->ID, true);
    wp_delete_post($id, true);
    return rest_ensure_response(['deleted' => true]);
}

function fn_api_get_templates() {
    $posts = get_posts(['post_type' => 'fn_template', 'posts_per_page' => -1]);
    return rest_ensure_response(array_map(fn($p) => ['id' => $p->ID, 'title' => $p->post_title, 'content' => json_decode($p->post_content, true)], $posts));
}

function fn_api_save_template( $request ) {
    $params = $request->get_json_params();
    $clean_content = $params['content'];

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

    // Check if it's the new Tabbed structure or a legacy block array
    if ( isset($clean_content['tabs']) && is_array($clean_content['tabs']) ) {
        foreach ( $clean_content['tabs'] as &$tab ) {
            if ( isset($tab['blocks']) && is_array($tab['blocks']) ) {
                $clean_blocks($tab['blocks']);
            }
        }
    } else if ( is_array($clean_content) ) {
        // Legacy Note Array fallback
        $clean_blocks($clean_content); 
    }

    $id = wp_insert_post([
        'post_title'   => sanitize_text_field( $params['title'] ),
        'post_content' => wp_json_encode( $clean_content ),
        'post_type'    => 'fn_template',
        'post_status'  => 'publish'
    ]);
    
    return rest_ensure_response([ 'id' => $id, 'message' => 'Template saved.' ]);
}

function fn_api_delete_template($request) { wp_delete_post(intval($request['id']), true); return rest_ensure_response(['deleted' => true]); }

function fn_api_export_template($request) {
    $f_id = intval($request['id']);
    $notes = get_posts(['post_type' => 'fn_note_page', 'post_parent' => $f_id, 'posts_per_page' => -1]);
    $data = ['template_name' => get_the_title($f_id), 'type' => 'fn_folder_template', 'notes' => []];
    foreach($notes as $n) $data['notes'][] = ['title' => $n->post_title, 'content' => json_decode($n->post_content, true)];
    return rest_ensure_response($data);
}

function fn_api_import_template($request) {
    $p = $request->get_json_params();
    $ws = intval($p['workspace_id']);
    $tpl = $p['template_data'];
    $f_id = wp_insert_post(['post_title' => sanitize_text_field($tpl['template_name']).' (Imported)', 'post_type' => 'fn_note_page', 'post_status' => 'publish']);
    update_post_meta($f_id, '_fn_workspace_id', $ws);
    $items = [['id' => $f_id, 'title' => $tpl['template_name'].' (Imported)', 'parent_id' => 0]];
    foreach($tpl['notes'] as $n) {
        $nid = wp_insert_post(['post_title' => sanitize_text_field($n['title']), 'post_type' => 'fn_note_page', 'post_status' => 'publish', 'post_parent' => $f_id, 'post_content' => wp_json_encode($n['content'])]);
        update_post_meta($nid, '_fn_workspace_id', $ws);
        $items[] = ['id' => $nid, 'title' => $n['title'], 'parent_id' => $f_id];
    }
    return rest_ensure_response(['new_items' => $items]);
}

// ==========================================
// USER MANAGEMENT (Custom SQL Table Version)
// ==========================================

function fn_api_get_workspace_users($request) {
    global $wpdb;
    $ws = intval($request['id']);

    // Query our custom members table and join it with the native WP users table to get their names/emails
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
                'is_owner' => ($row['app_role'] === 'owner')
            ];
        }
    }
    
    return rest_ensure_response($data);
}

function fn_api_add_workspace_user($request) {
    global $wpdb;
    $ws = intval($request['id']);
    $email = sanitize_email($request->get_json_params()['email']);
    $u = get_user_by('email', $email);
    
    // Get workspace details for the email
    $workspace = $wpdb->get_row($wpdb->prepare("SELECT workspace_name, join_code FROM {$wpdb->prefix}fn_workspaces WHERE id = %d", $ws));
    if (!$workspace) return new WP_Error('404', 'Workspace not found.');
    
    $workspace_name = $workspace->workspace_name;
    $login_url = get_option('fn_app_login_url', site_url());

    add_filter( 'wp_mail_content_type', function() { return 'text/html'; } );

    if (!$u) {
        // SCENARIO 1: User does NOT exist in WordPress yet.
        // Send them a special invite link with the join code attached.
        $invite_link = add_query_arg('fn_join', $workspace->join_code, $login_url);
        
        $message = "
            <html>
            <body style='font-family: sans-serif; color: #334155;'>
                <h2>You've been invited to Family Notebook!</h2>
                <p>Someone has invited you to join the workspace <strong>" . esc_html($workspace_name) . "</strong>.</p>
                <p>To accept this invitation, please create a free account by clicking the link below:</p>
                <p><br><a href='" . esc_url($invite_link) . "' style='background:#10b981; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px; display:inline-block;'>Create Account & Join</a><br><br></p>
                <p>Best regards,<br>The Family Notebook Team</p>
            </body>
            </html>
        ";
        wp_mail($email, "Invitation: Join " . $workspace_name, $message);
        remove_filter( 'wp_mail_content_type', function() { return 'text/html'; } );
        
        // Return a special status so the React app knows it was an external invite
        return rest_ensure_response(['success' => true, 'status' => 'invite_sent_to_new_user']);
    }

    // SCENARIO 2: User ALREADY exists (Your original logic)
    $table_members = $wpdb->prefix . 'fn_workspace_members';
    $existing = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $table_members WHERE workspace_id = %d AND user_id = %d", $ws, $u->ID));

    if ($existing == 0) {
        $wpdb->insert($table_members, [
            'workspace_id' => $ws,
            'user_id'      => $u->ID,
            'app_role'     => 'viewer' // Default role
        ]);
        
        $message = "
            <html>
            <body style='font-family: sans-serif; color: #334155;'>
                <h2>You've been added to a new workspace!</h2>
                <p>Hi " . esc_html($u->display_name) . ",</p>
                <p>You have been granted access to the workspace <strong>" . esc_html($workspace_name) . "</strong>.</p>
                <p><br><a href='" . esc_url($login_url) . "' style='background:#0284c7; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px; display:inline-block;'>Access Your Workspace</a><br><br></p>
            </body>
            </html>
        ";
        wp_mail($email, "Update: Access granted to " . $workspace_name, $message);
    }
    remove_filter( 'wp_mail_content_type', function() { return 'text/html'; } );

    return rest_ensure_response(['success' => true, 'status' => 'added_existing_user']);
}

function fn_api_remove_workspace_user($request) {
    global $wpdb;
    $ws = intval($request['id']);
    $rem = intval($request['user_id']);
    $current_user_id = get_current_user_id();

    // Verify the user requesting the deletion is the owner (or the user removing themselves)
    $table_members = $wpdb->prefix . 'fn_workspace_members';
    $role = $wpdb->get_var($wpdb->prepare("SELECT app_role FROM $table_members WHERE workspace_id = %d AND user_id = %d", $ws, $current_user_id));

    if ($role !== 'owner' && $current_user_id !== $rem) {
        return new WP_Error('forbidden', 'Only the workspace owner can remove members.', ['status' => 403]);
    }

    // Delete directly from the custom SQL table
    $wpdb->delete($table_members, ['workspace_id' => $ws, 'user_id' => $rem]);

    return rest_ensure_response(['success' => true]);
}

// 7. Admin Panel
add_action( 'admin_menu', 'fn_register_admin_menu' );
function fn_register_admin_menu() {
    add_menu_page('Family Notebook Settings', 'Family Notebook', 'manage_options', 'family-notebook', 'fn_render_admin_settings', 'dashicons-book', 30);
}
// Register the setting in the database
add_action( 'admin_init', 'fn_register_plugin_settings' );
function fn_register_plugin_settings() {
    register_setting( 'fn_settings_group', 'fn_app_login_url' );
}
function fn_render_admin_settings() {
    // Security check
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>Family Notebook Administration</h1>
        <p>Global settings management for the Family Notebook application.</p>
        
        <form method="post" action="options.php">
            <?php 
                // These functions link the form to the setting we registered above
                settings_fields( 'fn_settings_group' ); 
                do_settings_sections( 'fn_settings_group' ); 
            ?>
            <table class="form-table">
                <tr valign="top">
                    <th scope="row">App Login URL</th>
                    <td>
                        <input 
                            type="url" 
                            name="fn_app_login_url" 
                            value="<?php echo esc_attr( get_option('fn_app_login_url', site_url()) ); ?>" 
                            style="width: 100%; max-width: 400px;" 
                        />
                        <p class="description">The URL where your <code>[family_notebook_app]</code> shortcode is located. This link is sent to users in their invitation emails.</p>
                    </td>
                </tr>
            </table>
            
            <?php submit_button(); ?>
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
// 8. Auth Gate & Shortcode
add_shortcode( 'family_notebook_app', 'fn_render_app_shortcode' );
function fn_render_app_shortcode() {
    if ( ! is_user_logged_in() ) {
        ob_start();
        ?>
        <div style="max-width: 400px; margin: 40px auto; padding: 30px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); font-family: sans-serif;">
            <h2 style="text-align: center; color: #1e293b; margin-top: 0; margin-bottom: 25px;">Family Notebook</h2>
            
            <?php 
            // 1. Explicitly render the Google Login button only once
            if ( shortcode_exists( 'nextend_social_login' ) ) {
                echo '<div style="display: flex; justify-content: center; margin-bottom: 25px;">' . do_shortcode( '[nextend_social_login provider="google"]' ) . '</div>';
                
                // Add a modern visual separator
                echo '<div style="display: flex; align-items: center; text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 20px;">
                        <div style="flex: 1; border-bottom: 1px solid #e2e8f0;"></div>
                        <span style="padding: 0 10px;">or login with email</span>
                        <div style="flex: 1; border-bottom: 1px solid #e2e8f0;"></div>
                      </div>';
            }
            ?>

            <form name="loginform" id="loginform" action="<?php echo esc_url( site_url( 'wp-login.php', 'login_post' ) ); ?>" method="post">
                <p style="margin-bottom: 15px;">
                    <label for="user_login" style="display: block; font-size: 14px; color: #475569; margin-bottom: 5px; font-weight: bold;">Email or Username</label>
                    <input type="text" name="log" id="user_login" value="" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 16px;" required />
                </p>
                <p style="margin-bottom: 20px;">
                    <label for="user_pass" style="display: block; font-size: 14px; color: #475569; margin-bottom: 5px; font-weight: bold;">Password</label>
                    <input type="password" name="pwd" id="user_pass" value="" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 16px;" required />
                </p>
                <p style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <label style="font-size: 14px; color: #475569; cursor: pointer;">
                        <input name="rememberme" type="checkbox" id="rememberme" value="forever" style="margin-right: 5px;" /> Remember Me
                    </label>
                    <a href="<?php echo esc_url( wp_lostpassword_url() ); ?>" style="font-size: 14px; color: #0284c7; text-decoration: none;">Forgot Password?</a>
                </p>
                <p style="margin: 0;">
                    <input type="submit" name="wp-submit" id="wp-submit" value="Log In" style="width: 100%; background-color: #0f172a; color: white; border: none; padding: 12px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 16px;" />
                    <input type="hidden" name="redirect_to" value="<?php echo esc_url( get_permalink() ); ?>" />
                </p>
            </form>
        </div>
        <?php
        return ob_get_clean();
    }
    return '<div id="family-notebook-root">Loading...</div>';
}

register_activation_hook( __FILE__, 'fn_create_custom_tables' );
function fn_create_custom_tables() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE {$wpdb->prefix}fn_workspaces (id bigint(20) NOT NULL AUTO_INCREMENT, workspace_name varchar(255) NOT NULL, theme_color varchar(7) NOT NULL, join_code varchar(12) NOT NULL, created_by bigint(20) NOT NULL, PRIMARY KEY (id))");
    dbDelta("CREATE TABLE {$wpdb->prefix}fn_workspace_members (id bigint(20) NOT NULL AUTO_INCREMENT, workspace_id bigint(20) NOT NULL, user_id bigint(20) NOT NULL, app_role varchar(50) NOT NULL, PRIMARY KEY (id))");
}