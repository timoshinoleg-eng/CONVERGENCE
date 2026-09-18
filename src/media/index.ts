/**
 * Media layer barrel. Everything the application imports from the media
 * layer is re-exported here so consumers don't reach into internals.
 */

export * from "./types";
export * from "./capability";
export * from "./assetPolicy";
export * from "./timer";
export * from "./autoDismiss";
export * from "./i18n";
export * from "./manifest";
export * from "./persistence";
export * from "./reconciliation";
export { detectTriggerEvents, eventsToRequests, insertIdFor } from "./triggers";
export { MediaRuntime, type QueueEntry, type QueueEntryOrigin } from "./runtime";
export { useMediaStore } from "../stores/media";
