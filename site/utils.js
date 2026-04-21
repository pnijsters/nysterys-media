/* =============================================================
   utils.js — Nysterys Media
   Shared utility functions loaded by every page on the site.
   ============================================================= */

/**
 * Email obfuscation — assembles the contact address in JS only
 * so it is never present in static HTML source where crawlers
 * and Cloudflare email-rewrite rules could intercept it.
 *
 * @param {string} selector  CSS selector for the element(s) to populate.
 *                           Supports both IDs ('#my-link') and class
 *                           selectors ('.obf-email').
 * @param {boolean} [withArrow=true]  Append a right-arrow SVG icon after
 *                           the email text (set false for plain text links).
 */
function initEmail(selector, withArrow) {
  var parts = ['inquiries', '@', 'nysterys', '.', 'com'];
  var email = parts.join('');
  var arrowSvg = withArrow === false ? '' :
    ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"' +
    ' width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  document.querySelectorAll(selector).forEach(function (el) {
    el.href = 'mailto:' + email;
    if (el.tagName === 'A' && arrowSvg) {
      el.innerHTML = email + arrowSvg;
    } else {
      el.textContent = email;
    }
  });
}
