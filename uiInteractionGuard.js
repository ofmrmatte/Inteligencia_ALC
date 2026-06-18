(function initDashboardUiInteractionGuard() {
  if (window.__dashboardUiInteractionGuardInstalled) return;
  window.__dashboardUiInteractionGuardInstalled = true;

  const RAPID_CLICK_MS = 450;
  const lastClickByElement = new WeakMap();

  const floatingMenuSelectors = [
    "body > .prefatura-category-menu",
    "body > .deviation-category-menu",
    "body > [data-pnr-filter-menu]",
    "body > [data-dropdown-portal-menu]",
    "[data-pnr-status-dropdown]",
    "[data-missing-status-dropdown]",
    ".prefatura-category-menu",
    ".deviation-category-menu"
  ];

  const floatingMenuSelector = floatingMenuSelectors.join(",");

  function isElement(value) {
    return value instanceof Element;
  }

  function closestClickable(target) {
    if (!isElement(target)) return null;

    return target.closest([
      "button",
      "[role='button']",
      "a.button",
      ".primary-button",
      ".secondary-button",
      ".tab-button",
      ".nav-link",
      "[data-action]"
    ].join(","));
  }

  function isFormControl(target) {
    if (!isElement(target)) return false;

    return Boolean(target.closest([
      "input",
      "textarea",
      "select",
      "option",
      "label",
      "[contenteditable='true']"
    ].join(",")));
  }

  function isInsideFloatingMenu(target) {
    if (!isElement(target)) return false;
    return Boolean(target.closest(floatingMenuSelector));
  }

  function closeFloatingMenusExcept(target) {
    document.querySelectorAll(floatingMenuSelector).forEach((menu) => {
      if (target && menu.contains(target)) return;
      menu.remove();
    });

    document.querySelectorAll("[aria-expanded='true']").forEach((element) => {
      if (target && (element === target || element.contains(target))) return;

      if (element.matches("button, [role='button'], [data-action]")) {
        element.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    const clickable = closestClickable(target);

    if (
      clickable &&
      !clickable.disabled &&
      !clickable.hasAttribute("data-allow-rapid-click") &&
      !isFormControl(clickable)
    ) {
      const now = Date.now();
      const lastClick = lastClickByElement.get(clickable) || 0;

      if (now - lastClick < RAPID_CLICK_MS) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      lastClickByElement.set(clickable, now);
    }

    if (isInsideFloatingMenu(target)) {
      if (clickable) {
        window.setTimeout(() => closeFloatingMenusExcept(null), 0);
      }
      return;
    }

    closeFloatingMenusExcept(target);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFloatingMenusExcept(null);
    }
  }, true);

  window.addEventListener("resize", () => closeFloatingMenusExcept(null), { passive: true });
  window.addEventListener("scroll", () => closeFloatingMenusExcept(null), { passive: true, capture: true });
})();
