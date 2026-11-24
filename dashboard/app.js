// Token Radar — renders the ranked board, a filterable table, a per-protocol
// detail dialog with the model's own breakdown, and the live-token view.
//
// The page reads window.RADAR (data.js, written by main.ts from the same
// board) and recomputes each row's implied value from the model constants,
// so the number on screen is the number board.json carries. The farm plan
// is generated here from the same rules as lib/model.ts, so the steps in the
// detail view are the steps board.json carries for that row.
//
// No network: the page reads only data.js, and every link it shows is a
// fragment of this page. State lives in the URL hash, so a view can be
// linked: #detail=<slug>, #q=<text>, #category=<name>, #chain=<name>,
// #tab=pre-token|live.

(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA || !Array.isArray(DATA.rows)) {
    document.getElementById('board').textContent = 'Token Radar: no data. The program writes data.js beside this page.';
    return;
  }

  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  // ---------------------------------------------------------------- formatting

  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return '$' + String(Math.round(n));
  }

  function fmtUsdFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return s;
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    var y = Math.floor(days / 365);
    var m = Math.round((days % 365) / 30);
    return y + 'y' + (m > 0 ? ' ' + m + 'mo' : '');
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------- the model, recomputed in the page

  function clampGrowth(raw) {
    var g = raw === null || raw === undefined || !isFinite(raw) ? 0 : raw;
    return Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, g));
  }

  function impliedOf(row) {
    var m = DATA.model;
    var growthPct = clampGrowth(row.change_7d);
    var growthMult = 1 + (growthPct / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturityMult = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturityMult));
  }

  // ---------------------------------------------------------------- the farm plan, from the same rules as lib/model.ts

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }

  function capitalFor(p) {
    if (p.tvl_usd >= 5000000000) return 250;
    if (p.tvl_usd >= 1000000000) return 150;
    if (p.tvl_usd >= 100000000) return 100;
    return 50;
  }

  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }

  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(20, Math.round(capital / 2));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + small + ' against the supply on ' + name + ', then repay it, so the position shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Swap $' + small + ' through ' + name + '\'s own router on ' + chain + ' so the wallet shows trading activity too.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the hedge and open one more small position, so the wallet shows repeated use rather than a single trade.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0) return 'Deposit $' + small + ' into a second ' + name + ' vault on ' + chain + ' so the wallet holds more than one position.';
    if (c.indexOf('rwa') >= 0) return 'Hold the yield asset for a full distribution cycle and claim the yield it pays.';
    return 'Use ' + name + ' a second way — a swap, a vote or a second deposit of $' + small + ' — so the wallet shows repeated use.';
  }

  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + Math.max(20, Math.round(capital / 2)) + ' of capital and $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ];
    return steps.map(function (s) {
      var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (t.length > 600) t = t.slice(0, 596) + '...';
      return t;
    });
  }

  // ---------------------------------------------------------------- DOM helpers

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'class') node.className = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] === null || attrs[k] === undefined) { /* skip */ }
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
        else node.appendChild(c);
      });
    }
    return node;
  }

  // ---------------------------------------------------------------- state and routing

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    var out = {};
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    if (out.q !== undefined) state.q = out.q;
    if (out.category !== undefined) state.category = out.category;
    if (out.chain !== undefined) state.chain = out.chain;
    if (out.tab !== undefined) state.tab = out.tab;
    if (out.detail) state.selected = out.detail;
  }

  function writeHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('category=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.tab !== 'pre-token') parts.push('tab=' + encodeURIComponent(state.tab));
    if (state.selected) parts.push('detail=' + encodeURIComponent(state.selected));
    var h = parts.join('&');
    var next = h ? '#' + h : '#';
    if (window.location.hash !== next) history.replaceState(null, '', next);
  }

  // ---------------------------------------------------------------- filtering and sorting

  function isWatchlist(row) {
    return DATA.watchlist.indexOf(row.slug) >= 0;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function sortedRows(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -1e9 : a.change_7d; bv = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  // ---------------------------------------------------------------- rendering

  var topImplied = DATA.rows.length > 0 ? DATA.rows[0].implied_value_usd : 1;

  function header() {
    var watch = DATA.watchlist_size;
    return el('header', { class: 'top' }, [
      el('div', { class: 'brand' }, [
        el('div', { class: 'mark', text: '◉' }),
        el('div', {}, [
          el('div', { class: 'brand-name', html: 'Token <span>Radar</span>' }),
          el('div', { class: 'sub', text: 'Pre-token protocols, ranked by what their token could be worth' }),
        ]),
      ]),
      el('div', { class: 'top-meta', html: 'Snapshot as of <strong>' + esc(DATA.as_of) + '</strong> · DefiLlama<br>Model <strong>' + esc(DATA.model_version) + '</strong> · ' + esc(DATA.source.split(',')[0]) }),
    ]);
  }

  function lede() {
    return el('p', { class: 'lede', html: 'The board ranks <strong>' + DATA.board_size + ' protocols that record no token</strong>, by an implied value worked out from the snapshot itself: each protocol\'s TVL, times the market-cap-to-TVL ratio that live-token protocols in its category actually trade at, adjusted for seven-day growth and for how long it has run with no token. Every one of the <strong>' + DATA.watchlist_size + ' watchlist protocols</strong> is on the board, plus ' + DATA.early_size + ' more below the $50M floor. Wrapped, staked and bridged products are left out: their token already trades.' });
  }

  function stats() {
    var totalImplied = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    var items = [
      [fmtUsd(totalImplied), 'combined implied value'],
      [String(DATA.board_size), 'protocols ranked'],
      [String(DATA.watchlist_size), 'on the watchlist'],
      [String(DATA.early_size), 'early, below the floor'],
      [String(DATA.live_size), 'live tokens set aside'],
    ];
    return el('div', { class: 'stats' }, items.map(function (it, i) {
      return el('div', { class: 'stat' }, [
        el('div', { class: 'num' + (i === 0 ? ' green' : ''), text: it[0] }),
        el('div', { class: 'label', text: it[1] }),
      ]);
    }));
  }

  function modelPanel() {
    var m = DATA.model;
    var cats = Object.keys(m.category_multiples).sort();
    var catText = cats.slice(0, 8).map(function (c) { return c + ' ' + m.category_multiples[c].toFixed(3); }).join(' · ');
    return el('section', { class: 'panel', 'aria-label': 'How the value is worked out' }, [
      el('h2', { text: 'How the value is worked out' }),
      el('div', { class: 'equation', text: 'implied = TVL × category multiple × growth × maturity' }),
      el('p', { html: 'The <strong>category multiple</strong> is the median market-cap-to-TVL ratio of the live-token protocols in that category, taken from this same snapshot — ' + esc(catText) + (cats.length > 8 ? ' · and ' + (cats.length - 8) + ' more' : '') + '. A category with fewer than ' + m.min_comparables + ' live comparables uses the whole market\'s median, ' + m.overall_multiple.toFixed(3) + '. Every multiple is clamped to ' + m.multiple_floor + '–' + m.multiple_cap + '.' }),
      el('p', { html: '<strong>Growth</strong> is the protocol\'s seven-day TVL change, clamped to ' + m.growth_floor + '%–' + m.growth_cap + '%, worth half its weight: growth × ' + m.growth_weight + '. <strong>Maturity</strong> runs from ' + m.maturity_floor + ' for a protocol tracked less than a month to ' + (m.maturity_floor + m.maturity_range) + ' after ' + m.maturity_days + ' days with no token; a protocol with no listing date is scored as ' + m.unknown_age_days + ' days old.' }),
      el('p', { text: 'One function scores every protocol. No name is special-cased, and no row is hand-picked. The implied value is this entry\'s own estimate, never a price, and a protocol that records no token may still have one its DefiLlama record does not carry.' }),
    ]);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search a protocol…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' }, [
      el('option', { value: 'all', text: 'All categories' }),
    ].concat(categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' }, [
      el('option', { value: 'all', text: 'All chains' }),
    ].concat(chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', class: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', class: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' }, [
      el('div', { class: 'field' }, [el('label', { text: 'Search' }), search]),
      el('div', { class: 'field' }, [el('label', { text: 'Category' }), catSel]),
      el('div', { class: 'field' }, [el('label', { text: 'Chain' }), chainSel]),
      el('div', { class: 'tabs' }, [pre, live]),
    ]);
  }

  function sortHeader(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' ↓' : ' ↑') : '';
    return el('th', {}, [
      el('button', { type: 'button', text: label + arrow, onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } }),
    ]);
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    return el('div', {}, [
      el('p', { class: 'count', html: 'Showing <strong>' + list.length + '</strong> of ' + DATA.board_size + ' ranked protocols' + (state.category !== 'all' ? ' · category <strong>' + esc(state.category) + '</strong>' : '') + (state.chain !== 'all' ? ' · chain <strong>' + esc(state.chain) + '</strong>' : '') + (state.q ? ' · matching “' + esc(state.q) + '”' : '') }),
      list.length === 0 ? el('div', { class: 'empty' }, [
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Try a different search, category or chain.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } }),
      ]) : el('div', { class: 'table-wrap' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
          ])]),
          el('tbody', {}, list.map(function (r) {
            var growthCls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
            var isWatch = isWatchlist(r);
            var badge = isWatch
              ? el('span', { class: 'badge watch', text: 'Watchlist' })
              : el('span', { class: 'badge early', text: 'Early' });
            var width = Math.max(4, Math.round((r.implied_value_usd / topImplied) * 100));
            return el('tr', {
              tabindex: '0',
              onclick: function () { openDetail(r.slug); },
              onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
            }, [
              el('td', { class: 'rank', text: String(r.rank) }),
              el('td', {}, [
                el('div', { class: 'name', text: r.name }),
                el('div', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).slice(0, 3).join(', ') }),
                badge,
              ]),
              el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
              el('td', { class: 'num ' + growthCls, text: fmtPct(r.change_7d) }),
              el('td', { class: 'num', text: fmtAge(r.age_days) }),
              el('td', { class: 'num', text: '×' + r.multiple.toFixed(3) }),
              el('td', { class: 'num' }, [
                el('div', { class: 'implied', text: fmtUsd(r.implied_value_usd) }),
                el('div', { class: 'bar' }, [el('i', { style: 'width:' + width + '%' })]),
              ]),
            ]);
          })),
        ]),
      ]),
    ]);
  }

  function liveTable() {
    return el('div', {}, [
      el('p', { class: 'count', html: 'The <strong>' + DATA.live_size + '</strong> largest live-token protocols, by market cap. These already trade: the board shows the market\'s own value for them, never a model\'s.' }),
      el('div', { class: 'table-wrap' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [
            el('th', { text: 'Protocol' }),
            el('th', { class: 'num', text: 'TVL' }),
            el('th', { class: 'num', text: '7d' }),
            el('th', { class: 'num', text: 'Market cap' }),
          ])]),
          el('tbody', {}, DATA.live.map(function (r) {
            var growthCls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
            return el('tr', {}, [
              el('td', {}, [
                el('div', { class: 'name', text: r.name }),
                el('div', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + (r.chains || []).slice(0, 3).join(', ') }),
              ]),
              el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
              el('td', { class: 'num ' + growthCls, text: fmtPct(r.change_7d) }),
              el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
            ]);
          })),
        ]),
      ]),
    ]);
  }

  var dialog = null;

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var recomputed = impliedOf(row);
    var matches = recomputed === row.implied_value_usd;
    var m = DATA.model;
    var growthPct = clampGrowth(row.change_7d);
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturityMult = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var growthMult = 1 + (growthPct / 100) * m.growth_weight;
    var steps = farmSteps(row);
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'detail';
      dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = '';
    var isWatch = isWatchlist(row);
    dialog.appendChild(el('div', { class: 'detail-head' }, [
      el('div', {}, [
        el('h2', {}, [document.createTextNode(row.name + ' '), el('span', { class: 'badge ' + (isWatch ? 'watch' : 'early'), text: isWatch ? 'Watchlist' : 'Early' })]),
        el('div', { class: 'sub', text: (row.category || 'Uncategorised') + ' · ' + (row.chains || []).join(', ') + ' · rank #' + row.rank + ' of ' + DATA.board_size }),
      ]),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } }),
    ]));
    dialog.appendChild(el('div', { class: 'detail-body' }, [
      el('div', { class: 'facts' }, [
        el('div', { class: 'fact' }, [el('div', { class: 'num', text: fmtUsd(row.tvl_usd) }), el('div', { class: 'label', text: 'TVL' })]),
        el('div', { class: 'fact' }, [el('div', { class: 'num ' + (row.change_7d === null ? '' : (row.change_7d >= 0 ? 'pos' : 'neg')), text: fmtPct(row.change_7d) }), el('div', { class: 'label', text: 'TVL change, 7 days' })]),
        el('div', { class: 'fact' }, [el('div', { class: 'num', text: fmtAge(row.age_days) }), el('div', { class: 'label', text: 'Tracked since ' + (row.listed_at || 'unknown') })]),
        el('div', { class: 'fact' }, [el('div', { class: 'num', text: fmtUsd(row.implied_value_usd) }), el('div', { class: 'label', text: 'Implied value' })]),
      ]),
      el('div', { class: 'detail-section' }, [
        el('h3', { text: 'How this number is worked out' }),
        el('div', { class: 'model-note', html: '<strong>' + esc(fmtUsdFull(row.tvl_usd)) + ' TVL</strong> × <strong>' + row.multiple.toFixed(3) + '</strong> (the ' + esc(row.category || 'market') + ' multiple) × <strong>' + growthMult.toFixed(2) + '</strong> growth × <strong>' + maturityMult.toFixed(2) + '</strong> maturity = <strong>' + esc(fmtUsdFull(row.implied_value_usd)) + '</strong>.' }),
        el('p', { text: 'The multiple is the median market-cap-to-TVL ratio of the live-token protocols in this category, taken from this same snapshot' + (row.category && DATA.model.category_multiples[row.category] !== undefined ? '.' : ', or the whole market\'s median where the category has too few live comparables.') + ' The page recomputes this row as ' + fmtUsdFull(recomputed) + (matches ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
      ]),
      el('div', { class: 'detail-section' }, [
        el('h3', { text: 'How to farm it' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var parts = s.split(' Cost: ');
          var main = parts[0] || '';
          var rest = parts[1] || '';
          return el('li', {}, [
            document.createTextNode(main + ' '),
            el('span', { class: 'cost', text: 'Cost: ' + rest }),
          ]);
        })),
      ]),
      el('div', { class: 'detail-section' }, [
        el('p', { text: 'This protocol records no token in the snapshot. That is not proof it has none: a token may exist that its DefiLlama record does not carry. Never pay to claim anything, and check every step against the protocol\'s own pages.' }),
      ]),
    ]));
    if (!dialog.open) dialog.showModal();
  }

  function render() {
    var mount = document.getElementById('board');
    mount.setAttribute('aria-busy', 'false');
    mount.innerHTML = '';
    var shell = el('div', { class: 'shell' }, [
      header(),
      lede(),
      stats(),
      modelPanel(),
      controls(),
      state.tab === 'pre-token' ? boardTable() : liveTable(),
      el('p', { class: 'foot', text: 'Source: ' + DATA.source + '. Implied values are this entry\'s own estimates, never prices and never make.fun\'s. A protocol that records no token may still have one.' }),
    ]);
    mount.appendChild(shell);
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (row) openDetail(state.selected);
    }
  }

  readHash();
  render();
})();
