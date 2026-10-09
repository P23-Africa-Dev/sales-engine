/** Min live agents before Supercluster kicks in on the manager map. */
export const LIVE_AGENT_CLUSTER_MIN = 12;

/** Max zoom at which agents may still merge into clusters. */
export const LIVE_AGENT_CLUSTER_MAX_ZOOM = 12;

export function shouldClusterLiveAgents(
  agentCount: number,
  zoom: number,
  options?: { disableClustering?: boolean },
): boolean {
  if (options?.disableClustering) return false;
  return agentCount >= LIVE_AGENT_CLUSTER_MIN && zoom < LIVE_AGENT_CLUSTER_MAX_ZOOM;
}

export function createLiveAgentClusterElement(count: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = [
    "width:44px",
    "height:44px",
    "border-radius:9999px",
    "background:#0A192F",
    "color:white",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font-size:12px",
    "font-weight:700",
    "border:3px solid white",
    "box-shadow:0 8px 20px rgba(15,23,42,0.22)",
    "cursor:pointer",
  ].join(";");
  el.textContent = String(count);
  el.title = `${count} agents`;
  return el;
}
