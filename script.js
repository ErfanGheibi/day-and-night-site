// Simple theme handling: auto (based on time), day, night.
// We store the user's choice in localStorage so it persists.

(function () {
  const body = document.body;
  const toggleBtn = document.getElementById("mode-toggle");
  const modeLabel = toggleBtn?.querySelector(".mode-toggle__label");
  const modeIndicator = document.getElementById("mode-indicator");
  const iconSpan = toggleBtn?.querySelector(".mode-toggle__icon");

  const MODES = ["auto", "day", "night"];

  function getStoredMode() {
    try {
      const value = localStorage.getItem("dayNightMode");
      if (value && MODES.includes(value)) return value;
    } catch (_) {
      // ignore storage errors
    }
    return "auto";
  }

  function storeMode(mode) {
    try {
      localStorage.setItem("dayNightMode", mode);
    } catch (_) {
      // ignore
    }
  }

  function getAutoTheme() {
    const hour = new Date().getHours();
    // Rough guess: 7–18 is "day"
    return hour >= 7 && hour < 18 ? "day" : "night";
  }

  function applyTheme(mode) {
    body.classList.remove("theme-day", "theme-night", "theme-auto");

    if (mode === "auto") {
      const autoTheme = getAutoTheme();
      body.classList.add("theme-auto", `theme-${autoTheme}`);
      updateUI(mode, autoTheme);
    } else {
      body.classList.add(`theme-${mode}`);
      updateUI(mode, mode);
    }
  }

  function updateUI(mode, effectiveTheme) {
    if (!modeLabel || !modeIndicator || !iconSpan) return;

    if (mode === "auto") {
      modeLabel.textContent = "Auto";
      modeIndicator.textContent =
        "Auto (based on your time: " +
        (effectiveTheme === "day" ? "Day" : "Night") +
        ")";
    } else if (mode === "day") {
      modeLabel.textContent = "Day";
      modeIndicator.textContent = "Day (locked)";
    } else {
      modeLabel.textContent = "Night";
      modeIndicator.textContent = "Night (locked)";
    }

    // Icon: sun for day, moon for night
    iconSpan.textContent = effectiveTheme === "day" ? "☀️" : "🌙";
  }

  function getNextMode(current) {
    const index = MODES.indexOf(current);
    if (index === -1) return "auto";
    return MODES[(index + 1) % MODES.length];
  }

  function init() {
    const initialMode = getStoredMode();
    applyTheme(initialMode);

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const currentMode = getStoredMode();
        const nextMode = getNextMode(currentMode);
        storeMode(nextMode);
        applyTheme(nextMode);
      });
    }
  }

  init();
})();

