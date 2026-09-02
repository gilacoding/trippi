// ── LocalStorage Brand Migration ────────────────────────────────────────
// One-time migration from trippi_* keys to markicab_* keys.
// Idempotent, non-destructive, safe if interrupted.
// Migration version: 1

(function () {
  const MIGRATION_VERSION = 1;

  const KEY_MAP = [
    { old: 'trippi_personal_planner_v2', new: 'markicab_personal_planner_v2' },
    { old: 'trippi_personal_planner_v1', new: 'markicab_personal_planner_v1' },
    { old: 'trippi_display_name',       new: 'markicab_display_name' },
    { old: 'trippi_migration_v',        new: 'markicab_migration_v' }
  ];

  const MIG_COMPLETE_KEY = 'markicab_localstorage_migration_v';

  function getMigVersion() {
    try {
      return parseInt(localStorage.getItem(MIG_COMPLETE_KEY) || '0', 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function setMigVersion(v) {
    try {
      localStorage.setItem(MIG_COMPLETE_KEY, String(v));
    } catch (e) {
      // ignore quota errors
    }
  }

  // Migrate all known keys. Only runs if migration hasn't completed.
  function migrateLocalStorageKeys() {
    if (getMigVersion() >= MIGRATION_VERSION) return;

    for (const { old, new: newKey } of KEY_MAP) {
      try {
        const oldVal = localStorage.getItem(old);
        const newVal = localStorage.getItem(newKey);

        if (oldVal !== null && oldVal !== undefined && newVal === null) {
          // Old key exists, new key does not → migrate
          localStorage.setItem(newKey, oldVal);
        }
        // If new key exists, NEVER overwrite (newer data wins)
      } catch (e) {
        // Skip on error, continue with next key
      }
    }

    // Handle consent keys (dynamic naming pattern)
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('trippi_consent_')) {
          const newKey = key.replace(/^trippi_consent_/, 'markicab_consent_');
          const oldVal = localStorage.getItem(key);
          const newVal = localStorage.getItem(newKey);
          if (oldVal !== null && newVal === null) {
            localStorage.setItem(newKey, oldVal);
          }
          keysToRemove.push(key);
        }
      }
      // Remove old consent keys after successful migration
      for (const key of keysToRemove) {
        try { localStorage.removeItem(key); } catch (e) {}
      }
    } catch (e) {
      // ignore
    }

    setMigVersion(MIGRATION_VERSION);
  }

  // Run migration immediately on script load
  migrateLocalStorageKeys();

  // Expose for tests
  window.__markicabLS = {
    getMigVersion,
    migrateLocalStorageKeys,
    MIGRATION_VERSION
  };
})();
