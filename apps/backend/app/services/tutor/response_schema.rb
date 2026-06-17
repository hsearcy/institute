module Tutor
  module ResponseSchema
    # The schema we hand to the LLM for structured output. `skillId`/`pluginId`
    # stay enum-constrained (so the model can only choose valid values), but
    # `params` is an open object rather than a discriminated union of the plugin
    # schemas.
    #
    # Why params is a STRING and not the plugin schema: Anthropic's
    # structured-output subset is strict — it rejects oneOf/anyOf/allOf (so a
    # union of plugin schemas 400'd every call, which the retry middleware turned
    # into a ~13s storm) AND rejects open objects (additionalProperties:true).
    # Forcing arbitrary, author-defined plugin schemas into Anthropic's strict
    # subset is fragile, so instead we constrain only the envelope: skillId and
    # pluginId stay enum-locked (the model can't pick invalid values), and params
    # is a JSON string the model fills from the per-plugin `paramSchema`s that are
    # in the request payload (the prompt tells it which to match). Picker then
    # JSON-parses params and `validate_response!` re-validates it against the real
    # plugin schema server-side, so correctness is still enforced.
    def self.build(payload)
      pool   = payload.fetch("eligiblePool")
      plugins = payload.fetch("availablePlugins")
      skill_ids  = pool.map { |s| s.fetch("skillId") }
      plugin_ids = plugins.map { |p| p.fetch("id") }

      {
        type: "object",
        properties: {
          skillId:  { type: "string", enum: skill_ids },
          pluginId: { type: "string", enum: plugin_ids },
          params: {
            type: "string",
            description: "A JSON object, encoded as a string, matching the chosen " \
                         "plugin's paramSchema from availablePlugins. Include every " \
                         "required field. Example: \"{\\\"enemyType\\\":\\\"goblin\\\"}\".",
          },
        },
        required: ["skillId", "pluginId", "params"],
        additionalProperties: false,
      }
    end
  end
end
