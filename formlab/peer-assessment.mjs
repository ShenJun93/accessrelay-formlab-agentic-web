// P764: Strict, browser-local intake contract for a remote accessibility advisor.
// Pure validation only. Does NOT authenticate a peer, call an LLM, or mutate the DOM.
import {getIssues} from "./form-core.mjs";

export const ASSESSMENT_PROTOCOL = "accessrelay-form-review/v1";
export const ASSESSMENT_RULES = Object.freeze({
  associate_label: Object.freeze({
    ruleId: "form-label-for/v1",
    reasonCode: "label_not_associated",
    change: "Associate the visible label with the email input by setting for=email."
  }),
  announce_errors: Object.freeze({
    ruleId: "form-error-announcement/v1",
    reasonCode: "validation_error_not_announced",
    change: "Make validation feedback available to assistive technology using role=alert."
  }),
  increase_contrast: Object.freeze({
    ruleId: "form-helper-contrast/v1",
    reasonCode: "helper_text_low_contrast",
    change: "Use the verified high-contrast helper text token."
  })
});

const REQUEST_KEYS = Object.freeze([
  "protocol", "requestId", "siteOrigin", "peerOrigin",
  "issueId", "ruleId", "expectedVersion", "signalStatus"
]);
const RESPONSE_KEYS = Object.freeze([
  "protocol", "requestId", "siteOrigin", "peerOrigin",
  "issueId", "ruleId", "expectedVersion", "decision", "reasonCode"
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function hasExactKeys(obj, expected) {
  if (!isRecord(obj)) return false;
  const keys = Object.keys(obj);
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  return keys.length === expected.length && expected.every(k => {
    const prop = descriptors[k];
    if (!prop || !Object.prototype.hasOwnProperty.call(prop, "value")) return false;
    const v = prop.value;
    return (typeof v === "string" && v.length <= 180)
      || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
  });
}
function safeOrigin(value) {
  if (typeof value !== "string" || value.length > 180) return false;
  try {
    const u = new URL(value);
    if (value !== u.origin || u.username || u.password) return false;
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
    return u.protocol === "https:" || (u.protocol === "http:" && loopback);
  } catch { return false; }
}
const reject = reason => ({ok: false, reason});

export function makeAssessmentRequest({state, fixId, requestId, siteOrigin, peerOrigin}) {
  if (!state || !Number.isSafeInteger(state.version) || state.version < 0)
    throw new TypeError("A current, non-negative local form version is required.");
  if (!UUID_V4.test(requestId ?? "")) throw new TypeError("A fresh UUID v4 request ID is required.");
  if (!safeOrigin(siteOrigin) || !safeOrigin(peerOrigin) || siteOrigin === peerOrigin)
    throw new TypeError("Distinct HTTPS origins or loopback HTTP origins are required.");
  const rule = Object.prototype.hasOwnProperty.call(ASSESSMENT_RULES, fixId)
    ? ASSESSMENT_RULES[fixId] : null;
  if (!rule) throw new TypeError("Unknown assessment rule.");
  if (!getIssues(state).some(issue => issue.id === fixId))
    throw new TypeError("The selected issue is no longer outstanding.");
  // Deliberately exclude DOM, text nodes, user-entered form values and model prompts.
  return Object.freeze({
    protocol: ASSESSMENT_PROTOCOL, requestId,
    siteOrigin, peerOrigin, issueId: fixId,
    ruleId: rule.ruleId, expectedVersion: state.version,
    signalStatus: "needs_review"
  });
}

export function validatePeerAssessment({request, reply, observedPeerOrigin, currentState}) {
  if (!hasExactKeys(request, REQUEST_KEYS)) return reject("invalid_local_request");
  if (!hasExactKeys(reply, RESPONSE_KEYS)) return reject("invalid_peer_schema");
  if (!safeOrigin(observedPeerOrigin) || observedPeerOrigin !== request.peerOrigin)
    return reject("peer_origin_mismatch");
  if (!currentState || !Number.isSafeInteger(currentState.version)
      || currentState.version !== request.expectedVersion)
    return reject("stale_form_version");
  const rule = Object.prototype.hasOwnProperty.call(ASSESSMENT_RULES, request.issueId)
    ? ASSESSMENT_RULES[request.issueId] : null;
  if (!rule || !UUID_V4.test(request.requestId)
      || !safeOrigin(request.siteOrigin) || !safeOrigin(request.peerOrigin)
      || request.siteOrigin === request.peerOrigin
      || request.protocol !== ASSESSMENT_PROTOCOL
      || request.ruleId !== rule.ruleId || request.signalStatus !== "needs_review"
      || !getIssues(currentState).some(x => x.id === request.issueId))
    return reject("invalid_or_expired_request");
  for (const key of [
    "protocol", "requestId", "siteOrigin", "peerOrigin",
    "issueId", "ruleId", "expectedVersion"
  ]) {
    if (reply[key] !== request[key]) return reject("reply_binding_mismatch");
  }
  if (reply.decision === "abstain") {
    return reply.reasonCode === "insufficient_evidence"
      ? reject("peer_abstained")
      : reject("invalid_peer_decision");
  }
  if (reply.decision !== "recommend" || reply.reasonCode !== rule.reasonCode)
    return reject("invalid_peer_decision");
  // Only the HOST's prewritten text is displayed. No model-supplied HTML, JS or prose.
  return Object.freeze({
    ok: true, issueId: request.issueId, ruleId: rule.ruleId,
    expectedVersion: request.expectedVersion,
    recommendedChange: rule.change,
    requiresHumanApproval: true, verifiedDomChange: false,
    provenance: "peer_origin_matched_by_caller; not cryptographically authenticated",
    nextAction: "Call the existing local preview tool. Do not auto-apply."
  });
}

export function createSingleUseAssessmentGate({request, observedPeerOrigin}) {
  let accepted = false;
  return Object.freeze({
    assess(reply, currentState) {
      if (accepted) return reject("replayed_assessment");
      const result = validatePeerAssessment({
        request, reply, observedPeerOrigin, currentState
      });
      if (result.ok) accepted = true;
      return result;
    }
  });
}
