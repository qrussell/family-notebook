# Family Notebook for WordPress

**Family Notebook** is a high-performance, decoupled React Single Page Application (SPA) that transforms your WordPress site into a private, secure, and mobile-first organization hub. Designed specifically for families and small groups, it bridges the gap between complex project management tools and simple note-taking apps.

## 🚀 Features

* **Decoupled SPA Architecture:** Experience lightning-fast, app-like navigation within WordPress.
* **Workspace Management:** Organize data into multiple, isolated workspaces (e.g., "Kitchen Notes," "Kids Schooling," "Financial Planning").
* **Role-Based Access Control:** Secure your data with granular permissions (Owner, Organizer, User, Viewer).
* **Modern Block Editor:** Built-in modular blocks:
* **Rich Text:** Standard note-taking with full formatting.
* **Checklists:** Track shopping lists or task completion.
* **Chore Charts:** Gamified, weekly chore tracking with status management.


* **PWA-Ready:** Installable on mobile devices as a native application for seamless daily access.
* **Template Library:** Export folder structures and note templates to reuse across workspaces or share with other WordPress installations.
* **Data Portability:** Full JSON-based import/export system for complete control over your family data.

## 📱 Mobile-First Experience

Family Notebook is optimized for the modern family on the go. When installed as a Progressive Web App (PWA), it provides an edge-to-edge native interface, stripping away theme headers and footers to ensure the focus remains entirely on your content.

## 🛡️ Security & Integrity

* **IDOR Protection:** Built-in verification (`fn_is_user_authorized_for_workspace`) ensures users only access workspaces they are explicitly members of.
* **Data Serialization Safety:** Uses `wp_slash()` and `wp_json_encode` to prevent WordPress database layer corruption of complex rich-text block data.
* **Responsive Access Control:** The UI contextually hides destructive actions (delete, edit, invite) for users without sufficient permissions.

## 📥 Installation

1. Download the latest release from the [Releases page](https://www.google.com/search?q=https://github.com/qrussell/family-notebook/releases).
2. Upload the `.zip` file via your WordPress Admin (**Plugins > Add New > Upload Plugin**).
3. Activate the plugin.
4. Create a new page and add the shortcode `[family_notebook_app]` to a Code or Text module.

## ⚙️ Configuration

The plugin includes a global administration panel under **Family Notebook > Settings**:

* **App Login URL:** Define the page path where your shortcode is located.
* **Starter Kit Workspace:** Select a master template workspace. New workspaces will automatically clone this kit, making it easy to onboard new family members with pre-populated notes.

## 🛠️ Data Management

* **Backup:** Generate a full JSON backup of all workspaces, notes, and templates directly from the settings panel.
* **Restore:** Import data from other instances and use the "Re-link Members" tool to automatically map imported members to existing site users via their email addresses.

## 💻 Developer & Contributor Guide

* **Stack:** Built with React, WordPress REST API, and native WordPress database tables.
* **Localization:** Fully translatable using `@wordpress/i18n`. To contribute a translation, please use the provided `.pot` file in the `/languages` directory.
* **Building:** Ensure you have Node.js installed, then run:

```bash
npm install
npm run build

```

## 📜 License

This plugin is licensed under the **GPLv2** (or later) license, consistent with WordPress development standards.

---

### Pro-Tips for Divi Users

* **Shortcode Integration:** Use the `[family_notebook_app]` shortcode in any Divi Code Module.
* **Blank Canvas:** For a truly immersive "App" experience, use a Divi Page Template that removes the header/footer, or use CSS to hide the site header when the PWA `display-mode` is `standalone`.

---

*Built by [Cielocloud.org*](https://cielocloud.org)
