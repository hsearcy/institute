module Tutor
  module ResponseSchema
    def self.build(payload)
      pool   = payload.fetch("eligiblePool")
      plugins = payload.fetch("availablePlugins")
      skill_ids  = pool.map { |s| s.fetch("skillId") }
      plugin_ids = plugins.map { |p| p.fetch("id") }

      params_schema =
        if plugins.length == 1
          plugins.first.fetch("paramSchema").deep_symbolize_keys
        else
          { oneOf: plugins.map { |p| p.fetch("paramSchema").deep_symbolize_keys } }
        end

      {
        type: "object",
        properties: {
          skillId:  { type: "string", enum: skill_ids },
          pluginId: { type: "string", enum: plugin_ids },
          params:   params_schema,
        },
        required: ["skillId", "pluginId", "params"],
        additionalProperties: false,
      }
    end
  end
end
