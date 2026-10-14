document.documentElement.classList.add("js");

document.addEventListener("DOMContentLoaded", () => {
  setupMobileNav();

  const copyButtons = document.querySelectorAll(".copy-trigger");
  const copyStatus = document.getElementById("copy-status");

  copyButtons.forEach((button) => {
    const defaultLabel = button.textContent.trim();

    button.addEventListener("click", async () => {
      const targetId = button.getAttribute("data-copy-target");
      const source = targetId ? document.getElementById(targetId) : null;

      if (!source) return;

      const text = source.textContent.trim();
      if (copyStatus) copyStatus.textContent = "";

      try {
        await copyText(text);
        button.textContent = "Copied";
        button.classList.add("is-copied");
        if (copyStatus) copyStatus.textContent = "Code copied to the clipboard.";

        window.setTimeout(() => {
          button.textContent = defaultLabel;
          button.classList.remove("is-copied");
          if (copyStatus) copyStatus.textContent = "";
        }, 1800);
      } catch (error) {
        button.textContent = "Copy manually";
        button.classList.remove("is-copied");
        if (copyStatus) {
          copyStatus.textContent = "Could not copy the code. Select it and copy it manually.";
        }
        window.setTimeout(() => {
          button.textContent = defaultLabel;
          if (copyStatus) copyStatus.textContent = "";
        }, 3000);
      }
    });
  });
});

function setupMobileNav() {
  const navToggle = document.querySelector(".nav-toggle");
  const siteNav = document.querySelector(".site-nav");
  const mobileNav = window.matchMedia("(max-width: 760px)");

  if (!navToggle || !siteNav) return;

  const syncNavAccessibility = () => {
    const collapsed = mobileNav.matches && navToggle.getAttribute("aria-expanded") !== "true";
    siteNav.toggleAttribute("inert", collapsed);
    if (collapsed) {
      siteNav.setAttribute("aria-hidden", "true");
    } else {
      siteNav.removeAttribute("aria-hidden");
    }
  };

  const closeNav = () => {
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open navigation menu");
    siteNav.classList.remove("is-open");
    syncNavAccessibility();
  };

  const openNav = () => {
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Close navigation menu");
    siteNav.classList.add("is-open");
    syncNavAccessibility();
  };

  navToggle.addEventListener("click", () => {
    const expanded = navToggle.getAttribute("aria-expanded") === "true";
    if (expanded) {
      closeNav();
    } else {
      openNav();
    }
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      const target = link.hash ? document.querySelector(link.hash) : null;
      if (mobileNav.matches && target) {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
      }
      closeNav();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      closeNav();
    } else {
      syncNavAccessibility();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navToggle.getAttribute("aria-expanded") === "true") {
      closeNav();
      navToggle.focus();
    }
  });

  syncNavAccessibility();
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall through to the selection-based copy method.
    }
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.top = "-9999px";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);

  try {
    helper.select();
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    helper.remove();
  }
}
