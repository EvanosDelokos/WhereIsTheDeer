const DISCLAIMER_DEBUG = false;
const dislog = (...args) => {
  if (DISCLAIMER_DEBUG) console.log(...args);
};

dislog("Module loaded: disclaimerModule");

document.addEventListener("DOMContentLoaded", () => {
  const disclaimerOverlay = document.getElementById("disclaimerOverlay");
  const agreeDisclaimer = document.getElementById("agreeDisclaimer");

  if (agreeDisclaimer) {
    agreeDisclaimer.addEventListener("click", () => {
      disclaimerOverlay.style.display = "none";
      dislog("Disclaimer agreed — overlay hidden.");
    });
  }
});
