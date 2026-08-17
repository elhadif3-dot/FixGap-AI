export function GET() {
  return Response.json({
    description:
      "FixGap AI is an autonomous demo agent for Lisbon short-term-rental managers. It compares a simulated Airbnb listing page with real guest-review evidence, uses nearby Google Places context when it can strengthen guest-facing value, and updates only allowed demo page text after Supervisor approval. For review-gap tasks, it does not send the full review corpus to the LLM; it retrieves focused review evidence with Pinecone, converts retrieved reviews into structured guest-experience signals for common short-term-rental gaps, stores those observations in state, and then uses the LLM to reason over the compact state and choose the next action. It can also identify repeated fixable property or operations issues from guest complaints and recommend what the manager should improve first. Re-running the same request continues review coverage from the previous window, so the agent can gather more evidence across the full review corpus and stop when no safe new edit remains. How to use video: https://drive.google.com/file/d/19gj8hQShXqdnhYH7rVQFDOyaZtzfOImp/view?usp=sharing",
    purpose:
      "Keep Lisbon Airbnb listing pages accurate, persuasive, and aligned with real guest experience by finding review-backed gaps, surfacing valuable nearby places only when supported, and avoiding invented claims, live Airbnb access, pricing actions, booking actions, private messages, and unnecessary LLM calls.",
    prompt_template: {
      template:
        "Selected listing id: <listing_id>\nHi, I manage several Airbnb listings in Lisbon. Please handle \"<listing_name>\" end to end: compare the current page with guest reviews first, use nearby context only when useful, decide what is safe to improve, update the simulated listing page, and tell me exactly what changed."
    },
    prompt_examples: [
      {
        prompt:
          "Selected listing id: 45855270\nHi, I manage several Airbnb listings in Lisbon. Please handle \"Rossio Garden Hotel\" end to end: compare the current page with guest reviews first, use nearby context only when useful, decide what is safe to improve, update the simulated listing page, and tell me exactly what changed.",
        full_response:
          "Approved and executed in the demo environment. The agent compared the simulated page with guest reviews, used nearby Google Places only as supporting context where useful, updated only the simulated description after Supervisor approval, and explained the evidence-backed changes. No live Airbnb account was accessed.",
        steps: [
          {
            module: "Supervisor / Control Agent",
            prompt: {
              system_prompt:
                "Approve, revise, or block the proposed simulated page action. Return only valid JSON. Do not include markdown, prose, or code fences.",
              user_prompt:
                "{\"proposal\":{\"action\":\"prepare_edit_proposal\",\"target_fields\":[\"description\"],\"listing_id\":\"45855270\",\"evidence_topics\":[\"Guest-confirmed walkable location\",\"Space expectations\",\"Rated nearby guest options\"]},\"guardrails\":{\"passed\":true},\"signals\":[{\"topic\":\"Guest-confirmed walkable location\",\"primaryEvidenceCount\":169},{\"topic\":\"Space expectations\",\"primaryEvidenceCount\":34},{\"topic\":\"Rated nearby guest options\",\"primaryEvidenceCount\":153}]}"
            },
            response: {
              decision: "Approve",
              rationale: "The edit is narrow, evidence-backed, and limited to the simulated listing page.",
              required_change: null
            }
          }
        ]
      },
      {
        prompt:
          "Selected listing id: 45855270\nFor \"Rossio Garden Hotel\", do not edit the page. Use guest reviews to tell me which fixable property or operations issues are bothering guests, what I should improve first, and why it could improve reviews, bookings, or listing quality.",
        full_response:
          "Manager recommendations were produced without editing the simulated listing page. The agent used read-only guest reviews to identify repeated fixable property or operations issues, prioritized what the manager should improve first, and explained why each fix could improve guest satisfaction, review quality, booking confidence, or listing quality.",
        steps: [
          {
            module: "Autonomous Listing Editor Agent",
            prompt: {
              system_prompt:
                "Choose the next autonomous action for the simulated Lisbon Airbnb listing task. Return only valid JSON. Do not include markdown, prose, or code fences.",
              user_prompt:
                "{\"listing_id\":\"45855270\",\"request\":\"Do not edit the page. Use guest reviews to identify fixable property or operations issues and explain what to improve first.\",\"state\":{\"listing_loaded\":true,\"review_evidence_loaded\":true,\"guest_signals_detected\":true,\"page_edit_requested\":false}}"
            },
            response: {
              next_action: "draft_manager_recommendations",
              short_rationale: "The user asked for manager-facing improvement advice, not a page edit.",
              should_stop: false
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
