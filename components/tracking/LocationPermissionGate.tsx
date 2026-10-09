"use client";

import { useEffect, useState } from "react";
import { MapPin, AlertTriangle, Settings } from "lucide-react";
import { requestLocationPermission, getCurrentPosition } from "@/lib/tracking/geolocation";
import type { GeoReading } from "@/types/tracking";

interface LocationPermissionGateProps {
  onGranted: (reading: GeoReading) => void;
  onDenied?: () => void;
  onCancel?: () => void;
}

type Stage = "checking" | "prompt" | "denied" | "requesting" | "error";

const LOG = "[location-gate]";

function detectBrowser(): "chrome" | "safari" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "safari";
  if (/chrome/i.test(ua)) return "chrome";
  return "other";
}

export function LocationPermissionGate({
  onGranted,
  onDenied,
  onCancel,
}: LocationPermissionGateProps) {
  const [stage, setStage] = useState<Stage>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const browser = detectBrowser();

  useEffect(() => {
    console.log(LOG, "Mounted — checking permission (no browser prompt yet)");
    requestLocationPermission().then((state) => {
      console.log(LOG, "Initial permission state", { state });
      if (state === "granted") {
        console.log(LOG, "Already granted — fetching position");
        setStage("requesting");
        getCurrentPosition()
          .then((reading) => {
            console.log(LOG, "onGranted (already had permission)", reading);
            onGranted(reading);
          })
          .catch((err: GeolocationPositionError) => {
            if (err.code === 1) {
              console.warn(LOG, "Denied on getCurrentPosition");
              setStage("denied");
            } else {
              setErrorMsg(err.message ?? "Unable to get location.");
              setStage("error");
            }
          });
      } else if (state === "denied") {
        console.warn(LOG, "Permission denied in browser settings");
        setStage("denied");
      } else {
        console.log(LOG, "Showing in-app prompt — user must tap Allow to trigger browser dialog");
        setStage("prompt");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAllow = () => {
    console.log(LOG, "User tapped Allow — calling getCurrentPosition (browser prompt may appear)");
    setStage("requesting");
    getCurrentPosition()
      .then((reading) => {
        console.log(LOG, "onGranted after Allow tap", reading);
        onGranted(reading);
      })
      .catch((err: GeolocationPositionError) => {
        if (err.code === 1) {
          console.warn(LOG, "User denied browser prompt");
          setStage("denied");
        } else {
          setErrorMsg(err.message ?? "Location unavailable.");
          setStage("error");
        }
      });
  };

  if (stage === "checking" || stage === "requesting") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-dash-teal/10 flex items-center justify-center animate-pulse">
          <MapPin size={26} className="text-dash-teal" />
        </div>
        <p className="text-[14px] text-gray-500">
          {stage === "checking" ? "Checking location permission…" : "Getting your location…"}
        </p>
      </div>
    );
  }

  if (stage === "denied") {
    return (
      <div className="flex flex-col items-center gap-5 py-10 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
          <AlertTriangle size={26} className="text-red-400" />
        </div>
        <div>
          <h3 className="text-[16px] font-bold text-dash-dark mb-1">Location blocked</h3>
          <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs">
            Location access was denied. To start tracking, you need to enable it in your browser settings.
          </p>
        </div>

        <div className="w-full bg-gray-50 rounded-2xl p-4 text-left space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <Settings size={14} className="text-gray-400" />
            <span className="text-[12px] font-bold text-gray-500 uppercase tracking-wide">
              How to enable
            </span>
          </div>
          {browser === "chrome" && (
            <ol className="text-[12px] text-gray-500 space-y-1 list-decimal list-inside">
              <li>Click the lock icon in the address bar</li>
              <li>Find &quot;Location&quot; and set it to &quot;Allow&quot;</li>
              <li>Reload the page</li>
            </ol>
          )}
          {browser === "safari" && (
            <ol className="text-[12px] text-gray-500 space-y-1 list-decimal list-inside">
              <li>Open Settings → Safari → Location</li>
              <li>Set to &quot;Ask&quot; or &quot;Allow&quot;</li>
              <li>Reload the page</li>
            </ol>
          )}
          {browser === "other" && (
            <p className="text-[12px] text-gray-500">
              Open your browser settings and allow location access for this site, then reload.
            </p>
          )}
        </div>

        {onDenied && (
          <button
            onClick={onDenied}
            className="w-full py-3 rounded-2xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Go back
          </button>
        )}
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="flex flex-col items-center gap-5 py-10 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center">
          <AlertTriangle size={26} className="text-orange-400" />
        </div>
        <div>
          <h3 className="text-[16px] font-bold text-dash-dark mb-1">Location error</h3>
          <p className="text-[13px] text-gray-500">{errorMsg}</p>
        </div>
        <button
          onClick={handleAllow}
          className="w-full py-3.5 bg-dash-dark text-white rounded-2xl text-[14px] font-semibold"
        >
          Try again
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-[13px] text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // stage === "prompt"
  return (
    <div className="flex flex-col items-center gap-6 py-8 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-dash-teal/10 flex items-center justify-center">
        <MapPin size={30} className="text-dash-teal" />
      </div>

      <div>
        <h3 className="text-[17px] font-bold text-dash-dark mb-2">
          Location access needed
        </h3>
        <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs">
          To begin this task, we&apos;ll track your location so supervisors can monitor
          your route and confirm you&apos;ve arrived. Location sharing stops the moment
          you complete or cancel the task.
        </p>
      </div>

      <div className="w-full bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-left">
        <p className="text-[11px] text-amber-700 font-medium">
          Continuous GPS uses some battery. Consider keeping your device plugged in
          during long tasks.
        </p>
      </div>

      <div className="w-full space-y-3">
        <button
          onClick={handleAllow}
          className="w-full py-3.5 bg-[#7EB5AE] text-white rounded-2xl text-[14px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all"
        >
          Allow Location Access
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-2xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Not Now
          </button>
        )}
      </div>
    </div>
  );
}
