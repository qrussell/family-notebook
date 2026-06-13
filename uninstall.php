<?php
/**
 * Fired when the plugin is deleted/uninstalled.
 * This file cleans up all traces of the Family Notebook plugin.
 */

// SECURITY CHECK: If uninstall is not called directly from WordPress, exit immediately.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

global $wpdb;

/**
 * 1. CLEAN UP CUSTOM POST TYPES (Notes & Templates)
 * We use direct SQL queries here instead of wp_delete_post() because a family 
 * notebook could potentially have thousands of notes. Direct SQL prevents the 
 * server from timing out during the uninstallation process.
 */
$post_types = ['fn_note_page', 'fn_template'];

foreach ( $post_types as $post_type ) {
    // A. Delete all post meta associated with these specific post types
    $wpdb->query( 
        $wpdb->prepare(
            "DELETE pm FROM {$wpdb->postmeta} pm 
             INNER JOIN {$wpdb->posts} p ON pm.post_id = p.ID 
             WHERE p.post_type = %s", 
            $post_type 
        ) 
    );

    // B. Delete the actual posts
    $wpdb->query( 
        $wpdb->prepare(
            "DELETE FROM {$wpdb->posts} WHERE post_type = %s", 
            $post_type 
        ) 
    );
}

/**
 * 2. DROP CUSTOM DATABASE TABLES
 * This removes the relational data for Workspaces and Roles
 */
$table_workspaces = $wpdb->prefix . 'fn_workspaces';
$table_members    = $wpdb->prefix . 'fn_workspace_members';

$wpdb->query( "DROP TABLE IF EXISTS {$table_workspaces}" );
$wpdb->query( "DROP TABLE IF EXISTS {$table_members}" );

/**
 * 3. DELETE PLUGIN OPTIONS
 * Removes the settings registered in the WordPress Admin dashboard
 */
delete_option( 'fn_app_login_url' );
delete_option( 'fn_starter_workspace_id' );

// Optional: Clear out any WordPress transients or cache related to your plugin if you add them later
// delete_transient( 'fn_some_cached_data' );