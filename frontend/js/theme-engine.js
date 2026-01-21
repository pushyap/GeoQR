/**
 * GeoQR Theme Engine
 * Manages theme switching, persistence, and system preference detection
 */

(function() {
    'use strict';

    const THEME_KEY = 'geoqr-theme';
    const THEMES = {
        DARK_PRO: 'dark-pro',
        SOFT_LIGHT_PRO: 'soft-light-pro'
    };

    /**
     * Get the current theme from localStorage or system preference
     * @returns {string} Theme name
     */
    function getStoredTheme() {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored && Object.values(THEMES).includes(stored)) {
            return stored;
        }
        // Check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return THEMES.SOFT_LIGHT_PRO;
        }
        return THEMES.DARK_PRO;
    }

    /**
     * Apply a theme to the document
     * @param {string} themeName - Theme to apply
     * @param {boolean} animate - Whether to animate the transition
     */
    function applyTheme(themeName, animate = true) {
        const html = document.documentElement;
        
        if (animate) {
            html.classList.add('theme-transitioning');
        }
        
        html.setAttribute('data-theme', themeName);
        localStorage.setItem(THEME_KEY, themeName);
        
        // Update meta theme-color for mobile browsers
        updateMetaThemeColor(themeName);
        
        if (animate) {
            setTimeout(() => {
                html.classList.remove('theme-transitioning');
            }, 300);
        }
        
        // Dispatch custom event for other scripts to listen to
        window.dispatchEvent(new CustomEvent('themechange', { 
            detail: { theme: themeName } 
        }));
    }

    /**
     * Update the meta theme-color for mobile browser chrome
     * @param {string} themeName - Current theme
     */
    function updateMetaThemeColor(themeName) {
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.name = 'theme-color';
            document.head.appendChild(metaThemeColor);
        }
        
        metaThemeColor.content = themeName === THEMES.SOFT_LIGHT_PRO 
            ? '#f1f5fb' 
            : '#020617';
    }

    /**
     * Toggle between themes
     */
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || THEMES.DARK_PRO;
        const newTheme = currentTheme === THEMES.DARK_PRO 
            ? THEMES.SOFT_LIGHT_PRO 
            : THEMES.DARK_PRO;
        applyTheme(newTheme);
    }

    /**
     * Set a specific theme
     * @param {string} themeName - Theme to set
     */
    function setTheme(themeName) {
        if (Object.values(THEMES).includes(themeName)) {
            applyTheme(themeName);
        } else {
            console.warn(`Invalid theme: ${themeName}. Valid themes: ${Object.values(THEMES).join(', ')}`);
        }
    }

    /**
     * Get current theme name
     * @returns {string} Current theme name
     */
    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || THEMES.DARK_PRO;
    }

    /**
     * Initialize the theme system
     */
    function initTheme() {
        // Apply stored theme immediately (no animation on initial load)
        const theme = getStoredTheme();
        applyTheme(theme, false);
        
        // Listen for system preference changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
                // Only auto-switch if user hasn't manually selected a theme
                if (!localStorage.getItem(THEME_KEY)) {
                    applyTheme(e.matches ? THEMES.SOFT_LIGHT_PRO : THEMES.DARK_PRO);
                }
            });
        }
    }

    // Initialize on DOM ready or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }

    // Expose API to global scope
    window.GeoQRTheme = {
        toggle: toggleTheme,
        set: setTheme,
        get: getCurrentTheme,
        THEMES: THEMES
    };

    // Convenience function for toggle buttons
    window.toggleTheme = toggleTheme;

})();
