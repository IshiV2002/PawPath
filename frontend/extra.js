// Saved staff follow-ups and historical group patterns. No model settings appear here.
const saveForm = document.querySelector('#save-case-form');
const caseList = document.querySelector('#case-list');
const boardMessage = document.querySelector('#case-board-message');
const caseSummary = document.querySelector('#case-summary');

function makeElement(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function dateLabel(value) {
  return value || 'Not scheduled';
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function stayLabel(group) {
  return group === 'MORE_THAN_30_DAYS' ? 'More than 30 days' : '30 days or less';
}

function message(text, error = false) {
  boardMessage.textContent = text;
  boardMessage.hidden = !text;
  boardMessage.classList.toggle('error', error);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 404 && path === '/cases') {
      throw new Error('The running backend is older than this page. Stop it, restart start_backend.py from the PawPath folder, then refresh.');
    }
    const detail = typeof body.detail === 'string' ? body.detail : 'Please check the entered details.';
    throw new Error(detail);
  }
  return body;
}

async function changeCase(id, changes) {
  try {
    await api(`/cases/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes)
    });
    message('Saved case updated.');
    await loadCases();
  } catch (error) {
    message(error.message, true);
  }
}

function renderCase(saved) {
  const card = makeElement('article', 'case-card');
  const top = makeElement('div', 'case-top');
  const nameBlock = makeElement('div');
  nameBlock.append(makeElement('h3', '', saved.animal_label || `${saved.animal_type.toLowerCase()} admission`));
  nameBlock.append(makeElement('small', '', `${saved.animal_type.toLowerCase()} · arrived ${saved.intake_date}`));
  const prediction = makeElement('span', 'case-prediction', `Predicted: ${stayLabel(saved.prediction_group)}`);
  if (saved.prediction_group === 'MORE_THAN_30_DAYS') prediction.classList.add('long-stay');
  top.append(nameBlock, prediction);
  card.append(top);

  const reviewText = saved.review_done ? `Review completed${saved.review_date ? ` · planned date ${saved.review_date}` : ''}`
    : saved.review_date && saved.review_date < localToday()
      ? `Review overdue · ${saved.review_date}`
      : `Next review · ${dateLabel(saved.review_date)}`;
  card.append(makeElement('p', 'case-status', reviewText));
  if (saved.review_note) card.append(makeElement('p', 'case-note', saved.review_note));
  const actual = saved.outcome_date
    ? `Actual stay: ${saved.actual_stay_days} days (${stayLabel(saved.actual_stay_group).toLowerCase()}). ${saved.prediction_matched_outcome ? 'Matched' : 'Different from'} the earlier estimate.`
    : 'Actual stay: pending until a departure date is recorded.';
  card.append(makeElement('p', 'case-meta', actual));

  const controls = makeElement('div', 'case-controls');
  const reviewButton = makeElement('button', '', saved.review_done ? 'Reopen review' : 'Mark review done');
  reviewButton.type = 'button';
  reviewButton.addEventListener('click', () => changeCase(saved.case_id, { review_done: !saved.review_done }));
  controls.append(reviewButton);

  const plan = makeElement('div', 'case-plan-edit');
  const reviewLabel = makeElement('label', '', 'Next review date');
  const reviewInput = makeElement('input');
  reviewInput.type = 'date';
  reviewInput.min = saved.intake_date;
  reviewInput.value = saved.review_date || '';
  reviewLabel.append(reviewInput);
  const noteLabel = makeElement('label', '', 'Staff note');
  const noteInput = makeElement('input');
  noteInput.type = 'text';
  noteInput.maxLength = 500;
  noteInput.value = saved.review_note || '';
  noteLabel.append(noteInput);
  const savePlan = makeElement('button', '', 'Update plan');
  savePlan.type = 'button';
  savePlan.addEventListener('click', () => changeCase(saved.case_id, {
    review_date: reviewInput.value || null,
    review_note: noteInput.value.trim()
  }));
  plan.append(reviewLabel, noteLabel, savePlan);
  card.append(plan);

  const outcomeLabel = makeElement('label', '', 'Departure date');
  const outcomeInput = makeElement('input');
  outcomeInput.type = 'date';
  outcomeInput.min = saved.intake_date;
  outcomeInput.max = localToday();
  outcomeInput.value = saved.outcome_date || '';
  outcomeLabel.append(outcomeInput);
  const outcomeButton = makeElement('button', '', 'Save outcome');
  outcomeButton.type = 'button';
  outcomeButton.addEventListener('click', () => {
    if (!outcomeInput.value) { message('Choose a departure date first.', true); return; }
    changeCase(saved.case_id, { outcome_date: outcomeInput.value });
  });
  controls.append(outcomeLabel, outcomeButton);
  if (saved.outcome_date) {
    const clearOutcome = makeElement('button', '', 'Clear outcome');
    clearOutcome.type = 'button';
    clearOutcome.addEventListener('click', () => changeCase(saved.case_id, { outcome_date: null }));
    controls.append(clearOutcome);
  }
  const deleteButton = makeElement('button', 'case-delete', 'Delete case');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', async () => {
    if (!window.confirm('Delete this saved case?')) return;
    try {
      await api(`/cases/${encodeURIComponent(saved.case_id)}`, { method: 'DELETE' });
      message('Saved case deleted.');
      await loadCases();
    } catch (error) { message(error.message, true); }
  });
  controls.append(deleteButton);
  card.append(controls);
  return card;
}

async function loadCases() {
  try {
    const saved = await api('/cases');
    caseList.replaceChildren();
    const due = saved.filter(item => !item.review_done && item.review_date && item.review_date <= localToday()).length;
    const recorded = saved.filter(item => item.outcome_date).length;
    caseSummary.textContent = `${saved.length} saved · ${due} reviews due · ${recorded} departures recorded`;
    if (!saved.length) {
      caseList.append(makeElement('p', 'empty-board', 'No saved cases yet. Run a prediction, then choose “Save follow-up”.'));
    } else {
      saved.forEach(item => caseList.append(renderCase(item)));
    }
  } catch (error) {
    message(error.message, true);
  }
}

document.querySelector('#open-save-btn').addEventListener('click', () => {
  if (!window.PawPathCurrent().prediction) return;
  saveForm.hidden = false;
  document.querySelector('#case-label').focus();
});
document.querySelector('#cancel-save-btn').addEventListener('click', () => { saveForm.hidden = true; });
window.addEventListener('pawpath:prediction-cleared', () => {
  saveForm.hidden = true;
  saveForm.reset();
  document.querySelector('#save-case-message').hidden = true;
});
saveForm.addEventListener('submit', async event => {
  event.preventDefault();
  const current = window.PawPathCurrent();
  if (!current.prediction || !current.animal) return;
  const status = document.querySelector('#save-case-message');
  const button = document.querySelector('#save-case-btn');
  button.disabled = true;
  status.hidden = true;
  try {
    const saved = await api('/cases', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        animal: current.animal,
        animal_label: document.querySelector('#case-label').value.trim(),
        review_date: document.querySelector('#case-review-date').value || null,
        review_note: document.querySelector('#case-note').value.trim()
      })
    });
    saveForm.hidden = true;
    saveForm.reset();
    message(saved.prediction_group === current.prediction.predicted_stay_group
      ? 'Follow-up saved. You can review it below.'
      : 'Follow-up saved, but the estimate changed. Run the prediction again before using this result.',
      saved.prediction_group !== current.prediction.predicted_stay_group);
    await loadCases();
    document.querySelector('#followup-board').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    status.textContent = error.message;
    status.hidden = false;
  } finally { button.disabled = false; }
});

function conditionLabel(name, value) {
  if (name === 'type') return value === 'DOG' ? 'Dogs' : value === 'CAT' ? 'Cats' : 'Other animals';
  if (name === 'age_group') return value;
  if (name === 'intake_type') return value.toLowerCase().replaceAll('_', ' ') + ' intake';
  return 'condition recorded as ' + value.toLowerCase();
}

async function loadInsights() {
  const summary = document.querySelector('#insights-summary');
  const list = document.querySelector('#insights-list');
  try {
    const data = await api('/static/insights.json');
    summary.textContent = `Across all ${data.validation_rows.toLocaleString()} later validation admissions, ${Math.round(data.validation_long_stay_rate * 100)}% stayed longer than 30 days.`;
    list.replaceChildren();
    for (const rule of data.rules) {
      const card = makeElement('article', 'insight-card');
      card.append(makeElement('h3', '', Object.entries(rule.conditions).map(([name, value]) => conditionLabel(name, value)).join(' · ')));
      card.append(makeElement('div', 'insight-rate', `${Math.round(rule.validation.rate * 100)}%`));
      card.append(makeElement('p', '', `${rule.validation.long_stays} of ${rule.validation.matching} matching later admissions stayed longer than 30 days.`));
      card.append(makeElement('p', '', `Earlier training records: ${rule.training.long_stays} of ${rule.training.matching}.`));
      list.append(card);
    }
  } catch {
    summary.textContent = 'Historical patterns are temporarily unavailable.';
  }
}

loadCases();
loadInsights();
