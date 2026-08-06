export function GET() {
  return Response.json({
    description:
      "FixGap AI is an autonomous demo agent for Lisbon short-term-rental managers. It compares a simulated Airbnb listing page with real guest-review evidence, uses nearby Google Places context when it can strengthen guest-facing value, and updates only allowed demo page text after Supervisor approval.",
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
          "Selected listing id: 45855270\nFor Rossio Garden Hotel, focus only on excellent nearby places within about 1 km. Use Google Places to choose strong guest-facing places by rating, Google review count, category, and approximate distance. If no nearby place is strong enough, stop without editing.",
        full_response:
          "Approved and executed in the demo environment when strong nearby places were available. The agent added a concise nearby-place sentence with place names, Google ratings, review counts, and approximate distances.",
        steps: [
          {
            module: "Supervisor / Control Agent",
            prompt: {
              system_prompt:
                "Approve, revise, or block the proposed simulated page action. Return only valid JSON. Do not include markdown, prose, or code fences.",
              user_prompt:
                "{\"proposal\":{\"action\":\"prepare_edit_proposal\",\"target_fields\":[\"description\"],\"evidence_topics\":[\"Rated nearby guest options\"]},\"guardrails\":{\"passed\":true}}"
            },
            response: {
              decision: "Approve",
              rationale: "The edit is narrow and includes rating, review count, category, and approximate distance.",
              required_change: null
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
