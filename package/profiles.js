/**
 * Named send profiles. A profile changes the context field, not the webhook.
 * The built-in Default profile is always present for existing automations.
 */
(function() {
  'use strict';

  const BUILTIN = Object.freeze({ id: 'default', name: 'Default', context: 'Default' });
  const MAX_CUSTOM_PROFILES = 15;

  function validateProfiles(custom) {
    if (!Array.isArray(custom) || custom.length > MAX_CUSTOM_PROFILES) {
      throw new Error('You can create up to 15 additional send profiles.');
    }
    const names = new Set(['default']);
    const contexts = new Set(['default']);
    const ids = new Set(['default']);
    return custom.map((profile) => {
      if (!profile || typeof profile.id !== 'string' || !/^p_[a-zA-Z0-9-]{8,80}$/.test(profile.id)) {
        throw new Error('Invalid profile ID.');
      }
      const name = typeof profile.name === 'string' ? profile.name.trim() : '';
      const context = typeof profile.context === 'string' ? profile.context.trim() : '';
      if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) {
        throw new Error('Profile names must be 1-40 printable characters.');
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(context)) {
        throw new Error('Contexts must start with a letter or number and contain only letters, numbers, - or _.');
      }
      if (ids.has(profile.id) || names.has(name.toLowerCase()) || contexts.has(context.toLowerCase())) {
        throw new Error('Profile names, IDs and contexts must be unique.');
      }
      ids.add(profile.id);
      names.add(name.toLowerCase());
      contexts.add(context.toLowerCase());
      return { id: profile.id, name, context };
    });
  }

  function normalizeSettings(raw = {}) {
    // Invalid synchronized data is not trusted to route outbound sends.
    let profiles = [];
    if (raw.sendProfiles !== undefined) {
      profiles = validateProfiles(raw.sendProfiles);
    }
    const defaultProfileId = typeof raw.defaultProfileId === 'string' &&
      (raw.defaultProfileId === 'default' || profiles.some((profile) => profile.id === raw.defaultProfileId)) ?
      raw.defaultProfileId : 'default';
    return {
      profiles,
      defaultProfileId,
      quickSendDefault: raw.quickSendDefault === true,
    };
  }

  function getProfileSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(['sendProfiles', 'defaultProfileId', 'quickSendDefault'], (raw) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        try {
          resolve(normalizeSettings(raw));
        } catch (error) {
          reject(new Error('Stored send profiles are invalid: ' + error.message));
        }
      });
    });
  }

  function listProfiles(settings) {
    return [BUILTIN, ...settings.profiles];
  }

  function resolveProfile(settings, selectedId) {
    const id = selectedId == null ? settings.defaultProfileId : selectedId;
    const profile = listProfiles(settings).find((entry) => entry.id === id);
    if (!profile) {
      throw new Error('The selected send profile no longer exists. Choose another profile.');
    }
    return profile;
  }

  async function saveProfileSettings(settings) {
    const profiles = validateProfiles(settings.profiles);
    const ids = new Set(listProfiles({ profiles }).map((profile) => profile.id));
    if (!ids.has(settings.defaultProfileId)) {
      throw new Error('Choose an existing profile as the default.');
    }
    const values = {
      sendProfiles: profiles,
      defaultProfileId: settings.defaultProfileId,
      quickSendDefault: settings.quickSendDefault === true,
    };
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set(values, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    return normalizeSettings(values);
  }

  const API = {
    BUILTIN,
    MAX_CUSTOM_PROFILES,
    validateProfiles,
    normalizeSettings,
    getProfileSettings,
    listProfiles,
    resolveProfile,
    saveProfileSettings,
  };
  if (typeof window !== 'undefined') {
    window.ExtensionProfiles = API;
  } else {
    self.ExtensionProfiles = API;
  }
})();
