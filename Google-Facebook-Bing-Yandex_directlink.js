// ==UserScript==
// @name         Google, Facebook, Bing & Yandex - Direct Links
// @namespace    https://greasyfork.org/
// @version      4.0
// @description  Remove URL redirects from Google, Facebook, Bing & Yandex. That's a Greasmoney script!
// @author       Marius N. Neamtu
// @match        https://www.google.com/search*
// @match        https://www.google.com/url*
// @match        https://www.facebook.com/*
// @match        https://facebook.com/*
// @match        https://l.facebook.com/*
// @match        https://lm.facebook.com/*
// @match        https://m.facebook.com/*
// @match        https://www.bing.com/search*
// @match        https://www.bing.com/ck/a*
// @match        https://www.bing.com/cr*
// @match        https://yandex.com/search*
// @match        https://www.yandex.com/search*
// @match        https://yandex.com/clck/*
// @match        https://www.yandex.com/clck/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // GOOGLE
    // =========================================================

    function isGoogleRedirect(url) {
        return (
            (url.hostname === 'www.google.com' ||
             url.hostname === 'google.com') &&
            url.pathname === '/url'
        );
    }

    // =========================================================
    // FACEBOOK
    // =========================================================

    function isFacebookRedirect(url) {
        const facebookHosts = [
            'www.facebook.com',
            'facebook.com',
            'l.facebook.com',
            'lm.facebook.com',
            'm.facebook.com'
        ];

        return (
            facebookHosts.includes(url.hostname) &&
            url.pathname === '/l.php'
        );
    }

    // =========================================================
    // BING
    // =========================================================

    function isBingRedirect(url) {
        return (
            (url.hostname === 'www.bing.com' ||
             url.hostname === 'bing.com') &&
            (
                url.pathname === '/ck/a' ||
                url.pathname === '/cr'
            )
        );
    }

    /**
     * Decodează URL-ul Bing:
     *
     * /ck/a?...&u=a1BASE64...
     */
    function decodeBingU(value) {
        if (!value) {
            return null;
        }

        try {
            let encoded = decodeURIComponent(value);

            // Prefix folosit de Bing.
            if (encoded.startsWith('a1')) {
                encoded = encoded.substring(2);
            }

            // Base64 URL-safe -> Base64 standard
            encoded = encoded
                .replace(/-/g, '+')
                .replace(/_/g, '/');

            // Păstrăm numai partea Base64.
            const match = encoded.match(/^[A-Za-z0-9+/]+/);

            if (!match) {
                return null;
            }

            encoded = match[0];

            // Padding Base64.
            while (encoded.length % 4 !== 0) {
                encoded += '=';
            }

            const decoded = atob(encoded);

            if (/^https?:\/\//i.test(decoded)) {
                return decoded;
            }

            return null;
        } catch {
            return null;
        }
    }

    // =========================================================
    // YANDEX
    // =========================================================

    function isYandexRedirect(url) {
        return (
            (
                url.hostname === 'yandex.com' ||
                url.hostname === 'www.yandex.com'
            ) &&
            url.pathname.startsWith('/clck/')
        );
    }

    /**
     * Yandex folosește URL-uri temporare de forma:
     *
     * https://yandex.com/clck/jsredir?...
     *
     * În multe rezultate, URL-ul real este păstrat în
     * href, iar redirecționarea este declanșată separat
     * prin atributul onmousedown.
     */
    function removeYandexRedirectHandler(link) {
        if (!link) {
            return;
        }

        const handler = link.getAttribute('onmousedown');

        if (
            handler &&
            (
                handler.includes('/clck/jsredir') ||
                handler.includes('yandex.com/clck') ||
                handler.includes('yandex.ru/clck')
            )
        ) {
            // Elimină atributul inline.
            link.removeAttribute('onmousedown');

            // Elimină și handlerul DOM, dacă există.
            link.onmousedown = null;

            link.dataset.yandexDirectLink = 'true';
        }
    }

    /**
     * Procesează toate linkurile Yandex care folosesc
     * redirecționare prin onmousedown.
     */
    function processYandexLinks(root = document) {
        if (!root || !root.querySelectorAll) {
            return;
        }

        const links = root.querySelectorAll('a[href]');

        for (const link of links) {
            removeYandexRedirectHandler(link);
        }
    }

    // =========================================================
    // EXTRAGERE LINK DIRECT
    // =========================================================

    function getDirectUrl(href) {
        if (!href) {
            return null;
        }

        let url;

        try {
            url = new URL(href, window.location.href);
        } catch {
            return null;
        }

        // -----------------------------------------------------
        // GOOGLE
        // -----------------------------------------------------

        if (isGoogleRedirect(url)) {
            const target =
                url.searchParams.get('q') ||
                url.searchParams.get('url');

            if (target && /^https?:\/\//i.test(target)) {
                return target;
            }
        }

        // -----------------------------------------------------
        // FACEBOOK
        // -----------------------------------------------------

        if (isFacebookRedirect(url)) {
            const target =
                url.searchParams.get('u') ||
                url.searchParams.get('url');

            if (target && /^https?:\/\//i.test(target)) {
                return target;
            }
        }

        // -----------------------------------------------------
        // BING
        // -----------------------------------------------------

        if (isBingRedirect(url)) {
            const bingU = url.searchParams.get('u');

            if (bingU) {
                const directUrl = decodeBingU(bingU);

                if (directUrl) {
                    return directUrl;
                }
            }

            const bingR = url.searchParams.get('r');

            if (bingR && /^https?:\/\//i.test(bingR)) {
                return bingR;
            }
        }

        // -----------------------------------------------------
        // YANDEX
        // -----------------------------------------------------

        // Dacă href-ul însuși este un redirect Yandex
        // și are un parametru URL explicit.
        if (isYandexRedirect(url)) {
            const target =
                url.searchParams.get('url') ||
                url.searchParams.get('u');

            if (target && /^https?:\/\//i.test(target)) {
                return target;
            }

            // În cazul /clck/jsredir, destinația poate fi
            // semnată/codificată și nu este disponibilă direct
            // într-un parametru URL simplu.
            return null;
        }

        return null;
    }

    // =========================================================
    // PROCESARE LINKURI GOOGLE / FACEBOOK / BING
    // =========================================================

    function processDirectLinks(root = document) {
        if (!root || !root.querySelectorAll) {
            return;
        }

        const links = root.querySelectorAll('a[href]');

        for (const link of links) {
            const directUrl = getDirectUrl(link.href);

            if (!directUrl) {
                continue;
            }

            link.href = directUrl;

            link.removeAttribute('ping');

            link.dataset.directLink = 'true';
        }
    }

    // =========================================================
    // INTERCEPTARE CLICK
    // =========================================================

    document.addEventListener(
        'click',
        function (event) {
            const link = event.target.closest?.('a[href]');

            if (!link) {
                return;
            }

            // Yandex: eliminăm imediat redirectul atașat
            // la evenimentul mousedown.
            removeYandexRedirectHandler(link);

            // Google / Facebook / Bing
            const directUrl = getDirectUrl(link.href);

            if (directUrl) {
                link.href = directUrl;
                link.removeAttribute('ping');
            }
        },
        true
    );

    // =========================================================
    // INTERCEPTARE MOUSEDOWN
    // =========================================================

    document.addEventListener(
        'mousedown',
        function (event) {
            const link = event.target.closest?.('a[href]');

            if (!link) {
                return;
            }

            removeYandexRedirectHandler(link);

            const directUrl = getDirectUrl(link.href);

            if (directUrl) {
                link.href = directUrl;
                link.removeAttribute('ping');
            }
        },
        true
    );

    // =========================================================
    // PROCESARE INIȚIALĂ
    // =========================================================

    function initialize() {
        processDirectLinks(document);
        processYandexLinks(document);

        // =====================================================
        // MONITORIZARE DOM DINAMIC
        // =====================================================

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        continue;
                    }

                    // Nodul este chiar un link.
                    if (node.matches?.('a[href]')) {
                        removeYandexRedirectHandler(node);

                        const directUrl =
                            getDirectUrl(node.href);

                        if (directUrl) {
                            node.href = directUrl;
                            node.removeAttribute('ping');
                            node.dataset.directLink = 'true';
                        }
                    }

                    // Linkuri din interiorul nodului.
                    processDirectLinks(node);
                    processYandexLinks(node);
                }
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    // =========================================================
    // PORNIRE
    // =========================================================

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            initialize
        );
    } else {
        initialize();
    }

})();