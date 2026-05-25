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

    if (condition === "1" || condition === "fixed" || condition === "condition 1") {
      return 1;
    }

    if (condition === "2" || condition === "random" || condition === "random exogenous" || condition === "exogenous" || condition === "condition 2") {
      return 2;
    }

    if (condition === "3" || condition === "endogenous" || condition === "choice" || condition === "condition 3") {
      return 3;
    }

    return 1;
  }

  function conditionLabel(condition) {
    if (condition === 1) {
      return "Condition 1: Fixed wager";
    }

    if (condition === 2) {
      return "Condition 2: Randomly assigned wager";
    }

    return "Condition 3: Participant-selected wager";
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
    els.betButtons = Array.prototype.slice.call(document.querySelectorAll(".wof-bet-button"));
    els.spinButton = document.getElementById("wof-spin-button");
    els.status = document.getElementById("wof-status");
    els.wheel = document.getElementById("wof-wheel");
    els.modal = document.getElementById("wof-modal");
    els.modalTitle = document.getElementById("wof-modal-title");
    els.modalMessage = document.getElementById("wof-modal-message");
    els.ratingButtons = document.getElementById("wof-rating-buttons");
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
    els.bankroll.textContent = state.bankroll + " tokens";
    els.currentBet.textContent = state.currentBet === null ? "-" : state.currentBet + " tokens";
  }

  function setBetButtonState() {
    els.betButtons.forEach(function (button) {
      var bet = Number(button.getAttribute("data-bet"));
      var isActive = bet === state.currentBet;
      var isChoiceCondition = state.condition === 3;
      button.disabled = !isChoiceCondition || state.isSpinning;
      button.classList.toggle("border-emerald-600", isActive);
      button.classList.toggle("bg-emerald-50", isActive);
      button.classList.toggle("text-emerald-800", isActive);
      button.classList.toggle("border-slate-300", !isActive);
      button.classList.toggle("text-slate-800", !isActive);
      button.classList.toggle("opacity-60", !isChoiceCondition);
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
      setStatus("The wager is fixed at 5 tokens.");
    } else if (state.condition === 2) {
      state.currentBet = getRandomBet();
      setStatus("The system assigned this trial's wager.");
    } else {
      state.currentBet = null;
      setStatus("Select a wager to continue.");
    }

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
    els.wheel.style.transform = "rotate(" + result.finalRotation + "deg)";
    state.currentRotation = result.finalRotation;

    window.setTimeout(function () {
      finishSpin(result);
    }, SPIN_DURATION_MS + 150);
  }

  function finishSpin(result) {
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
      button.className = "rounded-md border border-slate-300 px-2 py-3 text-sm font-semibold text-slate-800 transition hover:border-emerald-600 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500";
      button.addEventListener("click", selectRating);
      els.ratingButtons.appendChild(button);
    }
  }

  function showModal(result) {
    var isCatchTrial = Object.prototype.hasOwnProperty.call(state.catchTrials, state.trial);
    var signedBetText = state.currentBet + " token" + (state.currentBet === 1 ? "" : "s");

    state.selectedRating = null;
    els.nextButton.disabled = true;
    buildRatingButtons();

    if (isCatchTrial) {
      els.modalTitle.textContent = "Attention Check";
      els.modalMessage.textContent = "Are you still with us? If so, select the number " + state.catchTrials[state.trial] + ".";
    } else {
      els.modalTitle.textContent = result.outcome === "Win" ? "You won" : "You lost";
      els.modalMessage.textContent = (result.outcome === "Win" ? "You won " : "You lost ") + signedBetText + ". Rate your perceived chance of a positive outcome on a scale of 1 to 10.";
    }

    els.modal.classList.remove("hidden");
    els.modal.classList.add("flex");
  }

  function selectRating(event) {
    state.selectedRating = Number(event.currentTarget.getAttribute("data-rating"));

    Array.prototype.slice.call(els.ratingButtons.children).forEach(function (button) {
      var isActive = Number(button.getAttribute("data-rating")) === state.selectedRating;
      button.classList.toggle("border-emerald-600", isActive);
      button.classList.toggle("bg-emerald-600", isActive);
      button.classList.toggle("text-white", isActive);
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
    els.modal.classList.add("hidden");
    els.modal.classList.remove("flex");
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
    state.condition = parseCondition(getQualtricsEmbeddedData("Condition"));
    els.conditionLabel.textContent = conditionLabel(state.condition);
    buildCatchTrials();
    bindEvents();
    prepareTrial();
  }

  ready(init);
})();
