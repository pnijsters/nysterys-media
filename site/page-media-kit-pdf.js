/* =============================================================
   site/page-media-kit-pdf.js: Nysterys Media
   The media kit's "Download PDF" button, extracted from the page itself.

   Split from site/page-media-kit.js only because the two together are over the
   500 line gate. This half is self contained: it reads the same globals and
   draws the deck with jsPDF, which the page loads before it.

   @security @see site/page-media-kit.js
   ============================================================= */

/* The cross-file globals this page uses, declared the way site/supabase-data.js
   already declares SITE_CONFIG. site/ is five classic <script> tags sharing one
   global scope at runtime and eslint reads one file at a time, so without this the
   `Lint site/` CI step calls every one of them undefined. It did: the step went red
   when these files landed and stayed red for seven pushes. */
/* global initEmail, loadSiteData */

    function fmtNumPdf(n) {
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (n >= 1000)    return Math.round(n / 1000) + 'K';
      return n.toString();
    }

    function fmtSecPdf(s) {
      var m = Math.floor(s / 60);
      var sec = Math.round(s % 60);
      return m > 0 ? m + 'm ' + sec + 's' : sec + 's';
    }

    function downloadPDF() {
      var btn = document.getElementById('download-btn');
      btn.textContent = 'Generating...';
      btn.disabled = true;
      loadSiteData()
        .then(function(data) { generatePDF(data, btn); })
        .catch(function(err) {
          console.error(err);
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Download PDF';
          btn.disabled = false;
        });
    }

    function generatePDF(data, btn) {
      var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      var W = 210, H = 297, M = 18;
      var y = M;

      // ── Print-friendly colours: white bg, dark text, orange accents ──
      function bg()       { doc.setFillColor(255,255,255); doc.rect(0,0,W,H,'F'); }
      function dark()     { doc.setTextColor(30,30,30); }
      function subtext()  { doc.setTextColor(100,100,100); }
      function orange_t() { doc.setTextColor(255,92,0); }
      function orange_f() { doc.setFillColor(255,92,0); }
      function lightFill(){ doc.setFillColor(245,245,245); }
      function sz(n,bold) { doc.setFontSize(n); doc.setFont('helvetica', bold ? 'bold' : 'normal'); }
      function divL(yy)   { orange_f(); doc.rect(M, yy, W-M*2, 0.4, 'F'); }
      function pageFooter() {
        orange_f(); doc.rect(0, H - 8, W, 8, 'F');
        doc.setTextColor(255,255,255); sz(6);
        doc.text('NYSTERYS MEDIA LLC · CONFIDENTIAL', M + 4, H - 3);
        doc.text('nysterys.com', W - M - doc.getTextWidth('nysterys.com'), H - 3);
      }
      function newPage() {
        doc.addPage(); bg();
        orange_f(); doc.rect(0, 0, 4, H, 'F');
        orange_f(); doc.rect(0, 0, W, 8, 'F');
        doc.setTextColor(255,255,255); sz(7);
        doc.text('NYSTERYS MEDIA LLC · CONFIDENTIAL', M + 4, 5.5);
        doc.text('nysterys.com', W - M - doc.getTextWidth('nysterys.com'), 5.5);
        y = 22;
      }

      // ── Cover ─────────────────────────────────────────────
      bg();
      // Left orange stripe + top bar with confidential label
      orange_f(); doc.rect(0, 0, 4, H, 'F');
      orange_f(); doc.rect(0, 0, W, 8, 'F');
      doc.setTextColor(255,255,255); sz(7);
      doc.text('NYSTERYS MEDIA LLC · CONFIDENTIAL', M + 4, 5.5);
      doc.text('nysterys.com', W - M - doc.getTextWidth('nysterys.com'), 5.5);

      y = 40;
      orange_t(); sz(52, true); doc.text('MEDIA', M + 4, y);
      y += 30;
      dark(); sz(52, true); doc.text('KIT', M + 4, y);

      y += 14; divL(y); y += 10;

      subtext(); sz(10); doc.setFont('helvetica','italic');
      doc.text('Private management for creators who move culture.', M + 4, y);
      y += 7;
      sz(8); doc.setFont('helvetica','normal');
      doc.text('Audience data, creator profiles, and partnership categories for brand collaboration inquiries.', M + 4, y);

      // Cover stats
      var ovStats = data.mediaKit.rosterOverview;
      var stW = (W - M * 2 - 4) / ovStats.length;
      y = H - 70;
      lightFill(); doc.rect(M + 4, y - 5, W - M * 2 - 4, 42, 'F');
      ovStats.forEach(function(s, i) {
        var x = M + 4 + i * stW;
        orange_f(); doc.rect(x, y - 5, 2, 42, 'F');
        orange_t(); sz(18, true); doc.text(s.value, x + 6, y + 8);
        subtext(); sz(6, false); doc.text(s.label.toUpperCase(), x + 6, y + 14);
      });
      pageFooter();

      // ── Creator pages ──────────────────────────────────────
      var ordered = data.roster.slice().sort(function(a, b) {
        return b.tiktokStats.followers - a.tiktokStats.followers;
      });

      ordered.forEach(function(creator) {
        var s = creator.tiktokStats;
        newPage();

        orange_t(); sz(7); doc.text('CREATOR PROFILE', M, y);
        y += 10;

        dark(); sz(36, true); doc.text(creator.name.toUpperCase(), M, y);
        var nameW = doc.getTextWidth(creator.name.toUpperCase());
        orange_t(); sz(13, false); doc.text(' @' + creator.tiktokHandle, M + nameW, y);

        y += 5;
        subtext(); sz(7); doc.text('Content Creator · TikTok, Instagram, YouTube', M, y);
        y += 7; divL(y); y += 9;

        // Key metrics
        var metrics = [
          { val: creator.followers,                lbl: 'Followers' },
          { val: creator.likes,                    lbl: 'Total Likes' },
          { val: creator.engagementRate,           lbl: 'Eng. Rate' },
          { val: fmtNumPdf(s.avgViewsPerVideo),    lbl: 'Avg Views' },
          { val: fmtNumPdf(s.medianViewsPerVideo), lbl: 'Median Views' }
        ];
        var mW = (W - M * 2) / metrics.length;
        metrics.forEach(function(m, i) {
          var x = M + i * mW;
          orange_f(); doc.rect(x, y - 1, mW - 3, 0.3, 'F');
          orange_t(); sz(13, true); doc.text(String(m.val), x, y + 8);
          subtext(); sz(5.5, false); doc.text(m.lbl.toUpperCase(), x, y + 13);
        });
        y += 22;

        // Extra stats
        var extras = [
          { val: fmtNumPdf(s.allTimeViews),   lbl: 'All-Time Views' },
          { val: String(s.totalVideos),        lbl: 'Total Videos' },
          { val: fmtSecPdf(s.avgWatchTimeSec), lbl: 'Avg Watch Time' }
        ];
        var eW = (W - M * 2) / extras.length;
        extras.forEach(function(e, i) {
          var x = M + i * eW;
          lightFill(); doc.rect(x, y, eW - 2, 11, 'F');
          dark(); sz(10, true); doc.text(e.val, x + 3, y + 7);
          subtext(); sz(5, false); doc.text(e.lbl.toUpperCase(), x + 3, y + 11);
        });
        y += 16;

        // Bio
        dark(); sz(8, false);
        var bioLines = doc.splitTextToSize(creator.bio, W - M * 2);
        doc.text(bioLines, M, y);
        y += bioLines.length * 4.5 + 6;

        // Content categories: filled orange tags with white text
        orange_t(); sz(6); doc.text('CONTENT CATEGORIES', M, y);
        y += 5;
        var cx = M;
        creator.contentCategories.forEach(function(cat) {
          var tw = doc.getTextWidth(cat.toUpperCase()) + 6;
          if (cx + tw > W - M) { cx = M; y += 7; }
          orange_f(); doc.rect(cx, y - 4, tw, 5.5, 'F');
          doc.setTextColor(255,255,255); sz(6);
          doc.text(cat.toUpperCase(), cx + 3, y + 0.5);
          cx += tw + 3;
        });
        y += 12;

        divL(y); y += 7;
        orange_t(); sz(6.5); doc.text('AUDIENCE INSIGHTS', M, y);
        y += 9;

        // Two columns: gender | countries. An age column sat between them until
        // its numbers proved to be hand-typed and identical for both creators.
        var colW3 = (W - M * 2 - 6) / 2;
        var c1 = M, c3 = M + colW3 + 6;
        var rowY = y;

        // Gender
        subtext(); sz(5.5); doc.text('GENDER SPLIT', c1, rowY);
        var gy = rowY + 7;
        var gColors = [[255,92,0],[255,140,66],[180,180,180]];
        creator.audience.gender.forEach(function(seg, i) {
          var rgb = gColors[i] || [180,180,180];
          doc.setFillColor(rgb[0],rgb[1],rgb[2]);
          doc.circle(c1 + 2, gy - 1, 1.5, 'F');
          subtext(); sz(6.5); doc.text(seg.label, c1 + 6, gy);
          orange_t(); sz(8, true);
          doc.text(seg.value + '%', c1 + colW3 - doc.getTextWidth(seg.value + '%'), gy);
          doc.setFont('helvetica','normal');
          gy += 7;
        });

        // Countries
        subtext(); sz(5.5); doc.text('TOP COUNTRIES', c3, rowY);
        var cy3 = rowY + 7;
        // Same empty-feed guard as the on-screen charts: a gap in the country
        // feed must not abort PDF generation half way down the page.
        var countries = creator.audience.topCountries || [];
        var maxCo = countries.length ? countries[0].value : 1;
        countries.forEach(function(country) {
          subtext(); sz(6.5); doc.text(country.label, c3, cy3);
          orange_t(); doc.text(country.value + '%', c3 + colW3 - doc.getTextWidth(country.value + '%'), cy3);
          doc.setFillColor(220,220,220); doc.rect(c3, cy3 + 1, colW3, 2, 'F');
          orange_f(); doc.rect(c3, cy3 + 1, colW3 * (country.value / maxCo), 2, 'F');
          cy3 += 7;
        });

        pageFooter();
      });

      // ── Brand categories page ──────────────────────────────
      newPage();
      orange_t(); sz(7); doc.text('PARTNERSHIP FIT', M, y);
      y += 10;
      dark(); sz(28, true); doc.text('BRAND COLLABORATION', M, y);
      y += 12; doc.text('CATEGORIES', M, y);
      y += 8; divL(y); y += 12;

      var cats = data.mediaKit.brandCategories;
      var catCols = 3;
      var catColW = (W - M * 2 - 8) / catCols;
      cats.forEach(function(cat, i) {
        var cx2 = M + (i % catCols) * (catColW + 4);
        var cy4 = y + Math.floor(i / catCols) * 16;
        lightFill(); doc.rect(cx2, cy4 - 5, catColW, 12, 'F');
        doc.setDrawColor(210,210,210); doc.setLineWidth(0.2); doc.rect(cx2, cy4 - 5, catColW, 12);
        orange_f(); doc.rect(cx2, cy4 - 5, 2, 12, 'F');
        subtext(); sz(7.5, false); doc.text(cat.toUpperCase(), cx2 + 6, cy4 + 2);
      });

      y += Math.ceil(cats.length / catCols) * 16 + 16;

      // Contact block
      lightFill(); doc.rect(M, y, W - M * 2, 42, 'F');
      orange_f(); doc.rect(M, y, 2, 42, 'F');
      orange_t(); sz(7); doc.text('GET IN TOUCH', M + 8, y + 10);
      dark(); sz(14, true); doc.text('Ready to Collaborate?', M + 8, y + 20);
      subtext(); sz(8, false); doc.text('inquiries@nysterys.com', M + 8, y + 30);
      orange_t(); doc.text('nysterys.com', W - M - doc.getTextWidth('nysterys.com'), y + 30);
      pageFooter();

      doc.save('Nysterys-Media-Kit-2026.pdf');

      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Download PDF';
      btn.disabled = false;
    }

    initEmail('#mk-email-link');
