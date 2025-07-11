console.log("Module loaded: disclaimerModule");

document.addEventListener("DOMContentLoaded", () => {
  const disclaimerOverlay = document.getElementById("disclaimerOverlay");
  const agreeDisclaimer = document.getElementById("agreeDisclaimer");

  if (agreeDisclaimer) {
    agreeDisclaimer.addEventListener("click", () => {
      disclaimerOverlay.style.display = "none";
      console.log("Disclaimer agreed — overlay hidden.");
    });
  }
});
