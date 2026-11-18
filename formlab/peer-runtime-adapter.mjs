// P765: first-party integration with the official Cognizant Engine.
// No vendored runtime edits. Untrusted peer text may only become an allowlisted preview.
import {manifestAllowsPeer} from "./runtime/engine.js";
import {
  ASSESSMENT_RULES, makeAssessmentRequest, createSingleUseAssessmentGate
} from "./peer-assessment.mjs";

const MAX_RESPONSE_BYTES = 1600;
const fail = reason => ({ok:false,reason});

function parseExactReply(result) {
  if (!result || typeof result !== "object"
      || !Object.prototype.hasOwnProperty.call(result,"text")
      || typeof result.text !== "string") return fail("peer_response_not_structured");
  const text = result.text;
  if (!text || new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES)
    return fail("peer_response_size_invalid");
  // Deliberately no Markdown fences, prefix text, XML, pseudo-tool calls or best-effort coercion.
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return fail("peer_response_not_object");
    return {ok:true,payload:parsed};
  } catch {
    return fail("peer_response_not_json");
  }
}

export async function requestVerifiedPeerAssessment({
  engine, localOrigin, peerUrl, fixId, requestId, readCurrentState,
}) {
  if (typeof readCurrentState !== "function") return fail("local_state_unavailable");
  if (!engine?.top?.manifest || typeof engine.resolveRemote !== "function")
    return fail("runtime_unavailable");
  // Engine's absent-UI default allows headless consent: explicitly reject it here.
  if (typeof engine.onConsent !== "function" ||
      typeof engine.requestConsent !== "function")
    return fail("runtime_consent_unavailable");
  if (typeof engine.byokKey !== "string" || !engine.byokKey.trim())
    return fail("inference_provider_not_configured");

  let url, trustedSiteOrigin, request;
  try {
    url = new URL(peerUrl);
    trustedSiteOrigin = new URL(localOrigin).origin;
    if (!url.pathname.endsWith("/accessrelay") || url.search || url.hash)
      return fail("unexpected_peer_network");
    if (!manifestAllowsPeer(url.href,engine.top.manifest))
      return fail("peer_not_allowlisted");
    request = makeAssessmentRequest({
      state: readCurrentState(), fixId, requestId,
      siteOrigin: trustedSiteOrigin, peerOrigin:url.origin
    });
  } catch { return fail("invalid_assessment_request"); }

  // The request text is *only* a fixed public signal. No form field values, DOM or secrets.
  const outbound = JSON.stringify(request);
  let decision;
  try {
    decision = await engine.requestConsent({
      kind:"network",peerLabel:"AccessRelay structured assessment",peerOrigin:url.origin,
      requestText:outbound,est:{totalTokens:250,costText:null}
    });
  } catch { return fail("consent_failed"); }
  if (decision !== "allow" && decision !== "always") return fail("consent_declined");

  let session;
  try {
    session = await engine.resolveRemote(url.href, [], null, engine.top.manifest);
  } catch { return fail("peer_network_fetch_failed"); }

  // Origin from trusted Engine session (constructed after browser fetch) — never model text.
  let observedOrigin;
  try { observedOrigin=new URL(session.base).origin; }
  catch { return fail("peer_session_origin_unavailable"); }
  if (observedOrigin !== url.origin) return fail("peer_session_origin_mismatch");
  if (session.network?.name !== "accessrelay" || typeof session.invoke !== "function")
    return fail("peer_session_network_mismatch");

  const rule = ASSESSMENT_RULES[fixId];
  // The rule code is first-party and fixed. Never ask the peer to emit free-form DOM edits.
  const prompt = [
    "Return only one compact JSON object, no Markdown or code fences.",
    "Use precisely these fields: protocol, requestId, siteOrigin, peerOrigin, issueId, ruleId, expectedVersion, decision, reasonCode.",
    "Repeat binding fields exactly from the following public request.",
    "If you cannot assess the targeted issue, reply decision=abstain and reasonCode=insufficient_evidence.",
    "To recommend, use decision=recommend and reasonCode="+rule.reasonCode+".",
    "Never include form values, credentials, HTML, scripts, links, notes, or extra fields.",
    "Request:",outbound
  ].join("\n");

  let response;
  try {
    response = await session.invoke({
      user_message:{type:"HUMAN",text:prompt}, sly_data:{},
      chat_filter:{chat_filter_type:"MINIMAL"}
    },{chain:[]});
  } catch { return fail("peer_inference_failed"); }
  const parsed=parseExactReply(response);
  if (!parsed.ok) return parsed;
  // Re-read the canonical form state AFTER the async peer result to defeat stale responses.
  const gate=createSingleUseAssessmentGate({request,observedPeerOrigin:observedOrigin});
  const verdict=gate.assess(parsed.payload,readCurrentState());
  if (!verdict.ok) return verdict;
  return {
    ok:true, trustedPeerOrigin:observedOrigin,
    requestId:request.requestId, assessedVersion:verdict.expectedVersion,
    issueId:verdict.issueId, ruleId:verdict.ruleId,
    recommendedChange:verdict.recommendedChange,
    requiresHumanApproval:true, verifiedDomChange:false,
    // Does not leak any arbitrary text from peer into UI.
    nextAction:"Local preview only; explicit human approval required."
  };
}
