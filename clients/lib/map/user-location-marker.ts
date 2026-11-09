export function createUserLocationIndicatorElement() {
  const root = document.createElement("div");
  root.style.position = "relative";
  root.style.width = "18px";
  root.style.height = "18px";
  root.style.borderRadius = "9999px";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";
  root.style.pointerEvents = "none";

  root.innerHTML = `
    <div style="position:absolute; width:40px; height:40px; border-radius:9999px; background:rgba(37,99,235,0.2); animation:dashboard-user-pulse 1.8s ease-out infinite;"></div>
    <div style="position:absolute; width:24px; height:24px; border-radius:9999px; background:rgba(59,130,246,0.35);"></div>
    <div style="position:relative; width:18px; height:18px; border-radius:9999px; background:#2563EB; border:3px solid #FFFFFF; box-shadow:0 4px 14px rgba(37,99,235,0.4);"></div>
    <style>
      @keyframes dashboard-user-pulse {
        0% { transform: scale(0.7); opacity: .8; }
        100% { transform: scale(1.35); opacity: 0; }
      }
    </style>
  `;

  return root;
}
