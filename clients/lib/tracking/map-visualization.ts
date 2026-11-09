import type { LiveTaskState } from "@/types/tracking";

export type VisualTaskState =
    | "in_progress"
    | "near_destination"
    | "arrived"
    | "completed"
    | "stale"
    | "delayed";

type VisualPalette = {
    trail: string;
    connector: string;
    markerBorder: string;
    markerHalo: string;
    markerFill: string;
    markerText: string;
};

export const VISUAL_PALETTE: Record<VisualTaskState, VisualPalette> = {
    in_progress: {
        trail: "#0284C7",
        connector: "#38BDF8",
        markerBorder: "#0EA5E9",
        markerHalo: "rgba(14, 165, 233, 0.35)",
        markerFill: "#E0F2FE",
        markerText: "#0C4A6E",
    },
    near_destination: {
        trail: "#D97706",
        connector: "#F59E0B",
        markerBorder: "#D97706",
        markerHalo: "rgba(217, 119, 6, 0.35)",
        markerFill: "#FEF3C7",
        markerText: "#92400E",
    },
    arrived: {
        trail: "#16A34A",
        connector: "#22C55E",
        markerBorder: "#16A34A",
        markerHalo: "rgba(22, 163, 74, 0.35)",
        markerFill: "#DCFCE7",
        markerText: "#14532D",
    },
    completed: {
        trail: "#334155",
        connector: "#64748B",
        markerBorder: "#334155",
        markerHalo: "rgba(51, 65, 85, 0.35)",
        markerFill: "#E2E8F0",
        markerText: "#1E293B",
    },
    stale: {
        trail: "#94A3B8",
        connector: "#CBD5E1",
        markerBorder: "#6B7280",
        markerHalo: "rgba(107, 114, 128, 0.3)",
        markerFill: "#F3F4F6",
        markerText: "#4B5563",
    },
    delayed: {
        trail: "#DC2626",
        connector: "#F87171",
        markerBorder: "#DC2626",
        markerHalo: "rgba(220, 38, 38, 0.32)",
        markerFill: "#FEE2E2",
        markerText: "#991B1B",
    },
};

export const STATIC_MARKER_COLORS = {
    origin: {
        fill: "#2563EB",
        border: "#FFFFFF",
    },
    destination: {
        fill: "#DC2626",
        border: "#FFFFFF",
    },
    near: {
        fill: "#D97706",
        border: "#FFFFFF",
    },
    arrived: {
        fill: "#16A34A",
        border: "#FFFFFF",
    },
    completed: {
        fill: "#334155",
        border: "#FFFFFF",
    },
} as const;

const EPSILON = 1e-6;

export function getAgentInitials(name: string | null | undefined): string | null {
    const cleaned = String(name ?? "").trim();
    if (!cleaned) return null;

    const parts = cleaned
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length === 0) return null;

    if (parts.length === 1) {
        return parts[0].slice(0, 1).toUpperCase();
    }

    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function isFiniteCoordinate(point: [number, number] | null | undefined): point is [number, number] {
    if (!point) return false;
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        return false;
    }

    // Ignore default/uninitialized map coordinates.
    if (point[0] === 0 && point[1] === 0) {
        return false;
    }

    return true;
}

export function areSamePoint(a: [number, number], b: [number, number], epsilon = EPSILON): boolean {
    return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

export function sanitizePolyline(points: [number, number][]): [number, number][] {
    const sanitized: [number, number][] = [];

    for (const point of points) {
        if (!isFiniteCoordinate(point)) continue;

        const previous = sanitized[sanitized.length - 1];
        if (previous && areSamePoint(previous, point)) continue;

        sanitized.push(point);
    }

    return sanitized;
}

export function buildTaskTrail(task: LiveTaskState): [number, number][] {
    const baseTrail = sanitizePolyline(task.polyline ?? []);
    const current = isFiniteCoordinate(task.lastPosition) ? task.lastPosition : null;

    if (!current) {
        return baseTrail;
    }

    if (baseTrail.length === 0) {
        return [current];
    }

    const tail = baseTrail[baseTrail.length - 1];
    if (areSamePoint(tail, current)) {
        return baseTrail;
    }

    return [...baseTrail, current];
}

export function resolveVisualTaskState(
    status: LiveTaskState["status"],
    stale: boolean,
    operationalStatus?: LiveTaskState["operationalStatus"],
): VisualTaskState {
    if (stale) return "stale";
    if (operationalStatus === "delayed") return "delayed";
    return status;
}

export function buildDirectionSegment(trail: [number, number][]): [number, number][] | null {
    if (trail.length < 2) return null;
    return [trail[trail.length - 2], trail[trail.length - 1]];
}

export function createStaticMarkerElement(kind: "origin" | "destination" | "near" | "arrived" | "completed") {
    const root = document.createElement("div");
    
    if (kind === "origin") {
        root.style.width = "36px";
        root.style.height = "36px";
        root.style.borderRadius = "9999px";
        root.style.background = "#0095FF";
        root.style.boxShadow = "0 8px 16px rgba(0, 149, 255, 0.4)";
        root.style.display = "flex";
        root.style.alignItems = "center";
        root.style.justifyContent = "center";
        root.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M5 3L19 12L5 21V3Z" /></svg>`;
    } else {
        const color = kind === "destination" ? "#DC2626" : STATIC_MARKER_COLORS[kind].fill;
        root.innerHTML = `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
                <svg width="32" height="42" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 8px 12px rgba(220, 38, 38, 0.4));">
                    <path d="M12 0C5.37258 0 0 5.37258 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37258 18.6274 0 12 0Z" fill="${color}"/>
                    <circle cx="12" cy="12" r="5" fill="white"/>
                </svg>
            </div>
        `;
    }

    return root;
}

export function createPulseMarkerElement() {
    const root = document.createElement("div");
    root.style.position = "relative";
    root.style.width = "24px";
    root.style.height = "24px";
    root.style.display = "flex";
    root.style.alignItems = "center";
    root.style.justifyContent = "center";

    root.innerHTML = `
        <div style="position: absolute; width: 64px; height: 64px; background: rgba(217, 70, 239, 0.2); border-radius: 9999px; animation: map-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
        <div style="position: absolute; width: 40px; height: 40px; background: rgba(217, 70, 239, 0.4); border-radius: 9999px;"></div>
        <div style="position: relative; width: 24px; height: 24px; background: #FFF; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
            <div style="width: 12px; height: 12px; background: #D946EF; border-radius: 9999px;"></div>
        </div>
        <style>
            @keyframes map-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: .6; transform: scale(1.15); }
            }
        </style>
    `;
    return root;
}

export function createAgentMarkerElement(input: {
    name: string;
    avatarUrl?: string;
    visualState: VisualTaskState;
    stale: boolean;
    /** When an agent has multiple live tasks, show a count badge. */
    taskCount?: number;
}) {
    const root = document.createElement("div");
    root.dataset.marker = "agent";
    root.style.position = "relative";
    root.style.width = "44px";
    root.style.height = "44px";
    root.style.borderRadius = "9999px";
    root.style.display = "flex";
    root.style.alignItems = "center";
    root.style.justifyContent = "center";
    root.style.cursor = "pointer";
    root.style.userSelect = "none";

    const halo = document.createElement("span");
    halo.dataset.part = "halo";
    halo.style.position = "absolute";
    halo.style.inset = "-5px";
    halo.style.borderRadius = "9999px";
    halo.style.pointerEvents = "none";

    const shell = document.createElement("span");
    shell.dataset.part = "shell";
    shell.style.position = "relative";
    shell.style.width = "100%";
    shell.style.height = "100%";
    shell.style.borderRadius = "9999px";
    shell.style.overflow = "hidden";
    shell.style.display = "flex";
    shell.style.alignItems = "center";
    shell.style.justifyContent = "center";
    shell.style.fontSize = "12px";
    shell.style.fontWeight = "700";
    shell.style.textTransform = "uppercase";

    const img = document.createElement("img");
    img.dataset.part = "avatar";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.display = "none";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";

    const initials = document.createElement("span");
    initials.dataset.part = "initials";

    const generic = document.createElement("span");
    generic.dataset.part = "generic";
    generic.textContent = "#";
    generic.style.display = "none";

    // Direction-of-travel arrow: a ring-mounted chevron rotated to the agent's
    // bearing. Hidden until a heading is known.
    const heading = document.createElement("span");
    heading.dataset.part = "heading";
    heading.style.position = "absolute";
    heading.style.inset = "-12px";
    heading.style.borderRadius = "9999px";
    heading.style.pointerEvents = "none";
    heading.style.opacity = "0";
    heading.style.transition = "transform 300ms ease-out, opacity 200ms ease-out";
    heading.style.display = "flex";
    heading.style.alignItems = "flex-start";
    heading.style.justifyContent = "center";
    heading.innerHTML = `
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(15,23,42,0.35));">
            <path d="M8 0L15.5 10H0.5L8 0Z" fill="#0EA5E9"/>
        </svg>
    `;

    const badge = document.createElement("span");
    badge.dataset.part = "task-count";
    badge.style.cssText = [
        "position:absolute",
        "top:-4px",
        "right:-4px",
        "min-width:18px",
        "height:18px",
        "padding:0 4px",
        "border-radius:9999px",
        "background:#DC2626",
        "color:#fff",
        "font-size:10px",
        "font-weight:700",
        "display:none",
        "align-items:center",
        "justify-content:center",
        "border:2px solid #fff",
        "z-index:2",
        "box-sizing:border-box",
    ].join(";");

    shell.appendChild(img);
    shell.appendChild(initials);
    shell.appendChild(generic);
    root.appendChild(heading);
    root.appendChild(halo);
    root.appendChild(shell);
    root.appendChild(badge);

    updateAgentMarkerElement(root, input);

    return root;
}

/**
 * Rotate the direction arrow around an agent marker to the given compass
 * bearing (degrees, 0 = north). Pass null to hide the arrow (e.g. stationary).
 */
export function updateAgentMarkerHeading(root: HTMLElement, bearingDegrees: number | null) {
    const arrow = root.querySelector<HTMLElement>("[data-part='heading']");
    if (!arrow) return;

    if (bearingDegrees == null || !Number.isFinite(bearingDegrees)) {
        arrow.style.opacity = "0";
        return;
    }

    arrow.style.opacity = "1";
    arrow.style.transform = `rotate(${bearingDegrees}deg)`;
}

export function updateAgentMarkerElement(
    root: HTMLElement,
    input: {
        name: string;
        avatarUrl?: string;
        visualState: VisualTaskState;
        stale: boolean;
        taskCount?: number;
    }
) {
    const palette = VISUAL_PALETTE[input.visualState];
    const shell = root.querySelector<HTMLElement>("[data-part='shell']");
    const halo = root.querySelector<HTMLElement>("[data-part='halo']");
    const img = root.querySelector<HTMLImageElement>("[data-part='avatar']");
    const initials = root.querySelector<HTMLElement>("[data-part='initials']");
    const generic = root.querySelector<HTMLElement>("[data-part='generic']");
    const badge = root.querySelector<HTMLElement>("[data-part='task-count']");

    if (!shell || !halo || !img || !initials || !generic) {
        return;
    }

    if (badge) {
        const count = input.taskCount ?? 0;
        if (count > 1) {
            badge.style.display = "flex";
            badge.textContent = count > 9 ? "9+" : String(count);
            badge.title = `${count} live tasks`;
        } else {
            badge.style.display = "none";
            badge.textContent = "";
        }
    }

    shell.style.border = `3px solid ${palette.markerBorder}`;
    shell.style.background = palette.markerFill;
    shell.style.color = palette.markerText;
    shell.style.boxShadow = "0 8px 16px rgba(15, 23, 42, 0.24)";

    halo.style.background = palette.markerHalo;
    halo.style.opacity = input.stale ? "0.45" : "1";

    const headingArrow = root.querySelector<SVGPathElement>("[data-part='heading'] path");
    if (headingArrow) {
        headingArrow.setAttribute("fill", palette.markerBorder);
    }

    const initialsLabel = getAgentInitials(input.name);
    initials.textContent = initialsLabel ?? "";

    const applyFallback = () => {
        img.style.display = "none";
        initials.style.display = initialsLabel ? "flex" : "none";
        generic.style.display = initialsLabel ? "none" : "flex";
        generic.style.alignItems = "center";
        generic.style.justifyContent = "center";
    };

    const requestedUrl = input.avatarUrl?.trim() ?? "";

    const showLoadedImage = () => {
        img.style.display = "block";
        initials.style.display = "none";
        generic.style.display = "none";
        root.dataset.loadedAvatarUrl = requestedUrl;
    };

    if (!requestedUrl) {
        img.removeAttribute("src");
        delete root.dataset.loadedAvatarUrl;
        applyFallback();
        return;
    }

    img.alt = `${input.name || "Agent"} avatar`;
    img.referrerPolicy = "no-referrer";

    const loadedUrl = root.dataset.loadedAvatarUrl ?? "";

    if (loadedUrl === requestedUrl && img.complete && img.naturalWidth > 0) {
        showLoadedImage();
        return;
    }

    // Show initials while the new URL loads (or after a failed load via onerror).
    applyFallback();

    img.onerror = () => {
        delete root.dataset.loadedAvatarUrl;
        applyFallback();
    };
    img.onload = showLoadedImage;

    if (loadedUrl !== requestedUrl) {
        img.removeAttribute("src");
        delete root.dataset.loadedAvatarUrl;
    }

    img.setAttribute("src", requestedUrl);
}
