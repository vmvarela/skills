# Agent Profiles

The optimizer targets the six built-in roles supported by oh-my-opencode-slim 3.x. `librarian` resolves to `explorer` and is not a separate profile; the optional `observer` is not included.

| Agent | Minimum context | Vision | Tools | Variant preference, in order | Output weight |
| --- | ---: | --- | --- | --- | ---: |
| `orchestrator` | 128k | No | Required | `high`, `medium`, `max` | 3 |
| `oracle` | 200k | No | Required | `max`, `high`, `medium` | 4 |
| `council` | 128k | No | Required | `high`, `medium`, `max` | 3 |
| `explorer` | 64k | No | Required | `low`, `minimal`, `medium` | 1.5 |
| `designer` | 128k | Required | Required | `medium`, `high`, `low` | 2 |
| `fixer` | 64k | No | Required | `low`, `minimal`, `medium` | 1.5 |

The catalog's exact provider/model variant list is authoritative. Choose the first variant in the profile ladder that the selected model actually supports. If none of the ladder variants is available, exclude the candidate; never infer a variant or omit one that could be inherited from another config layer.

For quality matching, use OpenCode's upstream `modelID` only as a strict identity key against Epoch's `model_version` mapping (which may use models.dev-style names). Write the catalog's selectable `provider/model` ID into the preset; never write the upstream matching key as a substitute.

For an eligible candidate, effective reference cost per million tokens is:

```text
input price + output price × output weight
```

The optimizer keeps models within 10 ECI points of the best compatible model for that agent, then ranks by lowest effective base-tier catalog cost. Cache-read discounts are excluded. Prices are USD reference values, not user-specific subscription charges. ECI is model-level evidence, not a per-agent or per-variant evaluation.
