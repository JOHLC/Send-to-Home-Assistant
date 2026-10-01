/**
 * Manage named profiles independently of Home Assistant endpoint settings.
 * Names and contexts are user data: always use textContent/value, never HTML.
 */
(function() {
  'use strict';

  const list = document.getElementById('profilesList');
  const status = document.getElementById('profileStatus');
  const defaultSelect = document.getElementById('defaultProfile');
  const quickSendToggle = document.getElementById('quickSendDefault');
  const addForm = document.getElementById('profileAddForm');
  const newName = document.getElementById('newProfileName');
  const newContext = document.getElementById('newProfileContext');
  let current = null;

  function showMessage(message, error = false) {
    status.textContent = message;
    status.className = error ? 'status error' : 'status success';
  }

  async function persist(next, successMessage) {
    try {
      current = await ExtensionProfiles.saveProfileSettings(next);
      render();
      showMessage(successMessage);
    } catch (error) {
      showMessage(error.message, true);
      render();
    }
  }

  function makeField(label, id, value, maxLength) {
    const container = document.createElement('label');
    container.className = 'profile-field';
    container.htmlFor = id;
    const title = document.createElement('span');
    title.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.maxLength = maxLength;
    input.value = value;
    input.required = true;
    container.append(title, input);
    return { container, input };
  }

  function render() {
    if (!current) {
      return;
    }
    list.replaceChildren();
    defaultSelect.replaceChildren();
    for (const profile of ExtensionProfiles.listProfiles(current)) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      defaultSelect.appendChild(option);
      if (profile.id === 'default') {
        continue;
      }
      const row = document.createElement('div');
      row.className = 'profile-editor-row';
      const name = makeField('Display name', 'name-' + profile.id, profile.name, 40);
      const context = makeField('Context', 'context-' + profile.id, profile.context, 64);
      const actions = document.createElement('div');
      actions.className = 'profile-row-actions';
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Update';
      save.addEventListener('click', () => {
        const profiles = current.profiles.map((item) => item.id === profile.id ?
          { id: item.id, name: name.input.value, context: context.input.value } : item);
        persist({ ...current, profiles }, 'Updated ' + profile.name + '.');
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'profile-remove';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => {
        if (!window.confirm('Delete profile "' + profile.name + '"?')) {
          return;
        }
        const profiles = current.profiles.filter((item) => item.id !== profile.id);
        const defaultProfileId = current.defaultProfileId === profile.id ? 'default' : current.defaultProfileId;
        persist({ ...current, profiles, defaultProfileId }, 'Deleted ' + profile.name + '.');
      });
      actions.append(save, remove);
      row.append(name.container, context.container, actions);
      list.appendChild(row);
    }
    defaultSelect.value = current.defaultProfileId;
    quickSendToggle.checked = current.quickSendDefault;
    addForm.querySelector('button[type="submit"]').disabled =
      current.profiles.length >= ExtensionProfiles.MAX_CUSTOM_PROFILES;
  }

  async function load() {
    try {
      current = await ExtensionProfiles.getProfileSettings();
      render();
    } catch (error) {
      showMessage(error.message + ' Clear configuration to reset invalid profiles.', true);
    }
  }

  defaultSelect.addEventListener('change', () => {
    persist({ ...current, defaultProfileId: defaultSelect.value }, 'Default profile updated.');
  });

  quickSendToggle.addEventListener('change', () => {
    persist({ ...current, quickSendDefault: quickSendToggle.checked }, 'Popup behavior updated.');
  });

  addForm.addEventListener('submit', async(event) => {
    event.preventDefault();
    if (!current) {
      return;
    }
    const profiles = [...current.profiles, {
      id: 'p_' + crypto.randomUUID(),
      name: newName.value,
      context: newContext.value,
    }];
    try {
      current = await ExtensionProfiles.saveProfileSettings({ ...current, profiles });
      newName.value = '';
      newContext.value = '';
      render();
      showMessage('Profile added.');
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  // A reset from the main Options controls should also reset the editor.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.sendProfiles || changes.defaultProfileId ||
        changes.quickSendDefault)) {
      load();
    }
  });

  load();
})();
