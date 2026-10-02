/**
 * Named profile editor for the Options page. Profile actions persist
 * independently of the Home Assistant connection Save button.
 */
(function() {
  'use strict';

  const list = document.getElementById('profilesList');
  const status = document.getElementById('profileStatus');
  const preferenceStatus = document.getElementById('preferenceStatus');
  const profileCount = document.getElementById('profileCount');
  const defaultSelect = document.getElementById('defaultProfile');
  const quickSendToggle = document.getElementById('quickSendDefault');
  const addForm = document.getElementById('profileAddForm');
  const addButton = addForm.querySelector('button[type="submit"]');
  const newName = document.getElementById('newProfileName');
  const newContext = document.getElementById('newProfileContext');
  let current = null;
  let saving = false;

  function showMessage(message, error = false, target = status) {
    if (!target) {
      return;
    }
    target.textContent = message;
    target.className = error ? 'status error' : 'status success';
  }

  function setEditingDisabled(disabled) {
    defaultSelect.disabled = disabled || !current;
    quickSendToggle.disabled = disabled || !current;
    addButton.disabled = disabled || !current ||
      current.profiles.length >= ExtensionProfiles.MAX_CUSTOM_PROFILES;
    for (const button of list.querySelectorAll('button')) {
      button.disabled = disabled;
    }
  }

  async function persist(next, successMessage, onFailure, target = status) {
    if (saving) {
      showMessage('Wait for the previous change to save.', true, target);
      return false;
    }
    saving = true;
    setEditingDisabled(true);
    try {
      current = await ExtensionProfiles.saveProfileSettings(next);
      render();
      showMessage(successMessage, false, target);
      return true;
    } catch (error) {
      showMessage(error.message, true, target);
      if (onFailure) {
        onFailure();
      } else {
        render();
      }
      return false;
    } finally {
      saving = false;
      setEditingDisabled(false);
    }
  }

  function makeField(label, id, value, maxLength) {
    const field = document.createElement('label');
    field.className = 'profile-field';
    field.htmlFor = id;
    const title = document.createElement('span');
    title.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.maxLength = maxLength;
    input.required = true;
    input.value = value;
    input.autocomplete = 'off';
    field.append(title, input);
    return { field, input };
  }

  function makeButton(label, className, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.addEventListener('click', callback);
    return button;
  }

  function showEditor(row, profile) {
    const form = document.createElement('form');
    form.className = 'profile-edit-form';
    const fields = document.createElement('div');
    fields.className = 'field-grid';
    const name = makeField('Profile name', 'name-' + profile.id, profile.name, 40);
    const context = makeField('Automation context', 'context-' + profile.id, profile.context, 64);
    context.input.pattern = '[A-Za-z0-9][A-Za-z0-9_-]*';
    fields.append(name.field, context.field);
    const buttons = document.createElement('div');
    buttons.className = 'profile-row-actions';
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'button button-primary';
    save.textContent = 'Save changes';
    const cancel = makeButton('Cancel', 'button button-secondary', render);
    buttons.append(save, cancel);
    form.append(fields, buttons);
    form.addEventListener('submit', async(event) => {
      event.preventDefault();
      const profiles = current.profiles.map((item) => item.id === profile.id ?
        { id: item.id, name: name.input.value, context: context.input.value } : item);
      await persist({ ...current, profiles }, 'Updated ' + profile.name + '.',
        () => name.input.focus());
    });
    row.replaceChildren(form);
    name.input.focus();
  }

  function render() {
    if (!current) {
      return;
    }
    list.replaceChildren();
    defaultSelect.replaceChildren();
    const profiles = ExtensionProfiles.listProfiles(current);
    profileCount.textContent = profiles.length + (profiles.length === 1 ? ' profile' : ' profiles');

    for (const profile of profiles) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      defaultSelect.appendChild(option);

      const row = document.createElement('div');
      row.className = 'profile-list-row';
      const meta = document.createElement('div');
      meta.className = 'profile-row-meta';
      const title = document.createElement('div');
      title.className = 'profile-row-title';
      const name = document.createElement('span');
      name.textContent = profile.name;
      title.appendChild(name);
      const tag = document.createElement('span');
      tag.className = 'profile-tag';
      if (profile.id === 'default') {
        tag.textContent = profile.id === current.defaultProfileId ? 'Built-in default' : 'Built in';
        title.appendChild(tag);
      }
      if (profile.id !== 'default' && profile.id === current.defaultProfileId) {
        const defaultTag = document.createElement('span');
        defaultTag.className = 'profile-tag';
        defaultTag.textContent = 'Default';
        title.appendChild(defaultTag);
      }
      const caption = document.createElement('div');
      caption.className = 'profile-row-caption';
      const code = document.createElement('code');
      code.className = 'profile-context';
      code.textContent = profile.context;
      caption.append('Sends context ', code);
      meta.append(title, caption);
      row.appendChild(meta);

      if (profile.id !== 'default') {
        const buttons = document.createElement('div');
        buttons.className = 'profile-row-actions';
        const edit = makeButton('Edit', 'button button-secondary',
          () => showEditor(row, profile));
        const remove = makeButton('Delete', 'button button-danger-outline', () => {
          if (!window.confirm('Delete "' + profile.name + '"? Your Home Assistant automation will not be changed.')) {
            return;
          }
          const remaining = current.profiles.filter((item) => item.id !== profile.id);
          const defaultProfileId = current.defaultProfileId === profile.id ?
            'default' : current.defaultProfileId;
          persist({ ...current, profiles: remaining, defaultProfileId }, 'Deleted ' + profile.name + '.');
        });
        buttons.append(edit, remove);
        row.appendChild(buttons);
      }
      list.appendChild(row);
    }
    defaultSelect.value = current.defaultProfileId;
    defaultSelect.disabled = false;
    quickSendToggle.checked = current.quickSendDefault;
    quickSendToggle.disabled = false;
    addButton.disabled = current.profiles.length >= ExtensionProfiles.MAX_CUSTOM_PROFILES;
  }

  async function load() {
    try {
      current = await ExtensionProfiles.getProfileSettings();
      render();
    } catch (error) {
      showMessage(error.message + ' Reset settings to clear invalid stored profiles.', true);
    }
  }

  defaultSelect.addEventListener('change', () => {
    if (current) {
      persist({ ...current, defaultProfileId: defaultSelect.value }, 'Default profile updated.');
    }
  });

  quickSendToggle.addEventListener('change', () => {
    if (current) {
      persist({ ...current, quickSendDefault: quickSendToggle.checked },
        quickSendToggle.checked ? 'Immediate sending enabled.' : 'Choose a profile before sending.',
        null, preferenceStatus);
    }
  });

  addForm.addEventListener('submit', async(event) => {
    event.preventDefault();
    if (!current || saving) {
      return;
    }
    const profiles = [...current.profiles, {
      id: 'p_' + crypto.randomUUID(),
      name: newName.value,
      context: newContext.value,
    }];
    const saved = await persist({ ...current, profiles }, 'Profile added.');
    if (saved) {
      newName.value = '';
      newContext.value = '';
    }
  });

  // Reload when another extension page changes settings or Reset is confirmed.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.sendProfiles || changes.defaultProfileId ||
        changes.quickSendDefault)) {
      load();
    }
  });

  load();
})();
