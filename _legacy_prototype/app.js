(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Storage keys & limits (Task 11)
  // ---------------------------------------------------------------------------
  const SESSION_KEY = "fairway-live-session";
  const CATALOG_KEY = "fairway-live-course-catalog";
  const ROUND_KEY = "fairway-live-rounds";
  const METRICS_KEY = "fairway-live-metrics";
  const DRAFT_KEY = "fairway-live-score-drafts";
  const RATE_KEY = "fairway-live-rate-limits";

  const MAX_PLAYERS_PER_ROUND = 100;
  const MAX_SCORE_WRITES_PER_MIN = 10;
  const MAX_EXPORTS_PER_HOUR = 5;
  const RETENTION_MONTHS = 12;
  const POLL_INTERVAL_MS = 10000;

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const authView = document.querySelector("#auth-view");
  const dashboardView = document.querySelector("#dashboard-view");
  const playerDashboardView = document.querySelector("#player-dashboard-view");
  const scoreEntryView = document.querySelector("#score-entry-view");
  const leaderboardView = document.querySelector("#leaderboard-view");

  const authOptions = document.querySelector(".auth-options");
  const showHostAuth = document.querySelector("#show-host-auth");
  const showJoinAuth = document.querySelector("#show-join-auth");
  const magicLinkForm = document.querySelector("#magic-link-form");
  const joinRoundForm = document.querySelector("#join-round-form");
  const backToAuth = document.querySelector("#back-to-auth");
  const backToAuthJoin = document.querySelector("#back-to-auth-join");
  const emailInput = document.querySelector("#email");
  const emailError = document.querySelector("#email-error");
  const magicLinkSent = document.querySelector("#magic-link-sent");
  const sentEmail = document.querySelector("#sent-email");
  const openDemoLink = document.querySelector("#open-demo-link");
  const signOut = document.querySelector("#sign-out");
  const signOutPlayer = document.querySelector("#sign-out-player");
  const dashboardTitle = document.querySelector("#dashboard-title");

  const joinCodeInput = document.querySelector("#join-code-input");
  const joinCodeError = document.querySelector("#join-code-error");
  const playerNameInput = document.querySelector("#player-name");
  const playerHandicapInput = document.querySelector("#player-handicap");

  const courseForm = document.querySelector("#course-form");
  const holeRows = document.querySelector("#hole-rows");
  const courseFormError = document.querySelector("#course-form-error");
  const courseFormSuccess = document.querySelector("#course-form-success");
  const catalogList = document.querySelector("#catalog-list");
  const catalogCount = document.querySelector("#catalog-count");
  const golfApiSearch = document.querySelector("#golf-api-search");
  const apiSearchResults = document.querySelector("#api-search-results");
  const apiSearchStatus = document.querySelector("#api-search-status");
  const courseSubmit = document.querySelector("#course-submit");
  const createRoundButton = document.querySelector("#create-round-button");
  const roundsSection = document.querySelector("#rounds-section");
  const roundList = document.querySelector("#round-list");
  const roundCount = document.querySelector("#round-count");
  const roundSetup = document.querySelector("#round-setup");
  const roundForm = document.querySelector("#round-form");
  const roundCourse = document.querySelector("#round-course");
  const roundTee = document.querySelector("#round-tee");
  const roundPreview = document.querySelector("#round-hole-preview");
  const roundPreviewSummary = document.querySelector("#round-preview-summary");
  const roundFormError = document.querySelector("#round-form-error");
  const cancelRoundSetup = document.querySelector("#cancel-round-setup");

  const playerDashboardTitle = document.querySelector("#player-dashboard-title");
  const activeRoundTitle = document.querySelector("#active-round-title");
  const playerRoundDetails = document.querySelector("#player-round-details");

  const leaderboardBody = document.querySelector("#leaderboard-body");
  const leaderboardEmpty = document.querySelector("#leaderboard-empty");
  const leaderboardLoading = document.querySelector("#leaderboard-loading");
  const backToRounds = document.querySelector("#back-to-rounds");
  const backToLeaderboard = document.querySelector("#back-to-leaderboard");
  const connectionStatus = document.querySelector("#connection-status");

  const offlineBanner = document.querySelector("#offline-banner");
  const conflictDialog = document.querySelector("#conflict-dialog");
  const hostRoundPanel = document.querySelector("#host-round-panel");

  let editingCourseId = null;
  let editingTeeId = null;
  let currentLeaderboardRoundId = null;
  let scoreEntryContext = null; // { session, roundId, hole }
  let pollTimer = null;
  let broadcastChannel = null;

  // ---------------------------------------------------------------------------
  // Scoring (browser mirror of scoring.js)
  // ---------------------------------------------------------------------------
  function getHandicapStrokes(playingHandicap, strokeIndex) {
    const baseStrokes = Math.floor(playingHandicap / 18);
    const extraStroke = strokeIndex <= (playingHandicap % 18) ? 1 : 0;
    return baseStrokes + extraStroke;
  }

  function getStablefordPoints(par, handicapStrokes, grossScore) {
    if (grossScore === null || grossScore === undefined || grossScore === "") return 0;
    const netScore = Number(grossScore) - handicapStrokes;
    return Math.max(0, 2 + par - netScore);
  }

  function getPlayerSummary(holes, playingHandicap, scores) {
    let totalPoints = 0;
    let holesCompleted = 0;
    let totalGross = 0;
    for (const hole of holes) {
      const scoreEntry = scores.find(function (s) { return s.holeNumber === hole.number; });
      const grossScore = scoreEntry ? scoreEntry.grossScore : null;
      if (grossScore !== null && grossScore !== undefined && grossScore !== "") {
        const hs = getHandicapStrokes(playingHandicap, hole.strokeIndex);
        totalPoints += getStablefordPoints(hole.par, hs, grossScore);
        totalGross += Number(grossScore);
        holesCompleted++;
      }
    }
    return {
      totalPoints: totalPoints,
      holesCompleted: holesCompleted,
      totalGross: totalGross,
      isComplete: holesCompleted === holes.length
    };
  }

  // ---------------------------------------------------------------------------
  // Metrics / rate limits (Task 11)
  // ---------------------------------------------------------------------------
  function logMetric(name, data) {
    try {
      const metrics = JSON.parse(window.localStorage.getItem(METRICS_KEY) || "[]");
      metrics.push({ name: name, at: new Date().toISOString(), data: data || {} });
      // keep last 500
      window.localStorage.setItem(METRICS_KEY, JSON.stringify(metrics.slice(-500)));
    } catch (_) { /* ignore */ }
  }

  function checkScoreRateLimit(playerId) {
    const now = Date.now();
    let rates;
    try {
      rates = JSON.parse(window.localStorage.getItem(RATE_KEY) || "{}");
    } catch (_) {
      rates = {};
    }
    const key = "score:" + playerId;
    const windowStart = now - 60000;
    const stamps = (rates[key] || []).filter(function (t) { return t > windowStart; });
    if (stamps.length >= MAX_SCORE_WRITES_PER_MIN) {
      return { ok: false, error: "Too many score writes. Please wait a moment and try again." };
    }
    stamps.push(now);
    rates[key] = stamps;
    window.localStorage.setItem(RATE_KEY, JSON.stringify(rates));
    return { ok: true };
  }

  function checkExportRateLimit(roundId) {
    const now = Date.now();
    let rates;
    try {
      rates = JSON.parse(window.localStorage.getItem(RATE_KEY) || "{}");
    } catch (_) {
      rates = {};
    }
    const key = "export:" + roundId;
    const windowStart = now - 3600000;
    const stamps = (rates[key] || []).filter(function (t) { return t > windowStart; });
    if (stamps.length >= MAX_EXPORTS_PER_HOUR) {
      return { ok: false, error: "Export limit reached (5 per hour). Try again later." };
    }
    stamps.push(now);
    rates[key] = stamps;
    window.localStorage.setItem(RATE_KEY, JSON.stringify(rates));
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  const authAdapter = {
    requestMagicLink: function (email) {
      window.localStorage.setItem("fairway-live-pending-email", email);
    },
    completeMagicLink: function (email) {
      const session = { email: email, createdAt: new Date().toISOString(), role: "host" };
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      window.localStorage.removeItem("fairway-live-pending-email");
      return session;
    },
    createPlayerSession: function (roundId, player) {
      const session = {
        role: "player",
        roundId: roundId,
        playerId: player.id,
        displayName: player.displayName,
        playingHandicap: player.playingHandicap,
        createdAt: new Date().toISOString()
      };
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    },
    getSession: function () {
      try { return JSON.parse(window.localStorage.getItem(SESSION_KEY)); }
      catch (_) { return null; }
    },
    signOut: function () {
      window.localStorage.removeItem(SESSION_KEY);
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  }

  function makeOpaqueId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return prefix + "-" + window.crypto.randomUUID();
    }
    return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  function makeJoinCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(6);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(values);
    }
    return Array.from(values, function (value, index) {
      return alphabet[(value + index * 17) % alphabet.length];
    }).join("");
  }

  function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function isOnline() {
    return navigator.onLine !== false;
  }

  // ---------------------------------------------------------------------------
  // Catalog / rounds storage
  // ---------------------------------------------------------------------------
  function getCatalog() {
    try {
      const c = JSON.parse(window.localStorage.getItem(CATALOG_KEY));
      return Array.isArray(c) ? c : [];
    } catch (_) { return []; }
  }

  function saveCatalog(catalog) {
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  }

  function getRounds() {
    try {
      const r = JSON.parse(window.localStorage.getItem(ROUND_KEY));
      return Array.isArray(r) ? r : [];
    } catch (_) { return []; }
  }

  function saveRounds(rounds) {
    window.localStorage.setItem(ROUND_KEY, JSON.stringify(rounds));
    broadcast("rounds-changed", {});
  }

  function getRoundById(roundId) {
    return getRounds().find(function (r) { return r.id === roundId; });
  }

  function getRoundByJoinCode(code) {
    const normalized = String(code || "").trim().toUpperCase();
    return getRounds().find(function (r) {
      return r.joinCode === normalized &&
        r.joinCodeActive !== false &&
        (r.status === "setup" || r.status === "active" || r.status === "ready_for_export");
    });
  }

  function updateRound(roundId, updater) {
    const rounds = getRounds();
    const index = rounds.findIndex(function (r) { return r.id === roundId; });
    if (index === -1) return null;
    const updated = updater(JSON.parse(JSON.stringify(rounds[index])));
    rounds[index] = updated;
    saveRounds(rounds);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Drafts (Task 06 offline)
  // ---------------------------------------------------------------------------
  function getDrafts() {
    try {
      return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "{}");
    } catch (_) { return {}; }
  }

  function setDraft(roundId, playerId, holeNumber, grossScore) {
    const drafts = getDrafts();
    const key = roundId + ":" + playerId + ":" + holeNumber;
    drafts[key] = { grossScore: Number(grossScore), at: new Date().toISOString() };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  }

  function clearDraft(roundId, playerId, holeNumber) {
    const drafts = getDrafts();
    const key = roundId + ":" + playerId + ":" + holeNumber;
    delete drafts[key];
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  }

  function getDraft(roundId, playerId, holeNumber) {
    const drafts = getDrafts();
    return drafts[roundId + ":" + playerId + ":" + holeNumber] || null;
  }

  // ---------------------------------------------------------------------------
  // Score storage (Task 07 + 06 conflict + 09 closed)
  // ---------------------------------------------------------------------------
  function getPlayerScores(round, playerId) {
    if (!round.scores || !Array.isArray(round.scores)) return [];
    return round.scores.filter(function (s) { return s.playerId === playerId; });
  }

  function setScore(roundId, playerId, holeNumber, grossScore, actorId, options) {
    options = options || {};
    const scoreNum = Number(grossScore);
    if (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 20) {
      return { ok: false, error: "Score must be a whole number from 1 to 20." };
    }
    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      return { ok: false, error: "Invalid hole number." };
    }

    const round = getRoundById(roundId);
    if (!round) return { ok: false, error: "Round not found." };
    if (round.status === "closed" || round.status === "archived") {
      return { ok: false, error: "This round is closed. Scores can no longer be changed." };
    }

    // Rate limit
    const rate = checkScoreRateLimit(playerId);
    if (!rate.ok) return rate;

    // Offline: store as draft
    if (!isOnline() && !options.forceOnline) {
      setDraft(roundId, playerId, holeNumber, scoreNum);
      logMetric("score_draft", { roundId: roundId, holeNumber: holeNumber });
      return { ok: true, draft: true, round: round };
    }

    // Conflict detection (client version)
    const existing = (round.scores || []).find(function (s) {
      return s.playerId === playerId && s.holeNumber === holeNumber;
    });
    if (existing && options.expectedVersion != null && existing.version !== options.expectedVersion) {
      return {
        ok: false,
        conflict: true,
        serverScore: existing.grossScore,
        serverVersion: existing.version,
        localScore: scoreNum
      };
    }

    const start = performance.now();
    const updated = updateRound(roundId, function (r) {
      if (!Array.isArray(r.scores)) r.scores = [];
      if (!Array.isArray(r.scoreHistory)) r.scoreHistory = [];

      const idx = r.scores.findIndex(function (s) {
        return s.playerId === playerId && s.holeNumber === holeNumber;
      });
      const now = new Date().toISOString();
      let previousScore = null;
      let version = 1;

      if (idx >= 0) {
        previousScore = r.scores[idx].grossScore;
        version = (r.scores[idx].version || 1) + 1;
        r.scores[idx] = {
          id: r.scores[idx].id,
          playerId: playerId,
          holeNumber: holeNumber,
          grossScore: scoreNum,
          version: version,
          updatedAt: now,
          enteredBy: actorId
        };
      } else {
        r.scores.push({
          id: makeOpaqueId("score"),
          playerId: playerId,
          holeNumber: holeNumber,
          grossScore: scoreNum,
          version: 1,
          updatedAt: now,
          enteredBy: actorId
        });
      }

      r.scoreHistory.push({
        id: makeOpaqueId("hist"),
        playerId: playerId,
        holeNumber: holeNumber,
        previousScore: previousScore,
        newScore: scoreNum,
        actorId: actorId,
        createdAt: now
      });
      if (r.scoreHistory.length > 200) r.scoreHistory = r.scoreHistory.slice(-200);

      if (r.status === "setup") r.status = "active";
      return r;
    });

    clearDraft(roundId, playerId, holeNumber);
    logMetric("score_save", {
      roundId: roundId,
      holeNumber: holeNumber,
      ms: Math.round(performance.now() - start)
    });
    broadcast("score-updated", { roundId: roundId });

    return { ok: true, round: updated };
  }

  function buildLeaderboard(round) {
    if (!round || !round.teeSetSnapshot || !Array.isArray(round.players)) return [];
    const holes = round.teeSetSnapshot.holes;
    const entries = round.players.map(function (player) {
      const scores = getPlayerScores(round, player.id);
      const summary = getPlayerSummary(holes, player.playingHandicap, scores);
      const lastUpdate = scores.reduce(function (latest, s) {
        return !latest || s.updatedAt > latest ? s.updatedAt : latest;
      }, null);
      return {
        playerId: player.id,
        displayName: player.displayName,
        playingHandicap: player.playingHandicap,
        totalPoints: summary.totalPoints,
        totalGross: summary.totalGross,
        holesCompleted: summary.holesCompleted,
        isComplete: summary.isComplete,
        lastUpdate: lastUpdate
      };
    });

    entries.sort(function (a, b) {
      if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.displayName.localeCompare(b.displayName);
    });

    let rank = 0;
    let prevPts = null;
    let prevComplete = null;
    entries.forEach(function (entry, index) {
      if (prevPts === null || entry.totalPoints !== prevPts || entry.isComplete !== prevComplete) {
        rank = index + 1;
      }
      entry.rank = rank;
      prevPts = entry.totalPoints;
      prevComplete = entry.isComplete;
    });
    return entries;
  }

  // ---------------------------------------------------------------------------
  // Realtime (Task 08) — BroadcastChannel + polling
  // ---------------------------------------------------------------------------
  function setupBroadcast() {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        broadcastChannel = new BroadcastChannel("fairway-live");
        broadcastChannel.onmessage = function (event) {
          const msg = event.data;
          if (!msg || !msg.type) return;
          if (msg.type === "score-updated" || msg.type === "rounds-changed") {
            if (currentLeaderboardRoundId && (!msg.roundId || msg.roundId === currentLeaderboardRoundId)) {
              const round = getRoundById(currentLeaderboardRoundId);
              if (round) renderLeaderboard(round);
            }
            // Refresh score entry if open
            if (scoreEntryContext && scoreEntryView && !scoreEntryView.hidden) {
              const r = getRoundById(scoreEntryContext.roundId);
              if (r) openScoreEntry(scoreEntryContext.session, r, scoreEntryContext.hole);
            }
          }
        };
      }
    } catch (_) { /* ignore */ }
  }

  function broadcast(type, payload) {
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(Object.assign({ type: type }, payload || {}));
      } catch (_) { /* ignore */ }
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (!currentLeaderboardRoundId) return;
      const round = getRoundById(currentLeaderboardRoundId);
      if (round) {
        renderLeaderboard(round);
        if (connectionStatus) {
          connectionStatus.textContent = isOnline() ? "Live (poll)" : "Offline";
          connectionStatus.classList.toggle("disconnected", !isOnline());
        }
        logMetric("leaderboard_poll", { roundId: currentLeaderboardRoundId });
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------
  function hideAllViews() {
    authView.hidden = true;
    dashboardView.hidden = true;
    if (playerDashboardView) playerDashboardView.hidden = true;
    if (scoreEntryView) scoreEntryView.hidden = true;
    if (leaderboardView) leaderboardView.hidden = true;
    if (conflictDialog) conflictDialog.hidden = true;
    stopPolling();
  }

  function showAuth() {
    hideAllViews();
    authView.hidden = false;
    document.title = "Fairway Live";
    if (authOptions) authOptions.hidden = false;
    if (magicLinkForm) magicLinkForm.hidden = true;
    if (joinRoundForm) joinRoundForm.hidden = true;
    if (magicLinkSent) magicLinkSent.hidden = true;
  }

  function showHostDashboard(session) {
    hideAllViews();
    dashboardView.hidden = false;
    dashboardTitle.textContent = "Good to see you, " + session.email.split("@")[0] + ".";
    document.title = "Dashboard · Fairway Live";
    renderCatalog();
    renderRounds();
    updateRoundButton();
  }

  function showPlayerDashboard(session) {
    hideAllViews();
    if (!playerDashboardView) { showAuth(); return; }
    playerDashboardView.hidden = false;
    playerDashboardTitle.textContent = "Hi, " + session.displayName + ".";
    document.title = "Your Round · Fairway Live";

    const round = getRoundById(session.roundId);
    if (!round) {
      activeRoundTitle.textContent = "Round not found";
      playerRoundDetails.textContent = "The round you joined is no longer available. Sign out and join again.";
      return;
    }

    const scores = getPlayerScores(round, session.playerId);
    const summary = getPlayerSummary(round.teeSetSnapshot.holes, session.playingHandicap, scores);
    const parTotal = round.teeSetSnapshot.holes.reduce(function (t, h) { return t + h.par; }, 0);

    activeRoundTitle.textContent = round.courseName + " · " + round.teeSetSnapshot.name;
    playerRoundDetails.innerHTML =
      "<strong>Join code:</strong> " + escapeHtml(round.joinCode) +
      (round.joinCodeActive === false ? " <em>(revoked)</em>" : "") + "<br>" +
      "<strong>Status:</strong> " + escapeHtml(round.status) + " · Par " + parTotal + "<br>" +
      "<strong>Your handicap:</strong> " + session.playingHandicap + "<br>" +
      "<strong>Progress:</strong> " + summary.holesCompleted + " / 18 · " + summary.totalPoints + " pts" +
      (summary.isComplete ? " (complete)" : " (in progress)") +
      '<div class="player-actions" style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">' +
      '<button type="button" class="button button-primary" id="open-score-entry-btn"' +
      (round.status === "closed" || round.status === "archived" ? " disabled" : "") +
      ">Enter scores</button>" +
      '<button type="button" class="button button-secondary" id="open-leaderboard-btn">View leaderboard</button>' +
      "</div>";

    const openScoreBtn = document.querySelector("#open-score-entry-btn");
    const openLbBtn = document.querySelector("#open-leaderboard-btn");
    if (openScoreBtn) {
      openScoreBtn.addEventListener("click", function () {
        openScoreEntry(session, round);
      });
    }
    if (openLbBtn) {
      openLbBtn.addEventListener("click", function () {
        openLeaderboard(round.id);
      });
    }
  }

  function openLeaderboard(roundId) {
    const round = getRoundById(roundId);
    if (!round) return;
    currentLeaderboardRoundId = roundId;
    hideAllViews();
    leaderboardView.hidden = false;
    document.title = "Leaderboard · Fairway Live";
    if (connectionStatus) {
      connectionStatus.textContent = isOnline() ? "Live" : "Offline";
      connectionStatus.classList.toggle("disconnected", !isOnline());
    }
    renderLeaderboard(round);
    renderHostPanel(round);
    startPolling();
  }

  function renderLeaderboard(round) {
    if (leaderboardLoading) leaderboardLoading.hidden = true;
    const entries = buildLeaderboard(round);
    if (!entries.length) {
      leaderboardBody.innerHTML = "";
      if (leaderboardEmpty) leaderboardEmpty.hidden = false;
      return;
    }
    if (leaderboardEmpty) leaderboardEmpty.hidden = true;
    leaderboardBody.innerHTML = entries.map(function (entry) {
      const statusLabel = entry.isComplete ? "Complete" : entry.holesCompleted + "/18";
      const last = entry.lastUpdate ? new Date(entry.lastUpdate).toLocaleTimeString() : "—";
      return "<tr>" +
        '<td class="rank">' + entry.rank + "</td>" +
        "<td>" + escapeHtml(entry.displayName) + "</td>" +
        "<td>" + entry.playingHandicap + "</td>" +
        "<td>" + statusLabel + "</td>" +
        '<td class="points"><strong>' + entry.totalPoints + "</strong></td>" +
        "<td>" + escapeHtml(last) + "</td>" +
        "</tr>";
    }).join("");
  }

  // ---------------------------------------------------------------------------
  // Host panel (Task 09 + 10)
  // ---------------------------------------------------------------------------
  function renderHostPanel(round) {
    const session = authAdapter.getSession();
    if (!hostRoundPanel) return;
    const isHost = session && session.role === "host" && session.email === round.hostEmail;
    hostRoundPanel.hidden = !isHost;
    if (!isHost) return;

    const statusEl = document.querySelector("#host-round-status");
    if (statusEl) statusEl.textContent = round.status;

    // Incomplete warning
    const warning = document.querySelector("#host-incomplete-warning");
    const incomplete = (round.players || []).filter(function (p) {
      const s = getPlayerSummary(round.teeSetSnapshot.holes, p.playingHandicap, getPlayerScores(round, p.id));
      return !s.isComplete;
    });
    if (warning) {
      if (incomplete.length) {
        warning.hidden = false;
        warning.textContent = incomplete.length + " player(s) still have missing holes: " +
          incomplete.map(function (p) { return p.displayName; }).join(", ");
      } else {
        warning.hidden = true;
      }
    }

    // Populate correction selects
    const playerSelect = document.querySelector("#host-correct-player");
    const holeSelect = document.querySelector("#host-correct-hole");
    if (playerSelect) {
      playerSelect.innerHTML = (round.players || []).map(function (p) {
        return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.displayName) + "</option>";
      }).join("");
    }
    if (holeSelect) {
      holeSelect.innerHTML = Array.from({ length: 18 }, function (_, i) {
        return '<option value="' + (i + 1) + '">Hole ' + (i + 1) + "</option>";
      }).join("");
    }

    // Button enable states
    const setEnabled = function (id, enabled) {
      const el = document.querySelector(id);
      if (el) el.disabled = !enabled;
    };
    setEnabled("#host-mark-active", round.status === "setup");
    setEnabled("#host-ready-export", round.status === "active" || round.status === "setup");
    setEnabled("#host-close-round", round.status === "ready_for_export" || round.status === "active");
    setEnabled("#host-reopen-round", round.status === "ready_for_export" || round.status === "closed");
    setEnabled("#host-export-xlsx", round.status === "ready_for_export" || round.status === "closed");
    setEnabled("#host-correct-save", round.status !== "closed" && round.status !== "archived");
  }

  function setRoundStatus(roundId, status) {
    const updated = updateRound(roundId, function (r) {
      r.status = status;
      if (status === "closed") r.completedAt = new Date().toISOString();
      return r;
    });
    if (updated) {
      renderLeaderboard(updated);
      renderHostPanel(updated);
      logMetric("round_status", { roundId: roundId, status: status });
    }
  }

  // ---------------------------------------------------------------------------
  // Score entry (Task 06)
  // ---------------------------------------------------------------------------
  function openScoreEntry(session, round, preferredHole) {
    if (!scoreEntryView) return;
    if (round.status === "closed" || round.status === "archived") {
      alert("This round is closed. Scores can no longer be entered.");
      return;
    }
    hideAllViews();
    scoreEntryView.hidden = false;
    document.title = "Score Entry · Fairway Live";
    scoreEntryContext = { session: session, roundId: round.id, hole: preferredHole || 1 };

    if (offlineBanner) offlineBanner.hidden = isOnline();

    const holes = round.teeSetSnapshot.holes;
    const scores = getPlayerScores(round, session.playerId);
    const summary = getPlayerSummary(holes, session.playingHandicap, scores);

    refreshProgressUI(round, session, scores, summary);

    let currentHole = preferredHole || 1;
    if (!preferredHole) {
      for (let i = 0; i < holes.length; i++) {
        const entry = scores.find(function (s) { return s.holeNumber === holes[i].number; });
        const draft = getDraft(round.id, session.playerId, holes[i].number);
        if ((!entry || entry.grossScore == null) && !draft) {
          currentHole = holes[i].number;
          break;
        }
      }
    }
    showHole(session, round, currentHole);
    wireScoreEntryControls(session, round);
  }

  function refreshProgressUI(round, session, scores, summary) {
    const progressList = document.querySelector("#hole-progress-list");
    if (progressList) {
      progressList.innerHTML = round.teeSetSnapshot.holes.map(function (hole) {
        const entry = scores.find(function (s) { return s.holeNumber === hole.number; });
        const draft = getDraft(round.id, session.playerId, hole.number);
        const hasScore = entry && entry.grossScore != null;
        const classes = ["hole-progress-item"];
        if (hasScore) classes.push("scored");
        if (draft && !hasScore) classes.push("unsent");
        return '<button type="button" class="' + classes.join(" ") + '" data-hole="' + hole.number + '">' +
          hole.number +
          (hasScore ? " · " + entry.grossScore : draft ? " · " + draft.grossScore + "*" : "") +
          "</button>";
      }).join("");
    }
    const holesCompletedEl = document.querySelector("#holes-completed");
    const totalPointsEl = document.querySelector("#total-points");
    const completionStatus = document.querySelector("#completion-status");
    if (holesCompletedEl) holesCompletedEl.textContent = summary.holesCompleted + " / 18";
    if (totalPointsEl) totalPointsEl.textContent = String(summary.totalPoints);
    if (completionStatus) completionStatus.textContent = summary.isComplete ? "Round complete" : "In progress";
  }

  function showHole(session, round, holeNumber) {
    scoreEntryContext.hole = holeNumber;
    const hole = round.teeSetSnapshot.holes.find(function (h) { return h.number === holeNumber; });
    if (!hole) return;

    const title = document.querySelector("#current-hole-title");
    const statusPill = document.querySelector("#current-hole-status");
    const parEl = document.querySelector("#hole-par");
    const siEl = document.querySelector("#hole-stroke-index");
    const hcpEl = document.querySelector("#hole-handicap-strokes");
    const scoreInput = document.querySelector("#score-input");
    const saveBtn = document.querySelector("#save-score-btn");
    const nextBtn = document.querySelector("#next-hole-btn");
    const prevBtn = document.querySelector("#prev-hole-btn");
    const preview = document.querySelector(".score-preview");
    const scoreMessage = document.querySelector("#score-message");

    if (title) {
      title.textContent = "Hole " + holeNumber;
      title.dataset.hole = String(holeNumber);
    }
    if (parEl) parEl.textContent = String(hole.par);
    if (siEl) siEl.textContent = String(hole.strokeIndex);

    const strokes = getHandicapStrokes(session.playingHandicap, hole.strokeIndex);
    if (hcpEl) hcpEl.textContent = String(strokes);

    const existing = getPlayerScores(round, session.playerId).find(function (s) {
      return s.holeNumber === holeNumber;
    });
    const draft = getDraft(round.id, session.playerId, holeNumber);

    if (scoreInput) {
      if (existing && existing.grossScore != null) {
        scoreInput.value = existing.grossScore;
        if (statusPill) statusPill.textContent = "Saved";
      } else if (draft) {
        scoreInput.value = draft.grossScore;
        if (statusPill) statusPill.textContent = "Unsent draft";
      } else {
        scoreInput.value = "";
        if (statusPill) statusPill.textContent = "Ready to score";
      }
    }

    if (saveBtn) saveBtn.disabled = false;
    if (prevBtn) prevBtn.disabled = holeNumber <= 1;
    if (nextBtn) nextBtn.disabled = holeNumber >= 18;
    if (scoreMessage) scoreMessage.hidden = true;

    // Highlight current in progress list
    document.querySelectorAll(".hole-progress-item").forEach(function (btn) {
      btn.classList.toggle("current", Number(btn.dataset.hole) === holeNumber);
    });

    updatePreview(hole, strokes, scoreInput ? scoreInput.value : "");
  }

  function updatePreview(hole, strokes, val) {
    const preview = document.querySelector(".score-preview");
    const previewGross = document.querySelector("#preview-gross");
    const previewNet = document.querySelector("#preview-net");
    const previewPoints = document.querySelector("#preview-points");
    if (val === "" || val == null) {
      if (preview) preview.hidden = true;
      return;
    }
    const gross = Number(val);
    if (!Number.isInteger(gross) || gross < 1 || gross > 20) {
      if (preview) preview.hidden = true;
      return;
    }
    const net = gross - strokes;
    const points = getStablefordPoints(hole.par, strokes, gross);
    if (preview) preview.hidden = false;
    if (previewGross) previewGross.textContent = String(gross);
    if (previewNet) previewNet.textContent = String(net);
    if (previewPoints) previewPoints.textContent = String(points);
  }

  function wireScoreEntryControls(session, round) {
    const scoreInput = document.querySelector("#score-input");
    const saveBtn = document.querySelector("#save-score-btn");
    const nextBtn = document.querySelector("#next-hole-btn");
    const prevBtn = document.querySelector("#prev-hole-btn");
    const minusBtn = document.querySelector("#score-minus");
    const plusBtn = document.querySelector("#score-plus");
    const progressList = document.querySelector("#hole-progress-list");
    const scoreMessage = document.querySelector("#score-message");

    function currentHoleNum() {
      return Number(document.querySelector("#current-hole-title").dataset.hole || 1);
    }

    function currentHoleData() {
      const n = currentHoleNum();
      return round.teeSetSnapshot.holes.find(function (h) { return h.number === n; });
    }

    if (scoreInput) {
      scoreInput.oninput = function () {
        const hole = currentHoleData();
        const strokes = getHandicapStrokes(session.playingHandicap, hole.strokeIndex);
        updatePreview(hole, strokes, scoreInput.value);
      };
    }

    if (minusBtn) {
      minusBtn.onclick = function () {
        let v = Number(scoreInput.value) || 0;
        v = Math.max(1, v - 1);
        scoreInput.value = v;
        scoreInput.dispatchEvent(new Event("input"));
      };
    }
    if (plusBtn) {
      plusBtn.onclick = function () {
        let v = Number(scoreInput.value) || 0;
        v = Math.min(20, (v || 0) + 1);
        if (!scoreInput.value) v = 1;
        scoreInput.value = v;
        scoreInput.dispatchEvent(new Event("input"));
      };
    }

    if (progressList) {
      progressList.onclick = function (event) {
        const btn = event.target.closest("[data-hole]");
        if (btn) showHole(session, getRoundById(round.id), Number(btn.dataset.hole));
      };
    }

    if (prevBtn) {
      prevBtn.onclick = function () {
        const n = currentHoleNum();
        if (n > 1) showHole(session, getRoundById(round.id), n - 1);
      };
    }
    if (nextBtn) {
      nextBtn.onclick = function () {
        const n = currentHoleNum();
        if (n < 18) showHole(session, getRoundById(round.id), n + 1);
      };
    }

    if (saveBtn) {
      saveBtn.onclick = function () {
        const holeNum = currentHoleNum();
        const value = scoreInput.value;
        const existing = getPlayerScores(round, session.playerId).find(function (s) {
          return s.holeNumber === holeNum;
        });
        const expectedVersion = existing ? existing.version : null;

        const result = setScore(round.id, session.playerId, holeNum, value, session.playerId, {
          expectedVersion: expectedVersion
        });

        if (result.conflict) {
          showConflictDialog(result.localScore, result.serverScore, function (keepLocal) {
            if (keepLocal) {
              const forced = setScore(round.id, session.playerId, holeNum, result.localScore, session.playerId, {
                expectedVersion: result.serverVersion
              });
              // Force overwrite by not checking version on second try - use direct write
              if (!forced.ok && forced.conflict) {
                // Explicit overwrite
                updateRound(round.id, function (r) {
                  const idx = r.scores.findIndex(function (s) {
                    return s.playerId === session.playerId && s.holeNumber === holeNum;
                  });
                  if (idx >= 0) {
                    r.scores[idx].grossScore = result.localScore;
                    r.scores[idx].version = (r.scores[idx].version || 1) + 1;
                    r.scores[idx].updatedAt = new Date().toISOString();
                    r.scores[idx].enteredBy = session.playerId;
                  }
                  return r;
                });
              }
            }
            // Refresh
            const refreshed = getRoundById(round.id);
            openScoreEntry(session, refreshed, holeNum);
            if (scoreMessage) {
              scoreMessage.hidden = false;
              scoreMessage.textContent = keepLocal ? "Your score kept." : "Kept saved score.";
              scoreMessage.className = "score-message saved";
            }
          });
          return;
        }

        if (!result.ok) {
          if (scoreMessage) {
            scoreMessage.hidden = false;
            scoreMessage.textContent = result.error;
            scoreMessage.className = "score-message error";
          }
          return;
        }

        if (scoreMessage) {
          scoreMessage.hidden = false;
          scoreMessage.textContent = result.draft
            ? "Saved as offline draft. Will sync when online."
            : "Score saved.";
          scoreMessage.className = "score-message saved";
        }

        const refreshed = getRoundById(round.id);
        const scores = getPlayerScores(refreshed, session.playerId);
        const summary = getPlayerSummary(refreshed.teeSetSnapshot.holes, session.playingHandicap, scores);
        refreshProgressUI(refreshed, session, scores, summary);
        showHole(session, refreshed, holeNum);
        round = refreshed;
      };
    }
  }

  function showConflictDialog(localScore, serverScore, onResolve) {
    if (!conflictDialog) {
      onResolve(true);
      return;
    }
    document.querySelector("#conflict-local").textContent = String(localScore);
    document.querySelector("#conflict-server").textContent = String(serverScore);
    conflictDialog.hidden = false;

    const keepLocal = document.querySelector("#conflict-keep-local");
    const keepServer = document.querySelector("#conflict-keep-server");

    function cleanup() {
      conflictDialog.hidden = true;
      keepLocal.onclick = null;
      keepServer.onclick = null;
    }
    keepLocal.onclick = function () { cleanup(); onResolve(true); };
    keepServer.onclick = function () { cleanup(); onResolve(false); };
  }

  // ---------------------------------------------------------------------------
  // Excel export (Task 10)
  // ---------------------------------------------------------------------------
  function exportRoundXlsx(roundId) {
    const session = authAdapter.getSession();
    if (!session || session.role !== "host") {
      alert("Only the host can export.");
      return;
    }
    const round = getRoundById(roundId);
    if (!round) return;
    if (round.status !== "ready_for_export" && round.status !== "closed") {
      alert("Mark the round ready for export first.");
      return;
    }
    if (session.email !== round.hostEmail) {
      alert("Only the host of this round can export.");
      return;
    }

    const rate = checkExportRateLimit(roundId);
    if (!rate.ok) {
      alert(rate.error);
      return;
    }

    if (typeof XLSX === "undefined") {
      alert("Excel library not loaded. Check your network connection.");
      return;
    }

    const start = performance.now();
    const holes = round.teeSetSnapshot.holes;
    const board = buildLeaderboard(round);

    // Sheet 1: Leaderboard
    const lbRows = [
      ["Rank", "Player", "Playing Handicap", "Holes Completed", "Completion", "Stableford Points", "Total Gross"]
    ];
    board.forEach(function (e) {
      lbRows.push([
        e.rank,
        e.displayName,
        e.playingHandicap,
        e.holesCompleted,
        e.isComplete ? "Complete" : "In progress",
        e.totalPoints,
        e.totalGross
      ]);
    });

    // Sheet 2: Hole details
    const detailHeader = ["Player", "Handicap"];
    for (let i = 1; i <= 18; i++) detailHeader.push("H" + i + " Gross");
    for (let i = 1; i <= 18; i++) detailHeader.push("H" + i + " Pts");
    detailHeader.push("Gross Total", "Points Total");
    const detailRows = [detailHeader];

    (round.players || []).forEach(function (player) {
      const scores = getPlayerScores(round, player.id);
      const row = [player.displayName, player.playingHandicap];
      let grossTotal = 0;
      let ptsTotal = 0;
      const grosses = [];
      const pts = [];
      for (let i = 1; i <= 18; i++) {
        const hole = holes.find(function (h) { return h.number === i; });
        const entry = scores.find(function (s) { return s.holeNumber === i; });
        const g = entry && entry.grossScore != null ? Number(entry.grossScore) : "";
        let p = "";
        if (g !== "" && hole) {
          const hs = getHandicapStrokes(player.playingHandicap, hole.strokeIndex);
          p = getStablefordPoints(hole.par, hs, g);
          grossTotal += g;
          ptsTotal += p;
        }
        grosses.push(g);
        pts.push(p);
      }
      detailRows.push(row.concat(grosses).concat(pts).concat([grossTotal, ptsTotal]));
    });

    // Sheet 3: Round setup
    const setupRows = [
      ["Course", round.courseName],
      ["Location", round.courseLocation || ""],
      ["Tee set", round.teeSetSnapshot.name],
      ["Tee colour", round.teeSetSnapshot.colour || ""],
      ["Round ID", round.id],
      ["Join code", round.joinCode],
      ["Status", round.status],
      ["Generated at", new Date().toISOString()],
      [],
      ["Hole", "Par", "Stroke Index", "Distance"]
    ];
    holes.forEach(function (h) {
      setupRows.push([h.number, h.par, h.strokeIndex, h.distance != null ? h.distance : ""]);
    });
    setupRows.push([]);
    setupRows.push(["Scoring rules", "Stableford: max(0, 2 + par - netScore) where netScore = gross - handicap strokes"]);
    setupRows.push(["Handicap allocation", "floor(hcp/18) strokes on every hole, plus 1 on holes with stroke index <= hcp % 18"]);
    setupRows.push(["Retention", "Default retention " + RETENTION_MONTHS + " months"]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lbRows), "Leaderboard");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), "Hole details");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(setupRows), "Round setup");

    const filename = "fairway-live-" + (round.courseName || "round").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".xlsx";
    XLSX.writeFile(wb, filename);

    logMetric("export", {
      roundId: roundId,
      ms: Math.round(performance.now() - start),
      players: (round.players || []).length
    });
  }

  // ---------------------------------------------------------------------------
  // Golf API (unchanged behaviour)
  // ---------------------------------------------------------------------------
  function setApiStatus(message, isError) {
    if (!apiSearchStatus) return;
    apiSearchStatus.textContent = message;
    apiSearchStatus.classList.toggle("api-error", Boolean(isError));
  }

  function renderApiResults(courses) {
    if (!courses.length) {
      apiSearchResults.innerHTML = '<div class="catalog-empty">No matching courses found.</div>';
      return;
    }
    apiSearchResults.innerHTML = courses.map(function (course) {
      const location = course.location
        ? [course.location.city, course.location.state, course.location.country].filter(Boolean).join(", ")
        : "Location unavailable";
      const teeCounts = course.tees
        ? Object.entries(course.tees).map(function (e) { return e[0] + " " + e[1]; }).join(" · ")
        : "Tee data unavailable";
      return '<div class="api-result"><div><strong>' + escapeHtml(course.course_name || "Unnamed course") +
        "</strong><span>" + escapeHtml(course.club_name || "Golf club") + " · " + escapeHtml(location) +
        " · " + escapeHtml(teeCounts) +
        '</span></div><button class="button button-secondary" type="button" data-api-course-id="' +
        escapeHtml(course.id) + '">Import course</button></div>';
    }).join("");
  }

  async function searchGolfApi(formData) {
    const params = new URLSearchParams();
    ["name", "city", "country"].forEach(function (key) {
      const value = String(formData.get(key) || "").trim();
      if (value) params.set(key, value);
    });
    params.set("page", "1");
    setApiStatus("Searching…", false);
    apiSearchResults.innerHTML = "";
    try {
      const response = await fetch("/api/golf/courses?" + params.toString());
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Golf Course API search failed.");
      const list = Array.isArray(payload.courses) ? payload.courses : [];
      renderApiResults(list);
      setApiStatus(list.length + " result" + (list.length === 1 ? "" : "s") + " found", false);
    } catch (error) {
      apiSearchResults.innerHTML = '<div class="catalog-empty">' + escapeHtml(error.message) + "</div>";
      setApiStatus("Search unavailable", true);
    }
  }

  function normalizeGolfApiCourse(course) {
    if (!course || !course.id || !course.course_name) {
      throw new Error("The Golf Course API returned incomplete course data.");
    }
    const teeGroups = [];
    ["male", "female"].forEach(function (group) {
      const groupTees = course.tees && Array.isArray(course.tees[group]) ? course.tees[group] : [];
      groupTees.forEach(function (tee) { teeGroups.push({ group: group, tee: tee }); });
    });
    const teeSets = teeGroups
      .filter(function (entry) {
        return Number(entry.tee.number_of_holes) === 18 &&
          Array.isArray(entry.tee.holes) && entry.tee.holes.length === 18;
      })
      .map(function (entry) {
        const tee = entry.tee;
        const holes = tee.holes.map(function (hole, index) {
          return {
            number: index + 1,
            par: Number(hole.par),
            strokeIndex: Number(hole.handicap),
            distance: Number.isFinite(Number(hole.yardage)) && Number(hole.yardage) > 0
              ? Number(hole.yardage) : null
          };
        });
        if (holes.some(function (hole) {
          return !Number.isInteger(hole.par) || hole.par < 3 || hole.par > 6 ||
            !Number.isInteger(hole.strokeIndex) || hole.strokeIndex < 1 || hole.strokeIndex > 18;
        })) {
          throw new Error("The imported tee data contains invalid par or handicap values.");
        }
        return {
          id: "tee-golfcourseapi-" + entry.group + "-" + tee.tee_name,
          name: (tee.tee_name || "Unnamed tees") + " (" + (entry.group === "male" ? "Men" : "Women") + ")",
          colour: tee.tee_name || "Imported",
          rating: Number.isFinite(Number(tee.course_rating)) ? Number(tee.course_rating) : null,
          slope: Number.isFinite(Number(tee.slope_rating)) ? Number(tee.slope_rating) : null,
          active: true,
          holes: holes
        };
      });
    if (!teeSets.length) throw new Error("This course has no 18-hole tee boxes with complete hole data.");
    return {
      id: "course-golfcourseapi-" + course.id,
      source: "golfcourseapi",
      externalId: course.id,
      name: course.course_name,
      location: course.location
        ? [course.location.city, course.location.state, course.location.country].filter(Boolean).join(", ")
        : "",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      teeSets: teeSets
    };
  }

  async function importGolfApiCourse(courseId) {
    setApiStatus("Loading course details…", false);
    try {
      const response = await fetch("/api/golf/courses/" + encodeURIComponent(courseId));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Course import failed.");
      const course = normalizeGolfApiCourse(payload);
      const catalog = getCatalog().filter(function (e) { return e.id !== course.id; });
      saveCatalog(catalog.concat(course));
      renderCatalog();
      renderRounds();
      setApiStatus(course.name + " imported", false);
      apiSearchResults.innerHTML = '<div class="form-success">' + escapeHtml(course.name) +
        " imported with " + course.teeSets.length + " tee set" +
        (course.teeSets.length === 1 ? "" : "s") + ".</div>";
    } catch (error) {
      setApiStatus("Import unavailable", true);
      apiSearchResults.innerHTML = '<div class="catalog-empty">' + escapeHtml(error.message) + "</div>";
    }
  }

  // ---------------------------------------------------------------------------
  // Catalog / rounds UI
  // ---------------------------------------------------------------------------
  function buildHoleRows() {
    if (!holeRows) return;
    holeRows.innerHTML = Array.from({ length: 18 }, function (_, index) {
      const number = index + 1;
      return "<tr><th scope=\"row\">" + number + "</th>" +
        "<td><label class=\"sr-only\" for=\"hole-" + number + "-par\">Hole " + number + " par</label>" +
        "<input id=\"hole-" + number + "-par\" name=\"hole-" + number + "-par\" type=\"number\" min=\"3\" max=\"6\" step=\"1\" value=\"4\" required /></td>" +
        "<td><label class=\"sr-only\" for=\"hole-" + number + "-stroke\">Hole " + number + " stroke index</label>" +
        "<input id=\"hole-" + number + "-stroke\" name=\"hole-" + number + "-stroke\" type=\"number\" min=\"1\" max=\"18\" step=\"1\" value=\"" + number + "\" required /></td>" +
        "<td><label class=\"sr-only\" for=\"hole-" + number + "-distance\">Hole " + number + " distance</label>" +
        "<input id=\"hole-" + number + "-distance\" name=\"hole-" + number + "-distance\" type=\"number\" min=\"1\" max=\"1000\" step=\"1\" placeholder=\"—\" /></td></tr>";
    }).join("");
  }

  function renderCatalog() {
    const catalog = getCatalog();
    const teeSetCount = catalog.reduce(function (t, c) { return t + c.teeSets.length; }, 0);
    if (catalogCount) catalogCount.textContent = teeSetCount + " tee set" + (teeSetCount === 1 ? "" : "s");
    if (!catalog.length) {
      catalogList.innerHTML = '<div class="catalog-empty">No courses yet. Add your first course and tee set to make it available for round setup.</div>';
      return;
    }
    catalogList.innerHTML = catalog.map(function (course) {
      return course.teeSets.map(function (teeSet) {
        const parTotal = teeSet.holes.reduce(function (t, h) { return t + h.par; }, 0);
        const preview = teeSet.holes.map(function (h) {
          return "<span>" + h.number + "<br><strong>" + h.par + "</strong></span>";
        }).join("");
        return '<article class="catalog-card"><div class="catalog-card-header"><div><h3>' +
          escapeHtml(course.name) + "</h3><p>" + escapeHtml(course.location) +
          '</p></div><span class="tee-badge">' + escapeHtml(teeSet.colour) +
          " · Active</span></div><p class=\"tee-name\">" + escapeHtml(teeSet.name) +
          '</p><div class="catalog-meta"><div><span>Course par</span><strong>' + parTotal +
          "</strong></div><div><span>Holes</span><strong>18</strong></div><div><span>Rating</span><strong>" +
          escapeHtml(String(teeSet.rating || "—")) + "</strong></div><div><span>Slope</span><strong>" +
          escapeHtml(String(teeSet.slope || "—")) +
          '</strong></div></div><div class="hole-preview">' + preview +
          '</div><button class="catalog-edit" type="button" data-course-id="' +
          escapeHtml(course.id) + '" data-tee-id="' + escapeHtml(teeSet.id) +
          '">Edit tee set</button></article>';
      }).join("");
    }).join("");
    updateRoundButton();
  }

  function updateRoundButton() {
    if (createRoundButton) createRoundButton.disabled = getCatalog().length === 0;
  }

  function populateRoundCourses() {
    const catalog = getCatalog();
    roundCourse.innerHTML = catalog.length
      ? catalog.map(function (c) {
          return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + " · " + escapeHtml(c.location) + "</option>";
        }).join("")
      : '<option value="">Add a course first</option>';
    populateRoundTees();
  }

  function populateRoundTees() {
    const course = getCatalog().find(function (item) { return item.id === roundCourse.value; });
    roundTee.innerHTML = course && course.teeSets.length
      ? course.teeSets.map(function (t) {
          return '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + " · " + escapeHtml(t.colour) + "</option>";
        }).join("")
      : '<option value="">Add a tee set first</option>';
    renderRoundPreview();
  }

  function selectedTeeSet() {
    const course = getCatalog().find(function (item) { return item.id === roundCourse.value; });
    const teeSet = course && course.teeSets.find(function (item) { return item.id === roundTee.value; });
    return { course: course, teeSet: teeSet };
  }

  function renderRoundPreview() {
    const selection = selectedTeeSet();
    if (!selection.course || !selection.teeSet) {
      roundPreviewSummary.textContent = "Select a course and tee set.";
      roundPreview.innerHTML = "";
      return;
    }
    const parTotal = selection.teeSet.holes.reduce(function (t, h) { return t + h.par; }, 0);
    roundPreviewSummary.textContent = selection.course.name + " · " + selection.teeSet.name + " · Par " + parTotal;
    roundPreview.innerHTML = selection.teeSet.holes.map(function (h) {
      return '<div class="round-hole"><span>Hole ' + h.number + "</span><strong>" + h.par +
        "</strong><span>SI " + h.strokeIndex + "</span></div>";
    }).join("");
  }

  function renderRounds() {
    const rounds = getRounds();
    if (roundCount) roundCount.textContent = rounds.length + " round" + (rounds.length === 1 ? "" : "s");
    if (!rounds.length) {
      roundList.innerHTML = '<div class="round-empty">No rounds yet. Add a course and tee set, then create your first live round.</div>';
      return;
    }
    roundList.innerHTML = rounds.map(function (round) {
      const parTotal = round.teeSetSnapshot.holes.reduce(function (t, h) { return t + h.par; }, 0);
      const playerCount = Array.isArray(round.players) ? round.players.length : 0;
      const playerNames = Array.isArray(round.players)
        ? round.players.map(function (p) { return escapeHtml(p.displayName); }).join(", ")
        : "";
      return '<article class="round-card" data-round-id="' + escapeHtml(round.id) + '">' +
        '<div class="round-card-header"><div><h3>' + escapeHtml(round.courseName) +
        "</h3><p>" + escapeHtml(round.teeSetSnapshot.name) + " · " + escapeHtml(round.teeSetSnapshot.colour) +
        '</p></div><span class="tee-badge">' + escapeHtml(round.status) +
        '</span></div><div class="join-code"><span>Player join code</span><strong>' +
        escapeHtml(round.joinCode) + (round.joinCodeActive === false ? " (revoked)" : "") +
        '</strong></div><div class="round-meta">' +
        "<div><span>Holes</span><strong>18</strong></div>" +
        "<div><span>Course par</span><strong>" + parTotal + "</strong></div>" +
        "<div><span>Players</span><strong>" + playerCount + "</strong></div>" +
        "<div><span>Created</span><strong>" + new Date(round.createdAt).toLocaleDateString() +
        "</strong></div></div>" +
        (playerCount ? '<p class="muted" style="margin:0.5rem 0 0;">' + playerNames + "</p>" : "") +
        '<div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap;">' +
        '<button type="button" class="button button-secondary button-small view-leaderboard" data-round-id="' +
        escapeHtml(round.id) + '">Leaderboard</button></div></article>';
    }).join("");
  }

  function showCourseFormMessage(message, type) {
    if (!courseFormError || !courseFormSuccess) return;
    courseFormError.hidden = type !== "error";
    courseFormSuccess.hidden = type !== "success";
    if (type === "error") courseFormError.textContent = message;
    if (type === "success") courseFormSuccess.textContent = message;
  }

  function collectCourse(formData) {
    const courseName = String(formData.get("courseName") || "").trim();
    const location = String(formData.get("location") || "").trim();
    const teeName = String(formData.get("teeName") || "").trim();
    if (!courseName || !location || !teeName) {
      throw new Error("Course name, location, and tee set name are required.");
    }
    const strokes = [];
    const holes = Array.from({ length: 18 }, function (_, index) {
      const number = index + 1;
      const par = Number(formData.get("hole-" + number + "-par"));
      const strokeIndex = Number(formData.get("hole-" + number + "-stroke"));
      const distanceValue = String(formData.get("hole-" + number + "-distance") || "").trim();
      const distance = distanceValue ? Number(distanceValue) : null;
      if (!Number.isInteger(par) || par < 3 || par > 6) {
        throw new Error("Hole " + number + " par must be a whole number from 3 to 6.");
      }
      if (!Number.isInteger(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) {
        throw new Error("Hole " + number + " stroke index must be a whole number from 1 to 18.");
      }
      if (strokes.includes(strokeIndex)) {
        throw new Error("Stroke index " + strokeIndex + " is used more than once.");
      }
      if (distanceValue && (!Number.isInteger(distance) || distance < 1 || distance > 1000)) {
        throw new Error("Hole " + number + " distance must be a whole number from 1 to 1000.");
      }
      strokes.push(strokeIndex);
      return { number: number, par: par, strokeIndex: strokeIndex, distance: distance };
    });
    const ratingValue = String(formData.get("rating") || "").trim();
    const slopeValue = String(formData.get("slope") || "").trim();
    const rating = ratingValue ? Number(ratingValue) : null;
    const slope = slopeValue ? Number(slopeValue) : null;
    if (ratingValue && (!Number.isFinite(rating) || rating < 0 || rating > 150)) {
      throw new Error("Course rating must be between 0 and 150.");
    }
    if (slopeValue && (!Number.isInteger(slope) || slope < 0 || slope > 200)) {
      throw new Error("Slope rating must be a whole number from 0 to 200.");
    }
    return {
      id: "course-" + Date.now(),
      name: courseName,
      location: location,
      active: true,
      createdAt: new Date().toISOString(),
      teeSets: [{
        id: "tee-" + Date.now(),
        name: teeName,
        colour: String(formData.get("teeColour") || "White"),
        rating: rating,
        slope: slope,
        active: true,
        holes: holes
      }]
    };
  }

  // ---------------------------------------------------------------------------
  // Player join (Task 05 + max players)
  // ---------------------------------------------------------------------------
  function joinRoundWithDetails(joinCode, displayName, playingHandicap) {
    const name = String(displayName || "").trim().replace(/\s+/g, " ");
    if (!name) return { ok: false, error: "Display name is required." };
    if (name.length > 40) return { ok: false, error: "Display name must be 40 characters or fewer." };
    const hcp = Number(playingHandicap);
    if (!Number.isInteger(hcp) || hcp < 0 || hcp > 54) {
      return { ok: false, error: "Playing handicap must be a whole number from 0 to 54." };
    }
    const round = getRoundByJoinCode(joinCode);
    if (!round) return { ok: false, error: "Invalid or inactive join code." };
    if (!Array.isArray(round.players)) round.players = [];
    if (round.players.length >= MAX_PLAYERS_PER_ROUND) {
      return { ok: false, error: "This round is full (max " + MAX_PLAYERS_PER_ROUND + " players)." };
    }
    const normalized = normalizeName(name);
    if (round.players.some(function (p) { return normalizeName(p.displayName) === normalized; })) {
      return { ok: false, error: "That name is already taken in this round. Choose a different display name." };
    }
    const player = {
      id: makeOpaqueId("player"),
      displayName: name,
      playingHandicap: hcp,
      role: "player",
      joinedAt: new Date().toISOString()
    };
    const updated = updateRound(round.id, function (r) {
      if (!Array.isArray(r.players)) r.players = [];
      r.players.push(player);
      if (!Array.isArray(r.scores)) r.scores = [];
      if (!Array.isArray(r.scoreHistory)) r.scoreHistory = [];
      return r;
    });
    if (!updated) return { ok: false, error: "Could not join the round." };
    const session = authAdapter.createPlayerSession(updated.id, player);
    return { ok: true, session: session, round: updated };
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------
  if (showHostAuth) {
    showHostAuth.addEventListener("click", function () {
      if (authOptions) authOptions.hidden = true;
      if (joinRoundForm) joinRoundForm.hidden = true;
      if (magicLinkForm) { magicLinkForm.hidden = false; emailInput.focus(); }
    });
  }
  if (showJoinAuth) {
    showJoinAuth.addEventListener("click", function () {
      if (authOptions) authOptions.hidden = true;
      if (magicLinkForm) magicLinkForm.hidden = true;
      if (joinRoundForm) { joinRoundForm.hidden = false; joinCodeInput.focus(); }
    });
  }
  if (backToAuth) backToAuth.addEventListener("click", showAuth);
  if (backToAuthJoin) backToAuthJoin.addEventListener("click", showAuth);

  magicLinkForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const email = emailInput.value.trim();
    const valid = isValidEmail(email);
    emailInput.setAttribute("aria-invalid", String(!valid));
    emailError.hidden = valid;
    if (!valid) { emailInput.focus(); return; }
    authAdapter.requestMagicLink(email);
    sentEmail.textContent = email;
    magicLinkSent.hidden = false;
    openDemoLink.focus();
  });

  openDemoLink.addEventListener("click", function () {
    const email = window.localStorage.getItem("fairway-live-pending-email");
    if (email) showHostDashboard(authAdapter.completeMagicLink(email));
  });

  if (joinRoundForm) {
    joinRoundForm.addEventListener("submit", function (event) {
      event.preventDefault();
      joinCodeError.hidden = true;
      const result = joinRoundWithDetails(joinCodeInput.value.trim(), playerNameInput.value, playerHandicapInput.value);
      if (!result.ok) {
        joinCodeError.textContent = result.error;
        joinCodeError.hidden = false;
        return;
      }
      showPlayerDashboard(result.session);
    });
  }

  function doSignOut() {
    authAdapter.signOut();
    if (magicLinkSent) magicLinkSent.hidden = true;
    if (magicLinkForm) magicLinkForm.reset();
    if (joinRoundForm) joinRoundForm.reset();
    if (emailInput) emailInput.removeAttribute("aria-invalid");
    if (emailError) emailError.hidden = true;
    if (joinCodeError) joinCodeError.hidden = true;
    showAuth();
  }
  if (signOut) signOut.addEventListener("click", doSignOut);
  if (signOutPlayer) signOutPlayer.addEventListener("click", doSignOut);

  courseForm.addEventListener("submit", function (event) {
    event.preventDefault();
    showCourseFormMessage("", "none");
    try {
      const course = collectCourse(new FormData(courseForm));
      const catalog = getCatalog();
      if (editingCourseId && editingTeeId) {
        saveCatalog(catalog.map(function (existingCourse) {
          if (existingCourse.id !== editingCourseId) return existingCourse;
          return { ...course, id: existingCourse.id, teeSets: [{ ...course.teeSets[0], id: editingTeeId }] };
        }));
      } else {
        saveCatalog(catalog.concat(course));
      }
      editingCourseId = null;
      editingTeeId = null;
      courseSubmit.textContent = "Save course and tee set";
      courseForm.reset();
      buildHoleRows();
      showCourseFormMessage("Course and tee set saved.", "success");
      renderCatalog();
      renderRounds();
    } catch (error) {
      showCourseFormMessage(error.message, "error");
    }
  });

  catalogList.addEventListener("click", function (event) {
    const editButton = event.target.closest("[data-course-id][data-tee-id]");
    if (!editButton) return;
    const course = getCatalog().find(function (item) { return item.id === editButton.dataset.courseId; });
    const teeSet = course && course.teeSets.find(function (item) { return item.id === editButton.dataset.teeId; });
    if (!course || !teeSet) return;
    editingCourseId = course.id;
    editingTeeId = teeSet.id;
    courseForm.elements.courseName.value = course.name;
    courseForm.elements.location.value = course.location;
    courseForm.elements.teeName.value = teeSet.name;
    courseForm.elements.teeColour.value = teeSet.colour;
    courseForm.elements.rating.value = teeSet.rating || "";
    courseForm.elements.slope.value = teeSet.slope || "";
    teeSet.holes.forEach(function (hole) {
      courseForm.elements["hole-" + hole.number + "-par"].value = hole.par;
      courseForm.elements["hole-" + hole.number + "-stroke"].value = hole.strokeIndex;
      courseForm.elements["hole-" + hole.number + "-distance"].value = hole.distance || "";
    });
    courseSubmit.textContent = "Update course and tee set";
    courseForm.scrollIntoView({ behavior: "smooth", block: "start" });
    courseForm.elements.courseName.focus();
  });

  golfApiSearch.addEventListener("submit", function (event) {
    event.preventDefault();
    searchGolfApi(new FormData(golfApiSearch));
  });
  apiSearchResults.addEventListener("click", function (event) {
    const importButton = event.target.closest("[data-api-course-id]");
    if (importButton) importGolfApiCourse(importButton.dataset.apiCourseId);
  });

  createRoundButton.addEventListener("click", function () {
    populateRoundCourses();
    roundSetup.hidden = false;
    roundSetup.scrollIntoView({ behavior: "smooth", block: "start" });
    roundCourse.focus();
  });
  cancelRoundSetup.addEventListener("click", function () {
    roundSetup.hidden = true;
    createRoundButton.focus();
  });
  roundCourse.addEventListener("change", populateRoundTees);
  roundTee.addEventListener("change", renderRoundPreview);

  roundForm.addEventListener("submit", function (event) {
    event.preventDefault();
    roundFormError.hidden = true;
    const selection = selectedTeeSet();
    if (!selection.course || !selection.teeSet || selection.teeSet.holes.length !== 18) {
      roundFormError.textContent = "Select a valid course and tee set with exactly 18 holes.";
      roundFormError.hidden = false;
      return;
    }
    const snapshot = JSON.parse(JSON.stringify(selection.teeSet));
    const session = authAdapter.getSession();
    const round = {
      id: makeOpaqueId("round"),
      hostEmail: session && session.email ? session.email : "",
      joinCode: makeJoinCode(),
      joinCodeActive: true,
      courseName: selection.course.name,
      courseLocation: selection.course.location,
      teeSetSnapshot: snapshot,
      status: "setup",
      createdAt: new Date().toISOString(),
      completedAt: null,
      players: [],
      scores: [],
      scoreHistory: []
    };
    saveRounds(getRounds().concat(round));
    roundSetup.hidden = true;
    renderRounds();
    roundsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  if (roundList) {
    roundList.addEventListener("click", function (event) {
      const btn = event.target.closest(".view-leaderboard");
      if (btn && btn.dataset.roundId) openLeaderboard(btn.dataset.roundId);
    });
  }

  if (backToRounds) {
    backToRounds.addEventListener("click", function () {
      const session = authAdapter.getSession();
      if (session && session.role === "host") showHostDashboard(session);
      else if (session && session.role === "player") showPlayerDashboard(session);
      else showAuth();
    });
  }

  if (backToLeaderboard) {
    backToLeaderboard.addEventListener("click", function () {
      if (currentLeaderboardRoundId) openLeaderboard(currentLeaderboardRoundId);
      else {
        const session = authAdapter.getSession();
        if (session && session.role === "player") showPlayerDashboard(session);
      }
    });
  }

  const exitScoreEntry = document.querySelector("#exit-score-entry");
  if (exitScoreEntry) {
    exitScoreEntry.addEventListener("click", function () {
      const session = authAdapter.getSession();
      if (session && session.role === "player") showPlayerDashboard(session);
    });
  }

  // Host control buttons
  function bindHostBtn(id, fn) {
    const el = document.querySelector(id);
    if (el) el.addEventListener("click", fn);
  }
  bindHostBtn("#host-mark-active", function () {
    if (currentLeaderboardRoundId) setRoundStatus(currentLeaderboardRoundId, "active");
  });
  bindHostBtn("#host-ready-export", function () {
    if (currentLeaderboardRoundId) setRoundStatus(currentLeaderboardRoundId, "ready_for_export");
  });
  bindHostBtn("#host-close-round", function () {
    if (currentLeaderboardRoundId) setRoundStatus(currentLeaderboardRoundId, "closed");
  });
  bindHostBtn("#host-reopen-round", function () {
    if (currentLeaderboardRoundId) setRoundStatus(currentLeaderboardRoundId, "active");
  });
  bindHostBtn("#host-revoke-code", function () {
    if (!currentLeaderboardRoundId) return;
    updateRound(currentLeaderboardRoundId, function (r) {
      r.joinCodeActive = false;
      return r;
    });
    const round = getRoundById(currentLeaderboardRoundId);
    if (round) {
      renderLeaderboard(round);
      renderHostPanel(round);
    }
  });
  bindHostBtn("#host-export-xlsx", function () {
    if (currentLeaderboardRoundId) exportRoundXlsx(currentLeaderboardRoundId);
  });
  bindHostBtn("#host-correct-save", function () {
    if (!currentLeaderboardRoundId) return;
    const session = authAdapter.getSession();
    const playerId = document.querySelector("#host-correct-player").value;
    const holeNumber = Number(document.querySelector("#host-correct-hole").value);
    const score = document.querySelector("#host-correct-score").value;
    const msg = document.querySelector("#host-correct-msg");
    const result = setScore(currentLeaderboardRoundId, playerId, holeNumber, score, session.email || "host", {
      expectedVersion: null
    });
    // Host correction: force write even on version mismatch
    if (result.conflict) {
      updateRound(currentLeaderboardRoundId, function (r) {
        if (!Array.isArray(r.scores)) r.scores = [];
        const idx = r.scores.findIndex(function (s) {
          return s.playerId === playerId && s.holeNumber === holeNumber;
        });
        const now = new Date().toISOString();
        const scoreNum = Number(score);
        if (idx >= 0) {
          r.scoreHistory = r.scoreHistory || [];
          r.scoreHistory.push({
            id: makeOpaqueId("hist"),
            playerId: playerId,
            holeNumber: holeNumber,
            previousScore: r.scores[idx].grossScore,
            newScore: scoreNum,
            actorId: session.email || "host",
            createdAt: now
          });
          r.scores[idx].grossScore = scoreNum;
          r.scores[idx].version = (r.scores[idx].version || 1) + 1;
          r.scores[idx].updatedAt = now;
          r.scores[idx].enteredBy = session.email || "host";
        } else {
          r.scores.push({
            id: makeOpaqueId("score"),
            playerId: playerId,
            holeNumber: holeNumber,
            grossScore: scoreNum,
            version: 1,
            updatedAt: now,
            enteredBy: session.email || "host"
          });
        }
        return r;
      });
      broadcast("score-updated", { roundId: currentLeaderboardRoundId });
      if (msg) { msg.hidden = false; msg.textContent = "Correction saved."; msg.className = "score-message saved"; }
    } else if (!result.ok) {
      if (msg) { msg.hidden = false; msg.textContent = result.error; msg.className = "score-message error"; }
      return;
    } else {
      if (msg) { msg.hidden = false; msg.textContent = "Correction saved."; msg.className = "score-message saved"; }
    }
    const round = getRoundById(currentLeaderboardRoundId);
    if (round) {
      renderLeaderboard(round);
      renderHostPanel(round);
    }
  });

  // Online/offline
  window.addEventListener("online", function () {
    if (offlineBanner) offlineBanner.hidden = true;
    // Flush drafts for current player
    const session = authAdapter.getSession();
    if (session && session.role === "player") {
      const drafts = getDrafts();
      Object.keys(drafts).forEach(function (key) {
        const parts = key.split(":");
        if (parts[0] === session.roundId && parts[1] === session.playerId) {
          setScore(session.roundId, session.playerId, Number(parts[2]), drafts[key].grossScore, session.playerId);
        }
      });
    }
    logMetric("reconnect", {});
  });
  window.addEventListener("offline", function () {
    if (offlineBanner) offlineBanner.hidden = false;
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  setupBroadcast();
  buildHoleRows();

  const initialSession = authAdapter.getSession();
  const initialJoinCode = new URLSearchParams(window.location.search).get("joinCode");

  if (initialJoinCode && joinCodeInput) {
    joinCodeInput.value = initialJoinCode.toUpperCase();
    if (!initialSession) {
      if (authOptions) authOptions.hidden = true;
      if (joinRoundForm) { joinRoundForm.hidden = false; playerNameInput.focus(); }
    }
  }

  if (initialSession && initialSession.role === "host" && initialSession.email) {
    showHostDashboard(initialSession);
  } else if (initialSession && initialSession.role === "player" && initialSession.roundId) {
    showPlayerDashboard(initialSession);
  } else {
    showAuth();
  }
})();
