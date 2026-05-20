Qualtrics.SurveyEngine.addOnload(function() {
    var qualtricsContext = this;

    const subjectId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'subj-' + Math.random().toString(36).substring(2, 15);

    // DOM Elements
    const mainView = document.getElementById('main-view');
    const surveyModal = document.getElementById('survey-modal');

    const wheel = document.getElementById('wheel');
    const spinButton = document.getElementById('spin-button');
    const surveyButtons = document.querySelectorAll('.survey-btn');
    const nextButton = document.getElementById('next-button');

    const onboardingModal = document.getElementById('onboarding-modal');
    const onboardingNextBtn = document.getElementById('onboarding-next-button');
    const onboardingSteps = document.querySelectorAll('.onboarding-step');

    const trialCounter = document.getElementById('trial-counter');
    const progressBar = document.getElementById('progress-bar');
    
    const randomBetDisplay = document.getElementById('random-bet-display');
    const randomBetAmount = document.getElementById('random-bet-amount');

    // Condition Setup from Qualtrics Embedded Data
    var conditionVal = Qualtrics.SurveyEngine.getEmbeddedData('Condition');
    let EXPERIMENT_VERSION = parseInt(conditionVal, 10);
    
    // Default to 1 (Fixed Bet) if embedded data is missing or invalid
    if (EXPERIMENT_VERSION !== 1 && EXPERIMENT_VERSION !== 2) {
        EXPERIMENT_VERSION = 1; 
    }
    let experimentVersionName = (EXPERIMENT_VERSION === 1) ? "fixed" : "random";
    
    const betOptions = [1, 5, 10];
    let currentBetSize = 5;

    let currentTrial = 1;
    const totalTrials = 20;
    let selectedRating = null;
    let currentRotation = 0;
    let currentTargetAngle = 0;
    let currentOnboardingStep = 0;
    let bankroll = 200;

    const catchTrials = [
        Math.floor(Math.random() * 5) + 3,  // Early: 3 to 7
        Math.floor(Math.random() * 6) + 12  // Late: 12 to 17
    ];
    let isCatchTrialActive = false;
    let currentCatchTarget = null;
    let tempLuckScore = null;

    updateProgress();

    // Start Trial Logic
    function startTrial() {
        if (EXPERIMENT_VERSION === 1) {
            currentBetSize = 5;
            spinButton.disabled = false;
            spinButton.classList.remove('opacity-50', 'cursor-not-allowed');
        } else if (EXPERIMENT_VERSION === 2) {
            currentBetSize = betOptions[Math.floor(Math.random() * betOptions.length)];
            randomBetAmount.textContent = currentBetSize;
            randomBetDisplay.classList.remove('hidden');
            spinButton.disabled = false;
            spinButton.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    startTrial();

    // Onboarding Logic
    onboardingNextBtn.addEventListener('click', () => {
        onboardingSteps[currentOnboardingStep].classList.add('hidden');
        onboardingSteps[currentOnboardingStep].classList.remove('block');
        currentOnboardingStep++;

        if (currentOnboardingStep < onboardingSteps.length) {
            onboardingSteps[currentOnboardingStep].classList.remove('hidden');
            onboardingSteps[currentOnboardingStep].classList.add('block');

            // Change button text on last step
            if (currentOnboardingStep === onboardingSteps.length - 1) {
                onboardingNextBtn.textContent = 'התחל ניסוי';
            }
        } else {
            onboardingModal.classList.add('hidden');
        }
    });

    function getRandomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    // 1. Spin Button Logic
    spinButton.addEventListener('click', () => {
        spinButton.disabled = true;
        spinButton.classList.add('opacity-50', 'cursor-not-allowed');

        if (Math.random() < 0.10) {
            currentTargetAngle = getRandomInRange(0, 36);
        } else {
            currentTargetAngle = getRandomInRange(36, 360);
        }
        const targetAngle = currentTargetAngle;

        const outcomeStr = (targetAngle >= 0 && targetAngle <= 36) ? 'Loss' : 'Win';
        const surveyOutcomeEl = document.getElementById('survey-outcome');
        if (outcomeStr === 'Win') {
            surveyOutcomeEl.textContent = `You won ${currentBetSize} tokens!`;
            surveyOutcomeEl.className = 'font-h1 text-[40px] font-bold mb-4 text-primary tracking-tight';
        } else {
            surveyOutcomeEl.textContent = `You lost ${currentBetSize} tokens!`;
            surveyOutcomeEl.className = 'font-h1 text-[40px] font-bold mb-4 text-error tracking-tight';
        }

        const targetRotationMod = (90 - targetAngle + 360) % 360;
        const degreesToFinishCycle = 360 - (currentRotation % 360);
        const extraSpins = 2880;

        currentRotation = currentRotation + degreesToFinishCycle + extraSpins + targetRotationMod;

        wheel.style.transform = `rotate(${currentRotation}deg)`;

        setTimeout(() => {
            surveyModal.classList.remove('hidden');
        }, 6000);
    });

    // 2. Survey Rating Selection
    surveyButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            surveyButtons.forEach(b => {
                b.classList.remove('border-2', 'border-tertiary', 'bg-tertiary', 'text-on-tertiary', 'shadow-sm');
                b.classList.add('border-outline', 'text-on-surface-variant');
            });

            const target = e.currentTarget;
            target.classList.remove('border-outline', 'text-on-surface-variant');
            target.classList.add('border-2', 'border-tertiary', 'bg-tertiary', 'text-on-tertiary', 'shadow-sm');

            selectedRating = target.dataset.value;
            nextButton.disabled = false;
            nextButton.classList.remove('opacity-50', 'cursor-not-allowed');
        });
    });

    // 3. Next Button Logic
    nextButton.addEventListener('click', () => {
        if (!selectedRating) return;

        if (!isCatchTrialActive && catchTrials.includes(currentTrial)) {
            tempLuckScore = parseInt(selectedRating, 10);
            isCatchTrialActive = true;
            currentCatchTarget = Math.floor(Math.random() * 10) + 1;

            const surveyQ = document.getElementById('survey-question');
            surveyQ.textContent = `האם אתה עדיין איתנו? אם כן, בחר את המספר ${currentCatchTarget}`;
            surveyQ.setAttribute('dir', 'rtl');
            surveyQ.classList.remove('hidden');
            const surveyDesc = document.getElementById('survey-desc');
            if (surveyDesc) surveyDesc.textContent = '';
            document.getElementById('survey-outcome').classList.add('hidden');
            document.querySelector('#survey-modal header span').classList.add('hidden');

            selectedRating = null;
            surveyButtons.forEach(b => {
                b.classList.remove('border-2', 'border-tertiary', 'bg-tertiary', 'text-on-tertiary', 'shadow-sm');
                b.classList.add('border-outline', 'text-on-surface-variant');
            });
            nextButton.disabled = true;
            nextButton.classList.add('opacity-50', 'cursor-not-allowed');
            return;
        }

        const targetAngle = currentTargetAngle;
        const outcome = (targetAngle >= 0 && targetAngle <= 36) ? 'Loss' : 'Win';

        if (outcome === 'Win') {
            bankroll += currentBetSize;
        } else {
            bankroll -= currentBetSize;
        }

        let finalLuckScore = isCatchTrialActive ? tempLuckScore : parseInt(selectedRating, 10);
        let finalAttSelected = isCatchTrialActive ? parseInt(selectedRating, 10) : null;
        let finalAttTarget = isCatchTrialActive ? currentCatchTarget : null;
        let finalAttPassed = isCatchTrialActive ? (finalAttSelected === finalAttTarget) : null;

        logTrialData({
            trial_number: currentTrial,
            version: experimentVersionName,
            bet_size: currentBetSize,
            degree_landed: targetAngle,
            outcome: outcome,
            bankroll: bankroll,
            lucky_score: finalLuckScore,
            attention_target: finalAttTarget,
            attention_selected: finalAttSelected,
            attention_passed: finalAttPassed
        });

        // Restore Survey UI
        const surveyQRestore = document.getElementById('survey-question');
        surveyQRestore.textContent = '';
        surveyQRestore.removeAttribute('dir');
        surveyQRestore.classList.add('hidden');
        const surveyDescRestore = document.getElementById('survey-desc');
        if (surveyDescRestore) surveyDescRestore.textContent = 'Rate your perceived chance of a positive outcome on a scale of 1 to 10.';
        document.getElementById('survey-outcome').classList.remove('hidden');
        document.querySelector('#survey-modal header span').classList.remove('hidden');

        isCatchTrialActive = false;
        currentCatchTarget = null;
        tempLuckScore = null;

        surveyModal.classList.add('hidden');

        selectedRating = null;
        surveyButtons.forEach(b => {
            b.classList.remove('border-2', 'border-tertiary', 'bg-tertiary', 'text-on-tertiary', 'shadow-sm');
            b.classList.add('border-outline', 'text-on-surface-variant');
        });
        nextButton.disabled = true;
        nextButton.classList.add('opacity-50', 'cursor-not-allowed');

        currentTrial++;

        // End condition and next block click
        if (currentTrial > totalTrials) {
            qualtricsContext.clickNextButton();
        } else {
            updateProgress();
            startTrial();
        }
    });

    function logTrialData(payload) {
        var t = payload.trial_number;
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_version', payload.version);
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_bet_size', payload.bet_size);
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_degree_landed', payload.degree_landed);
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_outcome', payload.outcome);
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_bankroll', payload.bankroll);
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_lucky_score', payload.lucky_score);
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_attention_target', payload.attention_target);
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_attention_selected', payload.attention_selected);
        Qualtrics.SurveyEngine.setEmbeddedData('T' + t + '_attention_passed', payload.attention_passed);
    }

    function updateProgress() {
        if(trialCounter) trialCounter.textContent = `${currentTrial}/${totalTrials}`;
        if(progressBar) {
            const percentage = ((currentTrial - 1) / totalTrials) * 100;
            progressBar.style.width = `${Math.max(percentage, 5)}%`;
        }
    }
});
