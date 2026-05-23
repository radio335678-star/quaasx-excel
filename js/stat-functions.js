/**
 * Statistical Function Library
 * 80+ functions registered with FormulaEngine.
 * Uses jStat for distribution calculations (t, chi-square, F, normal).
 * Depends on: formula-engine.js, jStat
 */
(function () {
  'use strict';

  var reg = window.FormulaEngine.register;

  // Helper: ensure array
  function toArr(v) { return Array.isArray(v) ? v : [v]; }
  // Helper: numeric only
  function nums(arr) { return toArr(arr).filter(function (x) { return x !== null && x !== '' && !isNaN(Number(x)); }).map(Number); }

  // ================================================================
  //  BASIC MATH (15 functions)
  // ================================================================
  reg('SUM', function (r) { var a = nums(r); return a.reduce(function (s, v) { return s + v; }, 0); });
  reg('AVERAGE', function (r) { var a = nums(r); return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; });
  reg('COUNT', function (r) { return nums(r).length; });
  reg('COUNTA', function (r) { return toArr(r).filter(function (x) { return x !== null && x !== undefined && x !== ''; }).length; });
  reg('MIN', function (r) { var a = nums(r); return a.length ? Math.min.apply(null, a) : 0; });
  reg('MAX', function (r) { var a = nums(r); return a.length ? Math.max.apply(null, a) : 0; });
  reg('ABS', function (n) { return Math.abs(Number(n)); });
  reg('ROUND', function (n, d) { var f = Math.pow(10, d || 0); return Math.round(Number(n) * f) / f; });
  reg('CEILING', function (n, s) { s = s || 1; return Math.ceil(Number(n) / s) * s; });
  reg('FLOOR', function (n, s) { s = s || 1; return Math.floor(Number(n) / s) * s; });
  reg('POWER', function (b, e) { return Math.pow(Number(b), Number(e)); });
  reg('SQRT', function (n) { return Math.sqrt(Number(n)); });
  reg('LOG', function (n, b) { return b ? Math.log(Number(n)) / Math.log(Number(b)) : Math.log10(Number(n)); });
  reg('LN', function (n) { return Math.log(Number(n)); });
  reg('EXP', function (n) { return Math.exp(Number(n)); });

  // ================================================================
  //  DESCRIPTIVE STATISTICS (15 functions)
  // ================================================================
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function variance(a, sample) {
    if (a.length < 2) return 0;
    var m = mean(a);
    var ss = a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0);
    return ss / (sample ? a.length - 1 : a.length);
  }
  function stdev(a, sample) { return Math.sqrt(variance(a, sample)); }

  reg('STDEV', function (r) { return stdev(nums(r), true); });
  reg('STDEVP', function (r) { return stdev(nums(r), false); });
  reg('VAR', function (r) { return variance(nums(r), true); });
  reg('VARP', function (r) { return variance(nums(r), false); });

  reg('MEDIAN', function (r) {
    var a = nums(r).sort(function (x, y) { return x - y; });
    if (!a.length) return 0;
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  });

  reg('MODE', function (r) {
    var a = nums(r); if (!a.length) return 0;
    var freq = {}, maxF = 0, mode = a[0];
    a.forEach(function (v) { freq[v] = (freq[v] || 0) + 1; if (freq[v] > maxF) { maxF = freq[v]; mode = v; } });
    return mode;
  });

  reg('PERCENTILE', function (r, k) {
    var a = nums(r).sort(function (x, y) { return x - y; });
    if (!a.length) return 0;
    var idx = (Number(k)) * (a.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
  });

  reg('QUARTILE', function (r, q) {
    var k = Number(q) * 0.25;
    var a = nums(r).sort(function (x, y) { return x - y; });
    if (!a.length) return 0;
    var idx = k * (a.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
  });

  reg('IQR', function (r) {
    var a = nums(r).sort(function (x, y) { return x - y; });
    if (a.length < 4) return 0;
    function q(arr, p) { var i = p * (arr.length - 1); var lo = Math.floor(i); return lo === Math.ceil(i) ? arr[lo] : arr[lo] + (arr[Math.ceil(i)] - arr[lo]) * (i - lo); }
    return q(a, 0.75) - q(a, 0.25);
  });

  reg('RANK', function (val, r) {
    var a = nums(r).sort(function (x, y) { return y - x; }); // descending
    var v = Number(val);
    for (var i = 0; i < a.length; i++) { if (a[i] === v) return i + 1; }
    return a.length;
  });

  reg('PERCENTRANK', function (r, x) {
    var a = nums(r).sort(function (x, y) { return x - y; });
    var v = Number(x);
    if (!a.length) return 0;
    for (var i = 0; i < a.length; i++) { if (a[i] >= v) return i / (a.length - 1); }
    return 1;
  });

  reg('SKEW', function (r) {
    var a = nums(r); if (a.length < 3) return 0;
    var m = mean(a), sd = stdev(a, true), n = a.length;
    var s3 = a.reduce(function (s, v) { return s + Math.pow((v - m) / sd, 3); }, 0);
    return (n / ((n - 1) * (n - 2))) * s3;
  });

  reg('KURT', function (r) {
    var a = nums(r); if (a.length < 4) return 0;
    var m = mean(a), sd = stdev(a, true), n = a.length;
    var s4 = a.reduce(function (s, v) { return s + Math.pow((v - m) / sd, 4); }, 0);
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * s4 - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  });

  reg('SEM', function (r) {
    var a = nums(r); return a.length > 0 ? stdev(a, true) / Math.sqrt(a.length) : 0;
  });

  reg('CV', function (r) {
    var a = nums(r); var m = mean(a);
    return m !== 0 ? (stdev(a, true) / Math.abs(m)) * 100 : 0;
  });

  // ================================================================
  //  INFERENTIAL STATISTICS (20+ functions) — THE KILLER FEATURE
  //  Uses jStat for distribution CDF calculations
  // ================================================================

  // Paired t-test: t = mean(d) / (SD(d) / sqrt(n))
  reg('TTEST_T', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length); if (n < 2) return NaN;
    var d = []; for (var i = 0; i < n; i++) d.push(a[i] - b[i]);
    var md = mean(d), sd_d = stdev(d, true);
    return sd_d !== 0 ? md / (sd_d / Math.sqrt(n)) : NaN;
  });

  // Paired t-test p-value (tails: 1 or 2)
  reg('TTEST_P', function (r1, r2, tails) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length); if (n < 2) return NaN;
    var d = []; for (var i = 0; i < n; i++) d.push(a[i] - b[i]);
    var md = mean(d), sd_d = stdev(d, true);
    if (sd_d === 0) return md === 0 ? 1 : 0;
    var t = Math.abs(md / (sd_d / Math.sqrt(n)));
    var df = n - 1;
    var tl = Number(tails) || 2;
    // Use jStat if available
    if (typeof jStat !== 'undefined') {
      var p = jStat.studentt.cdf(-t, df) * tl;
      return Math.min(p, 1);
    }
    // Fallback: approximation using beta incomplete function
    return _tDistApprox(t, df, tl);
  });

  // Unpaired (independent) t-test p-value
  reg('TTEST_INDEP_P', function (r1, r2, tails) {
    var a = nums(r1), b = nums(r2);
    if (a.length < 2 || b.length < 2) return NaN;
    var m1 = mean(a), m2 = mean(b);
    var v1 = variance(a, true), v2 = variance(b, true);
    var n1 = a.length, n2 = b.length;
    var se = Math.sqrt(v1 / n1 + v2 / n2);
    if (se === 0) return m1 === m2 ? 1 : 0;
    var t = Math.abs((m1 - m2) / se);
    // Welch's df
    var num = Math.pow(v1 / n1 + v2 / n2, 2);
    var den = Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1);
    var df = num / den;
    var tl = Number(tails) || 2;
    if (typeof jStat !== 'undefined') {
      return Math.min(jStat.studentt.cdf(-t, df) * tl, 1);
    }
    return _tDistApprox(t, df, tl);
  });

  // Chi-square statistic: Σ(O-E)²/E
  reg('CHITEST_STAT', function (obs, exp) {
    var o = nums(obs), e = nums(exp);
    var n = Math.min(o.length, e.length);
    var chi = 0;
    for (var i = 0; i < n; i++) { if (e[i] !== 0) chi += Math.pow(o[i] - e[i], 2) / e[i]; }
    return chi;
  });

  // Chi-square test p-value
  reg('CHITEST_P', function (obs, exp) {
    var o = nums(obs), e = nums(exp);
    var n = Math.min(o.length, e.length);
    var chi = 0;
    for (var i = 0; i < n; i++) { if (e[i] !== 0) chi += Math.pow(o[i] - e[i], 2) / e[i]; }
    var df = n - 1;
    if (typeof jStat !== 'undefined') {
      return 1 - jStat.chisquare.cdf(chi, df);
    }
    return NaN;
  });

  // One-way ANOVA F-statistic (takes multiple column arrays)
  reg('ANOVA_F', function () {
    var groups = [];
    for (var i = 0; i < arguments.length; i++) groups.push(nums(arguments[i]));
    if (groups.length < 2) return NaN;
    var allVals = []; groups.forEach(function (g) { allVals = allVals.concat(g); });
    var grandMean = mean(allVals);
    var ssBetween = 0, ssWithin = 0, dfBetween = groups.length - 1, dfWithin = 0;
    groups.forEach(function (g) {
      var gm = mean(g);
      ssBetween += g.length * Math.pow(gm - grandMean, 2);
      g.forEach(function (v) { ssWithin += Math.pow(v - gm, 2); });
      dfWithin += g.length - 1;
    });
    var msBetween = ssBetween / dfBetween;
    var msWithin = ssWithin / dfWithin;
    return msWithin !== 0 ? msBetween / msWithin : NaN;
  });

  // One-way ANOVA p-value
  reg('ANOVA_P', function () {
    var groups = [];
    for (var i = 0; i < arguments.length; i++) groups.push(nums(arguments[i]));
    if (groups.length < 2) return NaN;
    var allVals = []; groups.forEach(function (g) { allVals = allVals.concat(g); });
    var grandMean = mean(allVals);
    var ssBetween = 0, ssWithin = 0, dfBetween = groups.length - 1, dfWithin = 0;
    groups.forEach(function (g) {
      var gm = mean(g);
      ssBetween += g.length * Math.pow(gm - grandMean, 2);
      g.forEach(function (v) { ssWithin += Math.pow(v - gm, 2); });
      dfWithin += g.length - 1;
    });
    var f = (ssBetween / dfBetween) / (ssWithin / dfWithin);
    if (typeof jStat !== 'undefined') {
      return 1 - jStat.centralF.cdf(f, dfBetween, dfWithin);
    }
    return NaN;
  });

  // Pearson correlation
  reg('CORREL', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length); if (n < 2) return 0;
    var ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
    var num = 0, da = 0, db = 0;
    for (var i = 0; i < n; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) * (a[i] - ma);
      db += (b[i] - mb) * (b[i] - mb);
    }
    var den = Math.sqrt(da * db);
    return den !== 0 ? num / den : 0;
  });

  // Correlation p-value
  reg('CORREL_P', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length); if (n < 3) return NaN;
    // Calculate r
    var ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
    var num = 0, da = 0, db = 0;
    for (var i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) * (a[i] - ma); db += (b[i] - mb) * (b[i] - mb); }
    var r = num / Math.sqrt(da * db);
    if (Math.abs(r) >= 1) return 0;
    var t = r * Math.sqrt((n - 2) / (1 - r * r));
    var df = n - 2;
    if (typeof jStat !== 'undefined') {
      return Math.min(jStat.studentt.cdf(-Math.abs(t), df) * 2, 1);
    }
    return NaN;
  });

  // Spearman rank correlation
  reg('SPEARMAN', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length); if (n < 2) return 0;
    function rankArr(arr) {
      var sorted = arr.slice().map(function (v, i) { return { v: v, i: i }; }).sort(function (x, y) { return x.v - y.v; });
      var ranks = new Array(arr.length);
      for (var i = 0; i < sorted.length;) {
        var j = i;
        while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
        var avg = (i + j + 1) / 2;
        for (var k = i; k < j; k++) ranks[sorted[k].i] = avg;
        i = j;
      }
      return ranks;
    }
    var ra = rankArr(a.slice(0, n)), rb = rankArr(b.slice(0, n));
    // Pearson on ranks
    var mra = mean(ra), mrb = mean(rb);
    var num = 0, da = 0, db = 0;
    for (var i = 0; i < n; i++) { num += (ra[i] - mra) * (rb[i] - mrb); da += (ra[i] - mra) * (ra[i] - mra); db += (rb[i] - mrb) * (rb[i] - mrb); }
    var den = Math.sqrt(da * db);
    return den !== 0 ? num / den : 0;
  });

  reg('RSQ', function (r1, r2) { var a = nums(r1), b = nums(r2); var n = Math.min(a.length, b.length); if (n < 2) return 0; var ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n)); var num = 0, da = 0, db = 0; for (var i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) * (a[i] - ma); db += (b[i] - mb) * (b[i] - mb); } var r = num / Math.sqrt(da * db); return r * r; });

  reg('SLOPE', function (yr, xr) {
    var y = nums(yr), x = nums(xr);
    var n = Math.min(y.length, x.length); if (n < 2) return 0;
    var mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    var num = 0, den = 0;
    for (var i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) * (x[i] - mx); }
    return den !== 0 ? num / den : 0;
  });

  reg('INTERCEPT', function (yr, xr) {
    var y = nums(yr), x = nums(xr);
    var n = Math.min(y.length, x.length); if (n < 2) return 0;
    var mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    var num = 0, den = 0;
    for (var i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) * (x[i] - mx); }
    var slope = den !== 0 ? num / den : 0;
    return my - slope * mx;
  });

  // Confidence interval (t-distribution)
  reg('CONFIDENCE_T', function (alpha, sd, n) {
    var a = Number(alpha), s = Number(sd), sz = Number(n);
    if (typeof jStat !== 'undefined') {
      var tc = jStat.studentt.inv(1 - a / 2, sz - 1);
      return tc * s / Math.sqrt(sz);
    }
    // Fallback: use z for large samples
    var z = 1.96; if (a === 0.01) z = 2.576; if (a === 0.1) z = 1.645;
    return z * s / Math.sqrt(sz);
  });

  reg('CONFIDENCE_NORM', function (alpha, sd, n) {
    var a = Number(alpha), s = Number(sd), sz = Number(n);
    if (typeof jStat !== 'undefined') {
      var z = jStat.normal.inv(1 - a / 2, 0, 1);
      return z * s / Math.sqrt(sz);
    }
    var z = 1.96; if (a === 0.01) z = 2.576; if (a === 0.1) z = 1.645;
    return z * s / Math.sqrt(sz);
  });

  // Cohen's d (effect size)
  reg('COHENS_D', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    if (a.length < 2 || b.length < 2) return 0;
    var m1 = mean(a), m2 = mean(b);
    var s1 = variance(a, true), s2 = variance(b, true);
    var pooled = Math.sqrt(((a.length - 1) * s1 + (b.length - 1) * s2) / (a.length + b.length - 2));
    return pooled !== 0 ? (m1 - m2) / pooled : 0;
  });

  // Mann-Whitney U statistic
  reg('MANN_WHITNEY_U', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n1 = a.length, n2 = b.length;
    var u = 0;
    for (var i = 0; i < n1; i++) {
      for (var j = 0; j < n2; j++) {
        if (a[i] > b[j]) u++;
        else if (a[i] === b[j]) u += 0.5;
      }
    }
    return Math.min(u, n1 * n2 - u);
  });

  // Mann-Whitney p-value (normal approximation for n > 20)
  reg('MANN_WHITNEY_P', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n1 = a.length, n2 = b.length;
    if (n1 < 2 || n2 < 2) return NaN;
    var u = 0;
    for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) { if (a[i] > b[j]) u++; else if (a[i] === b[j]) u += 0.5; }
    u = Math.min(u, n1 * n2 - u);
    var mu = n1 * n2 / 2;
    var sigma = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
    if (sigma === 0) return 1;
    var z = (u - mu) / sigma;
    if (typeof jStat !== 'undefined') {
      return Math.min(jStat.normal.cdf(z, 0, 1) * 2, 1);
    }
    return NaN;
  });

  // Wilcoxon signed-rank T statistic
  reg('WILCOXON_T', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length);
    var diffs = [];
    for (var i = 0; i < n; i++) { var d = a[i] - b[i]; if (d !== 0) diffs.push(d); }
    // Rank absolute differences
    var absDiffs = diffs.map(function (d, i) { return { abs: Math.abs(d), sign: d > 0 ? 1 : -1, idx: i }; });
    absDiffs.sort(function (x, y) { return x.abs - y.abs; });
    // Assign ranks
    for (var i = 0; i < absDiffs.length;) {
      var j = i;
      while (j < absDiffs.length && absDiffs[j].abs === absDiffs[i].abs) j++;
      var avgRank = (i + j + 1) / 2;
      for (var k = i; k < j; k++) absDiffs[k].rank = avgRank;
      i = j;
    }
    var wPlus = 0, wMinus = 0;
    absDiffs.forEach(function (d) { if (d.sign > 0) wPlus += d.rank; else wMinus += d.rank; });
    return Math.min(wPlus, wMinus);
  });

  // Wilcoxon p-value (normal approximation)
  reg('WILCOXON_P', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length);
    var diffs = [];
    for (var i = 0; i < n; i++) { var d = a[i] - b[i]; if (d !== 0) diffs.push(d); }
    var nr = diffs.length;
    if (nr < 5) return NaN;
    // Compute T
    var absDiffs = diffs.map(function (d) { return { abs: Math.abs(d), sign: d > 0 ? 1 : -1 }; });
    absDiffs.sort(function (x, y) { return x.abs - y.abs; });
    for (var i = 0; i < absDiffs.length;) { var j = i; while (j < absDiffs.length && absDiffs[j].abs === absDiffs[i].abs) j++; var ar = (i + j + 1) / 2; for (var k = i; k < j; k++) absDiffs[k].rank = ar; i = j; }
    var wPlus = 0, wMinus = 0;
    absDiffs.forEach(function (d) { if (d.sign > 0) wPlus += d.rank; else wMinus += d.rank; });
    var T = Math.min(wPlus, wMinus);
    var muT = nr * (nr + 1) / 4;
    var sigmaT = Math.sqrt(nr * (nr + 1) * (2 * nr + 1) / 24);
    if (sigmaT === 0) return 1;
    var z = (T - muT) / sigmaT;
    if (typeof jStat !== 'undefined') {
      return Math.min(jStat.normal.cdf(z, 0, 1) * 2, 1);
    }
    return NaN;
  });

  // Significance stars
  reg('SIGNIFICANCE', function (p) {
    p = Number(p);
    if (isNaN(p)) return 'N/A';
    if (p < 0.001) return '***';
    if (p < 0.01) return '**';
    if (p < 0.05) return '*';
    return 'NS';
  });

  // Degrees of freedom
  reg('DF', function (r) { return nums(r).length - 1; });

  reg('FTEST_P', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    if (a.length < 2 || b.length < 2) return NaN;
    var v1 = variance(a, true), v2 = variance(b, true);
    if (v2 === 0) return NaN;
    var f = v1 / v2;
    if (typeof jStat !== 'undefined') {
      return (1 - jStat.centralF.cdf(f, a.length - 1, b.length - 1)) * 2;
    }
    return NaN;
  });

  // ================================================================
  //  CLINICAL / MEDICAL FUNCTIONS (12 functions)
  // ================================================================
  reg('SENSITIVITY', function (tp, fn) { var a = Number(tp), b = Number(fn); return (a + b) !== 0 ? a / (a + b) : 0; });
  reg('SPECIFICITY', function (tn, fp) { var a = Number(tn), b = Number(fp); return (a + b) !== 0 ? a / (a + b) : 0; });
  reg('PPV', function (tp, fp) { var a = Number(tp), b = Number(fp); return (a + b) !== 0 ? a / (a + b) : 0; });
  reg('NPV_CLINICAL', function (tn, fn) { var a = Number(tn), b = Number(fn); return (a + b) !== 0 ? a / (a + b) : 0; });
  reg('ACCURACY', function (tp, tn, fp, fn) { var t = Number(tp) + Number(tn) + Number(fp) + Number(fn); return t !== 0 ? (Number(tp) + Number(tn)) / t : 0; });
  reg('ODDS_RATIO', function (a, b, c, d) { var bb = Number(b) * Number(c); return bb !== 0 ? (Number(a) * Number(d)) / bb : NaN; });
  reg('RELATIVE_RISK', function (a, b, c, d) { var d1 = Number(a) + Number(b), d2 = Number(c) + Number(d); return (d1 !== 0 && d2 !== 0) ? (Number(a) / d1) / (Number(c) / d2) : NaN; });
  reg('NNT', function (cer, eer) { var arr = Math.abs(Number(cer) - Number(eer)); return arr !== 0 ? 1 / arr : NaN; });
  reg('ARR', function (cer, eer) { return Math.abs(Number(cer) - Number(eer)); });
  reg('BMI', function (wt, ht) { var h = Number(ht); return h !== 0 ? Number(wt) / (h * h) : 0; });
  reg('BSA', function (wt, ht) { return 0.007184 * Math.pow(Number(wt), 0.425) * Math.pow(Number(ht), 0.725); });

  // ================================================================
  //  FINANCIAL / BUSINESS FUNCTIONS (10 functions)
  // ================================================================
  reg('NPV_FIN', function (rate, cashflows) {
    var r = Number(rate), cf = nums(cashflows);
    return cf.reduce(function (s, v, i) { return s + v / Math.pow(1 + r, i + 1); }, 0);
  });

  reg('IRR', function (cashflows) {
    var cf = nums(cashflows);
    if (cf.length < 2) return NaN;
    var guess = 0.1;
    for (var iter = 0; iter < 100; iter++) {
      var npv = 0, dnpv = 0;
      for (var i = 0; i < cf.length; i++) {
        npv += cf[i] / Math.pow(1 + guess, i);
        dnpv -= i * cf[i] / Math.pow(1 + guess, i + 1);
      }
      if (Math.abs(dnpv) < 1e-12) break;
      var next = guess - npv / dnpv;
      if (Math.abs(next - guess) < 1e-8) return next;
      guess = next;
    }
    return guess;
  });

  reg('PMT', function (rate, nper, pv) {
    var r = Number(rate), n = Number(nper), p = Number(pv);
    if (r === 0) return -p / n;
    return -p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  });

  reg('FV', function (rate, nper, pmt) {
    var r = Number(rate), n = Number(nper), pm = Number(pmt);
    if (r === 0) return -pm * n;
    return -pm * (Math.pow(1 + r, n) - 1) / r;
  });

  reg('PV', function (rate, nper, fv) {
    var r = Number(rate), n = Number(nper), f = Number(fv);
    return f / Math.pow(1 + r, n);
  });

  reg('CAGR', function (start, end, years) {
    var s = Number(start), e = Number(end), y = Number(years);
    return (s !== 0 && y !== 0) ? Math.pow(e / s, 1 / y) - 1 : 0;
  });

  reg('ROI', function (gain, cost) { var c = Number(cost); return c !== 0 ? ((Number(gain) - c) / c) * 100 : 0; });
  reg('BREAKEVEN', function (fixed, price, vc) { var d = Number(price) - Number(vc); return d !== 0 ? Number(fixed) / d : NaN; });
  reg('MARGIN', function (rev, cost) { var r = Number(rev); return r !== 0 ? ((r - Number(cost)) / r) * 100 : 0; });
  reg('MARKUP', function (cost, price) { var c = Number(cost); return c !== 0 ? ((Number(price) - c) / c) * 100 : 0; });

  // ================================================================
  //  ENGINEERING FUNCTIONS (8 functions)
  // ================================================================
  reg('PROCESS_CP', function (usl, lsl, sd) { var s = Number(sd); return s !== 0 ? (Number(usl) - Number(lsl)) / (6 * s) : NaN; });
  reg('PROCESS_CPK', function (usl, lsl, m, sd) { var s = Number(sd); if (s === 0) return NaN; return Math.min((Number(usl) - Number(m)) / (3 * s), (Number(m) - Number(lsl)) / (3 * s)); });
  reg('UCL', function (r) { var a = nums(r); return mean(a) + 3 * stdev(a, true); });
  reg('LCL', function (r) { var a = nums(r); return mean(a) - 3 * stdev(a, true); });
  reg('SNR', function (sig, noise) { var n = Number(noise); return n !== 0 ? 20 * Math.log10(Math.abs(Number(sig)) / Math.abs(n)) : NaN; });
  reg('RMSE', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length); if (!n) return 0;
    var ss = 0; for (var i = 0; i < n; i++) ss += Math.pow(a[i] - b[i], 2);
    return Math.sqrt(ss / n);
  });
  reg('MAE', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length); if (!n) return 0;
    var s = 0; for (var i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
    return s / n;
  });
  reg('MAPE', function (r1, r2) {
    var a = nums(r1), b = nums(r2);
    var n = Math.min(a.length, b.length); if (!n) return 0;
    var s = 0, c = 0;
    for (var i = 0; i < n; i++) { if (a[i] !== 0) { s += Math.abs((a[i] - b[i]) / a[i]); c++; } }
    return c > 0 ? (s / c) * 100 : 0;
  });

  // ================================================================
  //  LOGICAL FUNCTIONS (8 functions)
  // ================================================================
  reg('IF', function (cond, tVal, fVal) { return Number(cond) ? tVal : (fVal !== undefined ? fVal : 0); });
  reg('AND', function () { for (var i = 0; i < arguments.length; i++) if (!Number(arguments[i])) return 0; return 1; });
  reg('OR', function () { for (var i = 0; i < arguments.length; i++) if (Number(arguments[i])) return 1; return 0; });
  reg('NOT', function (v) { return Number(v) ? 0 : 1; });
  reg('IFERROR', function (val, fallback) { return (val === '#ERR' || val === '#DIV/0!' || isNaN(val)) ? fallback : val; });
  reg('ISBLANK', function (v) { return (v === null || v === undefined || v === '' || v === 0) ? 1 : 0; });
  reg('ISNUMBER', function (v) { return !isNaN(Number(v)) ? 1 : 0; });
  reg('SWITCH', function () {
    var expr = arguments[0];
    for (var i = 1; i < arguments.length - 1; i += 2) {
      if (expr == arguments[i]) return arguments[i + 1];
    }
    return arguments.length % 2 === 0 ? arguments[arguments.length - 1] : '';
  });

  // ================================================================
  //  T-DISTRIBUTION FALLBACK (when jStat is not available)
  // ================================================================
  function _tDistApprox(t, df, tails) {
    // Uses approximation based on the normal distribution for large df
    // For small df, this is inaccurate but better than nothing
    var x = df / (df + t * t);
    var p = 0.5 * Math.pow(x, df / 2); // Rough approximation
    return Math.min(p * (tails || 2), 1);
  }

})();
