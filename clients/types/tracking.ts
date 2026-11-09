export type TrackingEventType =
  | "tracking.task.started"
  | "tracking.task.near_destination"
  | "tracking.location.updated"
  | "tracking.task.arrived"
  | "tracking.task.completed"
  | "tracking.agent.location.updated"
  | "tracking.task.reassigned";

export type OperationalTrackingStatus =
  | "available"
  | "en_route"
  | "near_destination"
  | "destination_reached"
  | "completed"
  | "delayed"
  | "offline";

export interface LiveTaskState {
  taskId: number;
  trackingSessionId: number;
  userId: number;
  agentName: string;
  agentAvatarUrl?: string;
  taskTitle: string;
  projectName?: string;
  taskAddress?: string;
  status: "in_progress" | "near_destination" | "arrived" | "completed";
  operationalStatus?: OperationalTrackingStatus;
  destination?: { lat: number; lng: number; radiusM?: number };
  lastPosition: [number, number]; // [lng, lat] — Mapbox convention
  polyline: [number, number][]; // capped at 2000 pts
  trackingStartedAt?: string;
  lastEventAt: string; // ISO — event/device time (may carry skewed timezone)
  lastReceivedAt?: number; // client epoch ms when this update was received — skew-proof staleness basis
  nearDetectedAt?: string;
  arrivedAt?: string;
  distanceToDestinationMeters?: number | null;
  distanceRemainingMeters?: number | null;
  movementStarted?: boolean;
  speedMps?: number | null;
  headingDegrees?: number | null;
  etaSeconds?: number | null;
  routeDeviationMeters?: number | null;
  /** GPS accuracy from last location point (meters). */
  accuracyMeters?: number | null;
  /** From snapshot API / WS — authoritative online signal from backend. */
  isOnline?: boolean;
}

export interface TrackingEnvelope {
  type: TrackingEventType;
  channel: string;
  payload: {
    task_id: number;
    tracking_session_id: number;
    user_id: number;
    company_id: number;
    occurred_at: string;
    data?: {
      latitude?: number;
      longitude?: number;
      accuracy_meters?: number;
      speed_mps?: number;
      heading_degrees?: number;
      event_type?: string;
      arrived?: boolean;
      near_destination?: boolean;
      proximity_state?: "in_progress" | "near_destination" | "arrived" | "completed";
      distance_to_destination_meters?: number | null;
      distance_remaining_meters?: number | null;
      eta_seconds?: number | null;
      route_deviation_meters?: number | null;
      movement_started?: boolean;
      operational_status?: OperationalTrackingStatus;
      is_online?: boolean;
      task_status?: string;
      arrival_recorded_at?: string;
      near_recorded_at?: string;
      destination?: {
        latitude?: number;
        longitude?: number;
        radius_meters?: number;
        near_radius_meters?: number;
      };
      task?: {
        id?: number;
        title?: string | null;
        status?: string | null;
        address?: string | null;
        location?: string | null;
        destination_latitude?: number | null;
        destination_longitude?: number | null;
        project?: {
          id?: number | null;
          name?: string | null;
          status?: string | null;
        } | null;
      };
      agent?: {
        id?: number;
        name?: string | null;
        internal_role?: string | null;
        avatar_url?: string | null;
      };
      reassignment_id?: number;
      from_user_id?: number;
      to_user_id?: number;
      reassignment_status?: string;
      location?: {
        latitude?: number;
        longitude?: number;
        accuracy_meters?: number | null;
        speed_mps?: number | null;
        heading_degrees?: number | null;
        event_type?: string | null;
        near_destination?: boolean;
        distance_to_destination_meters?: number | null;
        distance_remaining_meters?: number | null;
        eta_seconds?: number | null;
        route_deviation_meters?: number | null;
        recorded_at?: string | null;
      };
      status?: {
        is_online?: boolean;
        is_stale?: boolean;
        proximity_state?: "in_progress" | "near_destination" | "arrived" | "completed";
        last_seen_at?: string | null;
        stale_after_seconds?: number;
        age_seconds?: number | null;
        operational_status?: OperationalTrackingStatus;
      };
    };
  };
}

export interface AgentLocationSnapshotItem {
  agent: {
    id: number;
    name: string | null;
    email?: string | null;
    avatar?: string | null;
    avatar_url?: string | null;
    internal_role?: string | null;
  };
  task: {
    id: number | null;
    title?: string | null;
    status?: string | null;
    tracking_session_id?: number | null;
    address?: string | null;
    location?: string | null;
    destination_latitude?: number | null;
    destination_longitude?: number | null;
  };
  location: {
    latitude: number;
    longitude: number;
    accuracy_meters?: number | null;
    speed_mps?: number | null;
    heading_degrees?: number | null;
    event_type?: string | null;
    arrived?: boolean;
    near_destination?: boolean;
    distance_to_destination_meters?: number | null;
    distance_remaining_meters?: number | null;
    eta_seconds?: number | null;
    route_deviation_meters?: number | null;
    recorded_at?: string | null;
  };
  status: {
    is_online: boolean;
    is_stale: boolean;
    proximity_state?: "in_progress" | "near_destination" | "arrived" | "completed";
    stale_after_seconds?: number;
    age_seconds?: number | null;
    last_seen_at?: string | null;
    operational_status?: OperationalTrackingStatus;
  };
  updated_at?: string | null;
}

export interface AgentLocationsListData {
  items: AgentLocationSnapshotItem[];
  meta: {
    company_id: number;
    stale_after_seconds: number;
    generated_at: string;
  };
}

export interface TrackingSession {
  id: number;
  task_id: number;
  company_id?: number;
  started_by_user_id?: number;
  start_latitude?: number;
  start_longitude?: number;
  near_detected_at?: string | null;
  arrival_detected_at?: string | null;
  end_recorded_at?: string | null;
  start?: {
    latitude?: number | null;
    longitude?: number | null;
    accuracy_meters?: number | null;
    recorded_at?: string | null;
  };
  near?: {
    latitude?: number | null;
    longitude?: number | null;
    recorded_at?: string | null;
  };
  arrival?: {
    latitude?: number | null;
    longitude?: number | null;
    recorded_at?: string | null;
  };
  end?: {
    latitude?: number | null;
    longitude?: number | null;
    accuracy_meters?: number | null;
    recorded_at?: string | null;
  };
  destination?: {
    latitude?: number | null;
    longitude?: number | null;
    radius_meters?: number | null;
  };
  updated_at?: string | null;
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
  speed_mps?: number;
  heading_degrees?: number;
  event_type: "movement" | "start" | "near_destination" | "arrival" | "complete";
  is_checkpoint: boolean;
  recorded_at: string;
}

export interface TaskRoute {
  task_id: number;
  company_id: number;
  status: string;
  destination: { latitude: number; longitude: number; radius_meters: number };
  start: { latitude: number; longitude: number; recorded_at: string };
  near: { latitude: number; longitude: number; recorded_at: string } | null;
  arrival: { latitude: number; longitude: number; recorded_at: string } | null;
  end: { latitude: number; longitude: number; recorded_at: string } | null;
  proximity?: {
    state: "in_progress" | "near_destination" | "arrived" | "completed";
    distance_to_destination_meters: number | null;
    distance_remaining_meters: number | null;
    speed_mps?: number | null;
    eta_seconds?: number | null;
    route_deviation_meters?: number | null;
    operational_status?: OperationalTrackingStatus;
  };
  summary: { points_count: number; total_distance_meters: number };
  points: LocationPoint[];
  polyline: [number, number][];
}

export interface GeoReading {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string;
}

export interface StartTrackingPayload {
  company_id: number | string;
  location_permission_granted: true;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  recorded_at?: string;
}

export interface RecordLocationPayload {
  company_id: number | string;
  // single point fields
  latitude?: number;
  longitude?: number;
  accuracy_meters?: number | null;
  speed_mps?: number | null;
  heading_degrees?: number | null;
  recorded_at?: string;
  // batch
  points?: Array<{
    latitude: number;
    longitude: number;
    accuracy_meters?: number | null;
    speed_mps?: number | null;
    heading_degrees?: number | null;
    recorded_at: string;
  }>;
}

export interface RecordLocationResponse {
  received_points: number;
  persisted_points: number;
  near_destination?: boolean;
  arrived: boolean;
  proximity_state?: "in_progress" | "near_destination" | "arrived" | "completed";
  distance_to_destination_meters?: number | null;
  distance_remaining_meters?: number | null;
  movement_started?: boolean;
}
