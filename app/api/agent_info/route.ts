import {
  EVIDENCE_REASONING_SYSTEM_PROMPT,
  LISTING_EDITOR_SYSTEM_PROMPT,
  SUPERVISOR_SYSTEM_PROMPT
} from "@/lib/prompts";

const JSON_ONLY_INSTRUCTION = "Return only valid JSON. Do not include markdown, prose, or code fences.";

function effectiveSystemPrompt(systemPrompt: string): string {
  return [systemPrompt, JSON_ONLY_INSTRUCTION].join("\n\n");
}

export function GET() {
  return Response.json({
    description:
      "FixGap AI is an autonomous demo agent for Lisbon short-term-rental managers. It compares a simulated Airbnb listing page with real guest-review evidence, uses nearby Google Places context when it can strengthen guest-facing value, and updates only allowed demo page text after Supervisor approval. For review-gap tasks, it does not send the full review corpus to the LLM; it retrieves focused review evidence with Pinecone, converts retrieved reviews into structured guest-experience signals for common short-term-rental gaps, stores those observations in state, and then uses the LLM to reason over the compact state and choose the next action. It can also identify repeated fixable property or operations issues from guest complaints, accumulate those findings across repeated review windows in the same demo session, and recommend what the manager should improve first. Re-running the same request continues review coverage from the previous window, so the agent can gather more evidence across the full review corpus and stop when no safe new edit or issue remains. How to use video: https://drive.google.com/file/d/19gj8hQShXqdnhYH7rVQFDOyaZtzfOImp/view?usp=sharing",
    purpose:
      "Keep Lisbon Airbnb listing pages accurate, persuasive, and aligned with real guest experience by finding review-backed gaps, surfacing valuable nearby places only when supported, recommending fixable property or operations improvements from guest complaints, and avoiding invented claims, live Airbnb access, pricing actions, booking actions, private messages, and unnecessary LLM calls.",
    prompt_template: {
      template:
        "Selected listing id: <listing_id>\nHi, I manage several Airbnb listings in Lisbon. Please handle \"<listing_name>\" end to end: compare the current page with guest reviews first, use nearby context only when useful, decide what is safe to improve, update the simulated listing page, and tell me exactly what changed."
    },
    prompt_examples: [
      {
        prompt:
          "Selected listing id: 45855270\nHi, I manage several Airbnb listings in Lisbon. Please handle \"Rossio Garden Hotel\" end to end: compare the current page with guest reviews first, use nearby context only when useful, decide what is safe to improve, update the simulated listing page, and tell me exactly what changed.",
        full_response:
          "Approved and executed in the demo environment for listing 45855270: Rossio Garden Hotel.\n\nWhat changed: the agent updated the description with evidence-backed guest-facing copy that combines repeated Airbnb review strengths with nearby Google Places context where useful.\n\nWhy this improves the page: it makes the listing more persuasive by surfacing strengths that guests repeatedly mention, without inventing unsupported claims.\n\nEvidence used: Guest-confirmed walkable location; Guest-confirmed cleanliness; Guest-confirmed refreshed property quality; Rated nearby guest options.\n\nNo live Airbnb account was accessed. The update was applied only to the simulated listing page and recorded in the audit log.",
        steps: [
          {
            module: "Autonomous Listing Editor Agent",
            prompt: {
              system_prompt: effectiveSystemPrompt(LISTING_EDITOR_SYSTEM_PROMPT),
              user_prompt:
                "{\"listing_id\":\"45855270\",\"intent\":[\"review_alignment\",\"location\",\"hills\",\"stairs\",\"noise\",\"wifi\",\"cleanliness\",\"comfort\",\"temperature\",\"view\",\"space\",\"service\",\"property_quality\",\"nearby_highlights\"],\"selected_actions_so_far\":[\"get_listing_data\",\"extract_claims\"],\"deterministic_planner\":false,\"has_listing\":true,\"has_claims\":true,\"has_review_observations\":false,\"has_google_places_context\":false,\"has_signals\":false,\"has_proposal\":false,\"revise_count\":0,\"runtime_observations\":[]}"
            },
            response: {
              next_action: "search_reviews",
              tool_input: {
                listing_id: "45855270"
              },
              short_rationale: "Need guest review evidence first.",
              state_update: "No review evidence yet.",
              should_stop: false,
              llm_call: true,
              attempt: 1
            }
          },
          {
            module: "Autonomous Listing Editor Agent",
            prompt: {
              system_prompt: effectiveSystemPrompt(EVIDENCE_REASONING_SYSTEM_PROMPT),
              user_prompt:
                "{\"mode\":\"listing_edit\",\"listing_id\":\"45855270\",\"listing_name\":\"Rossio Garden Hotel\",\"current_listing_content\":\"Rossio Garden Hotel is a hotel located in Lisbon Historical Center...\",\"review_search_stats\":{\"source\":\"pinecone\",\"strategy\":\"adaptive_time_boxed_end_to_end_alignment\",\"coverage_checked\":240,\"coverage_total\":1909,\"coverage_complete\":false},\"detected_signals\":[{\"topic\":\"Guest-confirmed walkable location\",\"primary_review_evidence_count\":64,\"suggested_use\":\"positive_public_copy\"},{\"topic\":\"Guest-confirmed cleanliness\",\"primary_review_evidence_count\":30,\"suggested_use\":\"positive_public_copy\"},{\"topic\":\"Guest-confirmed refreshed property quality\",\"primary_review_evidence_count\":9,\"suggested_use\":\"positive_public_copy\"}],\"uncovered_public_opportunities\":[{\"topic\":\"Guest-confirmed walkable location\",\"copy_angle\":\"guest-confirmed central walkability and easy Lisbon exploring\"},{\"topic\":\"Guest-confirmed refreshed property quality\",\"copy_angle\":\"modern, refreshed, renovated, or quality room feel, phrased modestly without overclaiming luxury\"}],\"nearby_highlight_candidates\":[\"VAGALUME wine bar (5.0/5, 40 Google reviews, about 1 km away)\",\"Bar Na Colina (4.9/5, 40 Google reviews, about 1 km away)\"],\"decision_instructions\":\"Return public listing copy only if it is attractive, concise, evidence-backed, and guest-facing.\"}"
            },
            response: {
              decision: "generate_listing_content",
              rationale: "Repeated guest evidence supports a richer positive listing update.",
              evidence_topics: [
                "Guest-confirmed walkable location",
                "Guest-confirmed cleanliness",
                "Guest-confirmed refreshed property quality",
                "Rated nearby guest options"
              ],
              proposed_description_addition:
                "Guests consistently praise the hotel's central, walkable Rossio location, clean rooms, helpful refreshed feel, and easy access to nearby Lisbon options.",
              proposed_description_replacement: null,
              manager_recommendations: [],
              llm_call: true,
              attempt: 1
            }
          },
          {
            module: "Supervisor / Control Agent",
            prompt: {
              system_prompt: effectiveSystemPrompt(SUPERVISOR_SYSTEM_PROMPT),
              user_prompt:
                "{\"proposal\":{\"action\":\"prepare_edit_proposal\",\"target_fields\":[\"description\"],\"listing_id\":\"45855270\",\"evidence_topics\":[\"Guest-confirmed walkable location\",\"Guest-confirmed cleanliness\",\"Guest-confirmed refreshed property quality\",\"Rated nearby guest options\"]},\"current_page_description\":\"Rossio Garden Hotel is a hotel located in Lisbon Historical Center...\",\"guardrails\":{\"passed\":true,\"violations\":[]},\"signals\":[{\"topic\":\"Guest-confirmed walkable location\",\"primaryEvidenceCount\":64},{\"topic\":\"Guest-confirmed refreshed property quality\",\"primaryEvidenceCount\":9}],\"review_instruction\":\"Judge the proposed page action against the supplied evidence and guardrails.\"}"
            },
            response: {
              decision: "Approve",
              rationale: "The edit is narrow, evidence-backed, guest-facing, and limited to the simulated listing page.",
              required_change: null,
              llm_call: true,
              attempt: 1
            }
          }
        ]
      },
      {
        prompt:
          "Selected listing id: 45855270\nFor \"Rossio Garden Hotel\", do not edit the page. Use guest reviews to tell me which fixable property or operations issues are bothering guests, what I should improve first, and why it could improve reviews, bookings, or listing quality.",
        full_response:
          "Manager recommendations for listing 45855270: Rossio Garden Hotel.\n\nThe agent did not edit the listing page. It used read-only guest reviews to identify fixable property or operations issues.\nRepeated runs on the same prompt accumulate findings from each new review window, so the priority list becomes more evidence-backed over time.\n\nReview coverage: 200/1909 review texts checked for this manager-insight scope.\n\nTop cumulative priorities:\n\n1. [HIGH] Wi-Fi reliability\n   Guest signal: Guests report slow or unreliable Wi-Fi. (3 review signals).\n   First improvement: Test Wi-Fi speed and stability by room, fix weak access points, and provide simple router/login instructions.\n   Why it helps: Reliable internet is a high-impact expectation and can prevent direct review complaints.\n\nNo live Airbnb account, pricing, bookings, private messages, guest reviews, or source CSV rows were changed.",
        steps: [
          {
            module: "Autonomous Listing Editor Agent",
            prompt: {
              system_prompt: effectiveSystemPrompt(LISTING_EDITOR_SYSTEM_PROMPT),
              user_prompt:
                "{\"listing_id\":\"45855270\",\"intent\":[\"review_alignment\",\"location\",\"hills\",\"stairs\",\"noise\",\"wifi\",\"cleanliness\",\"comfort\",\"temperature\",\"view\",\"space\",\"service\",\"property_quality\",\"nearby_highlights\",\"property_fixes\"],\"selected_actions_so_far\":[\"get_listing_data\",\"extract_claims\"],\"deterministic_planner\":false,\"has_listing\":true,\"has_claims\":true,\"has_review_observations\":false,\"has_signals\":false,\"signal_brief\":null,\"has_proposal\":false,\"revise_count\":0,\"runtime_observations\":[]}"
            },
            response: {
              next_action: "search_reviews",
              tool_input: {
                listing_id: "45855270"
              },
              short_rationale: "Need guest evidence first.",
              state_update: "No review evidence yet.",
              should_stop: false,
              llm_call: true,
              attempt: 1
            }
          },
          {
            module: "Autonomous Listing Editor Agent",
            prompt: {
              system_prompt: effectiveSystemPrompt(EVIDENCE_REASONING_SYSTEM_PROMPT),
              user_prompt:
                "{\"mode\":\"manager_recommendations\",\"listing_id\":\"45855270\",\"listing_name\":\"Rossio Garden Hotel\",\"manager_prompt\":\"For Rossio Garden Hotel, do not edit the page. Use guest reviews to tell me which fixable property or operations issues are bothering guests.\",\"review_search_stats\":{\"source\":\"pinecone\",\"strategy\":\"adaptive_time_boxed_manager_insights\",\"coverage_checked\":200,\"coverage_total\":1909,\"coverage_complete\":false},\"manager_issue_candidates\":[{\"topic\":\"Wi-Fi reliability\",\"priority_hint\":\"high\",\"evidence_count\":3,\"representative_evidence\":[\"Wi-Fi was slow and I used my hotspot instead.\"]},{\"topic\":\"Cleaning consistency\",\"priority_hint\":\"high\",\"evidence_count\":5,\"representative_evidence\":[\"Some areas could have been cleaner.\"]},{\"topic\":\"Noise management\",\"priority_hint\":\"medium\",\"evidence_count\":5,\"representative_evidence\":[\"The street gets loud on weekend nights.\"]}],\"decision_instructions\":\"Return 2-4 prioritized manager recommendations only. Use manager_issue_candidates and representative review evidence to choose the strongest fixable negative issues. Do not propose public listing copy.\"}"
            },
            response: {
              decision: "create_manager_recommendation",
              rationale: "Guest reviews show repeated fixable operational issues best handled by management.",
              evidence_topics: [
                "Wi-Fi reliability",
                "Cleaning consistency",
                "Noise management"
              ],
              proposed_description_addition: null,
              proposed_description_replacement: null,
              manager_recommendations: [
                {
                  topic: "Wi-Fi reliability",
                  priority: "high",
                  guestSignal: "Guests report slow or unreliable Wi-Fi.",
                  suggestedAction: "Test Wi-Fi speed and stability by room, fix weak access points, and provide simple router/login instructions.",
                  businessValue: "Reliable internet is a high-impact expectation and can prevent direct review complaints.",
                  evidenceCount: 3,
                  evidence: [
                    "Wi-Fi was slow and I used my hotspot instead."
                  ]
                }
              ],
              llm_call: true,
              attempt: 1
            }
          }
        ]
      },
      {
        prompt:
          "Selected listing id: 45855270\nFind me car tires in Lisbon.",
        full_response:
          "I don't know how to complete that request with my allowed tools. No LLM, RAG, Google Places, or page edit was used.",
        steps: []
      }
    ]
  });
}
