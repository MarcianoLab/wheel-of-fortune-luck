(function () {
  "use strict";

  var TOTAL_TRIALS = 20;
  var WIN_DEGREES = 288;
  var BET_OPTIONS = [1, 5, 10];
  var SPIN_DURATION_MS = 3200;

  var state = {
    condition: 1,
    trial: 1,
    bankroll: 0,
    currentBet: null,
    selectedRating: null,
    currentRotation: 0,
    catchTrials: {},
    lastResult: null,
    isSpinning: false,
    spinFallbackTimer: null,
    qualtricsContext: null
  };

  var els = {};

  function ready(callback) {
    var didRun = false;

    function runOnce(qualtricsContext) {
      if (didRun) {
        return;
      }

      didRun = true;
      callback(qualtricsContext || null);
    }

    if (window.Qualtrics && Qualtrics.SurveyEngine && typeof Qualtrics.SurveyEngine.addOnload === "function") {
      Qualtrics.SurveyEngine.addOnload(function () {
        runOnce(this);
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        runOnce(null);
      });
    } else {
      window.setTimeout(function () {
        runOnce(null);
      }, 0);
    }
  }

  function getQualtricsEmbeddedData(key) {
    if (window.Qualtrics && Qualtrics.SurveyEngine && typeof Qualtrics.SurveyEngine.getEmbeddedData === "function") {
      return Qualtrics.SurveyEngine.getEmbeddedData(key);
    }
    return null;
  }

  function getQueryParam(key) {
    var params;

    try {
      params = new URLSearchParams(window.location.search);
    } catch (error) {
      return null;
    }

    return params.get(key);
  }

  function setQualtricsEmbeddedData(key, value) {
    var storedValue = value === null || typeof value === "undefined" ? "null" : String(value);

    if (window.Qualtrics && Qualtrics.SurveyEngine && typeof Qualtrics.SurveyEngine.setEmbeddedData === "function") {
      Qualtrics.SurveyEngine.setEmbeddedData(key, storedValue);
    }
  }

  function clickQualtricsNext() {
    if (state.qualtricsContext && typeof state.qualtricsContext.clickNextButton === "function") {
      state.qualtricsContext.clickNextButton();
      return;
    }

    if (window.Qualtrics && Qualtrics.SurveyEngine && typeof Qualtrics.SurveyEngine.clickNextButton === "function") {
      Qualtrics.SurveyEngine.clickNextButton();
      return;
    }

    var nextButton = document.getElementById("NextButton");
    if (nextButton) {
      nextButton.click();
    }
  }

  function hideQualtricsNext() {
    if (state.qualtricsContext && typeof state.qualtricsContext.hideNextButton === "function") {
      state.qualtricsContext.hideNextButton();
    }

    var nextButton = document.getElementById("NextButton");
    if (nextButton) {
      nextButton.style.display = "none";
    }
  }

  function normalizeDegrees(degrees) {
    return ((degrees % 360) + 360) % 360;
  }

  function roundDegrees(degrees) {
    return Math.round(degrees * 100) / 100;
  }

  function parseCondition(rawCondition) {
    var condition = String(rawCondition || "").trim().toLowerCase();

    if (!condition || condition.indexOf("${") !== -1) {
      return null;
    }

    if (condition.indexOf("3") !== -1 || condition.indexOf("endogenous") !== -1 || condition.indexOf("choice") !== -1 || condition.indexOf("choose") !== -1) {
      return 3;
    }

    if (condition.indexOf("2") !== -1 || condition.indexOf("random") !== -1 || condition.indexOf("exogenous") !== -1 || condition.indexOf("assigned") !== -1) {
      return 2;
    }

    if (condition.indexOf("1") !== -1 || condition.indexOf("fixed") !== -1) {
      return 1;
    }

    return null;
  }

  function getConfiguredCondition() {
    var sources = [
      getQualtricsEmbeddedData("Condition"),
      getQualtricsEmbeddedData("condition"),
      els.root ? els.root.getAttribute("data-condition") : null,
      getQueryParam("Condition"),
      getQueryParam("condition")
    ];
    var i;
    var parsed;

    for (i = 0; i < sources.length; i += 1) {
      parsed = parseCondition(sources[i]);
      if (parsed) {
        return {
          condition: parsed,
          raw: sources[i]
        };
      }
    }

    return {
      condition: 1,
      raw: ""
    };
  }

  function conditionLabel(condition) {
    if (condition === 1) {
      return "Complete each spin and answer the prompt.";
    }

    if (condition === 2) {
      return "Complete each spin and answer the prompt.";
    }

    return "Choose an option before each spin, then answer the prompt.";
  }

  function getRandomBet() {
    return BET_OPTIONS[Math.floor(Math.random() * BET_OPTIONS.length)];
  }

  function buildCatchTrials() {
    var trials = [];

    while (trials.length < 2) {
      var candidate = Math.floor(Math.random() * TOTAL_TRIALS) + 1;
      if (trials.indexOf(candidate) === -1) {
        trials.push(candidate);
      }
    }

    trials.forEach(function (trialNumber) {
      state.catchTrials[trialNumber] = Math.floor(Math.random() * 10) + 1;
    });
  }

  function cacheElements() {
    els.root = document.getElementById("wof-experiment");
    els.conditionLabel = document.getElementById("wof-condition-label");
    els.trialLabel = document.getElementById("wof-trial-label");
    els.progressBar = document.getElementById("wof-progress-bar");
    els.currentBet = document.getElementById("wof-current-bet");
    els.bankroll = document.getElementById("wof-bankroll");
    els.betPanel = document.getElementById("wof-bet-panel");
    els.assignedWager = document.getElementById("wof-assigned-wager");
    els.payoffWin = document.getElementById("wof-payoff-win");
    els.payoffLoss = document.getElementById("wof-payoff-loss");
    els.betButtons = Array.prototype.slice.call(document.querySelectorAll(".wof-bet-button"));
    els.spinButton = document.getElementById("wof-spin-button");
    els.status = document.getElementById("wof-status");
    els.wheel = document.getElementById("wof-wheel");
    els.modal = document.getElementById("wof-modal");
    els.modalTitle = document.getElementById("wof-modal-title");
    els.modalMessage = document.getElementById("wof-modal-message");
    els.ratingButtons = document.getElementById("wof-rating-buttons");
    els.scaleLabels = document.getElementById("wof-scale-labels");
    els.nextButton = document.getElementById("wof-next-button");
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function updateProgress() {
    var completed = state.trial - 1;
    var percent = ((completed / TOTAL_TRIALS) * 100).toFixed(2) + "%";
    els.trialLabel.textContent = state.trial + "/" + TOTAL_TRIALS;
    els.progressBar.style.width = percent;

    if (els.bankroll) {
      els.bankroll.textContent = state.bankroll + " tokens";
    }

    if (els.currentBet) {
      els.currentBet.textContent = state.currentBet === null ? "-" : state.currentBet + " tokens";
    }
  }

  function updateConditionControls() {
    var isChoiceCondition = state.condition === 3;
    var showAssignedMessage = state.condition === 2;

    if (els.betPanel) {
      els.betPanel.classList.toggle("is-hidden", !isChoiceCondition);
    }

    if (els.assignedWager) {
      els.assignedWager.classList.toggle("is-visible", showAssignedMessage);
    }
  }

  function updatePayoffPanel() {
    var betText = state.currentBet === null ? "-" : state.currentBet + " token" + (state.currentBet === 1 ? "" : "s");

    if (els.payoffWin) {
      els.payoffWin.textContent = state.currentBet === null ? "+ -" : "+" + betText;
    }

    if (els.payoffLoss) {
      els.payoffLoss.textContent = state.currentBet === null ? "- -" : "-" + betText;
    }
  }

  function setBetButtonState() {
    els.betButtons.forEach(function (button) {
      var bet = Number(button.getAttribute("data-bet"));
      var isActive = bet === state.currentBet;
      var isChoiceCondition = state.condition === 3;
      button.disabled = !isChoiceCondition || state.isSpinning;
      button.classList.toggle("is-active", isActive);
    });
  }

  function setSpinAvailability() {
    els.spinButton.disabled = state.isSpinning || state.currentBet === null;
  }

  function prepareTrial() {
    state.selectedRating = null;
    state.lastResult = null;
    state.isSpinning = false;

    if (state.condition === 1) {
      state.currentBet = 5;
      setStatus("Ready to spin.");
    } else if (state.condition === 2) {
      state.currentBet = getRandomBet();
      setStatus("Ready to spin.");
    } else {
      state.currentBet = null;
      setStatus("Select a wager to continue.");
    }

    updateConditionControls();
    updatePayoffPanel();
    updateProgress();
    setBetButtonState();
    setSpinAvailability();
  }

  function selectBet(event) {
    if (state.condition !== 3 || state.isSpinning) {
      return;
    }

    state.currentBet = Number(event.currentTarget.getAttribute("data-bet"));
    setStatus("Ready to spin.");
    updatePayoffPanel();
    updateProgress();
    setBetButtonState();
    setSpinAvailability();
  }

  function chooseSpinTarget() {
    var landedDegree = Math.random() * 360;
    var desiredRotationMod = normalizeDegrees(360 - landedDegree);
    var currentMod = normalizeDegrees(state.currentRotation);
    var deltaToDesiredMod = normalizeDegrees(desiredRotationMod - currentMod);
    var fullSpins = 5 + Math.floor(Math.random() * 3);
    var finalRotation = state.currentRotation + fullSpins * 360 + deltaToDesiredMod;
    var outcome = landedDegree < WIN_DEGREES ? "Win" : "Loss";

    return {
      landedDegree: roundDegrees(landedDegree),
      outcome: outcome,
      finalRotation: finalRotation
    };
  }

  function spinWheel() {
    if (state.isSpinning || state.currentBet === null) {
      return;
    }

    state.isSpinning = true;
    setSpinAvailability();
    setBetButtonState();
    setStatus("Spinning...");

    var result = chooseSpinTarget();
    state.lastResult = result;

    if (state.spinFallbackTimer) {
      window.clearTimeout(state.spinFallbackTimer);
      state.spinFallbackTimer = null;
    }

    function completeSpin() {
      if (!state.isSpinning) {
        return;
      }

      finishSpin(result);
    }

    function handleTransitionEnd(event) {
      if (event.target !== els.wheel || event.propertyName !== "transform") {
        return;
      }

      els.wheel.removeEventListener("transitionend", handleTransitionEnd);
      completeSpin();
    }

    els.wheel.addEventListener("transitionend", handleTransitionEnd);
    els.wheel.style.transform = "rotate(" + result.finalRotation + "deg)";
    state.currentRotation = result.finalRotation;

    state.spinFallbackTimer = window.setTimeout(function () {
      els.wheel.removeEventListener("transitionend", handleTransitionEnd);
      completeSpin();
    }, SPIN_DURATION_MS + 150);
  }

  function finishSpin(result) {
    if (!state.isSpinning) {
      return;
    }

    state.isSpinning = false;

    if (state.spinFallbackTimer) {
      window.clearTimeout(state.spinFallbackTimer);
      state.spinFallbackTimer = null;
    }

    var tokenChange = result.outcome === "Win" ? state.currentBet : -state.currentBet;
    state.bankroll += tokenChange;
    updateProgress();
    showModal(result);
  }

  function buildRatingButtons() {
    els.ratingButtons.innerHTML = "";

    for (var i = 1; i <= 10; i += 1) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = String(i);
      button.setAttribute("data-rating", String(i));
      button.className = "wof-rating-button";
      button.addEventListener("click", selectRating);
      els.ratingButtons.appendChild(button);
    }
  }

  function showModal(result) {
    var isCatchTrial = Object.prototype.hasOwnProperty.call(state.catchTrials, state.trial);

    state.selectedRating = null;
    els.nextButton.disabled = true;
    els.modalTitle.classList.remove("is-win", "is-loss");
    els.modalTitle.style.color = "";
    buildRatingButtons();

    if (isCatchTrial) {
      els.modalTitle.textContent = "Attention Check";
      els.modalMessage.textContent = "Are you still with us? If so, select the number " + state.catchTrials[state.trial] + ".";
      if (els.scaleLabels) {
        els.scaleLabels.style.display = "none";
      }
    } else {
      var tokenText = state.currentBet + " token" + (state.currentBet === 1 ? "" : "s");
      var isWin = result.outcome === "Win";
      els.modalTitle.textContent = isWin ? "You won " + tokenText + "!" : "You lost " + tokenText + "!";
      els.modalTitle.classList.add(isWin ? "is-win" : "is-loss");
      els.modalTitle.style.color = isWin ? "#15803d" : "#b91c1c";
      els.modalMessage.textContent = "";
      if (els.scaleLabels) {
        els.scaleLabels.style.display = "grid";
      }
    }

    els.modal.classList.add("is-open");
  }

  function selectRating(event) {
    state.selectedRating = Number(event.currentTarget.getAttribute("data-rating"));

    Array.prototype.slice.call(els.ratingButtons.children).forEach(function (button) {
      var isActive = Number(button.getAttribute("data-rating")) === state.selectedRating;
      button.classList.toggle("is-active", isActive);
    });

    els.nextButton.disabled = false;
  }

  function saveTrialData() {
    var prefix = "T" + state.trial + "_";
    var isCatchTrial = Object.prototype.hasOwnProperty.call(state.catchTrials, state.trial);
    var attentionPassed = isCatchTrial ? state.selectedRating === state.catchTrials[state.trial] : null;
    var luckyScore = isCatchTrial ? null : state.selectedRating;

    setQualtricsEmbeddedData(prefix + "bet_size", state.currentBet);
    setQualtricsEmbeddedData(prefix + "degree_landed", state.lastResult.landedDegree);
    setQualtricsEmbeddedData(prefix + "outcome", state.lastResult.outcome);
    setQualtricsEmbeddedData(prefix + "bankroll", state.bankroll);
    setQualtricsEmbeddedData(prefix + "lucky_score", luckyScore);
    setQualtricsEmbeddedData(prefix + "attention_passed", attentionPassed);
  }

  function closeModal() {
    els.modal.classList.remove("is-open");
  }

  function advanceTrial() {
    if (state.selectedRating === null || !state.lastResult) {
      return;
    }

    saveTrialData();
    closeModal();

    if (state.trial >= TOTAL_TRIALS) {
      els.progressBar.style.width = "100%";
      setStatus("Task complete. Advancing...");
      window.setTimeout(clickQualtricsNext, 250);
      return;
    }

    state.trial += 1;
    prepareTrial();
  }

  function bindEvents() {
    els.betButtons.forEach(function (button) {
      button.addEventListener("click", selectBet);
    });

    els.spinButton.addEventListener("click", spinWheel);
    els.nextButton.addEventListener("click", advanceTrial);
  }

  function init(qualtricsContext) {
    state.qualtricsContext = qualtricsContext;
    cacheElements();

    if (!els.root) {
      return;
    }

    hideQualtricsNext();
    var conditionInfo = getConfiguredCondition();
    state.condition = conditionInfo.condition;
    setQualtricsEmbeddedData("wof_condition_detected", state.condition);
    setQualtricsEmbeddedData("wof_condition_raw", conditionInfo.raw);
    els.conditionLabel.textContent = conditionLabel(state.condition);
    buildCatchTrials();
    bindEvents();
    prepareTrial();
  }

  ready(init);
})();
