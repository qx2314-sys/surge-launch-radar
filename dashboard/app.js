// Surge Launch Radar dashboard. Reads window.RADAR (written by main.ts as data.js).
// Views: board (with a "Newest & fastest" strip), live tokens, model. Hash routes:
//   #detail=<slug>  opens a protocol's detail view
//   #category=<name>  filters the board to one category
(function () {
  var R = window.RADAR;
  var app = document.getElementById('app');
  var meta = document.getElementById('meta');
  var state = { view: 'board', q: '', cat: '', chain: '', minTvl: 0, wl: false, sort: 'implied_value_usd', dir: -1, detail: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function pctCls(n) {
    if (n == null) return 'flat';
    return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  }
  function ageLabel(d) {
    if (d == null) return 'unknown';
    if (d === 0) return 'today';
    if (d === 1) return '1 day';
    return d + ' days';
  }
  function basisLabel(b) {
    return b === 'recent' ? 'recent launches' : b === 'category' ? 'category median' : 'global median';
  }

  meta.textContent =
    'Snapshot ' + R.as_of + ' · ' + R.board_size + ' pre-token protocols ranked (' + R.watchlist_size +
    ' watchlist + ' + R.early_size + ' early) · ' + R.live_size + ' live-token comparables · model ' + R.model_version;

  function parseHash() {
    var h = location.hash.slice(1);
    var parts = h.split('&');
    state.detail = null;
    parts.forEach(function (p) {
      var kv = p.split('=');
      var k = kv[0];
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'detail' && v) { state.detail = v; state.view = 'board'; }
      if (k === 'category' && v) { state.cat = v; state.view = 'board'; }
    });
  }

  function setTab() {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === state.view && !state.detail);
    });
  }

  function filteredRows() {
    var q = state.q.toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var av = a[key] == null ? -Infinity : a[key];
      var bv = b[key] == null ? -Infinity : b[key];
      if (typeof av === 'string') return state.dir * (av < bv ? -1 : av > bv ? 1 : 0);
      return state.dir * (av - bv);
    });
    return rows;
  }

  function stripHtml() {
    var newest = R.rows.filter(function (r) { return r.age_days != null; })
      .sort(function (a, b) { return a.age_days - b.age_days; }).slice(0, 5);
    var fastest = R.rows.filter(function (r) { return r.change_7d != null; })
      .sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 5);
    function li(r, tag) {
      return '<li><a href="#detail=' + esc(r.slug) + '">' + esc(r.name) + '</a><span>' + tag + '</span></li>';
    }
    return '<div class="strip">' +
      '<div class="card"><h2>Newest listings</h2><ul>' +
      newest.map(function (r) { return li(r, '<span class="pill new">' + ageLabel(r.age_days) + '</span>'); }).join('') +
      '</ul></div>' +
      '<div class="card"><h2>Fastest movers this week</h2><ul>' +
      fastest.map(function (r) { return li(r, '<span class="pill hot">' + pct(r.change_7d) + '</span>'); }).join('') +
      '</ul></div></div>';
  }

  function boardHtml() {
    var cats = [];
    var chains = [];
    R.rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort();
    chains.sort();
    var rows = filteredRows();
    var opts = function (list, cur, all) {
      return '<option value="">' + all + '</option>' + list.map(function (v) {
        return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
    };
    var head = '<tr>' +
      '<th data-k="rank">Rank</th><th data-k="name">Protocol</th><th data-k="category">Category</th>' +
      '<th data-k="tvl_usd" class="num">TVL</th><th data-k="change_7d" class="num">7d change</th>' +
      '<th data-k="age_days" class="num">Age</th><th data-k="implied_value_usd" class="num">Implied value</th></tr>';
    var body = rows.map(function (r) {
      return '<tr><td>' + r.rank + '</td>' +
        '<td><a href="#detail=' + esc(r.slug) + '">' + esc(r.name) + '</a>' + (r.watchlist ? ' <span class="badge">W</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctCls(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageLabel(r.age_days) + '</td>' +
        '<td class="num"><b>' + usd(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
    return stripHtml() +
      '<div class="filters">' +
      '<input id="f-q" type="search" placeholder="Search name or slug" value="' + esc(state.q) + '">' +
      '<select id="f-cat">' + opts(cats, state.cat, 'All categories') + '</select>' +
      '<select id="f-chain">' + opts(chains, state.chain, 'All chains') + '</select>' +
      '<select id="f-tvl">' +
      '<option value="0"' + (state.minTvl === 0 ? ' selected' : '') + '>Any TVL</option>' +
      '<option value="100000000"' + (state.minTvl === 100000000 ? ' selected' : '') + '>&ge; $100M TVL</option>' +
      '<option value="1000000000"' + (state.minTvl === 1000000000 ? ' selected' : '') + '>&ge; $1B TVL</option></select>' +
      '<label><input id="f-wl" type="checkbox"' + (state.wl ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count">' + rows.length + ' of ' + R.rows.length + ' rows</span></div>' +
      '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function detailHtml(slug) {
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return '<p class="note">No protocol with slug ' + esc(slug) + ' on this board.</p>';
    var comps = R.live.filter(function (l) { return l.category === r.category; }).slice(0, 5);
    var mult = r.category_multiple;
    var basisNote = r.multiple_basis === 'recent' ? ', ' + r.recent_comps + ' recent launches'
      : r.multiple_basis === 'category' ? ', ' + r.category_comps + ' comps' : '';
    var eq = usd(r.tvl_usd) + ' TVL &times; ' + mult.toFixed(4) + ' multiple (' + basisLabel(r.multiple_basis) +
      basisNote +
      ') &times; ' + r.growth_multiplier.toFixed(2) + ' growth (' + pct(r.change_7d) + ' in 7d, counted at 1.5&times;)' +
      ' &times; ' + r.recency_multiplier.toFixed(2) + ' recency (' + ageLabel(r.age_days) + ' old)' +
      ' &times; ' + r.chain_multiplier.toFixed(2) + ' chains (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')' +
      ' = <b>' + usd(r.implied_value_usd) + '</b>';
    return '<button class="back" id="back">&larr; Back to board</button>' +
      '<div class="detail"><h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">Rank #' + r.rank + ' &middot; ' + esc(r.category || 'no category') + ' &middot; listed ' +
      esc(r.listed_at || 'unknown') + ' &middot; ' + esc(r.chains.join(', ') || 'no chains') +
      (r.watchlist ? ' &middot; <span class="badge">WATCHLIST</span>' : '') + '</p>' +
      '<div class="kv">' +
      '<div><span>Implied value</span><strong>' + usd(r.implied_value_usd) + '</strong></div>' +
      '<div><span>TVL</span><strong>' + usd(r.tvl_usd) + '</strong></div>' +
      '<div><span>7d change</span><strong class="' + pctCls(r.change_7d) + '">' + pct(r.change_7d) + '</strong></div>' +
      '<div><span>Age</span><strong>' + ageLabel(r.age_days) + '</strong></div></div>' +
      '<h3>Surge breakdown</h3><div class="eq">' + eq + '</div>' +
      '<p class="note">The multiple comes from ' + basisLabel(r.multiple_basis) + ': recent launches price the ' +
      'category, not old ones. The recency factor is 1.00 on listing day and slides to 0.60 by day 720, so ' +
      'the newest protocols rank highest. Growth is amplified 1.5&times; because a hot week is the surge itself.</p>' +
      '<h3>Live comparables in ' + esc(r.category || 'this category') + '</h3>' +
      (comps.length ? '<ul class="steps">' + comps.map(function (l) {
        return '<li>' + esc(l.name) + ' — market cap ' + usd(l.mcap_usd) + ' on TVL ' + usd(l.tvl_usd) +
          ' (multiple ' + (l.multiple == null ? '—' : l.multiple.toFixed(2)) + ')' + (l.recent ? ' <span class="pill new">recent launch</span>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="note">No live-token protocol in the top 24 sits in this category.</p>') +
      '<h3>Farm plan — move fast, stay safe</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
  }

  function liveHtml() {
    return '<div class="cards">' + R.live.map(function (l) {
      return '<div class="lcard"><h3>' + esc(l.name) + '</h3>' +
        '<p>' + esc(l.category || '—') + ' &middot; ' + esc(l.chains.join(', ') || '—') + '</p>' +
        '<p>Market cap <b>' + usd(l.mcap_usd) + '</b> &middot; TVL ' + usd(l.tvl_usd) + '</p>' +
        '<p>Multiple <b>' + (l.multiple == null ? '—' : l.multiple.toFixed(2)) + '</b> &middot; 7d <span class="' +
        pctCls(l.change_7d) + '">' + pct(l.change_7d) + '</span></p>' +
        (l.recent ? '<span class="pill new">launched within 2 years</span>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function modelHtml() {
    var m = R.model;
    var rows = R.categories.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.recent_comps + '</td><td class="num">' + c.category_comps +
        '</td><td class="num">' + (c.recent_median == null ? '—' : c.recent_median.toFixed(4)) +
        '</td><td class="num">' + (c.category_median == null ? '—' : c.category_median.toFixed(4)) +
        '</td><td class="num"><b>' + c.used_multiple.toFixed(4) + '</b></td><td>' + basisLabel(c.basis) + '</td></tr>';
    }).join('');
    return '<div class="detail"><h2>How the surge model works</h2>' +
      '<p class="note">Implied value = TVL &times; multiple &times; growth &times; recency &times; chains. ' +
      'The multiple is the median market-cap-to-TVL of the live-token protocols in the same category that ' +
      'launched within the last ' + m.recent_days + ' days (at least ' + m.recent_min_comps + ' of them); ' +
      'otherwise the category median, otherwise the global median (' + R.global_multiple.toFixed(4) + '). ' +
      'Clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. Growth is the 7-day TVL change clamped to [' +
      m.growth_floor + '%, +' + m.growth_cap + '%] and counted at weight ' + m.growth_weight + ' — a hot week counts extra. ' +
      'Recency is 1.00 on listing day and slides to ' + m.recency_floor + ' by day ' + m.recency_days +
      ', so the newest protocols rank highest — the opposite of rewarding age. ' +
      'Chains add ' + (m.chain_bonus * 100) + '% per extra chain, up to ' + m.chain_bonus_cap + '.</p>' +
      '<pre>implied = max(1, round(tvl * multiple * growth * recency * chains))\n' +
      'growth   = 1 + clamp(change_7d, ' + m.growth_floor + ', +' + m.growth_cap + ') / 100 * ' + m.growth_weight + '\n' +
      'recency  = 1 - (1 - ' + m.recency_floor + ') * min(age, ' + m.recency_days + ') / ' + m.recency_days + '\n' +
      'chains   = 1 + ' + m.chain_bonus + ' * min(chains - 1, ' + m.chain_bonus_cap + ')</pre>' +
      '<h3>Category multiples</h3><table><thead><tr><th>Category</th><th class="num">Recent comps</th>' +
      '<th class="num">All comps</th><th class="num">Recent median</th><th class="num">Category median</th>' +
      '<th class="num">Used</th><th>Basis</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function render() {
    setTab();
    if (state.detail) {
      app.innerHTML = detailHtml(state.detail);
      var back = document.getElementById('back');
      if (back) back.addEventListener('click', function () { location.hash = ''; });
      return;
    }
    if (state.view === 'live') { app.innerHTML = liveHtml(); return; }
    if (state.view === 'model') { app.innerHTML = modelHtml(); return; }
    app.innerHTML = boardHtml();
    document.querySelectorAll('th[data-k]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = -1; }
        render();
      });
    });
    var q = document.getElementById('f-q');
    if (q) q.addEventListener('input', function () { state.q = q.value; render(); });
    var cat = document.getElementById('f-cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; render(); });
    var ch = document.getElementById('f-chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; render(); });
    var tvl = document.getElementById('f-tvl');
    if (tvl) tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value); render(); });
    var wl = document.getElementById('f-wl');
    if (wl) wl.addEventListener('change', function () { state.wl = wl.checked; render(); });
  }

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.view = b.getAttribute('data-view');
      state.detail = null;
      if (location.hash) history.replaceState(null, '', location.pathname);
      render();
    });
  });
  window.addEventListener('hashchange', function () { parseHash(); render(); });
  parseHash();
  render();
})();
