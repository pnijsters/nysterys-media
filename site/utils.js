/* =============================================================
   utils.js : Nysterys Media
   Shared utility functions loaded by every page on the site.
   ============================================================= */

/**
 * Email obfuscation: assembles the contact address in JS only
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

/**
 * Shared gender-donut segment colors (orange, light-orange, neutral gray).
 * Index-aligned with the gender data array; the gray third slot reads as
 * "other/unknown". Used by buildDonut + buildGenderLegend.
 * @gotcha The neutral slot is a chart fill, not text, so it is exempt from
 *         the body-text contrast rule.
 */
var GENDER_COLORS = ['#ff5c00', '#ff8c42', '#444444'];

/**
 * Count-up animation for a stat value, easing out over the given duration.
 * Parses a numeric prefix + optional suffix (e.g. "1.6M", "4.2%") and tweens
 * the number while preserving the suffix and the source decimal precision.
 *
 * @param {HTMLElement} el         Element whose textContent is animated.
 * @param {string|number} targetStr  Target value, optionally with a suffix.
 * @param {number} duration        Animation length in milliseconds.
 * @gotcha Non-numeric targets are written verbatim (no animation) rather than
 *         rendering "NaN".
 */
function animateCounter(el, targetStr, duration) {
  var m = String(targetStr).match(/^([\d.]+)([^0-9.]*)$/);
  if (!m) { el.textContent = targetStr; return; }
  var target   = parseFloat(m[1]);
  var suffix   = m[2];
  var decimals = m[1].indexOf('.') >= 0 ? m[1].split('.')[1].length : 0;
  var start    = null;
  function step(ts) {
    if (!start) start = ts;
    var p = Math.min((ts - start) / duration, 1);
    var ease = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * ease).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * Render a percentage donut into an inline SVG using stroke-dasharray arcs.
 * Each data segment becomes one arc, colored from GENDER_COLORS by index.
 *
 * @param {string} svgId  Id of the target <svg> element (viewBox "0 0 36 36").
 * @param {Array<{label:string,value:number}>} data  Segments; value is a percent.
 * @invariant Segment values are percentages that sum to ~100; offsets accumulate
 *            as fractions so the arcs meet without gaps.
 */
function buildDonut(svgId, data) {
  var svg = document.getElementById(svgId);
  if (!svg) return;
  var cx = 18, cy = 18, r = 15.9155;
  var circ = 2 * Math.PI * r;
  svg.innerHTML = '';

  var bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r);
  bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', '#1e1e1e');
  bg.setAttribute('stroke-width', '3.5');
  svg.appendChild(bg);

  var offset = 0;
  data.forEach(function (seg, i) {
    var frac = seg.value / 100;
    var dash = frac * circ;
    var gap  = circ - dash;
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', GENDER_COLORS[i] || '#333');
    c.setAttribute('stroke-width', '3.5');
    c.setAttribute('stroke-dasharray', dash + ' ' + gap);
    c.setAttribute('stroke-dashoffset', -(offset * circ));
    svg.appendChild(c);
    offset += frac;
  });
}

/**
 * Render the labeled legend rows that sit beside/below a gender donut.
 * Dot colors are index-aligned with buildDonut via GENDER_COLORS.
 *
 * @param {string} elId  Id of the container element for the legend rows.
 * @param {Array<{label:string,value:number}>} data  Same segments as the donut.
 */
function buildGenderLegend(elId, data) {
  var el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = data.map(function (seg, i) {
    return '<div class="legend-row">'
      + '<div class="legend-left">'
      +   '<div class="legend-dot" style="background:' + (GENDER_COLORS[i] || '#333') + '"></div>'
      +   '<span class="legend-label">' + seg.label + '</span>'
      + '</div>'
      + '<span class="legend-val">' + seg.value + '%</span>'
      + '</div>';
  }).join('');
}
