const form = document.querySelector('#animal-form');
const errorBox = document.querySelector('#form-error');
const submitButton = document.querySelector('#submit-btn');
const submitLabel = document.querySelector('#submit-label');
const intakeDate = document.querySelector('#intake_date');
const birthDate = document.querySelector('#date_of_birth');
const otherAnimalField = document.querySelector('#other-animal-field');
const otherAnimalInput = document.querySelector('#other_animal');
const states = ['empty-state', 'loading-state', 'prediction-state'];

// The browser's local date avoids accidentally offering tomorrow in a local time zone.
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const earliestBirth = '1995-01-01'; // Animals rarely exceed 25-30 years of age
const earliestIntake = '1995-01-01';

intakeDate.max = today;
intakeDate.min = earliestIntake;
birthDate.max = today;
birthDate.min = earliestBirth;

function syncDateBounds() {
  if (intakeDate.value) {
    const maxBirth = intakeDate.value < today ? intakeDate.value : today;
    birthDate.max = maxBirth;
  } else {
    birthDate.max = today;
  }

  if (birthDate.value) {
    intakeDate.min = birthDate.value > earliestIntake ? birthDate.value : earliestIntake;
  } else {
    intakeDate.min = earliestIntake;
  }

  if (birthDate.value && birthDate.value < earliestBirth) {
    showError('Please enter a realistic birth date (on or after 1995).');
  } else if (birthDate.value && birthDate.value > today) {
    showError('The birth date cannot be in the future.');
  } else if (intakeDate.value && intakeDate.value < earliestIntake) {
    showError('Please enter an intake date on or after 1995.');
  } else if (intakeDate.value && intakeDate.value > today) {
    showError('The intake date cannot be in the future.');
  } else if (birthDate.value && intakeDate.value && birthDate.value > intakeDate.value) {
    showError('The birth date cannot be after the intake date.');
  } else if (
    errorBox.textContent === 'The birth date cannot be after the intake date.' ||
    errorBox.textContent === 'The intake date cannot be before the birth date.' ||
    errorBox.textContent === 'Please enter a realistic birth date (on or after 1995).' ||
    errorBox.textContent === 'The birth date cannot be in the future.' ||
    errorBox.textContent === 'Please enter an intake date on or after 1995.' ||
    errorBox.textContent === 'The intake date cannot be in the future.'
  ) {
    clearError();
  }
}

intakeDate.addEventListener('change', syncDateBounds);
intakeDate.addEventListener('input', syncDateBounds);
birthDate.addEventListener('change', syncDateBounds);
birthDate.addEventListener('input', syncDateBounds);
syncDateBounds();

const breedList = document.querySelector('#breeds-list');
const dogBreeds = [
  'LABRADOR RETR', 'GERM SHEPHERD', 'PIT BULL/MIX', 'CHIHUAHUA SH',
  'AUST SHEPHERD', 'SIBERIAN HUSKY', 'BORDER COLLIE', 'ROTTWEILER',
  'BEAGLE', 'BOXER', 'DACHSHUND', 'GOLDEN RETR', 'YORKSHIRE TERR',
  'AUST CATTLE DOG', 'FRENCH BULLDOG'
];
const catBreeds = [
  'DOMESTIC SH', 'DOMESTIC MH', 'DOMESTIC LH', 'SIAMESE',
  'PERSIAN', 'MAINE COON', 'BENGAL', 'AMERICAN SH'
];
const otherBreeds = [
  'RABBIT', 'GUINEA PIG', 'CHICKEN', 'PARAKEET', 'HAMSTER', 'TORTOISE'
];

function syncBreeds() {
  if (!breedList) return;
  const type = form.elements.type.value;
  const list = type === 'DOG' ? dogBreeds : type === 'CAT' ? catBreeds : otherBreeds;
  breedList.innerHTML = list.map(b => `<option value="${b}">`).join('');
}

function syncOtherAnimal() {
  const selected = form.elements.type.value === 'OTHER';
  otherAnimalField.hidden = !selected;
  otherAnimalInput.required = selected;
  if (!selected) clearError();
}

form.querySelectorAll('input[name="type"]').forEach(radio => {
  radio.addEventListener('change', () => {
    syncOtherAnimal();
    syncBreeds();
  });
});
syncOtherAnimal();
syncBreeds();

function showState(id) {
  states.forEach(name => { document.getElementById(name).hidden = name !== id; });
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.textContent = '';
  errorBox.hidden = true;
}

function requestFromForm() {
  const data = new FormData(form);
  const result = { type: data.get('type'), intake_date: data.get('intake_date') };
  for (const name of ['date_of_birth', 'breed', 'color', 'sex', 'intake_type', 'intake_subtype', 'intake_condition', 'intake_jurisdiction']) {
    const value = String(data.get(name) || '').trim();
    if (value) result[name] = value;
  }
  return result;
}

function friendlyApiError(body, status) {
  if (status === 422 && Array.isArray(body.detail)) {
    const first = body.detail[0];
    const field = first.loc?.at(-1);
    const fieldName = typeof field === 'string' ? field.replaceAll('_', ' ') : 'a field';
    return `Please check ${fieldName}: ${first.msg || 'invalid value'}.`;
  }
  return typeof body.detail === 'string' ? body.detail : `The server returned an error (${status}). Please try again.`;
}

function showPrediction(result) {
  if (!['MORE_THAN_30_DAYS', '30_DAYS_OR_LESS'].includes(result.predicted_stay_group)) {
    throw new Error('The server returned an unexpected prediction.');
  }
  const longStay = result.predicted_stay_group === 'MORE_THAN_30_DAYS';
  const isOther = form.elements.type.value === 'OTHER';
  const resultAnimal = document.querySelector('#result-animal');
  resultAnimal.hidden = !isOther;
  resultAnimal.textContent = isOther ? `Animal entered: ${otherAnimalInput.value.trim()}` : '';
  document.querySelector('#prediction-banner').classList.toggle('long-stay', longStay);
  document.querySelector('#result-art').textContent = { DOG: '🐶', CAT: '🐱', OTHER: '🐾' }[form.elements.type.value] || '🐾';
  document.querySelector('#result-title').textContent = longStay ? 'More than 30 days' : '30 days or less';
  document.querySelector('#result-message').textContent = longStay
    ? 'The model predicts this animal’s shelter stay will be longer than 30 days.'
    : 'The model predicts this animal’s shelter stay will be 30 days or less.';

  // Render the model score and validation-selected review cutoff.
  const scorePercent = (result.long_stay_score * 100).toFixed(1);
  const thresholdPercent = (result.threshold * 100).toFixed(1);
  const scoreValue = document.querySelector('#score-value');
  const scoreFill = document.querySelector('#score-fill');
  const scoreExplainer = document.querySelector('#score-explainer');
  const thresholdMarker = document.querySelector('#threshold-marker');
  const thresholdLabel = document.querySelector('#threshold-label');
  if (scoreValue && scoreFill && scoreExplainer) {
    scoreValue.textContent = `${scorePercent}%`;
    scoreFill.style.width = `${Math.min(100, Math.round(result.long_stay_score * 100))}%`;
    scoreExplainer.textContent = `Calculated score: ${result.long_stay_score.toFixed(3)}. The ${thresholdPercent}% review cutoff was selected on validation data to maximize positive-class F1. This model score is not a calibrated probability.`;
    if (thresholdMarker) {
      thresholdMarker.style.left = `${Math.min(100, Math.max(0, result.threshold * 100))}%`;
      thresholdMarker.title = `Validation-selected review cutoff: ${thresholdPercent}%`;
    }
    if (thresholdLabel) thresholdLabel.textContent = `Review cutoff: ${thresholdPercent}%`;
  }

  // Render Actionable Staff Guidance
  const actionPanel = document.querySelector('#action-panel');
  const actionText = document.querySelector('#action-text');
  if (actionPanel && actionText) {
    actionPanel.style.background = longStay ? '#fff4ef' : '#edf7f0';
    actionPanel.style.borderColor = longStay ? '#f7dcd1' : '#d6ecdd';
    const actionTitle = actionPanel.querySelector('strong');
    if (actionTitle) {
      actionTitle.style.color = longStay ? '#a45846' : '#3d7256';
    }
    actionText.textContent = longStay
      ? 'Staff Review Suggested: The model score meets the review cutoff for a stay over 30 days. Review the known case details and consider whether additional support or follow-up is appropriate.'
      : 'No long-stay alert at this cutoff. Continue the shelter’s usual intake and follow-up process; this result does not guarantee a short stay.';
  }

  // Render Data & Preprocessing Notes (Explainability)
  const notesWrap = document.querySelector('#data-notes-wrap');
  const notesList = document.querySelector('#data-notes-list');
  if (notesWrap && notesList) {
    notesList.innerHTML = '';
    if (Array.isArray(result.data_notes) && result.data_notes.length > 0) {
      result.data_notes.forEach(note => {
        const li = document.createElement('li');
        li.textContent = note;
        notesList.appendChild(li);
      });
      notesWrap.hidden = false;
    } else {
      notesWrap.hidden = true;
    }
  }

  showState('prediction-state');
  document.querySelector('#result-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  clearError();
  if (form.elements.type.value === 'OTHER' && !otherAnimalInput.value.trim()) {
    showError('Please enter what animal it is.'); otherAnimalInput.focus(); return;
  }
  if (!intakeDate.value) { showError('Please choose an intake date.'); intakeDate.focus(); return; }
  if (intakeDate.value < earliestIntake) { showError('Please enter an intake date on or after 1995.'); intakeDate.focus(); return; }
  if (intakeDate.value > today) { showError('The intake date cannot be in the future.'); intakeDate.focus(); return; }
  if (birthDate.value) {
    if (birthDate.value < earliestBirth) { showError('Please enter a realistic birth date (on or after 1995).'); birthDate.focus(); return; }
    if (birthDate.value > today) { showError('The birth date cannot be in the future.'); birthDate.focus(); return; }
    if (birthDate.value > intakeDate.value) { showError('The birth date cannot be after the intake date.'); birthDate.focus(); return; }
  }
  submitButton.disabled = true;
  submitLabel.textContent = 'Checking…';
  showState('loading-state');
  try {
    const response = await fetch('/predict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestFromForm()), signal: AbortSignal.timeout(20000)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(friendlyApiError(body, response.status));
    showPrediction(body);
  } catch (error) {
    showState('empty-state');
    showError(error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'The check took too long. Please try again.'
      : error instanceof TypeError ? 'Could not reach the backend. Check that it is running, then try again.' : error.message);
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = 'Predict stay';
  }
});

// Example 1: Low-Risk Admission (<= 30 days)
document.querySelector('#example-btn').addEventListener('click', () => {
  form.reset(); clearError(); showState('empty-state'); syncOtherAnimal();
  form.elements.type.value = 'DOG';
  form.elements.intake_date.value = '2026-01-10';
  form.elements.date_of_birth.value = '2023-01-01';
  form.elements.breed.value = 'LABRADOR RETR';
  form.elements.color.value = 'BLACK';
  form.elements.sex.value = 'MALE';
  form.elements.intake_type.value = 'STRAY';
  form.elements.intake_subtype.value = 'FIELD';
  form.elements.intake_condition.value = 'HEALTHY';
  form.elements.intake_jurisdiction.value = 'SANTA ROSA';
  syncDateBounds();
  syncBreeds();
  document.querySelector('.more-details').open = true;
});

// Example 2: High-Risk Admission (> 30 days alert, Case 8020)
const exampleAlertBtn = document.querySelector('#example-alert-btn');
if (exampleAlertBtn) {
  exampleAlertBtn.addEventListener('click', () => {
    form.reset(); clearError(); showState('empty-state'); syncOtherAnimal();
    form.elements.type.value = 'DOG';
    form.elements.intake_date.value = '2026-01-01';
    form.elements.date_of_birth.value = '2018-07-17';
    form.elements.breed.value = 'AUST SHEPHERD';
    form.elements.color.value = 'BLUE MERLE';
    form.elements.sex.value = 'SPAYED';
    form.elements.intake_type.value = 'STRAY';
    form.elements.intake_subtype.value = 'FIELD';
    form.elements.intake_condition.value = 'TREATABLE/REHAB';
    form.elements.intake_jurisdiction.value = 'SANTA ROSA';
    syncDateBounds();
    syncBreeds();
    document.querySelector('.more-details').open = true;
  });
}

document.querySelector('#clear-btn').addEventListener('click', () => {
  form.reset(); clearError(); showState('empty-state'); syncOtherAnimal();
  syncDateBounds();
  syncBreeds();
  document.querySelector('.more-details').open = false;
});
