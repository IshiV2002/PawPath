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
intakeDate.max = today;
birthDate.max = today;

function syncOtherAnimal() {
  const selected = form.elements.type.value === 'OTHER';
  otherAnimalField.hidden = !selected;
  otherAnimalInput.required = selected;
  if (!selected) clearError();
}

form.querySelectorAll('input[name="type"]').forEach(radio => {
  radio.addEventListener('change', syncOtherAnimal);
});
syncOtherAnimal();

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
  if (intakeDate.value > today) { showError('The intake date cannot be in the future.'); intakeDate.focus(); return; }
  if (birthDate.value && birthDate.value > intakeDate.value) { showError('The birth date cannot be after the intake date.'); birthDate.focus(); return; }
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
  form.elements.intake_condition.value = 'UNKNOWN';
  form.elements.intake_jurisdiction.value = 'SANTA ROSA';
  document.querySelector('.more-details').open = true;
});

document.querySelector('#clear-btn').addEventListener('click', () => {
  form.reset(); clearError(); showState('empty-state'); syncOtherAnimal();
  document.querySelector('.more-details').open = false;
});
