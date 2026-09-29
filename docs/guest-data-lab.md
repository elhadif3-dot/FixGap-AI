# Guest Data Lab

The Guest Data Lab is a separate, read-only analytical product next to the existing supervised agents.
It does not participate in agent planning, RAG retrieval, prompting, continuation, supervision, or page updates.

```text
FixGap AI UI
|-- Guest Agent -> bounded review retrieval -> Gemini analyst -> Supervisor
|-- Owner Agent -> ReAct planning -> tools -> Supervisor -> simulated page
`-- Guest Data Lab
    |-- bundled listing/review/Google Places CSV files (read only)
    |-- cleaning and review deduplication
    |-- multilingual phrase-level topic and polarity features
    |-- deterministic aggregation and metric calculation
    |-- POST /api/guest_data_analysis
    `-- charts and calculated Data Insights
```

## Metrics

- **Topic prevalence:** unique reviews with a positive or negative topic signal divided by all cleaned unique reviews.
- **Positive share:** positive review signals divided by positive plus negative review signals for the topic. A single review is counted at most once per polarity and topic.
- **Issue Recurrence Score:** `50% frequency + 30% month consistency + 20% recency`. Frequency reaches its cap at a 5% complaint rate. Consistency is the share of active review months containing the issue. Recency is the issue reviews' average normalized position in the listing's date range.
- **Trend:** signal rates in the newest 25% of dated reviews (minimum 20 where available) versus the older reviews.
- **Expectation alignment:** exact topic phrases in the listing description and amenities are compared with aggregate guest evidence. Missing claims are never treated as contradictions.
- **Nearby profile:** unique cached Google Places within 1 km, grouped by category. Category rating is weighted by `log10(review count + 1)`. Top places balance rating, review volume, and straight-line distance.

The endpoint scans the full bundled review corpus for the selected listing. It reports both available rows and cleaned reviews analyzed. It makes no LLM calls, Pinecone requests, Supabase requests, or external runtime requests.
