/* =============================================================
   site/page-privacy.js: Nysterys Media
   The privacy.html page's own script, extracted from the page itself.

   @security This file exists so
   script-src on privacy.html can drop 'unsafe-inline'. An innerHTML assignment does not
   run a <script> tag but it does run an inline event-handler attribute, and that
   attribute needs exactly 'unsafe-inline', so leaving the directive in place made
   HTML injection here script execution on nysterys.com, the origin whose
   localStorage holds the hub session. The values are escaped as well
   (site/utils.js escapeHtml); this is the second layer, not the first.

   Load order matters and is set by the page: config.js, supabase-data.js,
   icons.js and utils.js all come first, and this runs against their globals.
   ============================================================= */

/* The cross-file globals this page uses, declared the way site/supabase-data.js
   already declares SITE_CONFIG. site/ is five classic <script> tags sharing one
   global scope at runtime and eslint reads one file at a time, so without this the
   `Lint site/` CI step calls every one of them undefined. It did: the step went red
   when these files landed and stayed red for seven pushes. */
/* global initEmail */

    initEmail('.obf-email', false);
