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
    ? 'This animal may stay longer than 30 days. The estimate may be wrong.'
    : 'This animal may leave within 30 days. The estimate may be wrong.';

  const actionPanel = document.querySelector('#action-panel');
  const actionText = document.querySelector('#action-text');
  if (actionPanel && actionText) {
    actionPanel.classList.toggle('long-stay', longStay);
    actionText.textContent = longStay
      ? 'This is a prompt to plan ahead. Staff still decide what this animal needs.'
      : 'Keep the usual care routine. A shorter stay is not guaranteed.';
    document.querySelector('#action-step-one').textContent = longStay
      ? 'Check this animal’s health, behavior, and support needs.'
      : 'Continue the normal intake and care plan.';
    document.querySelector('#action-step-two').textContent = longStay
      ? 'Review progress and consider suitable foster or adoption support.'
      : 'Check progress and update the plan if the stay becomes longer.';
  }

  // Track latest prediction and populate printable kennel tag
  lastPrediction = result;
  populateKennelTag(result);

  const workspace = document.querySelector('.workspace');
  workspace.classList.add('has-prediction');
  workspace.classList.toggle('long-stay', longStay);
  showState('prediction-state');
  const resultCard = document.querySelector('#result-card');
  resultCard.focus({ preventScroll: true });
  resultCard.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

let lastPrediction = null;
let requestSequence = 0;

function invalidatePrediction() {
  requestSequence += 1;
  lastPrediction = null;
  document.querySelector('.workspace').classList.remove('has-prediction', 'long-stay');
  submitButton.disabled = false;
  submitLabel.textContent = 'Predict stay';
  showState('empty-state');
}

form.addEventListener('input', invalidatePrediction);
form.addEventListener('change', invalidatePrediction);

function populateKennelTag(result) {
  const isOther = form.elements.type.value === 'OTHER';
  const animalName = isOther ? (otherAnimalInput.value.trim() || 'Other') : (form.elements.type.value === 'DOG' ? 'Dog' : 'Cat');
  const longStay = result.predicted_stay_group === 'MORE_THAN_30_DAYS';

  // Deterministic intake identifier based on date and inputs
  const hashSeed = `${intakeDate.value}-${animalName}-${form.elements.breed.value || ''}`;
  let hashNum = 0;
  for (let i = 0; i < hashSeed.length; i++) hashNum = (hashNum * 31 + hashSeed.charCodeAt(i)) % 10000;
  const admId = `DEMO-${(intakeDate.value || today).replaceAll('-', '')}-${String(Math.abs(hashNum)).padStart(4, '0')}`;

  const setEl = (id, text) => {
    const el = document.querySelector(id);
    if (el) el.textContent = text;
  };

  setEl('#tag-adm-id', admId);
  setEl('#tag-print-date', `Printed: ${today}`);
  setEl('#tag-type', animalName);
  setEl('#tag-breed', form.elements.breed.value.trim() || 'Unknown / Mixed');
  setEl('#tag-color', form.elements.color.value.trim() || 'Unknown');
  setEl('#tag-sex', form.elements.sex.options[form.elements.sex.selectedIndex]?.text || form.elements.sex.value);
  setEl('#tag-intake-date', intakeDate.value || today);
  setEl('#tag-origin', `${form.elements.intake_type.value || 'Unknown'}${form.elements.intake_subtype.value ? ' (' + form.elements.intake_subtype.value + ')' : ''}`);
  setEl('#tag-condition', form.elements.intake_condition.value.trim() || 'Unknown');
  setEl('#tag-jurisdiction', form.elements.intake_jurisdiction.value.trim() || 'Not specified');

  let ageStr = 'Unknown';
  if (birthDate.value && intakeDate.value) {
    const diffDays = (new Date(intakeDate.value) - new Date(birthDate.value)) / (1000 * 60 * 60 * 24);
    if (diffDays >= 0) {
      ageStr = `${(diffDays / 365.25).toFixed(1)} yrs (DOB: ${birthDate.value})`;
    }
  }
  setEl('#tag-age', ageStr);

  const banner = document.querySelector('#tag-alert-banner');
  const icon = document.querySelector('#tag-alert-icon');
  const title = document.querySelector('#tag-alert-title');
  const sub = document.querySelector('#tag-alert-sub');
  if (banner && icon && title && sub) {
    if (longStay) {
      banner.className = 'tag-alert-banner alert-high';
      icon.textContent = '🐾';
      title.textContent = 'Predicted stay: More than 30 days';
      sub.textContent = 'For planning only. Review this animal’s needs individually.';
    } else {
      banner.className = 'tag-alert-banner alert-low';
      icon.textContent = '🐾';
      title.textContent = 'Predicted stay: 30 days or less';
      sub.textContent = 'For planning only. The stay could be longer.';
    }
  }
}

// Print Kennel Tag Button
const printTagBtn = document.querySelector('#print-tag-btn');
if (printTagBtn) {
  printTagBtn.addEventListener('click', () => {
    if (!lastPrediction) return;
    populateKennelTag(lastPrediction);
    window.print();
  });
}

// Copy Structured Intake Record Button
const copySummaryBtn = document.querySelector('#copy-summary-btn');
const copyText = document.querySelector('#copy-text');
if (copySummaryBtn && copyText) {
  copySummaryBtn.addEventListener('click', async () => {
    if (!lastPrediction) return;
    const isOther = form.elements.type.value === 'OTHER';
    const animalName = isOther ? (otherAnimalInput.value.trim() || 'Other') : form.elements.type.value;
    const breedStr = form.elements.breed.value.trim() || 'Unknown / Mixed';
    const colorStr = form.elements.color.value.trim() || 'Unknown';
    const sexStr = form.elements.sex.options[form.elements.sex.selectedIndex]?.text || form.elements.sex.value;
    const conditionStr = form.elements.intake_condition.value.trim() || 'Unknown';
    const originStr = `${form.elements.intake_type.value || 'Unknown'}${form.elements.intake_subtype.value ? ' (' + form.elements.intake_subtype.value + ')' : ''}`;
    const jurisdictionStr = form.elements.intake_jurisdiction.value.trim() || 'Not specified';
    const record = [
      '====================================================',
      'PAWPATH ANIMAL SHELTER INTAKE & STAY ASSESSMENT',
      '====================================================',
      `Animal Type:       ${animalName}`,
      `Breed / Color:     ${breedStr} / ${colorStr}`,
      `Sex / Sterilized:  ${sexStr}`,
      `Intake Date:       ${intakeDate.value}`,
      `Arrival Origin:    ${originStr}`,
      `Condition:         ${conditionStr}`,
      `Jurisdiction:      ${jurisdictionStr}`,
      `Age / Birth Date:  ${birthDate.value || 'Unknown'}`,
      '----------------------------------------------------',
      '30-DAY STAY PREDICTION RESULT',
      '----------------------------------------------------',
      `Predicted Stay:    ${lastPrediction.predicted_stay_group === 'MORE_THAN_30_DAYS' ? 'MORE THAN 30 DAYS' : '30 DAYS OR LESS'}`,
      'Planning Note:     This estimate may be wrong. Staff decide care based on individual needs.',
      '===================================================='
    ].join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(record);
      } else {
        const ta = document.createElement('textarea');
        ta.value = record;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      copyText.textContent = 'Copied to Clipboard! ✓';
      setTimeout(() => { copyText.textContent = 'Copy Record'; }, 2500);
    } catch {
      copyText.textContent = 'Copy Failed';
      setTimeout(() => { copyText.textContent = 'Copy Record'; }, 2000);
    }
  });
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
  const requestId = ++requestSequence;
  try {
    const response = await fetch('/predict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestFromForm()), signal: AbortSignal.timeout(20000)
    });
    const body = await response.json();
    if (requestId !== requestSequence) return;
    if (!response.ok) throw new Error(friendlyApiError(body, response.status));
    showPrediction(body);
  } catch (error) {
    if (requestId !== requestSequence) return;
    lastPrediction = null;
    document.querySelector('.workspace').classList.remove('has-prediction', 'long-stay');
    showState('empty-state');
    showError(error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'The check took too long. Please try again.'
      : error instanceof TypeError ? 'Could not reach the backend. Check that it is running, then try again.' : error.message);
  } finally {
    if (requestId === requestSequence) {
      submitButton.disabled = false;
      submitLabel.textContent = 'Predict stay';
    }
  }
});

// First example admission
document.querySelector('#example-btn').addEventListener('click', () => {
  invalidatePrediction(); form.reset(); clearError(); syncOtherAnimal();
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

// Second example admission
const exampleAlertBtn = document.querySelector('#example-alert-btn');
if (exampleAlertBtn) {
  exampleAlertBtn.addEventListener('click', () => {
    invalidatePrediction(); form.reset(); clearError(); syncOtherAnimal();
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
  invalidatePrediction(); form.reset(); clearError(); syncOtherAnimal();
  syncDateBounds();
  syncBreeds();
  document.querySelector('.more-details').open = false;
});
