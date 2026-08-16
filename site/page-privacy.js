/* =============================================================
   site/page-privacy.js : Nysterys Media
   The privacy.html page's own script, extracted from the page itself.

   @security security/11-plan.md T2-13, from 05 F-15. This file exists so
   script-src on privacy.html can drop 'unsafe-inline'. An innerHTML assignment does not
   run a <script> tag but it does run an inline event-handler attribute, and that
   attribute needs exactly 'unsafe-inline', so leaving the directive in place made
   HTML injection here script execution on nysterys.com, the origin whose
   localStorage holds the hub session. The values are escaped as well
   (site/utils.js escapeHtml); this is the second layer, not the first.

   Load order matters and is set by the page: config.js, supabase-data.js,
   icons.js and utils.js all come first, and this runs against their globals.
   ============================================================= */

    initEmail('.obf-email', false);
