require "json-schema"

module Tutor
  module Picker
    class NoEligibleContent < StandardError; end
    class InvalidResponse   < StandardError; end

    DEFAULT_MODEL = ENV.fetch("TUTOR_MODEL", "claude-sonnet-4-6")

    def self.call(payload, client: RubyLLMClient, model: DEFAULT_MODEL)
      validate_request!(payload)
      schema = ResponseSchema.build(payload)
      # Strip validation keywords Anthropic's structured output doesn't
      # accept (e.g. `minimum` on integers). The full schema is still used
      # below for post-validation of the response.
      llm_schema = SchemaSanitizer.call(schema)
      messages = Prompt.messages(payload)

      reply = client.chat(model: model, messages: messages, response_schema: llm_schema)
      content = parse_params(reply.fetch(:content))
      validate_response!(content, payload)
      content
    end

    # `params` comes back as a JSON string (see ResponseSchema) — decode it to a
    # Hash before validation. Tolerate a model that already returned an object.
    def self.parse_params(content)
      raw = content["params"]
      return content unless raw.is_a?(String)

      begin
        content.merge("params" => JSON.parse(raw))
      rescue JSON::ParserError => e
        raise InvalidResponse, "params was not valid JSON: #{e.message}"
      end
    end

    def self.validate_request!(payload)
      pool = payload.fetch("eligiblePool", [])
      raise NoEligibleContent, "eligiblePool is empty" if pool.empty?

      skill_ids = pool.map { |s| s.fetch("skillId") }.to_set
      plugins   = payload.fetch("availablePlugins", [])
      overlap = plugins.any? { |p| (p.fetch("supportedSkills") & skill_ids.to_a).any? }
      raise NoEligibleContent, "no plugin supports any eligible skill" unless overlap
    end

    def self.validate_response!(content, payload)
      pool_ids   = payload.fetch("eligiblePool").map { |s| s.fetch("skillId") }
      plugin_map = payload.fetch("availablePlugins").to_h { |p| [p.fetch("id"), p] }

      skill_id  = content.fetch("skillId")
      plugin_id = content.fetch("pluginId")

      raise InvalidResponse, "skillId #{skill_id} not in eligible pool"  unless pool_ids.include?(skill_id)
      raise InvalidResponse, "pluginId #{plugin_id} not available"        unless plugin_map.key?(plugin_id)

      plugin = plugin_map.fetch(plugin_id)
      raise InvalidResponse, "plugin #{plugin_id} does not support skill #{skill_id}" unless plugin.fetch("supportedSkills").include?(skill_id)

      # `zod-to-json-schema` emits a `$schema: "http://json-schema.org/draft-07/schema#"`
      # marker that the json-schema gem (v6) treats as a fetch URL and chokes on.
      # Drop it; the rest of the schema is structural draft-04-compatible.
      schema_for_validation = plugin.fetch("paramSchema").reject { |k, _| k.to_s == "$schema" }
      errs = JSON::Validator.fully_validate(schema_for_validation, content.fetch("params"))
      raise InvalidResponse, "params failed paramSchema validation: #{errs.join('; ')}" unless errs.empty?
    end
  end
end
